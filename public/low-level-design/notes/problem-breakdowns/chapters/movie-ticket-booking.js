// LLD problem breakdown: Movie Ticket Booking. Format: Chapter in public/shared/notes.d.ts; shared helpers in data-part2.js.
// Imports are omitted in the code.
(function () {
const { levels } = LLD_PROBLEMS_KIT;

window.DATA.chapters.push({
    id: `movie-ticket-booking`, part: 2, number: 0, difficulty: `medium`,
    title: `Movie Ticket Booking: shows, seat maps and exactly-one-wins booking`,
    references: [{ title: `awesome-low-level-design: Movie Ticket Booking System`, url: `https://github.com/ashishps1/awesome-low-level-design/blob/main/problems/movie-ticket-booking-system.md` }],
    overview: `A BookMyShow-style system: search movies, browse a theatre's shows, see a showtime's free seats, book several seats in one reservation, and cancel. The data model is a small hierarchy (theatre, screen, showtime, seat), and the interview-defining requirement is that when two people book the same seat at once, <strong>exactly one succeeds</strong>, and a multi-seat booking is <strong>all or nothing</strong>.`,
    source: { title: `Hello Interview: Movie Ticket Booking (LLD) problem breakdown`, url: `https://www.hellointerview.com/learn/low-level-design/problem-breakdowns/bookmyshow` },
    problem: [
      { id: `requirements`, title: `What we are building`, kicker: `Requirements`, blocks: [
        { type: `code`, lang: `text`, title: `Final requirements`, code: `Functional
  1. Search movies by title (simple substring match).
  2. Browse the movies and showtimes at a given theatre.
  3. Theatres have several screens; every screen has the same layout:
     rows A-Z, seats 0-20.
  4. See the available seats for a showtime and pick specific ones.
  5. Book several seats in one reservation; booking returns a confirmation id.
  6. Concurrent bookings of the same seat: exactly one succeeds.
  7. Cancel a reservation by confirmation id, releasing its seats.

Out of scope
  - Payment (assume it succeeds), seat types and prices, rescheduling, UI.` }
      ] },
      { id: `clarifying`, title: `Questions worth asking`, kicker: `Clarifying`, blocks: [
        { type: `table`, headers: [`Ask`, `Assume`, `Decides`], rows: [
          [`What kind of search?`, `Case-insensitive substring on title`, `A scan is fine for hundreds of movies`],
          [`Pick seats or auto-assign? Several at once?`, `Pick specific seats; several per booking`, `Per-seat state and an all-or-nothing booking`],
          [`One theatre or many?`, `Many, each with several screens`, `Indexes by movie and by theatre`],
          [`Different layouts per screen?`, `No: A-Z by 0-20 everywhere`, `One seat-map shape`],
          [`Manage reservations how?`, `Cancel only`, `No reschedule logic`],
          [`Two people, same seat, same moment?`, `Exactly one wins`, `Atomic booking`]
        ] }
      ] }
    ],
    solution: [
      { id: `design`, title: `Design`, kicker: `Entities and API`, blocks: [
        { type: `table`, headers: [`Class`, `Owns`], rows: [
          [`BookingSystem`, `Facade: search, browse, book, cancel; indexes and reservations by id`],
          [`Movie`, `Id, title, duration (record)`],
          [`Theater`, `Id, name, its showtimes`],
          [`Showtime`, `Movie, theatre, screen number, start time, and the seat map for that show`],
          [`Seat`, `Row letter and number (record); the layout is a constant`],
          [`Reservation`, `Confirmation id, showtime, seats (record)`]
        ] },
        { type: `keypoints`, items: [
          `Seat availability belongs to the <strong>showtime</strong>, not the screen: the same seat is free at 6 pm and booked at 9 pm.`,
          `Booking several seats is <strong>all or nothing</strong>, done under the showtime's lock: check every seat, then claim every seat.`,
          `Different showtimes have different locks, so bookings for different shows never wait for each other.`
        ] },
        { type: `code`, lang: `java`, title: `Public API`, code: `List<Movie> searchMovies(String text);
List<Showtime> showtimesAt(String theaterId);
Set<Seat> availableSeats(String showtimeId);
String book(String showtimeId, Set<Seat> seats);     // confirmation id; throws if any seat is taken
void cancel(String confirmationId);` }
      ] },
      { id: `code`, title: `Working code`, kicker: `Implementation`, blocks: [
        { type: `code`, lang: `java`, title: `Value types and the showtime's seat map`, code: `record Movie(String id, String title, Duration length) {}

record Seat(char row, int number) {
    static final char FIRST_ROW = 'A', LAST_ROW = 'Z';
    static final int SEATS_PER_ROW = 21;                 // 0..20
    Seat {
        if (row < FIRST_ROW || row > LAST_ROW || number < 0 || number >= SEATS_PER_ROW)
            throw new IllegalArgumentException("No such seat: " + row + number);
    }
}

record Reservation(String id, String showtimeId, Set<Seat> seats) {}

final class Showtime {
    final String id;
    final Movie movie;
    final String theaterId;
    final int screen;
    final LocalDateTime start;
    private final Map<Seat, String> taken = new HashMap<>();   // seat -> confirmation id, guarded by this

    Showtime(String id, Movie movie, String theaterId, int screen, LocalDateTime start) {
        this.id = id; this.movie = movie; this.theaterId = theaterId; this.screen = screen; this.start = start;
    }

    synchronized Set<Seat> available() {
        Set<Seat> free = new LinkedHashSet<>();
        for (char r = Seat.FIRST_ROW; r <= Seat.LAST_ROW; r++)
            for (int n = 0; n < Seat.SEATS_PER_ROW; n++) {
                Seat s = new Seat(r, n);
                if (!taken.containsKey(s)) free.add(s);
            }
        return free;
    }

    /** All or nothing: either every seat is claimed for this reservation, or none is. */
    synchronized void claim(Set<Seat> seats, String reservationId) {
        for (Seat s : seats) if (taken.containsKey(s)) throw new SeatUnavailableException(s);
        for (Seat s : seats) taken.put(s, reservationId);
    }

    synchronized void release(Set<Seat> seats, String reservationId) {
        for (Seat s : seats) taken.remove(s, reservationId);     // only seats this reservation holds
    }
}` },
        { type: `code`, lang: `java`, title: `BookingSystem`, code: `final class BookingSystem {
    private final List<Movie> movies;
    private final Map<String, Showtime> showtimes;                     // by id
    private final Map<String, List<Showtime>> byTheater;
    private final Map<String, Reservation> reservations = new ConcurrentHashMap<>();

    BookingSystem(List<Movie> movies, List<Showtime> shows) {
        this.movies = List.copyOf(movies);
        Map<String, Showtime> s = new HashMap<>();
        Map<String, List<Showtime>> t = new HashMap<>();
        for (Showtime st : shows) {
            s.put(st.id, st);
            t.computeIfAbsent(st.theaterId, k -> new ArrayList<>()).add(st);
        }
        this.showtimes = Map.copyOf(s);
        this.byTheater = Map.copyOf(t);
    }

    List<Movie> searchMovies(String text) {
        String q = text.toLowerCase(Locale.ROOT);
        return movies.stream().filter(m -> m.title().toLowerCase(Locale.ROOT).contains(q)).toList();
    }

    List<Showtime> showtimesAt(String theaterId) { return byTheater.getOrDefault(theaterId, List.of()); }

    Set<Seat> availableSeats(String showtimeId) { return show(showtimeId).available(); }

    String book(String showtimeId, Set<Seat> seats) {
        if (seats.isEmpty()) throw new IllegalArgumentException("Choose at least one seat");
        String id = UUID.randomUUID().toString();
        show(showtimeId).claim(Set.copyOf(seats), id);                 // throws if any seat is taken
        reservations.put(id, new Reservation(id, showtimeId, Set.copyOf(seats)));
        return id;
    }

    void cancel(String confirmationId) {
        Reservation r = reservations.remove(confirmationId);           // atomic: cancel works once
        if (r == null) throw new IllegalArgumentException("Unknown reservation " + confirmationId);
        show(r.showtimeId()).release(r.seats(), r.id());
    }

    private Showtime show(String id) {
        Showtime s = showtimes.get(id);
        if (s == null) throw new IllegalArgumentException("Unknown showtime " + id);
        return s;
    }
}

class SeatUnavailableException extends RuntimeException {
    SeatUnavailableException(Seat s) { super("Seat " + s.row() + s.number() + " is already booked"); }
}` }
      ] },
      { id: `walkthrough`, title: `Walking through it`, kicker: `Check it works`, blocks: [
        { type: `steps`, items: [
          `Search "dune": a case-insensitive scan finds "Dune: Part Two". The user picks the 7:30 pm showtime at a theatre.`,
          `Two users click Book on {C5, C6} and {C6, C7} at the same moment. Both enter <code>claim</code>; the showtime's lock lets one in first, it claims C5 and C6; the second sees C6 taken and throws, claiming nothing (C7 stays free).`,
          `Bookings for the 9:45 pm show run in parallel: a different Showtime object, a different lock.`,
          `<code>cancel(id)</code> removes the reservation (once) and releases exactly those seats; a second cancel throws "Unknown reservation".`
        ] }
      ] }
    ],
    levels: levels(
      [`The hierarchy (theatre, showtime, seat, reservation), search and browse, and booking that marks seats taken.`, `Seeing that availability belongs to the showtime.`],
      [`All-or-nothing booking with a lock per showtime and an explanation of why that granularity.`, `Cancellation that releases only the reservation's own seats.`, `Temporary seat holds during checkout as a follow-up.`],
      [`Hold expiry, per-seat locking trade-offs, dynamic schedules, and how the in-memory locks map to database constraints when several servers book seats.`]
    ),
    concepts: [
      { term: `Seat state per showtime`, def: `Each showtime owns its own map of taken seats.`, why: `The same physical seat has a different status for each show.` },
      { term: `All-or-nothing booking`, def: `Check every requested seat, then claim every seat, inside one critical section.`, why: `A partial booking would leave a customer with half their group's seats.` },
      { term: `Lock per showtime`, def: `<code>claim</code> and <code>release</code> synchronize on the showtime.`, why: `Correct and simple; different shows don't contend.` },
      { term: `Exactly one wins`, def: `The second booking of a taken seat throws instead of overwriting.`, why: `The core concurrency requirement.` },
      { term: `Idempotent cancel`, def: `<code>reservations.remove(id)</code> returns the reservation only once.`, why: `Double cancels can't release seats someone else has since booked.` },
      { term: `Seat hold`, def: `A temporary claim with an expiry while the user pays.`, why: `Real checkouts take minutes; the seat must not be sold twice meanwhile.` }
    ],
    interview: [
      { q: `How do you guarantee exactly one of two concurrent bookings wins?`, a: `Make the check and the claim one atomic step. Showtime.claim is synchronized: it checks every requested seat and only then marks them all, so the second caller sees the seats taken and gets an exception. With a database, the same guarantee comes from a unique constraint on (showtime, seat) or a conditional update, inside one transaction for all seats.`, diff: `medium` },
      { q: `Why lock the showtime rather than each seat?`, a: `A booking spans several seats and must be all or nothing. With a lock per seat you'd have to acquire several locks, in a consistent order (sorted by seat) to avoid deadlock, and release them correctly on failure. One lock per showtime is simpler and still lets different shows proceed in parallel; contention only happens between people booking the same show at the same instant.`, diff: `medium` },
      { q: `How would you hold seats during checkout?`, a: `Give seats three states: free, held (with a hold id and expiry) and booked. hold(seats) claims them as held atomically and returns a hold id; confirm(holdId) turns them into booked if the hold is still valid; a scheduled task or lazy expiry releases holds past their deadline, conditionally, so it never undoes a confirmed booking.`, diff: `hard` },
      { q: `How would you speed up search with many more movies?`, a: `Build an inverted index from lowercase words (or n-grams for substrings) to movie ids when movies are added, intersect the posting lists for a query, and rank results. For hundreds of movies a linear scan takes microseconds, so I'd say this is only worth it at a much larger scale.`, diff: `medium` },
      { q: `How would you allow adding and removing showtimes at runtime?`, a: `Make the indexes concurrent maps (or swap immutable snapshots). Removing a showtime must also handle its reservations: cancel them and notify customers, or forbid removal once tickets are sold. Locking the showtime while marking it cancelled stops new bookings from racing with the removal.`, diff: `hard` }
    ],
    cheatsheet: [
      { title: `Booking in one screen`, type: `code`, lang: `java`, body: `record Seat(char row, int number) {}              // A-Z x 0-20, validated
final class Showtime {
    Map<Seat, String> taken;                       // seat -> reservation id
    synchronized void claim(Set<Seat> seats, String resId);    // check all, then take all
    synchronized void release(Set<Seat> seats, String resId);  // remove(seat, resId)
}
final class BookingSystem {
    String book(String showtimeId, Set<Seat> seats);
    void cancel(String confirmationId);            // reservations.remove(id): once only
}` },
      { title: `Concurrency choices`, type: `table`, headers: [`Option`, `Pros`, `Cons`], rows: [
        [`Lock per showtime`, `Simple, all-or-nothing is easy`, `Same-show bookings serialize`],
        [`Lock per seat (sorted)`, `More parallelism within a show`, `Deadlock risk, more code`],
        [`CAS per seat + rollback`, `No blocking`, `Rollback on partial failure is fiddly`],
        [`DB unique (showtime, seat)`, `Works across servers`, `Needs a transaction for multi-seat`]
      ] }
    ],
    labs: []
  });
})();
