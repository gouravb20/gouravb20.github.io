// Deep dives: Flash Sale. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP["flash-sale"] = {
  hook: `<p>The baseline is correct: a conditional decrement plus a hold in one transaction, and an idempotent payment. Then the interviewer starts pushing. What if half a million people press "reserve" in the same second? What if Redis fails over mid-sale? What happens to holds nobody pays for, to the crowd at 10:00:00, to the bots, to a payment that lands after its hold expired?</p><p>Each section below is one of those questions: the challenge, a progression of answers from weak to strong, and the trade-offs that make the strong answer worth its cost.</p>`,
  sections: [
    // ------------------------------------------------------------------
    {
      id: `no-oversell`,
      title: `How do you guarantee you never oversell?`,
      kicker: `Correctness under contention`,
      blocks: [
        {
          type: `problem`,
          html: `<p>On one database the conditional update is airtight. But every step towards throughput (a faster counter in Redis, buckets, caches) adds a second copy of "how many are left", and each copy is a new way to sell a unit twice. The interviewer wants two things: why your claim is atomic, and what happens when the pieces fail halfway.</p>`,
        },
        {
          type: `compare`,
          title: `From broken to robust`,
          items: [
            { title: `Read, check in the app, write`, tone: `bad`, html: `<p>The decision uses a value that can be stale by the time the write lands. Oversells constantly under a burst, and the counter can look normal while it does.</p>` },
            { title: `Pessimistic lock or optimistic version`, tone: `warn`, html: `<p><code>SELECT ... FOR UPDATE</code> is correct but every buyer queues behind the lock. Optimistic version checks are correct but nearly every write conflicts, so retries pile up and people hear "sold out" with stock left.</p>` },
            { title: `Conditional decrement in one transaction`, tone: `ok`, html: `<p><code>remaining = remaining - 1 WHERE remaining &gt; 0</code> plus the hold insert, committed together, with a unique (sale, user) constraint. One statement per buyer, no retries, no oversell. Limited to one row's throughput.</p>` },
            { title: `Atomic Redis gate, Postgres of record`, tone: `ok`, html: `<p>A Lua script decides winners in memory at ~100K ops/s; only winners write to Postgres. Correct as long as you handle the two-store failure cases below.</p>` },
          ],
        },
        {
          type: `code`,
          title: `Claim script (Redis runs it without interleaving)`,
          lang: `lua`,
          code: `-- KEYS[1] = stock:{sale}   KEYS[2] = holders:{sale}   ARGV[1] = userId
if redis.call('SISMEMBER', KEYS[2], ARGV[1]) == 1 then return -2 end  -- already holds one
local left = tonumber(redis.call('GET', KEYS[1]) or '0')
if left <= 0 then return -1 end                                        -- sold out
redis.call('DECR', KEYS[1])
redis.call('SADD', KEYS[2], ARGV[1])
return left - 1                                                        -- winner`,
        },
        {
          type: `diagram`,
          title: `Gate in Redis, record in Postgres`,
          caption: `Every admitted attempt runs the claim script. Losers are answered at once. Winners insert a HELD reservation; a failed insert gives the unit back. A reconciliation job compares the two stores and rebuilds Redis after a failover.`,
          svg: `<svg viewBox="0 0 640 230" role="img" aria-label="Attempts go to a Redis claim script; losers get sold out immediately; winners write a reservation to Postgres; a reconcile job compares Redis and Postgres">
<defs><marker id="fs-arrow-4" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="10" y="85" width="110" height="50" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="65" y="108" text-anchor="middle" font-size="13" font-weight="700">Attempts</text>
<text x="65" y="125" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">~100K+/s</text>
<rect x="180" y="75" width="150" height="70" rx="8" style="fill: var(--dg-5-soft); stroke: var(--dg-5)" stroke-width="1.5"/>
<text x="255" y="100" text-anchor="middle" font-size="13" font-weight="700">Redis claim script</text>
<text x="255" y="117" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">one per user, stock &gt; 0,</text>
<text x="255" y="132" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">decrement</text>
<rect x="400" y="20" width="200" height="44" rx="8" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)" stroke-width="1.5"/>
<text x="500" y="47" text-anchor="middle" font-size="13" font-weight="700">"Sold out" (losers)</text>
<rect x="400" y="110" width="200" height="56" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<text x="500" y="134" text-anchor="middle" font-size="13" font-weight="700">Postgres</text>
<text x="500" y="152" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">HELD reservation (~20K writes)</text>
<line x1="120" y1="110" x2="178" y2="110" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#fs-arrow-4)"/>
<line x1="330" y1="95" x2="398" y2="45" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#fs-arrow-4)"/>
<line x1="330" y1="125" x2="398" y2="135" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#fs-arrow-4)"/>
<path d="M500 166 C 500 210, 255 210, 255 147" style="fill: none; stroke: var(--dg-3)" stroke-width="1.5" stroke-dasharray="5 4" marker-end="url(#fs-arrow-4)"/>
<text x="380" y="215" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">give back on failed insert; reconcile; rebuild on failover</text>
</svg>`,
        },
        {
          type: `table`,
          title: `Keeping two stores honest`,
          headers: [`What goes wrong`, `What you do`],
          rows: [
            [`Winner's Postgres insert fails or times out`, `Compensate: <code>INCR</code> the counter and remove the holder. The reserve call's idempotency key makes a client retry safe.`],
            [`Service crashes between Redis and Postgres`, `The unit is stuck in Redis only. A reconciliation job compares holders with HELD rows and gives back orphans after a grace period.`],
            [`Redis fails over to a replica`, `Replication is asynchronous, so the replica may have a higher count than the truth. Pause claims, rebuild <code>remaining = stock - active holds - paid</code> from Postgres, reopen.`],
            [`Counter drifts for any other reason`, `Postgres is the truth. A <code>CHECK (remaining &gt;= 0)</code> on the inventory row is a cheap backstop.`],
          ],
        },
        {
          type: `callout`,
          tone: `insight`,
          html: `<p><strong>Prefer under-selling for a moment to overselling.</strong> Every recovery path above errs towards "fewer units available until we've checked". A unit that reappears a minute late is a non-event; a console sold twice is a cancelled order and an angry customer.</p>`,
        },
        {
          type: `quiz`,
          q: `Redis fails over to a replica during the sale. What is the main risk, and the fix?`,
          options: [
            `No risk; replicas are always in sync`,
            `The replica may be missing recent decrements, so it could oversell; pause claims and rebuild the count from Postgres before reopening`,
            `The Lua script stops being atomic`,
            `Reservations in Postgres are lost`,
          ],
          answer: 1,
          explain: `Redis replicates asynchronously, so a promoted replica can lag. Its counter may be higher than the true remaining stock. Recompute from the system of record (stock minus active holds and paid orders), then reopen.`,
        },
      ],
    },
    // ------------------------------------------------------------------
    {
      id: `hot-inventory`,
      title: `What happens to one inventory row at 500K attempts a second?`,
      kicker: `Throughput on a hot key`,
      blocks: [
        {
          type: `problem`,
          html: `<p>A row lock lets one transaction change the row at a time, so throughput is about <span class="formula">1 ÷ lock hold time</span>: ~1,000/s at 1 ms, whatever the machine. With hundreds of thousands of attempts a second, a queue forms instantly, requests time out <em>while stock remains</em>, and who wins depends on queue position rather than arrival.</p>`,
        },
        {
          type: `lab`,
          id: `hotRow`,
          caption: `On "one row", watch the queue explode and count people who timed out with units still left. Turn on the sold-out flag to stop draining doomed attempts. Then try the Redis counter: no queue, and only winners write to the database.`,
        },
        {
          type: `compare`,
          title: `Ways past the hot row`,
          items: [
            { title: `One locked row`, tone: `bad`, html: `<p>Correct but capped at ~1,000/s. Fine for 100K users over five minutes; hopeless for this launch.</p>` },
            { title: `N stock buckets`, tone: `warn`, html: `<p>Split 20,000 units into N rows or keys and route each attempt to one. Throughput ≈ N × one row, but buckets drain unevenly: some users hit an empty bucket while others still have stock.</p>` },
            { title: `Unit token pool`, tone: `info`, html: `<p>One row per unit; a claim takes any free one with <code>FOR UPDATE SKIP LOCKED</code>. No single hot counter, and an empty pool is an unambiguous "sold out". Pre-creating units is the price.</p>` },
            { title: `Redis counter behind admission control`, tone: `ok`, html: `<p>~100K ops/s on one key, about 100× a row, and the waiting room keeps the attempt rate below that. Database writes ≈ units. This is the usual recommendation; add buckets only if one key is still too hot.</p>` },
          ],
        },
        {
          type: `lab`,
          id: `inventoryBuckets`,
          caption: `With 16 buckets and "say sold out", see how much stock is left when the first bucket empties and how many false "sold out" answers follow. Then compare retries with routing only to non-empty buckets.`,
        },
        {
          type: `code`,
          title: `Claim one unit from a token pool`,
          lang: `sql`,
          code: `UPDATE units SET status = 'HELD', user_id = :user, expires_at = now() + interval '10 minutes'
 WHERE id = (SELECT id FROM units
              WHERE sale_id = :sale AND status = 'FREE'
              ORDER BY id
              FOR UPDATE SKIP LOCKED
              LIMIT 1)
RETURNING id;   -- no row: sold out`,
        },
        {
          type: `text`,
          html: `<p>Whatever the gate, <strong>close it hard</strong>. After the last unit goes, every further attempt is guaranteed to fail. A <strong>sold-out flag</strong> checked by the edge, the gateway and the reservation service turns millions of doomed attempts into instant answers. Clear it if expired holds return units.</p>`,
        },
        {
          type: `table`,
          title: `Which guard, when`,
          headers: [`Approach`, `Throughput`, `Use when`],
          rows: [
            [`Conditional UPDATE on one row`, `~1 / lock time`, `Modest demand`],
            [`Redis atomic gate + Postgres record`, `~100K ops/s per key`, `Very high attempt rates`],
            [`Buckets or token pool`, `Scales with N`, `One key is still too hot`],
            [`Sold-out flag at the edge`, `Effectively unlimited`, `Always`],
          ],
        },
        {
          type: `quiz`,
          q: `Stock is split across 16 buckets. Bucket 7 is empty. A request routed there should...`,
          options: [
            `Return "sold out" immediately`,
            `Try another bucket (or be routed only to non-empty ones); "sold out" is only true when every bucket is empty`,
            `Wait until bucket 7 is refilled`,
            `Take a lock on all 16 buckets`,
          ],
          answer: 1,
          explain: `Random routing drains buckets unevenly, so one empty bucket says little about total stock. Saying "sold out" early turns real buyers away while units remain.`,
        },
      ],
    },
    // ------------------------------------------------------------------
    {
      id: `expiring-holds`,
      title: `How do unpaid holds come back, exactly once?`,
      kicker: `TTL, expiry and release`,
      blocks: [
        {
          type: `problem`,
          html: `<p>Some winners never pay: distraction, a declined card, a bot hoarding to resell. Each abandoned hold hides a unit for the full TTL plus however long release takes. With high abandonment, a sale that "sold out" in seconds keeps leaking units back for many minutes, after the people told "sold out" have left.</p>`,
        },
        {
          type: `keypoints`,
          title: `Choosing the hold length`,
          items: [
            `Base it on the <strong>payment-time distribution</strong>; cover the long tail (3-D Secure, slow typists), typically 5 to 10 minutes.`,
            `Too short: genuine payers lose the unit mid-checkout, the worst experience in the system.`,
            `Too long: every abandoned hold hides a unit for longer.`,
            `Show a countdown; optionally extend once if payment has started (a conditional update on a HELD row).`,
          ],
        },
        {
          type: `lab`,
          id: `holdTimeout`,
          caption: `Push abandonment to 40% and watch how long the last 10% of units take to sell. Drop the hold to 2 minutes with a 3-minute median payment time to see genuine payers cut off. Compare the sweeper with the delayed message.`,
        },
        {
          type: `compare`,
          title: `Ways to expire holds`,
          items: [
            { title: `Redis key TTL + expiry event`, tone: `bad`, html: `<p>Expiry events fire when Redis notices the key (on access or by background sampling) and are fire-and-forget pub/sub. Missed events leak stock. A fast path at most.</p>` },
            { title: `Lazy expiry`, tone: `warn`, html: `<p>Treat a hold past <code>expires_at</code> as free when the next claimer looks. No job and instant release, but every read filters by time and a plain counter can't express "available unless expired".</p>` },
            { title: `Sweeper every few seconds`, tone: `warn`, html: `<p>A job releases HELD rows past expiry in small batches, using an index on (status, expires_at). Simple and robust; units wait up to one interval.</p>` },
            { title: `Delayed message per hold + sweeper`, tone: `ok`, html: `<p>Schedule a message for each hold's expiry (delay queue, workflow timer, or a sorted set scored by expiry). Release within about a second; the sweeper catches lost messages.</p>` },
          ],
        },
        {
          type: `code`,
          title: `Sweeper batch`,
          lang: `sql`,
          code: `WITH expired AS (
  UPDATE reservations SET status = 'EXPIRED'
   WHERE id IN (SELECT id FROM reservations
                 WHERE status = 'HELD' AND expires_at < now()
                 ORDER BY expires_at
                 LIMIT 500
                 FOR UPDATE SKIP LOCKED)
  RETURNING sale_id)
UPDATE inventory i SET remaining = remaining + e.n
  FROM (SELECT sale_id, count(*) AS n FROM expired GROUP BY sale_id) e
 WHERE i.sale_id = e.sale_id;
-- with a Redis gate, also INCRBY stock:{sale} n, remove the holders, clear the sold-out flag`,
        },
        {
          type: `idea`,
          html: `<p><strong>Release exactly once.</strong> The sweeper, a delayed message, a cancel and a late payment can all act on the same hold. Every transition is a conditional update from <code>HELD</code>; the stock increment happens in the same transaction and only if a row changed.</p>`,
        },
        {
          type: `diagram`,
          title: `Payment and expiry race for one hold`,
          caption: `Both actors run a conditional update from HELD. The row lock orders them; the first changes the status, the second matches nothing and takes its fallback.`,
          svg: `<svg viewBox="0 0 640 220" role="img" aria-label="Timeline: expiry job and payment webhook both try to update the same HELD reservation; the first wins, the second affects zero rows and falls back">
<line x1="40" y1="110" x2="610" y2="110" stroke-width="2" style="stroke: var(--dg-line)"/>
<text x="40" y="135" font-size="12" style="fill: var(--dg-muted)">time</text>
<rect x="60" y="88" width="110" height="44" rx="22" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="1.5"/>
<text x="115" y="115" text-anchor="middle" font-size="13" font-weight="700">HELD</text>
<rect x="250" y="20" width="170" height="54" rx="8" style="fill: var(--dg-6-soft); stroke: var(--dg-6)" stroke-width="1.5"/>
<text x="335" y="42" text-anchor="middle" font-size="12" font-weight="700">Expiry job (first)</text>
<text x="335" y="60" text-anchor="middle" font-size="11">1 row: EXPIRED, stock + 1</text>
<rect x="400" y="146" width="210" height="54" rx="8" style="fill: var(--dg-5-soft); stroke: var(--dg-5)" stroke-width="1.5"/>
<text x="505" y="168" text-anchor="middle" font-size="12" font-weight="700">Payment webhook (second)</text>
<text x="505" y="186" text-anchor="middle" font-size="11">0 rows: void the authorisation</text>
<line x1="335" y1="74" x2="335" y2="106" stroke-width="1.5" style="stroke: var(--dg-6)"/>
<line x1="505" y1="114" x2="505" y2="146" stroke-width="1.5" style="stroke: var(--dg-5)"/>
<circle cx="335" cy="110" r="5" style="fill: var(--dg-6)"/>
<circle cx="505" cy="110" r="5" style="fill: var(--dg-5)"/>
</svg>`,
        },
        {
          type: `callout`,
          tone: `tip`,
          html: `<p>Give released units to people who are <strong>still waiting</strong> (the queue or a waitlist) rather than reopening the sale to everyone; that turns late releases into sales without a second stampede.</p>`,
        },
        {
          type: `quiz`,
          q: `A cancel request and the sweeper release the same HELD reservation at the same moment. Each increments stock only if its update changed a row. How many units return to stock?`,
          options: [
            `Two, one from each`,
            `One: both updates include WHERE status = 'HELD', so only the first changes the row and increments stock`,
            `Zero: they cancel each other out`,
            `It depends only on the isolation level`,
          ],
          answer: 1,
          explain: `The row lock serialises the two conditional updates. The second no longer matches status = 'HELD', affects zero rows and skips the increment.`,
        },
      ],
    },
    // ------------------------------------------------------------------
    {
      id: `traffic-cliff`,
      title: `How do you survive a million requests a second arriving at once?`,
      kicker: `Admission control and the waiting room`,
      blocks: [
        {
          type: `problem`,
          html: `<p>Past capacity, a system serves <em>fewer</em> requests, not the same number more slowly: queues fill, requests time out after using resources, and clients retry, raising load exactly when the system is weakest. Autoscaling takes minutes; the spike lasts seconds.</p>`,
        },
        {
          type: `diagram`,
          title: `Offered load vs admitted load`,
          caption: `Without admission control the backend is offered many times its capacity in the first seconds. A waiting room admits just below capacity until the queue drains, then simply follows demand.`,
          svg: `<svg viewBox="0 0 640 240" role="img" aria-label="Chart: offered load spikes far above backend capacity at 10:00 then decays; admitted load with a waiting room stays flat just below capacity until the queue drains">
<line x1="60" y1="200" x2="610" y2="200" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<line x1="60" y1="20" x2="60" y2="200" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<line x1="60" y1="120" x2="610" y2="120" stroke-width="1.5" stroke-dasharray="6 4" style="stroke: var(--dg-muted)"/>
<text x="606" y="113" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">backend capacity</text>
<path d="M60 198 L120 196 L140 28 L180 40 L240 85 L320 135 L420 172 L610 192" style="fill: none; stroke: var(--dg-bad)" stroke-width="2.5"/>
<path d="M60 198 L120 196 L135 130 L430 130 L470 176 L610 192" style="fill: none; stroke: var(--dg-ok)" stroke-width="2.5"/>
<text x="130" y="218" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">10:00</text>
<text x="450" y="218" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">queue drained</text>
<text x="200" y="36" font-size="12" style="fill: var(--dg-bad)">offered load: everyone at once, plus retries</text>
<text x="150" y="154" font-size="12" style="fill: var(--dg-ok)">admitted with a waiting room</text>
<text x="20" y="110" font-size="12" style="fill: var(--dg-muted)">req/s</text>
</svg>`,
        },
        {
          type: `compare`,
          title: `From hoping to controlling`,
          items: [
            { title: `Autoscale on demand`, tone: `bad`, html: `<p>New capacity arrives minutes after the spike has done its damage. Retries make the overload self-sustaining.</p>` },
            { title: `Pre-scale everything to the peak`, tone: `warn`, html: `<p>Expensive for a few seconds of load, and the stock counter, database and payment provider still have hard limits.</p>` },
            { title: `CDN + waiting room admitting at capacity`, tone: `ok`, html: `<p>Static content and the queue live at the edge; users are let in at the rate the backend can serve, carrying a signed token. Full throughput, near-zero errors, honest progress for everyone else.</p>` },
          ],
        },
        {
          type: `steps`,
          title: `How the waiting room works`,
          items: [
            `Users load a static queue page from the CDN and get a position (one entry per signed-in account).`,
            `The page polls a cheap status endpoint for its position and the sale state.`,
            `An admitter lets in A users per second, sized by load tests to backend capacity.`,
            `Admitted users receive a short-lived <strong>signed token</strong> {user, sale, expiry}.`,
            `The gateway verifies the token without a database call and rejects requests without one.`,
            `When stock is gone, the queue page switches to "sold out" and stops polling.`,
          ],
        },
        {
          type: `code`,
          title: `Admission check at the gateway`,
          lang: `text`,
          code: `token = payload {user_id, sale_id, expires_at} + HMAC_SHA256(secret, payload)
on POST /sales/{id}/reservations:
  reject 401 if token missing, signature invalid or expired
  reject 403 if token.sale != id or token.user != authenticated user
  reject 409 fast if soldOut[id]
  reject 429 + Retry-After if per-account or per-IP rate exceeded
  else forward to the reservation service`,
        },
        {
          type: `lab`,
          id: `waitingRoom`,
          caption: `Compare the red and green lines: without a waiting room the backend is offered many times its capacity and fails millions of requests; with one it runs just below capacity. Turn retries off to see how much of the overload is self-inflicted.`,
        },
        {
          type: `keypoints`,
          title: `Load shedding behind the waiting room`,
          items: [
            `<strong>Reject early and cheaply:</strong> at the edge or gateway, before any database work.`,
            `<strong>Prioritise:</strong> pay and webhook calls (money in flight) over reserve, reserve over page refreshes.`,
            `<strong>Tell clients how to back off:</strong> 429 with Retry-After; clients retry with exponential backoff and jitter.`,
            `<strong>Kill switches:</strong> pause admission, lower A, extend holds, close the sale.`,
          ],
        },
        {
          type: `realworld`,
          items: [
            { org: `Cloudflare`, title: `Waiting Room`, html: `A managed waiting room at the CDN edge: you set how many users may be on the origin, and excess visitors see a queue page until a slot frees up.` },
            { org: `Queue-it`, title: `Virtual waiting rooms`, html: `A vendor that queues visitors for ticket sales and product drops; its pre-queue can randomise the order of visitors who arrive before the sale starts.` },
          ],
        },
      ],
    },
    // ------------------------------------------------------------------
    {
      id: `fairness-bots`,
      title: `Who gets the consoles: the fastest script or a fair draw?`,
      kicker: `Fairness and bots`,
      blocks: [
        {
          type: `problem`,
          html: `<p>If "fair" isn't defined, it quietly becomes "lowest latency and best automation". Resellers run thousands of sessions from machines close to your servers; in a first-come race they arrive in the first milliseconds and take most of the stock.</p>`,
        },
        {
          type: `compare`,
          title: `Fairness models`,
          items: [
            { title: `First come, first served`, tone: `bad`, html: `<p>Arrival order decides. Easy to explain, but milliseconds matter, so scripts win.</p>` },
            { title: `Randomised start`, tone: `warn`, html: `<p>Everyone who joins before opening gets a random position; later arrivals queue behind. Refresh-hammering stops helping. Extra sessions still mean extra tickets unless entries are tied to verified accounts.</p>` },
            { title: `Pre-registered raffle`, tone: `ok`, html: `<p>Register in advance, verify accounts, remove duplicates, draw winners and give each a purchase window. Strongest against bots and gentlest on load; more friction and less "event" feel.</p>` },
          ],
        },
        {
          type: `lab`,
          id: `fairnessModes`,
          caption: `Add 50,000 bot accounts and compare the three models. Then turn off the one-per-account limit: under first come, first served the bots take everything.`,
        },
        {
          type: `keypoints`,
          title: `Layered bot defences`,
          items: [
            `<strong>One unit per account</strong>, enforced atomically (unique constraint or the Redis holders set).`,
            `<strong>Rate limits</strong> per account, device and IP at the edge.`,
            `<strong>Friction at queue entry:</strong> CAPTCHA or proof-of-work, so each extra session costs something.`,
            `<strong>Risk signals:</strong> account age, purchase history, payment-method reuse; verify before a raffle draw.`,
            `<strong>Signed admission tokens</strong> bound to the user, so the queue can't be skipped or shared.`,
          ],
        },
        {
          type: `callout`,
          tone: `mistake`,
          html: `<p>Relying on one defence. Each is bypassable alone; together they raise the cost of running thousands of sessions above the resale profit.</p>`,
        },
        {
          type: `realworld`,
          items: [
            { org: `Ticketmaster`, title: `The Eras Tour presale (2022)`, html: `Ticketmaster said the November 2022 presale saw about 3.5 billion system requests, roughly four times its previous peak, despite Verified Fan pre-registration: demand overwhelming a sale, and pre-registration as both a fairness and a load tool.` },
            { org: `Nike SNKRS`, title: `Draws instead of a race`, html: `Many high-demand sneaker releases run as a draw: entrants sign up during a window and winners are picked at random, which removes the speed advantage of bots.` },
          ],
        },
        {
          type: `quiz`,
          q: `Why does a randomised start help humans against bots?`,
          options: [
            `It blocks bots entirely`,
            `It removes the speed advantage: arriving first no longer matters, only arriving before the start`,
            `It makes the sale finish faster`,
            `It removes the need for a per-account limit`,
          ],
          answer: 1,
          explain: `Bots win first come, first served because they're fastest. Shuffling everyone who arrived on time takes speed out of it. Bots can still add entries with more accounts, which is why it's paired with verification and per-account limits.`,
        },
      ],
    },
    // ------------------------------------------------------------------
    {
      id: `payments`,
      title: `How do you take payment without double charges, lost orders or two owners?`,
      kicker: `Idempotency, webhooks and reconciliation`,
      blocks: [
        {
          type: `problem`,
          html: `<p>Payment is the one step you don't control. Responses get lost after the charge, the browser closes mid-checkout, the provider delivers the same webhook twice or hours late, and a payment can succeed seconds after its hold expired and the unit went to someone else.</p>`,
        },
        {
          type: `compare`,
          title: `From fragile to safe`,
          items: [
            { title: `Trust the success redirect`, tone: `bad`, html: `<p>Mark the order paid when the browser returns to a "success" URL. Redirects can be replayed, forged or never happen.</p>` },
            { title: `Charge first, check the hold later`, tone: `warn`, html: `<p>With idempotency keys and webhooks there are no double charges, but a late payment on an expired hold means a captured charge, then a refund and a support ticket.</p>` },
            { title: `Authorise, mark PAID conditionally, then capture`, tone: `ok`, html: `<p>The hold's state decides whether money moves. If the hold expired, the authorisation is voided and nobody is charged.</p>` },
          ],
        },
        {
          type: `steps`,
          title: `A safe payment flow`,
          items: [
            `Client calls pay with an <strong>Idempotency-Key</strong>; the order service stores it with the pending order and passes it to the provider.`,
            `The provider <strong>authorises</strong> the card (funds reserved, not taken).`,
            `Webhook arrives: verify the signature, skip event IDs already processed.`,
            `Run <code>UPDATE reservations SET status = 'PAID' WHERE id = :id AND status = 'HELD'</code>.`,
            `One row changed: <strong>capture</strong> and confirm the order. Zero rows: <strong>void</strong> the authorisation and tell the user.`,
            `Return 2xx only after commit, so the provider retries on failure. A backstop job polls the provider for orders stuck in pending.`,
          ],
        },
        {
          type: `table`,
          title: `Failure recovery`,
          headers: [`Failure`, `Recovery`],
          rows: [
            [`Pay response lost; client retries`, `Same idempotency key: stored result returned, no second charge`],
            [`Webhook delivered twice or out of order`, `Event-ID dedupe plus conditional transitions: same end state`],
            [`Webhook never arrives`, `Reconciliation job queries the provider for pending orders`],
            [`Payment succeeds after expiry`, `HELD to PAID matches 0 rows: void (or refund automatically)`],
            [`Provider outage mid-sale`, `Stop admitting new reservations or extend holds; don't let holds expire because the provider is down`],
            [`Capture fails after PAID`, `Retry capture idempotently; alert if the authorisation is about to lapse`],
          ],
        },
        {
          type: `realworld`,
          items: [
            { org: `Stripe`, title: `Idempotency-Key header`, html: `Stripe's API accepts an <code>Idempotency-Key</code> header on POST requests, saves the first result for a key and returns it for retries with the same key.` },
            { org: `Stripe`, title: `Webhook retries`, html: `Stripe retries undelivered webhook events with exponential backoff for up to three days in live mode, and recommends recording processed event IDs because duplicates can arrive.` },
          ],
        },
        {
          type: `callout`,
          tone: `interview`,
          html: `<p>A strong answer names the money's source of truth (the provider), makes every step idempotent (keys on requests, event IDs on webhooks, conditional transitions), lets the hold decide whether money moves (authorise then capture), and closes the loop with reconciliation.</p>`,
        },
        {
          type: `quiz`,
          q: `The payment webhook and the expiry job process the same reservation at the same moment, both with conditional updates from HELD. What happens?`,
          options: [
            `Both succeed: the unit is sold and returned to stock`,
            `Exactly one update changes the row; the other sees zero rows and takes its fallback (void the payment, or skip the expiry)`,
            `The database deadlocks`,
            `The second overwrites the first`,
          ],
          answer: 1,
          explain: `Both statements include WHERE status = 'HELD'. The row lock serialises them; the first changes the status, so the second matches nothing. The affected-row count tells each path whether it won.`,
        },
      ],
    },
  ],
  takeaways: [
    `Correctness lives in one place: a <strong>conditional, atomic claim</strong> plus a hold, and every later transition <strong>conditional from HELD</strong>.`,
    `A locked row does about <strong>1 / lock time</strong> updates a second. Move the gate to an <strong>atomic Redis script</strong> with Postgres as the record, and plan for compensation, reconciliation and failover rebuilds.`,
    `<strong>Buckets</strong> and <strong>token pools</strong> remove the single hot key; a <strong>sold-out flag</strong> at the edge ends the burst.`,
    `Abandoned holds hide stock for TTL + release delay. Expire with <strong>delayed messages plus a sweeper</strong>; never rely on Redis expiry events alone.`,
    `Past capacity, throughput falls. A <strong>waiting room</strong> with <strong>signed tokens</strong> admits at capacity; shed the rest early with 429 and backoff.`,
    `<strong>Define fair</strong> (randomised start or raffle beats FCFS) and layer bot defences around one-per-account.`,
    `Payments: <strong>idempotency keys</strong>, <strong>authorise then capture</strong>, idempotent webhooks and a <strong>reconciliation</strong> job.`,
  ],
  furtherReading: [
    { title: `Hello Interview: Design a Flash Sale System`, url: `https://www.hellointerview.com/learn/system-design/problem-breakdowns/flash-sale`, note: `The original walkthrough of this problem.` },
    { title: `PostgreSQL documentation: SELECT, the locking clause (FOR UPDATE, SKIP LOCKED)`, url: `https://www.postgresql.org/docs/current/sql-select.html` },
    { title: `Redis documentation: EVAL (Lua scripting)`, url: `https://redis.io/docs/latest/commands/eval/` },
    { title: `Redis documentation: Keyspace notifications`, url: `https://redis.io/docs/latest/develop/use/keyspace-notifications/` },
    { title: `Stripe API reference: Idempotent requests`, url: `https://docs.stripe.com/api/idempotent_requests` },
    { title: `Stripe: Place a hold on a payment method (authorise and capture later)`, url: `https://docs.stripe.com/payments/place-a-hold-on-a-payment-method` },
    { title: `Cloudflare Waiting Room documentation`, url: `https://developers.cloudflare.com/waiting-room/` },
  ],
};
