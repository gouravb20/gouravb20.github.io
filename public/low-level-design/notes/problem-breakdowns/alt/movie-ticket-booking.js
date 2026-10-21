// Go versions of the Movie Ticket Booking code blocks, matched to the Java blocks by title. Imports are omitted.
window.ALT = window.ALT || {};
ALT["movie-ticket-booking"] = { go: {
"Value types: Movie, Theatre, Seat, Screen, Hold, Booking": `type SeatCategory int

const (
	Regular SeatCategory = iota
	Premium
)

type Movie struct {
	ID, Title string
	Length    time.Duration
}

type Theatre struct{ ID, Name, City string }

type Seat struct { // no status: that lives on the show
	ID       string
	Row      rune
	Number   int
	Category SeatCategory
}

// Screen is a seat layout. Built once and never changed, so every show on it can share it without locking.
type Screen struct {
	Number int
	layout []Seat // in layout order
	byID   map[string]Seat
}

func NewScreen(number int, layout []Seat) *Screen {
	s := &Screen{Number: number, layout: slices.Clone(layout), byID: map[string]Seat{}}
	for _, seat := range layout {
		s.byID[seat.ID] = seat
	}
	return s
}

// Grid numbers rows from A and seats from 1; the last premiumRows rows are Premium.
func Grid(number, rows, perRow, premiumRows int) *Screen {
	var layout []Seat
	for r := range rows {
		row := rune('A' + r)
		category := Regular
		if r >= rows-premiumRows {
			category = Premium
		}
		for n := 1; n <= perRow; n++ {
			layout = append(layout, Seat{fmt.Sprintf("%c%d", row, n), row, n, category})
		}
	}
	return NewScreen(number, layout)
}

func (s *Screen) Seat(id string) (Seat, bool) {
	seat, ok := s.byID[id]
	return seat, ok
}

func (s *Screen) Seats() []Seat { return s.layout } // read-only by convention

type Hold struct {
	ID          string
	UserID      string
	Seats       []Seat
	AmountPaise int64
	ExpiresAt   time.Time
}

func (h Hold) ExpiredAt(now time.Time) bool { return !now.Before(h.ExpiresAt) }

// Booking is a paid hold. It keeps the hold's ID, so the id the user saw at checkout is the confirmation number.
type Booking struct {
	ID          string
	ShowID      string
	UserID      string
	Seats       []Seat
	AmountPaise int64
	PaymentRef  string
}`,

"Final class design": `type BookingService struct {
	shows      map[string]*Show // the catalogue, fixed at construction
	showOfHold sync.Map         // hold (and booking) id -> *Show
	payments   PaymentGateway   // injected
	now        func() time.Time // injected clock: expiry and tests
}

func (b *BookingService) SearchMovies(text string) []Movie
func (b *BookingService) ShowsFor(movieID, city string) []*Show
func (b *BookingService) AvailableSeats(showID string) ([]Seat, error)
func (b *BookingService) HoldSeats(showID, userID string, seatIDs []string) (Hold, error)
func (b *BookingService) Confirm(holdID, userID string) (Booking, error) // charge without the lock, then book
func (b *BookingService) Cancel(bookingID, userID string) (Booking, error)

type Show struct {
	ID      string
	Movie   Movie
	Theatre Theatre
	Screen  *Screen
	Start   time.Time

	pricePaise map[SeatCategory]int64
	mu         sync.Mutex        // the per-show lock
	owner      map[string]string // seat id -> hold or booking id
	holds      map[string]Hold
	bookings   map[string]Booking
}

func (s *Show) AvailableSeats(now time.Time) []Seat
func (s *Show) Hold(userID string, seatIDs []string, ttl time.Duration, now time.Time) (Hold, error)
func (s *Show) ActiveHold(holdID, userID string, now time.Time) (Hold, error)
func (s *Show) Booking(bookingID, userID string) (Booking, bool)
func (s *Show) Confirm(holdID, userID, paymentRef string, now time.Time) (Booking, error)
func (s *Show) Cancel(bookingID, userID string, now time.Time) (Booking, error)

type PaymentGateway interface {
	Charge(userID string, amountPaise int64, idempotencyKey string) (PaymentResult, error)
	Refund(paymentRef string) error
}`,

"Show: seat state, holds and bookings": `const MaxSeats = 10

type Show struct {
	ID         string
	Movie      Movie
	Theatre    Theatre
	Screen     *Screen
	Start      time.Time
	pricePaise map[SeatCategory]int64 // set per show, read-only after construction

	// mu guards the maps below. A seat with no owner is free. Its owner is a hold id while held, and the
	// same id once that hold is confirmed; whether the id is in holds or in bookings tells the two apart.
	mu       sync.Mutex
	owner    map[string]string // seat id -> hold or booking id
	holds    map[string]Hold
	bookings map[string]Booking
}

func NewShow(id string, m Movie, t Theatre, sc *Screen, start time.Time, prices map[SeatCategory]int64) *Show {
	return &Show{ID: id, Movie: m, Theatre: t, Screen: sc, Start: start, pricePaise: maps.Clone(prices),
		owner: map[string]string{}, holds: map[string]Hold{}, bookings: map[string]Booking{}}
}

func (s *Show) AvailableSeats(now time.Time) []Seat {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.expireHolds(now)
	var free []Seat
	for _, seat := range s.Screen.Seats() {
		if _, taken := s.owner[seat.ID]; !taken {
			free = append(free, seat)
		}
	}
	return free
}

// Hold is all or nothing: every requested seat joins one new hold, or nothing changes.
func (s *Show) Hold(userID string, seatIDs []string, ttl time.Duration, now time.Time) (Hold, error) {
	wanted := map[string]bool{} // the same seat twice counts once
	var seats []Seat
	for _, id := range seatIDs {
		if wanted[id] {
			continue
		}
		seat, ok := s.Screen.Seat(id)
		if !ok {
			return Hold{}, fmt.Errorf("no seat %s", id)
		}
		wanted[id] = true
		seats = append(seats, seat)
	}
	if len(seats) == 0 || len(seats) > MaxSeats {
		return Hold{}, fmt.Errorf("choose 1 to %d seats", MaxSeats)
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if !now.Before(s.Start) {
		return Hold{}, ErrShowStarted
	}
	s.expireHolds(now)
	var taken []string
	for _, seat := range seats {
		if _, ok := s.owner[seat.ID]; ok {
			taken = append(taken, seat.ID)
		}
	}
	if len(taken) > 0 {
		if mine, ok := s.holds[s.owner[taken[0]]]; ok && mine.UserID == userID && sameSeats(mine, wanted) {
			return mine, nil // a repeated click
		}
		return Hold{}, &SeatsUnavailableError{SeatIDs: taken} // nothing was claimed
	}
	var amount int64
	for _, seat := range seats {
		amount += s.pricePaise[seat.Category]
	}
	h := Hold{ID: newID(), UserID: userID, Seats: seats, AmountPaise: amount, ExpiresAt: now.Add(ttl)}
	for _, seat := range seats {
		s.owner[seat.ID] = h.ID
	}
	s.holds[h.ID] = h
	return h, nil
}

// ActiveHold returns the hold if it is unexpired and belongs to userID.
func (s *Show) ActiveHold(holdID, userID string, now time.Time) (Hold, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.activeHold(holdID, userID, now)
}

func (s *Show) activeHold(holdID, userID string, now time.Time) (Hold, error) { // caller holds mu
	s.expireHolds(now)
	h, ok := s.holds[holdID]
	if !ok || h.UserID != userID {
		return Hold{}, ErrHoldExpired
	}
	return h, nil
}

func (s *Show) Booking(bookingID, userID string) (Booking, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.booking(bookingID, userID)
}

func (s *Show) booking(bookingID, userID string) (Booking, bool) { // caller holds mu
	b, ok := s.bookings[bookingID]
	return b, ok && b.UserID == userID
}

// Confirm turns a hold into a booking. Repeating it for the same hold returns the same booking.
func (s *Show) Confirm(holdID, userID, paymentRef string, now time.Time) (Booking, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if b, ok := s.booking(holdID, userID); ok {
		return b, nil // a concurrent second click got here first
	}
	h, err := s.activeHold(holdID, userID, now) // fails if it expired during payment
	if err != nil {
		return Booking{}, err
	}
	delete(s.holds, holdID)
	b := Booking{ID: h.ID, ShowID: s.ID, UserID: userID, Seats: h.Seats, AmountPaise: h.AmountPaise, PaymentRef: paymentRef}
	s.bookings[b.ID] = b // owner already maps the seats to this id
	return b, nil
}

// Cancel frees a booking's seats, once, and only before the show starts.
func (s *Show) Cancel(bookingID, userID string, now time.Time) (Booking, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !now.Before(s.Start) {
		return Booking{}, ErrShowStarted
	}
	b, ok := s.booking(bookingID, userID)
	if !ok {
		return Booking{}, ErrNoBooking
	}
	delete(s.bookings, bookingID)
	for _, seat := range b.Seats {
		if s.owner[seat.ID] == bookingID {
			delete(s.owner, seat.ID)
		}
	}
	return b, nil
}

func (s *Show) expireHolds(now time.Time) { // lazy: every locked method calls it first
	for id, h := range s.holds {
		if !h.ExpiredAt(now) {
			continue
		}
		for _, seat := range h.Seats {
			if s.owner[seat.ID] == id { // only seats this hold still owns
				delete(s.owner, seat.ID)
			}
		}
		delete(s.holds, id) // deleting while ranging over a map is allowed in Go
	}
}

func sameSeats(h Hold, wanted map[string]bool) bool {
	if len(h.Seats) != len(wanted) {
		return false
	}
	for _, seat := range h.Seats {
		if !wanted[seat.ID] {
			return false
		}
	}
	return true
}`,

"PaymentGateway and the errors": `// PaymentGateway is injected, so tests use a fake and production wraps the real provider.
type PaymentGateway interface {
	// Charge charges at most once per idempotency key: repeating a successful charge returns the same result.
	Charge(userID string, amountPaise int64, idempotencyKey string) (PaymentResult, error)
	Refund(paymentRef string) error // safe to repeat for one reference
}

type PaymentResult struct {
	Success    bool
	PaymentRef string
}

var (
	ErrHoldExpired   = errors.New("hold has expired or is unknown")
	ErrPaymentFailed = errors.New("payment declined")
	ErrShowStarted   = errors.New("show has started")
	ErrNoBooking     = errors.New("no such booking")
)

// SeatsUnavailableError lists the taken seats so the UI can grey them out.
type SeatsUnavailableError struct{ SeatIDs []string }

func (e *SeatsUnavailableError) Error() string {
	return "seats not available: " + strings.Join(e.SeatIDs, ", ")
}

func newID() string { return rand.Text() } // crypto/rand: unguessable ids`,

"BookingService": `const HoldTTL = 10 * time.Minute

type BookingService struct {
	movies       []Movie
	shows        map[string]*Show   // by id; fixed at construction
	showsByMovie map[string][]*Show // each slice sorted by start
	showOfHold   sync.Map           // hold (and booking) id -> *Show
	payments     PaymentGateway
	now          func() time.Time
}

func NewBookingService(movies []Movie, shows []*Show, payments PaymentGateway, now func() time.Time) *BookingService {
	b := &BookingService{
		movies:       slices.Clone(movies),
		shows:        map[string]*Show{},
		showsByMovie: map[string][]*Show{},
		payments:     payments,
		now:          now,
	}
	for _, s := range shows {
		b.shows[s.ID] = s
		b.showsByMovie[s.Movie.ID] = append(b.showsByMovie[s.Movie.ID], s)
	}
	for _, list := range b.showsByMovie {
		slices.SortFunc(list, func(x, y *Show) int { return x.Start.Compare(y.Start) })
	}
	return b
}

func (b *BookingService) SearchMovies(text string) []Movie {
	q := strings.ToLower(strings.TrimSpace(text))
	var out []Movie
	for _, m := range b.movies {
		if strings.Contains(strings.ToLower(m.Title), q) {
			out = append(out, m)
		}
	}
	return out
}

func (b *BookingService) ShowsFor(movieID, city string) []*Show {
	var out []*Show
	for _, s := range b.showsByMovie[movieID] {
		if strings.EqualFold(s.Theatre.City, city) {
			out = append(out, s)
		}
	}
	return out
}

func (b *BookingService) AvailableSeats(showID string) ([]Seat, error) {
	s, err := b.show(showID)
	if err != nil {
		return nil, err
	}
	return s.AvailableSeats(b.now()), nil
}

func (b *BookingService) HoldSeats(showID, userID string, seatIDs []string) (Hold, error) {
	s, err := b.show(showID)
	if err != nil {
		return Hold{}, err
	}
	h, err := s.Hold(userID, seatIDs, HoldTTL, b.now())
	if err != nil {
		return Hold{}, err
	}
	b.showOfHold.Store(h.ID, s)
	return h, nil
}

// Confirm pays for a hold and books it. Safe to call twice: the second call returns the first booking.
func (b *BookingService) Confirm(holdID, userID string) (Booking, error) {
	s, err := b.showOf(holdID)
	if err != nil {
		return Booking{}, err
	}
	if done, ok := s.Booking(holdID, userID); ok {
		return done, nil // already paid: don't charge again
	}
	h, err := s.ActiveHold(holdID, userID, b.now())
	if err != nil {
		return Booking{}, err
	}
	paid, err := b.payments.Charge(userID, h.AmountPaise, holdID) // no lock held: slow call
	if err != nil {
		return Booking{}, err
	}
	if !paid.Success {
		return Booking{}, ErrPaymentFailed // the hold stays until it expires
	}
	booking, err := s.Confirm(holdID, userID, paid.PaymentRef, b.now())
	if errors.Is(err, ErrHoldExpired) {
		// expired while paying: give the money back
		if rerr := b.payments.Refund(paid.PaymentRef); rerr != nil {
			return Booking{}, errors.Join(err, rerr)
		}
	}
	return booking, err
}

func (b *BookingService) Cancel(bookingID, userID string) (Booking, error) {
	s, err := b.showOf(bookingID)
	if err != nil {
		return Booking{}, err
	}
	booking, err := s.Cancel(bookingID, userID, b.now())
	if err != nil {
		return Booking{}, err
	}
	return booking, b.payments.Refund(booking.PaymentRef) // after the lock is released
}

func (b *BookingService) show(id string) (*Show, error) {
	s, ok := b.shows[id]
	if !ok {
		return nil, fmt.Errorf("no show %s", id)
	}
	return s, nil
}

func (b *BookingService) showOf(holdID string) (*Show, error) {
	s, ok := b.showOfHold.Load(holdID)
	if !ok {
		return nil, fmt.Errorf("no hold or booking %s", holdID)
	}
	return s.(*Show), nil
}`,

"Movie booking in one screen": `type Seat struct { // no status
	ID       string
	Row      rune
	Number   int
	Category SeatCategory
}

type Show struct {
	mu    sync.Mutex        // one lock per show
	owner map[string]string // seat id -> hold or booking id; absent = free
}

func (s *Show) Hold(userID string, seatIDs []string, ttl time.Duration, now time.Time) (Hold, error) // expire lazily; check all, then claim all
func (s *Show) ActiveHold(holdID, userID string, now time.Time) (Hold, error)                       // valid and mine, or ErrHoldExpired
func (s *Show) Confirm(holdID, userID, ref string, now time.Time) (Booking, error)                  // existing booking, or re-check and book
func (s *Show) Cancel(bookingID, userID string, now time.Time) (Booking, error)                    // before start; free seats this booking owns

// BookingService: gateway and clock injected
func (b *BookingService) HoldSeats(showID, userID string, seatIDs []string) (Hold, error)
func (b *BookingService) Confirm(holdID, userID string) (Booking, error) // existing? return; ActiveHold; Charge(key = holdID) unlocked;
                                                                         // Show.Confirm; on ErrHoldExpired refund
func (b *BookingService) Cancel(bookingID, userID string) (Booking, error) // Show.Cancel, then refund`,

"Payment pending: extend the hold while the gateway works": `// Hold gains a flag; starting payment stores an updated copy back in the map.
type Hold struct {
	ID          string
	UserID      string
	Seats       []Seat
	AmountPaise int64
	ExpiresAt   time.Time
	Paying      bool
}

const PaymentGrace = 5 * time.Minute

// StartPayment marks the hold as paying and pushes its deadline out, once, so expiry can't free it mid-payment.
func (s *Show) StartPayment(holdID, userID string, now time.Time) (Hold, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	h, err := s.activeHold(holdID, userID, now) // must still be valid when payment starts
	if err != nil {
		return Hold{}, err
	}
	if h.Paying {
		return h, nil // a second click gets no extra time
	}
	until := now.Add(PaymentGrace)
	if until.Before(h.ExpiresAt) {
		until = h.ExpiresAt // never shorten a hold
	}
	h.ExpiresAt, h.Paying = until, true // h is a copy: store it back
	s.holds[h.ID] = h
	return h, nil
}

// In BookingService.Confirm, replace the ActiveHold call:
//	h, err := s.StartPayment(holdID, userID, b.now())
// The rest is unchanged: charge with no lock, then Show.Confirm re-checks the (extended) hold.`,

"Pricing behind an interface": `type PricingStrategy interface {
	PricePaise(show *Show, seats []Seat) int64
}

// CategoryPricing is the base rule: a price per seat category, set per show.
type CategoryPricing map[SeatCategory]int64

func (p CategoryPricing) PricePaise(_ *Show, seats []Seat) int64 {
	var total int64
	for _, seat := range seats {
		total += p[seat.Category]
	}
	return total
}

// WeekendSurcharge adds basis points (2000 = 20%) on Saturdays and Sundays, rounded half up to the paisa.
type WeekendSurcharge struct {
	Base        PricingStrategy
	BasisPoints int64
	Zone        *time.Location
}

func (w WeekendSurcharge) PricePaise(show *Show, seats []Seat) int64 {
	price := w.Base.PricePaise(show, seats)
	switch show.Start.In(w.Zone).Weekday() {
	case time.Saturday, time.Sunday:
		// multiply first, round once; ticket totals are nowhere near int64 overflow
		return (price*(10_000+w.BasisPoints) + 5_000) / 10_000
	}
	return price
}

// PerSeatFee adds a flat convenience fee per seat.
type PerSeatFee struct {
	Base     PricingStrategy
	FeePaise int64
}

func (f PerSeatFee) PricePaise(show *Show, seats []Seat) int64 {
	return f.Base.PricePaise(show, seats) + f.FeePaise*int64(len(seats))
}

// Show holds a PricingStrategy instead of the price map, and Hold computes:
//	amount := s.pricing.PricePaise(s, seats) // on the server, once, under the lock
// Wiring: PerSeatFee{WeekendSurcharge{CategoryPricing(prices), 2000, zone}, 3000}`,

"Per-seat locks taken in a fixed order": `// FineGrainedSeats is one show's seat ownership with one lock per seat. The slots map is built once
// and only read afterwards; each slot is changed only under its own mutex. Seat ids are validated by the caller.
type seatSlot struct {
	mu    sync.Mutex
	owner string // "" means free
}

type FineGrainedSeats struct {
	slots map[string]*seatSlot
}

func NewFineGrainedSeats(screen *Screen) *FineGrainedSeats {
	f := &FineGrainedSeats{slots: map[string]*seatSlot{}}
	for _, seat := range screen.Seats() {
		f.slots[seat.ID] = &seatSlot{}
	}
	return f
}

// Claim is all or nothing, like Show.Hold. It returns the seats that were taken; empty means claimed.
func (f *FineGrainedSeats) Claim(seatIDs []string, holdID string) []string {
	// One global order prevents deadlock; Compact matters because Go mutexes aren't reentrant.
	ordered := slices.Compact(slices.Sorted(slices.Values(seatIDs)))
	for _, id := range ordered {
		f.slots[id].mu.Lock()
	}
	defer func() {
		for i := len(ordered) - 1; i >= 0; i-- {
			f.slots[ordered[i]].mu.Unlock()
		}
	}()
	var taken []string
	for _, id := range ordered {
		if f.slots[id].owner != "" {
			taken = append(taken, id)
		}
	}
	if len(taken) == 0 {
		for _, id := range ordered {
			f.slots[id].owner = holdID
		}
	}
	return taken
}`,

"Listeners for released seats and a waitlist": `type ShowListener interface {
	SeatsReleased(show *Show, seats []Seat)       // a hold expired or a booking was cancelled
	ShowCancelled(show *Show, bookings []Booking) // every booking needs a refund and a message
}

// Show gains listeners []ShowListener (set before the show takes requests, read-only after)
// and, guarded by mu, closed bool (Hold refuses when true).

// Cancel splits in two: the locked part changes state, the unlocked part notifies.
func (s *Show) Cancel(bookingID, userID string, now time.Time) (Booking, error) {
	s.mu.Lock()
	b, err := s.cancelLocked(bookingID, userID, now) // the old method body
	s.mu.Unlock()
	if err != nil {
		return Booking{}, err
	}
	for _, l := range s.listeners { // lock released: slow listeners can't block
		l.SeatsReleased(s, b.Seats)
	}
	return b, nil
}

// CancelShow is the cinema cancelling the whole show: no new holds, every booking handed over for refunds.
func (s *Show) CancelShow() []Booking {
	s.mu.Lock()
	s.closed = true
	affected := slices.Collect(maps.Values(s.bookings))
	clear(s.bookings)
	clear(s.holds)
	clear(s.owner)
	s.mu.Unlock()
	for _, l := range s.listeners {
		l.ShowCancelled(s, affected)
	}
	return affected
}

type Notifier interface {
	Send(userID, message string)
}

// Waitlist is one listener: freed seats are offered to the first user waiting for that show.
type Waitlist struct {
	mu       sync.Mutex
	waiting  map[string][]string // show id -> user ids, oldest first
	notifier Notifier            // injected: email, SMS, push
}

func NewWaitlist(n Notifier) *Waitlist { return &Waitlist{waiting: map[string][]string{}, notifier: n} }

func (w *Waitlist) Join(showID, userID string) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.waiting[showID] = append(w.waiting[showID], userID)
}

func (w *Waitlist) SeatsReleased(show *Show, seats []Seat) {
	w.mu.Lock()
	queue := w.waiting[show.ID]
	if len(queue) == 0 {
		w.mu.Unlock()
		return
	}
	next := queue[0]
	w.waiting[show.ID] = queue[1:]
	w.mu.Unlock()
	w.notifier.Send(next, fmt.Sprintf("%d seats just opened for %s", len(seats), show.Movie.Title))
}

func (w *Waitlist) ShowCancelled(show *Show, bookings []Booking) {
	w.mu.Lock()
	delete(w.waiting, show.ID)
	w.mu.Unlock()
	for _, b := range bookings {
		w.notifier.Send(b.UserID, "Your show was cancelled; a refund is on its way")
	}
}`
} };
