// Go versions of the Main tab's code blocks for chapter 1, matched to the Java blocks by title. Imports are omitted.
window.ALT = window.ALT || {};
ALT.ch1 = ALT.ch1 || {};
ALT.ch1.go = Object.assign(ALT.ch1.go || {}, {
"A seat that enforces its own rules, safely": `type SeatStatus int

const (
	Free SeatStatus = iota
	Held
	Booked
)

type Seat struct {
	id     string
	mu     sync.Mutex // guards status and holder
	status SeatStatus
	holder string
}

func NewSeat(id string) *Seat { return &Seat{id: id} }

func (s *Seat) Hold(customerID string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.status != Free {
		return false
	}
	s.status, s.holder = Held, customerID
	return true
}

func (s *Seat) Confirm(customerID string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.status != Held || s.holder != customerID {
		return false
	}
	s.status = Booked
	return true
}

func (s *Seat) Release(customerID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.status == Held && s.holder == customerID {
		s.status, s.holder = Free, ""
	}
}`,
});
