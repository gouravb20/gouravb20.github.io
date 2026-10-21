// LLD problem breakdown: Elevator System. Format: Chapter in public/shared/notes.d.ts; shared helpers in data-part2.js.
// Imports are omitted in the code.
(function () {
const { levels, PRACTICE_TIP } = LLD_PROBLEMS_KIT;

window.DATA.chapters.push({
    id: `elevator`, part: 3, number: 4, difficulty: `hard`,
    title: `Elevator System: dispatching calls and the SCAN schedule`,
    references: [{ title: `awesome-low-level-design: Elevator System`, url: `https://github.com/ashishps1/awesome-low-level-design/blob/main/problems/elevator-system.md` }],
    source: { title: `Hello Interview: Elevator (LLD) problem breakdown`, url: `https://www.hellointerview.com/learn/low-level-design/problem-breakdowns/elevator` },
    overview: `Three elevators serve floors 0 to 9. People on a floor press UP or DOWN; people inside a car press the floors they want. The controller decides which car answers each call, and every car decides, one tick at a time, whether to stop, move or turn around. This page works the problem in interview order: clarify the requirements, find the entities, design the classes top down, implement dispatch and movement (comparing a simple, a better and a strong option at each decision), verify with a trace, then handle follow-ups. The design follows the Hello Interview breakdown: each car keeps a set of typed requests and a direction enum, moves by the <strong>SCAN</strong> schedule in one <code>step()</code>, and dispatch is a <strong>Strategy</strong>. Sorted sets and State classes come in as follow-ups, where they pay off.`,
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
          [`"Several destinations; hall calls with a direction"`, `The stops it owes, and why it owes each one`]
        ] },
        { type: `text`, html: `<p>The deferred question comes back here: <strong>how should a car store its stops?</strong> The answer decides whether <code>Request</code> becomes a type.</p>` },
        { type: `compare`, items: [
          { title: `Good: a set of floors`, tone: `warn`, html: `<p><code>Set&lt;Integer&gt;</code>. Simple, and duplicate presses collapse. But it forgets <em>why</em> a floor is a stop. A car going up with a stop at 6 also opens for someone at 6 who pressed DOWN, and they either ride the wrong way or watch it leave. Acceptable for a junior answer.</p>` },
          { title: `Great: a set of requests`, tone: `ok`, html: `<p><code>Set&lt;Request&gt;</code>, where a request is a floor plus its type: <code>PICKUP_UP</code>, <code>PICKUP_DOWN</code> or <code>DESTINATION</code>, with equality on both. Going up, the car stops only for UP calls and destinations at a floor; a DOWN call there waits for the return trip. Each request keeps its reason, so cancelling one is a single <code>remove</code>.</p>` },
          { title: `Only if the building grows: sorted sets`, tone: `info`, html: `<p>With ten floors a car owes at most about 30 requests, so scanning them each tick costs nothing. Two sorted sets (one per sweep direction) make "next stop ahead" an O(log n) lookup, but they store floors, not reasons, which complicates cancellation. Worth it for tall buildings; see Deep Dives.</p>` }
        ] },
        { type: `text`, html: `<p>We take the set of requests, so <code>Request</code> becomes a small record. The car also keeps its <strong>direction as a plain enum</strong>: UP, DOWN or IDLE. IDLE must be a real value: without it, a car with nothing to do has no honest state and drifts.</p>` },
        { type: `compare`, title: `Does direction need State classes?`, items: [
          { title: `Booleans: movingUp, idle`, tone: `bad`, html: `<p>Two flags allow nonsense combinations ("idle and moving up") and every method has to keep them in sync.</p>` },
          { title: `An enum and one step()`, tone: `ok`, html: `<p>Three values and a few branches in <code>step()</code>. Each direction has the same rules mirrored, and no state carries data of its own, so one method stays short and easy to trace. This is what we use.</p>` },
          { title: `A State class per direction`, tone: `info`, html: `<p><code>IdleState</code>, <code>MovingUpState</code>, <code>MovingDownState</code>, each deciding a tick. More classes for the same logic today; it pays off once states carry data or rules of their own, such as doors open for three ticks or a car under maintenance. See Deep Dives.</p>` }
        ] },
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
    private Direction direction;                             // UP, DOWN or IDLE
    private final Set<Request> requests;                     // the stops it owes, each with its reason

    boolean addRequest(Request r);
    void step();
    int currentFloor();
    Direction direction();
    boolean isCommittedTo(int floor, Direction dir);         // used by dispatch
}

interface DispatchStrategy { Elevator choose(List<Elevator> cars, Request call); }` },
        { type: `text`, html: `<p>The controller coordinates and never moves a car; each car moves itself and never looks at the others. Dispatch is a <strong>Strategy</strong> because "which car is best" is the part most likely to change. Everything else stays deliberately plain: an enum, a set and one method.</p>` }
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

    void step() { for (Elevator e : elevators) e.step(); }   // the simulation clock
}` },
        { type: `text`, html: `<p>The interesting part is choosing the car. Start simple, then offer to improve it: "This works; I can make it direction-aware if you'd like."</p>` },
        { type: `compare`, items: [
          { title: `Weak: nearest car`, tone: `bad`, html: `<p>Pick the closest car, whichever way it is going. Thirty seconds to write. But a car one floor above a caller who wants UP, while heading down to the lobby, gets picked; it won't stop for them going down, so they wait for the whole round trip.</p>` },
          { title: `Good: right direction, still ahead`, tone: `warn`, html: `<p>Prefer cars moving in the caller's direction that haven't passed the floor; then idle cars; then anyone. Better, but a car at 2 going up with its last stop at 3 looks perfect for an UP call at 8, and turns around at 3.</p>` },
          { title: `Strong: committed to the floor`, tone: `ok`, html: `<p>Also require a stop at or beyond the caller in that direction, so the car will really pass them: a short scan of the car's requests. Then idle cars, then the nearest.</p>` }
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
        { type: `steps`, title: `step() in five cases, checked in this order`, items: [
          `<strong>Nothing to do:</strong> no requests, so become IDLE and stay put.`,
          `<strong>Idle with requests:</strong> pick a direction toward the nearest request (lower floor on ties, so runs are repeatable). The stop check needs a direction.`,
          `<strong>A stop here:</strong> if the set holds a pickup in our direction or a destination at this floor, remove both, go IDLE if nothing is left, and don't move this tick.`,
          `<strong>Nothing ahead:</strong> if no request of any type lies ahead, turn around and don't move this tick; the next tick re-checks this floor in the new direction.`,
          `<strong>Otherwise:</strong> move one floor.`
        ] },
        { type: `code`, lang: `java`, title: `Elevator`, code: `final class Elevator {
    static final int MIN_FLOOR = 0, MAX_FLOOR = 9;
    final int id;

    // Guarded by this: button presses and the clock both reach a car.
    private int currentFloor = MIN_FLOOR;                    // every car starts on the ground floor
    private Direction direction = Direction.IDLE;
    private final Set<Request> requests = new HashSet<>();

    Elevator(int id) { this.id = id; }

    static boolean isValidFloor(int f) { return f >= MIN_FLOOR && f <= MAX_FLOOR; }

    synchronized boolean addRequest(Request r) {
        if (!isValidFloor(r.floor())) return false;          // reject, but don't throw
        if (r.floor() == currentFloor) return true;          // already here: nothing to do
        requests.add(r);                                     // the set ignores a repeated press
        return true;
    }

    synchronized void step() {
        if (requests.isEmpty()) { direction = Direction.IDLE; return; }                  // 1. nothing to do
        if (direction == Direction.IDLE) direction = towardNearest();                     // 2. pick a direction

        RequestType pickup = direction == Direction.UP ? RequestType.PICKUP_UP : RequestType.PICKUP_DOWN;
        boolean stop = requests.remove(new Request(currentFloor, pickup))
                     | requests.remove(new Request(currentFloor, RequestType.DESTINATION));   // | : remove both
        if (stop) {                                                                       // 3. stop, don't move
            if (requests.isEmpty()) direction = Direction.IDLE;
            return;
        }
        if (!hasRequestsAhead(direction)) {                                               // 4. turn, don't move
            direction = direction == Direction.UP ? Direction.DOWN : Direction.UP;
            return;
        }
        currentFloor += direction == Direction.UP ? 1 : -1;                               // 5. move
    }

    /** Any request ahead, of any type: the car travels toward every stop, even ones it won't stop for yet. */
    private boolean hasRequestsAhead(Direction dir) {
        for (Request r : requests)
            if (dir == Direction.UP ? r.floor() > currentFloor : r.floor() < currentFloor) return true;
        return false;
    }

    /** Toward the nearest request; the lower floor wins a tie, so the choice never depends on hash order. */
    private Direction towardNearest() {
        Request best = null;
        for (Request r : requests) {
            int d = Math.abs(r.floor() - currentFloor);
            if (best == null || d < Math.abs(best.floor() - currentFloor)
                    || (d == Math.abs(best.floor() - currentFloor) && r.floor() < best.floor())) best = r;
        }
        return best.floor() > currentFloor ? Direction.UP : Direction.DOWN;
    }

    synchronized int currentFloor()    { return currentFloor; }
    synchronized Direction direction() { return direction; }

    /** Sweeping in dir toward floor, with a matching stop at or beyond it, so the car will pass the caller. */
    synchronized boolean isCommittedTo(int floor, Direction dir) {
        if (direction != dir || (dir == Direction.UP ? currentFloor > floor : currentFloor < floor)) return false;
        for (Request r : requests) {
            boolean beyond = dir == Direction.UP ? r.floor() >= floor : r.floor() <= floor;
            boolean matches = r.type() == RequestType.DESTINATION
                || r.type() == (dir == Direction.UP ? RequestType.PICKUP_UP : RequestType.PICKUP_DOWN);
            if (beyond && matches) return true;
        }
        return false;
    }
}` },
        { type: `keypoints`, items: [
          `<strong>Stopping is direction-aware; travelling is not.</strong> Going up, a car stops only for <code>PICKUP_UP</code> and <code>DESTINATION</code> at a floor, but <code>hasRequestsAhead</code> counts every type, so the car still climbs to a DOWN call above it, turns there and serves it on the way down.`,
          `<strong>A stop costs a tick.</strong> Removing the stop and moving in the same tick is a classic bug: the car would leave before anyone boards.`,
          `<strong>Turning costs a tick too.</strong> After a turn, the next tick checks the current floor again in the new direction.`,
          `<strong>No boundary special cases.</strong> At floor 9 nothing is ahead going up, so the car turns; hard-coding "at 9, go down" would skip a stop at 9 itself.`,
          `<strong>Deterministic.</strong> A hash set has no order, so the only place order matters (picking a direction from idle) uses an explicit tie-break.`
        ] },
        { type: `callout`, tone: `warning`, html: `<p>Thread safety: hall calls arrive on request threads while the clock (or a thread per car) calls <code>step()</code>, and both touch the same request set, floor and direction. So <code>addRequest</code>, <code>step()</code>, <code>isCommittedTo</code> and the getters are all synchronized on the car, and <code>requestElevator</code> is synchronized on the controller so that choosing a car and adding the stop are one step. Each car has its own lock, and a car never takes the controller's lock, so there is no lock-order cycle.</p>` },
        { type: `text`, html: `<p>This follows the <a href="https://www.hellointerview.com/learn/low-level-design/problem-breakdowns/elevator" target="_blank" rel="noopener">Hello Interview breakdown</a>'s shape: a set of typed requests, a direction enum and one <code>step()</code>. The <a href="https://github.com/ashishps1/awesome-low-level-design/blob/main/solutions/java/src/elevatorsystem/Elevator.java" target="_blank" rel="noopener">awesome-low-level-design solution</a> uses two sorted sets and State classes instead; both appear in Deep Dives, for the cases where they pay off. The code here is written independently.</p>` }
      ] },
      { id: `verification`, title: `Verifying with a trace`, kicker: `Step 5: verification`, blocks: [
        { type: `text`, html: `<p>Walk one car through a concrete scenario, tick by tick, before the interviewer does. Car 0 is idle at floor 2. Someone at floor 5 has pressed UP and someone at floor 7 has pressed DOWN.</p>` },
        { type: `code`, lang: `text`, title: `Tick by tick`, code: `start    floor 2  IDLE  {5 PICKUP_UP, 7 PICKUP_DOWN}
tick  1  floor 3  UP    nearest request is 5: direction UP; nothing to stop for; move
tick  2  floor 4  UP    move
tick  3  floor 5  UP    move
tick  4  floor 5  UP    {7 PICKUP_DOWN}                  Request(5, PICKUP_UP) found: stop, don't move
         the rider presses 9: Request(9, DESTINATION)
tick  5  floor 6  UP    {7 PICKUP_DOWN, 9 DESTINATION}   move
tick  6  floor 7  UP    no PICKUP_UP or DESTINATION at 7: pass the DOWN caller; move
tick  7  floor 8  UP    move
tick  8  floor 9  UP    move
tick  9  floor 9  UP    {7 PICKUP_DOWN}                  Request(9, DESTINATION) found: stop, don't move
tick 10  floor 9  DOWN  nothing ahead going up: turn, don't move
tick 11  floor 8  DOWN  move
tick 12  floor 7  DOWN  move
tick 13  floor 7  IDLE  {}                               Request(7, PICKUP_DOWN) found: stop; nothing left, so IDLE
tick 14  floor 7  IDLE  no requests: stay idle` },
        { type: `keypoints`, items: [
          `The person at 7 who pressed DOWN watched the car pass going up; that is correct, since it was going the wrong way for them. They boarded on the way down.`,
          `The car stopped at 5 and 9 without moving on the same tick, turned at 9 without moving, and went idle the moment the set was empty.`,
          `Floor 9 needed no boundary check: with nothing above it, the car simply turned.`
        ] }
      ] }
    ],
    levels: levels(
      [`An <code>Elevator</code> that tracks floor and direction, and a controller that coordinates several cars.`, `Simple dispatch (nearest car) and movement that eventually serves every stop, even if it zig-zags at first; hints toward "finish the sweep, then turn" are fine.`, `Invalid floors rejected, and a simulation that can be stepped and shown to work.`],
      [`SCAN implemented correctly with few hints, and a clean IDLE / UP / DOWN model with the right transitions.`, `The subtle ticks right: a stop doesn't move, a turn doesn't move, an empty car goes idle.`, `Knows why nearest-car dispatch is weak and can describe a better rule; controller coordinates, elevator moves itself.`, `Can say where follow-ups land: direction-aware stops change how stops are stored, not the movement loop.`],
      [`Asks "simulation or control software?" unprompted, and scopes the problem tightly.`, `Direction-aware stops with typed requests, edge cases handled without prompting (boundaries, stop-then-turn on one floor, going idle).`, `Tiered dispatch, and names the gap a simpler rule leaves: checking that a car's stops really reach the caller.`, `Discusses trade-offs fluently (immediate dispatch vs a shared queue, a request set vs sorted sets, an enum vs State classes, locking vs queue hand-off) and sketches express cars or cancellation without restructuring.`]
    ),
    concepts: [
      { term: `Tick-based simulation`, def: `Time advances only when <code>step()</code> is called; each car moves at most one floor per tick.`, why: `Deterministic and testable; the same step can later run on a timer thread per car.` },
      { term: `Typed requests`, def: `<code>Request(floor, type)</code> with <code>PICKUP_UP</code>, <code>PICKUP_DOWN</code> or <code>DESTINATION</code>, kept in a <code>Set</code> with equality on both fields.`, why: `The car knows why it owes each stop, which makes stopping direction-aware and cancellation a single remove.` },
      { term: `Direction-aware stopping`, def: `Going up, stop for UP calls and destinations; going down, for DOWN calls and destinations.`, why: `Nobody boards a car heading the wrong way.` },
      { term: `SCAN scheduling`, def: `Keep moving while requests remain ahead, serving matching stops; turn when none remain.`, why: `Predictable service with few reversals; every stop is reached within two sweeps.` },
      { term: `IDLE as a direction`, def: `A <code>Direction</code> enum with UP, DOWN and IDLE; <code>step()</code> branches on it.`, why: `An empty car has an honest state; State classes are only worth it once states carry their own data (doors, maintenance).` },
      { term: `Immediate dispatch`, def: `Each hall call is assigned to a car when it arrives; the controller keeps no pending queue.`, why: `Keeps the controller simple; a shared queue is the alternative when every car is busy.` },
      { term: `Committed-first dispatch`, def: `Prefer a car moving the caller's way with a matching stop at or beyond them, then an idle car, then the nearest.`, why: `Avoids sending a car that will turn around before reaching the caller.` },
      { term: `Validate at the boundary`, def: `Bad floors return <code>false</code>; a request for the current floor is a no-op.`, why: `Invalid input never reaches the movement logic or breaks the simulation.` }
    ],
    interview: [
      { q: `Why ask whether it's a simulation or control software?`, a: `Real control software is driven by hardware events (a floor sensor fires, a motor stops), which is asynchronous and hard to reason about in 35 minutes. A simulation advances time with step(), one floor per tick, so behaviour is deterministic and testable, and the interview can focus on the object model and the scheduling rule. Asking shows you know the difference; the answer is nearly always "simulation".`, diff: `easy` },
      { q: `Why isn't Floor a class?`, a: `Nothing about a floor needs state or behaviour in this problem: it is a position from 0 to 9. A class would wrap an int and add nothing. If floors later gained rules (an express car serving only some floors, a restricted floor), that logic would sit on the car or the dispatcher rather than on a Floor object.`, diff: `easy` },
      { q: `What goes wrong if a car stores its stops as a set of floor numbers?`, a: `It forgets why each floor is a stop. A car going up with a stop at 6 also opens for someone at 6 who pressed DOWN, who then rides the wrong way or waits. Storing Request(floor, type) fixes it: going up, the car stops only for PICKUP_UP and DESTINATION at a floor.`, diff: `medium` },
      { q: `Why a direction enum rather than a State class per direction?`, a: `The three directions follow the same rules mirrored, and none carries data of its own, so one step() with a few branches is shorter and easier to trace than three classes. State classes earn their place when states have their own data or rules, for example doors that stay open for three ticks, or a car under maintenance that ignores calls. That is the point to introduce them.`, diff: `medium` },
      { q: `Would you use a TreeSet for the stops?`, a: `Not at first. With ten floors a car owes at most about 30 requests, so scanning a HashSet each tick is effectively free, and typed requests make cancellation trivial. For a tall building or heavy traffic, two sorted sets (up stops ascending, down stops descending) turn "next stop ahead" and the dispatch check into O(log n) lookups; the cost is that floor-only sets forget why a stop exists, so cancellation needs extra bookkeeping.`, diff: `medium` },
      { q: `Nearest-stop-first can travel fewer floors than SCAN. Why prefer SCAN?`, a: `Distance isn't the goal; predictable service is. Nearest-first reverses on passengers already riding, and under steady traffic it can bounce between nearby floors while a far stop waits indefinitely. SCAN finishes a sweep before turning, so a car heading toward you keeps coming and every stop is served within two sweeps.`, diff: `medium` },
      { q: `Why does hasRequestsAhead count requests the car won't stop for?`, a: `Stopping is direction-aware but travelling is not. A DOWN call above a car going up must still be reached; if the car only looked for UP calls and destinations ahead, it would turn early and that caller would wait for the next sweep, or forever. So the car travels toward any request and only stops for matching ones.`, diff: `medium` },
      { q: `Two hall calls arrive at the same moment from different threads. What can go wrong?`, a: `Both could pick the same car from the same snapshot, and a car's request set could change while step() is iterating it. Synchronizing requestElevator on the controller makes choose-then-add one step, and synchronizing every method that touches a car's set on that car keeps it consistent. The alternative is a hand-off: callers add to a concurrent queue and the car drains it at the start of each tick, so only one thread touches the set.`, diff: `hard` }
    ],
    cheatsheet: [
      { title: `Elevator in one screen`, type: `code`, lang: `java`, body: `record Request(int floor, RequestType type) {}       // PICKUP_UP, PICKUP_DOWN, DESTINATION

final class ElevatorController {
    synchronized boolean requestElevator(int floor, RequestType type);  // validate, choose car, addRequest
    boolean selectFloor(int elevatorId, int floor);                      // DESTINATION on that car
    void step();                                                         // every car steps once
}

final class Elevator {
    int currentFloor; Direction direction; Set<Request> requests;        // guarded by this
    synchronized boolean addRequest(Request r);   // bad floor false; current floor no-op; else add
    synchronized void step();   // empty: IDLE | idle: toward nearest | stop here: remove, no move
                                // | nothing ahead: turn, no move | else move one floor
}
// DispatchStrategy: committed car, else idle car, else nearest` },
      { title: `Follow-ups and where they land`, type: `table`, headers: [`Follow-up`, `Change`], rows: [
        [`Express car or priority floors`, `Floors a car serves; dispatch filters by them (Deep Dives)`],
        [`Cancel a request`, `removeRequest: one remove from the set (Deep Dives)`],
        [`Concurrent hall calls`, `Locks as shown, or a queue each car drains per tick (Deep Dives)`],
        [`Tall building, heavy traffic`, `Two sorted sets per car (Deep Dives)`],
        [`Doors, maintenance, emergency`, `State classes behind one interface (Deep Dives)`],
        [`Better dispatch`, `A new DispatchStrategy`],
        [`Destination dispatch`, `A new request type and a grouping dispatcher (Deep Dives)`]
      ] }
    ],
    labs: []
  });
})();
