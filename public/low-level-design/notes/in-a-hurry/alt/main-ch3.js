// Go versions of the Main tab's code blocks for chapter 3, matched to the Java blocks by title. Imports are omitted.
window.ALT = window.ALT || {};
ALT.ch3 = ALT.ch3 || {};
ALT.ch3.go = Object.assign(ALT.ch3.go || {}, {
"Fare service before the refactor": `// Stateless, so safe for concurrent use, but it changes for three unrelated reasons
type FareService struct{}

func (FareService) Charge(riderID string, t RideType, meters int64, minutes int64) int64 {
	var cents int64
	switch t {
	case Standard:
		cents = 250 + (meters*120)/1000 + minutes*20
	case Premium:
		cents = 500 + (meters*210)/1000 + minutes*35
	case Pool:
		cents = 150 + (meters*80)/1000
	}
	NewSMTPMailer(MailConfigFromEnv()).Send(riderID, fmt.Sprint("Your fare: ", cents, " cents"))
	return cents
}`,

"Fare service after the refactor": `type FarePolicy interface {
	FareCents(meters, minutes int64) int64
}

type MeteredFare struct{ BaseCents, CentsPerKm, CentsPerMinute int64 } // a value: copied, never shared

func (f MeteredFare) FareCents(meters, minutes int64) int64 {
	return f.BaseCents + (meters*f.CentsPerKm)/1000 + minutes*f.CentsPerMinute
}

type ReceiptSender interface {
	Send(riderID string, fareCents int64)
}

type FareService struct {
	policies map[RideType]FarePolicy // copied in the constructor, never written again
	receipts ReceiptSender           // injected; must itself be safe for concurrent use
}

func NewFareService(p map[RideType]FarePolicy, r ReceiptSender) *FareService {
	return &FareService{policies: maps.Clone(p), receipts: r}
}

func (s *FareService) Charge(riderID string, t RideType, meters, minutes int64) (int64, error) {
	policy, ok := s.policies[t] // concurrent reads of a map nobody writes are safe
	if !ok {
		return 0, fmt.Errorf("no fare for %v", t)
	}
	cents := policy.FareCents(meters, minutes)
	s.receipts.Send(riderID, cents)
	return cents, nil
}`,
});
