// Low-level design problem breakdowns - interactive notes data.
// Original study notes with Java examples. The problem follows Hello Interview's LLD Rate Limiter breakdown:
// https://www.hellointerview.com/learn/low-level-design/problem-breakdowns/rate-limiter
window.DATA = {
  book: {
    title: `Low-Level Design Problem Breakdowns`,
    subtitle: `Classic low-level design interview problems, each worked through on one page: the <strong>problem</strong> and its requirements, a <strong>solution</strong> from entities to working Java code, the <strong>deep dives</strong> an interviewer pushes on, and what is expected at each level, with labs embedded where each decision comes up. Part I: <strong>Rate Limiter</strong>, an in-memory, config-driven limiter for an API gateway. The problem follows Hello Interview's <a href="https://www.hellointerview.com/learn/low-level-design/problem-breakdowns/rate-limiter" target="_blank" rel="noopener" style="color:var(--accent)">Rate Limiter</a> breakdown; these notes, code and labs are written independently, so read the original walkthrough there.`,
    storageKey: `lld_problem_breakdowns_notes_v1`,
    appId: `lld-problem-breakdowns-notes`,
    exportPrefix: `lld-problem-breakdowns-progress`,
    pillarsTitle: `Four habits for any LLD breakdown`,
    takeawaysTitle: `Ten things to remember`,
    labsIntro: `Each lab models one decision in the design and sits in the section where that decision comes up. Time is simulated, so runs are repeatable; read the numbers as shapes, not benchmarks.`,
    mono: `LP`,
    shortTitle: `LLD Problem Breakdowns`,
    tagline: `LLD interview prep`
  },
  parts: {
    1: `Part I &middot; Rate Limiter`
  },
  fourQuestions: [
    { cls: `what`, q: `Turn the prompt into a contract`, text: `Find out exactly what goes in and what comes out. For the rate limiter: a client ID and an endpoint in; allowed, remaining quota and a retry-after time out; a default rule when an endpoint has none. Write it down with the out-of-scope list.`, answer: `Rate Limiter: Problem tab.` },
    { cls: `where`, q: `Find the axis of variation`, text: `Most LLD problems have one thing that varies. Here it is the algorithm: each endpoint picks one, with its own parameters. Put that behind one interface and the rest of the design stays small and stable.`, answer: `Rate Limiter: Solution tab (entities, class design).` },
    { cls: `when`, q: `Get the core flow working first`, text: `Build the single-threaded version end to end: load config, build one limiter per endpoint, check requests. Only then add thread safety, eviction and reloading, when the interviewer asks.`, answer: `Rate Limiter: Solution tab (implementation).` },
    { cls: `how`, q: `Answer the follow-ups with small changes`, text: `"Make it thread-safe", "add an algorithm", "clients never leave", "reload config". A good design absorbs each one in a single class or a few lines, and you can say which.`, answer: `Rate Limiter: Deep Dives.` }
  ],
  takeaways: [
    `The rate limiter's contract: <strong>check(clientId, endpoint)</strong> returns <strong>allowed</strong>, <strong>remaining</strong> and <strong>retryAfterMs</strong> (null when allowed). Unknown endpoints use a <strong>default rule</strong>.`,
    `The axis of variation is the <strong>algorithm</strong>. One <code>Limiter</code> interface, one class per algorithm: the Strategy pattern.`,
    `Configuration is <strong>heterogeneous</strong>: model each algorithm's parameters as its own record behind a <strong>sealed interface</strong>, and build limiters in one <strong>factory</strong> with an exhaustive switch.`,
    `Create <strong>one limiter per endpoint</strong> at startup; each limiter keeps <strong>state per client</strong> in a map, created lazily on the first request.`,
    `<strong>Token bucket</strong> allows bursts up to capacity and holds the long-run rate; <strong>sliding window log</strong> is exact but stores a timestamp per request; <strong>fixed window</strong> is simplest but lets up to twice the limit through at window edges; <strong>sliding window counter</strong> approximates the log in constant space.`,
    `Refill lazily from elapsed time on each call; no background thread is needed. Read time from an injected <strong>clock</strong> so tests are deterministic.`,
    `<strong>Thread safety</strong>: refill-and-spend is a read-modify-write, so make it atomic per client (a lock on the client's state, or a CAS on an immutable state). Create state with <code>computeIfAbsent</code>. Never use one global lock.`,
    `<strong>Memory</strong> grows with every client ever seen. Evict idle client state (lazy expiry plus a periodic sweep), and beware the sliding log's per-request storage.`,
    `Adding an algorithm touches three places: a config record, a limiter class and one factory case; the sealed interface makes the compiler point at the missing case.`,
    `Distributed limiting (Redis, coordination across servers) is a system design question; in LLD, mention it as the next step and keep the in-process design clean.`
  ],
  chapters: [
    {
      id: `rate-limiter`, part: 1, number: 1,
      title: `Rate Limiter: config-driven, per endpoint, in memory`,
      overview: `Build the in-memory rate limiter inside an API gateway. Each endpoint is configured with an algorithm (token bucket, sliding window log, fixed window...) and that algorithm's parameters; every request arrives as a client ID and an endpoint, and the limiter answers whether it may proceed, how much quota is left and when to retry. The design that works puts each algorithm behind one <code>Limiter</code> interface, builds one limiter per endpoint from typed configuration through a factory, keeps per-client state inside each limiter, and leaves thread safety, eviction and reloading as clean extensions.`,
      source: { title: `Hello Interview: Rate Limiter (LLD) problem breakdown`, url: `https://www.hellointerview.com/learn/low-level-design/problem-breakdowns/rate-limiter` },
      problem: [
        {
          id: `prompt`,
          title: `What we are building`,
          kicker: `The prompt`,
          blocks: [
            { type: `problem`, html: `<p>An API gateway sits in front of many backend endpoints. Each endpoint needs its own request limit, and different endpoints want different limiting behaviour: search can tolerate bursts, order placement should be strict. A configuration service supplies one rule per endpoint, naming an algorithm and that algorithm's settings. Build the component inside the gateway that enforces those rules.</p>` },
            { type: `code`, lang: `json`, title: `Rules as they arrive from the configuration service`, code: `[
  { "endpoint": "/search",
    "algorithm": "TokenBucket",
    "params": { "capacity": 50, "refillPerSecond": 5 } },

  { "endpoint": "/orders",
    "algorithm": "SlidingWindowLog",
    "params": { "maxRequests": 100, "windowMs": 60000 } },

  { "endpoint": "/login",
    "algorithm": "FixedWindow",
    "params": { "maxRequests": 5, "windowMs": 60000 } }
]` },
            { type: `text`, html: `<p>Read the example closely: the <code>params</code> object is different for every algorithm. A token bucket has a capacity and a refill rate; window algorithms have a request count and a window length. That detail shapes the whole design.</p>` },
            { type: `callout`, tone: `tip`, html: `<p>"Rate limiter" also exists as a system design problem (a distributed service backed by Redis). This one is low-level design: one process, classes and code. Confirm that early so you don't spend ten minutes on infrastructure.</p>` }
          ]
        },
        {
          id: `clarifying`,
          title: `Questions that change the design`,
          kicker: `Clarifying`,
          blocks: [
            { type: `table`, headers: [`Ask`, `Answer to assume`, `What it decides`], rows: [
              [`What does a request give us?`, `A client ID (string) and an endpoint path`, `The public method's signature`],
              [`What do we return?`, `Allowed or not, requests remaining, and when to retry if denied`, `A result type, not a boolean`],
              [`Endpoint with no rule?`, `Apply a default rule; never reject just for missing config`, `A fallback limiter`],
              [`Do parameters differ per algorithm?`, `Yes, each algorithm has its own set`, `Typed config per algorithm`],
              [`One process or many servers?`, `One process, in memory`, `No network, no shared store`],
              [`Is config reloaded while running?`, `Loaded once at startup`, `Limiters can be built once`],
              [`Concurrent requests?`, `Start single-threaded; may come up later`, `Thread safety as an extension`]
            ] },
            { type: `callout`, tone: `insight`, html: `<p>When an interviewer says "don't worry about concurrency for now", they usually mean "show me a clean core first". Design so that thread safety can be added in one place later, and expect the question if you finish early.</p>` }
          ]
        },
        {
          id: `requirements`,
          title: `Final requirements`,
          kicker: `On the board`,
          blocks: [
            { type: `code`, lang: `text`, code: `Functional
  1. Rules are loaded once at startup: one per endpoint, each naming an
     algorithm and its algorithm-specific parameters.
  2. check(clientId, endpoint) decides whether the request may proceed,
     applying that endpoint's rule to that client.
  3. The result carries: allowed (boolean), remaining (int) and
     retryAfterMs (long, only when denied).
  4. Endpoints without a rule use a default rule.
  5. Supported to start: TokenBucket, SlidingWindowLog, FixedWindow.

Non-functional
  - Correct limits per (client, endpoint); constant or near-constant time per check.
  - Easy to add new algorithms.

Out of scope
  - Distributed limiting across servers (Redis, coordination).
  - Reloading rules at runtime.
  - Metrics, dashboards, config validation beyond basic checks.` },
            { type: `list`, title: `Things to say about the limits themselves`, items: [
              `Limits apply <strong>per client per endpoint</strong>: alice's searches don't use up bob's quota, nor alice's orders.`,
              `"Remaining" means requests still allowed right now: whole tokens left in a bucket, or slots left in the window.`,
              `"Retry after" is the earliest time a retry could succeed, so clients can back off instead of hammering.`
            ] }
          ]
        },
        {
          id: `algorithms`,
          title: `The algorithms in one page`,
          kicker: `Background`,
          blocks: [
            { type: `text`, html: `<p>You don't need to invent algorithms, but you must explain the common ones and their trade-offs, because the interviewer will ask why you would pick one.</p>` },
            { type: `table`, headers: [`Algorithm`, `How it works`, `State per client`, `Behaviour`], rows: [
              [`Fixed window`, `Count requests in the current calendar window (e.g. this minute); reset when a new window starts`, `Window start + count`, `Simple; up to 2&times; the limit across a window boundary`],
              [`Sliding window log`, `Keep the timestamp of every accepted request; allow if fewer than N fall in the last window`, `Up to N timestamps`, `Exact; memory grows with the limit`],
              [`Sliding window counter`, `Weighted sum of the previous and current fixed-window counts`, `Two counts + window start`, `Close to exact in constant space`],
              [`Token bucket`, `Bucket holds up to C tokens, refilled at R per second; each request spends one`, `Tokens + last refill time`, `Allows bursts up to C, long-run rate R`],
              [`Leaky bucket`, `Requests drain from a queue at a constant rate`, `Queue level + last leak time`, `Smooth output, no bursts`]
            ] },
            { type: `lab`, id: `algoCompare`, caption: `Send the same traffic through four algorithms with the same nominal limit. Try "bursts at window edges" to see the fixed window's weak spot, and compare the state each one keeps.` }
          ]
        }
      ],
      solution: [
        {
          id: `entities`,
          title: `Core entities`,
          kicker: `Nouns to classes`,
          blocks: [
            { type: `text`, html: `<p>Scan the requirements for nouns with state or behaviour: rule, algorithm, parameters, request, client, endpoint, result, limit. Keep the ones that earn a class; fold the rest into fields.</p>` },
            { type: `table`, headers: [`Candidate`, `Decision`, `Why`], rows: [
              [`RateLimiter`, `Class (entry point)`, `Owns the endpoint-to-limiter map and the default; exposes <code>check</code>`],
              [`Limiter`, `Interface`, `What every algorithm can do: decide for one client`],
              [`TokenBucketLimiter, SlidingWindowLogLimiter, FixedWindowLimiter`, `Classes`, `One per algorithm, each with its own per-client state`],
              [`Algorithm parameters`, `Records behind a sealed interface`, `Each algorithm's settings are different and typed`],
              [`EndpointRule`, `Record`, `Pairs an endpoint with its parameters`],
              [`LimiterFactory`, `Class`, `Turns a parameters record into the matching limiter`],
              [`RateLimitResult`, `Record`, `allowed, remaining, retryAfterMs`],
              [`Request, Client, Endpoint`, `Not classes`, `Just two strings passed to <code>check</code>`]
            ] },
            { type: `callout`, tone: `interview`, html: `<p>Resist a <code>Request</code> class with only two string fields, a <code>Client</code> class with only an id, or an abstract <code>AlgorithmBase</code> before you have code to share. Fewer, sharper classes read as better judgment.</p>` }
          ]
        },
        {
          id: `relationships`,
          title: `How the pieces fit`,
          kicker: `Relationships`,
          blocks: [
            { type: `diagram`, title: `One limiter per endpoint, state per client inside it`, caption: `RateLimiter routes each check to its endpoint's limiter (or the default). Each limiter keeps a map from client ID to that client's state. The factory builds limiters from typed parameters at startup.`, svg: `<svg viewBox="0 0 640 270" role="img" aria-label="RateLimiter holding limiters per endpoint, each with per-client state">
<defs><marker id="lp-rl-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="20" y="105" width="140" height="60" rx="10" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="90" y="131" text-anchor="middle" font-size="14" font-weight="700" style="fill: var(--dg-ink)">RateLimiter</text>
<text x="90" y="150" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">check(client, endpoint)</text>
<rect x="230" y="20" width="170" height="54" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="315" y="43" text-anchor="middle" font-size="13" font-weight="700" style="fill: var(--dg-ink)">/search</text>
<text x="315" y="61" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">TokenBucketLimiter</text>
<rect x="230" y="108" width="170" height="54" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="315" y="131" text-anchor="middle" font-size="13" font-weight="700" style="fill: var(--dg-ink)">/orders</text>
<text x="315" y="149" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">SlidingWindowLogLimiter</text>
<rect x="230" y="196" width="170" height="54" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-dasharray="5 4"/>
<text x="315" y="219" text-anchor="middle" font-size="13" font-weight="700" style="fill: var(--dg-ink)">default</text>
<text x="315" y="237" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">FixedWindowLimiter</text>
<rect x="460" y="20" width="160" height="54" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<text x="540" y="43" text-anchor="middle" font-size="12" style="fill: var(--dg-ink)">alice: 42.5 tokens</text>
<text x="540" y="61" text-anchor="middle" font-size="12" style="fill: var(--dg-ink)">bob: 50 tokens</text>
<rect x="460" y="108" width="160" height="54" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<text x="540" y="131" text-anchor="middle" font-size="12" style="fill: var(--dg-ink)">alice: [t1, t2, t3]</text>
<text x="540" y="149" text-anchor="middle" font-size="12" style="fill: var(--dg-ink)">carol: [t4]</text>
<line x1="160" y1="125" x2="226" y2="50" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#lp-rl-arrow)"/>
<line x1="160" y1="135" x2="226" y2="135" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#lp-rl-arrow)"/>
<line x1="160" y1="145" x2="226" y2="220" stroke-width="2" style="stroke: var(--dg-muted)" stroke-dasharray="5 4" marker-end="url(#lp-rl-arrow)"/>
<line x1="400" y1="47" x2="456" y2="47" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#lp-rl-arrow)"/>
<line x1="400" y1="135" x2="456" y2="135" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#lp-rl-arrow)"/>
<text x="428" y="38" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">per client</text>
</svg>` },
            { type: `compare`, title: `Where should per-client state live?`, items: [
              { title: `Inside each limiter (chosen)`, tone: `ok`, html: `<p>Each limiter owns <code>Map&lt;String, State&gt;</code> keyed by client. The state's shape belongs to the algorithm, so it stays private to the class that understands it. <code>RateLimiter</code> just routes.</p>` },
              { title: `One central map in RateLimiter`, tone: `warn`, html: `<p>A map keyed by (endpoint, client) holding generic state. Possible, but the state type then leaks out of the algorithm, or becomes <code>Object</code> with casts. Use only if you need cross-endpoint policies.</p>` }
            ] }
          ]
        },
        {
          id: `class-design`,
          title: `Class design`,
          kicker: `State and behaviour`,
          blocks: [
            { type: `code`, lang: `java`, title: `Types and signatures`, code: `// Result returned to the gateway
record RateLimitResult(boolean allowed, int remaining, Long retryAfterMs) {
    static RateLimitResult allow(int remaining)  { return new RateLimitResult(true, remaining, null); }
    static RateLimitResult deny(long retryAfterMs) { return new RateLimitResult(false, 0, retryAfterMs); }
}

// Typed, per-algorithm parameters
sealed interface LimitParams permits TokenBucketParams, SlidingWindowLogParams, FixedWindowParams {}
record TokenBucketParams(int capacity, double refillPerSecond) implements LimitParams {}
record SlidingWindowLogParams(int maxRequests, long windowMs) implements LimitParams {}
record FixedWindowParams(int maxRequests, long windowMs) implements LimitParams {}

record EndpointRule(String endpoint, LimitParams params) {}

// The axis of variation
interface Limiter {
    RateLimitResult tryAcquire(String clientId);
}

final class LimiterFactory {
    Limiter create(LimitParams p);
}

final class RateLimiter {
    RateLimiter(List<EndpointRule> rules, LimitParams defaultParams, LimiterFactory factory);
    RateLimitResult check(String clientId, String endpoint);
}` },
            { type: `keypoints`, items: [
              `<strong>Strategy</strong>: <code>Limiter</code> is the strategy interface; each algorithm is a strategy. <code>RateLimiter</code> never switches on algorithm names.`,
              `<strong>Factory</strong>: one place maps parameters to a limiter. With a sealed interface, Java 21's pattern-matching switch is checked for exhaustiveness.`,
              `<strong>Records</strong> for immutable data (results, parameters, rules); classes only where there is mutable state (limiters).`,
              `The time source (<code>LongSupplier</code> of milliseconds) is injected into limiters, so tests control time.`
            ] }
          ]
        },
        {
          id: `implementation`,
          title: `Implementation`,
          kicker: `Working code`,
          blocks: [
            { type: `code`, lang: `java`, title: `RateLimiter and the factory`, code: `final class RateLimiter {
    private final Map<String, Limiter> byEndpoint;
    private final Limiter fallback;

    RateLimiter(List<EndpointRule> rules, LimitParams defaultParams, LimiterFactory factory) {
        Map<String, Limiter> m = new HashMap<>();
        for (EndpointRule r : rules) m.put(r.endpoint(), factory.create(r.params()));
        this.byEndpoint = Map.copyOf(m);
        this.fallback = factory.create(defaultParams);
    }

    RateLimitResult check(String clientId, String endpoint) {
        return byEndpoint.getOrDefault(endpoint, fallback).tryAcquire(clientId);
    }
}

final class LimiterFactory {
    private final LongSupplier clockMs;
    LimiterFactory(LongSupplier clockMs) { this.clockMs = clockMs; }

    Limiter create(LimitParams p) {
        return switch (p) {
            case TokenBucketParams t      -> new TokenBucketLimiter(t, clockMs);
            case SlidingWindowLogParams s -> new SlidingWindowLogLimiter(s, clockMs);
            case FixedWindowParams f      -> new FixedWindowLimiter(f, clockMs);
        };
    }
}` },
            { type: `code`, lang: `java`, title: `Token bucket`, code: `final class TokenBucketLimiter implements Limiter {
    private static final class Bucket { double tokens; long lastMs; }

    private final int capacity;
    private final double refillPerMs;
    private final LongSupplier clockMs;
    private final Map<String, Bucket> buckets = new HashMap<>();

    TokenBucketLimiter(TokenBucketParams p, LongSupplier clockMs) {
        this.capacity = p.capacity();
        this.refillPerMs = p.refillPerSecond() / 1000.0;
        this.clockMs = clockMs;
    }

    public RateLimitResult tryAcquire(String clientId) {
        long now = clockMs.getAsLong();
        Bucket b = buckets.computeIfAbsent(clientId, id -> {
            Bucket nb = new Bucket(); nb.tokens = capacity; nb.lastMs = now; return nb;
        });
        b.tokens = Math.min(capacity, b.tokens + (now - b.lastMs) * refillPerMs);   // lazy refill
        b.lastMs = now;
        if (b.tokens >= 1) {
            b.tokens -= 1;
            return RateLimitResult.allow((int) b.tokens);
        }
        long wait = (long) Math.ceil((1 - b.tokens) / refillPerMs);
        return RateLimitResult.deny(wait);
    }
}` },
            { type: `code`, lang: `java`, title: `Sliding window log and fixed window`, code: `final class SlidingWindowLogLimiter implements Limiter {
    private final int max;
    private final long windowMs;
    private final LongSupplier clockMs;
    private final Map<String, Deque<Long>> logs = new HashMap<>();

    SlidingWindowLogLimiter(SlidingWindowLogParams p, LongSupplier clockMs) {
        this.max = p.maxRequests(); this.windowMs = p.windowMs(); this.clockMs = clockMs;
    }

    public RateLimitResult tryAcquire(String clientId) {
        long now = clockMs.getAsLong();
        Deque<Long> log = logs.computeIfAbsent(clientId, id -> new ArrayDeque<>());
        while (!log.isEmpty() && log.peekFirst() <= now - windowMs) log.pollFirst();   // drop expired
        if (log.size() < max) {
            log.addLast(now);
            return RateLimitResult.allow(max - log.size());
        }
        return RateLimitResult.deny(log.peekFirst() + windowMs - now);   // when the oldest expires
    }
}

final class FixedWindowLimiter implements Limiter {
    private static final class Window { long start; int count; }

    private final int max;
    private final long windowMs;
    private final LongSupplier clockMs;
    private final Map<String, Window> windows = new HashMap<>();

    FixedWindowLimiter(FixedWindowParams p, LongSupplier clockMs) {
        this.max = p.maxRequests(); this.windowMs = p.windowMs(); this.clockMs = clockMs;
    }

    public RateLimitResult tryAcquire(String clientId) {
        long now = clockMs.getAsLong();
        long start = now - (now % windowMs);
        Window w = windows.computeIfAbsent(clientId, id -> new Window());
        if (w.start != start) { w.start = start; w.count = 0; }          // new window: reset
        if (w.count < max) {
            w.count++;
            return RateLimitResult.allow(max - w.count);
        }
        return RateLimitResult.deny(start + windowMs - now);
    }
}` },
            { type: `callout`, tone: `warning`, html: `<p>This version is deliberately single-threaded (plain <code>HashMap</code>s and mutable state), matching the agreed scope. The Deep Dives show how to make it thread-safe without a global lock; mention that before the interviewer has to ask.</p>` }
          ]
        },
        {
          id: `walkthrough`,
          title: `Walking through requests`,
          kicker: `Check it works`,
          blocks: [
            { type: `steps`, items: [
              `Startup: the config service's JSON is parsed into <code>EndpointRule</code>s with typed params; <code>RateLimiter</code> asks the factory for one limiter per endpoint and one default.`,
              `<code>check("alice", "/search")</code>: map lookup finds the token-bucket limiter; alice has no bucket yet, so one is created full (50 tokens); one is spent; result: allowed, remaining 49.`,
              `alice sends 49 more within a second: the bucket reaches 0. The next call refills a fraction of a token, can't spend one, and returns denied with retryAfterMs = time to earn the missing fraction (at 5 per second, at most 200 ms).`,
              `<code>check("alice", "/reports")</code>: no rule, so the default fixed-window limiter decides, using alice's separate state there.`,
              `bob is unaffected throughout: every limiter keys state by client.`
            ] },
            { type: `lab`, id: `limiterPlayground`, caption: `Drive the design yourself: pick a client and an endpoint, send requests, advance the clock, and read the result each call returns.` }
          ]
        }
      ],
      levels: [
        {
          id: `mid`,
          title: `Mid-level`,
          kicker: `What is expected`,
          blocks: [
            { type: `keypoints`, title: `You should drive`, items: [
              `Clear requirements, including the result shape and the default-rule behaviour.`,
              `A <code>Limiter</code> interface with at least two working algorithms and a <code>RateLimiter</code> that routes by endpoint.`,
              `Correct token bucket refill and window logic, including remaining and retry-after.`,
              `Explaining why limits are per client per endpoint.`
            ] },
            { type: `list`, title: `The interviewer will likely lead`, items: [
              `Typing the heterogeneous configuration (you might start with a <code>Map&lt;String, Object&gt;</code>).`,
              `Thread safety and memory growth as follow-ups.`
            ] },
            { type: `callout`, tone: `mistake`, html: `<p>One big class with <code>if (algorithm.equals("TokenBucket"))</code> branches in <code>check</code>, or starting with Redis and servers. A clean interface and two correct algorithms beat breadth.</p>` }
          ]
        },
        {
          id: `senior`,
          title: `Senior`,
          kicker: `What is expected`,
          blocks: [
            { type: `keypoints`, title: `You should drive`, items: [
              `Typed parameters per algorithm (sealed interface and records) and a factory, unprompted.`,
              `Algorithm trade-offs: burst behaviour, boundary effects, memory per client.`,
              `An injected clock and how you'd test each algorithm deterministically.`,
              `Thread safety without a global lock: per-client atomicity and <code>computeIfAbsent</code>.`,
              `Idle-client eviction, with a concrete mechanism.`
            ] },
            { type: `list`, title: `Bonus territory`, items: [
              `Several rules per endpoint (per second and per day) via a composite limiter.`,
              `Reloading rules by swapping an immutable map.`
            ] }
          ]
        },
        {
          id: `staff`,
          title: `Staff and above`,
          kicker: `What is expected`,
          blocks: [
            { type: `keypoints`, title: `You should drive`, items: [
              `Everything above, quickly, with crisp trade-off statements.`,
              `How the in-process design evolves to many gateway nodes: local limits of limit/N, a central store with atomic scripts, or a hybrid with local batching, and what each costs in accuracy and latency.`,
              `Operational concerns: rule changes without losing state, observability of rejections, protecting the limiter itself from huge client cardinality.`,
              `Where the limiter sits relative to authentication, so client IDs can't be forged to escape limits.`
            ] }
          ]
        }
      ],
      concepts: [
        { term: `Rate limiting`, def: `Capping how many requests a client may make in a period of time, and rejecting the excess (usually with HTTP 429).`, why: `Protects backends from abuse and overload and shares capacity fairly between clients.` },
        { term: `RateLimitResult`, def: `The structured answer to a check: <code>allowed</code>, <code>remaining</code> and <code>retryAfterMs</code> (only when denied).`, why: `Lets the gateway set headers such as <code>Retry-After</code> and lets clients back off intelligently.`, demo: `limiterPlayground` },
        { term: `Default rule`, def: `A fallback limiter used for endpoints that have no configured rule.`, why: `Missing config shouldn't take an endpoint down or leave it unprotected.`, demo: `limiterPlayground` },
        { term: `Limiter interface (Strategy)`, def: `One method, <code>tryAcquire(clientId)</code>, implemented once per algorithm.`, why: `The algorithm is what varies; isolating it keeps <code>RateLimiter</code> unchanged as algorithms are added.` },
        { term: `Heterogeneous configuration`, def: `Each algorithm needs different parameters. Model them as one record per algorithm behind a sealed interface instead of an untyped map.`, why: `Typos and missing parameters fail at parse time, and the compiler knows every variant.` },
        { term: `LimiterFactory`, def: `Builds the right <code>Limiter</code> from a parameters record, using an exhaustive pattern-matching switch.`, why: `One place knows about all algorithms; adding one produces a compile error until the factory handles it.` },
        { term: `Token bucket`, def: `A bucket of up to <em>C</em> tokens refilled at <em>R</em> per second; each request spends one token or is denied.`, why: `Allows short bursts while holding the long-run rate; the most common general-purpose choice.`, demo: `algoCompare` },
        { term: `Lazy refill`, def: `Compute the tokens earned since the last call from elapsed time, on each call, instead of running a timer.`, why: `No background threads, and idle clients cost nothing until they return.` },
        { term: `Sliding window log`, def: `Store the timestamp of each accepted request; allow a new one only if fewer than <em>N</em> fall within the last window.`, why: `Exact, but memory per client grows with <em>N</em>.`, demo: `algoCompare` },
        { term: `Fixed window counter`, def: `Count requests in the current calendar window and reset at the boundary.`, why: `Cheapest to implement, but a client can send <em>N</em> just before and <em>N</em> just after a boundary: up to 2<em>N</em> in one real window.`, demo: `algoCompare` },
        { term: `Sliding window counter`, def: `Estimate the last window's count as <em>previous count &times; overlap fraction + current count</em>.`, why: `Close to the log's accuracy with two counters per client.`, demo: `algoCompare` },
        { term: `Per-client state`, def: `Each limiter keeps a map from client ID to that client's bucket, log or window, created on first use.`, why: `Isolation between clients; the map is also where thread safety and memory concerns concentrate.`, demo: `memoryEstimator` },
        { term: `Injected clock`, def: `Limiters read time from a supplied <code>LongSupplier</code> (or <code>java.time.Clock</code>) rather than calling the system clock directly.`, why: `Deterministic tests of refill, expiry and retry-after.` },
        { term: `Per-client atomicity`, def: `Refill-then-spend (or evict-then-append) must be one atomic step per client: lock the client's state, or CAS an immutable state.`, why: `Otherwise concurrent requests overshoot the limit; a global lock would serialise all clients.`, demo: `concurrentOvershoot` },
        { term: `Idle eviction`, def: `Remove state for clients not seen for a while: expire lazily on access and sweep periodically.`, why: `Client IDs are unbounded; without eviction the maps grow forever.`, demo: `memoryEstimator` },
        { term: `Composite limiter`, def: `A <code>Limiter</code> made of several limiters that all must allow (e.g. 10 per second and 1,000 per day).`, why: `Adds multi-rule endpoints without changing <code>RateLimiter</code> (the Composite pattern).` }
      ],
      interview: [
        { q: `Why model the algorithm as a Strategy instead of branching on its name in check()?`, a: `The algorithm is the part that varies between endpoints and grows over time. Branching puts every algorithm's state and logic in one class that changes whenever an algorithm is added or tweaked. With a Limiter interface, each algorithm is a small class with its own state, RateLimiter only routes, and adding an algorithm doesn't touch existing ones (open/closed).`, diff: `easy` },
        { q: `How do you handle configuration whose parameters differ per algorithm?`, a: `Parse each rule into a typed record for its algorithm (TokenBucketParams, SlidingWindowLogParams...) that all implement a sealed LimitParams interface. Parsing fails fast on missing or wrong fields. A factory then switches over the sealed type with pattern matching; because the switch is exhaustive, adding a new params record causes a compile error until the factory handles it.`, diff: `medium` },
        { q: `Token bucket vs sliding window log: which would you choose for a search endpoint and why?`, a: `Token bucket. Search traffic is bursty (a user paging quickly) and a bucket lets short bursts through up to its capacity while holding the long-run rate, using two numbers per client. A sliding log is exact but stores a timestamp per accepted request, which is expensive for high limits. I'd use the log where exactness matters and limits are small, such as login attempts.`, diff: `medium` },
        { q: `How do you compute retryAfterMs for each algorithm?`, a: `Token bucket: the time to earn the missing fraction of a token, (1 - tokens) / refill rate. Sliding log: when the oldest timestamp in the window expires, oldest + window - now. Fixed window: time until the window ends, windowStart + window - now. Each is the earliest moment a retry could succeed if nothing else happens.`, diff: `medium` },
        { q: `The interviewer now says the limiter is called from many threads. What changes?`, a: `Two races appear: two threads creating state for the same new client, and two threads doing refill-then-spend on the same bucket. Use ConcurrentHashMap and computeIfAbsent for creation, then make each client's update atomic: synchronize on that client's Bucket object, or keep an immutable state in an AtomicReference and update it with a CAS loop, or do the whole update inside ConcurrentHashMap.compute. Avoid a lock around the whole limiter: different clients should never contend.`, diff: `hard` },
        { q: `Client IDs are unbounded. How do you keep memory under control?`, a: `Evict state for idle clients. Record last access in each state; a ScheduledExecutorService sweeps every minute and removes entries idle longer than a TTL (for a token bucket, once it would be full again, removing it changes nothing). Alternatively use a cache library with expire-after-access. Also note the sliding log's per-request timestamps; cap limits for it or use the counter variant.`, diff: `medium` },
        { q: `How would you support an endpoint that needs both "10 per second" and "1,000 per day"?`, a: `Add a CompositeLimiter that implements Limiter and holds a list of limiters. It allows a request only if every child allows it, returns the smallest remaining and the largest retry-after. To avoid spending quota in one child when another denies, check all children before committing, or accept the small over-count. RateLimiter doesn't change.`, diff: `hard` },
        { q: `How would you test the token bucket?`, a: `Inject a fake clock (a mutable long). Start full and assert capacity requests are allowed with remaining counting down; the next is denied with the expected retryAfterMs. Advance the clock by one refill interval and assert exactly one more is allowed. Advance by a long time and assert the bucket caps at capacity. For thread safety, run many threads against one client and assert the number allowed never exceeds the tokens available.`, diff: `medium` }
      ],
      cheatsheet: [
        { title: `Algorithms at a glance`, type: `table`, headers: [`Algorithm`, `State / client`, `Bursts`, `Accuracy`, `Retry after`], rows: [
          [`Token bucket`, `tokens, lastRefill`, `Up to capacity`, `Exact long-run rate`, `(1 - tokens) / rate`],
          [`Sliding window log`, `up to N timestamps`, `Up to N in any window`, `Exact`, `oldest + window - now`],
          [`Fixed window`, `windowStart, count`, `Up to 2N across a boundary`, `Approximate`, `windowEnd - now`],
          [`Sliding window counter`, `prevCount, curCount, windowStart`, `Smoothed`, `Close to exact`, `Estimated from the weighted count`],
          [`Leaky bucket`, `level, lastLeak`, `None (smooths output)`, `Exact output rate`, `level / leak rate`]
        ] },
        { title: `Class sketch`, type: `code`, body: `record RateLimitResult(boolean allowed, int remaining, Long retryAfterMs) {}

sealed interface LimitParams permits TokenBucketParams, SlidingWindowLogParams, FixedWindowParams {}
record EndpointRule(String endpoint, LimitParams params) {}

interface Limiter { RateLimitResult tryAcquire(String clientId); }
final class TokenBucketLimiter implements Limiter { Map<String, Bucket> buckets; ... }
final class SlidingWindowLogLimiter implements Limiter { Map<String, Deque<Long>> logs; ... }
final class FixedWindowLimiter implements Limiter { Map<String, Window> windows; ... }

final class LimiterFactory { Limiter create(LimitParams p) { return switch (p) { ... }; } }

final class RateLimiter {
    Map<String, Limiter> byEndpoint; Limiter fallback;
    RateLimitResult check(String clientId, String endpoint);
}` },
        { title: `Follow-ups and the one-line answer`, type: `table`, headers: [`Follow-up`, `Answer`], rows: [
          [`Thread safety`, `ConcurrentHashMap + computeIfAbsent; atomic update per client (lock the state or CAS)`],
          [`Memory`, `Track last access; evict idle clients with a scheduled sweep or expire-after-access cache`],
          [`New algorithm`, `New params record + Limiter class + one factory case`],
          [`Multiple rules per endpoint`, `CompositeLimiter: all children must allow`],
          [`Reload config`, `Build a new immutable endpoint map; swap a volatile reference`],
          [`Many servers`, `System design: local share of the limit, or a central store with atomic scripts`]
        ] }
      ],
      labs: [`algoCompare`, `limiterPlayground`, `concurrentOvershoot`, `memoryEstimator`]
    }
  ]
};
