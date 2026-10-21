// Deep dives: Meeting Room Scheduler (LLD practice set). Format: DeepDive in public/shared/notes.d.ts.
window.DEEP = window.DEEP || {};
DEEP["meeting-scheduler"] = {
  hook: `<p>Once booking, cancelling and rescheduling work, interviewers add twists to see whether the design bends without breaking. You rarely implement them in full; you show which class changes and why the rest doesn't. The good news for this problem: almost every follow-up leaves <code>RoomSchedule</code> and its neighbour check alone, and lands in the scheduler, a new value type, or a new class beside it.</p>`,
  sections: [
    {
      id: "recurring-meetings",
      title: "\"How would you book a weekly meeting?\"",
      kicker: "Follow-up: a series of bookings",
      blocks: [
        { type: "text", html: `<p>A weekly stand-up for ten weeks is ten bookings that should succeed or fail together. Expand the rule into concrete intervals first, outside any lock. Then, under the room's lock, check every occurrence and insert only if all are free. Because nothing is written until every check has passed, there is nothing to roll back.</p>` },
        { type: "table", headers: ["Class", "Change"], rows: [
          ["<code>Recurrence</code>", "New value type: first start in a time zone, length, period, count; expands to intervals"],
          ["<code>MeetingScheduler</code>", "New <code>bookRecurring</code>; the three insert lines of <code>tryBook</code> become a private <code>insert(s, b)</code> both use"],
          ["<code>RoomSchedule</code>, <code>Interval</code>", "Unchanged"]
        ] },
        { type: "code", lang: "java", title: "Booking every occurrence or none", code: `record Recurrence(ZonedDateTime firstStart, Duration length, Period every, int count) {
    /** Wall-clock repetition: a 10:00 weekly meeting stays at 10:00 across daylight-saving changes. */
    List<Interval> occurrences() {
        List<Interval> out = new ArrayList<>(count);
        for (int i = 0; i < count; i++) {
            Instant start = firstStart.plus(every.multipliedBy(i)).toInstant();
            Interval next = new Interval(start, start.plus(length));
            if (!out.isEmpty() && out.get(out.size() - 1).overlaps(next))
                throw new IllegalArgumentException("Occurrences overlap each other");
            out.add(next);
        }
        return out;
    }
}

// In MeetingScheduler: every occurrence in one room, checked and inserted under that room's lock.
List<Booking> bookRecurring(String roomId, MeetingRequest template, Recurrence rule) {
    RoomSchedule s = schedule(roomId);
    List<Interval> slots = rule.occurrences();                     // computed before taking the lock
    List<Booking> made = new ArrayList<>(slots.size());
    s.lock.lock();
    try {
        for (Interval when : slots)
            if (!s.isFree(when)) throw new RoomUnavailableException(roomId, when);   // nothing written yet
        String series = UUID.randomUUID().toString();
        for (int i = 0; i < slots.size(); i++) {
            Booking b = new Booking(series + "/" + i, roomId, template.at(slots.get(i)));
            insert(s, b);                                          // room, id map and person index
            made.add(b);
        }
    } finally { s.lock.unlock(); }
    made.forEach(b -> publish(new MeetingEvent(ChangeType.BOOKED, b, null)));
    return made;
}` },
        { type: "keypoints", items: [
          "<strong>Check the occurrences against each other too.</strong> <code>isFree</code> only sees stored bookings, so a daily rule with a 25-hour length would otherwise overlap itself.",
          "<strong>Series ids</strong> (<code>series/0</code>, <code>series/1</code>...) let you cancel one occurrence, or this one and all following, by prefix.",
          "<strong>Unbounded series</strong> (every Monday, forever) are stored as a rule and materialised a few months ahead by a background job, which books the next window all or nothing and reports clashes.",
          "<strong>Partial booking</strong> (book the free weeks, list the clashes) is a product choice; ask before assuming all or nothing."
        ] }
      ]
    },
    {
      id: "attendee-conflicts",
      title: "\"What if every attendee must be free too?\"",
      kicker: "Follow-up: people as a second constraint",
      blocks: [
        { type: "text", html: `<p>The core design only <em>reports</em> clashes: <code>calendarOf</code> shows Alice two meetings at 10:00. Turning that into a hard rule is not just one more <code>if</code>. A person's meetings live in many rooms, so two bookings for Alice in R1 and R2 hold different room locks and can both pass a person check at the same moment. People need locks of their own.</p>` },
        { type: "compare", items: [
          { title: "Report clashes (the core design)", tone: "info", html: `<p>Book the room; return or display <code>conflictsFor(request)</code>. No extra locking, and it matches real calendars, where people double-book themselves on purpose and decline later.</p>` },
          { title: "Block, with a lock per person", tone: "ok", html: `<p>After the room lock, take each attendee's lock in name order, check the room and every attendee, then insert. Correct under concurrency; costs a lock per person and a longer critical section.</p>` }
        ] },
        { type: "table", headers: ["Class", "Change"], rows: [
          ["<code>MeetingScheduler</code>", "A person-lock map, a policy flag, <code>conflictsFor</code>; <code>tryBook</code> and <code>reschedule</code> take person locks after room locks"],
          ["<code>RoomSchedule</code>", "Unchanged: it still knows only its room"]
        ] },
        { type: "code", lang: "java", title: "Attendees must be free: person locks after the room lock", code: `// In MeetingScheduler. Global lock order: room locks (by room id) first, then person locks (by name).
private final ConcurrentHashMap<String, ReentrantLock> personLocks = new ConcurrentHashMap<>();
private final boolean attendeesMustBeFree;                         // the product decision, fixed at construction

private List<ReentrantLock> lockPeople(Set<String> people) {
    List<ReentrantLock> held = new ArrayList<>();
    for (String p : new TreeSet<>(people)) {                       // sorted: the same order everywhere
        ReentrantLock l = personLocks.computeIfAbsent(p, k -> new ReentrantLock());
        l.lock();
        held.add(l);
    }
    return held;
}

/** Every attendee's meetings that overlap the request; a reschedule passes its own id to skip itself. */
List<Booking> conflictsFor(MeetingRequest req, String ignoreId) {
    return req.people().stream()
        .flatMap(p -> calendarOf(p, req.when()).stream())
        .filter(b -> !b.id().equals(ignoreId))
        .distinct()
        .toList();
}

private Optional<Booking> tryBook(RoomSchedule s, MeetingRequest req) {
    Booking b;
    s.lock.lock();                                                 // rooms first ...
    List<ReentrantLock> people = attendeesMustBeFree ? lockPeople(req.people()) : List.of();   // ... then people
    try {
        if (!s.isFree(req.when())) return Optional.empty();
        if (attendeesMustBeFree) {
            List<Booking> clashes = conflictsFor(req, null);
            if (!clashes.isEmpty()) throw new AttendeeBusyException(clashes);   // another room won't help
        }
        b = new Booking(UUID.randomUUID().toString(), s.room.id(), req);
        insert(s, b);
    } finally {
        for (int i = people.size() - 1; i >= 0; i--) people.get(i).unlock();
        s.lock.unlock();
    }
    publish(new MeetingEvent(ChangeType.BOOKED, b, null));
    return Optional.of(b);
}

class AttendeeBusyException extends RuntimeException {
    AttendeeBusyException(List<Booking> clashes) { super(clashes.size() + " attendee clash(es)"); }
}` },
        { type: "keypoints", items: [
          "<strong>Why it is safe:</strong> under this policy a booking is added to a person's calendar only while holding that person's lock, so while we hold it, nobody can slip an overlapping meeting into their day.",
          "<strong>No deadlock:</strong> every thread takes rooms (by id) before people (by name). Cancel takes no person locks, because freeing time can't create a clash.",
          "<strong>Throw, don't try the next room:</strong> in <code>bookAny</code>, a busy attendee is busy in every room.",
          "<strong>The lock map grows</strong> with every person ever seen. A fixed array of, say, 256 locks chosen by the name's hash (lock striping) bounds memory; lock the stripes in index order, once each."
        ] }
      ]
    },
    {
      id: "reschedule-lock-order",
      title: "\"Two people move meetings between the same two rooms at once. What happens?\"",
      kicker: "Follow-up: atomic moves without deadlock",
      blocks: [
        { type: "text", html: `<p>The solution already locks both rooms in room-id order; this follow-up asks you to prove why that matters. Start from the version most candidates write first, which takes the locks in the order the request names them.</p>` },
        { type: "code", lang: "java", title: "The deadlock-prone version", code: `// DON'T: locks "from" then "to" in request order.
// Thread 1 moves a meeting R1 -> R2 while thread 2 moves another R2 -> R1:
// each holds its first lock and waits forever for the other's.
Booking reschedule(String bookingId, String roomId, Interval when) {
    Booking old = find(bookingId);
    RoomSchedule from = schedule(old.roomId()), to = schedule(roomId);
    from.lock.lock();
    try {
        to.lock.lock();
        try {
            // remove, check, add or restore
            return old.movedTo(roomId, when);
        } finally { to.lock.unlock(); }
    } finally { from.lock.unlock(); }
}` },
        { type: "steps", title: "How a fixed order breaks the cycle", items: [
          "Deadlock needs a cycle: A holds R1 and wants R2 while B holds R2 and wants R1.",
          "With ordering by room id, A and B both lock R1 first, whichever way they move.",
          "Whoever gets R1 then gets R2 (nobody holds R2 without R1 in this pair); the other waits holding nothing.",
          "Unlock in reverse order. If both ends are the same room, lock it once: Go's mutex is not reentrant, and a double lock would hang there."
        ] },
        { type: "table", headers: ["Class", "Change"], rows: [
          ["<code>MeetingScheduler</code>", "Only <code>lockInOrder</code>; for a series spread over many rooms, sort all the rooms involved by id, drop duplicates, lock them all"],
          ["<code>RoomSchedule</code>", "Unchanged"]
        ] },
        { type: "tradeoffs", prosLabel: "Ordered locking", consLabel: "Alternatives", pros: ["No deadlock, no timeouts, no retries", "One rule to explain and to test"], cons: ["<code>tryLock</code> with a timeout and retry also avoids deadlock but can livelock and needs random back-off", "One global lock for moves only is simple but serialises every cross-room move"] },
        { type: "callout", tone: "warning", html: `<p>Ordering alone is not enough: look the booking up, lock, then <strong>re-check</strong> that the map still points at the same immutable booking. Between the lookup and the lock another thread may have moved it to a third room, and you would be holding the wrong locks.</p>` },
        { type: "quiz", q: "Thread A moves a meeting R2 -> R1 while thread B moves another R1 -> R2, both using lockInOrder (room-id order). What happens?", options: [
          "They deadlock, because they move in opposite directions",
          "Both lock R1 first; one proceeds with both locks, the other waits holding nothing",
          "Each locks its source room first, then the destination",
          "Both succeed at the same time, because they touch different meetings"
        ], answer: 1, explain: `<p>Room-id order means R1 before R2 for both threads, regardless of direction. Only one can hold R1, and it then takes R2 freely; the other blocks on R1 without holding anything, so no cycle can form.</p>` }
      ]
    },
    {
      id: "hotel-booking",
      title: "\"How does this change for hotel booking?\"",
      kicker: "Follow-up: counts instead of named rooms",
      blocks: [
        { type: "text", html: `<p>Hotel booking is the same problem with three twists. Time is <strong>dates</strong>: a stay is <code>[checkIn, checkOut)</code>, so checking out on the 12th and someone else checking in on the 12th don't clash, the half-open rule again. Guests book a <strong>room type</strong>, not room 304, so availability is a count: for every night of the stay, rooms of that type in use must be below the inventory. And payment takes minutes, so inventory is <strong>held</strong> with an expiry and then confirmed.</p>` },
        { type: "compare", items: [
          { title: "Weak: a status flag on each room", tone: "bad", html: `<p>Each room is AVAILABLE, OCCUPIED or IN_MAINTENANCE, and booking flips it to OCCUPIED. It ignores dates entirely: booking next week blocks the room tonight, and two stays in different weeks can't coexist. Find-then-flip is also a race unless both happen under one lock.</p>` },
          { title: "Good: a schedule per physical room", tone: "warn", html: `<p>Reuse <code>RoomSchedule</code> with <code>LocalDate</code> intervals and pick a free room of the type with a strategy. Correct, but it assigns room 304 months ahead, so a cancellation can leave fragmented gaps that a count-based view would fill.</p>` },
          { title: "Strong: counts per type per night, with holds", tone: "ok", html: `<p>Track rooms in use per type per night. A stay fits if every night is under the inventory; a hold reserves those nights until payment or expiry. Room numbers are assigned at check-in, when fragmentation no longer matters.</p>` }
        ] },
        { type: "table", headers: ["", "Meeting rooms", "Hotel"], rows: [
          ["Time unit", "Instants, <code>[start, end)</code>", "Nights, <code>[checkIn, checkOut)</code>"],
          ["What is booked", "A specific room", "One of N rooms of a type; the number is assigned at check-in"],
          ["Free means", "No overlapping booking in the room", "Count in use &lt; inventory on every night"],
          ["Lock unit", "One room", "One room type (here, the whole inventory)"],
          ["Checkout flow", "Instant", "Hold with expiry, then confirm after payment"],
          ["Classes", "<code>RoomSchedule</code>, <code>MeetingScheduler</code>", "A new <code>HotelInventory</code>; <code>Stay</code> replaces <code>Interval</code>"]
        ] },
        { type: "code", lang: "java", title: "Hotel inventory with holds", code: `enum RoomType { SINGLE, DOUBLE, SUITE }
enum ReservationStatus { HELD, CONFIRMED, CANCELLED, EXPIRED }
enum Amenity {
    BREAKFAST(2_500), SPA(4_000);                                   // cents per night
    final long centsPerNight;
    Amenity(long cents) { this.centsPerNight = cents; }
}

record Stay(LocalDate checkIn, LocalDate checkOut) {               // [checkIn, checkOut): the nights slept
    Stay { if (!checkIn.isBefore(checkOut)) throw new IllegalArgumentException("At least one night"); }
    List<LocalDate> nights() { return checkIn.datesUntil(checkOut).toList(); }
}

record Reservation(String id, String guestId, RoomType type, Stay stay, Instant holdExpiresAt, ReservationStatus status) {
    Reservation with(ReservationStatus s) { return new Reservation(id, guestId, type, stay, holdExpiresAt, s); }
}

final class HotelInventory {
    private final Map<RoomType, Integer> rooms;                    // how many of each type; fixed
    private final Map<RoomType, Long> nightlyCents;                // rates in minor units; fixed
    private final Clock clock;
    // Guarded by this.
    private final Map<RoomType, Map<LocalDate, Integer>> used = new EnumMap<>(RoomType.class);   // HELD + CONFIRMED
    private final Map<String, Reservation> reservations = new HashMap<>();
    private final Map<String, Reservation> holds = new HashMap<>(); // HELD only, for cheap expiry

    HotelInventory(Map<RoomType, Integer> rooms, Map<RoomType, Long> nightlyCents, Clock clock) {
        this.rooms = Map.copyOf(rooms);
        this.nightlyCents = Map.copyOf(nightlyCents);
        this.clock = clock;
    }

    /** Server-side price; never trust a total sent by the client. Immutable inputs, so no lock. */
    long quoteCents(RoomType type, Stay stay, Set<Amenity> extras) {
        long perNight = nightlyCents.get(type) + extras.stream().mapToLong(a -> a.centsPerNight).sum();
        return Math.multiplyExact(perNight, (long) stay.nights().size());
    }

    synchronized Reservation hold(String guestId, RoomType type, Stay stay, Duration ttl) {
        expireHolds();
        Map<LocalDate, Integer> perNight = used.computeIfAbsent(type, t -> new HashMap<>());
        int capacity = rooms.getOrDefault(type, 0);
        for (LocalDate night : stay.nights())
            if (perNight.getOrDefault(night, 0) >= capacity) throw new SoldOutException(type, night);
        for (LocalDate night : stay.nights()) perNight.merge(night, 1, Integer::sum);   // every night, or none
        Reservation r = new Reservation(UUID.randomUUID().toString(), guestId, type, stay,
                                        clock.instant().plus(ttl), ReservationStatus.HELD);
        reservations.put(r.id(), r);
        holds.put(r.id(), r);
        return r;
    }

    /** Payment succeeded. Idempotent: a retried confirmation returns the same reservation. */
    synchronized Reservation confirm(String id) {
        expireHolds();
        Reservation r = reservations.get(id);
        if (r != null && r.status() == ReservationStatus.CONFIRMED) return r;
        if (r == null || r.status() != ReservationStatus.HELD) throw new IllegalStateException("Hold expired or unknown");
        holds.remove(id);
        Reservation done = r.with(ReservationStatus.CONFIRMED);
        reservations.put(id, done);
        return done;
    }

    synchronized void cancel(String id) {
        Reservation r = reservations.get(id);
        if (r == null || (r.status() != ReservationStatus.HELD && r.status() != ReservationStatus.CONFIRMED)) return;
        holds.remove(id);
        giveBack(r);
        reservations.put(id, r.with(ReservationStatus.CANCELLED));
    }

    private void expireHolds() {                                   // lazy: on every call; caller holds this
        Instant now = clock.instant();
        holds.values().removeIf(r -> {
            if (now.isBefore(r.holdExpiresAt())) return false;
            giveBack(r);
            reservations.put(r.id(), r.with(ReservationStatus.EXPIRED));
            return true;
        });
    }

    private void giveBack(Reservation r) {
        Map<LocalDate, Integer> perNight = used.get(r.type());
        for (LocalDate night : r.stay().nights()) perNight.merge(night, -1, Integer::sum);
    }
}

class SoldOutException extends RuntimeException {
    SoldOutException(RoomType t, LocalDate night) { super(t + " is sold out on " + night); }
}` },
        { type: "keypoints", items: [
          "<strong>Thread safety:</strong> every mutable map is read and written only inside <code>synchronized</code> methods, so hold, confirm, cancel and expiry are each atomic, and the check over all nights and the increments happen in one step. A stay touches one room type, so a lock per type is the next step if one monitor becomes a bottleneck.",
          "<strong>Confirm re-checks the hold under the same lock</strong>, so a payment that arrives one second after expiry fails cleanly instead of overselling; a duplicate confirmation is a no-op.",
          "<strong>Money is a <code>long</code> of cents</strong>, priced on the server from fixed rates; <code>multiplyExact</code> fails loudly instead of overflowing.",
          "<strong>Old reservations pile up:</strong> cancelled and expired entries need a retention rule (archive, then delete after N days), especially as they reference a guest."
        ] },
        { type: "text", html: `<p>From the <a href="https://github.com/ashishps1/awesome-low-level-design/tree/main/solutions/java/src/hotelmanagementsystem" target="_blank" rel="noopener">awesome-low-level-design hotel management solution</a> this takes the room types, the booking-status lifecycle, priced add-ons such as breakfast and spa, and the idea of an injected booking service with observers. It differs where that solution would double-book or mis-price: availability there is a per-room state flag with no dates and an unsynchronised find-then-book, while here it is a count per night checked and reserved under one lock; prices there are <code>double</code>, here cents; and its Decorator chain for add-ons becomes a plain sum, because add-ons only add a price. The code is written independently.</p>` }
      ]
    },
    {
      id: "minimum-rooms",
      title: "\"Given a day's meetings, how many rooms do we need?\"",
      kicker: "Follow-up: the sweep",
      blocks: [
        { type: "text", html: `<p>A classic add-on, really an algorithm question: what is the smallest number of rooms that can hold a list of meetings? It equals the largest number of meetings in progress at any instant. Sort all starts and all ends separately and sweep through the starts; before taking a room for a meeting, release every room whose meeting ended at or before it starts. No class in the design changes; it is a static helper over <code>Interval</code>s, useful for capacity planning.</p>` },
        { type: "code", lang: "java", title: "Minimum rooms with a sweep", code: `static int minRooms(List<Interval> meetings) {
    List<Instant> starts = meetings.stream().map(Interval::start).sorted().toList();
    List<Instant> ends = meetings.stream().map(Interval::end).sorted().toList();
    int rooms = 0, best = 0, e = 0;
    for (Instant s : starts) {
        while (!ends.get(e).isAfter(s)) { rooms--; e++; }   // ended at or before s: half-open, so free first
        rooms++;
        best = Math.max(best, rooms);
    }
    return best;
}` },
        { type: "steps", title: "Trace: [9:00, 10:00), [9:30, 11:00), [10:00, 11:30)", items: [
          "Starts 9:00, 9:30, 10:00; ends 10:00, 11:00, 11:30.",
          "9:00: no end at or before it; rooms 1, best 1.",
          "9:30: the earliest end, 10:00, is after 9:30; rooms 2, best 2.",
          "10:00: the 10:00 end frees a room first (half-open), rooms 1; then take one, rooms 2. Best stays 2.",
          "With closed intervals the 10:00 meeting would need a third room: the order of the tie decides the answer."
        ] },
        { type: "callout", tone: "tip", html: `<p>To assign actual rooms, sort meetings by start and keep a min-heap of (end time, room) for rooms in use: if the heap's earliest end is at or before the next start, reuse that room, otherwise open a new one. Same O(n log n), and the heap's largest size is the answer above. The <code>ends</code> index never runs past the end of the list, because every meeting ends after it starts.</p>` }
      ]
    },
    {
      id: "several-servers",
      title: "\"What changes when the scheduler runs on several servers?\"",
      kicker: "Follow-up: moving the guarantee",
      blocks: [
        { type: "text", html: `<p>A <code>ReentrantLock</code> protects one process. With two app servers, each has its own lock for R1, and both can book 10:00. The guarantee has to move to the one place both servers share: the database. <code>RoomSchedule</code>'s TreeMap and lock disappear; <code>MeetingScheduler</code> keeps its API and becomes a thin layer over a repository.</p>` },
        { type: "table", headers: ["Technique", "How it enforces no overlap"], rows: [
          ["Exclusion constraint (PostgreSQL)", "Declarative: an overlapping insert fails. Range types are half-open by default, matching <code>[start, end)</code>"],
          ["Lock the room row", "<code>SELECT ... FOR UPDATE</code> on the room, then check for an overlap and insert, in one transaction: the per-room lock, in the database. A cross-room move locks both rows in id order"],
          ["Fixed slots", "30-minute slots as rows with a unique key on (room, slot); a multi-slot booking inserts all its rows in one transaction. Works in any database"],
          ["Optimistic version on the room", "<code>UPDATE room SET version = version + 1 WHERE id = ? AND version = ?</code> inside the transaction; zero rows updated means retry"]
        ] },
        { type: "code", lang: "sql", title: "No overlap, enforced by PostgreSQL", code: `CREATE EXTENSION IF NOT EXISTS btree_gist;    -- lets a gist index compare room_id with =

CREATE TABLE booking (
    id        uuid PRIMARY KEY,
    room_id   text NOT NULL REFERENCES room(id),
    during    tstzrange NOT NULL,               -- '[)' bounds by default: back to back is fine
    organizer text NOT NULL,
    EXCLUDE USING gist (room_id WITH =, during WITH &&)
);

-- An overlapping insert fails with SQLSTATE 23P01 (exclusion_violation): map it to RoomUnavailableException.
-- A reschedule is one UPDATE of during and room_id; the constraint checks it the same way.` },
        { type: "callout", tone: "interview", html: `<p>Name the race before the fix: "each server has its own lock, so both can see the slot free". Then say where the guarantee lives now and why its scope is still one room: the constraint compares bookings with the same <code>room_id</code>, exactly like the in-memory lock did.</p>` }
      ]
    }
  ],
  takeaways: [
    "Most follow-ups leave RoomSchedule alone: they add a value type (Recurrence, Stay), a method on the scheduler, or a class beside it (HotelInventory).",
    "Recurring meetings: expand first, then check every occurrence and insert all or none under the room lock.",
    "Attendees as a hard rule need person locks, taken after room locks in name order; reporting clashes needs none.",
    "Cross-room moves: lock rooms in id order, look up, lock, re-check, then remove, check, insert or restore.",
    "Hotels swap named rooms for counts per type per night, with holds that expire, idempotent confirmation and prices in cents.",
    "Minimum rooms is a sweep over sorted starts and ends; release ends at or before each start first.",
    "Several servers: the no-overlap guarantee moves to the database, still scoped to one room."
  ]
};
