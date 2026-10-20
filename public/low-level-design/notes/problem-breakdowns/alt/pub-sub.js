// Go versions of the Pub-Sub code blocks, matched to the Java blocks by title. Imports are omitted.
window.ALT = window.ALT || {};
ALT["pub-sub"] = { go: {
"Public API": `func (b *Broker) Subscribe(topic string, s Subscriber)
func (b *Broker) Unsubscribe(topic string, s Subscriber)
func (b *Broker) Publish(topic, message string) // returns immediately
func (b *Broker) Shutdown()`,

"Broker": `type Subscriber interface {
	ID() string
	OnMessage(topic, message string)
}

type delivery struct{ topic, message string }

type Broker struct {
	mu      sync.RWMutex
	topics  map[string]map[string]Subscriber // topic -> subscriber ID -> subscriber
	queues  map[string]chan delivery         // subscriber ID -> its queue
	dropped atomic.Int64
	wg      sync.WaitGroup
}

func NewBroker() *Broker {
	return &Broker{topics: map[string]map[string]Subscriber{}, queues: map[string]chan delivery{}}
}

func (b *Broker) Subscribe(topic string, s Subscriber) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if _, ok := b.queues[s.ID()]; !ok { // one goroutine per subscriber: in-order delivery
		q := make(chan delivery, 1024)
		b.queues[s.ID()] = q
		b.wg.Add(1)
		go b.run(s, q)
	}
	if b.topics[topic] == nil {
		b.topics[topic] = map[string]Subscriber{}
	}
	b.topics[topic][s.ID()] = s
}

func (b *Broker) Unsubscribe(topic string, s Subscriber) {
	b.mu.Lock()
	defer b.mu.Unlock()
	delete(b.topics[topic], s.ID())
}

func (b *Broker) Publish(topic, message string) {
	b.mu.RLock()
	defer b.mu.RUnlock()
	for id := range b.topics[topic] {
		select {
		case b.queues[id] <- delivery{topic, message}:
		default:
			b.dropped.Add(1) // full (or shut down): never block the publisher; see Deep Dives for policies
		}
	}
}

func (b *Broker) run(s Subscriber, q <-chan delivery) {
	defer b.wg.Done()
	for d := range q {
		func() {
			defer func() { recover() }() // log and continue: one bad subscriber must not affect the others
			s.OnMessage(d.topic, d.message)
		}()
	}
}

// Shutdown closes every queue and waits until each subscriber has drained its backlog.
func (b *Broker) Shutdown() {
	b.mu.Lock()
	for _, q := range b.queues {
		close(q)
	}
	b.queues = map[string]chan delivery{}
	b.mu.Unlock()
	b.wg.Wait()
}`,

"One bounded worker per subscriber": `// In Go the channel's buffer is the bound, and how you send decides the policy when it's full.
type FullPolicy int

const (
	Block      FullPolicy = iota // backpressure: the publisher waits
	DropOldest                   // newest data wins
	Reject                       // the caller learns immediately
)

func enqueue(q chan delivery, d delivery, p FullPolicy) bool {
	switch p {
	case Block:
		q <- d
		return true
	case DropOldest:
		for {
			select {
			case q <- d:
				return true
			default:
				select {
				case <-q: // discard the oldest, then try again
				default:
				}
			}
		}
	default:
		select {
		case q <- d:
			return true
		default:
			return false
		}
	}
}`,

"Retry with backoff, then park the message": `type Delivery struct {
	Sub     Subscriber
	Topic   string
	Message string
	Attempt int
}

const maxAttempts = 5

// handle runs on the subscriber's goroutine.
func (b *Broker) handle(d Delivery) {
	if err := call(d.Sub, d.Topic, d.Message); err == nil {
		return
	}
	if d.Attempt+1 >= maxAttempts {
		b.deadLetters <- d // park it for inspection or replay
		return
	}
	backoff := time.Duration(100<<d.Attempt) * time.Millisecond
	delay := backoff/2 + rand.N(backoff) // exponential backoff with jitter (math/rand/v2)
	d.Attempt++
	time.AfterFunc(delay, func() { b.enqueue(d) }) // retry later without blocking this goroutine
}

// call turns a subscriber panic into an error.
func call(s Subscriber, topic, message string) (err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("subscriber %s panicked: %v", s.ID(), r)
		}
	}()
	s.OnMessage(topic, message)
	return nil
}`,

"A minimal in-memory log": `type TopicLog struct {
	mu       sync.RWMutex
	messages []string
}

func (l *TopicLog) Append(m string) {
	l.mu.Lock()
	l.messages = append(l.messages, m)
	l.mu.Unlock()
}

func (l *TopicLog) ReadFrom(offset, limit int) []string {
	l.mu.RLock()
	defer l.mu.RUnlock()
	end := min(len(l.messages), offset+limit)
	if offset >= end {
		return nil
	}
	return slices.Clone(l.messages[offset:end])
}

// Each subscriber: offset := 0; loop { batch := log.ReadFrom(offset, 100); handle(batch); offset += len(batch) }`,

"Bounded per-subscriber executor": `q := make(chan delivery, 1_000) // at most 1,000 pending messages
ok := enqueue(q, d, DropOldest) // drop the oldest when full (see Deep Dives for the policies)`
} };
