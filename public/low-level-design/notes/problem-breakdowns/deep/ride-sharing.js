// Deep dives: Ride Sharing (LLD). Format: DeepDive in public/shared/notes.d.ts.
window.DEEP = window.DEEP || {};
DEEP["ride-sharing"] = {
  hook: `<p>The core design prices with a strategy, ranks drivers with another, walks each ride through an explicit transition table and claims drivers with a compare-and-set. The follow-ups are where SDE-2 and SDE-3 rounds are decided: how surge is actually computed, how candidates are found and ranked fairly, why the state table beats a pile of if statements, what exactly makes the driver claim safe, how cancellations and retries stay correct, and what you would say if the interviewer asks how this survives a whole city.</p>`,
  sections: [
    {
      id: "pricing-and-surge",
      title: "Pricing: rate cards, surge and the price the rider pays",
      kicker: "Deep dive: Strategy for money",
      blocks: [
        { type: "text", html: `<p>Pricing changes more often than any other part of a ride-hailing product: new cities, new ride types, airport packages, promotions. The strategy interface takes everything a price can depend on (ride type, trip metrics, surge) and returns a <strong>breakdown</strong>, not a bare number, because receipts and disputes need the line items.</p>` },
        { type: "table", headers: ["Strategy", "Formula", "Used for"], rows: [
          ["MeteredPricing", "max(minimum, round((base + km &times; perKm + minutes &times; perMinute) &times; surge))", "Everyday city rides"],
          ["FlatRatePricing", "A fixed fare per ride type", "Airport transfers, rental packages"],
          ["A promotion wrapper", "Wraps another strategy and subtracts a capped discount", "Coupons and subscriptions, without touching the base rules"]
        ] },
        { type: "code", lang: "java", title: "Surge from demand and supply", code: `/** Demand = open requests in a cell; supply = available drivers there. Rebuilt by a scheduler every minute. */
final class DemandSupplySurge implements SurgeProvider {
    private static final double MAX = 3.0, SENSITIVITY = 0.5;
    private volatile Map<Cell, Double> snapshot = Map.of();     // immutable; replaced as a whole

    public double multiplierAt(Location pickup) { return snapshot.getOrDefault(Cell.of(pickup), 1.0); }

    void recompute(Map<Cell, Integer> openRequests, Map<Cell, Integer> availableDrivers) {
        Map<Cell, Double> next = new HashMap<>();
        openRequests.forEach((cell, demand) -> next.put(cell, multiplier(demand, availableDrivers.getOrDefault(cell, 0))));
        snapshot = Map.copyOf(next);                             // one volatile write publishes the new table
    }

    static double multiplier(int demand, int supply) {
        if (demand <= supply) return 1.0;
        if (supply == 0) return MAX;
        double raw = 1.0 + ((double) demand / supply - 1.0) * SENSITIVITY;
        return Math.round(Math.min(MAX, raw) * 10) / 10.0;     // shown to riders in 0.1 steps
    }
}` },
        { type: "keypoints", items: [
          "<strong>Per cell, on a schedule.</strong> Computing surge on every request would make two riders a street apart see different prices second to second; a table rebuilt every minute is stable and cheap to read.",
          "<strong>Safe without locks.</strong> Readers only ever see a complete, immutable map, because the scheduler builds a new one and publishes it with a single volatile write.",
          "<strong>Capped and rounded.</strong> A ceiling protects riders and the brand; 0.1 steps keep the number readable.",
          "<strong>Smoothed in practice.</strong> Blend with the previous value or require a change to persist for two rounds, so the multiplier does not flicker when one driver logs on.",
          "<strong>Locked on the ride.</strong> The multiplier in the estimate is stored on the ride and reused for the final fare."
        ] },
        { type: "compare", title: "Estimate versus final fare", items: [
          { title: "Metered final fare", tone: "info", html: `<p>Reprice the actual distance and time with the locked surge. Fair for detours and traffic, but the rider does not know the exact amount up front.</p>` },
          { title: "Upfront price with a tolerance", tone: "ok", html: `<p>Charge the quoted price unless the metered fare differs by more than a tolerance, which signals a changed drop or a long detour. Riders get certainty; real changes are still priced.</p>` }
        ] },
        { type: "code", lang: "java", title: "Final fare: upfront price with a tolerance", code: `/** Riders pay the quoted price unless the trip really changed (a detour, a new drop, a long jam). */
final class UpfrontFare {
    private static final long TOLERANCE_PERCENT = 15;
    private final PricingStrategy pricing;

    UpfrontFare(PricingStrategy pricing) { this.pricing = pricing; }

    FareBreakdown finalFare(Ride ride, TripMetrics actual) {
        FareBreakdown metered = pricing.price(ride.type, actual, ride.estimate.surge());
        long quoted = ride.estimate.total();
        long diff = Math.abs(metered.total() - quoted);
        return diff * 100 <= quoted * TOLERANCE_PERCENT ? ride.estimate : metered;   // integer maths, no rounding drift
    }
}` },
        { type: "callout", tone: "mistake", html: `<p>Using <code>double</code> for amounts. Distances, minutes and the surge multiplier can be doubles, but every amount is a <code>long</code> in paise, and each line item is rounded exactly once. Summing doubles of rupees produces receipts that are a paisa off, and those become support tickets.</p>` }
      ]
    },
    {
      id: "matching-and-search",
      title: "Matching: finding and ranking nearby drivers",
      kicker: "Deep dive: candidate search",
      blocks: [
        { type: "text", html: `<p>Matching is two separate questions. <strong>Search</strong> is geometry: which available drivers of this ride type are within a few kilometres? <strong>Ranking</strong> is policy: which of them should be offered first? The index answers the first and the strategy the second, so changing the policy never touches the concurrent index.</p>` },
        { type: "table", headers: ["Index", "How it works", "Trade-off"], rows: [
          ["Scan every driver", "Compute the distance to each one", "Fine for a demo; tens of thousands of distance checks per request in a real city"],
          ["Grid cells (chosen)", "Floor latitude and longitude to a cell; scan the rings of cells covering the radius", "Tiny code, O(1) updates; cells narrow east to west away from the equator"],
          ["Geohash", "Encode a point as a string whose prefix is a cell; neighbours share prefixes", "Easy to store and shard by prefix; edge effects at cell borders"],
          ["Hexagonal grid", "Hexagons, such as Uber's open-source H3 library", "Every neighbour is the same distance away; needs a library"],
          ["Quadtree", "Split cells that hold too many drivers", "Adapts to dense downtowns; more complex to update concurrently"]
        ] },
        { type: "callout", tone: "tip", html: `<p>Size cells so that the search radius covers only a few rings (cells of about 1 km for a 3 km search). If the first search finds nobody, widen the radius once or twice before giving up with NO_DRIVER.</p>` },
        { type: "compare", title: "Ranking policies", items: [
          { title: "Nearest driver", tone: "info", html: `<p>Shortest pickup time and the default. Risk: drivers parked at hotspots get everything, and a driver just outside the radius waits forever.</p>` },
          { title: "Highest rated", tone: "info", html: `<p>Rewards quality. Risk: a 4.9 driver 3 km away beats a 4.8 driver at the corner, which is worse for the rider; break ties on distance.</p>` },
          { title: "Least recently assigned", tone: "info", html: `<p>Spreads earnings fairly. Risk: ignores distance unless used as a tie-breaker or blended into a score.</p>` }
        ] },
        { type: "code", lang: "java", title: "A weighted scoring strategy", code: `/** Blends distance, rating and idle time into one score; lower is better. Weights come from configuration. */
final class WeightedScore implements MatchingStrategy {
    private final double perKm, perRatingPoint, perIdleMinute;
    private final Clock clock;

    WeightedScore(double perKm, double perRatingPoint, double perIdleMinute, Clock clock) {
        this.perKm = perKm; this.perRatingPoint = perRatingPoint; this.perIdleMinute = perIdleMinute; this.clock = clock;
    }

    public List<Candidate> rank(List<Candidate> c) {
        long now = clock.millis();
        return c.stream().sorted(Comparator.comparingDouble(x -> score(x, now))).toList();
    }

    private double score(Candidate c, long now) {
        double idleMinutes = Math.min((now - c.lastAssignedAt()) / 60_000.0, 60);   // cap: idle beyond an hour adds nothing
        return c.km() * perKm - c.rating() * perRatingPoint - idleMinutes * perIdleMinute;
    }
}` },
        { type: "callout", tone: "warning", html: `<p>Why rank <code>Candidate</code> records instead of sorting <code>Driver</code> objects by <code>driver.location()</code>? Locations change while the sort runs. A comparator whose answers change mid-sort breaks its contract, and Java's sort may then throw "Comparison method violates its general contract". Reading distance, rating and idle time once into an immutable record gives the sort stable values.</p>` }
      ]
    },
    {
      id: "state-machine",
      title: "The ride state machine",
      kicker: "Deep dive: legal transitions only",
      blocks: [
        { type: "diagram", title: "Ride statuses and the transitions between them", caption: "The happy path runs left to right. A declined or expired offer returns the ride to REQUESTED. Cancelling is allowed only before the trip starts; COMPLETED and CANCELLED are terminal.", svg: `<svg viewBox="0 0 770 250" role="img" aria-label="Ride state machine from REQUESTED to COMPLETED, with CANCELLED reachable from the first four states">
<defs><marker id="rs-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="10" y="70" width="108" height="40" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/><text x="64" y="95" text-anchor="middle" font-size="12" style="fill: var(--dg-ink)">REQUESTED</text>
<rect x="138" y="70" width="108" height="40" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/><text x="192" y="95" text-anchor="middle" font-size="12" style="fill: var(--dg-ink)">OFFERED</text>
<rect x="266" y="70" width="108" height="40" rx="8" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/><text x="320" y="95" text-anchor="middle" font-size="12" style="fill: var(--dg-ink)">ACCEPTED</text>
<rect x="394" y="70" width="108" height="40" rx="8" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/><text x="448" y="95" text-anchor="middle" font-size="11" style="fill: var(--dg-ink)">DRIVER_ARRIVED</text>
<rect x="522" y="70" width="108" height="40" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/><text x="576" y="95" text-anchor="middle" font-size="12" style="fill: var(--dg-ink)">IN_PROGRESS</text>
<rect x="650" y="70" width="108" height="40" rx="8" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)"/><text x="704" y="95" text-anchor="middle" font-size="12" style="fill: var(--dg-ink)">COMPLETED</text>
<rect x="255" y="190" width="130" height="40" rx="8" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)"/><text x="320" y="215" text-anchor="middle" font-size="12" style="fill: var(--dg-ink)">CANCELLED</text>
<line x1="118" y1="90" x2="136" y2="90" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#rs-arrow)"/>
<line x1="246" y1="90" x2="264" y2="90" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#rs-arrow)"/>
<line x1="374" y1="90" x2="392" y2="90" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#rs-arrow)"/>
<line x1="502" y1="90" x2="520" y2="90" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#rs-arrow)"/>
<line x1="630" y1="90" x2="648" y2="90" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#rs-arrow)"/>
<path d="M192 70 C 180 30, 80 30, 66 68" fill="none" stroke-width="1.5" style="stroke: var(--dg-2)" marker-end="url(#rs-arrow)"/>
<text x="128" y="28" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">decline / timeout</text>
<line x1="64" y1="110" x2="270" y2="196" stroke-width="1.5" style="stroke: var(--dg-bad)" marker-end="url(#rs-arrow)"/>
<line x1="192" y1="110" x2="296" y2="188" stroke-width="1.5" style="stroke: var(--dg-bad)" marker-end="url(#rs-arrow)"/>
<line x1="320" y1="110" x2="320" y2="187" stroke-width="1.5" style="stroke: var(--dg-bad)" marker-end="url(#rs-arrow)"/>
<line x1="448" y1="110" x2="346" y2="188" stroke-width="1.5" style="stroke: var(--dg-bad)" marker-end="url(#rs-arrow)"/>
<text x="560" y="205" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">cancel: rider, driver or no driver</text>
<text x="560" y="225" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">not allowed once IN_PROGRESS</text>
</svg>` },
        { type: "table", headers: ["From", "Allowed next", "Triggered by"], rows: [
          ["REQUESTED", "OFFERED, CANCELLED", "A driver is claimed; the rider cancels or no candidate is left"],
          ["OFFERED", "ACCEPTED, REQUESTED, CANCELLED", "The driver accepts; declines or the offer times out; the rider cancels"],
          ["ACCEPTED", "DRIVER_ARRIVED, CANCELLED", "The driver reaches the pickup; either side cancels"],
          ["DRIVER_ARRIVED", "IN_PROGRESS, CANCELLED", "The trip starts; the rider is a no-show or cancels"],
          ["IN_PROGRESS", "COMPLETED", "The driver ends the trip"],
          ["COMPLETED, CANCELLED", "Nothing", "Terminal"]
        ] },
        { type: "compare", title: "Three ways to encode the rules", items: [
          { title: "Enum plus a transition table (chosen)", tone: "ok", html: `<p>All the rules are visible in one place and testable exhaustively. Behaviour that differs per state is small here (mostly "is this allowed?"), so a table is enough.</p>` },
          { title: "State pattern, one class per status", tone: "warn", html: `<p>Worth it when each state behaves very differently (what <code>step()</code> means for an elevator). For a ride, seven classes would mostly repeat "throw, not allowed".</p>` },
          { title: "If statements in each method", tone: "bad", html: `<p>The rules scatter across accept, cancel and complete; nobody can answer "can a cancelled ride be completed?" without reading all of them.</p>` }
        ] },
        { type: "code", lang: "java", title: "Every illegal transition is rejected", code: `@Test
void onlyTableTransitionsAreAllowed() {
    Set<String> legal = Set.of(
        "REQUESTED>OFFERED", "REQUESTED>CANCELLED",
        "OFFERED>ACCEPTED", "OFFERED>REQUESTED", "OFFERED>CANCELLED",
        "ACCEPTED>DRIVER_ARRIVED", "ACCEPTED>CANCELLED",
        "DRIVER_ARRIVED>IN_PROGRESS", "DRIVER_ARRIVED>CANCELLED",
        "IN_PROGRESS>COMPLETED");
    for (RideStatus from : RideStatus.values())
        for (RideStatus to : RideStatus.values())
            assertEquals(legal.contains(from + ">" + to), from.canMoveTo(to), from + " -> " + to);
}` },
        { type: "callout", tone: "interview", html: `<p>Draw the table before writing code and ask "can the rider cancel after the driver has arrived? can a driver cancel after accepting?" The answers are one row each, and asking shows you treat the lifecycle as a contract rather than something the code happens to allow.</p>` }
      ]
    },
    {
      id: "atomic-assignment",
      title: "Atomic driver assignment and offer timeouts",
      kicker: "Deep dive: concurrency",
      blocks: [
        { type: "problem", html: `<p>Two riders on the same street request at the same instant. Both dispatch threads compute candidates, and the nearest driver tops both lists. Without care, both rides are offered to that driver, one of the riders waits for an offer that can never be honoured, and the driver app shows two requests.</p>` },
        { type: "code", lang: "java", title: "Broken: check, then set", code: `// Two dispatcher threads, two riders, one nearby driver
if (driver.status() == DriverStatus.AVAILABLE) {      // both threads see AVAILABLE
    driver.setStatus(DriverStatus.OFFERED);           // both write OFFERED
    ride.offerTo(driver);                             // the same driver is offered two rides
}` },
        { type: "compare", title: "Ways to make the claim atomic", items: [
          { title: "Compare-and-set on status (chosen)", tone: "ok", html: `<p><code>compareAndSet(AVAILABLE, OFFERED)</code> checks and changes in one indivisible step. Exactly one caller gets true; the rest try their next candidate. It never blocks, so it can run while the ride's lock is held without any deadlock risk.</p>` },
          { title: "A lock per driver", tone: "info", html: `<p>Equally correct and useful if a claim must update several driver fields. You must then fix a lock order (always ride, then driver) and never call out while holding both.</p>` },
          { title: "One global dispatch lock", tone: "warn", html: `<p>Correct and simple, but every request in the city queues behind it, including requests on opposite sides of town that could never conflict.</p>` },
          { title: "Check, then set", tone: "bad", html: `<p>Two separate steps with a gap between them: the race above.</p>` }
        ] },
        { type: "steps", title: "Accept and timeout arrive together", items: [
          "The offer to D3 is 15 seconds old. D3 taps Accept on one thread just as the timer fires on another.",
          "Both call into ride A, and both methods are synchronized on the ride, so one waits.",
          "If accept runs first: status OFFERED and driver D3 match, so the ride becomes ACCEPTED and D3 ON_TRIP. The timer then runs <code>withdrawOffer(D3)</code>, sees ACCEPTED and returns false. Nothing else happens.",
          "If the timer runs first: D3 is released to AVAILABLE, the ride returns to REQUESTED and is offered to the next candidate. D3's accept then fails the 'offered to you' check and the app says the offer expired.",
          "In both orders the ride ends with one driver and the driver with at most one ride."
        ] },
        { type: "code", lang: "java", title: "Stress test: one driver, many riders", code: `@Test
void aDriverIsNeverClaimedTwice() throws Exception {
    Driver d = new Driver("d1", new Vehicle("KA01AB1234", "Swift", RideType.MINI), new Location(12.97, 77.59));
    d.goOnline();
    int threads = 16;
    ExecutorService pool = Executors.newFixedThreadPool(threads);
    CountDownLatch start = new CountDownLatch(1);
    AtomicInteger winners = new AtomicInteger();
    List<Future<?>> futures = new ArrayList<>();
    for (int i = 0; i < threads; i++)
        futures.add(pool.submit(() -> {
            start.await();                                   // release every thread at once
            if (d.tryClaim()) winners.incrementAndGet();
            return null;
        }));
    start.countDown();
    for (Future<?> f : futures) f.get(5, TimeUnit.SECONDS);
    assertEquals(1, winners.get());
    assertEquals(DriverStatus.OFFERED, d.status());
    pool.shutdown();
}` },
        { type: "keypoints", items: [
          "<strong>Offers time out on a scheduler, not a sleeping thread.</strong> Thousands of pending offers cost thousands of small scheduled tasks, not thousands of blocked threads.",
          "<strong>Stale callbacks are harmless by design.</strong> Every handler re-checks (status, driver) under the ride's lock before acting, so a late timer, a double tap or a retried decline changes nothing.",
          "<strong>Location pings never wait for dispatch.</strong> They write a volatile field and, on a cell change, move the driver between two concurrent sets; matching reads the same sets without locking.",
          "<strong>Notify after unlocking.</strong> Push notifications can take hundreds of milliseconds; they must not hold the ride's lock while the driver is trying to accept."
        ] },
        { type: "quiz", q: "Driver D1 accepts ride A, and a moment later the 15-second offer timer for D1 fires and calls withdrawOffer(D1). What happens?", options: [
          "D1 is released and ride A goes back to REQUESTED",
          "withdrawOffer returns false and nothing changes",
          "Ride A ends up offered to a second driver while D1 drives to the pickup",
          "An exception cancels ride A"
        ], answer: 1, explain: `<p>withdrawOffer runs under ride A's lock and first checks that the ride is still OFFERED to D1. The accept already moved it to ACCEPTED, so the check fails and the method returns false without touching the driver or the ride.</p>` }
      ]
    },
    {
      id: "cancellations-and-idempotency",
      title: "Cancellations, retries and charging once",
      kicker: "Deep dive: failure paths",
      blocks: [
        { type: "text", html: `<p>A cancellation is two decisions: is the transition legal (the table answers that) and what does it cost (a policy answers that). Fees vary by city and product, so the fee rule is a strategy of its own.</p>` },
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
        { type: "callout", tone: "warning", html: `<p>Compute the fee from the status <em>before</em> cancelling, inside the same critical section. If the fee is computed outside the ride's lock, the driver's "arrived" can slip in between and the rider is charged the wrong fee, or none.</p>` },
        { type: "table", title: "What protects each retry", headers: ["Duplicate", "Protection"], rows: [
          ["Rider resends the request", "<code>putIfAbsent</code> on riderId:requestId; only the winner dispatches"],
          ["Driver double-taps Accept", "The second call finds ACCEPTED, not OFFERED, and is rejected"],
          ["Decline arrives after the timeout already moved on", "<code>withdrawOffer</code> returns false"],
          ["Complete is retried", "COMPLETED &rarr; COMPLETED is not in the table, so the second call throws before charging"],
          ["The payment call times out and is retried", "The gateway deduplicates on the ride id as idempotency key"],
          ["Rider rates twice", "A <code>rated</code> flag set under the ride's lock"]
        ] },
        { type: "text", html: `<p><strong>A driver cancels after accepting.</strong> Rather than cancelling the rider's ride, allow ACCEPTED &rarr; REQUESTED: free the driver, drop them from the candidate list, and dispatch again. It is one new row in the table, plus perhaps a penalty on the driver's acceptance score, which is another policy.</p>` },
        { type: "callout", tone: "tip", html: `<p>Give request-id entries a time to live (minutes are enough), or the idempotency map grows forever. Retries only happen shortly after the original request.</p>` }
      ]
    },
    {
      id: "at-scale",
      title: "What changes at scale",
      kicker: "Staff-level: beyond one process",
      blocks: [
        { type: "text", html: `<p>Everything so far runs in one process, which is the right answer for an LLD round. A staff candidate is expected to know where each in-memory mechanism goes when one city has hundreds of thousands of drivers pinging every few seconds, and to say so briefly without turning the round into system design.</p>` },
        { type: "table", headers: ["In this design", "At city or country scale"], rows: [
          ["DriverIndex in memory", "A location service sharded by geography; pings streamed through Kafka to the shard that owns the cell"],
          ["CAS on the driver's status", "A conditional write in a shared store: update only where status is AVAILABLE, or set a key only if absent, with a TTL"],
          ["A lock per ride", "One owner per ride (partition by ride id), or optimistic concurrency with a version column"],
          ["ScheduledExecutorService timeouts", "Durable timers or a delayed queue, so a crash doesn't strand an offer and its driver"],
          ["In-process listeners", "Events on a topic; notification, receipt and analytics services consume them"],
          ["The request-id map", "An idempotency table with a TTL, shared by every instance"]
        ] },
        { type: "callout", tone: "interview", html: `<p>Name it, don't design it. One sentence per row is plenty unless the interviewer asks to go deeper. The point to land is that the <em>shape</em> survives: a claim is still an atomic conditional change, a ride is still a state machine with one writer at a time, and strategies still decide price and match.</p>` }
      ]
    }
  ],
  takeaways: [
    "Pricing and matching are strategies because they change per city and experiment; RideService never changes when a rule ships.",
    "Surge is computed per cell on a schedule, capped, rounded and locked onto the ride at request time; amounts are long paise.",
    "Search (a grid index) and ranking (a strategy over immutable Candidate snapshots) are separate concerns.",
    "Every ride status change goes through one moveTo that checks an explicit transition table, under the ride's lock.",
    "A driver is claimed with compare-and-set; offers time out on a scheduler and every handler re-checks the state before acting.",
    "Requests, completion, payment and rating are each idempotent, so retries are safe.",
    "At scale the mechanisms move (geo-sharding, conditional writes, durable timers) but the shape stays."
  ]
};
