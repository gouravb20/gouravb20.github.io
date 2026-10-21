// Deep dives: Pub-Sub / Notification Broker (LLD practice set). Format: DeepDive in public/shared/notes.d.ts.
window.DEEP = window.DEEP || {};
DEEP["pub-sub"] = {
  hook: `<p>Once the broker works, interviewers push on its promises: order, loss, slow consumers, matching. You rarely implement a follow-up in full; you show which class changes and why the rest doesn't. In this design most answers land in <code>Subscription</code>, because it alone owns delivery. Junior candidates may get none of these, mid-level one or two, senior candidates several, in more depth.</p>`,
  sections: [
    {
      id: "ordered-parallel",
      title: `"SMS is slow. Can it process messages in parallel and still keep each order's messages in sequence?"`,
      kicker: "Follow-up: ordering per key",
      blocks: [
        { type: "text", html: `<p>One worker per subscription keeps order by doing one thing at a time, which is also why a slow subscriber falls behind. Usually the order that matters is not "all messages" but "all messages about the same order id". So give each message a <strong>key</strong>, run several workers (lanes) for the subscription, and send every message with the same key to the same lane. Messages for one key stay in order; different keys proceed in parallel.</p>` },
        { type: "code", lang: "java", title: "Keyed lanes: parallel, but ordered per key", code: `// Message gains a key (an order id, a user id): record Message(String topic, long seq, String key, String payload, Instant publishedAt).
// Broker and Topic only pass it through. Today's Subscription becomes Lane, unchanged, and a
// KeyedSubscription with the same methods spreads messages over several lanes.
final class KeyedSubscription {
    private final List<Lane> lanes;                               // each lane: one bounded queue, one worker thread

    KeyedSubscription(String topic, Subscriber s, int laneCount, int capacityPerLane) {
        this.lanes = IntStream.range(0, laneCount)
            .mapToObj(i -> new Lane(topic + "-" + i, s, capacityPerLane))
            .toList();
    }

    boolean offer(Message m) {
        int i = Math.floorMod(m.key().hashCode(), lanes.size());   // same key, same lane, same order
        return lanes.get(i).offer(m);
    }

    void start()  { lanes.forEach(Lane::start); }
    void cancel() { lanes.forEach(Lane::cancel); }
    void finish() { lanes.forEach(Lane::finish); }

    boolean awaitStopped(long deadlineNanos) throws InterruptedException {
        boolean stopped = true;
        for (Lane lane : lanes) stopped &= lane.awaitStopped(deadlineNanos);
        return stopped;
    }
}` },
        { type: "keypoints", items: [
          "<strong>What changes:</strong> <code>Message</code> gains a key, and <code>Topic</code> holds either kind of subscription behind a small interface (<code>offer</code>, <code>start</code>, <code>cancel</code>, <code>finish</code>, <code>awaitStopped</code>). Broker and the delivery loop are untouched.",
          "<strong>The subscriber must now be thread-safe:</strong> several lanes call it at once. That is the price of parallelism; say it before the interviewer does.",
          "<strong>A hot key still serialises:</strong> if one customer produces most of the traffic, its lane is the bottleneck. More lanes don't help that key.",
          "<strong>Changing the lane count moves keys between lanes:</strong> drain the old lanes before switching, or a key's old and new messages race. This is exactly how Kafka partitions behave."
        ] }
      ]
    },
    {
      id: "retries-dead-letters",
      title: `"A delivery failed. Should the broker retry it, and what happens after the last attempt?"`,
      kicker: "Follow-up: retries and dead letters",
      blocks: [
        { type: "text", html: `<p>Today a failure is counted and the message is gone (at most once). Retrying turns that into "at least once, up to N attempts", and the messages that still fail need somewhere visible to go: a <strong>dead-letter</strong> topic that an operator tool can subscribe to and replay. Only <code>Subscription.deliver</code> changes.</p>` },
        { type: "compare", items: [
          { title: "Retry in place, on the worker", tone: "ok", html: `<p>The worker sleeps and calls <code>onMessage</code> again before taking the next message. Order is preserved, and only this subscription waits. While it waits its queue fills, so a long outage turns into drops, which the counters show.</p>` },
          { title: "Re-queue for later", tone: "info", html: `<p>Hand the message to a scheduler that puts it back after a delay, and carry on with the next message. The subscription keeps moving, but a retried message arrives after later ones, so per-subscriber order is lost. Fine for independent events like emails; wrong for state changes like "order paid" then "order cancelled".</p>` }
        ] },
        { type: "code", lang: "java", title: "Retry with backoff, then dead-letter", code: `// Subscription gains two injected collaborators; nothing outside Subscription changes.
record RetryPolicy(int maxAttempts, Duration firstDelay) {
    /** Before attempt 2, 3, 4...: 1x, 2x, 4x the first delay, with jitter so retries don't arrive in lockstep. */
    Duration delayBefore(int attempt) {
        long base = firstDelay.toMillis() << (attempt - 2);
        return Duration.ofMillis(base / 2 + ThreadLocalRandom.current().nextLong(base / 2 + 1));
    }
}

record DeadLetter(String subscriberId, Message message, String error, int attempts) {}

private final RetryPolicy retry;
private final Consumer<DeadLetter> deadLetters;          // e.g. dl -> broker.publish("dead-letters", encode(dl))

private void deliver(Message m) throws InterruptedException {     // run() already exits on InterruptedException
    for (int attempt = 1; ; attempt++) {
        try {
            subscriber.onMessage(m);
            delivered.incrementAndGet();
            return;
        } catch (InterruptedException e) {
            throw e;                                                // stopping, not failing
        } catch (Exception e) {
            if (discard) return;                                    // unsubscribed meanwhile: give up quietly
            if (attempt >= retry.maxAttempts()) {
                failed.incrementAndGet();
                deadLetters.accept(new DeadLetter(subscriber.id(), m, e.toString(), attempt));
                return;
            }
            Thread.sleep(retry.delayBefore(attempt + 1).toMillis());   // holds up only this subscription
        }
    }
}` },
        { type: "callout", tone: "warning", html: `<p>Retries mean duplicates: a subscriber can do its work, then throw before returning (a timeout on the reply, say), and receive the message again. Subscribers must be <strong>idempotent</strong>, for example by remembering the highest <code>seq</code> they have processed per topic and skipping anything at or below it. Also distinguish errors worth retrying (a timeout) from ones that never succeed (unparseable payload): send the second kind straight to dead letters.</p>` }
      ]
    },
    {
      id: "durable-replay",
      title: `"A subscriber was down for an hour. Can it catch up, or replay yesterday's messages?"`,
      kicker: "Follow-up: durable, replayable topics",
      blocks: [
        { type: "text", html: `<p>A push broker forgets a message once it is offered. To catch up or replay, the topic must <strong>keep</strong> its messages in an append-only log, and each subscriber must remember how far it has read: its <strong>offset</strong>. Delivery flips from push to pull: instead of a queue filled by publishers, the subscription's worker reads the log from its offset. This is the Kafka model.</p>` },
        { type: "code", lang: "java", title: "A durable topic log with cursors", code: `// Topic keeps every message instead of pushing and forgetting. The list stands in for segment files on disk.
final class TopicLog {
    private final String topic;
    private final List<Message> messages = new ArrayList<>();       // guarded by this; seq n is at index n - 1

    TopicLog(String topic) { this.topic = topic; }

    synchronized Message append(String payload) {
        Message m = new Message(topic, messages.size() + 1, payload, Instant.now());
        messages.add(m);
        notifyAll();                                                 // wake cursors waiting at the end
        return m;
    }

    /** Up to max messages starting at seq from; waits while there is nothing new. */
    synchronized List<Message> readFrom(long from, int max) throws InterruptedException {
        while (from > messages.size()) wait();
        int start = (int) (from - 1);
        return List.copyOf(messages.subList(start, Math.min(messages.size(), start + max)));
    }
}

interface OffsetStore {                                              // durable too: a file, a table, a compacted topic
    OptionalLong load(String subscriberId);
    void save(String subscriberId, long next);
}

// A Cursor replaces Subscription's queue: the worker pulls from the log instead of being pushed to.
final class Cursor implements Runnable {
    private final TopicLog log;
    private final Subscriber subscriber;
    private final OffsetStore offsets;

    Cursor(TopicLog log, Subscriber subscriber, OffsetStore offsets) {
        this.log = log;
        this.subscriber = subscriber;
        this.offsets = offsets;
    }

    public void run() {
        long next = offsets.load(subscriber.id()).orElse(1);        // resume where it stopped, or replay from the start
        try {
            while (true) {
                for (Message m : log.readFrom(next, 100)) {
                    deliverWithRetries(m);
                    next = m.seq() + 1;
                    offsets.save(subscriber.id(), next);             // commit after handling: at least once
                }
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();                      // stopped: the saved offset is where we resume
        }
    }

    private void deliverWithRetries(Message m) throws InterruptedException { /* the loop from the retries follow-up */ }
}` },
        { type: "table", headers: ["Push queue (the solution)", "Pull from a log (this follow-up)"], rows: [
          ["A message exists until every queue has taken it", "A message exists until retention deletes it (by age or size)"],
          ["A slow subscriber fills its queue and loses messages", "A slow subscriber just lags; nothing is dropped"],
          ["A new subscriber sees only future messages", "A new subscriber chooses: from the start, from the end, or from a time"],
          ["At most once", "At least once: the offset is saved after handling, so a crash replays the last message"],
          ["Memory bounded by queue capacity", "Storage bounded by retention; needs compaction or deletion"]
        ] },
        { type: "keypoints", items: [
          "<strong>What changes:</strong> <code>Topic</code> appends to a <code>TopicLog</code> instead of offering; <code>Subscription</code>'s queue becomes a <code>Cursor</code>. The <code>Broker</code> API gains an optional starting position on <code>subscribe</code>.",
          "<strong>Saving the offset before handling</strong> gives at most once instead; after handling gives at least once. Exactly once needs the handling and the offset saved in one transaction.",
          "<strong>Backpressure comes for free:</strong> the log does not care how far behind a reader is, so the overflow policy question disappears, replaced by a retention question."
        ] }
      ]
    },
    {
      id: "filters-wildcards",
      title: `"Can a subscriber receive only some messages, or every topic under orders.*?"`,
      kicker: "Follow-up: filtering and wildcards",
      blocks: [
        { type: "text", html: `<p>Two different asks. A <strong>filter</strong> narrows one topic ("only priority orders"): it belongs to the subscription. A <strong>wildcard</strong> widens the topics ("everything under <code>orders.</code>"): it belongs to routing in the broker. Keep them apart and each change is small.</p>` },
        { type: "code", lang: "java", title: "Filters and wildcard subscriptions", code: `// 1. Filters. Subscription gets a Predicate<Message>; offer checks it first. It runs on the publisher's
//    thread, inside the topic lock, so it must be cheap and must not block.
boolean offer(Message m) {
    if (!accepting || !filter.test(m)) return false;
    if (queue.offer(m)) return true;
    dropped.incrementAndGet();
    return false;
}
// broker.subscribe("orders", sms, m -> m.payload().startsWith("priority:"));

// 2. Wildcards. "orders.*" matches exactly one more segment; "orders.#" matches any number, including none.
record TopicPattern(String text) {
    boolean matches(String topic) {
        String[] p = text.split("[.]"), t = topic.split("[.]");
        for (int i = 0; i < p.length; i++) {
            if (p[i].equals("#")) return true;
            if (i >= t.length || !(p[i].equals("*") || p[i].equals(t[i]))) return false;
        }
        return p.length == t.length;
    }
}

// Pattern subscriptions live in groups beside the exact topics. Topic.broadcast is split into
// next(payload), which numbers a message, and offerAll(m), so one message reaches both.
private final List<PatternGroup> patternGroups = new CopyOnWriteArrayList<>();

int publish(String topic, String payload) {
    requireOpen();
    Topic exact = topics.computeIfAbsent(checkTopic(topic), Topic::new);   // always exists now: it numbers messages
    synchronized (exact) {                                                 // the lock broadcast used: one order
        Message m = exact.next(payload);
        int accepted = exact.offerAll(m);
        for (PatternGroup g : patternGroups) {
            if (g.pattern().matches(topic)) accepted += g.offerAll(m);
        }
        return accepted;
    }
}` },
        { type: "keypoints", items: [
          "<strong>What changes:</strong> filters touch only <code>Subscription.offer</code> and an overload of <code>subscribe</code>. Wildcards add <code>TopicPattern</code> and <code>PatternGroup</code> and change <code>Broker.publish</code>; <code>Subscription</code> is reused as is.",
          "<strong>Matching every pattern on every publish is O(patterns).</strong> With many patterns, index them in a trie of topic segments, where <code>*</code> and <code>#</code> are special children, so a publish walks only matching branches.",
          "<strong>Publish now creates topics,</strong> because the exact topic numbers messages even when only patterns match. Typos create entries too; cap or expire empty topics if that matters.",
          "<strong>Server-side filtering saves queue space:</strong> a message the subscriber would ignore never takes a slot that a wanted message could have used."
        ] }
      ]
    },
    {
      id: "backpressure",
      title: `"What should happen when a subscriber can't keep up?"`,
      kicker: "Follow-up: backpressure",
      blocks: [
        { type: "text", html: `<p>The solution drops the newest message when a queue is full. That is one policy of several, and the right one depends on the data. Make the choice a <strong>Strategy</strong> per subscription, consulted only when the fast path (a non-blocking offer) fails.</p>` },
        { type: "code", lang: "java", title: "Overflow policies as a strategy", code: `interface OverflowPolicy {
    /** Called when queue.offer(m) failed. Returns true if m ended up queued. */
    boolean onFull(BlockingQueue<Message> queue, Message m) throws InterruptedException;
}

final class DropNewest implements OverflowPolicy {          // the solution's behaviour: the new message is lost
    public boolean onFull(BlockingQueue<Message> q, Message m) { return false; }
}

final class DropOldest implements OverflowPolicy {          // latest value wins: prices, presence, dashboards
    public boolean onFull(BlockingQueue<Message> q, Message m) {
        for (int i = 0; i < 3; i++) {                        // a few tries against racing publishers
            q.poll();
            if (q.offer(m)) return true;
        }
        return false;
    }
}

final class BlockWithTimeout implements OverflowPolicy {    // backpressure: the publisher slows down, but not forever
    private final Duration max;
    BlockWithTimeout(Duration max) { this.max = max; }
    public boolean onFull(BlockingQueue<Message> q, Message m) throws InterruptedException {
        return q.offer(m, max.toMillis(), TimeUnit.MILLISECONDS);
    }
}

// Subscription.offer: the fast path first, the policy only when full.
boolean offer(Message m) throws InterruptedException {
    if (!accepting) return false;
    if (queue.offer(m) || policy.onFull(queue, m)) return true;
    dropped.incrementAndGet();
    return false;
}` },
        { type: "table", headers: ["Policy", "Effect", "Fits"], rows: [
          ["Drop newest", "Old messages delivered, new ones lost", "Logs and events where history matters more than freshness"],
          ["Drop oldest", "Stale messages lost, newest delivered", "Live prices, presence, telemetry: only the latest value matters"],
          ["Block with a timeout", "Publisher slows down to the consumer's pace", "Every message matters and the publisher can afford to wait"],
          ["Disconnect the subscriber", "After N drops in a row, unsubscribe it and alert", "A consumer that is dead rather than slow"]
        ] },
        { type: "callout", tone: "warning", html: `<p>Blocking is subtler than it looks in this design: <code>offer</code> runs inside <code>Topic.broadcast</code>, under the topic lock. A blocked offer holds that lock, so every publisher to the topic waits, and so do deliveries to the topic's other subscribers. That is real backpressure, but it re-couples subscribers, which the design set out to avoid. Use it only on topics with one subscriber, or with a short timeout and a drop after it.</p>` },
        { type: "quiz", q: "Subscriber A's queue is full and uses BlockWithTimeout(2s). Subscriber B on the same topic is idle. A publisher publishes. What does B experience?", options: [
          "Nothing: B's queue is separate, so B receives the message immediately",
          "B may wait up to 2 seconds, because the offer to A blocks inside the topic lock while the topic fans out",
          "B never receives the message because A's queue is full",
          "B receives the message twice"
        ], answer: 1, explain: `<p>Queues are separate, but fan-out is not: <code>broadcast</code> offers to subscribers one after another under the topic lock. If A comes first and blocks for up to two seconds, B's offer waits behind it. With the solution's drop-on-full policy the offer to A returns at once and B is unaffected.</p>` }
      ]
    },
    {
      id: "notifications",
      title: `"How would you build user notifications (email, SMS, push) on top of this?"`,
      kicker: "Follow-up: from broker to product",
      blocks: [
        { type: "text", html: `<p>Notifications add product rules: which channels a user wants, what the message says, and not spamming anyone. None of that belongs in the broker. It becomes one more subscriber that turns domain events into per-channel messages, and the channels are subscribers too.</p>` },
        { type: "code", lang: "java", title: "A notification service is just another subscriber", code: `// Nothing in Broker, Topic or Subscription changes. A new Subscriber turns domain events into per-channel messages.
final class NotificationService implements Subscriber {
    private final Broker broker;
    private final RateLimiter limiter;            // per user, e.g. the token bucket from the Rate Limiter problem
    private final Preferences preferences;        // user id -> channels they opted into, quiet hours
    private final Templates templates;            // event type -> text

    NotificationService(Broker broker, RateLimiter limiter, Preferences preferences, Templates templates) {
        this.broker = broker;
        this.limiter = limiter;
        this.preferences = preferences;
        this.templates = templates;
    }

    public String id() { return "notifications"; }

    public void onMessage(Message m) throws Exception {
        OrderEvent e = OrderEvent.parse(m.payload());                  // throws on bad input: counted as a failure
        if (!limiter.tryAcquire(e.userId())) return;                   // too many messages to this user: skip
        String text = templates.render(m.topic(), e);
        for (String channel : preferences.channelsFor(e.userId())) {
            broker.publish("notify." + channel, e.userId() + "|" + text);   // one topic per channel
        }
    }
}

// EmailSender subscribes to "notify.email", SmsSender to "notify.sms", PushSender to "notify.push".
// Each is its own subscription, so a slow SMS provider cannot delay email: the broker's isolation, reused.` },
        { type: "table", headers: ["Concern", "Where it lives"], rows: [
          ["Channels: email, SMS, push", "One subscriber per channel topic, each a <code>Channel</code> implementation (Strategy)"],
          ["Message content", "Templates rendered from the event, chosen by topic"],
          ["User preferences and quiet hours", "Looked up by <code>NotificationService</code> before fan-out"],
          ["Spam protection", "A per-user rate limiter checked before fan-out"],
          ["Provider outages", "Retries and dead letters on the channel subscriptions (the retries follow-up)"]
        ] }
      ]
    }
  ],
  takeaways: [
    "Almost every delivery follow-up lands in <code>Subscription</code>: lanes for per-key order, a retry loop, an overflow policy, a filter.",
    "Parallel and ordered means ordered per key: hash the key to a lane, and accept that subscribers must become thread-safe.",
    "Retries make delivery at least once, so subscribers must be idempotent; give up into a dead-letter topic that someone can inspect.",
    "Catch-up and replay need a log with offsets instead of queues: slow readers lag rather than lose messages.",
    "Filters narrow a subscription; wildcards widen routing. They belong to different classes.",
    "Choose the full-queue policy per subscription, and remember that blocking inside the topic lock re-couples subscribers.",
    "Notifications are a subscriber that fans out to channel topics; the broker's isolation protects one channel from another."
  ]
};
