// Go versions of the Parking Lot code blocks, matched to the Java blocks by title. Imports are omitted.
window.ALT = window.ALT || {};
ALT["parking-lot"] = { go: {
"Public API": `func (l *ParkingLot) Park(plate string, t VehicleType) (*Ticket, error) // error if no spot is free
func (l *ParkingLot) Unpark(ticketID string) (int64, error)             // fee in cents; error for an invalid or used ticket`,

"Spots and tickets": `type VehicleType int

const (
	Motorcycle VehicleType = iota
	Car
	Truck
)

type ParkingSpot struct {
	ID   string
	Type VehicleType

	mu       sync.Mutex
	occupied bool
}

func (s *ParkingSpot) TryOccupy() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.occupied {
		return false
	}
	s.occupied = true
	return true
}

func (s *ParkingSpot) Free() {
	s.mu.Lock()
	s.occupied = false
	s.mu.Unlock()
}

type Ticket struct {
	ID    string
	Spot  *ParkingSpot
	Plate string
	Entry time.Time
}`,

"Pricing and allocation strategies": `type PricingStrategy interface {
	Fee(t *Ticket, exit time.Time) int64 // cents
}

type HourlyPricing struct {
	CentsPerHour map[VehicleType]int64
}

func (p HourlyPricing) Fee(t *Ticket, exit time.Time) int64 {
	minutes := int64(exit.Sub(t.Entry) / time.Minute)
	hours := max(1, (minutes+59)/60) // round up, minimum one hour
	return hours * p.CentsPerHour[t.Spot.Type]
}

type SpotAllocationStrategy interface {
	Candidates(all []*ParkingSpot, t VehicleType) []*ParkingSpot
}

type FirstFitAllocation struct{}

func (FirstFitAllocation) Candidates(all []*ParkingSpot, t VehicleType) []*ParkingSpot {
	var out []*ParkingSpot
	for _, s := range all {
		if s.Type == t {
			out = append(out, s)
		}
	}
	return out
}`,

"ParkingLot": `type ParkingLot struct {
	spots      []*ParkingSpot
	allocation SpotAllocationStrategy
	pricing    PricingStrategy
	now        func() time.Time // injected clock
	active     sync.Map         // ticket ID -> *Ticket
}

func NewParkingLot(spots []*ParkingSpot, a SpotAllocationStrategy, p PricingStrategy, now func() time.Time) *ParkingLot {
	return &ParkingLot{spots: spots, allocation: a, pricing: p, now: now}
}

func (l *ParkingLot) Park(plate string, t VehicleType) (*Ticket, error) {
	for _, s := range l.allocation.Candidates(l.spots, t) {
		if s.TryOccupy() { // atomic claim
			tk := &Ticket{ID: newID(), Spot: s, Plate: plate, Entry: l.now()} // newID: random unique id
			l.active.Store(tk.ID, tk)
			return tk, nil
		}
	}
	return nil, fmt.Errorf("no free spot for vehicle type %d", t)
}

func (l *ParkingLot) Unpark(ticketID string) (int64, error) {
	v, ok := l.active.LoadAndDelete(ticketID) // false if invalid or already used
	if !ok {
		return 0, errors.New("invalid ticket")
	}
	tk := v.(*Ticket)
	fee := l.pricing.Fee(tk, l.now())
	tk.Spot.Free()
	return fee, nil
}`,

"Nearest first, with bigger-spot fallback": `type NearestFirstAllocation struct{}

var fits = map[VehicleType][]VehicleType{
	Motorcycle: {Motorcycle, Car, Truck},
	Car:        {Car, Truck},
	Truck:      {Truck},
}

func (NearestFirstAllocation) Candidates(all []*ParkingSpot, t VehicleType) []*ParkingSpot {
	var out []*ParkingSpot
	for _, fit := range fits[t] { // exact size first, then larger
		var group []*ParkingSpot
		for _, s := range all {
			if s.Type == fit {
				group = append(group, s)
			}
		}
		slices.SortFunc(group, func(a, b *ParkingSpot) int { return a.DistanceToEntrance - b.DistanceToEntrance })
		out = append(out, group...)
	}
	return out
}`,

"O(1) park and unpark": `// A buffered channel per vehicle type is a ready-made concurrent queue of free spots.
type FastParkingLot struct {
	free map[VehicleType]chan *ParkingSpot // built once, then only read
}

func NewFastParkingLot(spots []*ParkingSpot) *FastParkingLot {
	counts := map[VehicleType]int{}
	for _, s := range spots {
		counts[s.Type]++
	}
	l := &FastParkingLot{free: map[VehicleType]chan *ParkingSpot{}}
	for t, n := range counts {
		l.free[t] = make(chan *ParkingSpot, n)
	}
	for _, s := range spots {
		l.free[s.Type] <- s
	}
	return l
}

func (l *FastParkingLot) Claim(t VehicleType) (*ParkingSpot, error) {
	select {
	case s := <-l.free[t]: // atomic: each spot goes to exactly one caller
		return s, nil
	default:
		return nil, fmt.Errorf("no free spot for vehicle type %d", t)
	}
}

func (l *FastParkingLot) Release(s *ParkingSpot) { l.free[s.Type] <- s }`,

"Boards subscribe to spot events": `type SpotListener func(floor string, t VehicleType, free int)

type SpotEvents struct {
	mu        sync.RWMutex
	listeners []SpotListener
}

func (e *SpotEvents) Subscribe(l SpotListener) {
	e.mu.Lock()
	e.listeners = append(e.listeners, l)
	e.mu.Unlock()
}

func (e *SpotEvents) Publish(floor string, t VehicleType, free int) {
	e.mu.RLock()
	ls := slices.Clone(e.listeners)
	e.mu.RUnlock()
	for _, l := range ls { // call outside the lock
		l(floor, t, free)
	}
}

// ParkingLot calls events.Publish(...) after a successful park or unpark.
// A display board subscribes a func that updates its counters.`,

"Parking lot in one screen": `type ParkingSpot struct {
	mu       sync.Mutex
	occupied bool
}

func (s *ParkingSpot) TryOccupy() bool
func (s *ParkingSpot) Free()

type PricingStrategy interface{ Fee(t *Ticket, exit time.Time) int64 }
type SpotAllocationStrategy interface {
	Candidates(all []*ParkingSpot, t VehicleType) []*ParkingSpot
}

type ParkingLot struct{ active sync.Map } // ticket ID -> *Ticket

func (l *ParkingLot) Park(plate string, t VehicleType) (*Ticket, error) // first candidate whose TryOccupy() succeeds
func (l *ParkingLot) Unpark(id string) (int64, error)                   // LoadAndDelete makes tickets single-use`
} };
