// Go versions of the Vending Machine code blocks, matched to the Java blocks by title. Imports are omitted.
window.ALT = window.ALT || {};
ALT["vending-machine"] = { go: {
"Public API": `func (m *VendingMachine) InsertMoney(amount int) error
func (m *VendingMachine) SelectProduct(code string) (change int, err error)
func (m *VendingMachine) Cancel() (refund int)`,

"Product and states": `type Product struct {
	Code     string
	Price    int
	Quantity int
}

type VendingState interface {
	InsertMoney(m *VendingMachine, amount int) error
	SelectProduct(m *VendingMachine, code string) (int, error)
	Cancel(m *VendingMachine) int
}

type IdleState struct{}

func (IdleState) InsertMoney(m *VendingMachine, amount int) error {
	m.balance += amount
	m.state = HasMoneyState{}
	return nil
}

func (IdleState) SelectProduct(*VendingMachine, string) (int, error) {
	return 0, errors.New("insert money first")
}

func (IdleState) Cancel(*VendingMachine) int { return 0 }

type HasMoneyState struct{}

func (HasMoneyState) InsertMoney(m *VendingMachine, amount int) error {
	m.balance += amount
	return nil
}

func (HasMoneyState) SelectProduct(m *VendingMachine, code string) (int, error) {
	p, ok := m.inventory[code]
	if !ok || p.Quantity == 0 {
		return 0, errors.New("out of stock")
	}
	if m.balance < p.Price {
		return 0, errors.New("insufficient funds")
	}
	p.Quantity--
	change := m.balance - p.Price
	m.balance = 0
	m.state = IdleState{}
	return change, nil // dispensed
}

func (HasMoneyState) Cancel(m *VendingMachine) int {
	refund := m.balance
	m.balance = 0
	m.state = IdleState{}
	return refund
}`,

"VendingMachine": `type VendingMachine struct {
	mu        sync.Mutex
	inventory map[string]*Product
	balance   int
	state     VendingState
}

func NewVendingMachine() *VendingMachine {
	return &VendingMachine{inventory: map[string]*Product{}, state: IdleState{}}
}

func (m *VendingMachine) AddProduct(p *Product) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.inventory[p.Code] = p
}

func (m *VendingMachine) InsertMoney(amount int) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.state.InsertMoney(m, amount)
}

func (m *VendingMachine) SelectProduct(code string) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.state.SelectProduct(m, code)
}

func (m *VendingMachine) Cancel() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.state.Cancel(m)
}`,

"Two new states": `type DispensingState struct{}

var errBusy = errors.New("dispensing, please wait")

func (DispensingState) InsertMoney(*VendingMachine, int) error             { return errBusy }
func (DispensingState) SelectProduct(*VendingMachine, string) (int, error) { return 0, errBusy }
func (DispensingState) Cancel(*VendingMachine) int                         { return 0 } // can't cancel mid-dispense

// HasMoneyState.SelectProduct: after the checks, m.state = DispensingState{} and start the motor;
// the machine sets m.state = IdleState{} when the hardware reports the item has dropped.

type OutOfServiceState struct{}

var errOutOfService = errors.New("out of service")

func (OutOfServiceState) InsertMoney(*VendingMachine, int) error             { return errOutOfService }
func (OutOfServiceState) SelectProduct(*VendingMachine, string) (int, error) { return 0, errOutOfService }
func (OutOfServiceState) Cancel(*VendingMachine) int                         { return 0 }

// Entered when every product is sold out or an admin disables the machine; an admin reset returns to IdleState.`,

"Greedy change, refused if impossible": `type CoinBox struct {
	coins map[int]int // denomination -> count
}

func (b *CoinBox) Add(denomination, count int) { b.coins[denomination] += count }

// Plan returns coins for the amount, or false if exact change isn't possible. It doesn't modify the box.
func (b *CoinBox) Plan(amount int) (map[int]int, bool) {
	denoms := slices.Collect(maps.Keys(b.coins))
	slices.SortFunc(denoms, func(a, b int) int { return b - a }) // largest first
	plan := map[int]int{}
	left := amount
	for _, d := range denoms {
		if use := min(b.coins[d], left/d); use > 0 {
			plan[d] = use
			left -= use * d
		}
	}
	return plan, left == 0
}

func (b *CoinBox) Take(plan map[int]int) {
	for d, n := range plan {
		b.coins[d] -= n
	}
}

// In HasMoneyState.SelectProduct, before dispensing:
//   change, ok := m.coins.Plan(m.balance - p.Price)
//   if !ok { return 0, errors.New("exact change only") }
//   ... dispense, then m.coins.Take(change)`,

"State pattern skeleton": `type VendingState interface {
	InsertMoney(m *VendingMachine, amount int) error
	SelectProduct(m *VendingMachine, code string) (int, error)
	Cancel(m *VendingMachine) int
}

type VendingMachine struct {
	mu    sync.Mutex
	state VendingState // IdleState{} to start; states assign m.state to move on
}

func (m *VendingMachine) InsertMoney(amount int) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.state.InsertMoney(m, amount) // delegate
}`
} };
