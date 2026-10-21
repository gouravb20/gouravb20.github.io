// Go versions of the Vending Machine code blocks, matched to the Java blocks by title. Imports are omitted.
window.ALT = window.ALT || {};
ALT["vending-machine"] = { go: {
"Coin, Item, Inventory and MachineHardware": `// Coin is a value in cents. The coin acceptor rejects anything else before it reaches this code.
type Coin int64

const (
	Nickel  Coin = 5
	Dime    Coin = 10
	Quarter Coin = 25
	Dollar  Coin = 100
)

// AllCoins lists the denominations smallest first.
var AllCoins = []Coin{Nickel, Dime, Quarter, Dollar}

type Item struct {
	Code       string
	Name       string
	PriceCents int64
}

// Inventory holds items and stock by code. Not safe on its own: only used under the machine's mutex.
type Inventory struct {
	items map[string]Item
	stock map[string]int
}

func NewInventory() *Inventory {
	return &Inventory{items: map[string]Item{}, stock: map[string]int{}}
}

func (inv *Inventory) Add(item Item, quantity int) error {
	if quantity < 0 || item.PriceCents <= 0 {
		return errors.New("bad price or quantity")
	}
	inv.items[item.Code] = item
	inv.stock[item.Code] += quantity
	return nil
}

func (inv *Inventory) Find(code string) (Item, bool) {
	item, ok := inv.items[code]
	return item, ok
}

func (inv *Inventory) InStock(code string) bool { return inv.stock[code] > 0 }
func (inv *Inventory) TakeOne(code string)      { inv.stock[code]-- }

// MachineHardware is what the machine drives: the real hardware, or a fake that records calls in tests.
type MachineHardware interface {
	Release(code string)      // starts the motor and returns at once; ItemDispensed comes later on another goroutine
	ReturnCoins(coins []Coin) // drops coins into the tray; an empty slice does nothing
	Display(message string)
}`,

"Final class design": `type VendingMachine struct {
	mu        sync.Mutex      // guards every field below
	inventory *Inventory      // items and stock
	coinBox   *CoinBox        // coins for change
	hw        MachineHardware // motor, coin tray, display
	state     MachineState    // IdleState, *ItemSelectedState or DispensingState
}

func (m *VendingMachine) AddItem(item Item, quantity int) error // operator setup
func (m *VendingMachine) LoadCoins(c Coin, count int) error
func (m *VendingMachine) SelectItem(code string) // customer inputs
func (m *VendingMachine) InsertCoin(c Coin)
func (m *VendingMachine) Cancel()
func (m *VendingMachine) ItemDispensed() // hardware callback: the item has dropped

// MachineState: each input returns the next state.
type MachineState interface {
	SelectItem(m *VendingMachine, code string) MachineState
	InsertCoin(m *VendingMachine, c Coin) MachineState
	Cancel(m *VendingMachine) MachineState
	ItemDispensed(m *VendingMachine) MachineState
}

type IdleState struct{}

type ItemSelectedState struct {
	item     Item   // what is being bought
	inserted []Coin // escrow: the coins inserted for it
}

type DispensingState struct{}

func (inv *Inventory) Find(code string) (Item, bool)
func (inv *Inventory) InStock(code string) bool
func (inv *Inventory) TakeOne(code string)

func (b *CoinBox) AddAll(coins []Coin)
func (b *CoinBox) RemoveAll(coins []Coin)
func (b *CoinBox) PlanChange(amountCents int64) ([]Coin, bool) // fewest coins the box can pay, or false

type Item struct {
	Code, Name string
	PriceCents int64
}

type Coin int64 // Nickel 5, Dime 10, Quarter 25, Dollar 100 cents

type MachineHardware interface {
	Release(code string)
	ReturnCoins(coins []Coin)
	Display(message string)
}`,

"VendingMachine": `type VendingMachine struct {
	mu        sync.Mutex // guards every field below
	inventory *Inventory
	coinBox   *CoinBox
	hw        MachineHardware
	state     MachineState
}

func NewVendingMachine(hw MachineHardware) *VendingMachine {
	return &VendingMachine{inventory: NewInventory(), coinBox: NewCoinBox(), hw: hw, state: IdleState{}}
}

// Operator setup.
func (m *VendingMachine) AddItem(item Item, quantity int) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.inventory.Add(item, quantity)
}

func (m *VendingMachine) LoadCoins(c Coin, count int) error {
	if count <= 0 {
		return errors.New("count must be positive")
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.coinBox.Add(c, count)
	return nil
}

// Customer inputs and the hardware callback: hand the input to the current state and keep the state it returns.
func (m *VendingMachine) SelectItem(code string) {
	m.apply(func(s MachineState) MachineState { return s.SelectItem(m, code) })
}

func (m *VendingMachine) InsertCoin(c Coin) {
	m.apply(func(s MachineState) MachineState { return s.InsertCoin(m, c) })
}

func (m *VendingMachine) Cancel() {
	m.apply(func(s MachineState) MachineState { return s.Cancel(m) })
}

func (m *VendingMachine) ItemDispensed() {
	m.apply(func(s MachineState) MachineState { return s.ItemDispensed(m) })
}

func (m *VendingMachine) StateName() string {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.state.Name()
}

// apply runs one input under the mutex. States, Inventory and CoinBox are only ever used from inside it.
func (m *VendingMachine) apply(input func(MachineState) MachineState) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.state = input(m.state)
}`,

"Machine states: Idle, ItemSelected, Dispensing": `// MachineState: one type per state. Each method handles one input and returns the next state; called only under the machine's mutex.
type MachineState interface {
	Name() string
	SelectItem(m *VendingMachine, code string) MachineState
	InsertCoin(m *VendingMachine, c Coin) MachineState
	Cancel(m *VendingMachine) MachineState
	ItemDispensed(m *VendingMachine) MachineState
}

type IdleState struct{}

func (IdleState) Name() string { return "Idle" }

func (s IdleState) SelectItem(m *VendingMachine, code string) MachineState {
	item, ok := m.inventory.Find(code)
	if !ok {
		m.hw.Display("Unknown item " + code)
		return s
	}
	if !m.inventory.InStock(code) {
		m.hw.Display(code + " is sold out")
		return s
	}
	m.hw.Display(fmt.Sprintf("%s: %d cents", item.Name, item.PriceCents))
	return &ItemSelectedState{item: item}
}

func (s IdleState) InsertCoin(m *VendingMachine, c Coin) MachineState {
	m.hw.ReturnCoins([]Coin{c})
	m.hw.Display("Select an item first")
	return s
}

func (s IdleState) Cancel(*VendingMachine) MachineState        { return s } // nothing to refund
func (s IdleState) ItemDispensed(*VendingMachine) MachineState { return s } // stray signal: ignore

type ItemSelectedState struct {
	item     Item
	inserted []Coin // escrow; only touched under the machine's mutex
}

func (s *ItemSelectedState) Name() string { return "ItemSelected(" + s.item.Code + ")" }

func (s *ItemSelectedState) SelectItem(m *VendingMachine, _ string) MachineState {
	m.hw.Display("Cancel to choose another item")
	return s
}

func (s *ItemSelectedState) InsertCoin(m *VendingMachine, c Coin) MachineState {
	s.inserted = append(s.inserted, c)
	var paid int64
	for _, x := range s.inserted {
		paid += int64(x)
	}
	if paid < s.item.PriceCents {
		m.hw.Display(fmt.Sprintf("Paid %d of %d", paid, s.item.PriceCents))
		return s
	}
	return s.completeSale(m, paid-s.item.PriceCents)
}

// completeSale plans everything before changing anything, so a refused sale leaves stock and coins as they were.
func (s *ItemSelectedState) completeSale(m *VendingMachine, changeDue int64) MachineState {
	m.coinBox.AddAll(s.inserted) // the coins just inserted can be paid out as change
	change, ok := m.coinBox.PlanChange(changeDue)
	if !ok {
		m.coinBox.RemoveAll(s.inserted) // undo the deposit
		m.hw.ReturnCoins(s.inserted)
		m.hw.Display("No change available, coins returned")
		return IdleState{}
	}
	m.coinBox.RemoveAll(change)
	m.inventory.TakeOne(s.item.Code)
	m.hw.ReturnCoins(change)
	m.hw.Release(s.item.Code)
	return DispensingState{}
}

func (s *ItemSelectedState) Cancel(m *VendingMachine) MachineState {
	m.hw.ReturnCoins(s.inserted)
	m.hw.Display("Cancelled")
	return IdleState{}
}

func (s *ItemSelectedState) ItemDispensed(*VendingMachine) MachineState { return s }

type DispensingState struct{}

func (DispensingState) Name() string { return "Dispensing" }

func (s DispensingState) SelectItem(m *VendingMachine, _ string) MachineState {
	m.hw.Display("Please wait")
	return s
}

func (s DispensingState) InsertCoin(m *VendingMachine, c Coin) MachineState {
	m.hw.ReturnCoins([]Coin{c})
	m.hw.Display("Please wait")
	return s
}

func (s DispensingState) Cancel(m *VendingMachine) MachineState {
	m.hw.Display("Already dispensing")
	return s
}

func (DispensingState) ItemDispensed(m *VendingMachine) MachineState {
	m.hw.Display("Thank you")
	return IdleState{}
}`,

"Change: greedy, largest coin first": `// GreedyChange takes as many of the largest coin as fit and are in the box, then the next.
// It can refuse when an answer exists.
func (b *CoinBox) GreedyChange(amount int64) ([]Coin, bool) {
	plan := []Coin{}
	left := amount
	for i := len(AllCoins) - 1; i >= 0; i-- {
		c := AllCoins[i]
		use := min(int64(b.counts[c]), left/int64(c))
		for j := int64(0); j < use; j++ {
			plan = append(plan, c)
		}
		left -= use * int64(c)
	}
	return plan, left == 0
}`,

"CoinBox: the fewest coins it can actually pay": `// CoinBox holds the coins available for change. Not safe on its own: only used under the machine's mutex.
type CoinBox struct {
	counts map[Coin]int
}

func NewCoinBox() *CoinBox { return &CoinBox{counts: map[Coin]int{}} }

func (b *CoinBox) Add(c Coin, n int) { b.counts[c] += n }

func (b *CoinBox) AddAll(coins []Coin) {
	for _, c := range coins {
		b.counts[c]++
	}
}

func (b *CoinBox) RemoveAll(coins []Coin) {
	for _, c := range coins {
		b.counts[c]--
	}
}

// PlanChange returns the fewest coins in the box that add up to amount, or false if no combination does.
// It doesn't change the box.
func (b *CoinBox) PlanChange(amount int64) ([]Coin, bool) {
	target := int(amount)
	const none = math.MaxInt / 2
	best := make([]int, target+1) // fewest coins for each sum, using the coin types seen so far
	for sum := 1; sum <= target; sum++ {
		best[sum] = none
	}
	used := make([][]int, len(AllCoins)) // how many of AllCoins[i] that best answer uses

	for i, c := range AllCoins {
		value, have := int(c), b.counts[c]
		used[i] = make([]int, target+1)
		next := make([]int, target+1)
		for sum := 0; sum <= target; sum++ {
			next[sum] = best[sum] // use none of this coin
			for k := 1; k <= have && k*value <= sum; k++ {
				if candidate := best[sum-k*value] + k; candidate < next[sum] {
					next[sum] = candidate
					used[i][sum] = k
				}
			}
		}
		best = next
	}
	if best[target] >= none {
		return nil, false
	}

	plan := []Coin{} // walk back from the largest coin type
	sum := target
	for i := len(AllCoins) - 1; i >= 0; i-- {
		k := used[i][sum]
		for j := 0; j < k; j++ {
			plan = append(plan, AllCoins[i])
		}
		sum -= k * int(AllCoins[i])
	}
	return plan, true
}`,

"Vending machine in one screen": `type Coin int64 // Nickel 5, Dime 10, Quarter 25, Dollar 100 (cents)

type Item struct {
	Code, Name string
	PriceCents int64
}

// VendingMachine: one mutex guards inventory, coin box and state.
func (m *VendingMachine) apply(input func(MachineState) MachineState) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.state = input(m.state)
}

func (m *VendingMachine) InsertCoin(c Coin) {
	m.apply(func(s MachineState) MachineState { return s.InsertCoin(m, c) })
}

// SelectItem, Cancel and ItemDispensed (the hardware callback) look the same.
// MachineState: SelectItem, InsertCoin, Cancel, ItemDispensed; each returns the next state.
// Idle:          known and in stock -> ItemSelected; a coin is returned
// ItemSelected:  coin into escrow; once paid: add escrow to box, PlanChange, take stock,
//                return change, release -> Dispensing; no plan -> undo, return escrow -> Idle
//                Cancel -> return escrow -> Idle
// Dispensing:    refuse buttons, return coins; ItemDispensed -> Idle

// CoinBox.PlanChange(due): bounded DP, fewest coins the box can pay, false if none`,

"Card payment: one new input, accepted by one state": `// PaymentGateway charges a token from the card reader. The machine never sees or stores the card number.
type PaymentGateway interface {
	Charge(cardToken string, amountCents int64, idempotencyKey string) bool
}

// CardPayer is the optional extra input. States that don't implement it refuse cards.
type CardPayer interface {
	PayByCard(m *VendingMachine, cardToken string) MachineState
}

func (m *VendingMachine) PayByCard(cardToken string) {
	m.apply(func(s MachineState) MachineState {
		if p, ok := s.(CardPayer); ok {
			return p.PayByCard(m, cardToken)
		}
		m.hw.Display("Card not accepted right now")
		return s
	})
}

// Only ItemSelectedState implements it.
func (s *ItemSelectedState) PayByCard(m *VendingMachine, cardToken string) MachineState {
	if len(s.inserted) > 0 {
		m.hw.Display("Cancel your coins to pay by card")
		return s
	}
	key := rand.Text() // crypto/rand; one per attempt, so a retried request can't charge twice
	if !m.payments.Charge(cardToken, s.item.PriceCents, key) {
		m.hw.Display("Card declined")
		return s // still ItemSelected: try coins or another card
	}
	m.inventory.TakeOne(s.item.Code)
	m.hw.Release(s.item.Code)
	return DispensingState{}
}`,

"A stuck item: DispensingState remembers the sale and refunds it": `// FailureHandler is the optional input for the hardware's second callback. States without it ignore the signal.
type FailureHandler interface {
	DispenseFailed(m *VendingMachine) MachineState
}

func (m *VendingMachine) DispenseFailed() {
	m.apply(func(s MachineState) MachineState {
		if h, ok := s.(FailureHandler); ok {
			return h.DispenseFailed(m)
		}
		return s // stray signal: ignore
	})
}

type DispensingState struct {
	item Item // what is dropping, so a failure can be refunded
}

// SelectItem, InsertCoin, Cancel and ItemDispensed unchanged.

func (s DispensingState) DispenseFailed(m *VendingMachine) MachineState {
	m.inventory.Disable(s.item.Code) // jammed: sold out until an engineer clears it
	if refund, ok := m.coinBox.PlanChange(s.item.PriceCents); ok {
		m.coinBox.RemoveAll(refund)
		m.hw.ReturnCoins(refund)
		m.hw.Display("Item stuck, money returned")
	} else {
		m.owedCents += s.item.PriceCents // kept for the operator to settle; never silently kept
		m.hw.Display("Item stuck, please call the number on the machine")
	}
	return IdleState{}
}

// completeSale now returns DispensingState{item: s.item}.
// Inventory.Disable(code) sets that code's stock to 0; owedCents is guarded by the machine's mutex.`,

"Service mode: a refusing base class and an OutOfServiceState": `// RejectingState refuses every customer input with a reason. Go has no inheritance, and an embedded
// type's methods would return the inner value, so one struct with a name and a reason serves every refusing state.
type RejectingState struct {
	name   string
	reason string
}

func (r RejectingState) Name() string { return r.name }

func (r RejectingState) SelectItem(m *VendingMachine, _ string) MachineState {
	m.hw.Display(r.reason)
	return r
}

func (r RejectingState) InsertCoin(m *VendingMachine, c Coin) MachineState {
	m.hw.ReturnCoins([]Coin{c})
	m.hw.Display(r.reason)
	return r
}

func (r RejectingState) Cancel(*VendingMachine) MachineState        { return r }
func (r RejectingState) ItemDispensed(*VendingMachine) MachineState { return r }

func OutOfService() RejectingState { return RejectingState{name: "OutOfService", reason: "Out of service"} }

func inService(s MachineState) bool { return s.Name() == "OutOfService" }

// The operator's key switch.
func (m *VendingMachine) EnterService() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, idle := m.state.(IdleState); !idle {
		return false // never interrupt a customer mid-purchase
	}
	m.state = OutOfService()
	return true
}

func (m *VendingMachine) Restock(code string, quantity int) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if !inService(m.state) {
		return errors.New("open the machine first")
	}
	return m.inventory.Restock(code, quantity) // adds to the stock of a known code
}

func (m *VendingMachine) LeaveService() {
	m.mu.Lock()
	defer m.mu.Unlock()
	if inService(m.state) {
		m.state = IdleState{}
	}
}`,

"Timeouts with a session number": `// In VendingMachine: session counts selections and is guarded by mu.
func (m *VendingMachine) startSession() int64 { // called by IdleState.SelectItem, under the mutex
	m.session++
	id := m.session
	time.AfterFunc(60*time.Second, func() { m.Timeout(id) }) // runs on its own goroutine, which waits for the mutex
	return id
}

// Timeout is an input like any other. Only an ItemSelectedState with the same session reacts to it.
func (m *VendingMachine) Timeout(id int64) {
	m.apply(func(s MachineState) MachineState {
		if t, ok := s.(*ItemSelectedState); ok && t.session == id {
			return t.Cancel(m) // refund whatever was inserted
		}
		return s // a timer from an earlier selection, or the sale already finished
	})
}

// ItemSelectedState gains a session field, and IdleState.SelectItem now returns
// &ItemSelectedState{item: item, session: m.startSession()}.`,

"Sales reporting through a queue": `type SaleEvent struct {
	Code       string
	PriceCents int64
	At         time.Time
}

// In VendingMachine: outbox is a buffered channel, safe to send on under the mutex and receive from another goroutine.
func (m *VendingMachine) recordSale(item Item) { // called by completeSale, under the mutex; never blocks
	select {
	case m.outbox <- SaleEvent{Code: item.Code, PriceCents: item.PriceCents, At: time.Now()}:
	default:
		m.droppedEvents.Add(1) // an atomic.Int64, readable without the mutex
	}
}

// RunReporter runs on its own goroutine: waits for one event, takes up to 99 more, uploads them together.
func RunReporter(ctx context.Context, outbox <-chan SaleEvent, office HeadOffice) {
	for {
		select {
		case <-ctx.Done():
			return
		case e := <-outbox:
			batch := append([]SaleEvent{e}, drain(outbox, 99)...)
			office.Upload(batch) // retries and local persistence omitted
		}
	}
}

func drain(ch <-chan SaleEvent, max int) []SaleEvent {
	var out []SaleEvent
	for len(out) < max {
		select {
		case e := <-ch:
			out = append(out, e)
		default:
			return out
		}
	}
	return out
}`
} };
