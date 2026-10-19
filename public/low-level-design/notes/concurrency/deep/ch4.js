// Deep dive: Chapter 4, Scarcity. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch4 = {
  hook: `<p>Some resources can't be multiplied on demand: a database accepts a fixed number of connections, a GPU runs a few inference jobs at once, a partner API allows 100 calls per second. Scarcity questions ask you to share such a resource among many threads without exceeding the limit, and to decide what callers experience when demand is higher than supply. That second part is where most answers are weak.</p>`,
  sections: [
    {
      id: "limits",
      title: "Two kinds of limit",
      kicker: "The problem",
      blocks: [
        { type: "compare", items: [
          { title: "Concurrency limit", tone: "info", html: `<p>"At most N in use <em>at the same time</em>." Database connections, worker threads, GPU slots, open files, a printer.</p><p>Tools: semaphore, resource pool, bounded executor.</p>` },
          { title: "Rate limit", tone: "info", html: `<p>"At most R per <em>unit of time</em>." API quotas, login attempts per minute, SMS per user per day.</p><p>Tools: token bucket, fixed or sliding window.</p>` }
        ] },
        { type: "text", html: `<p>They are related by <strong>Little's law</strong>: items in the system = arrival rate &times; time each one spends there. A pool of 10 connections, each held 50 ms per query, can serve at most 10 / 0.05 s = 200 queries per second. If 300 arrive, a concurrency limit turns into a queue that grows without bound, unless you decide otherwise.</p>` },
        { type: "callout", tone: "interview", html: `<p>For any limit, answer three questions out loud: <strong>what is the limit</strong> and why that number, <strong>what happens at the limit</strong> (wait, time out, reject, degrade), and <strong>how callers find out</strong> (blocking call, exception, HTTP 429/503).</p>` }
      ]
    },
    {
      id: "semaphores",
      title: "Semaphores: capping concurrent use",
      kicker: "The core tool",
      blocks: [
        { type: "idea", html: `<p>A <code>Semaphore</code> is a counter of permits. <code>acquire()</code> takes a permit, waiting if none are left; <code>release()</code> gives one back. With N permits, at most N threads are inside the guarded section at once, whatever the section does.</p>` },
        { type: "code", lang: "java", title: "Limiting calls to a slow dependency", code: `final class ThrottledClient {
    private final Semaphore permits;
    private final PartnerApi api;

    ThrottledClient(PartnerApi api, int maxInFlight) {
        this.api = api;
        this.permits = new Semaphore(maxInFlight, true);    // fair: first come, first served
    }

    Response call(Request r) throws InterruptedException {
        if (!permits.tryAcquire(250, TimeUnit.MILLISECONDS)) {
            throw new BusyException("partner API saturated");
        }
        try {
            return api.send(r);
        } finally {
            permits.release();                               // always, even on exceptions
        }
    }
}` },
        { type: "table", title: "Semaphore vs lock", headers: ["", "Lock (synchronized / ReentrantLock)", "Semaphore"], rows: [
          ["Holders at once", "1", "N"],
          ["Owner", "The thread that locked must unlock", "None: any thread may release"],
          ["Reentrant", "Yes", "No"],
          ["Purpose", "Protect the consistency of state", "Cap how many use a resource"]
        ] },
        { type: "callout", tone: "mistake", html: `<p>Releasing a permit you never acquired (for example in a <code>finally</code> that also runs when <code>tryAcquire</code> failed). The semaphore has no owner check, so the extra release silently raises the limit to N+1. Acquire before the <code>try</code>, release in its <code>finally</code>.</p>` }
      ]
    },
    {
      id: "pools",
      title: "Resource pools",
      kicker: "When the resource is an object",
      blocks: [
        { type: "text", html: `<p>When the scarce thing is a concrete object (a connection, a large buffer, a browser instance), keep N of them in a <code>BlockingQueue</code>. Borrowing is <code>poll(timeout)</code>, returning is <code>offer</code>. The queue's contents are the free objects, and its blocking is the waiting line.</p>` },
        { type: "code", lang: "java", title: "A minimal connection pool", code: `final class ConnectionPool implements AutoCloseable {
    private final BlockingQueue<Connection> idle;
    private final Supplier<Connection> factory;

    ConnectionPool(int size, Supplier<Connection> factory) {
        this.factory = factory;
        this.idle = new ArrayBlockingQueue<>(size);
        for (int i = 0; i < size; i++) idle.add(factory.get());
    }

    Connection borrow(Duration wait) throws InterruptedException {
        Connection c = idle.poll(wait.toMillis(), TimeUnit.MILLISECONDS);
        if (c == null) throw new PoolExhaustedException();
        return c.isValid() ? c : factory.get();              // replace broken connections
    }

    void giveBack(Connection c) {
        if (!idle.offer(c)) c.close();                       // never exceed the pool size
    }

    @Override public void close() { idle.forEach(Connection::close); }
}

// Caller
Connection c = pool.borrow(Duration.ofMillis(200));
try { runQuery(c); } finally { pool.giveBack(c); }` },
        { type: "lab", id: "semaphorePool", caption: "Push the arrival rate above permits divided by hold time. Compare how acquire(), a timeout and fail-fast behave: who waits, who fails, and how long." }
      ]
    },
    {
      id: "policies",
      title: "What happens at the limit",
      kicker: "The design decision",
      blocks: [
        { type: "table", headers: ["Policy", "Java", "Caller experiences", "Good for"], rows: [
          ["Block", "<code>acquire()</code>, <code>put()</code>, <code>take()</code>", "Waits as long as it takes", "Background jobs where latency doesn't matter"],
          ["Block with timeout", "<code>tryAcquire(t)</code>, <code>offer(e, t)</code>, <code>poll(t)</code>", "Waits briefly, then an error", "Interactive requests: the usual default"],
          ["Reject immediately", "<code>tryAcquire()</code>, <code>offer(e)</code>, <code>AbortPolicy</code>", "Instant error (HTTP 429/503)", "Load shedding, callers with retries or fallbacks"],
          ["Slow the producer", "<code>CallerRunsPolicy</code>, blocking put", "Its own thread does the work", "Pipelines where losing work is unacceptable"],
          ["Degrade", "Fallback branch", "Cached, partial or default answer", "Recommendations, non-critical widgets"]
        ] },
        { type: "callout", tone: "insight", html: `<p>If demand is permanently higher than capacity, no policy saves everyone. Blocking forever makes every caller late, timeouts and rejection make some callers fail quickly, and degrading gives everyone a worse answer. Choose deliberately; the worst outcome is the one nobody chose: an unbounded queue that grows until the process dies.</p>` }
      ]
    },
    {
      id: "bounded-executors",
      title: "Bounded executors and rejection policies",
      kicker: "Threads are scarce too",
      blocks: [
        { type: "text", html: `<p>Threads and queued tasks are both limited resources. <code>Executors.newFixedThreadPool</code> bounds threads but not its queue, so it can accumulate unlimited work. A hand-built <code>ThreadPoolExecutor</code> bounds both and makes you choose a rejection policy.</p>` },
        { type: "code", lang: "java", title: "Bounded on both sides", code: `ThreadPoolExecutor pool = new ThreadPoolExecutor(
        8,                                   // core threads
        16,                                  // max threads (added only when the queue is full)
        30, TimeUnit.SECONDS,                // idle time before extra threads exit
        new ArrayBlockingQueue<>(500),       // at most 500 waiting tasks
        new ThreadPoolExecutor.CallerRunsPolicy());` },
        { type: "steps", title: "How a ThreadPoolExecutor places a new task", items: [
          "Fewer than <em>core</em> threads running: start a new thread for it.",
          "Otherwise, the queue has room: enqueue it.",
          "Otherwise, fewer than <em>max</em> threads: start an extra thread.",
          "Otherwise: hand it to the <strong>rejection policy</strong>."
        ] },
        { type: "table", headers: ["Rejection policy", "Behaviour"], rows: [
          ["<code>AbortPolicy</code> (default)", "Throws <code>RejectedExecutionException</code>; the caller decides"],
          ["<code>CallerRunsPolicy</code>", "The submitting thread runs the task, which slows submission: built-in backpressure"],
          ["<code>DiscardPolicy</code>", "Drops the new task silently (rarely what you want)"],
          ["<code>DiscardOldestPolicy</code>", "Drops the oldest queued task and retries the new one"]
        ] }
      ]
    },
    {
      id: "rate-limiting",
      title: "Rate limiting, thread-safely",
      kicker: "Limits over time",
      blocks: [
        { type: "text", html: `<p>A <strong>token bucket</strong> holds up to <em>b</em> tokens and refills at <em>r</em> tokens per second. Each request spends one token or is rejected. It allows short bursts (up to <em>b</em>) while holding the long-run rate to <em>r</em>. Refilling lazily, from the time elapsed since the last call, avoids a background thread.</p>` },
        { type: "code", lang: "java", title: "Per-user token buckets", code: `final class TokenBucket {
    private final double capacity, refillPerNano;
    private double tokens;
    private long lastNanos;

    TokenBucket(double capacity, double perSecond) {
        this.capacity = capacity;
        this.refillPerNano = perSecond / 1e9;
        this.tokens = capacity;
        this.lastNanos = System.nanoTime();
    }

    synchronized boolean tryAcquire() {                 // refill + spend must be one atomic step
        long now = System.nanoTime();
        tokens = Math.min(capacity, tokens + (now - lastNanos) * refillPerNano);
        lastNanos = now;
        if (tokens < 1) return false;
        tokens--;
        return true;
    }
}

final class RateLimiter {
    private final ConcurrentHashMap<String, TokenBucket> buckets = new ConcurrentHashMap<>();

    boolean allow(String userId) {
        return buckets.computeIfAbsent(userId, id -> new TokenBucket(100, 100)).tryAcquire();
    }
}` },
        { type: "lab", id: "tokenBucket", caption: "Compare the token bucket with a fixed window on bursts at window edges: the fixed window can let through twice its limit within one real second." },
        { type: "keypoints", items: [
          "Locking per bucket means different users never contend; only one user's concurrent requests serialize.",
          "<code>computeIfAbsent</code> guarantees one bucket per user even when two first requests race.",
          "Evict idle buckets (a scheduled sweep or a cache with expiry) or the map grows forever.",
          "Across several servers, the in-memory bucket becomes a shared store such as Redis; that's a high-level design question."
        ] }
      ]
    },
    {
      id: "isolation-fairness",
      title: "Bulkheads, fairness and reservations",
      kicker: "Sharing well",
      blocks: [
        { type: "text", html: `<p>One shared limit lets one bad actor use it all. If every request thread can block on a slow payment API, a payment outage takes search and browsing down too. A <strong>bulkhead</strong> gives each dependency or tenant its own semaphore or pool, so one can be exhausted while the others keep working.</p>` },
        { type: "code", lang: "java", title: "One limit per dependency", code: `private final Map<String, Semaphore> bulkheads = Map.of(
        "payments",  new Semaphore(20),
        "search",    new Semaphore(50),
        "reviews",   new Semaphore(10));

<T> T guarded(String dependency, Callable<T> call, Supplier<T> fallback) throws Exception {
    Semaphore s = bulkheads.get(dependency);
    if (!s.tryAcquire(100, TimeUnit.MILLISECONDS)) return fallback.get();
    try { return call.call(); } finally { s.release(); }
}` },
        { type: "tradeoffs", title: "Fair vs unfair permits and locks", prosLabel: "Fair", consLabel: "Unfair (the default)", pros: ["Waiters served in arrival order", "No starvation of slow or unlucky threads", "Predictable tail latency"], cons: ["Higher throughput: a running thread can grab a just-released permit", "No hand-off cost to wake the oldest waiter", "Starvation possible but rare in practice"] },
        { type: "callout", tone: "tip", html: `<p>Reserve capacity for what must never fail: keep one or two connections for health checks and admin operations, or give urgent tasks a separate pool. A full pool should never stop the service from reporting that it is full.</p>` },
        { type: "quiz", q: "A service has 20 database connections; each request holds one for about 40 ms. Peak traffic is 800 requests per second and callers use <code>acquire()</code> with no timeout. What happens at peak?", options: [
          "Nothing: 20 connections can serve 800 requests per second",
          "The pool can serve about 500 per second, so waiters pile up, latency grows without bound and threads block until the service stalls",
          "The JVM creates extra connections automatically",
          "Requests beyond 20 fail immediately with an exception"
        ], answer: 1, explain: `<p>By Little's law, capacity is 20 / 0.04 s = 500 requests per second. The other 300 per second join an ever-growing wait line, and with no timeout every request thread eventually blocks there. Add a timeout or fail-fast policy, shorten queries, cache reads, or raise the pool size only if the database can handle more connections.</p>` }
      ]
    }
  ],
  takeaways: [
    "Separate concurrency limits (N at once: semaphores, pools) from rate limits (R per second: token buckets, windows).",
    "Little's law sizes a pool: maximum throughput is permits divided by hold time.",
    "Acquire before <code>try</code>, release in <code>finally</code>; a leaked or extra permit silently changes the limit.",
    "Every limit needs an explicit policy: block, time out, reject, slow the producer or degrade.",
    "Bound executors on both threads and queue, and choose the rejection policy on purpose.",
    "A token bucket's refill and spend must be one atomic step; keep one bucket per key via <code>computeIfAbsent</code>.",
    "Bulkheads isolate dependencies and tenants; reserve capacity for health checks and critical paths."
  ],
  furtherReading: [
    { title: "Hello Interview: Scarcity", url: "https://www.hellointerview.com/learn/low-level-design/concurrency/scarcity", note: "The section these notes follow." },
    { title: "Semaphore (Java 21 API)", url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/Semaphore.html" },
    { title: "ThreadPoolExecutor (Java 21 API)", url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/ThreadPoolExecutor.html" },
    { title: "Release It! (Michael Nygard)", note: "The origin of bulkheads and circuit breakers as named stability patterns." }
  ]
};
