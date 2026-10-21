// Go versions of the Elevator code blocks, matched to the Java blocks by title. Imports are omitted.
window.ALT = window.ALT || {};
ALT["elevator"] = { go: {
"Public API": `func (c *ElevatorController) RequestElevator(floor int, dir Direction) error // hall button
func (c *ElevatorController) SelectFloor(elevatorID, floor int) error        // cabin button
func (c *ElevatorController) Start(ctx context.Context)                     // run each car on its own goroutine
func (c *ElevatorController) Tick()                                         // or advance every car one step (tests)`,

"Elevator": `type Direction int

const (
	Idle Direction = iota
	Up
	Down
)

type Source int

const (
	Hall Source = iota
	Cabin
)

// Request: a hall call carries a direction; a cabin call's direction follows from where the car is.
type Request struct {
	Floor     int
	Direction Direction
	Source    Source
}

const MinFloor, MaxFloor = 0, 9

// sortedSet is a sorted slice without duplicates: Go's stand-in for a TreeSet.
type sortedSet []int

func (s *sortedSet) add(f int) {
	if i, found := slices.BinarySearch(*s, f); !found {
		*s = slices.Insert(*s, i, f)
	}
}

func (s *sortedSet) remove(f int) {
	if i, found := slices.BinarySearch(*s, f); found {
		*s = slices.Delete(*s, i, i+1)
	}
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

type Elevator struct {
	ID int

	mu    sync.Mutex // guards floor, state, up and down
	floor int
	state ElevatorState
	up    sortedSet // stops on the way up; next = up.ceiling(floor)
	down  sortedSet // stops on the way down; next = down.floor(floor), Go's version of a descending TreeSet
}

func NewElevator(id int) *Elevator { return &Elevator{ID: id, state: IdleState{}} }

func (e *Elevator) AddRequest(r Request) error {
	if r.Floor < MinFloor || r.Floor > MaxFloor {
		return fmt.Errorf("no floor %d", r.Floor)
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	switch {
	case r.Source == Hall && r.Direction == Up:
		e.up.add(r.Floor)
	case r.Source == Hall:
		e.down.add(r.Floor)
	case r.Floor > e.floor:
		e.up.add(r.Floor)
	case r.Floor < e.floor:
		e.down.add(r.Floor) // a cabin press for this floor is already served
	}
	return nil
}

// Step is one tick: the current state decides and moves, under the same mutex as AddRequest.
func (e *Elevator) Step() {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.state = e.state.Move(e)
}

// Run steps once a second until ctx is cancelled: one goroutine per car when running for real.
func (e *Elevator) Run(ctx context.Context) {
	t := time.NewTicker(time.Second)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			e.Step()
		}
	}
}

func (e *Elevator) Cost(reqFloor int, reqDir Direction) int {
	e.mu.Lock()
	defer e.mu.Unlock()
	distance := reqFloor - e.floor
	if distance < 0 {
		distance = -distance
	}
	dir := e.state.Direction()
	if dir == Idle {
		return distance
	}
	onTheWay := dir == reqDir && ((dir == Up && reqFloor >= e.floor) || (dir == Down && reqFloor <= e.floor))
	if onTheWay {
		return distance
	}
	return distance + 100 // penalty if it must turn around first
}`,

"Direction states: Idle, MovingUp, MovingDown": `// ElevatorState is the State pattern: each state decides one tick of movement.
// Move is called only from Step, with e.mu held.
type ElevatorState interface {
	Direction() Direction
	Move(e *Elevator) ElevatorState
}

type IdleState struct{}
type MovingUpState struct{}
type MovingDownState struct{}

func (IdleState) Direction() Direction { return Idle }

func (s IdleState) Move(e *Elevator) ElevatorState {
	if _, ok := e.up.ceiling(e.floor); ok { // up-stops at or above
		return MovingUpState{}
	}
	if _, ok := e.down.floor(e.floor); ok { // down-stops at or below
		return MovingDownState{}
	}
	if len(e.up) > 0 { // only UP calls below: go down to them
		return MovingDownState{}
	}
	if len(e.down) > 0 { // only DOWN calls above: go up to them
		return MovingUpState{}
	}
	return s
}

func (MovingUpState) Direction() Direction { return Up }

func (s MovingUpState) Move(e *Elevator) ElevatorState {
	if next, ok := e.up.ceiling(e.floor); ok { // the next up-stop ahead
		if next == e.floor {
			e.up.remove(next) // doors open here this tick
		} else {
			e.floor++
		}
		return s
	}
	if n := len(e.down); n > 0 && e.down[n-1] > e.floor { // the highest DOWN call is above: go there, then turn
		e.floor++
		return s
	}
	if len(e.up) == 0 && len(e.down) == 0 {
		return IdleState{}
	}
	return MovingDownState{}
}

func (MovingDownState) Direction() Direction { return Down }

func (s MovingDownState) Move(e *Elevator) ElevatorState {
	if next, ok := e.down.floor(e.floor); ok { // the highest down-stop at or below
		if next == e.floor {
			e.down.remove(next)
		} else {
			e.floor--
		}
		return s
	}
	if len(e.up) > 0 && e.up[0] < e.floor { // the lowest UP call is below: go there, then turn
		e.floor--
		return s
	}
	if len(e.up) == 0 && len(e.down) == 0 {
		return IdleState{}
	}
	return MovingUpState{}
}`,

"ElevatorController": `type DispatchStrategy interface {
	Choose(cars []*Elevator, floor int, dir Direction) *Elevator
}

type LowestCostDispatch struct{}

func (LowestCostDispatch) Choose(cars []*Elevator, floor int, dir Direction) *Elevator {
	return slices.MinFunc(cars, func(a, b *Elevator) int { return cmp.Compare(a.Cost(floor, dir), b.Cost(floor, dir)) })
}

type ElevatorController struct {
	elevators []*Elevator // elevator i has ID i; the slice never changes
	dispatch  DispatchStrategy
}

func NewElevatorController(cars []*Elevator, d DispatchStrategy) *ElevatorController {
	return &ElevatorController{elevators: slices.Clone(cars), dispatch: d}
}

func (c *ElevatorController) RequestElevator(floor int, dir Direction) error { // hall button
	return c.dispatch.Choose(c.elevators, floor, dir).AddRequest(Request{floor, dir, Hall})
}

func (c *ElevatorController) SelectFloor(elevatorID, floor int) error { // cabin button
	return c.elevators[elevatorID].AddRequest(Request{floor, Idle, Cabin})
}

func (c *ElevatorController) Tick() { // tests: deterministic, no goroutines
	for _, e := range c.elevators {
		e.Step()
	}
}

func (c *ElevatorController) Start(ctx context.Context) { // for real: one goroutine per car
	for _, e := range c.elevators {
		go e.Run(ctx)
	}
}`,

"Doors and maintenance as ElevatorStates": `// More states, same interface: each decides what one tick means.
type DoorsOpenState struct {
	resume    ElevatorState // the direction to carry on in
	ticksLeft int           // touched only inside Step, with the elevator's mutex held
}

func (d *DoorsOpenState) Direction() Direction { return d.resume.Direction() }

func (d *DoorsOpenState) Move(*Elevator) ElevatorState {
	d.ticksLeft--
	if d.ticksLeft > 0 {
		return d
	}
	return d.resume
}

type MaintenanceState struct{}

func (MaintenanceState) Direction() Direction { return Idle }

func (s MaintenanceState) Move(*Elevator) ElevatorState {
	return s // ignores stops until an engineer resets it
}

// In MovingUpState (and MovingDownState), a stop now holds the doors open for three ticks:
//   if next == e.floor { e.up.remove(next); return &DoorsOpenState{resume: s, ticksLeft: 3} }
// On Elevator, under e.mu: EnterMaintenance clears up and down and sets MaintenanceState{}; Reset sets IdleState{}.
// The dispatcher gives a car in maintenance an infinite cost, so it never gets hall calls.`,

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
	mu       sync.Mutex
	up, down sortedSet     // next up-stop: up.ceiling(floor); next down-stop: down.floor(floor)
	floor    int
	state    ElevatorState // all guarded by mu
}

func (e *Elevator) AddRequest(r Request) error // Hall by its direction, Cabin by above or below
func (e *Elevator) Step()                       // state = state.Move(e) under mu
func (e *Elevator) Run(ctx context.Context)     // Step every second on its own goroutine

type ElevatorState interface {
	Direction() Direction
	Move(e *Elevator) ElevatorState
}

// IdleState, MovingUpState, MovingDownState: serve stops ahead, travel to the far call, then turn
type DispatchStrategy interface{ Choose(cars []*Elevator, floor int, dir Direction) *Elevator }`
} };
