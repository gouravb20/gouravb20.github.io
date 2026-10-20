// Deep dives: Elevator System (LLD practice set). Format: DeepDive in public/shared/notes.d.ts.
window.DEEP = window.DEEP || {};
DEEP["elevator"] = {
  hook: `<p>The basic design moves cars with SCAN and dispatches by cost. Follow-ups push on modelling (doors and maintenance as states), dispatch quality, physical limits and new interaction models like destination dispatch.</p>`,
  sections: [
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
