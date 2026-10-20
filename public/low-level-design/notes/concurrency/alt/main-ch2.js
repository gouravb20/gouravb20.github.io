// Go versions of the Main tab's code blocks for chapter 2, matched to the Java blocks by title. Imports are omitted.
window.ALT = window.ALT || {};
ALT.ch2 = ALT.ch2 || {};
ALT.ch2.go = Object.assign(ALT.ch2.go || {}, {
"Flash-sale stock with a CAS loop per SKU": `type Inventory struct {
	mu    sync.RWMutex             // guards the map itself
	stock map[string]*atomic.Int64 // each count is updated atomically
}

func NewInventory() *Inventory { return &Inventory{stock: map[string]*atomic.Int64{}} }

func (inv *Inventory) Restock(sku string, qty int64) {
	if qty <= 0 {
		panic("qty must be positive")
	}
	inv.mu.Lock()
	c, ok := inv.stock[sku]
	if !ok {
		c = new(atomic.Int64)
		inv.stock[sku] = c
	}
	inv.mu.Unlock()
	c.Add(qty)
}

func (inv *Inventory) Reserve(sku string, qty int64) bool {
	inv.mu.RLock()
	c, ok := inv.stock[sku]
	inv.mu.RUnlock()
	if !ok || qty <= 0 {
		return false
	}
	for {
		have := c.Load()
		if have < qty {
			return false // not enough: nothing changed
		}
		if c.CompareAndSwap(have, have-qty) {
			return true
		} // another buyer changed the count: retry with the new value
	}
}`,

"Holds and availability under one lock": `type SkuStock struct {
	mu          sync.Mutex // guards both fields below
	available   int
	heldByOrder map[string]int
}

func NewSkuStock(available int) *SkuStock {
	return &SkuStock{available: available, heldByOrder: map[string]int{}}
}

func (s *SkuStock) Hold(orderID string, qty int) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, dup := s.heldByOrder[orderID]; dup || qty <= 0 || qty > s.available {
		return false
	}
	s.available -= qty
	s.heldByOrder[orderID] = qty
	return true
}

func (s *SkuStock) Release(orderID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if qty, ok := s.heldByOrder[orderID]; ok { // a second release does nothing
		delete(s.heldByOrder, orderID)
		s.available += qty
	}
}

func (s *SkuStock) Available() int {
	s.mu.Lock() // reads take the lock too
	defer s.mu.Unlock()
	return s.available
}`,
});
