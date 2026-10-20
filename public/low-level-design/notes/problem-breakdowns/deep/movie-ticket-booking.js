// Deep dives: Movie Ticket Booking (LLD). Format: DeepDive in public/shared/notes.d.ts.
window.DEEP = window.DEEP || {};
DEEP["movie-ticket-booking"] = {
  hook: `<p>The core booking is atomic per showtime. The follow-ups are what real ticketing needs: holding seats while someone pays, finer locking when one show is very busy, schedules that change at runtime, and the same guarantees with a database behind several servers.</p>`,
  sections: [
    {
      id: "seat-holds",
      title: "Holding seats during checkout",
      kicker: "Follow-up: time-limited claims",
      blocks: [
        { type: "problem", html: `<p>Payment takes minutes. If seats are only marked when payment succeeds, two people can pick the same seats and one of them fails at the very end. If they are marked as soon as they are picked, abandoned checkouts lock seats forever.</p>` },
        { type: "idea", html: `<p>Give each seat three states: <strong>free</strong>, <strong>held</strong> (with a hold id and an expiry) and <strong>booked</strong>. A hold is claimed atomically like a booking; confirming turns it into a booking if it hasn't expired; expired holds become free again.</p>` },
        { type: "code", lang: "java", title: "Holds inside the showtime", code: `record Hold(String id, Set<Seat> seats, Instant expiresAt) {}

// Showtime: seat -> owner (hold id or reservation id); holds by id
private final Map<Seat, String> owner = new HashMap<>();
private final Map<String, Hold> holds = new HashMap<>();

synchronized Hold hold(Set<Seat> seats, Duration ttl, Clock clock) {
    expireHolds(clock.instant());
    for (Seat s : seats) if (owner.containsKey(s)) throw new SeatUnavailableException(s);
    Hold h = new Hold(UUID.randomUUID().toString(), Set.copyOf(seats), clock.instant().plus(ttl));
    for (Seat s : seats) owner.put(s, h.id());
    holds.put(h.id(), h);
    return h;
}

synchronized String confirm(String holdId, Clock clock) {
    expireHolds(clock.instant());
    Hold h = holds.remove(holdId);
    if (h == null) throw new IllegalStateException("Hold expired or unknown");
    String reservationId = UUID.randomUUID().toString();
    for (Seat s : h.seats()) owner.put(s, reservationId);       // held -> booked
    return reservationId;
}

private void expireHolds(Instant now) {                          // lazy expiry on every access
    holds.values().removeIf(h -> {
        if (now.isBefore(h.expiresAt())) return false;
        for (Seat s : h.seats()) owner.remove(s, h.id());       // only if still held by this hold
        return true;
    });
}` },
        { type: "keypoints", items: [
          "Lazy expiry on every access is enough for correctness; a scheduled sweep only frees memory sooner and makes seat maps look accurate.",
          "<code>owner.remove(seat, holdId)</code> is conditional, so expiring a hold can never free a seat that has since been confirmed or re-held.",
          "The client gets the hold's expiry so the UI can show a countdown."
        ] }
      ]
    },
    {
      id: "locking-granularity",
      title: "Finer locking for a very busy show",
      kicker: "Follow-up: contention",
      blocks: [
        { type: "text", html: `<p>One lock per showtime serialises everyone booking the same show. For a premiere with thousands of buyers per second, two alternatives allow more parallelism.</p>` },
        { type: "code", lang: "java", title: "Per-seat locks in a fixed order", code: `boolean claim(List<Seat> seats, String reservationId) {
    List<Seat> ordered = seats.stream().sorted(Comparator.comparing(Seat::row).thenComparing(Seat::number)).toList();
    List<ReentrantLock> held = new ArrayList<>();
    try {
        for (Seat s : ordered) { ReentrantLock l = lockFor(s); l.lock(); held.add(l); }   // global order: no deadlock
        if (ordered.stream().anyMatch(this::isTaken)) return false;                       // all or nothing
        ordered.forEach(s -> markTaken(s, reservationId));
        return true;
    } finally {
        for (int i = held.size() - 1; i >= 0; i--) held.get(i).unlock();
    }
}` },
        { type: "tradeoffs", prosLabel: "Per-seat locks", consLabel: "Costs", pros: ["Bookings for different seats of one show run in parallel", "Still all or nothing"], cons: ["More locks and code", "Deadlock if the order isn't global", "Rarely needed: a show's critical section is microseconds long"] }
      ]
    },
    {
      id: "dynamic-schedules",
      title: "Adding and removing shows at runtime",
      kicker: "Follow-up: mutability",
      blocks: [
        { type: "list", items: [
          "Keep the indexes in <code>ConcurrentHashMap</code>s (movie to showtimes, theatre to showtimes), or rebuild immutable snapshots and swap a <code>volatile</code> reference.",
          "Removing a show with sold tickets is a business decision: refuse, or mark it CANCELLED under its lock (blocking new bookings) and refund and notify every reservation.",
          "Adding a movie updates the search structures; with an inverted index, index the new title's words."
        ] }
      ]
    },
    {
      id: "database",
      title: "With a database and several servers",
      kicker: "Follow-up: beyond memory",
      blocks: [
        { type: "text", html: `<p>In-memory locks only protect one process. With several servers, the database is where exactly-one-wins must be enforced.</p>` },
        { type: "table", headers: ["Technique", "How"], rows: [
          ["Unique constraint", "A <code>booked_seats(showtime_id, seat)</code> table with a unique key; insert all seats in one transaction; a duplicate fails the whole transaction"],
          ["Conditional update", "<code>UPDATE seats SET status='BOOKED', res=? WHERE showtime=? AND seat IN (...) AND status='FREE'</code>, then check the row count equals the number of seats"],
          ["Holds", "Store hold expiry in the row; treat expired holds as free in the condition"]
        ] },
        { type: "quiz", q: "User A books {C5, C6}; at the same moment user B books {C6, C7}. With all-or-nothing booking under the showtime lock, what can happen?", options: ["Both succeed, sharing C6", "A gets C5 and C6, B gets C7 only", "One gets all their seats; the other gets none and C7 (or C5) stays free", "Both fail"], answer: 2, explain: `<p>Whoever enters the critical section first claims all their seats. The other finds C6 taken and claims nothing, so their other seat stays free. Partial bookings are impossible by design.</p>` }
      ]
    }
  ],
  takeaways: [
    "Seat holds: free, held (with expiry), booked; confirm turns a valid hold into a booking; expire conditionally.",
    "A lock per showtime is usually enough; per-seat locks need a global order and buy little.",
    "Runtime schedule changes need concurrent indexes and a policy for shows with sold tickets.",
    "Across servers, enforce exactly-one-wins in the database with a unique key or conditional update."
  ]
};
