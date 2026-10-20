// Deep dives: Meeting Room Scheduler (LLD). Format: DeepDive in public/shared/notes.d.ts.
window.DEEP = window.DEEP || {};
DEEP["meeting-scheduler"] = {
  hook: `<p>The core design answers "is this room free?" in O(log n) and makes each booking atomic per room. The follow-ups probe whether you really understand both halves: why two neighbours are enough, what goes wrong with the obvious concurrent collections, how a move between rooms avoids deadlock, how a weekly series stays all or nothing, and how the same ideas become hotel booking with counts instead of named rooms.</p>`,
  sections: [
    {
      id: "interval-index",
      title: "Half-open intervals and the neighbour check",
      kicker: "Core idea: overlap in O(log n)",
      blocks: [
        { type: "text", html: `<p>Two half-open slots <code>[a1, a2)</code> and <code>[b1, b2)</code> overlap exactly when <code>a1 &lt; b2 &amp;&amp; b1 &lt; a2</code>. It is easiest to see from the opposite side: they are disjoint only if one ends before (or exactly when) the other starts, <code>a2 &lt;= b1 || b2 &lt;= a1</code>. Negate that and you get the test. It covers containment, partial overlap and identical slots without special cases.</p>` },
        { type: "compare", title: "Closed versus half-open", items: [
          { title: "Closed [start, end]", tone: "bad", html: `<p>9:00-10:00 and 10:00-11:00 share 10:00 and clash. People work around it with "end at 9:59", which breaks durations and leaves a one-minute hole.</p>` },
          { title: "Half-open [start, end)", tone: "ok", html: `<p>The end instant belongs to nobody, so back-to-back slots fit, length is <code>end - start</code>, and a day splits into slots with no gaps or overlaps.</p>` }
        ] },
        { type: "text", html: `<p>Scanning a room's bookings is O(n) per request. A <code>TreeMap</code> keyed by start does better because of one invariant: <strong>a room's stored bookings never overlap each other</strong>. So sorted by start, they are also sorted by end, and only two can clash with a new slot: the one starting at or before its start (<code>floorEntry</code>) and the one starting at or after it (<code>ceilingEntry</code>). If neither clashes, everything further away ends earlier or starts later still.</p>` },
        { type: "code", lang: "java", title: "One-lookup neighbour check", code: `// Stored bookings never overlap, so sorted by start they are also sorted by end.
// Of the bookings that start before our end, the last one ends latest: it is the only one to test.
boolean isFree(Interval when) {
    Map.Entry<Instant, Booking> prev = byStart.lowerEntry(when.end());
    return prev == null || !prev.getValue().when().end().isAfter(when.start());
}` },
        { type: "table", headers: ["Structure", "Is it free?", "Insert", "When to use"], rows: [
          ["Unsorted list", "O(n) scan", "O(1)", "A handful of bookings per room"],
          ["TreeMap by start (non-overlapping)", "O(log n): two neighbours", "O(log n)", "One room's schedule: the default"],
          ["Interval tree", "O(log n + k) for all k overlaps", "O(log n)", "Sets that may overlap, such as a person's calendar"]
        ] },
        { type: "callout", tone: "mistake", html: `<p>The neighbour trick relies on the no-overlap invariant. A person's calendar can contain clashing meetings, so there you must collect every overlap (an interval tree, or a scan of the person's few bookings), not just test two neighbours.</p>` },
        { type: "quiz", q: "Room R1 has one booking, [10:00, 11:00). Which request is accepted?", options: ["[9:00, 10:00)", "[10:30, 11:30)", "[9:30, 10:01)", "[10:00, 10:30)"], answer: 0, explain: `<p>With half-open intervals, [9:00, 10:00) ends exactly when the booking starts: 10:00 &lt; 10:00 is false, so there is no overlap. Each of the others shares at least one instant with [10:00, 11:00).</p>` }
      ]
    },
    {
      id: "double-booking",
      title: "Preventing double booking under concurrency",
      kicker: "Follow-up: exactly one wins",
      blocks: [
        { type: "problem", html: `<p>Booking is <strong>check, then insert</strong>. If two threads both check before either inserts, both see a free slot and both insert, and the room is double booked. Every option below is judged by whether it makes those two steps one atomic unit.</p>` },
        { type: "compare", items: [
          { title: "One global lock", tone: "warn", html: `<p>Correct and simple, but every booking in the building waits for every other, even for different rooms.</p>` },
          { title: "A lock per room", tone: "ok", html: `<p>Correct, and rooms proceed in parallel. The invariant (no overlap) is per room, so this is the natural unit. The chosen design.</p>` },
          { title: "ConcurrentSkipListMap alone", tone: "bad", html: `<p>Broken. Each <code>put</code> is atomic, but [9:00, 10:00) and [9:30, 10:30) have different keys: both threads check, both see free, both put.</p>` },
          { title: "Skip list plus a room lock", tone: "info", html: `<p>Writers take the room lock for check-then-insert; readers browse without locking. Worth it only when reads of a room's day vastly outnumber bookings.</p>` }
        ] },
        { type: "code", lang: "java", title: "Lock-free reads with a skip list", code: `final class RoomSchedule {
    final Room room;
    private final ReentrantLock writeLock = new ReentrantLock();
    private final ConcurrentSkipListMap<Instant, Booking> byStart = new ConcurrentSkipListMap<>();

    RoomSchedule(Room room) { this.room = room; }

    /** Writers still serialise per room: the skip list makes each put atomic, not check-then-put. */
    boolean tryAdd(Booking b) {
        writeLock.lock();
        try {
            if (!isFree(b.when())) return false;
            byStart.put(b.when().start(), b);
            return true;
        } finally { writeLock.unlock(); }
    }

    /** No lock: a weakly consistent view, fine for showing a room's day, never for deciding a booking. */
    List<Booking> startingBetween(Instant from, Instant to) {
        return List.copyOf(byStart.subMap(from, true, to, false).values());
    }

    private boolean isFree(Interval when) {                       // caller holds writeLock
        Map.Entry<Instant, Booking> prev = byStart.lowerEntry(when.end());
        return prev == null || !prev.getValue().when().end().isAfter(when.start());
    }
}` },
        { type: "table", title: "With a database and several servers", headers: ["Technique", "How it enforces no overlap"], rows: [
          ["Exclusion constraint (PostgreSQL)", "<code>EXCLUDE USING gist (room_id WITH =, during WITH &amp;&amp;)</code> on a range column (needs the btree_gist extension); an overlapping insert fails"],
          ["Lock the room row", "<code>SELECT ... FROM rooms WHERE id = ? FOR UPDATE</code>, then query for an overlap and insert, in one transaction: the per-room lock, in the database"],
          ["Fixed slots", "Book 30-minute slots as rows with a unique key on (room, slot); a multi-slot booking inserts all its rows in one transaction"]
        ] },
        { type: "callout", tone: "interview", html: `<p>Name the race before the fix: "two requests can both see the slot free". Then say where the guarantee lives (the room lock in memory, the constraint or row lock in a database) and why its scope is one room.</p>` }
      ]
    },
    {
      id: "reschedule-lock-order",
      title: "Reschedule across rooms and lock ordering",
      kicker: "Follow-up: atomic moves without deadlock",
      blocks: [
        { type: "text", html: `<p>A reschedule must be all or nothing: if the new slot is taken, the meeting keeps its old slot. Cancelling first and then booking would leave a window where someone else grabs the old slot, so the move happens under the lock of every room involved: remove the old booking, check the new slot, then insert the new version or put the old one back.</p>` },
        { type: "text", html: `<p>Removing first matters even within one room: moving 10:00-11:00 to 10:30-11:30 overlaps the meeting's own old slot, and without removing it the check would reject the move.</p>` },
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
        { type: "steps", title: "How the fixed order breaks the cycle", items: [
          "Deadlock needs a cycle: A holds R1 and wants R2 while B holds R2 and wants R1.",
          "With ordering by room id, both A and B lock R1 first, whatever direction they move in.",
          "Whoever gets R1 also gets R2 (nobody holds R2 without R1 here); the other waits holding nothing.",
          "Unlock in reverse order. If both moves are within one room, lock it once: the scheduler dedupes, which also matters in Go, where a mutex is not reentrant."
        ] },
        { type: "callout", tone: "warning", html: `<p>Look the booking up, lock, then <strong>re-check</strong> that it is still the same version. Between the lookup and the lock, another thread may have moved it to a third room or cancelled it; the scheduler compares identity and retries from the lookup.</p>` },
        { type: "tradeoffs", prosLabel: "Ordered locking", consLabel: "Alternatives", pros: ["No deadlock, no timeouts", "Simple to explain and test"], cons: ["<code>tryLock</code> with a timeout and retry also avoids deadlock but can livelock and needs back-off", "One global lock for moves only is simple but serialises all cross-room moves"] }
      ]
    },
    {
      id: "recurring-meetings",
      title: "Recurring meetings, all or nothing",
      kicker: "Follow-up: a series of bookings",
      blocks: [
        { type: "text", html: `<p>A weekly stand-up for ten weeks is ten bookings that should succeed or fail together. Expand the rule into concrete intervals first (outside any lock), then, under the room's lock, check every occurrence and insert only if all are free. Because nothing is written until every check has passed, there is nothing to roll back.</p>` },
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
            insert(s, b);
            made.add(b);
        }
    } finally { s.lock.unlock(); }
    made.forEach(b -> publish(new MeetingEvent(ChangeType.BOOKED, b, null)));
    return made;
}` },
        { type: "keypoints", items: [
          "<strong>Check the occurrences against each other too.</strong> <code>isFree</code> only sees stored bookings, so a daily rule with a 25-hour length would otherwise overlap itself.",
          "<strong>Series ids</strong> (<code>series/0</code>, <code>series/1</code>...) let you cancel one occurrence, or this one and all following, by prefix.",
          "<strong>Unbounded series</strong> (every Monday, forever) are usually stored as a rule and materialised a few months ahead by a background job, which books the next window all or nothing and reports clashes.",
          "<strong>Partial booking</strong> (book the free weeks, list the clashes) is a product choice; ask before assuming all or nothing."
        ] }
      ]
    },
    {
      id: "hotel-booking",
      title: "The hotel booking variant",
      kicker: "Follow-up: counts instead of named rooms",
      blocks: [
        { type: "text", html: `<p>Hotel booking is the same problem with three twists. Time is <strong>dates</strong>: a stay is <code>[checkIn, checkOut)</code>, so checking out on the 12th and someone else checking in on the 12th don't clash. Guests book a <strong>room type</strong>, not room 304, so availability is a count: for every night of the stay, rooms of that type in use must be below the inventory. And payment takes minutes, so inventory is <strong>held</strong> with an expiry and then confirmed.</p>` },
        { type: "table", headers: ["", "Meeting rooms", "Hotel"], rows: [
          ["Time unit", "Instants, <code>[start, end)</code>", "Nights, <code>[checkIn, checkOut)</code>"],
          ["What is booked", "A specific room", "One of N rooms of a type; the room number is assigned at check-in"],
          ["Free means", "No overlapping booking in the room", "Count in use &lt; inventory on every night"],
          ["Lock unit", "One room", "One room type (or the whole hotel)"],
          ["Checkout flow", "Instant", "Hold with expiry, then confirm after payment"]
        ] },
        { type: "code", lang: "java", title: "Hotel inventory with holds", code: `enum RoomType { SINGLE, DOUBLE, SUITE }

record Stay(LocalDate checkIn, LocalDate checkOut) {                // [checkIn, checkOut): the nights slept
    Stay { if (!checkIn.isBefore(checkOut)) throw new IllegalArgumentException("At least one night"); }
    List<LocalDate> nights() { return checkIn.datesUntil(checkOut).toList(); }
}

record Hold(String id, RoomType type, Stay stay, Instant expiresAt) {}

final class HotelInventory {
    private final Map<RoomType, Integer> rooms;                     // how many of each type; fixed
    private final Clock clock;
    // The three maps below are guarded by this.
    private final Map<RoomType, Map<LocalDate, Integer>> used = new EnumMap<>(RoomType.class);   // held + confirmed
    private final Map<String, Hold> holds = new HashMap<>();
    private final Map<String, Hold> confirmed = new HashMap<>();

    HotelInventory(Map<RoomType, Integer> rooms, Clock clock) { this.rooms = Map.copyOf(rooms); this.clock = clock; }

    synchronized Hold hold(RoomType type, Stay stay, Duration ttl) {
        expireHolds();
        Map<LocalDate, Integer> perNight = used.computeIfAbsent(type, t -> new HashMap<>());
        int capacity = rooms.getOrDefault(type, 0);
        for (LocalDate night : stay.nights())
            if (perNight.getOrDefault(night, 0) >= capacity) throw new SoldOutException(type, night);
        for (LocalDate night : stay.nights()) perNight.merge(night, 1, Integer::sum);   // every night, or none
        Hold h = new Hold(UUID.randomUUID().toString(), type, stay, clock.instant().plus(ttl));
        holds.put(h.id(), h);
        return h;
    }

    /** Payment succeeded: the held nights stay counted and the hold becomes a reservation. */
    synchronized String confirm(String holdId) {
        expireHolds();
        Hold h = holds.remove(holdId);
        if (h == null) throw new IllegalStateException("Hold expired or unknown");
        confirmed.put(h.id(), h);
        return h.id();
    }

    synchronized void cancel(String id) {
        Hold h = holds.remove(id);
        if (h == null) h = confirmed.remove(id);
        if (h != null) giveBack(h);
    }

    private void expireHolds() {                                    // lazy: on every call
        Instant now = clock.instant();
        holds.values().removeIf(h -> {
            if (now.isBefore(h.expiresAt())) return false;
            giveBack(h);
            return true;
        });
    }

    private void giveBack(Hold h) {
        Map<LocalDate, Integer> perNight = used.get(h.type());
        for (LocalDate night : h.stay().nights()) perNight.merge(night, -1, Integer::sum);
    }
}

class SoldOutException extends RuntimeException {
    SoldOutException(RoomType t, LocalDate night) { super(t + " is sold out on " + night); }
}` },
        { type: "keypoints", items: [
          "<strong>Thread safety:</strong> every mutable map is read and written only inside <code>synchronized</code> methods, so hold, confirm, cancel and expiry are each atomic. A stay touches one room type, so a lock per type is the next step if one hotel-wide monitor ever becomes a bottleneck.",
          "<strong>Expiry is lazy</strong>, run at the start of every call, which is enough for correctness; a scheduled sweep only returns inventory to searches sooner.",
          "<strong>Confirm re-checks the hold under the same lock</strong>, so a payment that arrives one second after expiry fails cleanly instead of overselling.",
          "<strong>Overbooking</strong> (selling 102% of rooms because some guests never show) is a one-line change to <code>capacity</code>, and a business decision to ask about."
        ] }
      ]
    },
    {
      id: "minimum-rooms",
      title: "How many rooms does a day need?",
      kicker: "Algorithm follow-up: the sweep",
      blocks: [
        { type: "text", html: `<p>A classic add-on: given a list of meetings, what is the smallest number of rooms that can hold them all? It equals the largest number of meetings in progress at any instant. Sort all starts and all ends separately and sweep through the starts; before taking a room for a meeting, release every room whose meeting ended at or before it starts.</p>` },
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
          "With closed intervals the 10:00 meeting would need a third room; the order of the tie decides the answer."
        ] },
        { type: "callout", tone: "tip", html: `<p>To assign actual rooms, sort meetings by start and keep a min-heap of (end time, room) for rooms in use: if the heap's earliest end is at or before the next start, reuse that room, otherwise open a new one. Same O(n log n), and the heap's largest size is the answer above. The <code>ends</code> index never runs past the end of the list, because every meeting ends after it starts.</p>` }
      ]
    }
  ],
  takeaways: [
    "Half-open <code>[start, end)</code> intervals: back-to-back slots fit, and overlap is <code>a.start &lt; b.end &amp;&amp; b.start &lt; a.end</code>.",
    "A room's bookings never overlap, so a TreeMap by start needs only the floor and ceiling neighbours: O(log n).",
    "Booking is check-then-insert; make it atomic with a lock per room. A concurrent map alone does not prevent double booking.",
    "Reschedule under the lock of every room involved, in room-id order: remove, check, insert or restore.",
    "Recurring meetings: expand first, then check all occurrences and insert all or none under the room lock.",
    "Hotels swap named rooms for counts per type per night, and add holds that expire.",
    "Minimum rooms is a sweep over sorted starts and ends; release ends at or before each start first."
  ]
};
