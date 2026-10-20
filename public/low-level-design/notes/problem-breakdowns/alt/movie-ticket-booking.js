// Go versions of the Movie Ticket Booking code blocks, matched to the Java blocks by title. Imports are omitted.
window.ALT = window.ALT || {};
ALT["movie-ticket-booking"] = { go: {
"Public API": `func (b *BookingSystem) SearchMovies(text string) []Movie
func (b *BookingSystem) ShowtimesAt(theaterID string) []*Showtime
func (b *BookingSystem) AvailableSeats(showtimeID string) ([]Seat, error)
func (b *BookingSystem) Book(showtimeID string, seats []Seat) (string, error) // confirmation id; error if any seat is taken
func (b *BookingSystem) Cancel(confirmationID string) error`,

"Value types and the showtime's seat map": `type Movie struct {
	ID     string
	Title  string
	Length time.Duration
}

const (
	firstRow, lastRow = 'A', 'Z'
	seatsPerRow       = 21 // 0..20
)

type Seat struct { // comparable, so it works as a map key
	Row    rune
	Number int
}

func NewSeat(row rune, number int) (Seat, error) {
	if row < firstRow || row > lastRow || number < 0 || number >= seatsPerRow {
		return Seat{}, fmt.Errorf("no such seat: %c%d", row, number)
	}
	return Seat{row, number}, nil
}

type Reservation struct {
	ID         string
	ShowtimeID string
	Seats      []Seat
}

var ErrSeatUnavailable = errors.New("seat already booked")

type Showtime struct {
	ID        string
	Movie     Movie
	TheaterID string
	Screen    int
	Start     time.Time

	mu    sync.Mutex
	taken map[Seat]string // seat -> confirmation id
}

func NewShowtime(id string, m Movie, theaterID string, screen int, start time.Time) *Showtime {
	return &Showtime{ID: id, Movie: m, TheaterID: theaterID, Screen: screen, Start: start, taken: map[Seat]string{}}
}

func (s *Showtime) Available() []Seat {
	s.mu.Lock()
	defer s.mu.Unlock()
	var free []Seat
	for r := rune(firstRow); r <= lastRow; r++ {
		for n := 0; n < seatsPerRow; n++ {
			if _, ok := s.taken[Seat{r, n}]; !ok {
				free = append(free, Seat{r, n})
			}
		}
	}
	return free
}

// Claim is all or nothing: either every seat is claimed for this reservation, or none is.
func (s *Showtime) Claim(seats []Seat, reservationID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, seat := range seats {
		if _, ok := s.taken[seat]; ok {
			return fmt.Errorf("%w: %c%d", ErrSeatUnavailable, seat.Row, seat.Number)
		}
	}
	for _, seat := range seats {
		s.taken[seat] = reservationID
	}
	return nil
}

func (s *Showtime) Release(seats []Seat, reservationID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, seat := range seats {
		if s.taken[seat] == reservationID { // only seats this reservation holds
			delete(s.taken, seat)
		}
	}
}`,

"BookingSystem": `type BookingSystem struct {
	movies    []Movie
	showtimes map[string]*Showtime // by id; fixed at start, read-only after
	byTheater map[string][]*Showtime

	mu           sync.Mutex
	reservations map[string]Reservation
}

func NewBookingSystem(movies []Movie, shows []*Showtime) *BookingSystem {
	b := &BookingSystem{
		movies:       slices.Clone(movies),
		showtimes:    map[string]*Showtime{},
		byTheater:    map[string][]*Showtime{},
		reservations: map[string]Reservation{},
	}
	for _, s := range shows {
		b.showtimes[s.ID] = s
		b.byTheater[s.TheaterID] = append(b.byTheater[s.TheaterID], s)
	}
	return b
}

func (b *BookingSystem) SearchMovies(text string) []Movie {
	q := strings.ToLower(text)
	var out []Movie
	for _, m := range b.movies {
		if strings.Contains(strings.ToLower(m.Title), q) {
			out = append(out, m)
		}
	}
	return out
}

func (b *BookingSystem) ShowtimesAt(theaterID string) []*Showtime { return b.byTheater[theaterID] }

func (b *BookingSystem) AvailableSeats(showtimeID string) ([]Seat, error) {
	s, err := b.show(showtimeID)
	if err != nil {
		return nil, err
	}
	return s.Available(), nil
}

func (b *BookingSystem) Book(showtimeID string, seats []Seat) (string, error) {
	if len(seats) == 0 {
		return "", errors.New("choose at least one seat")
	}
	s, err := b.show(showtimeID)
	if err != nil {
		return "", err
	}
	id := newID() // a random unique id, e.g. 16 bytes from crypto/rand as hex
	if err := s.Claim(seats, id); err != nil { // fails if any seat is taken
		return "", err
	}
	b.mu.Lock()
	b.reservations[id] = Reservation{ID: id, ShowtimeID: showtimeID, Seats: slices.Clone(seats)}
	b.mu.Unlock()
	return id, nil
}

func (b *BookingSystem) Cancel(confirmationID string) error {
	b.mu.Lock()
	r, ok := b.reservations[confirmationID]
	delete(b.reservations, confirmationID) // cancel works once
	b.mu.Unlock()
	if !ok {
		return fmt.Errorf("unknown reservation %s", confirmationID)
	}
	s, _ := b.show(r.ShowtimeID)
	s.Release(r.Seats, r.ID)
	return nil
}

func (b *BookingSystem) show(id string) (*Showtime, error) {
	s, ok := b.showtimes[id]
	if !ok {
		return nil, fmt.Errorf("unknown showtime %s", id)
	}
	return s, nil
}`,

"Holds inside the showtime": `type Hold struct {
	ID        string
	Seats     []Seat
	ExpiresAt time.Time
}

// Showtime gains, guarded by mu:
//   owner map[Seat]string  // seat -> hold id or reservation id
//   holds map[string]Hold  // by hold id

func (s *Showtime) Hold(seats []Seat, ttl time.Duration, now time.Time) (Hold, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.expireHolds(now)
	for _, seat := range seats {
		if _, ok := s.owner[seat]; ok {
			return Hold{}, fmt.Errorf("%w: %c%d", ErrSeatUnavailable, seat.Row, seat.Number)
		}
	}
	h := Hold{ID: newID(), Seats: slices.Clone(seats), ExpiresAt: now.Add(ttl)}
	for _, seat := range seats {
		s.owner[seat] = h.ID
	}
	s.holds[h.ID] = h
	return h, nil
}

func (s *Showtime) Confirm(holdID string, now time.Time) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.expireHolds(now)
	h, ok := s.holds[holdID]
	if !ok {
		return "", errors.New("hold expired or unknown")
	}
	delete(s.holds, holdID)
	reservationID := newID()
	for _, seat := range h.Seats {
		s.owner[seat] = reservationID // held -> booked
	}
	return reservationID, nil
}

func (s *Showtime) expireHolds(now time.Time) { // lazy expiry on every access
	for id, h := range s.holds {
		if now.Before(h.ExpiresAt) {
			continue
		}
		for _, seat := range h.Seats {
			if s.owner[seat] == id { // only if still held by this hold
				delete(s.owner, seat)
			}
		}
		delete(s.holds, id) // deleting while ranging over a map is allowed in Go
	}
}`,

"Per-seat locks in a fixed order": `// Per-seat state lives in fixed arrays, not a map: a Go map can't be written by several
// goroutines at once, even under different locks.
type FineShowtime struct {
	locks  [26][seatsPerRow]sync.Mutex
	owners [26][seatsPerRow]string
}

func (s *FineShowtime) lockFor(seat Seat) *sync.Mutex { return &s.locks[seat.Row-firstRow][seat.Number] }

func (s *FineShowtime) Claim(seats []Seat, reservationID string) bool {
	ordered := slices.Clone(seats)
	slices.SortFunc(ordered, func(a, b Seat) int {
		if a.Row != b.Row {
			return int(a.Row - b.Row)
		}
		return a.Number - b.Number
	})
	ordered = slices.Compact(ordered) // Go mutexes aren't reentrant: lock each seat once
	for _, seat := range ordered {    // global order: no deadlock
		s.lockFor(seat).Lock()
	}
	defer func() {
		for i := len(ordered) - 1; i >= 0; i-- {
			s.lockFor(ordered[i]).Unlock()
		}
	}()
	for _, seat := range ordered { // all or nothing
		if s.owners[seat.Row-firstRow][seat.Number] != "" {
			return false
		}
	}
	for _, seat := range ordered {
		s.owners[seat.Row-firstRow][seat.Number] = reservationID
	}
	return true
}`,

"Booking in one screen": `type Seat struct { // A-Z x 0-20, validated by NewSeat
	Row    rune
	Number int
}

type Showtime struct {
	mu    sync.Mutex
	taken map[Seat]string // seat -> reservation id
}

func (s *Showtime) Claim(seats []Seat, resID string) error // check all, then take all
func (s *Showtime) Release(seats []Seat, resID string)     // delete only seats resID holds

func (b *BookingSystem) Book(showtimeID string, seats []Seat) (string, error)
func (b *BookingSystem) Cancel(confirmationID string) error // delete under lock: once only`
} };
