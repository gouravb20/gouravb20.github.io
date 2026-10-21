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

"Direction-aware stops in two TreeSets": `type RequestType int

const (
	PickupUp RequestType = iota
	PickupDown
	Destination
)

// sortedSet is a sorted slice without duplicates: Go's stand-in for a TreeSet.
type sortedSet []int

func (s *sortedSet) add(f int) {
	if i, found := slices.BinarySearch(*s, f); !found {
		*s = slices.Insert(*s, i, f)
	}
}

func (s *sortedSet) remove(f int) bool {
	i, found := slices.BinarySearch(*s, f)
	if found {
		*s = slices.Delete(*s, i, i+1)
	}
	return found
}

func (s sortedSet) ceiling(f int) (int, bool) { // smallest >= f
	i, _ := slices.BinarySearch(s, f)
	if i < len(s) {
		return s[i], true
	}
	return 0, false
}

func (s sortedSet) floor(f int) (int, bool) { // largest <= f
	i, found := slices.BinarySearch(s, f)
	if found {
		return s[i], true
	}
	if i > 0 {
		return s[i-1], true
	}
	return 0, false
}

const MinFloor, MaxFloor = 0, 9

type Elevator struct {
	mu       sync.Mutex // guards everything below
	floor    int
	dir      Direction
	up, down sortedSet // floors to stop at while moving up / down
}

func (e *Elevator) AddRequest(f int, t RequestType) bool {
	if f < MinFloor || f > MaxFloor {
		return false
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	switch {
	case t == PickupUp:
		e.up.add(f)
	case t == PickupDown:
		e.down.add(f)
	case f > e.floor: // a destination joins the sweep that reaches it
		e.up.add(f)
	case f < e.floor:
		e.down.add(f)
	}
	return true
}

func (e *Elevator) Step() {
	e.mu.Lock()
	defer e.mu.Unlock()
	if len(e.up) == 0 && len(e.down) == 0 {
		e.dir = Idle
		return
	}
	if e.dir == Idle {
		e.dir = e.directionToNearest()
	}
	same := &e.down
	if e.dir == Up {
		same = &e.up
	}
	if same.remove(e.floor) { // doors open; only same-direction stops
		return
	}
	target, ok := e.nextTarget()
	if !ok { // nothing ahead: reverse
		if e.dir == Up {
			e.dir = Down
		} else {
			e.dir = Up
		}
		return
	}
	if target > e.floor {
		e.floor++
	} else {
		e.floor--
	}
}

// nextTarget is SCAN (LOOK): the next stop ahead; else the farthest opposite-direction call ahead.
func (e *Elevator) nextTarget() (int, bool) {
	if e.dir == Up {
		if next, ok := e.up.ceiling(e.floor); ok {
			return next, true
		}
		if n := len(e.down); n > 0 && e.down[n-1] > e.floor {
			return e.down[n-1], true
		}
		return 0, false
	}
	if next, ok := e.down.floor(e.floor); ok {
		return next, true
	}
	if len(e.up) > 0 && e.up[0] < e.floor {
		return e.up[0], true
	}
	return 0, false
}

func (e *Elevator) directionToNearest() Direction { // nearest stop, ties go up
	best, d := math.MaxInt, Up
	for _, s := range []sortedSet{e.up, e.down} {
		if a, ok := s.ceiling(e.floor); ok && a-e.floor < best {
			best, d = a-e.floor, Up
		}
		if b, ok := s.floor(e.floor); ok && e.floor-b < best {
			best, d = e.floor-b, Down
		}
	}
	return d
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
