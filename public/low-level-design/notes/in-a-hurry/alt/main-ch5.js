// Go versions of the Main tab's code blocks for chapter 5, matched to the Java blocks by title. Imports are omitted.
window.ALT = window.ALT || {};
ALT.ch5 = ALT.ch5 || {};
ALT.ch5.go = Object.assign(ALT.ch5.go || {}, {
"Lazy Singleton with a lock": `type Singleton struct{}

var (
	instance *Singleton
	mu       sync.Mutex
)

func GetInstance() *Singleton { // check and create under one lock
	mu.Lock()
	defer mu.Unlock()
	if instance == nil {
		instance = &Singleton{}
	}
	return instance
}`,

"Double-checked locking needs volatile": `type Singleton struct{}

var (
	instance atomic.Pointer[Singleton] // atomic: no goroutine sees a half-built object
	mu       sync.Mutex
)

func GetInstance() *Singleton {
	if s := instance.Load(); s != nil { // fast path: no lock once created
		return s
	}
	mu.Lock()
	defer mu.Unlock()
	if s := instance.Load(); s != nil { // check again under the lock
		return s
	}
	s := &Singleton{}
	instance.Store(s)
	return s
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
