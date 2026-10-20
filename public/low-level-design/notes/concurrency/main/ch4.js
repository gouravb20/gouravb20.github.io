// Main tab: Chapter 4, Scarcity. Format: DeepSection[] in public/shared/notes.d.ts.
window.MAIN = window.MAIN || {};
MAIN.ch4 = [
  {
    id: "three-answers",
    title: "Every limit needs three answers",
    kicker: "Mental model",
    blocks: [
      { type: "text", html: `<p>Scarcity questions start from something you can't multiply on demand: database connections, worker threads, GPU slots, a partner's API quota. The design has to share it among many threads without ever exceeding it, and it has to behave sensibly when demand is higher than supply. Most weak answers get the first part right and never address the second.</p><p>There are two kinds of limit. A <strong>concurrency limit</strong> caps how many callers use something <em>at the same time</em>, and is enforced with semaphores, pools and bounded executors. A <strong>rate limit</strong> caps how many uses happen <em>per unit of time</em>, and is enforced with token buckets and sliding windows. Whichever kind you face, answer three questions out loud.</p>` },
      { type: "keypoints", items: [
        "<strong>What is the limit, and why that number?</strong> It might come from the dependency (the database allows 50 connections), from cost, or from your own measurements.",
        "<strong>What happens to a caller at the limit?</strong> It waits, waits with a timeout, is rejected at once, is slowed down, or gets a degraded answer.",
        "<strong>How does the caller find out?</strong> A blocking call, a false return value, an exception, or an HTTP 429 or 503."
      ] }
    ]
  },
  {
    id: "size-it",
    title: "Size it before you build it",
    kicker: "Worked example",
    blocks: [
      { type: "text", html: `<p>A reporting service exports large reports. Each export keeps a worker and a database connection busy for about four seconds. The service has eight export workers. At month end, customers request about 300 exports a minute. Will it cope?</p>` },
      { type: "steps", items: [
        "<strong>Capacity:</strong> throughput equals concurrency divided by time held, so 8 workers / 4 s = 2 exports per second, or 120 a minute.",
        "<strong>Demand:</strong> 300 a minute is 5 per second.",
        "<strong>Gap:</strong> 3 exports per second can't be served. With unbounded waiting, the backlog grows by about 180 every minute and won't drain until the peak ends; every caller waits longer than the one before.",
        "<strong>Options:</strong> add workers only if the database can take more connections; make exports faster; accept exports as background jobs with a bounded backlog and email the result; and cap each tenant so one customer can't take all eight slots."
      ] },
      { type: "callout", tone: "insight", html: `<p>This is Little's law: items in the system = arrival rate &times; time each one spends there. Rearranged, a limit of N concurrent users each holding the resource for W seconds supports at most N / W arrivals per second. Thirty seconds of arithmetic like this tells you, and the interviewer, whether the limit will be hit and roughly how badly.</p>` }
    ]
  },
  {
    id: "cap-concurrent-use",
    title: "Capping concurrent use, with fair shares",
    kicker: "Semaphores",
    blocks: [
      { type: "text", html: `<p>The export service needs two limits: at most eight exports overall, and at most two per tenant so one large customer can't starve the rest. Each is a semaphore. The tenant check comes first and fails fast; the global slot is allowed a short wait.</p>` },
      { type: "code", lang: "java", title: "Export gate with global and per-tenant caps", code: `final class ExportGate {
    private final Semaphore global = new Semaphore(8);
    private final ConcurrentHashMap<String, Semaphore> perTenant = new ConcurrentHashMap<>();
    private final int tenantCap;

    ExportGate(int tenantCap) { this.tenantCap = tenantCap; }

    <T> T run(String tenantId, Callable<T> export) throws Exception {
        Semaphore mine = perTenant.computeIfAbsent(tenantId, t -> new Semaphore(tenantCap));
        if (!mine.tryAcquire()) throw new BusyException("tenant is at its export limit");
        try {
            if (!global.tryAcquire(2, TimeUnit.SECONDS)) throw new BusyException("all export slots busy");
            try {
                return export.call();
            } finally {
                global.release();
            }
        } finally {
            mine.release();
        }
    }
}` },
      { type: "text", html: `<p>Why it is safe: semaphores are thread-safe counters, and <code>computeIfAbsent</code> guarantees one semaphore per tenant even when a tenant's first two requests race. Each <code>release</code> sits in the <code>finally</code> of a <code>try</code> that is entered only after its <code>tryAcquire</code> succeeded, so a permit is never leaked by an exception and never released without being acquired. Both permits are always taken in the same order, tenant then global, so there is no circular waiting.</p>` },
      { type: "callout", tone: "mistake", html: `<p>Releasing in a <code>finally</code> that also runs when the acquire failed. A semaphore has no owner, so the extra release silently raises the limit to nine, then ten. Acquire before the <code>try</code>, release in its <code>finally</code>. Also plan for the per-tenant map growing with every tenant ever seen: evict idle entries or bound the map.</p>` }
    ]
  },
  {
    id: "cap-the-rate",
    title: "Capping the rate",
    kicker: "Rate limiters",
    blocks: [
      { type: "text", html: `<p>A rate limit counts uses inside a time window. Four algorithms come up, and an interviewer mostly wants to hear that you know their trade-offs and can make the one you choose thread-safe.</p>` },
      { type: "table", headers: ["Algorithm", "State per key", "Burst behaviour", "Weak spot"], rows: [
        ["Fixed window counter", "One counter and a window start", "Up to twice the limit across a window boundary", "Edge bursts"],
        ["Sliding window log", "One timestamp per request in the window", "Exact", "Memory grows with the limit"],
        ["Sliding window counter", "Two counters", "Close to exact, weighted estimate", "An approximation"],
        ["Token bucket", "Tokens and a last-refill time", "Bursts up to the bucket size, then the steady rate", "Two values that must update together"]
      ] },
      { type: "code", lang: "java", title: "Sliding-window log rate limiter", code: `final class SlidingWindowLimiter {
    private final int limit;
    private final long windowNanos;
    private final ArrayDeque<Long> stamps = new ArrayDeque<>();      // guarded by this

    SlidingWindowLimiter(int limit, Duration window) {
        this.limit = limit;
        this.windowNanos = window.toNanos();
    }

    synchronized boolean tryAcquire() {
        long now = System.nanoTime();
        while (!stamps.isEmpty() && now - stamps.peekFirst() >= windowNanos) {
            stamps.pollFirst();                                       // forget requests outside the window
        }
        if (stamps.size() >= limit) return false;
        stamps.addLast(now);
        return true;
    }
}` },
      { type: "text", html: `<p>Evicting old entries, checking the count and recording the new request form one critical section. Split them and two threads could both see room for one more request and both be admitted. For per-user limits, keep one limiter per user in a <code>ConcurrentHashMap</code> created with <code>computeIfAbsent</code>; each lock is then per user, so different users never contend.</p>` }
    ]
  },
  {
    id: "choose-the-policy",
    title: "Choosing what happens at the limit",
    kicker: "Interview",
    blocks: [
      { type: "table", headers: ["Caller", "Policy at the limit", "Why"], rows: [
        ["Interactive API request", "Short timeout, then 429 or 503", "A quick error the client can retry beats a request that hangs"],
        ["Background batch job", "Block until capacity frees up", "Latency doesn't matter and losing work isn't acceptable"],
        ["Analytics or metrics events", "Drop and count", "Fresh data matters more than complete data"],
        ["Health checks and admin actions", "Reserved capacity", "They must work precisely when everything else is full"],
        ["Non-critical feature such as recommendations", "Degrade to a cached or default answer", "The page still loads"]
      ] },
      { type: "callout", tone: "interview", html: `<p>A complete answer in four sentences: <em>"Exports are capped at eight because each holds a database connection and that's our share of the pool. Each tenant gets at most two, so one customer can't starve the rest. A tenant over its cap is rejected immediately; otherwise a request waits up to two seconds for a global slot and then gets a 503 with retry advice. Every permit is released in finally, and I'd alert on the rejection rate."</em></p>` },
      { type: "list", title: "Mistakes that lose points", items: [
        "<strong>Unbounded queues or pools.</strong> They don't remove the limit; they turn it into memory exhaustion.",
        "<strong>Waiting with no timeout.</strong> A slow dependency becomes a stuck service.",
        "<strong>One shared pool for every dependency.</strong> A slow payment API then takes search down too; give each its own limit, a bulkhead.",
        "<strong>Updating rate-limiter state outside a lock.</strong> Refill-then-spend or evict-then-count must be atomic, or bursts slip through.",
        "<strong>Per-key maps with no eviction.</strong> One entry per user ever seen is a slow memory leak."
      ] }
    ]
  }
];
