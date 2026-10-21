// Deep dives: Elevator System (LLD practice set). Format: DeepDive in public/shared/notes.d.ts.
window.DEEP = window.DEEP || {};
DEEP["elevator"] = {
  hook: `<p>The basic design moves cars with SCAN over two sorted sets, models direction as states and dispatches by cost. Follow-ups push on modelling (doors and maintenance as states), dispatch quality, physical limits and new interaction models like destination dispatch.</p>`,
  sections: [
    {
      id: "two-sets",
      title: "One set of floors, a set of requests, or two sorted sets",
      kicker: "Design choice: storing stops",
      blocks: [
        { type: "compare", items: [
          { title: "One TreeSet of floors", tone: "bad", html: "<p>Sorted, so SCAN is easy, but it forgets direction: a car going up with a stop at 7 also stops for someone at 7 who pressed DOWN, and they board a car heading the wrong way.</p>" },
          { title: "A HashSet of (floor, type)", tone: "warn", html: "<p>Remembers direction, but forgets order: every step becomes a linear scan for \"anything ahead?\" and \"which is nearest?\".</p>" },
          { title: "Two TreeSets, down reversed", tone: "ok", html: "<p>Remembers direction <em>and</em> order. <code>ceiling(floor)</code> is the next stop ahead in either set in O(log n); <code>first()</code> is the far end for turning around.</p>" }
        ] },
        { type: "keypoints", items: [
          "<strong>Stopping</strong> is direction-aware; <strong>travelling</strong> is not. When no up-stop is ahead, <code>MovingUpState</code> still travels to the highest DOWN call above it (<code>down.first()</code>), turns there and serves it on the way down.",
          "<strong>Cabin presses</strong> have no direction of their own: a floor above the car joins <code>up</code>, a floor below joins <code>down</code>.",
          "With a small, fixed number of floors, two <code>boolean[]</code> arrays scanned in O(F) are also fine; say so, then use <code>TreeSet</code> as the general answer.",
          "Boundary floors need no special case: at the top floor nothing is ahead, so the car turns naturally.",
          "Dispatch should also be honest about direction: prefer cars moving toward the caller in the caller's direction and whose remaining stops reach at least that far, then idle cars, then any car."
        ] },
        { type: "callout", tone: "interview", html: "<p>If time is short, implement one set of floors first and say: \"This stops for people going the wrong way; splitting it into an up set and a reversed down set fixes it.\" Naming the flaw and its fix is most of the credit.</p>" }
      ]
    },
    {
      id: "state-machine",
      title: "Doors and maintenance are more states",
      kicker: "Follow-up: modelling",
      blocks: [
        { type: "text", html: `<p>The direction states already decide each step. "Doors open", "under maintenance" and "emergency stop" each change what a step means too, so they are more classes behind the same <code>ElevatorState</code> interface, not new flags on <code>Elevator</code>.</p>` },
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
//   if (next == e.floor) { e.up.remove(next); return new DoorsOpenState(this, 3); }
// In Elevator:
//   synchronized void enterMaintenance() { up.clear(); down.clear(); state = new MaintenanceState(); }
//   synchronized void reset()            { state = new IdleState(); }
// The dispatcher gives a car in maintenance an infinite cost, so it never gets hall calls.` },
        { type: "callout", tone: "tip", html: `<p><code>DoorsOpenState</code> remembers which direction state to resume, so the car carries on its sweep when the doors close. Emergency stop is another state that clears stops and parks at the nearest floor.</p>` }
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
    "Two TreeSets, the down set reversed, keep stops both sorted and direction-aware; ceiling(floor) is the next stop either way.",
    "Direction, doors, maintenance and emergencies are all ElevatorStates; each decides what a step means.",
    "Dispatch is a strategy; a better cost counts stops along the path and ages waiting requests.",
    "Weight limits, express cars and zones change which cars are eligible for a call.",
    "Destination dispatch changes the request type and groups passengers to reduce stops."
  ]
};
