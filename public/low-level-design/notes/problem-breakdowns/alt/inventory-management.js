// Go versions of the Inventory Management code blocks, matched to the Java blocks by title. Imports are omitted.
window.ALT = window.ALT || {};
ALT["inventory-management"] = { go: {
"Public API": `func (m *InventoryManager) AddStock(warehouseID, productID string, qty int) error
func (m *InventoryManager) RemoveStock(warehouseID, productID string, qty int) error // error if it would go negative
func (m *InventoryManager) Transfer(productID, fromID, toID string, qty int) error   // atomic
func (m *InventoryManager) WarehousesWith(productID string, qty int) []string
func (m *InventoryManager) Quantity(warehouseID, productID string) (int, error)
func (m *InventoryManager) SetThreshold(warehouseID, productID string, threshold int) error
func (m *InventoryManager) AddListener(l AlertListener)`,

"Warehouse": `type AlertListener interface {
	OnLowStock(warehouseID, productID string, quantity, threshold int)
}

type LowStockAlert struct {
	WarehouseID, ProductID string
	Quantity, Threshold    int
}

var ErrInsufficientStock = errors.New("insufficient stock")

type Warehouse struct {
	ID         string
	mu         sync.Mutex
	stock      map[string]int // guarded by mu
	thresholds map[string]int // guarded by mu
}

func newWarehouse(id string) *Warehouse {
	return &Warehouse{ID: id, stock: map[string]int{}, thresholds: map[string]int{}}
}

// change applies a delta and returns an alert if stock crossed below the threshold. Caller holds mu.
func (w *Warehouse) change(product string, delta int) (*LowStockAlert, error) {
	before := w.stock[product]
	after := before + delta
	if after < 0 {
		return nil, fmt.Errorf("%w: %s has %d of %s, cannot remove %d", ErrInsufficientStock, w.ID, before, product, -delta)
	}
	w.stock[product] = after
	if t, ok := w.thresholds[product]; ok && before >= t && after < t {
		return &LowStockAlert{w.ID, product, after, t}, nil
	}
	return nil, nil
}`,

"InventoryManager": `type InventoryManager struct {
	warehouses map[string]*Warehouse // fixed at start, read-only
	mu         sync.RWMutex
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
	m.mu.Lock()
	m.listeners = append(m.listeners, l)
	m.mu.Unlock()
}

func (m *InventoryManager) SetThreshold(warehouseID, productID string, threshold int) error {
	w, err := m.get(warehouseID)
	if err != nil {
		return err
	}
	w.mu.Lock()
	w.thresholds[productID] = threshold
	w.mu.Unlock()
	return nil
}

func (m *InventoryManager) AddStock(warehouseID, productID string, qty int) error {
	if qty <= 0 {
		return errors.New("quantity must be positive")
	}
	return m.apply(warehouseID, productID, qty)
}

func (m *InventoryManager) RemoveStock(warehouseID, productID string, qty int) error {
	if qty <= 0 {
		return errors.New("quantity must be positive")
	}
	return m.apply(warehouseID, productID, -qty)
}

func (m *InventoryManager) Transfer(productID, fromID, toID string, qty int) error {
	if qty <= 0 {
		return errors.New("quantity must be positive")
	}
	if fromID == toID {
		return errors.New("source and destination are the same")
	}
	from, err := m.get(fromID)
	if err != nil {
		return err
	}
	to, err := m.get(toID)
	if err != nil {
		return err
	}
	first, second := from, to // global lock order: by warehouse id
	if toID < fromID {
		first, second = to, from
	}
	first.mu.Lock()
	second.mu.Lock()
	alert, err := from.change(productID, -qty) // fails before any change if short
	if err == nil {
		_, err = to.change(productID, qty)
	}
	second.mu.Unlock()
	first.mu.Unlock()
	if err != nil {
		return err
	}
	m.notify(alert) // outside the locks
	return nil
}

func (m *InventoryManager) Quantity(warehouseID, productID string) (int, error) {
	w, err := m.get(warehouseID)
	if err != nil {
		return 0, err
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.stock[productID], nil
}

func (m *InventoryManager) WarehousesWith(productID string, qty int) []string {
	var out []string
	for id, w := range m.warehouses {
		w.mu.Lock()
		if w.stock[productID] >= qty {
			out = append(out, id)
		}
		w.mu.Unlock()
	}
	slices.Sort(out)
	return out // a snapshot: may change right after
}

func (m *InventoryManager) apply(warehouseID, productID string, delta int) error {
	w, err := m.get(warehouseID)
	if err != nil {
		return err
	}
	w.mu.Lock()
	alert, err := w.change(productID, delta)
	w.mu.Unlock()
	if err != nil {
		return err
	}
	m.notify(alert) // outside the lock
	return nil
}

func (m *InventoryManager) notify(a *LowStockAlert) {
	if a == nil {
		return
	}
	m.mu.RLock()
	ls := slices.Clone(m.listeners)
	m.mu.RUnlock()
	for _, l := range ls {
		func() {
			defer func() { recover() }() // log; one bad listener must not affect others
			l.OnLowStock(a.WarehouseID, a.ProductID, a.Quantity, a.Threshold)
		}()
	}
}

func (m *InventoryManager) get(id string) (*Warehouse, error) {
	w, ok := m.warehouses[id]
	if !ok {
		return nil, fmt.Errorf("unknown warehouse %s", id)
	}
	return w, nil
}`,

"On hand, reserved, available": `// Warehouse fields, guarded by mu:
//   onHand, reserved map[string]int

func (w *Warehouse) available(product string) int { return w.onHand[product] - w.reserved[product] }

func (w *Warehouse) reserve(product string, qty int) error { // order placed
	if w.available(product) < qty {
		return fmt.Errorf("%w: %d available, want %d", ErrInsufficientStock, w.available(product), qty)
	}
	w.reserved[product] += qty
	return nil
}

func (w *Warehouse) commit(product string, qty int) { // order shipped
	w.reserved[product] -= qty
	w.onHand[product] -= qty
}

func (w *Warehouse) release(product string, qty int) { // order cancelled or reservation expired
	w.reserved[product] -= qty
}`,

"A two-step transfer": `type TransferState int

const (
	InTransit TransferState = iota
	Received
	Cancelled
)

type Transfer struct {
	ID, Product, From, To string
	Qty                   int

	mu    sync.Mutex
	state TransferState
}

func (t *Transfer) markReceived() error {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.state != InTransit {
		return fmt.Errorf("transfer %s is not in transit", t.ID)
	}
	t.state = Received
	return nil
}

// InventoryManager gains: transfers sync.Map (transfer ID -> *Transfer)

func (m *InventoryManager) Ship(product, fromID, toID string, qty int) (*Transfer, error) {
	if err := m.RemoveStock(fromID, product, qty); err != nil { // leaves the source now
		return nil, err
	}
	t := &Transfer{ID: newID(), Product: product, From: fromID, To: toID, Qty: qty} // newID: random unique id
	m.transfers.Store(t.ID, t)
	return t, nil
}

func (m *InventoryManager) Receive(transferID string) error {
	v, ok := m.transfers.Load(transferID)
	if !ok {
		return fmt.Errorf("unknown transfer %s", transferID)
	}
	t := v.(*Transfer)
	if err := t.markReceived(); err != nil { // exactly once
		return err
	}
	return m.AddStock(t.To, t.Product, t.Qty) // arrives at the destination
}`,

"Single-product updates without explicit locks": `// Per-product atomic counters (no alerts, no transfers): a CAS loop instead of a lock.
type Stock struct {
	counts sync.Map // product -> *atomic.Int64
}

func (s *Stock) Remove(product string, qty int64) error {
	v, _ := s.counts.LoadOrStore(product, new(atomic.Int64))
	c := v.(*atomic.Int64)
	for {
		have := c.Load()
		if have < qty {
			return fmt.Errorf("%w: have %d, want %d", ErrInsufficientStock, have, qty)
		}
		if c.CompareAndSwap(have, have-qty) {
			return nil
		}
	}
}`,

"A stress test that checks invariants": `func TestConcurrentTransfersConserveStockAndNeverDeadlock(t *testing.T) {
	inv := NewInventoryManager([]string{"A", "B"})
	inv.AddStock("A", "widget", 1_000)
	inv.AddStock("B", "widget", 1_000)

	var wg sync.WaitGroup
	start := make(chan struct{})
	for i := 0; i < 8; i++ {
		from, to := "A", "B" // half A to B, half B to A: the deadlock-prone mix
		if i%2 == 1 {
			from, to = "B", "A"
		}
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			for j := 0; j < 1_000; j++ {
				_ = inv.Transfer("widget", from, to, 1) // ErrInsufficientStock is fine here
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
	case <-time.After(10 * time.Second): // a deadlock would time out here
		t.Fatal("transfers did not finish: deadlock?")
	}

	a, _ := inv.Quantity("A", "widget")
	b, _ := inv.Quantity("B", "widget")
	if a+b != 2_000 { // conserved
		t.Fatalf("total = %d, want 2000", a+b)
	}
}`,

"Inventory in one screen": `type Warehouse struct {
	mu                sync.Mutex
	stock, thresholds map[string]int
}

func (w *Warehouse) change(product string, delta int) (*LowStockAlert, error) // reject negative; detect crossing

type InventoryManager struct{ warehouses map[string]*Warehouse }

func (m *InventoryManager) AddStock(wh, product string, qty int) error    // lock one warehouse
func (m *InventoryManager) RemoveStock(wh, product string, qty int) error // lock one warehouse
func (m *InventoryManager) Transfer(product, from, to string, qty int) error // lock both in id order
func (m *InventoryManager) WarehousesWith(product string, qty int) []string
// alerts are collected under the lock and delivered after unlocking`
} };
