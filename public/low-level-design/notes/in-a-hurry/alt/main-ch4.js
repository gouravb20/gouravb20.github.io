// Go versions of the Main tab's code blocks for chapter 4, matched to the Java blocks by title. Imports are omitted.
window.ALT = window.ALT || {};
ALT.ch4 = ALT.ch4 || {};
ALT.ch4.go = Object.assign(ALT.ch4.go || {}, {
"A wallet that guards its own balance": `var ErrNonPositive = errors.New("amount must be positive")

type Wallet struct {
	ownerID      string     // set once, never changed
	mu           sync.Mutex // guards balanceCents
	balanceCents int64
}

func NewWallet(ownerID string) *Wallet { return &Wallet{ownerID: ownerID} }

func (w *Wallet) Deposit(cents int64) error {
	if cents <= 0 {
		return ErrNonPositive
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	w.balanceCents += cents
	return nil
}

func (w *Wallet) Withdraw(cents int64) (bool, error) {
	if cents <= 0 {
		return false, ErrNonPositive
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	if cents > w.balanceCents { // the promise: never negative
		return false, nil
	}
	w.balanceCents -= cents
	return true, nil
}

func (w *Wallet) BalanceCents() int64 {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.balanceCents
}`,

"Alerts composed from channels": `type Channel interface {
	Deliver(userID, message string)
}

type EmailChannel struct{ client EmailClient }

func (c EmailChannel) Deliver(userID, message string) { c.client.Send(userID, message) }

type SmsChannel struct{ gateway SmsGateway }

func (c SmsChannel) Deliver(userID, message string) { c.gateway.Text(userID, message) }

type AlertService struct {
	channels []Channel // copied in the constructor, never modified
}

func NewAlertService(channels []Channel) *AlertService {
	return &AlertService{channels: slices.Clone(channels)}
}

func (s *AlertService) Alert(userID, message string) {
	for _, c := range s.channels { // dynamic dispatch through the interface
		c.Deliver(userID, message)
	}
}`,
});
