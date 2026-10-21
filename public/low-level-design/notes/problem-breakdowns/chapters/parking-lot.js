// LLD problem breakdown: Parking Lot. Format: Chapter in public/shared/notes.d.ts; shared helpers in data-part2.js.
// Imports are omitted in the code.
(function () {
const { levels, PRACTICE_TIP, PATTERN_TABLE } = LLD_PROBLEMS_KIT;

window.DATA.chapters.push({
    id: `parking-lot`, part: 1, number: 0, difficulty: `easy`,
    title: `Parking Lot: atomic spot claims, best-fit allocation and swappable pricing`,
    references: [{ title: `awesome-low-level-design: Parking Lot`, url: `https://github.com/ashishps1/awesome-low-level-design/blob/main/problems/parking-lot.md` }],
    overview: `A lot has several floors of small, medium and large spots. A vehicle gets a ticket on the way in and pays on the way out, and several gates work at the same time. This page works the problem in interview order: clarify the requirements, find the entities, design the classes top down, implement parking, pricing and spot selection (comparing a weak, a good and a strong option at each decision), verify with a trace, then handle follow-ups. The design lands on a spot that claims itself with an <strong>atomic compare-and-set</strong>, tickets that can be redeemed exactly once, <strong>best-fit</strong> allocation that keeps large spots for large vehicles, and pricing and allocation as <strong>Strategy</strong> objects with money in cents and an injected clock.`,
    problem: [
      { id: `understanding`, title: `What a parking lot system does`, kicker: `The problem`, blocks: [
        { type: `problem`, html: `<p>Vehicles of different sizes arrive at the entry gates of a multi-floor car park. The system finds each one a spot it fits in, records when it arrived, and hands over a ticket. On the way out the driver presents the ticket, the system works out the fee, and the spot becomes free again. Several gates do this at once, so two vehicles must never be sent to the same spot.</p>` },
        { type: `text`, html: `<p>The prompt is usually one sentence: <em>"Design a parking lot: vehicles park and leave, and they pay for the time they stay."</em> That leaves almost everything open: which vehicles, which spots, how the fee works, what happens when the lot is full. The first few minutes go into turning it into a spec.</p>` }
      ] },
      { id: `clarifying`, title: `Clarifying questions`, kicker: `Step 1: requirements`, blocks: [
        { type: `text`, html: `<p>Work through four kinds of question: <strong>what the system must do</strong>, <strong>what happens with bad input</strong>, <strong>what is deliberately left out</strong>, and <strong>what might be added later</strong>. Spend one to three minutes here; every answer removes a branch you would otherwise design for.</p>` },
        { type: `table`, headers: [`You ask`, `A typical answer`, `What it decides`], rows: [
          [`Which vehicles and which spots?`, `Motorcycles, cars and trucks; small, medium and large spots`, `Two small enums and a size order`],
          [`Can a vehicle use a bigger spot when its own size is full?`, `Yes: a motorcycle may take a medium or large spot, a car a large one; never smaller`, `A "fits" rule, and an allocation policy that decides which fitting spot to give`],
          [`One level or several? Is any spot better than another?`, `Several floors; lower floors and spots nearer the entrance are preferred`, `Floors hold their spots in preference order`],
          [`How is the fee worked out?`, `A rate per vehicle type, charged per started hour, at least one hour`, `The first pricing rule; rules will change, so it sits behind an interface`],
          [`Several entry and exit gates at the same time?`, `Yes`, `Spot claiming and ticket redemption must be atomic`],
          [`What if the lot is full, a ticket is unknown or used twice, or the same plate arrives twice?`, `Refuse politely; never crash or free a spot twice`, `Empty results instead of exceptions; single-use tickets; one entry per plate`],
          [`Payment, display boards, reservations?`, `Out of scope: return the fee and stop there`, `No payment or display classes; follow-ups only`]
        ] },
        { type: `callout`, tone: `insight`, title: `Several gates at once?`, html: `<p>This is the question that turns a data-modelling exercise into a design problem. With one gate, "find a free spot, mark it taken" is trivially correct. With two gates, both can see the same spot as free and both send a car to it. Asking it out loud shows you know where the real bug hides; the answer is always yes, and it decides that taking a spot must be a single atomic step, not a check followed by a write.</p>` }
      ] },
      { id: `final-requirements`, title: `Final requirements`, kicker: `Step 1: requirements`, blocks: [
        { type: `code`, lang: `text`, title: `Final requirements`, code: `Requirements
  1. The lot has several floors; each floor has small, medium and large spots.
  2. Vehicles are motorcycles, cars and trucks. A vehicle fits a spot of its own
     size or larger: motorcycle in any, car in medium or large, truck in large.
  3. park(vehicle) assigns a fitting free spot and returns a ticket with the
     entry time. Lower floors and spots nearer the entrance are preferred.
  4. unpark(ticketId) frees the spot and returns the fee.
  5. The fee is a rate per vehicle type per started hour, at least one hour,
     in cents. Pricing rules and the spot-selection rule must be swappable.
  6. Several gates call park and unpark concurrently: two vehicles never get
     the same spot, and a ticket can be redeemed only once.
  7. A full lot, an unknown or already used ticket, or a plate that is already
     inside gets an empty result, not an exception.

Out of scope
  - Payment methods and receipts
  - Display boards, reservations, EV charging
  - Adding or removing floors and spots at run time` },
        { type: `callout`, tone: `tip`, html: PRACTICE_TIP }
      ] }
    ],
    solution: [
      { id: `entities`, title: `Core entities`, kicker: `Step 2: entities`, blocks: [
        { type: `text`, html: `<p>Scan the requirements for nouns that hold state or enforce rules. There are plenty of candidates: the lot, floors, spots, vehicles, tickets, gates, fees, payment. Test each one before committing to a class; a parking lot is the problem where it is easiest to draw twelve boxes and implement none of them.</p>` },
        { type: `table`, headers: [`Candidate`, `Verdict`, `Why`], rows: [
          [`ParkingLot`, `A class`, `The entry point: owns the floors and the active tickets, and runs park and unpark`],
          [`Floor`, `A small class`, `Groups spots and fixes their preference order; the floor number matters for nearest-first and for later follow-ups such as per-floor boards`],
          [`ParkingSpot`, `A class`, `Has a size and the one piece of contested state in the system: whether it is taken`],
          [`Vehicle`, `A record, not a hierarchy`, `Plate plus type. <code>Car</code>, <code>Truck</code> and <code>Motorcycle</code> subclasses would differ only in a constant, so an enum carries that instead`],
          [`Ticket`, `A record`, `Ticket id, vehicle, spot and entry time; fixed once issued`],
          [`Gate`, `Not a class`, `A gate is just a thread calling <code>park</code> or <code>unpark</code>; it holds no state the lot needs`],
          [`Fee, money`, `A <code>long</code> of cents`, `A number, not an object. Never a <code>double</code>`],
          [`Payment, DisplayBoard`, `Not now`, `Out of scope; they appear only as follow-ups`]
        ] },
        { type: `table`, title: `The entities we keep`, headers: [`Entity`, `Responsibility`], rows: [
          [`ParkingLot`, `The entry point. Issues tickets on entry, redeems them on exit, and asks two strategies which spot to try and what to charge. Holds no lock of its own.`],
          [`ParkingFloor`, `A floor number and its spots, nearest the entrance first. Never changes after construction.`],
          [`ParkingSpot`, `A spot id and size, and whether it is taken. Claims itself atomically, so it alone settles races between gates.`],
          [`Vehicle`, `A plate and a type; the type knows the smallest spot size it needs.`],
          [`Ticket`, `Proof of entry: id, vehicle, spot and entry time.`],
          [`SpotAllocationStrategy, PricingStrategy`, `The two rules the requirements say must be swappable: which spots to try, in what order, and how much to charge.`]
        ] },
        { type: `callout`, tone: `tip`, html: `<p>Say out loud why you are <em>not</em> making a class: "Gate holds no state, so it is just a caller", "the vehicle subclasses would only differ in their size, so that's an enum field". Rejecting candidates with a reason scores as well as picking the right ones.</p>` }
      ] },
      { id: `lot-design`, title: `Class design: ParkingLot`, kicker: `Step 3: class design, top down`, blocks: [
        { type: `text`, html: `<p>Start from the class outside code talks to, and derive its state and methods from the requirements. For each requirement ask: what must this class remember, and what must it let callers do?</p>` },
        { type: `table`, headers: [`Requirement`, `What the lot remembers`], rows: [
          [`"Several floors of spots"`, `The list of floors, fixed at startup`],
          [`"unpark(ticketId) frees the spot"`, `The active tickets, by id, so an exit can find the spot and the entry time`],
          [`"A ticket can be redeemed only once"`, `The same map: removing a ticket on exit is what makes it single-use`],
          [`"A plate already inside gets an empty result"`, `The set of plates currently inside`],
          [`"Pricing and spot selection must be swappable"`, `A <code>PricingStrategy</code> and a <code>SpotAllocationStrategy</code>, passed in`],
          [`"Charged per started hour"`, `A <code>Clock</code>, passed in, so tests can control time`]
        ] },
        { type: `table`, headers: [`Need`, `Method`], rows: [
          [`A vehicle arrives at any gate`, `<code>Optional&lt;Ticket&gt; park(Vehicle v)</code>`],
          [`A ticket is presented at any exit`, `<code>OptionalLong unpark(String ticketId)</code>, the fee in cents`]
        ] },
        { type: `keypoints`, items: [
          `<strong>Two methods are the whole API.</strong> Floors, spots and strategies are set up once in the constructor; nothing in the requirements asks to change them at run time, so there are no setters to make thread-safe.`,
          `<strong>Empty results, not exceptions.</strong> A full lot and a reused ticket are everyday events at a gate, not programming errors. A richer result type (full versus already inside) is a fair refinement if the gate needs to show different messages.`,
          `<strong>The lot is created once and injected</strong>, not a Singleton. Tests build a small lot with a fixed clock; a second site is just a second instance.`,
          `<strong>Pricing reads the vehicle, not the spot.</strong> A motorcycle that ends up in a large spot still pays the motorcycle rate; that is worth stating, because it is a business rule the code must not hide.`
        ] }
      ] },
      { id: `spot-design`, title: `Class design: ParkingSpot, floors and tickets`, kicker: `Step 3: class design`, blocks: [
        { type: `table`, headers: [`Requirement`, `What a spot remembers`], rows: [
          [`"Small, medium and large spots"`, `Its size, fixed`],
          [`"Two vehicles never get the same spot"`, `Whether it is taken, the only field that ever changes`]
        ] },
        { type: `text`, html: `<p>The key decision in this problem is <strong>how a gate takes a spot</strong> when another gate may be after the same one.</p>` },
        { type: `compare`, items: [
          { title: `Weak: check, then mark`, tone: `bad`, html: `<p><code>if (spot.isFree()) spot.occupy();</code> Reads well and works in a single-threaded test. With two gates, both read "free" before either writes, and two cars are sent to one spot. Making each method synchronized does not help: the gap is <em>between</em> the two calls.</p>` },
          { title: `Good: one lock around park`, tone: `warn`, html: `<p>Make <code>park</code> and <code>unpark</code> synchronized on the lot. Correct and easy to explain, but every gate now waits for every other gate, including while one of them scans hundreds of spots. The whole lot moves at the speed of one gate.</p>` },
          { title: `Strong: the spot claims itself atomically`, tone: `ok`, html: `<p>Each spot has <code>tryOccupy()</code>, a single compare-and-set on its own flag that returns true to exactly one caller. A gate walks its list of candidates and takes the first spot it wins; a gate that loses simply tries the next one. Gates only contend when they want the very same spot, and the lot itself needs no lock.</p>` }
        ] },
        { type: `text`, html: `<p>We take the atomic claim, with an <code>AtomicBoolean</code> per spot. It also gives a clean division of labour: the allocation strategy only <em>suggests</em> spots in preference order and may be out of date by the time the gate acts, while <code>tryOccupy()</code> is the single place that decides. A buggy or slow strategy can make parking worse, never unsafe.</p>` },
        { type: `table`, headers: [`Need`, `Method on ParkingSpot`], rows: [
          [`Can this vehicle use this spot?`, `<code>boolean fits(VehicleType t)</code>`],
          [`Allocation wants free-looking spots`, `<code>boolean isFree()</code>, a hint only`],
          [`A gate takes the spot`, `<code>boolean tryOccupy()</code>`],
          [`An exit gives it back`, `<code>void release()</code>`]
        ] },
        { type: `code`, lang: `java`, title: `Vehicles, sizes and tickets`, code: `enum SpotSize { SMALL, MEDIUM, LARGE }                   // declared smallest first, so compareTo is size order

enum VehicleType {
    MOTORCYCLE(SpotSize.SMALL), CAR(SpotSize.MEDIUM), TRUCK(SpotSize.LARGE);

    final SpotSize needs;                                // the smallest spot this vehicle fits in
    VehicleType(SpotSize needs) { this.needs = needs; }
}

record Vehicle(String plate, VehicleType type) {
    Vehicle { Objects.requireNonNull(plate); Objects.requireNonNull(type); }
}

/** Immutable: the exit time is passed to pricing, never written back onto the ticket. */
record Ticket(String id, Vehicle vehicle, ParkingSpot spot, Instant entry) {}` },
        { type: `keypoints`, items: [
          `<strong>The size rule lives on the enum.</strong> <code>VehicleType.needs</code> plus the declared order of <code>SpotSize</code> answer "does it fit?" with one comparison, with no switch to keep in sync.`,
          `<strong>Records are immutable</strong>, so a ticket can be read by any thread without a lock. A ticket that stores its own exit time would be shared mutable state for no benefit.`
        ] }
      ] },
      { id: `class-diagram`, title: `Final class design`, kicker: `Step 3: class design`, blocks: [
        { type: `code`, lang: `java`, title: `Final class design`, code: `final class ParkingLot {
    private final List<ParkingFloor> floors;                    // fixed at startup
    private final SpotAllocationStrategy allocation;
    private final PricingStrategy pricing;
    private final Clock clock;
    private final Map<String, Ticket> activeTickets;            // ticket id -> ticket (ConcurrentHashMap)
    private final Set<String> platesInside;                     // concurrent set

    Optional<Ticket> park(Vehicle v);                           // empty if full or the plate is already inside
    OptionalLong unpark(String ticketId);                       // fee in cents; empty if unknown or already used
}

final class ParkingFloor {
    private final int number;
    private final List<ParkingSpot> spots;                      // nearest the entrance first, never changes
}

final class ParkingSpot {
    private final String id;
    private final SpotSize size;
    private final AtomicBoolean occupied;

    boolean fits(VehicleType t);
    boolean isFree();                                           // a hint
    boolean tryOccupy();                                        // atomic: true for exactly one caller
    void release();
}

record Vehicle(String plate, VehicleType type) {}
record Ticket(String id, Vehicle vehicle, ParkingSpot spot, Instant entry) {}

interface SpotAllocationStrategy { List<ParkingSpot> candidates(List<ParkingFloor> floors, VehicleType type); }
interface PricingStrategy        { long feeCents(Ticket ticket, Instant exit); }` },
        { type: `text`, html: `<p>The lot coordinates and never decides a race; each spot settles its own races and knows nothing about the lot. The two rules most likely to change (which spot, what fee) are <strong>Strategy</strong> objects, because the requirements say so explicitly. All shared state is either immutable (floors, records, strategies with no fields that change) or concurrent (the spot flag, the ticket map, the plate set).</p>` }
      ] },
      { id: `lot-impl`, title: `Implementation: spots, park and unpark`, kicker: `Step 4: implementation`, blocks: [
        { type: `text`, html: `<p>Check what the interviewer wants: working code, pseudocode or a walkthrough. For each method, write the normal path first, then the edge cases. The spot and floor are small; the only interesting line is the compare-and-set.</p>` },
        { type: `code`, lang: `java`, title: `ParkingSpot and ParkingFloor`, code: `final class ParkingSpot {
    private final String id;
    private final SpotSize size;
    private final AtomicBoolean occupied = new AtomicBoolean(false);   // the only mutable field

    ParkingSpot(String id, SpotSize size) { this.id = id; this.size = size; }

    String id()     { return id; }
    SpotSize size() { return size; }

    /** A vehicle fits any spot at least as large as the one it needs. */
    boolean fits(VehicleType t) { return size.compareTo(t.needs) >= 0; }

    /** A hint for allocation: the spot may be taken a moment later, and tryOccupy settles that. */
    boolean isFree() { return !occupied.get(); }

    /** Check and set in one atomic step: exactly one of several racing callers gets true. */
    boolean tryOccupy() { return occupied.compareAndSet(false, true); }

    void release() { occupied.set(false); }
}

final class ParkingFloor {
    private final int number;
    private final List<ParkingSpot> spots;                       // nearest the entrance first

    ParkingFloor(int number, List<ParkingSpot> spots) {
        this.number = number;
        this.spots = List.copyOf(spots);                         // immutable, so any thread may read it without a lock
    }

    int number()              { return number; }
    List<ParkingSpot> spots() { return spots; }
}` },
        { type: `text`, html: `<p><code>park</code>: reserve the plate, ask the strategy for candidates, take the first one we win, issue the ticket. <code>unpark</code>: remove the ticket, price it, free the spot.</p>` },
        { type: `list`, title: `Edge cases the code must handle`, items: [
          `Another gate takes a candidate first: <code>tryOccupy()</code> returns false, so try the next one.`,
          `No candidate can be won: undo the plate reservation and return empty, so the driver can try again later.`,
          `The same plate at two gates at once: the concurrent set's <code>add</code> lets exactly one through.`,
          `The same ticket scanned twice, or at two exits at once: <code>ConcurrentHashMap.remove</code> returns the ticket to the first caller only, so the spot is never freed twice.`,
          `An unknown or null ticket id: empty, without touching any spot.`,
          `A stay of zero minutes, or a clock that steps backwards: charged the one-hour minimum, never a negative fee.`
        ] },
        { type: `code`, lang: `java`, title: `ParkingLot`, code: `final class ParkingLot {
    private final List<ParkingFloor> floors;
    private final SpotAllocationStrategy allocation;
    private final PricingStrategy pricing;
    private final Clock clock;
    private final Map<String, Ticket> activeTickets = new ConcurrentHashMap<>();   // ticket id -> ticket
    private final Set<String> platesInside = ConcurrentHashMap.newKeySet();

    ParkingLot(List<ParkingFloor> floors, SpotAllocationStrategy allocation, PricingStrategy pricing, Clock clock) {
        this.floors = List.copyOf(floors);
        this.allocation = allocation;
        this.pricing = pricing;
        this.clock = clock;
    }

    /** Empty if no fitting spot is free or this plate is already inside. */
    Optional<Ticket> park(Vehicle v) {
        if (!platesInside.add(v.plate())) return Optional.empty();          // atomic: one entry per plate
        for (ParkingSpot spot : allocation.candidates(floors, v.type())) {
            if (spot.tryOccupy()) {                                         // lost the race? try the next candidate
                Ticket t = new Ticket(UUID.randomUUID().toString(), v, spot, clock.instant());
                activeTickets.put(t.id(), t);
                return Optional.of(t);
            }
        }
        platesInside.remove(v.plate());                                     // nothing won: the plate may try again
        return Optional.empty();
    }

    /** The fee in cents; empty if the ticket is unknown or was already used. */
    OptionalLong unpark(String ticketId) {
        Ticket t = ticketId == null ? null : activeTickets.remove(ticketId); // atomic: only the first exit gets it
        if (t == null) return OptionalLong.empty();
        long fee = pricing.feeCents(t, clock.instant());
        t.spot().release();
        platesInside.remove(t.vehicle().plate());
        return OptionalLong.of(fee);
    }
}` },
        { type: `callout`, tone: `warning`, html: `<p>Thread safety: every field of <code>ParkingLot</code> is final; the floors are an immutable list; each spot guards its own flag with an <code>AtomicBoolean</code>; tickets and plates live in concurrent collections whose <code>add</code> and <code>remove</code> are atomic. That is why <code>park</code> and <code>unpark</code> need no lock and gates never wait for each other unless they race for the same spot. Ticket ids come from <code>UUID.randomUUID()</code>, which uses a cryptographically strong generator, so a ticket id cannot be guessed and redeemed by someone else.</p>` },
        { type: `text`, html: `<p>Pricing is the other swappable rule. The first one charges a rate per vehicle type for every started hour, with integer arithmetic only.</p>` },
        { type: `code`, lang: `java`, title: `Pricing: per started hour`, code: `interface PricingStrategy { long feeCents(Ticket ticket, Instant exit); }

/** A rate per vehicle type, charged per started hour, at least one hour. */
final class HourlyPricing implements PricingStrategy {
    private final Map<VehicleType, Long> centsPerHour;          // immutable copy, so safe to share

    HourlyPricing(Map<VehicleType, Long> centsPerHour) {
        for (VehicleType t : VehicleType.values())
            if (!centsPerHour.containsKey(t)) throw new IllegalArgumentException("No rate for " + t);
        this.centsPerHour = Map.copyOf(centsPerHour);
    }

    public long feeCents(Ticket t, Instant exit) {
        long seconds = Math.max(0, Duration.between(t.entry(), exit).toSeconds());   // a clock step back counts as zero
        long hours = Math.max(1, (seconds + 3599) / 3600);                           // round up: 61 minutes is 2 hours
        return hours * centsPerHour.get(t.vehicle().type());                        // priced by vehicle, not by spot
    }
}` },
        { type: `keypoints`, items: [
          `<strong>Say the rounding rule out loud.</strong> 60 minutes is one hour, 61 minutes is two, zero minutes is the one-hour minimum. <code>(seconds + 3599) / 3600</code> is a ceiling division with no floating point.`,
          `<strong>Validate rates at construction.</strong> <code>unpark</code> has already removed the ticket when it asks for the fee; a missing rate discovered there would leave the spot taken forever. Failing at startup is far cheaper.`,
          `<strong>The clock is injected.</strong> Tests pass a fixed or stepping clock and check exact fees; production passes <code>Clock.systemUTC()</code>.`
        ] }
      ] },
      { id: `allocation-impl`, title: `Implementation: choosing a spot`, kicker: `Step 4: implementation`, blocks: [
        { type: `text`, html: `<p>Which fitting spot should a vehicle get? Before coding, compare policies on one small example. Floor 1 has, nearest the entrance first, a large spot <code>F1-L1</code>, a medium <code>F1-M1</code> and a small <code>F1-S1</code>. Floor 2 has two medium spots, <code>F2-M1</code> and <code>F2-M2</code>. Five vehicles arrive in order: car, car, truck, motorcycle, motorcycle.</p>` },
        { type: `table`, headers: [`Policy`, `car`, `car`, `truck`, `motorcycle`, `motorcycle`, `Parked`], rows: [
          [`Exact size only`, `F1-M1`, `F2-M1`, `F1-L1`, `F1-S1`, `refused`, `4 of 5`],
          [`Nearest fitting spot`, `F1-L1`, `F1-M1`, `refused`, `F1-S1`, `F2-M1`, `4 of 5`],
          [`Best fit: smallest size that fits, then nearest`, `F1-M1`, `F2-M1`, `F1-L1`, `F1-S1`, `F2-M2`, `5 of 5`]
        ] },
        { type: `compare`, items: [
          { title: `Weak: exact size only`, tone: `bad`, html: `<p>Each vehicle may use only spots of its own size. Simple, and large spots are never wasted. But the second motorcycle is turned away while a medium spot stands empty, which no real operator would accept.</p>` },
          { title: `Good: nearest fitting spot`, tone: `warn`, html: `<p>Any spot the vehicle fits in, nearest first. Drivers like it, and nobody is refused while a fitting spot is free <em>at that moment</em>. But the first car takes the only large spot because it happens to be nearest, and the truck that arrives next has nowhere to go.</p>` },
          { title: `Strong: best fit`, tone: `ok`, html: `<p>Try the smallest size the vehicle fits in first, nearest first within that size, then the next size up. Big spots stay free for big vehicles as long as possible, and smaller vehicles still overflow into them when their own size is full. All five vehicles park.</p>` }
        ] },
        { type: `text`, html: `<p>We default to best fit and keep the others as strategies: a lot that sells "nearest to the lift" as a premium might want nearest-fit on one floor, and a lot with strict bays might want exact size. Every strategy returns <em>candidates in preference order</em> and leaves claiming to the lot, so none of them can break the "one car per spot" guarantee. They hold no mutable fields, so one instance is shared by all gates.</p>` },
        { type: `code`, lang: `java`, title: `Allocation: exact size and nearest fit`, code: `interface SpotAllocationStrategy {
    /** Free-looking spots that fit, best first. The lot claims them in this order; one taken meanwhile is skipped. */
    List<ParkingSpot> candidates(List<ParkingFloor> floors, VehicleType type);
}

/** Only spots of exactly the size the vehicle needs, nearest first. */
final class ExactSize implements SpotAllocationStrategy {
    public List<ParkingSpot> candidates(List<ParkingFloor> floors, VehicleType type) {
        return floors.stream().flatMap(f -> f.spots().stream())
            .filter(s -> s.isFree() && s.size() == type.needs)
            .toList();
    }
}

/** Any spot the vehicle fits in, nearest the entrance first. */
final class NearestFit implements SpotAllocationStrategy {
    public List<ParkingSpot> candidates(List<ParkingFloor> floors, VehicleType type) {
        return floors.stream().flatMap(f -> f.spots().stream())
            .filter(s -> s.isFree() && s.fits(type))
            .toList();
    }
}` },
        { type: `code`, lang: `java`, title: `Allocation: best fit`, code: `/** The smallest size that fits first, nearest the entrance within each size; larger spots stay free for larger vehicles. */
final class BestFit implements SpotAllocationStrategy {
    public List<ParkingSpot> candidates(List<ParkingFloor> floors, VehicleType type) {
        List<ParkingSpot> out = new ArrayList<>();                      // local to this call, never shared
        for (SpotSize size : SpotSize.values()) {
            if (size.compareTo(type.needs) < 0) continue;               // too small for this vehicle
            for (ParkingFloor f : floors)
                for (ParkingSpot s : f.spots())
                    if (s.size() == size && s.isFree()) out.add(s);
        }
        return out;
    }
}` },
        { type: `callout`, tone: `interview`, html: `<p>Every <code>park</code> scans all spots: O(n). That is fine for a few hundred spots and the right first answer in 35 minutes. Name the cost yourself and the fix: a concurrent sorted set of free spots per size, where <code>pollFirst()</code> is both the choice and the atomic claim (see Deep Dives).</p>` },
        { type: `text`, html: `<p>Floors holding spots, small/medium/large sizes with a "fits" rule, fee and parking strategies, and a concurrent map of active tickets follow the <a href="https://github.com/ashishps1/awesome-low-level-design/tree/main/solutions/java/src/parkinglot" target="_blank" rel="noopener">awesome-low-level-design parking lot solution</a>; the code here is written independently. That version finds a spot and marks it taken in two separate steps, so two gates can get the same spot; here the spot claims itself with a compare-and-set. It also uses a Singleton with setters, <code>double</code> fees, a ticket whose exit time is mutated, and tickets keyed by plate; here the lot is injected with fixed strategies, fees are <code>long</code> cents from an injected clock, tickets are immutable and redeemed by id, and the vehicle subclasses become one enum.</p>` }
      ] },
      { id: `verification`, title: `Verifying with a trace`, kicker: `Step 5: verification`, blocks: [
        { type: `text`, html: `<p>Walk the lot through a concrete scenario, call by call, before the interviewer does. Same five spots as above, best-fit allocation, rates of 100, 250 and 500 cents an hour for motorcycles, cars and trucks. Ticket ids are random UUIDs; they are shown as T1, T2 and so on.</p>` },
        { type: `code`, lang: `text`, title: `Call by call`, code: `09:00  park(KA-01, CAR)         candidates F1-M1, F2-M1, F2-M2, F1-L1
                                 tryOccupy(F1-M1) wins             -> T1 at F1-M1
09:05  two gates at once: both compute candidates F2-M1, F2-M2, F1-L1
       gate A park(KA-02, CAR)   tryOccupy(F2-M1) wins             -> T2 at F2-M1
       gate B park(KA-03, CAR)   tryOccupy(F2-M1) loses,
                                 tryOccupy(F2-M2) wins             -> T3 at F2-M2
09:10  park(TR-77, TRUCK)        candidates F1-L1                  -> T4 at F1-L1
09:12  park(MC-11, MOTORCYCLE)   candidates F1-S1                  -> T5 at F1-S1
09:15  park(MC-12, MOTORCYCLE)   no candidates, plate released     -> empty (full)
09:20  park(KA-01, CAR)          plate already inside              -> empty
10:00  unpark(T1)                60 min = 1 hour x 250             -> 250 cents, F1-M1 free
10:00  unpark(T1) again          remove returns null               -> empty, nothing freed
10:01  park(MC-12, MOTORCYCLE)   no small spot free; medium F1-M1  -> T6 at F1-M1
11:06  unpark(T2)                121 min = 3 hours x 250           -> 750 cents, F2-M1 free
11:30  unpark(T6)                89 min = 2 hours x 100            -> 200 cents, F1-M1 free` },
        { type: `keypoints`, items: [
          `Two gates computed the same candidate list at 09:05, and the compare-and-set sent them to different spots: the loser moved on instead of double-booking F2-M1.`,
          `Best fit kept F1-L1 free through two car arrivals, so the truck at 09:10 still had a spot.`,
          `A refused motorcycle at 09:15 left no trace: its plate was released, so it parked normally at 10:01, overflowing into a medium spot and still paying the motorcycle rate.`,
          `Rounding behaved as specified: exactly 60 minutes is one hour, 89 minutes is two, 121 minutes is three. A ticket scanned twice freed its spot once.`
        ] }
      ] }
    ],
    levels: levels(
      [`Spots, tickets, vehicles and a lot with a working <code>park</code> and <code>unpark</code>; no class for gates or money.`, `A fee that rounds up to whole hours with integer arithmetic, and money that is not a <code>double</code>.`, `Spots that fit by size, and a lot that refuses rather than crashes when full; with a hint, sees that two gates can race for one spot.`],
      [`Spots the race unprompted and fixes it with an atomic claim (compare-and-set or a synchronized check-and-set), not a lock around the whole lot.`, `Single-use tickets via an atomic remove, an injected clock, and pricing and allocation behind strategies because the requirements ask for swappable rules.`, `Explains why best fit beats nearest fit on an example, and states that pricing follows the vehicle, not the spot.`, `Can say where follow-ups land: a new pricing rule is a new class, a faster allocator changes the strategy and two lines of the lot.`],
      [`Asks about concurrent gates in the first minutes and lets that answer shape the design: strategies suggest, the spot decides.`, `Separates hints from decisions explicitly, so a slow or wrong strategy can never double-book; keeps the lot lock-free and explains why.`, `Names the O(n) scan and sketches the free-spot index where removal is the claim; knows the database equivalent is a conditional update.`, `Handles operational edge cases fluently (lost tickets, a plate seen twice, a pricing failure after the ticket is removed) and rejects patterns nothing needs, such as a Singleton lot or display observers.`]
    ),
    concepts: [
      { term: `Atomic claim`, def: `<code>tryOccupy()</code> is one <code>compareAndSet(false, true)</code> on the spot's flag; exactly one racing caller gets true.`, why: `Removes the check-then-act race without a lock around the whole lot.` },
      { term: `Hints versus decisions`, def: `Allocation returns free-looking candidates that may be stale; only <code>tryOccupy()</code> decides who gets a spot.`, why: `Strategies can be swapped or wrong without ever breaking "one car per spot".` },
      { term: `Single-use ticket`, def: `Active tickets sit in a <code>ConcurrentHashMap</code>; <code>remove(id)</code> returns the ticket to the first caller only.`, why: `A ticket scanned twice, or at two exits, frees its spot once.` },
      { term: `Best-fit allocation`, def: `Try the smallest spot size the vehicle fits in, nearest first, then the next size up.`, why: `Keeps large spots for large vehicles while still letting small ones overflow.` },
      { term: `Strategy pattern`, def: `<code>PricingStrategy</code> and <code>SpotAllocationStrategy</code> are interfaces passed to the lot.`, why: `The requirements say both rules must be swappable; a new rule is a new class and the lot is untouched.` },
      { term: `Fee per started hour`, def: `<code>max(1, (seconds + 3599) / 3600)</code> times the vehicle's rate.`, why: `Ceiling division with integers; the minimum and the rounding are explicit business rules.` },
      { term: `Money as long cents`, def: `Rates and fees are <code>long</code> numbers of the smallest currency unit.`, why: `A <code>double</code> cannot represent most decimal amounts exactly.` },
      { term: `Injected clock`, def: `The lot reads time from a <code>java.time.Clock</code> it is given, never from <code>Instant.now()</code>.`, why: `Tests can fix time and check exact fees.` }
    ],
    interview: [
      { q: `Why isn't Gate a class?`, a: `A gate holds no state the lot needs: it is a place where park or unpark gets called, which in code is just a thread. A Gate class would wrap a reference to the lot and add nothing. If gates later had their own behaviour (a barrier that can fail, a camera that reads plates) they could become classes that call the lot, without changing the lot.`, diff: `easy` },
      { q: `Why are Car, Truck and Motorcycle not subclasses of Vehicle?`, a: `The only thing that differs between them is which spot size they need, and that is data, not behaviour. An enum VehicleType carrying its minimum spot size expresses it in one place and lets "does it fit?" be one comparison. Subclasses earn their place when the types behave differently, for example if an electric vehicle needed charging logic.`, diff: `easy` },
      { q: `Two cars reach different gates at the same instant and both see spot F2-M1 as free. What stops both from getting it?`, a: `Seeing a spot as free is only a hint. Taking it is tryOccupy(), a single compareAndSet(false, true) on the spot's AtomicBoolean, which returns true to exactly one caller. The loser gets false and moves to the next candidate in its list. Checking isFree() and then marking the spot in a separate call would leave a gap where both gates pass the check.`, diff: `medium` },
      { q: `Why not just make park() synchronized?`, a: `It would be correct, but it serializes every gate, including the scan over all spots, so the whole lot runs at the speed of one gate. With a per-spot atomic claim, gates only contend when they want the very same spot, and the lot needs no lock at all. Mention the simpler version as a valid first step, then explain why you'd move away from it.`, diff: `medium` },
      { q: `Nearest-fit never refuses a vehicle while a fitting spot is free. Why prefer best fit?`, a: `Because a refusal can happen later. If a car takes the only large spot because it happened to be nearest, the next truck has nowhere to go even though the car had plenty of medium spots. Best fit tries the smallest fitting size first, so large spots stay free for large vehicles, and smaller vehicles still overflow into them when their own size is full.`, diff: `medium` },
      { q: `The same ticket is scanned at two exits at the same moment. What happens?`, a: `Both call activeTickets.remove(id) on a ConcurrentHashMap. Remove is atomic, so one call gets the ticket and the other gets null. The first prices the stay and frees the spot; the second returns empty without touching any spot. Without that, the spot could be freed twice, and the second free might release a spot a new car has just taken.`, diff: `medium` },
      { q: `unpark removes the ticket, then the pricing strategy throws. What state is the lot in, and how do you prevent it?`, a: `The ticket is gone, but the spot is still marked taken and the plate is still inside, so the spot leaks until someone fixes it by hand. Prevent it by making pricing unable to fail on valid tickets: validate every rate when the strategy is built, use integer arithmetic, and clamp negative durations. If pricing can fail for other reasons (a remote tariff service), compute the fee before removing the ticket, or release the spot in a finally block and record the unpaid fee separately.`, diff: `hard` }
    ],
    cheatsheet: [
      PATTERN_TABLE,
      { title: `Parking lot in one screen`, type: `code`, lang: `java`, body: `enum SpotSize { SMALL, MEDIUM, LARGE }
enum VehicleType { MOTORCYCLE(SMALL), CAR(MEDIUM), TRUCK(LARGE); final SpotSize needs; }
record Vehicle(String plate, VehicleType type) {}
record Ticket(String id, Vehicle vehicle, ParkingSpot spot, Instant entry) {}

final class ParkingSpot {
    AtomicBoolean occupied;
    boolean fits(VehicleType t);       // size >= t.needs
    boolean tryOccupy();               // occupied.compareAndSet(false, true): one winner
    void release();
}

final class ParkingLot {
    Map<String, Ticket> activeTickets; // ConcurrentHashMap: remove() makes tickets single-use
    Set<String> platesInside;          // concurrent set: add() allows one entry per plate
    Optional<Ticket> park(Vehicle v);  // first candidate whose tryOccupy() wins
    OptionalLong unpark(String id);    // remove, price, release
}
// BestFit: smallest fitting size first, nearest first within it
// HourlyPricing: max(1, ceil(seconds / 3600)) x rate for the vehicle type, in cents` },
      { title: `Follow-ups and where they land`, type: `table`, headers: [`Follow-up`, `Change`], rows: [
        [`Weekend rate, daily cap`, `New PricingStrategy classes; a cap wraps another rule (Deep Dives)`],
        [`Thousands of spots`, `A free-spot index per size; the strategy claims and releases (Deep Dives)`],
        [`Free counts on display boards`, `Atomic counters per floor and size, updated by the lot (Deep Dives)`],
        [`Lost ticket`, `Find the ticket by plate, add a penalty (Deep Dives)`],
        [`Several servers, a database`, `A conditional UPDATE is the atomic claim (Deep Dives)`],
        [`Reserved or EV spots`, `A spot attribute that allocation filters on (Deep Dives)`]
      ] }
    ],
    labs: []
  });
})();
