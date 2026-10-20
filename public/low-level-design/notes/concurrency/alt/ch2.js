// Go versions of chapter 2's code blocks, matched to the Java blocks by title. Imports are omitted.
window.ALT = window.ALT || {};
ALT["ch2"] = { go: {
"Check-then-act and read-modify-write in one class": `type Show struct {
	seatOwner map[string]string
	seatsSold int
}

func (s *Show) Book(seatID, userID string) bool {
	if _, taken := s.seatOwner[seatID]; taken { // check
		return false
	}
	s.seatOwner[seatID] = userID // act
	s.seatsSold++                // read-modify-write
	return true
}
// Worse than in Java: concurrent map writes can make the Go runtime crash with
// "fatal error: concurrent map writes".`,

"Coarse-grained and correct": `type Show struct {
	mu        sync.Mutex
	seatOwner map[string]string
	seatsSold int
}

func (s *Show) Book(seatID, userID string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, taken := s.seatOwner[seatID]; taken {
		return false
	}
	s.seatOwner[seatID] = userID
	s.seatsSold++
	return true
}

func (s *Show) SeatsSold() int { // reads need the lock too
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.seatsSold
}`,

"One atomic step per seat": `type SeatState int32

const (
	Free SeatState = iota
	Held
	Booked
)

type Seat struct{ state atomic.Int32 } // starts at Free (zero value)

func (s *Seat) Hold() bool    { return s.state.CompareAndSwap(int32(Free), int32(Held)) }
func (s *Seat) Confirm() bool { return s.state.CompareAndSwap(int32(Held), int32(Booked)) }
func (s *Seat) Release()      { s.state.CompareAndSwap(int32(Held), int32(Free)) }

type Show struct {
	seatOwner sync.Map // seat ID -> user ID
	seatsSold atomic.Int64
}

func (s *Show) Book(seatID, userID string) bool {
	if _, loaded := s.seatOwner.LoadOrStore(seatID, userID); loaded { // atomic check-and-put
		return false
	}
	s.seatsSold.Add(1)
	return true
}`,

"Give up instead of waiting forever": `// sync.Mutex has TryLock but no timeout. A one-slot channel is a lock you can wait on with a deadline.
type Show struct {
	lock chan struct{} // make(chan struct{}, 1)
}

func (s *Show) BookWithin(ctx context.Context, seatID, userID string, budget time.Duration) (bool, error) {
	ctx, cancel := context.WithTimeout(ctx, budget)
	defer cancel()
	select {
	case s.lock <- struct{}{}: // acquired
	case <-ctx.Done():
		return false, nil // busy: tell the user to retry
	}
	defer func() { <-s.lock }() // release
	return s.doBook(seatID, userID)
}`,

"Booking several seats with per-seat locks": `func BookAll(seats []*Seat, userID string) bool {
	ordered := slices.Clone(seats)
	slices.SortFunc(ordered, func(a, b *Seat) int { return strings.Compare(a.ID, b.ID) })
	for _, s := range ordered { // always in id order
		s.mu.Lock()
	}
	defer func() {
		for i := len(ordered) - 1; i >= 0; i-- {
			ordered[i].mu.Unlock()
		}
	}()
	for _, s := range ordered { // all or nothing
		if !s.isFree() {
			return false
		}
	}
	for _, s := range ordered {
		s.bookFor(userID)
	}
	return true
}
// Go mutexes aren't reentrant: if the same seat can appear twice, de-duplicate first.`,

"Immutable snapshot, swapped atomically": `type PriceTable struct{ prices map[string]int64 } // never modified after creation

func (t *PriceTable) With(sku string, cents int64) *PriceTable {
	m := maps.Clone(t.prices) // copy, change the copy
	m[sku] = cents
	return &PriceTable{m}
}

type PriceService struct {
	table atomic.Pointer[PriceTable]
}

func (s *PriceService) Price(sku string) int64 { return s.table.Load().prices[sku] } // no lock

func (s *PriceService) Update(sku string, cents int64) {
	for {
		cur := s.table.Load()
		if s.table.CompareAndSwap(cur, cur.With(sku, cents)) {
			return
		}
	}
}`,

"Confinement: one thread owns the elevator controller": `type ElevatorController struct {
	requests chan int // any goroutine may send
	stops    []int    // touched only by the loop goroutine
}

func NewElevatorController() *ElevatorController {
	c := &ElevatorController{requests: make(chan int, 64)}
	go c.loop()
	return c
}

func (c *ElevatorController) Request(floor int) { c.requests <- floor }

func (c *ElevatorController) loop() {
	for floor := range c.requests {
		if !slices.Contains(c.stops, floor) {
			c.stops = append(c.stops, floor)
		}
	}
}
// "Don't communicate by sharing memory; share memory by communicating."`,

"Optimistic update with a version (in memory and in SQL)": `type Stock struct {
	Version   int64
	Available int
}

func Reserve(ref *atomic.Pointer[Stock], qty int) bool {
	for {
		cur := ref.Load()
		if cur.Available < qty {
			return false
		}
		next := &Stock{cur.Version + 1, cur.Available - qty}
		if ref.CompareAndSwap(cur, next) { // else someone else won: retry
			return true
		}
	}
}

// Same idea against a database:
// UPDATE stock SET available = available - $1, version = version + 1
//  WHERE sku = $2 AND version = $3 AND available >= $1
// 0 rows affected means a conflict (or not enough stock): re-read and retry`,

"Lock ordering for transfers": `var ErrInsufficientFunds = errors.New("insufficient funds")

func Transfer(from, to *Account, amount int64) error {
	if from.ID == to.ID {
		return nil
	}
	first, second := from, to
	if to.ID < from.ID {
		first, second = to, from
	}
	first.mu.Lock()
	defer first.mu.Unlock()
	second.mu.Lock()
	defer second.mu.Unlock()
	if from.balance < amount {
		return ErrInsufficientFunds
	}
	from.balance -= amount
	to.balance += amount
	return nil
}`,

"Safe transfer between two accounts": `func Transfer(from, to *Account, amount int64) error {
	first, second := from, to // global order
	if to.ID < from.ID {
		first, second = to, from
	}
	first.mu.Lock()
	defer first.mu.Unlock()
	second.mu.Lock()
	defer second.mu.Unlock()
	if from.balance < amount {
		return ErrInsufficientFunds
	}
	from.balance -= amount
	to.balance += amount
	return nil
}`,

"Atomic \"book if free\" with ConcurrentHashMap": `var seatOwner sync.Map // seat ID -> user ID

func Book(seatID, userID string) bool {
	// LoadOrStore is atomic: exactly one caller stores; the rest see loaded == true
	_, loaded := seatOwner.LoadOrStore(seatID, userID)
	return !loaded
}`
} };
