// Main tab: Chapter 2, Delivery framework. Format: DeepSection[] in public/shared/notes.d.ts.
window.MAIN = window.MAIN || {};
MAIN.ch2 = [
  {
    id: "a-plan-you-can-repeat",
    title: "A plan you can run on autopilot",
    kicker: "Mental model",
    blocks: [
      { type: "text", html: `<p>Most LLD rounds are lost on time, not knowledge. The fix is to run the same five steps every time, so you never have to decide what to do next under pressure. Each step leaves something visible on the board, and that artifact becomes the input to the next step: the feature list tells you which nouns matter, the nouns become classes, the class signatures tell you what to implement, and the implemented code is what you stretch at the end.</p><p>Treat the framework as a conversation with checkpoints, not a script. At the end of each step, summarise in one sentence and ask whether it matches what the interviewer had in mind. A misunderstanding caught at minute eight costs a sentence; one caught at minute thirty costs the interview.</p>` },
      { type: "table", title: "A 45-minute clock", headers: ["Minutes", "Step", "On the board when you move on"], rows: [
        ["0 to 5", "Requirements", "A numbered feature list, the key rules, and an out-of-scope list"],
        ["5 to 10", "Entities and relationships", "Four to eight nouns, with arrows for owns, uses and is-a"],
        ["10 to 20", "Class design", "Fields and public method signatures; enums; interfaces only where variation is stated"],
        ["20 to 40", "Implementation", "The core flows in code, happy path first, then the important failures"],
        ["40 to 45", "Extensibility", "Two or three new requirements, each with the class that changes and the ones that don't"]
      ] },
      { type: "callout", tone: "tip", html: `<p>If you fall behind, take the time from class design detail, never from implementation. A rough signature list plus working code beats a polished diagram with no code.</p>` }
    ]
  },
  {
    id: "requirements-and-entities",
    title: "Steps 1 and 2: requirements and entities, worked through",
    kicker: "Worked example",
    blocks: [
      { type: "text", html: `<p>Prompt: <em>"Design a meeting-room booking system for an office."</em> Ask only questions whose answers change the design, and explain why you are asking. That keeps the requirements step short and shows the interviewer you know what matters.</p>` },
      { type: "table", headers: ["Question", "What the answer changes"], rows: [
        ["Do rooms differ in ways that matter, like capacity or equipment?", "Whether booking includes a search or filter rule"],
        ["What are the booking rules: time granularity, and can bookings overlap?", "The core invariant the code must protect"],
        ["Can a booking be cancelled or moved?", "Whether a booking needs a lifecycle"],
        ["Are recurring meetings in scope?", "A recurrence model, which is usually deferred"],
        ["Can two people try to book the same room at the same moment?", "Whether booking must be atomic"]
      ] },
      { type: "list", title: "What goes on the board", items: [
        "<strong>F1.</strong> An employee books a room for a time range if it has enough seats and no overlapping booking.",
        "<strong>F2.</strong> An employee can cancel their own booking.",
        "<strong>F3.</strong> An employee can list free rooms for a time range and a minimum capacity.",
        "<strong>Non-functional.</strong> Many employees book at once; a room must never be double-booked.",
        "<strong>Out of scope.</strong> Recurring meetings, calendar invites, authentication, persistence."
      ] },
      { type: "text", html: `<p>Now underline the nouns and decide what each becomes. Keep a noun as a class if it has identity, state that changes, or a rule attached. Turn plain values into records, enums or fields, and drop actors the system doesn't need to track.</p>` },
      { type: "table", headers: ["Noun", "Becomes", "Why"], rows: [
        ["Room", "Class (or record)", "Has an id and a capacity; owns one calendar"],
        ["Booking", "Record", "An immutable fact: who, which room, which time range"],
        ["Time range", "Record with an <code>overlaps</code> method", "The overlap rule needs exactly one home"],
        ["Room calendar", "Class", "Holds one room's bookings and enforces no overlap"],
        ["Booking service", "Class", "Finds a suitable room and asks its calendar to book"],
        ["Employee", "Just an id", "The system doesn't store anything else about them"]
      ] }
    ]
  },
  {
    id: "class-design-and-code",
    title: "Steps 3 and 4: class design and the core code",
    kicker: "Build it",
    blocks: [
      { type: "text", html: `<p>Place each rule where its data lives. The time range knows whether it overlaps another range. The room calendar knows its own bookings, so it decides whether a new one fits. The booking service owns the list of rooms and picks one, but it never inspects a calendar's bookings itself. Write signatures first, get a nod, then fill in the bodies for the core flow.</p>` },
      { type: "code", lang: "java", title: "A room calendar that refuses overlapping bookings", code: `record TimeRange(Instant start, Instant end) {
    TimeRange {
        if (!start.isBefore(end)) throw new IllegalArgumentException("empty range");
    }
    boolean overlaps(TimeRange o) { return start.isBefore(o.end) && o.start.isBefore(end); }
}

record Booking(String id, String roomId, String employeeId, TimeRange range) {}

final class RoomCalendar {
    private final String roomId;
    private final List<Booking> bookings = new ArrayList<>();   // guarded by this

    RoomCalendar(String roomId) { this.roomId = roomId; }

    synchronized Optional<Booking> book(String employeeId, TimeRange range) {
        for (Booking b : bookings) {
            if (b.range().overlaps(range)) return Optional.empty();
        }
        Booking booking = new Booking(UUID.randomUUID().toString(), roomId, employeeId, range);
        bookings.add(booking);
        return Optional.of(booking);
    }

    synchronized boolean cancel(String bookingId, String employeeId) {
        return bookings.removeIf(b -> b.id().equals(bookingId) && b.employeeId().equals(employeeId));
    }
}` },
      { type: "text", html: `<p>This is safe under concurrent use because the overlap check and the insert form one critical section per room: two employees racing for the same slot are serialised, and the second sees the first's booking. Bookings for different rooms use different locks, so they never wait on each other. <code>TimeRange</code> and <code>Booking</code> are immutable records, so handing them back to callers can't expose shared mutable state. The booking service would hold its calendars in a map built once at startup and never modified, so reading it needs no lock.</p>` },
      { type: "callout", tone: "interview", html: `<p>Narrate while you code: <em>"Check and insert have to be atomic or two people get the same slot, so the calendar method is synchronized. That's per room, so different rooms don't contend."</em> One sentence like this covers concurrency without derailing the implementation.</p>` }
    ]
  },
  {
    id: "extensibility-and-checkpoints",
    title: "Step 5: show where change lands",
    kicker: "Finish strong",
    blocks: [
      { type: "text", html: `<p>Save the last few minutes to walk through likely changes. The goal is to show that each one touches one or two classes and leaves the core untouched. The out-of-scope list from step 1 is your source of ready-made examples.</p>` },
      { type: "table", headers: ["New requirement", "What changes", "What doesn't"], rows: [
        ["Recurring weekly meetings", "A recurrence rule expands into time ranges; the service books them all or none", "<code>RoomCalendar</code>, <code>TimeRange</code>"],
        ["Pick the smallest room that fits, not the first", "Extract a room-selection strategy and inject it", "Calendar logic and booking records"],
        ["Notify attendees", "The service publishes a booking-created event; a notifier listens", "Rooms and calendars"],
        ["Several office buildings", "An office groups its rooms; the service picks an office first", "Each room's calendar"]
      ] },
      { type: "callout", tone: "mistake", title: "How the plan usually breaks", html: `<p>Ten minutes of requirements questions, most of which don't change the design. Perfecting the class diagram while the clock runs. Coding silently for fifteen minutes. Skipping step 5, so the interviewer never sees that the design survives change. Each one is fixed by glancing at the clock at every checkpoint and moving on when the step's artifact is good enough.</p>` }
    ]
  }
];
