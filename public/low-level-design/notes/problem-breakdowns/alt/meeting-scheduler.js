// Go versions of the Meeting Room Scheduler code blocks, matched to the Java blocks by title. Imports are omitted.
// Go has no TreeMap: each room keeps a slice sorted by start and searches it with sort.Search.
window.ALT = window.ALT || {};
ALT["meeting-scheduler"] = { go: {
"Public API": `func NewMeetingScheduler(rooms []Room, selection RoomSelectionStrategy) *MeetingScheduler
func (m *MeetingScheduler) Book(roomID string, req MeetingRequest) (*Booking, error)  // ErrRoomUnavailable if taken
func (m *MeetingScheduler) BookAny(q RoomQuery, req MeetingRequest) (*Booking, error) // best free room per the strategy
func (m *MeetingScheduler) Cancel(bookingID string) error
func (m *MeetingScheduler) Reschedule(bookingID, roomID string, when Interval) (*Booking, error) // all or nothing
func (m *MeetingScheduler) CalendarOf(person string, window Interval) []*Booking // a person's meetings; shows clashes too
func (m *MeetingScheduler) AddListener(l MeetingListener)`,

"Intervals, rooms and bookings": `type Interval struct{ Start, End time.Time } // half-open [Start, End)

func NewInterval(start, end time.Time) (Interval, error) {
	if !start.Before(end) {
		return Interval{}, errors.New("start must be before end")
	}
	return Interval{start, end}, nil
}

// Overlaps: a meeting ending at 10:00 doesn't clash with one starting at 10:00.
func (i Interval) Overlaps(o Interval) bool { return i.Start.Before(o.End) && o.Start.Before(i.End) }

type Equipment uint8 // a bit set

const (
	Projector Equipment = 1 << iota
	VideoConf
	Whiteboard
)

type Room struct {
	ID        string
	Name      string
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

// Booking is immutable once created: a reschedule makes a new one with the same ID.
type Booking struct {
	ID      string
	RoomID  string
	Meeting MeetingRequest
}

func (b *Booking) When() Interval { return b.Meeting.When }

func (b *Booking) People() []string {
	return append([]string{b.Meeting.Organizer}, b.Meeting.Attendees...)
}

func (b *Booking) MovedTo(roomID string, when Interval) *Booking {
	return &Booking{ID: b.ID, RoomID: roomID, Meeting: b.Meeting.At(when)}
}`,

"Room schedule": `// A slice kept sorted by start replaces Java's TreeMap. Insert and remove shift the slice
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
	return i == len(s.byStart) || !s.byStart[i].When().Start.Before(when.End) // starts at or after us
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

"Selection strategy and listeners": `type RoomSelectionStrategy interface {
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
		return strings.Compare(a.ID, b.ID)
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
		for _, p := range b.People() {
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
		locked := lockInOrder(from, to) // fixed order: no deadlock
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
	b := &Booking{ID: newID(), RoomID: s.Room.ID, Meeting: req} // newID: random, e.g. 16 bytes from crypto/rand as hex
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
	for _, p := range b.People() {
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

"Scheduler in one screen": `type Interval struct{ Start, End time.Time } // [Start, End)

func (i Interval) Overlaps(o Interval) bool { return i.Start.Before(o.End) && o.Start.Before(i.End) }

type RoomSchedule struct {
	mu      sync.Mutex
	byStart []*Booking // sorted by start, never overlapping
}

func (s *RoomSchedule) IsFree(w Interval) bool // sort.Search, then the two neighbours only

func (m *MeetingScheduler) Book(roomID string, r MeetingRequest) (*Booking, error)     // lock room, IsFree, insert, unlock, notify
func (m *MeetingScheduler) BookAny(q RoomQuery, r MeetingRequest) (*Booking, error)    // strategy ranks rooms; first tryBook wins
func (m *MeetingScheduler) Cancel(id string) error                                      // re-check current version under the lock
func (m *MeetingScheduler) Reschedule(id, roomID string, w Interval) (*Booking, error) // lock rooms by id; remove, check, add or restore`,

"One-lookup neighbour check": `// Stored bookings never overlap, so sorted by start they are also sorted by end.
// Of the bookings that start before our end, the last one ends latest: it is the only one to test.
func (s *RoomSchedule) IsFreeOneLookup(when Interval) bool {
	i := s.ceil(when.End) // first booking starting at or after our end
	return i == 0 || !s.byStart[i-1].When().End.After(when.Start)
}`,

"Lock-free reads with a skip list": `// Go's standard library has no concurrent skip list. The closest match is copy-on-write:
// writers (one at a time, under mu) build a new sorted slice and publish it atomically;
// readers load the current slice without locking and never see a half-written one.
type SnapshotSchedule struct {
	Room    Room
	mu      sync.Mutex                 // serialises writers: check-then-insert stays atomic
	byStart atomic.Pointer[[]*Booking] // never modified in place once published
}

func (s *SnapshotSchedule) TryAdd(b *Booking) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	cur := s.load()
	i := sort.Search(len(cur), func(i int) bool { return !cur[i].When().Start.Before(b.When().Start) })
	if i > 0 && cur[i-1].When().End.After(b.When().Start) {
		return false
	}
	if i < len(cur) && cur[i].When().Start.Before(b.When().End) {
		return false
	}
	next := slices.Insert(slices.Clone(cur), i, b) // copy, then publish
	s.byStart.Store(&next)
	return true
}

// StartingBetween takes no lock: a consistent snapshot, fine for showing a room's day,
// never for deciding a booking.
func (s *SnapshotSchedule) StartingBetween(from, to time.Time) []*Booking {
	var out []*Booking
	for _, b := range s.load() {
		if !b.When().Start.Before(from) && b.When().Start.Before(to) {
			out = append(out, b)
		}
	}
	return out
}

func (s *SnapshotSchedule) load() []*Booking {
	if p := s.byStart.Load(); p != nil {
		return *p
	}
	return nil
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
		next := Interval{start, start.Add(r.Length)}
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
		m.insert(s, b)
		made = append(made, b)
	}
	s.mu.Unlock()
	for _, b := range made {
		m.publish(MeetingEvent{Type: Booked, Booking: b})
	}
	return made, nil
}`,

"Hotel inventory with holds": `type RoomType int

const (
	Single RoomType = iota
	Double
	Suite
)

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

type Hold struct {
	ID        string
	Type      RoomType
	Stay      Stay
	ExpiresAt time.Time
}

var ErrSoldOut = errors.New("sold out")

type HotelInventory struct {
	rooms map[RoomType]int // how many of each type; fixed, read-only
	now   func() time.Time

	mu        sync.Mutex                 // guards the three maps below
	used      map[RoomType]map[int64]int // held + confirmed, per night
	holds     map[string]Hold
	confirmed map[string]Hold
}

func NewHotelInventory(rooms map[RoomType]int, now func() time.Time) *HotelInventory {
	return &HotelInventory{rooms: maps.Clone(rooms), now: now, used: map[RoomType]map[int64]int{},
		holds: map[string]Hold{}, confirmed: map[string]Hold{}}
}

func (inv *HotelInventory) Hold(t RoomType, stay Stay, ttl time.Duration) (Hold, error) {
	if !stay.CheckIn.Before(stay.CheckOut) {
		return Hold{}, errors.New("at least one night")
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
			return Hold{}, fmt.Errorf("%w: room type %d, night %d", ErrSoldOut, t, n)
		}
	}
	for _, n := range stay.Nights() { // every night, or none
		perNight[n]++
	}
	h := Hold{ID: newID(), Type: t, Stay: stay, ExpiresAt: inv.now().Add(ttl)}
	inv.holds[h.ID] = h
	return h, nil
}

// Confirm: payment succeeded, so the held nights stay counted and the hold becomes a reservation.
func (inv *HotelInventory) Confirm(holdID string) (string, error) {
	inv.mu.Lock()
	defer inv.mu.Unlock()
	inv.expireHolds()
	h, ok := inv.holds[holdID]
	if !ok {
		return "", errors.New("hold expired or unknown")
	}
	delete(inv.holds, holdID)
	inv.confirmed[h.ID] = h
	return h.ID, nil
}

func (inv *HotelInventory) Cancel(id string) {
	inv.mu.Lock()
	defer inv.mu.Unlock()
	h, ok := inv.holds[id]
	if ok {
		delete(inv.holds, id)
	} else if h, ok = inv.confirmed[id]; ok {
		delete(inv.confirmed, id)
	}
	if ok {
		inv.giveBack(h)
	}
}

func (inv *HotelInventory) expireHolds() { // lazy: on every call; caller holds mu
	now := inv.now()
	for id, h := range inv.holds {
		if now.Before(h.ExpiresAt) {
			continue
		}
		inv.giveBack(h)
		delete(inv.holds, id) // deleting while ranging over a map is allowed in Go
	}
}

func (inv *HotelInventory) giveBack(h Hold) {
	for _, n := range h.Stay.Nights() {
		inv.used[h.Type][n]--
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
