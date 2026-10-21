// Deep dives: Ride Sharing (LLD practice set). Format: DeepDive in public/shared/notes.d.ts.
window.DEEP = window.DEEP || {};
DEEP["ride-sharing"] = {
  hook: `<p>Once the core works, interviewers add twists to see whether the design bends without breaking. You rarely implement them in full; you show which class changes and why the rest does not. For ride sharing the twists are predictable: surge, a second dispatch mode, live tracking, failed payments, cancellations, and "what about a whole city?". Mid-level candidates may get one, senior candidates several, in more depth.</p>`,
  sections: [
    {
      id: "surge",
      title: "\"How would you compute surge pricing?\"",
      kicker: "Follow-up: pricing",
      blocks: [
        { type: "text", html: `<p>In the core, surge is just a number from a <code>SurgeProvider</code>. The follow-up asks where the number comes from. The answer is a <strong>new SurgeProvider class</strong>; <code>PricingStrategy</code>, <code>Ride</code> and <code>RideService</code> do not change, which is the point of having put it behind an interface.</p>` },
        { type: "code", lang: "java", title: "Surge from demand and supply", code: `/** Demand = open requests in a cell; supply = available drivers there. Rebuilt by a scheduler every minute. */
final class DemandSupplySurge implements SurgeProvider {
    private static final int MAX_PERCENT = 300, SENSITIVITY_PERCENT = 50;
    private volatile Map<Cell, Integer> snapshot = Map.of();       // immutable; replaced as a whole

    public int surgePercentAt(Location pickup) { return snapshot.getOrDefault(Cell.of(pickup), 100); }

    void recompute(Map<Cell, Integer> openRequests, Map<Cell, Integer> availableDrivers) {
        Map<Cell, Integer> next = new HashMap<>();
        openRequests.forEach((cell, demand) -> next.put(cell, percent(demand, availableDrivers.getOrDefault(cell, 0))));
        snapshot = Map.copyOf(next);                               // one volatile write publishes the new table
    }

    static int percent(int demand, int supply) {
        if (demand <= supply) return 100;
        if (supply == 0) return MAX_PERCENT;
        int raw = 100 + (demand * 100 / supply - 100) * SENSITIVITY_PERCENT / 100;
        return (Math.min(MAX_PERCENT, raw) + 5) / 10 * 10;         // shown to riders in 0.1x steps
    }
}` },
        { type: "keypoints", items: [
          "<strong>Per cell, on a schedule.</strong> Computing surge on every request would make two riders a street apart see different prices second to second. A table rebuilt every minute is stable and cheap to read. Thirty requests against twenty drivers gives 130%.",
          "<strong>Safe without locks.</strong> Readers only ever see a complete, immutable map, because the scheduler builds a new one and publishes it with a single volatile write.",
          "<strong>Capped, rounded, smoothed.</strong> A ceiling protects riders; 0.1x steps keep the number readable; in practice blend with the previous value so it does not flicker when one driver logs on.",
          "<strong>Locked on the ride.</strong> The percent in the estimate is stored on the ride and reused for the final fare, so a surge change mid-trip never reaches the rider."
        ] },
        { type: "compare", title: "Estimate versus final fare", items: [
          { title: "Metered final fare (the core)", tone: "info", html: `<p>Reprice the actual distance and time with the locked surge. Fair for detours and traffic, but the rider does not know the exact amount up front.</p>` },
          { title: "Upfront price with a tolerance", tone: "ok", html: `<p>Charge the quoted price unless the metered fare differs by more than a tolerance, which signals a changed drop or a long detour. Riders get certainty; real changes are still priced.</p>` }
        ] },
        { type: "code", lang: "java", title: "Final fare: upfront price with a tolerance", code: `/** Riders pay the quoted price unless the trip really changed (a detour, a new drop, a long jam). */
final class UpfrontFare {
    private static final long TOLERANCE_PERCENT = 15;
    private final PricingStrategy pricing;

    UpfrontFare(PricingStrategy pricing) { this.pricing = pricing; }

    FareBreakdown finalFare(Ride ride, TripMetrics actual) {
        FareBreakdown metered = pricing.price(ride.type, actual, ride.estimate.surgePercent());
        long quoted = ride.estimate.total();
        long diff = Math.abs(metered.total() - quoted);
        return diff * 100 <= quoted * TOLERANCE_PERCENT ? ride.estimate : metered;   // integer maths, no drift
    }
}

// The only change in RideService.complete:  FareBreakdown fare = upfront.finalFare(r, actual);` },
        { type: "callout", tone: "interview", html: `<p>Land the structural point first: "Surge is a new <code>SurgeProvider</code>; nothing else changes." Then talk about the formula. Interviewers care more that the change is contained than about the exact curve.</p>` }
      ]
    },
    {
      id: "broadcast",
      title: "\"What if drivers choose from open requests instead?\"",
      kicker: "Follow-up: a second dispatch mode",
      blocks: [
        { type: "text", html: `<p>Many markets (autos, bikes, quieter cities) show nearby drivers the open requests and let them pick. That flips the race. With sequential offers, <em>rides race for a driver</em>; with broadcast, <em>drivers race for a ride</em>: five of them can tap Accept on the same request within milliseconds, and exactly one must win. <strong>Ride gains a <code>claim</code> method</strong> and the service gains a map of open rides; the transition table and the driver's CAS are reused unchanged.</p>` },
        { type: "code", lang: "java", title: "Broadcast mode: open requests and the first claim wins", code: `// In Ride: the first driver to tap claims the ride, if it is still searching and they are still free.
synchronized RideEvent claim(Driver d, long nowMillis) {
    if (status != RideStatus.REQUESTED) return null;     // another driver won, or the rider cancelled
    if (!d.tryClaim()) return null;                      // this driver is busy with another ride
    driver = d;
    moveTo(RideStatus.OFFERED);                          // the transition table stays the one rulebook
    d.startTrip(nowMillis);                              // OFFERED -> ON_TRIP
    return moveTo(RideStatus.ACCEPTED);
}

// In RideService
private final Map<String, Ride> open = new ConcurrentHashMap<>();   // broadcast rides still searching

/** What a driver's app lists: open rides of their type within the radius, nearest first. */
List<Ride> openRequestsNear(String driverId) {
    Driver d = driver(driverId);
    Location at = d.location();                          // read once, so the sort sees one stable point
    return open.values().stream()
        .filter(r -> r.type == d.vehicle.type() && r.pickup.distanceKm(at) <= SEARCH_RADIUS_KM)
        .sorted(Comparator.comparingDouble(r -> r.pickup.distanceKm(at)))
        .toList();
}

void claim(String rideId, String driverId) {
    RideEvent e = ride(rideId).claim(driver(driverId), clock.millis());
    if (e == null) throw new IllegalStateException("Ride " + rideId + " is no longer available");   // app shows "taken"
    open.remove(rideId);
    publish(e);
}` },
        { type: "keypoints", items: [
          "<strong>Two guards, one per side of the race.</strong> The ride's lock makes &quot;still REQUESTED? then take it&quot; one step, so of five drivers tapping at once, one wins and four get &quot;no longer available&quot;. The driver's compare-and-set stops one driver from winning two rides tapped at the same moment.",
          "<strong>Still no deadlock.</strong> The ride's lock is the only lock held; the driver claim is a non-blocking CAS, exactly as in sequential mode.",
          "<strong>The listing is a snapshot.</strong> A ride shown in the app can be gone by the time the driver taps; the claim re-checks under the lock, so failure is a normal result, not an error page.",
          "<strong>Mode is configuration.</strong> In broadcast mode <code>requestRide</code> adds the ride to <code>open</code> instead of calling <code>dispatch</code>, and schedules one NO_DRIVER timeout; <code>cancel</code> removes it. A city picks a mode, a natural Strategy (<code>DispatchMode</code>)."
        ] },
        { type: "compare", items: [
          { title: "Sequential offers", tone: "info", html: `<p>The system picks the best driver. Better matches and fairer earnings, but a slow driver costs the rider 15 seconds before the next offer.</p>` },
          { title: "Broadcast", tone: "info", html: `<p>Drivers pick. Fast acceptance and driver choice, but the nearest driver is not guaranteed and drivers cherry-pick long trips.</p>` }
        ] },
        { type: "quiz", q: "In broadcast mode, drivers D1 and D2 tap Accept on ride A at the same instant, and D1 also tapped ride B a moment earlier and won it. What happens to ride A?", options: [
          "Both D1 and D2 are assigned to ride A",
          "D1 wins ride A because D1 tapped first overall",
          "D2 gets ride A: D1's claim fails its compare-and-set because D1 is already ON_TRIP for ride B",
          "Ride A is cancelled because two drivers claimed it"
        ], answer: 2, explain: `<p>Ride A's lock lets one claim in at a time. D1's <code>tryClaim</code> fails because D1 is no longer AVAILABLE, so that claim returns null without touching the ride. D2's claim finds the ride REQUESTED and D2 AVAILABLE, and wins. Whichever order the lock admits them, D2 is the only one who can succeed.</p>` }
      ]
    },
    {
      id: "live-tracking",
      title: "\"How does the rider see the car moving on the map?\"",
      kicker: "Follow-up: observers",
      blocks: [
        { type: "text", html: `<p>Drivers already ping their location every few seconds for matching. Tracking forwards the pings of <em>assigned</em> drivers to their riders, with an ETA, and drops everything else. It is a <strong>new RideTracker class</strong> wired into three existing calls; <code>Ride</code> and <code>Driver</code> do not change.</p>` },
        { type: "code", lang: "java", title: "Live tracking: forward the assigned driver's pings to the rider", code: `record LocationUpdate(String rideId, String riderId, Location driverAt, long etaSeconds) {}
interface TrackingListener { void onLocation(LocationUpdate u); }   // e.g. pushes to the rider's app over a WebSocket

/** Forwards an assigned driver's GPS pings to the rider, at most one update every two seconds per ride. */
final class RideTracker {
    private static final long MIN_INTERVAL_MS = 2_000;
    private record Tracked(Ride ride, AtomicLong lastSentAt) {}

    private final Map<String, Tracked> byDriver = new ConcurrentHashMap<>();   // driver id -> the ride they drive
    private final List<TrackingListener> listeners = new CopyOnWriteArrayList<>();
    private final RouteEstimator routes;
    private final Clock clock;

    RideTracker(RouteEstimator routes, Clock clock) { this.routes = routes; this.clock = clock; }

    void addListener(TrackingListener l) { listeners.add(l); }
    void start(Ride r, String driverId)  { byDriver.put(driverId, new Tracked(r, new AtomicLong())); }   // on ACCEPTED
    void stop(String driverId)           { byDriver.remove(driverId); }                                  // on COMPLETED or CANCELLED

    /** Called from updateLocation on every ping; takes no lock. */
    void onPing(String driverId, Location at) {
        Tracked t = byDriver.get(driverId);
        if (t == null) return;                                   // not on a ride: nothing to track
        long now = clock.millis(), prev = t.lastSentAt().get();
        if (now - prev < MIN_INTERVAL_MS || !t.lastSentAt().compareAndSet(prev, now)) return;   // throttled, or another ping won
        Ride r = t.ride();
        Location target = r.status() == RideStatus.IN_PROGRESS ? r.drop : r.pickup;   // to the pickup, then to the drop
        LocationUpdate u = new LocationUpdate(r.id, r.riderId, at, routes.estimate(at, target).seconds());
        for (TrackingListener l : listeners) l.onLocation(u);
    }
}

// Wiring in RideService:
//   updateLocation: index.update(d, at); tracker.onPing(driverId, at);
//   accept (or claim): tracker.start(ride, driverId);    complete or cancel: tracker.stop(driverId);` },
        { type: "keypoints", items: [
          "<strong>Pings never block.</strong> Thousands arrive per second; <code>onPing</code> does a map lookup and a compare-and-set and holds no lock, so tracking cannot slow matching or dispatch.",
          "<strong>Throttle per ride with a CAS.</strong> Two pings for the same ride in one interval both read the same <code>lastSentAt</code>; only one compare-and-set succeeds, so the rider gets one update, not two.",
          "<strong>Throttle state lives in the tracking entry.</strong> <code>stop</code> removes both at once, so a late ping cannot leave a stray timestamp behind.",
          "<strong>Pickup first, then drop.</strong> Before the trip the ETA is to the pickup; once the ride is IN_PROGRESS it is to the drop, read through the ride's synchronized getter."
        ] },
        { type: "callout", tone: "insight", html: `<p>Tracking is an Observer of location, just as <code>RideListener</code> is an Observer of status, but keep them separate. Status events are rare and every one must be delivered; location events are frequent and only the latest matters, so dropping some is correct.</p>` }
      ]
    },
    {
      id: "payments",
      title: "\"What happens when the rider's card is declined?\"",
      kicker: "Follow-up: money",
      blocks: [
        { type: "text", html: `<p>The core calls a <code>PaymentGateway</code> once, with the ride id as the idempotency key. The follow-up wants the next layer: a <strong>Payment</strong> with its own status, so the system knows what was charged, what failed and what to retry. The key decision is that a payment has its <strong>own lifecycle</strong>: a declined card does not un-complete the ride. Two new classes; <code>RideService.complete</code> changes one line.</p>` },
        { type: "code", lang: "java", title: "Payment with a status, charged once per ride", code: `enum PaymentStatus { PENDING, SUCCEEDED, FAILED }
final class PaymentDeclinedException extends RuntimeException {}

final class Payment {
    final String rideId, riderId;
    final long amount;                                       // paise
    private PaymentStatus status = PaymentStatus.PENDING;    // guarded by this
    private int attempts;                                    // guarded by this

    Payment(String rideId, String riderId, long amount) { this.rideId = rideId; this.riderId = riderId; this.amount = amount; }

    synchronized PaymentStatus status() { return status; }

    /** One attempt at a time; a success is final. Holding this lock during the call only delays retries of this ride. */
    synchronized PaymentStatus attempt(PaymentGateway gateway) {
        if (status == PaymentStatus.SUCCEEDED) return status;
        attempts++;
        try {
            gateway.charge(rideId, riderId, amount);         // ride id = idempotency key: a retry cannot charge twice
            status = PaymentStatus.SUCCEEDED;
        } catch (PaymentDeclinedException e) {
            status = PaymentStatus.FAILED;                   // the ride stays COMPLETED; the debt is retried later
        }                                                    // a timeout propagates and leaves it PENDING: retry is safe
        return status;
    }
}

final class PaymentService {
    private final Map<String, Payment> byRide = new ConcurrentHashMap<>();
    private final PaymentGateway gateway;

    PaymentService(PaymentGateway gateway) { this.gateway = gateway; }

    /** Exactly one Payment per ride, however many times this is called. */
    Payment charge(Ride r, long amount) {
        Payment p = byRide.computeIfAbsent(r.id, id -> new Payment(id, r.riderId, amount));
        p.attempt(gateway);
        return p;
    }

    PaymentStatus retry(String rideId) { return byRide.get(rideId).attempt(gateway); }   // for a retry job

    List<Payment> failed() {
        return byRide.values().stream().filter(p -> p.status() == PaymentStatus.FAILED).toList();
    }
}

// In RideService.complete, replace the direct gateway call with: paymentService.charge(r, fare.total());` },
        { type: "table", headers: ["Situation", "What happens"], rows: [
          ["Card charged", "Payment SUCCEEDED; a receipt event goes to the rider"],
          ["Card declined", "Payment FAILED; the ride stays COMPLETED; the rider must settle before the next ride; a job retries"],
          ["Gateway times out", "Outcome unknown, so the payment stays PENDING; the retry uses the same idempotency key, so the gateway returns the first result instead of charging again"],
          ["complete() retried", "The ride rejects COMPLETED &rarr; COMPLETED before charging; even if it did not, <code>computeIfAbsent</code> returns the same Payment"],
          ["Cash ride", "A <code>PaymentMethod</code> strategy: cash marks the payment SUCCEEDED when the driver confirms collection"]
        ] },
        { type: "callout", tone: "warning", html: `<p>Never decide "charge or not" from a flag read outside a lock: two threads finishing the same ride would both see "not charged". Here the decision is made inside <code>Payment.attempt</code> under the payment's lock, and the gateway's idempotency key protects the network call itself.</p>` }
      ]
    },
    {
      id: "cancellations",
      title: "\"How do cancellations and retries stay correct?\"",
      kicker: "Follow-up: failure paths",
      blocks: [
        { type: "text", html: `<p>A cancellation is two decisions: is the transition legal (the table answers that) and what does it cost (a policy answers that). Fees vary by city and product, so the fee rule is <strong>a new CancellationPolicy</strong>, called from inside <code>Ride.cancel</code>.</p>` },
        { type: "code", lang: "java", title: "Cancellation fees as a policy", code: `interface CancellationPolicy {
    long feeFor(RideStatus status, CancelReason who, Duration sinceAccepted);   // paise
}

/** Free until the driver has been on the way for a grace period; a flat fee after that, more once they have arrived. */
final class GracePeriodPolicy implements CancellationPolicy {
    private static final Duration GRACE = Duration.ofMinutes(2);
    private static final long FEE = 50_00, ARRIVED_FEE = 75_00;                // paise

    public long feeFor(RideStatus status, CancelReason who, Duration sinceAccepted) {
        if (who != CancelReason.RIDER) return 0;                                // drivers and the system never charge riders
        return switch (status) {
            case REQUESTED, OFFERED -> 0;
            case ACCEPTED -> sinceAccepted.compareTo(GRACE) <= 0 ? 0 : FEE;
            case DRIVER_ARRIVED -> ARRIVED_FEE;
            default -> throw new IllegalStateException("Cannot cancel a ride that is " + status);
        };
    }
}

// Inside Ride.cancel, in the same synchronized method, before moveTo(CANCELLED):
//   long fee = policy.feeFor(status, reason, acceptedAt == null ? Duration.ZERO : Duration.between(acceptedAt, now));` },
        { type: "callout", tone: "warning", html: `<p>Compute the fee from the status <em>before</em> cancelling, inside the same critical section. If it is computed outside the ride's lock, the driver's "arrived" can slip in between and the rider is charged the wrong fee, or none.</p>` },
        { type: "text", html: `<p><strong>A driver backs out after accepting.</strong> Cancelling the rider's ride would punish the rider for the driver's choice. Instead allow ACCEPTED &rarr; REQUESTED (one new row in the table), free the driver and search again. Re-searching is the first time a ride can offer the same driver twice, so this is where offers get a number.</p>` },
        { type: "code", lang: "java", title: "A driver backs out: back to searching", code: `// The table gains one row:  ACCEPTED, EnumSet.of(DRIVER_ARRIVED, REQUESTED, CANCELLED),

// In Ride. offerNext increments offerNo and puts it on the OFFERED event; the timer passes it back,
// so an old timer can never withdraw a newer offer to the same driver.
private int offerNo;                                         // guarded by this

synchronized RideEvent driverBacksOut(String driverId, List<Candidate> fresh) {
    requireDriver(driverId, RideStatus.ACCEPTED);
    driver.endTrip();                                        // ON_TRIP -> AVAILABLE
    driver = null;
    candidates.clear();
    for (Candidate c : fresh)
        if (!c.driver().id.equals(driverId)) candidates.add(c);   // never re-offer the driver who left
    return moveTo(RideStatus.REQUESTED);
}

synchronized boolean withdrawOffer(String driverId, int offer) {
    if (status != RideStatus.OFFERED || offer != offerNo || !driver.id.equals(driverId)) return false;
    driver.release();
    driver = null;
    moveTo(RideStatus.REQUESTED);
    return true;
}

// In RideService
void driverCancel(String rideId, String driverId) {
    Ride r = ride(rideId);
    publish(r.driverBacksOut(driverId, matching.rank(index.near(r.pickup, r.type, SEARCH_RADIUS_KM))));
    dispatch(r);                                             // a new offer, a new number, a new timer
}` },
        { type: "table", title: "What protects each retry", headers: ["Duplicate", "Protection"], rows: [
          ["Rider resends the request", "<code>putIfAbsent</code> on riderId:requestId; only the winner dispatches"],
          ["Driver double-taps Accept", "The second call finds ACCEPTED, not OFFERED, and is rejected"],
          ["Decline arrives after the timeout already moved on", "<code>withdrawOffer</code> returns false"],
          ["Complete is retried", "COMPLETED &rarr; COMPLETED is not in the table, so the second call throws before charging"],
          ["The payment call times out and is retried", "The gateway deduplicates on the ride id"],
          ["Rider rates twice", "A <code>rated</code> flag set under the ride's lock"]
        ] },
        { type: "callout", tone: "tip", html: `<p>Give request-id entries a time to live of a few minutes, or the idempotency map grows forever. Retries only happen shortly after the original request. A penalty on a driver's acceptance score for backing out is one more policy, not a change to the ride.</p>` }
      ]
    },
    {
      id: "at-scale",
      title: "\"How does this survive a whole city?\"",
      kicker: "Follow-up: beyond one process",
      blocks: [
        { type: "text", html: `<p>Everything so far runs in one process, which is the right answer for an LLD round. A senior or staff candidate is expected to know where each in-memory mechanism goes when one city has hundreds of thousands of drivers pinging every few seconds, and to say so briefly without turning the round into system design. No class in the design disappears; each one's <em>mechanism</em> moves.</p>` },
        { type: "table", headers: ["In this design", "At city or country scale"], rows: [
          ["DriverIndex in memory", "A location service sharded by geography; pings streamed to the shard that owns the cell"],
          ["CAS on the driver's status", "A conditional write in a shared store: update only where status is AVAILABLE, or set a key only if absent, with a TTL"],
          ["A lock per ride", "One owner per ride (partition by ride id), or optimistic concurrency with a version column"],
          ["ScheduledExecutorService timeouts", "Durable timers or a delayed queue, so a crash does not strand an offer and its driver"],
          ["In-process listeners", "Events on a topic; notification, receipt and analytics services consume them"],
          ["The request-id map", "An idempotency table with a TTL, shared by every instance"]
        ] },
        { type: "callout", tone: "interview", html: `<p>Name it, do not design it. One sentence per row is plenty unless the interviewer asks to go deeper. The point to land is that the <em>shape</em> survives: a claim is still one atomic conditional change, a ride is still a state machine with one writer at a time, and strategies still decide price and match.</p>` }
      ]
    }
  ],
  takeaways: [
    "Each follow-up touches one or two classes: a new SurgeProvider, a claim method on Ride, a RideTracker, a Payment, a CancellationPolicy.",
    "Surge is a per-cell table rebuilt on a schedule and published with one volatile write; the percent is locked onto the ride.",
    "Broadcast flips the race to drivers competing for a ride; the ride's lock and the driver's CAS together let exactly one claim win.",
    "Tracking forwards only assigned drivers' pings, throttled per ride with a compare-and-set and no locks.",
    "A Payment has its own status; a declined card leaves the ride COMPLETED and is retried with the same idempotency key.",
    "Fees are computed inside the ride's lock from the status before cancelling; re-searching after a driver backs out needs numbered offers.",
    "At scale the mechanisms move (geo-sharding, conditional writes, durable timers) but the shape stays."
  ]
};
