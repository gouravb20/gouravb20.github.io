// Deep dives: Parking Lot (LLD practice set). Format: DeepDive in public/shared/notes.d.ts.
window.DEEP = window.DEEP || {};
DEEP["parking-lot"] = {
  hook: `<p>Once park and unpark work safely, interviewers add twists to see whether the seams were in the right places: the two strategies, the atomic claim on the spot, and the single-use ticket map. You rarely implement a follow-up in full; you show which class changes and why the rest doesn't. Junior candidates may get none of these, mid-level one or two, senior candidates several, in more depth.</p>`,
  sections: [
    {
      id: "pricing-rules",
      title: "\"How would you add a weekend flat rate, or a daily cap?\"",
      kicker: "Follow-up: pricing",
      blocks: [
        { type: "text", html: `<p>This is the follow-up the <code>PricingStrategy</code> interface was built for. A flat rate is a new class. A daily cap is not a new rate but a limit on <em>any</em> rate, so it wraps another strategy rather than copying its arithmetic. Choosing a rule by the day of entry is one more wrapper. <code>ParkingLot</code>, the spots and the tickets don't change.</p>` },
        { type: "code", lang: "java", title: "Pricing rules as new strategies", code: `/** A fixed fee per visit, whatever the duration. */
final class FlatRatePricing implements PricingStrategy {
    private final long cents;
    FlatRatePricing(long cents) { this.cents = cents; }
    public long feeCents(Ticket t, Instant exit) { return cents; }
}

/** Wraps any rule and caps the charge at a maximum per started 24 hours (a Decorator). */
final class DailyCap implements PricingStrategy {
    private final PricingStrategy inner;
    private final long capPerDayCents;
    DailyCap(PricingStrategy inner, long capPerDayCents) { this.inner = inner; this.capPerDayCents = capPerDayCents; }

    public long feeCents(Ticket t, Instant exit) {
        long seconds = Math.max(0, Duration.between(t.entry(), exit).toSeconds());
        long days = Math.max(1, (seconds + 86_399) / 86_400);
        return Math.min(inner.feeCents(t, exit), days * capPerDayCents);
    }
}

/** Picks a rule by the local day the vehicle entered: one rule at weekends, another on weekdays. */
final class ByEntryDay implements PricingStrategy {
    private final PricingStrategy weekday, weekend;
    private final ZoneId zone;
    ByEntryDay(PricingStrategy weekday, PricingStrategy weekend, ZoneId zone) {
        this.weekday = weekday; this.weekend = weekend; this.zone = zone;
    }

    public long feeCents(Ticket t, Instant exit) {
        DayOfWeek d = t.entry().atZone(zone).getDayOfWeek();
        boolean isWeekend = d == DayOfWeek.SATURDAY || d == DayOfWeek.SUNDAY;
        return (isWeekend ? weekend : weekday).feeCents(t, exit);
    }
}

// Wiring, once at startup:
// new ParkingLot(floors, new BestFit(),
//     new ByEntryDay(new DailyCap(hourly, 2_000), new FlatRatePricing(800), ZoneId.of("Europe/London")), clock);` },
        { type: "keypoints", items: [
          "Every rule has only final fields, so one instance is shared by all gates without locking.",
          "The wrappers compose: a cap around an hourly rate, chosen by entry day. No rule knows about the others.",
          "Say which time decides: here the entry day picks the rule. A stay from Friday night to Monday could instead be split per day; that is a business question to ask, not a coding one."
        ] },
        { type: "callout", tone: "interview", html: `<p>Point at what didn't change: "The lot only knows the interface; it still calls <code>feeCents</code> once per exit." That sentence is the reason the Strategy pattern is in the design.</p>` }
      ]
    },
    {
      id: "free-index",
      title: "\"What if the lot has thousands of spots and park() is slow?\"",
      kicker: "Follow-up: performance",
      blocks: [
        { type: "problem", html: `<p>Every <code>park</code> scans every spot to build its candidate list: O(n). Worse, under load all gates compute nearly the same list and fight over the same first few spots, so most compare-and-sets fail and are retried on the next candidate.</p>` },
        { type: "text", html: `<p>Keep the free spots in an index instead: one concurrent sorted set per size, ordered nearest first. <code>pollFirst()</code> removes and returns the best spot in one atomic step, so the choice <em>is</em> the claim, and two gates can never get the same spot. Best fit becomes "poll the smallest size that fits; if empty, the next size up".</p>` },
        { type: "code", lang: "java", title: "Free-spot index per size", code: `/** Best fit with an index of free spots. pollFirst() picks and claims in one atomic step. */
final class IndexedBestFit {
    private final Map<SpotSize, ConcurrentSkipListSet<ParkingSpot>> free = new EnumMap<>(SpotSize.class);  // filled here, then only read

    IndexedBestFit(List<ParkingFloor> floors) {
        Map<ParkingSpot, Integer> rank = new HashMap<>();                // position in nearest-first order
        for (ParkingFloor f : floors) for (ParkingSpot s : f.spots()) rank.put(s, rank.size());
        Map<ParkingSpot, Integer> fixed = Map.copyOf(rank);             // immutable, read by the comparators
        for (SpotSize size : SpotSize.values())
            free.put(size, new ConcurrentSkipListSet<>(Comparator.comparingInt(fixed::get)));
        for (ParkingSpot s : fixed.keySet()) free.get(s.size()).add(s);
    }

    Optional<ParkingSpot> claim(VehicleType type) {
        for (SpotSize size : SpotSize.values()) {
            if (size.compareTo(type.needs) < 0) continue;
            ParkingSpot s = free.get(size).pollFirst();                  // atomic: no two callers get the same spot
            if (s != null) return Optional.of(s);
        }
        return Optional.empty();
    }

    void release(ParkingSpot s) { free.get(s.size()).add(s); }
}` },
        { type: "table", headers: ["Class", "Change"], rows: [
          ["SpotAllocationStrategy", "Becomes stateful: <code>claim(type)</code> and <code>release(spot)</code> replace <code>candidates</code>"],
          ["ParkingLot", "<code>park</code> calls <code>allocation.claim</code> instead of looping; <code>unpark</code> calls <code>allocation.release</code> after freeing the spot"],
          ["ParkingSpot", "Unchanged. <code>tryOccupy()</code> can stay as a cheap second guard: it must always succeed after a claim"],
          ["Pricing, tickets, floors", "Unchanged"]
        ] },
        { type: "keypoints", items: [
          "Claim and release are O(log n) instead of O(n), and gates no longer retry each other's spots.",
          "Release adds the spot back only after its flag is cleared, so a spot is never in the index while still occupied.",
          "This is the one follow-up that changes an interface; say so, and say why the change stays inside the allocation seam."
        ] }
      ]
    },
    {
      id: "display-boards",
      title: "\"How would you show free spots per floor on a board at the entrance?\"",
      kicker: "Follow-up: availability",
      blocks: [
        { type: "text", html: `<p>Counting free spots by scanning every spot on every refresh works, but boards refresh often. Keep a counter per floor and size instead, and have the lot adjust it whenever a claim succeeds or a spot is released. Boards just read the counters. If boards must be pushed rather than polled, that is the moment to add listeners (Observer); a polled board needs none.</p>` },
        { type: "code", lang: "java", title: "Free counts per floor", code: `/** Live free counts per floor and size. Counters are atomic, so gates update them without a lock. */
final class Availability {
    private final Map<ParkingSpot, AtomicInteger> counterOf;            // each spot -> its floor-and-size counter
    private final Map<Integer, Map<SpotSize, AtomicInteger>> byFloor;   // floor -> size -> counter, for the boards

    Availability(List<ParkingFloor> floors) {
        Map<ParkingSpot, AtomicInteger> c = new HashMap<>();
        Map<Integer, Map<SpotSize, AtomicInteger>> b = new HashMap<>();
        for (ParkingFloor f : floors) {
            Map<SpotSize, AtomicInteger> bySize = new EnumMap<>(SpotSize.class);
            for (SpotSize size : SpotSize.values()) bySize.put(size, new AtomicInteger());
            for (ParkingSpot s : f.spots()) {
                bySize.get(s.size()).incrementAndGet();                 // every spot starts free
                c.put(s, bySize.get(s.size()));
            }
            b.put(f.number(), Collections.unmodifiableMap(bySize));
        }
        counterOf = Map.copyOf(c);                                      // the maps never change; only the counters do
        byFloor = Map.copyOf(b);
    }

    void taken(ParkingSpot s)          { counterOf.get(s).decrementAndGet(); }
    void released(ParkingSpot s)       { counterOf.get(s).incrementAndGet(); }
    int free(int floor, SpotSize size) { return byFloor.get(floor).get(size).get(); }
}

// ParkingLot: after spot.tryOccupy() succeeds, availability.taken(spot);
//             after t.spot().release(),       availability.released(t.spot());` },
        { type: "keypoints", items: [
          "Only <code>ParkingLot</code> changes, by two calls; spots, strategies and pricing don't know boards exist.",
          "Mapping each spot to its counter at startup means the spot doesn't need to know its floor.",
          "A count read between a claim and its counter update can be one off for an instant. A board can live with that; allocation never reads these counters, so safety is unaffected."
        ] }
      ]
    },
    {
      id: "lost-ticket",
      title: "\"What if a driver loses the ticket?\"",
      kicker: "Follow-up: operations",
      blocks: [
        { type: "text", html: `<p>The lot can only find a stay by ticket id. To handle a lost ticket it must also find it by plate, then charge the normal fee plus a penalty. The set of plates inside already exists for "one entry per plate"; turn it into a map from plate to ticket id and both jobs use the same structure.</p>` },
        { type: "code", lang: "java", title: "Lost tickets: find the ticket by plate", code: `private static final String PENDING = "";                                  // plate reserved, ticket not issued yet
private final Map<String, String> ticketByPlate = new ConcurrentHashMap<>(); // replaces platesInside

Optional<Ticket> park(Vehicle v) {
    if (ticketByPlate.putIfAbsent(v.plate(), PENDING) != null) return Optional.empty();   // already inside
    for (ParkingSpot spot : allocation.candidates(floors, v.type())) {
        if (spot.tryOccupy()) {
            Ticket t = new Ticket(UUID.randomUUID().toString(), v, spot, clock.instant());
            activeTickets.put(t.id(), t);
            ticketByPlate.put(v.plate(), t.id());
            return Optional.of(t);
        }
    }
    ticketByPlate.remove(v.plate(), PENDING);
    return Optional.empty();
}

// In unpark, replace platesInside.remove(...) with: ticketByPlate.remove(t.vehicle().plate(), t.id());

/** The ticket is lost: find it by plate and charge the normal fee plus a fixed penalty. */
OptionalLong unparkLost(String plate, long penaltyCents) {
    String id = ticketByPlate.get(plate);
    if (id == null || id.equals(PENDING)) return OptionalLong.empty();
    OptionalLong fee = unpark(id);                                           // the same single-use removal
    return fee.isPresent() ? OptionalLong.of(fee.getAsLong() + penaltyCents) : fee;
}` },
        { type: "keypoints", items: [
          "Redemption still goes through <code>unpark</code>, so a lost-ticket exit and a normal exit racing for the same stay still free the spot once.",
          "The two-argument <code>remove(plate, id)</code> only deletes the mapping if it still points at this ticket, so a late exit can't erase a newer stay.",
          "In a real lot, the attendant checks the vehicle's documents before calling <code>unparkLost</code>; anyone who can read a plate should not be able to drive someone else's car out."
        ] }
      ]
    },
    {
      id: "database",
      title: "\"What changes with several servers and a shared database?\"",
      kicker: "Follow-up: persistence",
      blocks: [
        { type: "text", html: `<p>An <code>AtomicBoolean</code> only protects one process. With several servers behind the gates, the source of truth moves to a database, and each in-memory atomic step needs a database equivalent. The shape of the design survives: strategies suggest spots, one atomic statement decides, and a ticket is redeemed by an atomic delete or update.</p>` },
        { type: "code", lang: "text", title: "The atomic claim in SQL", code: `-- tryOccupy(): succeeds only if the row was still free; 1 row updated means we won
UPDATE spots SET occupied = true, ticket_id = :ticket WHERE id = :spot AND occupied = false;

-- unpark(): only the first exit flips the ticket; 0 rows updated means unknown or already used
UPDATE tickets SET exited_at = :now WHERE id = :ticket AND exited_at IS NULL;

-- one entry per plate: a unique index does what platesInside.add() did
CREATE UNIQUE INDEX one_stay_per_plate ON tickets (plate) WHERE exited_at IS NULL;` },
        { type: "table", headers: ["In memory", "In the database"], rows: [
          ["<code>tryOccupy()</code> compare-and-set", "Conditional <code>UPDATE ... WHERE occupied = false</code>, checking the row count"],
          ["<code>activeTickets.remove(id)</code>", "Conditional <code>UPDATE ... WHERE exited_at IS NULL</code> on the ticket row"],
          ["<code>platesInside.add(plate)</code>", "A partial unique index on open tickets by plate"],
          ["Issuing the ticket after the claim", "Claim the spot and insert the ticket in one transaction, so a crash can't leave a spot taken with no ticket"]
        ] },
        { type: "quiz", q: "Two cars reach different gates at the same instant and both see spot F2-M1 in their candidate list. What guarantees only one gets it?", options: [
          "The candidate list is sorted nearest first",
          "tryOccupy() does the check and the write as one compare-and-set, so exactly one call returns true",
          "Tickets are stored in a ConcurrentHashMap",
          "Each gate takes a lock on the ParkingLot"
        ], answer: 1, explain: `<p>Seeing a spot as free is a hint, not ownership. <code>tryOccupy()</code> flips the spot's flag only if it is still false, atomically, so the first caller gets <code>true</code> and the other moves on to its next candidate. The lot holds no lock at all; in a database, the conditional <code>UPDATE</code> plays the same role.</p>` }
      ]
    },
    {
      id: "special-spots",
      title: "\"What about reserved spots, EV chargers or payments?\"",
      kicker: "Follow-up: real-world rules",
      blocks: [
        { type: "table", headers: ["Requirement", "Design change"], rows: [
          ["Reserved or disabled-badge spots", "A spot attribute; allocation strategies skip them unless the vehicle has the matching permit"],
          ["EV charging spots", "A spot attribute plus a vehicle flag; allocation prefers chargers for EVs, and a pricing wrapper adds the energy cost"],
          ["Payment methods", "Out of the lot: <code>unpark</code> returns the fee, and a separate checkout step charges it through a <code>PaymentMethod</code> interface"],
          ["Several entry and exit gates", "Nothing new: the atomic claim and single-use tickets already make gates independent"],
          ["Adding a floor at run time", "Swap in a new immutable floor list through a volatile field (copy on write); in-flight parks finish on the old list safely"]
        ] },
        { type: "callout", tone: "tip", html: `<p>Each row touches a spot attribute, a strategy or something outside the lot. None of them changes how a spot is claimed or how a ticket is redeemed, which is the sign the core seams are right.</p>` }
      ]
    }
  ],
  takeaways: [
    "New pricing rules are new PricingStrategy classes; caps and day-based rules wrap other rules instead of copying them.",
    "For thousands of spots, a concurrent sorted set of free spots per size makes pollFirst() both the choice and the atomic claim.",
    "Display boards read atomic counters the lot updates; add Observer only when boards must be pushed.",
    "Lost tickets need a lookup by plate; reuse the one-entry-per-plate structure and redeem through the same single-use unpark.",
    "With several servers, a conditional UPDATE is the atomic claim and a partial unique index enforces one stay per plate.",
    "Reserved spots, EV chargers and payments touch attributes, strategies or code outside the lot, never the claim itself."
  ]
};
