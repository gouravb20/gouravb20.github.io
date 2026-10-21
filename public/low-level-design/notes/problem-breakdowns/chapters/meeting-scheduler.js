// LLD problem breakdown: Meeting Room Scheduler. Format: Chapter in public/shared/notes.d.ts; shared helpers in data-part2.js.
// Imports are omitted in the code.
(function () {
const { levels } = LLD_PROBLEMS_KIT;

window.DATA.chapters.push({
    id: `meeting-scheduler`, part: 2, number: 0, difficulty: `medium`,
    title: `Meeting Room Scheduler: interval overlap, a lock per room and no double booking`,
    references: [{ title: `awesome-low-level-design: Hotel Management System (the hotel booking variant)`, url: `https://github.com/ashishps1/awesome-low-level-design/blob/main/problems/hotel-management-system.md` }],
    overview: `Book conference rooms for time slots: a specific room, or any free room big enough and equipped for the meeting; cancel and reschedule; notify attendees; show a person's calendar. Asked at ClearTrip, Flipkart, Google and Atlassian, often dressed as hotel booking. Two ideas carry the design: <strong>interval overlap</strong> on half-open slots <code>[start, end)</code>, checked against only the two sorted neighbours in a per-room <code>TreeMap</code>, and <strong>no double booking</strong>, because check-then-insert runs under a <strong>lock per room</strong>. Room choice is a <strong>Strategy</strong>, notifications are an <strong>Observer</strong>, and a reschedule into another room locks both rooms in a fixed order.`,
    problem: [
      { id: `requirements`, title: `What we are building`, kicker: `Requirements`, blocks: [
        { type: `problem`, html: `<p>Build the booking core for an office's meeting rooms: an in-memory library, no UI. The interviewer will push hardest on two things: how you tell whether a room is free, and what happens when two people grab the same room at the same moment.</p>` },
        { type: `code`, lang: `text`, title: `Final requirements`, code: `Functional
  1. A fixed set of rooms, each with an id, floor, capacity and equipment
     (projector, video conferencing, whiteboard).
  2. Book a specific room for [start, end) if it is free. Back-to-back
     meetings (one ends at 10:00, the next starts at 10:00) are allowed.
  3. Book any free room with capacity >= N and the required equipment;
     the rule for choosing among candidates is pluggable
     (smallest room that fits, preferred floor first).
  4. Cancel a booking.
  5. Reschedule a booking to a new time and/or room. If the new slot is
     not free, the original booking stays exactly as it was.
  6. Notify the organizer and attendees when a meeting is booked, moved
     or cancelled.
  7. Show a person's meetings in a time window (which also reveals clashes).
  8. Concurrent requests for the same room and overlapping times:
     exactly one succeeds.

Out of scope (deep dives)
  - Recurring meetings, the hotel booking variant, the minimum number
    of rooms a set of meetings needs, persistence across servers.` }
      ] },
      { id: `clarifying`, title: `Questions worth asking`, kicker: `Clarifying`, blocks: [
        { type: `table`, headers: [`Ask`, `Assume`, `Decides`], rows: [
          [`Can a meeting start exactly when another ends?`, `Yes`, `Half-open intervals <code>[start, end)</code>`],
          [`Book a named room, or "find me a room"?`, `Both`, `A selection strategy over candidate rooms`],
          [`How do we choose among free rooms?`, `Smallest that fits, preferred floor first; may change`, `<code>RoomSelectionStrategy</code> interface`],
          [`Must attendees be free too?`, `No: report clashes, don't block the booking`, `A per-person calendar query, not a constraint`],
          [`What if a reschedule's new slot is taken?`, `Fail and keep the old booking`, `Atomic remove-check-insert-or-restore`],
          [`Many users booking at once?`, `Yes, across all rooms`, `A lock per room, never one global lock`],
          [`Time zones?`, `Store instants; display is the client's job`, `<code>java.time.Instant</code> in the core`]
        ] },
        { type: `callout`, tone: `insight`, html: `<p>Say "half-open" early. With closed intervals <code>[9:00, 10:00]</code> and <code>[10:00, 11:00]</code> share the instant 10:00 and clash, which no real calendar wants. With <code>[start, end)</code> the end instant is not part of the meeting, so back-to-back slots fit and the overlap test becomes one symmetric line.</p>` }
      ] }
    ],
    solution: [
      { id: `design`, title: `Design`, kicker: `Entities and API`, blocks: [
        { type: `table`, headers: [`Type`, `Owns`], rows: [
          [`Interval`, `Immutable <code>[start, end)</code> with the overlap test`],
          [`Room`, `Id, name, floor, capacity, equipment (record)`],
          [`MeetingRequest`, `Title, organizer, attendees and the interval (record)`],
          [`Booking`, `Id, room id and the meeting; immutable, so a reschedule makes a new version with the same id`],
          [`RoomSchedule`, `One room's bookings in a <code>TreeMap</code> keyed by start, plus that room's lock`],
          [`RoomSelectionStrategy`, `Ranks the rooms that fit a query (Strategy)`],
          [`MeetingListener`, `Receives booked, moved and cancelled events (Observer)`],
          [`MeetingScheduler`, `Facade: book, bookAny, cancel, reschedule, calendarOf`]
        ] },
        { type: `keypoints`, items: [
          `<strong>Bookings in a room never overlap</strong>, so sorted by start they are also sorted by end. That is why checking the booking just before and just after the new start is enough: O(log n) instead of scanning the room's list.`,
          `<strong>Booking is check-then-insert</strong>, and it is only correct if both happen under the same lock. The lock is <strong>per room</strong>: two rooms never wait for each other, and a global lock would serialise the whole office.`,
          `<strong>The selection rule is a Strategy</strong> because the requirement says it is pluggable and it really does vary (smallest fit, same floor, nearest the organizer). <strong>Notifications are an Observer</strong> because the scheduler shouldn't know about e-mail, chat or calendar sync.`,
          `<strong>Listeners run after the lock is released</strong>, so a slow e-mail server can't hold up bookings for that room.`
        ] },
        { type: `code`, lang: `java`, title: `Public API`, code: `MeetingScheduler(Collection<Room> rooms, RoomSelectionStrategy selection);
Booking book(String roomId, MeetingRequest request);         // throws RoomUnavailableException
Booking bookAny(RoomQuery query, MeetingRequest request);    // best free room per the strategy
void cancel(String bookingId);
Booking reschedule(String bookingId, String roomId, Interval when);  // all or nothing
List<Booking> calendarOf(String person, Interval window);    // a person's meetings; shows clashes too
void addListener(MeetingListener listener);` }
      ] },
      { id: `code`, title: `Working code`, kicker: `Implementation`, blocks: [
        { type: `code`, lang: `java`, title: `Intervals, rooms and bookings`, code: `record Interval(Instant start, Instant end) {
    Interval {
        if (!start.isBefore(end)) throw new IllegalArgumentException("start must be before end");
    }
    /** Half-open [start, end): a meeting ending at 10:00 doesn't clash with one starting at 10:00. */
    boolean overlaps(Interval o) { return start.isBefore(o.end()) && o.start().isBefore(end); }
}

enum Equipment { PROJECTOR, VIDEO_CONF, WHITEBOARD }

record Room(String id, String name, int floor, int capacity, Set<Equipment> equipment) {
    Room { equipment = Set.copyOf(equipment); }
    boolean fits(RoomQuery q) { return capacity >= q.minCapacity() && equipment.containsAll(q.equipment()); }
}

record RoomQuery(int minCapacity, Set<Equipment> equipment, OptionalInt preferredFloor) {
    boolean onPreferredFloor(Room r) { return preferredFloor.isPresent() && preferredFloor.getAsInt() == r.floor(); }
}

record MeetingRequest(String title, String organizer, Set<String> attendees, Interval when) {
    MeetingRequest { attendees = Set.copyOf(attendees); }
    MeetingRequest at(Interval newWhen) { return new MeetingRequest(title, organizer, attendees, newWhen); }
}

/** Immutable: a reschedule creates a new Booking with the same id. */
record Booking(String id, String roomId, MeetingRequest meeting) {
    Interval when() { return meeting.when(); }
    Set<String> people() {
        Set<String> all = new HashSet<>(meeting.attendees());
        all.add(meeting.organizer());
        return all;
    }
    Booking movedTo(String newRoomId, Interval newWhen) { return new Booking(id, newRoomId, meeting.at(newWhen)); }
}` },
        { type: `code`, lang: `java`, title: `Room schedule`, code: `final class RoomSchedule {
    final Room room;
    final ReentrantLock lock = new ReentrantLock();
    private final TreeMap<Instant, Booking> byStart = new TreeMap<>();   // never overlapping; guarded by lock

    RoomSchedule(Room room) { this.room = room; }

    /** Caller holds lock. Stored bookings never overlap, so only the two neighbours of our start can clash. */
    boolean isFree(Interval when) {
        Map.Entry<Instant, Booking> before = byStart.floorEntry(when.start());     // starts at or before us
        if (before != null && before.getValue().when().end().isAfter(when.start())) return false;
        Map.Entry<Instant, Booking> after = byStart.ceilingEntry(when.start());    // starts at or after us
        return after == null || !after.getValue().when().start().isBefore(when.end());
    }

    void add(Booking b)    { byStart.put(b.when().start(), b); }      // caller holds lock and checked isFree
    void remove(Booking b) { byStart.remove(b.when().start(), b); }   // caller holds lock
}` },
        { type: `code`, lang: `java`, title: `Selection strategy and listeners`, code: `interface RoomSelectionStrategy {
    /** The rooms that fit the query, best first. */
    List<Room> rank(Collection<Room> rooms, RoomQuery query);
}

/** Preferred floor first, then the smallest room that fits, so big rooms stay free for big meetings. */
final class SmallestFitFirst implements RoomSelectionStrategy {
    public List<Room> rank(Collection<Room> rooms, RoomQuery q) {
        return rooms.stream()
            .filter(r -> r.fits(q))
            .sorted(Comparator.comparing((Room r) -> !q.onPreferredFloor(r))   // false sorts first
                .thenComparingInt(Room::capacity)
                .thenComparing(Room::id))
            .toList();
    }
}

enum ChangeType { BOOKED, MOVED, CANCELLED }

record MeetingEvent(ChangeType type, Booking booking, Booking previous) {}   // previous: only for MOVED

interface MeetingListener { void onChange(MeetingEvent event); }            // e-mail, chat, calendar sync` },
        { type: `code`, lang: `java`, title: `MeetingScheduler`, code: `final class MeetingScheduler {
    private final Map<String, RoomSchedule> rooms;                                // fixed at start
    private final RoomSelectionStrategy selection;
    private final Map<String, Booking> bookings = new ConcurrentHashMap<>();      // id -> current version
    private final Map<String, Set<String>> byPerson = new ConcurrentHashMap<>();  // person -> booking ids
    private final List<MeetingListener> listeners = new CopyOnWriteArrayList<>();

    MeetingScheduler(Collection<Room> rooms, RoomSelectionStrategy selection) {
        Map<String, RoomSchedule> m = new HashMap<>();
        for (Room r : rooms) m.put(r.id(), new RoomSchedule(r));
        this.rooms = Map.copyOf(m);
        this.selection = selection;
    }

    void addListener(MeetingListener l) { listeners.add(l); }

    Booking book(String roomId, MeetingRequest req) {
        return tryBook(schedule(roomId), req).orElseThrow(() -> new RoomUnavailableException(roomId, req.when()));
    }

    Booking bookAny(RoomQuery query, MeetingRequest req) {
        List<Room> all = rooms.values().stream().map(s -> s.room).toList();
        for (Room r : selection.rank(all, query)) {
            Optional<Booking> b = tryBook(rooms.get(r.id()), req);        // lost a race? try the next room
            if (b.isPresent()) return b.get();
        }
        throw new NoRoomAvailableException(req.when());
    }

    void cancel(String bookingId) {
        while (true) {
            Booking b = find(bookingId);
            RoomSchedule s = schedule(b.roomId());
            s.lock.lock();
            try {
                if (bookings.get(bookingId) != b) continue;               // moved or cancelled meanwhile: look again
                s.remove(b);
                bookings.remove(bookingId);
                for (String p : b.people()) {
                    Set<String> ids = byPerson.get(p);
                    if (ids != null) ids.remove(bookingId);
                }
            } finally { s.lock.unlock(); }
            publish(new MeetingEvent(ChangeType.CANCELLED, b, null));
            return;
        }
    }

    Booking reschedule(String bookingId, String roomId, Interval when) {
        RoomSchedule to = schedule(roomId);
        while (true) {
            Booking old = find(bookingId);
            RoomSchedule from = schedule(old.roomId());
            List<RoomSchedule> locked = lockInOrder(from, to);               // fixed order: no deadlock
            Booking moved;
            try {
                if (bookings.get(bookingId) != old) continue;               // identity: a move makes a new object
                from.remove(old);                                           // a same-room move may overlap its old slot
                if (!to.isFree(when)) {
                    from.add(old);                                          // put it back: the old slot is never lost
                    throw new RoomUnavailableException(roomId, when);
                }
                moved = old.movedTo(roomId, when);
                to.add(moved);
                bookings.put(bookingId, moved);                             // same id and people: calendars unchanged
            } finally { unlockAll(locked); }
            publish(new MeetingEvent(ChangeType.MOVED, moved, old));
            return moved;
        }
    }

    List<Booking> calendarOf(String person, Interval window) {
        return byPerson.getOrDefault(person, Set.of()).stream()
            .map(bookings::get)
            .filter(b -> b != null && b.when().overlaps(window))           // null: cancelled since we read the ids
            .sorted(Comparator.comparing((Booking b) -> b.when().start()))
            .toList();
    }

    private Optional<Booking> tryBook(RoomSchedule s, MeetingRequest req) {
        Booking b;
        s.lock.lock();
        try {
            if (!s.isFree(req.when())) return Optional.empty();
            b = new Booking(UUID.randomUUID().toString(), s.room.id(), req);
            insert(s, b);                                                   // check and insert under one lock
        } finally { s.lock.unlock(); }
        publish(new MeetingEvent(ChangeType.BOOKED, b, null));             // outside the lock
        return Optional.of(b);
    }

    /** Caller holds s.lock: the room's tree, the id map and every calendar change together. */
    private void insert(RoomSchedule s, Booking b) {
        s.add(b);
        bookings.put(b.id(), b);
        for (String p : b.people()) byPerson.computeIfAbsent(p, k -> ConcurrentHashMap.newKeySet()).add(b.id());
    }

    private void publish(MeetingEvent e) {
        for (MeetingListener l : listeners) {
            try { l.onChange(e); }
            catch (RuntimeException ex) { /* log; one bad listener must not affect the others */ }
        }
    }

    private static List<RoomSchedule> lockInOrder(RoomSchedule a, RoomSchedule b) {
        List<RoomSchedule> order = a == b ? List.of(a)
            : a.room.id().compareTo(b.room.id()) < 0 ? List.of(a, b) : List.of(b, a);
        order.forEach(s -> s.lock.lock());
        return order;
    }

    private static void unlockAll(List<RoomSchedule> locked) {
        for (int i = locked.size() - 1; i >= 0; i--) locked.get(i).lock.unlock();
    }

    private Booking find(String id) {
        Booking b = bookings.get(id);
        if (b == null) throw new IllegalArgumentException("Unknown booking " + id);
        return b;
    }

    private RoomSchedule schedule(String roomId) {
        RoomSchedule s = rooms.get(roomId);
        if (s == null) throw new IllegalArgumentException("Unknown room " + roomId);
        return s;
    }
}

class RoomUnavailableException extends RuntimeException {
    RoomUnavailableException(String roomId, Interval when) { super(roomId + " is not free for " + when); }
}

class NoRoomAvailableException extends RuntimeException {
    NoRoomAvailableException(Interval when) { super("No matching room is free for " + when); }
}` },
        { type: `callout`, tone: `insight`, title: `Why this is thread-safe`, html: `<p>The room map, rooms, requests and bookings are immutable, so they are shared freely. Each room's <code>TreeMap</code> is touched only while holding that room's lock, so check-then-insert is one atomic step per room. The <code>bookings</code> and <code>byPerson</code> maps are concurrent, and a booking's entry is only changed while its room's lock is held, so cancel and reschedule can re-check "is this still the current version?" under the lock and retry if a concurrent move won. Listeners sit in a <code>CopyOnWriteArrayList</code> and are called after unlocking.</p>` }
      ] },
      { id: `walkthrough`, title: `Walking through it`, kicker: `Check it works`, blocks: [
        { type: `steps`, items: [
          `Room R1 has 9:00-10:00 and 11:00-12:00. A request for 10:00-11:00: <code>floorEntry(10:00)</code> is the 9:00 meeting, which ends at 10:00, not after it; <code>ceilingEntry(10:00)</code> is the 11:00 meeting, which starts at 11:00, not before our end. Free: booked back to back.`,
          `A request for 10:30-11:30 finds the 11:00 meeting as the ceiling neighbour, starting before 11:30: not free, without looking at any other booking.`,
          `Two people call <code>book(R1, 14:00-15:00)</code> at once. R1's lock lets one in; it checks, inserts and unlocks. The second then sees the new booking as its floor neighbour and gets <code>RoomUnavailableException</code>. Meanwhile bookings for R2 run in parallel.`,
          `<code>bookAny(capacity 6, projector, floor 3)</code>: the strategy ranks floor-3 rooms first, smallest first. If the first room was taken a moment ago, <code>tryBook</code> returns empty and the loop tries the next room.`,
          `Rescheduling a meeting from R1 to R2 while someone else moves another meeting from R2 to R1: both lock R1 first (id order), so one waits; no deadlock. If R2 turns out to be busy, the meeting goes back into R1's slot before the lock is released.`
        ] }
      ] }
    ],
    levels: levels(
      [`Rooms, bookings and a scheduler with book and cancel that work; a correct overlap test, ideally half-open.`, `Seeing that two people can race for the same room and that some locking is needed.`],
      [`The O(log n) neighbour check on a sorted map and why it is correct (stored bookings never overlap).`, `A lock per room with check-then-insert inside it, and why not one global lock.`, `A selection strategy driven by the pluggable requirement, notifications outside the lock, and an atomic reschedule.`],
      [`Cross-room reschedule with ordered locking, recurring meetings booked all or nothing, the hotel variant with inventory counts and expiring holds.`, `Moving the guarantee into a database across servers (an exclusion constraint, or locking the room row) and the minimum-rooms sweep as an analysis tool.`]
    ),
    concepts: [
      { term: `Half-open interval`, def: `A slot <code>[start, end)</code> includes its start but not its end.`, why: `Back-to-back meetings don't clash, and durations are simply end minus start.` },
      { term: `Overlap test`, def: `Two slots overlap exactly when <code>a.start &lt; b.end &amp;&amp; b.start &lt; a.end</code>.`, why: `One symmetric condition covers containment, partial overlap and equality; anything else is a gap.`, ex: `[9, 10) and [10, 11): 10 &lt; 10 is false, so no overlap.` },
      { term: `Neighbour check`, def: `In a <code>TreeMap</code> keyed by start, test only <code>floorEntry(start)</code> and <code>ceilingEntry(start)</code>.`, why: `A room's bookings never overlap, so no other booking can clash if those two don't: O(log n), not a scan.` },
      { term: `Atomic check-then-insert`, def: `Check that the slot is free and insert the booking inside one critical section.`, why: `Checked separately, two requests can both see "free" and both insert: a double booking.` },
      { term: `Lock per room`, def: `Each <code>RoomSchedule</code> has its own <code>ReentrantLock</code>.`, why: `The no-overlap invariant is per room, so that is the natural unit; different rooms never contend.` },
      { term: `Room selection strategy`, def: `An interface that ranks the rooms fitting capacity and equipment; <code>SmallestFitFirst</code> is one rule.`, why: `The requirement says the rule is pluggable, and it changes (same floor, nearest, least used).` },
      { term: `Atomic reschedule`, def: `Under the room lock(s): remove the old slot, check the new one, then insert the new booking or put the old one back.`, why: `The meeting is never in zero or two places, and a failed move keeps the original.` },
      { term: `Ordered locking`, def: `When a move touches two rooms, lock them in room-id order and unlock in reverse.`, why: `Opposite moves (R1 to R2, R2 to R1) can't each hold one lock and wait for the other.` },
      { term: `Observer outside the lock`, def: `Listeners get booked, moved and cancelled events after the room lock is released.`, why: `Slow or failing notification code can't block bookings or break the scheduler.` }
    ],
    interview: [
      { q: `Why use half-open intervals?`, a: `Because a meeting that ends at 10:00 and one that starts at 10:00 should both fit. With [start, end) the end instant isn't part of the meeting, so the overlap test a.start &lt; b.end and b.start &lt; a.end says they don't clash. It also makes lengths simple (end minus start) and splits a day into slots with no gaps or double counting.`, diff: `easy` },
      { q: `How do you check whether a room is free quickly?`, a: `Keep each room's bookings in a TreeMap keyed by start time. Because a room's bookings never overlap each other, they are sorted by end time as well, so only two bookings can possibly clash with a new slot: the one starting at or before its start (floorEntry), which clashes if it ends after our start, and the one starting at or after its start (ceilingEntry), which clashes if it starts before our end. That is O(log n) instead of scanning every booking.`, diff: `medium` },
      { q: `Two users book the same room for overlapping times at the same instant. What happens?`, a: `Exactly one wins. Booking is check-then-insert, done while holding that room's lock, so the second request only checks after the first has inserted, finds it as a neighbour and fails. A ConcurrentSkipListMap on its own is not enough: each put is atomic, but two threads can both check, both see free and both put under different start keys. One global lock would also be correct but serialises every room in the building.`, diff: `medium` },
      { q: `How do you reschedule a meeting into a different room without losing it or deadlocking?`, a: `Lock both rooms, always in the same order (by room id), so two opposite moves can't each hold one lock and wait for the other. Under both locks, re-check that the booking hasn't changed, remove it from the old room, check the new slot, then insert the new version, or put the old one back and fail. Nobody ever sees the meeting in both rooms or in neither, and notifications go out after unlocking.`, diff: `hard` },
      { q: `How would you book a weekly meeting when one of the weeks is already taken?`, a: `Default to all or nothing: compute every occurrence first, then under the room's lock check all of them and only insert if every one is free; otherwise report the clashing dates and change nothing. Some products instead book the free weeks and list the exceptions, which is a product decision worth asking about. Generate occurrences on the wall clock in the meeting's time zone so 10:00 stays 10:00 across daylight-saving changes.`, diff: `medium` },
      { q: `Given a day's meetings, how many rooms are needed at minimum?`, a: `Sort all start times and all end times separately and sweep: for each start in order, first release every meeting that ended at or before it (half-open, so an end at the same instant frees the room), then take a room; the peak count is the answer. O(n log n) for the sorts. To also say which room each meeting gets, sort by start and keep a min-heap of the end times of rooms in use.`, diff: `medium` },
      { q: `How does this work with several servers and a database?`, a: `In-memory locks protect one process only, so the database must enforce no overlap. PostgreSQL can do it declaratively with an exclusion constraint on (room_id with =, time range with &amp;&amp;). Otherwise lock the room's row with SELECT ... FOR UPDATE inside the transaction, check for an overlapping booking and insert. With fixed slots (say 30 minutes), a unique key on (room, slot) works in any database.`, diff: `hard` }
    ],
    cheatsheet: [
      { title: `Scheduler in one screen`, type: `code`, lang: `java`, body: `record Interval(Instant start, Instant end) {
    boolean overlaps(Interval o) { return start.isBefore(o.end()) && o.start().isBefore(end); }   // [start, end)
}
final class RoomSchedule {
    ReentrantLock lock; TreeMap<Instant, Booking> byStart;     // never overlapping
    boolean isFree(Interval w);                                // floorEntry + ceilingEntry only
}
final class MeetingScheduler {
    Booking book(String roomId, MeetingRequest r);             // lock room, isFree, insert, unlock, notify
    Booking bookAny(RoomQuery q, MeetingRequest r);            // strategy ranks rooms; first tryBook wins
    void cancel(String id);                                    // re-check current version under the lock
    Booking reschedule(String id, String roomId, Interval w);  // lock rooms by id; remove, check, add or restore
}` },
      { title: `Follow-ups`, type: `table`, headers: [`Follow-up`, `Change`], rows: [
        [`Recurring meetings`, `Expand occurrences, check all under the room lock, insert all or none`],
        [`Hotel booking`, `Dates <code>[checkIn, checkOut)</code>, counts per room type per night, hold then confirm with expiry`],
        [`Minimum rooms`, `Sort starts and ends, sweep, track the peak`],
        [`Several servers`, `Exclusion constraint or <code>SELECT ... FOR UPDATE</code> on the room row`],
        [`Busy rooms, many readers`, `<code>ConcurrentSkipListMap</code> for lock-free reads; writes still take the room lock`]
      ] },
      { title: `Edge cases`, type: `list`, items: [`End not after start`, `Back-to-back slots (must be allowed)`, `A slot exactly equal to an existing one`, `Rescheduling into its own old slot, or overlapping it in the same room`, `Cancel or reschedule racing with another move of the same booking`, `No room fits the capacity or equipment at all`] }
    ],
    labs: []
  });
})();
