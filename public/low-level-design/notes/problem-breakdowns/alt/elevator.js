// Go versions of the Elevator code blocks, matched to the Java blocks by title. Imports are omitted.
window.ALT = window.ALT || {};
ALT["elevator"] = { go: {
"Public API": `func (c *ElevatorController) RequestElevator(floor int, dir Direction) // hall button
func (c *ElevatorController) SelectFloor(elevatorID, floor int)        // cabin button
func (c *ElevatorController) Tick()                                    // advance the simulation one step`,

"Elevator": `type Direction int

const (
	Idle Direction = iota
	Up
	Down
)

type Elevator struct {
	ID    int
	mu    sync.Mutex
	floor int
	dir   Direction
	stops []int // sorted, no duplicates: Go's stand-in for a TreeSet
}

func (e *Elevator) AddStop(f int) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if i, found := slices.BinarySearch(e.stops, f); !found {
		e.stops = slices.Insert(e.stops, i, f)
	}
	if e.dir == Idle {
		e.dir = Down
		if f >= e.floor {
			e.dir = Up
		}
	}
}

func (e *Elevator) Step() { // called once per tick
	e.mu.Lock()
	defer e.mu.Unlock()
	if len(e.stops) == 0 {
		e.dir = Idle
		return
	}
	next, ok := e.target()
	if !ok { // nothing ahead, reverse
		e.reverse()
		next, _ = e.target()
	}
	if next == e.floor { // doors open here
		i, _ := slices.BinarySearch(e.stops, next)
		e.stops = slices.Delete(e.stops, i, i+1)
		return
	}
	if next > e.floor {
		e.floor++
	} else {
		e.floor--
	}
}

// target is the nearest stop at or ahead of the current floor in the current direction.
func (e *Elevator) target() (int, bool) {
	i, found := slices.BinarySearch(e.stops, e.floor)
	switch {
	case e.dir == Up && i < len(e.stops): // ceiling
		return e.stops[i], true
	case e.dir == Up:
		return 0, false
	case found: // floor
		return e.stops[i], true
	case i > 0:
		return e.stops[i-1], true
	default:
		return 0, false
	}
}

func (e *Elevator) reverse() {
	if e.dir == Up {
		e.dir = Down
	} else {
		e.dir = Up
	}
}

func (e *Elevator) Cost(reqFloor int, reqDir Direction) int {
	e.mu.Lock()
	defer e.mu.Unlock()
	distance := abs(reqFloor - e.floor)
	if e.dir == Idle {
		return distance
	}
	onTheWay := e.dir == reqDir && ((e.dir == Up && reqFloor >= e.floor) || (e.dir == Down && reqFloor <= e.floor))
	if onTheWay {
		return distance
	}
	return distance + 100 // penalty if it must turn around first
}

func abs(x int) int {
	if x < 0 {
		return -x
	}
	return x
}`,

"ElevatorController": `type ElevatorController struct {
	elevators []*Elevator // elevator i has ID i
}

func (c *ElevatorController) RequestElevator(floor int, dir Direction) { // hall button
	best := c.elevators[0]
	for _, e := range c.elevators[1:] {
		if e.Cost(floor, dir) < best.Cost(floor, dir) {
			best = e
		}
	}
	best.AddStop(floor)
}

func (c *ElevatorController) SelectFloor(elevatorID, floor int) { // cabin button
	c.elevators[elevatorID].AddStop(floor)
}

func (c *ElevatorController) Tick() {
	for _, e := range c.elevators {
		e.Step()
	}
}`,

"Requests with a type, and the stop rule": `type RequestType int

const (
	PickupUp RequestType = iota
	PickupDown
	Destination
)

type Request struct { // comparable, so it works directly as a map key
	Floor int
	Type  RequestType
}

const minFloor, maxFloor = 0, 9

type Elevator struct {
	mu       sync.Mutex
	floor    int
	dir      Direction
	requests map[Request]struct{}
}

func (e *Elevator) AddRequest(r Request) bool {
	e.mu.Lock()
	defer e.mu.Unlock()
	if r.Floor < minFloor || r.Floor > maxFloor {
		return false // invalid floor
	}
	if r.Floor == e.floor {
		return true // already here
	}
	e.requests[r] = struct{}{}
	return true
}

func (e *Elevator) Step() {
	e.mu.Lock()
	defer e.mu.Unlock()
	if len(e.requests) == 0 {
		e.dir = Idle
		return
	}
	if e.dir == Idle {
		e.dir = e.directionToNearest()
	}
	pickup := PickupDown
	if e.dir == Up {
		pickup = PickupUp
	}
	_, stopForPickup := e.requests[Request{e.floor, pickup}]
	_, stopForDest := e.requests[Request{e.floor, Destination}]
	if stopForPickup || stopForDest { // doors open; don't move this tick
		delete(e.requests, Request{e.floor, pickup})
		delete(e.requests, Request{e.floor, Destination})
		if len(e.requests) == 0 {
			e.dir = Idle
		}
		return
	}
	if !e.hasRequestsAhead() { // only opposite-direction work left
		e.reverse()
		return // re-check stops at this floor next tick
	}
	if e.dir == Up {
		e.floor++
	} else {
		e.floor--
	}
}

func (e *Elevator) hasRequestsAhead() bool { // any type: we travel toward all of them
	for r := range e.requests {
		if (e.dir == Up && r.Floor > e.floor) || (e.dir == Down && r.Floor < e.floor) {
			return true
		}
	}
	return false
}

// directionToNearest is deterministic (nearest, lower floor on ties): map iteration order is random in Go.
func (e *Elevator) directionToNearest() Direction {
	best, bestDist := 0, -1
	for r := range e.requests {
		d := abs(r.Floor - e.floor)
		if bestDist < 0 || d < bestDist || (d == bestDist && r.Floor < best) {
			best, bestDist = r.Floor, d
		}
	}
	if best > e.floor {
		return Up
	}
	return Down
}`,

"States decide what a tick means": `type CabinState interface {
	Step(e *Elevator) CabinState
}

type MovingState struct{}

func (MovingState) Step(e *Elevator) CabinState {
	if e.atNextStop() {
		e.removeCurrentStop()
		return &DoorsOpenState{ticksLeft: 3} // open for 3 ticks
	}
	e.moveOneFloor()
	return MovingState{}
}

type DoorsOpenState struct{ ticksLeft int }

func (s *DoorsOpenState) Step(e *Elevator) CabinState {
	if s.ticksLeft--; s.ticksLeft > 0 {
		return s
	}
	if e.hasStops() {
		return MovingState{}
	}
	return IdleState{}
}

type IdleState struct{}

func (IdleState) Step(e *Elevator) CabinState {
	if e.hasStops() {
		return MovingState{}
	}
	return IdleState{}
}

type MaintenanceState struct{}

func (MaintenanceState) Step(*Elevator) CabinState { return MaintenanceState{} } // ignores stops until reset

// Elevator.Step: lock, then e.state = e.state.Step(e).
// The controller skips elevators in MaintenanceState when dispatching.`,

"Count the stops before the caller": `type DispatchStrategy interface {
	Choose(cars []*Elevator, floor int, dir Direction) *Elevator
}

type StopsAwareDispatch struct{}

func (s StopsAwareDispatch) Choose(cars []*Elevator, floor int, dir Direction) *Elevator {
	var best *Elevator
	bestCost := math.MaxInt
	for _, e := range cars {
		if c := s.cost(e, floor, dir); c < bestCost {
			best, bestCost = e, c
		}
	}
	return best // nil if every car is in maintenance
}

func (StopsAwareDispatch) cost(e *Elevator, floor int, dir Direction) int {
	if e.InMaintenance() {
		return math.MaxInt
	}
	travel := e.FloorsToReach(floor, dir)    // along its SCAN path, including any turn-around
	stopsBefore := e.StopsBefore(floor, dir) // each stop costs door time
	return travel + 3*stopsBefore
}`,

"A different request, a different dispatcher": `type TripRequest struct{ From, To int }

type DestinationDispatcher struct {
	cars []*Elevator
}

// Assign returns the car the passenger should take.
func (d *DestinationDispatcher) Assign(r TripRequest) int {
	best := d.cars[0]
	for _, e := range d.cars[1:] {
		if e.ExtraStopsFor(r.From, r.To) < best.ExtraStopsFor(r.From, r.To) {
			best = e
		}
	}
	best.AddStop(r.From)
	best.AddPendingDestination(r.From, r.To) // added as a stop once the passenger boards
	return best.ID
}`,

"Elevator in one screen": `type Elevator struct {
	mu    sync.Mutex
	floor int
	dir   Direction
	stops []int // sorted
}

func (e *Elevator) AddStop(f int)                           // set direction if idle
func (e *Elevator) Step()                                   // SCAN: next stop ahead, reverse when none
func (e *Elevator) Cost(reqFloor int, reqDir Direction) int // distance (+100 if it must turn)

type ElevatorController struct{ elevators []*Elevator }

func (c *ElevatorController) RequestElevator(floor int, dir Direction) // min cost elevator
func (c *ElevatorController) SelectFloor(elevatorID, floor int)
func (c *ElevatorController) Tick()`
} };
