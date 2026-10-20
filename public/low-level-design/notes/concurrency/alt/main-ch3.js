// Go versions of the Main tab's code blocks for chapter 3, matched to the Java blocks by title. Imports are omitted.
window.ALT = window.ALT || {};
ALT.ch3 = ALT.ch3 || {};
ALT.ch3.go = Object.assign(ALT.ch3.go || {}, {
"Notification dispatcher with a bounded queue": `type Notification struct{ UserID, Text string }

type Dispatcher struct {
	queue    chan Notification // buffered channel: the bounded queue
	rejected atomic.Int64
	wg       sync.WaitGroup
}

func NewDispatcher(n int, send func(Notification)) *Dispatcher {
	d := &Dispatcher{queue: make(chan Notification, 1000)}
	for i := 0; i < n; i++ {
		d.wg.Add(1)
		go func() {
			defer d.wg.Done()
			for note := range d.queue { // ends once the channel is closed and drained
				send(note)
			}
		}()
	}
	return d
}

func (d *Dispatcher) Submit(n Notification) bool {
	select {
	case d.queue <- n:
		return true
	case <-time.After(50 * time.Millisecond):
		d.rejected.Add(1) // caller retries or drops
		return false
	}
}

// Shutdown is called once, after the last Submit. Closing the channel replaces poison pills.
func (d *Dispatcher) Shutdown() {
	close(d.queue)
	d.wg.Wait()
}`,

"A one-shot gate with wait and notifyAll": `// In Go, closing a channel is the idiomatic one-shot gate: every receiver wakes,
// now and in the future. sync.Once makes Open safe to call more than once.
type Gate struct {
	ch   chan struct{}
	once sync.Once
}

func NewGate() *Gate { return &Gate{ch: make(chan struct{})} }

func (g *Gate) Open() { g.once.Do(func() { close(g.ch) }) }

func (g *Gate) Await() { <-g.ch }

func (g *Gate) AwaitTimeout(d time.Duration) bool {
	select {
	case <-g.ch:
		return true
	case <-time.After(d):
		return false // timed out, still closed
	}
}`,
});
