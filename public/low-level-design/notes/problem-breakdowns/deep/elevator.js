// Deep dives: Elevator System (LLD practice set). Format: DeepDive in public/shared/notes.d.ts.
window.DEEP = window.DEEP || {};
DEEP["elevator"] = {
  hook: `<p>Once the core works, interviewers add twists to see whether the design bends without breaking. You rarely implement them in full; you show which class changes and why the rest doesn't. Junior candidates may get none of these, mid-level one or two, senior candidates several, in more depth.</p>`,
  sections: [
    {
      id: "sorted-sets",
      title: "\"What if the building is tall and busy?\"",
      kicker: "Follow-up: faster lookups",
      blocks: [
        { type: "text", html: `<p>The core design scans a car's request set every tick: "anything ahead?", "nearest request?", and in dispatch "a matching stop at or beyond the caller?". With ten floors a car owes at most about 30 requests, so that costs nothing. In a 100-floor tower with dozens of cars and constant dispatch queries, the scans add up. Sorted sets turn each question into one lookup.</p>` },
        { type: "code", lang: "java", title: "Two sorted sets: next stop in O(log n)", code: `// Floors to stop at while going up (ascending) and while going down (descending), so in both sets
// ceiling(currentFloor) is "the next stop ahead in this direction". Guarded by the car's lock.
private final TreeSet<Integer> up = new TreeSet<>();
private final TreeSet<Integer> down = new TreeSet<>(Comparator.reverseOrder());

synchronized boolean addRequest(Request r) {
    if (!isValidFloor(r.floor())) return false;
    if (r.floor() == currentFloor) return true;
    switch (r.type()) {
        case PICKUP_UP   -> up.add(r.floor());
        case PICKUP_DOWN -> down.add(r.floor());
        case DESTINATION -> (r.floor() > currentFloor ? up : down).add(r.floor());   // the sweep that reaches it
    }
    return true;
}

/** Next floor to head for going up: an up-stop ahead, else the highest DOWN call above (go there, then turn). */
private Integer nextGoingUp() {
    Integer next = up.ceiling(currentFloor);
    if (next != null) return next;
    return !down.isEmpty() && down.first() > currentFloor ? down.first() : null;   // null: turn around
}
// Going down mirrors it with down.ceiling(currentFloor) and up.first().
// Dispatch's "will it pass the caller?" becomes up.ceiling(callerFloor) != null.` },
        { type: "table", headers: ["Question", "Request set (core)", "Two sorted sets"], rows: [
          ["Next stop ahead", "Scan every request", "<code>ceiling(currentFloor)</code>, O(log n)"],
          ["Turn-around point", "Scan every request", "<code>first()</code> of the other set"],
          ["Dispatch: a stop at or beyond the caller", "Scan per car", "One <code>ceiling</code> per car"],
          ["Why a stop exists", "Kept: each request has its type", "Lost: a destination and an UP call at 7 are both just 7"],
          ["Cancelling one request", "One <code>remove</code>", "Needs a map from floor to its reasons"]
        ] },
        { type: "callout", tone: "interview", html: `<p>Say it as a trade-off, not an upgrade: "A request set is simplest and fine for ten floors. If the building grows, two sorted sets make next-stop and dispatch checks O(log n); the price is that floor-only sets forget why a stop exists, so cancellation needs a reasons map." Then keep the simple version unless the interviewer pushes on scale.</p>` }
      ]
    },
    {
      id: "state-classes",
      title: "\"Add doors and a maintenance mode. Does the design still hold?\"",
      kicker: "Follow-up: when State classes pay off",
      blocks: [
        { type: "text", html: `<p>In the core, direction is an enum and <code>step()</code> branches on it, because the three directions follow the same rules and carry no data. Doors and maintenance change that: "doors open" has a countdown of its own, and "maintenance" ignores requests entirely. Now what a tick means depends on more than direction, and those rules belong in separate classes behind one interface. Direction stays an enum inside the car.</p>` },
        { type: "code", lang: "java", title: "State classes for service, doors and maintenance", code: `/** What one tick means, once that depends on more than direction. */
interface ElevatorState { ElevatorState tick(Elevator e); }

/** Normal service: the five cases from the solution, now reporting whether the car stopped at a floor. */
final class InService implements ElevatorState {
    public ElevatorState tick(Elevator e) { return e.scanOneTick() ? new DoorsOpen(3) : this; }
}

final class DoorsOpen implements ElevatorState {
    private int ticksLeft;                          // touched only inside step(), under the car's lock
    DoorsOpen(int ticks) { this.ticksLeft = ticks; }
    public ElevatorState tick(Elevator e) { return --ticksLeft > 0 ? this : new InService(); }
}

final class Maintenance implements ElevatorState {
    public ElevatorState tick(Elevator e) { return this; }   // ignores requests until an engineer resets it
}

// In Elevator:
//   private ElevatorState state = new InService();
//   synchronized void step()             { state = state.tick(this); }
//   synchronized void enterMaintenance() { requests.clear(); state = new Maintenance(); }
//   synchronized void reset()            { state = new InService(); }
// Dispatch skips a car whose state is Maintenance.` },
        { type: "keypoints", items: [
          "Each new mode is a new class; <code>step()</code> and the controller don't change.",
          "Emergency stop is one more state: clear the requests, go to the nearest floor, open the doors, ignore calls until reset.",
          "Some designs (awesome-low-level-design among them) also make each direction a State class. That works, but with only direction to model it is three classes for one mirrored rule; introduce states when a mode has its own data or rules, as here."
        ] }
      ]
    },
    {
      id: "express",
      title: "\"How would you add an express car or priority floors?\"",
      kicker: "Follow-up: restricted floors",
      blocks: [
        { type: "text", html: `<p>An express car serves only a few floors (say the lobby, 5 and 9) and skips the rest. The tempting fix, a priority value on each request and a priority queue, breaks SCAN: the car would jump to high-priority floors instead of sweeping. Keep movement as it is and change <em>which requests a car accepts</em> and <em>which cars dispatch considers</em>.</p>` },
        { type: "code", lang: "java", title: "Express cars: floors a car serves, and dispatch that respects them", code: `// In Elevator: the floors this car serves; null means every floor. Immutable, so safe to read without a lock.
private final Set<Integer> servedFloors;               // e.g. Set.of(0, 5, 9) for the express car

boolean serves(int floor) { return servedFloors == null || servedFloors.contains(floor); }

synchronized boolean addRequest(Request r) {
    if (!isValidFloor(r.floor()) || !serves(r.floor())) return false;   // the express car refuses other floors
    if (r.floor() == currentFloor) return true;
    requests.add(r);
    return true;
}

// Dispatch wraps any existing strategy and only offers it the cars that serve the floor (a Decorator).
final class ServedFloorsOnly implements DispatchStrategy {
    private final DispatchStrategy inner;
    ServedFloorsOnly(DispatchStrategy inner) { this.inner = inner; }

    public Elevator choose(List<Elevator> cars, Request call) {
        return inner.choose(cars.stream().filter(e -> e.serves(call.floor())).toList(), call);
    }
}` },
        { type: "keypoints", items: [
          "<code>Request</code> doesn't change, and neither does <code>step()</code>; only acceptance and dispatch do.",
          "At least one car must serve every floor, or some calls have no candidate; check that when the building is configured.",
          "Prefer the express car for its floors only when it is idle, or it ends up doing all the work at those floors."
        ] },
        { type: "callout", tone: "interview", html: `<p>Lay out two options and pick one: "A priority queue is simplest, but it breaks the sweep. Restricting which floors a car accepts keeps SCAN intact and only touches <code>addRequest</code> and dispatch." Weighing options out loud is what senior answers sound like.</p>` }
      ]
    },
    {
      id: "cancel",
      title: "\"How would you let someone cancel a request?\"",
      kicker: "Follow-up: undo",
      blocks: [
        { type: "text", html: `<p>Real elevators usually don't allow it: a lit button tells everyone a stop is coming, and clearing it would silently drop the people who saw the light and didn't press again. If the interviewer wants it anyway, every request entered through <code>addRequest</code>, so the inverse is one method.</p>` },
        { type: "code", lang: "java", title: "Cancelling a request", code: `/** The inverse of addRequest. Each request keeps its type, so cancelling a destination at 7
 *  never drops an UP call that is also waiting at 7. */
synchronized boolean removeRequest(Request r) {
    return requests.remove(r);                       // false if it was never there, or was already served
}` },
        { type: "keypoints", items: [
          "<code>step()</code> doesn't change: a cancelled stop is simply no longer in the set.",
          "Cancelling after the car has already stopped there is harmless: the request is gone and <code>removeRequest</code> returns false.",
          "This is the payoff of typed requests. With floor-only sets (the sorted-sets follow-up), a destination and a hall call at the same floor are one entry, and cancelling needs a map from each floor to its reasons."
        ] }
      ]
    },
    {
      id: "concurrent-calls",
      title: "\"What if many hall calls arrive at once?\"",
      kicker: "Follow-up: concurrency",
      blocks: [
        { type: "text", html: `<p>In the simulation one thread adds requests and calls <code>step()</code>. In a real building, calls arrive concurrently and each car may tick on its own thread. Two things can go wrong: two calls choose a car from the same stale picture, and a button press changes a car's request set while <code>step()</code> is iterating it.</p>` },
        { type: "compare", items: [
          { title: "Locks (as in the solution)", tone: "ok", html: `<p><code>requestElevator</code> is synchronized on the controller, so choosing a car and adding the stop are one step. Every method that touches a car's set is synchronized on that car. Simple to explain and correct; a call waits briefly while that car finishes its tick.</p>` },
          { title: "Hand-off through a queue", tone: "info", html: `<p>Callers only add to a thread-safe queue. At the start of each tick the car's own thread drains it into its set. Only one thread ever touches the set, so it needs no lock, and a call never waits for a tick.</p>` }
        ] },
        { type: "code", lang: "java", title: "Hand-off: callers enqueue, the car drains each tick", code: `private final Queue<Request> pending = new ConcurrentLinkedQueue<>();   // written by any thread

boolean addRequest(Request r) {                        // any thread; never blocks
    if (!isValidFloor(r.floor())) return false;
    pending.add(r);
    return true;
}

void step() {                                           // only this car's thread calls step()
    for (Request r; (r = pending.poll()) != null; ) if (r.floor() != currentFloor) requests.add(r);
    scanOneTick();                                      // the five cases from the solution
    snapshot = new CarSnapshot(currentFloor, direction);
}

private volatile CarSnapshot snapshot;                  // what dispatch reads from other threads
record CarSnapshot(int floor, Direction direction) {}` },
        { type: "callout", tone: "warning", html: `<p>The hand-off moves the problem rather than removing it: dispatch runs on caller threads and can no longer read the set. Publish an immutable snapshot after each tick through a <code>volatile</code> field, and let dispatch decide from it. A request accepted between ticks only shows up in the next snapshot, which is fine for a heuristic.</p>` }
      ]
    },
    {
      id: "limits-and-zones",
      title: "Weight, emergencies, express banks and zones",
      kicker: "Follow-up: physical rules",
      blocks: [
        { type: "table", headers: ["Requirement", "Design change"], rows: [
          ["Weight limit", "The car tracks load; when full it accepts no hall calls (dispatch skips it) but still serves destinations"],
          ["Emergency stop", "An emergency state: clear requests, go to the nearest floor, open doors, ignore calls until reset"],
          ["Express banks", "Floors served per car, as in the express follow-up; dispatch only considers cars that serve the floor"],
          ["Zones in tall buildings", "Groups of cars per floor range; the controller first picks the zone, then dispatches within it"],
          ["Starvation at peak times", "Add waiting time to the dispatch decision so a call that has waited long beats a slightly closer car"]
        ] }
      ]
    },
    {
      id: "destination-dispatch",
      title: "Destination dispatch",
      kicker: "Follow-up: a different interaction",
      blocks: [
        { type: "text", html: `<p>With UP and DOWN buttons, the system learns where someone is going only after they board. With destination dispatch, passengers enter their floor in the lobby, so the controller knows origin and destination for everyone and can group people going to nearby floors into the same car, cutting stops per trip.</p>` },
        { type: "code", lang: "java", title: "A different request, a different dispatcher", code: `record TripRequest(int from, int to) {}

final class DestinationDispatcher {
    private final List<Elevator> cars;
    DestinationDispatcher(List<Elevator> cars) { this.cars = List.copyOf(cars); }

    /** Returns the car the passenger should take. */
    synchronized int assign(TripRequest r) {
        Elevator best = Collections.min(cars, Comparator.comparingInt(e -> e.extraStopsFor(r.from(), r.to())));
        RequestType pickup = r.to() > r.from() ? RequestType.PICKUP_UP : RequestType.PICKUP_DOWN;
        best.addRequest(new Request(r.from(), pickup));
        best.addPendingDestination(r.from(), r.to());           // becomes a destination once the passenger boards
        return best.id;
    }
}` },
        { type: "quiz", q: "A car going UP at floor 3 owes destinations at 6 and 8. A passenger inside presses 2. With SCAN, what happens?", options: [
          "It turns immediately and goes to 2",
          "It continues up to 6 and 8, then turns and goes down to 2",
          "It ignores 2 until it becomes idle",
          "It goes to 2 first because it is closest"
        ], answer: 1, explain: `<p>While going up, <code>hasRequestsAhead(UP)</code> stays true because 6 and 8 are above, so the car keeps climbing and stops at each. At 8 nothing is ahead, so it turns, and on the way down it stops at 2.</p>` }
      ]
    }
  ],
  takeaways: [
    "Follow-ups should touch one or two classes: acceptance and dispatch for express cars, one method for cancellation, locking or a hand-off for concurrency.",
    "Reach for sorted sets only when the building is large enough for scans to matter; they make lookups O(log n) but forget why a stop exists.",
    "Introduce State classes when a mode has its own data or rules (doors, maintenance, emergency); for direction alone an enum is enough.",
    "Typed requests make cancellation a single remove.",
    "Concurrency: lock choose-then-add on the controller and every set access on the car, or hand requests to the car's own thread through a queue and publish snapshots.",
    "Weight limits, express banks and zones change which cars are eligible for a call; waiting time in dispatch prevents starvation."
  ]
};
