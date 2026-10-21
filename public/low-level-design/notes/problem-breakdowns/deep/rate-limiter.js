// Deep dives: Rate Limiter (LLD practice set). Format: DeepDive in public/shared/notes.d.ts.
window.DEEP = window.DEEP || {};
DEEP["rate-limiter"] = {
  hook: `<p>Once the core works, interviewers add twists to see whether the design bends without breaking: heavy concurrency, millions of client IDs, a new algorithm, paid tiers, two limits on one endpoint, a fleet of gateways. You rarely implement them in full; you show which class changes and why the rest doesn't. Mid-level candidates may get one or two, senior candidates several, in more depth.</p>`,
  sections: [
    {
      id: "thread-safety",
      title: "\"What happens when thousands of threads call check() at once?\"",
      kicker: "Follow-up: thread safety under load",
      blocks: [
        { type: "text", html: `<p>The solution already locks per client. Interviewers still probe it, usually by asking what would break without the locks and whether there is a faster option. Two races matter:</p><ul><li><strong>Creating state:</strong> two first requests from a new client both find no bucket and both create one, so one client gets two buckets. A plain <code>HashMap</code> can also be corrupted by concurrent writes.</li><li><strong>Updating state:</strong> refill-then-spend reads the token count and writes it back. Two threads that read "1 token left" both spend it.</li></ul>` },
        { type: "lab", id: "concurrentOvershoot", caption: "Raise the number of concurrent requests with only a few tokens left, and compare the plain update with a per-bucket lock and a CAS loop." },
        { type: "compare", items: [
          { title: "One lock on the limiter", tone: "bad", html: `<p><code>synchronized tryAcquire</code> (or <code>check</code>). Correct, but every client of the endpoint queues behind one lock, so one client flooding <code>/search</code> raises latency for everyone.</p>` },
          { title: "A lock per client (the solution)", tone: "ok", html: `<p><code>computeIfAbsent</code> creates the state once; <code>synchronized (bucket)</code> guards refill and spend. Clients never contend with each other, and the code stays readable. The usual interview answer.</p>` },
          { title: "Immutable state and CAS", tone: "info", html: `<p>An immutable <code>State(tokens, lastMs)</code> in an <code>AtomicReference</code>: compute the next state and <code>compareAndSet</code>, retrying on conflict. Lock-free, so a thread is never parked; more code, and retries under heavy contention on one client.</p>` }
        ] },
        { type: "code", lang: "java", title: "Lock-free token bucket with compare-and-set", code: `// Only TokenBucketLimiter's internals change; Limiter, RateLimiter and the factory don't.
private record State(double tokens, long lastMs) {}
private final ConcurrentHashMap<String, AtomicReference<State>> states = new ConcurrentHashMap<>();

public RateLimitResult tryAcquire(String clientId) {
    AtomicReference<State> ref = states.computeIfAbsent(clientId,
            id -> new AtomicReference<>(new State(capacity, clockMs.getAsLong())));
    while (true) {
        State cur = ref.get();
        long now = Math.max(cur.lastMs(), clockMs.getAsLong());
        double tokens = Math.min(capacity, cur.tokens() + (now - cur.lastMs()) * refillPerSecond / 1000.0);
        boolean allowed = tokens >= 1;
        State next = new State(allowed ? tokens - 1 : tokens, now);
        if (ref.compareAndSet(cur, next)) {             // nobody changed it since we read it: our decision stands
            return allowed ? RateLimitResult.allow((int) next.tokens())
                           : RateLimitResult.deny((long) Math.ceil((1 - tokens) * 1000.0 / refillPerSecond));
        }                                               // lost the race: re-read and decide again
    }
}` },
        { type: "keypoints", items: [
          "<strong>Which class changes:</strong> only the limiter's internals. The endpoint map in <code>RateLimiter</code> is immutable and needs nothing.",
          "The CAS compares references, and every attempt builds a new <code>State</code>, so a stale read can never win.",
          "Sliding log state is a deque, which has no cheap immutable copy; keep the lock there. Use CAS where the state is a couple of numbers."
        ] },
        { type: "callout", tone: "mistake", html: `<p>Marking the token count <code>volatile</code> and dropping the lock. Visibility is not atomicity: two threads still read the same count and both spend it.</p>` },
        { type: "quiz", q: "The limiter is made thread-safe by marking <code>RateLimiter.check</code> as <code>synchronized</code>. Under load, p99 latency rises for every client when one client floods <code>/search</code>. What is the best fix?", options: [
          "Mark the token count volatile and remove synchronized",
          "Lock per client state (synchronized on that client's bucket, created with computeIfAbsent) so different clients never wait on each other",
          "Add a bigger thread pool to the gateway",
          "Switch every endpoint to a fixed window"
        ], answer: 1, explain: `<p>A single lock serialises every check for every client, so one heavy client delays all others. The invariant only spans one client's state, so lock (or CAS) just that state. <code>volatile</code> alone doesn't make refill-and-spend atomic, and more threads only queue on the same lock.</p>` }
      ]
    },
    {
      id: "memory",
      title: "\"Client IDs are unbounded. What stops the maps growing forever?\"",
      kicker: "Follow-up: memory and idle clients",
      blocks: [
        { type: "problem", html: `<p>Each limiter creates state for every client ID it ever sees and never removes it. Client IDs are effectively unbounded (API keys, user IDs, IP addresses), so the maps grow for as long as the process runs, and the sliding log's state also grows with its limit.</p>` },
        { type: "lab", id: "memoryEstimator", caption: "Move the number of distinct clients and the share that are active, then switch to the sliding log and raise its limit." },
        { type: "steps", items: [
          "Every state already records when it was last touched (the bucket's <code>lastMs</code>, the log's newest entry, the window's start).",
          "Each limiter implements <code>evictIdle()</code> with a TTL that makes removal invisible: a token bucket idle for capacity / rate seconds is full again, so recreating it is identical; a log is empty once its newest entry has left the window.",
          "A scheduled sweeper calls <code>evictIdle()</code> on every limiter once a minute.",
          "Optionally cap the total entries and evict the least recently used, to survive a flood of fake client IDs."
        ] },
        { type: "code", lang: "java", title: "Evicting idle clients", code: `interface Evictable { void evictIdle(); }               // each limiter applies its own TTL rule

// In TokenBucketLimiter: Bucket gains "boolean retired", and the limiter implements Evictable.
private final long idleTtlMs;                           // ceil(capacity * 1000 / refillPerSecond): full again by then

public void evictIdle() {
    long now = clockMs.getAsLong();
    for (Map.Entry<String, Bucket> e : buckets.entrySet()) {
        Bucket b = e.getValue();
        synchronized (b) {
            if (now - b.lastMs > idleTtlMs) {
                b.retired = true;                       // a request already holding b will fetch a fresh one
                buckets.remove(e.getKey(), b);
            }
        }
    }
}

public RateLimitResult tryAcquire(String clientId) {
    while (true) {
        Bucket b = buckets.computeIfAbsent(clientId, id -> new Bucket(capacity, clockMs.getAsLong()));
        synchronized (b) {
            if (b.retired) continue;                    // evicted between lookup and lock: try again
            // ... refill and spend exactly as before
        }
    }
}

final class IdleSweeper implements AutoCloseable {
    private final ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor();

    IdleSweeper(List<Evictable> limiters, Duration every) {
        timer.scheduleWithFixedDelay(() -> limiters.forEach(Evictable::evictIdle),
                every.toMillis(), every.toMillis(), TimeUnit.MILLISECONDS);
    }

    @Override public void close() { timer.shutdownNow(); }
}` },
        { type: "keypoints", items: [
          "<strong>Which classes change:</strong> each limiter gains <code>evictIdle</code> and a <code>retired</code> flag; <code>IdleSweeper</code> is new. <code>RateLimiter</code> is untouched.",
          "Without the flag, a request that fetched a bucket just before the sweeper removed it would update an orphan, and the client's next request would get a second, full bucket.",
          "Iterating a <code>ConcurrentHashMap</code> while removing from it is safe: its iterators are weakly consistent and never throw."
        ] },
        { type: "callout", tone: "insight", html: `<p>A caching library with expire-after-access (Caffeine, for example) gives the same behaviour in one line. Mentioning it is fine; being able to explain the sweeper and its race shows you understand what the library does for you.</p>` }
      ]
    },
    {
      id: "new-algorithm",
      title: "\"Product wants a sliding window counter for /upload. What changes?\"",
      kicker: "Follow-up: adding an algorithm",
      blocks: [
        { type: "text", html: `<p>With the Strategy and sealed-config design the change is additive, and the compiler guides it. The sliding window counter is also the answer to "the log uses too much memory": it estimates the count over the last window from two fixed-window counters.</p>` },
        { type: "steps", items: [
          "Add a params record and list it in the sealed interface's <code>permits</code> clause.",
          "Write the limiter class implementing <code>Limiter</code>.",
          "The factory's <code>switch</code> stops compiling until you add the new case, so it can't be forgotten.",
          "Teach the config parser the new <code>algorithm</code> name."
        ] },
        { type: "code", lang: "java", title: "Sliding window counter", code: `record SlidingWindowCounterParams(int maxRequests, long windowMs) implements LimitParams {
    SlidingWindowCounterParams {
        if (maxRequests < 1 || windowMs < 1) throw new IllegalArgumentException("counter: maxRequests >= 1, windowMs >= 1");
    }
}

final class SlidingWindowCounterLimiter implements Limiter {
    private static final class Counts { long start; int prev; int cur; }   // guarded by its own monitor

    private final int max;
    private final long windowMs;
    private final LongSupplier clockMs;
    private final ConcurrentHashMap<String, Counts> counts = new ConcurrentHashMap<>();

    SlidingWindowCounterLimiter(SlidingWindowCounterParams p, LongSupplier clockMs) {
        this.max = p.maxRequests();
        this.windowMs = p.windowMs();
        this.clockMs = clockMs;
    }

    public RateLimitResult tryAcquire(String clientId) {
        Counts c = counts.computeIfAbsent(clientId, id -> new Counts());
        synchronized (c) {
            long now = clockMs.getAsLong();
            long start = now - now % windowMs;
            if (c.start != start) {
                c.prev = (start - c.start == windowMs) ? c.cur : 0;   // the previous window counts only if adjacent
                c.cur = 0;
                c.start = start;
            }
            double weight = 1.0 - (double) (now - start) / windowMs;  // share of the previous window still inside
            double estimate = c.prev * weight + c.cur;
            if (estimate + 1 <= max) {
                c.cur++;
                return RateLimitResult.allow((int) Math.floor(max - estimate - 1));
            }
            return RateLimitResult.deny(start + windowMs - now);      // an estimate: the old previous window drops out then
        }
    }
}

// LimiterFactory gains one case:
//   case SlidingWindowCounterParams c -> new SlidingWindowCounterLimiter(c, clockMs);` },
        { type: "callout", tone: "interview", html: `<p>Say which classes did <em>not</em> change: <code>RateLimiter</code>, the other limiters, the result type. That sentence is the point of the follow-up. On the worked example (3 per 1,000 ms) the counter denies the requests at 1000 to 1200 and admits 1700, where it estimates 0.9 requests left over from the previous window.</p>` }
      ]
    },
    {
      id: "per-tier",
      title: "\"Premium clients get ten times the limit. Where does that go?\"",
      kicker: "Follow-up: per-tier limits",
      blocks: [
        { type: "text", html: `<p>The tempting fix is a tier parameter on <code>check</code>, passed by the gateway from a request header. That puts the decision in the client's hands: anyone can send <code>X-Tier: enterprise</code>. The tier must come from the authenticated identity. The design question is then where "pick the limits for this client's tier" lives, and the answer is another <code>Limiter</code>: one that routes by tier to an inner limiter per tier.</p>` },
        { type: "code", lang: "java", title: "Per-tier limits", code: `enum Tier { FREE, PRO, ENTERPRISE }

/** Backed by the account service or the verified token; never by a header the client controls. Never returns null. */
interface TierLookup { Tier tierOf(String clientId); }

record TieredParams(Map<Tier, LimitParams> byTier, LimitParams otherwise) implements LimitParams {
    TieredParams {
        byTier = Map.copyOf(byTier);
        Objects.requireNonNull(otherwise, "a fallback rule is required");
    }
}
// sealed interface LimitParams permits ..., TieredParams

final class TieredLimiter implements Limiter {
    private final Map<Tier, Limiter> byTier;            // immutable; each inner limiter keeps its own per-client state
    private final Limiter otherwise;
    private final TierLookup tiers;

    TieredLimiter(Map<Tier, Limiter> byTier, Limiter otherwise, TierLookup tiers) {
        this.byTier = Map.copyOf(byTier);
        this.otherwise = otherwise;
        this.tiers = tiers;
    }

    public RateLimitResult tryAcquire(String clientId) {
        return byTier.getOrDefault(tiers.tierOf(clientId), otherwise).tryAcquire(clientId);
    }
}

// LimiterFactory now also takes a TierLookup, and builds the inner limiters recursively:
//   case TieredParams t -> new TieredLimiter(
//           t.byTier().entrySet().stream().collect(Collectors.toMap(Map.Entry::getKey, e -> create(e.getValue()))),
//           create(t.otherwise()), tiers);` },
        { type: "keypoints", items: [
          "<strong>Which classes change:</strong> a new params record, a new limiter, one factory case and a <code>TierLookup</code> dependency for the factory. <code>RateLimiter</code> and the existing algorithms don't change.",
          "Tiers can mix algorithms: free clients on a strict sliding log, enterprise on a generous token bucket.",
          "A client who upgrades starts with fresh state in the new tier's limiter, which is the generous direction; say so rather than migrating buckets."
        ] }
      ]
    },
    {
      id: "multiple-rules",
      title: "\"/search needs 20 per second and 5,000 per day. How?\"",
      kicker: "Follow-up: several rules per endpoint",
      blocks: [
        { type: "text", html: `<p>One limiter per endpoint can't express two rules, but a limiter made of limiters can. A <strong>CompositeLimiter</strong> implements <code>Limiter</code>, holds several, and allows a request only if all of them allow it (the Composite pattern). <code>RateLimiter</code> still sees one <code>Limiter</code> per endpoint.</p>` },
        { type: "code", lang: "java", title: "Composite limiter", code: `final class CompositeLimiter implements Limiter {
    private final List<Limiter> parts;                  // immutable; each part is thread-safe on its own

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
        { type: "tradeoffs", prosLabel: "This simple version", consLabel: "Its catch", pros: ["No change to RateLimiter or the existing limiters", "Config lists several rules per endpoint; the factory wraps them", "Remaining and retry-after combine naturally (the smallest remaining, the longest wait)"], cons: ["If the per-second rule denies after the daily rule allowed, the daily rule has already counted the request", "Exact accounting needs a two-phase interface (reserve on every part, then commit or release), with locks taken in a fixed order"] }
      ]
    },
    {
      id: "distributed",
      title: "\"What if there are twenty gateway instances?\"",
      kicker: "Follow-up: distributed limiting (staff)",
      blocks: [
        { type: "text", html: `<p>Behind a load balancer, each in-memory limiter sees only part of a client's traffic: a limit of 100 per minute becomes 100 per minute <em>per instance</em>. This is where low-level design hands over to system design. A strong answer names the options and their costs in a minute, then returns to the class design.</p>` },
        { type: "table", headers: ["Approach", "How", "Cost"], rows: [
          ["Split the limit", "Each of N instances enforces limit / N", "Inaccurate when traffic is uneven or N changes"],
          ["Sticky routing", "Route each client to one instance by hashing the client ID", "Uneven load; limits reset when instances move"],
          ["Central store", "Counters in Redis, updated atomically by a Lua script per check", "A network round trip per request; the store must be highly available, and you choose fail-open or fail-closed"],
          ["Hybrid", "Count locally, sync to the central store in small batches", "Brief over-admission between syncs"]
        ] },
        { type: "callout", tone: "tip", html: `<p>The <code>Limiter</code> interface makes this a drop-in: a <code>RedisTokenBucketLimiter</code> implements the same method, the factory gains a case, and <code>RateLimiter</code> and the gateway code don't change. The atomic script plays the role the per-client lock plays in memory.</p>` }
      ]
    }
  ],
  takeaways: [
    "Follow-ups should touch one or two classes: the limiter's internals for concurrency and eviction, a new record plus limiter plus factory case for algorithms and tiers.",
    "Thread safety is per client: computeIfAbsent to create, then a lock or a CAS on that client's state; never one lock around the whole limiter.",
    "Evict idle clients with a TTL that makes removal invisible, and retire state under its lock so an in-flight request can't update an orphan.",
    "Tiers come from the authenticated identity; a TieredLimiter routes to an inner limiter per tier.",
    "A CompositeLimiter adds several rules per endpoint; exact accounting needs reserve-then-commit.",
    "Distribution is system design: a Redis-backed Limiter with atomic scripts slots in behind the same interface."
  ],
  furtherReading: [
    { title: "Hello Interview: Rate Limiter (LLD) problem breakdown", url: "https://www.hellointerview.com/learn/low-level-design/problem-breakdowns/rate-limiter", note: "The problem these notes follow." },
    { title: "ConcurrentHashMap (Java 21 API)", url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/ConcurrentHashMap.html", note: "computeIfAbsent is atomic per key; iterators are weakly consistent." },
    { title: "Concurrency for Low-Level Design: Scarcity", note: "The token bucket lab and rate limiting section in this site's concurrency notes." }
  ]
};
