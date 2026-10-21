// LLD problem breakdown: Movie Ticket Booking. Format: Chapter in public/shared/notes.d.ts; shared helpers in data-part2.js.
// Imports are omitted in the code.
(function () {
const { levels, PRACTICE_TIP } = LLD_PROBLEMS_KIT;

window.DATA.chapters.push({
    id: `movie-ticket-booking`, part: 2, number: 0, difficulty: `medium`,
    title: `Movie Ticket Booking: seat holds, payment and exactly-one-wins`,
    references: [{ title: `awesome-low-level-design: Movie Ticket Booking System`, url: `https://github.com/ashishps1/awesome-low-level-design/blob/main/problems/movie-ticket-booking-system.md` }],
    overview: `A BookMyShow-style system: find a movie, pick a show, choose seats on the seat map, pay, and get a booking; cancel before the show if plans change. The hard part is not the catalogue but the seats: two people click the same seat at the same moment, payment takes minutes and sometimes fails, and users double-click everything. This page works the problem in interview order: clarify the requirements, find the entities, design the classes top down, implement holding, confirming and cancelling (comparing a simple, a better and a strong option at each decision), verify with a call-by-call trace, then handle follow-ups. The design lands on seat state owned by each <strong>Show</strong>, a <strong>hold with an expiry</strong> claimed all-or-nothing under one lock per show, payment <strong>outside the lock</strong>, and an idempotent confirm.`,
    source: { title: `Hello Interview: Movie Ticket Booking (LLD) problem breakdown`, url: `https://www.hellointerview.com/learn/low-level-design/problem-breakdowns/bookmyshow` },
    problem: [
      { id: `understanding`, title: `What a ticket booking system does`, kicker: `The problem`, blocks: [
        { type: `problem`, html: `<p>Cinemas in many cities run several screens, and each screen plays a few shows a day. A user searches for a movie, picks a show, sees which seats are free, chooses some, pays, and receives a booking. Thousands of people use the same seat maps at once, so two of them will regularly try to take the same seat in the same second.</p>` },
        { type: `text`, html: `<p>The prompt is usually one line: <em>"Design a movie ticket booking system like BookMyShow: users browse movies and shows, pick seats and book them."</em> That hides the real questions: what happens to a seat while someone is paying, what happens when two people want it, and how payment fits in. The first few minutes go into pinning those down.</p>` }
      ] },
      { id: `clarifying`, title: `Clarifying questions`, kicker: `Step 1: requirements`, blocks: [
        { type: `text`, html: `<p>Work through four kinds of question: <strong>what the system must do</strong>, <strong>what happens with bad input</strong>, <strong>what is deliberately left out</strong>, and <strong>what might be added later</strong>. Spend one to three minutes here; every answer removes a branch you would otherwise design for.</p>` },
        { type: `table`, headers: [`You ask`, `A typical answer`, `What it decides`], rows: [
          [`Do users pick seats, or does the system assign them? How many per booking?`, `They pick specific seats, up to 10`, `State per seat, a multi-seat claim that is all or nothing, and a cap`],
          [`Is payment part of the flow?`, `Yes, through an external gateway that can be slow or decline`, `A gateway interface, and payment must never run while a lock is held`],
          [`What happens to the seats while someone is paying?`, `They are held for 10 minutes, then released if unpaid`, `A hold with an expiry, distinct from a booking`],
          [`Two people ask for overlapping seats at the same instant?`, `Exactly one gets all of theirs; the other gets nothing and is told which seats were taken`, `An atomic check-and-claim, and an error that lists the taken seats`],
          [`Do seats have different prices?`, `Regular and premium, priced per show`, `Seat categories, prices on the show, money as integer paise computed on the server`],
          [`How do users find shows?`, `Title search, then the shows of a movie in their city`, `A small catalogue with an index by movie; no search engine`],
          [`Can a booking be cancelled?`, `Before the show starts, with a full refund`, `A cancel that frees seats once and refunds through the gateway`],
          [`What about an unknown seat, an empty selection, or a show that has started?`, `Reject it with a clear error; nothing changes`, `Validation before anything is claimed`]
        ] },
        { type: `callout`, tone: `insight`, title: `What happens to a seat while someone pays?`, html: `<p>This one question decides the design. If a seat is only marked when payment succeeds, two people can both reach the payment page for it and one is charged for nothing. If it is marked as soon as it is clicked, every abandoned checkout locks seats forever. The answer is almost always "hold it for a few minutes", which means a seat has three states (free, held until a deadline, booked), and holds can run out in the middle of a payment. Asking it early shows you have seen real checkouts, and everything after it follows from the answer.</p>` }
      ] },
      { id: `final-requirements`, title: `Final requirements`, kicker: `Step 1: requirements`, blocks: [
        { type: `code`, lang: `text`, title: `Final requirements`, code: `Requirements
  1. Search movies by title (case-insensitive substring) and list the shows
     of a movie in a city, in start-time order.
  2. Theatres have screens; each screen has a fixed layout of seats in rows,
     each seat REGULAR or PREMIUM. A show is one movie on one screen at one time.
  3. See which seats of a show are free right now.
  4. Pick 1 to 10 seats and hold them for 10 minutes. All or nothing: if any
     seat is taken, nothing is held and the user is told which seats.
  5. Prices are per seat category, set per show; the total is computed on the
     server when the hold is made, in integer paise.
  6. Confirm a hold by paying through an external gateway. If the hold expires
     before payment completes, the charge is refunded and the booking fails.
  7. Concurrent requests for the same seat: exactly one wins. Repeated clicks
     on hold or confirm never create a second hold, booking or charge.
  8. Cancel a booking before the show starts: its seats are freed and refunded.
  9. Bad input (unknown show or seat, empty or oversized selection, a show
     that has started) is rejected and changes nothing.

Out of scope
  - Gateway internals, partial refunds, coupons, dynamic pricing
  - User accounts and login (a user id is given)
  - Adding or removing shows at run time; several servers and a database
  - Notifications and UI` },
        { type: `callout`, tone: `tip`, html: PRACTICE_TIP }
      ] }
    ],
    solution: [
      { id: `entities`, title: `Core entities`, kicker: `Step 2: entities`, blocks: [
        { type: `text`, html: `<p>Scan the requirements for nouns that hold state or enforce rules. A booking system is full of nouns, and most of them are plain data. Test each one before committing to a class; the interesting question is where seat state lives.</p>` },
        { type: `table`, headers: [`Candidate`, `Verdict`, `Why`], rows: [
          [`City`, `A field, not a class`, `It only filters shows; a string on the theatre is enough`],
          [`User`, `A string id, not a class`, `Accounts and login are out of scope; the id says who owns a hold or booking`],
          [`Movie`, `A record`, `Id, title, length. No rules`],
          [`Theatre`, `A record`, `Id, name, city. It groups screens but enforces nothing here`],
          [`Screen`, `A class`, `The seat layout: which seats exist and their category. Shared by every show on that screen, and never changes`],
          [`Seat`, `A record, with no status`, `Id, row, number, category. Its status cannot live on the seat: the same seat is free at 6 pm and booked at 9 pm`],
          [`Seat status`, `Derived, not stored`, `Whether a seat is free, held or booked follows from who owns it in a given show`],
          [`Show`, `A class`, `One movie on one screen at one time. Owns seat state for that screening, its holds and bookings, and the lock that keeps them consistent`],
          [`Hold`, `A record`, `A temporary claim: seats, user, price and expiry`],
          [`Booking / Ticket`, `One record: Booking`, `A paid hold. A separate Ticket per seat adds nothing until seats are scanned at the door`],
          [`Payment`, `An injected interface`, `We call a gateway and keep its reference; how it charges is out of scope`],
          [`BookingService`, `A class`, `The entry point: search, browse, hold, confirm, cancel`]
        ] },
        { type: `table`, title: `The entities we keep`, headers: [`Entity`, `Responsibility`], rows: [
          [`BookingService`, `The entry point. Holds the catalogue, routes each call to the right show, and runs the payment step. Owns no seat state.`],
          [`Show`, `Seat state for one screening: who owns each seat, the active holds and the bookings. Every change happens under its lock.`],
          [`Screen`, `The immutable layout: seat ids, rows, numbers and categories.`],
          [`Seat, Movie, Theatre`, `Immutable values.`],
          [`Hold`, `Seats claimed by one user until a deadline, with the price fixed at hold time.`],
          [`Booking`, `A confirmed hold with its payment reference. It keeps the hold's id as its confirmation number.`],
          [`PaymentGateway`, `Charge and refund, injected so tests can use a fake.`]
        ] },
        { type: `callout`, tone: `tip`, html: `<p>Say the seat-state point out loud: "Status can't be a field on Seat, because a seat belongs to a screen and a screen has many shows." It is the most common modelling mistake in this problem, and catching it early earns more credit than any pattern.</p>` }
      ] },
      { id: `service-design`, title: `Class design: BookingService`, kicker: `Step 3: class design, top down`, blocks: [
        { type: `text`, html: `<p>Start from the class outside code talks to, and derive its state and methods from the requirements rather than from intuition. For each requirement ask: what must this class remember, and what must it let callers do?</p>` },
        { type: `table`, headers: [`Requirement`, `What the service remembers`], rows: [
          [`"Search movies; list the shows of a movie in a city"`, `The movies, and the shows by id and by movie, built once`],
          [`"Confirm a hold by paying through an external gateway"`, `An injected <code>PaymentGateway</code>`],
          [`"Hold for 10 minutes"`, `The hold length and an injected <code>Clock</code>`],
          [`"Confirm and cancel take only an id"`, `Which show each hold id belongs to, in a concurrent map`]
        ] },
        { type: `table`, headers: [`Need`, `Method`], rows: [
          [`Find a movie`, `<code>List&lt;Movie&gt; searchMovies(String text)</code>`],
          [`Shows of a movie in a city`, `<code>List&lt;Show&gt; showsFor(String movieId, String city)</code>`],
          [`The seat map`, `<code>List&lt;Seat&gt; availableSeats(String showId)</code>`],
          [`Pick seats`, `<code>Hold holdSeats(String showId, String userId, List&lt;String&gt; seatIds)</code>`],
          [`Pay and book`, `<code>Booking confirm(String holdId, String userId)</code>`],
          [`Cancel`, `<code>Booking cancel(String bookingId, String userId)</code>`]
        ] },
        { type: `keypoints`, items: [
          `<strong>Hold and confirm are two calls, not one <code>book()</code>.</strong> The user picks seats, sees a price and a countdown, then pays. A single <code>book()</code> that charged inside would either hold a lock for the whole payment or sell seats it might not be able to deliver.`,
          `<strong>The service owns no seat state.</strong> It routes each call to a <code>Show</code>, because the seat rules belong next to the lock that protects them.`,
          `<strong>Gateway and clock are injected, not Singletons.</strong> Tests use a fake gateway and a fixed clock, which is also what makes the trace in Step 5 deterministic.`
        ] }
      ] },
      { id: `show-design`, title: `Class design: Show, seats and holds`, kicker: `Step 3: class design`, blocks: [
        { type: `table`, headers: [`Requirement`, `What a show remembers`], rows: [
          [`"A show is one movie on one screen at one time"`, `Its movie, theatre, screen and start instant`],
          [`"Prices per seat category, set per show"`, `An immutable map from category to paise`],
          [`"Seats are free, held or booked"`, `Who owns each seat: nobody, a hold id, or a booking id`],
          [`"Holds expire after 10 minutes"`, `Each active hold: seats, user, price, expiry`],
          [`"A repeated confirm returns the same booking"`, `Bookings by id`]
        ] },
        { type: `text`, html: `<p>The first real decision is <strong>how to represent a seat's state</strong> so that a seat can be held during payment and two buyers can never both win it.</p>` },
        { type: `compare`, items: [
          { title: `Good: a booked flag per seat`, tone: `warn`, html: `<p>A boolean, flipped when payment succeeds. Simple, but there is no state for "someone is paying", so either two people pay for one seat or seats are marked booked on click and abandoned checkouts lock them forever. Putting the flag on <code>Seat</code> is worse still: the seat belongs to the screen, so booking it for one show books it for all of them.</p>` },
          { title: `Better: a status enum, checked then set`, tone: `info`, html: `<p>AVAILABLE, LOCKED, BOOKED per show, with a timer that unlocks after ten minutes. It models checkout, but the usual version checks the status in one step and sets it in another, a timer can fire in the middle of a payment, and confirming sets BOOKED without checking that the lock is still yours. One timer task per checkout too.</p>` },
          { title: `Great: holds with an expiry, claimed atomically per show`, tone: `ok`, html: `<p>Each show maps a seat to the id that owns it. A hold records its seats and deadline. Claiming checks every requested seat and takes all of them in one locked step. Expiry is lazy: every locked call first drops holds whose deadline has passed, freeing only seats that hold still owns. Confirming re-checks the hold under the same lock, so a late payment cannot steal seats.</p>` }
        ] },
        { type: `text`, html: `<p>We take the holds. The second decision is <strong>what the lock covers</strong>.</p>` },
        { type: `compare`, items: [
          { title: `Good: one global lock`, tone: `warn`, html: `<p>Correct, and multi-seat claims are trivially all or nothing. But a booking for a 9 pm show in Pune waits for one for a matinee in Delhi. Fine for a demo, not for a country.</p>` },
          { title: `Better: a lock per seat`, tone: `info`, html: `<p>The most parallelism. But a booking spans several seats, so it must take several locks in one global order to avoid deadlock, and expiry, confirm and cancel need the same locks. Much more code to get right, for a critical section that lasts microseconds.</p>` },
          { title: `Great: a lock per show`, tone: `ok`, html: `<p>Shows are independent, so they never wait for each other. A multi-seat claim is atomic under one lock. Payment runs outside the lock, so the lock is held only for map updates. Per-seat locking stays a follow-up for a premiere with thousands of buyers on one show.</p>` }
        ] },
        { type: `text`, html: `<p>Every method that reads or changes seat state is <code>synchronized</code> on the show, which is the per-show lock. <code>Screen</code>, <code>Seat</code>, <code>Hold</code> and <code>Booking</code> are immutable, so they can be handed to other threads freely.</p>` },
        { type: `table`, headers: [`Need`, `Method on Show`], rows: [
          [`The seat map`, `<code>List&lt;Seat&gt; availableSeats(Instant now)</code>`],
          [`Claim seats, all or nothing`, `<code>Hold hold(String userId, List&lt;String&gt; seatIds, Duration ttl, Instant now)</code>`],
          [`Check a hold before charging`, `<code>Hold activeHold(String holdId, String userId, Instant now)</code>`],
          [`Find an existing booking`, `<code>Optional&lt;Booking&gt; booking(String bookingId, String userId)</code>`],
          [`Held to booked`, `<code>Booking confirm(String holdId, String userId, String paymentRef, Instant now)</code>`],
          [`Booked to free`, `<code>Booking cancel(String bookingId, String userId, Instant now)</code>`]
        ] },
        { type: `code`, lang: `java`, title: `Value types: Movie, Theatre, Seat, Screen, Hold, Booking`, code: `enum SeatCategory { REGULAR, PREMIUM }

record Movie(String id, String title, Duration length) {}

record Theatre(String id, String name, String city) {}

record Seat(String id, char row, int number, SeatCategory category) {}   // no status: that lives on the show

/** A screen's layout. Built once and never changed, so every show on it can share it without locking. */
final class Screen {
    final int number;
    private final Map<String, Seat> seats;                   // seat id -> seat, in layout order

    Screen(int number, List<Seat> layout) {
        this.number = number;
        Map<String, Seat> m = new LinkedHashMap<>();
        for (Seat s : layout) m.put(s.id(), s);
        this.seats = Collections.unmodifiableMap(m);
    }

    /** Rows from A, seats numbered from 1; the last premiumRows rows are PREMIUM. */
    static Screen grid(int number, int rows, int perRow, int premiumRows) {
        List<Seat> layout = new ArrayList<>();
        for (int r = 0; r < rows; r++) {
            char row = (char) ('A' + r);
            SeatCategory category = r >= rows - premiumRows ? SeatCategory.PREMIUM : SeatCategory.REGULAR;
            for (int n = 1; n <= perRow; n++) layout.add(new Seat("" + row + n, row, n, category));
        }
        return new Screen(number, layout);
    }

    Optional<Seat> seat(String id) { return Optional.ofNullable(seats.get(id)); }
    Collection<Seat> seats()       { return seats.values(); }
}

record Hold(String id, String userId, List<Seat> seats, long amountPaise, Instant expiresAt) {
    boolean expiredAt(Instant now) { return !now.isBefore(expiresAt); }
}

/** A paid hold. It keeps the hold's id, so the id the user saw at checkout is the confirmation number. */
record Booking(String id, String showId, String userId, List<Seat> seats, long amountPaise, String paymentRef) {}` }
      ] },
      { id: `class-diagram`, title: `Final class design`, kicker: `Step 3: class design`, blocks: [
        { type: `code`, lang: `java`, title: `Final class design`, code: `final class BookingService {
    private final Map<String, Show> shows;                   // the catalogue, fixed at construction
    private final Map<String, Show> showOfHold;              // hold (and booking) id -> show; ConcurrentHashMap
    private final PaymentGateway payments;                   // injected
    private final Clock clock;                               // injected: expiry and tests

    List<Movie> searchMovies(String text);
    List<Show> showsFor(String movieId, String city);
    List<Seat> availableSeats(String showId);
    Hold holdSeats(String showId, String userId, List<String> seatIds);
    Booking confirm(String holdId, String userId);           // charge outside the lock, then book
    Booking cancel(String bookingId, String userId);
}

final class Show {                                           // the lock: this
    final Movie movie; final Theatre theatre; final Screen screen; final Instant start;
    private final Map<SeatCategory, Long> pricePaise;
    private final Map<String, String> owner;                 // seat id -> hold or booking id
    private final Map<String, Hold> holds;
    private final Map<String, Booking> bookings;

    synchronized List<Seat> availableSeats(Instant now);
    synchronized Hold hold(String userId, List<String> seatIds, Duration ttl, Instant now);
    synchronized Hold activeHold(String holdId, String userId, Instant now);
    synchronized Optional<Booking> booking(String bookingId, String userId);
    synchronized Booking confirm(String holdId, String userId, String paymentRef, Instant now);
    synchronized Booking cancel(String bookingId, String userId, Instant now);
}

final class Screen { Optional<Seat> seat(String id); Collection<Seat> seats(); }

record Movie(String id, String title, Duration length) {}
record Theatre(String id, String name, String city) {}
record Seat(String id, char row, int number, SeatCategory category) {}
record Hold(String id, String userId, List<Seat> seats, long amountPaise, Instant expiresAt) {}
record Booking(String id, String showId, String userId, List<Seat> seats, long amountPaise, String paymentRef) {}

interface PaymentGateway {
    PaymentResult charge(String userId, long amountPaise, String idempotencyKey);
    void refund(String paymentRef);
}` },
        { type: `text`, html: `<p>The service coordinates and calls the gateway; the show owns every seat decision and never makes a network call. That split is what lets the lock stay short: anything slow happens in the service, between two quick locked calls on the show. No Singleton anywhere: one <code>BookingService</code> is built at start-up with its gateway and clock and passed to whoever needs it.</p>` }
      ] },
      { id: `hold-impl`, title: `Implementation: holding seats`, kicker: `Step 4: implementation`, blocks: [
        { type: `text`, html: `<p>Check what the interviewer wants: working code, pseudocode or a walkthrough. For each method, write the normal path first, then the edge cases. The normal path for <code>hold</code>: look up the seats, drop expired holds, check every seat is free, price them, and record one hold that owns them all.</p>` },
        { type: `list`, title: `Edge cases the code must handle`, items: [
          `Empty selection, more than 10 seats, or a seat id that is not on this screen: reject before touching any state.`,
          `The same seat twice in one request: count it once.`,
          `Partial availability (C5 free, C6 taken): hold nothing, and name the taken seats so the UI can grey them out.`,
          `A repeated click by the same user for the same seats: return the hold they already have instead of failing on their own seats.`,
          `A hold whose deadline has passed: its seats are free again, even though no timer ran.`,
          `A show that has started: no new holds.`
        ] },
        { type: `code`, lang: `java`, title: `Show: seat state, holds and bookings`, code: `final class Show {
    static final int MAX_SEATS = 10;
    final String id;
    final Movie movie;
    final Theatre theatre;
    final Screen screen;
    final Instant start;
    private final Map<SeatCategory, Long> pricePaise;        // set per show, immutable

    // Guarded by this. A seat with no owner is free. Its owner is a hold id while held, and the same id
    // once that hold is confirmed; whether the id is in holds or in bookings tells the two apart.
    private final Map<String, String> owner = new HashMap<>();   // seat id -> hold or booking id
    private final Map<String, Hold> holds = new HashMap<>();
    private final Map<String, Booking> bookings = new HashMap<>();

    Show(String id, Movie movie, Theatre theatre, Screen screen, Instant start, Map<SeatCategory, Long> pricePaise) {
        this.id = id; this.movie = movie; this.theatre = theatre; this.screen = screen; this.start = start;
        this.pricePaise = Map.copyOf(pricePaise);
    }

    synchronized List<Seat> availableSeats(Instant now) {
        expireHolds(now);
        return screen.seats().stream().filter(s -> !owner.containsKey(s.id())).toList();
    }

    /** All or nothing: every requested seat joins one new hold, or nothing changes. */
    synchronized Hold hold(String userId, List<String> seatIds, Duration ttl, Instant now) {
        Set<String> wanted = new LinkedHashSet<>(seatIds);       // the same seat twice counts once
        if (wanted.isEmpty() || wanted.size() > MAX_SEATS)
            throw new IllegalArgumentException("Choose 1 to " + MAX_SEATS + " seats");
        if (!now.isBefore(start)) throw new IllegalStateException("Show has started");
        List<Seat> seats = new ArrayList<>();
        for (String sid : wanted)
            seats.add(screen.seat(sid).orElseThrow(() -> new IllegalArgumentException("No seat " + sid)));

        expireHolds(now);
        List<String> taken = wanted.stream().filter(owner::containsKey).toList();
        if (!taken.isEmpty()) {
            Hold mine = holds.get(owner.get(taken.get(0)));
            if (mine != null && mine.userId().equals(userId) && sameSeats(mine, wanted)) return mine;   // a repeated click
            throw new SeatsUnavailableException(taken);           // nothing was claimed
        }
        long amount = 0;
        for (Seat s : seats) amount = Math.addExact(amount, pricePaise.get(s.category()));
        Hold h = new Hold(UUID.randomUUID().toString(), userId, List.copyOf(seats), amount, now.plus(ttl));
        for (Seat s : seats) owner.put(s.id(), h.id());
        holds.put(h.id(), h);
        return h;
    }

    /** The hold, if it is unexpired and belongs to userId. */
    synchronized Hold activeHold(String holdId, String userId, Instant now) {
        expireHolds(now);
        Hold h = holds.get(holdId);
        if (h == null || !h.userId().equals(userId)) throw new HoldExpiredException(holdId);
        return h;
    }

    synchronized Optional<Booking> booking(String bookingId, String userId) {
        return Optional.ofNullable(bookings.get(bookingId)).filter(b -> b.userId().equals(userId));
    }

    /** Held to booked. Repeating it for the same hold returns the same booking. */
    synchronized Booking confirm(String holdId, String userId, String paymentRef, Instant now) {
        Optional<Booking> done = booking(holdId, userId);
        if (done.isPresent()) return done.get();                  // a concurrent second click got here first
        Hold h = activeHold(holdId, userId, now);                 // throws if it expired during payment
        holds.remove(holdId);
        Booking b = new Booking(h.id(), id, userId, h.seats(), h.amountPaise(), paymentRef);
        bookings.put(b.id(), b);                                  // owner already maps the seats to this id
        return b;
    }

    /** Booked to free, once, and only before the show starts. */
    synchronized Booking cancel(String bookingId, String userId, Instant now) {
        if (!now.isBefore(start)) throw new IllegalStateException("Show has started");
        Booking b = booking(bookingId, userId).orElseThrow(() -> new NoSuchElementException("No booking " + bookingId));
        bookings.remove(bookingId);
        for (Seat s : b.seats()) owner.remove(s.id(), bookingId);
        return b;
    }

    private void expireHolds(Instant now) {                       // lazy: every locked method calls it first
        holds.values().removeIf(h -> {
            if (!h.expiredAt(now)) return false;
            for (Seat s : h.seats()) owner.remove(s.id(), h.id());   // only seats this hold still owns
            return true;
        });
    }

    private static boolean sameSeats(Hold h, Set<String> wanted) {
        return h.seats().size() == wanted.size() && h.seats().stream().allMatch(s -> wanted.contains(s.id()));
    }
}` },
        { type: `keypoints`, items: [
          `<strong>Check everything, then claim everything, in one locked call.</strong> The second of two overlapping requests waits for the lock, then sees the first one's seats as taken and claims nothing.`,
          `<strong>Lazy expiry needs no timer thread.</strong> An expired hold is dropped the next time anyone touches the show, which is the only moment it matters. A scheduled sweep can be added later only to keep seat maps tidy.`,
          `<strong>Conditional removal.</strong> <code>owner.remove(seat, holdId)</code> frees a seat only if that hold still owns it, so expiring or cancelling can never free a seat someone else now has.`,
          `<strong>The price is fixed at hold time,</strong> on the server, with <code>Math.addExact</code> on <code>long</code> paise. The client never sends an amount, and a price change mid-checkout does not change what this user pays.`
        ] }
      ] },
      { id: `confirm-impl`, title: `Implementation: paying, confirming and cancelling`, kicker: `Step 4: implementation`, blocks: [
        { type: `text`, html: `<p>The normal path for <code>confirm</code> has three steps: check the hold is still valid (a quick locked call), charge the gateway with <em>no lock held</em>, then turn the hold into a booking (another quick locked call that re-checks the hold). The middle step can take seconds, and that is where the edge cases come from.</p>` },
        { type: `list`, title: `Edge cases the code must handle`, items: [
          `The hold expires while the gateway is working: the final locked call finds it gone, so the charge is refunded and the user is told the hold expired.`,
          `The hold had already expired before paying: rejected before any charge.`,
          `A double click after success: the existing booking is found first and returned without charging again.`,
          `Two confirms racing for one hold: both charge with the hold id as idempotency key, so the gateway charges once; the second locked call finds the booking and returns it.`,
          `A declined payment: nothing changes, and the hold stays until its deadline so the user can try another card.`,
          `Cancel twice, cancel someone else's booking, or cancel after the show starts: refused.`
        ] },
        { type: `code`, lang: `java`, title: `PaymentGateway and the errors`, code: `/** Injected, so tests use a fake and production wraps the real provider. */
interface PaymentGateway {
    /** Charges at most once per idempotency key: repeating a successful charge returns the same result. */
    PaymentResult charge(String userId, long amountPaise, String idempotencyKey);
    void refund(String paymentRef);                           // safe to repeat for one reference
}

record PaymentResult(boolean success, String paymentRef) {}

class SeatsUnavailableException extends RuntimeException {
    final List<String> seatIds;                               // so the UI can grey them out
    SeatsUnavailableException(List<String> seatIds) {
        super("Seats not available: " + seatIds);
        this.seatIds = List.copyOf(seatIds);
    }
}

class HoldExpiredException extends RuntimeException {
    HoldExpiredException(String holdId) { super("Hold " + holdId + " has expired or is unknown"); }
}

class PaymentFailedException extends RuntimeException {
    PaymentFailedException(String holdId) { super("Payment declined for hold " + holdId); }
}` },
        { type: `code`, lang: `java`, title: `BookingService`, code: `final class BookingService {
    static final Duration HOLD_TTL = Duration.ofMinutes(10);
    private final List<Movie> movies;
    private final Map<String, Show> shows;                    // by id; fixed at construction
    private final Map<String, List<Show>> showsByMovie;       // each list sorted by start
    private final Map<String, Show> showOfHold = new ConcurrentHashMap<>();   // hold (and booking) id -> show
    private final PaymentGateway payments;
    private final Clock clock;

    BookingService(List<Movie> movies, List<Show> shows, PaymentGateway payments, Clock clock) {
        this.movies = List.copyOf(movies);
        this.shows = shows.stream().collect(Collectors.toUnmodifiableMap(s -> s.id, s -> s));
        this.showsByMovie = Map.copyOf(shows.stream()
            .sorted(Comparator.comparing((Show s) -> s.start))
            .collect(Collectors.groupingBy(s -> s.movie.id(), Collectors.toUnmodifiableList())));
        this.payments = payments;
        this.clock = clock;
    }

    List<Movie> searchMovies(String text) {
        String q = text.strip().toLowerCase(Locale.ROOT);
        return movies.stream().filter(m -> m.title().toLowerCase(Locale.ROOT).contains(q)).toList();
    }

    List<Show> showsFor(String movieId, String city) {
        return showsByMovie.getOrDefault(movieId, List.of()).stream()
            .filter(s -> s.theatre.city().equalsIgnoreCase(city)).toList();
    }

    List<Seat> availableSeats(String showId) { return show(showId).availableSeats(clock.instant()); }

    Hold holdSeats(String showId, String userId, List<String> seatIds) {
        Show show = show(showId);
        Hold h = show.hold(userId, seatIds, HOLD_TTL, clock.instant());
        showOfHold.put(h.id(), show);
        return h;
    }

    /** Pays for a hold and books it. Safe to call twice: the second call returns the first booking. */
    Booking confirm(String holdId, String userId) {
        Show show = showOf(holdId);
        Optional<Booking> done = show.booking(holdId, userId);
        if (done.isPresent()) return done.get();                  // already paid: don't charge again
        Hold hold = show.activeHold(holdId, userId, clock.instant());
        PaymentResult paid = payments.charge(userId, hold.amountPaise(), holdId);   // no lock held: slow call
        if (!paid.success()) throw new PaymentFailedException(holdId);              // the hold stays until it expires
        try {
            return show.confirm(holdId, userId, paid.paymentRef(), clock.instant());
        } catch (HoldExpiredException e) {
            payments.refund(paid.paymentRef());                   // expired while paying: give the money back
            throw e;
        }
    }

    Booking cancel(String bookingId, String userId) {
        Booking b = showOf(bookingId).cancel(bookingId, userId, clock.instant());
        payments.refund(b.paymentRef());                          // after the lock is released
        return b;
    }

    private Show show(String id) {
        Show s = shows.get(id);
        if (s == null) throw new NoSuchElementException("No show " + id);
        return s;
    }

    private Show showOf(String holdId) {
        Show s = showOfHold.get(holdId);
        if (s == null) throw new NoSuchElementException("No hold or booking " + holdId);
        return s;
    }
}` },
        { type: `callout`, tone: `warning`, html: `<p>Thread safety: all seat state sits in a <code>Show</code> and is only touched inside its <code>synchronized</code> methods, so concurrent holds, confirms and cancels on one show are serialised and different shows never contend. The service's catalogue maps are immutable after construction, and <code>showOfHold</code> is a <code>ConcurrentHashMap</code> that is only ever written with a fresh id. The gateway is called with no lock held, so a slow payment cannot stall the seat map, and because the hold is re-checked under the lock afterwards, nothing that happens during the payment can produce a double sale. No method holds two locks, so there is no lock ordering to get wrong.</p>` },
        { type: `text`, html: `<p>The <a href="https://github.com/ashishps1/awesome-low-level-design/tree/main/solutions/java/src/movieticketbookingsystem" target="_blank" rel="noopener">awesome-low-level-design solution</a> has the same shape: a booking service, shows linking a movie to a screen, seat types with prices, a lock taken per show, and payment and pricing behind interfaces. The code here is written independently and changes several things: seat status moves from <code>Seat</code> (shared by every show on a screen) into each show; a failed seat claim stops the booking instead of carrying on to payment; a timer that could unlock seats mid-payment is replaced by lazy expiry plus a re-check at confirm; money is <code>long</code> paise instead of <code>double</code>; and the Singleton service, the builder and the movie observer are dropped for a service built once with an injected gateway and clock.</p>` }
      ] },
      { id: `verification`, title: `Verifying with a trace`, kicker: `Step 5: verification`, blocks: [
        { type: `text`, html: `<p>Walk the design through a concrete scenario, call by call, before the interviewer does. Show <code>s1</code> uses a screen with rows A to F and seats 1 to 10; rows E and F are PREMIUM. REGULAR costs 20000 paise and PREMIUM 35000. Holds last 10 minutes. The output below comes from running the hold, confirm and cancel logic with a fixed clock and a fake gateway; ids are shortened to h1, h2 and so on.</p>` },
        { type: `code`, lang: `text`, title: `Call by call`, code: `18:00:00  asha holdSeats(s1, [C5, C6])
          -> hold h1 [C5, C6] 40000 paise, expires 18:10:00
18:00:00  ben  holdSeats(s1, [C6, C7])        reaches the show lock just after asha
          -> SeatsUnavailableException [C6]    C7 was never claimed
18:00:01  ben  holdSeats(s1, [C7, C8])
          -> hold h2 [C7, C8] 40000 paise, expires 18:10:01
18:00:02  asha holdSeats(s1, [C5, C6])        double click: same user, same seats
          -> hold h1, unchanged expiry 18:10:00
18:03:00  asha confirm(h1)
          gateway: charged 40000 paise, key h1 -> pay1
          -> booking h1 [C5, C6] 40000 paise, pay1
18:03:00  asha confirm(h1)                     double click
          -> booking h1, found before charging: no second charge
18:10:30  chen availableSeats(s1), row C
          -> C1 C2 C3 C4 C7 C8 C9 C10          h2 expired at 18:10:01; no timer ran
18:10:31  chen holdSeats(s1, [C6, C7])
          -> SeatsUnavailableException [C6]    C6 is booked
18:10:32  chen holdSeats(s1, [C7, C8])
          -> hold h3 [C7, C8] 40000 paise, expires 18:20:32
18:12:00  ben  confirm(h2)
          -> HoldExpiredException h2           rejected before any charge
18:20:00  dev  holdSeats(s1, [E1])
          -> hold h4 [E1] 35000 paise, expires 18:30:00
18:29:55  dev  confirm(h4)                     activeHold passes; the gateway takes 10 s
          gateway: charged 35000 paise, key h4 -> pay2
18:30:05  show.confirm finds h4 expired
          gateway: refunded pay2
          -> HoldExpiredException h4
18:30:05  eve  holdSeats(s1, [E1])
          -> hold h5 [E1] 35000 paise, expires 18:40:05
18:40:00  asha cancel(h1)
          gateway: refunded pay1
          -> booking h1 [C5, C6] returned; C5 and C6 are free
18:40:01  asha cancel(h1)                      again
          -> NoSuchElementException h1
18:40:02  chen availableSeats(s1), row C
          -> C1 C2 C3 C4 C5 C6 C7 C8 C9 C10    h3 expired at 18:20:32 as well` },
        { type: `keypoints`, items: [
          `Ben's overlapping request failed as a whole: C7 stayed free and he got it on the next call. Nobody ever held part of what they asked for.`,
          `Repeated clicks were harmless: the second hold returned the same hold, and the second confirm returned the same booking without reaching the gateway.`,
          `Expiry needed no timer: Ben's seats were free for Chen at 18:10:30 because the call itself dropped the stale hold, and Ben's late confirm failed before charging.`,
          `Dev's hold ran out during payment. He was charged and refunded, and E1 went to Eve; without the re-check under the lock, both would have been sold E1.`
        ] }
      ] }
    ],
    levels: levels(
      [`Seat state owned by the show rather than the seat, with movie, theatre, screen and booking as simple types.`, `A multi-seat booking that checks every seat and then claims every seat inside one lock, so overlapping requests cannot both win.`, `Search and browse that work, prices as integers, and bad input rejected without changing state.`],
      [`Holds with an expiry and the three seat states, with lazy expiry and conditional release explained.`, `Payment outside the lock, and the hold re-checked afterwards, with a refund when it expired mid-payment.`, `An idempotent confirm and hold (double clicks), and a clear reason for one lock per show over global or per-seat locks.`, `A trace that covers a race, an expiry and a confirmation without prompting.`],
      [`Asks what happens to seats during payment before drawing anything, and scopes payment, accounts and multi-server out explicitly.`, `Defines the gateway contract (idempotency keys, repeatable refunds) and explains why the hold id is a good key.`, `Maps the in-memory design to a database: conditional updates on a seat row, row counts as the all-or-nothing check, and expiry stored in the row.`, `Discusses premiere-scale contention (per-seat ordered locks, a waiting room in front of the seat map) and payment grace periods, and says which classes each would change.`]
    ),
    concepts: [
      { term: `Seat state per show`, def: `Each <code>Show</code> maps seat ids to the hold or booking that owns them; <code>Seat</code> itself has no status.`, why: `A seat belongs to a screen, and a screen runs many shows; the same seat is free at 6 pm and booked at 9 pm.` },
      { term: `Hold with an expiry`, def: `A temporary claim on seats with a deadline, the user, and the price fixed when it was made.`, why: `Payment takes minutes; the seats must be reserved meanwhile without being locked forever by abandoned checkouts.` },
      { term: `All-or-nothing claim`, def: `Check every requested seat, then take every seat, in one locked call; on any conflict take nothing.`, why: `A group must never end up with half their seats, and the loser learns exactly which seats were taken.` },
      { term: `Lazy expiry`, def: `Every locked method first drops holds whose deadline has passed, freeing only seats each hold still owns.`, why: `Correct without a timer thread; an expired hold only matters when someone next looks at the show.` },
      { term: `Lock per show`, def: `All seat-state methods are <code>synchronized</code> on the show.`, why: `Shows never wait for each other, and a multi-seat claim is atomic with a single lock.` },
      { term: `Payment outside the lock`, def: `Check the hold, charge with no lock held, then re-check and confirm under the lock.`, why: `A slow gateway cannot stall a seat map, and the re-check stops a late payment from taking seats that have moved on.` },
      { term: `Idempotent confirm`, def: `A confirm for a hold that is already booked returns that booking; the gateway charge uses the hold id as its idempotency key.`, why: `Double clicks and retries never create a second booking or charge.` },
      { term: `Money as long paise`, def: `Prices and totals are integer paise, summed with <code>Math.addExact</code> on the server.`, why: `No floating-point rounding, and the client can never set the amount.` }
    ],
    interview: [
      { q: `Why can't seat status be a field on Seat?`, a: `A seat belongs to a screen's layout, and the same screen runs several shows a day. A status field on the seat would make a seat booked for the 6 pm show look booked at 9 pm too. Status belongs to the pairing of a show and a seat, so each Show keeps a map from seat id to whoever owns it, and Seat stays an immutable value.`, diff: `easy` },
      { q: `How do you guarantee exactly one of two concurrent requests for the same seat wins?`, a: `Make the check and the claim one atomic step. Show.hold is synchronized on the show: it checks every requested seat and only then marks them all as owned by one new hold. The second request waits for the lock, finds the seats taken and throws without claiming anything. With a database the same guarantee comes from a conditional update or unique constraint inside one transaction.`, diff: `medium` },
      { q: `Why hold seats instead of booking them when payment succeeds?`, a: `If seats were only marked on payment, two people could both reach the payment page for the same seat and one would be charged for nothing. If they were booked on click, abandoned checkouts would lock seats forever. A hold reserves the seats for a fixed time, after which they free themselves, so both problems go away.`, diff: `easy` },
      { q: `Why not call the payment gateway inside the synchronized block?`, a: `The gateway can take seconds or time out, and while it runs every other request for that show would wait on the lock: the whole seat map freezes behind one slow card. Instead the service checks the hold, charges with no lock held, then confirms under the lock. Because confirm re-checks the hold, nothing that happened during the payment can cause a double sale.`, diff: `medium` },
      { q: `What happens if the hold expires while the user is paying?`, a: `The final locked call finds the hold gone (it may already have been dropped, and its seats taken by someone else), so it throws HoldExpiredException and the service refunds the charge it just made. The user loses the seats but not the money. A friendlier follow-up is to extend the hold once when payment starts, so only a very slow gateway hits this path.`, diff: `medium` },
      { q: `A user double-clicks Pay. How do you avoid charging twice?`, a: `Two layers. A sequential second click finds the booking already exists and returns it before calling the gateway. Two truly concurrent clicks both pass that check, but both charge with the hold id as idempotency key, so the gateway charges once and returns the same reference; the second Show.confirm finds the booking and returns it instead of failing or refunding.`, diff: `hard` },
      { q: `Why one lock per show rather than one per seat?`, a: `A booking spans several seats and must be all or nothing. Per-seat locks would have to be taken in a single global order to avoid deadlock, and expiry, confirm and cancel would need them too. The critical section is a few map operations because payment is outside the lock, so a show-level lock is simple and rarely contended. Per-seat locks are worth it only for a premiere with thousands of buyers on one show.`, diff: `medium` }
    ],
    cheatsheet: [
      { title: `Movie booking in one screen`, type: `code`, lang: `java`, body: `record Seat(String id, char row, int number, SeatCategory category) {}       // no status
record Hold(String id, String userId, List<Seat> seats, long amountPaise, Instant expiresAt) {}
record Booking(String id, String showId, String userId, List<Seat> seats, long amountPaise, String paymentRef) {}

final class Show {                                       // one lock per show
    Map<String, String> owner;                           // seat id -> hold or booking id; absent = free
    synchronized Hold hold(userId, seatIds, ttl, now);   // expire lazily; check all, then claim all
    synchronized Hold activeHold(holdId, userId, now);   // valid and mine, or HoldExpiredException
    synchronized Booking confirm(holdId, userId, ref, now);   // existing booking, or re-check and book
    synchronized Booking cancel(bookingId, userId, now); // before start; owner.remove(seat, id)
}

final class BookingService {                             // gateway and clock injected
    Hold holdSeats(showId, userId, seatIds);
    Booking confirm(holdId, userId);   // existing? return; activeHold; charge(key = holdId) unlocked;
                                       // show.confirm; on HoldExpired refund
    Booking cancel(bookingId, userId); // show.cancel, then refund
}` },
      { title: `Follow-ups and where they land`, type: `table`, headers: [`Follow-up`, `Change`], rows: [
        [`Payment slower than the hold`, `Show extends the hold once when payment starts (Deep Dives)`],
        [`Weekend prices, fees, coupons`, `A PricingStrategy injected into Show (Deep Dives)`],
        [`A premiere with thousands of buyers`, `Per-seat locks taken in a fixed order inside Show (Deep Dives)`],
        [`Waitlist, show cancelled`, `ShowListener notified after the lock is released (Deep Dives)`],
        [`Several servers and a database`, `Conditional updates on a seat row; row count as the all-or-nothing check (Deep Dives)`],
        [`Recliners or another seat type`, `A new SeatCategory and a price for it`],
        [`A user's booking history`, `An index by user id in BookingService`]
      ] }
    ],
    labs: []
  });
})();
