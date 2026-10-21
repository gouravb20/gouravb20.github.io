// LLD problem breakdown: Meeting Room Scheduler. Format: Chapter in public/shared/notes.d.ts; shared helpers in data-part2.js.
// Imports are omitted in the code.
(function () {
const { levels, PRACTICE_TIP } = LLD_PROBLEMS_KIT;

window.DATA.chapters.push({
    id: `meeting-scheduler`, part: 2, number: 0, difficulty: `medium`,
    title: `Meeting Room Scheduler: interval overlap, a lock per room and no double booking`,
    references: [{ title: `awesome-low-level-design: Hotel Management System (the hotel booking variant)`, url: `https://github.com/ashishps1/awesome-low-level-design/blob/main/problems/hotel-management-system.md` }],
    overview: `An office has a handful of meeting rooms. People book a named room for a time slot, or ask for any free room big enough and equipped for the meeting; they cancel and reschedule; attendees are told about every change and can see their own calendar. Asked at Google, Atlassian, Flipkart and ClearTrip, often dressed as hotel booking. This page works the problem in interview order: clarify the requirements, find the entities, design the classes top down, implement booking and rescheduling (comparing a simple, a better and a strong option at each decision), verify with a trace, then handle follow-ups. The design lands on <strong>half-open intervals</strong> <code>[start, end)</code>, a <strong>TreeMap per room</strong> where only the two neighbours of a new slot can clash, <strong>a lock per room</strong> so check-then-insert is atomic, <strong>ordered locking</strong> for a move between rooms, room choice as a <strong>Strategy</strong> and notifications as an <strong>Observer</strong>.`,
    problem: [
      { id: `understanding`, title: `What a meeting room scheduler does`, kicker: `The problem`, blocks: [
        { type: `problem`, html: `<p>Rooms are a shared, scarce resource. Two teams want the big room at 10:00; someone needs "anything with a projector for six people, now"; a meeting moves from Tuesday to Wednesday. The scheduler is the booking core behind all of that: an in-memory library with no UI, whose one promise is that <strong>a room is never booked twice for the same time</strong>, even when requests arrive at the same instant.</p>` },
        { type: `text`, html: `<p>The prompt is usually one sentence: <em>"Design a meeting room booking system: users book rooms for a time slot, and no two meetings may overlap in the same room."</em> That leaves the meaning of "overlap", the search rules and the concurrency story open. The first few minutes go into turning it into a spec.</p>` }
      ] },
      { id: `clarifying`, title: `Clarifying questions`, kicker: `Step 1: requirements`, blocks: [
        { type: `text`, html: `<p>Work through four kinds of question: <strong>what the system must do</strong>, <strong>what happens with bad input</strong>, <strong>what is deliberately left out</strong>, and <strong>what might be added later</strong>. Spend one to three minutes here; every answer removes a branch you would otherwise design for.</p>` },
        { type: `table`, headers: [`You ask`, `A typical answer`, `What it decides`], rows: [
          [`Can a meeting start exactly when another ends in the same room?`, `Yes, back-to-back is normal`, `Half-open intervals <code>[start, end)</code>`],
          [`Do people book a named room, or say "find me a room"?`, `Both: a room id, or capacity plus equipment`, `Two entry points; a ranking rule over the rooms that fit`],
          [`How do we choose among several free rooms?`, `Smallest that fits, preferred floor first; likely to change`, `A <code>RoomSelectionStrategy</code> interface`],
          [`What if the start is not before the end, or the room doesn't exist?`, `Reject the request; never store it`, `Validation in the <code>Interval</code> constructor and at the scheduler's boundary`],
          [`If a reschedule's new slot is taken, what happens to the meeting?`, `It keeps its old slot, untouched`, `A move is all or nothing: remove, check, insert or restore`],
          [`Must every attendee be free too?`, `No: show clashes, don't block the booking`, `A per-person calendar query, not a constraint (blocking is a follow-up)`],
          [`Many users booking at once?`, `Yes, across all rooms`, `Exactly one wins a contested slot; rooms don't wait for each other`],
          [`Recurring meetings, hotels, several servers?`, `Out of scope for now; maybe later`, `Deep dives, not the core design`]
        ] },
        { type: `callout`, tone: `insight`, title: `Does 9:00-10:00 clash with 10:00-11:00?`, html: `<p>This one question decides the data model. With closed intervals <code>[9:00, 10:00]</code> and <code>[10:00, 11:00]</code> share the instant 10:00 and clash, which no real calendar wants; people then fake it with "ends at 9:59", which breaks durations. With half-open <code>[start, end)</code> the end instant belongs to nobody, back-to-back slots fit, length is <code>end - start</code>, and the overlap test is one symmetric line. Ask it out loud, then say "half-open" before you write a single class.</p>` }
      ] },
      { id: `final-requirements`, title: `Final requirements`, kicker: `Step 1: requirements`, blocks: [
        { type: `code`, lang: `text`, title: `Final requirements`, code: `Requirements
  1. A fixed set of rooms, each with an id, floor, capacity and equipment
     (projector, video conferencing, whiteboard).
  2. Book a specific room for [start, end) if it is free. Back-to-back
     meetings (one ends at 10:00, the next starts at 10:00) are allowed.
  3. Book any free room with capacity >= N and the required equipment;
     the rule for choosing among candidates is pluggable
     (default: preferred floor first, then the smallest room that fits).
  4. Cancel a booking.
  5. Reschedule a booking to a new time and/or room. If the new slot is
     not free, the original booking stays exactly as it was.
  6. Notify the organizer and attendees when a meeting is booked, moved
     or cancelled.
  7. Show a person's meetings in a time window (which also reveals clashes).
  8. Concurrent requests for the same room and overlapping times:
     exactly one succeeds; requests for different rooms never wait
     for each other.
  9. Invalid input (start not before end, unknown room or booking) is
     rejected and changes nothing.

Out of scope
  - Recurring meetings, attendee availability as a hard rule
  - The hotel booking variant, minimum rooms for a set of meetings
  - Persistence and several servers, time zones in the UI` },
        { type: `callout`, tone: `tip`, html: PRACTICE_TIP }
      ] }
    ],
    solution: [
      { id: `entities`, title: `Core entities`, kicker: `Step 2: entities`, blocks: [
        { type: `text`, html: `<p>Scan the requirements for nouns that hold state or enforce rules. Plenty of nouns appear (room, meeting, slot, person, calendar, notification); not all of them deserve a class. Test each one.</p>` },
        { type: `table`, headers: [`Candidate`, `Verdict`, `Why`], rows: [
          [`Room`, `A record`, `Id, floor, capacity, equipment. Immutable facts; the changing part (its bookings) lives elsewhere`],
          [`Time slot`, `A record: <code>Interval</code>`, `Two instants plus one rule (the overlap test) and one invariant (start before end). A value type, so it can't be built invalid`],
          [`Meeting / booking`, `A record: <code>Booking</code>`, `A meeting placed in a room. Immutable, so a reschedule creates a new version with the same id`],
          [`Person, organizer, attendee`, `A <code>String</code> id, not a class`, `Nothing in the requirements needs a person's state or behaviour; they are keys into calendars`],
          [`Calendar`, `Not a class`, `"A person's meetings" is a query over bookings, served by an index from person to booking ids`],
          [`Floor, building`, `An <code>int</code> on Room`, `Only used to rank rooms; no rules of its own`],
          [`Equipment`, `An enum`, `A small fixed set of values; a room holds a <code>Set</code> of them`],
          [`Room schedule`, `A class (emerges in design)`, `One room's bookings plus the lock that guards them: the unit that enforces "no overlap"`],
          [`Notification`, `An interface: <code>MeetingListener</code>`, `The scheduler emits events; e-mail or chat is someone else's job`],
          [`Scheduler`, `A class`, `The entry point: book, book any, cancel, reschedule, calendar`]
        ] },
        { type: `table`, title: `The entities we keep`, headers: [`Entity`, `Responsibility`], rows: [
          [`MeetingScheduler`, `The facade. Validates ids, finds rooms, coordinates locks for book, cancel and reschedule, keeps the booking and person indexes, and publishes events. Knows nothing about how a room checks for overlap.`],
          [`RoomSchedule`, `One room's bookings, sorted by start, and the lock that guards them. Answers "is this slot free?" and adds or removes a booking. Knows nothing about other rooms or people.`],
          [`Interval`, `An immutable half-open <code>[start, end)</code> with the overlap test.`],
          [`Room`, `Immutable facts about a room and whether it fits a query.`],
          [`Booking`, `An immutable meeting in a room: id, room id, title, organizer, attendees, interval.`],
          [`RoomSelectionStrategy`, `Ranks the rooms that fit a query, best first.`],
          [`MeetingListener`, `Receives booked, moved and cancelled events.`]
        ] },
        { type: `callout`, tone: `tip`, html: `<p>Say out loud why <em>Person</em> and <em>Calendar</em> are not classes: "nothing in the spec gives a person behaviour, and a calendar is a query; I'll index bookings by person id." Interviewers reward the nouns you reject as much as the ones you keep.</p>` }
      ] },
      { id: `scheduler-design`, title: `Class design: MeetingScheduler`, kicker: `Step 3: class design, top down`, blocks: [
        { type: `text`, html: `<p>Start from the class outside code talks to, and derive its state and methods from the requirements. For each requirement ask: what must this class remember, and what must it let callers do?</p>` },
        { type: `table`, headers: [`Requirement`, `What the scheduler remembers`], rows: [
          [`"A fixed set of rooms"`, `Room id to <code>RoomSchedule</code>, built once and never changed`],
          [`"The rule for choosing is pluggable"`, `A <code>RoomSelectionStrategy</code>, injected`],
          [`"Cancel or reschedule a booking" (by id)`, `Booking id to the current <code>Booking</code>`],
          [`"Show a person's meetings"`, `Person id to the ids of their bookings`],
          [`"Notify on every change"`, `A list of <code>MeetingListener</code>s`]
        ] },
        { type: `table`, headers: [`Need`, `Method`], rows: [
          [`Book a named room`, `<code>Booking book(String roomId, MeetingRequest request)</code>`],
          [`Book the best free room that fits`, `<code>Booking bookAny(RoomQuery query, MeetingRequest request)</code>`],
          [`Cancel`, `<code>void cancel(String bookingId)</code>`],
          [`Move in time and/or room, all or nothing`, `<code>Booking reschedule(String bookingId, String roomId, Interval when)</code>`],
          [`A person's meetings in a window`, `<code>List&lt;Booking&gt; calendarOf(String person, Interval window)</code>`],
          [`Subscribe to changes`, `<code>void addListener(MeetingListener listener)</code>`]
        ] },
        { type: `keypoints`, items: [
          `<strong>Failures are exceptions, not nulls.</strong> <code>RoomUnavailableException</code> when the slot is taken, <code>NoRoomAvailableException</code> when nothing fits, <code>IllegalArgumentException</code> for unknown ids. Callers can't mistake a failed booking for a successful one.`,
          `<strong>The request is a value object.</strong> <code>MeetingRequest</code> bundles title, organizer, attendees and interval, so <code>book</code> and <code>bookAny</code> take the same thing and a reschedule just swaps the interval.`,
          `<strong>The scheduler doesn't check overlap itself.</strong> It locks a room and asks that room's schedule. Overlap logic lives in one place, next to the data it reads.`
        ] }
      ] },
      { id: `schedule-design`, title: `Class design: RoomSchedule and Interval`, kicker: `Step 3: class design`, blocks: [
        { type: `table`, headers: [`Requirement`, `What a room schedule remembers`], rows: [
          [`"Book a room if it is free"`, `The room's bookings, in a form that answers "does anything overlap this slot?" quickly`],
          [`"Back-to-back meetings are allowed"`, `Nothing extra: half-open intervals handle it`],
          [`"Exactly one of two concurrent requests succeeds"`, `The lock that makes check-then-insert one step`]
        ] },
        { type: `text`, html: `<p>The first key decision: <strong>how should a room store its bookings?</strong> Everything else (the cost of each request, what the lock protects) follows from it.</p>` },
        { type: `compare`, items: [
          { title: `Good: a list, scanned for overlap`, tone: `warn`, html: `<p><code>List&lt;Booking&gt;</code>; test the new slot against every booking with <code>overlaps</code>. Correct and obvious, O(n) per request. With a few meetings a day per room that is honestly fine, but it doesn't use the one fact that makes this problem easy: a room's bookings never overlap each other.</p>` },
          { title: `Better: a list sorted by start`, tone: `info`, html: `<p>Binary-search for the first booking starting at or after the new start; only it and the one before can clash. The check drops to O(log n), but inserting into the middle of an array shifts elements, O(n). Perfectly reasonable, and what the Go version uses, because Go has no sorted map in its standard library.</p>` },
          { title: `Great: a TreeMap per room, neighbours only`, tone: `ok`, html: `<p><code>TreeMap&lt;Instant, Booking&gt;</code> keyed by start. Because stored bookings never overlap, sorted by start they are also sorted by end, so only <code>floorEntry(start)</code> (which clashes if it ends after our start) and <code>ceilingEntry(start)</code> (which clashes if it starts before our end) can clash. O(log n) to check and to insert, and the code says exactly why it is correct.</p>` }
        ] },
        { type: `text`, html: `<p>We take the TreeMap. Two more choices follow. <code>Interval</code> validates itself in its constructor, so a zero-length or reversed slot can't exist anywhere in the system. And <code>Booking</code> is immutable: a reschedule makes a new object with the same id, which lets the scheduler ask "is this still the current version?" with a simple identity check under the lock.</p>` },
        { type: `table`, headers: [`Need`, `Method on RoomSchedule`], rows: [
          [`Is a slot free? (caller holds the lock)`, `<code>boolean isFree(Interval when)</code>`],
          [`Store a booking that passed the check`, `<code>void add(Booking b)</code>`],
          [`Remove exactly this booking`, `<code>void remove(Booking b)</code>`],
          [`Let the scheduler lock it, alone or with another room`, `<code>final ReentrantLock lock</code>`]
        ] },
        { type: `code`, lang: `java`, title: `Interval, Room and Booking`, code: `/** Half-open [start, end): the end instant is not part of the meeting. */
record Interval(Instant start, Instant end) {
    Interval {
        Objects.requireNonNull(start);
        Objects.requireNonNull(end);
        if (!start.isBefore(end)) throw new IllegalArgumentException("start must be before end");   // zero-length or reversed
    }
    boolean overlaps(Interval o) { return start.isBefore(o.end) && o.start.isBefore(end); }
}

enum Equipment { PROJECTOR, VIDEO_CONF, WHITEBOARD }

record Room(String id, int floor, int capacity, Set<Equipment> equipment) {
    Room { equipment = Set.copyOf(equipment); }
    boolean fits(RoomQuery q) { return capacity >= q.minCapacity() && equipment.containsAll(q.equipment()); }
}

record RoomQuery(int minCapacity, Set<Equipment> equipment, OptionalInt preferredFloor) {
    RoomQuery { equipment = Set.copyOf(equipment); }
    boolean onPreferredFloor(Room r) { return preferredFloor.isPresent() && preferredFloor.getAsInt() == r.floor(); }
}

record MeetingRequest(String title, String organizer, Set<String> attendees, Interval when) {
    MeetingRequest { attendees = Set.copyOf(attendees); }
    MeetingRequest at(Interval newWhen) { return new MeetingRequest(title, organizer, attendees, newWhen); }
    Set<String> people() {
        Set<String> all = new HashSet<>(attendees);
        all.add(organizer);
        return all;
    }
}

/** Immutable: a reschedule creates a new Booking with the same id. */
record Booking(String id, String roomId, MeetingRequest meeting) {
    Interval when() { return meeting.when(); }
    Booking movedTo(String newRoomId, Interval newWhen) { return new Booking(id, newRoomId, meeting.at(newWhen)); }
}` }
      ] },
      { id: `locking-design`, title: `Class design: who guards a room`, kicker: `Step 3: class design`, blocks: [
        { type: `text`, html: `<p>The second key decision. Booking is <strong>check, then insert</strong>: if two threads both check before either inserts, both see a free slot and the room is double booked. Whatever we choose must make those two steps one atomic unit.</p>` },
        { type: `compare`, items: [
          { title: `Good: one global lock`, tone: `warn`, html: `<p>Every book, cancel and reschedule takes one scheduler-wide lock. Correct, and a cross-room move needs no thought. But a booking for room R7 waits behind one for R2, although they can never conflict; the whole office is serialised.</p>` },
          { title: `Better: optimistic versions`, tone: `info`, html: `<p>Each room holds an immutable sorted list and a version. A writer copies the list, checks, inserts and publishes with compare-and-set; if the version moved, it retries. Readers never block. Good when a room's day is read far more than it is booked, and it maps directly to <code>UPDATE ... WHERE version = ?</code> in a database. Under contention it retries, and a two-room move needs both versions to hold at once, which is awkward.</p>` },
          { title: `Great: a lock per room`, tone: `ok`, html: `<p>The invariant "no overlap" is per room, so the lock is per room too. Check-then-insert happens under that room's lock; different rooms run in parallel. A move between two rooms takes both locks, always in room-id order, so two opposite moves can't deadlock. Simple to explain and to test.</p>` }
        ] },
        { type: `text`, html: `<p>We take a lock per room. Two smaller decisions ride along: the selection rule is a <strong>Strategy</strong>, because the requirement says it is pluggable and it really does vary (smallest fit, same floor, least used); and notifications are an <strong>Observer</strong>, fired <em>after</em> the room lock is released, so a slow e-mail server can never hold up bookings for that room.</p>` },
        { type: `keypoints`, items: [
          `<strong>A concurrent map is not a lock.</strong> A <code>ConcurrentSkipListMap</code> makes each <code>put</code> atomic, but [9:00, 10:00) and [9:30, 10:30) have different keys, so two threads can both check, both see free and both put.`,
          `<strong>The indexes follow the room lock.</strong> The id map and the person index are concurrent maps, and a booking's entries change only while its room's lock is held, so cancel and reschedule can re-check "still current?" under that lock.`,
          `<strong>One lock order for the whole system:</strong> rooms by id, never the other way round. That rule is the entire deadlock argument.`
        ] }
      ] },
      { id: `class-diagram`, title: `Final class design`, kicker: `Step 3: class design`, blocks: [
        { type: `code`, lang: `java`, title: `Final class design`, code: `final class MeetingScheduler {
    private final Map<String, RoomSchedule> rooms;            // fixed at construction
    private final RoomSelectionStrategy selection;
    private final Map<String, Booking> bookings;              // id -> current version
    private final Map<String, Set<String>> byPerson;          // person -> booking ids
    private final List<MeetingListener> listeners;

    Booking book(String roomId, MeetingRequest request);               // throws RoomUnavailableException
    Booking bookAny(RoomQuery query, MeetingRequest request);          // throws NoRoomAvailableException
    void cancel(String bookingId);
    Booking reschedule(String bookingId, String roomId, Interval when); // all or nothing
    List<Booking> calendarOf(String person, Interval window);
    void addListener(MeetingListener listener);
}

final class RoomSchedule {
    final Room room;
    final ReentrantLock lock;                                 // guards byStart
    private final TreeMap<Instant, Booking> byStart;          // never overlapping

    boolean isFree(Interval when);                            // floor and ceiling neighbours only
    void add(Booking b);
    void remove(Booking b);
}

record Interval(Instant start, Instant end)        { boolean overlaps(Interval o); }
record Room(String id, int floor, int capacity, Set<Equipment> equipment) { boolean fits(RoomQuery q); }
record MeetingRequest(String title, String organizer, Set<String> attendees, Interval when) {}
record Booking(String id, String roomId, MeetingRequest meeting) {}

interface RoomSelectionStrategy { List<Room> rank(Collection<Room> rooms, RoomQuery query); }
interface MeetingListener       { void onChange(MeetingEvent event); }` },
        { type: `text`, html: `<p>The scheduler coordinates and never inspects a room's bookings directly; a room schedule enforces "no overlap" and never looks at other rooms or people. Everything shared between threads is either immutable (rooms, requests, bookings, the room map), concurrent (the indexes, the listener list) or guarded by exactly one room lock (each TreeMap).</p>` }
      ] },
      { id: `booking-impl`, title: `Implementation: is the room free, and booking it`, kicker: `Step 4: implementation`, blocks: [
        { type: `text`, html: `<p>Check what the interviewer wants: working code, pseudocode or a walkthrough. For each method, write the normal path first, then the edge cases. The normal path of a booking is: lock the room, ask <code>isFree</code>, insert, unlock, notify. Before coding <code>isFree</code>, compare the overlap checks on one example: room R1 holds 9:00-10:00 and 11:00-12:00.</p>` },
        { type: `table`, headers: [`Check`, `Bookings examined`, `Request 10:00-11:00`, `Request 10:30-11:30`, `Verdict`], rows: [
          [`Closed intervals, scan all`, `All n`, `Rejected: shares 10:00 and 11:00`, `Rejected`, `Back-to-back is impossible`],
          [`Half-open, scan all`, `All n`, `Accepted`, `Rejected by the 11:00 meeting`, `Correct, O(n)`],
          [`Half-open, floor and ceiling`, `Two, whatever n is`, `Accepted: floor 9:00 ends at 10:00, ceiling 11:00 starts at 11:00`, `Rejected: ceiling 11:00 starts before 11:30`, `Correct, O(log n)`]
        ] },
        { type: `text`, html: `<p>The overlap test itself, <code>a.start &lt; b.end &amp;&amp; b.start &lt; a.end</code>, is easiest to trust from the opposite side: two slots are disjoint only if one ends at or before the other starts. Negate that and you get the test. Here it is on five pairs, run through a small port of the code:</p>` },
        { type: `code`, lang: `text`, title: `Overlap test on five pairs`, code: `[09:00, 10:00) vs [10:00, 11:00) -> false     back to back
[09:00, 10:00) vs [09:30, 10:30) -> true      partial overlap
[09:00, 12:00) vs [10:00, 11:00) -> true      containment
[09:00, 10:00) vs [09:00, 10:00) -> true      identical slots
[09:00, 10:00) vs [11:00, 12:00) -> false     a gap` },
        { type: `list`, title: `Edge cases the code must handle`, items: [
          `Back-to-back on either side: the floor neighbour ends exactly at our start, or the ceiling neighbour starts exactly at our end. Both must pass, which is why the comparisons are <code>isAfter</code> and <code>isBefore</code>, never the inclusive versions.`,
          `Zero-length or reversed slot: rejected by the <code>Interval</code> constructor, before any lock is taken.`,
          `A slot identical to an existing one: <code>floorEntry</code> returns the booking with the equal start, which ends after our start: not free.`,
          `A slot that swallows existing bookings (8:00-13:00): the ceiling neighbour starts at 9:00, before 13:00: not free. No need to look further.`,
          `Unknown room id: <code>IllegalArgumentException</code>; nothing is locked or changed.`
        ] },
        { type: `code`, lang: `java`, title: `RoomSchedule`, code: `/** One room's bookings. byStart is read and written only while holding lock. */
final class RoomSchedule {
    final Room room;
    final ReentrantLock lock = new ReentrantLock();
    private final TreeMap<Instant, Booking> byStart = new TreeMap<>();   // never overlapping

    RoomSchedule(Room room) { this.room = room; }

    /** Caller holds lock. Stored bookings never overlap, so only the two neighbours of our start can clash. */
    boolean isFree(Interval when) {
        Map.Entry<Instant, Booking> before = byStart.floorEntry(when.start());     // starts at or before us
        if (before != null && before.getValue().when().end().isAfter(when.start())) return false;
        Map.Entry<Instant, Booking> after = byStart.ceilingEntry(when.start());    // starts at or after us
        return after == null || !after.getValue().when().start().isBefore(when.end());
    }

    void add(Booking b)    { byStart.put(b.when().start(), b); }      // caller holds lock and checked isFree
    void remove(Booking b) { byStart.remove(b.when().start(), b); }   // caller holds lock; only this exact booking
}` },
        { type: `text`, html: `<p>Finding "any room that fits" is the other half of booking. The strategy only ranks; the scheduler then tries the rooms in that order, because the best room may be taken a moment after ranking.</p>` },
        { type: `code`, lang: `java`, title: `Room selection and notifications`, code: `interface RoomSelectionStrategy {
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
                .thenComparing(Room::id))                                   // deterministic ties
            .toList();
    }
}

enum ChangeType { BOOKED, MOVED, CANCELLED }

record MeetingEvent(ChangeType type, Booking booking, Booking previous) {}   // previous: only for MOVED

interface MeetingListener { void onChange(MeetingEvent event); }            // e-mail, chat, calendar sync` }
      ] },
      { id: `scheduler-impl`, title: `Implementation: the scheduler, cancel and reschedule`, kicker: `Step 4: implementation`, blocks: [
        { type: `text`, html: `<p><code>book</code> and <code>bookAny</code> share one private step, <code>tryBook</code>: lock the room, check, insert into the room and both indexes, unlock, then notify. <code>bookAny</code> walks the ranked rooms and moves on if it loses a race for one. Cancel and reschedule look the booking up without a lock, take the room lock(s), then <em>re-check</em> that the booking is still the same version, because another thread may have moved or cancelled it in between.</p>` },
        { type: `text`, html: `<p>Reschedule is the method interviewers push on. Compare three ways to write it, on one example: booking b2 sits in R1 at 11:00-12:00 and should move to R2 at 9:30-10:30, which is taken; at the same moment another thread moves a meeting from R2 to R1.</p>` },
        { type: `compare`, items: [
          { title: `Weak: cancel, then book`, tone: `bad`, html: `<p>Two separate operations. The new slot is taken, so the book fails, but b2 has already been cancelled: the meeting is gone, and someone may have grabbed 11:00-12:00 in the gap. Violates "the original booking stays exactly as it was".</p>` },
          { title: `Good: lock "from", then "to"`, tone: `warn`, html: `<p>Under both locks, remove b2, check R2, insert or put b2 back. All or nothing, but the lock order follows the request: this thread holds R1 and wants R2, the other holds R2 and wants R1, and both wait forever.</p>` },
          { title: `Strong: lock both in room-id order`, tone: `ok`, html: `<p>Both threads lock R1 first, whichever way they move, so one waits holding nothing. Under the locks: re-check the version, remove b2, check R2, then insert the moved booking or restore b2. Removing first also lets a meeting move into a slot that overlaps its own old one in the same room.</p>` }
        ] },
        { type: `code`, lang: `java`, title: `MeetingScheduler`, code: `final class MeetingScheduler {
    private final Map<String, RoomSchedule> rooms;                                // fixed at construction
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
                for (String p : b.meeting().people()) {
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
            List<RoomSchedule> locked = lockInOrder(from, to);               // room-id order: no deadlock
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
                bookings.put(bookingId, moved);                             // same id and people: byPerson unchanged
            } finally { unlockAll(locked); }
            publish(new MeetingEvent(ChangeType.MOVED, moved, old));
            return moved;
        }
    }

    /** A person's meetings in a window, clashes included. Lock-free: a weakly consistent view for display. */
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
            s.add(b);                                                       // check and insert under one lock
            bookings.put(b.id(), b);
            for (String p : req.people()) byPerson.computeIfAbsent(p, k -> ConcurrentHashMap.newKeySet()).add(b.id());
        } finally { s.lock.unlock(); }
        publish(new MeetingEvent(ChangeType.BOOKED, b, null));             // outside the lock
        return Optional.of(b);
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
        { type: `keypoints`, items: [
          `<strong>Look up, lock, re-check.</strong> The booking is found without a lock, so by the time the lock is held it may have moved to a third room or been cancelled. Comparing identity under the lock and retrying from the lookup closes that gap.`,
          `<strong>Remove before checking.</strong> Moving 9:00-10:00 to 9:30-10:00 in the same room would otherwise be rejected by the meeting's own old slot.`,
          `<strong>Same room, one lock.</strong> <code>lockInOrder</code> locks a room once when both ends of a move are the same room. <code>ReentrantLock</code> would survive a double lock, but Go's mutex would deadlock, and it is clearer either way.`,
          `<strong>Notify after unlocking</strong>, and isolate listener failures, so notification code can neither block a room nor break a booking that already happened.`
        ] },
        { type: `callout`, tone: `warning`, title: `Why this is thread-safe`, html: `<p>Rooms, requests, bookings and the room map are immutable, so they are shared freely. Each room's <code>TreeMap</code> is touched only while holding that room's lock, so check-then-insert is atomic per room, and requests for different rooms never wait for each other. The <code>bookings</code> and <code>byPerson</code> maps are concurrent, and a booking's entries change only under its room's lock, which is what makes the "still current?" re-check sound. A move takes two room locks, always in room-id order, and nothing ever takes a room lock while holding another lock out of that order, so there is no cycle and no deadlock. Listeners sit in a <code>CopyOnWriteArrayList</code> and run after unlocking.</p>` }
      ] },
      { id: `verification`, title: `Verifying with a trace`, kicker: `Step 5: verification`, blocks: [
        { type: `text`, html: `<p>Walk through a concrete scenario call by call before the interviewer does. Rooms: R1 (floor 2, 4 seats, whiteboard), R2 (floor 3, 8 seats, projector and video), R3 (floor 3, 12 seats, projector). All times are on one day; the line after each successful call shows R1 and R2. This trace is the output of a small port of the code above.</p>` },
        { type: `code`, lang: `text`, title: `Call by call`, code: `book(R1, alice, [09:00, 10:00))  -> b1  (floor none, ceiling none)
   R1{b1 09:00-10:00}  R2{}
book(R1, bob, [11:00, 12:00))  -> b2  (floor b1, ceiling none)
   R1{b1 09:00-10:00, b2 11:00-12:00}  R2{}
book(R1, carol, [09:30, 10:30))  RoomUnavailable: floor b1 [09:00, 10:00) ends after 09:30
book(R1, dan, [10:00, 11:00))  -> b3  (floor b1, ceiling b2)
   R1{b1 09:00-10:00, b3 10:00-11:00, b2 11:00-12:00}  R2{}
book(R1, erin, 10:30-10:30)  rejected before any lock: start must be before end
book(R1, erin, 11:00-10:00)  rejected before any lock: start must be before end
bookAny(cap>=6, PROJECTOR, floor 3, frank, [09:00, 10:00))  ranked: R2, R3
   R2 free (floor none, ceiling none) -> b4
   R1{b1 09:00-10:00, b3 10:00-11:00, b2 11:00-12:00}  R2{b4 09:00-10:00}
reschedule(b2, R2, [09:30, 10:30))  lock R1 then R2; remove b2; RoomUnavailable: floor b4 [09:00, 10:00) ends after 09:30; put b2 back
   R1{b1 09:00-10:00, b3 10:00-11:00, b2 11:00-12:00}  R2{b4 09:00-10:00}
reschedule(b2, R2, [10:00, 11:00))  lock R1 then R2; remove b2; free (floor b4, ceiling none); moved
   R1{b1 09:00-10:00, b3 10:00-11:00}  R2{b4 09:00-10:00, b2 10:00-11:00}
reschedule(b1, R1, [09:30, 10:00))  lock R1; remove b1; free (floor none, ceiling b3); moved
   R1{b1 09:30-10:00, b3 10:00-11:00}  R2{b4 09:00-10:00, b2 10:00-11:00}
cancel(b3)
   R1{b1 09:30-10:00}  R2{b4 09:00-10:00, b2 10:00-11:00}` },
        { type: `keypoints`, items: [
          `Carol's overlap was caught by one neighbour, without scanning R1. Dan's 10:00-11:00 fitted back to back on <em>both</em> sides: the floor ends at 10:00 and the ceiling starts at 11:00.`,
          `Erin's zero-length and reversed slots never reached a room: the <code>Interval</code> constructor rejected them.`,
          `The failed reschedule left b2 exactly where it was; the successful one moved it with the same id, so Bob's calendar needed no update.`,
          `Moving b1 from 9:00-10:00 to 9:30-10:00 only worked because b1 was removed before the check; otherwise its own old slot would have been the floor neighbour.`
        ] }
      ] }
    ],
    levels: levels(
      [`Rooms, bookings and a scheduler whose book and cancel work, with a correct overlap test; half-open intervals with a hint is fine.`, `A list scan for overlap is acceptable, as long as the candidate can explain back-to-back meetings.`, `Notices that two people can race for the same room and that check-then-insert needs a lock, even if it is one global lock.`],
      [`Asks about back-to-back meetings unprompted and models <code>[start, end)</code> in an <code>Interval</code> that can't be built invalid.`, `The O(log n) neighbour check on a sorted map, and the reason it is correct: a room's bookings never overlap, so they are sorted by end too.`, `A lock per room with check-then-insert inside it, and why a concurrent map alone doesn't prevent double booking.`, `A selection strategy driven by the pluggable requirement, notifications outside the lock, and a reschedule that restores the old slot on failure.`],
      [`Rejects nouns crisply (person and calendar are not classes) and keeps the design to two real classes plus value types.`, `Cross-room reschedule with ordered locking and the look-up, lock, re-check loop, without prompting.`, `Weighs a global lock, optimistic versions and per-room locks, and knows which one survives in a database (an exclusion constraint or a locked room row).`, `Sketches recurring series (all or nothing), the hotel variant (counts per night and expiring holds) and the minimum-rooms sweep, naming exactly which class each one changes.`]
    ),
    concepts: [
      { term: `Half-open interval`, def: `A slot <code>[start, end)</code> includes its start but not its end.`, why: `Back-to-back meetings don't clash, and durations are simply end minus start.` },
      { term: `Overlap test`, def: `Two slots overlap exactly when <code>a.start &lt; b.end &amp;&amp; b.start &lt; a.end</code>.`, why: `One symmetric condition covers containment, partial overlap and identical slots.`, ex: `[9, 10) and [10, 11): 10 &lt; 10 is false, so no overlap.` },
      { term: `Neighbour check`, def: `In a <code>TreeMap</code> keyed by start, test only <code>floorEntry(start)</code> and <code>ceilingEntry(start)</code>.`, why: `A room's bookings never overlap, so if those two don't clash nothing else can: O(log n), not a scan.` },
      { term: `Atomic check-then-insert`, def: `Check that the slot is free and insert the booking inside one critical section.`, why: `Checked separately, two requests can both see "free" and both insert: a double booking.` },
      { term: `Lock per room`, def: `Each <code>RoomSchedule</code> has its own <code>ReentrantLock</code> guarding its TreeMap.`, why: `The no-overlap invariant is per room, so that is the natural unit; different rooms never contend.` },
      { term: `Ordered locking`, def: `When a move touches two rooms, lock them in room-id order and unlock in reverse.`, why: `Opposite moves (R1 to R2, R2 to R1) can't each hold one lock and wait for the other.` },
      { term: `Look up, lock, re-check`, def: `Find the booking without a lock, lock its room, then confirm it is still the same immutable version; otherwise retry.`, why: `Another thread may have moved or cancelled it between the lookup and the lock.` },
      { term: `Room selection strategy`, def: `An interface that ranks the rooms fitting capacity and equipment; <code>SmallestFitFirst</code> is one rule.`, why: `The requirement says the rule is pluggable, and it changes (same floor, nearest, least used).` },
      { term: `Observer outside the lock`, def: `Listeners get booked, moved and cancelled events after the room lock is released.`, why: `Slow or failing notification code can't block bookings or undo one that happened.` }
    ],
    interview: [
      { q: `Why use half-open intervals?`, a: `Because a meeting that ends at 10:00 and one that starts at 10:00 should both fit. With [start, end) the end instant isn't part of the meeting, so the test a.start &lt; b.end and b.start &lt; a.end says they don't clash. It also makes lengths simple (end minus start) and splits a day into slots with no gaps or double counting. Closed intervals push people into "ends at 9:59", which breaks durations.`, diff: `easy` },
      { q: `Why aren't Person and Calendar classes?`, a: `Nothing in the requirements gives a person state or behaviour: people are ids that appear as organizer and attendees. A calendar is a query, "this person's bookings in a window", served by an index from person id to booking ids. Making them classes would add objects that just wrap a string or a list. If people later gained working hours or time zones, a Person record would earn its place.`, diff: `easy` },
      { q: `How do you check whether a room is free quickly, and why is it correct?`, a: `Keep each room's bookings in a TreeMap keyed by start. A room's bookings never overlap each other, so sorted by start they are also sorted by end. Only two bookings can clash with a new slot: the one starting at or before its start (floorEntry), which clashes if it ends after our start, and the one starting at or after it (ceilingEntry), which clashes if it starts before our end. Anything further left ends even earlier; anything further right starts even later. O(log n) instead of a scan.`, diff: `medium` },
      { q: `Two users book the same room for overlapping times at the same instant. What happens?`, a: `Exactly one wins. Booking is check-then-insert under that room's lock, so the second request only checks after the first has inserted, finds it as a neighbour and fails. A ConcurrentSkipListMap on its own is not enough: each put is atomic, but two threads can both check, both see free and both put under different start keys. One global lock would also be correct but serialises every room in the building.`, diff: `medium` },
      { q: `How do you reschedule a meeting into a different room without losing it or deadlocking?`, a: `Lock both rooms, always in room-id order, so two opposite moves can't each hold one lock and wait for the other. Under both locks, re-check that the booking is still the version you looked up, remove it from the old room, check the new slot, then insert the new version or put the old one back and fail. Nobody ever sees the meeting in both rooms or in neither, and notifications go out after unlocking. Cancel-then-book is wrong: it loses the old slot if the new one is taken.`, diff: `hard` },
      { q: `Why is Booking immutable, and how does that help concurrency?`, a: `A reschedule creates a new Booking object with the same id instead of mutating the old one. The scheduler can then look a booking up without a lock, take the room lock, and ask "is the map still pointing at this exact object?". If not, someone moved or cancelled it in between, so it retries. Immutable bookings are also safe to hand to listeners and callers, who can't corrupt the room's TreeMap by changing a start time behind its back.`, diff: `medium` },
      { q: `How does this work with several servers and a database?`, a: `In-memory locks protect one process only, so the database must enforce no overlap. PostgreSQL can do it declaratively with an exclusion constraint on (room_id with =, time range with &amp;&amp;). Otherwise lock the room's row with SELECT ... FOR UPDATE inside the transaction, check for an overlapping booking and insert: the per-room lock, in the database. With fixed slots (say 30 minutes), a unique key on (room, slot) works in any database.`, diff: `hard` }
    ],
    cheatsheet: [
      { title: `Scheduler in one screen`, type: `code`, lang: `java`, body: `record Interval(Instant start, Instant end) {                  // start before end, or it throws
    boolean overlaps(Interval o) { return start.isBefore(o.end) && o.start.isBefore(end); }   // [start, end)
}
record Booking(String id, String roomId, MeetingRequest meeting) {}   // immutable; a move = new object, same id

final class RoomSchedule {
    ReentrantLock lock; TreeMap<Instant, Booking> byStart;     // never overlapping
    boolean isFree(Interval w);                                // floorEntry(w.start) ends after w.start?
                                                               // ceilingEntry(w.start) starts before w.end?
}

final class MeetingScheduler {
    Booking book(String roomId, MeetingRequest r);             // lock room, isFree, insert, unlock, notify
    Booking bookAny(RoomQuery q, MeetingRequest r);            // strategy ranks rooms; first tryBook wins
    void cancel(String id);                                    // look up, lock, re-check version, remove
    Booking reschedule(String id, String roomId, Interval w);  // lock rooms by id; remove, check, add or restore
    List<Booking> calendarOf(String person, Interval window);  // person index; shows clashes
}` },
      { title: `Follow-ups and where they land`, type: `table`, headers: [`Follow-up`, `Change`], rows: [
        [`Recurring meetings`, `A <code>Recurrence</code> value type and <code>bookRecurring</code> on the scheduler: check every occurrence under the room lock, insert all or none (Deep Dives)`],
        [`Attendees must be free`, `Person locks taken after the room lock, in name order; <code>tryBook</code> also checks <code>calendarOf</code> (Deep Dives)`],
        [`Reschedule across rooms`, `Already ordered locking; a whole series moves under every room lock it touches (Deep Dives)`],
        [`Hotel booking`, `A new <code>HotelInventory</code>: counts per room type per night, holds that expire (Deep Dives)`],
        [`Minimum rooms for a day`, `A static sweep over sorted starts and ends; no class changes (Deep Dives)`],
        [`Several servers`, `The guarantee moves to the database: exclusion constraint or a locked room row (Deep Dives)`],
        [`A different room rule`, `A new <code>RoomSelectionStrategy</code>`],
        [`Slack or calendar sync`, `A new <code>MeetingListener</code>`]
      ] }
    ],
    labs: []
  });
})();
