// Go versions of the Splitwise code blocks, matched to the Java blocks by title. Imports are omitted.
window.ALT = window.ALT || {};
ALT["splitwise"] = { go: {
"Records: User, Expense, Transfer": `type User struct {
	ID, Name string
}

// Expense is one expense, frozen once recorded. Shares maps every participant (payer included, if they took part) to paise.
type Expense struct {
	ID          int64
	GroupID     string
	PayerID     string
	Amount      int64
	Shares      map[string]int64 // a private copy; never modified after NewExpense
	Description string
}

func NewExpense(id int64, groupID, payerID string, amount int64, shares map[string]int64, description string) (Expense, error) {
	if amount <= 0 {
		return Expense{}, errors.New("amount must be positive")
	}
	var sum int64
	for _, v := range shares {
		sum += v
	}
	if sum != amount {
		return Expense{}, fmt.Errorf("shares add up to %d, not %d", sum, amount)
	}
	return Expense{id, groupID, payerID, amount, maps.Clone(shares), description}, nil
}

// Transfer is a payment from one user to another: a settle-up, or one step of a simplified plan.
type Transfer struct {
	From, To string
	Amount   int64
}`,

"Final class design": `type User struct{ ID, Name string }

type Expense struct {
	ID          int64
	GroupID     string
	PayerID     string
	Amount      int64
	Shares      map[string]int64
	Description string
}

type Transfer struct {
	From, To string
	Amount   int64
}

type SplitwiseService struct {
	mu     sync.RWMutex // guards the two maps only
	users  map[string]User
	groups map[string]*Group
}

func (s *SplitwiseService) AddUser(id, name string) (User, error)
func (s *SplitwiseService) CreateGroup(id string, memberIDs []string) (*Group, error)
func (s *SplitwiseService) AddExpense(groupID, payerID string, amount int64, split SplitStrategy, description string) (Expense, error)
func (s *SplitwiseService) SettleUp(groupID, fromID, toID string, amount int64) error
func (s *SplitwiseService) Balance(groupID, userID string) (int64, error) // > 0: is owed money; < 0: owes money
func (s *SplitwiseService) WhoOwesWhom(groupID string) ([]Transfer, error)
func (s *SplitwiseService) SimplifyDebts(groupID string) ([]Transfer, error)

type Group struct {
	ID      string
	members map[string]bool // read-only after creation
	mu      sync.Mutex      // guards sheet and history
	sheet   *BalanceSheet
	history []Expense // append-only
}

func (g *Group) Apply(e Expense)
func (g *Group) Settle(t Transfer) error
func (g *Group) Net(userID string) int64
func (g *Group) Debts() []Transfer
func (g *Group) SimplifyDebts() []Transfer

// BalanceSheet is not safe for concurrent use; only its Group calls it.
type BalanceSheet struct {
	pairs map[pair]int64 // sorted pair; > 0: first owes second
	net   map[string]int64
}

func (b *BalanceSheet) Record(debtor, creditor string, amount int64)
func (b *BalanceSheet) Owes(debtor, creditor string) int64
func (b *BalanceSheet) Net(user string) int64
func (b *BalanceSheet) Debts() []Transfer
func (b *BalanceSheet) Simplify() []Transfer

type SplitStrategy interface {
	Shares(amount int64) (map[string]int64, error)
}

func NewEqualSplit(users []string) (EqualSplit, error)
func NewExactSplit(paise map[string]int64) (ExactSplit, error)
func NewPercentSplit(basisPoints map[string]int64) (PercentSplit, error)`,

"Split strategies": `// SplitStrategy turns an amount into shares. Strategies are never modified after construction,
// so goroutines can share them.
type SplitStrategy interface {
	// Shares returns each participant's share in paise; the shares add up to amount exactly.
	Shares(amount int64) (map[string]int64, error)
}

// ByWeight splits amount in proportion to weights: floor every share, then give the leftover paise,
// one each, to the largest remainders. Ties go to the user id that sorts first.
func ByWeight(amount int64, weights map[string]int64) (map[string]int64, error) {
	var total int64
	for _, w := range weights {
		total += w
	}
	if total <= 0 {
		return nil, errors.New("weights must be positive")
	}
	type part struct {
		user             string
		share, remainder int64
	}
	parts := make([]part, 0, len(weights))
	var assigned int64
	for _, u := range slices.Sorted(maps.Keys(weights)) {
		w := weights[u]
		if amount > math.MaxInt64/w {
			return nil, errors.New("amount too large")
		}
		scaled := amount * w
		parts = append(parts, part{u, scaled / total, scaled % total})
		assigned += scaled / total
	}
	// Stable sort: equal remainders keep id order.
	slices.SortStableFunc(parts, func(a, b part) int { return cmp.Compare(b.remainder, a.remainder) })
	leftover := amount - assigned // always fewer than len(parts)
	out := make(map[string]int64, len(parts))
	for i, p := range parts {
		out[p.user] = p.share
		if int64(i) < leftover {
			out[p.user]++
		}
	}
	return out, nil
}

type EqualSplit struct{ weights map[string]int64 }

func NewEqualSplit(users []string) (EqualSplit, error) {
	if len(users) == 0 {
		return EqualSplit{}, errors.New("no one to split between")
	}
	w := make(map[string]int64, len(users))
	for _, u := range users {
		if _, dup := w[u]; dup {
			return EqualSplit{}, fmt.Errorf("listed twice: %s", u)
		}
		w[u] = 1
	}
	return EqualSplit{w}, nil
}

func (s EqualSplit) Shares(amount int64) (map[string]int64, error) { return ByWeight(amount, s.weights) }

type ExactSplit struct{ paise map[string]int64 }

func NewExactSplit(paise map[string]int64) (ExactSplit, error) {
	if len(paise) == 0 {
		return ExactSplit{}, errors.New("exact amounts must be zero or more")
	}
	for _, p := range paise {
		if p < 0 {
			return ExactSplit{}, errors.New("exact amounts must be zero or more")
		}
	}
	return ExactSplit{maps.Clone(paise)}, nil
}

func (s ExactSplit) Shares(amount int64) (map[string]int64, error) {
	var sum int64
	for _, p := range s.paise {
		sum += p
	}
	if sum != amount {
		return nil, fmt.Errorf("exact amounts add up to %d, not %d", sum, amount)
	}
	return maps.Clone(s.paise), nil
}

const Whole = 10_000 // basis points: 33.33% is 3333

type PercentSplit struct{ basisPoints map[string]int64 }

func NewPercentSplit(basisPoints map[string]int64) (PercentSplit, error) {
	var sum int64
	for _, b := range basisPoints {
		if b <= 0 {
			return PercentSplit{}, errors.New("every percentage must be positive")
		}
		sum += b
	}
	if sum != Whole {
		return PercentSplit{}, fmt.Errorf("percentages add up to %d basis points, not %d", sum, Whole)
	}
	return PercentSplit{maps.Clone(basisPoints)}, nil
}

func (s PercentSplit) Shares(amount int64) (map[string]int64, error) { return ByWeight(amount, s.basisPoints) }`,

"BalanceSheet": `// pair is keyed in sorted order: lo sorts before hi, so a pair of users has one key.
type pair struct{ lo, hi string }

// BalanceSheet records who owes whom inside one group. Not safe for concurrent use:
// only its Group calls it, while holding the group's mutex.
type BalanceSheet struct {
	pairs map[pair]int64   // > 0: lo owes hi; < 0: hi owes lo
	net   map[string]int64 // > 0: is owed money; < 0: owes money
}

func NewBalanceSheet() *BalanceSheet {
	return &BalanceSheet{pairs: map[pair]int64{}, net: map[string]int64{}}
}

// Record notes that debtor owes creditor amount more; a debt the other way shrinks first.
func (b *BalanceSheet) Record(debtor, creditor string, amount int64) {
	if debtor == creditor || amount == 0 {
		return // the payer's own share moves nothing
	}
	b.addToPair(debtor, creditor, amount)
	b.net[debtor] -= amount
	b.net[creditor] += amount
}

func (b *BalanceSheet) Owes(debtor, creditor string) int64 {
	var v int64
	if debtor < creditor {
		v = b.pairs[pair{debtor, creditor}]
	} else {
		v = -b.pairs[pair{creditor, debtor}]
	}
	return max(0, v)
}

func (b *BalanceSheet) Net(user string) int64 { return b.net[user] }

func (b *BalanceSheet) Debts() []Transfer {
	out := make([]Transfer, 0, len(b.pairs))
	for p, v := range b.pairs {
		if v > 0 {
			out = append(out, Transfer{p.lo, p.hi, v})
		} else {
			out = append(out, Transfer{p.hi, p.lo, -v})
		}
	}
	slices.SortFunc(out, func(x, y Transfer) int {
		return cmp.Or(cmp.Compare(x.From, y.From), cmp.Compare(x.To, y.To))
	})
	return out
}

type owed struct {
	user   string
	amount int64
}

// owedHeap implements container/heap.Interface: largest amount first, ties by user id.
type owedHeap []owed

func (h owedHeap) Len() int { return len(h) }
func (h owedHeap) Less(i, j int) bool {
	if h[i].amount != h[j].amount {
		return h[i].amount > h[j].amount
	}
	return h[i].user < h[j].user
}
func (h owedHeap) Swap(i, j int) { h[i], h[j] = h[j], h[i] }
func (h *owedHeap) Push(x any)   { *h = append(*h, x.(owed)) }
func (h *owedHeap) Pop() any {
	old := *h
	x := old[len(old)-1]
	*h = old[:len(old)-1]
	return x
}

// Simplify replaces the pairwise debts with at most n-1 transfers; every net balance stays the same.
func (b *BalanceSheet) Simplify() []Transfer {
	creditors, debtors := &owedHeap{}, &owedHeap{}
	for u, v := range b.net {
		if v > 0 {
			heap.Push(creditors, owed{u, v})
		} else if v < 0 {
			heap.Push(debtors, owed{u, -v})
		}
	}
	var plan []Transfer
	for creditors.Len() > 0 { // nets sum to zero, so both heaps empty together
		c, d := heap.Pop(creditors).(owed), heap.Pop(debtors).(owed)
		x := min(c.amount, d.amount)
		plan = append(plan, Transfer{d.user, c.user, x})
		if c.amount > x {
			heap.Push(creditors, owed{c.user, c.amount - x})
		}
		if d.amount > x {
			heap.Push(debtors, owed{d.user, d.amount - x})
		}
	}
	clear(b.pairs)
	for _, t := range plan {
		b.addToPair(t.From, t.To, t.Amount) // nets are untouched
	}
	return plan
}

func (b *BalanceSheet) addToPair(debtor, creditor string, amount int64) {
	key, delta := pair{debtor, creditor}, amount
	if creditor < debtor {
		key, delta = pair{creditor, debtor}, -amount
	}
	b.pairs[key] += delta
	if b.pairs[key] == 0 {
		delete(b.pairs, key) // a settled pair leaves no entry
	}
}`,

"Group": `// Group holds one group's members, history and balances. Every method takes the group's mutex, so an
// expense updates the pairs and the nets as one step, and different groups never wait for each other.
type Group struct {
	ID      string
	members map[string]bool // fixed at creation, never written again
	mu      sync.Mutex      // guards sheet and history
	sheet   *BalanceSheet
	history []Expense // append-only
}

func NewGroup(id string, memberIDs []string) *Group {
	m := make(map[string]bool, len(memberIDs))
	for _, u := range memberIDs {
		m[u] = true
	}
	return &Group{ID: id, members: m, sheet: NewBalanceSheet()}
}

func (g *Group) IsMember(userID string) bool { return g.members[userID] } // read-only map: no lock needed

func (g *Group) Apply(e Expense) {
	g.mu.Lock()
	defer g.mu.Unlock()
	for user, share := range e.Shares {
		g.sheet.Record(user, e.PayerID, share)
	}
	g.history = append(g.history, e)
}

func (g *Group) Settle(t Transfer) error {
	g.mu.Lock()
	defer g.mu.Unlock()
	if owed := g.sheet.Owes(t.From, t.To); t.Amount > owed {
		return fmt.Errorf("%s owes %s only %d", t.From, t.To, owed)
	}
	g.sheet.Record(t.To, t.From, t.Amount) // paying a debt is a debt in the other direction
	return nil
}

func (g *Group) Net(userID string) int64 {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.sheet.Net(userID)
}

func (g *Group) Debts() []Transfer {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.sheet.Debts()
}

func (g *Group) SimplifyDebts() []Transfer {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.sheet.Simplify()
}

func (g *Group) History() []Expense {
	g.mu.Lock()
	defer g.mu.Unlock()
	return slices.Clone(g.history)
}`,

"SplitwiseService": `// SplitwiseService is the entry point. Create one at startup and pass it to whoever needs it.
type SplitwiseService struct {
	mu            sync.RWMutex // guards users and groups (the maps only; each Group has its own mutex)
	users         map[string]User
	groups        map[string]*Group
	nextExpenseID atomic.Int64
}

func NewSplitwiseService() *SplitwiseService {
	return &SplitwiseService{users: map[string]User{}, groups: map[string]*Group{}}
}

func (s *SplitwiseService) AddUser(id, name string) (User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.users[id]; ok {
		return User{}, fmt.Errorf("user exists: %s", id)
	}
	u := User{id, name}
	s.users[id] = u
	return u, nil
}

func (s *SplitwiseService) CreateGroup(id string, memberIDs []string) (*Group, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, u := range memberIDs {
		if _, ok := s.users[u]; !ok {
			return nil, errors.New("a group needs two or more registered users")
		}
	}
	if _, ok := s.groups[id]; ok {
		return nil, fmt.Errorf("group exists: %s", id)
	}
	g := NewGroup(id, memberIDs)
	if len(g.members) < 2 {
		return nil, errors.New("a group needs two or more registered users")
	}
	s.groups[id] = g
	return g, nil
}

func (s *SplitwiseService) AddExpense(groupID, payerID string, amount int64, split SplitStrategy, description string) (Expense, error) {
	g, err := s.group(groupID)
	if err != nil {
		return Expense{}, err
	}
	if err := requireMember(g, payerID); err != nil {
		return Expense{}, err
	}
	if amount <= 0 {
		return Expense{}, errors.New("amount must be positive")
	}
	shares, err := split.Shares(amount) // pure computation: no lock held
	if err != nil {
		return Expense{}, err
	}
	for u := range shares {
		if err := requireMember(g, u); err != nil {
			return Expense{}, err
		}
	}
	e, err := NewExpense(s.nextExpenseID.Add(1), groupID, payerID, amount, shares, description)
	if err != nil {
		return Expense{}, err
	}
	g.Apply(e) // the only step that changes state
	return e, nil
}

func (s *SplitwiseService) SettleUp(groupID, fromID, toID string, amount int64) error {
	g, err := s.group(groupID)
	if err != nil {
		return err
	}
	if err := requireMember(g, fromID); err != nil {
		return err
	}
	if err := requireMember(g, toID); err != nil {
		return err
	}
	if amount <= 0 || fromID == toID {
		return errors.New("a settle-up needs two people and a positive amount")
	}
	return g.Settle(Transfer{fromID, toID, amount})
}

func (s *SplitwiseService) Balance(groupID, userID string) (int64, error) {
	g, err := s.group(groupID)
	if err != nil {
		return 0, err
	}
	return g.Net(userID), nil
}

func (s *SplitwiseService) WhoOwesWhom(groupID string) ([]Transfer, error) {
	g, err := s.group(groupID)
	if err != nil {
		return nil, err
	}
	return g.Debts(), nil
}

func (s *SplitwiseService) SimplifyDebts(groupID string) ([]Transfer, error) {
	g, err := s.group(groupID)
	if err != nil {
		return nil, err
	}
	return g.SimplifyDebts(), nil
}

func (s *SplitwiseService) group(id string) (*Group, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	g, ok := s.groups[id]
	if !ok {
		return nil, fmt.Errorf("no group %s", id)
	}
	return g, nil
}

func requireMember(g *Group, userID string) error {
	if !g.IsMember(userID) {
		return fmt.Errorf("%s is not in group %s", userID, g.ID)
	}
	return nil
}`,

"Splitwise in one screen": `type Expense struct { // validated by NewExpense: shares add up to Amount
	ID, Amount       int64
	GroupID, PayerID string
	Shares           map[string]int64
}
type Transfer struct { // settle-up, or a step of a simplified plan
	From, To string
	Amount   int64
}

type SplitStrategy interface{ Shares(amount int64) (map[string]int64, error) } // shares add up exactly
// NewEqualSplit(users), NewExactSplit(paise), NewPercentSplit(basisPoints, 10000 = 100%)
// ByWeight: floor each share, leftover paise to the largest remainders, ties by user id

type BalanceSheet struct { // used only under its Group's mutex
	pairs map[pair]int64   // sorted pair; > 0 first owes second; zero entries deleted
	net   map[string]int64 // sums to zero across the group
}
// Record(debtor, creditor, amount); Simplify(): two max-heaps, at most n-1 payments, nets unchanged

type Group struct { // one mutex per group
	mu    sync.Mutex
	sheet *BalanceSheet
}
// Apply(e): Record(participant, payer, share) for each share
// Settle(t): error if more than owed; Record(t.To, t.From, t.Amount)

// SplitwiseService: injected; RWMutex-guarded maps of users and groups
// AddExpense(groupID, payerID, amount, split, description); SettleUp(groupID, fromID, toID, amount)`,

"ShareSplit and ItemSplit": `// ShareSplit handles 2:1:1 and the like with the same largest-remainder rule as percentages.
type ShareSplit struct{ shares map[string]int64 }

func NewShareSplit(shares map[string]int64) (ShareSplit, error) {
	if len(shares) == 0 {
		return ShareSplit{}, errors.New("every share must be positive")
	}
	for _, s := range shares {
		if s <= 0 {
			return ShareSplit{}, errors.New("every share must be positive")
		}
	}
	return ShareSplit{maps.Clone(shares)}, nil
}

func (s ShareSplit) Shares(amount int64) (map[string]int64, error) { return ByWeight(amount, s.shares) }

type Item struct {
	Price    int64
	SharedBy []string
}

// ItemSplit splits each item equally among the people who had it; whatever the bill adds on top
// (tax, tip) is split in proportion to what each person had.
type ItemSplit struct{ items []Item }

func NewItemSplit(items []Item) (ItemSplit, error) {
	if len(items) == 0 {
		return ItemSplit{}, errors.New("no items")
	}
	own := make([]Item, len(items))
	for i, it := range items {
		if it.Price <= 0 || len(it.SharedBy) == 0 {
			return ItemSplit{}, errors.New("an item needs a price and someone who had it")
		}
		own[i] = Item{it.Price, slices.Clone(it.SharedBy)}
	}
	return ItemSplit{own}, nil
}

func (s ItemSplit) Shares(amount int64) (map[string]int64, error) {
	had := map[string]int64{}
	for _, it := range s.items {
		eq, err := NewEqualSplit(it.SharedBy)
		if err != nil {
			return nil, err
		}
		shares, err := eq.Shares(it.Price)
		if err != nil {
			return nil, err
		}
		for u, x := range shares {
			had[u] += x
		}
	}
	var subtotal int64
	for _, x := range had {
		subtotal += x
	}
	if amount < subtotal {
		return nil, errors.New("the bill is less than its items")
	}
	extra, err := ByWeight(amount-subtotal, had)
	if err != nil {
		return nil, err
	}
	for u, x := range extra {
		had[u] += x
	}
	return had, nil
}`,

"Reversing an expense": `// In Group: an expense is never removed from history; a reversal undoes its effect on balances.
// The new field reversed map[int64]bool is created in NewGroup and guarded by mu like the rest.
// Apply now locks and calls applyLocked, which holds the old Apply body.

func (g *Group) Reverse(expenseID int64) error {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.reverseLocked(expenseID)
}

// Replace reverses one expense and applies another under a single lock. Go mutexes are not
// re-entrant, so this is one method rather than a lock held around two calls.
func (g *Group) Replace(expenseID int64, replacement Expense) error {
	g.mu.Lock()
	defer g.mu.Unlock()
	if err := g.reverseLocked(expenseID); err != nil {
		return err
	}
	g.applyLocked(replacement)
	return nil
}

func (g *Group) reverseLocked(expenseID int64) error {
	i := slices.IndexFunc(g.history, func(e Expense) bool { return e.ID == expenseID })
	if i < 0 {
		return fmt.Errorf("no expense %d", expenseID)
	}
	if g.reversed[expenseID] {
		return fmt.Errorf("already reversed: %d", expenseID)
	}
	g.reversed[expenseID] = true
	e := g.history[i]
	for user, share := range e.Shares {
		g.sheet.Record(e.PayerID, user, share) // the same debts, the other way
	}
	return nil
}

// In SplitwiseService: an edit is a reversal plus a new expense, applied as one step.
func (s *SplitwiseService) EditExpense(groupID string, expenseID int64, payerID string, amount int64, split SplitStrategy, description string) (Expense, error) {
	g, err := s.group(groupID)
	if err != nil {
		return Expense{}, err
	}
	replacement, err := s.buildExpense(g, payerID, amount, split, description) // the validation half of AddExpense
	if err != nil {
		return Expense{}, err
	}
	if err := g.Replace(expenseID, replacement); err != nil {
		return Expense{}, err
	}
	return replacement, nil
}`,

"Balances per currency": `// Money is an amount in minor units (paise, cents; yen has none) with its currency.
type Money struct {
	Minor    int64
	Currency string // ISO 4217 code, e.g. "INR"
}

func NewMoney(minor int64, currency string) (Money, error) {
	if minor <= 0 {
		return Money{}, errors.New("amount must be positive")
	}
	return Money{minor, currency}, nil
}

// Expense gains a Currency field. Group gets sheets map[string]*BalanceSheet,
// one sheet per currency, created on first use and guarded by mu.
func (g *Group) Apply(e Expense) {
	g.mu.Lock()
	defer g.mu.Unlock()
	sheet, ok := g.sheets[e.Currency]
	if !ok {
		sheet = NewBalanceSheet()
		g.sheets[e.Currency] = sheet
	}
	for user, share := range e.Shares {
		sheet.Record(user, e.PayerID, share)
	}
	g.history = append(g.history, e)
}

// Conversion is a rate fixed when someone converts a balance, kept with the conversion so it never
// changes afterwards. RateMicros is minor units of To per minor unit of From, times one million.
type Conversion struct {
	From, To   string
	RateMicros int64
	At         time.Time
}

func (c Conversion) Convert(minor int64) (int64, error) {
	if c.RateMicros <= 0 || minor > math.MaxInt64/c.RateMicros {
		return 0, errors.New("rate must be positive and the result must fit")
	}
	scaled := minor * c.RateMicros
	q, r := scaled/1_000_000, scaled%1_000_000
	if r > 500_000 || (r == 500_000 && q%2 != 0) {
		q++ // half-even, for positive amounts
	}
	return q, nil
}`,

"Totals across groups": `// In SplitwiseService. Each group is read under its own mutex, so the total is a sum of consistent
// per-group values, not one snapshot across groups. The service lock is released before any group
// lock is taken, so the two are never held together.
func (s *SplitwiseService) TotalBalance(userID string) int64 {
	s.mu.RLock()
	groups := slices.Collect(maps.Values(s.groups))
	s.mu.RUnlock()
	var total int64
	for _, g := range groups {
		if g.IsMember(userID) {
			total += g.Net(userID)
		}
	}
	return total
}`
} };
