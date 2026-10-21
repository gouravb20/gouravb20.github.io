// LLD problem breakdown: Pub-Sub / Notification Broker. Format: Chapter in public/shared/notes.d.ts; shared helpers in data-part2.js.
// Imports are omitted in the code.
(function () {
const { levels, PRACTICE_TIP } = LLD_PROBLEMS_KIT;

window.DATA.chapters.push({
    id: `pub-sub`, part: 2, number: 8, difficulty: `medium`,
    title: `Pub-Sub / Notification Broker: the Observer pattern, asynchronously`,
    references: [{ title: `awesome-low-level-design: Pub-Sub System`, url: `https://github.com/ashishps1/awesome-low-level-design/blob/main/problems/pub-sub-system.md` }],
    overview: `Topics, subscribe and unsubscribe, and publish that delivers to every current subscriber. The catch is in the last requirement: a slow or failing subscriber must not block or break the others. The design is the <strong>Observer</strong> pattern with asynchronous delivery: each subscriber gets its own single-thread executor, so its messages arrive in order and a slow subscriber only delays itself, and exceptions are caught per delivery.`,
    problem: [
      { id: `requirements`, title: `What we are building`, kicker: `Requirements`, blocks: [
        { type: `list`, title: `Requirements`, items: [
          `Topics, subscribe and unsubscribe.`,
          `Publish delivers to every current subscriber of the topic.`,
          `A slow or failing subscriber must not block or break the others.`
        ] },
        { type: `callout`, tone: `tip`, html: PRACTICE_TIP }
      ] },
      { id: `clarifying`, title: `Questions worth asking`, kicker: `Clarifying`, blocks: [
        { type: `table`, headers: [`Ask`, `Assume`, `Decides`], rows: [
          [`In process or across machines?`, `In process`, `Executors, not a network broker`],
          [`Ordering?`, `In order per subscriber`, `One single-thread executor per subscriber`],
          [`Delivery guarantee?`, `Best effort, no persistence`, `No retries or storage to start`],
          [`Does publish wait for delivery?`, `No, it returns immediately`, `Asynchronous delivery`]
        ] }
      ] }
    ],
    solution: [
      { id: `design`, title: `Design`, kicker: `Entities and API`, blocks: [
        { type: `keypoints`, items: [
          `<code>Broker</code> maps topic to subscribers using concurrent collections.`,
          `Each subscriber gets its own single-thread executor, so its messages arrive in order and a slow subscriber only delays itself.`,
          `Every delivery is wrapped in try/catch, so one failing subscriber can't affect the rest.`
        ] },
        { type: `code`, lang: `java`, title: `Public API`, code: `void subscribe(String topic, Subscriber s);
void unsubscribe(String topic, Subscriber s);
void publish(String topic, String message);   // returns immediately
void shutdown();` }
      ] },
      { id: `code`, title: `Working code`, kicker: `Implementation`, blocks: [
        { type: `code`, lang: `java`, title: `Broker`, code: `interface Subscriber {
    String id();
    void onMessage(String topic, String message);
}

class Broker {
    private final Map<String, Set<Subscriber>> topics = new ConcurrentHashMap<>();
    private final Map<String, ExecutorService> workers = new ConcurrentHashMap<>();

    void subscribe(String topic, Subscriber s) {
        workers.computeIfAbsent(s.id(), id -> Executors.newSingleThreadExecutor());   // worker first,
        topics.computeIfAbsent(topic, t -> ConcurrentHashMap.newKeySet()).add(s);     // then visible to publish
    }

    void unsubscribe(String topic, Subscriber s) {
        Set<Subscriber> set = topics.get(topic);
        if (set != null) set.remove(s);
    }

    void publish(String topic, String message) {
        for (Subscriber s : topics.getOrDefault(topic, Set.of())) {
            workers.get(s.id()).submit(() -> {
                try {
                    s.onMessage(topic, message);
                } catch (Exception e) {
                    // log and continue: one bad subscriber must not affect the others
                }
            });
        }
    }

    void shutdown() { workers.values().forEach(ExecutorService::shutdown); }
}` },
        { type: `callout`, tone: `warning`, html: `<p>In <code>subscribe</code>, create the subscriber's worker <em>before</em> adding it to the topic. In the other order, a concurrent <code>publish</code> can see the subscriber, find no worker yet and fail with a <code>NullPointerException</code>.</p>` }
      ] },
      { id: `walkthrough`, title: `Walking through it`, kicker: `Check it works`, blocks: [
        { type: `steps`, items: [
          `Email and SMS services subscribe to "orders". <code>publish("orders", "o-1 paid")</code> submits one task to each worker and returns at once.`,
          `The SMS provider is slow: its queue grows, but the email worker keeps delivering immediately.`,
          `The email subscriber throws on a malformed message: the exception is caught in its task; SMS still receives everything.`,
          `Each subscriber sees "o-1 paid" before "o-2 paid", because its own executor runs tasks one at a time in submission order.`
        ] }
      ] }
    ],
    levels: levels(
      [`Topic-to-subscriber map, subscribe, unsubscribe and synchronous publish.`, `Seeing that a slow subscriber blocks the publisher in the synchronous version.`],
      [`Asynchronous delivery with per-subscriber executors, ordering and failure isolation.`, `Concurrent collections and safe iteration during unsubscribe.`, `Bounded queues and a policy when full.`],
      [`Retries, dead-letter queues, persistence with offsets and replay (the Kafka model).`, `Wildcard topics, filters, and a notification system with channels, templates, preferences and per-user rate limits.`]
    ),
    concepts: [
      { term: `Observer pattern`, def: `Subjects notify registered observers without knowing what they do.`, why: `Decouples publishers from consumers.` },
      { term: `Asynchronous delivery`, def: `Publish hands messages to executors and returns immediately.`, why: `The publisher's latency doesn't depend on the slowest subscriber.` },
      { term: `Per-subscriber executor`, def: `One single-thread executor per subscriber.`, why: `In-order delivery per subscriber and isolation between subscribers.` },
      { term: `Failure isolation`, def: `Each delivery catches its own exceptions.`, why: `One broken subscriber can't stop deliveries to others or kill its worker thread.` },
      { term: `Concurrent key set`, def: `<code>ConcurrentHashMap.newKeySet()</code> for subscribers per topic.`, why: `Safe iteration during concurrent subscribe and unsubscribe.` },
      { term: `Bounded queue and backpressure`, def: `Cap each subscriber's queue and choose block, drop-oldest or reject when full.`, why: `Default executors have unbounded queues; a dead subscriber would exhaust memory.` },
      { term: `Dead-letter queue`, def: `Messages that keep failing after retries are parked for inspection.`, why: `Failures become visible instead of silently lost.` }
    ],
    interview: [
      { q: `Why give each subscriber its own executor instead of one shared pool?`, a: `A single-thread executor per subscriber delivers that subscriber's messages in order, and a slow subscriber only fills its own queue. With one shared pool, a slow subscriber can occupy all pool threads and delay everyone, and messages for the same subscriber can run concurrently and out of order.`, diff: `medium` },
      { q: `What happens if a subscriber is very slow or dead?`, a: `Its executor's queue grows. Default executors use unbounded queues, so memory eventually runs out. Fix it with a ThreadPoolExecutor per subscriber over a bounded queue and an explicit policy when full (block the publisher, drop the oldest, or reject and count), plus monitoring and possibly automatic unsubscribe.`, diff: `medium` },
      { q: `How would you add retries and a dead-letter queue?`, a: `Wrap delivery in a retry loop with exponential backoff and jitter, scheduled on a ScheduledExecutorService rather than sleeping in the worker. After N failures, put the message and error on a dead-letter queue for inspection or replay. Subscribers should be idempotent because retries can deliver twice.`, diff: `hard` },
      { q: `What issues remain in the simple Broker?`, a: `Unsubscribing never shuts down the subscriber's worker, so threads leak when subscribers leave all topics; publish after shutdown throws RejectedExecutionException; queues are unbounded; nothing is persisted. Track topic counts per subscriber to stop idle workers, and define the lifecycle explicitly.`, diff: `medium` },
      { q: `How would you turn this into a notification system?`, a: `Channels such as email, SMS and push become strategies behind a Channel interface; templates render messages; user preferences choose channels; and a per-user rate limiter (the token bucket from the Rate Limiter problem) prevents spamming. The broker delivers events; a notification service subscribes and fans out per user.`, diff: `medium` }
    ],
    cheatsheet: [
      { title: `Delivery design choices`, type: `table`, headers: [`Choice`, `Option`, `Effect`], rows: [
        [`Threading`, `Executor per subscriber`, `Ordering per subscriber; isolation`],
        [`Queue`, `Bounded + policy`, `Memory stays bounded; explicit loss or backpressure`],
        [`Errors`, `Catch per delivery; retries; DLQ`, `Isolation and visibility`],
        [`Persistence`, `Log with offsets`, `Replay and durability (Kafka model)`]
      ] },
      { title: `Bounded per-subscriber executor`, type: `code`, lang: `java`, body: `ExecutorService worker = new ThreadPoolExecutor(
        1, 1, 0, TimeUnit.MILLISECONDS,
        new ArrayBlockingQueue<>(1_000),                      // at most 1,000 pending messages
        new ThreadPoolExecutor.DiscardOldestPolicy());        // drop the oldest when full` }
    ],
    labs: []
  });
})();
