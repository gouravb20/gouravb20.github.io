// LLD problem breakdown: Ride Sharing. Format: Chapter in public/shared/notes.d.ts; shared helpers in data-part2.js.
// Imports are omitted in the code.
(function () {
const { levels } = LLD_PROBLEMS_KIT;

window.DATA.chapters.push({
    id: `ride-sharing`, part: 3, number: 0, difficulty: `hard`,
    title: `Ride Sharing: pricing and matching strategies, a ride state machine, one driver per ride`,
    references: [{ title: `awesome-low-level-design: Ride-Sharing Service`, url: `https://github.com/ashishps1/awesome-low-level-design/blob/main/problems/ride-sharing-service.md` }],
    overview: `An Uber or Ola style cab booking core: a rider gets a fare estimate and requests a ride, the system offers it to nearby drivers one at a time until someone accepts, and the ride moves from request to drop-off. It is a flagship machine-coding round because it tests three things at once: <strong>Strategy</strong> for the rules that keep changing (pricing with surge, driver matching), an <strong>explicit state machine</strong> for a lifecycle where an illegal step costs money, and <strong>concurrency</strong> on a scarce shared resource: two riders must never get the same driver, and one ride must never get two.`,
    problem: [
      { id: `requirements`, title: `What we are building`, kicker: `Requirements`, blocks: [
        { type: `problem`, html: `<p>"Design Uber" is a system design question. In an LLD round, scope it to the <strong>in-process core</strong>: the object model and the dispatch logic that a single service would run, with maps, payments and notifications behind interfaces.</p>` },
        { type: `code`, lang: `text`, title: `Final requirements`, code: `Functional
  1. A rider gets a fare estimate, then requests a ride: pickup, drop, ride type.
  2. The system finds nearby available drivers of that ride type and offers the
     ride to one driver at a time; each offer expires after a timeout (15 s).
  3. A driver accepts or declines; on decline or timeout the next driver is tried.
     If nobody is left, the ride is cancelled with reason NO_DRIVER.
  4. The ride moves REQUESTED -> OFFERED -> ACCEPTED -> DRIVER_ARRIVED ->
     IN_PROGRESS -> COMPLETED, and can be CANCELLED before the trip starts.
     Any other transition is rejected.
  5. Pricing is pluggable: base + per km + per minute by ride type, a surge
     multiplier from demand and supply, or a flat rate.
  6. Matching is pluggable: nearest, highest rated, or least recently assigned.
  7. The final fare is computed from the actual trip; the rider is charged once
     through a payment gateway, and each ride records a Payment whose status is
     PENDING, SUCCEEDED or FAILED.
  8. Riders rate the driver after a completed ride; riders and drivers are
     notified of every status change.
  9. Riders see the assigned driver's live location and ETA until drop-off.
 10. A city can instead broadcast requests: nearby drivers see open requests and
     choose one; the first to accept gets the ride.
 11. Concurrency: a driver never holds two rides, a ride never has two drivers,
     and a retried request never creates a second ride or a second charge.

Out of scope
  - Maps and routing (an estimator interface), card processing itself (a gateway
    interface), driver onboarding, pooled rides, scheduled rides, regulations.` }
      ] },
      { id: `clarifying`, title: `Questions that change the design`, kicker: `Clarifying`, blocks: [
        { type: `table`, headers: [`Ask`, `Assume`, `Decides`], rows: [
          [`Broadcast a request to many drivers, or offer one at a time?`, `One at a time by default; broadcast as a per-city option`, `An atomic claim on the driver per offer; in broadcast mode, the first claim on the ride wins (Deep Dives)`],
          [`Does the rider track the car live?`, `Yes: the assigned driver's location and ETA until drop-off`, `Forward assigned drivers' pings to the rider, throttled (Deep Dives)`],
          [`What if the card is declined?`, `The ride still completes; the payment is FAILED and retried`, `A Payment with its own status (Deep Dives)`],
          [`How is a driver found?`, `Available drivers of the ride type within a few km, ranked by a policy`, `A spatial index plus a MatchingStrategy`],
          [`How is the price decided?`, `A rate card per ride type, times surge; some routes are flat`, `PricingStrategy; money in paise as long`],
          [`Is the estimate the final price?`, `No: recomputed from the actual trip, with the surge locked at request time`, `The same strategy called twice`],
          [`Can a ride be cancelled at any point?`, `Only before the trip starts; a fee may apply`, `The transition table, and a fee policy`],
          [`What if nobody accepts?`, `Cancel with reason NO_DRIVER and tell the rider`, `A terminal path out of the search`],
          [`Do clients retry on a flaky network?`, `Yes, with a client-generated request id`, `An idempotent requestRide`]
        ] },
        { type: `callout`, tone: `insight`, html: `<p>Three forces shape the design. Rules that change per city and per experiment (pricing, matching) call for <strong>Strategy</strong>. A lifecycle where a wrong step means a wrong charge calls for an <strong>explicit transition table</strong>. And drivers are a scarce resource shared by every rider nearby, so taking one must be a single <strong>atomic</strong> step.</p>` }
      ] }
    ],
    solution: [
      { id: `design`, title: `Design`, kicker: `Entities and API`, blocks: [
        { type: `table`, headers: [`Class`, `Owns`], rows: [
          [`RideService`, `The dispatcher: estimates, requests, offers and their timeouts, driver responses; rides and drivers by id`],
          [`Rider`, `Id and name (a record)`],
          [`Driver`, `Vehicle, status (atomic), location (volatile), rating`],
          [`Vehicle, RideType`, `Plate, model and ride type; the type picks the rate card and which drivers are eligible`],
          [`Location`, `Latitude and longitude with a distance function (a record)`],
          [`DriverIndex`, `Grid cells to drivers, so "who is near this point" scans a few cells, not every driver`],
          [`Ride`, `The lifecycle: status, assigned driver, candidates left to try, estimate and final fare, under its own lock`],
          [`PricingStrategy`, `MeteredPricing, FlatRatePricing; returns a FareBreakdown`],
          [`MatchingStrategy`, `NearestDriver, HighestRated, LeastRecentlyAssigned`],
          [`RideListener, PaymentGateway`, `Observer for notifications; charging is an external port`],
          [`Payment, PaymentService`, `One payment per ride with status PENDING, SUCCEEDED or FAILED; retries (Deep Dives)`],
          [`RideTracker`, `Forwards an assigned driver's pings and ETA to the rider (Deep Dives)`]
        ] },
        { type: `keypoints`, items: [
          `<strong>Two strategy interfaces</strong>, because pricing and matching vary independently, differ by city and are A/B-tested. Shipping a new rule is a new class; <code>RideService</code> does not change.`,
          `<strong>Ride status is an enum plus a transition table.</strong> Every change goes through one <code>moveTo</code> method under the ride's lock, so an illegal step is rejected in exactly one place.`,
          `<strong>Driver state is shared, ride state is not.</strong> Many rides compete for the same nearby driver, so the driver's status changes only by compare-and-set (AVAILABLE &rarr; OFFERED). A ride is touched by its own rider, its driver and its timer, so a plain lock per ride is enough.`,
          `<strong>Dispatch is event driven.</strong> An offer schedules a timeout; accept, decline and timeout are events that each take the ride's lock. No thread sits blocked waiting for a driver to tap.`,
          `<strong>RideService is not a Singleton.</strong> Many write-ups make it one. Create one instance at startup and pass it to the controllers that need it: tests can build their own with fake strategies and a fake clock, and nothing hides a global. If a global accessor is truly required, use a lock-based lazy singleton.`
        ] },
        { type: `code`, lang: `java`, title: `Public API`, code: `// Riders
FareBreakdown estimate(Location pickup, Location drop, RideType type);
Ride requestRide(String riderId, String requestId, Location pickup, Location drop, RideType type); // idempotent
void cancel(String rideId, String riderId);
void rateDriver(String rideId, String riderId, int stars);

// Drivers
void registerDriver(Driver driver);
void goOnline(String driverId, Location at);
void goOffline(String driverId);
void updateLocation(String driverId, Location at);    // every few seconds per driver
void accept(String rideId, String driverId);
void decline(String rideId, String driverId);
void arrived(String rideId, String driverId);
void start(String rideId, String driverId);
void complete(String rideId, String driverId, TripMetrics actual);

// Broadcast mode, live tracking and payments (Deep Dives)
List<Ride> openRequestsNear(String driverId);
void claim(String rideId, String driverId);           // first driver to claim wins
void addTrackingListener(TrackingListener listener);  // live location and ETA for riders
Payment payment(String rideId);

void addListener(RideListener listener);` }
      ] },
      { id: `code`, title: `Working code`, kicker: `Implementation`, blocks: [
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

/** Distance and duration of a trip: estimated from a route before it, measured after it. */
record TripMetrics(double km, double minutes) {}

/** Amounts in minor units (paise); surge is the multiplier applied to the subtotal. */
record FareBreakdown(long base, long distance, long time, double surge, long total) {}

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
        { type: `code`, lang: `java`, title: `Pricing strategies`, code: `interface PricingStrategy {
    FareBreakdown price(RideType type, TripMetrics trip, double surge);
}

record RateCard(long base, long perKm, long perMinute, long minimum) {}   // paise

/** Base + per km + per minute from a rate card per ride type, times surge. */
final class MeteredPricing implements PricingStrategy {
    private final Map<RideType, RateCard> cards;      // immutable copy: safe to share between threads

    MeteredPricing(Map<RideType, RateCard> cards) { this.cards = Map.copyOf(cards); }

    public FareBreakdown price(RideType type, TripMetrics trip, double surge) {
        RateCard c = cards.get(type);
        if (c == null) throw new IllegalArgumentException("No rate card for " + type);
        long distance = Math.round(trip.km() * c.perKm());           // each line item rounded once
        long time = Math.round(trip.minutes() * c.perMinute());
        long total = Math.max(c.minimum(), Math.round((c.base() + distance + time) * surge));
        return new FareBreakdown(c.base(), distance, time, surge, total);
    }
}

/** A fixed price per ride type, e.g. airport transfers; ignores distance, time and surge. */
final class FlatRatePricing implements PricingStrategy {
    private final Map<RideType, Long> fares;

    FlatRatePricing(Map<RideType, Long> fares) { this.fares = Map.copyOf(fares); }

    public FareBreakdown price(RideType type, TripMetrics trip, double surge) {
        Long fare = fares.get(type);
        if (fare == null) throw new IllegalArgumentException("No flat fare for " + type);
        return new FareBreakdown(fare, 0, 0, 1.0, fare);
    }
}

interface SurgeProvider  { double multiplierAt(Location pickup); }          // 1.0 means no surge
interface RouteEstimator { TripMetrics estimate(Location from, Location to); }

/** Straight-line distance padded for real roads, at an average city speed of 25 km/h. */
final class StraightLineEstimator implements RouteEstimator {
    public TripMetrics estimate(Location from, Location to) {
        double km = from.distanceKm(to) * 1.3;
        return new TripMetrics(km, km / 25.0 * 60);
    }
}` },
        { type: `code`, lang: `java`, title: `Drivers and the grid index`, code: `enum DriverStatus { OFFLINE, AVAILABLE, OFFERED, ON_TRIP }

final class Driver {
    final String id;
    final Vehicle vehicle;
    private final AtomicReference<DriverStatus> status = new AtomicReference<>(DriverStatus.OFFLINE);
    private volatile Location location;        // written by GPS pings, read by matching: no lock needed
    private volatile long lastAssignedAt;      // epoch millis, for fair matching
    private long ratingSum, ratingCount;       // guarded by this

    Driver(String id, Vehicle vehicle, Location start) { this.id = id; this.vehicle = vehicle; this.location = start; }

    DriverStatus status()  { return status.get(); }
    Location location()    { return location; }
    long lastAssignedAt()  { return lastAssignedAt; }
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
                cells.computeIfAbsent(now, c -> ConcurrentHashMap.newKeySet()).add(d);
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
}` },
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
        RideEvent event = moveTo(RideStatus.CANCELLED);   // throws once the trip has started
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
        { type: `code`, lang: `java`, title: `RideService: requests, offers and timeouts`, code: `interface RideListener   { void onEvent(RideEvent e); }                        // notifications, receipts
interface PaymentGateway { void charge(String idempotencyKey, String riderId, long amount); }

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
        return pricing.price(type, routes.estimate(pickup, drop), surge.multiplierAt(pickup));
    }

    /** Idempotent: a retry with the same request id returns the same ride and never dispatches twice. */
    Ride requestRide(String riderId, String requestId, Location pickup, Location drop, RideType type) {
        String key = riderId + ":" + requestId;
        Ride existing = byRequest.get(key);
        if (existing != null) return existing;
        Ride fresh = new Ride(UUID.randomUUID().toString(), riderId, pickup, drop, type, estimate(pickup, drop, type));
        existing = byRequest.putIfAbsent(key, fresh);          // atomic: one of two racing retries wins
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
        FareBreakdown fare = pricing.price(r.type, actual, r.estimate.surge());    // surge locked at request time
        publish(r.complete(driverId, fare));                                        // throws if already completed
        payments.charge(r.id, r.riderId, fare.total());                             // ride id as the idempotency key
    }

    // ---- dispatch
    private void dispatch(Ride r) {
        RideEvent e = r.offerNext();
        if (e == null) return;                                   // cancelled meanwhile
        publish(e);                                              // OFFERED (to the driver) or CANCELLED (no driver)
        if (e.status() == RideStatus.OFFERED)
            timer.schedule(() -> retryIfWithdrawn(r, e.driverId()), OFFER_TIMEOUT_SECONDS, TimeUnit.SECONDS);
    }

    private void retryIfWithdrawn(Ride r, String driverId) {
        if (r.withdrawOffer(driverId)) dispatch(r);              // false if accepted or cancelled first
    }

    private void publish(RideEvent e) {                          // called outside every lock
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
        { type: `callout`, tone: `warning`, html: `<p>Two details make or break this code. The driver claim is a <strong>compare-and-set</strong>, never "if available, then mark offered": two dispatch threads can both pass that check. And the timeout handler does not assume the offer is still live; <code>withdrawOffer</code> re-checks, under the ride's lock, that the ride is still OFFERED to that same driver, so a timer that fires just after an accept does nothing.</p>` }
      ] },
      { id: `concurrency`, title: `Where the threads meet`, kicker: `Thread safety`, blocks: [
        { type: `text`, html: `<p>Rider requests, driver taps, GPS pings and offer timers all arrive on different threads. Each piece of shared state has exactly one protection, chosen for how it is used.</p>` },
        { type: `table`, headers: [`Shared state`, `Protection`, `Why it is safe`], rows: [
          [`Driver status`, `<code>AtomicReference</code>, changed only by compare-and-set`, `Checking AVAILABLE and setting OFFERED is one atomic step, so exactly one ride can take a driver`],
          [`Driver location`, `<code>volatile</code> reference to an immutable <code>Location</code>`, `A reader sees the old point or the new one, never half of each; pings never take a lock`],
          [`Driver rating`, `<code>synchronized</code> on the driver`, `Sum and count always change together`],
          [`Grid cells`, `<code>ConcurrentHashMap</code> of concurrent sets; <code>compute</code> per driver`, `Matching iterates cells without locking; one driver's cell moves never interleave`],
          [`Ride status, driver, candidates`, `The ride's monitor (<code>synchronized</code>)`, `Every transition reads and writes several fields together; rides never share a lock`],
          [`Request id to ride`, `<code>putIfAbsent</code>`, `Two racing retries: exactly one insert wins and only that one dispatches`],
          [`Strategies, rate cards, transition table`, `Immutable after construction`, `Shared freely with no locking`],
          [`Listeners`, `<code>CopyOnWriteArrayList</code>, called after locks are released`, `A slow notification can't stall dispatch`]
        ] },
        { type: `callout`, tone: `insight`, html: `<p>No code path holds two locks. The ride's lock is held while claiming a driver, but the claim is a non-blocking CAS, so there is no lock ordering to get wrong and no deadlock to explain. Location pings touch only the driver's volatile field and the concurrent index, so a flood of pings never slows matching down.</p>` }
      ] },
      { id: `walkthrough`, title: `Walking through it`, kicker: `Check it works`, blocks: [
        { type: `steps`, items: [
          `Rider R1 asks for a MINI estimate: about 6 km and 18 minutes, surge 1.2 in that cell. The quote is shown and the 1.2 will be locked into the ride.`,
          `<code>requestRide(R1, "req-7", ...)</code> creates ride A. Nearby MINI drivers D1 (0.8 km), D2 (1.5 km) and D3 (2.4 km) are ranked nearest first. <code>offerNext</code> claims D1 by CAS, ride A becomes OFFERED and a 15-second timer is scheduled.`,
          `At the same moment rider R2 nearby requests ride B with the same candidates. Its CAS on D1 fails (D1 is OFFERED), so ride B claims D2 instead. Two riders never get one driver.`,
          `R1's app times out on a flaky network and resends "req-7". <code>byRequest</code> already holds it, so the same ride A comes back and nothing is dispatched twice.`,
          `D1 ignores the offer. The timer calls <code>withdrawOffer(D1)</code>: ride A is still OFFERED to D1, so D1 goes back to AVAILABLE and ride A to REQUESTED. The next candidate, D2, fails the CAS (taken by B), so D3 is claimed and offered.`,
          `D3 accepts; ride A becomes ACCEPTED and D3 ON_TRIP. Had D3's accept and the timer fired together, the ride's lock would let one in first and the other would find the state changed and do nothing.`,
          `Arrived, start, then <code>complete</code> with the actual 7 km and 24 minutes: the fare is recomputed with the locked 1.2 surge and charged with the ride id as the idempotency key. A second complete throws, since COMPLETED &rarr; COMPLETED is not in the table.`
        ] }
      ] }
    ],
    levels: levels(
      [`Rider, Driver, Ride, Location and a RideService with sensible responsibilities, and a working happy path from request to completion.`, `A status enum with illegal transitions rejected, one pricing rule and nearest-driver matching.`, `Recognising that two riders can race for one driver, even if the fix needs hints.`],
      [`Strategy for pricing and matching, justified by rules that vary per city and experiment.`, `An atomic driver claim (CAS or a per-driver lock), offers with a timeout, and the accept-versus-timeout race resolved under the ride's lock.`, `Idempotent ride requests, estimate versus final fare with the surge locked in, and notifications through an Observer called outside locks.`],
      [`Spatial indexing trade-offs (grid, geohash, hexagons), surge computed per cell on a schedule with smoothing and caps, cancellation fees as a policy, and fairness in matching.`, `What moves to system design, briefly: geo-sharded dispatch, location pings over Kafka, driver claims as conditional writes in a shared store, durable offer timers and idempotent payments.`]
    ),
    concepts: [
      { term: `Pricing strategy`, def: `An interface that turns a ride type, trip metrics and a surge multiplier into a fare breakdown; metered and flat-rate implementations.`, why: `Pricing rules change per city and per experiment without touching dispatch.` },
      { term: `Surge multiplier`, def: `A factor of at least 1.0 derived from open requests versus available drivers in the pickup's cell, capped and rounded.`, why: `Raises prices where demand outstrips supply, which draws drivers in and dampens demand.` },
      { term: `Matching strategy`, def: `An interface that ranks candidate drivers: nearest, highest rated, least recently assigned, or a weighted blend.`, why: `"Who gets the ride" is a business policy that changes independently of how candidates are found.` },
      { term: `Explicit transition table`, def: `A map from each ride status to the statuses it may move to; one <code>moveTo</code> method checks it.`, why: `Illegal steps (completing a cancelled ride, cancelling mid-trip) are rejected in one place.` },
      { term: `Atomic driver claim`, def: `<code>compareAndSet(AVAILABLE, OFFERED)</code> on the driver's status.`, why: `Of many rides racing for one driver, exactly one wins; the others move on to their next candidate.` },
      { term: `Offer with timeout`, def: `Offer to one driver, schedule a timeout, and on decline or timeout release the driver and try the next candidate.`, why: `A driver who never answers can't stall a rider, and no thread blocks waiting.` },
      { term: `Grid cell index`, def: `Drivers bucketed by a cell computed from latitude and longitude; a search scans only nearby cells.`, why: `Finding candidates costs a few cells, not every driver in the city.` },
      { term: `Idempotent request`, def: `A client-generated request id, stored with <code>putIfAbsent</code>, maps retries to the same ride.`, why: `A network retry never books two cabs.` },
      { term: `Estimate vs final fare`, def: `The estimate prices the routed trip; the final fare prices the actual trip with the surge locked at request time.`, why: `Riders keep the surge they agreed to; detours and jams are still paid for.` },
      { term: `Observer for notifications`, def: `Listeners receive a <code>RideEvent</code> for every status change, after the ride's lock is released.`, why: `Push, SMS and receipts plug in without coupling to dispatch, and can't slow it down.` },
      { term: `Broadcast dispatch`, def: `Nearby drivers see open requests and choose; <code>Ride.claim</code> under the ride's lock lets the first valid claim win.`, why: `The race flips from rides competing for a driver to drivers competing for a ride, and both sides stay atomic.` },
      { term: `Live tracking`, def: `A <code>RideTracker</code> forwards an assigned driver's pings and ETA to the rider, throttled per ride with a compare-and-set.`, why: `Riders see the car approach without any lock on the hot ping path.` },
      { term: `Payment lifecycle`, def: `One <code>Payment</code> per ride, PENDING then SUCCEEDED or FAILED, retried with the ride id as the idempotency key.`, why: `A declined card is tracked and retried without un-completing the ride or charging twice.` }
    ],
    interview: [
      { q: `How do you guarantee two riders never get the same driver?`, a: `Taking a driver is a compare-and-set on the driver's status from AVAILABLE to OFFERED. Two dispatch threads can both see the driver available, but only one CAS succeeds; the loser moves on to its next candidate. A per-driver lock works too. What does not work is checking the status and then setting it in two steps, because both threads can pass the check. The ride side is protected separately: a ride holds at most one driver because offerNext, accept and withdrawOffer all run under the ride's lock and check its status first.`, diff: `medium` },
      { q: `What if the driver accepts at the same moment the offer times out?`, a: `Both the accept and the timeout handler take the ride's lock, so one runs first. If the accept wins, the ride is ACCEPTED and withdrawOffer sees it is no longer OFFERED and returns false, doing nothing. If the timeout wins, the driver is released and the ride goes back to REQUESTED, so the late accept fails the "offered to this driver" check and the driver app is told the offer expired. Either way the ride ends up with exactly one driver.`, diff: `hard` },
      { q: `Why use Strategy for pricing and matching rather than if/else?`, a: `Both are business rules that change often and independently: per city, per ride type, per experiment. With strategies each rule is a small class that can be tested alone and swapped by configuration, and RideService never changes when a rule ships. An if/else chain inside the dispatcher would grow with every launch and mix policy with the concurrency-sensitive dispatch code.`, diff: `easy` },
      { q: `How do you find nearby drivers without scanning every driver?`, a: `Bucket drivers into grid cells computed from latitude and longitude (about 1 km cells), kept in a concurrent map from cell to a concurrent set of drivers. A search computes the pickup's cell and scans the rings of cells that cover the radius, then filters by exact distance, status and ride type. A ping that stays in the same cell only updates the driver's volatile location; a cell change moves the driver between two sets. Geohash or hexagonal grids are refinements of the same idea.`, diff: `medium` },
      { q: `How do you make a ride request safe to retry?`, a: `The client generates a request id and resends it on retry. The service keys rides by riderId plus requestId and inserts with putIfAbsent, so two racing copies resolve to one ride and only the winner dispatches. Entries expire after a while so the map doesn't grow forever. Payments follow the same idea: the gateway is called with the ride id as the idempotency key.`, diff: `medium` },
      { q: `How does the final fare differ from the estimate?`, a: `The estimate prices the routed distance and time with the current surge. The final fare prices the actual distance and time from the trip, but with the surge multiplier locked at request time, because the rider agreed to it. A common variant is an upfront price: charge the estimate unless the metered fare differs by more than a tolerance, say 15 percent, which signals a detour or a changed drop. Money stays in long paise throughout and is rounded once per line item.`, diff: `medium` },
      { q: `What changes when this runs across many servers?`, a: `The design stays, the mechanisms move. Location pings flow through a stream such as Kafka into a geo-sharded location service, so each shard indexes its own cells. The driver claim becomes a conditional write in a shared store, such as an update guarded by status = AVAILABLE or a key set only if absent, with a TTL. Offer timeouts need durable timers so a crash doesn't strand an offer. Events go to a topic that notification services consume. In an LLD round, name these in a minute rather than designing them.`, diff: `hard` },
      { q: `Drivers can see open requests and pick one. Five drivers tap Accept on the same ride at once: what happens?`, a: `Each tap calls Ride.claim, which is synchronized on the ride. The first thread in finds the ride REQUESTED, claims the driver by compare-and-set and moves the ride to ACCEPTED; the other four find it no longer REQUESTED and get "no longer available", which the app shows as "taken". The driver CAS covers the other side: a driver who taps two rides at the same moment can win only one. Only one lock is ever held, so there is no deadlock.`, diff: `medium` },
      { q: `How do you show the rider the driver's live location?`, a: `Drivers already ping every few seconds for matching. A RideTracker keeps a concurrent map from driver id to the ride they are driving, filled on accept and cleared on complete or cancel. Each ping does one lookup; if the driver is on a ride, it computes an ETA to the pickup (or to the drop once the trip has started) and pushes an update to the rider. Updates are throttled per ride with a compare-and-set on the last-sent time, so the hot path takes no lock and only one of two simultaneous pings is forwarded.`, diff: `medium` },
      { q: `Should RideService be a Singleton?`, a: `Many solutions make it one, but I wouldn't. A Singleton hides a global dependency, makes tests share state, and stops a test from building a service with fake strategies and a fake clock. One instance created at startup and passed to the controllers gives the same "only one" guarantee. If a global accessor is really required, a lock-based lazy singleton keeps creation thread-safe, and the service's own state is already thread-safe.`, diff: `easy` }
    ],
    cheatsheet: [
      { title: `Ride sharing in one screen`, type: `code`, lang: `java`, body: `interface PricingStrategy  { FareBreakdown price(RideType t, TripMetrics trip, double surge); }
interface MatchingStrategy { List<Candidate> rank(List<Candidate> candidates); }

final class Driver {
    AtomicReference<DriverStatus> status;   // AVAILABLE -> OFFERED only by compareAndSet
    volatile Location location;             // pings never lock
}
final class Ride {                          // every method synchronized
    RideStatus status; Driver driver; Deque<Candidate> candidates;
    RideEvent offerNext();                  // claim next free candidate, OFFERED
    RideEvent accept(String driverId, long now);
    boolean withdrawOffer(String driverId); // decline or timeout; false if stale
}
enum RideStatus { ...; boolean canMoveTo(RideStatus next); }   // explicit table` },
      { title: `Claiming a driver: options`, type: `table`, headers: [`Option`, `Pros`, `Cons`], rows: [
        [`CAS on driver status (chosen)`, `Non-blocking, one line, no deadlock`, `Only guards one field`],
        [`Lock per driver`, `Can guard several driver fields together`, `Must never be nested with the ride's lock in the opposite order`],
        [`One global dispatch lock`, `Trivially correct`, `Every request in the city serialises`],
        [`Broadcast, first accept wins`, `Fast acceptance`, `Still needs an atomic claim; drivers see offers vanish`]
      ] },
      { title: `Edge cases`, type: `list`, items: [`Retried request with the same request id`, `Driver accepts as the offer times out`, `Rider cancels while an offer is pending (release the driver)`, `No candidates, or all candidates taken: cancel with NO_DRIVER`, `Complete or rate called twice`, `Cancel after the trip has started: rejected`, `Driver goes offline while offered: the CAS fails, so they must finish or decline first`] }
    ],
    labs: []
  });
})();
