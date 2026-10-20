// Go versions of chapter 3's code blocks, matched to the Java blocks by title. Imports are omitted.
window.ALT = window.ALT || {};
ALT["ch3"] = { go: {
"An async logger with a bounded queue": `type AsyncLogger struct {
	queue   chan string // the bounded queue
	dropped atomic.Int64
	sink    LogSink
	done    chan struct{}
}

func NewAsyncLogger(sink LogSink) *AsyncLogger {
	l := &AsyncLogger{queue: make(chan string, 10_000), sink: sink, done: make(chan struct{})}
	go l.drain() // one writer goroutine
	return l
}

func (l *AsyncLogger) Log(line string) {
	select {
	case l.queue <- line:
	default:
		l.dropped.Add(1) // never block a request goroutine
	}
}

func (l *AsyncLogger) drain() {
	defer close(l.done)
	batch := make([]string, 0, 500)
	for line := range l.queue { // ends once the channel is closed and empty
		batch = append(batch, line)
	fill:
		for len(batch) < 500 { // write in batches of up to 500
			select {
			case more, ok := <-l.queue:
				if !ok {
					break fill
				}
				batch = append(batch, more)
			default:
				break fill
			}
		}
		l.sink.Write(batch)
		batch = batch[:0]
	}
}

// Close stops accepting lines and waits for the backlog to be written. Don't call Log after Close.
func (l *AsyncLogger) Close() {
	close(l.queue)
	<-l.done
}`,

"A one-slot mailbox with wait / notifyAll": `// In Go, a one-slot mailbox is just a channel with a buffer of one:
mailbox := make(chan Item, 1)
mailbox <- item  // put: blocks while the slot is full
got := <-mailbox // take: blocks while the slot is empty

// The hand-written equivalent of wait/notifyAll uses sync.Cond:
type Mailbox[T any] struct {
	mu   sync.Mutex
	cond *sync.Cond // sync.NewCond(&m.mu)
	item *T         // guarded by mu
}

func (m *Mailbox[T]) Put(v T) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for m.item != nil { // ALWAYS a loop
		m.cond.Wait()
	}
	m.item = &v
	m.cond.Broadcast() // wake takers (and other putters, who recheck)
}

func (m *Mailbox[T]) Take() T {
	m.mu.Lock()
	defer m.mu.Unlock()
	for m.item == nil {
		m.cond.Wait()
	}
	v := *m.item
	m.item = nil
	m.cond.Broadcast()
	return v
}`,

"Checkout: three lookups in parallel, then combine": `ctx, cancel := context.WithTimeout(ctx, 500*time.Millisecond)
defer cancel()

g, ctx := errgroup.WithContext(ctx) // golang.org/x/sync/errgroup
var quote Quote
var address Address
g.Go(func() error { // cart, then the quote that depends on it
	cart, err := carts.Load(ctx, userID)
	if err != nil {
		return err
	}
	quote, err = pricing.Quote(ctx, cart)
	return err
})
g.Go(func() error { // in parallel with the cart and quote
	var err error
	address, err = profiles.Address(ctx, userID)
	return err
})
if err := g.Wait(); err != nil { // the first error (or the timeout) cancels the rest
	return Checkout{}, err
}
return NewCheckout(quote, address), nil`,

"A race-condition test with a start latch": `func TestNeverDoubleBooks(t *testing.T) {
	show := NewShow()
	const workers = 32
	start := make(chan struct{}) // closing it releases everyone at once
	var winners atomic.Int64
	var wg sync.WaitGroup
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			if show.Book("A1", fmt.Sprint("u", i)) {
				winners.Add(1)
			}
		}()
	}
	close(start)
	wg.Wait()
	if got := winners.Load(); got != 1 {
		t.Fatalf("winners = %d, want 1", got)
	}
}
// Run with go test -race to catch unsynchronized access too.`,

"Keyed lanes": `type KeyedExecutor struct {
	lanes []chan func()
}

func NewKeyedExecutor(n int) *KeyedExecutor {
	k := &KeyedExecutor{lanes: make([]chan func(), n)}
	for i := range k.lanes {
		k.lanes[i] = make(chan func(), 256)
		go func(lane <-chan func()) { // one goroutine per lane: tasks run in order
			for task := range lane {
				task()
			}
		}(k.lanes[i])
	}
	return k
}

func (k *KeyedExecutor) Submit(key string, task func()) {
	h := fnv.New32a()
	h.Write([]byte(key))
	k.lanes[h.Sum32()%uint32(len(k.lanes))] <- task
}`,

"Seat holds that expire safely": `func (s *Service) Hold(seat *Seat, userID string) (Hold, error) {
	if !seat.TryHold(userID) {
		return Hold{}, ErrSeatUnavailable
	}
	h := Hold{ID: newID(), Seat: seat, UserID: userID} // newID: a random unique id
	time.AfterFunc(10*time.Minute, func() { seat.ReleaseIfHeldBy(h.ID) })
	return h, nil
}
// ReleaseIfHeldBy must be conditional (CAS or the seat's lock): if the user has
// already paid, the seat is Booked and the timer must leave it alone.`,

"Bounded buffer by hand (ReentrantLock + two conditions)": `// Idiomatic Go: a buffered channel IS a bounded buffer.
buf := make(chan Item, capacity)
buf <- item  // put: blocks while full
got := <-buf // take: blocks while empty

// By hand, with one mutex and two condition variables:
type BoundedBuffer[T any] struct {
	mu       sync.Mutex
	notFull  *sync.Cond // sync.NewCond(&b.mu)
	notEmpty *sync.Cond // sync.NewCond(&b.mu)
	items    []T
	capacity int
}

func (b *BoundedBuffer[T]) Put(item T) {
	b.mu.Lock()
	defer b.mu.Unlock()
	for len(b.items) == b.capacity {
		b.notFull.Wait()
	}
	b.items = append(b.items, item)
	b.notEmpty.Signal()
}

func (b *BoundedBuffer[T]) Take() T {
	b.mu.Lock()
	defer b.mu.Unlock()
	for len(b.items) == 0 {
		b.notEmpty.Wait()
	}
	item := b.items[0]
	b.items = b.items[1:]
	b.notFull.Signal()
	return item
}`,

"Fan out, combine, time out": `ctx, cancel := context.WithTimeout(ctx, 300*time.Millisecond)
defer cancel()

var price Price
var stock Stock
g, ctx := errgroup.WithContext(ctx)
g.Go(func() (err error) { price, err = pricing.Quote(ctx, item); return })
g.Go(func() (err error) { stock, err = inventory.Check(ctx, item); return })

if err := g.Wait(); err != nil { // either call failed or 300 ms passed
	return OfferUnavailable(item)
}
return NewOffer(price, stock)`
} };
