// Go versions of the Rate Limiter code blocks, matched to the Java blocks by title. Imports are omitted.
window.ALT = window.ALT || {};
ALT["rate-limiter"] = { go: {
"Types and signatures": `// Result returned to the gateway
type Result struct {
	Allowed      bool
	Remaining    int
	RetryAfterMs *int64 // nil when allowed
}

func allow(remaining int) Result     { return Result{Allowed: true, Remaining: remaining} }
func deny(retryAfterMs int64) Result { return Result{RetryAfterMs: &retryAfterMs} }

// Typed, per-algorithm parameters. The unexported method "seals" the interface: only this package can add kinds.
type LimitParams interface{ isLimitParams() }

type TokenBucketParams struct {
	Capacity        int
	RefillPerSecond float64
}

type SlidingWindowLogParams struct {
	MaxRequests int
	Window      time.Duration
}

type FixedWindowParams struct {
	MaxRequests int
	Window      time.Duration
}

func (TokenBucketParams) isLimitParams()      {}
func (SlidingWindowLogParams) isLimitParams() {}
func (FixedWindowParams) isLimitParams()      {}

type EndpointRule struct {
	Endpoint string
	Params   LimitParams
}

// The axis of variation
type Limiter interface {
	TryAcquire(clientID string) Result
}

func NewLimiter(p LimitParams, nowMs func() int64) (Limiter, error)

func NewRateLimiter(rules []EndpointRule, defaultParams LimitParams, nowMs func() int64) (*RateLimiter, error)
func (r *RateLimiter) Check(clientID, endpoint string) Result`,

"RateLimiter and the factory": `type RateLimiter struct {
	byEndpoint map[string]Limiter // built once, read-only afterwards
	fallback   Limiter
}

func NewRateLimiter(rules []EndpointRule, defaultParams LimitParams, nowMs func() int64) (*RateLimiter, error) {
	r := &RateLimiter{byEndpoint: make(map[string]Limiter, len(rules))}
	for _, rule := range rules {
		l, err := NewLimiter(rule.Params, nowMs)
		if err != nil {
			return nil, fmt.Errorf("endpoint %s: %w", rule.Endpoint, err)
		}
		r.byEndpoint[rule.Endpoint] = l
	}
	fallback, err := NewLimiter(defaultParams, nowMs)
	if err != nil {
		return nil, err
	}
	r.fallback = fallback
	return r, nil
}

func (r *RateLimiter) Check(clientID, endpoint string) Result {
	if l, ok := r.byEndpoint[endpoint]; ok {
		return l.TryAcquire(clientID)
	}
	return r.fallback.TryAcquire(clientID)
}

// NewLimiter is the factory. Go has no exhaustive switch, so the default case reports params it doesn't know.
func NewLimiter(p LimitParams, nowMs func() int64) (Limiter, error) {
	switch p := p.(type) {
	case TokenBucketParams:
		return NewTokenBucketLimiter(p, nowMs), nil
	case SlidingWindowLogParams:
		return NewSlidingWindowLogLimiter(p, nowMs), nil
	case FixedWindowParams:
		return NewFixedWindowLimiter(p, nowMs), nil
	default:
		return nil, fmt.Errorf("unsupported limiter params %T", p)
	}
}`,

"Token bucket": `type bucket struct {
	tokens float64
	lastMs int64
}

type TokenBucketLimiter struct {
	capacity    float64
	refillPerMs float64
	nowMs       func() int64
	buckets     map[string]*bucket
}

func NewTokenBucketLimiter(p TokenBucketParams, nowMs func() int64) *TokenBucketLimiter {
	return &TokenBucketLimiter{
		capacity:    float64(p.Capacity),
		refillPerMs: p.RefillPerSecond / 1000,
		nowMs:       nowMs,
		buckets:     map[string]*bucket{},
	}
}

func (l *TokenBucketLimiter) TryAcquire(clientID string) Result {
	now := l.nowMs()
	b, ok := l.buckets[clientID]
	if !ok {
		b = &bucket{tokens: l.capacity, lastMs: now}
		l.buckets[clientID] = b
	}
	b.tokens = math.Min(l.capacity, b.tokens+float64(now-b.lastMs)*l.refillPerMs) // lazy refill
	b.lastMs = now
	if b.tokens >= 1 {
		b.tokens--
		return allow(int(b.tokens))
	}
	return deny(int64(math.Ceil((1 - b.tokens) / l.refillPerMs)))
}`,

"Sliding window log and fixed window": `type SlidingWindowLogLimiter struct {
	max      int
	windowMs int64
	nowMs    func() int64
	logs     map[string][]int64 // oldest first
}

func NewSlidingWindowLogLimiter(p SlidingWindowLogParams, nowMs func() int64) *SlidingWindowLogLimiter {
	return &SlidingWindowLogLimiter{max: p.MaxRequests, windowMs: p.Window.Milliseconds(), nowMs: nowMs, logs: map[string][]int64{}}
}

func (l *SlidingWindowLogLimiter) TryAcquire(clientID string) Result {
	now := l.nowMs()
	log := l.logs[clientID]
	i := 0
	for i < len(log) && log[i] <= now-l.windowMs { // drop expired
		i++
	}
	log = log[i:]
	if len(log) < l.max {
		l.logs[clientID] = append(log, now)
		return allow(l.max - len(log) - 1)
	}
	l.logs[clientID] = log
	return deny(log[0] + l.windowMs - now) // when the oldest expires
}

type window struct {
	start int64
	count int
}

type FixedWindowLimiter struct {
	max      int
	windowMs int64
	nowMs    func() int64
	windows  map[string]*window
}

func NewFixedWindowLimiter(p FixedWindowParams, nowMs func() int64) *FixedWindowLimiter {
	return &FixedWindowLimiter{max: p.MaxRequests, windowMs: p.Window.Milliseconds(), nowMs: nowMs, windows: map[string]*window{}}
}

func (l *FixedWindowLimiter) TryAcquire(clientID string) Result {
	now := l.nowMs()
	start := now - now%l.windowMs
	w, ok := l.windows[clientID]
	if !ok {
		w = &window{start: start}
		l.windows[clientID] = w
	}
	if w.start != start { // new window: reset
		w.start, w.count = start, 0
	}
	if w.count < l.max {
		w.count++
		return allow(l.max - w.count)
	}
	return deny(start + l.windowMs - now)
}`,

"Thread-safe token bucket: per-client locking": `type bucket struct {
	mu     sync.Mutex
	tokens float64
	lastMs int64
}

type TokenBucketLimiter struct {
	capacity    float64
	refillPerMs float64
	nowMs       func() int64
	buckets     sync.Map // client ID -> *bucket
}

func (l *TokenBucketLimiter) TryAcquire(clientID string) Result {
	v, ok := l.buckets.Load(clientID)
	if !ok {
		v, _ = l.buckets.LoadOrStore(clientID, &bucket{tokens: l.capacity, lastMs: l.nowMs()}) // one bucket per client
	}
	b := v.(*bucket)
	b.mu.Lock() // only this client's requests wait here
	defer b.mu.Unlock()
	now := l.nowMs()
	b.tokens = math.Min(l.capacity, b.tokens+float64(now-b.lastMs)*l.refillPerMs)
	b.lastMs = now
	if b.tokens >= 1 {
		b.tokens--
		return allow(int(b.tokens))
	}
	return deny(int64(math.Ceil((1 - b.tokens) / l.refillPerMs)))
}`,

"The lock-free alternative": `type state struct {
	tokens float64
	lastMs int64
}

// TokenBucketLimiter.states: sync.Map of client ID -> *atomic.Pointer[state]

func (l *TokenBucketLimiter) TryAcquire(clientID string) Result {
	v, ok := l.states.Load(clientID)
	if !ok {
		p := &atomic.Pointer[state]{}
		p.Store(&state{tokens: l.capacity, lastMs: l.nowMs()})
		v, _ = l.states.LoadOrStore(clientID, p)
	}
	ref := v.(*atomic.Pointer[state])
	for {
		cur := ref.Load()
		now := l.nowMs()
		tokens := math.Min(l.capacity, cur.tokens+float64(now-cur.lastMs)*l.refillPerMs)
		if tokens < 1 {
			if ref.CompareAndSwap(cur, &state{tokens, now}) {
				return deny(int64(math.Ceil((1 - tokens) / l.refillPerMs)))
			}
			continue
		}
		if ref.CompareAndSwap(cur, &state{tokens - 1, now}) {
			return allow(int(tokens - 1))
		}
	}
}`,

"A sweeper in a few lines": `type Evictable interface {
	EvictIdle() // each limiter applies its own TTL rule
}

// StartSweeper calls EvictIdle on every limiter until ctx is cancelled.
func StartSweeper(ctx context.Context, limiters []Evictable, every time.Duration) {
	go func() {
		t := time.NewTicker(every)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				for _, l := range limiters {
					l.EvictIdle()
				}
			}
		}
	}()
}`,

"Sliding window counter": `type SlidingWindowCounterParams struct {
	MaxRequests int
	Window      time.Duration
}

func (SlidingWindowCounterParams) isLimitParams() {}

type counts struct {
	mu        sync.Mutex
	start     int64
	prev, cur int
}

type SlidingWindowCounterLimiter struct {
	max      int
	windowMs int64
	nowMs    func() int64
	counts   sync.Map // client ID -> *counts
}

func (l *SlidingWindowCounterLimiter) TryAcquire(clientID string) Result {
	v, _ := l.counts.LoadOrStore(clientID, &counts{})
	c := v.(*counts)
	c.mu.Lock()
	defer c.mu.Unlock()
	now := l.nowMs()
	start := now - now%l.windowMs
	if c.start != start {
		c.prev = 0
		if start-c.start == l.windowMs { // previous window only if adjacent
			c.prev = c.cur
		}
		c.cur, c.start = 0, start
	}
	weight := 1 - float64(now-start)/float64(l.windowMs)
	estimate := float64(c.prev)*weight + float64(c.cur)
	if estimate+1 <= float64(l.max) {
		c.cur++
		return allow(int(math.Floor(float64(l.max) - estimate - 1)))
	}
	return deny(start + l.windowMs - now) // conservative upper bound
}

// The factory gains one case:
//   case SlidingWindowCounterParams:
//       return &SlidingWindowCounterLimiter{max: p.MaxRequests, windowMs: p.Window.Milliseconds(), nowMs: nowMs}, nil`,

"Composite limiter": `type CompositeLimiter struct {
	parts []Limiter
}

func (c CompositeLimiter) TryAcquire(clientID string) Result {
	remaining, allowed := math.MaxInt, true
	var retry int64
	for _, l := range c.parts {
		r := l.TryAcquire(clientID)
		if !r.Allowed {
			allowed = false
			retry = max(retry, *r.RetryAfterMs)
		}
		remaining = min(remaining, r.Remaining)
	}
	if allowed {
		return allow(remaining)
	}
	return deny(retry)
}`,

"A deterministic test": `func TestTokenBucketRefillsAndCaps(t *testing.T) {
	var clock int64 // fake clock in milliseconds
	l := NewTokenBucketLimiter(TokenBucketParams{Capacity: 3, RefillPerSecond: 1}, func() int64 { return clock })

	for i := 1; i <= 3; i++ {
		if !l.TryAcquire("a").Allowed {
			t.Fatalf("request %d should be allowed", i)
		}
	}
	denied := l.TryAcquire("a")
	if denied.Allowed || *denied.RetryAfterMs != 1000 { // one token per second
		t.Fatalf("got %+v, want denied with retry after 1000 ms", denied)
	}

	clock += 1000
	if !l.TryAcquire("a").Allowed { // exactly one refilled
		t.Fatal("one token should have refilled")
	}

	clock += 60_000
	if r := l.TryAcquire("a"); r.Remaining != 2 { // capped at capacity, minus this one
		t.Fatalf("remaining = %d, want 2", r.Remaining)
	}
	if !l.TryAcquire("b").Allowed { // other clients are independent
		t.Fatal("client b should be allowed")
	}
}`,

"Swap an immutable map": `type rules struct {
	byEndpoint map[string]Limiter
	params     map[string]LimitParams
	fallback   Limiter
}

type RateLimiter struct {
	current atomic.Pointer[rules] // replaced whole, read lock-free
	nowMs   func() int64
}

func (r *RateLimiter) Reload(newRules []EndpointRule, defaultParams LimitParams) error {
	old := r.current.Load()
	next := &rules{byEndpoint: map[string]Limiter{}, params: map[string]LimitParams{}}
	for _, rule := range newRules {
		if old != nil && old.params[rule.Endpoint] == rule.Params { // params structs compare by value: keep state
			next.byEndpoint[rule.Endpoint] = old.byEndpoint[rule.Endpoint]
		} else {
			l, err := NewLimiter(rule.Params, r.nowMs)
			if err != nil {
				return err
			}
			next.byEndpoint[rule.Endpoint] = l
		}
		next.params[rule.Endpoint] = rule.Params
	}
	fallback, err := NewLimiter(defaultParams, r.nowMs)
	if err != nil {
		return err
	}
	next.fallback = fallback
	r.current.Store(next)
	return nil
}

func (r *RateLimiter) Check(clientID, endpoint string) Result {
	rs := r.current.Load() // one consistent snapshot per call
	if l, ok := rs.byEndpoint[endpoint]; ok {
		return l.TryAcquire(clientID)
	}
	return rs.fallback.TryAcquire(clientID)
}`,

"Class sketch": `type Result struct {
	Allowed      bool
	Remaining    int
	RetryAfterMs *int64
}

type LimitParams interface{ isLimitParams() } // TokenBucketParams, SlidingWindowLogParams, FixedWindowParams

type EndpointRule struct {
	Endpoint string
	Params   LimitParams
}

type Limiter interface{ TryAcquire(clientID string) Result }

type TokenBucketLimiter struct{ buckets map[string]*bucket }
type SlidingWindowLogLimiter struct{ logs map[string][]int64 }
type FixedWindowLimiter struct{ windows map[string]*window }

func NewLimiter(p LimitParams, nowMs func() int64) (Limiter, error) // type switch over the params

type RateLimiter struct {
	byEndpoint map[string]Limiter
	fallback   Limiter
}

func (r *RateLimiter) Check(clientID, endpoint string) Result`
} };
