// Deep dives: Elevator System (LLD practice set). Format: DeepDive in public/shared/notes.d.ts.
window.DEEP = window.DEEP || {};
DEEP["elevator"] = {
  hook: `<p>Once the core works, interviewers add twists to see whether the design bends without breaking. You rarely implement them in full; you show which class changes and why the rest doesn't. Junior candidates may get none of these, mid-level one or two, senior candidates several, in more depth.</p>`,
  sections: [
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
    // ... unchanged: current floor is a no-op, otherwise file the stop in up or down
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
          "<code>Request</code> doesn't change, and neither does the movement logic; only acceptance and dispatch do.",
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
        { type: "text", html: `<p>Real elevators usually don't allow it: a lit button tells everyone a stop is coming, and clearing it would silently drop the people who saw the light and didn't press again. If the interviewer wants it anyway, the obvious answer is a <code>removeRequest</code> that mirrors <code>addRequest</code>. There is one catch in this design.</p>` },
        { type: "problem", html: `<p>The two sweep sets store <em>floors</em>. A destination for 7 and an UP call at 7 are the same entry in <code>up</code>. Cancelling the destination would also cancel the person waiting at 7.</p>` },
        { type: "code", lang: "java", title: "Cancelling: remember why each stop exists", code: `// The sweeps map each floor to the reasons it is a stop; the floor stays a stop until its last reason goes.
final TreeMap<Integer, EnumSet<RequestType>> up = new TreeMap<>();
final TreeMap<Integer, EnumSet<RequestType>> down = new TreeMap<>(Comparator.reverseOrder());

synchronized boolean removeRequest(Request r) {
    TreeMap<Integer, EnumSet<RequestType>> sweep = switch (r.type()) {
        case PICKUP_UP   -> up;
        case PICKUP_DOWN -> down;
        case DESTINATION -> holds(up, r) ? up : down;          // whichever sweep it was filed in
    };
    EnumSet<RequestType> reasons = sweep.get(r.floor());
    if (reasons == null || !reasons.remove(r.type())) return false;   // nothing to cancel
    if (reasons.isEmpty()) sweep.remove(r.floor());                    // last reason gone: no stop here
    return true;
}

private static boolean holds(TreeMap<Integer, EnumSet<RequestType>> sweep, Request r) {
    EnumSet<RequestType> reasons = sweep.get(r.floor());
    return reasons != null && reasons.contains(r.type());
}

// addRequest files a reason: sweep.computeIfAbsent(floor, f -> EnumSet.noneOf(RequestType.class)).add(type);
// The states use ceilingKey(currentFloor) and firstKey() where they used ceiling() and first().` },
        { type: "keypoints", items: [
          "Movement is unchanged in shape: it reads keys, exactly as it read set elements.",
          "Cancelling after the car has already stopped there is harmless: the stop is gone and <code>removeRequest</code> returns false.",
          "This is the general lesson of the follow-up: if a stop can be removed for one reason, the data has to remember every reason."
        ] }
      ]
    },
    {
      id: "concurrent-calls",
      title: "\"What if many hall calls arrive at once?\"",
      kicker: "Follow-up: concurrency",
      blocks: [
        { type: "text", html: `<p>In the simulation one thread adds requests and calls <code>step()</code>. In a real building, calls arrive concurrently and each car may tick on its own thread. Two things can go wrong: two calls choose a car from the same stale picture, and a button press changes a car's sets while its <code>step()</code> is reading them.</p>` },
        { type: "compare", items: [
          { title: "Locks (as in the solution)", tone: "ok", html: `<p><code>requestElevator</code> is synchronized on the controller, so choosing a car and adding the stop are one step. Every method that touches a car's sets is synchronized on that car. Simple to explain and correct; a call waits briefly while that car finishes its tick.</p>` },
          { title: "Hand-off through a queue", tone: "info", html: `<p>Callers only add to a thread-safe queue. At the start of each tick the car's own thread drains it into its sets. Only one thread ever touches the sets, so they need no lock, and a call never waits for a tick.</p>` }
        ] },
        { type: "code", lang: "java", title: "Hand-off: callers enqueue, the car drains each tick", code: `private final Queue<Request> pending = new ConcurrentLinkedQueue<>();   // written by any thread

boolean addRequest(Request r) {                        // any thread; never blocks
    if (!isValidFloor(r.floor())) return false;
    pending.add(r);
    return true;
}

void step() {                                           // only this car's thread calls step()
    for (Request r; (r = pending.poll()) != null; ) file(r);   // the old addRequest body, now private
    state = state.move(this);
    snapshot = new CarSnapshot(currentFloor, state.direction(), up.ceiling(currentFloor), down.ceiling(currentFloor));
}

private volatile CarSnapshot snapshot;                  // what dispatch reads from other threads
record CarSnapshot(int floor, Direction direction, Integer nextUp, Integer nextDown) {}` },
        { type: "callout", tone: "warning", html: `<p>The hand-off moves the problem rather than removing it: dispatch runs on caller threads and can no longer read the sets. Publish an immutable snapshot after each tick through a <code>volatile</code> field, and let dispatch decide from it. A stop accepted between ticks only shows up in the next snapshot, which is fine for a heuristic.</p>` }
      ]
    },
    {
      id: "state-machine",
      title: "Doors and maintenance are more states",
      kicker: "Follow-up: modelling",
      blocks: [
        { type: "text", html: `<p>The direction states already decide each tick. "Doors open", "under maintenance" and "emergency stop" each change what a tick means too, so they are more classes behind the same <code>ElevatorState</code> interface, not new flags on <code>Elevator</code>.</p>` },
        { type: "code", lang: "java", title: "Doors and maintenance as ElevatorStates", code: `// More states, same interface: each decides what one tick means.
final class DoorsOpenState implements ElevatorState {
    private final ElevatorState resume;                  // the direction to carry on in
    private int ticksLeft;                               // touched only inside step(), under the elevator's lock
    DoorsOpenState(ElevatorState resume, int ticks) { this.resume = resume; this.ticksLeft = ticks; }
    public Direction direction() { return resume.direction(); }
    public ElevatorState move(Elevator e) { return --ticksLeft > 0 ? this : resume; }
}

final class MaintenanceState implements ElevatorState {
    public Direction direction() { return Direction.IDLE; }
    public ElevatorState move(Elevator e) { return this; }   // ignores stops until an engineer resets it
}

// In MovingUpState (and MovingDownState), a stop now holds the doors open for three ticks:
//   if (next == e.currentFloor) { e.up.remove(next); return new DoorsOpenState(this, 3); }
// In Elevator:
//   synchronized void enterMaintenance() { up.clear(); down.clear(); state = new MaintenanceState(); }
//   synchronized void reset()            { state = new IdleState(); }
// Dispatch skips a car in maintenance, so it never gets hall calls.` },
        { type: "callout", tone: "tip", html: `<p><code>DoorsOpenState</code> remembers which direction state to resume, so the car carries on its sweep when the doors close. Emergency stop is another state that clears stops and parks at the nearest floor.</p>` }
      ]
    },
    {
      id: "limits-and-zones",
      title: "Weight, emergencies, express banks and zones",
      kicker: "Follow-up: physical rules",
      blocks: [
        { type: "table", headers: ["Requirement", "Design change"], rows: [
          ["Weight limit", "The car tracks load; when full it accepts no hall calls (dispatch skips it) but still serves destinations"],
          ["Emergency stop", "An emergency state: clear stops, go to the nearest floor, open doors, ignore calls until reset"],
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
        { type: "quiz", q: "A car going UP at floor 3 owes up-stops {6, 8}. A passenger inside presses 2. With SCAN, what happens?", options: [
          "It turns immediately and goes to 2",
          "It continues up to 6 and 8, then turns and goes down to 2",
          "It ignores 2 until it becomes idle",
          "It goes to 2 first because it is closest"
        ], answer: 1, explain: `<p>Floor 2 is below the car, so it joins the <code>down</code> set. <code>MovingUpState</code> keeps serving <code>up.ceiling(floor)</code> (6, then 8); only when nothing is left ahead does it turn, and <code>down.ceiling(8)</code> in the descending set finds 2.</p>` }
      ]
    }
  ],
  takeaways: [
    "Follow-ups should touch one or two classes: acceptance and dispatch for express cars, the stop data for cancellation, locking or a hand-off for concurrency.",
    "Two sweep sets store floors; if stops can be cancelled, store the reasons for each stop too.",
    "Concurrency: lock choose-then-add on the controller and every set access on the car, or hand requests to the car's own thread through a queue and publish snapshots.",
    "Doors, maintenance and emergencies are more ElevatorStates; each decides what a tick means.",
    "Weight limits, express banks and zones change which cars are eligible for a call; waiting time in dispatch prevents starvation.",
    "Destination dispatch changes the request type and groups passengers to reduce stops."
  ]
};
