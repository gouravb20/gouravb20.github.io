// Deep dive: Chapter 6, Latency, regions and failure handling. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch6 = {
  hook: `<p>This chapter covers the two realities every distributed design must handle: distance puts a hard floor under latency, and failure is a normal operating condition. The tools (locality, timeouts, careful retries, idempotency keys, circuit breakers) only work in combination.</p>`,
  sections: [
    {
      id: "distance-and-locality",
      title: "Distance is latency; locality is the fix",
      kicker: "The constraint",
      blocks: [
        {
          type: "text",
          html: `<p>Light in fiber covers about <strong>200 km per millisecond</strong>: divide distance by 200 for one-way milliseconds, double it for a round trip, then add 30% to 100% for real routes. No server optimization wins that back; only fewer or shorter round trips do.</p>`,
        },
        {
          type: "table",
          headers: ["Path", "Great-circle distance", "Round-trip floor", "Typical real RTT"],
          rows: [
            ["Within one metro area", "Tens of km", "Under 1 ms", "About 1 to 2 ms"],
            ["US East to US West coast", "About 4,000 km", "About 40 ms", "Roughly 60 to 80 ms"],
            ["New York to London", "About 5,600 km", "About 56 ms", "Roughly 70 to 80 ms"],
            ["Sydney to Los Angeles", "About 12,000 km", "About 120 ms", "Roughly 140 to 170 ms"],
          ],
          note: "Floors use 200 km/ms; real figures vary with routes, peering and congestion.",
        },
        {
          type: "lab",
          id: "latencyMap",
          caption: "Pick where the user is and where the origin is. See the speed-of-light floor, a realistic round trip, and what a page needing several round trips costs with and without a CDN edge or a regional deployment.",
        },
        {
          type: "compare",
          items: [
            { title: "CDN at the edge", tone: "ok", html: "Serves shared, cacheable content from hundreds of cities. Even uncacheable requests gain: handshakes end at a nearby edge with warm connections to the origin. Does little for personalized writes." },
            { title: "Multi-region deployment", tone: "info", html: "App servers and read replicas in several regions (each with several availability zones). Writes go to one home region (simple, slower for far users) or anywhere (fast, but conflicts must be resolved)." },
            { title: "Regional partitioning", tone: "warn", html: "Each region owns its users' or places' data. Excellent when interactions are local, and sometimes required by data-residency laws such as GDPR; awkward for travelling users and global search." },
          ],
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p>Move data with compute. A service in Europe reading a database in Virginia pays a transatlantic round trip per query, which can be worse than serving the user from Virginia. Chatty cross-region calls are a classic cause of mysterious slowness.</p>`,
        },
      ],
    },
    {
      id: "timeouts",
      title: "Timeouts and their ambiguity",
      kicker: "Failure",
      blocks: [
        {
          type: "text",
          html: `<p>Messages are lost, delayed and duplicated, and dependencies fail on their own schedule. Without a <strong>timeout</strong>, a hung dependency holds the caller's threads and connections until the caller fails too. A timeout frees them, but it tells you nothing about whether the work happened.</p>`,
        },
        {
          type: "diagram",
          title: "Three different failures that look identical to the caller",
          caption: "When a call times out, the client cannot tell whether the request never arrived, the server did the work but the reply was lost, or the server is just slow. Only the first is safe to blindly retry, unless the operation is idempotent.",
          svg: `<svg viewBox="0 0 620 290" role="img" aria-label="Three timeout scenarios: request lost, reply lost after the server acted, and a slow reply that arrives after the timeout">
<defs><marker id="cc6-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-ink)"/></marker></defs>
<text x="20" y="57" font-size="13" font-weight="700">Request lost</text>
<text x="20" y="75" font-size="12" style="fill: var(--dg-ok)">safe to retry</text>
<rect x="150" y="40" width="70" height="40" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="185" y="65" text-anchor="middle" font-size="12">Client</text>
<rect x="430" y="40" width="100" height="40" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="480" y="65" text-anchor="middle" font-size="12">Server</text>
<line x1="220" y1="52" x2="316" y2="52" stroke-width="2" style="stroke: var(--dg-ink)"/>
<path d="M320 46 L332 58 M332 46 L320 58" stroke-width="3" style="stroke: var(--dg-bad)"/>
<text x="20" y="137" font-size="13" font-weight="700">Reply lost</text>
<text x="20" y="155" font-size="12" style="fill: var(--dg-bad)">retry acts twice</text>
<rect x="150" y="120" width="70" height="40" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="185" y="145" text-anchor="middle" font-size="12">Client</text>
<rect x="430" y="120" width="100" height="40" rx="6" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)" stroke-width="2"/>
<text x="480" y="145" text-anchor="middle" font-size="12">Charged card</text>
<line x1="220" y1="132" x2="427" y2="132" stroke-width="2" marker-end="url(#cc6-arrow)" style="stroke: var(--dg-ink)"/>
<line x1="430" y1="148" x2="336" y2="148" stroke-width="2" style="stroke: var(--dg-ink)"/>
<path d="M320 142 L332 154 M332 142 L320 154" stroke-width="3" style="stroke: var(--dg-bad)"/>
<text x="20" y="217" font-size="13" font-weight="700">Just slow</text>
<text x="20" y="235" font-size="12" style="fill: var(--dg-muted)">may still succeed</text>
<rect x="150" y="200" width="70" height="40" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="185" y="225" text-anchor="middle" font-size="12">Client</text>
<rect x="430" y="200" width="100" height="40" rx="6" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="2"/>
<text x="480" y="225" text-anchor="middle" font-size="12">Working...</text>
<line x1="220" y1="212" x2="427" y2="212" stroke-width="2" marker-end="url(#cc6-arrow)" style="stroke: var(--dg-ink)"/>
<line x1="430" y1="228" x2="223" y2="228" stroke-width="2" stroke-dasharray="5 4" marker-end="url(#cc6-arrow)" style="stroke: var(--dg-muted)"/>
<text x="325" y="252" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">reply arrives after the timeout</text>
<text x="310" y="280" text-anchor="middle" font-size="12">From the client's side, all three look the same: no reply before the timeout.</text>
</svg>`,
        },
        {
          type: "keypoints",
          items: [
            "Every remote call needs a timeout; a missing timeout is how a slow dependency becomes your outage.",
            "Set it a bit above the dependency's measured p99 or p99.9. Too long hoards resources; too short fails healthy calls and adds retries.",
            "Deadlines should <strong>shrink down the call chain</strong>. gRPC propagates them, so each hop knows how much time remains and stops work nobody is waiting for.",
          ],
        },
      ],
    },
    {
      id: "retries-and-idempotency",
      title: "Retries, backoff, jitter and idempotency keys",
      kicker: "Trying again, safely",
      blocks: [
        {
          type: "text",
          html: `<p>Retries turn transient failures into invisible successes, but they are extra load aimed at a struggling system. Done naively, they turn a hiccup into an outage.</p>`,
        },
        {
          type: "keypoints",
          items: [
            "<strong>Only retry what is safe to repeat:</strong> reads, idempotent writes, or writes with an idempotency key. Don't retry 400 or 403; do respect <code>429</code> and <code>Retry-After</code>.",
            "<strong>Exponential backoff:</strong> 100, 200, 400, 800 ms... up to a cap, then stop.",
            "<strong>Jitter:</strong> randomize each wait, or clients that failed together retry together in synchronized waves.",
            "<strong>Retry at one layer, within a budget.</strong> Three layers retrying 3 times each turn one request into 27 attempts at the bottom; a budget (for example 10% of requests) stops a broad outage tripling traffic.",
          ],
        },
        {
          type: "code",
          lang: "js",
          title: "Retry with capped exponential backoff and full jitter",
          code: `async function callWithRetry(fn, { attempts = 4, baseMs = 100, capMs = 5000 } = {}) {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i + 1 >= attempts || !isRetryable(err)) throw err;
      const ceiling = Math.min(capMs, baseMs * 2 ** i);
      await sleep(Math.random() * ceiling);   // full jitter: anywhere in [0, ceiling)
    }
  }
}`,
        },
        {
          type: "lab",
          id: "retryStorm",
          caption: "Ten thousand clients lose their connections when the service restarts. Compare immediate retries, fixed delays, exponential backoff and backoff with jitter, and watch how long the service takes to accept everyone again.",
        },
        {
          type: "steps",
          title: "Idempotency keys: a retried payment charges once",
          items: [
            "The client generates key <code>k</code> once per logical operation (for example when the user clicks \"Pay\") and sends it on every attempt, typically in an <code>Idempotency-Key</code> header.",
            "The server <strong>atomically</strong> claims <code>k</code> (insert against a unique index or conditional write), marked \"in progress\". A separate check-then-insert races.",
            "On success, do the work and store the response with <code>k</code>, ideally in the same transaction as the business write.",
            "A repeat of a completed key returns the stored response; one still in progress gets a 409 or waits. Reject a reused key with a different request fingerprint.",
            "Expire keys after a window that covers realistic retries (Stripe may remove keys once they are at least 24 hours old).",
          ],
        },
        {
          type: "quiz",
          q: "A service restarts and 50,000 clients reconnect. Every client uses exponential backoff without jitter. What goes wrong?",
          options: [
            "Nothing; exponential backoff alone is enough",
            "Clients that failed together retry together, so the service sees synchronized spikes at 100 ms, 200 ms, 400 ms and so on",
            "Clients never retry",
            "The backoff grows too slowly",
          ],
          answer: 1,
          explain: "Backoff spaces out each client's attempts but doesn't de-synchronize clients that started at the same instant. Every wave arrives at once and overloads the service again. Jitter spreads each wave across the whole interval so the service sees a steady trickle it can handle.",
        },
      ],
    },
    {
      id: "circuit-breakers",
      title: "Cascading failures and circuit breakers",
      kicker: "Containing the blast",
      blocks: [
        {
          type: "text",
          html: `<p>In a <strong>cascading failure</strong>, a slow dependency fills its callers' threads, they slow down, their callers fill up, and retries multiply traffic at each level. On recovery, the backlog plus every reconnecting client (a <strong>thundering herd</strong>) knocks it down again. A <strong>circuit breaker</strong> stops calling a dependency that is clearly down.</p>`,
        },
        {
          type: "diagram",
          title: "The three states of a circuit breaker",
          caption: "Closed: calls flow and failures are counted. Open: calls fail immediately without touching the dependency. After a cool-down, half-open lets a few trial calls through; success closes the breaker, failure opens it again.",
          svg: `<svg viewBox="0 0 620 225" role="img" aria-label="Circuit breaker state machine with closed, open and half-open states and the transitions between them">
<defs><marker id="cc6-arrow2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-ink)"/></marker></defs>
<rect x="40" y="40" width="140" height="50" rx="10" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="110" y="62" text-anchor="middle" font-size="13" font-weight="700">Closed</text>
<text x="110" y="80" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">calls pass through</text>
<rect x="440" y="40" width="140" height="50" rx="10" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)" stroke-width="2"/>
<text x="510" y="62" text-anchor="middle" font-size="13" font-weight="700">Open</text>
<text x="510" y="80" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">fail fast</text>
<rect x="240" y="160" width="140" height="50" rx="10" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="2"/>
<text x="310" y="182" text-anchor="middle" font-size="13" font-weight="700">Half-open</text>
<text x="310" y="200" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">a few trial calls</text>
<line x1="180" y1="58" x2="437" y2="58" stroke-width="2" marker-end="url(#cc6-arrow2)" style="stroke: var(--dg-ink)"/>
<text x="310" y="50" text-anchor="middle" font-size="12">failures pass threshold</text>
<line x1="460" y1="90" x2="373" y2="158" stroke-width="2" marker-end="url(#cc6-arrow2)" style="stroke: var(--dg-ink)"/>
<text x="405" y="120" text-anchor="end" font-size="12">cool-down ends</text>
<line x1="380" y1="185" x2="518" y2="93" stroke-width="2" marker-end="url(#cc6-arrow2)" style="stroke: var(--dg-bad)"/>
<text x="460" y="200" font-size="12" style="fill: var(--dg-bad)">trial call fails</text>
<line x1="240" y1="175" x2="152" y2="93" stroke-width="2" marker-end="url(#cc6-arrow2)" style="stroke: var(--dg-ok)"/>
<text x="30" y="150" font-size="12" style="fill: var(--dg-ok)">trial calls succeed</text>
</svg>`,
        },
        {
          type: "keypoints",
          items: [
            "<strong>Opens</strong> when failures cross a threshold (say half the calls in 10 seconds, above a minimum volume).",
            "Failing fast protects <strong>both sides</strong>: the caller frees resources, and the dependency gets a quiet period to recover.",
            "<strong>Fallbacks degrade the feature, not the page:</strong> cached or popular items, a hidden sidebar, or a fast clear error. Decide per dependency what is essential (checkout must not skip payment).",
            "Libraries (Resilience4j, which Netflix's Hystrix README points to) or the mesh (Envoy circuit-breaking limits and outlier detection) provide it.",
          ],
        },
        {
          type: "lab",
          id: "circuitBreaker",
          caption: "A dependency hangs at 10 seconds and can recover from 25 seconds. Compare calling it blindly with wrapping it in a breaker, and turn on fragile recovery to see why a quiet period matters.",
        },
        {
          type: "quiz",
          q: "A dependency starts timing out on every call. With a circuit breaker in place, what happens to calls during the open state?",
          options: [
            "They queue until the dependency recovers",
            "They fail immediately or use a fallback, without calling the dependency",
            "They are retried with exponential backoff",
            "They are sent to the dependency with a longer timeout",
          ],
          answer: 1,
          explain: "The point of opening is to stop spending time and load on calls that will almost certainly fail. The caller frees its resources instantly and the dependency gets a break. After the cool-down, a few trial calls probe whether it has recovered.",
        },
      ],
    },
    {
      id: "interview",
      title: "Using it in a design interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "callout",
          tone: "interview",
          html: `<p>Bring these up proactively ("users in Asia say it's slow", "what if payments is down"). A strong answer covers:</p>
<ol>
<li><strong>Distance:</strong> estimate RTT at about 200 km/ms plus overhead; fix with CDNs, regional deployments or partitioning, and keep data next to compute.</li>
<li><strong>Timeouts</strong> on every remote call, set from tail latency, with shrinking deadlines.</li>
<li><strong>Retries</strong> only for idempotent operations, with capped exponential backoff, jitter and a budget, at one layer.</li>
<li><strong>Idempotency keys</strong> for payments and bookings, claimed atomically.</li>
<li><strong>Circuit breakers</strong> on the caller side of each critical dependency, with a fallback that degrades one feature.</li>
</ol>`,
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>"We'll just retry on failure." Without backoff, jitter, a budget and idempotency, that describes how outages get worse. Each time you say "retry", say how.</p>`,
        },
      ],
    },
  ],
  takeaways: [
    "Distance sets a hard floor (about 200 km per ms in fiber); fix it with CDNs, multi-region deployments and regional partitioning, keeping data next to compute.",
    "Every remote call needs a timeout based on tail latency, with deadlines that shrink as a request goes deeper.",
    "A timeout doesn't tell you whether the work happened: retry only idempotent operations or use atomically claimed idempotency keys.",
    "Retry with capped exponential backoff plus jitter, at one layer, within a budget.",
    "Circuit breakers fail fast to protect caller and dependency; pair them with fallbacks that degrade one feature.",
  ],
  furtherReading: [
    { title: "Exponential Backoff And Jitter (AWS Architecture Blog, 2015)", url: "https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/", note: "Simulations comparing backoff strategies, with full jitter as the recommended default." },
    { title: "Site Reliability Engineering, chapters on handling overload and cascading failures", url: "https://sre.google/sre-book/addressing-cascading-failures/", note: "Google's guidance on retries, deadlines, load shedding and recovery." },
    { title: "Stripe API reference: Idempotent requests", url: "https://docs.stripe.com/api/idempotent_requests", note: "A production idempotency-key design in a few paragraphs." },
  ],
};
