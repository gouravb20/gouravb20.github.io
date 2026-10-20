// Deep dives: Pub-Sub / Notification Broker (LLD practice set). Format: DeepDive in public/shared/notes.d.ts.
window.DEEP = window.DEEP || {};
DEEP["pub-sub"] = {
  hook: `<p>The broker delivers asynchronously, in order per subscriber, with failures isolated. The follow-ups probe the gaps: unbounded queues, lost messages, no persistence, exact topic names only, and how the same design becomes a user-facing notification system.</p>`,
  sections: [
    {
      id: "bounded-queues",
      title: "Bounded queues and a policy when full",
      kicker: "Follow-up: backpressure",
      blocks: [
        { type: "problem", html: `<p><code>Executors.newSingleThreadExecutor()</code> has an unbounded queue. A subscriber that hangs keeps accepting tasks forever, and the broker eventually runs out of memory.</p>` },
        { type: "code", lang: "java", title: "One bounded worker per subscriber", code: `private ExecutorService newWorker() {
    return new ThreadPoolExecutor(
        1, 1, 0, TimeUnit.MILLISECONDS,
        new ArrayBlockingQueue<>(1_000),
        new ThreadPoolExecutor.DiscardOldestPolicy());     // or CallerRunsPolicy / AbortPolicy
}` },
        { type: "table", headers: ["Policy when full", "Effect", "Fits"], rows: [
          ["Block the publisher (CallerRuns or a blocking put)", "Backpressure: publishing slows down", "Every message matters, publisher can wait"],
          ["Drop the oldest", "Newest data wins", "Live prices, presence, telemetry"],
          ["Reject and count", "Publisher learns immediately", "When callers can retry or log"]
        ] }
      ]
    },
    {
      id: "retries-dlq",
      title: "Retries and a dead-letter queue",
      kicker: "Follow-up: reliability",
      blocks: [
        { type: "code", lang: "java", title: "Retry with backoff, then park the message", code: `record Delivery(Subscriber s, String topic, String message, int attempt) {}

private final ScheduledExecutorService retries = Executors.newSingleThreadScheduledExecutor();
private final Queue<Delivery> deadLetters = new ConcurrentLinkedQueue<>();
private static final int MAX_ATTEMPTS = 5;

private void deliver(Delivery d) {
    workers.get(d.s().id()).submit(() -> {
        try {
            d.s().onMessage(d.topic(), d.message());
        } catch (Exception e) {
            if (d.attempt() + 1 >= MAX_ATTEMPTS) { deadLetters.add(d); return; }
            long delayMs = (long) (100 * Math.pow(2, d.attempt()) * (0.5 + Math.random()));   // backoff + jitter
            retries.schedule(() -> deliver(new Delivery(d.s(), d.topic(), d.message(), d.attempt() + 1)),
                             delayMs, TimeUnit.MILLISECONDS);
        }
    });
}` },
        { type: "callout", tone: "warning", html: `<p>Retries mean a subscriber can see a message twice (it may have processed it and then failed to acknowledge). Subscribers must be idempotent, for example by tracking message ids they've handled. Note that a retry also lets later messages overtake the failed one, so per-subscriber ordering is no longer strict.</p>` }
      ]
    },
    {
      id: "persistence-and-replay",
      title: "Persistence and replay with offsets",
      kicker: "Follow-up: the Kafka model",
      blocks: [
        { type: "text", html: `<p>Instead of pushing to subscribers and forgetting, append every message to a per-topic log and let each subscriber track its own <strong>offset</strong> (the position of the next message to read). A subscriber that was down resumes from its offset; a new one can start from the beginning or the end; a bug fix can be followed by replaying from an earlier offset.</p>` },
        { type: "code", lang: "java", title: "A minimal in-memory log", code: `class TopicLog {
    private final List<String> messages = new CopyOnWriteArrayList<>();
    void append(String m) { messages.add(m); }
    List<String> readFrom(int offset, int max) {
        int end = Math.min(messages.size(), offset + max);
        return offset >= end ? List.of() : messages.subList(offset, end);
    }
}

// Each subscriber: int offset; loop { batch = log.readFrom(offset, 100); handle(batch); offset += batch.size(); }` }
      ]
    },
    {
      id: "wildcards-and-lifecycle",
      title: "Wildcard topics, filters and lifecycle",
      kicker: "Follow-up: matching and cleanup",
      blocks: [
        { type: "keypoints", items: [
          "<strong>Wildcards</strong> such as <code>orders.*</code>: store pattern subscriptions separately and match each published topic against them (or use a trie of topic segments).",
          "<strong>Filters</strong>: a subscription carries a <code>Predicate&lt;String&gt;</code>; publish checks it before submitting.",
          "<strong>Worker cleanup</strong>: track how many topics each subscriber is in; when it reaches zero on unsubscribe, shut down and remove its worker.",
          "<strong>Shutdown</strong>: stop accepting publishes first, then <code>shutdown()</code> and <code>awaitTermination</code> each worker so queued messages drain."
        ] }
      ]
    },
    {
      id: "notifications",
      title: "As a notification system",
      kicker: "Follow-up: product",
      blocks: [
        { type: "table", headers: ["Concern", "Design"], rows: [
          ["Channels: email, SMS, push", "A <code>Channel</code> interface with one class per channel (Strategy)"],
          ["Message content", "Templates rendered with per-event data"],
          ["User preferences", "Which channels and which event types each user wants; quiet hours"],
          ["Spam protection", "A per-user rate limit, reusing the token bucket from the Rate Limiter problem"],
          ["Delivery", "The broker publishes domain events; a NotificationService subscribes, looks up preferences and sends"]
        ] },
        { type: "quiz", q: "Why does the Broker give each subscriber its own single-thread executor rather than sharing one pool of 8 threads?", options: [
          "Single-thread executors are faster",
          "It keeps each subscriber's messages in order and stops a slow subscriber from tying up threads that others need",
          "ConcurrentHashMap requires it",
          "To guarantee exactly-once delivery"
        ], answer: 1, explain: `<p>A per-subscriber single thread runs that subscriber's tasks one at a time in submission order, and a slow subscriber can only fill its own queue. With a shared pool, a slow subscriber can occupy every thread, and two messages for the same subscriber can run concurrently and out of order. Neither design gives exactly-once delivery.</p>` }
      ]
    }
  ],
  takeaways: [
    "Bound every subscriber's queue and choose block, drop-oldest or reject when it fills.",
    "Retry with backoff and jitter, then dead-letter; subscribers must be idempotent.",
    "A per-topic log with consumer offsets gives persistence and replay.",
    "Wildcards, filters and worker cleanup are additive changes to subscription handling.",
    "A notification system layers channels, templates, preferences and per-user rate limits on the broker."
  ]
};
