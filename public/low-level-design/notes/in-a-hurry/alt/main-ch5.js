// Go versions of the Main tab's code blocks for chapter 5, matched to the Java blocks by title. Imports are omitted.
window.ALT = window.ALT || {};
ALT.ch5 = ALT.ch5 || {};
ALT.ch5.go = Object.assign(ALT.ch5.go || {}, {
"Thread-safe Singleton: enum and holder idiom": `// Go has no enums or class initialisers. sync.Once gives the same guarantee:
// the function runs exactly once, and every caller sees the finished value.
type Metrics struct {
	mu       sync.Mutex // guards counters
	counters map[string]int64
}

var (
	metricsOnce sync.Once
	metrics     *Metrics
)

func GetMetrics() *Metrics {
	metricsOnce.Do(func() { metrics = &Metrics{counters: map[string]int64{}} })
	return metrics
}

func (m *Metrics) Increment(name string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.counters[name]++
}

// Go 1.21+: sync.OnceValue is the lazy "holder" in one line. AppConfig is immutable once built.
var GetAppConfig = sync.OnceValue(func() *AppConfig { return LoadAppConfig() })`,

"Double-checked locking needs volatile": `// Go's equivalent of a volatile reference is an atomic pointer.
// In practice, prefer sync.Once, which does exactly this for you.
type Registry struct{}

var (
	registry   atomic.Pointer[Registry]
	registryMu sync.Mutex
)

func GetRegistry() *Registry {
	if r := registry.Load(); r != nil { // fast path: one atomic read
		return r
	}
	registryMu.Lock()
	defer registryMu.Unlock()
	if r := registry.Load(); r != nil {
		return r
	}
	r := &Registry{}
	registry.Store(r)
	return r
}`,

"An auction with a bid-rule strategy and observers": `type BidRule interface {
	Accepts(currentCents, bidCents int64) bool
}

type MinIncrement struct{ StepCents int64 } // a value: immutable when shared

func (m MinIncrement) Accepts(current, bid int64) bool { return bid >= current+m.StepCents }

type BidListener func(auctionID, bidder string, cents int64)

type Auction struct {
	id         string
	rule       BidRule    // strategy, never reassigned
	mu         sync.Mutex // guards the fields below
	highCents  int64
	highBidder string
	listeners  []BidListener
}

func (a *Auction) Subscribe(l BidListener) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.listeners = append(a.listeners, l)
}

func (a *Auction) Bid(bidder string, cents int64) bool {
	a.mu.Lock()
	if !a.rule.Accepts(a.highCents, cents) {
		a.mu.Unlock()
		return false
	}
	a.highCents, a.highBidder = cents, bidder
	ls := slices.Clone(a.listeners) // snapshot, so publishing needs no lock
	a.mu.Unlock()
	for _, l := range ls { // outside the lock
		l(a.id, bidder, cents)
	}
	return true
}`,
});
