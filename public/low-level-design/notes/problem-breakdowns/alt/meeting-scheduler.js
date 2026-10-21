// Go versions of the Meeting Room Scheduler code blocks, matched to the Java blocks by title. Imports are omitted.
// Go has no TreeMap: each room keeps a slice sorted by start and searches it with sort.Search.
window.ALT = window.ALT || {};
ALT["meeting-scheduler"] = { go: {
"Interval, Room and Booking": `// Interval is half-open [Start, End): the end instant is not part of the meeting.
// Build it with NewInterval; a struct literal would skip the check.
type Interval struct{ Start, End time.Time }

func NewInterval(start, end time.Time) (Interval, error) {
	if !start.Before(end) { // zero-length or reversed
		return Interval{}, errors.New("start must be before end")
	}
	return Interval{start, end}, nil
}

func (i Interval) Overlaps(o Interval) bool { return i.Start.Before(o.End) && o.Start.Before(i.End) }

type Equipment uint8 // a bit set

const (
	Projector Equipment = 1 << iota
	VideoConf
	Whiteboard
)

type Room struct {
	ID        string
	Floor     int
	Capacity  int
	Equipment Equipment
}

type RoomQuery struct {
	MinCapacity    int
	Equipment      Equipment
	PreferredFloor *int // nil: no preference
}

func (r Room) Fits(q RoomQuery) bool {
	return r.Capacity >= q.MinCapacity && r.Equipment&q.Equipment == q.Equipment
}

func (q RoomQuery) OnPreferredFloor(r Room) bool {
	return q.PreferredFloor != nil && *q.PreferredFloor == r.Floor
}

type MeetingRequest struct {
	Title     string
	Organizer string
	Attendees []string // never mutated after construction
	When      Interval
}

func NewMeetingRequest(title, organizer string, attendees []string, when Interval) MeetingRequest {
	return MeetingRequest{title, organizer, slices.Clone(attendees), when}
}

func (m MeetingRequest) At(when Interval) MeetingRequest {
	m.When = when // m is a copy
	return m
}

// People returns the organizer and attendees, sorted and without duplicates.
func (m MeetingRequest) People() []string {
	all := append([]string{m.Organizer}, m.Attendees...)
	slices.Sort(all)
	return slices.Compact(all)
}

// Booking is immutable once created: a reschedule makes a new one with the same ID.
type Booking struct {
	ID      string
	RoomID  string
	Meeting MeetingRequest
}

func (b *Booking) When() Interval { return b.Meeting.When }

func (b *Booking) MovedTo(roomID string, when Interval) *Booking {
	return &Booking{ID: b.ID, RoomID: roomID, Meeting: b.Meeting.At(when)}
}`,

"Final class design": `type MeetingScheduler struct {
	rooms     map[string]*RoomSchedule // fixed at construction
	selection RoomSelectionStrategy

	idx      sync.Mutex                     // guards the two maps; taken after room locks, never before
	bookings map[string]*Booking            // id -> current version
	byPerson map[string]map[string]struct{} // person -> booking ids

	lmu       sync.RWMutex
	listeners []MeetingListener
}

func (m *MeetingScheduler) Book(roomID string, req MeetingRequest) (*Booking, error)              // ErrRoomUnavailable
func (m *MeetingScheduler) BookAny(q RoomQuery, req MeetingRequest) (*Booking, error)             // ErrNoRoomAvailable
func (m *MeetingScheduler) Cancel(bookingID string) error
func (m *MeetingScheduler) Reschedule(bookingID, roomID string, when Interval) (*Booking, error) // all or nothing
func (m *MeetingScheduler) CalendarOf(person string, window Interval) []*Booking
func (m *MeetingScheduler) AddListener(l MeetingListener)

type RoomSchedule struct {
	Room    Room
	mu      sync.Mutex // guards byStart
	byStart []*Booking // sorted by start, never overlapping
}

func (s *RoomSchedule) IsFree(when Interval) bool // the two neighbours only
func (s *RoomSchedule) add(b *Booking)
func (s *RoomSchedule) remove(b *Booking)

type RoomSelectionStrategy interface{ Rank(rooms []Room, q RoomQuery) []Room }
type MeetingListener interface{ OnChange(e MeetingEvent) }`,

"RoomSchedule": `// A slice kept sorted by start replaces Java's TreeMap. Insert and remove shift the slice
// (O(n) copying), cheap for a room's few dozen bookings a day; a B-tree such as
// github.com/google/btree gives O(log n) updates if a room ever holds many more.
type RoomSchedule struct {
	Room    Room
	mu      sync.Mutex
	byStart []*Booking // sorted by start, never overlapping; guarded by mu
}

// ceil returns the index of the first booking starting at or after t. Caller holds mu.
func (s *RoomSchedule) ceil(t time.Time) int {
	return sort.Search(len(s.byStart), func(i int) bool { return !s.byStart[i].When().Start.Before(t) })
}

// IsFree checks only the two neighbours of when.Start, because stored bookings never overlap. Caller holds mu.
func (s *RoomSchedule) IsFree(when Interval) bool {
	i := s.ceil(when.Start)
	if i > 0 && s.byStart[i-1].When().End.After(when.Start) { // starts before us, ends after our start
		return false
	}
	// Starts at or after our start (an equal start included): it must not start before our end.
	return i == len(s.byStart) || !s.byStart[i].When().Start.Before(when.End)
}

// add inserts in start order. Caller holds mu and has checked IsFree.
func (s *RoomSchedule) add(b *Booking) {
	s.byStart = slices.Insert(s.byStart, s.ceil(b.When().Start), b)
}

// remove deletes exactly this booking, if present. Caller holds mu.
func (s *RoomSchedule) remove(b *Booking) {
	if i := s.ceil(b.When().Start); i < len(s.byStart) && s.byStart[i] == b {
		s.byStart = slices.Delete(s.byStart, i, i+1)
	}
}`,

"Room selection and notifications": `type RoomSelectionStrategy interface {
	// Rank returns the rooms that fit the query, best first.
	Rank(rooms []Room, q RoomQuery) []Room
}

// SmallestFitFirst: preferred floor first, then the smallest room that fits,
// so big rooms stay free for big meetings.
type SmallestFitFirst struct{}

func (SmallestFitFirst) Rank(rooms []Room, q RoomQuery) []Room {
	var fit []Room
	for _, r := range rooms {
		if r.Fits(q) {
			fit = append(fit, r)
		}
	}
	slices.SortFunc(fit, func(a, b Room) int {
		if pa, pb := q.OnPreferredFloor(a), q.OnPreferredFloor(b); pa != pb {
			if pa {
				return -1
			}
			return 1
		}
		if a.Capacity != b.Capacity {
			return a.Capacity - b.Capacity
		}
		return strings.Compare(a.ID, b.ID) // deterministic ties
	})
	return fit
}

type ChangeType int

const (
	Booked ChangeType = iota
	Moved
	Cancelled
)

type MeetingEvent struct {
	Type     ChangeType
	Booking  *Booking
	Previous *Booking // only for Moved
}

type MeetingListener interface{ OnChange(e MeetingEvent) } // e-mail, chat, calendar sync`,

"MeetingScheduler": `var (
	ErrRoomUnavailable = errors.New("room is not free for that time")
	ErrNoRoomAvailable = errors.New("no matching room is free for that time")
)

type MeetingScheduler struct {
	rooms     map[string]*RoomSchedule // fixed at start, read-only after
	roomList  []Room
	selection RoomSelectionStrategy

	// idx guards bookings and byPerson. It is taken after room locks, never before, and held briefly.
	// A booking's entry changes only while its room's lock is held.
	idx      sync.Mutex
	bookings map[string]*Booking            // id -> current version
	byPerson map[string]map[string]struct{} // person -> booking ids

	lmu       sync.RWMutex
	listeners []MeetingListener
}

func NewMeetingScheduler(rooms []Room, selection RoomSelectionStrategy) *MeetingScheduler {
	m := &MeetingScheduler{
		rooms:     map[string]*RoomSchedule{},
		roomList:  slices.Clone(rooms),
		selection: selection,
		bookings:  map[string]*Booking{},
		byPerson:  map[string]map[string]struct{}{},
	}
	for _, r := range rooms {
		m.rooms[r.ID] = &RoomSchedule{Room: r}
	}
	return m
}

func (m *MeetingScheduler) AddListener(l MeetingListener) {
	m.lmu.Lock()
	m.listeners = append(m.listeners, l)
	m.lmu.Unlock()
}

func (m *MeetingScheduler) Book(roomID string, req MeetingRequest) (*Booking, error) {
	s, err := m.schedule(roomID)
	if err != nil {
		return nil, err
	}
	if b := m.tryBook(s, req); b != nil {
		return b, nil
	}
	return nil, fmt.Errorf("%w: %s", ErrRoomUnavailable, roomID)
}

func (m *MeetingScheduler) BookAny(q RoomQuery, req MeetingRequest) (*Booking, error) {
	for _, r := range m.selection.Rank(m.roomList, q) {
		if b := m.tryBook(m.rooms[r.ID], req); b != nil { // lost a race? try the next room
			return b, nil
		}
	}
	return nil, ErrNoRoomAvailable
}

func (m *MeetingScheduler) Cancel(bookingID string) error {
	for {
		b, err := m.find(bookingID)
		if err != nil {
			return err
		}
		s := m.rooms[b.RoomID]
		s.mu.Lock()
		m.idx.Lock()
		if m.bookings[bookingID] != b { // moved or cancelled meanwhile: look again
			m.idx.Unlock()
			s.mu.Unlock()
			continue
		}
		s.remove(b)
		delete(m.bookings, bookingID)
		for _, p := range b.Meeting.People() {
			delete(m.byPerson[p], bookingID) // delete on a nil map is a no-op
		}
		m.idx.Unlock()
		s.mu.Unlock()
		m.publish(MeetingEvent{Type: Cancelled, Booking: b})
		return nil
	}
}

func (m *MeetingScheduler) Reschedule(bookingID, roomID string, when Interval) (*Booking, error) {
	to, err := m.schedule(roomID)
	if err != nil {
		return nil, err
	}
	for {
		old, err := m.find(bookingID)
		if err != nil {
			return nil, err
		}
		from := m.rooms[old.RoomID]
		locked := lockInOrder(from, to) // room-id order: no deadlock
		m.idx.Lock()
		current := m.bookings[bookingID] == old
		m.idx.Unlock()
		if !current { // moved or cancelled meanwhile: look again
			unlockAll(locked)
			continue
		}
		from.remove(old) // a same-room move may overlap its old slot
		if !to.IsFree(when) {
			from.add(old) // put it back: the old slot is never lost
			unlockAll(locked)
			return nil, fmt.Errorf("%w: %s", ErrRoomUnavailable, roomID)
		}
		moved := old.MovedTo(roomID, when)
		to.add(moved)
		m.idx.Lock()
		m.bookings[bookingID] = moved // same id and people: byPerson is unchanged
		m.idx.Unlock()
		unlockAll(locked)
		m.publish(MeetingEvent{Type: Moved, Booking: moved, Previous: old})
		return moved, nil
	}
}

// CalendarOf returns a person's meetings in a window, clashes included.
func (m *MeetingScheduler) CalendarOf(person string, window Interval) []*Booking {
	var out []*Booking
	m.idx.Lock()
	for id := range m.byPerson[person] {
		if b := m.bookings[id]; b != nil && b.When().Overlaps(window) {
			out = append(out, b)
		}
	}
	m.idx.Unlock()
	slices.SortFunc(out, func(a, b *Booking) int { return a.When().Start.Compare(b.When().Start) })
	return out
}

func (m *MeetingScheduler) tryBook(s *RoomSchedule, req MeetingRequest) *Booking {
	s.mu.Lock()
	if !s.IsFree(req.When) {
		s.mu.Unlock()
		return nil
	}
	b := &Booking{ID: newID(), RoomID: s.Room.ID, Meeting: req} // newID: 16 bytes from crypto/rand, hex-encoded
	m.insert(s, b)                                              // check and insert under one lock
	s.mu.Unlock()
	m.publish(MeetingEvent{Type: Booked, Booking: b}) // outside the lock
	return b
}

// insert adds a booking to its room, the id map and every person's calendar. Caller holds s.mu.
func (m *MeetingScheduler) insert(s *RoomSchedule, b *Booking) {
	s.add(b)
	m.idx.Lock()
	defer m.idx.Unlock()
	m.bookings[b.ID] = b
	for _, p := range b.Meeting.People() {
		if m.byPerson[p] == nil {
			m.byPerson[p] = map[string]struct{}{}
		}
		m.byPerson[p][b.ID] = struct{}{}
	}
}

func (m *MeetingScheduler) publish(e MeetingEvent) {
	m.lmu.RLock()
	ls := slices.Clone(m.listeners)
	m.lmu.RUnlock()
	for _, l := range ls {
		func() {
			defer func() { _ = recover() }() // log; one bad listener must not affect the others
			l.OnChange(e)
		}()
	}
}

// lockInOrder locks one or two distinct rooms in id order; a Go mutex is not reentrant, so a room is locked once.
func lockInOrder(a, b *RoomSchedule) []*RoomSchedule {
	order := []*RoomSchedule{a}
	if b != a {
		order = append(order, b)
		if b.Room.ID < a.Room.ID {
			order[0], order[1] = b, a
		}
	}
	for _, s := range order {
		s.mu.Lock()
	}
	return order
}

func unlockAll(locked []*RoomSchedule) {
	for i := len(locked) - 1; i >= 0; i-- {
		locked[i].mu.Unlock()
	}
}

func (m *MeetingScheduler) find(id string) (*Booking, error) {
	m.idx.Lock()
	defer m.idx.Unlock()
	b, ok := m.bookings[id]
	if !ok {
		return nil, fmt.Errorf("unknown booking %s", id)
	}
	return b, nil
}

func (m *MeetingScheduler) schedule(roomID string) (*RoomSchedule, error) {
	s, ok := m.rooms[roomID]
	if !ok {
		return nil, fmt.Errorf("unknown room %s", roomID)
	}
	return s, nil
}`,

"Scheduler in one screen": `type Interval struct{ Start, End time.Time } // [Start, End); NewInterval rejects Start >= End

func (i Interval) Overlaps(o Interval) bool { return i.Start.Before(o.End) && o.Start.Before(i.End) }

type Booking struct { // immutable; a move = new value, same ID
	ID, RoomID string
	Meeting    MeetingRequest
}

type RoomSchedule struct {
	mu      sync.Mutex
	byStart []*Booking // sorted by start, never overlapping
}

func (s *RoomSchedule) IsFree(w Interval) bool // sort.Search, then the two neighbours only

func (m *MeetingScheduler) Book(roomID string, r MeetingRequest) (*Booking, error)     // lock room, IsFree, insert, unlock, notify
func (m *MeetingScheduler) BookAny(q RoomQuery, r MeetingRequest) (*Booking, error)    // strategy ranks rooms; first tryBook wins
func (m *MeetingScheduler) Cancel(id string) error                                      // look up, lock, re-check version, remove
func (m *MeetingScheduler) Reschedule(id, roomID string, w Interval) (*Booking, error) // lock rooms by id; remove, check, add or restore
func (m *MeetingScheduler) CalendarOf(person string, window Interval) []*Booking       // person index; shows clashes`,

"Booking every occurrence or none": `type Recurrence struct {
	FirstStart time.Time // in the meeting's time zone (time.LoadLocation)
	Length     time.Duration
	EveryDays  int // 7 for weekly
	Count      int
}

// Occurrences repeats on the wall clock: AddDate keeps 10:00 at 10:00 across daylight-saving changes.
func (r Recurrence) Occurrences() ([]Interval, error) {
	out := make([]Interval, 0, r.Count)
	for i := 0; i < r.Count; i++ {
		start := r.FirstStart.AddDate(0, 0, i*r.EveryDays)
		next, err := NewInterval(start, start.Add(r.Length))
		if err != nil {
			return nil, err
		}
		if len(out) > 0 && out[len(out)-1].Overlaps(next) {
			return nil, errors.New("occurrences overlap each other")
		}
		out = append(out, next)
	}
	return out, nil
}

// BookRecurring books every occurrence in one room, or none, under that room's lock.
func (m *MeetingScheduler) BookRecurring(roomID string, template MeetingRequest, r Recurrence) ([]*Booking, error) {
	s, err := m.schedule(roomID)
	if err != nil {
		return nil, err
	}
	slots, err := r.Occurrences() // computed before taking the lock
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	for _, when := range slots {
		if !s.IsFree(when) {
			s.mu.Unlock()
			return nil, fmt.Errorf("%w: %s at %v", ErrRoomUnavailable, roomID, when.Start) // nothing written yet
		}
	}
	series := newID()
	made := make([]*Booking, 0, len(slots))
	for i, when := range slots {
		b := &Booking{ID: fmt.Sprintf("%s/%d", series, i), RoomID: roomID, Meeting: template.At(when)}
		m.insert(s, b) // room, id map and person index
		made = append(made, b)
	}
	s.mu.Unlock()
	for _, b := range made {
		m.publish(MeetingEvent{Type: Booked, Booking: b})
	}
	return made, nil
}`,

"Attendees must be free: person locks after the room lock": `// On MeetingScheduler. Global lock order: room mutexes (by room id), then person mutexes (by name), then idx.
//   personMu            sync.Mutex             // guards personLocks only; a leaf lock, held briefly
//   personLocks         map[string]*sync.Mutex
//   attendeesMustBeFree bool                   // the product decision, fixed at construction

var ErrAttendeeBusy = errors.New("an attendee is busy")

func (m *MeetingScheduler) personLock(p string) *sync.Mutex {
	m.personMu.Lock()
	defer m.personMu.Unlock()
	l, ok := m.personLocks[p]
	if !ok {
		l = &sync.Mutex{}
		m.personLocks[p] = l
	}
	return l
}

// lockPeople locks each person once, in name order. People() is sorted and deduplicated,
// which matters: a Go mutex is not reentrant, so locking the same person twice would hang.
func (m *MeetingScheduler) lockPeople(people []string) []*sync.Mutex {
	held := make([]*sync.Mutex, 0, len(people))
	for _, p := range people {
		l := m.personLock(p)
		l.Lock()
		held = append(held, l)
	}
	return held
}

// ConflictsFor returns every attendee's meetings that overlap the request; a reschedule passes its own ID.
func (m *MeetingScheduler) ConflictsFor(req MeetingRequest, ignoreID string) []*Booking {
	seen := map[string]bool{}
	var out []*Booking
	for _, p := range req.People() {
		for _, b := range m.CalendarOf(p, req.When) {
			if b.ID != ignoreID && !seen[b.ID] {
				seen[b.ID] = true
				out = append(out, b)
			}
		}
	}
	return out
}

func (m *MeetingScheduler) tryBook(s *RoomSchedule, req MeetingRequest) (*Booking, error) {
	s.mu.Lock() // rooms first ...
	var people []*sync.Mutex
	if m.attendeesMustBeFree {
		people = m.lockPeople(req.People()) // ... then people
	}
	unlock := func() {
		for i := len(people) - 1; i >= 0; i-- {
			people[i].Unlock()
		}
		s.mu.Unlock()
	}
	if !s.IsFree(req.When) {
		unlock()
		return nil, nil // room taken: BookAny tries the next room
	}
	if m.attendeesMustBeFree {
		if clashes := m.ConflictsFor(req, ""); len(clashes) > 0 {
			unlock()
			return nil, fmt.Errorf("%w: %d clash(es)", ErrAttendeeBusy, len(clashes)) // another room won't help
		}
	}
	b := &Booking{ID: newID(), RoomID: s.Room.ID, Meeting: req}
	m.insert(s, b)
	unlock()
	m.publish(MeetingEvent{Type: Booked, Booking: b})
	return b, nil
}`,

"The deadlock-prone version": `// DON'T: locks "from" then "to" in request order.
// Goroutine 1 moves a meeting R1 -> R2 while goroutine 2 moves another R2 -> R1:
// each holds its first lock and waits forever for the other's.
// In Go it also deadlocks on a same-room move, because sync.Mutex is not reentrant.
func (m *MeetingScheduler) rescheduleUnsafe(bookingID, roomID string, when Interval) (*Booking, error) {
	old, err := m.find(bookingID)
	if err != nil {
		return nil, err
	}
	from, to := m.rooms[old.RoomID], m.rooms[roomID]
	from.mu.Lock()
	defer from.mu.Unlock()
	to.mu.Lock()
	defer to.mu.Unlock()
	// remove, check, add or restore
	return old.MovedTo(roomID, when), nil
}`,

"Hotel inventory with holds": `type RoomType int

const (
	Single RoomType = iota
	Double
	Suite
)

type ReservationStatus int

const (
	Held ReservationStatus = iota
	Confirmed
	CancelledRes
	Expired
)

type Amenity int

const (
	Breakfast Amenity = iota
	Spa
)

var amenityCentsPerNight = map[Amenity]int64{Breakfast: 2500, Spa: 4000} // read-only

type Stay struct{ CheckIn, CheckOut time.Time } // UTC midnights; [CheckIn, CheckOut) = the nights slept

// Nights returns each night as a day number since 1970: a plain int, safe as a map key
// (time.Time keys also compare location and monotonic clock data).
func (s Stay) Nights() []int64 {
	var out []int64
	for d := s.CheckIn.Unix() / 86400; d < s.CheckOut.Unix()/86400; d++ {
		out = append(out, d)
	}
	return out
}

type Reservation struct {
	ID, GuestID   string
	Type          RoomType
	Stay          Stay
	HoldExpiresAt time.Time
	Status        ReservationStatus
}

var (
	ErrSoldOut  = errors.New("sold out")
	ErrHoldGone = errors.New("hold expired or unknown")
)

type HotelInventory struct {
	rooms        map[RoomType]int   // how many of each type; fixed, read-only
	nightlyCents map[RoomType]int64 // rates in minor units; fixed, read-only
	now          func() time.Time

	mu           sync.Mutex // guards the three maps below
	used         map[RoomType]map[int64]int // Held + Confirmed, per night
	reservations map[string]Reservation
	holds        map[string]Reservation // Held only, for cheap expiry
}

func NewHotelInventory(rooms map[RoomType]int, rates map[RoomType]int64, now func() time.Time) *HotelInventory {
	return &HotelInventory{rooms: maps.Clone(rooms), nightlyCents: maps.Clone(rates), now: now,
		used: map[RoomType]map[int64]int{}, reservations: map[string]Reservation{}, holds: map[string]Reservation{}}
}

// QuoteCents prices a stay on the server; never trust a total sent by the client. Read-only inputs, so no lock.
func (inv *HotelInventory) QuoteCents(t RoomType, stay Stay, extras []Amenity) (int64, error) {
	perNight := inv.nightlyCents[t]
	for _, a := range extras {
		perNight += amenityCentsPerNight[a]
	}
	n := int64(len(stay.Nights()))
	if n > 0 && perNight > math.MaxInt64/n {
		return 0, errors.New("price overflow")
	}
	return perNight * n, nil
}

func (inv *HotelInventory) Hold(guestID string, t RoomType, stay Stay, ttl time.Duration) (Reservation, error) {
	if !stay.CheckIn.Before(stay.CheckOut) {
		return Reservation{}, errors.New("at least one night")
	}
	inv.mu.Lock()
	defer inv.mu.Unlock()
	inv.expireHolds()
	perNight := inv.used[t]
	if perNight == nil {
		perNight = map[int64]int{}
		inv.used[t] = perNight
	}
	for _, n := range stay.Nights() {
		if perNight[n] >= inv.rooms[t] {
			return Reservation{}, fmt.Errorf("%w: room type %d, night %d", ErrSoldOut, t, n)
		}
	}
	for _, n := range stay.Nights() { // every night, or none
		perNight[n]++
	}
	r := Reservation{ID: newID(), GuestID: guestID, Type: t, Stay: stay, HoldExpiresAt: inv.now().Add(ttl), Status: Held}
	inv.reservations[r.ID] = r
	inv.holds[r.ID] = r
	return r, nil
}

// Confirm: payment succeeded. Idempotent: a retried confirmation returns the same reservation.
func (inv *HotelInventory) Confirm(id string) (Reservation, error) {
	inv.mu.Lock()
	defer inv.mu.Unlock()
	inv.expireHolds()
	r, ok := inv.reservations[id]
	if ok && r.Status == Confirmed {
		return r, nil
	}
	if !ok || r.Status != Held {
		return Reservation{}, ErrHoldGone
	}
	delete(inv.holds, id)
	r.Status = Confirmed // r is a copy
	inv.reservations[id] = r
	return r, nil
}

func (inv *HotelInventory) Cancel(id string) {
	inv.mu.Lock()
	defer inv.mu.Unlock()
	r, ok := inv.reservations[id]
	if !ok || (r.Status != Held && r.Status != Confirmed) {
		return
	}
	delete(inv.holds, id)
	inv.giveBack(r)
	r.Status = CancelledRes
	inv.reservations[id] = r
}

func (inv *HotelInventory) expireHolds() { // lazy: on every call; caller holds mu
	now := inv.now()
	for id, r := range inv.holds {
		if now.Before(r.HoldExpiresAt) {
			continue
		}
		inv.giveBack(r)
		r.Status = Expired
		inv.reservations[id] = r
		delete(inv.holds, id) // deleting while ranging over a map is allowed in Go
	}
}

func (inv *HotelInventory) giveBack(r Reservation) {
	for _, n := range r.Stay.Nights() {
		inv.used[r.Type][n]--
	}
}`,

"Minimum rooms with a sweep": `func MinRooms(meetings []Interval) int {
	starts := make([]time.Time, len(meetings))
	ends := make([]time.Time, len(meetings))
	for i, m := range meetings {
		starts[i], ends[i] = m.Start, m.End
	}
	byTime := func(a, b time.Time) int { return a.Compare(b) }
	slices.SortFunc(starts, byTime)
	slices.SortFunc(ends, byTime)
	rooms, best, e := 0, 0, 0
	for _, s := range starts {
		for !ends[e].After(s) { // ended at or before s: half-open, so free first
			rooms--
			e++
		}
		rooms++
		best = max(best, rooms)
	}
	return best
}`
} };
