// Go versions of the Pub-Sub code blocks, matched to the Java blocks by title. Imports are omitted.
window.ALT = window.ALT || {};
ALT["pub-sub"] = { go: {
"Message and Subscriber": `// Message is immutable once published. Seq numbers a topic's messages in publish order, starting at 1.
type Message struct {
	Topic       string
	Seq         int64
	Payload     string
	PublishedAt time.Time
}

// Subscriber is the Observer. OnMessage runs on the subscription's own goroutine, one message at a time.
type Subscriber interface {
	ID() string                // unique; identifies the subscriber across topics
	OnMessage(m Message) error // may be slow, may fail or panic
}

type SubscriptionStats struct {
	Delivered, Failed, Dropped int64
	Queued                     int
}`,

"Final class design": `type Broker struct { // injected; one per application or test
	mu            sync.RWMutex
	topics        map[string]*Topic // created on first Subscribe
	queueCapacity int
	open          bool
}

func NewBroker(queueCapacity int) (*Broker, error)
func (b *Broker) Subscribe(topic string, s Subscriber) (bool, error)
func (b *Broker) Unsubscribe(topic string, s Subscriber) bool
func (b *Broker) Publish(topic, payload string) (int, error) // never blocks; how many accepted it
func (b *Broker) Stats(topic string) map[string]SubscriptionStats
func (b *Broker) Shutdown(ctx context.Context) error

type Topic struct {
	name    string
	mu      sync.Mutex               // guards subs and nextSeq
	subs    map[string]*Subscription // subscriber ID -> subscription
	nextSeq int64
}

func (t *Topic) Add(s Subscriber, capacity int) bool
func (t *Topic) Remove(subscriberID string) bool
func (t *Topic) Broadcast(payload string) int // number it, offer it to everyone: one order
func (t *Topic) Close()
func (t *Topic) AwaitStopped(ctx context.Context) error

type Subscription struct { // one subscriber on one topic
	subscriber Subscriber
	queue      chan Message  // buffered: the bound
	stop       chan struct{} // closed by Cancel
	stopped    chan struct{} // closed when the worker goroutine exits
	mu         sync.Mutex    // guards closed and discarding
	closed     bool
	discarding bool

	delivered, failed, dropped atomic.Int64
}

func (s *Subscription) Offer(m Message) bool // publisher side; never blocks
func (s *Subscription) Start()
func (s *Subscription) Cancel() // unsubscribe: discard the backlog
func (s *Subscription) Finish() // shutdown: drain the backlog
func (s *Subscription) AwaitStopped(ctx context.Context) error
func (s *Subscription) Stats() SubscriptionStats`,

"Broker": `var (
	ErrClosed     = errors.New("broker is shut down")
	ErrBlankTopic = errors.New("topic must not be blank")
)

type Broker struct {
	mu            sync.RWMutex // guards topics and open
	topics        map[string]*Topic
	queueCapacity int
	open          bool
}

func NewBroker(queueCapacity int) (*Broker, error) {
	if queueCapacity < 1 {
		return nil, errors.New("queueCapacity must be at least 1")
	}
	return &Broker{topics: map[string]*Topic{}, queueCapacity: queueCapacity, open: true}, nil
}

// Subscribe creates the topic on first use. It reports false if s is already on the topic.
func (b *Broker) Subscribe(topic string, s Subscriber) (bool, error) {
	if strings.TrimSpace(topic) == "" {
		return false, ErrBlankTopic
	}
	b.mu.Lock() // exclusive, so a subscribe can't slip in after Shutdown has closed the others
	defer b.mu.Unlock()
	if !b.open {
		return false, ErrClosed
	}
	t, ok := b.topics[topic]
	if !ok {
		t = NewTopic(topic)
		b.topics[topic] = t
	}
	return t.Add(s, b.queueCapacity), nil
}

// Unsubscribe stops delivery to s on topic; messages still queued for it are discarded.
func (b *Broker) Unsubscribe(topic string, s Subscriber) bool {
	t := b.topic(topic)
	return t != nil && t.Remove(s.ID())
}

// Publish offers the message to every current subscriber and returns at once: how many accepted it.
func (b *Broker) Publish(topic, payload string) (int, error) {
	if strings.TrimSpace(topic) == "" {
		return 0, ErrBlankTopic
	}
	b.mu.RLock()
	open, t := b.open, b.topics[topic]
	b.mu.RUnlock()
	if !open {
		return 0, ErrClosed
	}
	if t == nil {
		return 0, nil // nobody has ever subscribed: nothing to do
	}
	return t.Broadcast(payload), nil
}

func (b *Broker) Stats(topic string) map[string]SubscriptionStats {
	if t := b.topic(topic); t != nil {
		return t.Stats()
	}
	return map[string]SubscriptionStats{}
}

// Shutdown stops accepting publishes, lets every worker drain its queue, and waits until ctx is done.
func (b *Broker) Shutdown(ctx context.Context) error {
	b.mu.Lock()
	b.open = false
	topics := slices.Collect(maps.Values(b.topics))
	for _, t := range topics {
		t.Close()
	}
	b.mu.Unlock() // don't hold the lock while waiting: a subscriber may call Publish meanwhile
	for _, t := range topics {
		if err := t.AwaitStopped(ctx); err != nil {
			return err
		}
	}
	return nil
}

func (b *Broker) topic(name string) *Topic {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return b.topics[name]
}`,

"Topic": `type Topic struct {
	name    string
	mu      sync.Mutex               // guards subs and nextSeq; held only for non-blocking sends
	subs    map[string]*Subscription // subscriber ID -> subscription
	nextSeq int64
}

func NewTopic(name string) *Topic { return &Topic{name: name, subs: map[string]*Subscription{}} }

func (t *Topic) Add(s Subscriber, capacity int) bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	if _, ok := t.subs[s.ID()]; ok {
		return false // already subscribed: no second goroutine
	}
	sub := NewSubscription(t.name, s, capacity)
	t.subs[s.ID()] = sub
	sub.Start()
	return true
}

func (t *Topic) Remove(subscriberID string) bool {
	t.mu.Lock()
	sub, ok := t.subs[subscriberID]
	delete(t.subs, subscriberID)
	t.mu.Unlock()
	if ok {
		sub.Cancel()
	}
	return ok
}

// Broadcast numbers the message and offers it to every subscription under one lock,
// so every subscriber sees this topic's messages in one order. Offer never blocks.
func (t *Topic) Broadcast(payload string) int {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.nextSeq++
	m := Message{Topic: t.name, Seq: t.nextSeq, Payload: payload, PublishedAt: time.Now()}
	accepted := 0
	for _, sub := range t.subs {
		if sub.Offer(m) {
			accepted++
		}
	}
	return accepted
}

// Close tells every subscription to drain its queue and stop.
func (t *Topic) Close() {
	t.mu.Lock()
	defer t.mu.Unlock()
	for _, sub := range t.subs {
		sub.Finish()
	}
}

func (t *Topic) AwaitStopped(ctx context.Context) error {
	t.mu.Lock()
	subs := slices.Collect(maps.Values(t.subs))
	t.mu.Unlock()
	for _, sub := range subs {
		if err := sub.AwaitStopped(ctx); err != nil {
			return err
		}
	}
	return nil
}

func (t *Topic) Stats() map[string]SubscriptionStats {
	t.mu.Lock()
	defer t.mu.Unlock()
	out := make(map[string]SubscriptionStats, len(t.subs))
	for id, sub := range t.subs {
		out[id] = sub.Stats()
	}
	return out
}`,

"Subscription": `type Subscription struct {
	topic      string
	subscriber Subscriber
	queue      chan Message  // buffered: the bound on pending messages
	stop       chan struct{} // closed by Cancel: abandon the backlog
	stopped    chan struct{} // closed when the worker goroutine exits

	mu         sync.Mutex // guards closed and discarding, so no send races with close(queue)
	closed     bool
	discarding bool

	delivered, failed, dropped atomic.Int64
}

func NewSubscription(topic string, s Subscriber, capacity int) *Subscription {
	return &Subscription{
		topic:      topic,
		subscriber: s,
		queue:      make(chan Message, capacity),
		stop:       make(chan struct{}),
		stopped:    make(chan struct{}),
	}
}

func (s *Subscription) Start() { go s.run() }

// Offer is called by publishers. It never blocks: a full queue drops m for this subscriber only.
func (s *Subscription) Offer(m Message) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return false
	}
	select {
	case s.queue <- m:
		return true
	default:
		s.dropped.Add(1)
		return false
	}
}

// Cancel is unsubscribe: the message being handled finishes; queued ones are discarded.
// It never waits for the worker, so OnMessage may call it.
func (s *Subscription) Cancel() { s.close(true) }

// Finish is shutdown: accept nothing new, deliver what is queued, then stop.
func (s *Subscription) Finish() { s.close(false) }

func (s *Subscription) close(discard bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if discard && !s.discarding {
		s.discarding = true
		close(s.stop)
	}
	if !s.closed {
		s.closed = true
		close(s.queue) // the worker drains what is left, then sees the channel closed
	}
}

func (s *Subscription) run() {
	defer close(s.stopped)
	for {
		select {
		case <-s.stop:
			return
		case m, ok := <-s.queue:
			if !ok {
				return // closed and drained
			}
			select {
			case <-s.stop: // select picks at random when both are ready: check again before delivering
				return
			default:
			}
			s.deliver(m)
		}
	}
}

func (s *Subscription) deliver(m Message) {
	defer func() {
		if r := recover(); r != nil { // a panicking subscriber must not kill its goroutine
			s.failed.Add(1)
			log.Printf("subscriber %s panicked on %s #%d: %v", s.subscriber.ID(), m.Topic, m.Seq, r)
		}
	}()
	if err := s.subscriber.OnMessage(m); err != nil {
		s.failed.Add(1)
		log.Printf("subscriber %s failed on %s #%d: %v", s.subscriber.ID(), m.Topic, m.Seq, err)
		return
	}
	s.delivered.Add(1)
}

func (s *Subscription) AwaitStopped(ctx context.Context) error {
	select {
	case <-s.stopped:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (s *Subscription) Stats() SubscriptionStats {
	return SubscriptionStats{s.delivered.Load(), s.failed.Load(), s.dropped.Load(), len(s.queue)}
}`,

"Pub-sub in one screen": `type Message struct {
	Topic   string
	Seq     int64
	Payload string
}

type Subscriber interface { // the Observer
	ID() string
	OnMessage(m Message) error
}

// Broker: injected, not a global. Topics are created on first Subscribe.
func (b *Broker) Subscribe(topic string, s Subscriber) (bool, error) // false if already subscribed
func (b *Broker) Unsubscribe(topic string, s Subscriber) bool        // that subscriber's backlog is discarded
func (b *Broker) Publish(topic, payload string) (int, error)        // never blocks; 0 if nobody subscribed
func (b *Broker) Shutdown(ctx context.Context) error                // stop accepting, drain, wait

// Topic.Broadcast: under the topic mutex, Seq++ and Offer to each subscription: one order for all.

type Subscription struct { // one subscriber on one topic
	queue chan Message  // buffered; full: drop and count (select with default)
	stop  chan struct{} // closed by Cancel: abandon the backlog
	// one goroutine reads queue and calls OnMessage, recovering panics: in order, isolated
	// Finish closes queue: the goroutine drains it and exits
}`,

"Keyed lanes: parallel, but ordered per key": `// Message gains a Key field (an order ID, a user ID); Broker and Topic only pass it through.
// Today's Subscription becomes a lane, unchanged, and KeyedSubscription spreads messages over several lanes.
type KeyedSubscription struct {
	lanes []*Subscription // each lane: one buffered channel, one goroutine
}

func NewKeyedSubscription(topic string, s Subscriber, laneCount, capacityPerLane int) *KeyedSubscription {
	k := &KeyedSubscription{}
	for i := range laneCount {
		k.lanes = append(k.lanes, NewSubscription(fmt.Sprintf("%s-%d", topic, i), s, capacityPerLane))
	}
	return k
}

func (k *KeyedSubscription) Offer(m Message) bool {
	h := fnv.New32a()
	h.Write([]byte(m.Key))
	return k.lanes[h.Sum32()%uint32(len(k.lanes))].Offer(m) // same key, same lane, same order
}

func (k *KeyedSubscription) Start() {
	for _, l := range k.lanes {
		l.Start()
	}
}

func (k *KeyedSubscription) Cancel() {
	for _, l := range k.lanes {
		l.Cancel()
	}
}

func (k *KeyedSubscription) Finish() {
	for _, l := range k.lanes {
		l.Finish()
	}
}

func (k *KeyedSubscription) AwaitStopped(ctx context.Context) error {
	for _, l := range k.lanes {
		if err := l.AwaitStopped(ctx); err != nil {
			return err
		}
	}
	return nil
}`,

"Retry with backoff, then dead-letter": `// Subscription gains two injected fields: retry RetryPolicy and deadLetters func(DeadLetter).
type RetryPolicy struct {
	MaxAttempts int
	FirstDelay  time.Duration
}

// delayBefore attempt 2, 3, 4...: 1x, 2x, 4x the first delay, with jitter (math/rand/v2).
func (p RetryPolicy) delayBefore(attempt int) time.Duration {
	base := p.FirstDelay << (attempt - 2)
	return base/2 + rand.N(base/2+1)
}

type DeadLetter struct {
	SubscriberID string
	Message      Message
	Err          error
	Attempts     int
}

func (s *Subscription) deliver(m Message) {
	for attempt := 1; ; attempt++ {
		err := s.call(m)
		if err == nil {
			s.delivered.Add(1)
			return
		}
		if attempt >= s.retry.MaxAttempts {
			s.failed.Add(1)
			s.deadLetters(DeadLetter{s.subscriber.ID(), m, err, attempt}) // e.g. publish to "dead-letters"
			return
		}
		select {
		case <-time.After(s.retry.delayBefore(attempt + 1)): // holds up only this subscription
		case <-s.stop: // unsubscribed meanwhile: give up quietly
			return
		}
	}
}

// call runs OnMessage and turns a panic into an error.
func (s *Subscription) call(m Message) (err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("subscriber %s panicked: %v", s.subscriber.ID(), r)
		}
	}()
	return s.subscriber.OnMessage(m)
}`,

"A durable topic log with cursors": `// The topic keeps every message instead of pushing and forgetting. The slice stands in for segment files on disk.
type TopicLog struct {
	mu       sync.Mutex
	topic    string
	messages []Message     // seq n is at index n-1
	changed  chan struct{} // closed and replaced on every append, to wake readers
}

func NewTopicLog(topic string) *TopicLog {
	return &TopicLog{topic: topic, changed: make(chan struct{})}
}

func (l *TopicLog) Append(payload string) Message {
	l.mu.Lock()
	defer l.mu.Unlock()
	m := Message{Topic: l.topic, Seq: int64(len(l.messages)) + 1, Payload: payload, PublishedAt: time.Now()}
	l.messages = append(l.messages, m)
	close(l.changed) // wake every reader waiting at the end
	l.changed = make(chan struct{})
	return m
}

// ReadFrom returns up to limit messages starting at seq from, waiting while there is nothing new.
func (l *TopicLog) ReadFrom(ctx context.Context, from int64, limit int) ([]Message, error) {
	for {
		l.mu.Lock()
		if from <= int64(len(l.messages)) {
			start := int(from - 1)
			batch := slices.Clone(l.messages[start:min(len(l.messages), start+limit)])
			l.mu.Unlock()
			return batch, nil
		}
		changed := l.changed
		l.mu.Unlock()
		select {
		case <-changed:
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
}

type OffsetStore interface { // durable too: a file, a table, a compacted topic
	Load(subscriberID string) (int64, bool)
	Save(subscriberID string, next int64)
}

// Cursor replaces the subscription's queue: its goroutine pulls from the log instead of being pushed to.
type Cursor struct {
	log        *TopicLog
	subscriber Subscriber
	offsets    OffsetStore
}

func (c *Cursor) Run(ctx context.Context) {
	next, ok := c.offsets.Load(c.subscriber.ID())
	if !ok {
		next = 1 // a new subscriber replays from the start
	}
	for {
		batch, err := c.log.ReadFrom(ctx, next, 100)
		if err != nil {
			return // stopped: the saved offset is where we resume
		}
		for _, m := range batch {
			c.deliverWithRetries(m)
			next = m.Seq + 1
			c.offsets.Save(c.subscriber.ID(), next) // commit after handling: at least once
		}
	}
}

func (c *Cursor) deliverWithRetries(m Message) { /* the loop from the retries follow-up */ }`,

"Filters and wildcard subscriptions": `// 1. Filters. Subscription gets a filter func(Message) bool; Offer checks it first. It runs on the
//    publisher's goroutine, with the topic mutex held, so it must be cheap and must not block.
func (s *Subscription) Offer(m Message) bool {
	if s.filter != nil && !s.filter(m) {
		return false
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return false
	}
	select {
	case s.queue <- m:
		return true
	default:
		s.dropped.Add(1)
		return false
	}
}

// 2. Wildcards. "orders.*" matches exactly one more segment; "orders.#" matches any number, including none.
type TopicPattern string

func (p TopicPattern) Matches(topic string) bool {
	ps, ts := strings.Split(string(p), "."), strings.Split(topic, ".")
	for i, seg := range ps {
		if seg == "#" {
			return true
		}
		if i >= len(ts) || (seg != "*" && seg != ts[i]) {
			return false
		}
	}
	return len(ps) == len(ts)
}

// Pattern subscriptions live in groups beside the exact topics. Broadcast is split into next, which
// numbers a message, and offerAll, so one message reaches both, under the exact topic's mutex.
func (b *Broker) Publish(topic, payload string) (int, error) {
	if strings.TrimSpace(topic) == "" {
		return 0, ErrBlankTopic
	}
	exact, groups, err := b.route(topic) // creates the topic if needed: it numbers the messages
	if err != nil {
		return 0, err
	}
	exact.mu.Lock()
	defer exact.mu.Unlock()
	m := exact.next(payload)
	accepted := exact.offerAll(m)
	for _, g := range groups {
		if g.pattern.Matches(topic) {
			accepted += g.offerAll(m)
		}
	}
	return accepted, nil
}`,

"Overflow policies as a strategy": `type OverflowPolicy interface {
	// OnFull is called when a non-blocking send failed. It reports whether m ended up queued.
	OnFull(q chan Message, m Message) bool
}

type DropNewest struct{} // the solution's behaviour: the new message is lost

func (DropNewest) OnFull(chan Message, Message) bool { return false }

type DropOldest struct{} // latest value wins: prices, presence, dashboards

func (DropOldest) OnFull(q chan Message, m Message) bool {
	for range 3 { // a few tries against racing publishers
		select {
		case <-q: // discard the oldest
		default:
		}
		select {
		case q <- m:
			return true
		default:
		}
	}
	return false
}

type BlockWithTimeout struct{ Max time.Duration } // backpressure: the publisher slows down, but not forever

func (p BlockWithTimeout) OnFull(q chan Message, m Message) bool {
	t := time.NewTimer(p.Max)
	defer t.Stop()
	select {
	case q <- m:
		return true
	case <-t.C:
		return false
	}
}

// Subscription.Offer: the fast path first, the policy only when full.
func (s *Subscription) Offer(m Message) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return false
	}
	select {
	case s.queue <- m:
		return true
	default:
	}
	if s.policy.OnFull(s.queue, m) {
		return true
	}
	s.dropped.Add(1)
	return false
}`,

"A notification service is just another subscriber": `// Nothing in Broker, Topic or Subscription changes. A new Subscriber turns domain events into per-channel messages.
type NotificationService struct {
	broker      *Broker
	limiter     RateLimiter // per user, e.g. the token bucket from the Rate Limiter problem
	preferences Preferences // user ID -> channels they opted into, quiet hours
	templates   Templates   // event type -> text
}

func (n *NotificationService) ID() string { return "notifications" }

func (n *NotificationService) OnMessage(m Message) error {
	e, err := ParseOrderEvent(m.Payload)
	if err != nil {
		return err // counted as a failure; the next event still arrives
	}
	if !n.limiter.Allow(e.UserID) {
		return nil // too many messages to this user: skip
	}
	text := n.templates.Render(m.Topic, e)
	for _, channel := range n.preferences.ChannelsFor(e.UserID) {
		n.broker.Publish("notify."+channel, e.UserID+"|"+text) // one topic per channel
	}
	return nil
}

// EmailSender subscribes to "notify.email", SmsSender to "notify.sms", PushSender to "notify.push".
// Each is its own subscription, so a slow SMS provider cannot delay email: the broker's isolation, reused.`
} };
