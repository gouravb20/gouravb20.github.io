// LLD problem breakdown: Ride Sharing. Format: Chapter in public/shared/notes.d.ts; shared helpers in data-part2.js.
// Imports are omitted in the code.
(function () {
const { levels, PRACTICE_TIP } = LLD_PROBLEMS_KIT;

window.DATA.chapters.push({
    id: `ride-sharing`, part: 3, number: 0, difficulty: `hard`,
    title: `Ride Sharing: matching drivers, a ride state machine and one driver per ride`,
    references: [{ title: `awesome-low-level-design: Ride-Sharing Service`, url: `https://github.com/ashishps1/awesome-low-level-design/blob/main/problems/ride-sharing-service.md` }],
    overview: `A rider asks for a fare and requests a cab. The system offers the ride to nearby drivers one at a time until someone accepts, then the ride moves from pickup to drop-off and the rider is charged once. This page works the problem in interview order: clarify the requirements, find the entities, design the classes top down, implement dispatch and the ride lifecycle (comparing a weak, a better and a strong option at each decision), verify with a trace, then handle follow-ups. The design lands on <strong>Strategy</strong> for pricing and matching, an <strong>explicit transition table</strong> for the ride, a <strong>compare-and-set</strong> claim on the driver so two riders never share one, and offers that time out on a scheduler instead of a waiting thread.`,
    problem: [
      { id: `understanding`, title: `What a ride-sharing core does`, kicker: `The problem`, blocks: [
        { type: `problem`, html: `<p>Riders want a cab now; drivers nearby are free, busy or offline. A rider sees a price, asks for a ride, and within seconds one driver must be committed to that rider and to nobody else. The ride then goes through pickup, the trip and drop-off, and ends with exactly one charge. Thousands of riders and drivers do this at once, on flaky phone networks.</p>` },
        { type: `text`, html: `<p>The prompt is usually one line: <em>"Design a ride-hailing service like Uber or Ola."</em> That sentence can mean a whole distributed system or a single class model, so the first minutes go into deciding which one you are building and turning it into a spec.</p>` }
      ] },
      { id: `clarifying`, title: `Clarifying questions`, kicker: `Step 1: requirements`, blocks: [
        { type: `text`, html: `<p>Work through four kinds of question: <strong>what the system must do</strong>, <strong>what happens with bad input</strong>, <strong>what is deliberately left out</strong>, and <strong>what might be added later</strong>. Spend two or three minutes here; each answer removes a branch you would otherwise have to design.</p>` },
        { type: `table`, headers: [`You ask`, `A typical answer`, `What it decides`], rows: [
          [`Is this the in-process core, or "Design Uber" end to end?`, `The core: object model and dispatch logic in one service`, `Maps, card processing and notifications sit behind interfaces; no sharding or queues`],
          [`Do we offer a ride to one driver at a time, or show it to many?`, `One at a time, 15 seconds each; broadcast is a later option`, `An atomic claim on each driver, and an offer timer`],
          [`How is a driver found?`, `Available drivers of the ride type within about 3 km, ranked by a policy`, `A spatial index for "who is near", and a <code>MatchingStrategy</code> for the order`],
          [`How is the price decided? Is the estimate the final price?`, `A rate card per ride type, times surge; the final fare uses the actual trip with the surge locked in; some routes are flat`, `A <code>PricingStrategy</code> called twice; amounts in whole paise`],
          [`What if nobody accepts?`, `Cancel the ride with reason NO_DRIVER and tell the rider`, `A terminal path out of the search`],
          [`Who can cancel, and when?`, `Rider or driver, but only before the trip starts`, `Rows in a transition table; fees are a follow-up`],
          [`What about bad input: pickup equal to drop, a driver acting on someone else's ride, rating twice?`, `Reject it and change nothing`, `Validation at the service boundary; the ride checks the driver on every action`],
          [`Do apps retry on a flaky network?`, `Yes, with a client-generated request id`, `An idempotent <code>requestRide</code>`],
          [`Live tracking, failed payments, pooled rides?`, `Tracking and payment failures later; pooling is out`, `Follow-ups, kept out of the core classes`]
        ] },
        { type: `callout`, tone: `insight`, title: `LLD core or system design?`, html: `<p>"Design Uber" in a system design round means geo-sharded location services, streams of GPS pings and durable timers. In an LLD round it means the classes one service would run: how a ride is modelled, how a driver is claimed, how rules plug in. Asking which one is wanted, out loud, is the most useful question you can ask; the answer is almost always "the in-process core, with external systems behind interfaces". The distributed version still matters, but as one minute at the end (the at-scale follow-up), not as the design.</p>` }
      ] },
      { id: `final-requirements`, title: `Final requirements`, kicker: `Step 1: requirements`, blocks: [
        { type: `code`, lang: `text`, title: `Final requirements`, code: `Requirements
  1. A rider gets a fare estimate, then requests a ride: pickup, drop, ride type.
  2. The system finds available drivers of that ride type within 3 km and
     offers the ride to one driver at a time; each offer expires after 15 s.
  3. A driver accepts or declines; on decline or timeout the next candidate is
     tried. If nobody is left, the ride is cancelled with reason NO_DRIVER.
  4. A ride moves REQUESTED -> OFFERED -> ACCEPTED -> DRIVER_ARRIVED ->
     IN_PROGRESS -> COMPLETED, and can be CANCELLED before the trip starts.
     Any other transition is rejected.
  5. Pricing is pluggable: metered (base + per km + per minute by ride type,
     times a surge multiplier) or flat rate. Amounts are whole paise.
  6. Matching is pluggable: nearest, highest rated, least recently assigned,
     or a weighted blend.
  7. The final fare is priced from the actual trip with the surge locked at
     request time; the rider is charged once through a payment gateway.
  8. Riders rate the driver once per completed ride; listeners are told of
     every status change.
  9. Concurrency: a driver never holds two rides, a ride never has two
     drivers, and a retried request never creates a second ride.
 10. Invalid actions (pickup equal to drop, a driver acting on a ride that is
     not theirs, a second rating) are rejected and change nothing.

Out of scope
  - Maps and routing (a RouteEstimator interface), card processing (a
    PaymentGateway interface), driver onboarding, pooled and scheduled rides
  - Later, as follow-ups: how surge is computed, broadcast requests, live
    tracking, payment failures, cancellation fees, running at city scale` },
        { type: `callout`, tone: `tip`, html: PRACTICE_TIP }
      ] }
    ],
    solution: [
      { id: `entities`, title: `Core entities`, kicker: `Step 2: entities`, blocks: [
        { type: `text`, html: `<p>Scan the requirements for nouns that hold state or enforce rules. Plenty of nouns appear (rider, driver, cab, trip, fare, offer, map, payment), and some of them are only values or interfaces. Test each one before committing to a class.</p>` },
        { type: `table`, headers: [`Candidate`, `Verdict`, `Why`], rows: [
          [`Rider`, `A record`, `Id and name; the service only needs the id. No behaviour in this problem`],
          [`Driver`, `A class`, `Holds a status that many rides compete for, a location that changes every few seconds, and a rating`],
          [`User, as a base class of Rider and Driver`, `Not a class`, `They share an id and a name and nothing else; an inheritance tree adds code without adding a rule`],
          [`Vehicle`, `A record`, `Plate, model and ride type; the type decides the rate card and which drivers are eligible`],
          [`Location`, `A record`, `Latitude and longitude with a distance function`],
          [`Ride (or Trip)`, `A class`, `The lifecycle: status, assigned driver, candidates left to try, estimate and final fare. It enforces "only legal steps"`],
          [`Fare`, `A value, not an entity`, `A breakdown of line items; it has no identity and never changes once computed`],
          [`Offer`, `Not a class`, `An offer is the ride's OFFERED status plus its driver; the timeout callback only needs the driver id`],
          [`Map, route, payment, notification`, `Interfaces`, `External systems: <code>RouteEstimator</code>, <code>PaymentGateway</code>, <code>RideListener</code>`],
          [`RideService`, `A class`, `The entry point that coordinates requests, offers, timeouts and driver responses`],
          [`Trip history`, `Out of scope`, `Nothing in the requirements reads it`]
        ] },
        { type: `table`, title: `The entities we keep`, headers: [`Entity`, `Responsibility`], rows: [
          [`RideService`, `The entry point. Estimates, accepts requests idempotently, ranks candidates, makes offers and schedules their timeouts, and routes driver actions to the right ride. Owns no lifecycle rules.`],
          [`Ride`, `One ride's lifecycle. Every status change goes through one method that checks a transition table, under the ride's own lock.`],
          [`Driver`, `Availability (changed only by compare-and-set), latest location, rating. Knows nothing about rides.`],
          [`DriverIndex`, `Grid cells to drivers, so "available drivers near this point" scans a few cells instead of the whole city. Found during design, not in the prompt.`],
          [`PricingStrategy, MatchingStrategy`, `The rules that change per city and per experiment: what a trip costs and which driver is asked first.`],
          [`Value records`, `Location, Vehicle, Rider, TripMetrics, FareBreakdown, Candidate.`]
        ] },
        { type: `callout`, tone: `tip`, html: `<p>Saying "Offer is tempting, but it is just a status plus a driver on the ride" is a good sign in an interview: it shows you are choosing classes by the rules they enforce, not by the nouns in the prompt. The index is the opposite case: no noun in the prompt, but "who is near?" needs a structure of its own.</p>` }
      ] },
      { id: `service-design`, title: `Class design: RideService`, kicker: `Step 3: class design, top down`, blocks: [
        { type: `text`, html: `<p>Start from the class that the apps talk to, and derive its state and methods from the requirements. For each requirement ask: what must this class remember, and what must it let callers do?</p>` },
        { type: `table`, headers: [`Requirement`, `What RideService remembers`], rows: [
          [`"Riders and drivers act on rides by id"`, `Rides by id, drivers by id`],
          [`"A retried request never creates a second ride"`, `A map from riderId:requestId to the ride it created`],
          [`"Drivers within 3 km"`, `A <code>DriverIndex</code>`],
          [`"Pricing and matching are pluggable"`, `One <code>PricingStrategy</code> and one <code>MatchingStrategy</code>, injected`],
          [`"Each offer expires after 15 s"`, `A scheduler and a clock, injected so tests can fake time`],
          [`"Charged once; listeners told of every change"`, `A <code>PaymentGateway</code> and a list of listeners`]
        ] },
        { type: `table`, headers: [`Need`, `Method`], rows: [
          [`A fare before booking`, `<code>FareBreakdown estimate(Location pickup, Location drop, RideType type)</code>`],
          [`Request a ride, safely retried`, `<code>Ride requestRide(String riderId, String requestId, Location pickup, Location drop, RideType type)</code>`],
          [`Rider cancels or rates`, `<code>void cancel(String rideId, String riderId)</code>, <code>void rateDriver(String rideId, String riderId, int stars)</code>`],
          [`Driver availability and position`, `<code>goOnline(driverId, at)</code>, <code>goOffline(driverId)</code>, <code>updateLocation(driverId, at)</code>`],
          [`Driver answers an offer`, `<code>void accept(String rideId, String driverId)</code>, <code>void decline(String rideId, String driverId)</code>`],
          [`The trip itself`, `<code>arrived(rideId, driverId)</code>, <code>start(rideId, driverId)</code>, <code>complete(rideId, driverId, TripMetrics actual)</code>`]
        ] },
        { type: `keypoints`, items: [
          `<strong>Every driver action names the ride and the driver.</strong> The ride checks that the driver is the one it is offered to or assigned to, so a driver can never move someone else's ride.`,
          `<strong>Event driven, no waiting threads.</strong> An offer schedules a timeout; accept, decline and timeout are events that each take the ride's lock briefly. Nothing blocks while a driver decides.`,
          `<strong>Not a Singleton.</strong> Many write-ups (including the awesome-low-level-design solution) make the service a Singleton with setters for its strategies. Create one instance at startup and pass it to the controllers instead: tests can build their own with fake strategies and a fake clock, and strategies cannot be swapped halfway through a ride.`
        ] }
      ] },
      { id: `driver-design`, title: `Class design: Driver and the claim`, kicker: `Step 3: class design`, blocks: [
        { type: `table`, headers: [`Requirement`, `What a driver remembers`], rows: [
          [`"A driver never holds two rides"`, `A status: OFFLINE, AVAILABLE, OFFERED or ON_TRIP`],
          [`"Drivers within 3 km"`, `The latest location, replaced by every GPS ping`],
          [`"Highest rated" matching, and rating after a ride`, `Rating sum and count`],
          [`"Least recently assigned" matching`, `When the last ride was assigned`]
        ] },
        { type: `text`, html: `<p>The hard question is how a ride <strong>takes</strong> a driver. Two riders on the same street request at the same instant; both dispatch threads rank the same nearest driver first. Exactly one of them may get that driver.</p>` },
        { type: `code`, lang: `java`, title: `Broken: check, then set`, code: `// Two dispatch threads, two riders, one nearby driver
if (driver.status() == DriverStatus.AVAILABLE) {      // both threads see AVAILABLE
    driver.setStatus(DriverStatus.OFFERED);           // both write OFFERED
    ride.offerTo(driver);                             // the same driver now holds two offers
}` },
        { type: `compare`, items: [
          { title: `Weak: check, then set`, tone: `warn`, html: `<p>Read the status, then write it. Fine in a single-threaded demo, and it is what most first drafts (and the awesome-low-level-design solution's <code>setStatus</code>) do. Under concurrency both threads pass the check in the gap between the two steps, and one driver gets two rides.</p>` },
          { title: `Better: one global dispatch lock`, tone: `info`, html: `<p>Hold one lock while choosing and claiming. Correct and easy to explain, but every request in the city queues behind it, including rides on opposite sides of town that could never compete for the same driver.</p>` },
          { title: `Strong: compare-and-set on the driver's status`, tone: `ok`, html: `<p><code>status.compareAndSet(AVAILABLE, OFFERED)</code> checks and changes in one indivisible step. Of all the rides racing for a driver, exactly one call returns true; the others move to their next candidate. It never blocks, so it can run while a ride holds its own lock without any risk of deadlock.</p>` }
        ] },
        { type: `text`, html: `<p>We take compare-and-set. Every change to a driver's status is then a CAS from an expected value, which also makes the driver's own transitions safe: going offline only works from AVAILABLE, so a driver with a pending offer must answer it first. Location is a <code>volatile</code> reference to an immutable <code>Location</code>, so pings never take a lock.</p>` },
        { type: `table`, headers: [`Need`, `Method on Driver`], rows: [
          [`Take the driver for one ride`, `<code>boolean tryClaim()</code>: AVAILABLE &rarr; OFFERED`],
          [`Give them back on decline, timeout or cancel`, `<code>boolean release()</code>: OFFERED &rarr; AVAILABLE`],
          [`Accept, then finish`, `<code>boolean startTrip(long now)</code>: OFFERED &rarr; ON_TRIP; <code>boolean endTrip()</code>: ON_TRIP &rarr; AVAILABLE`],
          [`Shift starts and ends`, `<code>boolean goOnline()</code>, <code>boolean goOffline()</code>`],
          [`Ratings`, `<code>void rate(int stars)</code>, <code>double rating()</code>`]
        ] }
      ] },
      { id: `ride-design`, title: `Class design: Ride and its lifecycle`, kicker: `Step 3: class design`, blocks: [
        { type: `table`, headers: [`Requirement`, `What a ride remembers`], rows: [
          [`"Moves REQUESTED &rarr; ... &rarr; COMPLETED"`, `Its status`],
          [`"A ride never has two drivers"`, `The one driver it is offered to or assigned to, or none`],
          [`"On decline or timeout the next candidate is tried"`, `The ranked candidates not yet tried`],
          [`"Surge locked at request time"`, `The estimate, including its surge`],
          [`"Final fare from the actual trip"; "NO_DRIVER"; "rate once"`, `Final fare, cancel reason, a rated flag`]
        ] },
        { type: `text`, html: `<p>Next decision: <strong>how are the status rules enforced?</strong> An illegal step here costs money: completing a cancelled ride charges a rider for nothing.</p>` },
        { type: `compare`, items: [
          { title: `Weak: free-form setters`, tone: `warn`, html: `<p><code>setStatus(...)</code> called from wherever it is needed. Nothing stops COMPLETED &rarr; IN_PROGRESS or a cancel mid-trip. The rules live in the heads of the callers.</p>` },
          { title: `Better: enum checks in each method`, tone: `info`, html: `<p><code>accept</code> checks for OFFERED, <code>complete</code> for IN_PROGRESS, and so on. Correct, but the rules are scattered: nobody can answer "can a driver cancel after arriving?" without reading every method, and a new status means editing all of them.</p>` },
          { title: `Strong: one moveTo over an explicit transition table`, tone: `ok`, html: `<p>A map from each status to the statuses it may move to, and a single private <code>moveTo</code> that checks it and throws otherwise. Every rule is in one table you can draw on the whiteboard and test exhaustively; methods only add their own extra checks (is this the right driver?).</p>` }
        ] },
        { type: `text`, html: `<p>We take the table. A fourth option is the State pattern, one class per status, which is what the awesome-low-level-design solution uses. It pays off when each state behaves very differently (an elevator's states each decide what a tick means). Here most methods in most states would only say "not allowed", and that solution's states print a message and return, so an illegal call looks like it succeeded. One table that throws is shorter and safer.</p>` },
        { type: `diagram`, title: `Ride statuses and the transitions between them`, caption: `The happy path runs left to right. A declined or expired offer returns the ride to REQUESTED. Cancelling is allowed only before the trip starts; COMPLETED and CANCELLED are terminal.`, svg: `<svg viewBox="0 0 770 250" role="img" aria-label="Ride state machine from REQUESTED to COMPLETED, with CANCELLED reachable from the first four states">
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
        { type: `table`, headers: [`Need`, `Method on Ride (all synchronized)`], rows: [
          [`Claim the next free candidate and offer the ride`, `<code>RideEvent offerNext()</code>`],
          [`The offered driver accepts`, `<code>RideEvent accept(String driverId, long now)</code>`],
          [`Decline or timeout`, `<code>boolean withdrawOffer(String driverId)</code>: false if the offer is no longer live`],
          [`Trip progress`, `<code>arrived(driverId)</code>, <code>start(driverId)</code>, <code>complete(driverId, FareBreakdown fare)</code>`],
          [`Cancel`, `<code>RideEvent cancel(CancelReason reason)</code>: releases the driver if one was held`]
        ] },
        { type: `code`, lang: `java`, title: `Value types and the transition table`, code: `record Location(double lat, double lng) {
    private static final double EARTH_RADIUS_KM = 6371.0;

    /** Great-circle (haversine) distance; good enough to rank nearby drivers. */
    double distanceKm(Location o) {
        double dLat = Math.toRadians(o.lat - lat), dLng = Math.toRadians(o.lng - lng);
        double h = Math.pow(Math.sin(dLat / 2), 2)
                 + Math.cos(Math.toRadians(lat)) * Math.cos(Math.toRadians(o.lat)) * Math.pow(Math.sin(dLng / 2), 2);
        return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
    }
}

enum RideType { BIKE, AUTO, MINI, SEDAN, XL }

record Vehicle(String plate, String model, RideType type) {}
record Rider(String id, String name) {}

/** Length and duration of a trip: estimated from a route before it, measured after it. */
record TripMetrics(long meters, long seconds) {}

/** Amounts in paise. surgePercent is 100 for no surge, 120 for 1.2x. */
record FareBreakdown(long base, long distance, long time, int surgePercent, long total) {}

enum RideStatus {
    REQUESTED, OFFERED, ACCEPTED, DRIVER_ARRIVED, IN_PROGRESS, COMPLETED, CANCELLED;

    // Built once during class initialisation and never modified, so any thread can read it without a lock.
    private static final Map<RideStatus, Set<RideStatus>> NEXT = Map.of(
        REQUESTED,      EnumSet.of(OFFERED, CANCELLED),
        OFFERED,        EnumSet.of(ACCEPTED, REQUESTED, CANCELLED),   // back to REQUESTED on decline or timeout
        ACCEPTED,       EnumSet.of(DRIVER_ARRIVED, CANCELLED),
        DRIVER_ARRIVED, EnumSet.of(IN_PROGRESS, CANCELLED),
        IN_PROGRESS,    EnumSet.of(COMPLETED),
        COMPLETED,      EnumSet.noneOf(RideStatus.class),
        CANCELLED,      EnumSet.noneOf(RideStatus.class));

    boolean canMoveTo(RideStatus next) { return NEXT.get(this).contains(next); }
}` },
        { type: `keypoints`, items: [
          `<strong>One lock per ride.</strong> A ride is touched by its rider, its driver and its offer timer, never by other rides, so a plain <code>synchronized</code> per ride is enough and rides never contend with each other.`,
          `<strong>Driver state is shared, ride state is not.</strong> That is why the driver uses compare-and-set and the ride uses a lock: many rides compete for one driver, but only three parties touch one ride.`,
          `<strong>Money is whole paise.</strong> Distances and times are whole metres and seconds, and surge is an integer percent, so every fare is integer arithmetic with one explicit rounding per line item.`
        ] }
      ] },
      { id: `strategy-design`, title: `Class design: pricing and matching`, kicker: `Step 3: class design`, blocks: [
        { type: `text`, html: `<p>Two rules change more often than anything else in a ride-hailing product: what a trip costs, and which driver is asked first. They change per city, per ride type and per experiment, and independently of each other, so each sits behind its own interface and <code>RideService</code> never changes when a rule ships.</p>` },
        { type: `table`, headers: [`Interface`, `Input`, `Output`, `Implementations`], rows: [
          [`<code>PricingStrategy</code>`, `Ride type, trip metrics, surge percent`, `A <code>FareBreakdown</code> (line items, not a bare number, because receipts and disputes need them)`, `<code>MeteredPricing</code>, <code>FlatRatePricing</code>`],
          [`<code>MatchingStrategy</code>`, `Candidates already found by the index`, `The same candidates, best first`, `<code>NearestDriver</code>, <code>HighestRated</code>, <code>LeastRecentlyAssigned</code>, <code>WeightedScore</code>`]
        ] },
        { type: `compare`, items: [
          { title: `Weak: nearest driver only`, tone: `warn`, html: `<p>Shortest pickup, thirty seconds to write, and the right default. But drivers parked at a hotspot get everything, a driver just outside the radius waits all evening, and quality never matters.</p>` },
          { title: `Better: highest rated`, tone: `info`, html: `<p>Rewards quality. But a 4.9 driver three kilometres away beats a 4.8 driver at the corner, which is worse for the rider; it needs distance as a tie-breaker at least.</p>` },
          { title: `Strong: a weighted score behind MatchingStrategy`, tone: `ok`, html: `<p>Blend distance, rating and idle time into one score with weights from configuration. Each city tunes the weights without code changes, and the interface still allows a plain nearest-first policy where that is what the business wants.</p>` }
        ] },
        { type: `text`, html: `<p>We take the interface with <code>NearestDriver</code> as the default, and <code>WeightedScore</code> when the interviewer asks about fairness. Notice what matching does <em>not</em> do: search. Finding drivers within 3 km is geometry and belongs to the index; ranking them is policy and belongs to the strategy. Changing the policy never touches the concurrent index.</p>` },
        { type: `callout`, tone: `warning`, html: `<p>Rank immutable <code>Candidate</code> records, not live <code>Driver</code> objects. A driver's location changes while the sort runs; a comparator whose answers change mid-sort breaks its contract, and Java's sort may throw "Comparison method violates its general contract". Reading distance, rating and idle time once into a record gives the sort stable values.</p>` }
      ] },
      { id: `class-diagram`, title: `Final class design`, kicker: `Step 3: class design`, blocks: [
        { type: `code`, lang: `java`, title: `Final class design`, code: `final class RideService {                                  // one instance, injected; not a Singleton
    RideService(PricingStrategy pricing, MatchingStrategy matching, SurgeProvider surge, RouteEstimator routes,
                PaymentGateway payments, ScheduledExecutorService timer, Clock clock);

    FareBreakdown estimate(Location pickup, Location drop, RideType type);
    Ride requestRide(String riderId, String requestId, Location pickup, Location drop, RideType type);  // idempotent
    void cancel(String rideId, String riderId);
    void rateDriver(String rideId, String riderId, int stars);

    void registerDriver(Driver d);
    void goOnline(String driverId, Location at);
    void goOffline(String driverId);
    void updateLocation(String driverId, Location at);
    void accept(String rideId, String driverId);
    void decline(String rideId, String driverId);
    void arrived(String rideId, String driverId);
    void start(String rideId, String driverId);
    void complete(String rideId, String driverId, TripMetrics actual);
    void addListener(RideListener listener);
}

final class Ride {                                         // every method synchronized on the ride
    private RideStatus status;
    private Driver driver;                                 // offered to or assigned to; null while searching
    private final Deque<Candidate> candidates;             // ranked, not yet tried

    RideEvent offerNext();
    RideEvent accept(String driverId, long now);
    boolean withdrawOffer(String driverId);                // decline or timeout
    RideEvent arrived(String driverId);
    RideEvent start(String driverId);
    RideEvent complete(String driverId, FareBreakdown fare);
    RideEvent cancel(CancelReason reason);
    private RideEvent moveTo(RideStatus next);             // the only place status changes
}

final class Driver {
    private final AtomicReference<DriverStatus> status;    // changed only by compare-and-set
    private volatile Location location;

    boolean tryClaim();  boolean release();  boolean startTrip(long now);  boolean endTrip();
    boolean goOnline();  boolean goOffline();  void rate(int stars);  double rating();
}

final class DriverIndex {
    void update(Driver d, Location at);
    void remove(Driver d);
    List<Candidate> near(Location p, RideType type, double radiusKm);
}

interface PricingStrategy  { FareBreakdown price(RideType type, TripMetrics trip, int surgePercent); }
interface MatchingStrategy { List<Candidate> rank(List<Candidate> candidates); }
interface SurgeProvider    { int surgePercentAt(Location pickup); }
interface RouteEstimator   { TripMetrics estimate(Location from, Location to); }
interface PaymentGateway   { void charge(String idempotencyKey, String riderId, long amountPaise); }
interface RideListener     { void onEvent(RideEvent e); }` },
        { type: `text`, html: `<p>The service coordinates and never changes a status itself; the ride owns its lifecycle and never looks for drivers; the driver guards its own availability and knows nothing about rides. Two <strong>Strategy</strong> interfaces hold the rules that change, and listeners are a plain <strong>Observer</strong> for notifications. External systems (routes, surge data, payments) are interfaces, so tests can fake every one of them.</p>` }
      ] },
      { id: `service-impl`, title: `Implementation: requests, offers and timeouts`, kicker: `Step 4: implementation`, blocks: [
        { type: `text`, html: `<p>Check what the interviewer wants: working code, pseudocode or a walkthrough. For each method, write the normal path first, then the edge cases. The normal path of <code>requestRide</code>: price an estimate, create the ride, find and rank candidates, then <code>dispatch</code>, which claims the first free candidate, tells listeners, and schedules a 15-second timeout. Accept, decline and the timeout are separate events that arrive later.</p>` },
        { type: `list`, title: `Edge cases the service handles`, items: [
          `A retried request with the same request id: return the same ride and never dispatch twice, even if two copies race (<code>putIfAbsent</code>).`,
          `Pickup equal to drop, an unknown ride or driver, a rider touching someone else's ride: reject before anything changes.`,
          `The timer fires after the driver accepted, declined or the rider cancelled: <code>withdrawOffer</code> re-checks and does nothing.`,
          `A decline that arrives after the timeout already moved on: the same check, the same no-op.`,
          `Nobody left to try: the ride is cancelled with NO_DRIVER inside <code>offerNext</code>.`
        ] },
        { type: `code`, lang: `java`, title: `RideService: requests, offers and timeouts`, code: `interface RideListener   { void onEvent(RideEvent e); }                        // notifications, receipts
interface PaymentGateway { void charge(String idempotencyKey, String riderId, long amountPaise); }

final class RideService {
    private static final double SEARCH_RADIUS_KM = 3.0;
    private static final long OFFER_TIMEOUT_SECONDS = 15;

    private final Map<String, Driver> drivers = new ConcurrentHashMap<>();
    private final Map<String, Ride> rides = new ConcurrentHashMap<>();
    private final Map<String, Ride> byRequest = new ConcurrentHashMap<>();     // "riderId:requestId" -> ride
    private final List<RideListener> listeners = new CopyOnWriteArrayList<>();
    private final DriverIndex index = new DriverIndex();
    private final PricingStrategy pricing;
    private final MatchingStrategy matching;
    private final SurgeProvider surge;
    private final RouteEstimator routes;
    private final PaymentGateway payments;
    private final ScheduledExecutorService timer;
    private final Clock clock;

    RideService(PricingStrategy pricing, MatchingStrategy matching, SurgeProvider surge, RouteEstimator routes,
                PaymentGateway payments, ScheduledExecutorService timer, Clock clock) {
        this.pricing = pricing; this.matching = matching; this.surge = surge; this.routes = routes;
        this.payments = payments; this.timer = timer; this.clock = clock;
    }

    void addListener(RideListener l) { listeners.add(l); }

    // ---- drivers
    void registerDriver(Driver d)                     { drivers.put(d.id, d); }
    void goOnline(String driverId, Location at)       { Driver d = driver(driverId); if (d.goOnline()) index.update(d, at); }
    void goOffline(String driverId)                   { Driver d = driver(driverId); if (d.goOffline()) index.remove(d); }
    void updateLocation(String driverId, Location at) { index.update(driver(driverId), at); }

    // ---- riders
    FareBreakdown estimate(Location pickup, Location drop, RideType type) {
        return pricing.price(type, routes.estimate(pickup, drop), surge.surgePercentAt(pickup));
    }

    /** Idempotent: a retry with the same request id returns the same ride and never dispatches twice. */
    Ride requestRide(String riderId, String requestId, Location pickup, Location drop, RideType type) {
        if (pickup.equals(drop)) throw new IllegalArgumentException("Pickup and drop are the same place");
        String key = riderId + ":" + requestId;
        Ride existing = byRequest.get(key);
        if (existing != null) return existing;
        Ride fresh = new Ride(UUID.randomUUID().toString(), riderId, pickup, drop, type, estimate(pickup, drop, type));
        existing = byRequest.putIfAbsent(key, fresh);          // atomic: of two racing copies, exactly one wins
        if (existing != null) return existing;
        rides.put(fresh.id, fresh);
        fresh.setCandidates(matching.rank(index.near(pickup, type, SEARCH_RADIUS_KM)));
        dispatch(fresh);
        return fresh;
    }

    void cancel(String rideId, String riderId) { publish(ownedRide(rideId, riderId).cancel(CancelReason.RIDER)); }

    void rateDriver(String rideId, String riderId, int stars) {
        if (stars < 1 || stars > 5) throw new IllegalArgumentException("Stars must be 1 to 5");
        ownedRide(rideId, riderId).driverToRate().rate(stars);
    }

    // ---- driver responses
    void accept(String rideId, String driverId)  { publish(ride(rideId).accept(driverId, clock.millis())); }
    void decline(String rideId, String driverId) { retryIfWithdrawn(ride(rideId), driverId); }
    void arrived(String rideId, String driverId) { publish(ride(rideId).arrived(driverId)); }
    void start(String rideId, String driverId)   { publish(ride(rideId).start(driverId)); }

    void complete(String rideId, String driverId, TripMetrics actual) {
        Ride r = ride(rideId);
        FareBreakdown fare = pricing.price(r.type, actual, r.estimate.surgePercent());   // surge locked at request time
        publish(r.complete(driverId, fare));                                              // throws if not IN_PROGRESS
        payments.charge(r.id, r.riderId, fare.total());                                   // ride id = idempotency key
    }

    // ---- dispatch
    private void dispatch(Ride r) {
        RideEvent e = r.offerNext();
        if (e == null) return;                                   // the rider cancelled meanwhile
        publish(e);                                              // OFFERED (to the driver) or CANCELLED (NO_DRIVER)
        if (e.status() == RideStatus.OFFERED)
            timer.schedule(() -> retryIfWithdrawn(r, e.driverId()), OFFER_TIMEOUT_SECONDS, TimeUnit.SECONDS);
    }

    private void retryIfWithdrawn(Ride r, String driverId) {
        if (r.withdrawOffer(driverId)) dispatch(r);              // false if accepted, cancelled or already withdrawn
    }

    private void publish(RideEvent e) {                          // always called after the ride's lock is released
        for (RideListener l : listeners) {
            try { l.onEvent(e); } catch (RuntimeException ex) { /* log; one listener must not break the others */ }
        }
    }

    private Ride ownedRide(String rideId, String riderId) {
        Ride r = ride(rideId);
        if (!r.riderId.equals(riderId)) throw new IllegalArgumentException("Ride " + rideId + " is not yours");
        return r;
    }

    private Ride ride(String id) {
        Ride r = rides.get(id);
        if (r == null) throw new IllegalArgumentException("Unknown ride " + id);
        return r;
    }

    private Driver driver(String id) {
        Driver d = drivers.get(id);
        if (d == null) throw new IllegalArgumentException("Unknown driver " + id);
        return d;
    }
}` },
        { type: `text`, html: `<p>Rider requests, driver taps, GPS pings and offer timers all arrive on different threads. Each piece of shared state has exactly one protection, chosen for how it is used:</p>` },
        { type: `table`, title: `Where the threads meet`, headers: [`Shared state`, `Protection`, `Why it is safe`], rows: [
          [`Driver status`, `<code>AtomicReference</code>, changed only by compare-and-set`, `Checking AVAILABLE and setting OFFERED is one step, so exactly one ride takes a driver`],
          [`Driver location`, `<code>volatile</code> reference to an immutable <code>Location</code>`, `A reader sees the old point or the new one, never half of each; pings take no lock`],
          [`Ride status, driver, candidates`, `The ride's monitor`, `Every transition reads and writes several fields together; rides never share a lock`],
          [`Request id to ride`, `<code>putIfAbsent</code>`, `Two racing retries: one insert wins and only that one dispatches`],
          [`Grid cells`, `<code>ConcurrentHashMap</code> of concurrent sets, <code>compute</code> per driver`, `Matching reads cells without locking; one driver's cell moves never interleave`],
          [`Strategies, rate cards, the transition table`, `Immutable after construction`, `Shared freely`],
          [`Listeners`, `<code>CopyOnWriteArrayList</code>, called after locks are released`, `A slow push notification cannot stall a driver's accept`]
        ] },
        { type: `callout`, tone: `warning`, html: `<p>Two details make or break this code. The claim is a compare-and-set, never "if available, then mark offered". And the timeout handler never assumes its offer is still live: <code>withdrawOffer</code> re-checks, under the ride's lock, that the ride is still OFFERED to that same driver, so a timer that fires just after an accept does nothing. No code path holds two locks: the ride's lock is held while claiming, but the claim is a non-blocking CAS, so there is no lock order to get wrong.</p>` },
        { type: `text`, html: `<p>The <a href="https://github.com/ashishps1/awesome-low-level-design/tree/main/solutions/java/src/ridesharingservice" target="_blank" rel="noopener">awesome-low-level-design ride-sharing solution</a> supplied the starting shape: a service that registers drivers, finds candidates through a matching strategy, prices through a pricing strategy, and drives a trip through REQUESTED, ASSIGNED, IN_PROGRESS and COMPLETED with observers on the trip. The code here is written independently, and changes four things: the service is an injected instance instead of a Singleton with strategy setters; driver status changes by compare-and-set instead of a plain setter that two acceptances could both pass; fares are whole paise instead of <code>double</code> dollars; and the per-status State classes, which silently ignore illegal calls, are replaced by one transition table that rejects them. Offers with timeouts, idempotent requests and the grid index are additions.</p>` }
      ] },
      { id: `ride-impl`, title: `Implementation: the ride`, kicker: `Step 4: implementation`, blocks: [
        { type: `text`, html: `<p>The normal path is a chain of small methods, each of which checks the caller and then calls <code>moveTo</code>: <code>offerNext</code> claims a driver and moves to OFFERED, <code>accept</code> to ACCEPTED, then <code>arrived</code>, <code>start</code> and <code>complete</code>. Every method is <code>synchronized</code> and returns a <code>RideEvent</code>, which the service publishes after the lock is released.</p>` },
        { type: `list`, title: `Edge cases the ride handles`, items: [
          `The first candidate was taken by another ride: its CAS fails, so try the next one.`,
          `No candidate left: cancel with NO_DRIVER.`,
          `A driver accepts an offer that has expired, or that was never theirs: <code>requireDriver</code> rejects it.`,
          `The rider cancels while an offer is pending: release the driver back to AVAILABLE. After acceptance: end the driver's trip so they are free again.`,
          `Complete or cancel called twice: the second call fails the table check before anything changes.`,
          `Rating before completion, or twice: a <code>rated</code> flag under the same lock.`
        ] },
        { type: `code`, lang: `java`, title: `Ride: one lock per ride`, code: `enum CancelReason { RIDER, DRIVER, NO_DRIVER }

record RideEvent(String rideId, RideStatus status, String riderId, String driverId) {}

final class Ride {
    final String id, riderId;
    final Location pickup, drop;
    final RideType type;
    final FareBreakdown estimate;                    // quoted at request time; its surge is locked in

    // guarded by this
    private RideStatus status = RideStatus.REQUESTED;
    private Driver driver;
    private final Deque<Candidate> candidates = new ArrayDeque<>();
    private FareBreakdown finalFare;
    private CancelReason cancelReason;
    private boolean rated;

    Ride(String id, String riderId, Location pickup, Location drop, RideType type, FareBreakdown estimate) {
        this.id = id; this.riderId = riderId; this.pickup = pickup; this.drop = drop; this.type = type; this.estimate = estimate;
    }

    synchronized RideStatus status()         { return status; }
    synchronized FareBreakdown finalFare()   { return finalFare; }
    synchronized CancelReason cancelReason() { return cancelReason; }
    synchronized void setCandidates(List<Candidate> ranked) { candidates.clear(); candidates.addAll(ranked); }

    /** Claims the next free candidate and offers them the ride; null if the ride stopped searching meanwhile. */
    synchronized RideEvent offerNext() {
        if (status != RideStatus.REQUESTED) return null;
        while (!candidates.isEmpty()) {
            Driver d = candidates.poll().driver();
            if (d.tryClaim()) {                      // CAS; if another ride got d first, try the next one
                driver = d;
                return moveTo(RideStatus.OFFERED);
            }
        }
        cancelReason = CancelReason.NO_DRIVER;
        return moveTo(RideStatus.CANCELLED);
    }

    synchronized RideEvent accept(String driverId, long nowMillis) {
        requireDriver(driverId, RideStatus.OFFERED);
        driver.startTrip(nowMillis);                 // OFFERED -> ON_TRIP; this ride holds the claim
        return moveTo(RideStatus.ACCEPTED);
    }

    /** Decline or timeout. False if the offer is no longer live: accepted, cancelled or already withdrawn. */
    synchronized boolean withdrawOffer(String driverId) {
        if (status != RideStatus.OFFERED || !driver.id.equals(driverId)) return false;
        driver.release();                            // OFFERED -> AVAILABLE
        driver = null;
        moveTo(RideStatus.REQUESTED);
        return true;
    }

    synchronized RideEvent arrived(String driverId) {
        requireDriver(driverId, RideStatus.ACCEPTED);
        return moveTo(RideStatus.DRIVER_ARRIVED);
    }

    synchronized RideEvent start(String driverId) {
        requireDriver(driverId, RideStatus.DRIVER_ARRIVED);
        return moveTo(RideStatus.IN_PROGRESS);
    }

    synchronized RideEvent complete(String driverId, FareBreakdown fare) {
        requireDriver(driverId, RideStatus.IN_PROGRESS);
        finalFare = fare;
        driver.endTrip();                            // ON_TRIP -> AVAILABLE
        return moveTo(RideStatus.COMPLETED);
    }

    synchronized RideEvent cancel(CancelReason reason) {
        RideStatus was = status;
        RideEvent event = moveTo(RideStatus.CANCELLED);   // throws once the trip has started, or if already over
        cancelReason = reason;
        if (was == RideStatus.OFFERED) driver.release();
        else if (driver != null) driver.endTrip();
        return event;
    }

    /** One rating per completed ride. */
    synchronized Driver driverToRate() {
        if (status != RideStatus.COMPLETED || rated) throw new IllegalStateException("Ride " + id + " cannot be rated now");
        rated = true;
        return driver;
    }

    private RideEvent moveTo(RideStatus next) {      // the only place status changes; caller holds this
        if (!status.canMoveTo(next))
            throw new IllegalStateException("Ride " + id + ": " + status + " -> " + next + " is not allowed");
        status = next;
        return new RideEvent(id, next, riderId, driver == null ? null : driver.id);
    }

    private void requireDriver(String driverId, RideStatus expected) {
        if (status != expected || driver == null || !driver.id.equals(driverId))
            throw new IllegalStateException("Ride " + id + " is " + status + "; driver " + driverId + " cannot do that now");
    }
}` },
        { type: `keypoints`, items: [
          `<strong>Accept and timeout cannot both win.</strong> Both take the ride's lock. If the accept runs first, the timer's <code>withdrawOffer</code> finds ACCEPTED and returns false. If the timer runs first, the driver is released and the late accept fails <code>requireDriver</code>; the app says the offer expired.`,
          `<strong>The check is by driver id.</strong> That is enough because candidates are polled once, so a ride never offers the same driver twice. If a re-search could offer the same driver again, add an offer number so an old timer cannot withdraw a newer offer.`,
          `<strong>The ride releases the driver.</strong> Every path that ends an offer or a trip (withdraw, cancel, complete) puts the driver back to AVAILABLE in the same critical section, so a driver is never stranded as OFFERED.`
        ] }
      ] },
      { id: `driver-impl`, title: `Implementation: drivers and the grid index`, kicker: `Step 4: implementation`, blocks: [
        { type: `text`, html: `<p>Normal path: a driver goes online at a location, pings every few seconds, and shows up in <code>near()</code> while AVAILABLE. Edge cases: a ping that stays in the same cell must be cheap (it is the common case), a ping that crosses a cell boundary must move the driver between two sets without a reader seeing them in neither, and a driver who goes offline must vanish from searches.</p>` },
        { type: `code`, lang: `java`, title: `Drivers and the grid index`, code: `enum DriverStatus { OFFLINE, AVAILABLE, OFFERED, ON_TRIP }

final class Driver {
    final String id;
    final Vehicle vehicle;
    private final AtomicReference<DriverStatus> status = new AtomicReference<>(DriverStatus.OFFLINE);
    private volatile Location location;        // written by GPS pings, read by matching: no lock needed
    private volatile long lastAssignedAt;      // epoch millis, for fair matching
    private long ratingSum, ratingCount;       // guarded by this

    Driver(String id, Vehicle vehicle, Location start) { this.id = id; this.vehicle = vehicle; this.location = start; }

    DriverStatus status()   { return status.get(); }
    Location location()     { return location; }
    long lastAssignedAt()   { return lastAssignedAt; }
    void moveTo(Location l) { location = l; }

    boolean goOnline()  { return status.compareAndSet(DriverStatus.OFFLINE, DriverStatus.AVAILABLE); }
    boolean goOffline() { return status.compareAndSet(DriverStatus.AVAILABLE, DriverStatus.OFFLINE); }

    /** The claim: of all the rides racing for this driver, exactly one call returns true. */
    boolean tryClaim()  { return status.compareAndSet(DriverStatus.AVAILABLE, DriverStatus.OFFERED); }
    boolean release()   { return status.compareAndSet(DriverStatus.OFFERED, DriverStatus.AVAILABLE); }
    boolean endTrip()   { return status.compareAndSet(DriverStatus.ON_TRIP, DriverStatus.AVAILABLE); }

    boolean startTrip(long nowMillis) {
        if (!status.compareAndSet(DriverStatus.OFFERED, DriverStatus.ON_TRIP)) return false;
        lastAssignedAt = nowMillis;
        return true;
    }

    synchronized void rate(int stars) {
        if (stars < 1 || stars > 5) throw new IllegalArgumentException("Stars must be 1 to 5");
        ratingSum += stars;
        ratingCount++;
    }

    synchronized double rating() { return ratingCount == 0 ? 5.0 : (double) ratingSum / ratingCount; }
}

record Cell(long x, long y) {
    static final double DEGREES = 0.01;          // about 1.1 km north to south
    static final double KM = 1.1;
    static Cell of(Location l) { return new Cell((long) Math.floor(l.lat() / DEGREES), (long) Math.floor(l.lng() / DEGREES)); }
}

/** What matching needs about a driver, read once so that sorting sees stable values. */
record Candidate(Driver driver, double km, double rating, long lastAssignedAt) {}

final class DriverIndex {
    private final Map<Cell, Set<Driver>> cells = new ConcurrentHashMap<>();
    private final Map<String, Cell> cellOf = new ConcurrentHashMap<>();      // driver id -> current cell

    /** Called on every GPS ping. Only a change of cell touches the cell sets. */
    void update(Driver d, Location loc) {
        cellOf.compute(d.id, (id, before) -> {        // atomic per driver: one driver's pings never interleave
            d.moveTo(loc);
            Cell now = Cell.of(loc);
            if (!now.equals(before)) {
                cells.computeIfAbsent(now, c -> ConcurrentHashMap.newKeySet()).add(d);   // add first, then remove
                if (before != null) cells.get(before).remove(d);
            }
            return now;
        });
    }

    void remove(Driver d) {
        cellOf.computeIfPresent(d.id, (id, before) -> {
            cells.get(before).remove(d);
            return null;                              // drops the mapping atomically
        });
    }

    /** Available drivers of a ride type within radiusKm of p: scans the cells around p, not every driver. */
    List<Candidate> near(Location p, RideType type, double radiusKm) {
        Cell c = Cell.of(p);
        long r = (long) Math.ceil(radiusKm / Cell.KM);
        List<Candidate> out = new ArrayList<>();
        for (long dx = -r; dx <= r; dx++)
            for (long dy = -r; dy <= r; dy++)
                for (Driver d : cells.getOrDefault(new Cell(c.x() + dx, c.y() + dy), Set.of())) {
                    double km = d.location().distanceKm(p);
                    if (d.status() == DriverStatus.AVAILABLE && d.vehicle.type() == type && km <= radiusKm)
                        out.add(new Candidate(d, km, d.rating(), d.lastAssignedAt()));
                }
        return out;
    }
}` },
        { type: `keypoints`, items: [
          `<strong>The index is a hint; the CAS is the truth.</strong> <code>near()</code> filters on status, but a driver can be claimed a microsecond later. That is fine: the ride's <code>tryClaim</code> fails and it moves on. A ping from a driver who just went offline can leave a stale entry for the same reason, and the status filter hides it.`,
          `<strong>Cells of about 1 km for a 3 km search</strong> mean scanning a 7 by 7 block of cells. Cells narrow east to west away from the equator; geohashes and hexagonal grids are refinements of the same idea.`,
          `<strong>Add before remove</strong> on a cell change, so a concurrent search can see the driver twice (harmless, the claim is atomic) but never miss them.`
        ] }
      ] },
      { id: `pricing-impl`, title: `Implementation: pricing and matching`, kicker: `Step 4: implementation`, blocks: [
        { type: `text`, html: `<p>Normal path for metered pricing: base fare, plus distance and time from the rate card, times the surge percent, never below the minimum. Edge cases: a ride type with no rate card (reject), and rounding, which must happen once per line item and the same way everywhere (half up, in integer arithmetic).</p>` },
        { type: `code`, lang: `java`, title: `Pricing strategies`, code: `interface PricingStrategy {
    FareBreakdown price(RideType type, TripMetrics trip, int surgePercent);
}

record RateCard(long base, long perKm, long perMinute, long minimum) {}   // paise

/** Base + per km + per minute from a rate card per ride type, times surge; whole paise, rounded half up. */
final class MeteredPricing implements PricingStrategy {
    private final Map<RideType, RateCard> cards;      // immutable copy: safe to share between threads

    MeteredPricing(Map<RideType, RateCard> cards) { this.cards = Map.copyOf(cards); }

    public FareBreakdown price(RideType type, TripMetrics trip, int surgePercent) {
        RateCard c = cards.get(type);
        if (c == null) throw new IllegalArgumentException("No rate card for " + type);
        long distance = halfUp(trip.meters() * c.perKm(), 1000);
        long time = halfUp(trip.seconds() * c.perMinute(), 60);
        long total = Math.max(c.minimum(), halfUp((c.base() + distance + time) * surgePercent, 100));
        return new FareBreakdown(c.base(), distance, time, surgePercent, total);
    }

    static long halfUp(long numerator, long divisor) { return (numerator + divisor / 2) / divisor; }   // inputs are never negative
}

/** A fixed price per ride type, e.g. airport transfers; ignores distance, time and surge. */
final class FlatRatePricing implements PricingStrategy {
    private final Map<RideType, Long> fares;

    FlatRatePricing(Map<RideType, Long> fares) { this.fares = Map.copyOf(fares); }

    public FareBreakdown price(RideType type, TripMetrics trip, int surgePercent) {
        Long fare = fares.get(type);
        if (fare == null) throw new IllegalArgumentException("No flat fare for " + type);
        return new FareBreakdown(fare, 0, 0, 100, fare);
    }
}

interface SurgeProvider  { int surgePercentAt(Location pickup); }          // 100 means no surge
interface RouteEstimator { TripMetrics estimate(Location from, Location to); }

/** Straight-line distance padded by 30% for real roads, at an average city speed of 25 km/h. */
final class StraightLineEstimator implements RouteEstimator {
    public TripMetrics estimate(Location from, Location to) {
        long meters = Math.round(from.distanceKm(to) * 1300);
        return new TripMetrics(meters, meters * 3600 / 25_000);
    }
}` },
        { type: `table`, title: `A MINI fare: base 4000, 1200 per km, 150 per minute, minimum 8000 (paise)`, headers: [`Line`, `Calculation`, `Paise`], rows: [
          [`Base`, `From the rate card`, `4000`],
          [`Distance`, `7000 m &times; 1200 / 1000`, `8400`],
          [`Time`, `1440 s &times; 150 / 60`, `3600`],
          [`Subtotal`, `4000 + 8400 + 3600`, `16000`],
          [`Total`, `16000 &times; 120 / 100 (surge locked at request time)`, `19200, that is &#8377;192.00`]
        ] },
        { type: `code`, lang: `java`, title: `Matching strategies`, code: `interface MatchingStrategy {
    List<Candidate> rank(List<Candidate> candidates);        // best first
}

final class NearestDriver implements MatchingStrategy {
    public List<Candidate> rank(List<Candidate> c) {
        return c.stream().sorted(Comparator.comparingDouble(Candidate::km)).toList();
    }
}

final class HighestRated implements MatchingStrategy {
    public List<Candidate> rank(List<Candidate> c) {
        return c.stream()
                .sorted(Comparator.comparingDouble(Candidate::rating).reversed().thenComparingDouble(Candidate::km))
                .toList();
    }
}

/** Spreads work: the driver who has waited longest since their last ride goes first. */
final class LeastRecentlyAssigned implements MatchingStrategy {
    public List<Candidate> rank(List<Candidate> c) {
        return c.stream()
                .sorted(Comparator.comparingLong(Candidate::lastAssignedAt).thenComparingDouble(Candidate::km))
                .toList();
    }
}

/** Blends distance, rating and idle time into one score; lower is better. Weights come from configuration. */
final class WeightedScore implements MatchingStrategy {
    private final double perKm, perRatingPoint, perIdleMinute;
    private final Clock clock;

    WeightedScore(double perKm, double perRatingPoint, double perIdleMinute, Clock clock) {
        this.perKm = perKm; this.perRatingPoint = perRatingPoint; this.perIdleMinute = perIdleMinute; this.clock = clock;
    }

    public List<Candidate> rank(List<Candidate> c) {
        long now = clock.millis();                           // one "now" for the whole sort
        return c.stream().sorted(Comparator.comparingDouble(x -> score(x, now))).toList();
    }

    private double score(Candidate c, long now) {
        double idleMinutes = Math.min((now - c.lastAssignedAt()) / 60_000.0, 60);   // idle beyond an hour adds nothing
        return c.km() * perKm - c.rating() * perRatingPoint - idleMinutes * perIdleMinute;
    }
}` },
        { type: `callout`, tone: `mistake`, html: `<p>Using <code>double</code> rupees for fares. Distances and ratings can be doubles, but amounts are <code>long</code> paise, and each line item is rounded exactly once with one rule. Summing doubles produces receipts that are a paisa off, and every one of those becomes a support ticket. Strategies are stateless or immutable, so one instance is shared by every thread.</p>` }
      ] },
      { id: `verification`, title: `Verifying with a trace`, kicker: `Step 5: verification`, blocks: [
        { type: `text`, html: `<p>Walk the design through the scenario an interviewer would pick: two riders racing for the same driver, a retry, a timeout, a late accept, a cancel, and completion. Three MINI drivers wait 0.8, 1.5 and 2.4 km from the pickup, surge is 120%, and both riders' candidate lists are ranked before either claims, which is exactly the race. This trace is the output of running the claim, timeout and pricing logic with a fake clock.</p>` },
        { type: `code`, lang: `text`, title: `Two riders, one driver, a timeout and a retry`, code: `t= 0s  estimate(MINI): 5999 m, 863 s, surge 120% -> total 16028 paise
t= 0s  requestRide(R1, req-7) -> ride A; candidates D1 0.8km, D2 1.5km, D3 2.4km
t= 0s  requestRide(R2, req-1) -> ride B; candidates D1, D2, D3 (ranked before A claimed)
t= 0s    ride A -> OFFERED to D1   [D1=OFFERED D2=AVAILABLE D3=AVAILABLE]
t= 0s    ride B: tryClaim(D1) false: D1 is OFFERED
t= 0s    ride B -> OFFERED to D2   [D1=OFFERED D2=OFFERED D3=AVAILABLE]
t= 0s  requestRide(R1, req-7) retried -> ride A, fresh=false, no second dispatch
t= 4s  accept(B, D2) -> ACCEPTED   [D1=OFFERED D2=ON_TRIP D3=AVAILABLE]
t=15s  timer: withdrawOffer(D1) on ride A = true
t=15s    D1 released, ride A back to REQUESTED
t=15s    ride A: tryClaim(D2) false: D2 is ON_TRIP
t=15s    ride A -> OFFERED to D3   [D1=AVAILABLE D2=ON_TRIP D3=OFFERED]
t=15s  timer: withdrawOffer(D2) on ride B = false (stale, nothing changes)
t=20s  accept(A, D3) -> ACCEPTED   [D1=AVAILABLE D2=ON_TRIP D3=ON_TRIP]
t=20s  accept(A, D1) late -> rejected: Ride A is ACCEPTED; driver D1 cannot do that now
t=21s  cancel(B) by R2 -> CANCELLED   [D1=AVAILABLE D2=AVAILABLE D3=ON_TRIP]
t=30s  timer: withdrawOffer(D3) on ride A = false (stale, nothing changes)
t=300s  arrived(A, D3) -> DRIVER_ARRIVED
t=300s  start(A, D3) -> IN_PROGRESS
t=300s  cancel(B) again -> rejected: Ride B: CANCELLED -> CANCELLED is not allowed
t=1800s  complete(A, D3, 7000 m, 1440 s): base 4000 + distance 8400 + time 3600 = 16000, x120% = 19200
t=1800s    -> COMPLETED; charge(key=A, R1, 19200)   [D1=AVAILABLE D2=AVAILABLE D3=AVAILABLE]
t=1800s  complete(A) retried -> rejected: Ride A is COMPLETED; driver D3 cannot do that now; no second charge` },
        { type: `keypoints`, items: [
          `Ride B's list still started with D1, because it was ranked before A claimed; the compare-and-set failed and B moved on to D2. Two riders never got one driver.`,
          `The retry returned the same ride A and dispatched nothing. Both stale timers (B's after D2 accepted, A's after D3 accepted) found the offer gone and changed nothing.`,
          `D1's late accept was rejected because A had already moved on; R2's cancel freed D2 at once; and at the end every driver is AVAILABLE again, with exactly one charge of 19200 paise.`
        ] },
        { type: `text`, html: `<p>Two tests pin down the properties the trace relies on: the claim is atomic under real threads, and the table allows exactly the transitions in the diagram.</p>` },
        { type: `code`, lang: `java`, title: `Stress test: one driver, many riders`, code: `@Test
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
        { type: `code`, lang: `java`, title: `Every illegal transition is rejected`, code: `@Test
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
}` }
      ] }
    ],
    levels: levels(
      [`Rider, Driver, Ride, Location and a RideService with sensible responsibilities, and a working happy path from request to completion.`, `A status enum where illegal steps are rejected, one pricing rule and nearest-driver matching; money as integers once prompted.`, `Spotting that two riders can race for one driver, even if the fix needs a hint.`],
      [`Scopes the problem to the in-process core early, and justifies Strategy for pricing and matching by rules that vary per city and experiment.`, `An atomic driver claim (compare-and-set or a per-driver lock), offers with a timeout, and the accept-versus-timeout race resolved under the ride's lock without prompting.`, `An explicit transition table behind one moveTo, idempotent requests, the estimate versus the final fare with surge locked in, and listeners called outside locks.`, `Can say where each follow-up lands: surge is a SurgeProvider, broadcast is a new claim method on Ride, tracking is a separate observer.`],
      [`Explains why driver state uses compare-and-set and ride state uses a lock, and why no path holds two locks.`, `Separates search (the index) from ranking (the strategy), knows the index is only a hint, and discusses grid, geohash and hexagon trade-offs.`, `Treats failure paths as first-class: stale timers, late accepts, retried completes and declined cards all leave the system consistent.`, `Names in a minute what moves when this spans a city (geo-sharded location, conditional writes for claims, durable timers, an idempotency table) without turning the round into system design.`]
    ),
    concepts: [
      { term: `In-process core`, def: `The classes one service runs: object model, dispatch, rules; external systems behind interfaces.`, why: `The right scope for an LLD round; the distributed version is a one-minute follow-up.` },
      { term: `Atomic driver claim`, def: `<code>compareAndSet(AVAILABLE, OFFERED)</code> on the driver's status.`, why: `Of many rides racing for one driver, exactly one wins; the rest try their next candidate.` },
      { term: `Offer with timeout`, def: `Offer to one driver, schedule a timeout, and on decline or timeout release them and try the next candidate.`, why: `A silent driver cannot stall a rider, and no thread blocks waiting for a tap.` },
      { term: `Stale callback check`, def: `<code>withdrawOffer</code> re-checks, under the ride's lock, that the ride is still OFFERED to that driver.`, why: `A timer that fires after an accept, or a decline after a timeout, changes nothing.` },
      { term: `Explicit transition table`, def: `A map from each ride status to the statuses it may move to; one private <code>moveTo</code> checks it.`, why: `Illegal steps are rejected in one place, and the rules can be drawn and tested exhaustively.` },
      { term: `Pricing strategy`, def: `Ride type, trip metrics and surge in; a <code>FareBreakdown</code> in whole paise out.`, why: `Rate cards, flat fares and promotions change without touching dispatch.` },
      { term: `Matching strategy`, def: `Ranks candidates the index found: nearest, highest rated, least recently assigned, or a weighted score.`, why: `"Who is asked first" is business policy that changes independently of geometry.` },
      { term: `Grid cell index`, def: `Drivers bucketed by a cell computed from latitude and longitude; a search scans only nearby cells.`, why: `Finding candidates costs a few cells, not every driver in the city.` },
      { term: `Idempotent request`, def: `A client request id, stored with <code>putIfAbsent</code>, maps every retry to the same ride.`, why: `A network retry never books two cabs.` },
      { term: `Surge locked on the ride`, def: `The estimate's surge percent is stored on the ride and reused for the final fare.`, why: `Riders pay the multiplier they agreed to; detours and traffic are still priced.` },
      { term: `Observer for ride events`, def: `Listeners receive a <code>RideEvent</code> after the ride's lock is released.`, why: `Push, SMS and receipts plug in without slowing dispatch.` }
    ],
    interview: [
      { q: `Is "Design Uber" an LLD or a system design question?`, a: `Either, so ask. In an LLD round it means the in-process core: Rider, Driver, Ride, a dispatcher, the ride lifecycle, how a driver is claimed and how pricing and matching plug in, with maps, payments and notifications behind interfaces. Geo-sharding, location streams and durable timers belong to system design and get one minute at the end.`, diff: `easy` },
      { q: `How do you guarantee two riders never get the same driver?`, a: `Taking a driver is a compare-and-set on the driver's status from AVAILABLE to OFFERED. Two dispatch threads can both see the driver available, but only one CAS succeeds; the loser moves to its next candidate. A per-driver lock works too. Check-then-set does not, because both threads pass the check before either sets. The other direction, a ride never having two drivers, holds because offerNext, accept and withdrawOffer all run under the ride's lock and check its status first.`, diff: `medium` },
      { q: `The driver taps Accept at the same moment the offer times out. What happens?`, a: `Both the accept and the timeout handler take the ride's lock, so one runs first. If the accept wins, the ride is ACCEPTED and withdrawOffer sees it is no longer OFFERED and returns false. If the timeout wins, the driver is released and the ride goes back to REQUESTED, so the late accept fails the "offered to this driver" check and the app shows "offer expired". Either way the ride ends with one driver.`, diff: `hard` },
      { q: `Why a transition table instead of the State pattern?`, a: `The State pattern earns its place when each state behaves very differently, like an elevator where each state decides a tick. A ride's states mostly answer one question, "is this step allowed?", so seven classes would mostly repeat "not allowed". A table plus one moveTo puts every rule in one place, is exhaustively testable, and throws on an illegal step instead of silently ignoring it.`, diff: `medium` },
      { q: `Why are pricing and matching strategies rather than if/else in the service?`, a: `Both change often and independently: per city, per ride type, per experiment. Each rule becomes a small class that can be tested alone and chosen by configuration, and RideService does not change when a rule ships. An if/else chain would grow with every launch and mix business policy into the concurrency-sensitive dispatch code.`, diff: `easy` },
      { q: `How do you find nearby drivers without scanning every driver?`, a: `Bucket drivers into grid cells of about 1 km from latitude and longitude, in a concurrent map from cell to a concurrent set. A search scans the block of cells covering the radius, then filters by exact distance, status and ride type. A ping that stays in its cell only updates a volatile location; a cell change moves the driver between two sets. The index can be slightly stale, which is fine because the claim itself is atomic.`, diff: `medium` },
      { q: `How do you make a ride request safe to retry?`, a: `The app generates a request id and resends it on retry. The service keys rides by riderId plus requestId and inserts with putIfAbsent, so two racing copies resolve to one ride and only the winner dispatches. Entries expire after a few minutes. Completion is protected by the table (COMPLETED to COMPLETED is illegal) and the charge by the ride id as the gateway's idempotency key.`, diff: `medium` },
      { q: `Should RideService be a Singleton?`, a: `Many solutions make it one, with setters for the strategies. I would not: a Singleton hides a global dependency, makes tests share state, and setters let a strategy change halfway through a ride. One instance created at startup and passed to the controllers gives the same "only one" guarantee, and tests can build their own with fake strategies and a fake clock. The service's own state is already thread-safe.`, diff: `easy` }
    ],
    cheatsheet: [
      { title: `Ride sharing in one screen`, type: `code`, lang: `java`, body: `interface PricingStrategy  { FareBreakdown price(RideType t, TripMetrics trip, int surgePercent); }  // paise
interface MatchingStrategy { List<Candidate> rank(List<Candidate> candidates); }                     // best first

final class Driver {
    AtomicReference<DriverStatus> status;   // AVAILABLE -> OFFERED only by compareAndSet (tryClaim)
    volatile Location location;             // pings never lock
}

final class Ride {                          // every method synchronized on the ride
    RideStatus status; Driver driver; Deque<Candidate> candidates;
    RideEvent offerNext();                  // CAS the next free candidate; none left -> CANCELLED(NO_DRIVER)
    RideEvent accept(String driverId, long now);
    boolean withdrawOffer(String driverId); // decline or timeout; false if stale
    private RideEvent moveTo(RideStatus next);   // the only status change; checks the table
}

final class RideService {                   // injected, not a Singleton
    Ride requestRide(riderId, requestId, ...);   // putIfAbsent on riderId:requestId, rank, dispatch
    void dispatch(Ride r);                  // offerNext, publish, schedule 15 s timeout -> withdrawOffer
}
// complete: price actual trip with the locked surge, then charge(rideId as idempotency key)` },
      { title: `Follow-ups and where they land`, type: `table`, headers: [`Follow-up`, `Change`], rows: [
        [`How surge is computed`, `A new SurgeProvider: a per-cell table rebuilt on a schedule (Deep Dives)`],
        [`Drivers pick from open requests`, `Ride.claim under the ride's lock; an open-rides map in the service (Deep Dives)`],
        [`Live tracking for the rider`, `A RideTracker observing pings, throttled per ride (Deep Dives)`],
        [`Declined cards`, `A Payment with its own status, retried with the same key (Deep Dives)`],
        [`Cancellation fees, driver backs out`, `A CancellationPolicy; one new table row (Deep Dives)`],
        [`A new pricing or matching rule`, `A new strategy class; nothing else changes`],
        [`Running across a city`, `Same shape; conditional writes, durable timers, geo-sharding (Deep Dives)`]
      ] }
    ],
    labs: []
  });
})();
