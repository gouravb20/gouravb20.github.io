// Low-level design problem breakdowns - interactive notes data.
// Original study notes with Java examples. The problems follow Hello Interview's LLD breakdowns:
// https://www.hellointerview.com/learn/low-level-design/problem-breakdowns/rate-limiter
// https://www.hellointerview.com/learn/low-level-design/problem-breakdowns/file-system
window.DATA = {
  book: {
    title: `Low-Level Design Problem Breakdowns`,
    subtitle: `Classic low-level design interview problems, each worked through on one page: the <strong>problem</strong> and its requirements, a <strong>solution</strong> from entities to working Java code, the <strong>deep dives</strong> an interviewer pushes on, and what is expected at each level, with labs embedded where each decision comes up. Problems are grouped and ordered by difficulty, <strong style="color:var(--level-easy)">easy</strong>, <strong style="color:var(--level-medium)">medium</strong> and <strong style="color:var(--level-hard)">hard</strong>: Connect Four, Tic-Tac-Toe, Snake and Ladders, Vending Machine and Parking Lot to warm up; LRU Cache, File System, ATM, Splitwise, Circuit Breaker, Logging Service, Meeting Room Scheduler, Movie Ticket Booking and Pub-Sub in the middle; Rate Limiter, Elevator, Ride Sharing and Inventory Management at the top. To practise, read only a problem's requirements, build it yourself in 45 minutes (clarify 5, entities 5, public API 5, core code 20, follow-ups 10), compare with the solution, and redo it from a blank file a few days later. Several problems follow Hello Interview's <a href="https://www.hellointerview.com/learn/low-level-design/problem-breakdowns/connect-four" target="_blank" rel="noopener" style="color:var(--accent)">LLD problem breakdowns</a> (each page links its original); these notes, code and labs are written independently, so read the original walkthroughs there.`,
    storageKey: `lld_problem_breakdowns_notes_v1`,
    appId: `lld-problem-breakdowns-notes`,
    exportPrefix: `lld-problem-breakdowns-progress`,
    pillarsTitle: `Four habits for any LLD breakdown`,
    takeawaysTitle: `Things to remember`,
    labsIntro: `Each lab models one decision in the design and sits in the section where that decision comes up. Time is simulated, so runs are repeatable; read the numbers as shapes, not benchmarks.`,
    mono: `LP`,
    shortTitle: `LLD Problem Breakdowns`,
    tagline: `LLD interview prep`
  },
  // Problems are grouped by difficulty; data-part4.js orders them easiest first and numbers them.
  parts: {
    1: `Easy`,
    2: `Medium`,
    3: `Hard`
  },
  fourQuestions: [
    { cls: `what`, q: `Turn the prompt into a contract`, text: `Find out exactly what goes in, what comes out and what fails. Rate limiter: a client ID and an endpoint in; allowed, remaining and retry-after out. File system: absolute paths in; nodes, listings and content out; a specific exception for every invalid request.`, answer: `Every problem: Problem tab.` },
    { cls: `where`, q: `Find the shape of the problem`, text: `Most LLD problems have one central idea. In the rate limiter it is an axis of variation (the algorithm) behind one interface. In the file system it is a recursive structure (folders containing folders) modelled as a Composite tree with parent pointers.`, answer: `Every problem: Solution tab (entities, class design).` },
    { cls: `when`, q: `Get the core flow working first`, text: `Build the single-threaded version end to end: limiters that decide, or a tree that resolves, creates, moves and deletes. Add thread safety, eviction, symlinks or search only when the interviewer asks.`, answer: `Every problem: Solution tab (implementation).` },
    { cls: `how`, q: `Answer the follow-ups with small changes`, text: `"Make it thread-safe", "add an algorithm", "support relative paths", "compute folder sizes". A good design absorbs each one in a single class or a few lines, and you can say which.`, answer: `Every problem: Deep Dives.` }
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
    `Distributed limiting (Redis, coordination across servers) is a system design question; in LLD, mention it as the next step and keep the in-process design clean.`,
    `The file system is a <strong>Composite</strong>: an abstract <code>Node</code> with <code>File</code> and <code>Directory</code> subclasses, where a directory holds child nodes.`,
    `Each directory keeps a <strong>map from name to child</strong>: unique names per folder and constant-time lookup at each step of a path.`,
    `<strong>Parent pointers</strong> make the full path of any node cost O(depth), and make move and rename O(1) because no descendant stores its path.`,
    `<strong>Resolve</strong> a path by splitting it and walking from the root one map lookup per segment; parse paths in one place and reject bad ones early.`,
    `<strong>Move</strong> must refuse to put a folder inside its own subtree (walk up from the destination looking for the source) and must check name conflicts <em>before</em> changing anything.`,
    `Use <strong>specific exceptions</strong> (not found, already exists, not a directory, not empty, invalid path, invalid operation) under one base type, so callers can handle each case.`,
    `The simplest correct concurrency story for the file system is one <strong>read-write lock</strong> around the tree; per-node locking is hard because a move touches two directories.`,
    `<strong>Interview checklist:</strong> clarify scope first (single process or distributed, which operations, what scale, in memory or persistent), then name the entities and the public API before writing code.`,
    `Put variable behaviour behind an interface: pricing, allocation, splitting, delivery, dispatch, limiting algorithms.`,
    `Say how it stays thread-safe: a lock per key or per object, atomic claim operations, concurrent collections.`,
    `Handle invalid input and edge cases explicitly, say what you would test, and keep follow-ups ready: a new rule type, persistence, scale, monitoring.`,
    `<strong>Next problems to practise:</strong> library management (search, holds and fines); a text editor with undo and redo (Command); a task scheduler with priorities and retries; a food delivery order flow (state machine plus matching); a chess game (piece moves as polymorphism, check detection).`
  ],
  chapters: [
    {
      id: `rate-limiter`, part: 3, number: 1, difficulty: `hard`,
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
            ] }
          ]
        },
        {
          id: `why-these-two`,
          title: `Why token bucket and sliding window log get asked`,
          kicker: `Interview focus`,
          blocks: [
            { type: `text`, html: `<p>Five algorithms exist, but interviews (and most configs you'll be handed) centre on two: <strong>token bucket</strong> and <strong>sliding window log</strong>. The others aren't wrong. These two simply carry the most signal: together they cover the key trade-offs, and each one leads naturally into the follow-up questions an interviewer wants to ask.</p>` },
            { type: `compare`, title: `Two ends of the trade-off`, items: [
              { title: `Token bucket: a rate`, tone: `info`, html: `<p>Models "R per second on average, with bursts up to C". Two numbers per client, constant time, bursts allowed by design. Approximate in any single window, exact over the long run.</p>` },
              { title: `Sliding window log: a quota`, tone: `info`, html: `<p>Models "never more than N in any window". Exact, no boundary effects, no bursts beyond N. Pays with up to N timestamps per client.</p>` }
            ] },
            { type: `keypoints`, title: `Why token bucket especially`, items: [
              `<strong>It's what gets shipped.</strong> It is the common production default; AWS API Gateway, for example, documents its throttling as a token bucket. Interviewers want the design you would actually build.`,
              `<strong>Its parameters are the ones people care about.</strong> Sustained rate and burst size map one-to-one to the config (capacity, refill rate), and to how product owners describe limits.`,
              `<strong>Constant state and time.</strong> Two fields per client, a few arithmetic operations per check: it scales to millions of clients without a second thought.`,
              `<strong>It tests reasoning, not recall.</strong> Lazy refill from elapsed time, fractional tokens, the cap at capacity and the retry-after formula are small pieces of math that are easy to get subtly wrong (forgetting the cap, or refilling with a timer thread).`,
              `<strong>It sets up the best concurrency question.</strong> Refill-then-spend is a read-modify-write across two fields, which is exactly the per-client atomicity discussion interviewers want to have.`
            ] },
            { type: `keypoints`, title: `Why sliding window log`, items: [
              `<strong>It is the literal meaning of "N per window".</strong> No approximation and no edge bursts, so it is the correctness baseline the others are measured against.`,
              `<strong>It tests a data-structure choice.</strong> A deque of timestamps, evicting expired entries from the front; retry-after falls straight out of the oldest entry.`,
              `<strong>Its weakness is the perfect follow-up.</strong> O(N) memory per client leads to "how would you cut that?", whose answer is the sliding window counter. Interviewers like algorithms whose flaw sets up the next question.`,
              `<strong>It's the right tool for strict, low limits</strong> such as login attempts, one-time codes and password resets, where exactness matters and N is small, so memory is not a concern.`
            ] },
            { type: `table`, title: `Why the others are usually talking points`, headers: [`Algorithm`, `Role in the interview`], rows: [
              [`Fixed window`, `The naive first idea. Its 2&times; burst at window boundaries is what motivates the sliding approaches. Fine as a cheap default where that burst is acceptable.`],
              [`Sliding window counter`, `An optimisation of the log: the answer to "the log uses too much memory". Worth explaining, rarely the thing you implement first.`],
              [`Leaky bucket`, `As a traffic shaper it queues requests and drains them at a constant rate, which needs a queue and a worker and doesn't fit a synchronous allow/deny check. As a meter it is equivalent to a token bucket, so it adds little.`]
            ] },
            { type: `callout`, tone: `insight`, title: `The low-level design reason`, html: `<p>The pair has different <strong>state shapes</strong> (two numbers vs a collection of timestamps) and different <strong>parameters</strong> (capacity and refill rate vs count and window length). That is what makes the <code>Limiter</code> interface and typed, per-algorithm configuration necessary rather than ceremonial. With two counter-based algorithms the abstraction would look like over-engineering; with these two, it is earned.</p>` },
            { type: `callout`, tone: `interview`, html: `<p>One way to say it: "Token bucket is my default, because it allows bursts with constant state per client. For strict endpoints like login I'd use a sliding window log: limits there are small, so its exactness is cheap. I'd use a fixed window only where a 2&times; burst at the boundary is acceptable."</p>` }
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
        { term: `Token bucket`, def: `A bucket of up to <em>C</em> tokens refilled at <em>R</em> per second; each request spends one token or is denied.`, why: `Allows short bursts while holding the long-run rate; the most common general-purpose choice.` },
        { term: `Lazy refill`, def: `Compute the tokens earned since the last call from elapsed time, on each call, instead of running a timer.`, why: `No background threads, and idle clients cost nothing until they return.` },
        { term: `Sliding window log`, def: `Store the timestamp of each accepted request; allow a new one only if fewer than <em>N</em> fall within the last window.`, why: `Exact, but memory per client grows with <em>N</em>.` },
        { term: `Fixed window counter`, def: `Count requests in the current calendar window and reset at the boundary.`, why: `Cheapest to implement, but a client can send <em>N</em> just before and <em>N</em> just after a boundary: up to 2<em>N</em> in one real window.` },
        { term: `Sliding window counter`, def: `Estimate the last window's count as <em>previous count &times; overlap fraction + current count</em>.`, why: `Close to the log's accuracy with two counters per client.` },
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
        { q: `Why do interviews focus on token bucket and sliding window log rather than the other algorithms?`, a: `They sit at opposite ends of the trade-off. Token bucket models a rate with bursts in constant space and is the common production default; sliding window log models an exact quota and costs a timestamp per request. Each leads to a good follow-up: token bucket to lazy-refill math and per-client atomicity, the log to its memory cost and the sliding window counter. Their different state and parameters also justify the Limiter interface and typed config. Fixed window is the naive idea whose boundary burst motivates the sliding ones, the counter is an optimisation of the log, and leaky bucket as a meter is equivalent to a token bucket.`, diff: `medium` },
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
        { title: `Class sketch`, type: `code`, lang: `java`, body: `record RateLimitResult(boolean allowed, int remaining, Long retryAfterMs) {}

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
      labs: [`limiterPlayground`, `concurrentOvershoot`, `memoryEstimator`]
    },
    // ------------------------------------------------------------------
    {
      id: `file-system`, part: 2, number: 2, difficulty: `medium`,
      title: `File System: an in-memory, Unix-style tree`,
      overview: `Build an in-memory file system with one root, folders that contain files and folders, and files that hold text. It must create, delete, list, rename and move entries, resolve absolute paths like <code>/home/ana/notes.txt</code>, and give the full path of any node, staying fast with tens of thousands of entries and deep hierarchies. The design that works is a <strong>Composite</strong> tree: an abstract <code>Node</code> with <code>File</code> and <code>Directory</code>, children kept in a map by name, a <strong>parent pointer</strong> on every node, a <code>FileSystem</code> facade that parses paths in one place, and a small family of specific exceptions.`,
      source: { title: `Hello Interview: File System (LLD) problem breakdown`, url: `https://www.hellointerview.com/learn/low-level-design/problem-breakdowns/file-system` },
      problem: [
        {
          id: `prompt`,
          title: `What we are building`,
          kicker: `The prompt`,
          blocks: [
            { type: `problem`, html: `<p>Design the core of an in-memory file system: folders, files with text content, and the operations a shell or file browser would call. Nothing touches a disk; the interest is entirely in the data structure and the operations on it.</p>` },
            { type: `text`, html: `<p>Everyone has used a file system, which makes this problem deceptively easy to start badly. Candidates skip the questions and build their own mental model (Windows drives, permissions, symlinks), then discover the interviewer wanted something narrower. Clarify first.</p>` },
            { type: `code`, lang: `java`, title: `The kind of usage to support`, code: `FileSystem fs = new FileSystem();
fs.createDirectory("/home");
fs.createDirectory("/home/ana");
fs.createFile("/home/ana/notes.txt", "buy milk");
fs.list("/home/ana");                 // [notes.txt]
fs.move("/home/ana/notes.txt", "/home");
fs.rename("/home/notes.txt", "todo.txt");
fs.get("/home/todo.txt").path();      // "/home/todo.txt"
fs.delete("/home/ana", false);
fs.read("/home/missing.txt");         // throws PathNotFoundException` }
          ]
        },
        {
          id: `clarifying`,
          title: `Questions that change the design`,
          kicker: `Clarifying`,
          blocks: [
            { type: `table`, headers: [`Ask`, `Answer to assume`, `What it decides`], rows: [
              [`One root or several (drive letters)?`, `One root, Unix-style paths`, `A single root directory; simple absolute-path parsing`],
              [`Which operations?`, `Create, delete, list, read/write, rename, move, get by path`, `The facade's methods`],
              [`Do files have content?`, `Yes, a string`, `<code>File</code> holds state, not just a name`],
              [`What on errors (missing parent, deleting root)?`, `Throw specific exception types`, `An exception hierarchy`],
              [`How big?`, `Tens of thousands of entries, deep folders`, `Map lookups per path segment; no full-tree scans`],
              [`Relative paths, symlinks, permissions, timestamps?`, `Out of scope`, `Keeps the node types small`],
              [`Persistence?`, `No, memory only`, `No serialization or I/O`]
            ] },
            { type: `callout`, tone: `tip`, html: `<p>Ask about scale even when the answer seems obvious. "Tens of thousands of entries" rules out designs that scan the whole tree to find a path or rewrite every descendant on a move, and it tells the interviewer you think about cost.</p>` }
          ]
        },
        {
          id: `requirements`,
          title: `Final requirements`,
          kicker: `On the board`,
          blocks: [
            { type: `code`, lang: `text`, code: `Functional
  1. A single root "/"; folders contain files and folders.
  2. Files store string content (read, overwrite).
  3. Create and delete files and folders.
  4. List a folder's contents.
  5. Resolve absolute paths such as /home/ana/notes.txt.
  6. Rename and move files and folders.
  7. Get the full path of any file or folder from a reference to it.
  8. Invalid operations throw specific exception types.

Non-functional
  - Tens of thousands of entries, deep hierarchies: operations should
    cost about the path depth, not the size of the tree.

Out of scope
  - Relative paths (. and ..), working directory, symbolic links.
  - Permissions, owners, timestamps, file types.
  - Search, persistence, UI.` },
            { type: `list`, title: `Decisions to state out loud`, items: [
              `Names are unique within a folder, and a name can't contain <code>/</code>.`,
              `Creating requires the parent folder to exist (offer a <code>createDirectories</code> variant like <code>mkdir -p</code> as an extension).`,
              `Deleting a non-empty folder needs an explicit <code>recursive</code> flag; deleting the root is always an error.`,
              `<code>move(src, destFolder)</code> moves an entry <em>into</em> a folder, keeping its name; <code>rename</code> changes the name in place.`
            ] }
          ]
        }
      ],
      solution: [
        {
          id: `entities`,
          title: `Core entities`,
          kicker: `Nouns to classes`,
          blocks: [
            { type: `table`, headers: [`Candidate`, `Decision`, `Why`], rows: [
              [`Node`, `Abstract (sealed) class`, `What files and folders share: a name, a parent, a path`],
              [`File`, `Class`, `A node with content`],
              [`Directory`, `Class`, `A node with children, looked up by name`],
              [`FileSystem`, `Class (facade)`, `Owns the root; parses paths; implements every operation and its checks`],
              [`FsPath`, `Record`, `A parsed, validated path: its segments, parent and last name`],
              [`FileSystemException and subtypes`, `Exception classes`, `Specific failure modes callers can catch`],
              [`Root`, `Not a class`, `Just a <code>Directory</code> with no parent`],
              [`Content, name`, `Fields`, `Plain strings`]
            ] },
            { type: `callout`, tone: `interview`, html: `<p>Name the pattern when you draw the tree: "Folders contain both files and folders, and most operations treat them alike, so this is a Composite." It explains the hierarchy in one sentence.</p>` }
          ]
        },
        {
          id: `relationships`,
          title: `How the pieces fit`,
          kicker: `Relationships`,
          blocks: [
            { type: `diagram`, title: `Composite tree with parent pointers`, caption: `Each directory maps child names to nodes (solid arrows). Every node points back to its parent (dashed), which is how a node computes its own path and how a move detaches it cheaply.`, svg: `<svg viewBox="0 0 640 280" role="img" aria-label="A file system tree with children maps and parent pointers">
<defs>
<marker id="lp-fs-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" style="fill: var(--dg-muted)"/></marker>
<marker id="lp-fs-up" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" style="fill: var(--dg-3)"/></marker>
</defs>
<rect x="270" y="14" width="100" height="40" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="320" y="39" text-anchor="middle" font-size="14" font-weight="700" style="fill: var(--dg-ink)">/</text>
<rect x="130" y="110" width="120" height="40" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="190" y="135" text-anchor="middle" font-size="13" font-weight="700" style="fill: var(--dg-ink)">home/</text>
<rect x="390" y="110" width="120" height="40" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="450" y="135" text-anchor="middle" font-size="13" font-weight="700" style="fill: var(--dg-ink)">etc/</text>
<rect x="40" y="210" width="120" height="40" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="100" y="235" text-anchor="middle" font-size="13" font-weight="700" style="fill: var(--dg-ink)">ana/</text>
<rect x="210" y="210" width="130" height="40" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="275" y="235" text-anchor="middle" font-size="13" style="fill: var(--dg-ink)">todo.txt</text>
<rect x="400" y="210" width="130" height="40" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="465" y="235" text-anchor="middle" font-size="13" style="fill: var(--dg-ink)">hosts</text>
<line x1="300" y1="54" x2="210" y2="108" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#lp-fs-arrow)"/>
<line x1="340" y1="54" x2="430" y2="108" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#lp-fs-arrow)"/>
<line x1="170" y1="150" x2="115" y2="208" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#lp-fs-arrow)"/>
<line x1="210" y1="150" x2="260" y2="208" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#lp-fs-arrow)"/>
<line x1="450" y1="150" x2="462" y2="208" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#lp-fs-arrow)"/>
<path d="M300 210 C 330 180, 290 170, 245 152" fill="none" stroke-width="2" stroke-dasharray="5 4" style="stroke: var(--dg-3)" marker-end="url(#lp-fs-up)"/>
<path d="M145 110 C 150 80, 230 60, 268 40" fill="none" stroke-width="2" stroke-dasharray="5 4" style="stroke: var(--dg-3)" marker-end="url(#lp-fs-up)"/>
<text x="560" y="40" font-size="12" style="fill: var(--dg-muted)">solid: children</text>
<text x="560" y="58" font-size="12" style="fill: var(--dg-3)">dashed: parent</text>
</svg>` },
            { type: `keypoints`, items: [
              `A <code>Directory</code> <strong>owns</strong> its children (composition): deleting a folder removes its whole subtree.`,
              `Every node has <strong>exactly one parent</strong>, except the root, which has none. The structure is always a tree, never a graph.`,
              `<code>FileSystem</code> is the only public entry point that changes the tree, so every invariant (unique names, no cycles, root protected) is enforced in one class.`
            ] }
          ]
        },
        {
          id: `class-design`,
          title: `Class design`,
          kicker: `State and behaviour`,
          blocks: [
            { type: `code`, lang: `java`, title: `Nodes`, code: `public abstract sealed class Node permits File, Directory {
    private String name;
    private Directory parent;                       // null only for the root

    protected Node(String name) { this.name = name; }

    public String name()        { return name; }
    public Directory parent()   { return parent; }
    public boolean isRoot()     { return parent == null; }

    public String path() {                          // O(depth), always correct after moves
        if (isRoot()) return "/";
        Deque<String> parts = new ArrayDeque<>();
        for (Node n = this; !n.isRoot(); n = n.parent) parts.addFirst(n.name);
        return "/" + String.join("/", parts);
    }

    void setName(String name)        { this.name = name; }        // package-private: only
    void setParent(Directory parent) { this.parent = parent; }    // FileSystem changes structure
}

public final class File extends Node {
    private String content;
    File(String name, String content) { super(name); this.content = content; }
    public String read()               { return content; }
    void write(String content)         { this.content = content; }
}

public final class Directory extends Node {
    private final Map<String, Node> children = new HashMap<>();

    Directory(String name) { super(name); }

    public Optional<Node> child(String name) { return Optional.ofNullable(children.get(name)); }
    public boolean isEmpty()                 { return children.isEmpty(); }
    public List<Node> list() {
        return children.values().stream().sorted(Comparator.comparing(Node::name)).toList();
    }

    void add(Node n)        { children.put(n.name(), n); n.setParent(this); }
    void remove(Node n)     { children.remove(n.name()); n.setParent(null); }
}` },
            { type: `code`, lang: `java`, title: `Paths and exceptions`, code: `public record FsPath(List<String> parts) {
    public static FsPath parse(String raw) {
        if (raw == null || !raw.startsWith("/")) throw new InvalidPathException(raw, "must be absolute");
        List<String> parts = new ArrayList<>();
        for (String s : raw.split("/")) {
            if (s.isEmpty()) continue;                                   // leading, trailing, doubled slashes
            if (s.equals(".") || s.equals("..")) throw new InvalidPathException(raw, "relative segments are not supported");
            parts.add(s);
        }
        return new FsPath(List.copyOf(parts));
    }
    public boolean isRoot() { return parts.isEmpty(); }
    public String name()    { return parts.getLast(); }
    public FsPath parent()  { return new FsPath(parts.subList(0, parts.size() - 1)); }
    @Override public String toString() { return "/" + String.join("/", parts); }
}

public class FileSystemException extends RuntimeException { FileSystemException(String m) { super(m); } }
public class PathNotFoundException      extends FileSystemException { ... }
public class AlreadyExistsException     extends FileSystemException { ... }
public class NotADirectoryException     extends FileSystemException { ... }
public class NotAFileException          extends FileSystemException { ... }
public class DirectoryNotEmptyException extends FileSystemException { ... }
public class InvalidPathException       extends FileSystemException { ... }
public class InvalidOperationException  extends FileSystemException { ... }   // delete root, move into own subtree` },
            { type: `keypoints`, items: [
              `<strong>Composite</strong>: <code>Node</code> is the component, <code>File</code> the leaf, <code>Directory</code> the composite. <code>sealed</code> says there are exactly two kinds, so pattern-matching switches are exhaustive.`,
              `Structural setters are <strong>package-private</strong>: callers outside the package can read the tree but can only change it through <code>FileSystem</code>, which enforces the rules.`,
              `<code>FsPath</code> keeps parsing in one place; every operation starts from a validated path.`,
              `Unchecked exceptions under one base type: callers can catch <code>FileSystemException</code> or a specific subtype. (<code>File</code> and the exceptions shadow <code>java.io</code> names, so keep them in their own package.)`
            ] }
          ]
        },
        {
          id: `implementation`,
          title: `Implementation`,
          kicker: `Working code`,
          blocks: [
            { type: `code`, lang: `java`, title: `FileSystem: resolve, create, read, list`, code: `public final class FileSystem {
    private final Directory root = new Directory("");

    public Node get(String path) { return resolve(FsPath.parse(path)); }

    public Directory createDirectory(String path) {
        FsPath p = FsPath.parse(path);
        Directory parent = parentFor(p);
        Directory dir = new Directory(p.name());
        parent.add(dir);
        return dir;
    }

    public File createFile(String path, String content) {
        FsPath p = FsPath.parse(path);
        Directory parent = parentFor(p);
        File file = new File(p.name(), content);
        parent.add(file);
        return file;
    }

    public String read(String path)                 { return asFile(get(path), path).read(); }
    public void write(String path, String content)  { asFile(get(path), path).write(content); }
    public List<String> list(String path) {
        return asDirectory(get(path), path).list().stream().map(Node::name).toList();
    }

    // Walk from the root: one map lookup per segment, O(depth)
    private Node resolve(FsPath p) {
        Node cur = root;
        for (String part : p.parts()) {
            Directory dir = asDirectory(cur, cur.path());
            cur = dir.child(part).orElseThrow(() -> new PathNotFoundException(p.toString()));
        }
        return cur;
    }

    // The parent must exist, be a directory, and not already contain the name
    private Directory parentFor(FsPath p) {
        if (p.isRoot()) throw new AlreadyExistsException("/");
        Directory parent = asDirectory(resolve(p.parent()), p.parent().toString());
        if (parent.child(p.name()).isPresent()) throw new AlreadyExistsException(p.toString());
        return parent;
    }

    private static Directory asDirectory(Node n, String path) {
        if (n instanceof Directory d) return d;
        throw new NotADirectoryException(path);
    }
    private static File asFile(Node n, String path) {
        if (n instanceof File f) return f;
        throw new NotAFileException(path);
    }
}` },
            { type: `code`, lang: `java`, title: `Delete, move, rename`, code: `    public void delete(String path, boolean recursive) {
        FsPath p = FsPath.parse(path);
        if (p.isRoot()) throw new InvalidOperationException("cannot delete the root");
        Node node = resolve(p);
        if (node instanceof Directory d && !d.isEmpty() && !recursive) throw new DirectoryNotEmptyException(path);
        node.parent().remove(node);                      // the subtree becomes unreachable and is collected
    }

    public void move(String srcPath, String destDirPath) {
        Node node = resolve(FsPath.parse(srcPath));
        if (node.isRoot()) throw new InvalidOperationException("cannot move the root");
        Directory dest = asDirectory(get(destDirPath), destDirPath);
        for (Directory a = dest; a != null; a = a.parent()) {          // no folder inside itself
            if (a == node) throw new InvalidOperationException("cannot move " + srcPath + " into its own subtree");
        }
        if (dest.child(node.name()).isPresent()) throw new AlreadyExistsException(dest.path() + "/" + node.name());
        node.parent().remove(node);                      // all checks passed: now mutate
        dest.add(node);
    }

    public void rename(String path, String newName) {
        if (newName.isEmpty() || newName.contains("/")) throw new InvalidPathException(newName, "invalid name");
        Node node = resolve(FsPath.parse(path));
        if (node.isRoot()) throw new InvalidOperationException("cannot rename the root");
        Directory parent = node.parent();
        if (parent.child(newName).isPresent()) throw new AlreadyExistsException(parent.path() + "/" + newName);
        parent.remove(node);
        node.setName(newName);
        parent.add(node);                                // re-key the parent's map
    }` },
            { type: `callout`, tone: `warning`, html: `<p>Order matters in <code>move</code> and <code>rename</code>: do every check first, then mutate. If you detach the node and only then discover a name conflict, you have to put it back, and a bug there loses a whole subtree.</p>` }
          ]
        },
        {
          id: `walkthrough`,
          title: `Walking through operations`,
          kicker: `Check it works`,
          blocks: [
            { type: `steps`, items: [
              `<code>createFile("/home/ana/notes.txt", "buy milk")</code>: parse into [home, ana, notes.txt]; resolve [home, ana] with two map lookups; check notes.txt isn't taken; add the file and set its parent.`,
              `<code>get("/home/ana/notes.txt").path()</code>: walk parent pointers notes.txt &rarr; ana &rarr; home &rarr; root, giving "/home/ana/notes.txt" in three steps.`,
              `<code>move("/home/ana", "/home/ana/archive")</code>: walking up from archive reaches ana, so it throws <code>InvalidOperationException</code> and nothing changes.`,
              `<code>move("/home/ana", "/backup")</code>: detach ana from home's map, add it to backup's map, set its parent. Every file under ana now reports /backup/ana/... with no further work.`,
              `<code>delete("/backup", false)</code> throws <code>DirectoryNotEmptyException</code>; with <code>true</code>, one map removal drops the whole subtree.`
            ] },
            { type: `lab`, id: `fsPlayground`, caption: `Run commands against the design: mkdir, touch, write, cat, ls, mv, rename and rm. Try the edge cases: moving a folder into itself, deleting the root, a file where a folder is expected.` }
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
              `Clear scope: single root, absolute paths, the operation list, what's out.`,
              `A Composite tree (<code>Node</code>, <code>File</code>, <code>Directory</code>) with children looked up by name.`,
              `Working path resolution, create, list, read and delete, with sensible exceptions.`
            ] },
            { type: `list`, title: `The interviewer will likely lead`, items: [
              `How to get a node's full path (towards parent pointers).`,
              `The move-into-own-subtree case.`
            ] },
            { type: `callout`, tone: `mistake`, html: `<p>Storing the full path string in every node, or keeping one global <code>Map&lt;String, Node&gt;</code> of paths as the only structure. Both make move and rename rewrite every descendant.</p>` }
          ]
        },
        {
          id: `senior`,
          title: `Senior`,
          kicker: `What is expected`,
          blocks: [
            { type: `keypoints`, title: `You should drive`, items: [
              `Parent pointers and the cost argument: path in O(depth), move and rename in O(1) plus a cycle check.`,
              `Move and rename correctness: cycle check, conflicts, validate-then-mutate.`,
              `A specific exception hierarchy and a single path parser with edge cases handled.`,
              `Encapsulation: only <code>FileSystem</code> can change the structure.`,
              `A concurrency answer (a read-write lock) and why finer locking is hard.`
            ] }
          ]
        },
        {
          id: `staff`,
          title: `Staff and above`,
          kicker: `What is expected`,
          blocks: [
            { type: `keypoints`, title: `You should drive`, items: [
              `Everything above, quickly, with crisp trade-offs.`,
              `Extensions with their real costs: cached folder sizes kept up to date along the parent chain, symlinks and loop detection, a search index and how to keep it consistent with moves.`,
              `How the in-memory model would evolve toward persistence: inodes separate from names, a write-ahead log, hard links.`
            ] }
          ]
        }
      ],
      concepts: [
        { term: `Composite pattern`, def: `Treat individual objects and groups the same way through one type: <code>Node</code> is the component, <code>File</code> the leaf, <code>Directory</code> the composite holding child nodes.`, why: `A file system is the textbook case: operations like path, delete and size work on any node, and folders recurse into children.`, demo: `fsPlayground` },
        { term: `Children map`, def: `Each directory keeps <code>Map&lt;String, Node&gt;</code> from child name to child.`, why: `Unique names per folder for free, and each path segment resolves in constant time.` },
        { term: `Parent pointer`, def: `Every node references its parent directory (null for the root).`, why: `Lets a node compute its own path, lets move detach it in O(1), and lets the cycle check walk upward.`, demo: `pathDesigns` },
        { term: `Path resolution`, def: `Split an absolute path into segments and walk from the root, one child lookup per segment.`, why: `Costs O(depth), independent of how many entries the tree holds.`, demo: `fsPlayground` },
        { term: `Path parsing (FsPath)`, def: `One place that validates a raw string (absolute, no <code>.</code> or <code>..</code>, collapse repeated slashes) and exposes segments, parent and name.`, why: `Every operation starts from a valid path; edge cases are handled once.` },
        { term: `Full path from a reference`, def: `Walk parent pointers to the root, collecting names, then join them in reverse.`, why: `Always correct after moves and renames, with no stored paths to keep in sync.`, demo: `pathDesigns` },
        { term: `Move`, def: `Detach a node from its parent's map and attach it to the destination's map, updating its parent pointer.`, why: `O(1) for the move itself: descendants move with it because they only know their parents.`, demo: `fsPlayground` },
        { term: `Cycle check`, def: `Before moving a folder, walk up from the destination to the root; if you meet the source, refuse.`, why: `Moving a folder into its own subtree would detach a loop from the tree and lose it.`, demo: `fsPlayground` },
        { term: `Validate, then mutate`, def: `Run every check (exists, type, cycle, name conflict) before changing any structure.`, why: `Avoids half-done moves and renames that need risky rollback.` },
        { term: `Recursive delete`, def: `Deleting a folder removes it from its parent's map; the subtree becomes unreachable and the garbage collector reclaims it.`, why: `O(1) in the tree; require an explicit flag for non-empty folders so it can't happen by accident.` },
        { term: `Exception hierarchy`, def: `A base <code>FileSystemException</code> with specific subtypes: not found, already exists, not a directory, not a file, not empty, invalid path, invalid operation.`, why: `Callers handle each failure differently, and tests can assert the exact failure.` },
        { term: `Facade`, def: `<code>FileSystem</code> is the single entry point that takes paths and coordinates nodes.`, why: `Keeps invariants in one class and keeps node classes small.` },
        { term: `Encapsulated structure`, def: `Structural setters on nodes are package-private; outside code can only change the tree through <code>FileSystem</code>.`, why: `Nobody can create a cycle or a duplicate name by bypassing the checks.` },
        { term: `Read-write lock`, def: `One <code>ReentrantReadWriteLock</code> around the tree: reads (get, list, read) share it, changes take it exclusively.`, why: `Simple and correct; per-node locks are hard because a move touches two folders and their ancestors.` },
        { term: `Cached folder size`, def: `Each directory stores the total size of its subtree, updated along the parent chain whenever a file changes or a node moves.`, why: `Size queries become O(1) at the cost of O(depth) updates; a common extension.` }
      ],
      interview: [
        { q: `Why model the file system with the Composite pattern?`, a: `Folders contain both files and folders, and many operations (get the path, delete, compute size, move) apply to either kind. A common Node type with File as the leaf and Directory as the composite lets the facade work with any node, and lets recursive operations fall out naturally by delegating to children.`, diff: `easy` },
        { q: `How do you get the full path of a node, and why not store it?`, a: `Walk parent pointers up to the root, collecting names, and join them: O(depth). Storing the full path string in each node makes path O(1) but every move or rename of a folder must rewrite the stored path of every descendant, which can be thousands of nodes. Parent pointers keep move O(1) and the path always correct.`, diff: `medium` },
        { q: `What can go wrong when moving a folder, and how do you prevent it?`, a: `Moving a folder into its own subtree would create a cycle and detach it from the root. Before moving, walk up from the destination to the root; if the source appears, throw. Also check the destination is a directory, the root isn't being moved, and the destination doesn't already contain the name, all before mutating anything.`, diff: `medium` },
        { q: `Why a HashMap for children instead of a list?`, a: `Path resolution looks up one child per segment; with a list that is a linear scan per level, which gets slow for folders with thousands of entries. A map gives constant-time lookup and enforces unique names. If listings must be sorted, sort on list(), or use a TreeMap for O(log n) lookups with ordered iteration.`, diff: `easy` },
        { q: `How would you make the file system thread-safe?`, a: `Start with one ReentrantReadWriteLock around the facade: reads such as get, list and read take the read lock and run in parallel; create, delete, move, rename and write take the write lock. Per-directory locks allow more parallelism but a move touches two folders and needs the cycle check on ancestors, so you'd lock in a fixed order and still risk subtle bugs; only go there if contention is proven.`, diff: `hard` },
        { q: `How would you add relative paths and a current directory?`, a: `Keep FileSystem working with absolute paths and add a Session (or Shell) class that holds a current directory node. It resolves a relative path by starting from the current node instead of the root, handling "." as stay and ".." as parent (staying at root at the top). Because nodes have parent pointers, ".." is O(1).`, diff: `medium` },
        { q: `How would you support folder sizes efficiently?`, a: `Simple version: size() on Directory sums its children recursively, O(subtree). Faster: cache the total in each directory and update it whenever a file's content changes or a node is added, removed or moved, by walking the parent chain and applying the delta: O(depth) per change and O(1) per size query.`, diff: `hard` },
        { q: `What exceptions would you define and why not just return false?`, a: `A base FileSystemException with PathNotFound, AlreadyExists, NotADirectory, NotAFile, DirectoryNotEmpty, InvalidPath and InvalidOperation. Each failure needs different handling (prompt to create the parent, offer to overwrite, ask for recursive delete), and a boolean can't say which one happened. Unchecked exceptions keep call sites clean.`, diff: `easy` }
      ],
      cheatsheet: [
        { title: `Operations and their cost`, type: `table`, headers: [`Operation`, `How`, `Cost`], rows: [
          [`get / resolve`, `Walk from root, one map lookup per segment`, `O(depth)`],
          [`create`, `Resolve parent, check name, add`, `O(depth)`],
          [`list`, `Read the directory's map (sort for display)`, `O(k log k) for k children`],
          [`path()`, `Walk parent pointers to root`, `O(depth)`],
          [`move`, `Cycle check up from destination, detach, attach`, `O(depth)`],
          [`rename`, `Check conflict, re-key in the parent's map`, `O(depth) to resolve, O(1) to rename`],
          [`delete (recursive)`, `Remove from parent's map`, `O(depth); subtree reclaimed by GC`]
        ] },
        { title: `Class sketch`, type: `code`, lang: `java`, body: `abstract sealed class Node permits File, Directory { String name; Directory parent; String path(); }
final class File extends Node { String content; String read(); void write(String c); }
final class Directory extends Node { Map<String, Node> children; Optional<Node> child(String n); List<Node> list(); }

record FsPath(List<String> parts) { static FsPath parse(String raw); FsPath parent(); String name(); }

final class FileSystem {
    Directory root;
    Node get(String path);
    Directory createDirectory(String path);
    File createFile(String path, String content);
    String read(String path); void write(String path, String content);
    List<String> list(String path);
    void delete(String path, boolean recursive);
    void move(String src, String destDir);
    void rename(String path, String newName);
}` },
        { title: `Exceptions and when they fire`, type: `table`, headers: [`Exception`, `When`], rows: [
          [`PathNotFoundException`, `A segment of the path doesn't exist`],
          [`AlreadyExistsException`, `Create, move or rename onto a name that's taken`],
          [`NotADirectoryException`, `A file appears where a folder is needed (mid-path, list, move destination)`],
          [`NotAFileException`, `read or write on a folder`],
          [`DirectoryNotEmptyException`, `Non-recursive delete of a folder with children`],
          [`InvalidPathException`, `Not absolute, contains . or .., or a name with /`],
          [`InvalidOperationException`, `Delete, move or rename the root; move a folder into its own subtree`]
        ] }
      ],
      labs: [`fsPlayground`, `pathDesigns`]
    }
  ]
};
