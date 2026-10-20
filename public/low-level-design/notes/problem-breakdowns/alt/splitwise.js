// Go versions of the Splitwise code blocks, matched to the Java blocks by title. Imports are omitted.
window.ALT = window.ALT || {};
ALT["splitwise"] = { go: {
"Public API": `func (s *ExpenseService) AddExpense(payer string, amount int64, strategy SplitStrategy, users []string, values []int64) error
func (s *ExpenseService) Balances(user string) []string`,

"Split strategies": `type Share struct {
	User   string
	Amount int64
}

type SplitStrategy interface {
	Split(amount int64, users []string, values []int64) ([]Share, error)
}

type EqualSplit struct{}

func (EqualSplit) Split(amount int64, users []string, _ []int64) ([]Share, error) {
	if len(users) == 0 {
		return nil, errors.New("no users to split between")
	}
	n := int64(len(users))
	share, remainder := amount/n, amount%n
	out := make([]Share, len(users))
	for i, u := range users {
		out[i] = Share{u, share}
		if int64(i) < remainder {
			out[i].Amount++ // spread leftover units
		}
	}
	return out, nil
}

type ExactSplit struct{}

func (ExactSplit) Split(amount int64, users []string, values []int64) ([]Share, error) {
	if len(values) != len(users) {
		return nil, errors.New("one amount per user")
	}
	var sum int64
	for _, v := range values {
		sum += v
	}
	if sum != amount {
		return nil, errors.New("amounts must add up to the total")
	}
	out := make([]Share, len(users))
	for i, u := range users {
		out[i] = Share{u, values[i]}
	}
	return out, nil
}

type PercentSplit struct{}

func (PercentSplit) Split(amount int64, users []string, values []int64) ([]Share, error) {
	if len(values) != len(users) {
		return nil, errors.New("one percentage per user")
	}
	var total, assigned int64
	for _, v := range values {
		total += v
	}
	if total != 100 {
		return nil, errors.New("percentages must add up to 100")
	}
	out := make([]Share, len(users))
	for i, u := range users {
		out[i] = Share{u, amount * values[i] / 100}
		assigned += out[i].Amount
	}
	out[0].Amount += amount - assigned // rounding remainder
	return out, nil
}`,

"ExpenseService": `type ExpenseService struct {
	mu   sync.Mutex
	owes map[string]map[string]int64 // owes[a][b] = amount a owes b (always positive)
}

func NewExpenseService() *ExpenseService {
	return &ExpenseService{owes: map[string]map[string]int64{}}
}

func (s *ExpenseService) AddExpense(payer string, amount int64, strategy SplitStrategy, users []string, values []int64) error {
	shares, err := strategy.Split(amount, users, values)
	if err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, sh := range shares {
		if sh.User != payer && sh.Amount != 0 {
			s.adjust(sh.User, payer, sh.Amount)
		}
	}
	return nil
}

func (s *ExpenseService) adjust(debtor, creditor string, amt int64) {
	reverse := s.get(creditor, debtor) // does the creditor already owe the debtor?
	if reverse >= amt {
		s.set(creditor, debtor, reverse-amt)
		return
	}
	s.set(creditor, debtor, 0)
	s.set(debtor, creditor, s.get(debtor, creditor)+amt-reverse)
}

func (s *ExpenseService) get(a, b string) int64 { return s.owes[a][b] } // a missing inner map reads as 0

func (s *ExpenseService) set(a, b string, v int64) {
	if v == 0 {
		delete(s.owes[a], b) // deleting from a nil map is a no-op
		return
	}
	if s.owes[a] == nil {
		s.owes[a] = map[string]int64{}
	}
	s.owes[a][b] = v
}

func (s *ExpenseService) Balances(user string) []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	var out []string
	for c, v := range s.owes[user] {
		out = append(out, fmt.Sprintf("%s owes %s: %d", user, c, v))
	}
	for d, m := range s.owes {
		if v, ok := m[user]; ok {
			out = append(out, fmt.Sprintf("%s owes %s: %d", d, user, v))
		}
	}
	slices.Sort(out) // map iteration order is random
	return out
}`,

"Greedy settlement": `type balance struct {
	user   string
	amount int64
}

// maxHeap implements container/heap.Interface, largest amount first.
type maxHeap []balance

func (h maxHeap) Len() int           { return len(h) }
func (h maxHeap) Less(i, j int) bool { return h[i].amount > h[j].amount }
func (h maxHeap) Swap(i, j int)      { h[i], h[j] = h[j], h[i] }
func (h *maxHeap) Push(x any)        { *h = append(*h, x.(balance)) }
func (h *maxHeap) Pop() any {
	old := *h
	x := old[len(old)-1]
	*h = old[:len(old)-1]
	return x
}

func Settle(net map[string]int64) []string {
	creditors, debtors := &maxHeap{}, &maxHeap{}
	for u, v := range net {
		if v > 0 {
			heap.Push(creditors, balance{u, v})
		} else if v < 0 {
			heap.Push(debtors, balance{u, -v})
		}
	}
	var transfers []string
	for creditors.Len() > 0 && debtors.Len() > 0 {
		c := heap.Pop(creditors).(balance)
		d := heap.Pop(debtors).(balance)
		x := min(c.amount, d.amount)
		transfers = append(transfers, fmt.Sprintf("%s pays %s %d", d.user, c.user, x))
		if c.amount > x {
			heap.Push(creditors, balance{c.user, c.amount - x})
		}
		if d.amount > x {
			heap.Push(debtors, balance{d.user, d.amount - x})
		}
	}
	return transfers
}`,

"One ledger per group": `type GroupLedgers struct {
	mu     sync.Mutex
	groups map[string]*ExpenseService
}

func (g *GroupLedgers) Group(id string) *ExpenseService {
	g.mu.Lock()
	defer g.mu.Unlock()
	s, ok := g.groups[id]
	if !ok {
		s = NewExpenseService()
		g.groups[id] = s
	}
	return s
}

// Each ExpenseService has its own mutex, so expenses in different groups never contend.`,

"Expenses as records": `type Expense struct {
	ID     string
	Payer  string
	Amount int64
	Shares map[string]int64
	At     time.Time
}

func NewExpense(id, payer string, amount int64, shares map[string]int64, at time.Time) (Expense, error) {
	var sum int64
	for _, v := range shares {
		sum += v
	}
	if sum != amount {
		return Expense{}, errors.New("shares must add up to the amount")
	}
	return Expense{ID: id, Payer: payer, Amount: amount, Shares: maps.Clone(shares), At: at}, nil
}`,

"Debt simplification sketch": `// net[u] > 0: u is owed money; < 0: u owes money
creditors, debtors := &maxHeap{}, &maxHeap{} // container/heap, largest amount first
// fill: creditors with (u, net), debtors with (u, -net)
for creditors.Len() > 0 && debtors.Len() > 0 {
	c, d := heap.Pop(creditors).(balance), heap.Pop(debtors).(balance)
	x := min(c.amount, d.amount)
	transfers = append(transfers, fmt.Sprintf("%s pays %s %d", d.user, c.user, x))
	if c.amount > x {
		heap.Push(creditors, balance{c.user, c.amount - x})
	}
	if d.amount > x {
		heap.Push(debtors, balance{d.user, d.amount - x})
	}
}`
} };
