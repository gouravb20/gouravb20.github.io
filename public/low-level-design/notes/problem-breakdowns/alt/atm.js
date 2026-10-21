// Go versions of the ATM code blocks, matched to the Java blocks by title. Imports are omitted.
window.ALT = window.ALT || {};
ALT["atm"] = { go: {
"Final class design": `type ATM struct {
	mu       sync.Mutex     // guards cash, journal and state
	bank     BankService    // injected: owns balances and PINs
	hardware CashHardware   // injected: dispenser and card slot
	cash     *CashDispenser
	journal  []Transaction
	state    ATMState
}

func (a *ATM) InsertCard(card Card) error
func (a *ATM) EnterPin(pin string) (PinResult, error)
func (a *ATM) Balance() (int64, error)                    // paise
func (a *ATM) Withdraw(amount int64) (Transaction, error) // paise
func (a *ATM) EjectCard() error
func (a *ATM) Refill(note int64, count int) error // operator
func (a *ATM) TakeOutOfService() error
func (a *ATM) Restore() error
func (a *ATM) Journal() []Transaction

type ATMState interface { // every action rejects unless the state overrides it
	InsertCard(a *ATM, card Card) error
	EnterPin(a *ATM, pin string) (PinResult, error)
	Balance(a *ATM) (int64, error)
	Withdraw(a *ATM, amount int64) (Transaction, error)
	EjectCard(a *ATM) error
}

// Idle{}, CardInserted{card, wrongPins}, Authenticated{card}, OutOfService{reason}: immutable values

type CashDispenser struct{ head *Cassette } // largest note first

func (d *CashDispenser) Plan(amount int64) (map[int64]int, bool) // reads counts only
func (d *CashDispenser) Take(plan map[int64]int) error           // all or nothing
func (d *CashDispenser) Load(note int64, count int) error
func (d *CashDispenser) Total() int64

type Cassette struct {
	note  int64
	count int
	next  *Cassette // the next smaller note
}

func (c *Cassette) Plan(amount int64, plan map[int64]int) bool // most notes first, back off on failure

type BankService interface {
	VerifyPin(cardNumber, pin string) AuthResult
	Balance(cardNumber string) int64
	Debit(cardNumber string, amount int64, idempotencyKey string) DebitResult
	Reverse(cardNumber, idempotencyKey string)
}

type CashHardware interface {
	Dispense(notes map[int64]int) error
	ReturnCard()
	RetainCard()
}

type Card struct{ Number string }

type Transaction struct {
	ID, ATMID, MaskedCard string
	Amount                int64
	Status                TxnStatus
	Reason                string
	At                    time.Time
}`,

"Values and the bank interface": `type Card struct{ Number string }

func NewCard(number string) (Card, error) {
	if len(number) < 4 {
		return Card{}, errors.New("bad card number")
	}
	return Card{number}, nil
}

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
	a.state = cardInserted(s.card, s.wrongPins+1) // a new value, not a mutated counter
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

func idle() ATMState                           { return Idle{rejectAll{"Idle"}} }
func cardInserted(c Card, wrong int) ATMState { return CardInserted{rejectAll{"CardInserted"}, c, wrong} }
func authenticated(c Card) ATMState           { return Authenticated{rejectAll{"Authenticated"}, c} }
func outOfService(r Reason) ATMState          { return OutOfService{rejectAll{"OutOfService"}, r} }`,

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
				plan[c.note] = use // only the successful path writes
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

type CardInserted struct { // 3rd wrong PIN or AuthBlocked: retain
	rejectAll
	card      Card
	wrongPins int
}

type Authenticated struct { // Balance, Withdraw, EjectCard
	rejectAll
	card Card
}

type Cassette struct { // chain link, largest note first
	note  int64
	count int
	next  *Cassette
}

// (c *Cassette) Plan(amount, plan) bool: most notes first, back off on failure
// (d *CashDispenser) Plan(amount) (map[int64]int, bool); Take(plan) error

// ATM: every exported method holds a.mu (state, cash, journal).
// runWithdrawal: validate, plan (reads only), bank.Debit(key), take notes, dispense;
// on a dispense error: bank.Reverse(key), return the card, outOfService(Fault).

type BankService interface { // owns balances and PINs
	VerifyPin(card, pin string) AuthResult
	Debit(card string, amount int64, key string) DebitResult // atomic per account, idempotent
	Reverse(card, key string)
}`,

"Deposits: one more action, one more bank call": `// ATMState gains Deposit; rejectAll answers it, so Idle, CardInserted and OutOfService need no edits.
func (r rejectAll) Deposit(*ATM) (Transaction, error) { return Transaction{}, r.err("deposit") }

// Authenticated is the only state that allows it.
func (s Authenticated) Deposit(a *ATM) (Transaction, error) { return a.runDeposit(s.card), nil }

// BankService gains an idempotent credit:
//	Credit(cardNumber string, amount int64, idempotencyKey string)
// CashHardware gains the note acceptor, which counts and checks the notes:
//	AcceptNotes() (map[int64]int, error)

// On ATM: depositBin map[int64]int, guarded by a.mu and emptied by an operator.
func (a *ATM) Deposit() (Transaction, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.state.Deposit(a)
}

func (a *ATM) runDeposit(card Card) Transaction {
	id := uuid.NewString()
	notes, err := a.hardware.AcceptNotes()
	if err != nil {
		return a.record(id, card, 0, Declined, "note acceptor fault")
	}
	var amount int64
	for note, n := range notes {
		amount += note * int64(n)
	}
	if amount == 0 {
		return a.record(id, card, 0, Declined, "no valid notes")
	}
	for note, n := range notes {
		a.depositBin[note] += n // not the cassettes: unverified notes
	}
	a.bank.Credit(card.Number, amount, id) // the amount comes from the counted notes, never the keypad
	return a.record(id, card, amount, Completed, "deposited")
}`,

"NotePlanner: fewest notes by dynamic programming": `// NotePlanner turns an amount into notes. The cassettes own the counts; a planner only reads them.
type NotePlanner interface {
	Plan(amount int64, available map[int64]int) (map[int64]int, bool) // note -> count
}

// CashDispenser.Plan delegates; counts() copies note -> count from the chain. Take, Load and Total don't change.
func (d *CashDispenser) Plan(amount int64) (map[int64]int, bool) { return d.planner.Plan(amount, d.counts()) }

// FewestNotes finds the fewest notes for any set of denominations, by bounded change-making.
type FewestNotes struct{}

func (FewestNotes) Plan(amount int64, available map[int64]int) (map[int64]int, bool) {
	const unit = 100 * Rs // every note and amount is a multiple of Rs 100
	if amount%unit != 0 {
		return nil, false
	}
	target := int(amount / unit)
	notes := slices.Sorted(maps.Keys(available))
	const none = math.MaxInt
	best := make([]int, target+1) // fewest notes for each sub-amount so far
	for a := 1; a <= target; a++ {
		best[a] = none
	}
	take := make([][]int, len(notes)) // notes of type i used for that sub-amount
	for i, note := range notes {
		take[i] = make([]int, target+1)
		value, count := int(note/unit), available[note]
		for a := target; a > 0; a-- { // downwards: lower cells still hold the previous row
			for k := 1; k <= count && k*value <= a; k++ {
				if prev := best[a-k*value]; prev != none && prev+k < best[a] {
					best[a], take[i][a] = prev+k, k
				}
			}
		}
	}
	if best[target] == none {
		return nil, false
	}
	plan := map[int64]int{}
	for i, a := len(notes)-1, target; i >= 0; i-- {
		if k := take[i][a]; k > 0 {
			plan[notes[i]] = k
			a -= k * int(notes[i]/unit)
		}
	}
	return plan, true
}

// Without hides some notes ("no Rs 2000, please"), then asks another planner (a decorator).
type Without struct {
	Excluded map[int64]bool
	Inner    NotePlanner
}

func (w Without) Plan(amount int64, available map[int64]int) (map[int64]int, bool) {
	view := map[int64]int{}
	for note, n := range available {
		if !w.Excluded[note] {
			view[note] = n
		}
	}
	return w.Inner.Plan(amount, view)
}`,

"Retry with the same key, then queue a reversal": `var ErrBankTimeout = errors.New("bank timeout") // the bank's outcome is unknown

// BankClient is the bank seen over the network: any call can time out.
type BankClient interface {
	Debit(card string, amount int64, key string) (DebitResult, error)
	Reverse(card, key string) error
}

type PendingReversal struct{ Card, Key string }

// reversalQueue has its own mutex: it is added to while a.mu is held, and drained by a
// background goroutine that does not hold a.mu.
type reversalQueue struct {
	mu    sync.Mutex
	items []PendingReversal
}

func (q *reversalQueue) add(r PendingReversal) {
	q.mu.Lock()
	defer q.mu.Unlock()
	q.items = append(q.items, r)
}

func (q *reversalQueue) peek() (PendingReversal, bool) {
	q.mu.Lock()
	defer q.mu.Unlock()
	if len(q.items) == 0 {
		return PendingReversal{}, false
	}
	return q.items[0], true
}

func (q *reversalQueue) pop() {
	q.mu.Lock()
	defer q.mu.Unlock()
	q.items = q.items[1:]
}

// debitWithRetry tries up to three times with one key: the bank applies the debit at most once.
func (a *ATM) debitWithRetry(card string, amount int64, key string) (DebitResult, bool) {
	for attempt := 1; attempt <= 3; attempt++ {
		r, err := a.client.Debit(card, amount, key)
		if err == nil {
			return r, true
		}
		if !errors.Is(err, ErrBankTimeout) {
			break
		}
		// Unknown outcome. The same key makes the retry safe; real code backs off between tries.
	}
	a.reversals.add(PendingReversal{card, key}) // undo whatever may have happened
	return 0, false
}

// In runWithdrawal the debit becomes:
//	r, ok := a.debitWithRetry(card.Number, amount, id)
//	if !ok { return a.record(id, card, amount, Declined, "bank unavailable, reversal queued") }

// drainReversals runs every few seconds on one goroutine: each reversal is sent until the bank answers.
func (a *ATM) drainReversals() {
	for {
		r, ok := a.reversals.peek()
		if !ok || a.client.Reverse(r.Card, r.Key) != nil {
			return // nothing left, or try again on the next run
		}
		a.reversals.pop() // only this goroutine removes, so peek then pop is safe
	}
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
	accounts sync.Map                    // card number -> *account; safe for concurrent lookups and inserts
	matches  func(pin, hash string) bool // constant-time check against the slow hash
	today    func() string               // injected clock, as yyyy-mm-dd
}

func (b *InMemoryBank) Open(card, pinHash string, balance, dailyLimit int64) {
	b.accounts.Store(card, &account{pinHash: pinHash, balance: balance, dailyLimit: dailyLimit, debits: map[string]debit{}})
}

func (b *InMemoryBank) lookup(card string) (*account, bool) {
	v, ok := b.accounts.Load(card)
	if !ok {
		return nil, false
	}
	return v.(*account), true
}

func (b *InMemoryBank) mustLookup(card string) *account {
	a, ok := b.lookup(card)
	if !ok {
		panic("unknown card") // only reachable after VerifyPin succeeded, so a programming error
	}
	return a
}

func (b *InMemoryBank) VerifyPin(card, pin string) AuthResult {
	a, ok := b.lookup(card)
	if !ok {
		return AuthBlocked // unknown card: the ATM retains it
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
	a := b.mustLookup(card)
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.balance
}

func (b *InMemoryBank) Debit(card string, amount int64, key string) DebitResult {
	a := b.mustLookup(card)
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
	a := b.mustLookup(card)
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

"Dispensing as a real state": `// Dispensing: the bank call is in flight. It embeds rejectAll, so every customer action is refused.
type Dispensing struct {
	rejectAll
	card   Card
	amount int64
	plan   map[int64]int // never changed after construction
	txnID  string
}

// reserve runs under a.mu: validate, plan, take the notes and enter Dispensing.
// A nil *Dispensing means the withdrawal already ended with the returned result.
func (a *ATM) reserve(amount int64) (*Dispensing, Transaction, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	auth, ok := a.state.(Authenticated)
	if !ok {
		t, err := a.state.Withdraw(a, amount) // the state rejects it
		return nil, t, err
	}
	id := uuid.NewString()
	if amount <= 0 || amount%Step != 0 || amount > PerTxnLimit {
		return nil, a.record(id, auth.card, amount, Declined, "invalid amount"), nil
	}
	plan, found := a.cash.Plan(amount)
	if !found {
		return nil, a.record(id, auth.card, amount, Declined, "notes for this amount are not available"), nil
	}
	_ = a.cash.Take(plan) // reserved: a refill or another plan can't spend them
	d := &Dispensing{rejectAll{"Dispensing"}, auth.card, amount, plan, id}
	a.state = *d
	return d, Transaction{}, nil
}

// Withdraw no longer holds a.mu across the bank call.
func (a *ATM) Withdraw(amount int64) (Transaction, error) {
	d, t, err := a.reserve(amount)
	if d == nil {
		return t, err
	}
	debit, callErr := a.client.Debit(d.card.Number, d.amount, d.txnID) // no lock: refills and status reads go ahead

	a.mu.Lock()
	defer a.mu.Unlock()
	if callErr != nil || debit != DebitOK {
		for note, n := range d.plan {
			_ = a.cash.Load(note, n) // un-reserve
		}
		a.state = authenticated(d.card)
		reason := debit.String()
		if callErr != nil { // unknown outcome: make sure it ends up undone
			a.reversals.add(PendingReversal{d.card.Number, d.txnID})
			reason = "bank unavailable, reversal queued"
		}
		return a.record(d.txnID, d.card, d.amount, Declined, reason), nil
	}
	if err := a.hardware.Dispense(d.plan); err != nil {
		if a.client.Reverse(d.card.Number, d.txnID) != nil {
			a.reversals.add(PendingReversal{d.card.Number, d.txnID})
		}
		a.hardware.ReturnCard()
		a.state = outOfService(Fault)
		return a.record(d.txnID, d.card, d.amount, Reversed, "dispenser fault, debit reversed"), nil
	}
	a.state = authenticated(d.card)
	return a.record(d.txnID, d.card, d.amount, Completed, "dispensed"), nil
}`,

"Inactivity timeout and retracted cash": `const Inactivity = 30 * time.Second

// On ATM, guarded by a.mu: lastActivity time.Time, set by every customer action;
// clock func() time.Time, injected so tests control time.

// CheckInactivity runs every few seconds on a ticker goroutine, under the same mutex as every action.
func (a *ATM) CheckInactivity() {
	a.mu.Lock()
	defer a.mu.Unlock()
	switch a.state.(type) {
	case CardInserted, Authenticated:
		if a.clock().Sub(a.lastActivity) > Inactivity {
			a.endSession() // returns the card; the slot retains it if nobody takes it
		}
	}
}

// CashHardware.Dispense now reports whether the notes were taken before the shutter closed:
//	Dispense(notes map[int64]int) (Pickup, error)
type Pickup int

const (
	Taken Pickup = iota
	Retracted
)

// afterDispense is called by runWithdrawal when Dispense returned no error.
func (a *ATM) afterDispense(p Pickup, card Card, amount int64, id string) Transaction {
	if p == Retracted { // the notes went back into the reject bin
		a.bank.Reverse(card.Number, id)
		return a.record(id, card, amount, Reversed, "cash not taken, retracted")
	}
	return a.record(id, card, amount, Completed, "dispensed")
}`
} };
