// Deep dives: Elevator System (LLD practice set). Format: DeepDive in public/shared/notes.d.ts.
window.DEEP = window.DEEP || {};
DEEP["elevator"] = {
  hook: `<p>The basic design moves cars with SCAN and dispatches by cost. Follow-ups push on modelling (doors and maintenance as states), dispatch quality, physical limits and new interaction models like destination dispatch.</p>`,
  sections: [
    {
      id: "direction-aware-stops",
      title: "Direction-aware stops: don't pick up people going the other way",
      kicker: "Refinement: hall call direction",
      blocks: [
        { type: "problem", html: `<p>The basic design stores stops as plain floor numbers. A car at floor 5 going up with stops {7, 8} receives a DOWN hall call from floor 7. Floor 7 is already in the set, so the car stops there on its way up, and the person who wanted to go down either boards a car heading the wrong way or watches it leave. The set lost the one fact that mattered: which way they want to go.</p>` },
        { type: "idea", html: `<p>Keep the direction, and keep the sorted order SCAN depends on: replace the one <code>TreeSet</code> with <strong>two</strong>. <code>up</code> holds floors to stop at while moving up (UP hall calls, and destinations above the car); <code>down</code> holds floors to stop at while moving down. Moving up, the next stop is <code>up.ceiling(floor)</code>; moving down, <code>down.floor(floor)</code>, both O(log n). When nothing is left ahead in <code>up</code>, the car still travels to the highest DOWN call above it (<code>down.last()</code>), turns there and serves it on the way back.</p>` },
        { type: "code", lang: "java", title: "Direction-aware stops in two TreeSets", code: `enum RequestType { PICKUP_UP, PICKUP_DOWN, DESTINATION }

class Elevator {
    private static final int MIN_FLOOR = 0, MAX_FLOOR = 9;
    private int floor = 0;
    private Direction dir = Direction.IDLE;
    // Floors to stop at while moving up, and while moving down. Sorted, so SCAN's
    // "next stop ahead" is ceiling/floor in O(log n). Guarded by this.
    private final TreeSet<Integer> up = new TreeSet<>(), down = new TreeSet<>();

    synchronized boolean addRequest(int f, RequestType type) {
        if (f < MIN_FLOOR || f > MAX_FLOOR) return false;               // invalid floor
        switch (type) {
            case PICKUP_UP   -> up.add(f);
            case PICKUP_DOWN -> down.add(f);
            case DESTINATION -> { if (f != floor) (f > floor ? up : down).add(f); }   // on the sweep that reaches it
        }
        return true;
    }

    synchronized void step() {
        if (up.isEmpty() && down.isEmpty()) { dir = Direction.IDLE; return; }
        if (dir == Direction.IDLE) dir = directionToNearest();
        if ((dir == Direction.UP ? up : down).remove(floor)) return;     // doors open; only same-direction stops
        Integer target = nextTarget();
        if (target == null) { dir = dir == Direction.UP ? Direction.DOWN : Direction.UP; return; }
        floor += Integer.signum(target - floor);
    }

    // SCAN (LOOK): the next stop ahead in this direction; if none, the farthest opposite-direction
    // call ahead (go there, then turn); if none, null means reverse.
    private Integer nextTarget() {
        if (dir == Direction.UP) {
            Integer next = up.ceiling(floor);
            if (next != null) return next;
            return !down.isEmpty() && down.last() > floor ? down.last() : null;
        }
        Integer next = down.floor(floor);
        if (next != null) return next;
        return !up.isEmpty() && up.first() < floor ? up.first() : null;
    }

    private Direction directionToNearest() {              // deterministic: nearest stop, ties go up
        int best = Integer.MAX_VALUE;
        Direction d = Direction.UP;
        for (TreeSet<Integer> s : List.of(up, down)) {
            Integer above = s.ceiling(floor), below = s.floor(floor);
            if (above != null && above - floor < best) { best = above - floor; d = Direction.UP; }
            if (below != null && floor - below < best) { best = floor - below; d = Direction.DOWN; }
        }
        return d;
    }
}` },
        { type: "keypoints", items: [
          "<strong>Stopping</strong> is direction-aware; <strong>travelling</strong> is not. <code>nextTarget</code> falls back to the farthest opposite-direction call ahead, or a DOWN call above the car would never be reached.",
          "<strong>Why two TreeSets, not a HashSet of (floor, type):</strong> a hash set remembers direction but forgets order, so every tick becomes a linear scan for \"anything ahead?\" and \"nearest?\". Two sorted sets answer both with <code>ceiling</code>, <code>floor</code>, <code>first</code> and <code>last</code> in O(log n), and still ignore duplicate presses.",
          "With a small, fixed number of floors, two <code>boolean[]</code> arrays scanned in O(F) are also fine; say so, then use <code>TreeSet</code> as the general answer.",
          "Boundary floors need no special case: at the top floor nothing is ahead, so the car reverses naturally.",
          "Dispatch should also be honest about direction: prefer cars moving toward the caller in the caller's direction and whose remaining stops reach at least that far, then idle cars, then any car."
        ] },
        { type: "callout", tone: "interview", html: `<p>If time is short, implement floors-only first and say: "This stops for people going the wrong way; storing (floor, type) fixes it." Naming the flaw and its fix is most of the credit.</p>` }
      ]
    },
    {
      id: "state-machine",
      title: "The cabin as a State machine",
      kicker: "Follow-up: modelling",
      blocks: [
        { type: "text", html: `<p>One <code>direction</code> field can't express "doors open", "under maintenance" or "emergency stop". Each of those changes what <code>step()</code> and button presses mean, which is the State pattern's job.</p>` },
        { type: "code", lang: "java", title: "States decide what a tick means", code: `interface CabinState { CabinState step(Elevator e); }

class Moving implements CabinState {
    public CabinState step(Elevator e) {
        if (e.atNextStop()) { e.removeCurrentStop(); return new DoorsOpen(3); }   // open for 3 ticks
        e.moveOneFloor();
        return this;
    }
}

class DoorsOpen implements CabinState {
    private int ticksLeft;
    DoorsOpen(int ticks) { this.ticksLeft = ticks; }
    public CabinState step(Elevator e) {
        if (--ticksLeft > 0) return this;
        return e.hasStops() ? new Moving() : new Idle();
    }
}

class Idle implements CabinState {
    public CabinState step(Elevator e) { return e.hasStops() ? new Moving() : this; }
}

class Maintenance implements CabinState {
    public CabinState step(Elevator e) { return this; }      // ignores stops until reset
}

// Elevator: synchronized void step() { state = state.step(this); }
// The controller skips elevators in Maintenance when dispatching.` },
        { type: "callout", tone: "tip", html: `<p>Direction stays as data inside <code>Elevator</code>; the state decides <em>whether</em> it moves this tick. Emergency stop is another state that clears stops and parks at the nearest floor.</p>` }
      ]
    },
    {
      id: "better-dispatch",
      title: "A better cost function",
      kicker: "Follow-up: dispatch",
      blocks: [
        { type: "text", html: `<p>Distance plus a turn-around penalty ignores how busy a car is. A car two floors away with six stops in between is worse than an idle car five floors away. Since dispatch is a strategy, improving it is a new class.</p>` },
        { type: "code", lang: "java", title: "Count the stops before the caller", code: `interface DispatchStrategy { Elevator choose(List<Elevator> cars, int floor, Direction dir); }

class StopsAwareDispatch implements DispatchStrategy {
    public Elevator choose(List<Elevator> cars, int floor, Direction dir) {
        return Collections.min(cars, Comparator.comparingInt(e -> cost(e, floor, dir)));
    }

    private int cost(Elevator e, int floor, Direction dir) {
        if (e.inMaintenance()) return Integer.MAX_VALUE;
        int travel = e.floorsToReach(floor, dir);            // along its SCAN path, including any turn-around
        int stopsBefore = e.stopsBefore(floor, dir);          // each stop costs door time
        return travel + 3 * stopsBefore;
    }
}` },
        { type: "callout", tone: "warning", html: `<p>Watch for starvation: a pure lowest-cost rule can keep skipping a far floor at peak times. Add waiting time to the cost (age the request) so every call is eventually served.</p>` }
      ]
    },
    {
      id: "limits-and-zones",
      title: "Weight, emergencies, express cars and zones",
      kicker: "Follow-up: physical rules",
      blocks: [
        { type: "table", headers: ["Requirement", "Design change"], rows: [
          ["Weight limit", "Elevator tracks load; when full it skips hall calls (dispatch cost becomes infinite) but still serves cabin stops"],
          ["Emergency stop", "An Emergency state: clear stops, go to the nearest floor, open doors, ignore calls until reset"],
          ["Express elevators", "Allowed floors per car (lobby plus a top range); dispatch only considers cars that serve the floor"],
          ["Zones in tall buildings", "Groups of cars per floor range; the controller first picks the zone, then dispatches within it"]
        ] }
      ]
    },
    {
      id: "destination-dispatch",
      title: "Destination dispatch",
      kicker: "Follow-up: a different interaction",
      blocks: [
        { type: "text", html: `<p>With up/down buttons, the system learns a passenger's destination only after they board. With destination dispatch, passengers enter the target floor in the lobby, so the controller knows origin and destination for everyone and can group people going to nearby floors into the same car, cutting stops per trip.</p>` },
        { type: "code", lang: "java", title: "A different request, a different dispatcher", code: `record TripRequest(int from, int to) {}

class DestinationDispatcher {
    private final List<Elevator> cars;
    DestinationDispatcher(List<Elevator> cars) { this.cars = cars; }

    int assign(TripRequest r) {                               // returns the car the passenger should take
        Elevator best = Collections.min(cars, Comparator.comparingInt(e -> e.extraStopsFor(r.from(), r.to())));
        best.addStop(r.from());
        best.addPendingDestination(r.from(), r.to());         // added as a stop once the passenger boards
        return best.id;
    }
}` },
        { type: "quiz", q: "An elevator going UP at floor 3 has stops {6, 8}. A cabin passenger selects floor 2. With SCAN, what happens?", options: [
          "It reverses immediately to floor 2",
          "It continues up to 6 and 8, then reverses and goes to 2",
          "It ignores floor 2 until it becomes idle",
          "It goes to 2 because it is closest"
        ], answer: 1, explain: `<p>SCAN keeps moving in the current direction while stops remain ahead (6 and 8). Only when <code>ceiling(floor)</code> finds nothing does it reverse, and then <code>floor(floor)</code> finds 2.</p>` }
      ]
    }
  ],
  takeaways: [
    "Doors, maintenance and emergencies are states; each decides what a tick means.",
    "Dispatch is a strategy; a better cost counts stops along the path and ages waiting requests.",
    "Weight limits, express cars and zones change which cars are eligible for a call.",
    "Destination dispatch changes the request type and groups passengers to reduce stops."
  ]
};
