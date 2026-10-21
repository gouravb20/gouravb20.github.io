// LLD problem breakdown: Elevator System. Format: Chapter in public/shared/notes.d.ts; shared helpers in data-part2.js.
// Imports are omitted in the code.
(function () {
const { levels, PRACTICE_TIP } = LLD_PROBLEMS_KIT;

window.DATA.chapters.push({
    id: `elevator`, part: 3, number: 4, difficulty: `hard`,
    title: `Elevator System: dispatching calls and the SCAN schedule`,
    references: [{ title: `awesome-low-level-design: Elevator System`, url: `https://github.com/ashishps1/awesome-low-level-design/blob/main/problems/elevator-system.md` }],
    source: { title: `Hello Interview: Elevator (LLD) problem breakdown`, url: `https://www.hellointerview.com/learn/low-level-design/problem-breakdowns/elevator` },
    overview: `Three elevators serve floors 0 to 9. People on a floor press UP or DOWN; people inside a car press the floors they want. The controller decides which car answers each call, and every car decides, one tick at a time, whether to stop, move or turn around. This page works the problem in interview order: clarify the requirements, find the entities, design the classes top down, implement dispatch and movement (comparing a simple, a better and a strong option at each decision), verify with a trace, then handle follow-ups. The design lands on two sorted sets of stops per car (one per sweep direction), the <strong>SCAN</strong> schedule, direction as a <strong>State</strong>, and dispatch as a <strong>Strategy</strong>.`,
    problem: [
      { id: `understanding`, title: `What an elevator system does`, kicker: `The problem`, blocks: [
        { type: `problem`, html: `<p>A building has several elevators. Someone on a floor presses a call button; the system picks one car to come for them. Once inside, passengers press destination buttons, possibly several. Each car has to work through its stops in an order that feels sensible to the people waiting, while calls keep arriving.</p>` },
        { type: `text`, html: `<p>The prompt is usually one sentence: <em>"Design the control system for a building's elevators: several cars, calls from floors and from inside the cars, and cars that move efficiently."</em> That is too vague to build. The first few minutes go into turning it into a spec.</p>` }
      ] },
      { id: `clarifying`, title: `Clarifying questions`, kicker: `Step 1: requirements`, blocks: [
        { type: `text`, html: `<p>Work through four kinds of question: <strong>what the system must do</strong>, <strong>what happens with bad input</strong>, <strong>what is deliberately left out</strong>, and <strong>what might be added later</strong>. Spend one to three minutes here; every answer removes a branch you would otherwise design for.</p>` },
        { type: `table`, headers: [`You ask`, `A typical answer`, `What it decides`], rows: [
          [`How many cars and floors? Fixed or configurable?`, `Three cars, floors 0 to 9, fixed`, `A small fixed system; no configuration layer`],
          [`Are hall calls UP/DOWN buttons, or a lobby keypad where you enter your floor?`, `Classic UP/DOWN buttons`, `Hall calls carry a direction; destination dispatch is a follow-up`],
          [`Can passengers press several floors inside the car?`, `Yes`, `A car holds many stops at once, not one target`],
          [`Do hall calls and destination presses behave differently?`, `Hall calls have a direction; destinations just mean "stop here"`, `Two kinds of stop, which shapes how stops are stored`],
          [`What about a floor that doesn't exist, or the floor the car is already on?`, `Reject bad floors with false, don't crash; the current floor is already served`, `Validation at the entry points; a no-op case`],
          [`Weight limits, doors, emergency stop?`, `Leave them out; focus on scheduling and movement`, `Fewer states; follow-ups only`],
          [`A simulation where I advance time, or real control software?`, `A simulation that advances one tick at a time`, `A <code>step()</code> method drives everything`]
        ] },
        { type: `callout`, tone: `insight`, title: `Simulation or control software?`, html: `<p>Real elevator software reacts to hardware: a floor sensor fires, a motor reports it has stopped. An interview wants the logic, not the hardware, so you model time yourself: each call to <code>step()</code> is one tick, and a car moves at most one floor per tick. That makes behaviour deterministic and easy to test. Asking the question out loud shows you know the difference; the answer is almost always "simulation". Later the same <code>step()</code> can run on a timer thread per car.</p>` }
      ] },
      { id: `final-requirements`, title: `Final requirements`, kicker: `Step 1: requirements`, blocks: [
        { type: `code`, lang: `text`, title: `Final requirements`, code: `Requirements
  1. Three elevators serve floors 0-9.
  2. A hall call (floor + UP or DOWN) can come from any floor; the system
     chooses which elevator answers it.
  3. Inside a car, passengers can select one or more destination floors.
  4. Time advances in discrete ticks: step() moves each car at most one floor.
  5. Two kinds of stop: hall calls with a direction, and destinations without.
  6. Many calls can be pending at once, across floors and cars.
  7. Invalid requests (a floor outside 0-9) are rejected by returning false.
  8. A request for the floor a car is already on is treated as served.

Out of scope
  - Weight and passenger limits, door timing, emergency stop
  - Changing the number of cars or floors at run time
  - Displays and UI` },
        { type: `callout`, tone: `tip`, html: PRACTICE_TIP }
      ] }
    ],
    solution: [
      { id: `entities`, title: `Core entities`, kicker: `Step 2: entities`, blocks: [
        { type: `text`, html: `<p>Scan the requirements for nouns that hold state or enforce rules. Four candidates stand out: floors, requests, elevators and something that coordinates them. Test each one before committing to a class.</p>` },
        { type: `table`, headers: [`Candidate`, `Verdict`, `Why`], rows: [
          [`Floor`, `An <code>int</code>, not a class`, `A floor holds no state and enforces no rule here; it is a position from 0 to 9`],
          [`Request`, `Undecided for now`, `Floor plus kind of stop. Whether it earns a type depends on how the car stores stops; decide during class design`],
          [`Elevator`, `A class`, `Holds its floor, direction and stops; enforces "serve stops on the way, turn when nothing is ahead"`],
          [`ElevatorController`, `A class`, `Receives hall calls, picks a car, and owns <code>step()</code> for the whole building`]
        ] },
        { type: `table`, title: `The entities we keep`, headers: [`Entity`, `Responsibility`], rows: [
          [`ElevatorController`, `The entry point. Validates hall calls, chooses a car for each (dispatch), forwards destination presses, and advances every car each tick. Knows nothing about how a car moves.`],
          [`Elevator`, `One car. Knows its floor, its direction and the stops it owes, and decides each tick whether to stop, move or turn. Knows nothing about the other cars.`],
          [`Request`, `A stop to make: a floor and its kind (hall call up, hall call down, or destination).`]
        ] },
        { type: `callout`, tone: `tip`, html: `<p>It is fine to be unsure whether something deserves a class. Say so ("Request might just be an int; I'll decide once I see the movement logic") and come back to it. In tick-based simulations the coordinator that owns <code>step()</code> is almost always an entity.</p>` }
      ] },
      { id: `controller-design`, title: `Class design: ElevatorController`, kicker: `Step 3: class design, top down`, blocks: [
        { type: `text`, html: `<p>Start from the class outside code talks to, and derive its state and methods from the requirements rather than from intuition. For each requirement ask: what must this class remember, and what must it let callers do?</p>` },
        { type: `table`, headers: [`Requirement`, `What the controller remembers`], rows: [
          [`"Three elevators serve floors 0-9"`, `The list of cars, created once`],
          [`"The system chooses which elevator answers"`, `A dispatch rule (a strategy object), nothing per call`]
        ] },
        { type: `table`, headers: [`Need`, `Method`], rows: [
          [`A hall call from any floor`, `<code>boolean requestElevator(int floor, RequestType type)</code>`],
          [`A destination pressed inside car <em>i</em>`, `<code>boolean selectFloor(int elevatorId, int floor)</code>`],
          [`Time advances in ticks`, `<code>void step()</code>`]
        ] },
        { type: `keypoints`, items: [
          `<strong>Dispatch immediately.</strong> A hall call is assigned to a car the moment it arrives, so the controller keeps no queue of unassigned calls. The alternative, a shared queue that idle cars pull from, handles "every car is busy" more gracefully; mention it as a trade-off.`,
          `<strong>Hall calls take a request type, not a direction.</strong> <code>Direction</code> has IDLE, which is meaningless for a button press. Accepting <code>PICKUP_UP</code> or <code>PICKUP_DOWN</code> makes that mistake impossible to express.`,
          `<strong>No shared interface with Elevator.</strong> <code>requestElevator</code> and <code>addRequest</code> look alike, but one coordinates many cars and the other changes one car. An interface earns its place only when several implementations must be interchangeable.`
        ] }
      ] },
      { id: `elevator-design`, title: `Class design: Elevator and Request`, kicker: `Step 3: class design`, blocks: [
        { type: `table`, headers: [`Requirement`, `What a car remembers`], rows: [
          [`"Serve floors 0-9"`, `Its current floor`],
          [`"Keep going while there are stops ahead"`, `Its direction: UP, DOWN, or IDLE when it has nothing to do`],
          [`"Several destinations; hall calls with a direction"`, `The stops it owes, in a form that answers "what's next?" quickly`]
        ] },
        { type: `text`, html: `<p>The deferred question comes back here: <strong>how should a car store its stops?</strong> The answer decides whether <code>Request</code> becomes a type, and how fast the movement logic can be.</p>` },
        { type: `compare`, items: [
          { title: `Good: a set of floors`, tone: `warn`, html: `<p><code>Set&lt;Integer&gt;</code>. Simple, and duplicate presses collapse. But it forgets <em>why</em> a floor is a stop. A car going up with a stop at 6 also opens for someone at 6 who pressed DOWN, and they either ride the wrong way or watch it leave. Acceptable for a junior answer.</p>` },
          { title: `Better: a set of requests`, tone: `info`, html: `<p><code>Set&lt;Request&gt;</code> where a request is floor plus type. Going up, the car stops only for UP calls and destinations; a DOWN call waits for the return trip. Correct, but a hash set has no order, so every tick scans all stops to answer "anything ahead?" and "which is nearest?".</p>` },
          { title: `Great: two sorted sets, one per sweep`, tone: `ok`, html: `<p><code>up</code> (ascending) holds floors to stop at while going up: UP calls and destinations above the car. <code>down</code> (descending) holds DOWN calls and destinations below. Direction-aware like the request set, and sorted: <code>ceiling(currentFloor)</code> is the next stop ahead in either set, in O(log n).</p>` }
        ] },
        { type: `text`, html: `<p>We take the two sorted sets. <code>Request</code> still earns a small type: it is how a stop enters the system, and the controller and car pass it around, even though the car files it as a floor in one of its two sets. <strong>IDLE</strong> must be a real direction: without it, a car with nothing to do has no honest state and drifts.</p>` },
        { type: `table`, headers: [`Need`, `Method on Elevator`], rows: [
          [`Accept a hall call or a destination`, `<code>boolean addRequest(Request r)</code>`],
          [`Advance one tick`, `<code>void step()</code>`],
          [`Dispatch needs position and direction`, `<code>int currentFloor()</code>, <code>Direction direction()</code>`],
          [`Dispatch needs to know if the car will pass a floor`, `<code>boolean isCommittedTo(int floor, Direction dir)</code>`]
        ] },
        { type: `code`, lang: `java`, title: `Request and its type`, code: `enum Direction { UP, DOWN, IDLE }

/** Hall calls carry the direction the caller wants; a destination is a button pressed inside the car. */
enum RequestType { PICKUP_UP, PICKUP_DOWN, DESTINATION }

record Request(int floor, RequestType type) {}   // a record: equality covers floor and type` }
      ] },
      { id: `class-diagram`, title: `Final class design`, kicker: `Step 3: class design`, blocks: [
        { type: `code`, lang: `java`, title: `Final class design`, code: `final class ElevatorController {
    private final List<Elevator> elevators;                  // three cars, created once
    private final DispatchStrategy dispatch;

    boolean requestElevator(int floor, RequestType type);    // hall call; false if invalid
    boolean selectFloor(int elevatorId, int floor);          // destination button inside a car
    void step();                                             // advance every car one tick
}

final class Elevator {
    private int currentFloor;                                // 0..9
    private ElevatorState state;                             // Idle, MovingUp or MovingDown
    private final TreeSet<Integer> up;                       // stops for the upward sweep, ascending
    private final TreeSet<Integer> down;                     // stops for the downward sweep, descending

    boolean addRequest(Request r);
    void step();
    int currentFloor();
    Direction direction();
    boolean isCommittedTo(int floor, Direction dir);         // used by dispatch
}

interface ElevatorState     { Direction direction(); ElevatorState move(Elevator e); }
interface DispatchStrategy  { Elevator choose(List<Elevator> cars, Request call); }` },
        { type: `text`, html: `<p>The controller coordinates and never moves a car; each car moves itself and never looks at the others. Direction is held by a small <strong>State</strong> object rather than an enum field, because each direction has its own rules for a tick, and dispatch is a <strong>Strategy</strong> because "which car is best" is the part most likely to change.</p>` }
      ] },
      { id: `controller-impl`, title: `Implementation: the controller and dispatch`, kicker: `Step 4: implementation`, blocks: [
        { type: `text`, html: `<p>Check what the interviewer wants: working code, pseudocode or a walkthrough. For each method, write the normal path first, then the edge cases. <code>requestElevator</code> validates, builds a <code>Request</code> once at the boundary, picks a car and hands the request over. Edge cases: a floor outside 0-9, and a <code>DESTINATION</code> type passed to the hall-call method.</p>` },
        { type: `code`, lang: `java`, title: `ElevatorController`, code: `final class ElevatorController {
    static final int CARS = 3;
    private final List<Elevator> elevators;                  // never changes after construction
    private final DispatchStrategy dispatch;

    ElevatorController(DispatchStrategy dispatch) {
        this.elevators = IntStream.range(0, CARS).mapToObj(Elevator::new).toList();
        this.dispatch = dispatch;
    }

    /** A hall button. Choosing a car and adding the stop happen as one step, so concurrent calls see each other's stops. */
    synchronized boolean requestElevator(int floor, RequestType type) {
        if (!Elevator.isValidFloor(floor) || type == RequestType.DESTINATION) return false;   // hall calls only
        Request call = new Request(floor, type);
        return dispatch.choose(elevators, call).addRequest(call);
    }

    /** A destination button inside car elevatorId. */
    boolean selectFloor(int elevatorId, int floor) {
        if (elevatorId < 0 || elevatorId >= CARS) return false;
        return elevators.get(elevatorId).addRequest(new Request(floor, RequestType.DESTINATION));
    }

    void step() { for (Elevator e : elevators) e.step(); }                    // the simulation clock

    void start(ExecutorService pool) { elevators.forEach(pool::execute); }     // or: each car ticks on its own thread
    void stop() { elevators.forEach(Elevator::shutdown); }
}` },
        { type: `text`, html: `<p>The interesting part is choosing the car. Start simple, then offer to improve it: "This works; I can make it direction-aware if you'd like."</p>` },
        { type: `compare`, items: [
          { title: `Weak: nearest car`, tone: `bad`, html: `<p>Pick the closest car, whichever way it is going. Thirty seconds to write. But a car one floor above a caller who wants UP, while heading down to the lobby, gets picked; it won't stop for them going down, so they wait for the whole round trip.</p>` },
          { title: `Good: right direction, still ahead`, tone: `warn`, html: `<p>Prefer cars moving in the caller's direction that haven't passed the floor; then idle cars; then anyone. Better, but a car at 2 going up with its last stop at 3 looks perfect for an UP call at 8, and turns around at 3.</p>` },
          { title: `Strong: committed to the floor`, tone: `ok`, html: `<p>Also require a stop at or beyond the caller in that direction, so the car will really pass them. With sorted sets that check is one <code>ceiling</code> call. Then idle cars, then the nearest.</p>` }
        ] },
        { type: `code`, lang: `java`, title: `Dispatch: the nearest car`, code: `interface DispatchStrategy { Elevator choose(List<Elevator> cars, Request call); }

/** Simplest: the closest car, whichever way it is going. */
final class NearestElevator implements DispatchStrategy {
    public Elevator choose(List<Elevator> cars, Request call) {
        return Collections.min(cars, Comparator.comparingInt(e -> Math.abs(e.currentFloor() - call.floor())));
    }
}` },
        { type: `code`, lang: `java`, title: `Dispatch: committed cars first`, code: `/** A car already sweeping toward the caller with a stop at or beyond them; else an idle car; else the closest. */
final class CommittedFirst implements DispatchStrategy {
    public Elevator choose(List<Elevator> cars, Request call) {
        Direction want = call.type() == RequestType.PICKUP_UP ? Direction.UP : Direction.DOWN;
        Comparator<Elevator> closest = Comparator.comparingInt(e -> Math.abs(e.currentFloor() - call.floor()));
        return cars.stream().filter(e -> e.isCommittedTo(call.floor(), want)).min(closest)
            .or(() -> cars.stream().filter(e -> e.direction() == Direction.IDLE).min(closest))
            .orElseGet(() -> Collections.min(cars, closest));
    }
}` },
        { type: `callout`, tone: `interview`, html: `<p>In 35 minutes, write the nearest or the direction-aware version, then name the gap yourself: "This doesn't check that the car's stops actually reach the caller; <code>isCommittedTo</code> fixes that." Different buildings want different trade-offs (shortest wait, fewest stops, least energy), which is exactly why dispatch sits behind a <code>DispatchStrategy</code>.</p>` }
      ] },
      { id: `elevator-impl`, title: `Implementation: moving the car`, kicker: `Step 4: implementation`, blocks: [
        { type: `text`, html: `<p><code>step()</code> is the heart of the system: each tick a car stops, moves one floor or turns around. Before coding, compare movement rules on one example: a car at floor 5 going UP owes stops at 4, 8 and 9, requested in the order 9, 4, 8.</p>` },
        { type: `table`, headers: [`Rule`, `Route`, `Floors travelled`, `Turns`, `What riders see`], rows: [
          [`First come, first served`, `5 &rarr; 9 &rarr; 4 &rarr; 8`, `4 + 5 + 4 = 13`, `2`, `The car swings past people it will come back for`],
          [`Nearest stop next`, `5 &rarr; 4 &rarr; 8 &rarr; 9`, `1 + 4 + 1 = 6`, `1`, `Passengers already riding up are taken down first`],
          [`SCAN: finish the sweep, then turn`, `5 &rarr; 8 &rarr; 9 &rarr; 4`, `3 + 1 + 5 = 9`, `1`, `A car moving your way keeps coming; it never reverses on its riders`]
        ] },
        { type: `text`, html: `<p>Nearest-first travels least in this example, so why SCAN? Because the goal is predictable service, not minimum distance. Nearest-first reverses on people already inside, and under steady traffic it can bounce between nearby floors while a far stop waits forever. SCAN sweeps one way serving everything ahead, then sweeps back: every stop is reached within two sweeps, and a car that looks like it is coming toward you is. Disk schedulers use the same idea for the same reason.</p>` },
        { type: `list`, title: `Edge cases the code must handle`, items: [
          `No stops: become IDLE and stay put.`,
          `IDLE with stops: choose a direction first; stop checks depend on it.`,
          `Arriving at a stop: remove it and do not move in the same tick.`,
          `Nothing left ahead: turn, but still travel to the far end of the other sweep if a call there lies ahead.`,
          `A stop at the floor the car is on: already served; <code>addRequest</code> ignores it.`,
          `Floors 0 and 9: no special case. With nothing above floor 9, there is nothing ahead, so the car turns.`
        ] },
        { type: `code`, lang: `java`, title: `Elevator`, code: `final class Elevator implements Runnable {
    static final int MIN_FLOOR = 0, MAX_FLOOR = 9;
    final int id;

    // Guarded by this. Stops for the upward sweep in ascending order and for the downward sweep in
    // descending order, so in both sets ceiling(currentFloor) is "the next stop ahead".
    final TreeSet<Integer> up = new TreeSet<>();
    final TreeSet<Integer> down = new TreeSet<>(Comparator.reverseOrder());
    int currentFloor = MIN_FLOOR;                            // every car starts on the ground floor
    private ElevatorState state = new IdleState();
    private volatile boolean running = true;

    Elevator(int id) { this.id = id; }

    static boolean isValidFloor(int f) { return f >= MIN_FLOOR && f <= MAX_FLOOR; }

    synchronized boolean addRequest(Request r) {
        if (!isValidFloor(r.floor())) return false;          // reject, but don't throw
        if (r.floor() == currentFloor) return true;          // already here: nothing to do
        switch (r.type()) {
            case PICKUP_UP   -> up.add(r.floor());
            case PICKUP_DOWN -> down.add(r.floor());
            case DESTINATION -> (r.floor() > currentFloor ? up : down).add(r.floor());   // the sweep that reaches it
        }
        return true;
    }

    /** One tick: the current state decides whether to stop, move or turn. */
    synchronized void step() { state = state.move(this); }

    synchronized int currentFloor()    { return currentFloor; }
    synchronized Direction direction() { return state.direction(); }

    /** True if the car is sweeping in dir toward floor with a stop at or beyond it, so it will pass the caller. */
    synchronized boolean isCommittedTo(int floor, Direction dir) {
        if (state.direction() != dir) return false;
        return dir == Direction.UP
            ? currentFloor <= floor && up.ceiling(floor) != null      // an up-stop at or above the caller
            : currentFloor >= floor && down.ceiling(floor) != null;   // a down-stop at or below (descending set)
    }

    @Override public void run() {                            // optional: one thread per car
        while (running) {
            step();
            try { Thread.sleep(1_000); }                     // one floor per second
            catch (InterruptedException e) { Thread.currentThread().interrupt(); return; }
        }
    }

    void shutdown() { running = false; }
}` },
        { type: `code`, lang: `java`, title: `Direction states: Idle, MovingUp, MovingDown`, code: `/** The State pattern: each state decides one tick of movement. Called only from Elevator.step(), under its lock. */
interface ElevatorState {
    Direction direction();
    ElevatorState move(Elevator e);
}

final class IdleState implements ElevatorState {
    public Direction direction() { return Direction.IDLE; }
    public ElevatorState move(Elevator e) {
        if (e.up.ceiling(e.currentFloor) != null)   return new MovingUpState();     // up-stops at or above
        if (e.down.ceiling(e.currentFloor) != null) return new MovingDownState();   // down-stops at or below
        if (!e.up.isEmpty())   return new MovingDownState();                        // only UP calls below: go down to them
        if (!e.down.isEmpty()) return new MovingUpState();                          // only DOWN calls above: go up to them
        return this;
    }
}

final class MovingUpState implements ElevatorState {
    public Direction direction() { return Direction.UP; }
    public ElevatorState move(Elevator e) {
        Integer next = e.up.ceiling(e.currentFloor);                 // the next up-stop ahead
        if (next != null) {
            if (next == e.currentFloor) e.up.remove(next);           // stop here this tick; don't move
            else e.currentFloor++;
            return this;
        }
        if (!e.down.isEmpty() && e.down.first() > e.currentFloor) {  // the highest DOWN call is above: go there, then turn
            e.currentFloor++;
            return this;
        }
        return e.up.isEmpty() && e.down.isEmpty() ? new IdleState() : new MovingDownState();
    }
}

final class MovingDownState implements ElevatorState {
    public Direction direction() { return Direction.DOWN; }
    public ElevatorState move(Elevator e) {
        Integer next = e.down.ceiling(e.currentFloor);               // descending set: the highest down-stop at or below
        if (next != null) {
            if (next == e.currentFloor) e.down.remove(next);
            else e.currentFloor--;
            return this;
        }
        if (!e.up.isEmpty() && e.up.first() < e.currentFloor) {      // the lowest UP call is below: go there, then turn
            e.currentFloor--;
            return this;
        }
        return e.up.isEmpty() && e.down.isEmpty() ? new IdleState() : new MovingUpState();
    }
}` },
        { type: `keypoints`, items: [
          `<strong>Stopping is direction-aware; travelling is not.</strong> Going up, a car stops only for floors in <code>up</code>, yet it still climbs to the highest DOWN call above it (<code>down.first()</code>) before turning, or that caller would never be reached.`,
          `<strong>A stop costs a tick.</strong> Removing the stop and moving in the same tick is a classic bug: the car would leave before anyone boards.`,
          `<strong>Turning costs a tick too.</strong> After a turn, the next tick checks the current floor again in the new direction.`,
          `<strong>Deterministic.</strong> Sorted sets give the same order every run; never pick "any" element from a hash set to decide a direction.`
        ] },
        { type: `callout`, tone: `warning`, html: `<p>Thread safety: if each car's thread runs <code>step()</code> while hall calls arrive on other threads, both touch the same <code>TreeSet</code>s, floor and state. So <code>addRequest</code>, <code>step()</code>, <code>isCommittedTo</code> and the getters are all synchronized on the car, and <code>requestElevator</code> is synchronized on the controller so that choosing a car and adding the stop are one step. A common version of this design synchronizes only <code>addRequest</code> and lets the car's thread move unlocked, which lets a button press change a <code>TreeSet</code> while the car is reading it. Each car has its own lock, and a car never takes the controller's lock, so there is no lock-order cycle.</p>` },
        { type: `text`, html: `<p>The two sorted sets with the down set reversed, the direction states and a Runnable per car follow the <a href="https://github.com/ashishps1/awesome-low-level-design/blob/main/solutions/java/src/elevatorsystem/Elevator.java" target="_blank" rel="noopener">awesome-low-level-design elevator solution</a>; the code here is written independently, with every shared field guarded by a lock. Displays, and the Observer pattern that would feed them, are left out because nothing in the requirements needs them.</p>` }
      ] },
      { id: `verification`, title: `Verifying with a trace`, kicker: `Step 5: verification`, blocks: [
        { type: `text`, html: `<p>Walk one car through a concrete scenario, tick by tick, before the interviewer does. Car 0 is idle at floor 2. Someone at floor 5 has pressed UP and someone at floor 7 has pressed DOWN, so <code>up = {5}</code> and <code>down = {7}</code>.</p>` },
        { type: `code`, lang: `text`, title: `Tick by tick`, code: `tick  1  Idle       floor 2   up={5}  down={7}   up.ceiling(2)=5: become MovingUp (no move)
tick  2  MovingUp   floor 3   next up-stop is 5: move up
tick  3  MovingUp   floor 4
tick  4  MovingUp   floor 5
tick  5  MovingUp   floor 5   up={}   5 is a stop: remove it, doors open, don't move
         the rider presses 9: a destination above the car joins up={9}
tick  6  MovingUp   floor 6
tick  7  MovingUp   floor 7   passes 7: the DOWN call is in down, not up, so no stop
tick  8  MovingUp   floor 8
tick  9  MovingUp   floor 9
tick 10  MovingUp   floor 9   up={}   9 is a stop: remove it, don't move
tick 11  MovingDown floor 9   nothing ahead, no DOWN call above: turn
tick 12  MovingDown floor 8   down.ceiling(9)=7: move down
tick 13  MovingDown floor 7
tick 14  MovingDown floor 7   down={}  7 is a stop: the DOWN caller boards a car going down
tick 15  Idle       floor 7   no stops left: idle until the next call` },
        { type: `keypoints`, items: [
          `The person at 7 who pressed DOWN watched the car pass going up; that is correct, since it was going the wrong way for them. They boarded on the way down.`,
          `The car stopped at 5 and 9 without moving on the same tick, turned at 9 without moving, and went idle as soon as both sets were empty.`,
          `Floor 9 needed no boundary check: with nothing above it, the car simply turned.`
        ] }
      ] }
    ],
    levels: levels(
      [`An <code>Elevator</code> that tracks floor and direction, and a controller that coordinates several cars.`, `Simple dispatch (nearest car) and movement that eventually serves every stop, even if it zig-zags at first; hints toward "finish the sweep, then turn" are fine.`, `Invalid floors rejected, and a simulation that can be stepped and shown to work.`],
      [`SCAN implemented correctly with few hints, and a clean IDLE / UP / DOWN model with the right transitions.`, `The subtle ticks right: a stop doesn't move, a turn doesn't move, an empty car goes idle.`, `Knows why nearest-car dispatch is weak and can describe a better rule; controller coordinates, elevator moves itself.`, `Can say where follow-ups land: direction-aware stops change how stops are stored, not the movement loop.`],
      [`Asks "simulation or control software?" unprompted, and scopes the problem tightly.`, `Direction-aware stops with sorted sets, edge cases handled without prompting (boundaries, stop-then-turn on one floor, going idle).`, `Tiered dispatch, and names the gap a simpler rule leaves: checking that a car's stops really reach the caller.`, `Discusses trade-offs fluently (immediate dispatch vs a shared queue, floor sets vs request sets, locking vs queue hand-off) and sketches express cars or cancellation without restructuring.`]
    ),
    concepts: [
      { term: `Tick-based simulation`, def: `Time advances only when <code>step()</code> is called; each car moves at most one floor per tick.`, why: `Deterministic and testable; the same step can later run on a timer thread per car.` },
      { term: `Two sweep sets`, def: `<code>up</code> (ascending) and <code>down</code> (descending, <code>Comparator.reverseOrder()</code>); <code>ceiling(currentFloor)</code> is the next stop ahead in either.`, why: `Direction-aware stops with O(log n) "what's next?" and automatic de-duplication.` },
      { term: `Direction-aware stopping`, def: `Going up, stop for UP calls and destinations; going down, for DOWN calls and destinations.`, why: `Nobody boards a car heading the wrong way.` },
      { term: `SCAN scheduling`, def: `Keep moving while stops remain ahead, serving each one; turn when none remain.`, why: `Predictable service with few reversals; every stop is reached within two sweeps.` },
      { term: `IDLE as a state`, def: `<code>IdleState</code>, <code>MovingUpState</code> and <code>MovingDownState</code> each decide one tick and return the next state.`, why: `An empty car has an honest state, and each direction's rules live in one class.` },
      { term: `Immediate dispatch`, def: `Each hall call is assigned to a car when it arrives; the controller keeps no pending queue.`, why: `Keeps the controller simple; a shared queue is the alternative when every car is busy.` },
      { term: `Committed-first dispatch`, def: `Prefer a car moving the caller's way with a stop at or beyond them, then an idle car, then the nearest.`, why: `Avoids sending a car that will turn around before reaching the caller.` },
      { term: `Validate at the boundary`, def: `Bad floors return <code>false</code>; a request for the current floor is a no-op.`, why: `Invalid input never reaches the movement logic or breaks the simulation.` }
    ],
    interview: [
      { q: `Why ask whether it's a simulation or control software?`, a: `Real control software is driven by hardware events (a floor sensor fires, a motor stops), which is asynchronous and hard to reason about in 35 minutes. A simulation advances time with step(), one floor per tick, so behaviour is deterministic and testable, and the interview can focus on the object model and the scheduling rule. Asking shows you know the difference; the answer is nearly always "simulation".`, diff: `easy` },
      { q: `Why isn't Floor a class?`, a: `Nothing about a floor needs state or behaviour in this problem: it is a position from 0 to 9. A class would wrap an int and add nothing. If floors later gained rules (an express car serving only some floors, a restricted floor), that logic would sit on the car or the dispatcher rather than on a Floor object.`, diff: `easy` },
      { q: `What goes wrong if a car stores its stops as a set of floor numbers?`, a: `It forgets why each floor is a stop. A car going up with a stop at 6 also opens for someone at 6 who pressed DOWN, who then rides the wrong way or waits. Storing the kind of stop fixes it; two sorted sets (one per sweep direction) keep that information and also make "next stop ahead" a single ceiling call.`, diff: `medium` },
      { q: `Nearest-stop-first can travel fewer floors than SCAN. Why prefer SCAN?`, a: `Distance isn't the goal; predictable service is. Nearest-first reverses on passengers already riding, and under steady traffic it can bounce between nearby floors while a far stop waits indefinitely. SCAN finishes a sweep before turning, so a car heading toward you keeps coming and every stop is served within two sweeps.`, diff: `medium` },
      { q: `Why does a car move toward a DOWN call above it while going up, if it won't stop for it on the way?`, a: `Stopping is direction-aware but travelling is not. The car only stops for stops that match its direction, but it must still travel to every stop eventually. So when no up-stop remains ahead, it climbs to the highest DOWN call above it, turns there, and serves it going down. Without that, a DOWN call above the car would never be reached.`, diff: `medium` },
      { q: `Why not move on the same tick as a stop?`, a: `A stop is when doors open and people board; if the car removed the stop and moved in the same tick, it would leave immediately. Returning after removing the stop also lets the next tick re-check the floor, for example to turn and serve a waiting call in the other direction at the same floor.`, diff: `easy` },
      { q: `Two hall calls arrive at the same moment from different threads. What can go wrong?`, a: `Both could pick the same car based on the same snapshot, and a car's TreeSets could be changed while its thread is reading them in step(). Synchronizing requestElevator on the controller makes choose-then-add one step, and synchronizing every method that touches a car's sets on that car keeps them consistent. The alternative is a hand-off: callers only add to a concurrent queue, and the car drains it at the start of each tick, so only one thread ever touches the sets.`, diff: `hard` }
    ],
    cheatsheet: [
      { title: `Elevator in one screen`, type: `code`, lang: `java`, body: `record Request(int floor, RequestType type) {}       // PICKUP_UP, PICKUP_DOWN, DESTINATION

final class ElevatorController {
    synchronized boolean requestElevator(int floor, RequestType type);  // validate, choose car, addRequest
    boolean selectFloor(int elevatorId, int floor);                      // DESTINATION on that car
    void step();                                                         // every car steps once
}

final class Elevator implements Runnable {
    TreeSet<Integer> up;     // ascending: next up-stop = up.ceiling(currentFloor)
    TreeSet<Integer> down;   // descending: next down-stop = down.ceiling(currentFloor)
    synchronized boolean addRequest(Request r);   // bad floor false; current floor no-op; file by sweep
    synchronized void step();                     // state = state.move(this)
}
// IdleState, MovingUpState, MovingDownState: stop (no move), move one floor, or turn
// DispatchStrategy: committed car, else idle car, else nearest` },
      { title: `Follow-ups and where they land`, type: `table`, headers: [`Follow-up`, `Change`], rows: [
        [`Express car or priority floors`, `Floors a car serves; dispatch filters by them (Deep Dives)`],
        [`Cancel a request`, `Remember why each stop exists, then removeRequest (Deep Dives)`],
        [`Concurrent hall calls`, `Locks as shown, or a queue each car drains per tick (Deep Dives)`],
        [`Doors, maintenance, emergency`, `More ElevatorState classes (Deep Dives)`],
        [`Better dispatch`, `A new DispatchStrategy`],
        [`Destination dispatch`, `A new request type and a grouping dispatcher (Deep Dives)`]
      ] }
    ],
    labs: []
  });
})();
