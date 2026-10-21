// Go versions of the Parking Lot code blocks, matched to the Java blocks by title. Imports are omitted.
window.ALT = window.ALT || {};
ALT["parking-lot"] = { go: {
"Vehicles, sizes and tickets": `type SpotSize int

const (
	Small SpotSize = iota // declared smallest first, so size order is numeric order
	Medium
	Large
)

type VehicleType int

const (
	Motorcycle VehicleType = iota
	Car
	Truck
)

// Needs is the smallest spot this vehicle fits in.
func (t VehicleType) Needs() SpotSize {
	switch t {
	case Motorcycle:
		return Small
	case Car:
		return Medium
	default:
		return Large
	}
}

type Vehicle struct {
	Plate string
	Type  VehicleType
}

// Ticket is never modified after Park creates it; the exit time goes to pricing, not here.
type Ticket struct {
	ID      string
	Vehicle Vehicle
	Spot    *ParkingSpot
	Entry   time.Time
}`,

"Final class design": `type ParkingLot struct {
	floors     []*ParkingFloor // fixed at startup
	allocation SpotAllocationStrategy
	pricing    PricingStrategy
	now        func() time.Time // injected clock
	tickets    sync.Map         // ticket ID -> *Ticket
	plates     sync.Map         // plates inside -> struct{}
}

func (l *ParkingLot) Park(v Vehicle) (*Ticket, error)       // error if full or the plate is already inside
func (l *ParkingLot) Unpark(ticketID string) (int64, error) // fee in cents; error if unknown or already used

type ParkingFloor struct {
	number int
	spots  []*ParkingSpot // nearest the entrance first, never changes
}

type ParkingSpot struct {
	id       string
	size     SpotSize
	occupied atomic.Bool
}

func (s *ParkingSpot) Fits(t VehicleType) bool
func (s *ParkingSpot) IsFree() bool    // a hint
func (s *ParkingSpot) TryOccupy() bool // atomic: true for exactly one caller
func (s *ParkingSpot) Release()

type SpotAllocationStrategy interface {
	Candidates(floors []*ParkingFloor, t VehicleType) []*ParkingSpot
}

type PricingStrategy interface {
	FeeCents(t *Ticket, exit time.Time) int64
}`,

"ParkingSpot and ParkingFloor": `type ParkingSpot struct {
	id       string
	size     SpotSize
	occupied atomic.Bool // the only mutable field
}

func NewParkingSpot(id string, size SpotSize) *ParkingSpot {
	return &ParkingSpot{id: id, size: size}
}

func (s *ParkingSpot) ID() string     { return s.id }
func (s *ParkingSpot) Size() SpotSize { return s.size }

// Fits reports whether the spot is at least as large as the one the vehicle needs.
func (s *ParkingSpot) Fits(t VehicleType) bool { return s.size >= t.Needs() }

// IsFree is a hint for allocation; TryOccupy settles who really gets the spot.
func (s *ParkingSpot) IsFree() bool { return !s.occupied.Load() }

// TryOccupy checks and sets in one atomic step: exactly one of several racing callers gets true.
func (s *ParkingSpot) TryOccupy() bool { return s.occupied.CompareAndSwap(false, true) }

func (s *ParkingSpot) Release() { s.occupied.Store(false) }

type ParkingFloor struct {
	number int
	spots  []*ParkingSpot // nearest the entrance first; never modified, so any goroutine may read it
}

func NewParkingFloor(number int, spots []*ParkingSpot) *ParkingFloor {
	return &ParkingFloor{number: number, spots: slices.Clone(spots)}
}

func (f *ParkingFloor) Number() int { return f.number }

// Spots returns the floor's spots; callers must not modify the slice.
func (f *ParkingFloor) Spots() []*ParkingSpot { return f.spots }`,

"ParkingLot": `var (
	ErrNoSpot        = errors.New("no fitting spot is free")
	ErrAlreadyInside = errors.New("this plate is already inside")
	ErrInvalidTicket = errors.New("unknown or already used ticket")
)

type ParkingLot struct {
	floors     []*ParkingFloor
	allocation SpotAllocationStrategy
	pricing    PricingStrategy
	now        func() time.Time // injected clock
	tickets    sync.Map         // ticket ID -> *Ticket
	plates     sync.Map         // plates inside -> struct{}
}

func NewParkingLot(floors []*ParkingFloor, a SpotAllocationStrategy, p PricingStrategy, now func() time.Time) *ParkingLot {
	return &ParkingLot{floors: slices.Clone(floors), allocation: a, pricing: p, now: now}
}

func (l *ParkingLot) Park(v Vehicle) (*Ticket, error) {
	if _, inside := l.plates.LoadOrStore(v.Plate, struct{}{}); inside { // atomic: one entry per plate
		return nil, ErrAlreadyInside
	}
	for _, s := range l.allocation.Candidates(l.floors, v.Type) {
		if s.TryOccupy() { // lost the race? try the next candidate
			t := &Ticket{ID: newTicketID(), Vehicle: v, Spot: s, Entry: l.now()}
			l.tickets.Store(t.ID, t)
			return t, nil
		}
	}
	l.plates.Delete(v.Plate) // nothing won: the plate may try again
	return nil, ErrNoSpot
}

func (l *ParkingLot) Unpark(ticketID string) (int64, error) {
	v, ok := l.tickets.LoadAndDelete(ticketID) // atomic: only the first exit gets the ticket
	if !ok {
		return 0, ErrInvalidTicket
	}
	t := v.(*Ticket)
	fee := l.pricing.FeeCents(t, l.now())
	t.Spot.Release()
	l.plates.Delete(t.Vehicle.Plate)
	return fee, nil
}

// newTicketID returns 128 bits from crypto/rand, so a ticket ID cannot be guessed.
func newTicketID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}`,

"Pricing: per started hour": `type PricingStrategy interface {
	FeeCents(t *Ticket, exit time.Time) int64
}

// HourlyPricing charges a rate per vehicle type for every started hour, at least one hour.
type HourlyPricing struct {
	centsPerHour map[VehicleType]int64 // copied at construction, then only read
}

func NewHourlyPricing(rates map[VehicleType]int64) (*HourlyPricing, error) {
	for _, t := range []VehicleType{Motorcycle, Car, Truck} {
		if _, ok := rates[t]; !ok {
			return nil, fmt.Errorf("no rate for vehicle type %d", t)
		}
	}
	return &HourlyPricing{centsPerHour: maps.Clone(rates)}, nil
}

func (p *HourlyPricing) FeeCents(t *Ticket, exit time.Time) int64 {
	seconds := max(0, int64(exit.Sub(t.Entry)/time.Second)) // a clock step back counts as zero
	hours := max(1, (seconds+3599)/3600)                     // round up: 61 minutes is 2 hours
	return hours * p.centsPerHour[t.Vehicle.Type]            // priced by vehicle, not by spot
}`,

"Allocation: exact size and nearest fit": `type SpotAllocationStrategy interface {
	// Candidates returns free-looking spots that fit, best first. The lot claims them in this order.
	Candidates(floors []*ParkingFloor, t VehicleType) []*ParkingSpot
}

// ExactSize offers only spots of exactly the size the vehicle needs, nearest first.
type ExactSize struct{}

func (ExactSize) Candidates(floors []*ParkingFloor, t VehicleType) []*ParkingSpot {
	var out []*ParkingSpot
	for _, f := range floors {
		for _, s := range f.Spots() {
			if s.IsFree() && s.Size() == t.Needs() {
				out = append(out, s)
			}
		}
	}
	return out
}

// NearestFit offers any spot the vehicle fits in, nearest the entrance first.
type NearestFit struct{}

func (NearestFit) Candidates(floors []*ParkingFloor, t VehicleType) []*ParkingSpot {
	var out []*ParkingSpot
	for _, f := range floors {
		for _, s := range f.Spots() {
			if s.IsFree() && s.Fits(t) {
				out = append(out, s)
			}
		}
	}
	return out
}`,

"Allocation: best fit": `// BestFit offers the smallest size that fits first, nearest first within each size,
// so larger spots stay free for larger vehicles.
type BestFit struct{}

func (BestFit) Candidates(floors []*ParkingFloor, t VehicleType) []*ParkingSpot {
	var out []*ParkingSpot // local to this call, never shared
	for size := t.Needs(); size <= Large; size++ {
		for _, f := range floors {
			for _, s := range f.Spots() {
				if s.Size() == size && s.IsFree() {
					out = append(out, s)
				}
			}
		}
	}
	return out
}`,

"Parking lot in one screen": `type SpotSize int        // Small, Medium, Large
type VehicleType int     // Motorcycle, Car, Truck; Needs() SpotSize
type Vehicle struct{ Plate string; Type VehicleType }
type Ticket struct{ ID string; Vehicle Vehicle; Spot *ParkingSpot; Entry time.Time }

type ParkingSpot struct{ occupied atomic.Bool }

func (s *ParkingSpot) Fits(t VehicleType) bool // size >= t.Needs()
func (s *ParkingSpot) TryOccupy() bool         // occupied.CompareAndSwap(false, true): one winner
func (s *ParkingSpot) Release()

type ParkingLot struct {
	tickets sync.Map // LoadAndDelete makes tickets single-use
	plates  sync.Map // LoadOrStore allows one entry per plate
}

func (l *ParkingLot) Park(v Vehicle) (*Ticket, error) // first candidate whose TryOccupy() wins
func (l *ParkingLot) Unpark(id string) (int64, error) // remove, price, release

// BestFit: smallest fitting size first, nearest first within it
// HourlyPricing: max(1, ceil(seconds / 3600)) x rate for the vehicle type, in cents`,

"Pricing rules as new strategies": `// FlatRatePricing charges a fixed fee per visit, whatever the duration.
type FlatRatePricing struct{ Cents int64 }

func (p FlatRatePricing) FeeCents(t *Ticket, exit time.Time) int64 { return p.Cents }

// DailyCap wraps any rule and caps the charge at a maximum per started 24 hours (a decorator).
type DailyCap struct {
	Inner          PricingStrategy
	CapPerDayCents int64
}

func (c DailyCap) FeeCents(t *Ticket, exit time.Time) int64 {
	seconds := max(0, int64(exit.Sub(t.Entry)/time.Second))
	days := max(1, (seconds+86399)/86400)
	return min(c.Inner.FeeCents(t, exit), days*c.CapPerDayCents)
}

// ByEntryDay picks a rule by the local day the vehicle entered.
type ByEntryDay struct {
	Weekday, Weekend PricingStrategy
	Zone             *time.Location
}

func (b ByEntryDay) FeeCents(t *Ticket, exit time.Time) int64 {
	d := t.Entry.In(b.Zone).Weekday()
	if d == time.Saturday || d == time.Sunday {
		return b.Weekend.FeeCents(t, exit)
	}
	return b.Weekday.FeeCents(t, exit)
}

// Wiring, once at startup:
// lot := NewParkingLot(floors, BestFit{},
//	ByEntryDay{Weekday: DailyCap{Inner: hourly, CapPerDayCents: 2000}, Weekend: FlatRatePricing{Cents: 800}, Zone: london},
//	clock)`,

"Free-spot index per size": `// spotHeap is a min-heap of free spots ordered by their nearest-first rank.
type spotHeap struct {
	spots []*ParkingSpot
	rank  map[*ParkingSpot]int // shared and read-only after construction
}

func (h *spotHeap) Len() int           { return len(h.spots) }
func (h *spotHeap) Less(i, j int) bool { return h.rank[h.spots[i]] < h.rank[h.spots[j]] }
func (h *spotHeap) Swap(i, j int)      { h.spots[i], h.spots[j] = h.spots[j], h.spots[i] }
func (h *spotHeap) Push(x any)         { h.spots = append(h.spots, x.(*ParkingSpot)) }
func (h *spotHeap) Pop() any {
	n := len(h.spots)
	s := h.spots[n-1]
	h.spots = h.spots[:n-1]
	return s
}

// IndexedBestFit keeps free spots per size; Claim picks and removes in one locked step.
type IndexedBestFit struct {
	mu   sync.Mutex // guards every heap; each operation is O(log n), so it is held briefly
	free map[SpotSize]*spotHeap
}

func NewIndexedBestFit(floors []*ParkingFloor) *IndexedBestFit {
	rank := map[*ParkingSpot]int{}
	for _, f := range floors {
		for _, s := range f.Spots() {
			rank[s] = len(rank)
		}
	}
	ix := &IndexedBestFit{free: map[SpotSize]*spotHeap{}}
	for size := Small; size <= Large; size++ {
		ix.free[size] = &spotHeap{rank: rank}
	}
	for s := range rank {
		heap.Push(ix.free[s.Size()], s)
	}
	return ix
}

func (ix *IndexedBestFit) Claim(t VehicleType) (*ParkingSpot, bool) {
	ix.mu.Lock()
	defer ix.mu.Unlock()
	for size := t.Needs(); size <= Large; size++ {
		if h := ix.free[size]; h.Len() > 0 {
			return heap.Pop(h).(*ParkingSpot), true // no two callers get the same spot
		}
	}
	return nil, false
}

func (ix *IndexedBestFit) Release(s *ParkingSpot) {
	ix.mu.Lock()
	heap.Push(ix.free[s.Size()], s)
	ix.mu.Unlock()
}`,

"Free counts per floor": `// Availability holds live free counts per floor and size. Counters are atomic,
// so gates update them without a lock; the maps are built once and only read.
type Availability struct {
	counterOf map[*ParkingSpot]*atomic.Int32         // each spot -> its floor-and-size counter
	byFloor   map[int]map[SpotSize]*atomic.Int32     // floor -> size -> counter, for the boards
}

func NewAvailability(floors []*ParkingFloor) *Availability {
	a := &Availability{counterOf: map[*ParkingSpot]*atomic.Int32{}, byFloor: map[int]map[SpotSize]*atomic.Int32{}}
	for _, f := range floors {
		bySize := map[SpotSize]*atomic.Int32{}
		for size := Small; size <= Large; size++ {
			bySize[size] = new(atomic.Int32)
		}
		for _, s := range f.Spots() {
			bySize[s.Size()].Add(1) // every spot starts free
			a.counterOf[s] = bySize[s.Size()]
		}
		a.byFloor[f.Number()] = bySize
	}
	return a
}

func (a *Availability) Taken(s *ParkingSpot)    { a.counterOf[s].Add(-1) }
func (a *Availability) Released(s *ParkingSpot) { a.counterOf[s].Add(1) }

func (a *Availability) Free(floor int, size SpotSize) int {
	return int(a.byFloor[floor][size].Load())
}

// ParkingLot: after s.TryOccupy() succeeds, availability.Taken(s);
//             after t.Spot.Release(),       availability.Released(t.Spot)`,

"Lost tickets: find the ticket by plate": `const pending = "" // plate reserved, ticket not issued yet

// The lot's plates field becomes ticketByPlate sync.Map: plate -> ticket ID.

func (l *ParkingLot) Park(v Vehicle) (*Ticket, error) {
	if _, inside := l.ticketByPlate.LoadOrStore(v.Plate, pending); inside {
		return nil, ErrAlreadyInside
	}
	for _, s := range l.allocation.Candidates(l.floors, v.Type) {
		if s.TryOccupy() {
			t := &Ticket{ID: newTicketID(), Vehicle: v, Spot: s, Entry: l.now()}
			l.tickets.Store(t.ID, t)
			l.ticketByPlate.Store(v.Plate, t.ID)
			return t, nil
		}
	}
	l.ticketByPlate.CompareAndDelete(v.Plate, pending)
	return nil, ErrNoSpot
}

// In Unpark, replace l.plates.Delete(...) with: l.ticketByPlate.CompareAndDelete(t.Vehicle.Plate, t.ID)

// UnparkLost finds the stay by plate and charges the normal fee plus a fixed penalty.
func (l *ParkingLot) UnparkLost(plate string, penaltyCents int64) (int64, error) {
	v, ok := l.ticketByPlate.Load(plate)
	if !ok || v.(string) == pending {
		return 0, ErrInvalidTicket
	}
	fee, err := l.Unpark(v.(string)) // the same single-use removal
	if err != nil {
		return 0, err
	}
	return fee + penaltyCents, nil
}`
} };
