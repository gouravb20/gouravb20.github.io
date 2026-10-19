// Deep dive: Chapter 3, Coordination. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch3 = {
  hook: `<p>Correctness is about threads not stepping on each other. Coordination is about threads <em>working together</em>: a request thread hands a log line to a writer, a checkout waits for price and stock lookups, a scheduler releases a seat hold after ten minutes. The danger changes from corrupted state to threads that wait forever, spin and burn CPU, miss a signal, or run in the wrong order. This chapter builds up from the producer-consumer pattern to the higher-level tools you'd actually use.</p>`,
  sections: [
    {
      id: "producer-consumer",
      title: "Producer-consumer: the pattern behind most coordination",
      kicker: "The key idea",
      blocks: [
        { type: "idea", html: `<p>Put a <strong>queue</strong> between the threads that create work and the threads that do it. Producers add items and move on; consumers take items when they are free. The queue absorbs bursts, decouples the two sides' speeds, and, if it blocks, does all the waiting for you.</p>` },
        { type: "diagram", title: "Producers, a bounded queue, consumers", caption: "Producers block (or are rejected) when the queue is full; consumers block when it is empty. Neither side needs to know about the other.", svg: `<svg viewBox="0 0 620 200" role="img" aria-label="Producers putting items into a bounded queue that consumers take from">
<defs><marker id="cx3-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="20" y="30" width="120" height="36" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/><text x="80" y="53" text-anchor="middle" font-size="13" style="fill: var(--dg-ink)">request thread</text>
<rect x="20" y="82" width="120" height="36" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/><text x="80" y="105" text-anchor="middle" font-size="13" style="fill: var(--dg-ink)">request thread</text>
<rect x="20" y="134" width="120" height="36" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/><text x="80" y="157" text-anchor="middle" font-size="13" style="fill: var(--dg-ink)">request thread</text>
<rect x="210" y="76" width="200" height="48" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<rect x="220" y="86" width="28" height="28" rx="4" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/><rect x="254" y="86" width="28" height="28" rx="4" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/><rect x="288" y="86" width="28" height="28" rx="4" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<rect x="322" y="86" width="28" height="28" rx="4" style="fill: none; stroke: var(--dg-line)" stroke-dasharray="3 3"/><rect x="356" y="86" width="28" height="28" rx="4" style="fill: none; stroke: var(--dg-line)" stroke-dasharray="3 3"/>
<text x="310" y="146" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">BlockingQueue, capacity 5</text>
<rect x="480" y="56" width="120" height="36" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/><text x="540" y="79" text-anchor="middle" font-size="13" style="fill: var(--dg-ink)">writer thread</text>
<rect x="480" y="108" width="120" height="36" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/><text x="540" y="131" text-anchor="middle" font-size="13" style="fill: var(--dg-ink)">writer thread</text>
<line x1="140" y1="48" x2="206" y2="92" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#cx3-arrow)"/>
<line x1="140" y1="100" x2="206" y2="100" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#cx3-arrow)"/>
<line x1="140" y1="152" x2="206" y2="108" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#cx3-arrow)"/>
<line x1="410" y1="94" x2="476" y2="76" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#cx3-arrow)"/>
<line x1="410" y1="106" x2="476" y2="124" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#cx3-arrow)"/>
<text x="170" y="22" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">put / offer</text>
<text x="445" y="22" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">take / poll</text>
</svg>` },
        { type: "code", lang: "java", title: "An async logger with a bounded queue", code: `final class AsyncLogger implements AutoCloseable {
    private final BlockingQueue<String> queue = new ArrayBlockingQueue<>(10_000);
    private final AtomicLong dropped = new AtomicLong();
    private final LogSink sink;
    private final Thread writer;
    private volatile boolean open = true;

    AsyncLogger(LogSink sink) {
        this.sink = sink;
        this.writer = Thread.ofPlatform().name("log-writer").unstarted(this::drain);
        writer.start();                                       // only after every field is set
    }

    void log(String line) {
        if (!queue.offer(line)) dropped.incrementAndGet();   // never block a request thread
    }

    private void drain() {
        List<String> batch = new ArrayList<>();
        try {
            while (open || !queue.isEmpty()) {
                String first = queue.poll(100, TimeUnit.MILLISECONDS);
                if (first == null) continue;
                batch.add(first);
                queue.drainTo(batch, 499);                  // write in batches of up to 500
                sink.write(batch);
                batch.clear();
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    @Override public void close() throws InterruptedException { open = false; writer.join(); }
}` },
        { type: "lab", id: "boundedBuffer", caption: "Make producers faster than consumers and compare the three full-queue policies. Then balance the rates and see how small a queue is enough to absorb bursts." }
      ]
    },
    {
      id: "blocking-queues",
      title: "Choosing a BlockingQueue and a full-queue policy",
      kicker: "The workhorse",
      blocks: [
        { type: "table", headers: ["Implementation", "Bounded?", "Use it for"], rows: [
          ["<code>ArrayBlockingQueue</code>", "Yes, fixed capacity", "The default bounded buffer"],
          ["<code>LinkedBlockingQueue</code>", "Optional (unbounded if no capacity is given)", "Higher throughput with separate put/take locks; always pass a capacity"],
          ["<code>PriorityBlockingQueue</code>", "No", "Urgent work first (bound it yourself)"],
          ["<code>DelayQueue</code>", "No", "Items released only after their delay: expiring holds, retries"],
          ["<code>SynchronousQueue</code>", "Zero capacity", "Direct hand-off: a put waits for a take"],
          ["<code>LinkedTransferQueue</code>", "No", "Producers can optionally wait until consumed"]
        ] },
        { type: "compare", title: "What a producer does when the queue is full", items: [
          { title: "Block: put()", tone: "info", html: `<p>The producer waits. This is <strong>backpressure</strong>: a slow consumer slows producers down. Right when producers are background jobs; risky when they are request threads, since waiting adds user latency.</p>` },
          { title: "Time out: offer(e, t, unit)", tone: "ok", html: `<p>Wait a bounded time, then return false. The caller can retry, fall back or report "busy". A good default for request paths.</p>` },
          { title: "Reject: offer(e)", tone: "warn", html: `<p>Return false immediately. Producers never stall, but data is lost; acceptable for debug logs or metrics if you count the drops.</p>` }
        ] },
        { type: "callout", tone: "mistake", html: `<p>Using an unbounded queue "so nothing is ever rejected". When consumers fall behind, the queue grows, every item waits longer, and eventually the JVM runs out of memory. Rejection didn't go away, it turned into an outage.</p>` }
      ]
    },
    {
      id: "wait-notify",
      title: "Under the hood: wait, notify and conditions",
      kicker: "The primitives",
      blocks: [
        { type: "text", html: `<p>Blocking queues are built on <strong>condition waiting</strong>: a thread holding a lock checks a condition, and if it is false, atomically releases the lock and sleeps until another thread signals that something changed. Java has two versions: <code>wait</code>/<code>notifyAll</code> on any object's monitor, and <code>Condition.await</code>/<code>signal</code> on a <code>ReentrantLock</code>.</p>` },
        { type: "code", lang: "java", title: "A one-slot mailbox with wait / notifyAll", code: `final class Mailbox<T> {
    private T item;                                    // guarded by 'this'

    synchronized void put(T value) throws InterruptedException {
        while (item != null) wait();                   // ALWAYS a while loop
        item = value;
        notifyAll();                                   // wake takers (and other putters, who recheck)
    }

    synchronized T take() throws InterruptedException {
        while (item == null) wait();
        T v = item;
        item = null;
        notifyAll();
        return v;
    }
}` },
        { type: "keypoints", title: "The rules", items: [
          "Call <code>wait</code>, <code>notify</code> and <code>notifyAll</code> only while holding that object's monitor, or you get <code>IllegalMonitorStateException</code>.",
          "<strong>Wait in a while loop</strong> that rechecks the condition. Threads can wake spuriously, and another thread may have consumed the change before you reacquire the lock.",
          "Change the state <em>before</em> signalling, while still holding the lock.",
          "Prefer <code>notifyAll</code> when different kinds of waiters share one monitor; <code>notify</code> can wake the wrong kind and leave everyone asleep.",
          "With <code>ReentrantLock</code>, use separate <code>Condition</code>s (<code>notFull</code>, <code>notEmpty</code>) so <code>signal</code> wakes exactly the right kind of waiter."
        ] },
        { type: "callout", tone: "tip", html: `<p>In an interview, mention that you know how to write this, then use <code>ArrayBlockingQueue</code>. Hand-rolled condition code is where subtle bugs live, and the library version is tested and fast. Write it by hand only if the interviewer asks you to implement the queue itself.</p>` }
      ]
    },
    {
      id: "executors-futures",
      title: "Executors, futures and CompletableFuture",
      kicker: "Higher level",
      blocks: [
        { type: "text", html: `<p>An <code>ExecutorService</code> is producer-consumer already assembled: <code>submit</code> puts a task on its queue, worker threads take and run tasks, and you get a <code>Future</code> back to collect the result. For several dependent async steps, <code>CompletableFuture</code> lets you describe the pipeline without blocking a thread at every step.</p>` },
        { type: "code", lang: "java", title: "Checkout: three lookups in parallel, then combine", code: `ExecutorService io = Executors.newVirtualThreadPerTaskExecutor();

CompletableFuture<Cart>    cart    = CompletableFuture.supplyAsync(() -> carts.load(userId), io);
CompletableFuture<Address> address = CompletableFuture.supplyAsync(() -> profiles.address(userId), io);
CompletableFuture<Quote>   quote   = cart.thenCompose(c ->
        CompletableFuture.supplyAsync(() -> pricing.quote(c), io));          // depends on cart

Checkout checkout = quote.thenCombine(address, Checkout::new)
        .orTimeout(500, TimeUnit.MILLISECONDS)
        .join();` },
        { type: "table", title: "Picking a pool", headers: ["Work", "Pool", "Size"], rows: [
          ["CPU-bound (parsing, computing)", "<code>newFixedThreadPool(n)</code>", "About the number of cores"],
          ["Blocking I/O, many tasks", "<code>newVirtualThreadPerTaskExecutor()</code>", "One virtual thread per task"],
          ["Blocking I/O, platform threads", "<code>ThreadPoolExecutor</code> with a bounded queue", "cores &times; (1 + wait time / compute time)"],
          ["Must run in order", "<code>newSingleThreadExecutor()</code>", "1"],
          ["Delayed or periodic", "<code>newScheduledThreadPool(n)</code>", "Small"]
        ] },
        { type: "callout", tone: "warning", html: `<p>Async stages without an executor argument run on <code>ForkJoinPool.commonPool()</code>, which is sized for CPU work and shared by the whole JVM. Blocking calls there starve everything else. Pass your own executor for I/O.</p>` }
      ]
    },
    {
      id: "latches-barriers",
      title: "Latches and barriers: waiting for a group",
      kicker: "Synchronizers",
      blocks: [
        { type: "compare", items: [
          { title: "CountDownLatch", tone: "info", html: `<p>Starts at N. Workers call <code>countDown()</code>; waiters block in <code>await()</code> until it reaches zero. One-shot.</p><p>"Open the booking API once all five caches are warm." "Start N test threads at exactly the same moment."</p>` },
          { title: "CyclicBarrier", tone: "info", html: `<p>N threads call <code>await()</code>; all block until the last arrives, then all proceed and the barrier resets. Optional action runs once per round.</p><p>"Each game simulation step: every player computes a move, then the board updates."</p>` },
          { title: "Phaser", tone: "info", html: `<p>A reusable barrier where parties can register and deregister between phases.</p><p>Use when the number of participants changes over time.</p>` }
        ] },
        { type: "code", lang: "java", title: "A race-condition test with a start latch", code: `@Test
void neverDoubleBooks() throws Exception {
    Show show = new Show();
    int threads = 32;
    CountDownLatch start = new CountDownLatch(1);
    ExecutorService pool = Executors.newFixedThreadPool(threads);
    List<Future<Boolean>> results = new ArrayList<>();
    for (int i = 0; i < threads; i++) {
        String user = "u" + i;
        results.add(pool.submit(() -> { start.await(); return show.book("A1", user); }));
    }
    start.countDown();                                  // release everyone at once
    long winners = 0;
    for (Future<Boolean> f : results) if (f.get()) winners++;
    assertEquals(1, winners);
    pool.shutdown();
}` }
      ]
    },
    {
      id: "ordering",
      title: "Parallel, but ordered per key",
      kicker: "A common follow-up",
      blocks: [
        { type: "problem", html: `<p>Order events (created, paid, shipped) must be applied in sequence for each order, but there are thousands of orders. A single-threaded executor is correct but slow; a pool is fast but may apply "shipped" before "paid".</p>` },
        { type: "idea", html: `<p><strong>Partition by key.</strong> Create N single-threaded lanes and send every event for one order to lane <code>hash(orderId) mod N</code>. Events for one order stay in sequence on one lane; different orders run in parallel on different lanes. Kafka partitions and actor mailboxes apply the same idea.</p>` },
        { type: "code", lang: "java", title: "Keyed lanes", code: `final class KeyedExecutor {
    private final ExecutorService[] lanes;

    KeyedExecutor(int n) {
        lanes = new ExecutorService[n];
        for (int i = 0; i < n; i++) lanes[i] = Executors.newSingleThreadExecutor();
    }

    void submit(String key, Runnable task) {
        lanes[Math.floorMod(key.hashCode(), lanes.length)].execute(task);
    }
}` },
        { type: "tradeoffs", pros: ["Per-key order without any locks on the entity", "Different keys run in parallel", "The entity's state is confined to one thread"], cons: ["A hot key overloads one lane while others idle", "Changing N remaps keys (drain first)", "A slow task blocks every key on its lane"] }
      ]
    },
    {
      id: "shutdown-cancel",
      title: "Shutdown, interruption and scheduled work",
      kicker: "Lifecycle",
      blocks: [
        { type: "steps", title: "Stopping an executor cleanly", items: [
          "<code>shutdown()</code>: stop accepting new tasks; queued and running tasks finish.",
          "<code>awaitTermination(timeout)</code>: wait for them, with a bound.",
          "<code>shutdownNow()</code>: if the timeout passes, interrupt running tasks and get back the list of tasks that never started.",
          "For hand-written consumer threads, put a <strong>poison pill</strong> item on the queue (one per consumer) that tells it to exit after draining."
        ] },
        { type: "callout", tone: "mistake", html: `<p>Swallowing <code>InterruptedException</code> with an empty catch. Interruption is how Java asks a thread to stop; if you catch it, either rethrow it or restore the flag with <code>Thread.currentThread().interrupt()</code> so the code above you can see it.</p>` },
        { type: "code", lang: "java", title: "Seat holds that expire safely", code: `private final ScheduledExecutorService timers = Executors.newScheduledThreadPool(1);

Hold hold(Seat seat, String userId) {
    if (!seat.tryHold(userId)) throw new SeatUnavailableException();
    Hold h = new Hold(UUID.randomUUID(), seat, userId);
    timers.schedule(() -> seat.releaseIfHeldBy(h.id()), 10, TimeUnit.MINUTES);
    return h;
}
// releaseIfHeldBy must be conditional (CAS or the seat's lock): if the user has
// already paid, the seat is BOOKED and the timer must leave it alone.` },
        { type: "quiz", q: "A bounded buffer uses one monitor with <code>wait()</code> and <code>notify()</code> (not notifyAll). Two producers and two consumers sometimes all end up waiting forever even though the buffer has room. Why?", options: [
          "notify() releases the lock before the state changes",
          "notify() can wake a thread of the same kind (a consumer waking a consumer), which sees no change and waits again, so the thread that could make progress is never woken",
          "wait() must be called outside synchronized",
          "Producers and consumers need separate thread pools"
        ], answer: 1, explain: `<p>With several kinds of waiters on one monitor, <code>notify()</code> picks an arbitrary waiter. If a consumer's signal wakes another consumer while the buffer is empty, that consumer goes back to sleep and the producers who could fill the buffer stay asleep. Use <code>notifyAll()</code>, or separate <code>Condition</code>s for "not full" and "not empty".</p>` }
      ]
    }
  ],
  takeaways: [
    "Producer-consumer with a bounded <code>BlockingQueue</code> is the default answer to \"hand work to background threads\".",
    "Every bounded queue needs a full-queue policy: block, block with timeout, or reject and count.",
    "Hand-written waits must loop on the condition and signal after changing state; prefer library synchronizers.",
    "Executors are producer-consumer already built; <code>CompletableFuture</code> composes async steps; pass your own executor for I/O.",
    "Latches wait for a group once; barriers line up a group every round.",
    "Partition by key onto single-threaded lanes to get parallelism and per-key ordering together.",
    "Plan the lifecycle: graceful shutdown, never swallow interrupts, and make timed releases conditional."
  ],
  furtherReading: [
    { title: "Hello Interview: Coordination", url: "https://www.hellointerview.com/learn/low-level-design/concurrency/coordination", note: "The section these notes follow." },
    { title: "BlockingQueue (Java 21 API)", url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/BlockingQueue.html" },
    { title: "CompletableFuture (Java 21 API)", url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/CompletableFuture.html" },
    { title: "Java Concurrency in Practice, chapters 5 to 8 and 14", note: "Building blocks, task execution, cancellation, thread pools and custom synchronizers." }
  ]
};
