// Go versions of the Main tab's code blocks for chapter 2, matched to the Java blocks by title. Imports are omitted.
window.ALT = window.ALT || {};
ALT.ch2 = ALT.ch2 || {};
ALT.ch2.go = Object.assign(ALT.ch2.go || {}, {
"A room calendar that refuses overlapping bookings": `type TimeRange struct{ Start, End time.Time } // NewTimeRange rejects Start >= End (omitted)

func (r TimeRange) Overlaps(o TimeRange) bool {
	return r.Start.Before(o.End) && o.Start.Before(r.End)
}

type Booking struct {
	ID, RoomID, EmployeeID string
	Range                  TimeRange
}

type RoomCalendar struct {
	roomID   string
	mu       sync.Mutex // guards bookings
	bookings []Booking
}

func (c *RoomCalendar) Book(employeeID string, r TimeRange) (Booking, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for _, b := range c.bookings {
		if b.Range.Overlaps(r) {
			return Booking{}, false
		}
	}
	b := Booking{ID: newID(), RoomID: c.roomID, EmployeeID: employeeID, Range: r}
	c.bookings = append(c.bookings, b)
	return b, true // Booking is a value: the caller gets a copy
}

func (c *RoomCalendar) Cancel(bookingID, employeeID string) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	i := slices.IndexFunc(c.bookings, func(b Booking) bool {
		return b.ID == bookingID && b.EmployeeID == employeeID
	})
	if i < 0 {
		return false
	}
	c.bookings = slices.Delete(c.bookings, i, i+1)
	return true
}`,
});
