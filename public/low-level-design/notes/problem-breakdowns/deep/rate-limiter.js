// Deep dives: Rate Limiter (LLD). Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP["rate-limiter"] = {
  hook: `<p>The Solution tab's limiter is correct for one thread and a modest number of clients, and that is exactly what was agreed. The interview usually continues with "now what if...": many threads, millions of client IDs, a new algorithm, two limits on one endpoint, changing rules without a restart, several gateway servers. Each section below takes one follow-up, shows what breaks and gives the smallest change that fixes it.</p>`,
  sections: [
    {
      id: "thread-safety",
      title: "Making it thread-safe",
      kicker: "Follow-up: concurrency",
      blocks: [
        { type: "problem", html: `<p>A gateway handles requests on many threads. Two races appear in the single-threaded code:</p><ul><li><strong>Creating state:</strong> two first requests from a new client both find no bucket in the <code>HashMap</code> and both create one. Worse, concurrent writes can corrupt a plain <code>HashMap</code>.</li><li><strong>Updating state:</strong> refill-then-spend reads the token count and writes it back. Two threads that read the same count both spend "the last token".</li></ul>` },
        { type: "lab", id: "concurrentOvershoot", caption: "Raise the number of concurrent requests with only a few tokens left, and compare the plain update with a per-bucket lock and a CAS loop." },
        { type: "compare", title: "Three correct options", items: [
          { title: "Lock per client state", tone: "ok", html: `<p><code>ConcurrentHashMap</code> + <code>computeIfAbsent</code> to create; <code>synchronized (bucket)</code> around refill and spend. Simple, and clients never contend with each other. The usual interview answer.</p>` },
          { title: "Atomic compute in the map", tone: "ok", html: `<p>Do the whole update inside <code>buckets.compute(clientId, ...)</code>, which runs atomically per key. Compact, but the result has to be smuggled out of the lambda, and the lambda must stay tiny.</p>` },
          { title: "Immutable state + CAS", tone: "info", html: `<p>Keep an immutable <code>record State(double tokens, long lastMs)</code> in an <code>AtomicReference</code>; compute the next state and <code>compareAndSet</code>, retrying on conflict. Lock-free, more code.</p>` }
        ] },
        { type: "code", lang: "java", title: "Thread-safe token bucket: per-client locking", code: `final class TokenBucketLimiter implements Limiter {
    private static final class Bucket {
        double tokens; long lastMs;
        Bucket(double tokens, long lastMs) { this.tokens = tokens; this.lastMs = lastMs; }
    }

    private final ConcurrentHashMap<String, Bucket> buckets = new ConcurrentHashMap<>();
    private final int capacity;
    private final double refillPerMs;
    private final LongSupplier clockMs;

    // constructor as before

    public RateLimitResult tryAcquire(String clientId) {
        Bucket b = buckets.computeIfAbsent(clientId, id -> new Bucket(capacity, clockMs.getAsLong()));
        synchronized (b) {                                 // only this client's requests wait here
            long now = clockMs.getAsLong();
            b.tokens = Math.min(capacity, b.tokens + (now - b.lastMs) * refillPerMs);
            b.lastMs = now;
            if (b.tokens >= 1) { b.tokens -= 1; return RateLimitResult.allow((int) b.tokens); }
            return RateLimitResult.deny((long) Math.ceil((1 - b.tokens) / refillPerMs));
        }
    }
}` },
        { type: "code", lang: "java", title: "The lock-free alternative", code: `private record State(double tokens, long lastMs) {}
private final ConcurrentHashMap<String, AtomicReference<State>> states = new ConcurrentHashMap<>();

public RateLimitResult tryAcquire(String clientId) {
    AtomicReference<State> ref = states.computeIfAbsent(clientId,
            id -> new AtomicReference<>(new State(capacity, clockMs.getAsLong())));
    while (true) {
        State cur = ref.get();
        long now = clockMs.getAsLong();
        double tokens = Math.min(capacity, cur.tokens() + (now - cur.lastMs()) * refillPerMs);
        if (tokens < 1) {
            if (ref.compareAndSet(cur, new State(tokens, now))) {
                return RateLimitResult.deny((long) Math.ceil((1 - tokens) / refillPerMs));
            }
            continue;
        }
        if (ref.compareAndSet(cur, new State(tokens - 1, now))) {
            return RateLimitResult.allow((int) (tokens - 1));
        }
    }
}` },
        { type: "callout", tone: "mistake", html: `<p>Making <code>check</code> or <code>tryAcquire</code> <code>synchronized</code> on the limiter. It is correct, but every client of that endpoint now queues behind one lock, so one busy client slows everyone. Lock per client, not per limiter.</p>` },
        { type: "callout", tone: "tip", html: `<p>The endpoint map in <code>RateLimiter</code> needs nothing: it is built once and never changes (<code>Map.copyOf</code>), and immutable objects published through final fields are safe to read from any thread.</p>` }
      ]
    },
    {
      id: "memory",
      title: "Bounding memory: idle clients",
      kicker: "Follow-up: scale",
      blocks: [
        { type: "problem", html: `<p>Each limiter creates state for every client ID it ever sees and never removes it. Client IDs are effectively unbounded (API keys, user IDs, IP addresses), so the maps grow for as long as the process runs.</p>` },
        { type: "lab", id: "memoryEstimator", caption: "Move the number of distinct clients and the share that are active, then switch to the sliding log and raise its limit." },
        { type: "steps", title: "Evicting idle state", items: [
          "Record <code>lastAccessMs</code> in each client's state (the token bucket already has <code>lastMs</code>).",
          "Run a <code>ScheduledExecutorService</code> task every minute that removes entries idle longer than a TTL: <code>buckets.entrySet().removeIf(e -&gt; now - e.getValue().lastMs &gt; ttlMs)</code>.",
          "Choose the TTL per algorithm so removal is invisible: a token bucket idle for capacity / rate seconds is full again; a window's state is meaningless once its window has passed.",
          "Optionally cap the total entries and evict the least recently used, to survive a flood of fake client IDs."
        ] },
        { type: "code", lang: "java", title: "A sweeper in a few lines", code: `final class IdleSweeper implements AutoCloseable {
    private final ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor();

    IdleSweeper(List<Evictable> limiters, Duration every) {
        timer.scheduleWithFixedDelay(() -> limiters.forEach(Evictable::evictIdle),
                every.toMillis(), every.toMillis(), TimeUnit.MILLISECONDS);
    }

    @Override public void close() { timer.shutdownNow(); }
}

interface Evictable { void evictIdle(); }   // implemented by each limiter with its own TTL rule` },
        { type: "callout", tone: "warning", html: `<p>Eviction and a concurrent request can race: the sweeper removes a bucket while a request is updating it, and the request's change is lost. For a token bucket that is harmless (the removed bucket was nearly full anyway). Where it matters, remove with <code>buckets.remove(key, expectedValue)</code> and recheck idleness under the state's lock.</p>` },
        { type: "callout", tone: "insight", html: `<p>A caching library with expire-after-access (Caffeine, for example) gives you the same thing in one line. Mentioning it is fine; being able to explain the sweeper shows you understand what it does.</p>` }
      ]
    },
    {
      id: "new-algorithm",
      title: "Adding a new algorithm",
      kicker: "Follow-up: extensibility",
      blocks: [
        { type: "text", html: `<p>"Product wants a sliding window counter for <code>/upload</code>." With the Strategy and sealed-config design, the change is additive and the compiler guides it.</p>` },
        { type: "steps", items: [
          "Add a params record and list it in the sealed interface's <code>permits</code> clause.",
          "Write the limiter class implementing <code>Limiter</code>.",
          "The factory's <code>switch</code> no longer compiles until you add the new case, so it can't be forgotten.",
          "Teach the config parser the new <code>algorithm</code> name."
        ] },
        { type: "code", lang: "java", title: "Sliding window counter", code: `record SlidingWindowCounterParams(int maxRequests, long windowMs) implements LimitParams {}

final class SlidingWindowCounterLimiter implements Limiter {
    private static final class Counts { long start; int prev; int cur; }

    private final int max;
    private final long windowMs;
    private final LongSupplier clockMs;
    private final ConcurrentHashMap<String, Counts> counts = new ConcurrentHashMap<>();

    SlidingWindowCounterLimiter(SlidingWindowCounterParams p, LongSupplier clockMs) {
        this.max = p.maxRequests(); this.windowMs = p.windowMs(); this.clockMs = clockMs;
    }

    public RateLimitResult tryAcquire(String clientId) {
        Counts c = counts.computeIfAbsent(clientId, id -> new Counts());
        synchronized (c) {
            long now = clockMs.getAsLong();
            long start = now - (now % windowMs);
            if (c.start != start) {
                c.prev = (start - c.start == windowMs) ? c.cur : 0;   // previous window only if adjacent
                c.cur = 0;
                c.start = start;
            }
            double weight = 1.0 - (double) (now - start) / windowMs;
            double estimate = c.prev * weight + c.cur;
            if (estimate + 1 <= max) {
                c.cur++;
                return RateLimitResult.allow((int) Math.floor(max - estimate - 1));
            }
            return RateLimitResult.deny(start + windowMs - now);   // conservative upper bound
        }
    }
}

// Factory gains one line:
//   case SlidingWindowCounterParams c -> new SlidingWindowCounterLimiter(c, clockMs);` },
        { type: "callout", tone: "interview", html: `<p>Say which classes did <em>not</em> change: <code>RateLimiter</code>, the other limiters, the result type. That sentence is the point of the follow-up.</p>` }
      ]
    },
    {
      id: "multiple-rules",
      title: "Several limits on one endpoint",
      kicker: "Follow-up: composite rules",
      blocks: [
        { type: "problem", html: `<p>"<code>/search</code> should allow bursts of 20 per second but no more than 5,000 per day." One limiter per endpoint can't express two rules.</p>` },
        { type: "idea", html: `<p>A <strong>CompositeLimiter</strong> implements <code>Limiter</code> and holds several limiters. A request is allowed only if all of them allow it. <code>RateLimiter</code> still sees one <code>Limiter</code> per endpoint and doesn't change.</p>` },
        { type: "code", lang: "java", title: "Composite limiter", code: `final class CompositeLimiter implements Limiter {
    private final List<Limiter> parts;
    CompositeLimiter(List<Limiter> parts) { this.parts = List.copyOf(parts); }

    public RateLimitResult tryAcquire(String clientId) {
        int remaining = Integer.MAX_VALUE;
        long retry = 0;
        boolean allowed = true;
        for (Limiter l : parts) {
            RateLimitResult r = l.tryAcquire(clientId);
            if (!r.allowed()) { allowed = false; retry = Math.max(retry, r.retryAfterMs()); }
            remaining = Math.min(remaining, r.remaining());
        }
        return allowed ? RateLimitResult.allow(remaining) : RateLimitResult.deny(retry);
    }
}` },
        { type: "tradeoffs", prosLabel: "This simple version", consLabel: "Its catch", pros: ["No change to RateLimiter or existing limiters", "Config can list several rules per endpoint", "Remaining and retry-after combine naturally (min and max)"], cons: ["If the daily limit allows but the per-second one denies, the daily limiter has already counted the request", "Fix with a two-phase interface (canAcquire, then commit) if exact accounting matters"] }
      ]
    },
    {
      id: "time-and-testing",
      title: "Time, retry-after and testing",
      kicker: "Follow-up: quality",
      blocks: [
        { type: "text", html: `<p>Every algorithm depends on the current time, so tests that call <code>System.currentTimeMillis()</code> are slow (they sleep) and flaky. Injecting the clock makes every behaviour testable in microseconds.</p>` },
        { type: "code", lang: "java", title: "A deterministic test", code: `final class FakeClock implements LongSupplier {
    private long ms;
    public long getAsLong() { return ms; }
    void advance(long delta) { ms += delta; }
}

@Test
void tokenBucketRefillsAndCaps() {
    FakeClock clock = new FakeClock();
    Limiter limiter = new TokenBucketLimiter(new TokenBucketParams(3, 1.0), clock);

    assertTrue(limiter.tryAcquire("a").allowed());     // 2 left
    assertTrue(limiter.tryAcquire("a").allowed());     // 1 left
    assertTrue(limiter.tryAcquire("a").allowed());     // 0 left
    RateLimitResult denied = limiter.tryAcquire("a");
    assertFalse(denied.allowed());
    assertEquals(1000L, denied.retryAfterMs());         // one token per second

    clock.advance(1000);
    assertTrue(limiter.tryAcquire("a").allowed());     // exactly one refilled

    clock.advance(60_000);
    assertEquals(2, limiter.tryAcquire("a").remaining()); // capped at capacity, minus this one
    assertTrue(limiter.tryAcquire("b").allowed());     // other clients are independent
}` },
        { type: "keypoints", items: [
          "Use a <strong>monotonic</strong> source in production (<code>System.nanoTime()</code> converted to ms) so wall-clock adjustments can't refill buckets or freeze windows.",
          "Retry-after is the earliest time a retry <em>could</em> succeed; under concurrency another request may take that token first, so clients should still expect an occasional second denial.",
          "Test boundaries explicitly: exactly at a window edge, exactly when the oldest log entry expires, and a fractional token just under 1."
        ] }
      ]
    },
    {
      id: "reload-config",
      title: "Reloading rules without a restart",
      kicker: "Follow-up: dynamic config",
      blocks: [
        { type: "text", html: `<p>Reloading was out of scope, but it is a common stretch question. The clean approach keeps the endpoint map immutable and replaces it whole.</p>` },
        { type: "code", lang: "java", title: "Swap an immutable map", code: `final class RateLimiter {
    private record Rules(Map<String, Limiter> byEndpoint, Map<String, LimitParams> params, Limiter fallback) {}

    private volatile Rules rules;                       // replaced whole, read lock-free
    private final LimiterFactory factory;

    void reload(List<EndpointRule> newRules, LimitParams defaultParams) {
        Map<String, Limiter> limiters = new HashMap<>();
        Map<String, LimitParams> params = new HashMap<>();
        Rules old = rules;
        for (EndpointRule r : newRules) {
            boolean unchanged = old != null && r.params().equals(old.params().get(r.endpoint()));   // records compare by value
            limiters.put(r.endpoint(), unchanged ? old.byEndpoint().get(r.endpoint()) : factory.create(r.params()));
            params.put(r.endpoint(), r.params());
        }
        rules = new Rules(Map.copyOf(limiters), Map.copyOf(params), factory.create(defaultParams));
    }

    RateLimitResult check(String clientId, String endpoint) {
        Rules r = rules;                                  // one consistent snapshot per call
        return r.byEndpoint().getOrDefault(endpoint, r.fallback()).tryAcquire(clientId);
    }
}` },
        { type: "callout", tone: "insight", html: `<p>Decide what happens to client state when a rule changes. Reusing the old limiter when the parameters are identical avoids resetting everyone's quota on every reload; for a changed rule, starting fresh is simplest and usually acceptable.</p>` }
      ]
    },
    {
      id: "many-servers",
      title: "Beyond one process",
      kicker: "Follow-up: distribution",
      blocks: [
        { type: "text", html: `<p>With several gateway instances behind a load balancer, each in-memory limiter sees only part of a client's traffic. A limit of 100 per minute becomes 100 per minute <em>per instance</em>. This is where LLD hands over to system design; a strong answer names the options and their costs, then returns to the class design.</p>` },
        { type: "table", headers: ["Approach", "How", "Cost"], rows: [
          ["Split the limit", "Each of N instances enforces limit / N", "Inaccurate when traffic is uneven or N changes"],
          ["Sticky routing", "Route each client to the same instance (hash on client ID)", "Uneven load; limits reset when instances move"],
          ["Central store", "Keep counters in Redis; update atomically with a Lua script", "A network round trip per request; the store must be highly available"],
          ["Hybrid", "Count locally, sync to the central store in small batches", "Brief over-admission between syncs"]
        ] },
        { type: "callout", tone: "tip", html: `<p>The <code>Limiter</code> interface makes this a drop-in: a <code>RedisTokenBucketLimiter</code> implements the same method, so <code>RateLimiter</code> and the gateway code don't change.</p>` },
        { type: "quiz", q: "The limiter is made thread-safe by marking <code>RateLimiter.check</code> as <code>synchronized</code>. Under load, p99 latency for every client rises when one client floods <code>/search</code>. What is the best fix?", options: [
          "Mark the token count volatile and remove synchronized",
          "Lock per client state (synchronized on that client's bucket, created with computeIfAbsent) so different clients never wait on each other",
          "Add a bigger thread pool to the gateway",
          "Switch every endpoint to a fixed window"
        ], answer: 1, explain: `<p>A single lock serialises every check for every client, so one heavy client delays all others. The invariant only spans one client's state, so lock (or CAS) just that state. <code>volatile</code> alone doesn't make refill-and-spend atomic, and more threads only queue on the same lock.</p>` }
      ]
    }
  ],
  takeaways: [
    "Two races appear with threads: creating state (use computeIfAbsent) and refill-then-spend (make it atomic per client).",
    "Lock per client state or use CAS on an immutable state; never one lock around the whole limiter.",
    "Evict idle clients with a TTL chosen so removal doesn't change behaviour; watch the sliding log's per-request cost.",
    "New algorithms are additive: a params record, a limiter class, one factory case enforced by the compiler.",
    "A CompositeLimiter adds multiple rules per endpoint without touching RateLimiter.",
    "Inject a monotonic clock; test refill, caps, boundaries and retry-after deterministically.",
    "Reload by swapping an immutable rules snapshot; distribution is a system design follow-up that the Limiter interface absorbs."
  ],
  furtherReading: [
    { title: "Hello Interview: Rate Limiter (LLD) problem breakdown", url: "https://www.hellointerview.com/learn/low-level-design/problem-breakdowns/rate-limiter", note: "The problem these notes follow." },
    { title: "ConcurrentHashMap (Java 21 API)", url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/ConcurrentHashMap.html", note: "computeIfAbsent and compute are atomic per key." },
    { title: "Concurrency for Low-Level Design: Scarcity", note: "The token bucket lab and rate limiting section in this site's concurrency notes." }
  ]
};
