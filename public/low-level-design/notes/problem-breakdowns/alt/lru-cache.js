// Go versions of the LRU Cache code blocks, matched to the Java blocks by title. Imports are omitted.
window.ALT = window.ALT || {};
ALT["lru-cache"] = { go: {
"LRUCache": `type node[K comparable, V any] struct {
	key        K
	val        V
	prev, next *node[K, V]
}

type LRUCache[K comparable, V any] struct {
	mu         sync.Mutex
	capacity   int
	items      map[K]*node[K, V]
	head, tail *node[K, V] // sentinels
}

func NewLRUCache[K comparable, V any](capacity int) (*LRUCache[K, V], error) {
	if capacity <= 0 {
		return nil, errors.New("capacity must be positive")
	}
	c := &LRUCache[K, V]{capacity: capacity, items: make(map[K]*node[K, V]), head: &node[K, V]{}, tail: &node[K, V]{}}
	c.head.next, c.tail.prev = c.tail, c.head
	return c, nil
}

func (c *LRUCache[K, V]) Get(key K) (V, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	n, ok := c.items[key]
	if !ok {
		var zero V
		return zero, false
	}
	c.unlink(n)
	c.addFront(n)
	return n.val, true
}

func (c *LRUCache[K, V]) Put(key K, val V) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if n, ok := c.items[key]; ok {
		n.val = val
		c.unlink(n)
		c.addFront(n)
		return
	}
	if len(c.items) == c.capacity {
		lru := c.tail.prev // least recently used
		c.unlink(lru)
		delete(c.items, lru.key)
	}
	n := &node[K, V]{key: key, val: val}
	c.items[key] = n
	c.addFront(n)
}

func (c *LRUCache[K, V]) unlink(n *node[K, V]) { n.prev.next, n.next.prev = n.next, n.prev }

func (c *LRUCache[K, V]) addFront(n *node[K, V]) {
	n.next, n.prev = c.head.next, c.head
	c.head.next.prev = n
	c.head.next = n
}`,

"Expire lazily on get": `type node[K comparable, V any] struct {
	key        K
	val        V
	expiresAt  time.Time
	prev, next *node[K, V]
}

// LRUCache gains a field: now func() time.Time (an injected clock)

func (c *LRUCache[K, V]) Get(key K) (V, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	var zero V
	n, ok := c.items[key]
	if !ok {
		return zero, false
	}
	if c.now().After(n.expiresAt) { // expired: treat as a miss
		c.unlink(n)
		delete(c.items, key)
		return zero, false
	}
	c.unlink(n)
	c.addFront(n)
	return n.val, true
}

func (c *LRUCache[K, V]) Put(key K, val V, ttl time.Duration) {
	// as before, plus: n.expiresAt = c.now().Add(ttl)
}`,

"LFU cache": `type entry[K comparable, V any] struct {
	key  K
	val  V
	freq int
}

type LFUCache[K comparable, V any] struct {
	mu       sync.Mutex
	capacity int
	items    map[K]*list.Element // Value is *entry[K, V]
	byFreq   map[int]*list.List  // one list per frequency, oldest at the front
	minFreq  int
}

func NewLFUCache[K comparable, V any](capacity int) *LFUCache[K, V] {
	return &LFUCache[K, V]{capacity: capacity, items: map[K]*list.Element{}, byFreq: map[int]*list.List{}}
}

func (c *LFUCache[K, V]) Get(key K) (V, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	el, ok := c.items[key]
	if !ok {
		var zero V
		return zero, false
	}
	e := el.Value.(*entry[K, V])
	c.touch(el)
	return e.val, true
}

func (c *LFUCache[K, V]) Put(key K, val V) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.capacity <= 0 {
		return
	}
	if el, ok := c.items[key]; ok {
		el.Value.(*entry[K, V]).val = val
		c.touch(el)
		return
	}
	if len(c.items) == c.capacity {
		oldest := c.byFreq[c.minFreq].Front() // least frequent, then least recent
		c.byFreq[c.minFreq].Remove(oldest)
		delete(c.items, oldest.Value.(*entry[K, V]).key)
	}
	c.items[key] = c.list(1).PushBack(&entry[K, V]{key: key, val: val, freq: 1})
	c.minFreq = 1
}

func (c *LFUCache[K, V]) touch(el *list.Element) {
	e := el.Value.(*entry[K, V])
	old := c.byFreq[e.freq]
	old.Remove(el)
	if e.freq == c.minFreq && old.Len() == 0 {
		c.minFreq++
	}
	e.freq++
	c.items[e.key] = c.list(e.freq).PushBack(e)
}

func (c *LFUCache[K, V]) list(freq int) *list.List {
	l, ok := c.byFreq[freq]
	if !ok {
		l = list.New()
		c.byFreq[freq] = l
	}
	return l
}`,

"Striping in a few lines": `type StripedLRU[K comparable, V any] struct {
	segments []*LRUCache[K, V]
	hash     func(K) uint64 // for string keys: maphash.String with a fixed maphash.Seed
}

func NewStripedLRU[K comparable, V any](capacity, stripes int, hash func(K) uint64) *StripedLRU[K, V] {
	s := &StripedLRU[K, V]{segments: make([]*LRUCache[K, V], stripes), hash: hash}
	for i := range s.segments {
		s.segments[i], _ = NewLRUCache[K, V](max(1, capacity/stripes))
	}
	return s
}

func (s *StripedLRU[K, V]) seg(key K) *LRUCache[K, V] {
	return s.segments[s.hash(key)%uint64(len(s.segments))]
}

func (s *StripedLRU[K, V]) Get(key K) (V, bool) { return s.seg(key).Get(key) }
func (s *StripedLRU[K, V]) Put(key K, val V)    { s.seg(key).Put(key, val) }`,

"LinkedHashMap version": `// Go has no LinkedHashMap; container/list plus a map is the standard-library shortcut.
type pair[K comparable, V any] struct {
	key K
	val V
}

type LRU[K comparable, V any] struct {
	capacity int
	order    *list.List // front = most recent; each Value is a pair
	items    map[K]*list.Element
}

func (c *LRU[K, V]) Get(key K) (V, bool) {
	if el, ok := c.items[key]; ok {
		c.order.MoveToFront(el)
		return el.Value.(pair[K, V]).val, true
	}
	var zero V
	return zero, false
}

func (c *LRU[K, V]) Put(key K, val V) {
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
}`
} };
