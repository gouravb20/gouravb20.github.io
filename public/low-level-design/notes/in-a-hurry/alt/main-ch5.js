// Go versions of the Main tab's code blocks for chapter 5, matched to the Java blocks by title. Imports are omitted.
window.ALT = window.ALT || {};
ALT.ch5 = ALT.ch5 || {};
ALT.ch5.go = Object.assign(ALT.ch5.go || {}, {
"Lazy Singleton with a lock": `type Metrics struct {
	mu       sync.Mutex // guards counters
	counters map[string]int64
}

var (
	metrics   *Metrics   // guarded by metricsMu
	metricsMu sync.Mutex
)

// Check and create under one lock: only one goroutine can ever see nil and build.
func GetMetrics() *Metrics {
	metricsMu.Lock()
	defer metricsMu.Unlock()
	if metrics == nil {
		metrics = &Metrics{counters: map[string]int64{}}
	}
	return metrics
}

func (m *Metrics) Increment(name string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.counters[name]++
}`,

"Double-checked locking needs volatile": `// Go's equivalent of a volatile reference is an atomic pointer.
// (sync.Once in the standard library is this same check-lock-check pattern.)
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
