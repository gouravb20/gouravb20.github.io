// LLD problem breakdown: Rate Limiter. Format: Chapter in public/shared/notes.d.ts; shared helpers in data-part2.js.
// Imports are omitted in the code.
(function () {
const { levels, PRACTICE_TIP } = LLD_PROBLEMS_KIT;

window.DATA.chapters.push({
    id: `rate-limiter`, part: 3, number: 1, difficulty: `hard`,
    title: `Rate Limiter: per-endpoint algorithms from typed config`,
    source: { title: `Hello Interview: Rate Limiter (LLD) problem breakdown`, url: `https://www.hellointerview.com/learn/low-level-design/problem-breakdowns/rate-limiter` },
    overview: `An API gateway needs an in-memory rate limiter. Each endpoint is configured with an algorithm (token bucket, sliding window log or fixed window) and that algorithm's own parameters. Every request arrives as a client ID and an endpoint, and the limiter answers whether it may proceed, how much quota is left and when to retry. This page works the problem in interview order: clarify the requirements, find the entities, design the classes top down, choose the algorithms and the shape of the configuration (comparing three options at each decision), implement them on a worked example, verify with a trace against a fake clock, then handle follow-ups. The design lands on one <strong>Limiter</strong> interface per algorithm (a <strong>Strategy</strong>), sealed parameter records turned into limiters by a <strong>factory</strong>, and per-client state inside each limiter, locked per client so different clients never wait on each other.`,
    problem: [
      { id: `understanding`, title: `What a rate limiter does`, kicker: `The problem`, blocks: [
        { type: `problem`, html: `<p>An API gateway sits in front of many backend endpoints. Each endpoint needs its own request limit, and different endpoints want different behaviour: search can tolerate bursts, order placement should be strict, login should be very strict. A configuration service supplies one rule per endpoint, naming an algorithm and that algorithm's settings. Build the component inside the gateway that enforces those rules.</p>` },
        { type: `text`, html: `<p>The prompt is usually one sentence: <em>"Design a rate limiter for our API gateway; each endpoint is configured with a limiting algorithm and its parameters."</em> Before the questions, look at what the configuration actually looks like.</p>` },
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
        { type: `text`, html: `<p>Read it closely: the <code>params</code> object is different for every algorithm. A token bucket has a capacity and a refill rate; the window algorithms have a request count and a window length. That one detail shapes the whole design, and the interviewer put it there on purpose.</p>` }
      ] },
      { id: `clarifying`, title: `Clarifying questions`, kicker: `Step 1: requirements`, blocks: [
        { type: `text`, html: `<p>Work through four kinds of question: <strong>what the limiter must do</strong>, <strong>what happens with bad input</strong>, <strong>what is deliberately left out</strong>, and <strong>what might be added later</strong>. Spend one to three minutes here; every answer removes a branch you would otherwise design for.</p>` },
        { type: `table`, headers: [`You ask`, `A typical answer`, `What it decides`], rows: [
          [`What does a request give us?`, `A client ID (string) and an endpoint path`, `The public method: <code>check(clientId, endpoint)</code>`],
          [`What do we return: yes/no, or more?`, `Allowed or not, requests remaining, and when to retry if denied`, `A result record, not a boolean`],
          [`Do the parameters differ per algorithm?`, `Yes, each algorithm has its own set`, `Typed configuration per algorithm`],
          [`What about an endpoint with no rule?`, `Apply a default rule; never reject only because config is missing`, `A fallback limiter`],
          [`A rule with capacity 0, or a request with no client ID?`, `Bad rules fail at startup; a missing client ID is a caller bug, so throw`, `Validation in the config records and at <code>check</code>`],
          [`Is <code>check</code> called from many threads?`, `Yes, the gateway serves requests concurrently`, `Per-client atomic updates from the start`],
          [`Are rules reloaded while running?`, `Loaded once at startup; reloading may come up later`, `An immutable endpoint map, built once`],
          [`Which algorithms, and might more come?`, `Token bucket, sliding window log, fixed window; more later`, `One class per algorithm behind an interface, and a factory`]
        ] },
        { type: `callout`, tone: `insight`, title: `One process or a fleet?`, html: `<p>"Rate limiter" also exists as a system design problem: a distributed service with counters in Redis, shared by many gateway instances. This one is low-level design: one process, in memory, classes and code. Ask it first ("is this the limiter inside one gateway process, or the distributed service?"), because the answer decides whether the next 30 minutes are about class design or about networks and consistency. The answer is almost always "in process"; distribution becomes a staff-level follow-up that the same <code>Limiter</code> interface can absorb.</p>` }
      ] },
      { id: `final-requirements`, title: `Final requirements`, kicker: `Step 1: requirements`, blocks: [
        { type: `code`, lang: `text`, title: `Final requirements`, code: `Requirements
  1. Rules are loaded once at startup: one per endpoint, each naming an
     algorithm and that algorithm's own parameters.
  2. check(clientId, endpoint) decides whether the request may proceed,
     applying that endpoint's rule to that client only.
  3. The result carries allowed, remaining (requests still allowed right
     now) and retryAfterMs (earliest time a retry could succeed; 0 if allowed).
  4. Endpoints without a rule use a default rule.
  5. Algorithms to start: token bucket, sliding window log, fixed window.
     Adding one must not change the existing ones.
  6. check() is called from many threads. Limits hold exactly per
     (client, endpoint), and different clients never block each other.
  7. Invalid rules fail at startup; a missing client ID or endpoint is
     rejected with IllegalArgumentException.
  8. Time comes from an injected clock, so every behaviour is testable.

Out of scope
  - Distributed limiting across gateway instances (Redis, coordination)
  - Reloading rules at run time
  - Metrics, dashboards, HTTP headers (the gateway maps a denial to 429)` },
        { type: `list`, title: `Things to say about the limits themselves`, items: [
          `Limits apply <strong>per client per endpoint</strong>: alice's searches don't use up bob's quota, nor alice's orders.`,
          `"Remaining" means requests still allowed right now: whole tokens left in a bucket, or free slots in the window.`,
          `"Retry after" is the earliest moment a retry could succeed, so well-behaved clients can back off instead of hammering.`
        ] },
        { type: `callout`, tone: `tip`, html: PRACTICE_TIP }
      ] }
    ],
    solution: [
      { id: `entities`, title: `Core entities`, kicker: `Step 2: entities`, blocks: [
        { type: `text`, html: `<p>Scan the requirements for nouns that hold state or enforce rules: request, client, endpoint, rule, algorithm, parameters, state, result, clock. Test each one before committing to a class; several should stay plain values.</p>` },
        { type: `table`, headers: [`Candidate`, `Verdict`, `Why`], rows: [
          [`Request`, `Not a class`, `Just two strings passed to <code>check</code>; a class with two string fields adds nothing`],
          [`Client`, `Not a class`, `An ID string; it is the key of each limiter's state map`],
          [`Endpoint`, `Not a class`, `A path string; it is the key of the router's map`],
          [`Clock`, `Not a class`, `A <code>LongSupplier</code> of milliseconds, injected so tests control time`],
          [`Algorithm`, `An interface plus one class each`, `The part that varies between endpoints; each has its own state and rules`],
          [`Algorithm parameters`, `A record per algorithm`, `Each algorithm's settings are different; typing them catches mistakes at startup`],
          [`Rule`, `A record`, `Pairs an endpoint with its parameters`],
          [`Per-client state (bucket, log, window)`, `Private to its algorithm`, `Its shape belongs to the algorithm; nothing outside needs to see it`],
          [`Result`, `A record`, `allowed, remaining, retryAfterMs: immutable data`],
          [`Router`, `A class`, `Something must own "endpoint to limiter" and the default`],
          [`Builder of limiters`, `A class`, `One place that turns parameters into the matching limiter`]
        ] },
        { type: `table`, title: `The entities we keep`, headers: [`Entity`, `Responsibility`], rows: [
          [`RateLimiter`, `The entry point. Routes each check to its endpoint's limiter, or the default. Knows nothing about algorithms.`],
          [`Limiter`, `The interface every algorithm implements: decide one request for one client.`],
          [`TokenBucketLimiter, SlidingWindowLogLimiter, FixedWindowLimiter`, `One per algorithm. Each owns its parameters and a map from client ID to that client's state.`],
          [`LimitParams and its records`, `Typed, validated parameters per algorithm, behind a sealed interface; <code>EndpointRule</code> pairs one with an endpoint.`],
          [`LimiterFactory`, `Turns a parameters record into the matching limiter; the only class that knows every algorithm.`],
          [`RateLimitResult`, `What the gateway gets back: allowed, remaining, retryAfterMs.`]
        ] },
        { type: `callout`, tone: `tip`, html: `<p>Resist a <code>Request</code> class with only two string fields, a <code>Client</code> class with only an ID, or an abstract <code>AlgorithmBase</code> before there is code to share. Fewer, sharper classes read as better judgment, and you can always say "if requests later carry a cost or a tier, that is when Request earns a type".</p>` }
      ] },
      { id: `ratelimiter-design`, title: `Class design: RateLimiter and the result`, kicker: `Step 3: class design, top down`, blocks: [
        { type: `text`, html: `<p>Start from the class outside code talks to, and derive its state and methods from the requirements. For each requirement ask: what must this class remember, and what must it let callers do?</p>` },
        { type: `table`, headers: [`Requirement`, `What RateLimiter remembers`], rows: [
          [`"One rule per endpoint"`, `A map from endpoint to its <code>Limiter</code>, built once at startup`],
          [`"Endpoints without a rule use a default"`, `One fallback <code>Limiter</code>`],
          [`"Limits apply per client"`, `Nothing: per-client state belongs inside each limiter, whose algorithm understands it`]
        ] },
        { type: `table`, headers: [`Need`, `Method`], rows: [
          [`Decide one request`, `<code>RateLimitResult check(String clientId, String endpoint)</code>`],
          [`Build everything from config at startup`, `<code>RateLimiter(List&lt;EndpointRule&gt; rules, LimitParams defaultParams, LimiterFactory factory)</code>`]
        ] },
        { type: `keypoints`, items: [
          `<strong>A result, not a boolean.</strong> The gateway needs remaining and retry-after to set headers such as <code>Retry-After</code>; returning a boolean would force a second call that could see different state.`,
          `<strong>The router never switches on algorithm names.</strong> It looks up a <code>Limiter</code> and calls it. Algorithms can be added without touching it.`,
          `<strong>The map is immutable.</strong> Built once with <code>Map.copyOf</code> and published through a final field, it is safe to read from every gateway thread without a lock.`
        ] },
        { type: `code`, lang: `java`, title: `RateLimitResult`, code: `/** What the gateway gets back for one request. retryAfterMs is 0 when the request is allowed. */
record RateLimitResult(boolean allowed, int remaining, long retryAfterMs) {
    static RateLimitResult allow(int remaining)    { return new RateLimitResult(true, remaining, 0); }
    static RateLimitResult deny(long retryAfterMs) { return new RateLimitResult(false, 0, retryAfterMs); }
}` }
      ] },
      { id: `algorithm-choice`, title: `Key decision: which algorithms`, kicker: `Step 3: class design`, blocks: [
        { type: `text`, html: `<p>You don't need to invent algorithms, but you must explain the common ones and say why you would pick each, because the interviewer will ask. Five are worth knowing:</p>` },
        { type: `table`, headers: [`Algorithm`, `How it works`, `State per client`, `Behaviour`], rows: [
          [`Fixed window`, `Count requests in the current calendar window (this minute); reset when a new window starts`, `Window start + count`, `Simple; up to 2&times; the limit across a window boundary`],
          [`Sliding window log`, `Keep the time of every accepted request; allow if fewer than N fall in the last window`, `Up to N timestamps`, `Exact; memory grows with the limit`],
          [`Sliding window counter`, `Weighted sum of the previous and current fixed-window counts`, `Two counts + window start`, `Close to exact in constant space`],
          [`Token bucket`, `Bucket holds up to C tokens, refilled at R per second; each request spends one`, `Tokens + last refill time`, `Bursts up to C, long-run rate R`],
          [`Leaky bucket`, `Requests drain from a queue at a constant rate`, `Queue level + last leak time`, `Smooth output, no bursts`]
        ] },
        { type: `compare`, items: [
          { title: `Simple: fixed window`, tone: `warn`, html: `<p>One counter per client, reset at each window boundary. Thirty seconds to write. But a client can send N just before the boundary and N just after it: 2N in a moment, against a limit of N. Fine as a cheap default where that burst is harmless.</p>` },
          { title: `Better: sliding window log`, tone: `info`, html: `<p>Keep the timestamps of accepted requests and evict those older than the window. Exactly "never more than N in any window", no boundary effect, and retry-after falls out of the oldest entry. Pays with up to N timestamps per client, which is costly for high limits.</p>` },
          { title: `Strong default: token bucket`, tone: `ok`, html: `<p>Two numbers per client, refilled lazily from elapsed time. Allows short bursts up to the capacity while holding the long-run rate, which matches how product owners describe limits ("5 per second, bursts of 50"). Constant time and space.</p>` }
        ] },
        { type: `text`, html: `<p>The <strong>sliding window counter</strong> sits between the last two: it estimates the log's count from two fixed-window counters, close to exact in constant space, and is the natural answer to "the log uses too much memory" (a Deep Dive). The <strong>leaky bucket</strong> as a traffic shaper queues requests and drains them on a worker, which doesn't fit a synchronous allow/deny check; as a meter it is equivalent to a token bucket.</p>` },
        { type: `text`, html: `<p>The pick: support all three from the requirements, with <strong>token bucket as the default</strong> for general endpoints, <strong>sliding window log</strong> for strict, low limits such as login and one-time codes (N is small, so exactness is cheap), and <strong>fixed window</strong> only where a boundary burst is acceptable. Configuration chooses per endpoint, which is why the algorithm sits behind an interface.</p>` },
        { type: `keypoints`, title: `Why token bucket and sliding window log are the ones interviewers ask about`, items: [
          `<strong>They sit at the two ends of the trade-off.</strong> Token bucket models a rate with bursts in constant space; the log models an exact quota and pays memory for it. Together they cover the discussion.`,
          `<strong>Token bucket is what gets shipped.</strong> It is the common production default (AWS API Gateway documents its throttling as a token bucket), and its two parameters are the ones people actually ask for.`,
          `<strong>Token bucket tests reasoning, not recall.</strong> Lazy refill from elapsed time, fractional tokens, the cap at capacity and the retry-after formula are small pieces of math that are easy to get subtly wrong.`,
          `<strong>Token bucket sets up the best concurrency question.</strong> Refill-then-spend is a read-modify-write across two fields: exactly the per-client atomicity discussion interviewers want.`,
          `<strong>The log is the literal meaning of "N per window".</strong> It is the correctness baseline the others are measured against, and it tests a data-structure choice (a deque, evicting from the front).`,
          `<strong>The log's weakness is the perfect follow-up.</strong> O(N) memory per client leads to "how would you cut that?", whose answer is the sliding window counter.`
        ] },
        { type: `callout`, tone: `insight`, title: `The low-level design reason`, html: `<p>The pair has different <strong>state shapes</strong> (two numbers vs a collection of timestamps) and different <strong>parameters</strong> (capacity and refill rate vs count and window length). That is what makes the <code>Limiter</code> interface and typed, per-algorithm configuration necessary rather than ceremonial. With two counter-based algorithms the abstraction would look like over-engineering; with these two, it is earned.</p>` },
        { type: `callout`, tone: `interview`, html: `<p>One way to say it: "Token bucket is my default, because it allows bursts with constant state per client. For strict endpoints like login I'd use a sliding window log: limits there are small, so its exactness is cheap. I'd use a fixed window only where a 2&times; burst at the boundary is acceptable."</p>` }
      ] },
      { id: `limiter-design`, title: `Class design: Limiter and per-client state`, kicker: `Step 3: class design`, blocks: [
        { type: `table`, headers: [`Requirement`, `What a limiter remembers`], rows: [
          [`"Apply this endpoint's rule"`, `Its own parameters, as final fields`],
          [`"Per client"`, `A map from client ID to that client's state, created on first use`],
          [`"Remaining and retry after"`, `State that answers both: tokens and last refill time, the accepted timestamps, or window start and count`],
          [`"Testable time"`, `The injected clock`]
        ] },
        { type: `table`, headers: [`Need`, `Method on Limiter`], rows: [
          [`Decide one request for one client, and record it if allowed`, `<code>RateLimitResult tryAcquire(String clientId)</code>`]
        ] },
        { type: `compare`, title: `Where should per-client state live?`, items: [
          { title: `Inside each limiter (chosen)`, tone: `ok`, html: `<p>Each limiter owns <code>Map&lt;String, State&gt;</code> keyed by client. The state's shape belongs to the algorithm, so it stays private to the class that understands it. <code>RateLimiter</code> just routes.</p>` },
          { title: `One central map in RateLimiter`, tone: `warn`, html: `<p>A map keyed by (endpoint, client) holding generic state. Possible, but the state type then leaks out of the algorithm, or becomes <code>Object</code> with casts. Only worth it for cross-endpoint policies.</p>` }
        ] },
        { type: `keypoints`, items: [
          `<strong>One method is enough.</strong> Deciding and recording must happen together; separate <code>canAcquire</code> and <code>record</code> calls would let two threads both pass the check.`,
          `<strong>State is created lazily.</strong> A client costs nothing until its first request, and a new token-bucket client starts with a full bucket.`,
          `<strong>Concurrency lives here too.</strong> <code>ConcurrentHashMap.computeIfAbsent</code> creates each client's state exactly once, and a lock on that state makes its update atomic, so different clients never contend.`
        ] }
      ] },
      { id: `config-design`, title: `Key decision: typing the configuration`, kicker: `Step 3: class design`, blocks: [
        { type: `text`, html: `<p>The JSON has a different <code>params</code> shape per algorithm. Something has to turn it into the right limiter with the right numbers. Three ways to model it:</p>` },
        { type: `compare`, items: [
          { title: `Simple: one flat config class`, tone: `warn`, html: `<p><code>LimitConfig(String algorithm, Integer capacity, Double refillPerSecond, Integer maxRequests, Long windowMs)</code>, with the fields that don't apply left null. Easy to parse, but nothing stops a token bucket with no capacity, a typo in the algorithm name only fails at the first request, and every limiter has to null-check fields it shouldn't even see.</p>` },
          { title: `Better: one class per algorithm`, tone: `info`, html: `<p><code>TokenBucketParams</code>, <code>SlidingWindowLogParams</code> and so on, each with exactly its own fields. Bad shapes are impossible. But the factory is an <code>instanceof</code> chain with a fallback <code>else</code>, so a new params class compiles fine and fails at startup when nobody added its branch.</p>` },
          { title: `Strong: sealed records plus a factory`, tone: `ok`, html: `<p>The same records, each validating itself in its constructor, all implementing a <code>sealed interface LimitParams</code>. The factory is a pattern-matching <code>switch</code> over the sealed type (Java 21): it is checked for exhaustiveness, so a new record is a compile error until the factory handles it.</p>` }
        ] },
        { type: `text`, html: `<p>We take sealed records plus a factory. Bad rules (capacity 0, a negative window) fail in the record's constructor while the JSON is parsed, so the gateway refuses to start rather than misbehaving later. The factory is the one class that knows every algorithm; <code>RateLimiter</code> and the limiters never see the JSON.</p>` },
        { type: `code`, lang: `java`, title: `Typed configuration`, code: `sealed interface LimitParams permits TokenBucketParams, SlidingWindowLogParams, FixedWindowParams {}

record TokenBucketParams(int capacity, double refillPerSecond) implements LimitParams {
    TokenBucketParams {
        if (capacity < 1 || refillPerSecond <= 0) throw new IllegalArgumentException("token bucket: capacity >= 1, refill > 0");
    }
}

record SlidingWindowLogParams(int maxRequests, long windowMs) implements LimitParams {
    SlidingWindowLogParams {
        if (maxRequests < 1 || windowMs < 1) throw new IllegalArgumentException("sliding log: maxRequests >= 1, windowMs >= 1");
    }
}

record FixedWindowParams(int maxRequests, long windowMs) implements LimitParams {
    FixedWindowParams {
        if (maxRequests < 1 || windowMs < 1) throw new IllegalArgumentException("fixed window: maxRequests >= 1, windowMs >= 1");
    }
}

record EndpointRule(String endpoint, LimitParams params) {}` },
        { type: `callout`, tone: `tip`, html: `<p>The JSON parser maps <code>"algorithm"</code> to a record type (a small registry or a Jackson subtype annotation). An unknown name fails at parse time too. Mention it; don't write it.</p>` }
      ] },
      { id: `class-diagram`, title: `Final class design`, kicker: `Step 3: class design`, blocks: [
        { type: `code`, lang: `java`, title: `Final class design`, code: `final class RateLimiter {
    private final Map<String, Limiter> byEndpoint;      // immutable, built once from the rules
    private final Limiter fallback;                     // for endpoints with no rule

    RateLimiter(List<EndpointRule> rules, LimitParams defaultParams, LimiterFactory factory);
    RateLimitResult check(String clientId, String endpoint);
}

interface Limiter {
    RateLimitResult tryAcquire(String clientId);         // decide for one client and record it
}

final class TokenBucketLimiter implements Limiter      { private final ConcurrentHashMap<String, Bucket> buckets; }
final class SlidingWindowLogLimiter implements Limiter { private final ConcurrentHashMap<String, ArrayDeque<Long>> logs; }
final class FixedWindowLimiter implements Limiter      { private final ConcurrentHashMap<String, Window> windows; }

final class LimiterFactory {
    LimiterFactory(LongSupplier clockMs);
    Limiter create(LimitParams p);                      // exhaustive switch over the sealed params
}

sealed interface LimitParams permits TokenBucketParams, SlidingWindowLogParams, FixedWindowParams {}
record TokenBucketParams(int capacity, double refillPerSecond) implements LimitParams {}
record SlidingWindowLogParams(int maxRequests, long windowMs) implements LimitParams {}
record FixedWindowParams(int maxRequests, long windowMs) implements LimitParams {}
record EndpointRule(String endpoint, LimitParams params) {}
record RateLimitResult(boolean allowed, int remaining, long retryAfterMs) {}` },
        { type: `diagram`, title: `One limiter per endpoint, state per client inside it`, caption: `RateLimiter routes each check to its endpoint's limiter (or the default). Each limiter keeps a map from client ID to that client's state. The factory builds the limiters from typed parameters at startup.`, svg: `<svg viewBox="0 0 640 270" role="img" aria-label="RateLimiter holding limiters per endpoint, each with per-client state">
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
        { type: `text`, html: `<p>The router routes and never decides; each limiter decides and never routes. <code>Limiter</code> is the <strong>Strategy</strong>, the factory is the one place that maps configuration to strategies, records hold every piece of immutable data, and the only mutable state is per-client state inside the limiters, each piece guarded by its own lock.</p>` }
      ] },
      { id: `router-impl`, title: `Implementation: RateLimiter and the factory`, kicker: `Step 4: implementation`, blocks: [
        { type: `text`, html: `<p>Check what the interviewer wants: working code, pseudocode or a walkthrough. For each method, write the normal path first, then the edge cases. The normal path of <code>check</code> is one line: look up the endpoint's limiter, or the default, and ask it. The constructor builds every limiter once.</p>` },
        { type: `list`, title: `Edge cases`, items: [
          `An endpoint with no rule: the fallback limiter decides, with its own per-client state.`,
          `A null or blank client ID, or a null endpoint: throw <code>IllegalArgumentException</code>; it is a bug upstream (the gateway keys anonymous traffic by IP before calling).`,
          `Two rules for the same endpoint: refuse to start rather than silently keep one.`
        ] },
        { type: `code`, lang: `java`, title: `RateLimiter and LimiterFactory`, code: `final class RateLimiter {
    private final Map<String, Limiter> byEndpoint;      // never changes after construction
    private final Limiter fallback;

    RateLimiter(List<EndpointRule> rules, LimitParams defaultParams, LimiterFactory factory) {
        Map<String, Limiter> m = new HashMap<>();
        for (EndpointRule r : rules) {
            if (m.put(r.endpoint(), factory.create(r.params())) != null)
                throw new IllegalArgumentException("two rules for " + r.endpoint());
        }
        this.byEndpoint = Map.copyOf(m);
        this.fallback = factory.create(defaultParams);
    }

    /** Safe from any thread: the map is immutable, and each limiter makes its own updates atomic. */
    RateLimitResult check(String clientId, String endpoint) {
        if (clientId == null || clientId.isBlank() || endpoint == null)
            throw new IllegalArgumentException("clientId and endpoint are required");
        return byEndpoint.getOrDefault(endpoint, fallback).tryAcquire(clientId);
    }
}

final class LimiterFactory {
    private final LongSupplier clockMs;                 // System.nanoTime() / 1_000_000 in production

    LimiterFactory(LongSupplier clockMs) { this.clockMs = clockMs; }

    Limiter create(LimitParams p) {
        return switch (p) {                             // exhaustive: a new params record won't compile until handled
            case TokenBucketParams t      -> new TokenBucketLimiter(t, clockMs);
            case SlidingWindowLogParams s -> new SlidingWindowLogLimiter(s, clockMs);
            case FixedWindowParams f      -> new FixedWindowLimiter(f, clockMs);
        };
    }
}` },
        { type: `callout`, tone: `interview`, html: `<p>Say out loud why there is no lock in <code>RateLimiter</code>: "The endpoint map is built once and immutable, so every thread can read it. The only shared mutable state is per-client state inside each limiter, and that's where the locking goes."</p>` }
      ] },
      { id: `algorithms-impl`, title: `Implementation: the three algorithms`, kicker: `Step 4: implementation`, blocks: [
        { type: `text`, html: `<p>Before writing <code>tryAcquire</code> three times, run the algorithms on one example. The limit is <strong>3 requests per 1,000 ms</strong> (the token bucket gets capacity 3 and refills 3 per second), and one client sends requests at the times below. The output comes from running the code on this page.</p>` },
        { type: `table`, headers: [`Time (ms)`, `Fixed window`, `Sliding window log`, `Token bucket (tokens after)`], rows: [
          [`700`, `allowed, 2 left`, `allowed, 2 left`, `allowed, 2 left (2.0)`],
          [`800`, `allowed, 1 left`, `allowed, 1 left`, `allowed, 1 left (1.3)`],
          [`900`, `allowed, 0 left`, `allowed, 0 left`, `allowed, 0 left (0.6)`],
          [`1000`, `allowed, 2 left (new window)`, `denied, retry in 700`, `denied, retry in 34 (0.9)`],
          [`1100`, `allowed, 1 left`, `denied, retry in 600`, `allowed, 0 left (0.2)`],
          [`1200`, `allowed, 0 left`, `denied, retry in 500`, `denied, retry in 167 (0.5)`],
          [`1700`, `denied, retry in 300`, `allowed, 0 left`, `allowed, 1 left (1.0)`],
          [`1800`, `denied, retry in 200`, `allowed, 0 left`, `allowed, 0 left (0.3)`],
          [`<strong>Allowed in 700-1200</strong>`, `<strong>6</strong>`, `<strong>3</strong>`, `<strong>4</strong>`]
        ] },
        { type: `text`, html: `<p>The fixed window let six requests through in half a second, twice the limit, because 1000 starts a new window. The sliding log never allows more than three in any 1,000 ms, and each retry-after points exactly at the moment the oldest entry leaves (700 + 1000 = 1700). The token bucket allows the burst of three, then admits a request whenever a whole token has refilled: the long-run rate holds, and short bursts are allowed by design. A sliding window counter would deny 1000 to 1200 as well and admit 1700, estimating 0.9 requests left over from the previous window.</p>` },
        { type: `list`, title: `Edge cases the code must handle`, items: [
          `A new client: a token bucket starts full; a log or window starts empty.`,
          `Fractional tokens: refill adds fractions, but a request needs a whole token; remaining reports whole tokens.`,
          `A long idle gap: refill is capped at capacity, or a client idle for an hour could fire thousands at once.`,
          `Retry-after: the time to earn the missing fraction of a token, until the oldest log entry leaves, or until the window ends.`,
          `An entry exactly one window old has left the window (<code>&lt;=</code>), which is what makes the log's retry-after exact.`,
          `A clock read that is older than the last one (two threads racing to the lock): never let a bucket's time run backwards.`
        ] },
        { type: `code`, lang: `java`, title: `Token bucket`, code: `final class TokenBucketLimiter implements Limiter {
    private static final class Bucket {                 // guarded by its own monitor
        double tokens;
        long lastMs;
        Bucket(double tokens, long lastMs) { this.tokens = tokens; this.lastMs = lastMs; }
    }

    private final int capacity;
    private final double refillPerSecond;
    private final LongSupplier clockMs;
    private final ConcurrentHashMap<String, Bucket> buckets = new ConcurrentHashMap<>();

    TokenBucketLimiter(TokenBucketParams p, LongSupplier clockMs) {
        this.capacity = p.capacity();
        this.refillPerSecond = p.refillPerSecond();
        this.clockMs = clockMs;
    }

    public RateLimitResult tryAcquire(String clientId) {
        Bucket b = buckets.computeIfAbsent(clientId, id -> new Bucket(capacity, clockMs.getAsLong()));   // new clients start full
        synchronized (b) {                              // only this client's requests wait here
            long now = Math.max(b.lastMs, clockMs.getAsLong());                    // never run time backwards
            b.tokens = Math.min(capacity, b.tokens + (now - b.lastMs) * refillPerSecond / 1000.0);   // lazy refill, capped
            b.lastMs = now;
            if (b.tokens >= 1) {
                b.tokens -= 1;
                return RateLimitResult.allow((int) b.tokens);                     // whole tokens left
            }
            return RateLimitResult.deny((long) Math.ceil((1 - b.tokens) * 1000.0 / refillPerSecond));   // earn the missing fraction
        }
    }
}` },
        { type: `code`, lang: `java`, title: `Sliding window log`, code: `final class SlidingWindowLogLimiter implements Limiter {
    private final int max;
    private final long windowMs;
    private final LongSupplier clockMs;
    private final ConcurrentHashMap<String, ArrayDeque<Long>> logs = new ConcurrentHashMap<>();   // each deque guarded by itself

    SlidingWindowLogLimiter(SlidingWindowLogParams p, LongSupplier clockMs) {
        this.max = p.maxRequests();
        this.windowMs = p.windowMs();
        this.clockMs = clockMs;
    }

    public RateLimitResult tryAcquire(String clientId) {
        ArrayDeque<Long> log = logs.computeIfAbsent(clientId, id -> new ArrayDeque<>());
        synchronized (log) {
            long now = clockMs.getAsLong();
            while (!log.isEmpty() && log.peekFirst() <= now - windowMs) log.pollFirst();   // drop what left the window
            if (log.size() < max) {
                log.addLast(now);
                return RateLimitResult.allow(max - log.size());
            }
            return RateLimitResult.deny(log.peekFirst() + windowMs - now);        // when the oldest leaves the window
        }
    }
}` },
        { type: `code`, lang: `java`, title: `Fixed window`, code: `final class FixedWindowLimiter implements Limiter {
    private static final class Window { long start; int count; }   // guarded by its own monitor

    private final int max;
    private final long windowMs;
    private final LongSupplier clockMs;
    private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();

    FixedWindowLimiter(FixedWindowParams p, LongSupplier clockMs) {
        this.max = p.maxRequests();
        this.windowMs = p.windowMs();
        this.clockMs = clockMs;
    }

    public RateLimitResult tryAcquire(String clientId) {
        Window w = windows.computeIfAbsent(clientId, id -> new Window());
        synchronized (w) {
            long now = clockMs.getAsLong();
            long start = now - now % windowMs;           // the calendar window this request falls in
            if (w.start != start) { w.start = start; w.count = 0; }               // a new window: reset
            if (w.count < max) {
                w.count++;
                return RateLimitResult.allow(max - w.count);
            }
            return RateLimitResult.deny(start + windowMs - now);                  // when this window ends
        }
    }
}` },
        { type: `keypoints`, items: [
          `<strong>Lazy refill.</strong> Tokens earned since the last call are computed from elapsed time on each call; no timer thread, and an idle client costs nothing until it returns.`,
          `<strong>Multiply before dividing.</strong> <code>elapsed * rate / 1000.0</code> keeps round numbers exact (500 ms at 1 per second is exactly 0.5 tokens), which makes traces and tests clean.`,
          `<strong>Remaining is honest.</strong> Whole tokens for the bucket, free slots for the windows: the number of requests that would succeed right now.`,
          `<strong>The three classes share a shape, not code.</strong> Map lookup, lock, decide. A common base class would save five lines and couple three algorithms; leave them separate.`
        ] },
        { type: `callout`, tone: `warning`, html: `<p>Thread safety: <code>ConcurrentHashMap.computeIfAbsent</code> creates each client's state exactly once even when a new client's first requests arrive together, and <code>synchronized</code> on that state makes refill-then-spend (or evict-then-append) one atomic step per client. That is enough for correctness, and different clients never wait on each other. Synchronizing <code>tryAcquire</code> itself would also be correct, but one busy client would then slow every client of that endpoint. The Deep Dives compare this with a lock-free version.</p>` }
      ] },
      { id: `verification`, title: `Verifying with a trace`, kicker: `Step 5: verification`, blocks: [
        { type: `text`, html: `<p>Walk the limiter through a concrete scenario with a fake clock before the interviewer does. <code>/search</code> uses a token bucket with capacity 3 refilling 1 per second; <code>/orders</code> uses a sliding window log of 3 per 1,000 ms; the default is a fixed window of 4 per 10,000 ms. Each trace starts with a fresh clock at 0. These lines are the output of running the code.</p>` },
        { type: `code`, lang: `text`, title: `Call by call against a fake clock`, code: `Token bucket on /search: capacity 3, 1 token per second
t=0     check(alice, /search)   allowed   remaining 2   tokens 3 -> 2
t=0     check(alice, /search)   allowed   remaining 1   tokens 2 -> 1
t=0     check(alice, /search)   allowed   remaining 0   tokens 1 -> 0
t=0     check(alice, /search)   denied    retryAfter 1000 ms   (1 - 0) * 1000 / 1
t=500   check(alice, /search)   denied    retryAfter 500 ms    refilled to 0.5
t=1000  check(alice, /search)   allowed   remaining 0   refilled to 1, spent
t=1000  check(bob, /search)     allowed   remaining 2   bob's own full bucket
t=5000  check(alice, /search)   allowed   remaining 2   4 earned, capped at 3, spent 1

Sliding window log on /orders: 3 per 1000 ms
t=0     check(alice, /orders)   allowed   remaining 2   log [0]
t=400   check(alice, /orders)   allowed   remaining 1   log [0, 400]
t=800   check(alice, /orders)   allowed   remaining 0   log [0, 400, 800]
t=900   check(alice, /orders)   denied    retryAfter 100 ms    0 leaves at 1000
t=1000  check(alice, /orders)   allowed   remaining 0   0 evicted: log [400, 800, 1000]
t=1100  check(alice, /orders)   denied    retryAfter 300 ms    400 leaves at 1400
t=1400  check(alice, /orders)   allowed   remaining 0   log [800, 1000, 1400]

No rule for /reports: the default fixed window, 4 per 10000 ms
t=1400  check(alice, /reports)  allowed   remaining 3   alice's own window there` },
        { type: `keypoints`, items: [
          `Each retry-after was exact: alice was denied at 500 with 500 ms to wait and allowed at 1000; denied at 1100 with 300 ms to wait and allowed at 1400.`,
          `The four-second gap refilled only to capacity, so the request at 5000 left 2 tokens, not 4.`,
          `bob, and alice on another endpoint, were unaffected: state is per client inside each limiter.`,
          `The log's eviction at 1000 used <code>&lt;=</code>: an entry exactly one window old no longer counts.`
        ] },
        { type: `lab`, id: `limiterPlayground`, caption: `Drive the design yourself: pick a client and an endpoint, send requests, advance the clock, and read the result each call returns.` }
      ] }
    ],
    levels: levels(
      [`Clarifies the result shape (allowed, remaining, retry-after) and what happens for an endpoint with no rule.`, `A <code>Limiter</code> interface with token bucket and one window algorithm working, and a <code>RateLimiter</code> that routes by endpoint without branching on algorithm names.`, `Lazy refill with the cap at capacity, and a correct retry-after for a denied request.`, `State kept per client per endpoint; typing the heterogeneous configuration may need a hint (starting with a <code>Map&lt;String, Object&gt;</code> is common).`],
      [`Sealed parameter records and an exhaustive factory without prompting; bad rules fail at startup.`, `Trade-offs on a concrete example: the fixed window's boundary burst, the log's exactness and memory, the bucket's bursts; a pick per endpoint.`, `Per-client atomicity from the start (<code>computeIfAbsent</code> plus a lock on the client's state) and a clear reason why one lock on the limiter is wrong.`, `An injected clock and a deterministic trace; raises idle-client eviction before being asked.`],
      [`Asks "in process or distributed?" first and scopes tightly; can then say what changes across a fleet (a share of the limit per node, Redis with atomic scripts, local batching) and what each costs in accuracy and latency.`, `Operational thinking: reloading rules without resetting everyone's quota, protecting the limiter from floods of fake client IDs, observability of denials.`, `Knows where the client ID comes from: after authentication, so callers can't forge one to escape limits; tiers come from the authenticated identity, not a header.`, `Sketches per-tier limits and several rules per endpoint as new <code>Limiter</code>s, naming the double-count catch in a composite.`]
    ),
    concepts: [
      { term: `Rate limiting`, def: `Capping how many requests a client may make in a period of time and rejecting the excess (usually with HTTP 429).`, why: `Protects backends from abuse and overload and shares capacity fairly between clients.` },
      { term: `RateLimitResult`, def: `The structured answer to a check: <code>allowed</code>, <code>remaining</code> and <code>retryAfterMs</code> (0 when allowed).`, why: `Lets the gateway set headers such as <code>Retry-After</code> and lets clients back off intelligently.`, demo: `limiterPlayground` },
      { term: `Limiter interface (Strategy)`, def: `One method, <code>tryAcquire(clientId)</code>, implemented once per algorithm; <code>RateLimiter</code> routes to one per endpoint, or the default.`, why: `The algorithm is what varies; isolating it keeps the router unchanged as algorithms are added.` },
      { term: `Sealed parameters and a factory`, def: `One validating record per algorithm behind a sealed interface; a pattern-matching switch turns each into its limiter.`, why: `Bad rules fail at startup, and a new algorithm is a compile error until the factory handles it.` },
      { term: `Token bucket with lazy refill`, def: `Up to <em>C</em> tokens refilled at <em>R</em> per second, computed from elapsed time on each call and capped at <em>C</em>; each request spends one.`, why: `Bursts up to <em>C</em>, long-run rate <em>R</em>, two numbers per client and no timer thread.` },
      { term: `Sliding window log`, def: `The times of accepted requests in a deque; evict those at least one window old, allow if fewer than <em>N</em> remain.`, why: `Exact, and retry-after is the oldest entry plus the window; memory grows with <em>N</em> (the sliding window counter fixes that).` },
      { term: `Fixed window and its boundary burst`, def: `Count requests in the current calendar window and reset at the boundary.`, why: `Cheapest to build, but N just before and N just after a boundary make 2N in a moment.` },
      { term: `Per-client atomicity`, def: `Refill-then-spend (or evict-then-append) is one atomic step per client: <code>computeIfAbsent</code> to create the state, then lock it or CAS an immutable copy.`, why: `Otherwise concurrent requests overshoot the limit; one lock on the limiter would serialise every client.`, demo: `concurrentOvershoot` },
      { term: `Idle eviction`, def: `Remove state for clients not seen for a while, with a TTL chosen so removal changes nothing (a bucket that would be full again).`, why: `Client IDs are unbounded; without eviction the maps grow for as long as the process runs.`, demo: `memoryEstimator` },
      { term: `Injected clock`, def: `Limiters read time from a supplied <code>LongSupplier</code>; production uses a monotonic source, tests a fake one.`, why: `Deterministic tests of refill, expiry and retry-after, and wall-clock jumps can't refill buckets.` }
    ],
    interview: [
      { q: `Why ask whether the limiter is in process or distributed?`, a: `They are different problems. The in-process limiter is about classes: an interface per algorithm, typed config, per-client state and locking. The distributed one is about a shared store, network round trips and consistency between gateway nodes. Asking first stops you spending ten minutes on Redis in a low-level design interview, and it shows you know both exist. The in-process design can later grow a Redis-backed Limiter without changing the router.`, diff: `easy` },
      { q: `Why model the algorithm as a Strategy instead of branching on its name in check()?`, a: `The algorithm is what varies between endpoints and grows over time. Branching puts every algorithm's state and logic in one class that changes whenever an algorithm is added or tweaked. With a Limiter interface each algorithm is a small class with its own state, RateLimiter only routes, and adding an algorithm doesn't touch existing ones.`, diff: `easy` },
      { q: `How do you handle configuration whose parameters differ per algorithm?`, a: `Parse each rule into a record for its algorithm (TokenBucketParams, SlidingWindowLogParams, FixedWindowParams), each validating itself in its constructor and all implementing a sealed LimitParams interface. Bad or missing fields fail at startup. A factory switches over the sealed type with pattern matching; because the switch is exhaustive, a new record is a compile error until the factory handles it. A flat class with nullable fields allows nonsense like a token bucket without a capacity.`, diff: `medium` },
      { q: `Token bucket or sliding window log: which for a search endpoint, and which for login?`, a: `Token bucket for search: traffic is bursty (a user paging quickly), and a bucket lets short bursts through up to its capacity while holding the long-run rate, with two numbers per client. Sliding window log for login: the limit is small and must be exact (no boundary bursts on password guesses), and with N around 5 its memory cost is negligible.`, diff: `medium` },
      { q: `How do you compute retryAfterMs for each algorithm?`, a: `Token bucket: the time to earn the missing fraction of a token, ceil((1 - tokens) * 1000 / refillPerSecond). Sliding log: when the oldest timestamp leaves the window, oldest + window - now. Fixed window: when the current window ends, windowStart + window - now. Each is the earliest moment a retry could succeed if nothing else happens; under concurrency another request may take that slot first.`, diff: `medium` },
      { q: `check() is called from many threads. What can go wrong and how does the design prevent it?`, a: `Two races: two first requests from a new client both create state (and a plain HashMap can be corrupted by concurrent writes), and two requests both read "1 token left" and both spend it. computeIfAbsent on a ConcurrentHashMap creates each client's state exactly once, and synchronizing on that client's state makes refill-then-spend atomic. Locking per client means different clients never contend; a synchronized check() would be correct but would queue every client behind one lock. An immutable state in an AtomicReference with a CAS loop is the lock-free alternative.`, diff: `hard` },
      { q: `Client IDs are unbounded. How do you keep memory under control?`, a: `Evict idle state. Each state already records its last access; a scheduled task removes entries idle longer than a TTL chosen so removal changes nothing (a token bucket idle for capacity / rate seconds is full again, so recreating it is identical). Guard the race with a request in flight by marking the state retired under its lock before removing it. A cache with expire-after-access does the same. Also watch the sliding log, whose cost per client grows with its limit.`, diff: `medium` }
    ],
    cheatsheet: [
      { title: `Rate limiter in one screen`, type: `code`, lang: `java`, body: `record RateLimitResult(boolean allowed, int remaining, long retryAfterMs) {}   // retryAfterMs 0 when allowed

sealed interface LimitParams permits TokenBucketParams, SlidingWindowLogParams, FixedWindowParams {}
record EndpointRule(String endpoint, LimitParams params) {}                   // records validate in constructors

interface Limiter { RateLimitResult tryAcquire(String clientId); }

final class RateLimiter {
    Map<String, Limiter> byEndpoint; Limiter fallback;                        // immutable, built once
    RateLimitResult check(String clientId, String endpoint);                  // route, or the default
}
final class LimiterFactory { Limiter create(LimitParams p); }                 // exhaustive switch (Java 21)

// Each limiter: ConcurrentHashMap<clientId, state>; computeIfAbsent, then synchronized (state)
// Token bucket: tokens = min(cap, tokens + elapsed * rate / 1000); spend 1; retry = ceil((1 - tokens) * 1000 / rate)
// Sliding log:  drop t <= now - window; allow if size < max; retry = oldest + window - now
// Fixed window: start = now - now % window; reset on a new start; retry = start + window - now` },
      { title: `Algorithms at a glance`, type: `table`, headers: [`Algorithm`, `State / client`, `Bursts`, `Accuracy`, `Retry after`], rows: [
        [`Token bucket`, `tokens, lastMs`, `Up to capacity`, `Exact long-run rate`, `(1 - tokens) / rate`],
        [`Sliding window log`, `up to N timestamps`, `Up to N in any window`, `Exact`, `oldest + window - now`],
        [`Fixed window`, `windowStart, count`, `Up to 2N across a boundary`, `Approximate`, `windowEnd - now`],
        [`Sliding window counter`, `prev, cur, windowStart`, `Smoothed`, `Close to exact`, `Window end (an estimate)`]
      ] },
      { title: `Follow-ups and where they land`, type: `table`, headers: [`Follow-up`, `Change`], rows: [
        [`Thread safety under load`, `Already per-client locks; a CAS on immutable state is the lock-free option (Deep Dives)`],
        [`Memory, idle clients`, `Each limiter gains evictIdle; a scheduled sweeper calls it (Deep Dives)`],
        [`A new algorithm`, `A params record, a Limiter class, one factory case (Deep Dives)`],
        [`Per-tier limits`, `TieredParams and a TieredLimiter that routes by the authenticated tier (Deep Dives)`],
        [`Several rules per endpoint`, `A CompositeLimiter: every child must allow (Deep Dives)`],
        [`Reload rules`, `Build a new immutable endpoint map and swap a volatile reference in RateLimiter`],
        [`Many gateway instances`, `A Redis-backed Limiter with atomic scripts; system design territory (Deep Dives)`]
      ] }
    ],
    labs: [`limiterPlayground`, `concurrentOvershoot`, `memoryEstimator`]
  });
})();
