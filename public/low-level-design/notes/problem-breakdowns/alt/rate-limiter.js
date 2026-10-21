// Go versions of the Rate Limiter code blocks, matched to the Java blocks by title. Imports are omitted.
window.ALT = window.ALT || {};
ALT["rate-limiter"] = { go: {
"RateLimitResult": `// Result is what the gateway gets back for one request.
type Result struct {
	Allowed      bool
	Remaining    int   // requests still allowed right now
	RetryAfterMs int64 // 0 when allowed
}

func allow(remaining int) Result     { return Result{Allowed: true, Remaining: remaining} }
func deny(retryAfterMs int64) Result { return Result{RetryAfterMs: retryAfterMs} }`,

"Typed configuration": `// LimitParams is sealed by its unexported method: only this package can add kinds.
type LimitParams interface {
	Validate() error
	isLimitParams()
}

type TokenBucketParams struct {
	Capacity        int
	RefillPerSecond float64
}

type SlidingWindowLogParams struct {
	MaxRequests int
	WindowMs    int64
}

type FixedWindowParams struct {
	MaxRequests int
	WindowMs    int64
}

func (TokenBucketParams) isLimitParams()      {}
func (SlidingWindowLogParams) isLimitParams() {}
func (FixedWindowParams) isLimitParams()      {}

// Validate is called by the parser and by the factory, so a bad rule fails at startup.
func (p TokenBucketParams) Validate() error {
	if p.Capacity < 1 || p.RefillPerSecond <= 0 {
		return errors.New("token bucket: capacity >= 1, refill > 0")
	}
	return nil
}

func (p SlidingWindowLogParams) Validate() error { return validateWindow("sliding log", p.MaxRequests, p.WindowMs) }
func (p FixedWindowParams) Validate() error      { return validateWindow("fixed window", p.MaxRequests, p.WindowMs) }

func validateWindow(kind string, maxRequests int, windowMs int64) error {
	if maxRequests < 1 || windowMs < 1 {
		return fmt.Errorf("%s: maxRequests >= 1, windowMs >= 1", kind)
	}
	return nil
}

type EndpointRule struct {
	Endpoint string
	Params   LimitParams
}`,

"Final class design": `type RateLimiter struct {
	byEndpoint map[string]Limiter // read-only after construction
	fallback   Limiter            // for endpoints with no rule
}

func NewRateLimiter(rules []EndpointRule, defaultParams LimitParams, factory *LimiterFactory) (*RateLimiter, error)
func (r *RateLimiter) Check(clientID, endpoint string) (Result, error)

type Limiter interface {
	TryAcquire(clientID string) Result // decide for one client and record it
}

type TokenBucketLimiter struct {
	buckets sync.Map // client ID -> *bucket
}

type SlidingWindowLogLimiter struct {
	logs sync.Map // client ID -> *clientLog
}

type FixedWindowLimiter struct {
	windows sync.Map // client ID -> *window
}

type LimiterFactory struct {
	nowMs func() int64
}

func (f *LimiterFactory) Create(p LimitParams) (Limiter, error) // type switch over the params

type LimitParams interface { // TokenBucketParams, SlidingWindowLogParams, FixedWindowParams
	Validate() error
	isLimitParams()
}

type EndpointRule struct {
	Endpoint string
	Params   LimitParams
}

type Result struct {
	Allowed      bool
	Remaining    int
	RetryAfterMs int64
}`,

"RateLimiter and LimiterFactory": `type RateLimiter struct {
	byEndpoint map[string]Limiter // never written after construction, so safe for concurrent reads
	fallback   Limiter
}

func NewRateLimiter(rules []EndpointRule, defaultParams LimitParams, factory *LimiterFactory) (*RateLimiter, error) {
	r := &RateLimiter{byEndpoint: make(map[string]Limiter, len(rules))}
	for _, rule := range rules {
		if _, dup := r.byEndpoint[rule.Endpoint]; dup {
			return nil, fmt.Errorf("two rules for %s", rule.Endpoint)
		}
		l, err := factory.Create(rule.Params)
		if err != nil {
			return nil, fmt.Errorf("endpoint %s: %w", rule.Endpoint, err)
		}
		r.byEndpoint[rule.Endpoint] = l
	}
	fallback, err := factory.Create(defaultParams)
	if err != nil {
		return nil, fmt.Errorf("default rule: %w", err)
	}
	r.fallback = fallback
	return r, nil
}

// Check is safe from any goroutine: the map is read-only, and each limiter makes its own updates atomic.
func (r *RateLimiter) Check(clientID, endpoint string) (Result, error) {
	if strings.TrimSpace(clientID) == "" || endpoint == "" {
		return Result{}, errors.New("clientID and endpoint are required")
	}
	if l, ok := r.byEndpoint[endpoint]; ok {
		return l.TryAcquire(clientID), nil
	}
	return r.fallback.TryAcquire(clientID), nil
}

type LimiterFactory struct {
	nowMs func() int64 // monotonic milliseconds in production
}

// Create: Go has no exhaustive switch, so the default case reports params it doesn't know.
func (f *LimiterFactory) Create(p LimitParams) (Limiter, error) {
	if p == nil {
		return nil, errors.New("missing params")
	}
	if err := p.Validate(); err != nil {
		return nil, err
	}
	switch p := p.(type) {
	case TokenBucketParams:
		return NewTokenBucketLimiter(p, f.nowMs), nil
	case SlidingWindowLogParams:
		return NewSlidingWindowLogLimiter(p, f.nowMs), nil
	case FixedWindowParams:
		return NewFixedWindowLimiter(p, f.nowMs), nil
	default:
		return nil, fmt.Errorf("unsupported limiter params %T", p)
	}
}`,

"Token bucket": `type bucket struct {
	mu     sync.Mutex // guards tokens and lastMs
	tokens float64
	lastMs int64
}

type TokenBucketLimiter struct {
	capacity        float64
	refillPerSecond float64
	nowMs           func() int64
	buckets         sync.Map // client ID -> *bucket
}

func NewTokenBucketLimiter(p TokenBucketParams, nowMs func() int64) *TokenBucketLimiter {
	return &TokenBucketLimiter{capacity: float64(p.Capacity), refillPerSecond: p.RefillPerSecond, nowMs: nowMs}
}

func (l *TokenBucketLimiter) TryAcquire(clientID string) Result {
	v, ok := l.buckets.Load(clientID)
	if !ok { // new clients start full; LoadOrStore keeps exactly one bucket per client
		v, _ = l.buckets.LoadOrStore(clientID, &bucket{tokens: l.capacity, lastMs: l.nowMs()})
	}
	b := v.(*bucket)
	b.mu.Lock() // only this client's requests wait here
	defer b.mu.Unlock()
	now := max(b.lastMs, l.nowMs())                                                          // never run time backwards
	b.tokens = math.Min(l.capacity, b.tokens+float64(now-b.lastMs)*l.refillPerSecond/1000) // lazy refill, capped
	b.lastMs = now
	if b.tokens >= 1 {
		b.tokens--
		return allow(int(b.tokens)) // whole tokens left
	}
	return deny(int64(math.Ceil((1 - b.tokens) * 1000 / l.refillPerSecond))) // earn the missing fraction
}`,

"Sliding window log": `type clientLog struct {
	mu    sync.Mutex // guards times
	times []int64    // accepted request times, oldest first
}

type SlidingWindowLogLimiter struct {
	max      int
	windowMs int64
	nowMs    func() int64
	logs     sync.Map // client ID -> *clientLog
}

func NewSlidingWindowLogLimiter(p SlidingWindowLogParams, nowMs func() int64) *SlidingWindowLogLimiter {
	return &SlidingWindowLogLimiter{max: p.MaxRequests, windowMs: p.WindowMs, nowMs: nowMs}
}

func (l *SlidingWindowLogLimiter) TryAcquire(clientID string) Result {
	v, ok := l.logs.Load(clientID)
	if !ok {
		v, _ = l.logs.LoadOrStore(clientID, &clientLog{})
	}
	c := v.(*clientLog)
	c.mu.Lock()
	defer c.mu.Unlock()
	now := l.nowMs()
	i := 0
	for i < len(c.times) && c.times[i] <= now-l.windowMs { // drop what left the window
		i++
	}
	c.times = c.times[i:]
	if len(c.times) < l.max {
		c.times = append(c.times, now)
		return allow(l.max - len(c.times))
	}
	return deny(c.times[0] + l.windowMs - now) // when the oldest leaves the window
}`,

"Fixed window": `type window struct {
	mu    sync.Mutex // guards start and count
	start int64
	count int
}

type FixedWindowLimiter struct {
	max      int
	windowMs int64
	nowMs    func() int64
	windows  sync.Map // client ID -> *window
}

func NewFixedWindowLimiter(p FixedWindowParams, nowMs func() int64) *FixedWindowLimiter {
	return &FixedWindowLimiter{max: p.MaxRequests, windowMs: p.WindowMs, nowMs: nowMs}
}

func (l *FixedWindowLimiter) TryAcquire(clientID string) Result {
	v, ok := l.windows.Load(clientID)
	if !ok {
		v, _ = l.windows.LoadOrStore(clientID, &window{})
	}
	w := v.(*window)
	w.mu.Lock()
	defer w.mu.Unlock()
	now := l.nowMs()
	start := now - now%l.windowMs // the calendar window this request falls in
	if w.start != start {         // a new window: reset
		w.start, w.count = start, 0
	}
	if w.count < l.max {
		w.count++
		return allow(l.max - w.count)
	}
	return deny(start + l.windowMs - now) // when this window ends
}`,

"Rate limiter in one screen": `type Result struct {
	Allowed      bool
	Remaining    int
	RetryAfterMs int64 // 0 when allowed
}

type LimitParams interface { // TokenBucketParams, SlidingWindowLogParams, FixedWindowParams
	Validate() error
	isLimitParams()
}

type EndpointRule struct {
	Endpoint string
	Params   LimitParams
}

type Limiter interface{ TryAcquire(clientID string) Result }

type RateLimiter struct {
	byEndpoint map[string]Limiter // read-only after construction
	fallback   Limiter
}

func (r *RateLimiter) Check(clientID, endpoint string) (Result, error) // route, or the default
func (f *LimiterFactory) Create(p LimitParams) (Limiter, error)       // type switch with a default error

// Each limiter: sync.Map of client ID -> state with its own mutex; LoadOrStore, then Lock
// Token bucket: tokens = min(cap, tokens + elapsed*rate/1000); spend 1; retry = ceil((1-tokens)*1000/rate)
// Sliding log:  drop t <= now-window; allow if len < max; retry = oldest + window - now
// Fixed window: start = now - now%window; reset on a new start; retry = start + window - now`,

"Lock-free token bucket with compare-and-set": `// Only TokenBucketLimiter's internals change; Limiter, RateLimiter and the factory don't.
type state struct {
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
		now := max(cur.lastMs, l.nowMs())
		tokens := math.Min(l.capacity, cur.tokens+float64(now-cur.lastMs)*l.refillPerSecond/1000)
		allowed := tokens >= 1
		next := &state{tokens: tokens, lastMs: now}
		if allowed {
			next.tokens--
		}
		if ref.CompareAndSwap(cur, next) { // nobody changed it since we read it: our decision stands
			if allowed {
				return allow(int(next.tokens))
			}
			return deny(int64(math.Ceil((1 - tokens) * 1000 / l.refillPerSecond)))
		} // lost the race: re-read and decide again
	}
}`,

"Evicting idle clients": `type Evictable interface {
	EvictIdle() // each limiter applies its own TTL rule
}

// bucket gains "retired bool"; TokenBucketLimiter gains idleTtlMs = ceil(capacity * 1000 / refill): full again by then.

func (l *TokenBucketLimiter) EvictIdle() {
	now := l.nowMs()
	l.buckets.Range(func(key, v any) bool {
		b := v.(*bucket)
		b.mu.Lock()
		if now-b.lastMs > l.idleTtlMs {
			b.retired = true // a request already holding b will fetch a fresh one
			l.buckets.CompareAndDelete(key, b)
		}
		b.mu.Unlock()
		return true
	})
}

func (l *TokenBucketLimiter) TryAcquire(clientID string) Result {
	for {
		v, ok := l.buckets.Load(clientID)
		if !ok {
			v, _ = l.buckets.LoadOrStore(clientID, &bucket{tokens: l.capacity, lastMs: l.nowMs()})
		}
		b := v.(*bucket)
		b.mu.Lock()
		if b.retired { // evicted between lookup and lock: try again
			b.mu.Unlock()
			continue
		}
		r := l.spend(b) // refill and spend exactly as before
		b.mu.Unlock()
		return r
	}
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
	WindowMs    int64
}

func (SlidingWindowCounterParams) isLimitParams() {}

func (p SlidingWindowCounterParams) Validate() error {
	return validateWindow("counter", p.MaxRequests, p.WindowMs)
}

type counts struct {
	mu        sync.Mutex // guards the fields below
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
	v, ok := l.counts.Load(clientID)
	if !ok {
		v, _ = l.counts.LoadOrStore(clientID, &counts{})
	}
	c := v.(*counts)
	c.mu.Lock()
	defer c.mu.Unlock()
	now := l.nowMs()
	start := now - now%l.windowMs
	if c.start != start {
		c.prev = 0
		if start-c.start == l.windowMs { // the previous window counts only if adjacent
			c.prev = c.cur
		}
		c.cur, c.start = 0, start
	}
	weight := 1 - float64(now-start)/float64(l.windowMs) // share of the previous window still inside
	estimate := float64(c.prev)*weight + float64(c.cur)
	if estimate+1 <= float64(l.max) {
		c.cur++
		return allow(int(math.Floor(float64(l.max) - estimate - 1)))
	}
	return deny(start + l.windowMs - now) // an estimate: the old previous window drops out then
}

// LimiterFactory.Create gains one case:
//	case SlidingWindowCounterParams:
//		return &SlidingWindowCounterLimiter{max: p.MaxRequests, windowMs: p.WindowMs, nowMs: f.nowMs}, nil`,

"Per-tier limits": `type Tier int

const (
	Free Tier = iota
	Pro
	Enterprise
)

// TierLookup is backed by the account service or the verified token; never by a header the client controls.
type TierLookup interface {
	TierOf(clientID string) Tier
}

type TieredParams struct {
	ByTier    map[Tier]LimitParams
	Otherwise LimitParams
}

func (TieredParams) isLimitParams() {}

func (p TieredParams) Validate() error {
	if p.Otherwise == nil {
		return errors.New("tiered: a fallback rule is required")
	}
	for tier, inner := range p.ByTier {
		if err := inner.Validate(); err != nil {
			return fmt.Errorf("tier %d: %w", tier, err)
		}
	}
	return p.Otherwise.Validate()
}

type TieredLimiter struct {
	byTier    map[Tier]Limiter // read-only; each inner limiter keeps its own per-client state
	otherwise Limiter
	tiers     TierLookup
}

func (l *TieredLimiter) TryAcquire(clientID string) Result {
	if inner, ok := l.byTier[l.tiers.TierOf(clientID)]; ok {
		return inner.TryAcquire(clientID)
	}
	return l.otherwise.TryAcquire(clientID)
}

// LimiterFactory gains a tiers field and one case that builds the inner limiters recursively:
//	case TieredParams:
//		byTier := make(map[Tier]Limiter, len(p.ByTier))
//		for tier, inner := range p.ByTier {
//			l, err := f.Create(inner)
//			if err != nil {
//				return nil, err
//			}
//			byTier[tier] = l
//		}
//		otherwise, err := f.Create(p.Otherwise)
//		if err != nil {
//			return nil, err
//		}
//		return &TieredLimiter{byTier: byTier, otherwise: otherwise, tiers: f.tiers}, nil`,

"Composite limiter": `type CompositeLimiter struct {
	parts []Limiter // fixed at construction; each part is safe for concurrent use on its own
}

func (c *CompositeLimiter) TryAcquire(clientID string) Result {
	remaining, allowed := math.MaxInt, true
	var retry int64
	for _, l := range c.parts {
		r := l.TryAcquire(clientID)
		if !r.Allowed {
			allowed = false
			retry = max(retry, r.RetryAfterMs)
		}
		remaining = min(remaining, r.Remaining)
	}
	if allowed {
		return allow(remaining)
	}
	return deny(retry)
}`
} };
