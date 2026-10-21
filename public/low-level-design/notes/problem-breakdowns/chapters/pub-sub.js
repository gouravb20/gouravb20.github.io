// LLD problem breakdown: Pub-Sub / Notification Broker. Format: Chapter in public/shared/notes.d.ts; shared helpers in data-part2.js.
// Imports are omitted in the code.
(function () {
const { levels, PRACTICE_TIP } = LLD_PROBLEMS_KIT;

window.DATA.chapters.push({
    id: `pub-sub`, part: 2, number: 0, difficulty: `medium`,
    title: `Pub-Sub / Notification Broker: the Observer pattern, asynchronously`,
    references: [{ title: `awesome-low-level-design: Pub-Sub System`, url: `https://github.com/ashishps1/awesome-low-level-design/blob/main/problems/pub-sub-system.md` }],
    overview: `Publishers send messages to named topics; every current subscriber of a topic receives them. The interesting requirement is the last one: a slow or failing subscriber must not hold up the publisher or the other subscribers. This page works the problem in interview order: clarify the requirements (above all, what delivery and ordering are promised), find the entities, design the classes top down, implement publishing and delivery (comparing a simple, a better and a strong option at each decision), verify with a trace, then handle follow-ups. The design lands on the <strong>Observer</strong> pattern made asynchronous: each subscription owns a <strong>bounded queue</strong> and <strong>one worker thread</strong>, so messages arrive in order, a slow subscriber only delays itself, and an exception stays inside the subscriber that threw it.`,
    problem: [
      { id: `understanding`, title: `What a pub-sub broker does`, kicker: `The problem`, blocks: [
        { type: `problem`, html: `<p>An order service wants to tell several other parts of the system that an order was placed: email, SMS, an audit log, analytics. It should not know who they are, call each one, or wait for them. Instead it publishes one message to a topic called <code>orders</code>, and a broker hands a copy to everyone who subscribed. Subscribers come and go while messages keep flowing.</p>` },
        { type: `text`, html: `<p>The prompt is usually one sentence: <em>"Design an in-memory publish-subscribe system: topics, subscribe and unsubscribe, and publish that delivers to every subscriber."</em> The hard part is hidden in what that sentence leaves out: what happens when one subscriber is slow, throws, or leaves in the middle of a delivery. The first few minutes go into pinning that down.</p>` }
      ] },
      { id: `clarifying`, title: `Clarifying questions`, kicker: `Step 1: requirements`, blocks: [
        { type: `text`, html: `<p>Work through four kinds of question: <strong>what the system must do</strong>, <strong>what happens with bad input</strong>, <strong>what is deliberately left out</strong>, and <strong>what might be added later</strong>. Spend one to three minutes here; every answer removes a branch you would otherwise design for.</p>` },
        { type: `table`, headers: [`You ask`, `A typical answer`, `What it decides`], rows: [
          [`In one process, or across machines?`, `One process; publishers and subscribers are objects in the same JVM`, `Threads and in-memory queues; no network, serialisation or broker cluster`],
          [`Must a topic be created before it is used?`, `No. It exists once someone subscribes; publishing to a topic nobody has subscribed to does nothing`, `No <code>createTopic</code>; <code>publish</code> returns how many subscribers got the message, possibly 0`],
          [`Does <code>publish</code> wait until subscribers have handled the message?`, `No, it returns immediately`, `Asynchronous delivery: something must hold messages between publish and delivery`],
          [`What order must messages arrive in?`, `Each subscriber sees a topic's messages in publish order; no promise across topics`, `Exactly one thread delivers to a given subscriber on a given topic`],
          [`What delivery guarantee? Can a message be lost?`, `At most once, in memory. A message can be lost if a queue is full or the process dies`, `No persistence, acknowledgements or retries in the core; those are follow-ups`],
          [`What if a subscriber is slow, or throws?`, `It must not delay the publisher or other subscribers; failures and drops are counted`, `A bounded queue per subscriber, and a try/catch around every delivery`],
          [`Bad input: a blank topic, a duplicate subscribe, publish after shutdown?`, `Blank topic is an error; subscribing twice is a no-op returning false; publish after shutdown is an error`, `Validation at the broker's methods; an explicit lifecycle`],
          [`Wildcard topics, filters, replay of old messages?`, `Not now, but likely follow-ups`, `Keep topic matching and delivery in separate classes so they can change alone`]
        ] },
        { type: `callout`, tone: `insight`, title: `The question that shapes everything: what is promised?`, html: `<p>"At most once or at least once?" and "in order per what?" decide the whole design. At most once, in order per subscriber, means an in-memory queue and one worker per subscriber, and a dropped message is acceptable. At least once means messages must be stored until a subscriber acknowledges them, retries, and subscribers that tolerate duplicates. Ordering "per topic for everyone" is cheap here; ordering per key with parallel workers is a different design. Ask it out loud: most candidates assume an answer silently and then build either too little or far too much.</p>` }
      ] },
      { id: `final-requirements`, title: `Final requirements`, kicker: `Step 1: requirements`, blocks: [
        { type: `code`, lang: `text`, title: `Final requirements`, code: `Requirements
  1. Subscribers subscribe to and unsubscribe from named topics. A topic
     exists from its first subscription; subscribing twice is a no-op.
  2. publish(topic, payload) delivers a copy to every current subscriber of
     that topic and returns at once, with the number of subscribers that
     accepted it (0 if nobody is subscribed).
  3. Each subscriber receives a topic's messages in publish order.
  4. A slow subscriber delays only itself. Its pending messages are bounded;
     when its queue is full, new messages for it are dropped and counted.
  5. A subscriber that throws does not affect other subscribers, and still
     receives later messages. Failures are counted.
  6. Unsubscribe stops delivery: a message being handled finishes, queued
     ones are discarded. It is safe to call from inside a delivery.
  7. Shutdown stops new publishes, lets queued messages drain, and waits up
     to a timeout. Publish after shutdown is an error.
  8. A blank topic or null subscriber is rejected with an exception.

Out of scope
  - Persistence, acknowledgements, retries (delivery is at most once)
  - Wildcard topics and message filters
  - Distribution across processes or machines` },
        { type: `callout`, tone: `tip`, html: PRACTICE_TIP }
      ] }
    ],
    solution: [
      { id: `entities`, title: `Core entities`, kicker: `Step 2: entities`, blocks: [
        { type: `text`, html: `<p>Scan the requirements for nouns that hold state or enforce rules: broker, topic, subscriber, message, queue, publisher. Test each one before committing to a class. One entity, the subscription, does not appear as a noun at all; it turns up once you ask where a subscriber's queue lives.</p>` },
        { type: `table`, headers: [`Candidate`, `Verdict`, `Why`], rows: [
          [`Broker`, `A class`, `The entry point: holds the topics, validates input, owns the lifecycle (open, shut down)`],
          [`Topic`, `A class`, `Holds its current subscribers and numbers its messages so every subscriber sees one order`],
          [`Subscriber`, `An interface`, `The Observer. The broker only needs <code>id()</code> and <code>onMessage()</code>; email, SMS and audit are implementations it never sees`],
          [`Message`, `A record`, `Immutable data: topic, sequence number, payload, time. Shared by every queue it is offered to, so it must not change`],
          [`Publisher`, `Not a class`, `Anyone who calls <code>publish</code>. It holds no state the broker needs; a <code>Publisher</code> type would wrap one method call`],
          [`Queue`, `Not a class of its own`, `A <code>BlockingQueue</code> field. The question is who owns it, which leads to the next row`],
          [`Subscription`, `A class`, `One subscriber on one topic: its bounded queue, its worker thread and its counters. Unsubscribe and shutdown act on it`],
          [`Payload`, `A <code>String</code>`, `Enough for the interview; making the broker generic is a short follow-up`]
        ] },
        { type: `table`, title: `The entities we keep`, headers: [`Entity`, `Responsibility`], rows: [
          [`Broker`, `The public API. Validates input, finds or creates topics, rejects calls after shutdown, and shuts every subscription down. Knows nothing about threads or queues.`],
          [`Topic`, `A name and its subscriptions. Numbers each message and offers it to every subscription, under one lock so all subscribers see the same order.`],
          [`Subscription`, `Where delivery happens. Accepts messages without blocking, holds them in a bounded queue, and calls the subscriber on its own worker thread, one message at a time, catching failures.`],
          [`Subscriber`, `The Observer interface implemented by users of the broker.`],
          [`Message`, `An immutable published message.`]
        ] },
        { type: `callout`, tone: `tip`, html: `<p>When a requirement talks about "each subscriber's queue" or "a subscriber's order", that "each" is a hint that something per subscriber holds state. Name it out loud ("I'll call the pairing of a topic and a subscriber a Subscription") rather than hanging queues off the <code>Subscriber</code> interface, which belongs to the user's code, not yours.</p>` }
      ] },
      { id: `broker-design`, title: `Class design: Broker, Message and Subscriber`, kicker: `Step 3: class design, top down`, blocks: [
        { type: `text`, html: `<p>Start from the class outside code talks to, and derive its state and methods from the requirements rather than from intuition. For each requirement ask: what must this class remember, and what must it let callers do?</p>` },
        { type: `table`, headers: [`Requirement`, `What the broker remembers`], rows: [
          [`"A topic exists from its first subscription"`, `A map from topic name to <code>Topic</code>`],
          [`"Pending messages per subscriber are bounded"`, `The queue capacity, handed to each new subscription`],
          [`"Publish after shutdown is an error"`, `Whether it is still open`]
        ] },
        { type: `table`, headers: [`Need`, `Method`], rows: [
          [`Start receiving a topic`, `<code>boolean subscribe(String topic, Subscriber s)</code>: false if already subscribed`],
          [`Stop receiving`, `<code>boolean unsubscribe(String topic, Subscriber s)</code>`],
          [`Publish without waiting`, `<code>int publish(String topic, String payload)</code>: how many subscribers accepted it`],
          [`See drops and failures`, `<code>Map&lt;String, SubscriptionStats&gt; stats(String topic)</code>`],
          [`Stop cleanly`, `<code>boolean shutdown(Duration timeout)</code>: true if every worker finished in time`]
        ] },
        { type: `code`, lang: `java`, title: `Message and Subscriber`, code: `/** Immutable once published. seq numbers a topic's messages in publish order, starting at 1. */
record Message(String topic, long seq, String payload, Instant publishedAt) {}

/** The Observer. Called on the subscription's own worker thread, one message at a time. */
interface Subscriber {
    String id();                                         // unique; identifies the subscriber across topics
    void onMessage(Message message) throws Exception;    // may be slow, may throw
}

record SubscriptionStats(long delivered, long failed, long dropped, int queued) {}` },
        { type: `keypoints`, items: [
          `<strong>An injected broker, not a Singleton.</strong> Code that needs one receives it in its constructor. Tests create a fresh broker with a queue of 2 to provoke drops, and two brokers can live in one process. A static <code>getInstance()</code> buys nothing and makes every test share state.`,
          `<strong><code>publish</code> returns a count.</strong> Zero tells the caller nobody is listening without an exception, and tests can assert on it. The awesome-low-level-design version throws when the topic was never created; here "no subscribers yet" is a normal state.`,
          `<strong><code>onMessage</code> may throw checked exceptions.</strong> Subscribers do I/O. Letting them throw, and catching in one place, is simpler than forcing every implementation to wrap its own errors.`,
          `<strong>The subscriber chooses its id.</strong> It keys the subscription, so subscribing twice is detectable and unsubscribe needs no object identity tricks.`
        ] }
      ] },
      { id: `topic-design`, title: `Class design: Topic`, kicker: `Step 3: class design`, blocks: [
        { type: `table`, headers: [`Requirement`, `What a topic remembers`], rows: [
          [`"Deliver to every current subscriber"`, `Its subscriptions, keyed by subscriber id`],
          [`"Each subscriber receives messages in publish order"`, `A sequence counter, so every message has a number and every subscriber gets them in the same order`]
        ] },
        { type: `table`, headers: [`Need`, `Method on Topic`], rows: [
          [`Subscribe; false if already there`, `<code>boolean add(Subscriber s, int capacity)</code>`],
          [`Unsubscribe`, `<code>boolean remove(String subscriberId)</code>`],
          [`Publish`, `<code>int broadcast(String payload)</code>`],
          [`Shutdown`, `<code>void close()</code>, <code>boolean awaitStopped(long deadlineNanos)</code>`]
        ] },
        { type: `text`, html: `<p>The first real decision: <strong>which collection holds the subscriptions?</strong> Publishers iterate it on every publish, while subscribe and unsubscribe change it from other threads, possibly from inside a delivery.</p>` },
        { type: `compare`, items: [
          { title: `Good: a plain list or map`, tone: `warn`, html: `<p><code>ArrayList</code> or <code>HashMap</code>. Fine single-threaded. With concurrent subscribers, a publish iterating while someone unsubscribes throws <code>ConcurrentModificationException</code>, and two concurrent subscribes can lose one. Not acceptable once publish and subscribe run on different threads.</p>` },
          { title: `Better: a synchronized list`, tone: `info`, html: `<p><code>Collections.synchronizedList</code>. Each call is safe, but iteration is not: you must hold the list's lock for the whole loop. If delivery happens inside that loop, a slow subscriber blocks every subscribe and unsubscribe, and a subscriber that unsubscribes from inside its callback can deadlock against another thread.</p>` },
          { title: `Great: a concurrent map keyed by id`, tone: `ok`, html: `<p><code>ConcurrentHashMap&lt;String, Subscription&gt;</code>. Iteration never throws and never blocks writers; it sees a consistent-enough view (each subscription that existed for the whole loop is visited exactly once). Keying by id makes duplicate subscribes detectable and unsubscribe O(1). <code>CopyOnWriteArraySet</code> is equally valid when subscribers change rarely, as in the awesome-low-level-design solution.</p>` }
        ] },
        { type: `text`, html: `<p>We take the concurrent map. On top of it, <code>broadcast</code> is <code>synchronized</code> on the topic: numbering a message and offering it to every subscription happen as one step, so two concurrent publishers cannot interleave and leave subscriber A with #5 then #6 while subscriber B gets #6 then #5. The lock is cheap because offering never blocks; it is held for one pass over the map.</p>` }
      ] },
      { id: `subscription-design`, title: `Class design: Subscription, where delivery happens`, kicker: `Step 3: class design`, blocks: [
        { type: `text`, html: `<p>This is the decision the interviewer is waiting for: <strong>on which thread does <code>onMessage</code> run?</strong> Compare three answers against the requirements "publish returns at once", "in order per subscriber" and "a slow subscriber delays only itself".</p>` },
        { type: `compare`, items: [
          { title: `Good: call subscribers in the publisher's thread`, tone: `warn`, html: `<p>Loop over subscribers and call <code>onMessage</code> directly: the classic synchronous Observer. Ordered and simple, but <code>publish</code> takes as long as the slowest subscriber, and one that hangs stops the publisher forever. An exception must be caught per subscriber or it skips everyone after it.</p>` },
          { title: `Better: one shared thread pool`, tone: `info`, html: `<p>Submit one task per subscriber to a shared executor and return. Publish is fast now. But two messages for the same subscriber can run at once on two threads, so order is lost and the subscriber must be thread-safe. A cached pool grows a thread per stuck delivery without limit; a fixed pool lets one slow subscriber occupy every thread and stall everyone.</p>` },
          { title: `Great: a bounded queue and one worker per subscription`, tone: `ok`, html: `<p>Publish only offers the message to each subscription's queue, which never blocks. Each subscription has one worker thread that takes messages in order and calls <code>onMessage</code>. Order holds because one thread delivers; a slow subscriber fills only its own queue; the bound caps memory, and a full queue drops and counts instead of blocking the publisher.</p>` }
        ] },
        { type: `text`, html: `<p>We take the queue and worker per subscription. The cost is a thread per subscription, which is fine for tens or hundreds; for thousands, the same class can run its worker on a virtual thread (Java 21) or as a task on a shared pool that drains one subscription at a time. Neither changes the interface.</p>` },
        { type: `table`, headers: [`Requirement`, `What a subscription remembers`], rows: [
          [`"Publish returns at once; pending messages are bounded"`, `A bounded <code>BlockingQueue&lt;Message&gt;</code>`],
          [`"Messages arrive in order; a slow subscriber delays only itself"`, `Exactly one worker thread, the only caller of <code>onMessage</code>`],
          [`"Drops and failures are counted"`, `Counters for delivered, failed and dropped`],
          [`"Unsubscribe discards the backlog; shutdown drains it"`, `Two flags: still accepting messages, and discard what is queued`]
        ] },
        { type: `table`, headers: [`Need`, `Method on Subscription`], rows: [
          [`Publisher hands over a message`, `<code>boolean offer(Message m)</code>: never blocks`],
          [`Begin delivering`, `<code>void start()</code>`],
          [`Unsubscribe`, `<code>void cancel()</code>: discard the backlog`],
          [`Shutdown`, `<code>void finish()</code>: drain the backlog, then <code>awaitStopped</code>`]
        ] },
        { type: `keypoints`, items: [
          `<strong>The queue lives in the subscription, not the subscriber.</strong> A subscriber on two topics has two subscriptions, two queues and two workers, so a flood on one topic cannot delay the other. Ordering is promised per topic, which is exactly what this gives.`,
          `<strong>Drop, don't block.</strong> Blocking the publisher when one subscriber's queue is full would let the slowest subscriber set everyone's speed, which is the problem we are solving. Other policies are a follow-up (Deep Dives).`,
          `<strong>Start the thread after construction.</strong> A constructor that starts a thread publishes a half-built object to it; a separate <code>start()</code> avoids that.`
        ] }
      ] },
      { id: `class-diagram`, title: `Final class design`, kicker: `Step 3: class design`, blocks: [
        { type: `code`, lang: `java`, title: `Final class design`, code: `record Message(String topic, long seq, String payload, Instant publishedAt) {}
record SubscriptionStats(long delivered, long failed, long dropped, int queued) {}

interface Subscriber {                                         // the Observer
    String id();
    void onMessage(Message message) throws Exception;
}

final class Broker {                                           // injected; one per application or test
    private final Map<String, Topic> topics;                   // ConcurrentHashMap; created on first subscribe
    private final int queueCapacity;
    private volatile boolean open;

    synchronized boolean subscribe(String topic, Subscriber s);
    boolean unsubscribe(String topic, Subscriber s);
    int publish(String topic, String payload);                 // never blocks; how many accepted it
    Map<String, SubscriptionStats> stats(String topic);
    boolean shutdown(Duration timeout) throws InterruptedException;
}

final class Topic {
    private final String name;
    private final Map<String, Subscription> subscriptions;     // ConcurrentHashMap: subscriber id -> subscription
    private long nextSeq;                                      // guarded by this

    boolean add(Subscriber s, int capacity);
    boolean remove(String subscriberId);
    synchronized int broadcast(String payload);                // number it, offer it to everyone: one order
    void close();
    boolean awaitStopped(long deadlineNanos) throws InterruptedException;
}

final class Subscription {                                     // one subscriber on one topic
    private final Subscriber subscriber;
    private final BlockingQueue<Message> queue;                // ArrayBlockingQueue: bounded
    private final Thread worker;                               // the only thread that calls onMessage
    private volatile boolean accepting, discard;

    boolean offer(Message m);                                  // publisher side; never blocks
    void start();
    void cancel();                                             // unsubscribe: discard the backlog
    void finish();                                             // shutdown: drain the backlog
    boolean awaitStopped(long deadlineNanos) throws InterruptedException;
    SubscriptionStats stats();
}` },
        { type: `text`, html: `<p>The broker validates and routes, the topic fans out in one order, and the subscription delivers. Only <code>Subscription</code> knows about threads, so every delivery follow-up (retries, overflow policies, keyed parallelism) lands in that one class. The <strong>Observer</strong> pattern is the <code>Subscriber</code> interface; the queue per subscription is what turns it from "the subject calls its observers" into a broker.</p>` }
      ] },
      { id: `broker-impl`, title: `Implementation: Broker and Topic`, kicker: `Step 4: implementation`, blocks: [
        { type: `text`, html: `<p>Check what the interviewer wants: working code, pseudocode or a walkthrough. For each method, write the normal path first, then the edge cases. The normal path is short: <code>subscribe</code> finds or creates the topic and adds a subscription; <code>publish</code> finds the topic and broadcasts.</p>` },
        { type: `list`, title: `Edge cases at the broker`, items: [
          `A blank topic or a null subscriber or payload: throw <code>IllegalArgumentException</code> or <code>NullPointerException</code> before touching any state.`,
          `Publishing to a topic nobody has subscribed to: return 0 and create nothing, so typos do not fill the map with empty topics.`,
          `Subscribing twice: return false, and make sure no second worker thread was started.`,
          `Publishing or subscribing after shutdown: throw <code>IllegalStateException</code>. Subscribe and the first half of shutdown share the broker's lock, so a subscription cannot slip in after shutdown has closed the others and leak a thread.`
        ] },
        { type: `code`, lang: `java`, title: `Broker`, code: `final class Broker {
    private final Map<String, Topic> topics = new ConcurrentHashMap<>();
    private final int queueCapacity;
    private volatile boolean open = true;

    Broker(int queueCapacity) {
        if (queueCapacity < 1) throw new IllegalArgumentException("queueCapacity must be at least 1");
        this.queueCapacity = queueCapacity;
    }

    /** Creates the topic on first use. False if this subscriber is already on the topic. */
    synchronized boolean subscribe(String topic, Subscriber subscriber) {
        requireOpen();
        Objects.requireNonNull(subscriber, "subscriber");
        return topics.computeIfAbsent(checkTopic(topic), Topic::new).add(subscriber, queueCapacity);
    }

    /** Stops delivery to this subscriber on this topic; messages still queued for it are discarded. */
    boolean unsubscribe(String topic, Subscriber subscriber) {
        Objects.requireNonNull(subscriber, "subscriber");
        Topic t = topics.get(checkTopic(topic));
        return t != null && t.remove(subscriber.id());
    }

    /** Offers the message to every current subscriber and returns at once: how many accepted it. */
    int publish(String topic, String payload) {
        requireOpen();
        Objects.requireNonNull(payload, "payload");
        Topic t = topics.get(checkTopic(topic));
        return t == null ? 0 : t.broadcast(payload);           // nobody has ever subscribed: nothing to do
    }

    Map<String, SubscriptionStats> stats(String topic) {
        Topic t = topics.get(checkTopic(topic));
        return t == null ? Map.of() : t.stats();
    }

    /** Stops accepting publishes, lets every worker drain its queue, and waits up to timeout in total. */
    boolean shutdown(Duration timeout) throws InterruptedException {
        synchronized (this) {                                  // no subscribe can slip in after this block
            open = false;
            topics.values().forEach(Topic::close);
        }
        long deadline = System.nanoTime() + timeout.toNanos();
        boolean stopped = true;
        for (Topic t : topics.values()) stopped &= t.awaitStopped(deadline);
        return stopped;
    }

    private void requireOpen() {
        if (!open) throw new IllegalStateException("broker is shut down");
    }

    private static String checkTopic(String topic) {
        if (topic == null || topic.isBlank()) throw new IllegalArgumentException("topic must not be blank");
        return topic;
    }
}` },
        { type: `code`, lang: `java`, title: `Topic`, code: `final class Topic {
    private final String name;
    private final Map<String, Subscription> subscriptions = new ConcurrentHashMap<>();   // subscriber id -> subscription
    private long nextSeq = 1;                                                           // guarded by this

    Topic(String name) { this.name = name; }

    boolean add(Subscriber s, int capacity) {
        Subscription fresh = new Subscription(name, s, capacity);           // has its queue; no thread yet
        if (subscriptions.putIfAbsent(s.id(), fresh) != null) return false;  // already subscribed: discard, nothing started
        fresh.start();
        return true;
    }

    boolean remove(String subscriberId) {
        Subscription sub = subscriptions.remove(subscriberId);
        if (sub == null) return false;
        sub.cancel();
        return true;
    }

    /** Numbering and offering under one lock, so every subscriber sees this topic's messages in one order. */
    synchronized int broadcast(String payload) {
        Message m = new Message(name, nextSeq++, payload, Instant.now());
        int accepted = 0;
        for (Subscription sub : subscriptions.values()) {
            if (sub.offer(m)) accepted++;                                    // never blocks: the lock is held briefly
        }
        return accepted;
    }

    void close() { subscriptions.values().forEach(Subscription::finish); }

    boolean awaitStopped(long deadlineNanos) throws InterruptedException {
        boolean stopped = true;
        for (Subscription sub : subscriptions.values()) stopped &= sub.awaitStopped(deadlineNanos);
        return stopped;
    }

    Map<String, SubscriptionStats> stats() {
        Map<String, SubscriptionStats> out = new TreeMap<>();
        subscriptions.forEach((id, sub) -> out.put(id, sub.stats()));
        return out;
    }
}` },
        { type: `keypoints`, items: [
          `<strong>The subscription is visible before its thread starts, and that is safe.</strong> Its queue exists from construction, so a publish that sees it in the map can always offer; the worker drains whatever arrived once it starts. A design that keeps workers in one map and subscribers in another must order the two puts carefully, or a publish finds a subscriber with no worker and throws a <code>NullPointerException</code>; owning both in one object removes the race.`,
          `<strong><code>publish</code> takes no broker lock.</strong> Reads of the topic map are lock-free and <code>open</code> is <code>volatile</code>. A publish racing with shutdown either gets the exception or offers to subscriptions that have stopped accepting, which return false. Both are fine for a call made concurrently with shutdown.`,
          `<strong>Topics are never removed.</strong> An empty topic costs one map entry. Removing topics safely needs care (a subscribe racing with the removal); mention it as a follow-up rather than writing it.`
        ] }
      ] },
      { id: `subscription-impl`, title: `Implementation: Subscription and its worker`, kicker: `Step 4: implementation`, blocks: [
        { type: `text`, html: `<p>The normal path: <code>offer</code> puts the message in the queue; the worker loops, taking one message at a time and calling <code>onMessage</code>. Almost all the care goes into the edge cases, so list them before coding.</p>` },
        { type: `list`, title: `Edge cases the code must handle`, items: [
          `<strong>Full queue:</strong> <code>offer</code> returns false at once and counts the drop. The publisher never waits.`,
          `<strong>A subscriber that throws:</strong> catch per delivery, count it, log it, and carry on with the next message. The worker thread must survive.`,
          `<strong>Unsubscribe during a delivery:</strong> the running <code>onMessage</code> finishes (interrupting user code mid-call is unsafe); queued messages are discarded; nothing new is accepted.`,
          `<strong>Unsubscribe from inside <code>onMessage</code>:</strong> runs on the worker thread itself, so it must not block or wait for the worker. <code>cancel</code> only sets flags and clears the queue.`,
          `<strong>Shutdown:</strong> stop accepting, deliver what is already queued, then stop.`,
          `<strong>A worker blocked in <code>take()</code> on an empty queue when it is closed:</strong> it would wait forever, so closing offers a private marker message that wakes it.`
        ] },
        { type: `code`, lang: `java`, title: `Subscription`, code: `final class Subscription {
    private static final Message WAKE = new Message("", 0, "", Instant.EPOCH);   // compared by identity; never delivered

    private final Subscriber subscriber;
    private final BlockingQueue<Message> queue;
    private final Thread worker;
    private final AtomicLong delivered = new AtomicLong(), failed = new AtomicLong(), dropped = new AtomicLong();
    private volatile boolean accepting = true;   // false after unsubscribe or shutdown
    private volatile boolean discard = false;    // true after unsubscribe: drop whatever is still queued

    Subscription(String topic, Subscriber subscriber, int capacity) {
        this.subscriber = subscriber;
        this.queue = new ArrayBlockingQueue<>(capacity);
        this.worker = new Thread(this::run, "sub-" + topic + "-" + subscriber.id());
        this.worker.setDaemon(true);             // a stuck subscriber must not keep the JVM alive
    }

    void start() { worker.start(); }

    /** Called by publishers. Never blocks: a full queue drops this message for this subscriber only. */
    boolean offer(Message m) {
        if (!accepting) return false;
        if (queue.offer(m)) return true;
        dropped.incrementAndGet();
        return false;
    }

    /** Unsubscribe. The message being handled finishes; queued ones are discarded. Safe from onMessage. */
    void cancel() {
        discard = true;
        accepting = false;
        queue.clear();
        queue.offer(WAKE);                       // wakes a worker blocked in take(); a full queue means it isn't blocked
    }

    /** Shutdown: accept nothing new, deliver what is queued, then stop. */
    void finish() {
        accepting = false;
        queue.offer(WAKE);
    }

    boolean awaitStopped(long deadlineNanos) throws InterruptedException {
        long ms = TimeUnit.NANOSECONDS.toMillis(deadlineNanos - System.nanoTime());
        if (ms > 0) worker.join(ms);             // join(0) would wait forever
        return !worker.isAlive();
    }

    SubscriptionStats stats() {
        return new SubscriptionStats(delivered.get(), failed.get(), dropped.get(), queue.size());
    }

    private void run() {
        try {
            while (true) {
                Message m = accepting ? queue.take() : queue.poll();   // once closed, never wait again
                if (m == null || discard) return;                      // drained, or unsubscribed
                if (m != WAKE) deliver(m);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();                         // asked to stop: exit
        }
    }

    private void deliver(Message m) {
        try {
            subscriber.onMessage(m);
            delivered.incrementAndGet();
        } catch (Exception e) {                                         // isolate: count, log, keep going
            failed.incrementAndGet();
            System.getLogger("broker").log(System.Logger.Level.WARNING,
                "subscriber " + subscriber.id() + " failed on " + m.topic() + " #" + m.seq(), e);
        }
    }
}` },
        { type: `keypoints`, items: [
          `<strong>Why the marker works in every interleaving.</strong> If the worker read <code>accepting == true</code> and is about to block, the queue is empty at close time, so the marker fits and wakes it. If the queue is full, the marker is dropped, but then <code>take()</code> returns a real message, and the next loop reads <code>accepting == false</code> and switches to <code>poll()</code>, which never waits.`,
          `<strong>Catch <code>Exception</code>, not <code>Throwable</code>.</strong> An <code>Error</code> such as <code>OutOfMemoryError</code> means the process is in trouble; letting it end the worker is the honest response. Say so if asked.`,
          `<strong>No retries here.</strong> The requirement is at most once: a failed message is counted and logged, and the next message is delivered. Retries and dead letters are a follow-up that changes only <code>deliver</code>.`
        ] },
        { type: `callout`, tone: `warning`, html: `<p>Thread safety: publishers on many threads call <code>offer</code>, while exactly one worker thread takes from the queue and calls the subscriber. <code>ArrayBlockingQueue</code> is safe for that. The two flags are <code>volatile</code> so a worker sees an unsubscribe immediately, and the counters are atomic because publishers increment <code>dropped</code> concurrently. The only lock on the publish path is the topic's, held while offering, which never blocks; the subscription itself takes no lock, so a subscriber that publishes, subscribes or unsubscribes from inside <code>onMessage</code> cannot deadlock with its own worker. Because exactly one thread calls <code>onMessage</code>, subscriber implementations do not need to be thread-safe, which is worth saying out loud.</p>` },
        { type: `text`, html: `<p>The <a href="https://github.com/ashishps1/awesome-low-level-design/tree/main/solutions/java/src/pubsubsystem" target="_blank" rel="noopener">awesome-low-level-design pub-sub solution</a> has the same core shape: a service holding a map of topics, a <code>Topic</code> with a concurrent subscriber set that broadcasts, a <code>Subscriber</code> interface, and a try/catch around each delivery. We kept that shape and wrote the code independently, with these changes: the service is an injected <code>Broker</code> rather than a Singleton; delivery moved from one shared cached thread pool (which loses per-subscriber order, calls a subscriber on several threads at once, and grows a thread per stuck delivery) to a bounded queue and one worker per subscription; topics are created on subscribe instead of by a separate call, and publishing to an unknown topic returns 0 instead of throwing; and unsubscribe, duplicate subscribe and shutdown now have defined behaviour.</p>` }
      ] },
      { id: `verification`, title: `Verifying with a trace`, kicker: `Step 5: verification`, blocks: [
        { type: `text`, html: `<p>Walk a concrete scenario call by call before the interviewer does. To make time visible, pretend each worker does one unit of work per tick: the email and audit subscribers need one tick per message, the SMS subscriber needs three. Audit throws on any payload containing "bad". The broker's queue capacity is 2. Each tick, the publisher acts first, then every worker does one unit of work. "queued" shows each queue after the publisher acts (the message a worker is busy with has already left its queue).</p>` },
        { type: `code`, lang: `text`, title: `Call by call`, code: `setup  new Broker(queueCapacity = 2)
       subscribe("orders", email) -> true  (fast: 1 tick per message)
       subscribe("orders", sms)   -> true  (slow: 3 ticks per message)
       subscribe("orders", audit) -> true  (throws on payloads containing "bad")
       subscribe("orders", email) -> false (already subscribed)
t1    publish("orders", "o-1 placed") -> 3  (#1)
      queued  email[#1] sms[#1] audit[#1]
      work    email got #1 | sms on #1 (1/3) | audit got #1
t2    publish("orders", "o-2 bad json") -> 3  (#2)
      queued  email[#2] sms[#2] audit[#2]
      work    email got #2 | sms on #1 (2/3) | audit threw on #2, caught
t3    publish("orders", "o-3 placed") -> 3  (#3)
      publish("orders", "o-4 placed") -> 2  (#4)
      queued  email[#3,#4] sms[#2,#3] audit[#3,#4]
      work    email got #3 | sms got #1 | audit got #3
t4    publish("payments", "p-1 settled") -> 0  (no topic: nothing queued)
      queued  email[#4] sms[#2,#3] audit[#4]
      work    email got #4 | sms on #2 (1/3) | audit got #4
t5    unsubscribe("orders", sms) -> true
      queued  email[] sms[] audit[]
      work    sms on #2 (2/3)
t6    publish("orders", "o-5 placed") -> 2  (#5)
      publish("orders", "o-6 placed") -> 2  (#6)
      queued  email[#5,#6] sms[] audit[#5,#6]
      work    email got #5 | sms got #2 | audit got #5
t7    shutdown(): stop accepting, let workers drain
      queued  email[#6] sms[] audit[#6]
      work    email got #6 | sms worker stops (unsubscribed) | audit got #6
t8    (nothing new)
      queued  email[] audit[]
      work    email worker stops (drained) | audit worker stops (drained)
end   email delivered=6 failed=0 dropped=0 | sms delivered=2 failed=0 dropped=1 | audit delivered=5 failed=1 dropped=0
      publish after shutdown -> IllegalStateException` },
        { type: `keypoints`, items: [
          `<strong>The slow subscriber delayed only itself.</strong> Email and audit kept up, never more than one message behind; SMS fell behind, and at t3 its queue held #2 and #3, so #4 was dropped for SMS alone and <code>publish</code> returned 2.`,
          `<strong>The failure stayed put.</strong> Audit threw on #2, the exception was caught and counted, and audit still received #3 to #6.`,
          `<strong>Unsubscribe during a delivery behaved as specified.</strong> At t5 SMS was two ticks into #2: that delivery finished at t6, the queued #3 was discarded, and #5 and #6 were never offered to SMS.`,
          `<strong>Shutdown drained, then stopped.</strong> #6 was still queued for email and audit at t7 and was delivered before their workers exited. Publishing to <code>payments</code>, which nobody subscribed to, returned 0 and created nothing.`,
          `<strong>Order held.</strong> Every subscriber saw messages in sequence order, with gaps only where a message was dropped or discarded.`
        ] }
      ] }
    ],
    levels: levels(
      [`A <code>Subscriber</code> interface, a map from topic to subscribers, and working subscribe, unsubscribe and publish.`, `Spots that a synchronous publish blocks on a slow subscriber and lets one exception skip the rest; catches per subscriber at least.`, `Uses a concurrent collection for subscribers and can explain the <code>ConcurrentModificationException</code> it prevents.`],
      [`Asynchronous delivery with a queue and one worker per subscription, and argues why it keeps order and isolates a slow subscriber where a shared pool does not.`, `Bounds the queues and names a policy for a full queue without being asked.`, `Defines unsubscribe and shutdown precisely (discard versus drain, a delivery already running, unsubscribe from inside a callback) and handles them in code.`, `Prefers an injected broker over a Singleton, and can say where retries, filters and backpressure would land.`],
      [`Asks what delivery guarantee and ordering are promised before designing, and explains how at least once would change the design (stored messages, acknowledgements, idempotent subscribers).`, `Sees the subtle races unprompted: two publishers interleaving across subscribers, a subscription visible before its worker exists, a worker blocked forever on close.`, `Discusses scaling the thread model (virtual threads, a shared pool that drains one subscription at a time) and per-key ordering with parallel lanes.`, `Connects the design to real systems: an in-memory queue per consumer versus a durable log with offsets, and when each fits.`]
    ),
    concepts: [
      { term: `Observer pattern`, def: `A subject keeps a list of observers behind an interface and notifies them of events without knowing what they do.`, why: `The core requirement: publishers and subscribers never reference each other.` },
      { term: `Asynchronous Observer`, def: `Notification puts the event in a queue per observer instead of calling it directly.`, why: `The publisher's latency stops depending on the slowest subscriber.` },
      { term: `Subscription`, def: `One subscriber on one topic: its bounded queue, its single worker thread and its counters.`, why: `The unit that owns delivery, so unsubscribe, shutdown and delivery follow-ups act on one object.` },
      { term: `One worker per subscription`, def: `Exactly one thread takes from a subscription's queue and calls <code>onMessage</code>.`, why: `In-order delivery, and subscribers that need not be thread-safe.` },
      { term: `Bounded queue, drop on full`, def: `<code>ArrayBlockingQueue.offer</code> returns false when full; the drop is counted.`, why: `Memory stays bounded and the publisher never waits for a slow subscriber.` },
      { term: `Failure isolation`, def: `Each delivery is wrapped in try/catch; the worker counts the failure and moves on.`, why: `One broken subscriber cannot stop the others or kill its own worker.` },
      { term: `Per-topic sequence`, def: `The topic numbers each message and offers it to every subscription under one lock.`, why: `All subscribers see one order even when publishers race.` },
      { term: `At most once`, def: `A message is delivered zero or one times: lost if a queue is full, the subscriber throws, or the process dies.`, why: `The cheapest guarantee; at least once needs storage, acknowledgements and idempotent subscribers.` },
      { term: `Drain versus discard`, def: `Shutdown delivers what is already queued; unsubscribe throws it away. Both let a running delivery finish.`, why: `Clear lifecycle semantics are what separate a working broker from a demo.` }
    ],
    interview: [
      { q: `Where is the Observer pattern here, and why isn't it enough on its own?`, a: `Subscriber is the observer interface and the topic is the subject: publishers never know who receives a message. But the textbook Observer is synchronous: the subject calls each observer in its own thread, so the publisher waits for the slowest observer and one exception can skip the rest. Adding a bounded queue and a worker per subscription keeps the Observer's decoupling and removes the coupling in time.`, diff: `easy` },
      { q: `Why one queue and one worker per subscription rather than a shared thread pool?`, a: `With a shared pool, two messages for the same subscriber can run at once on different threads, so order is lost and the subscriber must be thread-safe. A slow subscriber can also occupy pool threads that everyone needs, or, with a cached pool, create a new thread for every stuck delivery. A single worker per subscription delivers in order and confines a slow subscriber to its own queue. The cost is a thread per subscription, which virtual threads or a shared pool that drains one subscription at a time can reduce.`, diff: `medium` },
      { q: `A subscriber's queue is full. Why drop the message instead of blocking the publisher?`, a: `Blocking means the slowest subscriber sets the speed for the publisher and, through it, for every other subscriber, which is exactly what the requirements forbid. Under at most once delivery, dropping and counting is honest. If losing messages is unacceptable, the alternatives are blocking with a timeout (backpressure), dropping the oldest instead (latest value wins), or a durable log where a slow consumer just lags. Each is a different OverflowPolicy in the same Subscription.`, diff: `medium` },
      { q: `How does unsubscribe behave if the subscriber is in the middle of onMessage, or calls unsubscribe from inside onMessage?`, a: `cancel sets the subscription to stop accepting and to discard, clears the queue and offers a wake-up marker; it never waits. The running onMessage finishes, then the worker sees the discard flag and exits. Because cancel never blocks or joins the worker, calling it from the worker itself is safe. Interrupting the worker instead would disturb user code in the middle of I/O.`, diff: `medium` },
      { q: `Two threads publish to the same topic at the same time. Can two subscribers see the messages in different orders?`, a: `Without care, yes: thread A offers #5 to subscriber 1, thread B offers #6 to both subscribers, then A offers #5 to subscriber 2, so subscriber 2 sees #6 before #5. Making Topic.broadcast synchronized, and assigning the sequence number inside it, makes numbering and offering one step. The lock is cheap because offer never blocks.`, diff: `hard` },
      { q: `How would you change the design to deliver at least once?`, a: `Messages must survive until a subscriber has handled them: append them to a per-topic log, and give each subscription a cursor (an offset) that advances only after onMessage succeeds. Failed deliveries are retried with backoff, and after N attempts go to a dead-letter topic. Retries and crashes mean a message can arrive twice, so subscribers must be idempotent, for example by remembering the last sequence number they processed.`, diff: `hard` },
      { q: `Why not make the broker a Singleton?`, a: `Nothing requires exactly one broker, and a static instance makes every test share topics, threads and counters, so tests interfere with each other and cannot use a tiny queue to provoke drops. Passing the broker into the classes that need it costs one constructor parameter and allows separate brokers per module or per test.`, diff: `easy` }
    ],
    cheatsheet: [
      { title: `Pub-sub in one screen`, type: `code`, lang: `java`, body: `record Message(String topic, long seq, String payload, Instant publishedAt) {}
interface Subscriber { String id(); void onMessage(Message m) throws Exception; }   // the Observer

final class Broker {                                              // injected, not a Singleton
    Map<String, Topic> topics;                                    // ConcurrentHashMap; topic made on first subscribe
    synchronized boolean subscribe(String topic, Subscriber s);   // false if already subscribed
    boolean unsubscribe(String topic, Subscriber s);              // that subscriber's backlog is discarded
    int publish(String topic, String payload);                    // never blocks; 0 if nobody subscribed
    boolean shutdown(Duration timeout);                           // stop accepting, drain, wait
}

final class Topic {
    Map<String, Subscription> subscriptions;                      // ConcurrentHashMap by subscriber id
    synchronized int broadcast(String payload);                   // seq++, offer to each: one order for all
}

final class Subscription {                                        // one subscriber on one topic
    BlockingQueue<Message> queue;                                 // bounded; full: drop and count
    Thread worker;                                                // the only caller of onMessage: in order
    // deliver: try { onMessage } catch (Exception e) { failed++ }: a bad subscriber hurts only itself
    // cancel: discard backlog; finish: drain backlog; a WAKE marker unblocks take()
}` },
      { title: `Follow-ups and where they land`, type: `table`, headers: [`Follow-up`, `Change`], rows: [
        [`Parallel processing, ordered per key`, `Subscription becomes N lanes chosen by key hash (Deep Dives)`],
        [`Retries and dead letters`, `Subscription.deliver retries with backoff, then publishes to a dead-letter topic (Deep Dives)`],
        [`Durable topics and replay`, `Topic gets an append-only log; Subscription becomes a cursor with an offset (Deep Dives)`],
        [`Filters and wildcard topics`, `A predicate in Subscription.offer; pattern groups in Broker.publish (Deep Dives)`],
        [`Slow subscribers, backpressure`, `An OverflowPolicy strategy inside Subscription.offer (Deep Dives)`],
        [`User notifications`, `A NotificationService subscriber fanning out to one topic per channel (Deep Dives)`],
        [`Thousands of subscriptions`, `Virtual threads, or a shared pool that drains one subscription at a time`],
        [`Typed messages`, `Broker&lt;T&gt;, Subscriber&lt;T&gt;, Message&lt;T&gt;`]
      ] }
    ],
    labs: []
  });
})();
