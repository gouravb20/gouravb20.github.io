// Go versions of the LRU Cache code blocks, matched to the Java blocks by title. Imports are omitted.
window.ALT = window.ALT || {};
ALT["lru-cache"] = { go: {
"LinkedHashMap shortcut": `// Go has no LinkedHashMap; container/list plus a map is the standard-library shortcut.
type pair[K comparable, V any] struct {
	key K
	val V
}

type LinkedLRU[K comparable, V any] struct {
	mu       sync.Mutex // Get reorders the list, so reads take it too
	capacity int
	order    *list.List // front = most recent; each Value is a pair
	items    map[K]*list.Element
}

func NewLinkedLRU[K comparable, V any](capacity int) (*LinkedLRU[K, V], error) {
	if capacity <= 0 {
		return nil, errors.New("capacity must be positive")
	}
	return &LinkedLRU[K, V]{capacity: capacity, order: list.New(), items: make(map[K]*list.Element)}, nil
}

func (c *LinkedLRU[K, V]) Get(key K) (V, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if el, ok := c.items[key]; ok {
		c.order.MoveToFront(el)
		return el.Value.(pair[K, V]).val, true
	}
	var zero V
	return zero, false
}

func (c *LinkedLRU[K, V]) Put(key K, val V) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if el, ok := c.items[key]; ok {
		el.Value = pair[K, V]{key, val}
		c.order.MoveToFront(el)
		return
	}
	if c.order.Len() == c.capacity {
		oldest := c.order.Back()
		c.order.Remove(oldest)
		delete(c.items, oldest.Value.(pair[K, V]).key)
	}
	c.items[key] = c.order.PushFront(pair[K, V]{key, val})
}`,

"Final class design": `type LRUCache[K comparable, V any] struct {
	mu       sync.Mutex              // guards items and list together
	capacity int                     // fixed, at least 1
	items    map[K]*Node[K, V]       // key to node: O(1) lookup
	list     *DoublyLinkedList[K, V] // recency order: most recent first
}

func NewLRUCache[K comparable, V any](capacity int) (*LRUCache[K, V], error) // error if capacity < 1
func (c *LRUCache[K, V]) Get(key K) (V, bool)                                 // false on a miss; a hit becomes most recent
func (c *LRUCache[K, V]) Put(key K, value V)                                  // insert or update; evicts the LRU entry when full
func (c *LRUCache[K, V]) Remove(key K) bool                                   // false if absent
func (c *LRUCache[K, V]) Size() int

type DoublyLinkedList[K comparable, V any] struct { // no lock: used only under LRUCache's mutex
	head, tail *Node[K, V] // sentinels, always present
}

func (l *DoublyLinkedList[K, V]) AddFirst(n *Node[K, V])
func (l *DoublyLinkedList[K, V]) Remove(n *Node[K, V])
func (l *DoublyLinkedList[K, V]) MoveToFront(n *Node[K, V])
func (l *DoublyLinkedList[K, V]) RemoveLast() *Node[K, V] // nil if empty

type Node[K comparable, V any] struct {
	key        K // eviction needs it to delete from the map
	value      V
	prev, next *Node[K, V]
}`,

"Node and DoublyLinkedList": `type Node[K comparable, V any] struct {
	key        K // eviction finds the node through the list, then needs the key to delete it from the map
	value      V
	prev, next *Node[K, V]
}

// DoublyLinkedList keeps recency order: most recent right after head, least recent right before tail.
// Not safe for concurrent use on purpose: only LRUCache calls it, while holding its mutex.
type DoublyLinkedList[K comparable, V any] struct {
	head, tail *Node[K, V] // sentinels
}

func NewDoublyLinkedList[K comparable, V any]() *DoublyLinkedList[K, V] {
	l := &DoublyLinkedList[K, V]{head: &Node[K, V]{}, tail: &Node[K, V]{}}
	l.head.next = l.tail
	l.tail.prev = l.head
	return l
}

func (l *DoublyLinkedList[K, V]) AddFirst(n *Node[K, V]) {
	n.prev = l.head
	n.next = l.head.next
	l.head.next.prev = n
	l.head.next = n
}

func (l *DoublyLinkedList[K, V]) Remove(n *Node[K, V]) {
	n.prev.next = n.next
	n.next.prev = n.prev
	n.prev, n.next = nil, nil
}

func (l *DoublyLinkedList[K, V]) MoveToFront(n *Node[K, V]) {
	l.Remove(n)
	l.AddFirst(n)
}

// RemoveLast unlinks and returns the least recently used node, or nil if the list is empty.
func (l *DoublyLinkedList[K, V]) RemoveLast() *Node[K, V] {
	if l.tail.prev == l.head {
		return nil
	}
	last := l.tail.prev
	l.Remove(last)
	return last
}`,

"LRUCache": `type LRUCache[K comparable, V any] struct {
	// mu guards items and list. Every key in the map has exactly one node in the list and
	// vice versa, so the two must always change together under the same lock.
	mu       sync.Mutex
	capacity int
	items    map[K]*Node[K, V]
	list     *DoublyLinkedList[K, V]
}

func NewLRUCache[K comparable, V any](capacity int) (*LRUCache[K, V], error) {
	if capacity <= 0 {
		return nil, errors.New("capacity must be positive")
	}
	return &LRUCache[K, V]{capacity: capacity, items: make(map[K]*Node[K, V]), list: NewDoublyLinkedList[K, V]()}, nil
}

// Get reports a miss with false. A hit becomes the most recently used, so it changes the list.
func (c *LRUCache[K, V]) Get(key K) (V, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	n, ok := c.items[key]
	if !ok {
		var zero V
		return zero, false
	}
	c.list.MoveToFront(n)
	return n.value, true
}

func (c *LRUCache[K, V]) Put(key K, value V) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if n, ok := c.items[key]; ok { // existing key: update and move, never evict
		n.value = value
		c.list.MoveToFront(n)
		return
	}
	if len(c.items) == c.capacity { // full: make room first, so size never exceeds capacity
		lru := c.list.RemoveLast()
		delete(c.items, lru.key)
	}
	n := &Node[K, V]{key: key, value: value}
	c.list.AddFirst(n)
	c.items[key] = n
}

func (c *LRUCache[K, V]) Remove(key K) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	n, ok := c.items[key]
	if !ok {
		return false
	}
	delete(c.items, key)
	c.list.Remove(n)
	return true
}

func (c *LRUCache[K, V]) Size() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.items)
}`,

"LRU cache in one screen": `// items: key -> node (O(1) lookup); list: head <-> most recent ... least recent <-> tail
type LRUCache[K comparable, V any] struct {
	mu       sync.Mutex              // guards items and list together; Get takes it too
	capacity int                     // at least 1, checked in NewLRUCache
	items    map[K]*Node[K, V]
	list     *DoublyLinkedList[K, V] // no lock of its own
}

func (c *LRUCache[K, V]) Get(key K) (V, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	n, ok := c.items[key]
	if !ok {
		var zero V
		return zero, false
	}
	c.list.MoveToFront(n) // a read is a write
	return n.value, true
}

func (c *LRUCache[K, V]) Put(key K, value V) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if n, ok := c.items[key]; ok { // update: never evict
		n.value = value
		c.list.MoveToFront(n)
		return
	}
	if len(c.items) == c.capacity { // evict before insert
		delete(c.items, c.list.RemoveLast().key)
	}
	n := &Node[K, V]{key: key, value: value}
	c.list.AddFirst(n)
	c.items[key] = n
}

// Node keeps its key for eviction. Sentinel head and tail remove every nil check.`,

"TTL: expire lazily on get": `// Node gains one field; DoublyLinkedList does not change.
type Node[K comparable, V any] struct {
	key        K
	value      V
	expiresAt  time.Time
	prev, next *Node[K, V]
}

// LRUCache gains a field: now func() time.Time, an injected clock so tests can move time forward.

func (c *LRUCache[K, V]) Get(key K) (V, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	var zero V
	n, ok := c.items[key]
	if !ok {
		return zero, false
	}
	if !c.now().Before(n.expiresAt) { // expired: drop it and report a miss
		c.list.Remove(n)
		delete(c.items, key)
		return zero, false
	}
	c.list.MoveToFront(n)
	return n.value, true
}

func (c *LRUCache[K, V]) PutWithTTL(key K, value V, ttl time.Duration) {
	// the same as Put(key, value), plus: n.expiresAt = c.now().Add(ttl)
}`,

"Pluggable eviction policy": `// EvictionPolicy decides which key leaves when the cache is full.
// Not safe for concurrent use: PolicyCache calls it only while holding its own mutex.
type EvictionPolicy[K comparable] interface {
	KeyAdded(key K)
	KeyAccessed(key K) // a get hit or an update
	KeyRemoved(key K)  // an explicit remove
	Evict() (K, bool)  // choose a victim, forget it and return it; false if empty
}

type PolicyCache[K comparable, V any] struct {
	mu       sync.Mutex // guards values and policy together
	capacity int
	policy   EvictionPolicy[K] // one instance per cache, never shared
	values   map[K]V
}

func NewPolicyCache[K comparable, V any](capacity int, policy EvictionPolicy[K]) (*PolicyCache[K, V], error) {
	if capacity <= 0 {
		return nil, errors.New("capacity must be positive")
	}
	return &PolicyCache[K, V]{capacity: capacity, policy: policy, values: make(map[K]V)}, nil
}

func (c *PolicyCache[K, V]) Get(key K) (V, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	v, ok := c.values[key]
	if ok {
		c.policy.KeyAccessed(key)
	}
	return v, ok
}

func (c *PolicyCache[K, V]) Put(key K, value V) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if _, ok := c.values[key]; ok {
		c.values[key] = value
		c.policy.KeyAccessed(key)
		return
	}
	if len(c.values) == c.capacity {
		if victim, ok := c.policy.Evict(); ok {
			delete(c.values, victim)
		}
	}
	c.values[key] = value
	c.policy.KeyAdded(key)
}

func (c *PolicyCache[K, V]) Remove(key K) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	if _, ok := c.values[key]; !ok {
		return false
	}
	delete(c.values, key)
	c.policy.KeyRemoved(key)
	return true
}

// LRUPolicy is the solution's DoublyLinkedList plus a map[K]*Node, holding keys instead of values.`,

"LFU as an EvictionPolicy": `// LFUPolicy evicts the least frequently used key; ties go to the least recently used key with that count.
// Every method is O(1).
type LFUPolicy[K comparable] struct {
	freq   map[K]int
	elems  map[K]*list.Element // where each key sits in its count's list
	byFreq map[int]*list.List  // keys per count, least recent at the front
	// minFreq may be stale after KeyRemoved or Evict. Harmless: both leave the cache below
	// capacity, so KeyAdded (which resets it to 1) always runs before the next Evict.
	minFreq int
}

func NewLFUPolicy[K comparable]() *LFUPolicy[K] {
	return &LFUPolicy[K]{freq: make(map[K]int), elems: make(map[K]*list.Element), byFreq: make(map[int]*list.List)}
}

func (p *LFUPolicy[K]) KeyAdded(key K) {
	p.freq[key] = 1
	p.elems[key] = p.listFor(1).PushBack(key)
	p.minFreq = 1
}

func (p *LFUPolicy[K]) KeyAccessed(key K) {
	f := p.freq[key]
	p.freq[key] = f + 1
	p.unlink(f, key)
	if _, ok := p.byFreq[f]; f == p.minFreq && !ok {
		p.minFreq = f + 1
	}
	p.elems[key] = p.listFor(f + 1).PushBack(key)
}

func (p *LFUPolicy[K]) KeyRemoved(key K) {
	if f, ok := p.freq[key]; ok {
		delete(p.freq, key)
		p.unlink(f, key)
	}
}

func (p *LFUPolicy[K]) Evict() (K, bool) {
	l, ok := p.byFreq[p.minFreq]
	if !ok {
		var zero K
		return zero, false
	}
	victim := l.Front().Value.(K)
	delete(p.freq, victim)
	p.unlink(p.minFreq, victim)
	return victim, true
}

func (p *LFUPolicy[K]) unlink(f int, key K) {
	l := p.byFreq[f]
	l.Remove(p.elems[key])
	delete(p.elems, key)
	if l.Len() == 0 {
		delete(p.byFreq, f)
	}
}

func (p *LFUPolicy[K]) listFor(f int) *list.List {
	l, ok := p.byFreq[f]
	if !ok {
		l = list.New()
		p.byFreq[f] = l
	}
	return l
}`,

"Striped cache": `// StripedLRU is N independent LRU caches, each behind its own mutex.
// stripes and hash never change after construction, so reading them needs no lock.
type StripedLRU[K comparable, V any] struct {
	stripes []*LRUCache[K, V]
	hash    func(K) uint64 // for string keys: maphash.String with a fixed maphash.Seed
}

func NewStripedLRU[K comparable, V any](capacity, stripeCount int, hash func(K) uint64) (*StripedLRU[K, V], error) {
	perStripe := max(1, capacity/stripeCount)
	s := &StripedLRU[K, V]{stripes: make([]*LRUCache[K, V], stripeCount), hash: hash}
	for i := range s.stripes {
		c, err := NewLRUCache[K, V](perStripe)
		if err != nil {
			return nil, err
		}
		s.stripes[i] = c
	}
	return s, nil
}

func (s *StripedLRU[K, V]) stripeFor(key K) *LRUCache[K, V] {
	return s.stripes[s.hash(key)%uint64(len(s.stripes))]
}

func (s *StripedLRU[K, V]) Get(key K) (V, bool)  { return s.stripeFor(key).Get(key) }
func (s *StripedLRU[K, V]) Put(key K, value V)   { s.stripeFor(key).Put(key, value) }
func (s *StripedLRU[K, V]) Remove(key K) bool    { return s.stripeFor(key).Remove(key) }`,

"Loading on a miss": `// call is one load in progress; waiters block on wg and then read val and err.
type call[V any] struct {
	wg  sync.WaitGroup
	val V
	err error
}

// LoadingCache loads missing keys through the cache. Concurrent misses for the same key share one load.
type LoadingCache[K comparable, V any] struct {
	cache    *LRUCache[K, V]
	load     func(K) (V, error) // e.g. a database read; may be slow
	mu       sync.Mutex         // guards inFlight only, never held during a load
	inFlight map[K]*call[V]
}

func NewLoadingCache[K comparable, V any](cache *LRUCache[K, V], load func(K) (V, error)) *LoadingCache[K, V] {
	return &LoadingCache[K, V]{cache: cache, load: load, inFlight: make(map[K]*call[V])}
}

func (l *LoadingCache[K, V]) Get(key K) (V, error) {
	if v, ok := l.cache.Get(key); ok {
		return v, nil
	}
	l.mu.Lock()
	if c, ok := l.inFlight[key]; ok { // someone else is loading it: wait for theirs
		l.mu.Unlock()
		c.wg.Wait()
		return c.val, c.err
	}
	c := &call[V]{}
	c.wg.Add(1)
	l.inFlight[key] = c
	l.mu.Unlock()

	c.val, c.err = l.load(key) // outside every lock
	if c.err == nil {
		l.cache.Put(key, c.val)
	}
	c.wg.Done() // waiters see the same value or the same error

	l.mu.Lock()
	delete(l.inFlight, key)
	l.mu.Unlock()
	return c.val, c.err
}`
} };
