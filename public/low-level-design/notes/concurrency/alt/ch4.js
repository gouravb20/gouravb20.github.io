// Go versions of chapter 4's code blocks, matched to the Java blocks by title. Imports are omitted.
window.ALT = window.ALT || {};
ALT["ch4"] = { go: {
"Limiting calls to a slow dependency": `var ErrBusy = errors.New("partner API saturated")

type ThrottledClient struct {
	api     PartnerAPI
	permits chan struct{} // a counting semaphore: make(chan struct{}, maxInFlight)
}

func NewThrottledClient(api PartnerAPI, maxInFlight int) *ThrottledClient {
	return &ThrottledClient{api: api, permits: make(chan struct{}, maxInFlight)}
}

func (c *ThrottledClient) Call(ctx context.Context, r Request) (Response, error) {
	ctx, cancel := context.WithTimeout(ctx, 250*time.Millisecond)
	defer cancel()
	select {
	case c.permits <- struct{}{}: // acquire
	case <-ctx.Done():
		return Response{}, ErrBusy
	}
	defer func() { <-c.permits }() // always release, even on errors and panics
	return c.api.Send(r)
}
// golang.org/x/sync/semaphore offers the same with weighted permits: sem.Acquire(ctx, 1), sem.Release(1).`,

"A minimal connection pool": `var ErrPoolExhausted = errors.New("pool exhausted")

type ConnectionPool struct {
	idle    chan *Conn // the free connections; capacity = pool size
	factory func() *Conn
}

func NewConnectionPool(size int, factory func() *Conn) *ConnectionPool {
	p := &ConnectionPool{idle: make(chan *Conn, size), factory: factory}
	for i := 0; i < size; i++ {
		p.idle <- factory()
	}
	return p
}

func (p *ConnectionPool) Borrow(ctx context.Context, wait time.Duration) (*Conn, error) {
	ctx, cancel := context.WithTimeout(ctx, wait)
	defer cancel()
	select {
	case c := <-p.idle:
		if !c.IsValid() {
			c = p.factory() // replace broken connections
		}
		return c, nil
	case <-ctx.Done():
		return nil, ErrPoolExhausted
	}
}

func (p *ConnectionPool) GiveBack(c *Conn) {
	select {
	case p.idle <- c:
	default:
		c.Close() // never exceed the pool size
	}
}

// Caller
c, err := pool.Borrow(ctx, 200*time.Millisecond)
if err != nil {
	return err
}
defer pool.GiveBack(c)
return runQuery(c)`,

"Bounded on both sides": `// Go has no ThreadPoolExecutor; a fixed set of workers over a bounded channel is the equivalent.
tasks := make(chan func(), 500) // at most 500 waiting tasks
for i := 0; i < 8; i++ {        // 8 workers
	go func() {
		for task := range tasks {
			task()
		}
	}()
}

// Submitting with a "caller runs" policy when the queue is full:
func submit(tasks chan<- func(), task func()) {
	select {
	case tasks <- task:
	default:
		task() // backpressure: the submitting goroutine does the work itself
	}
}`,

"Per-user token buckets": `type TokenBucket struct {
	mu          sync.Mutex
	capacity    float64
	refillPerNs float64
	tokens      float64
	last        time.Time
}

func NewTokenBucket(capacity, perSecond float64) *TokenBucket {
	return &TokenBucket{capacity: capacity, refillPerNs: perSecond / 1e9, tokens: capacity, last: time.Now()}
}

func (b *TokenBucket) TryAcquire() bool {
	b.mu.Lock() // refill + spend must be one atomic step
	defer b.mu.Unlock()
	now := time.Now()
	b.tokens = math.Min(b.capacity, b.tokens+float64(now.Sub(b.last))*b.refillPerNs)
	b.last = now
	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}

type RateLimiter struct {
	buckets sync.Map // user ID -> *TokenBucket
}

func (r *RateLimiter) Allow(userID string) bool {
	b, ok := r.buckets.Load(userID)
	if !ok {
		b, _ = r.buckets.LoadOrStore(userID, NewTokenBucket(100, 100)) // one bucket per user, even under a race
	}
	return b.(*TokenBucket).TryAcquire()
}
// golang.org/x/time/rate.Limiter is the standard token bucket: rate.NewLimiter(100, 100).Allow().`,

"One limit per dependency": `var bulkheads = map[string]chan struct{}{ // a counting semaphore per dependency
	"payments": make(chan struct{}, 20),
	"search":   make(chan struct{}, 50),
	"reviews":  make(chan struct{}, 10),
}

func Guarded[T any](ctx context.Context, dependency string, call func() (T, error), fallback func() T) (T, error) {
	sem := bulkheads[dependency]
	ctx, cancel := context.WithTimeout(ctx, 100*time.Millisecond)
	defer cancel()
	select {
	case sem <- struct{}{}:
	case <-ctx.Done():
		return fallback(), nil
	}
	defer func() { <-sem }()
	return call()
}`,

"Semaphore with timeout": `var slots = semaphore.NewWeighted(10) // golang.org/x/sync/semaphore

var ErrOverloaded = errors.New("model busy, retry later")

func CallModel(ctx context.Context, r Request) (Result, error) {
	ctx, cancel := context.WithTimeout(ctx, 200*time.Millisecond)
	defer cancel()
	if err := slots.Acquire(ctx, 1); err != nil {
		return Result{}, ErrOverloaded
	}
	defer slots.Release(1)
	return model.Infer(r)
}`,

"Thread-safe token bucket": `type TokenBucket struct {
	mu          sync.Mutex
	capacity    float64
	refillPerNs float64
	tokens      float64
	last        time.Time
}

func NewTokenBucket(capacity int, perSecond float64) *TokenBucket {
	return &TokenBucket{capacity: float64(capacity), refillPerNs: perSecond / 1e9, tokens: float64(capacity), last: time.Now()}
}

func (b *TokenBucket) TryAcquire() bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	now := time.Now()
	b.tokens = math.Min(b.capacity, b.tokens+float64(now.Sub(b.last))*b.refillPerNs)
	b.last = now
	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}`
} };
