// LLD problem breakdowns, part 2: the practice set. Six problems with requirements, working Java solutions and the
// follow-ups interviewers usually ask: Parking Lot, Elevator, LRU Cache, Splitwise, Vending Machine and Pub-Sub.
// Imports are omitted in the code: java.util.*, java.util.concurrent.*, java.time.*.
(function () {
const PRACTICE_TIP = `<p><strong>How to practise this problem:</strong> read only the requirements, then build the solution yourself in 45 minutes: clarify (5), entities (5), public API (5), core code (20), follow-ups (10). Then compare with the Solution tab and note what you missed, and redo it from a blank file a few days later. Imports are omitted in the code: <code>java.util.*</code>, <code>java.util.concurrent.*</code>, <code>java.time.*</code>.</p>`;

/** @type {Cheatsheet} */
const PATTERN_TABLE = { title: `Practice set: patterns at a glance`, type: `table`, headers: [`Problem`, `Main patterns`, `Core skill tested`], rows: [
  [`Parking Lot`, `Strategy`, `Pricing and allocation behind interfaces, atomic spot claiming`],
  [`Elevator`, `State, Strategy`, `Scheduling and direction state`],
  [`LRU Cache`, `Data structures`, `O(1) design, generics, locking`],
  [`Splitwise`, `Strategy`, `Money handling, balance bookkeeping`],
  [`Vending Machine`, `State`, `Transitions and invalid actions`],
  [`Pub-Sub`, `Observer`, `Async delivery, failure isolation`]
] };

/** @param {string[]} mid @param {string[]} senior @param {string[]} staff @returns {DeepSection[]} */
const levels = (mid, senior, staff) => [
  { id: `mid`, title: `Mid-level`, kicker: `What is expected`, blocks: [{ type: `keypoints`, title: `You should drive`, items: mid }] },
  { id: `senior`, title: `Senior`, kicker: `What is expected`, blocks: [{ type: `keypoints`, title: `You should drive`, items: senior }] },
  { id: `staff`, title: `Staff and above`, kicker: `What is expected`, blocks: [{ type: `keypoints`, title: `You should drive`, items: staff }] }
];

window.DATA.chapters.push(
  // ====================================================================== Parking Lot
  {
    id: `parking-lot`, part: 1, number: 3, difficulty: `easy`,
    title: `Parking Lot: swappable pricing and allocation, safe under concurrency`,
    overview: `Spots by vehicle type, a ticket on entry and a fee on exit. The interesting parts are what varies (how fees are computed, how a spot is chosen) and what must never happen (two cars claiming the same spot). The design puts pricing and allocation behind <strong>Strategy</strong> interfaces and claims spots with an <strong>atomic</strong> <code>tryOccupy()</code>, so concurrent entries can't race.`,
    problem: [
      { id: `requirements`, title: `What we are building`, kicker: `Requirements`, blocks: [
        { type: `list`, title: `Requirements`, items: [
          `Spots by vehicle type: motorcycle, car, truck.`,
          `<code>park</code> returns a ticket; <code>unpark</code> takes the ticket and returns the fee.`,
          `Pricing and spot selection must be swappable.`,
          `Safe under concurrent entries: two cars never get the same spot.`
        ] },
        { type: `callout`, tone: `tip`, html: PRACTICE_TIP }
      ] },
      { id: `clarifying`, title: `Questions worth asking`, kicker: `Clarifying`, blocks: [
        { type: `table`, headers: [`Ask`, `Assume`, `Decides`], rows: [
          [`Can a car use a larger spot?`, `No, exact type to start (a follow-up)`, `Allocation rule`],
          [`How is the fee computed?`, `Per started hour, rate by vehicle type, minimum one hour`, `The first pricing strategy`],
          [`Floors, gates, displays?`, `One area to start; floors and boards are follow-ups`, `Entities stay small`],
          [`Payment?`, `Out of scope: return the fee`, `No payment classes`],
          [`Several entry gates at once?`, `Yes`, `Atomic spot claiming`]
        ] }
      ] }
    ],
    solution: [
      { id: `design`, title: `Design`, kicker: `Entities and API`, blocks: [
        { type: `keypoints`, items: [
          `<code>ParkingSpot</code>, <code>Ticket</code>, and <code>ParkingLot</code> as the entry point.`,
          `<code>PricingStrategy</code> and <code>SpotAllocationStrategy</code> interfaces (Strategy pattern): new rules are new classes.`,
          `A spot is claimed with an atomic <code>tryOccupy()</code>, so two cars can never get the same spot (no check-then-act race).`,
          `Money is a <code>long</code> number of cents, and time comes from an injected <code>Clock</code> so fees can be tested.`
        ] },
        { type: `code`, lang: `java`, title: `Public API`, code: `Ticket park(String plate, VehicleType type);   // throws if no spot is free
long unpark(String ticketId);                  // fee in cents; throws for an invalid or used ticket` }
      ] },
      { id: `code`, title: `Working code`, kicker: `Implementation`, blocks: [
        { type: `code`, lang: `java`, title: `Spots and tickets`, code: `enum VehicleType { MOTORCYCLE, CAR, TRUCK }

class ParkingSpot {
    final String id;
    final VehicleType type;
    private boolean occupied;

    ParkingSpot(String id, VehicleType type) { this.id = id; this.type = type; }

    synchronized boolean tryOccupy() {
        if (occupied) return false;
        occupied = true;
        return true;
    }
    synchronized void free() { occupied = false; }
}

class Ticket {
    final String id = UUID.randomUUID().toString();
    final ParkingSpot spot;
    final String plate;
    final Instant entry;

    Ticket(ParkingSpot spot, String plate, Instant entry) {
        this.spot = spot; this.plate = plate; this.entry = entry;
    }
}` },
        { type: `code`, lang: `java`, title: `Pricing and allocation strategies`, code: `interface PricingStrategy { long fee(Ticket ticket, Instant exit); }   // cents

class HourlyPricing implements PricingStrategy {
    private final Map<VehicleType, Long> centsPerHour;

    HourlyPricing(Map<VehicleType, Long> centsPerHour) { this.centsPerHour = centsPerHour; }

    public long fee(Ticket t, Instant exit) {
        long minutes = Duration.between(t.entry, exit).toMinutes();
        long hours = Math.max(1, (minutes + 59) / 60);   // round up, minimum one hour
        return hours * centsPerHour.get(t.spot.type);
    }
}

interface SpotAllocationStrategy {
    List<ParkingSpot> candidates(List<ParkingSpot> all, VehicleType type);
}

class FirstFitAllocation implements SpotAllocationStrategy {
    public List<ParkingSpot> candidates(List<ParkingSpot> all, VehicleType type) {
        List<ParkingSpot> out = new ArrayList<>();
        for (ParkingSpot s : all) if (s.type == type) out.add(s);
        return out;
    }
}` },
        { type: `code`, lang: `java`, title: `ParkingLot`, code: `class ParkingLot {
    private final List<ParkingSpot> spots;
    private final SpotAllocationStrategy allocation;
    private final PricingStrategy pricing;
    private final Clock clock;
    private final Map<String, Ticket> active = new ConcurrentHashMap<>();

    ParkingLot(List<ParkingSpot> spots, SpotAllocationStrategy allocation, PricingStrategy pricing, Clock clock) {
        this.spots = spots; this.allocation = allocation; this.pricing = pricing; this.clock = clock;
    }

    Ticket park(String plate, VehicleType type) {
        for (ParkingSpot s : allocation.candidates(spots, type)) {
            if (s.tryOccupy()) {                       // atomic claim
                Ticket t = new Ticket(s, plate, clock.instant());
                active.put(t.id, t);
                return t;
            }
        }
        throw new IllegalStateException("No free spot for " + type);
    }

    long unpark(String ticketId) {
        Ticket t = active.remove(ticketId);            // null if invalid or already used
        if (t == null) throw new IllegalArgumentException("Invalid ticket");
        long fee = pricing.fee(t, clock.instant());
        t.spot.free();
        return fee;
    }
}` },
        { type: `callout`, tone: `insight`, html: `<p><code>active.remove(ticketId)</code> is atomic, so a ticket can be redeemed exactly once even if two exits scan it at the same moment. The spot lock and the map do all the concurrency work; <code>ParkingLot</code> itself needs no lock.</p>` }
      ] },
      { id: `walkthrough`, title: `Walking through it`, kicker: `Check it works`, blocks: [
        { type: `steps`, items: [
          `Two cars arrive at two gates. Both get the same candidate list; both call <code>tryOccupy()</code> on spot C1. One gets <code>true</code>, the other <code>false</code> and moves on to C2.`,
          `<code>unpark</code> after 61 minutes: (61 + 59) / 60 = 2 hours, times the car rate.`,
          `Scanning the same ticket twice: the second <code>remove</code> returns null, so it throws instead of freeing a spot twice.`,
          `A new pricing rule (weekend flat rate) is a new <code>PricingStrategy</code> passed to the constructor; <code>ParkingLot</code> doesn't change.`
        ] }
      ] }
    ],
    levels: levels(
      [`Entities, the two-method API and a working park/unpark.`, `A pricing method that rounds up hours correctly.`, `Seeing that two gates can race for one spot.`],
      [`Strategies for pricing and allocation, introduced because the requirement says swappable.`, `Atomic claiming with <code>tryOccupy()</code> and single-use tickets via <code>remove</code>.`, `Money in cents and an injected clock; the O(n) scan and the free-queue fix.`],
      [`Floors, gates and displays without touching core classes (strategies, Observer).`, `Moving state to a database: a conditional <code>UPDATE ... WHERE occupied = false</code> as the atomic claim.`, `Operational edge cases: lost tickets, reservations, gate failures.`]
    ),
    concepts: [
      { term: `Strategy pattern`, def: `Interchangeable algorithms behind one interface: <code>PricingStrategy</code>, <code>SpotAllocationStrategy</code>.`, why: `The requirement says pricing and selection must be swappable; new rules become new classes.` },
      { term: `Atomic claim (tryOccupy)`, def: `Check-and-set the spot's state inside one synchronized method that returns whether it succeeded.`, why: `Removes the check-then-act race where two cars both see a spot free.` },
      { term: `Single-use ticket`, def: `Active tickets live in a <code>ConcurrentHashMap</code>; <code>remove</code> returns the ticket only to the first caller.`, why: `Prevents double exit and double freeing.` },
      { term: `Fee rounding`, def: `Charge per started hour: <code>(minutes + 59) / 60</code>, with a minimum of one.`, why: `Integer arithmetic avoids floating-point surprises; say the rounding rule out loud.` },
      { term: `Money as long cents`, def: `Store and compute fees in the smallest currency unit.`, why: `<code>double</code> can't represent most decimal amounts exactly.` },
      { term: `Injected Clock`, def: `Pass a <code>java.time.Clock</code> to the lot instead of calling <code>Instant.now()</code>.`, why: `Tests can fix time and check fees deterministically.` },
      { term: `Free-spot queues`, def: `Keep a concurrent queue of free spots per vehicle type; park polls, unpark offers.`, why: `Turns the O(n) scan into O(1) and is still atomic.` }
    ],
    interview: [
      { q: `How do you make sure two cars never get the same spot?`, a: `Make the claim atomic. Each spot has a synchronized tryOccupy() that checks and sets occupied in one step and returns whether it won. park() walks the candidates and takes the first spot whose tryOccupy() succeeds. A car that loses the race just tries the next spot. A ConcurrentLinkedQueue of free spots per type gives the same guarantee with O(1) poll.`, diff: `medium` },
      { q: `Why put pricing behind an interface?`, a: `The requirement says pricing must be swappable, and pricing rules change often: hourly, flat weekend, early bird, member discounts. With a PricingStrategy, each rule is a class and the lot depends only on the interface, so adding a rule never edits ParkingLot (open/closed). If there were only ever one rule I'd keep it as a method.`, diff: `easy` },
      { q: `How would you support multiple floors and nearest-to-entrance allocation?`, a: `Give each spot a floor and a distance to the entrance, and add a NearestFirstAllocation strategy that returns candidates sorted by distance. ParkingLot is unchanged. For speed, keep a priority queue of free spots per type ordered by distance.`, diff: `medium` },
      { q: `What changes if a car may use a larger spot when small ones are full?`, a: `Only the allocation strategy: return candidates of the exact type first, then the next sizes up (car, then truck spots). Pricing stays based on the vehicle, not the spot, which is worth stating.`, diff: `easy` },
      { q: `How would you show free spots per floor on a display board?`, a: `Observer: spots (or the lot) publish an event when a spot is taken or freed, and display boards subscribe and update their counters. The lot doesn't know about displays. Use a thread-safe listener list and keep listeners fast or hand events to an executor.`, diff: `medium` }
    ],
    cheatsheet: [
      PATTERN_TABLE,
      { title: `Parking lot in one screen`, type: `code`, lang: `java`, body: `class ParkingSpot { synchronized boolean tryOccupy(); synchronized void free(); }
class Ticket { String id; ParkingSpot spot; String plate; Instant entry; }
interface PricingStrategy { long fee(Ticket t, Instant exit); }
interface SpotAllocationStrategy { List<ParkingSpot> candidates(List<ParkingSpot> all, VehicleType type); }
class ParkingLot {
    Map<String, Ticket> active = new ConcurrentHashMap<>();
    Ticket park(String plate, VehicleType type);   // first candidate whose tryOccupy() succeeds
    long unpark(String ticketId);                  // active.remove() makes tickets single-use
}` }
    ],
    labs: []
  },

  // ====================================================================== Elevator
  {
    id: `elevator`, part: 3, number: 4, difficulty: `hard`,
    title: `Elevator System: dispatching calls and the SCAN schedule`,
    source: { title: `Hello Interview: Elevator (LLD) problem breakdown`, url: `https://www.hellointerview.com/learn/low-level-design/problem-breakdowns/elevator` },
    overview: `N elevators serve F floors. Passengers press hall buttons (floor and direction) and cabin buttons (destination). The controller must send each hall call to the best elevator, and each elevator must serve its stops in a sensible order. Each elevator keeps two sorted sets, stops on the way up and stops on the way down, and follows the <strong>SCAN</strong> idea: keep going while stops remain ahead, then reverse. Its direction is a <strong>State</strong> (Idle, MovingUp, MovingDown) that decides each step, displays follow it as <strong>Observers</strong>, and each car runs on its own thread. Dispatch is a cost function, which makes it a natural <strong>Strategy</strong>.`,
    problem: [
      { id: `requirements`, title: `What we are building`, kicker: `Requirements`, blocks: [
        { type: `list`, title: `Requirements`, items: [
          `N elevators and F floors.`,
          `Hall calls (floor + direction) and cabin selections (destination floor).`,
          `Dispatch each hall call to the best elevator.`,
          `Elevators move one floor per tick.`
        ] },
        { type: `callout`, tone: `tip`, html: PRACTICE_TIP }
      ] },
      { id: `clarifying`, title: `Questions worth asking`, kicker: `Clarifying`, blocks: [
        { type: `table`, headers: [`Ask`, `Assume`, `Decides`], rows: [
          [`How is time modelled?`, `Each car runs on its own thread, one floor per second; tests call tick() instead`, `A Runnable per car, plus a deterministic step()`],
          [`What does "best elevator" mean?`, `Lowest cost: closest, preferring ones already heading that way`, `The dispatch cost function`],
          [`Door timing, weight, emergencies?`, `Out of scope to start`, `Fewer states`],
          [`Do hall calls know their destination?`, `No, up/down buttons only`, `Destination dispatch is a follow-up`],
          [`Should a car going up stop for someone who pressed DOWN?`, `No: stops are direction-aware`, `Two TreeSets: stops on the way up and stops on the way down`],
          [`Invalid floors? A call for the floor the car is on?`, `Reject out-of-range floors; a cabin press for the current floor is already served`, `Validation in addRequest`],
          [`Simulation or real control software?`, `Both: cars run on threads, and tests drive tick() by hand`, `Deterministic, testable movement`]
        ] },
        { type: `callout`, tone: `insight`, html: `<p>Asking "simulation or real control software?" is worth it. Real elevators react to hardware events (a floor sensor fires, a motor stops); interviews want the logic to be testable. Put one step of movement in <code>step()</code>: a car's thread calls it every second, and a test calls it directly.</p>` }
      ] }
    ],
    solution: [
      { id: `design`, title: `Design`, kicker: `Entities and API`, blocks: [
        { type: `keypoints`, items: [
          `<strong>Two TreeSets per elevator.</strong> <code>up</code> holds floors to stop at on the way up (UP hall calls, cabin floors above) in ascending order; <code>down</code> holds floors to stop at on the way down in <em>descending</em> order. In both, <code>ceiling(floor)</code> is the next stop ahead, so SCAN is one O(log n) call either way, and a car going up never stops for someone who pressed DOWN.`,
          `<strong>Direction is a State.</strong> <code>IdleState</code>, <code>MovingUpState</code> and <code>MovingDownState</code> each decide what one step does and which state comes next; doors and maintenance are more states (Deep Dives).`,
          `<strong>Observers</strong> (floor displays, dashboards) get an immutable status after every step. <code>ElevatorController</code> picks a car for each hall call through a <strong>DispatchStrategy</strong>.`,
          `<strong>Each car is a Runnable</strong> that calls <code>step()</code> once a second on its own thread; tests call <code>tick()</code> to step every car by hand.`
        ] },
        { type: `code`, lang: `java`, title: `Public API`, code: `void requestElevator(int floor, Direction dir);   // hall button
void selectFloor(int elevatorId, int floor);      // cabin button
void addObserver(ElevatorObserver observer);      // per elevator: displays, dashboards
void start(ExecutorService pool);                 // run each car on its own thread
void tick();                                      // or advance every car one step (tests)` }
      ] },
      { id: `code`, title: `Working code`, kicker: `Implementation`, blocks: [
        { type: `code`, lang: `java`, title: `Elevator`, code: `enum Direction { UP, DOWN, IDLE }
enum Source { HALL, CABIN }

/** A hall call carries a direction; a cabin call's direction follows from where the car is. */
record Request(int floor, Direction direction, Source source) {
    static Request hall(int floor, Direction d) { return new Request(floor, d, Source.HALL); }
    static Request cabin(int floor)             { return new Request(floor, Direction.IDLE, Source.CABIN); }
}

record ElevatorStatus(int id, int floor, Direction direction) {}
interface ElevatorObserver { void onUpdate(ElevatorStatus status); }   // floor displays, a monitoring dashboard

final class Elevator implements Runnable {
    static final int MIN_FLOOR = 0, MAX_FLOOR = 9;
    final int id;

    // Guarded by this. Stops on the way up in ascending order, stops on the way down in
    // descending order, so in both sets ceiling(floor) is "the next stop ahead".
    final TreeSet<Integer> up = new TreeSet<>();
    final TreeSet<Integer> down = new TreeSet<>(Comparator.reverseOrder());
    int floor = MIN_FLOOR;
    private ElevatorState state = new IdleState();

    private final List<ElevatorObserver> observers = new CopyOnWriteArrayList<>();
    private volatile boolean running = true;

    Elevator(int id) { this.id = id; }

    void addObserver(ElevatorObserver o) { observers.add(o); }

    synchronized void addRequest(Request r) {
        if (r.floor() < MIN_FLOOR || r.floor() > MAX_FLOOR) throw new IllegalArgumentException("No floor " + r.floor());
        if (r.source() == Source.HALL) (r.direction() == Direction.UP ? up : down).add(r.floor());
        else if (r.floor() > floor) up.add(r.floor());
        else if (r.floor() < floor) down.add(r.floor());      // a cabin press for this floor is already served
    }

    /** One tick: the state decides and moves under the lock; observers hear about it after the lock is released. */
    void step() {
        ElevatorStatus now;
        synchronized (this) {
            state = state.move(this);
            now = new ElevatorStatus(id, floor, state.direction());
        }
        for (ElevatorObserver o : observers) o.onUpdate(now);
    }

    @Override public void run() {                          // one thread per car when running for real
        while (running) {
            step();
            try { Thread.sleep(1_000); }                    // one floor per second
            catch (InterruptedException e) { Thread.currentThread().interrupt(); return; }
        }
    }

    void shutdown() { running = false; }

    synchronized int cost(int reqFloor, Direction reqDir) {
        int distance = Math.abs(reqFloor - floor);
        Direction dir = state.direction();
        if (dir == Direction.IDLE) return distance;
        boolean onTheWay = dir == reqDir && (dir == Direction.UP ? reqFloor >= floor : reqFloor <= floor);
        return onTheWay ? distance : distance + 100;        // penalty if it must turn around first
    }
}` },
        { type: `code`, lang: `java`, title: `Direction states: Idle, MovingUp, MovingDown`, code: `/** The State pattern: each state decides one tick of movement. Called only from Elevator.step(), under its lock. */
interface ElevatorState {
    Direction direction();
    ElevatorState move(Elevator e);
}

final class IdleState implements ElevatorState {
    public Direction direction() { return Direction.IDLE; }
    public ElevatorState move(Elevator e) {
        if (e.up.ceiling(e.floor) != null)   return new MovingUpState();     // up-stops at or above
        if (e.down.ceiling(e.floor) != null) return new MovingDownState();   // down-stops at or below
        if (!e.up.isEmpty())   return new MovingDownState();                 // only UP calls below: go down to them
        if (!e.down.isEmpty()) return new MovingUpState();                   // only DOWN calls above: go up to them
        return this;
    }
}

final class MovingUpState implements ElevatorState {
    public Direction direction() { return Direction.UP; }
    public ElevatorState move(Elevator e) {
        Integer next = e.up.ceiling(e.floor);                 // the next up-stop ahead
        if (next != null) {
            if (next == e.floor) e.up.remove(next);           // doors open here this tick
            else e.floor++;
            return this;
        }
        if (!e.down.isEmpty() && e.down.first() > e.floor) {  // the highest DOWN call is above: go there, then turn
            e.floor++;
            return this;
        }
        return e.up.isEmpty() && e.down.isEmpty() ? new IdleState() : new MovingDownState();
    }
}

final class MovingDownState implements ElevatorState {
    public Direction direction() { return Direction.DOWN; }
    public ElevatorState move(Elevator e) {
        Integer next = e.down.ceiling(e.floor);               // reversed order: the highest down-stop at or below
        if (next != null) {
            if (next == e.floor) e.down.remove(next);
            else e.floor--;
            return this;
        }
        if (!e.up.isEmpty() && e.up.first() < e.floor) {      // the lowest UP call is below: go there, then turn
            e.floor--;
            return this;
        }
        return e.up.isEmpty() && e.down.isEmpty() ? new IdleState() : new MovingUpState();
    }
}` },
        { type: `code`, lang: `java`, title: `ElevatorController`, code: `interface DispatchStrategy { Elevator choose(List<Elevator> cars, int floor, Direction dir); }

final class LowestCostDispatch implements DispatchStrategy {
    public Elevator choose(List<Elevator> cars, int floor, Direction dir) {
        return Collections.min(cars, Comparator.comparingInt(e -> e.cost(floor, dir)));
    }
}

final class ElevatorController {
    private final List<Elevator> elevators;                // elevator i has id i; the list never changes
    private final DispatchStrategy dispatch;

    ElevatorController(List<Elevator> elevators, DispatchStrategy dispatch) {
        this.elevators = List.copyOf(elevators);
        this.dispatch = dispatch;
    }

    void requestElevator(int floor, Direction dir) {       // hall button
        dispatch.choose(elevators, floor, dir).addRequest(Request.hall(floor, dir));
    }

    void selectFloor(int elevatorId, int floor) {          // cabin button
        elevators.get(elevatorId).addRequest(Request.cabin(floor));
    }

    void tick() { for (Elevator e : elevators) e.step(); }                  // tests: deterministic, no threads

    void start(ExecutorService pool) { elevators.forEach(pool::execute); }  // for real: one thread per car
    void stop() { elevators.forEach(Elevator::shutdown); }
}` },
        { type: `callout`, tone: `insight`, html: `<p>Why two <code>TreeSet</code>s, one reversed? SCAN asks one question: "what is the next stop ahead of me in this direction?" Sorting <code>down</code> in descending order makes that <code>ceiling(floor)</code> in both sets, in O(log n), and sets ignore repeated presses of the same button. Keeping the sets separate is what makes stops direction-aware: a DOWN call at floor 7 sits in <code>down</code>, so a car passing 7 on its way up doesn't stop for it.</p>` },
        { type: `callout`, tone: `warning`, html: `<p>Thread safety: button presses arrive on request threads while each car's own thread runs <code>step()</code>. Both touch the same <code>TreeSet</code>s, floor and state, so <strong>both</strong> happen under the elevator's lock: <code>addRequest</code> is synchronized and <code>step()</code> runs <code>state.move</code> inside <code>synchronized (this)</code>. A common version of this design synchronizes only <code>addRequest</code> and lets the elevator thread move unlocked, which lets a press change a <code>TreeSet</code> while <code>move</code> is reading it. Observers live in a <code>CopyOnWriteArrayList</code> and are told after the lock is released, with an immutable <code>ElevatorStatus</code>, so a slow display can't stall the car.</p>` },
        { type: `text`, html: `<p>The structure (two TreeSets with the down set reversed, direction states, Observer, a Runnable per car) follows the <a href="https://github.com/ashishps1/awesome-low-level-design/blob/main/solutions/java/src/elevatorsystem/Elevator.java" target="_blank" rel="noopener">awesome-low-level-design elevator solution</a>; the code here is written independently, with every shared field guarded by the elevator's lock.</p>` }
      ] },
      { id: `walkthrough`, title: `Walking through it`, kicker: `Check it works`, blocks: [
        { type: `steps`, items: [
          `Elevator 0 is idle at floor 0. A hall call at floor 5 going UP costs 5 for it, so 5 goes into its <code>up</code> set; on the next step <code>IdleState</code> sees an up-stop ahead and returns <code>MovingUpState</code>.`,
          `On the way, a passenger selects floor 3. It is above the car, so it joins <code>up</code>; <code>up.ceiling(2)</code> is now 3, so the car stops at 3 first, then continues to 5.`,
          `At 5, someone selects floor 1. It is below, so it joins <code>down</code>. Nothing is left in <code>up</code> and no DOWN call is above, so <code>MovingUpState</code> returns <code>MovingDownState</code>, and <code>down.ceiling(5)</code> (descending) is 1.`,
          `Meanwhile a hall call at floor 4 going UP: elevator 0 is going DOWN past it, so it pays the +100 penalty, and an idle elevator wins the call.`,
          `After every step each car tells its observers, for example the lobby display, its floor and direction.`
        ] }
      ] }
    ],
    levels: levels(
      [`Elevator and controller classes, a working tick, stops served in a sensible order.`, `A simple dispatch rule (nearest idle or on-the-way elevator).`],
      [`SCAN with a sorted set and a clear explanation of reversal.`, `Dispatch as a replaceable cost function (Strategy).`, `Thread safety between button presses and ticks.`, `Modelling doors and maintenance as states.`],
      [`Cost functions that consider remaining stops and load; zoning and express cars.`, `Destination dispatch and why it improves throughput.`, `Starvation: making sure a far floor is eventually served.`]
    ),
    concepts: [
      { term: `SCAN scheduling`, def: `Keep moving in the current direction while there are stops ahead; reverse when none remain.`, why: `Serves stops in a sweep instead of zig-zagging, like a disk arm.` },
      { term: `Two TreeSets of stops`, def: `<code>up</code> ascending and <code>down</code> descending (<code>Comparator.reverseOrder()</code>); <code>ceiling(floor)</code> is the next stop ahead in either.`, why: `O(log n) next-stop queries, automatic de-duplication, and stops that respect the caller's direction.` },
      { term: `Dispatch cost function`, def: `A number per elevator for a call: distance, plus a penalty if it must turn around first.`, why: `Makes "best elevator" explicit and swappable (Strategy).` },
      { term: `Hall call vs cabin call`, def: `A hall call has a floor and a direction and can go to any car; a cabin call belongs to one car.`, why: `Only hall calls need dispatch.` },
      { term: `Tick-based simulation`, def: `Time advances in discrete steps driven by a scheduler.`, why: `Deterministic and easy to test.` },
      { term: `State pattern for direction`, def: `<code>IdleState</code>, <code>MovingUpState</code>, <code>MovingDownState</code>; each decides one step and returns the next state. Doors and maintenance add more states.`, why: `Keeps each direction's rules in one class instead of if-chains on a direction field.` },
      { term: `Observer for displays`, def: `Observers receive an immutable <code>ElevatorStatus</code> after each step, outside the lock.`, why: `Displays and dashboards plug in without touching movement, and can't stall a car.` },
      { term: `A thread per car`, def: `Each <code>Elevator</code> is a <code>Runnable</code> that calls <code>step()</code> every second; tests call <code>tick()</code> instead.`, why: `Cars move independently, and the same logic stays deterministic under test.` }
    ],
    interview: [
      { q: `How does an elevator decide where to go next?`, a: `It keeps two sorted sets: stops on the way up (ascending) and stops on the way down (descending). Moving up, the next target is up.ceiling(floor), the smallest up-stop at or above; moving down, down.ceiling(floor), which with the reversed order is the largest down-stop at or below. If none is ahead, it still travels to the farthest call in the other set that lies ahead, then turns. That is SCAN, also called the elevator algorithm.`, diff: `easy` },
      { q: `Why keep a separate set for down-stops, sorted in reverse?`, a: `Separate sets keep the caller's direction: a DOWN call at 7 is in the down set, so a car passing 7 on its way up doesn't stop for it. Reversing the down set's order means the same call, ceiling(floor), returns the next stop ahead in both directions, so the two moving states are mirror images.`, diff: `medium` },
      { q: `How do you choose which elevator answers a hall call?`, a: `Compute a cost for each elevator and pick the minimum. A simple cost is the distance, with a big penalty when the elevator is moving away or in the other direction, so it would have to turn around first. Because the rule is likely to change, I put it behind a dispatch strategy.`, diff: `medium` },
      { q: `What concurrency issues exist here?`, a: `Each car's thread runs step() while button presses arrive on request threads, and both touch the same TreeSets, floor and state. TreeSet isn't thread-safe, so addRequest, cost and the state's move all run under the elevator's lock; synchronizing only addRequest is a classic bug, because the car's thread would read the sets unlocked. Observers are kept in a CopyOnWriteArrayList and notified after the lock is released, with an immutable status. Each car has its own lock, so cars never block each other, and the controller's list of cars never changes, so it needs no lock.`, diff: `medium` },
      { q: `How would you improve the cost function?`, a: `Count the stops the elevator must serve before reaching the caller, not just distance; add load or weight; prefer cars already stopping at that floor; and age requests so none waits forever. Each variant is a new strategy class.`, diff: `hard` },
      { q: `What is destination dispatch?`, a: `Passengers enter their destination in the lobby instead of pressing up or down. The system knows origin and destination for every passenger and groups people going to nearby floors into the same car, which cuts stops per trip. The controller assigns a car and tells the passenger which one to take.`, diff: `medium` }
    ],
    cheatsheet: [
      { title: `Elevator in one screen`, type: `code`, lang: `java`, body: `final class Elevator implements Runnable {
    TreeSet<Integer> up;                           // ascending: next up-stop = up.ceiling(floor)
    TreeSet<Integer> down;                         // descending: next down-stop = down.ceiling(floor)
    int floor; ElevatorState state;                // all guarded by this
    synchronized void addRequest(Request r);       // HALL by its direction, CABIN by above or below
    void step();                                   // state = state.move(this) under the lock; notify after
    public void run();                             // step() every second on its own thread
}
interface ElevatorState { Direction direction(); ElevatorState move(Elevator e); }
// IdleState, MovingUpState, MovingDownState: serve stops ahead, travel to the far call, then turn
interface DispatchStrategy { Elevator choose(List<Elevator> cars, int floor, Direction dir); }` },
      { title: `Follow-ups and where they land`, type: `table`, headers: [`Follow-up`, `Change`], rows: [
        [`Doors, maintenance, emergency`, `More ElevatorState classes`],
        [`Better dispatch`, `New DispatchStrategy`],
        [`Weight limit`, `Elevator rejects stops or calls when over capacity`],
        [`Destination dispatch`, `New request type and a grouping dispatcher`]
      ] }
    ],
    labs: []
  },

  // ====================================================================== LRU Cache
  {
    id: `lru-cache`, part: 2, number: 5, difficulty: `medium`,
    title: `LRU Cache: O(1) get and put, generic and thread-safe`,
    overview: `A fixed-capacity cache that evicts the least recently used entry when full, with <code>get</code> and <code>put</code> in O(1). It is a pure data-structure problem: a <strong>hash map</strong> finds an entry in O(1), and a <strong>doubly linked list</strong> ordered by recency moves or removes it in O(1). Sentinel nodes remove edge cases, generics make it reusable, and because <code>get</code> reorders the list, every operation needs the same lock.`,
    problem: [
      { id: `requirements`, title: `What we are building`, kicker: `Requirements`, blocks: [
        { type: `list`, title: `Requirements`, items: [
          `<code>get</code> and <code>put</code> in O(1).`,
          `Evict the least recently used entry when full.`,
          `Generic over key and value types.`,
          `Thread-safe.`
        ] },
        { type: `callout`, tone: `tip`, html: PRACTICE_TIP }
      ] },
      { id: `clarifying`, title: `Questions worth asking`, kicker: `Clarifying`, blocks: [
        { type: `table`, headers: [`Ask`, `Assume`, `Decides`], rows: [
          [`What does get return on a miss?`, `null`, `No Optional, no exception`],
          [`Does put on an existing key count as a use?`, `Yes: update and move to most recent`, `put logic`],
          [`Can I use LinkedHashMap?`, `Usually not; build it, then mention it`, `Hand-built list`],
          [`Capacity zero or negative?`, `Reject in the constructor`, `Validation`]
        ] }
      ] }
    ],
    solution: [
      { id: `design`, title: `Design`, kicker: `Data structures`, blocks: [
        { type: `keypoints`, items: [
          `A <code>HashMap</code> from key to node, plus a doubly linked list ordered by recency (head = most recent).`,
          `Sentinel head and tail nodes remove null checks for empty lists and end nodes.`,
          `<code>get</code> changes the order, so even reads need the lock.`
        ] },
        { type: `diagram`, title: `Map for lookup, list for recency`, caption: `The map points straight at list nodes. A hit unlinks the node and re-adds it after head; eviction removes the node before tail.`, svg: `<svg viewBox="0 0 640 210" role="img" aria-label="Hash map pointing into a doubly linked list between head and tail sentinels">
<defs><marker id="lp-lru-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="20" y="20" width="120" height="120" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="80" y="42" text-anchor="middle" font-size="13" font-weight="700" style="fill: var(--dg-ink)">HashMap</text>
<text x="40" y="70" font-size="12" style="fill: var(--dg-ink)">"a" &#8594;</text>
<text x="40" y="95" font-size="12" style="fill: var(--dg-ink)">"b" &#8594;</text>
<text x="40" y="120" font-size="12" style="fill: var(--dg-ink)">"c" &#8594;</text>
<rect x="190" y="150" width="70" height="40" rx="6" style="fill: var(--dg-6-soft); stroke: var(--dg-6)" stroke-dasharray="4 3"/><text x="225" y="175" text-anchor="middle" font-size="12" style="fill: var(--dg-ink)">head</text>
<rect x="290" y="150" width="60" height="40" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/><text x="320" y="175" text-anchor="middle" font-size="13" style="fill: var(--dg-ink)">b</text>
<rect x="380" y="150" width="60" height="40" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/><text x="410" y="175" text-anchor="middle" font-size="13" style="fill: var(--dg-ink)">a</text>
<rect x="470" y="150" width="60" height="40" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/><text x="500" y="175" text-anchor="middle" font-size="13" style="fill: var(--dg-ink)">c</text>
<rect x="560" y="150" width="60" height="40" rx="6" style="fill: var(--dg-6-soft); stroke: var(--dg-6)" stroke-dasharray="4 3"/><text x="590" y="175" text-anchor="middle" font-size="12" style="fill: var(--dg-ink)">tail</text>
<line x1="260" y1="170" x2="287" y2="170" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#lp-lru-arrow)"/>
<line x1="350" y1="170" x2="377" y2="170" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#lp-lru-arrow)"/>
<line x1="440" y1="170" x2="467" y2="170" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#lp-lru-arrow)"/>
<line x1="530" y1="170" x2="557" y2="170" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#lp-lru-arrow)"/>
<path d="M85 66 C 250 60, 400 90, 410 147" fill="none" stroke-width="1.5" style="stroke: var(--dg-1)" marker-end="url(#lp-lru-arrow)"/>
<path d="M85 91 C 220 95, 310 110, 318 147" fill="none" stroke-width="1.5" style="stroke: var(--dg-1)" marker-end="url(#lp-lru-arrow)"/>
<path d="M85 116 C 300 125, 480 110, 498 147" fill="none" stroke-width="1.5" style="stroke: var(--dg-3)" marker-end="url(#lp-lru-arrow)"/>
<text x="320" y="140" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">most recent</text>
<text x="500" y="140" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">evicted next</text>
</svg>` }
      ] },
      { id: `code`, title: `Working code`, kicker: `Implementation`, blocks: [
        { type: `code`, lang: `java`, title: `LRUCache`, code: `class LRUCache<K, V> {
    private static class Node<K, V> {
        K key; V val; Node<K, V> prev, next;
        Node(K key, V val) { this.key = key; this.val = val; }
    }

    private final int capacity;
    private final Map<K, Node<K, V>> map = new HashMap<>();
    private final Node<K, V> head = new Node<>(null, null);   // sentinel
    private final Node<K, V> tail = new Node<>(null, null);   // sentinel

    LRUCache(int capacity) {
        if (capacity <= 0) throw new IllegalArgumentException("capacity must be positive");
        this.capacity = capacity;
        head.next = tail;
        tail.prev = head;
    }

    synchronized V get(K key) {
        Node<K, V> n = map.get(key);
        if (n == null) return null;
        unlink(n);
        addFront(n);
        return n.val;
    }

    synchronized void put(K key, V val) {
        Node<K, V> n = map.get(key);
        if (n != null) {
            n.val = val;
            unlink(n);
            addFront(n);
            return;
        }
        if (map.size() == capacity) {
            Node<K, V> lru = tail.prev;            // least recently used
            unlink(lru);
            map.remove(lru.key);
        }
        n = new Node<>(key, val);
        map.put(key, n);
        addFront(n);
    }

    private void unlink(Node<K, V> n) { n.prev.next = n.next; n.next.prev = n.prev; }

    private void addFront(Node<K, V> n) {
        n.next = head.next;
        n.prev = head;
        head.next.prev = n;
        head.next = n;
    }
}` },
        { type: `callout`, tone: `tip`, html: `<p>Why does a node store its key? Eviction finds the victim through the list (<code>tail.prev</code>) and must then remove it from the map, which needs the key.</p>` }
      ] },
      { id: `notes`, title: `Notes`, kicker: `Things to say`, blocks: [
        { type: `list`, items: [
          `<strong>Production shortcut:</strong> <code>LinkedHashMap</code> with <code>accessOrder = true</code> and an overridden <code>removeEldestEntry</code>. Interviewers often forbid it, but mention it.`,
          `<strong>Why not a ReadWriteLock?</strong> Because <code>get</code> mutates the order, so every operation is a write.`,
          `<strong>Complexity:</strong> O(1) for get and put (one map operation and a constant number of pointer updates); O(capacity) memory.`
        ] }
      ] }
    ],
    levels: levels(
      [`Map plus doubly linked list, with correct get, put and eviction.`, `Explaining why each operation is O(1).`],
      [`Sentinels, generics, input validation, and the reason reads need the lock.`, `Mentioning LinkedHashMap and when you'd use it.`, `TTL as a follow-up.`],
      [`LFU and its O(1) design; segmented locking or concurrent caches (Caffeine) for contention.`, `Distributed concerns: write-through vs write-back, invalidation, consistency.`]
    ),
    concepts: [
      { term: `HashMap + doubly linked list`, def: `The map finds a node in O(1); the list keeps recency order with O(1) unlink and insert.`, why: `Neither structure alone gives O(1) for both lookup and recency updates.` },
      { term: `Sentinel nodes`, def: `Dummy head and tail nodes that are always present.`, why: `No special cases for empty lists or first and last nodes.` },
      { term: `Move to front`, def: `On every access, unlink the node and insert it after head.`, why: `The list's tail end is always the least recently used.` },
      { term: `Eviction`, def: `When full, remove <code>tail.prev</code> from the list and its key from the map.`, why: `Why each node stores its key.` },
      { term: `Lock for reads too`, def: `<code>get</code> reorders the list, so it is a write; a read-write lock buys nothing.`, why: `A common interview trap.` },
      { term: `LinkedHashMap shortcut`, def: `<code>new LinkedHashMap&lt;&gt;(cap, 0.75f, true)</code> plus <code>removeEldestEntry</code> returning <code>size() &gt; cap</code>.`, why: `The production answer when allowed.` },
      { term: `LFU`, def: `Evict the least frequently used: map from frequency to a linked set of keys, plus a minFreq counter.`, why: `The classic harder follow-up.` }
    ],
    interview: [
      { q: `Why do you need both a hash map and a linked list?`, a: `The map gives O(1) lookup by key but has no order. A list keeps recency order, but finding a key in it is O(n). Pointing the map at list nodes gives O(1) lookup and O(1) reordering and eviction, because a doubly linked node can be unlinked without searching.`, diff: `easy` },
      { q: `Why doesn't a ReadWriteLock help here?`, a: `Because get is not read-only: a hit moves the node to the front of the recency list. Every operation mutates the list, so all of them need exclusive access. Options for less contention are striping the cache into segments with their own locks, or accepting approximate recency as Caffeine does.`, diff: `medium` },
      { q: `How would you add a TTL per entry?`, a: `Store an expiry instant in each node. On get, if the entry has expired, remove it and return null. Optionally run a background sweep or keep a priority queue by expiry to reclaim memory from entries nobody reads. Inject the clock for testing.`, diff: `medium` },
      { q: `How would you implement LFU in O(1)?`, a: `Keep a map from key to node (value and frequency), a map from frequency to a LinkedHashSet of keys (insertion order breaks ties by recency), and minFreq. On access, move the key from freq f to f+1 and bump minFreq if f's set became empty. On insert, evict the first key of minFreq's set, add the new key at frequency 1 and set minFreq to 1.`, diff: `hard` },
      { q: `When would you use LinkedHashMap instead?`, a: `In production code, when allowed: construct it with accessOrder = true so gets reorder entries, and override removeEldestEntry to return size() > capacity. Wrap it with Collections.synchronizedMap or a lock for thread safety. In interviews I build it by hand first, then mention this.`, diff: `easy` }
    ],
    cheatsheet: [
      { title: `LRU operations`, type: `table`, headers: [`Operation`, `Steps`, `Cost`], rows: [
        [`get hit`, `map lookup, unlink, add after head`, `O(1)`],
        [`get miss`, `map lookup`, `O(1)`],
        [`put existing`, `update value, move to front`, `O(1)`],
        [`put new, full`, `unlink tail.prev, remove its key, insert new at front`, `O(1)`]
      ] },
      { title: `LinkedHashMap version`, type: `code`, lang: `java`, body: `class LruMap<K, V> extends LinkedHashMap<K, V> {
    private final int capacity;
    LruMap(int capacity) { super(16, 0.75f, true); this.capacity = capacity; }   // accessOrder = true
    @Override protected boolean removeEldestEntry(Map.Entry<K, V> eldest) { return size() > capacity; }
}` }
    ],
    labs: []
  },

  // ====================================================================== Splitwise
  {
    id: `splitwise`, part: 2, number: 6, difficulty: `medium`,
    title: `Splitwise: splitting expenses and keeping balances`,
    overview: `Users add expenses paid by one person and split equally, by exact amounts or by percentages; the app shows who owes whom. Two things are tested: <strong>money handling</strong> (store the smallest unit as <code>long</code>, distribute rounding remainders deliberately) and <strong>balance bookkeeping</strong> (net each pair so only one direction is stored). Splitting rules sit behind a <strong>Strategy</strong> interface.`,
    problem: [
      { id: `requirements`, title: `What we are building`, kicker: `Requirements`, blocks: [
        { type: `list`, title: `Requirements`, items: [
          `Add an expense paid by one user and split it equally, by exact amounts, or by percentages.`,
          `Show who owes whom.`,
          `Store money in the smallest unit (<code>long</code> cents or paise), never <code>double</code>.`
        ] },
        { type: `callout`, tone: `tip`, html: PRACTICE_TIP }
      ] },
      { id: `clarifying`, title: `Questions worth asking`, kicker: `Clarifying`, blocks: [
        { type: `table`, headers: [`Ask`, `Assume`, `Decides`], rows: [
          [`One currency?`, `Yes to start`, `Plain long amounts`],
          [`Where does a rounding remainder go?`, `Spread one unit at a time from the first user`, `Split code`],
          [`Groups?`, `Not to start; one global ledger`, `Data structure scope`],
          [`Simplify debts?`, `A follow-up`, `Pairwise netting only`]
        ] }
      ] }
    ],
    solution: [
      { id: `design`, title: `Design`, kicker: `Entities and API`, blocks: [
        { type: `keypoints`, items: [
          `<code>SplitStrategy</code> computes each user's share (Strategy): <code>EqualSplit</code>, <code>ExactSplit</code>, <code>PercentSplit</code>.`,
          `<code>ExpenseService</code> keeps <code>owes[debtor][creditor]</code> and nets each pair so only one direction is stored.`,
          `Every split must add up exactly to the amount; rounding remainders are assigned explicitly.`
        ] },
        { type: `code`, lang: `java`, title: `Public API`, code: `void addExpense(String payer, long amount, SplitStrategy strategy, List<String> users, List<Long> values);
List<String> balances(String user);` }
      ] },
      { id: `code`, title: `Working code`, kicker: `Implementation`, blocks: [
        { type: `code`, lang: `java`, title: `Split strategies`, code: `interface SplitStrategy {
    Map<String, Long> split(long amount, List<String> users, List<Long> values);
}

class EqualSplit implements SplitStrategy {
    public Map<String, Long> split(long amount, List<String> users, List<Long> values) {
        if (users.isEmpty()) throw new IllegalArgumentException("No users to split between");
        Map<String, Long> out = new LinkedHashMap<>();
        long share = amount / users.size();
        long remainder = amount % users.size();
        for (int i = 0; i < users.size(); i++) {
            out.put(users.get(i), share + (i < remainder ? 1 : 0));   // spread leftover units
        }
        return out;
    }
}

class ExactSplit implements SplitStrategy {
    public Map<String, Long> split(long amount, List<String> users, List<Long> values) {
        if (values.size() != users.size()) throw new IllegalArgumentException("One amount per user");
        long sum = values.stream().mapToLong(Long::longValue).sum();
        if (sum != amount) throw new IllegalArgumentException("Amounts must add up to the total");
        Map<String, Long> out = new LinkedHashMap<>();
        for (int i = 0; i < users.size(); i++) out.put(users.get(i), values.get(i));
        return out;
    }
}

class PercentSplit implements SplitStrategy {
    public Map<String, Long> split(long amount, List<String> users, List<Long> values) {
        if (values.size() != users.size()) throw new IllegalArgumentException("One percentage per user");
        long total = values.stream().mapToLong(Long::longValue).sum();
        if (total != 100) throw new IllegalArgumentException("Percentages must add up to 100");
        Map<String, Long> out = new LinkedHashMap<>();
        long assigned = 0;
        for (int i = 0; i < users.size(); i++) {
            long share = amount * values.get(i) / 100;
            out.put(users.get(i), share);
            assigned += share;
        }
        out.merge(users.get(0), amount - assigned, Long::sum);   // rounding remainder
        return out;
    }
}` },
        { type: `code`, lang: `java`, title: `ExpenseService`, code: `class ExpenseService {
    // owes.get(a).get(b) = amount a owes b (always positive)
    private final Map<String, Map<String, Long>> owes = new HashMap<>();

    synchronized void addExpense(String payer, long amount, SplitStrategy strategy,
                                 List<String> users, List<Long> values) {
        for (Map.Entry<String, Long> e : strategy.split(amount, users, values).entrySet()) {
            if (e.getKey().equals(payer) || e.getValue() == 0) continue;
            adjust(e.getKey(), payer, e.getValue());
        }
    }

    private void adjust(String debtor, String creditor, long amt) {
        long reverse = get(creditor, debtor);              // does the creditor already owe the debtor?
        if (reverse >= amt) {
            set(creditor, debtor, reverse - amt);
        } else {
            set(creditor, debtor, 0);
            set(debtor, creditor, get(debtor, creditor) + amt - reverse);
        }
    }

    private long get(String a, String b) {
        return owes.getOrDefault(a, Map.of()).getOrDefault(b, 0L);
    }

    private void set(String a, String b, long v) {
        if (v == 0) {
            Map<String, Long> m = owes.get(a);
            if (m != null) m.remove(b);
        } else {
            owes.computeIfAbsent(a, k -> new HashMap<>()).put(b, v);
        }
    }

    synchronized List<String> balances(String user) {
        List<String> out = new ArrayList<>();
        owes.getOrDefault(user, Map.of()).forEach((c, v) -> out.add(user + " owes " + c + ": " + v));
        owes.forEach((d, m) -> {
            Long v = m.get(user);
            if (v != null) out.add(d + " owes " + user + ": " + v);
        });
        return out;
    }
}` }
      ] },
      { id: `walkthrough`, title: `Walking through it`, kicker: `Check it works`, blocks: [
        { type: `steps`, items: [
          `A pays 1000 for A, B, C split equally: shares 334, 333, 333. B owes A 333 and C owes A 333.`,
          `B pays 600 for A and B equally: A's share is 300. A owes B 300, but B already owes A 333, so netting leaves B owes A 33 and nothing in the other direction.`,
          `<code>balances("A")</code> lists B owes A: 33 and C owes A: 333.`,
          `A percent split of 30/30/40 on 1001: shares 300, 300, 400 = 1000, so the remaining 1 goes to the first user.`
        ] }
      ] }
    ],
    levels: levels(
      [`Split strategies that add up exactly and a pairwise owes structure.`, `Money as long in the smallest unit.`],
      [`Explicit remainder handling, validation, and pair netting.`, `Debt simplification with the greedy two-heap approach and its limits.`],
      [`Groups and per-group locking, multiple currencies with conversion at a recorded rate, an append-only expense ledger as the source of truth.`]
    ),
    concepts: [
      { term: `Money as long minor units`, def: `Store amounts as cents or paise in a <code>long</code>.`, why: `Exact arithmetic; <code>double</code> accumulates rounding errors.` },
      { term: `Remainder distribution`, def: `When a split doesn't divide evenly, assign the leftover units explicitly (one each from the first user, or all to one user).`, why: `Shares must always add up to the expense.` },
      { term: `Split strategy`, def: `One interface, one class per split rule: equal, exact, percent.`, why: `New rules (shares, by item) are new classes.` },
      { term: `Pair netting`, def: `Store only one direction per pair; a new debt first cancels any reverse debt.`, why: `Balances stay minimal and easy to read.` },
      { term: `Net balance`, def: `For each user, total owed to them minus total they owe.`, why: `The input to debt simplification.` },
      { term: `Greedy debt simplification`, def: `Match the largest debtor with the largest creditor repeatedly using two heaps; at most n-1 transfers.`, why: `The exact minimum is NP-hard, so greedy is the standard answer.` }
    ],
    interview: [
      { q: `Why not store money as double?`, a: `Binary floating point can't represent most decimal fractions exactly, so sums drift (0.1 + 0.2 is not 0.3) and splits stop adding up. Storing the smallest unit as a long makes all arithmetic exact, and rounding becomes an explicit decision about where leftover units go.`, diff: `easy` },
      { q: `How do you split 100 between three people?`, a: `33 each leaves a remainder of 1. Give the leftover units one at a time to the first users in the list: 34, 33, 33. Whatever the rule, the shares must add up to exactly 100, and it should be deterministic so tests and users see the same result.`, diff: `easy` },
      { q: `How does the netting in adjust() work?`, a: `When B owes A an amount, first check whether A already owes B. If that reverse debt covers it, reduce the reverse debt. Otherwise clear the reverse debt and record the remainder as B owing A. So each pair only ever has one non-zero direction.`, diff: `medium` },
      { q: `How would you minimise the number of transfers?`, a: `Compute every user's net balance. Put creditors in a max-heap and debtors in a max-heap by amount. Repeatedly pop the largest of each, transfer the smaller of the two amounts, and push back whoever has a remainder. This needs at most n-1 transfers. Finding the true minimum is NP-hard, so the greedy approach is the accepted answer.`, diff: `hard` },
      { q: `How would you add groups?`, a: `Give each group its own ExpenseService (its own ledger and lock), keyed by group id in a map. Locking per group lets different groups update concurrently. A user's overall balance is the sum across their groups.`, diff: `medium` }
    ],
    cheatsheet: [
      { title: `Split rules`, type: `table`, headers: [`Strategy`, `Input`, `Validation`, `Remainder`], rows: [
        [`EqualSplit`, `users`, `At least one user`, `One unit each from the first user`],
        [`ExactSplit`, `amount per user`, `Sum equals total; one value per user`, `None (exact)`],
        [`PercentSplit`, `percent per user`, `Sum is 100; one value per user`, `All to the first user`]
      ] },
      { title: `Debt simplification sketch`, type: `code`, lang: `java`, body: `// net.get(u) > 0: u is owed money; < 0: u owes money
PriorityQueue<Map.Entry<String, Long>> creditors = new PriorityQueue<>((a, b) -> Long.compare(b.getValue(), a.getValue()));
PriorityQueue<Map.Entry<String, Long>> debtors   = new PriorityQueue<>((a, b) -> Long.compare(b.getValue(), a.getValue()));
// fill: creditors with (u, net), debtors with (u, -net)
while (!creditors.isEmpty() && !debtors.isEmpty()) {
    var c = creditors.poll(); var d = debtors.poll();
    long x = Math.min(c.getValue(), d.getValue());
    transfers.add(d.getKey() + " pays " + c.getKey() + " " + x);
    if (c.getValue() > x) creditors.add(Map.entry(c.getKey(), c.getValue() - x));
    if (d.getValue() > x) debtors.add(Map.entry(d.getKey(), d.getValue() - x));
}` }
    ],
    labs: []
  },

  // ====================================================================== Vending Machine
  {
    id: `vending-machine`, part: 1, number: 7, difficulty: `easy`,
    title: `Vending Machine: the State pattern`,
    overview: `Insert money, select a product, get it with change, or cancel for a refund, and fail clearly on invalid actions such as selecting before paying, selecting something out of stock, or not having enough money. Behaviour depends on what the machine is doing right now, which is exactly what the <strong>State</strong> pattern models: one class per state, and the machine delegates every action to its current state.`,
    problem: [
      { id: `requirements`, title: `What we are building`, kicker: `Requirements`, blocks: [
        { type: `list`, title: `Requirements`, items: [
          `Insert money, select a product, get the product and change, or cancel for a refund.`,
          `Invalid actions must fail clearly: selecting before paying, out of stock, not enough money.`
        ] },
        { type: `callout`, tone: `tip`, html: PRACTICE_TIP }
      ] },
      { id: `clarifying`, title: `Questions worth asking`, kicker: `Clarifying`, blocks: [
        { type: `table`, headers: [`Ask`, `Assume`, `Decides`], rows: [
          [`Coins, notes or cards?`, `An amount of money in the smallest unit`, `int or long amounts`],
          [`Can the machine run out of change?`, `Not to start (a follow-up)`, `No coin inventory`],
          [`What happens to money after a failed selection?`, `It stays credited; the user can pick again or cancel`, `HasMoney stays HasMoney`],
          [`Admin restock?`, `A simple addProduct`, `No admin state yet`]
        ] }
      ] }
    ],
    solution: [
      { id: `design`, title: `Design`, kicker: `States and transitions`, blocks: [
        { type: `text`, html: `<p>A <code>VendingState</code> interface with one class per state. The machine delegates every action to its current state, and the state decides what happens and which state comes next. This replaces a growing <code>if/else</code> on a status field.</p>` },
        { type: `diagram`, title: `States and transitions`, caption: `Inserting money moves Idle to HasMoney; a successful selection or a cancel returns to Idle. Selecting in Idle fails.`, svg: `<svg viewBox="0 0 600 190" role="img" aria-label="Idle and HasMoney states with transitions">
<defs><marker id="lp-vm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="60" y="70" width="150" height="54" rx="27" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="135" y="102" text-anchor="middle" font-size="14" font-weight="700" style="fill: var(--dg-ink)">IdleState</text>
<rect x="390" y="70" width="170" height="54" rx="27" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="475" y="102" text-anchor="middle" font-size="14" font-weight="700" style="fill: var(--dg-ink)">HasMoneyState</text>
<path d="M210 85 C 280 50, 320 50, 388 85" fill="none" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#lp-vm-arrow)"/>
<text x="300" y="45" text-anchor="middle" font-size="12" style="fill: var(--dg-ink)">insertMoney</text>
<path d="M388 110 C 320 150, 280 150, 212 110" fill="none" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#lp-vm-arrow)"/>
<text x="300" y="168" text-anchor="middle" font-size="12" style="fill: var(--dg-ink)">selectProduct (dispense) / cancel (refund)</text>
<path d="M545 70 C 590 20, 470 10, 500 66" fill="none" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#lp-vm-arrow)"/>
<text x="560" y="24" text-anchor="middle" font-size="12" style="fill: var(--dg-ink)">insertMoney</text>
<text x="135" y="150" text-anchor="middle" font-size="12" style="fill: var(--dg-bad)">selectProduct: error</text>
</svg>` },
        { type: `code`, lang: `java`, title: `Public API`, code: `void insertMoney(int amount);
void selectProduct(String code);
void cancel();` }
      ] },
      { id: `code`, title: `Working code`, kicker: `Implementation`, blocks: [
        { type: `code`, lang: `java`, title: `Product and states`, code: `class Product {
    final String code;
    final int price;
    int quantity;

    Product(String code, int price, int quantity) {
        this.code = code; this.price = price; this.quantity = quantity;
    }
}

interface VendingState {
    void insertMoney(VendingMachine m, int amount);
    void selectProduct(VendingMachine m, String code);
    void cancel(VendingMachine m);
}

class IdleState implements VendingState {
    public void insertMoney(VendingMachine m, int amount) {
        m.addBalance(amount);
        m.setState(new HasMoneyState());
    }
    public void selectProduct(VendingMachine m, String code) {
        throw new IllegalStateException("Insert money first");
    }
    public void cancel(VendingMachine m) { }
}

class HasMoneyState implements VendingState {
    public void insertMoney(VendingMachine m, int amount) { m.addBalance(amount); }

    public void selectProduct(VendingMachine m, String code) {
        Product p = m.product(code);
        if (p == null || p.quantity == 0) throw new IllegalStateException("Out of stock");
        if (m.balance() < p.price) throw new IllegalStateException("Insufficient funds");
        p.quantity--;
        int change = m.balance() - p.price;
        m.resetBalance();
        m.setState(new IdleState());
        System.out.println("Dispensed " + code + ", change " + change);
    }

    public void cancel(VendingMachine m) {
        System.out.println("Refunded " + m.balance());
        m.resetBalance();
        m.setState(new IdleState());
    }
}` },
        { type: `code`, lang: `java`, title: `VendingMachine`, code: `class VendingMachine {
    private final Map<String, Product> inventory = new HashMap<>();
    private int balance;
    private VendingState state = new IdleState();

    void addProduct(Product p) { inventory.put(p.code, p); }
    Product product(String code) { return inventory.get(code); }
    int balance() { return balance; }
    void addBalance(int amount) { balance += amount; }
    void resetBalance() { balance = 0; }
    void setState(VendingState s) { state = s; }

    synchronized void insertMoney(int amount) { state.insertMoney(this, amount); }
    synchronized void selectProduct(String code) { state.selectProduct(this, code); }
    synchronized void cancel() { state.cancel(this); }
}` },
        { type: `callout`, tone: `insight`, html: `<p>The checks in <code>selectProduct</code> all run before anything changes, so a failed selection leaves the balance and stock untouched and the machine stays in <code>HasMoneyState</code>: the user can choose again or cancel.</p>` }
      ] },
      { id: `walkthrough`, title: `Walking through it`, kicker: `Check it works`, blocks: [
        { type: `steps`, items: [
          `<code>selectProduct("A1")</code> in Idle throws "Insert money first".`,
          `<code>insertMoney(100)</code>: balance 100, state HasMoney. <code>insertMoney(50)</code>: balance 150, still HasMoney.`,
          `<code>selectProduct("A1")</code> priced 120: stock drops by one, 30 change, back to Idle.`,
          `<code>insertMoney(50)</code> then <code>selectProduct("A1")</code>: "Insufficient funds", balance kept. <code>cancel()</code> refunds 50 and returns to Idle.`
        ] }
      ] }
    ],
    levels: levels(
      [`A working machine with clear errors for each invalid action.`, `Recognising that behaviour depends on state.`],
      [`The State pattern with one class per state and transitions owned by states.`, `Validate-before-mutate in selection; thread safety at the machine.`, `Adding a state without editing the others.`],
      [`Change-making with a limited coin inventory and refusing sales without exact change.`, `Payment strategies, auditing and remote monitoring.`]
    ),
    concepts: [
      { term: `State pattern`, def: `An object delegates behaviour to a state object and swaps it when its state changes.`, why: `Removes status-field switches from every method; each state's rules live together.` },
      { term: `Transitions owned by states`, def: `States call <code>m.setState(...)</code> to move to the next state.`, why: `The machine doesn't need to know the transition table.` },
      { term: `Invalid actions`, def: `A state that can't handle an action throws a clear exception (or ignores it, like cancel in Idle).`, why: `Requirements say failures must be explicit.` },
      { term: `Validate before mutate`, def: `All checks (stock, funds) happen before stock or balance change.`, why: `A failed selection leaves everything as it was.` },
      { term: `Change-making`, def: `Return change greedily from the largest denomination, refusing the sale if exact change is impossible with the coins on hand.`, why: `The common follow-up once coins are modelled.` }
    ],
    interview: [
      { q: `Why use the State pattern instead of a status enum and switch statements?`, a: `With an enum, every action method switches on the status, and each new state adds a case to every method. With the State pattern, each state is a class that implements every action, so the rules for one state are together and a new state is a new class. For two or three states with simple rules, an enum is fine; I'd say when I'd switch.`, diff: `medium` },
      { q: `What happens if a selection fails?`, a: `All checks happen before any change. The exception reports the reason, the balance and stock are untouched, and the machine stays in HasMoneyState, so the user can choose another product or cancel for a refund.`, diff: `easy` },
      { q: `How would you add a DispensingState or OutOfServiceState?`, a: `DispensingState: after a successful selection the machine enters it while the motor runs, rejecting inserts and selections, then returns to Idle when dispensing completes. OutOfServiceState rejects everything except an admin reset. Each is a new class; existing states only change where they transition into the new state.`, diff: `medium` },
      { q: `How would you handle limited change?`, a: `Keep a coin inventory by denomination. To give change, try denominations from largest to smallest, taking as many as fit and are in stock. If the remainder can't reach zero, refuse the sale before dispensing and keep the user's credit. Greedy is optimal for standard coin systems; for unusual denominations use dynamic programming.`, diff: `hard` }
    ],
    cheatsheet: [
      { title: `State table`, type: `table`, headers: [`State`, `insertMoney`, `selectProduct`, `cancel`], rows: [
        [`Idle`, `Add balance, go to HasMoney`, `Error: insert money first`, `Nothing`],
        [`HasMoney`, `Add balance`, `Check stock and funds; dispense, give change, go to Idle`, `Refund, go to Idle`]
      ] },
      { title: `State pattern skeleton`, type: `code`, lang: `java`, body: `interface VendingState {
    void insertMoney(VendingMachine m, int amount);
    void selectProduct(VendingMachine m, String code);
    void cancel(VendingMachine m);
}
class VendingMachine {
    private VendingState state = new IdleState();
    void setState(VendingState s) { state = s; }
    synchronized void insertMoney(int amount) { state.insertMoney(this, amount); }   // delegate
}` }
    ],
    labs: []
  },

  // ====================================================================== Pub-Sub
  {
    id: `pub-sub`, part: 2, number: 8, difficulty: `medium`,
    title: `Pub-Sub / Notification Broker: the Observer pattern, asynchronously`,
    overview: `Topics, subscribe and unsubscribe, and publish that delivers to every current subscriber. The catch is in the last requirement: a slow or failing subscriber must not block or break the others. The design is the <strong>Observer</strong> pattern with asynchronous delivery: each subscriber gets its own single-thread executor, so its messages arrive in order and a slow subscriber only delays itself, and exceptions are caught per delivery.`,
    problem: [
      { id: `requirements`, title: `What we are building`, kicker: `Requirements`, blocks: [
        { type: `list`, title: `Requirements`, items: [
          `Topics, subscribe and unsubscribe.`,
          `Publish delivers to every current subscriber of the topic.`,
          `A slow or failing subscriber must not block or break the others.`
        ] },
        { type: `callout`, tone: `tip`, html: PRACTICE_TIP }
      ] },
      { id: `clarifying`, title: `Questions worth asking`, kicker: `Clarifying`, blocks: [
        { type: `table`, headers: [`Ask`, `Assume`, `Decides`], rows: [
          [`In process or across machines?`, `In process`, `Executors, not a network broker`],
          [`Ordering?`, `In order per subscriber`, `One single-thread executor per subscriber`],
          [`Delivery guarantee?`, `Best effort, no persistence`, `No retries or storage to start`],
          [`Does publish wait for delivery?`, `No, it returns immediately`, `Asynchronous delivery`]
        ] }
      ] }
    ],
    solution: [
      { id: `design`, title: `Design`, kicker: `Entities and API`, blocks: [
        { type: `keypoints`, items: [
          `<code>Broker</code> maps topic to subscribers using concurrent collections.`,
          `Each subscriber gets its own single-thread executor, so its messages arrive in order and a slow subscriber only delays itself.`,
          `Every delivery is wrapped in try/catch, so one failing subscriber can't affect the rest.`
        ] },
        { type: `code`, lang: `java`, title: `Public API`, code: `void subscribe(String topic, Subscriber s);
void unsubscribe(String topic, Subscriber s);
void publish(String topic, String message);   // returns immediately
void shutdown();` }
      ] },
      { id: `code`, title: `Working code`, kicker: `Implementation`, blocks: [
        { type: `code`, lang: `java`, title: `Broker`, code: `interface Subscriber {
    String id();
    void onMessage(String topic, String message);
}

class Broker {
    private final Map<String, Set<Subscriber>> topics = new ConcurrentHashMap<>();
    private final Map<String, ExecutorService> workers = new ConcurrentHashMap<>();

    void subscribe(String topic, Subscriber s) {
        workers.computeIfAbsent(s.id(), id -> Executors.newSingleThreadExecutor());   // worker first,
        topics.computeIfAbsent(topic, t -> ConcurrentHashMap.newKeySet()).add(s);     // then visible to publish
    }

    void unsubscribe(String topic, Subscriber s) {
        Set<Subscriber> set = topics.get(topic);
        if (set != null) set.remove(s);
    }

    void publish(String topic, String message) {
        for (Subscriber s : topics.getOrDefault(topic, Set.of())) {
            workers.get(s.id()).submit(() -> {
                try {
                    s.onMessage(topic, message);
                } catch (Exception e) {
                    // log and continue: one bad subscriber must not affect the others
                }
            });
        }
    }

    void shutdown() { workers.values().forEach(ExecutorService::shutdown); }
}` },
        { type: `callout`, tone: `warning`, html: `<p>In <code>subscribe</code>, create the subscriber's worker <em>before</em> adding it to the topic. In the other order, a concurrent <code>publish</code> can see the subscriber, find no worker yet and fail with a <code>NullPointerException</code>.</p>` }
      ] },
      { id: `walkthrough`, title: `Walking through it`, kicker: `Check it works`, blocks: [
        { type: `steps`, items: [
          `Email and SMS services subscribe to "orders". <code>publish("orders", "o-1 paid")</code> submits one task to each worker and returns at once.`,
          `The SMS provider is slow: its queue grows, but the email worker keeps delivering immediately.`,
          `The email subscriber throws on a malformed message: the exception is caught in its task; SMS still receives everything.`,
          `Each subscriber sees "o-1 paid" before "o-2 paid", because its own executor runs tasks one at a time in submission order.`
        ] }
      ] }
    ],
    levels: levels(
      [`Topic-to-subscriber map, subscribe, unsubscribe and synchronous publish.`, `Seeing that a slow subscriber blocks the publisher in the synchronous version.`],
      [`Asynchronous delivery with per-subscriber executors, ordering and failure isolation.`, `Concurrent collections and safe iteration during unsubscribe.`, `Bounded queues and a policy when full.`],
      [`Retries, dead-letter queues, persistence with offsets and replay (the Kafka model).`, `Wildcard topics, filters, and a notification system with channels, templates, preferences and per-user rate limits.`]
    ),
    concepts: [
      { term: `Observer pattern`, def: `Subjects notify registered observers without knowing what they do.`, why: `Decouples publishers from consumers.` },
      { term: `Asynchronous delivery`, def: `Publish hands messages to executors and returns immediately.`, why: `The publisher's latency doesn't depend on the slowest subscriber.` },
      { term: `Per-subscriber executor`, def: `One single-thread executor per subscriber.`, why: `In-order delivery per subscriber and isolation between subscribers.` },
      { term: `Failure isolation`, def: `Each delivery catches its own exceptions.`, why: `One broken subscriber can't stop deliveries to others or kill its worker thread.` },
      { term: `Concurrent key set`, def: `<code>ConcurrentHashMap.newKeySet()</code> for subscribers per topic.`, why: `Safe iteration during concurrent subscribe and unsubscribe.` },
      { term: `Bounded queue and backpressure`, def: `Cap each subscriber's queue and choose block, drop-oldest or reject when full.`, why: `Default executors have unbounded queues; a dead subscriber would exhaust memory.` },
      { term: `Dead-letter queue`, def: `Messages that keep failing after retries are parked for inspection.`, why: `Failures become visible instead of silently lost.` }
    ],
    interview: [
      { q: `Why give each subscriber its own executor instead of one shared pool?`, a: `A single-thread executor per subscriber delivers that subscriber's messages in order, and a slow subscriber only fills its own queue. With one shared pool, a slow subscriber can occupy all pool threads and delay everyone, and messages for the same subscriber can run concurrently and out of order.`, diff: `medium` },
      { q: `What happens if a subscriber is very slow or dead?`, a: `Its executor's queue grows. Default executors use unbounded queues, so memory eventually runs out. Fix it with a ThreadPoolExecutor per subscriber over a bounded queue and an explicit policy when full (block the publisher, drop the oldest, or reject and count), plus monitoring and possibly automatic unsubscribe.`, diff: `medium` },
      { q: `How would you add retries and a dead-letter queue?`, a: `Wrap delivery in a retry loop with exponential backoff and jitter, scheduled on a ScheduledExecutorService rather than sleeping in the worker. After N failures, put the message and error on a dead-letter queue for inspection or replay. Subscribers should be idempotent because retries can deliver twice.`, diff: `hard` },
      { q: `What issues remain in the simple Broker?`, a: `Unsubscribing never shuts down the subscriber's worker, so threads leak when subscribers leave all topics; publish after shutdown throws RejectedExecutionException; queues are unbounded; nothing is persisted. Track topic counts per subscriber to stop idle workers, and define the lifecycle explicitly.`, diff: `medium` },
      { q: `How would you turn this into a notification system?`, a: `Channels such as email, SMS and push become strategies behind a Channel interface; templates render messages; user preferences choose channels; and a per-user rate limiter (the token bucket from the Rate Limiter problem) prevents spamming. The broker delivers events; a notification service subscribes and fans out per user.`, diff: `medium` }
    ],
    cheatsheet: [
      { title: `Delivery design choices`, type: `table`, headers: [`Choice`, `Option`, `Effect`], rows: [
        [`Threading`, `Executor per subscriber`, `Ordering per subscriber; isolation`],
        [`Queue`, `Bounded + policy`, `Memory stays bounded; explicit loss or backpressure`],
        [`Errors`, `Catch per delivery; retries; DLQ`, `Isolation and visibility`],
        [`Persistence`, `Log with offsets`, `Replay and durability (Kafka model)`]
      ] },
      { title: `Bounded per-subscriber executor`, type: `code`, lang: `java`, body: `ExecutorService worker = new ThreadPoolExecutor(
        1, 1, 0, TimeUnit.MILLISECONDS,
        new ArrayBlockingQueue<>(1_000),                      // at most 1,000 pending messages
        new ThreadPoolExecutor.DiscardOldestPolicy());        // drop the oldest when full` }
    ],
    labs: []
  }
);
})();
