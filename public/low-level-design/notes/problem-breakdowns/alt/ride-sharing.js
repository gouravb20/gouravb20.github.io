// Go versions of the Ride Sharing code blocks, matched to the Java blocks by title. Imports are omitted.
window.ALT = window.ALT || {};
ALT["ride-sharing"] = { go: {
"Broken: check, then set": `// Two dispatch goroutines, two riders, one nearby driver
if d.Status() == DriverAvailable { // both goroutines see Available
	d.setStatus(DriverOffered) // both write Offered
	ride.offerTo(d)            // the same driver now holds two offers
}`,

"Value types and the transition table": `type Location struct{ Lat, Lng float64 }

const earthRadiusKm = 6371.0

// DistanceKm is the great-circle (haversine) distance; good enough to rank nearby drivers.
func (a Location) DistanceKm(b Location) float64 {
	rad := math.Pi / 180
	dLat, dLng := (b.Lat-a.Lat)*rad, (b.Lng-a.Lng)*rad
	h := math.Pow(math.Sin(dLat/2), 2) +
		math.Cos(a.Lat*rad)*math.Cos(b.Lat*rad)*math.Pow(math.Sin(dLng/2), 2)
	return 2 * earthRadiusKm * math.Asin(math.Sqrt(h))
}

type RideType int

const (
	Bike RideType = iota
	Auto
	Mini
	Sedan
	XL
)

type Vehicle struct {
	Plate, Model string
	Type         RideType
}

type Rider struct{ ID, Name string }

// TripMetrics is the length and duration of a trip: estimated from a route before it, measured after it.
type TripMetrics struct{ Meters, Seconds int64 }

// FareBreakdown amounts are in paise. SurgePercent is 100 for no surge, 120 for 1.2x.
type FareBreakdown struct {
	Base, Distance, Time int64
	SurgePercent         int
	Total                int64
}

type RideStatus int

const (
	Requested RideStatus = iota
	Offered
	Accepted
	DriverArrived
	InProgress
	Completed
	Cancelled
)

var statusNames = [...]string{"REQUESTED", "OFFERED", "ACCEPTED", "DRIVER_ARRIVED", "IN_PROGRESS", "COMPLETED", "CANCELLED"}

func (s RideStatus) String() string { return statusNames[s] }

// next is built at package initialisation and never written again, so any goroutine may read it.
var next = map[RideStatus][]RideStatus{
	Requested:     {Offered, Cancelled},
	Offered:       {Accepted, Requested, Cancelled}, // back to Requested on decline or timeout
	Accepted:      {DriverArrived, Cancelled},
	DriverArrived: {InProgress, Cancelled},
	InProgress:    {Completed},
	// Completed and Cancelled are terminal: no entry
}

func (s RideStatus) CanMoveTo(to RideStatus) bool { return slices.Contains(next[s], to) }`,

"Final class design": `// RideService: one instance, built by NewRideService and passed to handlers; not a package-level singleton.
type RideService struct {
	pricing  PricingStrategy
	matching MatchingStrategy
	surge    SurgeProvider
	routes   RouteEstimator
	payments PaymentGateway
	after    func(time.Duration, func()) // schedules offer timeouts; time.AfterFunc in production
	now      func() time.Time
	// drivers, rides, byRequest, index, listeners
}

func (s *RideService) Estimate(pickup, drop Location, t RideType) (FareBreakdown, error)
func (s *RideService) RequestRide(riderID, requestID string, pickup, drop Location, t RideType) (*Ride, error) // idempotent
func (s *RideService) Cancel(rideID, riderID string) error
func (s *RideService) RateDriver(rideID, riderID string, stars int) error
func (s *RideService) RegisterDriver(d *Driver)
func (s *RideService) GoOnline(driverID string, at Location) error
func (s *RideService) GoOffline(driverID string) error
func (s *RideService) UpdateLocation(driverID string, at Location) error
func (s *RideService) Accept(rideID, driverID string) error
func (s *RideService) Decline(rideID, driverID string) error
func (s *RideService) Arrived(rideID, driverID string) error
func (s *RideService) Start(rideID, driverID string) error
func (s *RideService) Complete(rideID, driverID string, actual TripMetrics) error
func (s *RideService) AddListener(l RideListener)

type Ride struct {
	mu         sync.Mutex // guards everything below
	status     RideStatus
	driver     *Driver     // offered to or assigned to; nil while searching
	candidates []Candidate // ranked, not yet tried
}

func (r *Ride) offerNext() (RideEvent, bool)
func (r *Ride) accept(driverID string, nowMillis int64) (RideEvent, error)
func (r *Ride) withdrawOffer(driverID string) bool // decline or timeout
func (r *Ride) arrived(driverID string) (RideEvent, error)
func (r *Ride) start(driverID string) (RideEvent, error)
func (r *Ride) complete(driverID string, fare FareBreakdown) (RideEvent, error)
func (r *Ride) cancel(reason CancelReason) (RideEvent, error)
func (r *Ride) moveTo(next RideStatus) (RideEvent, error) // the only place status changes

type Driver struct {
	status atomic.Int32             // a DriverStatus, changed only by compare-and-swap
	loc    atomic.Pointer[Location] // pings never lock
}

func (d *Driver) TryClaim() bool
func (d *Driver) Release() bool
func (d *Driver) StartTrip(nowMillis int64) bool
func (d *Driver) EndTrip() bool

func (ix *DriverIndex) Update(d *Driver, at Location)
func (ix *DriverIndex) Remove(d *Driver)
func (ix *DriverIndex) Near(p Location, t RideType, radiusKm float64) []Candidate

type PricingStrategy interface {
	Price(t RideType, trip TripMetrics, surgePercent int) (FareBreakdown, error)
}
type MatchingStrategy interface{ Rank(cs []Candidate) []Candidate }
type SurgeProvider interface{ SurgePercentAt(pickup Location) int }
type RouteEstimator interface{ Estimate(from, to Location) TripMetrics }
type PaymentGateway interface {
	Charge(idempotencyKey, riderID string, amountPaise int64) error
}
type RideListener interface{ OnEvent(e RideEvent) }`,

"RideService: requests, offers and timeouts": `type RideListener interface{ OnEvent(e RideEvent) } // notifications, receipts

type PaymentGateway interface {
	Charge(idempotencyKey, riderID string, amountPaise int64) error
}

const (
	searchRadiusKm = 3.0
	offerTimeout   = 15 * time.Second
)

type RideService struct {
	pricing  PricingStrategy
	matching MatchingStrategy
	surge    SurgeProvider
	routes   RouteEstimator
	payments PaymentGateway
	after    func(time.Duration, func()) // time.AfterFunc in production, a fake in tests
	now      func() time.Time
	index    *DriverIndex

	drivers   sync.Map // driver id -> *Driver
	rides     sync.Map // ride id -> *Ride
	byRequest sync.Map // "riderID:requestID" -> *Ride

	mu        sync.RWMutex // guards listeners
	listeners []RideListener
}

func NewRideService(p PricingStrategy, m MatchingStrategy, s SurgeProvider, r RouteEstimator,
	pay PaymentGateway, after func(time.Duration, func()), now func() time.Time) *RideService {
	return &RideService{pricing: p, matching: m, surge: s, routes: r, payments: pay, after: after, now: now, index: NewDriverIndex()}
}

func (s *RideService) AddListener(l RideListener) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.listeners = append(s.listeners, l)
}

// ---- drivers

func (s *RideService) RegisterDriver(d *Driver) { s.drivers.Store(d.ID, d) }

func (s *RideService) GoOnline(driverID string, at Location) error {
	d, err := s.driver(driverID)
	if err != nil {
		return err
	}
	if d.GoOnline() {
		s.index.Update(d, at)
	}
	return nil
}

func (s *RideService) GoOffline(driverID string) error {
	d, err := s.driver(driverID)
	if err != nil {
		return err
	}
	if d.GoOffline() {
		s.index.Remove(d)
	}
	return nil
}

func (s *RideService) UpdateLocation(driverID string, at Location) error {
	d, err := s.driver(driverID)
	if err != nil {
		return err
	}
	s.index.Update(d, at)
	return nil
}

// ---- riders

func (s *RideService) Estimate(pickup, drop Location, t RideType) (FareBreakdown, error) {
	return s.pricing.Price(t, s.routes.Estimate(pickup, drop), s.surge.SurgePercentAt(pickup))
}

// RequestRide is idempotent: a retry with the same request id returns the same ride and never dispatches twice.
func (s *RideService) RequestRide(riderID, requestID string, pickup, drop Location, t RideType) (*Ride, error) {
	if pickup == drop {
		return nil, errors.New("pickup and drop are the same place")
	}
	key := riderID + ":" + requestID
	if v, ok := s.byRequest.Load(key); ok {
		return v.(*Ride), nil
	}
	est, err := s.Estimate(pickup, drop, t)
	if err != nil {
		return nil, err
	}
	fresh := &Ride{ID: newID(), RiderID: riderID, Pickup: pickup, Drop: drop, Type: t, Estimate: est}
	if v, loaded := s.byRequest.LoadOrStore(key, fresh); loaded { // atomic: of two racing copies, exactly one wins
		return v.(*Ride), nil
	}
	s.rides.Store(fresh.ID, fresh)
	fresh.setCandidates(s.matching.Rank(s.index.Near(pickup, t, searchRadiusKm)))
	s.dispatch(fresh)
	return fresh, nil
}

func (s *RideService) Cancel(rideID, riderID string) error {
	r, err := s.ownedRide(rideID, riderID)
	if err != nil {
		return err
	}
	return s.emit(r.cancel(ByRider))
}

func (s *RideService) RateDriver(rideID, riderID string, stars int) error {
	if stars < 1 || stars > 5 {
		return errors.New("stars must be 1 to 5")
	}
	r, err := s.ownedRide(rideID, riderID)
	if err != nil {
		return err
	}
	d, err := r.driverToRate()
	if err != nil {
		return err
	}
	return d.Rate(stars)
}

// ---- driver responses

func (s *RideService) Accept(rideID, driverID string) error {
	r, err := s.ride(rideID)
	if err != nil {
		return err
	}
	return s.emit(r.accept(driverID, s.now().UnixMilli()))
}

func (s *RideService) Decline(rideID, driverID string) error {
	r, err := s.ride(rideID)
	if err != nil {
		return err
	}
	s.retryIfWithdrawn(r, driverID)
	return nil
}

func (s *RideService) Arrived(rideID, driverID string) error {
	r, err := s.ride(rideID)
	if err != nil {
		return err
	}
	return s.emit(r.arrived(driverID))
}

func (s *RideService) Start(rideID, driverID string) error {
	r, err := s.ride(rideID)
	if err != nil {
		return err
	}
	return s.emit(r.start(driverID))
}

func (s *RideService) Complete(rideID, driverID string, actual TripMetrics) error {
	r, err := s.ride(rideID)
	if err != nil {
		return err
	}
	fare, err := s.pricing.Price(r.Type, actual, r.Estimate.SurgePercent) // surge locked at request time
	if err != nil {
		return err
	}
	if err := s.emit(r.complete(driverID, fare)); err != nil { // fails if not InProgress
		return err
	}
	return s.payments.Charge(r.ID, r.RiderID, fare.Total) // ride id = idempotency key
}

// ---- dispatch

func (s *RideService) dispatch(r *Ride) {
	e, ok := r.offerNext()
	if !ok {
		return // the rider cancelled meanwhile
	}
	s.publish(e) // Offered (to the driver) or Cancelled (NoDriver)
	if e.Status == Offered {
		s.after(offerTimeout, func() { s.retryIfWithdrawn(r, e.DriverID) })
	}
}

func (s *RideService) retryIfWithdrawn(r *Ride, driverID string) {
	if r.withdrawOffer(driverID) { // false if accepted, cancelled or already withdrawn
		s.dispatch(r)
	}
}

func (s *RideService) emit(e RideEvent, err error) error {
	if err == nil {
		s.publish(e)
	}
	return err
}

func (s *RideService) publish(e RideEvent) { // always called after the ride's mutex is released
	s.mu.RLock()
	ls := slices.Clone(s.listeners)
	s.mu.RUnlock()
	for _, l := range ls {
		func() {
			defer func() { recover() }() // log; one listener must not break the others
			l.OnEvent(e)
		}()
	}
}

func (s *RideService) ownedRide(rideID, riderID string) (*Ride, error) {
	r, err := s.ride(rideID)
	if err != nil {
		return nil, err
	}
	if r.RiderID != riderID {
		return nil, fmt.Errorf("ride %s is not yours", rideID)
	}
	return r, nil
}

func (s *RideService) ride(id string) (*Ride, error) {
	if v, ok := s.rides.Load(id); ok {
		return v.(*Ride), nil
	}
	return nil, fmt.Errorf("unknown ride %s", id)
}

func (s *RideService) driver(id string) (*Driver, error) {
	if v, ok := s.drivers.Load(id); ok {
		return v.(*Driver), nil
	}
	return nil, fmt.Errorf("unknown driver %s", id)
}

func newID() string {
	b := make([]byte, 16)
	rand.Read(b) // crypto/rand
	return hex.EncodeToString(b)
}`,

"Ride: one lock per ride": `type CancelReason int

const (
	ByRider CancelReason = iota + 1
	ByDriver
	NoDriver
)

type RideEvent struct {
	RideID, RiderID, DriverID string
	Status                    RideStatus
}

type Ride struct {
	ID, RiderID  string
	Pickup, Drop Location
	Type         RideType
	Estimate     FareBreakdown // quoted at request time; its surge is locked in

	mu           sync.Mutex // guards everything below
	status       RideStatus
	driver       *Driver
	candidates   []Candidate
	finalFare    FareBreakdown
	cancelReason CancelReason
	rated        bool
}

func (r *Ride) Status() RideStatus {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.status
}

func (r *Ride) CancelReason() CancelReason {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.cancelReason
}

func (r *Ride) setCandidates(ranked []Candidate) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.candidates = ranked
}

// offerNext claims the next free candidate and offers them the ride.
// ok is false if the ride stopped searching meanwhile (the rider cancelled).
func (r *Ride) offerNext() (RideEvent, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.status != Requested {
		return RideEvent{}, false
	}
	for len(r.candidates) > 0 {
		d := r.candidates[0].Driver
		r.candidates = r.candidates[1:]
		if d.TryClaim() { // CAS; if another ride got d first, try the next one
			r.driver = d
			e, err := r.moveTo(Offered)
			return e, err == nil
		}
	}
	r.cancelReason = NoDriver
	e, err := r.moveTo(Cancelled)
	return e, err == nil
}

func (r *Ride) accept(driverID string, nowMillis int64) (RideEvent, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if err := r.requireDriver(driverID, Offered); err != nil {
		return RideEvent{}, err
	}
	r.driver.StartTrip(nowMillis) // Offered -> OnTrip; this ride holds the claim
	return r.moveTo(Accepted)
}

// withdrawOffer handles a decline or a timeout. False if the offer is no longer live.
func (r *Ride) withdrawOffer(driverID string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.status != Offered || r.driver.ID != driverID {
		return false // already accepted, cancelled or withdrawn
	}
	r.driver.Release() // Offered -> Available
	r.driver = nil
	_, err := r.moveTo(Requested)
	return err == nil
}

func (r *Ride) arrived(driverID string) (RideEvent, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if err := r.requireDriver(driverID, Accepted); err != nil {
		return RideEvent{}, err
	}
	return r.moveTo(DriverArrived)
}

func (r *Ride) start(driverID string) (RideEvent, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if err := r.requireDriver(driverID, DriverArrived); err != nil {
		return RideEvent{}, err
	}
	return r.moveTo(InProgress)
}

func (r *Ride) complete(driverID string, fare FareBreakdown) (RideEvent, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if err := r.requireDriver(driverID, InProgress); err != nil {
		return RideEvent{}, err
	}
	r.finalFare = fare
	r.driver.EndTrip() // OnTrip -> Available
	return r.moveTo(Completed)
}

func (r *Ride) cancel(reason CancelReason) (RideEvent, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	was := r.status
	e, err := r.moveTo(Cancelled) // fails once the trip has started, or if already over
	if err != nil {
		return e, err
	}
	r.cancelReason = reason
	if was == Offered {
		r.driver.Release()
	} else if r.driver != nil {
		r.driver.EndTrip()
	}
	return e, nil
}

// driverToRate allows one rating per completed ride.
func (r *Ride) driverToRate() (*Driver, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.status != Completed || r.rated {
		return nil, fmt.Errorf("ride %s cannot be rated now", r.ID)
	}
	r.rated = true
	return r.driver, nil
}

func (r *Ride) moveTo(next RideStatus) (RideEvent, error) { // the only place status changes; caller holds mu
	if !r.status.CanMoveTo(next) {
		return RideEvent{}, fmt.Errorf("ride %s: %v -> %v is not allowed", r.ID, r.status, next)
	}
	r.status = next
	e := RideEvent{RideID: r.ID, RiderID: r.RiderID, Status: next}
	if r.driver != nil {
		e.DriverID = r.driver.ID
	}
	return e, nil
}

func (r *Ride) requireDriver(driverID string, expected RideStatus) error {
	if r.status != expected || r.driver == nil || r.driver.ID != driverID {
		return fmt.Errorf("ride %s is %v; driver %s cannot do that now", r.ID, r.status, driverID)
	}
	return nil
}`,

"Drivers and the grid index": `type DriverStatus int32

const (
	DriverOffline DriverStatus = iota
	DriverAvailable
	DriverOffered
	DriverOnTrip
)

type Driver struct {
	ID      string
	Vehicle Vehicle

	status       atomic.Int32             // a DriverStatus, changed only by compare-and-swap
	loc          atomic.Pointer[Location] // written by GPS pings, read by matching: no lock needed
	lastAssigned atomic.Int64             // unix millis, for fair matching

	mu                     sync.Mutex // guards the rating
	ratingSum, ratingCount int64

	pingMu  sync.Mutex // serialises this driver's pings; matching never takes it
	cell    Cell       // guarded by pingMu
	indexed bool       // guarded by pingMu
}

func NewDriver(id string, v Vehicle, start Location) *Driver {
	d := &Driver{ID: id, Vehicle: v}
	d.loc.Store(&start)
	return d
}

func (d *Driver) Status() DriverStatus { return DriverStatus(d.status.Load()) }
func (d *Driver) Location() Location   { return *d.loc.Load() }
func (d *Driver) MoveTo(l Location)    { d.loc.Store(&l) }

func (d *Driver) cas(from, to DriverStatus) bool { return d.status.CompareAndSwap(int32(from), int32(to)) }

func (d *Driver) GoOnline() bool  { return d.cas(DriverOffline, DriverAvailable) }
func (d *Driver) GoOffline() bool { return d.cas(DriverAvailable, DriverOffline) }

// TryClaim: of all the rides racing for this driver, exactly one call returns true.
func (d *Driver) TryClaim() bool { return d.cas(DriverAvailable, DriverOffered) }
func (d *Driver) Release() bool  { return d.cas(DriverOffered, DriverAvailable) }
func (d *Driver) EndTrip() bool  { return d.cas(DriverOnTrip, DriverAvailable) }

func (d *Driver) StartTrip(nowMillis int64) bool {
	if !d.cas(DriverOffered, DriverOnTrip) {
		return false
	}
	d.lastAssigned.Store(nowMillis)
	return true
}

func (d *Driver) Rate(stars int) error {
	if stars < 1 || stars > 5 {
		return errors.New("stars must be 1 to 5")
	}
	d.mu.Lock()
	defer d.mu.Unlock()
	d.ratingSum += int64(stars)
	d.ratingCount++
	return nil
}

func (d *Driver) Rating() float64 {
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.ratingCount == 0 {
		return 5.0
	}
	return float64(d.ratingSum) / float64(d.ratingCount)
}

type Cell struct{ X, Y int64 }

const (
	cellDegrees = 0.01 // about 1.1 km north to south
	cellKm      = 1.1
)

func CellOf(l Location) Cell {
	return Cell{int64(math.Floor(l.Lat / cellDegrees)), int64(math.Floor(l.Lng / cellDegrees))}
}

// Candidate is what matching needs about a driver, read once so that sorting sees stable values.
type Candidate struct {
	Driver       *Driver
	Km, Rating   float64
	LastAssigned int64
}

// DriverIndex: mu guards cells. A ping that stays in its cell never touches mu, so the frequent
// updates never block matching; only a change of cell takes the write lock, briefly.
type DriverIndex struct {
	mu    sync.RWMutex
	cells map[Cell]map[*Driver]struct{}
}

func NewDriverIndex() *DriverIndex { return &DriverIndex{cells: map[Cell]map[*Driver]struct{}{}} }

func (ix *DriverIndex) Update(d *Driver, loc Location) {
	d.pingMu.Lock()
	defer d.pingMu.Unlock()
	d.MoveTo(loc)
	now := CellOf(loc)
	if d.indexed && d.cell == now {
		return // the common case: same cell, no shared lock at all
	}
	ix.mu.Lock()
	if ix.cells[now] == nil {
		ix.cells[now] = map[*Driver]struct{}{}
	}
	ix.cells[now][d] = struct{}{}
	if d.indexed {
		delete(ix.cells[d.cell], d)
	}
	ix.mu.Unlock()
	d.cell, d.indexed = now, true
}

func (ix *DriverIndex) Remove(d *Driver) {
	d.pingMu.Lock()
	defer d.pingMu.Unlock()
	if !d.indexed {
		return
	}
	ix.mu.Lock()
	delete(ix.cells[d.cell], d)
	ix.mu.Unlock()
	d.indexed = false
}

// Near returns available drivers of a ride type within radiusKm of p, scanning the cells around p.
func (ix *DriverIndex) Near(p Location, t RideType, radiusKm float64) []Candidate {
	c := CellOf(p)
	r := int64(math.Ceil(radiusKm / cellKm))
	var drivers []*Driver
	ix.mu.RLock()
	for dx := -r; dx <= r; dx++ {
		for dy := -r; dy <= r; dy++ {
			for d := range ix.cells[Cell{c.X + dx, c.Y + dy}] {
				drivers = append(drivers, d)
			}
		}
	}
	ix.mu.RUnlock()
	var out []Candidate
	for _, d := range drivers { // distances and ratings are read outside the index lock
		km := d.Location().DistanceKm(p)
		if d.Status() == DriverAvailable && d.Vehicle.Type == t && km <= radiusKm {
			out = append(out, Candidate{d, km, d.Rating(), d.lastAssigned.Load()})
		}
	}
	return out
}`,

"Pricing strategies": `type PricingStrategy interface {
	Price(t RideType, trip TripMetrics, surgePercent int) (FareBreakdown, error)
}

type RateCard struct{ Base, PerKm, PerMinute, Minimum int64 } // paise

// MeteredPricing: base + per km + per minute from a rate card per ride type, times surge; whole paise, half up.
// cards is never written after construction, so it is safe to share between goroutines.
type MeteredPricing struct{ cards map[RideType]RateCard }

func NewMeteredPricing(cards map[RideType]RateCard) *MeteredPricing {
	return &MeteredPricing{cards: maps.Clone(cards)}
}

func (p *MeteredPricing) Price(t RideType, trip TripMetrics, surgePercent int) (FareBreakdown, error) {
	c, ok := p.cards[t]
	if !ok {
		return FareBreakdown{}, fmt.Errorf("no rate card for ride type %d", t)
	}
	distance := halfUp(trip.Meters*c.PerKm, 1000)
	minutes := halfUp(trip.Seconds*c.PerMinute, 60)
	total := max(c.Minimum, halfUp((c.Base+distance+minutes)*int64(surgePercent), 100))
	return FareBreakdown{c.Base, distance, minutes, surgePercent, total}, nil
}

// halfUp divides and rounds half up; inputs are never negative.
func halfUp(numerator, divisor int64) int64 { return (numerator + divisor/2) / divisor }

// FlatRatePricing: a fixed price per ride type, e.g. airport transfers; ignores distance, time and surge.
type FlatRatePricing struct{ fares map[RideType]int64 }

func NewFlatRatePricing(fares map[RideType]int64) *FlatRatePricing {
	return &FlatRatePricing{fares: maps.Clone(fares)}
}

func (p *FlatRatePricing) Price(t RideType, _ TripMetrics, _ int) (FareBreakdown, error) {
	fare, ok := p.fares[t]
	if !ok {
		return FareBreakdown{}, fmt.Errorf("no flat fare for ride type %d", t)
	}
	return FareBreakdown{Base: fare, SurgePercent: 100, Total: fare}, nil
}

type SurgeProvider interface{ SurgePercentAt(pickup Location) int } // 100 means no surge
type RouteEstimator interface{ Estimate(from, to Location) TripMetrics }

// StraightLineEstimator: straight-line distance padded by 30% for real roads, at an average city speed of 25 km/h.
type StraightLineEstimator struct{}

func (StraightLineEstimator) Estimate(from, to Location) TripMetrics {
	meters := int64(math.Round(from.DistanceKm(to) * 1300))
	return TripMetrics{meters, meters * 3600 / 25_000}
}`,

"Matching strategies": `type MatchingStrategy interface {
	Rank(cs []Candidate) []Candidate // best first
}

type NearestDriver struct{}

func (NearestDriver) Rank(cs []Candidate) []Candidate {
	out := slices.Clone(cs)
	slices.SortStableFunc(out, func(a, b Candidate) int { return cmp.Compare(a.Km, b.Km) })
	return out
}

type HighestRated struct{}

func (HighestRated) Rank(cs []Candidate) []Candidate {
	out := slices.Clone(cs)
	slices.SortStableFunc(out, func(a, b Candidate) int {
		return cmp.Or(cmp.Compare(b.Rating, a.Rating), cmp.Compare(a.Km, b.Km))
	})
	return out
}

// LeastRecentlyAssigned spreads work: the driver who has waited longest since their last ride goes first.
type LeastRecentlyAssigned struct{}

func (LeastRecentlyAssigned) Rank(cs []Candidate) []Candidate {
	out := slices.Clone(cs)
	slices.SortStableFunc(out, func(a, b Candidate) int {
		return cmp.Or(cmp.Compare(a.LastAssigned, b.LastAssigned), cmp.Compare(a.Km, b.Km))
	})
	return out
}

// WeightedScore blends distance, rating and idle time into one score; lower is better.
// Weights come from configuration.
type WeightedScore struct {
	PerKm, PerRatingPoint, PerIdleMinute float64
	Now                                  func() time.Time
}

func (w WeightedScore) Rank(cs []Candidate) []Candidate {
	now := w.Now().UnixMilli() // one "now" for the whole sort
	out := slices.Clone(cs)
	slices.SortStableFunc(out, func(a, b Candidate) int { return cmp.Compare(w.score(a, now), w.score(b, now)) })
	return out
}

func (w WeightedScore) score(c Candidate, now int64) float64 {
	idleMinutes := min(float64(now-c.LastAssigned)/60_000, 60) // idle beyond an hour adds nothing
	return c.Km*w.PerKm - c.Rating*w.PerRatingPoint - idleMinutes*w.PerIdleMinute
}`,

"Stress test: one driver, many riders": `func TestADriverIsNeverClaimedTwice(t *testing.T) {
	d := NewDriver("d1", Vehicle{"KA01AB1234", "Swift", Mini}, Location{12.97, 77.59})
	d.GoOnline()
	var winners atomic.Int32
	var wg sync.WaitGroup
	start := make(chan struct{})
	for range 16 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start // release every goroutine at once
			if d.TryClaim() {
				winners.Add(1)
			}
		}()
	}
	close(start)
	wg.Wait()
	if winners.Load() != 1 || d.Status() != DriverOffered {
		t.Fatalf("winners = %d, status = %d; want exactly one claim", winners.Load(), d.Status())
	}
}`,

"Every illegal transition is rejected": `func TestOnlyTableTransitionsAreAllowed(t *testing.T) {
	legal := map[[2]RideStatus]bool{
		{Requested, Offered}: true, {Requested, Cancelled}: true,
		{Offered, Accepted}: true, {Offered, Requested}: true, {Offered, Cancelled}: true,
		{Accepted, DriverArrived}: true, {Accepted, Cancelled}: true,
		{DriverArrived, InProgress}: true, {DriverArrived, Cancelled}: true,
		{InProgress, Completed}: true,
	}
	for from := Requested; from <= Cancelled; from++ {
		for to := Requested; to <= Cancelled; to++ {
			if got := from.CanMoveTo(to); got != legal[[2]RideStatus{from, to}] {
				t.Errorf("%v -> %v: CanMoveTo = %v", from, to, got)
			}
		}
	}
}`,

"Ride sharing in one screen": `type PricingStrategy interface { // paise
	Price(t RideType, trip TripMetrics, surgePercent int) (FareBreakdown, error)
}
type MatchingStrategy interface{ Rank(cs []Candidate) []Candidate } // best first

type Driver struct {
	status atomic.Int32             // Available -> Offered only by CompareAndSwap (TryClaim)
	loc    atomic.Pointer[Location] // pings never lock
}

type Ride struct {
	mu         sync.Mutex // guards status, driver, candidates
	status     RideStatus
	driver     *Driver
	candidates []Candidate
}

func (r *Ride) offerNext() (RideEvent, bool)                          // CAS next free candidate; none left -> Cancelled(NoDriver)
func (r *Ride) accept(driverID string, now int64) (RideEvent, error)
func (r *Ride) withdrawOffer(driverID string) bool                    // decline or timeout; false if stale
func (r *Ride) moveTo(next RideStatus) (RideEvent, error)             // the only status change; checks the table

// RideService (built once, passed around): RequestRide does LoadOrStore on riderID:requestID, ranks, dispatches;
// dispatch = offerNext, publish, after(15s) -> withdrawOffer.
// Complete prices the actual trip with the locked surge, then Charge(rideID as idempotency key).`,

"Surge from demand and supply": `// DemandSupplySurge: demand = open requests in a cell, supply = available drivers there.
// A scheduler rebuilds the whole table and swaps it in with one atomic store; readers never lock.
type DemandSupplySurge struct {
	snapshot atomic.Pointer[map[Cell]int] // the map is never modified after it is stored
}

const (
	maxSurgePercent    = 300
	sensitivityPercent = 50
)

func (s *DemandSupplySurge) SurgePercentAt(pickup Location) int {
	if m := s.snapshot.Load(); m != nil {
		if v, ok := (*m)[CellOf(pickup)]; ok {
			return v
		}
	}
	return 100
}

func (s *DemandSupplySurge) Recompute(openRequests, availableDrivers map[Cell]int) {
	next := make(map[Cell]int, len(openRequests))
	for cell, demand := range openRequests {
		next[cell] = surgePercent(demand, availableDrivers[cell])
	}
	s.snapshot.Store(&next)
}

func surgePercent(demand, supply int) int {
	if demand <= supply {
		return 100
	}
	if supply == 0 {
		return maxSurgePercent
	}
	raw := 100 + (demand*100/supply-100)*sensitivityPercent/100
	return (min(maxSurgePercent, raw) + 5) / 10 * 10 // shown to riders in 0.1x steps
}`,

"Final fare: upfront price with a tolerance": `const tolerancePercent = 15

// FinalFare: riders pay the quoted price unless the trip really changed (a detour, a new drop, a long jam).
func FinalFare(p PricingStrategy, r *Ride, actual TripMetrics) (FareBreakdown, error) {
	metered, err := p.Price(r.Type, actual, r.Estimate.SurgePercent)
	if err != nil {
		return FareBreakdown{}, err
	}
	quoted := r.Estimate.Total
	diff := metered.Total - quoted
	if diff < 0 {
		diff = -diff
	}
	if diff*100 <= quoted*tolerancePercent { // integer maths, no drift
		return r.Estimate, nil
	}
	return metered, nil
}

// The only change in RideService.Complete:  fare, err := FinalFare(s.pricing, r, actual)`,

"Broadcast mode: open requests and the first claim wins": `// On Ride: the first driver to tap claims the ride, if it is still searching and they are still free.
func (r *Ride) claim(d *Driver, nowMillis int64) (RideEvent, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.status != Requested { // another driver won, or the rider cancelled
		return RideEvent{}, false
	}
	if !d.TryClaim() { // this driver is busy with another ride
		return RideEvent{}, false
	}
	r.driver = d
	r.moveTo(Offered) // the transition table stays the one rulebook
	d.StartTrip(nowMillis)
	e, _ := r.moveTo(Accepted)
	return e, true
}

// On RideService: open is a sync.Map of broadcast rides still searching (ride id -> *Ride).

// OpenRequestsNear is what a driver's app lists: open rides of their type within the radius, nearest first.
func (s *RideService) OpenRequestsNear(driverID string) ([]*Ride, error) {
	d, err := s.driver(driverID)
	if err != nil {
		return nil, err
	}
	at := d.Location() // read once, so the sort sees one stable point
	var out []*Ride
	s.open.Range(func(_, v any) bool {
		if r := v.(*Ride); r.Type == d.Vehicle.Type && r.Pickup.DistanceKm(at) <= searchRadiusKm {
			out = append(out, r)
		}
		return true
	})
	slices.SortFunc(out, func(a, b *Ride) int { return cmp.Compare(a.Pickup.DistanceKm(at), b.Pickup.DistanceKm(at)) })
	return out, nil
}

func (s *RideService) Claim(rideID, driverID string) error {
	r, err := s.ride(rideID)
	if err != nil {
		return err
	}
	d, err := s.driver(driverID)
	if err != nil {
		return err
	}
	e, ok := r.claim(d, s.now().UnixMilli())
	if !ok {
		return fmt.Errorf("ride %s is no longer available", rideID) // the app shows "taken"
	}
	s.open.Delete(rideID)
	s.publish(e)
	return nil
}`,

"Live tracking: forward the assigned driver's pings to the rider": `type LocationUpdate struct {
	RideID, RiderID string
	DriverAt        Location
	ETASeconds      int64
}

type TrackingListener interface{ OnLocation(u LocationUpdate) } // e.g. pushes to the rider's app over a WebSocket

const minTrackingInterval = 2 * time.Second

type tracked struct {
	ride       *Ride
	lastSentAt atomic.Int64 // unix millis of the last update sent for this ride
}

// RideTracker forwards an assigned driver's pings to the rider, at most one update every two seconds per ride.
type RideTracker struct {
	byDriver  sync.Map // driver id -> *tracked
	mu        sync.RWMutex
	listeners []TrackingListener // guarded by mu
	routes    RouteEstimator
	now       func() time.Time
}

func (t *RideTracker) AddListener(l TrackingListener) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.listeners = append(t.listeners, l)
}

func (t *RideTracker) Start(r *Ride, driverID string) { t.byDriver.Store(driverID, &tracked{ride: r}) } // on Accepted
func (t *RideTracker) Stop(driverID string)           { t.byDriver.Delete(driverID) }                 // on Completed or Cancelled

// OnPing is called from UpdateLocation on every ping; the hot path takes no lock.
func (t *RideTracker) OnPing(driverID string, at Location) {
	v, ok := t.byDriver.Load(driverID)
	if !ok {
		return // not on a ride: nothing to track
	}
	tr := v.(*tracked)
	now, prev := t.now().UnixMilli(), tr.lastSentAt.Load()
	if now-prev < minTrackingInterval.Milliseconds() || !tr.lastSentAt.CompareAndSwap(prev, now) {
		return // throttled, or another ping won
	}
	target := tr.ride.Pickup // to the pickup, then to the drop
	if tr.ride.Status() == InProgress {
		target = tr.ride.Drop
	}
	u := LocationUpdate{tr.ride.ID, tr.ride.RiderID, at, t.routes.Estimate(at, target).Seconds}
	t.mu.RLock()
	ls := slices.Clone(t.listeners)
	t.mu.RUnlock()
	for _, l := range ls {
		l.OnLocation(u)
	}
}

// Wiring in RideService:
//   UpdateLocation: s.index.Update(d, at); s.tracker.OnPing(driverID, at)
//   Accept (or Claim): s.tracker.Start(r, driverID)    Complete or Cancel: s.tracker.Stop(driverID)`,

"Payment with a status, charged once per ride": `type PaymentStatus int

const (
	PaymentPending PaymentStatus = iota
	PaymentSucceeded
	PaymentFailed
)

var ErrDeclined = errors.New("payment declined")

type Payment struct {
	RideID, RiderID string
	Amount          int64 // paise

	mu       sync.Mutex // guards status and attempts
	status   PaymentStatus
	attempts int
}

func (p *Payment) Status() PaymentStatus {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.status
}

// Attempt runs one attempt at a time; a success is final. Holding the lock during the call only delays retries of this ride.
func (p *Payment) Attempt(g PaymentGateway) (PaymentStatus, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.status == PaymentSucceeded {
		return p.status, nil
	}
	p.attempts++
	err := g.Charge(p.RideID, p.RiderID, p.Amount) // ride id = idempotency key: a retry cannot charge twice
	switch {
	case err == nil:
		p.status = PaymentSucceeded
	case errors.Is(err, ErrDeclined):
		p.status = PaymentFailed // the ride stays Completed; the debt is retried later
	default:
		return p.status, err // a timeout leaves it Pending: retrying is safe
	}
	return p.status, nil
}

type PaymentService struct {
	byRide  sync.Map // ride id -> *Payment
	gateway PaymentGateway
}

// Charge keeps exactly one Payment per ride, however many times it is called.
func (s *PaymentService) Charge(r *Ride, amount int64) (*Payment, error) {
	v, _ := s.byRide.LoadOrStore(r.ID, &Payment{RideID: r.ID, RiderID: r.RiderID, Amount: amount})
	p := v.(*Payment)
	_, err := p.Attempt(s.gateway)
	return p, err
}

func (s *PaymentService) Failed() []*Payment {
	var out []*Payment
	s.byRide.Range(func(_, v any) bool {
		if p := v.(*Payment); p.Status() == PaymentFailed {
			out = append(out, p)
		}
		return true
	})
	return out
}

// In RideService.Complete, replace the direct gateway call with: s.paymentService.Charge(r, fare.Total)`,

"Cancellation fees as a policy": `type CancellationPolicy interface {
	FeeFor(status RideStatus, who CancelReason, sinceAccepted time.Duration) (int64, error) // paise
}

// GracePeriodPolicy: free until the driver has been on the way for a grace period,
// a flat fee after that, more once they have arrived.
type GracePeriodPolicy struct{}

const (
	cancelGrace = 2 * time.Minute
	cancelFee   = 50_00 // paise
	arrivedFee  = 75_00
)

func (GracePeriodPolicy) FeeFor(status RideStatus, who CancelReason, sinceAccepted time.Duration) (int64, error) {
	if who != ByRider {
		return 0, nil // drivers and the system never charge riders
	}
	switch status {
	case Requested, Offered:
		return 0, nil
	case Accepted:
		if sinceAccepted <= cancelGrace {
			return 0, nil
		}
		return cancelFee, nil
	case DriverArrived:
		return arrivedFee, nil
	default:
		return 0, fmt.Errorf("cannot cancel a ride that is %v", status)
	}
}

// Inside Ride.cancel, holding r.mu, before moveTo(Cancelled):
//   fee, err := policy.FeeFor(r.status, reason, sinceAccepted)`,

"A driver backs out: back to searching": `// The table gains one row:  Accepted: {DriverArrived, Requested, Cancelled},

// On Ride: offerNo int, guarded by mu. offerNext increments it and puts it on the Offered event;
// the timer passes it back, so an old timer can never withdraw a newer offer to the same driver.

func (r *Ride) driverBacksOut(driverID string, fresh []Candidate) (RideEvent, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if err := r.requireDriver(driverID, Accepted); err != nil {
		return RideEvent{}, err
	}
	r.driver.EndTrip() // OnTrip -> Available
	r.driver = nil
	r.candidates = slices.DeleteFunc(fresh, func(c Candidate) bool {
		return c.Driver.ID == driverID // never re-offer the driver who left
	})
	return r.moveTo(Requested)
}

func (r *Ride) withdrawOffer(driverID string, offer int) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.status != Offered || offer != r.offerNo || r.driver.ID != driverID {
		return false
	}
	r.driver.Release()
	r.driver = nil
	_, err := r.moveTo(Requested)
	return err == nil
}

// On RideService
func (s *RideService) DriverCancel(rideID, driverID string) error {
	r, err := s.ride(rideID)
	if err != nil {
		return err
	}
	fresh := s.matching.Rank(s.index.Near(r.Pickup, r.Type, searchRadiusKm))
	if err := s.emit(r.driverBacksOut(driverID, fresh)); err != nil {
		return err
	}
	s.dispatch(r) // a new offer, a new number, a new timer
	return nil
}`
} };
