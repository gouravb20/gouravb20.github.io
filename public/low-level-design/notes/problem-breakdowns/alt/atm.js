// Go versions of the ATM code blocks, matched to the Java blocks by title. Imports are omitted.
window.ALT = window.ALT || {};
ALT["atm"] = { go: {
"Public API": `// Customer actions, interpreted by the current state
func (a *ATM) InsertCard(card Card) error
func (a *ATM) EnterPin(pin string) (PinResult, error) // PinOK, PinWrong or PinCardRetained
func (a *ATM) Balance() (int64, error)                 // paise
func (a *ATM) Withdraw(amount int64) (Transaction, error)
func (a *ATM) EjectCard() error

// Operator actions
func (a *ATM) Refill(note int64, count int) error
func (a *ATM) TakeOutOfService() error
func (a *ATM) Restore() error
func (a *ATM) Journal() []Transaction`,

"Values and the bank interface": `type Card struct{ Number string }

func (c Card) Masked() string { return "XXXX" + c.Number[len(c.Number)-4:] }
func (c Card) String() string { return "Card[" + c.Masked() + "]" } // never print the full number

type PinResult int

const (
	PinOK PinResult = iota
	PinWrong
	PinCardRetained
)

type AuthResult int

const (
	AuthOK AuthResult = iota
	AuthWrongPin
	AuthBlocked
)

type DebitResult int

const (
	DebitOK DebitResult = iota
	DebitInsufficientFunds
	DebitDailyLimitExceeded
	DebitCancelled // reversed before it arrived
)

func (r DebitResult) String() string {
	return [...]string{"OK", "INSUFFICIENT_FUNDS", "DAILY_LIMIT_EXCEEDED", "CANCELLED"}[r]
}

type TxnStatus string

const (
	Completed TxnStatus = "COMPLETED"
	Declined  TxnStatus = "DECLINED"
	Reversed  TxnStatus = "REVERSED"
)

type Transaction struct {
	ID, ATMID, MaskedCard string
	Amount                int64 // paise
	Status                TxnStatus
	Reason                string
	At                    time.Time
}

// BankService owns balances, PIN checks and the daily limit; the ATM only asks.
type BankService interface {
	VerifyPin(cardNumber, pin string) AuthResult // the bank counts failures across all ATMs
	Balance(cardNumber string) int64
	Debit(cardNumber string, amount int64, idempotencyKey string) DebitResult // atomic; a repeated key returns the first result
	Reverse(cardNumber, idempotencyKey string)                               // undoes that debit once
}

type CashHardware interface {
	Dispense(notes map[int64]int) error // note value -> count; an error is a fault
	ReturnCard()
	RetainCard()
}`,

"Inventory-aware dispense chain": `// Cassette is one link in the chain: one note value. Not safe alone: the ATM's mutex guards it.
type Cassette struct {
	note  int64 // paise
	count int
	next  *Cassette // the next smaller note, or nil
}

// Plan adds the notes that make amount from this cassette and the ones after it.
// It tries the most notes first, then fewer, so it finds a mix whenever one exists. It changes no counts.
func (c *Cassette) Plan(amount int64, plan map[int64]int) bool {
	if amount == 0 {
		return true
	}
	most := int(min(int64(c.count), amount/c.note))
	for use := most; use >= 0; use-- {
		rest := amount - int64(use)*c.note
		if rest == 0 || (c.next != nil && c.next.Plan(rest, plan)) {
			if use > 0 {
				plan[c.note] = use
			}
			return true
		}
	}
	return false
}

type CashDispenser struct{ head *Cassette } // largest note first

func NewCashDispenser(notesLargestFirst ...int64) *CashDispenser {
	var c *Cassette
	for i := len(notesLargestFirst) - 1; i >= 0; i-- {
		c = &Cassette{note: notesLargestFirst[i], next: c}
	}
	return &CashDispenser{head: c}
}

func (d *CashDispenser) Plan(amount int64) (map[int64]int, bool) {
	plan := map[int64]int{}
	return plan, d.head.Plan(amount, plan)
}

// Take checks every cassette, then removes: never a partial removal.
func (d *CashDispenser) Take(plan map[int64]int) error {
	for c := d.head; c != nil; c = c.next {
		if c.count < plan[c.note] {
			return errors.New("stale plan")
		}
	}
	for c := d.head; c != nil; c = c.next {
		c.count -= plan[c.note]
	}
	return nil
}

func (d *CashDispenser) Load(note int64, count int) error {
	for c := d.head; c != nil; c = c.next {
		if c.note == note {
			c.count += count
			return nil
		}
	}
	return fmt.Errorf("no cassette for note %d", note)
}

func (d *CashDispenser) Total() int64 {
	var sum int64
	for c := d.head; c != nil; c = c.next {
		sum += c.note * int64(c.count)
	}
	return sum
}`,

"Session states": `// ATMState says what each customer action means right now. States are immutable values;
// the ATM swaps them while holding its mutex.
type ATMState interface {
	InsertCard(a *ATM, card Card) error
	EnterPin(a *ATM, pin string) (PinResult, error)
	Balance(a *ATM) (int64, error)
	Withdraw(a *ATM, amount int64) (Transaction, error)
	EjectCard(a *ATM) error
}

// rejectAll answers "not now" to every action; each state embeds it and overrides what it allows.
type rejectAll struct{ name string }

func (r rejectAll) err(action string) error { return fmt.Errorf("cannot %s while %s", action, r.name) }

func (r rejectAll) InsertCard(*ATM, Card) error               { return r.err("insert a card") }
func (r rejectAll) EnterPin(*ATM, string) (PinResult, error)  { return 0, r.err("enter a PIN") }
func (r rejectAll) Balance(*ATM) (int64, error)               { return 0, r.err("check the balance") }
func (r rejectAll) Withdraw(*ATM, int64) (Transaction, error) { return Transaction{}, r.err("withdraw") }
func (r rejectAll) EjectCard(*ATM) error                      { return r.err("eject a card") }

type Idle struct{ rejectAll }

func (Idle) InsertCard(a *ATM, card Card) error {
	a.state = cardInserted(card, 0)
	return nil
}

type CardInserted struct {
	rejectAll
	card      Card
	wrongPins int
}

func (s CardInserted) EnterPin(a *ATM, pin string) (PinResult, error) {
	r := a.bank.VerifyPin(s.card.Number, pin)
	if r == AuthOK {
		a.state = authenticated(s.card)
		return PinOK, nil
	}
	if r == AuthBlocked || s.wrongPins+1 >= MaxPinAttempts {
		a.retainCard() // ends the session
		return PinCardRetained, nil
	}
	a.state = cardInserted(s.card, s.wrongPins+1)
	return PinWrong, nil
}

func (CardInserted) EjectCard(a *ATM) error { a.endSession(); return nil }

type Authenticated struct {
	rejectAll
	card Card
}

func (s Authenticated) Balance(a *ATM) (int64, error) { return a.bank.Balance(s.card.Number), nil }

func (s Authenticated) Withdraw(a *ATM, amount int64) (Transaction, error) {
	return a.runWithdrawal(s.card, amount), nil
}

func (Authenticated) EjectCard(a *ATM) error { a.endSession(); return nil }

type Reason int

const (
	OutOfCash Reason = iota
	Fault
	Maintenance
)

type OutOfService struct { // rejects every customer action
	rejectAll
	reason Reason
}

func idle() ATMState                         { return Idle{rejectAll{"Idle"}} }
func cardInserted(c Card, wrong int) ATMState { return CardInserted{rejectAll{"CardInserted"}, c, wrong} }
func authenticated(c Card) ATMState          { return Authenticated{rejectAll{"Authenticated"}, c} }
func outOfService(r Reason) ATMState         { return OutOfService{rejectAll{"OutOfService"}, r} }`,

"Atm": `const (
	Rs             int64 = 100        // paise per rupee
	Step                 = 100 * Rs   // withdrawals in multiples of Rs 100
	PerTxnLimit          = 10000 * Rs // per transaction
	MaxPinAttempts       = 3
)

// ATM guards state, cash and journal with one mutex: every exported method locks it,
// so a refill can never land between a withdrawal's plan and its take.
type ATM struct {
	mu       sync.Mutex
	id       string
	bank     BankService
	hardware CashHardware
	cash     *CashDispenser
	journal  []Transaction
	state    ATMState
}

func NewATM(id string, bank BankService, hw CashHardware) *ATM {
	return &ATM{
		id: id, bank: bank, hardware: hw,
		cash:  NewCashDispenser(2000*Rs, 500*Rs, 200*Rs, 100*Rs),
		state: outOfService(OutOfCash), // empty until refilled
	}
}

// Customer actions: delegate to the current state.
func (a *ATM) InsertCard(card Card) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.state.InsertCard(a, card)
}

func (a *ATM) EnterPin(pin string) (PinResult, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.state.EnterPin(a, pin)
}

func (a *ATM) Balance() (int64, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.state.Balance(a)
}

func (a *ATM) Withdraw(amount int64) (Transaction, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.state.Withdraw(a, amount)
}

func (a *ATM) EjectCard() error {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.state.EjectCard(a)
}

// Operator actions: may arrive mid-session; the mutex runs each one whole.
func (a *ATM) Refill(note int64, count int) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if count <= 0 {
		return errors.New("count must be positive")
	}
	if err := a.cash.Load(note, count); err != nil {
		return err
	}
	if s, ok := a.state.(OutOfService); ok && s.reason == OutOfCash {
		a.state = idle()
	}
	return nil
}

func (a *ATM) TakeOutOfService() error {
	a.mu.Lock()
	defer a.mu.Unlock()
	switch a.state.(type) {
	case Idle, OutOfService:
		a.state = outOfService(Maintenance)
		return nil
	}
	return errors.New("a customer is mid-session")
}

func (a *ATM) Restore() error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if _, ok := a.state.(OutOfService); !ok {
		return errors.New("not out of service")
	}
	a.idleOrOutOfCash()
	return nil
}

func (a *ATM) Journal() []Transaction {
	a.mu.Lock()
	defer a.mu.Unlock()
	return slices.Clone(a.journal)
}

// The helpers below are called by states, so a.mu is already held.
func (a *ATM) retainCard() { a.hardware.RetainCard(); a.idleOrOutOfCash() }
func (a *ATM) endSession() { a.hardware.ReturnCard(); a.idleOrOutOfCash() }

func (a *ATM) idleOrOutOfCash() {
	if a.cash.Total() >= Step {
		a.state = idle()
	} else {
		a.state = outOfService(OutOfCash)
	}
}

// runWithdrawal plans the notes, debits the bank, then dispenses; a dispenser fault reverses the debit.
func (a *ATM) runWithdrawal(card Card, amount int64) Transaction {
	id := uuid.NewString() // also the bank's idempotency key
	if amount <= 0 || amount%Step != 0 {
		return a.record(id, card, amount, Declined, "amount must be a multiple of Rs 100")
	}
	if amount > PerTxnLimit {
		return a.record(id, card, amount, Declined, "above the per-transaction limit")
	}
	plan, ok := a.cash.Plan(amount) // reads counts only
	if !ok {
		return a.record(id, card, amount, Declined, "notes for this amount are not available")
	}
	if r := a.bank.Debit(card.Number, amount, id); r != DebitOK {
		return a.record(id, card, amount, Declined, r.String())
	}
	_ = a.cash.Take(plan) // cannot fail: the plan was made under the same lock
	if err := a.hardware.Dispense(plan); err != nil {
		a.bank.Reverse(card.Number, id) // compensate; jammed notes go to the reject bin
		a.hardware.ReturnCard()
		a.state = outOfService(Fault)
		return a.record(id, card, amount, Reversed, "dispenser fault, debit reversed")
	}
	return a.record(id, card, amount, Completed, "dispensed")
}

func (a *ATM) record(id string, card Card, amount int64, status TxnStatus, reason string) Transaction {
	t := Transaction{ID: id, ATMID: a.id, MaskedCard: card.Masked(), Amount: amount,
		Status: status, Reason: reason, At: time.Now()}
	a.journal = append(a.journal, t)
	return t
}`,

"ATM in one screen": `type ATMState interface { // InsertCard, EnterPin, Balance, Withdraw, EjectCard
	EnterPin(a *ATM, pin string) (PinResult, error) // states embed rejectAll and override what they allow
	// ...
}

type CardInserted struct { // 3rd wrong PIN: retain the card
	rejectAll
	card      Card
	wrongPins int
}

type Cassette struct { // chain link, largest note first
	note  int64
	count int
	next  *Cassette
}

// (c *Cassette) Plan(amount int64, plan map[int64]int) bool: most notes first, back off on failure

// ATM: every exported method holds a.mu.
// runWithdrawal: validate, plan (reads only), bank.Debit(key), take notes, dispense;
// on a dispense error: bank.Reverse(key) and outOfService(Fault).

type BankService interface {
	VerifyPin(card, pin string) AuthResult
	Debit(card string, amount int64, key string) DebitResult // atomic per account, idempotent
	Reverse(card, key string)
}`,

"Same rules as an enum switch": `type Status int

const (
	StatusIdle Status = iota
	StatusCardInserted
	StatusAuthenticated
	StatusOutOfService
)

type SwitchATM struct {
	mu        sync.Mutex
	status    Status
	card      *Card // meaningful only in CardInserted and Authenticated
	wrongPins int   // meaningful only in CardInserted
}

func (a *SwitchATM) EnterPin(pin string) (PinResult, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	switch a.status {
	case StatusCardInserted:
		// verify, count, maybe retain
		return PinOK, nil
	default:
		return 0, fmt.Errorf("cannot enter a PIN in status %d", a.status)
	}
}

func (a *SwitchATM) EjectCard() error {
	a.mu.Lock()
	defer a.mu.Unlock()
	switch a.status {
	case StatusCardInserted, StatusAuthenticated:
		a.card, a.wrongPins, a.status = nil, 0, StatusIdle // forget one reset and the next customer inherits it
		return nil
	default:
		return errors.New("no card to eject")
	}
}

// ... and the same switch again in InsertCard, Balance and Withdraw`,

"Greedy chain that fails on 600": `type GreedyLink struct {
	note  int64
	count int
	next  *GreedyLink
}

func (l *GreedyLink) Plan(amount int64, plan map[int64]int) bool {
	use := int(min(int64(l.count), amount/l.note)) // take as many as fit, never fewer
	if use > 0 {
		plan[l.note] = use
	}
	rest := amount - int64(use)*l.note
	return rest == 0 || (l.next != nil && l.next.Plan(rest, plan))
}

// Cassettes: Rs 500 x 10, Rs 200 x 10, no Rs 100. Plan(600) takes one 500, leaves 100 and fails,
// although 200 + 200 + 200 works. It also leaves a half-filled plan behind on failure.`,

"Fewest notes by dynamic programming": `// FewestNotes returns the fewest notes that make amount using at most counts[i] notes of value notes[i].
// Amounts are in units of Rs 100, so a Rs 10,000 cap means a table of 101 cells.
func FewestNotes(amount int, notes, counts []int) ([]int, bool) {
	const none = math.MaxInt
	n := len(notes)
	best := make([]int, amount+1) // fewest notes for each sub-amount so far
	take := make([][]int, n)      // notes of type i chosen at that step
	for i := range take {
		take[i] = make([]int, amount+1)
	}
	for a := 1; a <= amount; a++ {
		best[a] = none
	}
	for i := 0; i < n; i++ {
		for a := amount; a > 0; a-- { // downwards: lower cells still hold the previous row
			for k := 1; k <= counts[i] && k*notes[i] <= a; k++ {
				if prev := best[a-k*notes[i]]; prev != none && prev+k < best[a] {
					best[a], take[i][a] = prev+k, k
				}
			}
		}
	}
	if best[amount] == none {
		return nil, false
	}
	out := make([]int, n)
	for i, a := n-1, amount; i >= 0; i-- {
		out[i] = take[i][a]
		a -= out[i] * notes[i]
	}
	return out, true
}`,

"Retry with the same key, then reverse": `type PendingReversal struct{ Card, Key string }

// debitWithRetry tries up to three times with the same key, so the bank applies the debit at most once.
// a.client is a bank client whose Debit returns ErrTimeout when the outcome is unknown.
// a.pendingReversals is guarded by a.mu; a background goroutine drains it until the bank confirms.
func (a *ATM) debitWithRetry(card string, amount int64, key string) (DebitResult, bool) {
	for attempt := 1; attempt <= 3; attempt++ {
		r, err := a.client.Debit(card, amount, key)
		if err == nil {
			return r, true
		}
		if !errors.Is(err, ErrTimeout) {
			break
		}
		// Outcome unknown; the same key makes a retry safe (back off briefly in real code).
	}
	a.pendingReversals = append(a.pendingReversals, PendingReversal{card, key})
	return 0, false // tell the customer to try later; dispense nothing
}`,

"Bank: atomic, idempotent debit": `type debit struct {
	amount   int64
	result   DebitResult
	reversed bool
	day      string // the yyyy-mm-dd it counted against
}

type account struct {
	mu             sync.Mutex // guards every field below
	pinHash        string     // salted slow hash (bcrypt or Argon2), never the PIN
	dailyLimit     int64
	balance        int64
	withdrawnToday int64
	day            string
	wrongPins      int
	debits         map[string]debit // idempotency key -> outcome
}

type InMemoryBank struct {
	accounts map[string]*account     // by card number; filled at startup and read-only after, so safe to share
	matches  func(pin, hash string) bool // constant-time check against the slow hash
	today    func() string
}

func (b *InMemoryBank) VerifyPin(card, pin string) AuthResult {
	a := b.accounts[card]
	if a == nil {
		return AuthBlocked
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.wrongPins >= 3 {
		return AuthBlocked
	}
	if b.matches(pin, a.pinHash) {
		a.wrongPins = 0
		return AuthOK
	}
	a.wrongPins++
	if a.wrongPins >= 3 {
		return AuthBlocked
	}
	return AuthWrongPin
}

func (b *InMemoryBank) Balance(card string) int64 {
	a := b.accounts[card] // only called after VerifyPin succeeded
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.balance
}

func (b *InMemoryBank) Debit(card string, amount int64, key string) DebitResult {
	a := b.accounts[card]
	a.mu.Lock() // one account at a time; others run in parallel
	defer a.mu.Unlock()
	if seen, ok := a.debits[key]; ok {
		return seen.result // a retry: same answer, no second debit
	}
	b.rollDay(a)
	r := DebitOK
	switch {
	case amount > a.balance:
		r = DebitInsufficientFunds
	case a.withdrawnToday+amount > a.dailyLimit:
		r = DebitDailyLimitExceeded
	default:
		a.balance -= amount
		a.withdrawnToday += amount
	}
	a.debits[key] = debit{amount, r, false, a.day}
	return r
}

func (b *InMemoryBank) Reverse(card, key string) {
	a := b.accounts[card]
	a.mu.Lock()
	defer a.mu.Unlock()
	b.rollDay(a)
	d, ok := a.debits[key]
	if !ok { // the reversal overtook the debit: refuse it later
		a.debits[key] = debit{result: DebitCancelled, reversed: true, day: a.day}
		return
	}
	if d.reversed || d.result != DebitOK {
		return // already undone, or nothing taken
	}
	a.balance += d.amount
	if d.day == a.day {
		a.withdrawnToday -= d.amount
	}
	d.reversed = true
	a.debits[key] = d
}

func (b *InMemoryBank) rollDay(a *account) {
	if t := b.today(); t != a.day {
		a.day, a.withdrawnToday = t, 0
	}
}`,

"Redacted PIN block and an inactivity timeout": `// PinBlock is the encrypted PIN block from the PIN pad. The ATM forwards it and never sees the digits.
type PinBlock struct{ cipherText []byte }

func (PinBlock) String() string { return "PinBlock[redacted]" }

// Inside ATM: an inactivity timer. The session number stops an old timer from ending a newer session.
// a.session is guarded by a.mu and bumped on every InsertCard.
func (a *ATM) OnInactivity(forSession int64) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if forSession != a.session {
		return // that session already ended
	}
	switch a.state.(type) {
	case CardInserted, Authenticated:
		a.endSession()
	}
}`
} };
