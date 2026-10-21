// Go versions of the Inventory Management code blocks, matched to the Java blocks by title. Imports are omitted.
window.ALT = window.ALT || {};
ALT["inventory-management"] = { go: {
"LowStockAlert and AlertListener": `// LowStockAlert is one crossing below a threshold: built under the warehouse lock, delivered after it is released.
type LowStockAlert struct {
	WarehouseID, ProductID string
	Quantity, Threshold    int
}

// AlertListener is the Observer. Implementations may be slow or panic; the manager calls them outside every lock.
type AlertListener interface {
	OnLowStock(alert LowStockAlert)
}`,

"Final class design": `type InventoryManager struct {
	warehouses map[string]*Warehouse // fixed at start, never modified
	lmu        sync.RWMutex          // guards listeners
	listeners  []AlertListener
}

func NewInventoryManager(warehouseIDs []string) *InventoryManager
func (m *InventoryManager) AddListener(l AlertListener)
func (m *InventoryManager) SetThreshold(warehouseID, productID string, threshold int) error
func (m *InventoryManager) AddStock(warehouseID, productID string, qty int) error
func (m *InventoryManager) RemoveStock(warehouseID, productID string, qty int) (bool, error)      // false if short
func (m *InventoryManager) Transfer(productID, fromID, toID string, qty int) (bool, error)        // atomic; false if short
func (m *InventoryManager) Quantity(warehouseID, productID string) (int, error)
func (m *InventoryManager) WarehousesWith(productID string, qty int) ([]string, error)           // a snapshot

type Warehouse struct {
	ID         string
	mu         sync.Mutex     // guards both maps
	stock      map[string]int // product -> units on hand
	thresholds map[string]int // product -> low-stock level
}

func (w *Warehouse) quantity(productID string) int // every method: caller holds mu
func (w *Warehouse) add(productID string, qty int) error
func (w *Warehouse) remove(productID string, qty int, alerts *[]LowStockAlert)
func (w *Warehouse) setThreshold(productID string, threshold int)

type LowStockAlert struct {
	WarehouseID, ProductID string
	Quantity, Threshold    int
}

type AlertListener interface{ OnLowStock(alert LowStockAlert) }`,

"Warehouse": `type Warehouse struct {
	ID         string
	mu         sync.Mutex
	stock      map[string]int // guarded by mu
	thresholds map[string]int // guarded by mu
}

func newWarehouse(id string) *Warehouse {
	return &Warehouse{ID: id, stock: map[string]int{}, thresholds: map[string]int{}}
}

// Every method below assumes the caller holds mu; the manager decides how long it is held.

func (w *Warehouse) quantity(productID string) int { return w.stock[productID] } // unknown product: 0

func (w *Warehouse) setThreshold(productID string, threshold int) { w.thresholds[productID] = threshold }

// add is receiving. It checks for overflow before writing, so a failed add changes nothing.
func (w *Warehouse) add(productID string, qty int) error {
	if w.stock[productID] > math.MaxInt-qty {
		return errors.New("quantity overflow")
	}
	w.stock[productID] += qty
	return nil
}

// remove is shipping. The caller has checked quantity under the same lock; the check here is only a guard.
func (w *Warehouse) remove(productID string, qty int, alerts *[]LowStockAlert) {
	before := w.stock[productID]
	if before < qty {
		panic("stock would go negative") // a caller bug
	}
	after := before - qty
	w.stock[productID] = after
	if t, ok := w.thresholds[productID]; ok && before >= t && after < t { // crossed downward: once per drop
		*alerts = append(*alerts, LowStockAlert{w.ID, productID, after, t})
	}
}`,

"Why read-then-write oversells": `// Broken: sync.Map makes each call safe, but not the pair.
var stock sync.Map // product -> int

func removeStock(productID string, qty int) bool {
	v, _ := stock.Load(productID) // order A and order B both read 8
	have, _ := v.(int)
	if have < qty { // both pass: 8 >= 5 and 8 >= 4
		return false
	}
	stock.Store(productID, have-qty) // A writes 3, B writes 4: nine units sold from eight
	return true
}`,

"InventoryManager: stock, availability and alerts": `type InventoryManager struct {
	warehouses map[string]*Warehouse // fixed at start, read without locks
	lmu        sync.RWMutex          // guards listeners
	listeners  []AlertListener
}

func NewInventoryManager(warehouseIDs []string) *InventoryManager {
	m := &InventoryManager{warehouses: make(map[string]*Warehouse, len(warehouseIDs))}
	for _, id := range warehouseIDs {
		m.warehouses[id] = newWarehouse(id)
	}
	return m
}

func (m *InventoryManager) AddListener(l AlertListener) {
	m.lmu.Lock()
	defer m.lmu.Unlock()
	m.listeners = append(m.listeners, l)
}

func (m *InventoryManager) SetThreshold(warehouseID, productID string, threshold int) error {
	if threshold < 0 {
		return errors.New("threshold must not be negative")
	}
	w, err := m.get(warehouseID)
	if err != nil {
		return err
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	w.setThreshold(productID, threshold)
	return nil
}

func (m *InventoryManager) AddStock(warehouseID, productID string, qty int) error {
	w, err := m.get(warehouseID)
	if err != nil {
		return err
	}
	if err := requirePositive(qty); err != nil {
		return err
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.add(productID, qty)
}

// RemoveStock fulfils an order from one warehouse. It reports false, with nothing changed, if stock is short.
func (m *InventoryManager) RemoveStock(warehouseID, productID string, qty int) (bool, error) {
	w, err := m.get(warehouseID)
	if err != nil {
		return false, err
	}
	if err := requirePositive(qty); err != nil {
		return false, err
	}
	var alerts []LowStockAlert
	w.mu.Lock()
	ok := w.quantity(productID) >= qty // check and act under one lock
	if ok {
		w.remove(productID, qty, &alerts)
	}
	w.mu.Unlock()
	m.deliver(alerts) // after unlocking
	return ok, nil
}

func (m *InventoryManager) Quantity(warehouseID, productID string) (int, error) {
	w, err := m.get(warehouseID)
	if err != nil {
		return 0, err
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.quantity(productID), nil
}

// WarehousesWith lists warehouses that can fulfil qty on their own, sorted by id.
// Each is read under its own lock: a snapshot.
func (m *InventoryManager) WarehousesWith(productID string, qty int) ([]string, error) {
	if err := requirePositive(qty); err != nil {
		return nil, err
	}
	var out []string
	for id, w := range m.warehouses {
		w.mu.Lock()
		if w.quantity(productID) >= qty {
			out = append(out, id)
		}
		w.mu.Unlock()
	}
	slices.Sort(out)
	return out, nil
}

func (m *InventoryManager) deliver(alerts []LowStockAlert) {
	if len(alerts) == 0 {
		return
	}
	m.lmu.RLock()
	ls := slices.Clone(m.listeners)
	m.lmu.RUnlock()
	for _, a := range alerts {
		for _, l := range ls {
			func() {
				defer func() { _ = recover() }() // log it; one failing listener must not stop the rest
				l.OnLowStock(a)
			}()
		}
	}
}

func (m *InventoryManager) get(id string) (*Warehouse, error) {
	w, ok := m.warehouses[id]
	if !ok {
		return nil, fmt.Errorf("unknown warehouse %s", id)
	}
	return w, nil
}

func requirePositive(qty int) error {
	if qty <= 0 {
		return errors.New("quantity must be positive")
	}
	return nil
}`,

"InventoryManager.transfer": `// Transfer moves qty from one warehouse to another atomically.
// It reports false, with nothing changed, if the source is short.
func (m *InventoryManager) Transfer(productID, fromID, toID string, qty int) (bool, error) {
	if err := requirePositive(qty); err != nil {
		return false, err
	}
	if fromID == toID {
		return false, errors.New("source and destination are the same")
	}
	from, err := m.get(fromID)
	if err != nil {
		return false, err
	}
	to, err := m.get(toID)
	if err != nil {
		return false, err
	}
	first, second := from, to // one global order: by id
	if toID < fromID {
		first, second = to, from
	}
	var alerts []LowStockAlert
	first.mu.Lock()
	second.mu.Lock()
	ok := from.quantity(productID) >= qty
	if ok {
		err = to.add(productID, qty) // can only fail on overflow, before anything changed
		if err == nil {
			from.remove(productID, qty, &alerts) // cannot fail: checked above, both locks held
		}
	}
	second.mu.Unlock()
	first.mu.Unlock()
	if err != nil {
		return false, err
	}
	m.deliver(alerts) // the destination only gains, so only the source alerts
	return ok, nil
}`,

"Inventory in one screen": `type LowStockAlert struct {
	WarehouseID, ProductID string
	Quantity, Threshold    int
}
type AlertListener interface{ OnLowStock(alert LowStockAlert) }

type Warehouse struct { // every method: caller holds mu
	mu                sync.Mutex
	stock, thresholds map[string]int
}

func (w *Warehouse) add(product string, qty int) error                        // overflow checked before writing
func (w *Warehouse) remove(product string, qty int, alerts *[]LowStockAlert) // before >= t > after: alert

type InventoryManager struct {
	warehouses map[string]*Warehouse // immutable; listeners behind an RWMutex
}

func (m *InventoryManager) RemoveStock(wh, product string, qty int) (bool, error)       // lock; check and remove; unlock; deliver
func (m *InventoryManager) Transfer(product, from, to string, qty int) (bool, error)    // lock both in id order; credit, debit
func (m *InventoryManager) WarehousesWith(product string, qty int) ([]string, error)    // per-warehouse snapshot, sorted
// short stock: false; bad arguments: error; listeners: called after unlocking`,

"Reservations with expiry": `type Reservation struct {
	ID, WarehouseID, ProductID string
	Qty                        int
	ExpiresAt                  time.Time
}

// Warehouse gains two maps, guarded by the same mu as stock. Every method: caller holds mu.
//   reserved map[string]int         // product -> units held for open orders
//   holds    map[string]Reservation // reservation id -> hold

func (w *Warehouse) available(productID string) int { return w.stock[productID] - w.reserved[productID] }

func (w *Warehouse) reserve(productID string, qty int, expiresAt time.Time) (Reservation, bool) {
	if w.available(productID) < qty {
		return Reservation{}, false // the last units are already promised
	}
	r := Reservation{newID(), w.ID, productID, qty, expiresAt} // newID: a random unique id
	w.holds[r.ID] = r
	w.reserved[productID] += qty
	return r, true
}

// commit is the order shipping. False if the id is unknown, already used or expired.
func (w *Warehouse) commit(id string, now time.Time, alerts *[]LowStockAlert) bool {
	r, ok := w.unhold(id)
	if !ok || !r.ExpiresAt.After(now) {
		return false // too late: the units are free again
	}
	w.remove(r.ProductID, r.Qty, alerts) // cannot fail: on hand never drops below reserved
	return true
}

func (w *Warehouse) release(id string) bool { // order cancelled
	_, ok := w.unhold(id)
	return ok
}

func (w *Warehouse) releaseExpired(now time.Time) int { // a scheduled sweeper calls this every minute
	n := 0
	for id, r := range w.holds {
		if !r.ExpiresAt.After(now) {
			w.unhold(id) // deleting during range is allowed in Go
			n++
		}
	}
	return n
}

func (w *Warehouse) unhold(id string) (Reservation, bool) {
	r, ok := w.holds[id]
	if ok {
		delete(w.holds, id)
		w.reserved[r.ProductID] -= r.Qty
	}
	return r, ok
}`,

"A two-step transfer": `type TransferState int32

const (
	InTransit TransferState = iota
	Received
	Cancelled
)

type Transfer struct {
	ID, ProductID, FromID, ToID string
	Qty                         int
	state                       atomic.Int32 // a TransferState; starts at InTransit
}

// finish leaves InTransit exactly once, even if receive and cancel race.
func (t *Transfer) finish(outcome TransferState) bool {
	return t.state.CompareAndSwap(int32(InTransit), int32(outcome))
}

// InventoryManager gains: transfers sync.Map // transfer id -> *Transfer

func (m *InventoryManager) Ship(productID, fromID, toID string, qty int) (*Transfer, error) {
	if _, err := m.get(toID); err != nil { // fail fast on an unknown destination
		return nil, err
	}
	ok, err := m.RemoveStock(fromID, productID, qty) // leaves the source now
	if err != nil || !ok {
		return nil, err
	}
	t := &Transfer{ID: newID(), ProductID: productID, FromID: fromID, ToID: toID, Qty: qty}
	m.transfers.Store(t.ID, t)
	return t, nil
}

func (m *InventoryManager) Receive(transferID string) (bool, error) { return m.settle(transferID, Received) }
func (m *InventoryManager) Cancel(transferID string) (bool, error)  { return m.settle(transferID, Cancelled) }

func (m *InventoryManager) settle(transferID string, outcome TransferState) (bool, error) {
	v, ok := m.transfers.Load(transferID)
	if !ok || !v.(*Transfer).finish(outcome) {
		return false, nil // unknown, or already settled
	}
	t := v.(*Transfer)
	dest := t.FromID
	if outcome == Received {
		dest = t.ToID
	}
	return true, m.AddStock(dest, t.ProductID, t.Qty)
}`,

"Per-product locks inside a warehouse": `type Warehouse struct {
	ID    string
	locks sync.Map // product -> *sync.Mutex
	// stock and thresholds become maps behind their own small mutex (or sync.Map),
	// because different product locks now let two goroutines write them at once.
}

func (w *Warehouse) lockFor(productID string) *sync.Mutex {
	l, _ := w.locks.LoadOrStore(productID, &sync.Mutex{})
	return l.(*sync.Mutex)
}

// quantity, add and remove are unchanged; the caller now holds lockFor(productID).

// InventoryManager.RemoveStock
l := w.lockFor(productID)
l.Lock()
ok := w.quantity(productID) >= qty
if ok {
	w.remove(productID, qty, &alerts)
}
l.Unlock()

// InventoryManager.Transfer: both locks are for the same product, so warehouse id is still a total order.
first, second := from.lockFor(productID), to.lockFor(productID)
if toID < fromID {
	first, second = second, first
}`,

"All-or-nothing orders across warehouses": `type Allocation struct {
	WarehouseID string
	Qty         int
}

// FulfilmentStrategy splits qty across warehouses given a snapshot of what each holds; nil if it can't be done.
type FulfilmentStrategy interface {
	Plan(snapshot map[string]int, qty int) []Allocation
}

// FewestSplits ships from the biggest holders first, ties by id so the plan is deterministic.
type FewestSplits struct{}

func (FewestSplits) Plan(snapshot map[string]int, qty int) []Allocation {
	ids := slices.Collect(maps.Keys(snapshot))
	slices.SortFunc(ids, func(a, b string) int {
		if c := cmp.Compare(snapshot[b], snapshot[a]); c != 0 {
			return c
		}
		return cmp.Compare(a, b)
	})
	var out []Allocation
	left := qty
	for _, id := range ids {
		if left == 0 {
			break
		}
		if take := min(left, snapshot[id]); take > 0 {
			out = append(out, Allocation{id, take})
			left -= take
		}
	}
	if left > 0 {
		return nil
	}
	return out
}

// Fulfil locks every warehouse in the plan in id order, re-checks, and removes from all or none.
func (m *InventoryManager) Fulfil(productID string, qty int, s FulfilmentStrategy) (bool, error) {
	if err := requirePositive(qty); err != nil {
		return false, err
	}
	plan := s.Plan(m.snapshot(productID), qty) // snapshot: each warehouse read under its lock
	if plan == nil {
		return false, nil
	}
	sites := make([]*Warehouse, 0, len(plan))
	for _, a := range plan {
		sites = append(sites, m.warehouses[a.WarehouseID])
	}
	slices.SortFunc(sites, func(a, b *Warehouse) int { return cmp.Compare(a.ID, b.ID) }) // id order, as in Transfer
	for _, w := range sites {
		w.mu.Lock()
	}
	ok := true
	for _, a := range plan { // re-check: stock may have moved since the snapshot
		ok = ok && m.warehouses[a.WarehouseID].quantity(productID) >= a.Qty
	}
	var alerts []LowStockAlert
	if ok {
		for _, a := range plan {
			m.warehouses[a.WarehouseID].remove(productID, a.Qty, &alerts)
		}
	}
	for _, w := range sites {
		w.mu.Unlock()
	}
	m.deliver(alerts)
	return ok, nil // false: plan again
}`,

"Stress tests that check invariants": `func TestOpposingTransfersConserveStockAndNeverDeadlock(t *testing.T) {
	inv := NewInventoryManager([]string{"east", "west"})
	inv.AddStock("east", "widget", 1_000)
	inv.AddStock("west", "widget", 1_000)

	var wg sync.WaitGroup
	start := make(chan struct{})
	for i := range 8 {
		from, to := "east", "west" // half each way: the mix that deadlocks without ordering
		if i%2 == 1 {
			from, to = "west", "east"
		}
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			for j := range 10_000 {
				inv.Transfer("widget", from, to, 1+j%3)
			}
		}()
	}
	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()
	close(start)
	select {
	case <-done:
	case <-time.After(10 * time.Second): // a deadlock times out here
		t.Fatal("transfers did not finish: deadlock?")
	}
	east, _ := inv.Quantity("east", "widget")
	west, _ := inv.Quantity("west", "widget")
	if east+west != 2_000 { // nothing created or lost
		t.Fatalf("total = %d, want 2000", east+west)
	}
}

func TestRacingOrdersNeverOversell(t *testing.T) {
	inv := NewInventoryManager([]string{"east"})
	inv.AddStock("east", "widget", 50)

	var sold atomic.Int32
	var wg sync.WaitGroup
	for range 200 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if ok, _ := inv.RemoveStock("east", "widget", 1); ok {
				sold.Add(1)
			}
		}()
	}
	wg.Wait()
	if sold.Load() != 50 { // exactly the stock, never more
		t.Fatalf("sold %d, want 50", sold.Load())
	}
	if left, _ := inv.Quantity("east", "widget"); left != 0 {
		t.Fatalf("left %d, want 0", left)
	}
}`
} };
