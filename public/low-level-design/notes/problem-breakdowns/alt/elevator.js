// Go versions of the Elevator code blocks, matched to the Java blocks by title. Imports are omitted.
window.ALT = window.ALT || {};
ALT["elevator"] = { go: {
"Request and its type": `type Direction int

const (
	Idle Direction = iota
	Up
	Down
)

// RequestType: hall calls carry the direction the caller wants; a destination is pressed inside the car.
type RequestType int

const (
	PickupUp RequestType = iota
	PickupDown
	Destination
)

// Request is a comparable struct, so it can be a map key: two requests are equal when floor and type match.
type Request struct {
	Floor int
	Type  RequestType
}`,

"Final class design": `type ElevatorController struct {
	elevators []*Elevator // three cars, created once
	dispatch  DispatchStrategy
	mu        sync.Mutex // makes choosing a car and adding the stop one step
}

func (c *ElevatorController) RequestElevator(floor int, t RequestType) bool // hall call; false if invalid
func (c *ElevatorController) SelectFloor(elevatorID, floor int) bool       // destination button inside a car
func (c *ElevatorController) Step()                                         // advance every car one tick

type Elevator struct {
	ID           int
	mu           sync.Mutex
	currentFloor int                  // 0..9
	direction    Direction            // Up, Down or Idle
	requests     map[Request]struct{} // a set: the stops it owes, each with its reason
}

func (e *Elevator) AddRequest(r Request) bool
func (e *Elevator) Step()
func (e *Elevator) CurrentFloor() int
func (e *Elevator) Direction() Direction
func (e *Elevator) IsCommittedTo(floor int, dir Direction) bool // used by dispatch

type DispatchStrategy interface {
	Choose(cars []*Elevator, call Request) *Elevator
}`,

"ElevatorController": `const Cars = 3

type ElevatorController struct {
	elevators []*Elevator // never changes after construction
	dispatch  DispatchStrategy
	mu        sync.Mutex // serialises hall calls so concurrent calls see each other's stops
}

func NewElevatorController(d DispatchStrategy) *ElevatorController {
	c := &ElevatorController{dispatch: d}
	for i := range Cars {
		c.elevators = append(c.elevators, NewElevator(i))
	}
	return c
}

// RequestElevator is a hall button: validate, choose a car, add the stop, as one step.
func (c *ElevatorController) RequestElevator(floor int, t RequestType) bool {
	if !IsValidFloor(floor) || t == Destination { // hall calls only
		return false
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	call := Request{floor, t}
	return c.dispatch.Choose(c.elevators, call).AddRequest(call)
}

// SelectFloor is a destination button inside car elevatorID.
func (c *ElevatorController) SelectFloor(elevatorID, floor int) bool {
	if elevatorID < 0 || elevatorID >= Cars {
		return false
	}
	return c.elevators[elevatorID].AddRequest(Request{floor, Destination})
}

func (c *ElevatorController) Step() { // the simulation clock
	for _, e := range c.elevators {
		e.Step()
	}
}`,

"Dispatch: the nearest car": `type DispatchStrategy interface {
	Choose(cars []*Elevator, call Request) *Elevator
}

func distance(e *Elevator, floor int) int {
	d := e.CurrentFloor() - floor
	if d < 0 {
		return -d
	}
	return d
}

// NearestElevator is the simplest strategy: the closest car, whichever way it is going.
type NearestElevator struct{}

func (NearestElevator) Choose(cars []*Elevator, call Request) *Elevator {
	return slices.MinFunc(cars, func(a, b *Elevator) int {
		return cmp.Compare(distance(a, call.Floor), distance(b, call.Floor))
	})
}`,

"Dispatch: committed cars first": `// CommittedFirst picks a car already sweeping toward the caller with a stop at or beyond them;
// else an idle car; else the closest car.
type CommittedFirst struct{}

func (CommittedFirst) Choose(cars []*Elevator, call Request) *Elevator {
	want := Down
	if call.Type == PickupUp {
		want = Up
	}
	closest := func(keep func(*Elevator) bool) *Elevator {
		var best *Elevator
		for _, e := range cars {
			if keep(e) && (best == nil || distance(e, call.Floor) < distance(best, call.Floor)) {
				best = e
			}
		}
		return best
	}
	if e := closest(func(e *Elevator) bool { return e.IsCommittedTo(call.Floor, want) }); e != nil {
		return e
	}
	if e := closest(func(e *Elevator) bool { return e.Direction() == Idle }); e != nil {
		return e
	}
	return closest(func(*Elevator) bool { return true })
}`,

"Elevator": `const MinFloor, MaxFloor = 0, 9

func IsValidFloor(f int) bool { return f >= MinFloor && f <= MaxFloor }

type Elevator struct {
	ID int

	mu           sync.Mutex // guards everything below: button presses and the clock both reach a car
	currentFloor int        // every car starts on the ground floor
	direction    Direction
	requests     map[Request]struct{}
}

func NewElevator(id int) *Elevator { return &Elevator{ID: id, requests: map[Request]struct{}{}} }

func (e *Elevator) AddRequest(r Request) bool {
	if !IsValidFloor(r.Floor) { // reject, but don't panic
		return false
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	if r.Floor != e.currentFloor { // already here: nothing to do
		e.requests[r] = struct{}{} // a repeated press is the same key
	}
	return true
}

func (e *Elevator) Step() {
	e.mu.Lock()
	defer e.mu.Unlock()
	if len(e.requests) == 0 { // 1. nothing to do
		e.direction = Idle
		return
	}
	if e.direction == Idle { // 2. pick a direction
		e.direction = e.towardNearest()
	}
	pickup := PickupDown
	if e.direction == Up {
		pickup = PickupUp
	}
	here, dest := Request{e.currentFloor, pickup}, Request{e.currentFloor, Destination}
	_, a := e.requests[here]
	_, b := e.requests[dest]
	if a || b { // 3. stop, don't move
		delete(e.requests, here)
		delete(e.requests, dest)
		if len(e.requests) == 0 {
			e.direction = Idle
		}
		return
	}
	if !e.hasRequestsAhead(e.direction) { // 4. turn, don't move
		if e.direction == Up {
			e.direction = Down
		} else {
			e.direction = Up
		}
		return
	}
	if e.direction == Up { // 5. move
		e.currentFloor++
	} else {
		e.currentFloor--
	}
}

// hasRequestsAhead counts every type: the car travels toward every stop, even ones it won't stop for yet.
func (e *Elevator) hasRequestsAhead(dir Direction) bool {
	for r := range e.requests {
		if (dir == Up && r.Floor > e.currentFloor) || (dir == Down && r.Floor < e.currentFloor) {
			return true
		}
	}
	return false
}

// towardNearest breaks ties toward the lower floor, so the choice never depends on map order.
func (e *Elevator) towardNearest() Direction {
	best, bestD := -1, 0
	for r := range e.requests {
		d := r.Floor - e.currentFloor
		if d < 0 {
			d = -d
		}
		if best < 0 || d < bestD || (d == bestD && r.Floor < best) {
			best, bestD = r.Floor, d
		}
	}
	if best > e.currentFloor {
		return Up
	}
	return Down
}

func (e *Elevator) CurrentFloor() int {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.currentFloor
}

func (e *Elevator) Direction() Direction {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.direction
}

// IsCommittedTo: sweeping in dir toward floor, with a matching stop at or beyond it.
func (e *Elevator) IsCommittedTo(floor int, dir Direction) bool {
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.direction != dir || (dir == Up && e.currentFloor > floor) || (dir == Down && e.currentFloor < floor) {
		return false
	}
	pickup := PickupDown
	if dir == Up {
		pickup = PickupUp
	}
	for r := range e.requests {
		beyond := (dir == Up && r.Floor >= floor) || (dir == Down && r.Floor <= floor)
		if beyond && (r.Type == Destination || r.Type == pickup) {
			return true
		}
	}
	return false
}`,

"Elevator in one screen": `type Request struct {
	Floor int
	Type  RequestType // PickupUp, PickupDown, Destination
}

func (c *ElevatorController) RequestElevator(floor int, t RequestType) bool // validate, choose car, AddRequest
func (c *ElevatorController) SelectFloor(elevatorID, floor int) bool       // Destination on that car
func (c *ElevatorController) Step()                                         // every car steps once

type Elevator struct {
	mu           sync.Mutex
	currentFloor int
	direction    Direction
	requests     map[Request]struct{} // guarded by mu
}

func (e *Elevator) AddRequest(r Request) bool // bad floor false; current floor no-op; else add
func (e *Elevator) Step() // empty: Idle | idle: toward nearest | stop here: remove, no move
// | nothing ahead: turn, no move | else move one floor
// DispatchStrategy: committed car, else idle car, else nearest`,

"Two sorted sets: next stop in O(log n)": `// Go has no TreeSet: a sorted slice without duplicates, searched with slices.BinarySearch, plays its role.
type sortedSet []int

func (s *sortedSet) add(f int) {
	if i, found := slices.BinarySearch(*s, f); !found {
		*s = slices.Insert(*s, i, f)
	}
}

func (s sortedSet) ceiling(f int) (int, bool) { // smallest >= f
	i, _ := slices.BinarySearch(s, f)
	if i < len(s) {
		return s[i], true
	}
	return 0, false
}

// On Elevator, guarded by mu: up and down replace the request set.
//   up, down sortedSet // both ascending; the next down-stop is the largest <= currentFloor

func (e *Elevator) AddRequest(r Request) bool {
	if !IsValidFloor(r.Floor) {
		return false
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	switch {
	case r.Floor == e.currentFloor:
	case r.Type == PickupUp:
		e.up.add(r.Floor)
	case r.Type == PickupDown:
		e.down.add(r.Floor)
	case r.Floor > e.currentFloor: // a destination joins the sweep that reaches it
		e.up.add(r.Floor)
	default:
		e.down.add(r.Floor)
	}
	return true
}

// nextGoingUp: an up-stop ahead, else the highest DOWN call above (go there, then turn); false means turn now.
func (e *Elevator) nextGoingUp() (int, bool) {
	if next, ok := e.up.ceiling(e.currentFloor); ok {
		return next, true
	}
	if n := len(e.down); n > 0 && e.down[n-1] > e.currentFloor {
		return e.down[n-1], true
	}
	return 0, false
}`,

"State classes for service, doors and maintenance": `// ElevatorState says what one tick means, once that depends on more than direction.
type ElevatorState interface {
	Tick(e *Elevator) ElevatorState
}

// InService runs the five cases from the solution, now reporting whether the car stopped at a floor.
type InService struct{}

func (s InService) Tick(e *Elevator) ElevatorState {
	if e.scanOneTick() {
		return &DoorsOpen{ticksLeft: 3}
	}
	return s
}

type DoorsOpen struct {
	ticksLeft int // touched only inside Step, with the car's mutex held
}

func (d *DoorsOpen) Tick(*Elevator) ElevatorState {
	d.ticksLeft--
	if d.ticksLeft > 0 {
		return d
	}
	return InService{}
}

type Maintenance struct{}

func (m Maintenance) Tick(*Elevator) ElevatorState {
	return m // ignores requests until an engineer resets it
}

// On Elevator, under e.mu: Step sets e.state = e.state.Tick(e);
// EnterMaintenance clears the requests and sets Maintenance{}; Reset sets InService{}.
// Dispatch skips a car whose state is Maintenance.`,

"Express cars: floors a car serves, and dispatch that respects them": `// On Elevator: the floors this car serves; nil means every floor. Never changed, so safe to read without the mutex.
//   servedFloors map[int]bool // e.g. {0: true, 5: true, 9: true} for the express car

func (e *Elevator) Serves(floor int) bool { return e.servedFloors == nil || e.servedFloors[floor] }

// In AddRequest, refuse floors the car doesn't serve:
//   if !IsValidFloor(r.Floor) || !e.Serves(r.Floor) { return false }

// ServedFloorsOnly wraps any strategy and only offers it the cars that serve the floor (a decorator).
type ServedFloorsOnly struct{ Inner DispatchStrategy }

func (s ServedFloorsOnly) Choose(cars []*Elevator, call Request) *Elevator {
	var able []*Elevator
	for _, e := range cars {
		if e.Serves(call.Floor) {
			able = append(able, e)
		}
	}
	return s.Inner.Choose(able, call)
}`,

"Cancelling a request": `// RemoveRequest is the inverse of AddRequest. Each request keeps its type, so cancelling a destination
// at 7 never drops an UP call that is also waiting at 7.
func (e *Elevator) RemoveRequest(r Request) bool {
	e.mu.Lock()
	defer e.mu.Unlock()
	if _, ok := e.requests[r]; !ok {
		return false // never there, or already served
	}
	delete(e.requests, r)
	return true
}`,

"Hand-off: callers enqueue, the car drains each tick": `// Callers only send on a buffered channel; the car's own goroutine drains it at the start of each tick,
// so only that goroutine ever touches the request set.
type Elevator struct {
	pending  chan Request                 // written by any goroutine
	snapshot atomic.Pointer[CarSnapshot] // what dispatch reads from other goroutines
	// currentFloor, direction, requests: touched only by Step
}

type CarSnapshot struct {
	Floor     int
	Direction Direction
}

func (e *Elevator) AddRequest(r Request) bool { // any goroutine
	if !IsValidFloor(r.Floor) {
		return false
	}
	select {
	case e.pending <- r:
		return true
	default:
		return false // queue full: tell the caller rather than block
	}
}

func (e *Elevator) Step() { // only this car's goroutine calls Step
	for drained := false; !drained; {
		select {
		case r := <-e.pending:
			if r.Floor != e.currentFloor {
				e.requests[r] = struct{}{}
			}
		default:
			drained = true
		}
	}
	e.scanOneTick() // the five cases from the solution
	e.snapshot.Store(&CarSnapshot{e.currentFloor, e.direction})
}`,

"A different request, a different dispatcher": `type TripRequest struct{ From, To int }

type DestinationDispatcher struct {
	mu   sync.Mutex
	cars []*Elevator
}

// Assign returns the ID of the car the passenger should take.
func (d *DestinationDispatcher) Assign(r TripRequest) int {
	d.mu.Lock()
	defer d.mu.Unlock()
	best := slices.MinFunc(d.cars, func(a, b *Elevator) int {
		return cmp.Compare(a.ExtraStopsFor(r.From, r.To), b.ExtraStopsFor(r.From, r.To))
	})
	pickup := PickupDown
	if r.To > r.From {
		pickup = PickupUp
	}
	best.AddRequest(Request{r.From, pickup})
	best.AddPendingDestination(r.From, r.To) // becomes a destination once the passenger boards
	return best.ID
}`
} };
