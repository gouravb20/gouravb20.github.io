// Go versions of the Circuit Breaker code blocks, matched to the Java blocks by title. Imports are omitted.
window.ALT = window.ALT || {};
ALT["circuit-breaker"] = { go: {
"Public API": `paymentsConfig := DefaultConfig()
paymentsConfig.FailureRatePercent, paymentsConfig.WindowSize, paymentsConfig.MinimumCalls = 50, 20, 10
paymentsConfig.SlowCallThreshold = 800 * time.Millisecond
paymentsConfig.OpenWait, paymentsConfig.HalfOpenPermits = 30*time.Second, 3
paymentsConfig.RecordAsFailure = func(err error) bool { return !errors.Is(err, ErrNotFound) } // a 404 is an answer, not an outage

registry := NewRegistry(map[string]Config{"payments": paymentsConfig}, DefaultConfig(), SystemClock{}, &TransitionMetrics{})

payments := registry.ForDependency("payments")
pricing := registry.ForDependency("pricing") // no entry: uses the defaults

receipt, err := Execute(payments, func() (Receipt, error) { return paymentClient.Charge(order) }) // ErrCallNotPermitted when open
quote, err := ExecuteWithFallback(pricing,
	func() (Quote, error) { return pricingClient.Quote(sku) },
	func(error) (Quote, error) { return CachedQuote(sku), nil })

// For async callers: ask first, then report how the call went.
func (cb *CircuitBreaker) TryAcquirePermission() (Permit, bool)
func (cb *CircuitBreaker) OnSuccess(p Permit, elapsed time.Duration)
func (cb *CircuitBreaker) OnError(p Permit, elapsed time.Duration, err error)`,

"States as immutable records": `type State int

const (
	Closed State = iota
	Open
	HalfOpen
)

func (s State) String() string { return [...]string{"CLOSED", "OPEN", "HALF_OPEN"}[s] }

// breakerState is one period spent in one state. Go has no sealed types, so one struct is tagged by kind and only
// that kind's fields are set. The breaker swaps whole pointers, so a state and its data change together.
type breakerState struct {
	kind        State
	window      *CountWindow // Closed
	openUntil   time.Time    // Open
	permitsLeft atomic.Int32 // HalfOpen
	successes   atomic.Int32 // HalfOpen
}

func newHalfOpen(permits int) *breakerState {
	s := &breakerState{kind: HalfOpen}
	s.permitsLeft.Store(int32(permits))
	return s
}

func (s *breakerState) tryTakePermit() bool {
	for {
		n := s.permitsLeft.Load()
		if n <= 0 {
			return false
		}
		if s.permitsLeft.CompareAndSwap(n, n-1) { // one atomic step: never over-admits
			return true
		}
	}
}

// Permit proves a call was admitted, and in which state; its outcome is recorded against that state.
type Permit struct{ admittedIn *breakerState }

var ErrCallNotPermitted = errors.New("circuit breaker is open")`,

"Final class design": `type Config struct {
	FailureRatePercent, SlowRatePercent, WindowSize, MinimumCalls, HalfOpenPermits int
	SlowCallThreshold, OpenWait                                                   time.Duration
	RecordAsFailure                                                               func(error) bool
}

func DefaultConfig() Config
func (c Config) Validate() error

type Snapshot struct{ Calls, Failures, SlowCalls int }

func (s Snapshot) FailureRateAtLeast(percent int) bool
func (s Snapshot) SlowRateAtLeast(percent int) bool

type CountWindow struct { // the last N outcomes, running totals
	mu                  sync.Mutex
	failed, slow        []bool
	next, size          int
	failures, slowCalls int
}

func (w *CountWindow) Record(isFailure, isSlow bool) Snapshot

type breakerState struct {
	kind                   State        // Closed, Open or HalfOpen
	window                 *CountWindow // Closed
	openUntil              time.Time    // Open
	permitsLeft, successes atomic.Int32 // HalfOpen
}

type Permit struct{ admittedIn *breakerState }

type CircuitBreaker struct {
	name      string
	config    Config
	clock     Clock
	state     atomic.Pointer[breakerState] // swapped only by CompareAndSwap
	mu        sync.Mutex                   // guards listeners
	listeners []Listener
}

func Execute[T any](cb *CircuitBreaker, call func() (T, error)) (T, error)
func ExecuteWithFallback[T any](cb *CircuitBreaker, call func() (T, error), fallback func(error) (T, error)) (T, error)
func (cb *CircuitBreaker) TryAcquirePermission() (Permit, bool)
func (cb *CircuitBreaker) OnSuccess(p Permit, elapsed time.Duration)
func (cb *CircuitBreaker) OnError(p Permit, elapsed time.Duration, err error)
func (cb *CircuitBreaker) State() State
func (cb *CircuitBreaker) AddListener(l Listener)

type Listener interface {
	OnTransition(breaker string, from, to State)
}

type Registry struct {
	mu       sync.Mutex
	breakers map[string]*CircuitBreaker
}

func (r *Registry) ForDependency(name string) *CircuitBreaker`,

"Configuration record and builder": `// Config is a value type: copy DefaultConfig, override fields, and NewCircuitBreaker validates it.
type Config struct {
	FailureRatePercent int              // trip when this share of recent calls failed
	SlowRatePercent    int              // trip when this share of recent calls were slow
	WindowSize         int              // outcomes kept: the last N calls
	MinimumCalls       int              // calls needed before the rates are trusted
	SlowCallThreshold  time.Duration    // a call slower than this counts as slow
	OpenWait           time.Duration    // how long OPEN fails fast before trying again
	HalfOpenPermits    int              // trial calls allowed in HALF_OPEN
	RecordAsFailure    func(error) bool // must be safe to call from many goroutines
}

func DefaultConfig() Config {
	return Config{
		FailureRatePercent: 50, SlowRatePercent: 100, WindowSize: 100, MinimumCalls: 20,
		SlowCallThreshold: 2 * time.Second, OpenWait: 30 * time.Second, HalfOpenPermits: 5,
		RecordAsFailure: func(error) bool { return true },
	}
}

func (c Config) Validate() error {
	switch {
	case c.FailureRatePercent < 1 || c.FailureRatePercent > 100:
		return errors.New("FailureRatePercent must be 1-100")
	case c.SlowRatePercent < 1 || c.SlowRatePercent > 100:
		return errors.New("SlowRatePercent must be 1-100")
	case c.MinimumCalls < 1 || c.MinimumCalls > c.WindowSize:
		return errors.New("need 1 <= MinimumCalls <= WindowSize")
	case c.HalfOpenPermits < 1:
		return errors.New("HalfOpenPermits must be positive")
	case c.RecordAsFailure == nil:
		return errors.New("RecordAsFailure is required")
	}
	return nil
}`,

"Count-based sliding window": `type Snapshot struct{ Calls, Failures, SlowCalls int }

func (s Snapshot) FailureRateAtLeast(percent int) bool { return s.Failures*100 >= percent*s.Calls }
func (s Snapshot) SlowRateAtLeast(percent int) bool    { return s.SlowCalls*100 >= percent*s.Calls }

// CountWindow keeps the last N outcomes in a ring buffer, with running totals so every update is O(1).
type CountWindow struct {
	mu                  sync.Mutex // guards every field below
	failed, slow        []bool
	next, size          int
	failures, slowCalls int
}

func NewCountWindow(capacity int) *CountWindow {
	return &CountWindow{failed: make([]bool, capacity), slow: make([]bool, capacity)}
}

func (w *CountWindow) Record(isFailure, isSlow bool) Snapshot {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.size == len(w.failed) { // full: the slot we overwrite leaves the totals
		if w.failed[w.next] {
			w.failures--
		}
		if w.slow[w.next] {
			w.slowCalls--
		}
	} else {
		w.size++
	}
	w.failed[w.next], w.slow[w.next] = isFailure, isSlow
	if isFailure {
		w.failures++
	}
	if isSlow {
		w.slowCalls++
	}
	w.next = (w.next + 1) % len(w.failed)
	return Snapshot{Calls: w.size, Failures: w.failures, SlowCalls: w.slowCalls}
}`,

"CircuitBreaker": `type Clock interface{ Now() time.Time }

type SystemClock struct{}

func (SystemClock) Now() time.Time { return time.Now() }

type CircuitBreaker struct {
	name      string
	config    Config
	clock     Clock
	state     atomic.Pointer[breakerState]
	mu        sync.Mutex // guards listeners
	listeners []Listener
}

func NewCircuitBreaker(name string, config Config, clock Clock) *CircuitBreaker {
	if err := config.Validate(); err != nil {
		panic(err) // a configuration bug should stop startup
	}
	cb := &CircuitBreaker{name: name, config: config, clock: clock}
	cb.state.Store(cb.newClosed())
	return cb
}

func (cb *CircuitBreaker) State() State { return cb.state.Load().kind }

func (cb *CircuitBreaker) AddListener(l Listener) {
	cb.mu.Lock()
	defer cb.mu.Unlock()
	cb.listeners = append(cb.listeners, l)
}

// Execute is a function rather than a method because Go methods can't have type parameters.
func Execute[T any](cb *CircuitBreaker, call func() (T, error)) (T, error) {
	permit, ok := cb.TryAcquirePermission()
	if !ok {
		var zero T
		return zero, ErrCallNotPermitted
	}
	start := cb.clock.Now()
	defer func() { // every admitted call reports, or a trial permit leaks
		if r := recover(); r != nil {
			cb.OnError(permit, cb.clock.Now().Sub(start), fmt.Errorf("panic: %v", r))
			panic(r)
		}
	}()
	result, err := call()
	elapsed := cb.clock.Now().Sub(start)
	if err != nil {
		cb.OnError(permit, elapsed, err)
	} else {
		cb.OnSuccess(permit, elapsed)
	}
	return result, err
}

func ExecuteWithFallback[T any](cb *CircuitBreaker, call func() (T, error), fallback func(error) (T, error)) (T, error) {
	result, err := Execute(cb, call)
	if err != nil && (errors.Is(err, ErrCallNotPermitted) || cb.config.RecordAsFailure(err)) {
		return fallback(err)
	}
	return result, err // success, or a business error the caller should see unchanged
}

func (cb *CircuitBreaker) TryAcquirePermission() (Permit, bool) {
	for {
		s := cb.state.Load()
		switch s.kind {
		case Closed:
			return Permit{s}, true
		case HalfOpen:
			if s.tryTakePermit() {
				return Permit{s}, true
			}
			return Permit{}, false
		case Open:
			if cb.clock.Now().Before(s.openUntil) {
				return Permit{}, false
			}
			cb.transition(s, newHalfOpen(cb.config.HalfOpenPermits)) // one goroutine wins; all loop and see HalfOpen
		}
	}
}

func (cb *CircuitBreaker) OnSuccess(p Permit, elapsed time.Duration) {
	cb.record(p.admittedIn, false, elapsed > cb.config.SlowCallThreshold)
}

func (cb *CircuitBreaker) OnError(p Permit, elapsed time.Duration, err error) {
	cb.record(p.admittedIn, cb.config.RecordAsFailure(err), elapsed > cb.config.SlowCallThreshold)
}

func (cb *CircuitBreaker) record(s *breakerState, failed, slow bool) {
	switch s.kind {
	case Closed:
		snap := s.window.Record(failed, slow)
		if snap.Calls >= cb.config.MinimumCalls &&
			(snap.FailureRateAtLeast(cb.config.FailureRatePercent) || snap.SlowRateAtLeast(cb.config.SlowRatePercent)) {
			cb.transition(s, cb.newOpen())
		}
	case HalfOpen:
		if failed || slow {
			cb.transition(s, cb.newOpen())
		} else if int(s.successes.Add(1)) == cb.config.HalfOpenPermits {
			cb.transition(s, cb.newClosed())
		}
	case Open:
		// unreachable: no permit is issued while open
	}
}

func (cb *CircuitBreaker) newClosed() *breakerState {
	return &breakerState{kind: Closed, window: NewCountWindow(cb.config.WindowSize)}
}

func (cb *CircuitBreaker) newOpen() *breakerState {
	return &breakerState{kind: Open, openUntil: cb.clock.Now().Add(cb.config.OpenWait)}
}

// transition swaps from the exact pointer the decision was based on; a stale decision simply loses.
func (cb *CircuitBreaker) transition(from, to *breakerState) {
	if cb.state.CompareAndSwap(from, to) {
		cb.notifyListeners(from.kind, to.kind)
	}
}

func (cb *CircuitBreaker) notifyListeners(from, to State) {
	cb.mu.Lock()
	ls := slices.Clone(cb.listeners)
	cb.mu.Unlock()
	for _, l := range ls { // called outside the lock
		notify(l, cb.name, from, to)
	}
}

func notify(l Listener, name string, from, to State) {
	defer func() { _ = recover() }() // a broken listener must not break calls
	l.OnTransition(name, from, to)
}`,

"Registry and listeners": `type Listener interface {
	OnTransition(breaker string, from, to State)
}

type ListenerFunc func(breaker string, from, to State)

func (f ListenerFunc) OnTransition(breaker string, from, to State) { f(breaker, from, to) }

type Registry struct {
	mu        sync.Mutex // guards breakers
	breakers  map[string]*CircuitBreaker
	configs   map[string]Config // per dependency, fixed at startup
	defaults  Config
	clock     Clock
	listeners []Listener // attached to every breaker
}

func NewRegistry(configs map[string]Config, defaults Config, clock Clock, listeners ...Listener) *Registry {
	return &Registry{
		breakers: map[string]*CircuitBreaker{}, configs: maps.Clone(configs),
		defaults: defaults, clock: clock, listeners: slices.Clone(listeners),
	}
}

// ForDependency returns one breaker per dependency, even when many goroutines ask for a new name at once.
func (r *Registry) ForDependency(name string) *CircuitBreaker {
	r.mu.Lock()
	defer r.mu.Unlock()
	if cb, ok := r.breakers[name]; ok {
		return cb
	}
	config, ok := r.configs[name]
	if !ok {
		config = r.defaults
	}
	cb := NewCircuitBreaker(name, config, r.clock)
	for _, l := range r.listeners {
		cb.AddListener(l)
	}
	r.breakers[name] = cb
	return cb
}

// TransitionMetrics counts transitions; the mutex means concurrent transitions never lose a count.
type TransitionMetrics struct {
	mu     sync.Mutex
	counts map[string]int64
}

func (m *TransitionMetrics) OnTransition(breaker string, from, to State) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.counts == nil {
		m.counts = map[string]int64{}
	}
	m.counts[breaker+":"+from.String()+"->"+to.String()]++
}

func (m *TransitionMetrics) Count(key string) int64 {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.counts[key]
}`,

"Calling it from async code": `type QuoteResult struct {
	Quote Quote
	Err   error
}

// QuoteAsync takes a permit up front, runs the call in a goroutine and always reports the outcome.
func QuoteAsync(ctx context.Context, pricing *CircuitBreaker, clock Clock, client PricingClient, sku string) <-chan QuoteResult {
	out := make(chan QuoteResult, 1)
	permit, ok := pricing.TryAcquirePermission()
	if !ok {
		out <- QuoteResult{Err: ErrCallNotPermitted}
		return out
	}
	start := clock.Now()
	go func() {
		q, err := client.Quote(ctx, sku) // ctx carries the deadline, so the call always returns
		elapsed := clock.Now().Sub(start)
		if err != nil {
			pricing.OnError(permit, elapsed, err)
		} else {
			pricing.OnSuccess(permit, elapsed)
		}
		out <- QuoteResult{Quote: q, Err: err}
	}()
	return out
}`,

"Circuit breaker in one screen": `type Config struct { // Validate rejects bad values; DefaultConfig gives defaults
	FailureRatePercent, SlowRatePercent, WindowSize, MinimumCalls, HalfOpenPermits int
	SlowCallThreshold, OpenWait                                                   time.Duration
	RecordAsFailure                                                               func(error) bool
}

type breakerState struct { // one value per period in a state; swapped whole
	kind                   State        // Closed, Open, HalfOpen
	window                 *CountWindow // Closed: mutex-guarded ring buffer of the last N outcomes
	openUntil              time.Time    // Open
	permitsLeft, successes atomic.Int32 // HalfOpen
}

type Permit struct{ admittedIn *breakerState } // outcomes go to the state that admitted the call

type CircuitBreaker struct {
	state atomic.Pointer[breakerState] // every transition is CompareAndSwap(from, to)
}

func Execute[T any](cb *CircuitBreaker, call func() (T, error)) (T, error)
func ExecuteWithFallback[T any](cb *CircuitBreaker, call func() (T, error), fallback func(error) (T, error)) (T, error)
func (cb *CircuitBreaker) TryAcquirePermission() (Permit, bool) // Open past its wait: CAS to HalfOpen, loop
func (cb *CircuitBreaker) OnSuccess(p Permit, elapsed time.Duration)
func (cb *CircuitBreaker) OnError(p Permit, elapsed time.Duration, err error)

type Registry struct{ breakers map[string]*CircuitBreaker } // mutex-guarded; ForDependency(name)`,

"Time-based window with atomic buckets": `// The window becomes an interface; CountWindow already satisfies it.
type OutcomeWindow interface {
	Record(isFailure, isSlow bool) Snapshot
}

// breakerState.window becomes an OutcomeWindow. Config gains WindowSeconds; 0 keeps the count window.
func (cb *CircuitBreaker) newClosed() *breakerState {
	var w OutcomeWindow = NewCountWindow(cb.config.WindowSize)
	if cb.config.WindowSeconds > 0 {
		w = NewTimeWindow(cb.config.WindowSeconds, cb.clock)
	}
	return &breakerState{kind: Closed, window: w}
}

type bucket struct {
	second                int64
	calls, failures, slow atomic.Int64
}

// TimeWindow holds outcomes over the last N seconds: one bucket per second, reused round-robin. Record takes no lock.
type TimeWindow struct {
	buckets []atomic.Pointer[bucket]
	clock   Clock
}

func NewTimeWindow(seconds int, clock Clock) *TimeWindow {
	return &TimeWindow{buckets: make([]atomic.Pointer[bucket], seconds), clock: clock}
}

func (w *TimeWindow) Record(isFailure, isSlow bool) Snapshot {
	now := w.clock.Now().Unix()
	slot := &w.buckets[now%int64(len(w.buckets))]
	b := slot.Load()
	for b == nil || b.second < now { // stale slot: one goroutine installs this second's bucket
		fresh := &bucket{second: now}
		if slot.CompareAndSwap(b, fresh) {
			b = fresh
			break
		}
		b = slot.Load()
	}
	b.calls.Add(1)
	if isFailure {
		b.failures.Add(1)
	}
	if isSlow {
		b.slow.Add(1)
	}
	return w.snapshot(now)
}

func (w *TimeWindow) snapshot(now int64) Snapshot {
	var s Snapshot
	for i := range w.buckets {
		b := w.buckets[i].Load()
		if b != nil && now-b.second < int64(len(w.buckets)) { // skip buckets older than the window
			s.Calls += int(b.calls.Load())
			s.Failures += int(b.failures.Load())
			s.SlowCalls += int(b.slow.Load())
		}
	}
	return s
}`,

"Per-dependency failure rules": `// HTTP client errors: the dependency answered, so they say nothing about its health.
func serverTrouble(err error) bool {
	var status *HTTPStatusError
	switch {
	case errors.As(err, &status):
		return status.Code >= 500 || status.Code == 429
	case errors.Is(err, context.DeadlineExceeded): // our timeout fired
		return true
	case errors.Is(err, syscall.ECONNREFUSED), errors.Is(err, syscall.ECONNRESET):
		return true
	default:
		return false // validation and business errors
	}
}

payments := DefaultConfig()
payments.RecordAsFailure = serverTrouble
payments.SlowCallThreshold = 800 * time.Millisecond // p99 is 300 ms; 800 ms means something is wrong
payments.FailureRatePercent, payments.WindowSize, payments.MinimumCalls = 50, 50, 20`,

"HalfOpen with a deadline": `// breakerState gains startedAt (HalfOpen only); Config gains MaxHalfOpenWait, for example twice the call timeout.
func newHalfOpen(permits int, now time.Time) *breakerState {
	s := &breakerState{kind: HalfOpen, startedAt: now}
	s.permitsLeft.Store(int32(permits))
	return s
}

// In TryAcquirePermission:
case HalfOpen:
	if s.tryTakePermit() {
		return Permit{s}, true
	}
	if cb.clock.Now().After(s.startedAt.Add(cb.config.MaxHalfOpenWait)) {
		cb.transition(s, cb.newOpen()) // the trials went silent: wait again, then probe afresh
	}
	return Permit{}, false
case Open:
	if cb.clock.Now().Before(s.openUntil) {
		return Permit{}, false
	}
	cb.transition(s, newHalfOpen(cb.config.HalfOpenPermits, cb.clock.Now()))`,

"Operator overrides: forced and disabled states": `const (
	Closed State = iota
	Open
	HalfOpen
	ForcedOpen
	Disabled
)

func (s State) String() string {
	return [...]string{"CLOSED", "OPEN", "HALF_OPEN", "FORCED_OPEN", "DISABLED"}[s]
}

// An operator command replaces whatever the breaker was doing.
func (cb *CircuitBreaker) ForceOpen() { cb.override(&breakerState{kind: ForcedOpen}) }
func (cb *CircuitBreaker) Disable()   { cb.override(&breakerState{kind: Disabled}) }
func (cb *CircuitBreaker) Reset()     { cb.override(cb.newClosed()) }

func (cb *CircuitBreaker) override(to *breakerState) {
	from := cb.state.Swap(to)
	cb.notifyListeners(from.kind, to.kind)
}

// Go switches are not checked for missing cases, so add these by hand (a linter such as exhaustive can enforce it):
//   TryAcquirePermission:  case ForcedOpen: return Permit{}, false
//                          case Disabled:   return Permit{s}, true // pass, never trip
//   record:                case ForcedOpen, Disabled: // nothing to count, nothing to trip`,

"Retry outside the breaker": `// Retry holds only immutable settings, so one value can be shared by every goroutine.
type Retry struct {
	MaxAttempts  int
	FirstBackoff time.Duration
	Retryable    func(error) bool
}

func RetryCall[T any](r Retry, call func() (T, error)) (T, error) {
	for attempt := 1; ; attempt++ {
		result, err := call()
		if err == nil {
			return result, nil
		}
		if errors.Is(err, ErrCallNotPermitted) || attempt == r.MaxAttempts || !r.Retryable(err) {
			return result, err // an open breaker is never retried: that only adds load
		}
		d := r.FirstBackoff << (attempt - 1) // 100 ms, 200 ms, 400 ms...
		time.Sleep(d + rand.N(d/2+1))        // math/rand/v2 is safe for concurrent use; jitter spreads retries out
	}
}

// Each attempt goes through the breaker, so it sees every failure; the timeout is innermost.
func Available(sku string) (int, error) {
	return RetryCall(retry, func() (int, error) {
		return Execute(inventory, func() (int, error) { return stockClient.Available(sku, 2*time.Second) })
	})
}`,

"A clock tests can move": `type MutableClock struct {
	mu  sync.Mutex // guards now, so test goroutines may share the clock
	now time.Time
}

func NewMutableClock(start time.Time) *MutableClock { return &MutableClock{now: start} }

func (c *MutableClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.now
}

func (c *MutableClock) Advance(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.now = c.now.Add(d)
}`,

"State machine tests": `func testBreaker() (*CircuitBreaker, *MutableClock) {
	clock := NewMutableClock(time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC))
	cfg := DefaultConfig()
	cfg.WindowSize, cfg.MinimumCalls, cfg.FailureRatePercent = 4, 4, 50
	cfg.SlowCallThreshold, cfg.SlowRatePercent = time.Second, 50
	cfg.OpenWait, cfg.HalfOpenPermits = 10*time.Second, 2
	return NewCircuitBreaker("pricing", cfg, clock), clock
}

var errDown = errors.New("down")

func succeed(cb *CircuitBreaker) error {
	_, err := Execute(cb, func() (string, error) { return "ok", nil })
	return err
}

func fail(cb *CircuitBreaker) error {
	_, err := Execute(cb, func() (string, error) { return "", errDown })
	return err
}

func TestStaysClosedBelowMinimumCalls(t *testing.T) {
	cb, _ := testBreaker()
	fail(cb)
	fail(cb)
	fail(cb) // 100% failed, but only 3 of the 4 calls needed
	if cb.State() != Closed {
		t.Fatalf("state = %v, want CLOSED", cb.State())
	}
}

func TestOpensAtThresholdThenRecoversThroughHalfOpen(t *testing.T) {
	cb, clock := testBreaker()
	succeed(cb)
	succeed(cb)
	fail(cb)
	fail(cb) // 2 of 4 = 50%
	if cb.State() != Open {
		t.Fatalf("state = %v, want OPEN", cb.State())
	}
	if err := succeed(cb); !errors.Is(err, ErrCallNotPermitted) {
		t.Fatalf("err = %v, want ErrCallNotPermitted", err)
	}

	clock.Advance(10 * time.Second)
	succeed(cb) // the first call after the wait moves to HALF_OPEN
	if cb.State() != HalfOpen {
		t.Fatalf("state = %v, want HALF_OPEN", cb.State())
	}
	succeed(cb) // both trial calls succeeded
	if cb.State() != Closed {
		t.Fatalf("state = %v, want CLOSED", cb.State())
	}
}

func TestSlowTrialCallReopens(t *testing.T) {
	cb, clock := testBreaker()
	succeed(cb)
	succeed(cb)
	fail(cb)
	fail(cb)
	clock.Advance(10 * time.Second)
	Execute(cb, func() (string, error) { clock.Advance(2 * time.Second); return "late", nil })
	if cb.State() != Open {
		t.Fatalf("state = %v, want OPEN", cb.State())
	}
}

func TestSlowSuccessesTripIt(t *testing.T) {
	cb, clock := testBreaker()
	for i := 0; i < 4; i++ {
		Execute(cb, func() (string, error) { clock.Advance(2 * time.Second); return "late", nil })
	}
	if cb.State() != Open {
		t.Fatalf("state = %v, want OPEN", cb.State())
	}
}`,

"Exactly N trial calls under contention": `func TestHalfOpenAdmitsExactlyThePermittedTrialCalls(t *testing.T) {
	cb, clock := testBreaker()
	var toHalfOpen atomic.Int32
	cb.AddListener(ListenerFunc(func(_ string, _, to State) {
		if to == HalfOpen {
			toHalfOpen.Add(1)
		}
	}))
	succeed(cb)
	succeed(cb)
	fail(cb)
	fail(cb) // OPEN
	clock.Advance(10 * time.Second)

	const goroutines = 64
	var admitted atomic.Int32
	var wg sync.WaitGroup
	start := make(chan struct{})
	for i := 0; i < goroutines; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			if _, ok := cb.TryAcquirePermission(); ok {
				admitted.Add(1)
			}
		}()
	}
	close(start) // release every goroutine at once
	wg.Wait()

	if admitted.Load() != 2 { // exactly HalfOpenPermits, however the goroutines interleave
		t.Fatalf("admitted = %d, want 2", admitted.Load())
	}
	if toHalfOpen.Load() != 1 {
		t.Fatalf("OPEN to HALF_OPEN happened %d times, want 1", toHalfOpen.Load())
	}
}`
} };
