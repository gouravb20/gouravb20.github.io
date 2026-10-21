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

// Request is a comparable struct: two requests are equal when floor and type match.
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
	currentFloor int           // 0..9
	state        ElevatorState // Idle, MovingUp or MovingDown
	up, down     sortedSet     // stops for the upward and downward sweeps
}

func (e *Elevator) AddRequest(r Request) bool
func (e *Elevator) Step()
func (e *Elevator) CurrentFloor() int
func (e *Elevator) Direction() Direction
func (e *Elevator) IsCommittedTo(floor int, dir Direction) bool // used by dispatch

type ElevatorState interface {
	Direction() Direction
	Move(e *Elevator) ElevatorState
}

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
}

func (c *ElevatorController) Start(ctx context.Context) { // or: each car ticks on its own goroutine
	for _, e := range c.elevators {
		go e.Run(ctx)
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

	mu           sync.Mutex // guards everything below
	currentFloor int        // every car starts on the ground floor
	state        ElevatorState
	up           sortedSet // stops for the upward sweep; next = up.ceiling(currentFloor)
	down         sortedSet // stops for the downward sweep; next = down.floor(currentFloor), Go's descending TreeSet
}

func NewElevator(id int) *Elevator { return &Elevator{ID: id, state: IdleState{}} }

func (e *Elevator) AddRequest(r Request) bool {
	if !IsValidFloor(r.Floor) { // reject, but don't panic
		return false
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	switch {
	case r.Floor == e.currentFloor: // already here: nothing to do
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

// Step is one tick: the current state decides whether to stop, move or turn.
func (e *Elevator) Step() {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.state = e.state.Move(e)
}

func (e *Elevator) CurrentFloor() int {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.currentFloor
}

func (e *Elevator) Direction() Direction {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.state.Direction()
}

// IsCommittedTo reports whether the car is sweeping in dir toward floor with a stop at or beyond it.
func (e *Elevator) IsCommittedTo(floor int, dir Direction) bool {
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.state.Direction() != dir {
		return false
	}
	if dir == Up {
		_, ok := e.up.ceiling(floor) // an up-stop at or above the caller
		return e.currentFloor <= floor && ok
	}
	_, ok := e.down.floor(floor) // a down-stop at or below the caller
	return e.currentFloor >= floor && ok
}

// Run steps once a second until ctx is cancelled: optional, one goroutine per car.
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
	if _, ok := e.up.ceiling(e.currentFloor); ok { // up-stops at or above
		return MovingUpState{}
	}
	if _, ok := e.down.floor(e.currentFloor); ok { // down-stops at or below
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
	if next, ok := e.up.ceiling(e.currentFloor); ok { // the next up-stop ahead
		if next == e.currentFloor {
			e.up.remove(next) // stop here this tick; don't move
		} else {
			e.currentFloor++
		}
		return s
	}
	if n := len(e.down); n > 0 && e.down[n-1] > e.currentFloor { // the highest DOWN call is above: go there, then turn
		e.currentFloor++
		return s
	}
	if len(e.up) == 0 && len(e.down) == 0 {
		return IdleState{}
	}
	return MovingDownState{}
}

func (MovingDownState) Direction() Direction { return Down }

func (s MovingDownState) Move(e *Elevator) ElevatorState {
	if next, ok := e.down.floor(e.currentFloor); ok { // the highest down-stop at or below
		if next == e.currentFloor {
			e.down.remove(next)
		} else {
			e.currentFloor--
		}
		return s
	}
	if len(e.up) > 0 && e.up[0] < e.currentFloor { // the lowest UP call is below: go there, then turn
		e.currentFloor--
		return s
	}
	if len(e.up) == 0 && len(e.down) == 0 {
		return IdleState{}
	}
	return MovingUpState{}
}`,

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

"Cancelling: remember why each stop exists": `// Each sweep maps a floor to the reasons it is a stop; the floor stays a stop until its last reason goes.
// Go has no sorted map, so keep the sorted floors next to the reasons.
// On Elevator, upSweep and downSweep (both *sweep) replace up and down; the states read sweep.floors.
type sweep struct {
	floors  sortedSet
	reasons map[int]map[RequestType]bool
}

func (s *sweep) add(r Request) {
	if s.reasons[r.Floor] == nil {
		s.reasons[r.Floor] = map[RequestType]bool{}
		s.floors.add(r.Floor)
	}
	s.reasons[r.Floor][r.Type] = true
}

func (s *sweep) cancel(r Request) bool {
	why := s.reasons[r.Floor]
	if !why[r.Type] {
		return false // nothing to cancel
	}
	delete(why, r.Type)
	if len(why) == 0 { // last reason gone: no stop here
		delete(s.reasons, r.Floor)
		s.floors.remove(r.Floor)
	}
	return true
}

func (e *Elevator) RemoveRequest(r Request) bool {
	e.mu.Lock()
	defer e.mu.Unlock()
	switch r.Type {
	case PickupUp:
		return e.upSweep.cancel(r)
	case PickupDown:
		return e.downSweep.cancel(r)
	default: // a destination was filed in whichever sweep reaches it
		return e.upSweep.cancel(r) || e.downSweep.cancel(r)
	}
}`,

"Hand-off: callers enqueue, the car drains each tick": `// Callers only send on a buffered channel; the car's own goroutine drains it at the start of each tick,
// so only that goroutine ever touches up and down.
type Elevator struct {
	pending  chan Request                 // written by any goroutine
	snapshot atomic.Pointer[CarSnapshot] // what dispatch reads from other goroutines
	// currentFloor, state, up, down: touched only by Step
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
			e.file(r) // the old AddRequest body, now private
		default:
			drained = true
		}
	}
	e.state = e.state.Move(e)
	e.snapshot.Store(&CarSnapshot{e.currentFloor, e.state.Direction()})
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
//   if next == e.currentFloor { e.up.remove(next); return &DoorsOpenState{resume: s, ticksLeft: 3} }
// On Elevator, under e.mu: EnterMaintenance clears up and down and sets MaintenanceState{}; Reset sets IdleState{}.
// Dispatch skips a car in maintenance, so it never gets hall calls.`,

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
}`,

"Elevator in one screen": `type Request struct {
	Floor int
	Type  RequestType // PickupUp, PickupDown, Destination
}

func (c *ElevatorController) RequestElevator(floor int, t RequestType) bool // validate, choose car, AddRequest
func (c *ElevatorController) SelectFloor(elevatorID, floor int) bool       // Destination on that car
func (c *ElevatorController) Step()                                         // every car steps once

type Elevator struct {
	mu       sync.Mutex
	up, down sortedSet // next up-stop: up.ceiling(currentFloor); next down-stop: down.floor(currentFloor)
}

func (e *Elevator) AddRequest(r Request) bool // bad floor false; current floor no-op; file by sweep
func (e *Elevator) Step()                     // state = state.Move(e) under mu

// IdleState, MovingUpState, MovingDownState: stop (no move), move one floor, or turn
// DispatchStrategy: committed car, else idle car, else nearest`
} };
