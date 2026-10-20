// Problem breakdowns, part 2: Flash Sale, as one problem page (Problem, Solution, Deep Dives, Core Concepts, Q&A, By Level, Cheatsheet).
// Original study notes. The problem follows Hello Interview's Flash Sale breakdown:
// https://www.hellointerview.com/learn/system-design/problem-breakdowns/flash-sale
window.DATA.parts[2] = `Part II &middot; Flash Sale`;
window.DATA.chapters.push({
  id: `flash-sale`, part: 2, number: 2,
  title: `Flash Sale: 20,000 consoles for 10 million buyers`,
  overview: `A flash sale sells a small, fixed stock to a crowd hundreds of times larger, all within seconds of a published start time. The running example is a games-console launch: 20,000 units at 10:00, about 10 million people waiting. The product surface is tiny (view, reserve, pay), so the interview is about the qualities: <strong>never sell a unit twice</strong>, survive a traffic cliff that arrives all at once, and give real people a fair chance against bots. The key move is the <strong>reservation</strong>: secure the unit in milliseconds with an atomic operation, then let the slow, external payment happen against a short hold.`,
  source: { title: `Hello Interview: Design a Flash Sale System`, url: `https://www.hellointerview.com/learn/system-design/problem-breakdowns/flash-sale` },

  // ------------------------------------------------------------------ Problem
  problem: [
    {
      id: `what-we-build`,
      title: `What we are building`,
      kicker: `The console launch`,
      blocks: [
        {
          type: `text`,
          html: `<p>A console maker launches a new model online. <strong>20,000 units</strong> go on sale at <strong>10:00:00</strong>, one per customer, and roughly <strong>10 million</strong> people are waiting with the page open. It will sell out in seconds. Almost everyone will be told "no"; the system's job is to say it quickly, fairly and without ever promising one console to two people.</p>`,
        },
        {
          type: `keypoints`,
          title: `Functional requirements`,
          items: [
            `<strong>View the item:</strong> product page, price, start time, and whether the sale is open, live or sold out.`,
            `<strong>Reserve one unit</strong> for a limited time (say 10 minutes) once the sale is live. The unit is off the shelf for everyone else while the hold lasts.`,
            `<strong>Pay for a reserved unit</strong> to turn the hold into an order. Unpaid holds expire and the unit goes back on sale.`,
          ],
        },
        {
          type: `compare`,
          title: `Why "reserve" is a separate step`,
          items: [
            { title: `Pay first, decrement on success`, tone: `bad`, html: `<p>Thousands of people pay for the last few units at once. Whoever settles first wins; everyone else has been charged and needs a refund and an apology.</p>` },
            { title: `Lock stock while paying`, tone: `bad`, html: `<p>Hold a lock on the stock row across the payment call. Correct, but every buyer waits behind the slowest card in the queue; 20,000 units would take hours to sell.</p>` },
            { title: `Reserve, then pay`, tone: `ok`, html: `<p>Claim the unit with a fast, local, atomic operation and record a hold that expires. The buyer pays against the hold; abandoned holds go back on the shelf.</p>` },
          ],
        },
        {
          type: `callout`,
          tone: `interview`,
          html: `<p>Say the reason in one sentence: "Payment is slow and external, so I secure the unit first with a short hold and settle the money against it." Reaching the reservation step unprompted is a clear signal.</p>`,
        },
      ],
    },
    {
      id: `non-functional`,
      title: `Non-functional requirements`,
      kicker: `Where the difficulty lives`,
      blocks: [
        {
          type: `table`,
          headers: [`Requirement`, `Target`, `What it forces`],
          rows: [
            [`<strong>Never oversell</strong>`, `Reserved + sold ≤ stock, always`, `Strong consistency on the stock counter and holds`],
            [`<strong>Survive the cliff</strong>`, `~1M req/s within seconds of 10:00`, `CDN, admission control, capacity ready in advance`],
            [`<strong>Fair, bot-resistant</strong>`, `An agreed fairness model, one per customer`, `Waiting room, per-account limits, friction for bots`],
            [`<strong>Say "no" fast</strong>`, `Sold-out answered in milliseconds`, `Sold-out flag checked at the edge`],
            [`<strong>Stale reads are fine</strong>`, `Page and "units left" may lag by seconds`, `Read path is cached; only the write path is exact`],
          ],
        },
        {
          type: `idea`,
          html: `<p>Treat the system as a <strong>funnel</strong>. Each layer discards as much traffic as it can, as cheaply as it can, so only a trickle reaches the one place that must be exactly right: the stock counter.</p>`,
        },
        {
          type: `diagram`,
          title: `The flash-sale funnel`,
          caption: `Page loads end at the CDN; the waiting room admits users at the rate the backend can serve; the stock gate turns attempts into 20,000 claims; only claims become database writes and payments.`,
          svg: `<svg viewBox="0 0 640 300" role="img" aria-label="A funnel narrowing from ten million users at the CDN, through the waiting room and the stock gate, to twenty thousand holds and payments">
<path d="M40 20 L600 20 L520 90 L120 90 Z" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<path d="M120 100 L520 100 L450 160 L190 160 Z" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="1.5"/>
<path d="M190 170 L450 170 L390 225 L250 225 Z" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="1.5"/>
<rect x="250" y="235" width="140" height="50" rx="8" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="1.5"/>
<text x="320" y="48" text-anchor="middle" font-size="14" font-weight="700">CDN: page, images, countdown</text>
<text x="320" y="70" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">~10M users, ~1M requests per second</text>
<text x="320" y="125" text-anchor="middle" font-size="14" font-weight="700">Waiting room</text>
<text x="320" y="145" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">admits at backend capacity</text>
<text x="320" y="193" text-anchor="middle" font-size="14" font-weight="700">Stock gate</text>
<text x="320" y="212" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">atomic claim, sold-out flag</text>
<text x="320" y="257" text-anchor="middle" font-size="13" font-weight="700">20,000 holds</text>
<text x="320" y="275" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">DB writes, payments</text>
<text x="530" y="135" font-size="12" style="fill: var(--dg-muted)">"please wait"</text>
<text x="460" y="200" font-size="12" style="fill: var(--dg-muted)">"sold out"</text>
</svg>`,
        },
        {
          type: `callout`,
          tone: `tip`,
          html: `<p><strong>Displays can lie a little; decisions can't.</strong> Showing "12 left" when 9 remain is harmless as long as the reserve call itself is exact.</p>`,
        },
      ],
    },
    {
      id: `the-numbers`,
      title: `Back-of-the-envelope numbers`,
      kicker: `Let the numbers pick the design`,
      blocks: [
        {
          type: `steps`,
          items: [
            `<strong>Requests:</strong> 10M users × ~5 requests in the first minute (page, status polls, reserve, retries) ≈ 50M, so <span class="formula">50M ÷ 60 s ≈ 830K/s</span> on average and a few times that in the first seconds.`,
            `<strong>Success rate:</strong> <span class="formula">20,000 ÷ 10,000,000 = 0.2%</span>. 499 of every 500 users get "no".`,
            `<strong>One locked row:</strong> at ~1 ms per update it takes <span class="formula">≈ 1,000 updates/s</span>, against hundreds of thousands of reserve attempts per second.`,
            `<strong>One Redis node:</strong> on the order of 100K simple operations per second, about 100× a locked row.`,
            `<strong>Writes that matter:</strong> ~20,000 holds and their payments. Tiny, as long as the losers never reach the database.`,
          ],
        },
        {
          type: `lab`,
          id: `flashEstimator`,
          caption: `Start with the defaults and compare reserve attempts with what one locked row can take. Then shrink the crowd to 100K users over five minutes: at that scale the simple design is fine. Know which side of the line you're on.`,
        },
        {
          type: `quiz`,
          q: `20,000 units, 10 million users trying within a minute. What is the core engineering challenge?`,
          options: [
            `Storing 10 million reservations`,
            `Absorbing a short burst of attempts at one contended counter and rejecting almost all of them quickly, without ever exceeding stock`,
            `Processing 10 million payments per minute`,
            `Serving the product page from a large database cluster`,
          ],
          answer: 1,
          explain: `At most 20,000 attempts succeed, so there are at most 20,000 holds and payments. The page is static and belongs on a CDN. The hard part is the burst at the counter: picking winners exactly and turning millions away fast.`,
        },
      ],
    },
    {
      id: `out-of-scope`,
      title: `Out of scope, and questions to ask`,
      kicker: `Drawing the line`,
      blocks: [
        {
          type: `list`,
          title: `Not designing today`,
          items: [
            `Catalogue and search, recommendations.`,
            `Shipping, returns, refunds (beyond automatic refunds/voids for failed holds), order history.`,
            `Admin tools that configure sales and upload stock.`,
            `Fraud scoring beyond basic bot defence.`,
          ],
        },
        {
          type: `list`,
          title: `Ask before designing`,
          items: [
            `How many units and users, and how fast do they arrive?`,
            `How long may a hold last? Is one per customer the rule?`,
            `What does fair mean: first come, a random draw among on-time arrivals, or a pre-registered raffle?`,
            `Is a slightly stale stock indicator acceptable? (Almost always yes.)`,
            `One SKU or several colours and bundles? Each SKU is its own counter.`,
          ],
        },
      ],
    },
  ],

  // ------------------------------------------------------------------ Solution
  solution: [
    {
      id: `core-entities`,
      title: `Core entities`,
      kicker: `Four nouns`,
      blocks: [
        {
          type: `table`,
          headers: [`Entity`, `Key fields`, `Why it exists`],
          rows: [
            [`<strong>Sale</strong>`, `id, item, starts_at, stock, per_customer_limit`, `Configuration; read-mostly, cached`],
            [`<strong>Inventory</strong>`, `sale_id, remaining`, `The one contended number`],
            [`<strong>Reservation</strong>`, `id, sale_id, user_id, status, expires_at`, `The hold: claimed fast, paid later, may expire`],
            [`<strong>Order</strong>`, `id, reservation_id, amount, payment_status, idempotency_key`, `The money side, driven by the payment provider`],
          ],
        },
        {
          type: `text`,
          html: `<p>Reservation and Order are separate because they have different speeds and failure modes: claiming is local and takes milliseconds; paying is external and can take minutes. A reservation moves through a tiny state machine, and <strong>every transition is a conditional update from HELD</strong>, so a late payment, an expiry job and a cancel can race and exactly one wins.</p>`,
        },
        {
          type: `diagram`,
          title: `Reservation lifecycle`,
          caption: `A hold ends in exactly one terminal state. EXPIRED and CANCELLED return the unit to stock in the same transaction as the status change.`,
          svg: `<svg viewBox="0 0 640 210" role="img" aria-label="State machine: HELD moves to PAID on payment confirmed, to EXPIRED when the TTL passes, or to CANCELLED when the user releases; expired and cancelled return the unit to stock">
<defs><marker id="fs-arrow-2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="30" y="80" width="120" height="50" rx="25" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="1.5"/>
<text x="90" y="110" text-anchor="middle" font-size="14" font-weight="700">HELD</text>
<rect x="420" y="15" width="150" height="44" rx="22" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="1.5"/>
<text x="495" y="42" text-anchor="middle" font-size="14" font-weight="700">PAID</text>
<rect x="420" y="83" width="150" height="44" rx="22" style="fill: var(--dg-6-soft); stroke: var(--dg-6)" stroke-width="1.5"/>
<text x="495" y="110" text-anchor="middle" font-size="14" font-weight="700">EXPIRED</text>
<rect x="420" y="151" width="150" height="44" rx="22" style="fill: var(--dg-6-soft); stroke: var(--dg-6)" stroke-width="1.5"/>
<text x="495" y="178" text-anchor="middle" font-size="14" font-weight="700">CANCELLED</text>
<line x1="150" y1="95" x2="418" y2="37" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#fs-arrow-2)"/>
<line x1="150" y1="105" x2="418" y2="105" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#fs-arrow-2)"/>
<line x1="150" y1="115" x2="418" y2="173" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#fs-arrow-2)"/>
<text x="285" y="55" text-anchor="middle" font-size="12">payment confirmed</text>
<text x="285" y="98" text-anchor="middle" font-size="12">expires_at passed</text>
<text x="285" y="160" text-anchor="middle" font-size="12">user releases</text>
<text x="590" y="110" font-size="12" style="fill: var(--dg-muted)">stock +1</text>
<text x="590" y="178" font-size="12" style="fill: var(--dg-muted)">stock +1</text>
</svg>`,
        },
      ],
    },
    {
      id: `api`,
      title: `API`,
      kicker: `Only one call is contended`,
      blocks: [
        {
          type: `table`,
          headers: [`Call`, `Purpose`, `Contended?`],
          rows: [
            [`<code>GET /sales/:id</code>`, `Page data and status (upcoming, live, sold out)`, `No: CDN plus a short-TTL status`],
            [`<code>POST /sales/:id/reservations</code>`, `Claim one unit; returns the hold and its expiry`, `<strong>Yes:</strong> the stock counter`],
            [`<code>POST /reservations/:id/order</code>`, `Start payment for a hold`, `No: per reservation`],
            [`<code>POST /webhooks/payments</code>`, `Provider reports success or failure`, `No`],
          ],
        },
        {
          type: `code`,
          title: `Reserve: request and responses`,
          lang: `http`,
          code: `POST /sales/console-launch/reservations
Authorization: Bearer <session>          # user id comes from here, never the body
X-Admission-Token: <signed by the waiting room>
Idempotency-Key: 7f3c9a...                # same key on every retry

201 Created   { "reservationId": "r_81f2", "expiresAt": "...T10:10:04Z" }
409 Conflict  { "error": "SOLD_OUT" }      # or ALREADY_RESERVED
429 Too Many Requests   Retry-After: 5     # shed load; client backs off`,
        },
        {
          type: `keypoints`,
          items: [
            `<strong>Idempotency keys</strong> on reserve and pay: a retry after a lost response returns the original result instead of a second hold or a second charge.`,
            `<strong>Identity from the session</strong>, never from the request body, so one-per-customer can't be bypassed.`,
            `<strong>Distinct error codes:</strong> "sold out" tells the client to stop; "try later" (429) tells it to back off. Mixing them causes retry storms.`,
          ],
        },
      ],
    },
    {
      id: `simple-design`,
      title: `A simple, correct design`,
      kicker: `Correct before fast`,
      blocks: [
        {
          type: `text`,
          html: `<p>Start with three moving parts: a <strong>static sale page on the CDN</strong>, a <strong>reservation service</strong> over Postgres that decrements stock and inserts a hold in one transaction, and an <strong>order service</strong> that charges through a payment provider with an idempotency key, confirmed by the provider's webhook.</p>`,
        },
        {
          type: `diagram`,
          title: `The baseline`,
          caption: `Page loads stop at the CDN. Reserve calls decrement stock and insert a hold in one transaction. Pay calls go to the order service and the payment provider, whose webhook confirms the result.`,
          svg: `<svg viewBox="0 0 640 290" role="img" aria-label="Client talks to a CDN for the page, to a reservation service that writes inventory and reservations in Postgres, and to an order service that calls a payment provider, which sends a webhook back">
<defs><marker id="fs-arrow-1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="10" y="120" width="90" height="50" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="55" y="150" text-anchor="middle" font-size="13" font-weight="700">Client</text>
<rect x="170" y="20" width="140" height="46" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<text x="240" y="40" text-anchor="middle" font-size="13" font-weight="700">CDN</text>
<text x="240" y="57" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">page, status (short TTL)</text>
<rect x="170" y="122" width="140" height="46" rx="8" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="1.5"/>
<text x="240" y="142" text-anchor="middle" font-size="13" font-weight="700">Reservation svc</text>
<text x="240" y="159" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">POST /reservations</text>
<rect x="170" y="222" width="140" height="46" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="1.5"/>
<text x="240" y="242" text-anchor="middle" font-size="13" font-weight="700">Order svc</text>
<text x="240" y="259" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">POST .../order</text>
<rect x="390" y="150" width="130" height="70" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<text x="455" y="176" text-anchor="middle" font-size="13" font-weight="700">Postgres</text>
<text x="455" y="193" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">inventory</text>
<text x="455" y="208" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">reservations, orders</text>
<rect x="390" y="240" width="130" height="40" rx="8" style="fill: var(--dg-5-soft); stroke: var(--dg-5)" stroke-width="1.5"/>
<text x="455" y="265" text-anchor="middle" font-size="12" font-weight="700">Payment provider</text>
<line x1="100" y1="135" x2="168" y2="50" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#fs-arrow-1)"/>
<line x1="100" y1="145" x2="168" y2="145" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#fs-arrow-1)"/>
<line x1="100" y1="155" x2="168" y2="240" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#fs-arrow-1)"/>
<line x1="310" y1="150" x2="388" y2="175" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#fs-arrow-1)"/>
<line x1="310" y1="240" x2="388" y2="205" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#fs-arrow-1)"/>
<line x1="310" y1="255" x2="388" y2="258" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#fs-arrow-1)"/>
<path d="M520 262 C 600 262, 600 120, 455 120 L 340 120 L 312 232" style="fill: none; stroke: var(--dg-5)" stroke-width="1.5" stroke-dasharray="5 4" marker-end="url(#fs-arrow-1)"/>
<text x="560" y="140" font-size="12" style="fill: var(--dg-muted)">webhook</text>
</svg>`,
        },
        {
          type: `compare`,
          title: `How the obvious version oversells, and the fix`,
          items: [
            { title: `Read, check in the app, write`, tone: `bad`, html: `<p>A and B both <code>SELECT remaining</code> and see 1, both pass <code>if remaining &gt; 0</code>, both write 0 and insert a hold. Two holds, one console, and the counter looks normal. Under a burst this is the common case, not a rare one.</p>` },
            { title: `Check inside the write`, tone: `ok`, html: `<p><code>UPDATE inventory SET remaining = remaining - 1 WHERE sale_id = :s AND remaining &gt; 0</code>, then read the affected-row count. The database checks and writes as one step under the row lock; zero rows means sold out.</p>` },
          ],
        },
        {
          type: `code`,
          title: `The reserve transaction`,
          lang: `sql`,
          code: `BEGIN;
UPDATE inventory SET remaining = remaining - 1
 WHERE sale_id = :sale AND remaining > 0;
-- 0 rows: sold out -> ROLLBACK, 409 SOLD_OUT

INSERT INTO reservations (id, sale_id, user_id, status, expires_at)
VALUES (:id, :sale, :user, 'HELD', now() + interval '10 minutes');
-- unique (sale_id, user_id) violated: already holds one -> ROLLBACK

COMMIT;`,
        },
        {
          type: `lab`,
          id: `oversellRace`,
          caption: `Run "read, check, write" and count holds against stock. Switch to the conditional update: exactly the stock is sold. Then try SELECT ... FOR UPDATE (correct, but buyers queue) and optimistic versioning (correct, but people hear "sold out" while stock remains).`,
        },
        {
          type: `callout`,
          tone: `warning`,
          title: `Where the baseline breaks`,
          html: `<ul>
<li><strong>The hot row:</strong> every attempt, including millions of losers, queues on one row lock (~1,000/s).</li>
<li><strong>Leaking holds:</strong> unpaid holds hide stock until something expires them.</li>
<li><strong>The crowd:</strong> even a perfect counter can't take 10 million people at 10:00:00.</li>
</ul><p>These, plus fairness and payment failures, are the deep dives.</p>`,
        },
      ],
    },
    {
      id: `evolved-design`,
      title: `The evolved design`,
      kicker: `Funnel first, then the gate`,
      blocks: [
        {
          type: `text`,
          html: `<p>Keep the baseline's correctness rules and add a layer per bottleneck:</p>
<ul>
<li><strong>CDN + waiting room</strong> serve the page and queue at the edge, randomise pre-start arrivals and admit users at backend capacity with a short-lived <strong>signed admission token</strong>.</li>
<li><strong>API gateway</strong> verifies the token, applies per-account and per-IP rate limits, and answers from a <strong>sold-out flag</strong> once stock is gone.</li>
<li><strong>Reservation service</strong> claims through an <strong>atomic Lua script in Redis</strong> (one per user, stock &gt; 0, decrement). Only winners write a HELD row to <strong>Postgres</strong>, the system of record.</li>
<li><strong>Expiry workers</strong>: a delayed message per hold plus a sweeper safety net flip HELD to EXPIRED and give the unit back to Postgres and Redis.</li>
<li><strong>Order service</strong> authorises the card with an idempotency key; the provider's <strong>webhook</strong> moves HELD to PAID, then the order captures. Late payments on expired holds are voided.</li>
</ul>`,
        },
        {
          type: `diagram`,
          title: `Flash sale: evolved design`,
          caption: `Static content and the queue live at the CDN. The gateway enforces tokens, limits and the sold-out flag. Redis decides winners; Postgres records holds; expiry workers return units to both; the order service authorises payment and captures when the webhook confirms the hold.`,
          svg: `<svg viewBox="0 0 640 370" role="img" aria-label="Evolved design: user to CDN and waiting room, then API gateway, reservation service with a Redis gate and Postgres, expiry workers, order service and payment provider with a webhook back">
<defs><marker id="fs-arrow-3" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="10" y="20" width="90" height="44" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="55" y="47" text-anchor="middle" font-size="13" font-weight="700">User</text>
<rect x="140" y="12" width="200" height="60" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<text x="240" y="36" text-anchor="middle" font-size="13" font-weight="700">CDN + waiting room</text>
<text x="240" y="54" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">page, queue, signed token</text>
<rect x="380" y="12" width="240" height="60" rx="8" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="1.5"/>
<text x="500" y="36" text-anchor="middle" font-size="13" font-weight="700">API gateway</text>
<text x="500" y="54" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">token, rate limits, sold-out flag</text>
<rect x="380" y="110" width="220" height="50" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="1.5"/>
<text x="490" y="140" text-anchor="middle" font-size="13" font-weight="700">Reservation service</text>
<rect x="140" y="110" width="200" height="50" rx="8" style="fill: var(--dg-5-soft); stroke: var(--dg-5)" stroke-width="1.5"/>
<text x="240" y="131" text-anchor="middle" font-size="13" font-weight="700">Redis gate</text>
<text x="240" y="148" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">Lua: one per user, stock &gt; 0</text>
<rect x="380" y="195" width="220" height="50" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<text x="490" y="216" text-anchor="middle" font-size="13" font-weight="700">Postgres (record)</text>
<text x="490" y="233" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">holds, inventory, orders</text>
<rect x="140" y="195" width="200" height="50" rx="8" style="fill: var(--dg-6-soft); stroke: var(--dg-6)" stroke-width="1.5"/>
<text x="240" y="216" text-anchor="middle" font-size="13" font-weight="700">Expiry workers</text>
<text x="240" y="233" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">delayed msgs + sweeper</text>
<rect x="380" y="282" width="110" height="50" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="1.5"/>
<text x="435" y="312" text-anchor="middle" font-size="12" font-weight="700">Order service</text>
<rect x="510" y="282" width="110" height="50" rx="8" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="1.5"/>
<text x="565" y="304" text-anchor="middle" font-size="12" font-weight="700">Payment</text>
<text x="565" y="320" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">provider</text>
<line x1="100" y1="42" x2="138" y2="42" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#fs-arrow-3)"/>
<line x1="340" y1="42" x2="378" y2="42" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#fs-arrow-3)"/>
<line x1="490" y1="72" x2="490" y2="108" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#fs-arrow-3)"/>
<line x1="380" y1="135" x2="342" y2="135" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#fs-arrow-3)"/>
<line x1="490" y1="160" x2="490" y2="193" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#fs-arrow-3)"/>
<line x1="340" y1="220" x2="378" y2="220" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#fs-arrow-3)"/>
<line x1="240" y1="195" x2="240" y2="162" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#fs-arrow-3)"/>
<text x="248" y="183" font-size="11" style="fill: var(--dg-muted)">+1 on expiry</text>
<path d="M620 50 H632 V264 H462 V280" style="fill: none; stroke: var(--dg-muted)" stroke-width="1.5" marker-end="url(#fs-arrow-3)"/>
<text x="560" y="259" font-size="11" style="fill: var(--dg-muted)">pay request</text>
<line x1="435" y1="282" x2="435" y2="247" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#fs-arrow-3)"/>
<line x1="490" y1="300" x2="508" y2="300" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#fs-arrow-3)"/>
<path d="M565 332 C 565 356, 470 356, 470 334" style="fill: none; stroke: var(--dg-ok)" stroke-width="1.5" stroke-dasharray="5 4" marker-end="url(#fs-arrow-3)"/>
<text x="350" y="356" font-size="11" style="fill: var(--dg-muted)">webhook: HELD to PAID</text>
</svg>`,
        },
        {
          type: `table`,
          title: `Requirement to component`,
          headers: [`Requirement`, `Component`],
          rows: [
            [`Never oversell`, `Atomic Redis claim, Postgres of record, conditional transitions, reconciliation`],
            [`Survive the cliff`, `CDN, waiting room admitting at capacity, load shedding at the gateway`],
            [`Say "no" fast`, `Sold-out flag at the gateway and on the queue page`],
            [`Fair, bot-resistant`, `Randomised start or raffle, one per account, rate limits, CAPTCHA at entry`],
            [`No lost or double payments`, `Idempotency keys, authorise then capture, idempotent webhooks, reconciliation job`],
            [`Stock comes back`, `Delayed expiry messages plus sweeper; released units go to people still queued`],
          ],
        },
      ],
    },
    {
      id: `walkthrough`,
      title: `One purchase, end to end`,
      kicker: `Request walk-through`,
      blocks: [
        {
          type: `steps`,
          items: [
            `<strong>09:50:</strong> the page, images and countdown come from the CDN. Signed-in users join the waiting room (one entry per account, CAPTCHA at entry).`,
            `<strong>10:00:00:</strong> everyone already queued gets a random position; later arrivals join the back in arrival order.`,
            `The admitter lets in A users per second, sized by load tests, and gives each a <strong>signed token</strong> {user, sale, expiry}.`,
            `The client calls <code>POST /sales/:id/reservations</code> with the token and an Idempotency-Key. The gateway checks the signature, rate limits and the sold-out flag.`,
            `The reservation service runs the <strong>Lua claim</strong> in Redis. Losers get 409 SOLD_OUT; when the counter reaches 0, the sold-out flag is set.`,
            `The winner's HELD row (expires_at = now + 10 min) is inserted in Postgres and a delayed expiry message is scheduled. If the insert fails, the unit is given back in Redis.`,
            `The client calls <code>POST /reservations/:id/order</code>. The order service creates a pending order and <strong>authorises</strong> the card, passing the same idempotency key to the provider.`,
            `The provider's <strong>webhook</strong> arrives: verify signature, skip seen event IDs, run <code>UPDATE ... SET status = 'PAID' WHERE id = :id AND status = 'HELD'</code>. One row: capture, order confirmed. Zero rows: void the authorisation.`,
            `If nobody pays, the expiry message (or the sweeper) flips HELD to EXPIRED, adds the unit back to Postgres and Redis, clears the sold-out flag, and the next queued user can claim it.`,
          ],
        },
        {
          type: `callout`,
          tone: `interview`,
          title: `The one-minute summary`,
          html: `<p>CDN and waiting room with a randomised start and signed tokens; gateway checks token, limits and a sold-out flag; Redis Lua decides winners, Postgres records HELD holds; delayed messages plus a sweeper expire holds conditionally; payment is idempotent, authorised first and captured on the webhook; reconciliation keeps Redis, holds and orders in step. Load test and kill switches before launch.</p>`,
        },
      ],
    },
  ],

  // ------------------------------------------------------------------ By level
  levels: [
    {
      id: `mid`,
      title: `Mid-level`,
      kicker: `A working, correct design`,
      blocks: [
        {
          type: `keypoints`,
          title: `What the interviewer expects`,
          items: [
            `Clear functional requirements, including the <strong>reserve</strong> step and why it exists.`,
            `A working high-level design: CDN for the page, reservation service, database, order service, payment provider.`,
            `Spotting the <strong>read-then-write race</strong> and fixing it with a conditional decrement plus hold insert in one transaction.`,
            `Holds with <code>expires_at</code> and at least one way to expire them (a sweeper is fine).`,
            `An idempotency key on payment.`,
          ],
        },
        {
          type: `list`,
          title: `Who drives`,
          items: [
            `You drive requirements, entities, API and the baseline.`,
            `The interviewer usually leads into the deep dives. Expect "what if 100K people press reserve at once?" and "what happens to unpaid holds?".`,
            `Needing hints on the waiting room or fairness models is acceptable.`,
          ],
        },
        {
          type: `callout`,
          tone: `mistake`,
          title: `Common pitfalls`,
          html: `<ul>
<li>Pay-first designs, or locking stock across the payment call.</li>
<li>Checking stock in application code, then writing.</li>
<li>Forgetting that holds must expire and give stock back.</li>
<li>Serving the product page from the application servers.</li>
<li>Reaching for queues and microservices before a correct baseline exists.</li>
</ul>`,
        },
      ],
    },
    {
      id: `senior`,
      title: `Senior`,
      kicker: `Numbers, bottlenecks, failure cases`,
      blocks: [
        {
          type: `keypoints`,
          title: `What the interviewer expects`,
          items: [
            `Numbers that drive decisions: ~1M req/s, 0.2% success, ~1,000/s on a locked row vs ~100K/s on Redis.`,
            `Naming the three bottlenecks <strong>before</strong> being asked, then fixing them.`,
            `A Redis Lua gate with Postgres as the record, plus what happens when the two disagree (compensation, reconciliation, failover rebuild).`,
            `A sold-out flag at the edge; a waiting room with signed admission tokens.`,
            `Exactly-once release via conditional transitions; authorise-then-capture and idempotent webhooks.`,
          ],
        },
        {
          type: `list`,
          title: `Who drives`,
          items: [
            `You lead most deep dives yourself; the interviewer probes failure cases: Redis failover, a webhook after expiry, a lost response.`,
            `Reach at least: no oversell under contention, the hot row, expiring holds, the traffic cliff, payments.`,
          ],
        },
        {
          type: `callout`,
          tone: `mistake`,
          title: `Common pitfalls`,
          html: `<ul>
<li>Making Redis the source of truth with no reconciliation or failover story.</li>
<li>Proposing optimistic locking for the stock counter.</li>
<li>Relying on Redis key-expiry events as the only release path.</li>
<li>A waiting room that the API doesn't enforce (no token check).</li>
<li>Ignoring client retries when estimating load.</li>
</ul>`,
        },
      ],
    },
    {
      id: `staff`,
      title: `Staff`,
      kicker: `Judgement and trade-offs`,
      blocks: [
        {
          type: `keypoints`,
          title: `What the interviewer expects`,
          items: [
            `Framing the system as a funnel and spending time where the risk is, not evenly.`,
            `Fairness as a <strong>product decision</strong> with costs: FCFS vs randomised start vs raffle, bot economics, account verification.`,
            `Explicit trade-offs: brief under-selling (paused claims, conservative counters) is preferable to overselling; when the simple single-row design is enough.`,
            `Extensions: multiple SKUs, several regions, a waitlist for released units, recovery after a mid-sale incident.`,
            `Operational readiness: load tests at peak with retries, pre-warmed caches and pools, dashboards, kill switches (pause admission, extend holds), reconciliation before the sale is declared closed.`,
          ],
        },
        {
          type: `list`,
          title: `Who drives`,
          items: [
            `You run the interview; the interviewer mainly pressure-tests judgement.`,
            `Touch all six deep dives briefly and go deep on the two you think matter most, saying why.`,
          ],
        },
        {
          type: `callout`,
          tone: `mistake`,
          title: `Common pitfalls`,
          html: `<ul>
<li>Lots of depth with no prioritisation or numbers.</li>
<li>Gold-plating (multi-region active-active stock) without asking whether the business needs it.</li>
<li>Skipping launch-day operations and incident handling.</li>
</ul>`,
        },
      ],
    },
  ],

  // ------------------------------------------------------------------ Core concepts
  concepts: [
    { term: `Flash sale demand ratio`, def: `Demand divided by supply: 10 million buyers for 20,000 units is 500:1, so 99.8% of people must be told "no".`, why: `Most of the system's work is saying no quickly, cheaply and fairly; only 0.2% of traffic should ever reach the expensive, exact path.`, demo: `flashEstimator` },
    { term: `Reservation (hold)`, def: `Taking one unit off the shelf for a few minutes, recorded with an expiry, before payment starts.`, why: `Payment is slow and external. Splitting "claim the unit" (fast, local, atomic) from "settle the money" (slow) avoids long locks and mass refunds.` },
    { term: `No overselling`, def: `Reserved plus sold units never exceed stock. The one hard correctness requirement.`, why: `Cancelling orders people believe they won is worse than a slow page. It's why the reserve path needs strong consistency even if nothing else does.`, demo: `oversellRace` },
    { term: `Consistency split: read vs write path`, def: `The page, status and "units left" badge can be seconds stale; reserve and pay must be exact.`, why: `This split is what makes the design scale: the busy read path lives in caches and the CDN, and only the small write path touches the source of truth.` },
    { term: `Traffic cliff`, def: `Load goes from near zero to its peak in the seconds after 10:00, then falls after the sell-out. Retries multiply it.`, why: `Autoscaling reacts in minutes; the spike lasts seconds. Capacity must be ready in advance, or the excess held back before it reaches the backend.`, demo: `flashEstimator` },
    { term: `Conditional atomic decrement`, def: `<code>UPDATE inventory SET remaining = remaining - 1 WHERE sale_id = ? AND remaining &gt; 0</code>, then check one row changed.`, why: `The check and the write happen as one statement under the row lock, so stock can't go below zero. The simplest correct baseline.`, demo: `oversellRace` },
    { term: `Optimistic vs pessimistic locking`, def: `Pessimistic: lock the row first (<code>SELECT ... FOR UPDATE</code>). Optimistic: write only if the version you read is unchanged, retry otherwise.`, why: `Both are correct. Pessimistic queues behind the lock; optimistic collapses into retry storms and false "sold out" when nearly every write conflicts, as here.`, demo: `oversellRace` },
    { term: `Hot row / hot key`, def: `A single row or key that a large share of all writes must update, so writes to it run one at a time.`, why: `Throughput is about 1 / lock hold time (~1,000/s at 1 ms) regardless of machine size. Replicas and bigger CPUs don't help writes.`, demo: `hotRow` },
    { term: `Inventory buckets (sharded counter)`, def: `Split stock into N counters (e.g. 16 × 1,250) and route each attempt to one bucket.`, why: `Throughput scales roughly with N, but buckets drain unevenly, so you need retry or routing to non-empty buckets, and "sold out" means every bucket is empty.`, demo: `inventoryBuckets` },
    { term: `Redis Lua reserve + durable record`, def: `A Lua script checks "already holds one?", checks stock &gt; 0 and decrements, atomically; winners then insert their hold in Postgres.`, why: `Redis runs a script without interleaving, at ~100K ops/s. The database sees ~20,000 writes instead of millions, but you must compensate failed inserts and reconcile after failover.`, demo: `hotRow` },
    { term: `Hold expiry, sweeper and TTL`, def: `Each hold has <code>expires_at</code>. A delayed message per hold and a periodic sweeper flip expired HELD rows to EXPIRED and return the units.`, why: `Abandoned holds hide stock for TTL + release delay. Releases must be conditional so a unit comes back exactly once; Redis key-expiry events alone are not reliable.`, demo: `holdTimeout` },
    { term: `Idempotency keys`, def: `A unique key sent with reserve and pay requests; the server stores it with the result and returns that result for retries.`, why: `Networks fail after the work is done but before the response arrives. Without a key a retry double-reserves or double-charges.` },
    { term: `Payment webhook and reconciliation`, def: `The provider calls a signed webhook when payment succeeds or fails; a backstop job queries the provider for anything left pending.`, why: `The browser can close mid-payment, and webhooks can be late, duplicated or lost. The provider is the source of truth for money.` },
    { term: `Waiting room / virtual queue token`, def: `A queue page at the edge assigns positions and, on admission, issues a short-lived signed token that the reserve API requires.`, why: `It turns the spike into a steady stream, gives users honest progress instead of errors, and stops people skipping the queue by calling the API directly.`, demo: `waitingRoom` },
    { term: `Admission control and load shedding`, def: `Admit only as many users per second as the backend can serve; reject excess early and cheaply (429 with Retry-After) rather than letting it time out.`, why: `Past capacity, throughput falls as timeouts and retries pile up. Admitting at capacity keeps throughput at its maximum and errors near zero.`, demo: `waitingRoom` },
    { term: `Fairness models: FCFS, random draw, raffle`, def: `First come, first served by arrival; a random order among everyone queued before the start; or a pre-registered raffle with verified entrants.`, why: `FCFS rewards the fastest connection, usually bots. Randomisation removes the speed advantage; a raffle adds verification and the gentlest load.`, demo: `fairnessModes` },
    { term: `Per-customer limits and bot defence`, def: `One unit per account (unique constraint or a Redis holders set), rate limits per account/device/IP, CAPTCHA at queue entry, risk signals.`, why: `Limits cap what any one bot can take; friction raises the cost of running thousands of sessions. No single defence is enough, so they're layered.`, demo: `fairnessModes` },
    { term: `CDN, cached stock indicator and sold-out flag`, def: `The page is static on the CDN; "units left" is an approximate, cached number; a sold-out flag lets the edge answer instantly once stock is gone.`, why: `After the sell-out every attempt is doomed; answering at the edge protects everything behind it. Clear the flag if expired holds return units.` },
  ],

  labs: [`flashEstimator`, `oversellRace`, `hotRow`, `inventoryBuckets`, `holdTimeout`, `waitingRoom`, `fairnessModes`],

  // ------------------------------------------------------------------ Cheatsheet
  cheatsheet: [
    { title: `Requirements`, type: `table`, headers: [`Kind`, `Requirement`, `Design consequence`], rows: [
      [`Functional`, `View the sale item`, `Static page on a CDN, short-TTL status`],
      [`Functional`, `Reserve one unit for a limited time`, `Atomic claim plus a hold with expires_at`],
      [`Functional`, `Pay for a reserved unit`, `Payment provider, idempotency key, webhook`],
      [`Non-functional`, `Never oversell`, `Strong consistency on stock and holds`],
      [`Non-functional`, `Survive ~1M req/s within seconds`, `CDN, waiting room, admission control`],
      [`Non-functional`, `Fair, bot-resistant`, `Agreed fairness model, one per account, layered defences`],
      [`Non-functional`, `Stale reads OK`, `Cache the read path; exact only on reserve and pay`],
    ] },
    { title: `Numbers for the console launch`, type: `code`, body: `stock:       20,000 consoles, sale opens 10:00:00
users:       ~10M waiting, most arrive within ~60 s
requests:    ~5 per user -> 50M / 60 s     ~ 830K req/s average
peak:        a few x average in the first seconds
success:     20K / 10M                     = 0.2%
locked row:  1 ms per update               ~ 1,000 reserves/s
redis node:  simple ops                    ~ 100K/s
db writes:   ~ number of units (20K), if losers stop at the gate
hold TTL:    5-10 min, from the payment-time distribution` },
    { title: `Final design`, type: `code`, body: `user -> CDN: page, countdown, waiting room (static)
          | join queue (CAPTCHA, one entry per account)
          v
   waiting room: random order for pre-start arrivals, admit A users/s
          | signed token {user, sale, exp}
          v
   API gateway: verify token, rate limits, sold-out flag -> "sold out" (fast)
          v
   reservation service -> Redis Lua (one per user, stock > 0, decr)
          | winners only
          v
   Postgres: reservations (HELD, expires_at), inventory of record
          |                       ^
          | delayed msg + sweeper (EXPIRED -> stock + 1 in Postgres and Redis)
          v
   order service -> payment provider (Idempotency-Key, authorise)
          ^ webhook: HELD -> PAID, then capture; else void` },
    { title: `Deep-dive decisions`, type: `table`, headers: [`Question`, `Weak`, `Better`, `Best`], rows: [
      [`Prevent oversell`, `Read, check in app, write`, `Conditional UPDATE in one transaction`, `Redis Lua gate + Postgres record + reconciliation`],
      [`Hot inventory row`, `One locked row, optimistic retries`, `N stock buckets with fallback`, `Redis counter behind admission control, sold-out flag`],
      [`Expire holds`, `Redis key-expiry events only`, `Sweeper every few seconds`, `Delayed message per hold + sweeper safety net, conditional release`],
      [`Traffic cliff`, `Autoscaling`, `Pre-scale everything`, `CDN + waiting room admitting at capacity, load shedding`],
      [`Fairness`, `First come, first served`, `Randomised start + one per account`, `Verified raffle or randomised start + layered bot defence`],
      [`Payments`, `Trust the success redirect; charge first`, `Idempotency key + webhook`, `Authorise, mark PAID conditionally, capture; reconcile pending`],
    ] },
    { title: `Failure modes and fixes`, type: `table`, headers: [`Failure`, `Fix`], rows: [
      [`Redis fails over, loses recent decrements`, `Pause claims, rebuild count from Postgres (stock - active holds - paid), reopen`],
      [`Winner's Postgres insert fails`, `Give the unit back in Redis (INCR, remove holder); reconcile job catches misses`],
      [`Client retries reserve or pay`, `Idempotency key returns the original result`],
      [`Webhook duplicated or out of order`, `Dedupe event IDs; conditional transitions from HELD`],
      [`Webhook never arrives`, `Backstop job polls the provider for pending orders`],
      [`Payment succeeds after the hold expired`, `0 rows on HELD to PAID: void the authorisation (or refund)`],
      [`Expiry message lost`, `Sweeper over (status, expires_at) releases it`],
      [`Backend overloaded at 10:00`, `Admit at capacity; 429 + Retry-After; clients back off with jitter`],
    ] },
  ],

  // ------------------------------------------------------------------ Interview Q&A
  interview: [
    { q: `Why not let users go straight from the product page to paying?`, a: `Payment is slow and external. If stock is decremented only when payment succeeds, thousands pay for the last unit at once and most need refunds. If stock is locked during payment, everyone waits on that lock. A reservation decrements stock atomically in milliseconds, gives the buyer a few minutes to pay, and returns the unit if they don't.`, diff: `easy` },
    { q: `Which parts of a flash sale need strong consistency?`, a: `Only the stock counter and the reservation and order records: reserving must never exceed stock, and a paid order must refer to a valid hold. The product page, the "units left" badge and the waiting-room position can be eventually consistent and served from caches or the CDN.`, diff: `med` },
    { q: `Estimate the load at the start of the sale.`, a: `10 million users over about a minute, ~5 requests each (page, polls, reserve, retries), is ~50M requests, ~830K/s on average and a few times that in the first seconds. Only 20,000 succeed (0.2%). A locked row takes ~1,000 updates/s and a Redis node ~100K ops/s, so the counter is the obvious bottleneck and the read path must be on a CDN.`, diff: `med` },
    { q: `Show how a naive implementation oversells, and fix it.`, a: `Two requests SELECT remaining and both see 1, both check remaining > 0 in code, both write 0 and insert a hold: two holds for one unit. Under a burst hundreds read the same value. Fix: make the check part of the write, UPDATE ... SET remaining = remaining - 1 WHERE remaining > 0, and treat zero affected rows as sold out.`, diff: `easy` },
    { q: `Why put the decrement and the reservation insert in one transaction?`, a: `If the decrement commits and the insert fails, a unit vanishes with no hold to expire. If the insert commits without the decrement, you oversell. One transaction makes both happen or neither, and a unique constraint on (sale, user) enforces one hold per customer in the same step.`, diff: `easy` },
    { q: `Why is a single inventory row a bottleneck, and why doesn't optimistic locking help?`, a: `A row lock lets one transaction modify the row at a time, so throughput is ~1 / lock time, about 1,000/s at 1 ms, while hundreds of thousands of attempts arrive; queues build, requests time out and winners depend on queue luck. Optimistic locking assumes rare conflicts; here nearly every write conflicts, so retries multiply load and clients give up with stock still left.`, diff: `med` },
    { q: `Walk through using Redis to gate reservations.`, a: `Load stock into a Redis key before the sale. Each reserve runs a Lua script: already holds one? stock > 0? decrement and add to the holders set, atomically, because Redis runs scripts one at a time. Winners insert a HELD row in Postgres, the system of record; losers get "sold out" immediately. If the insert fails, give the unit back in Redis. Reconcile periodically, and on failover pause and rebuild the counter from Postgres, because asynchronous replication can lose recent decrements.`, diff: `hard` },
    { q: `How do stock buckets work, and what goes wrong?`, a: `Split the stock across N keys or rows and route each attempt to one, so N claims run in parallel and throughput rises roughly N-fold. Buckets drain unevenly, so some users hit an empty bucket while others still have stock. Retry another bucket or route only to known non-empty ones; "sold out" is true only when every bucket is empty.`, diff: `hard` },
    { q: `After 20,000 units are gone, millions of attempts keep coming. What do you do?`, a: `Short-circuit them. When stock reaches zero, set a sold-out flag that the edge, gateway and reservation service check first, so attempts never reach Redis or the database. The waiting room shows "sold out" and stops polling. If expired holds return units, clear the flag and offer them to people still queued rather than reopening to everyone.`, diff: `easy` },
    { q: `How do reservations get released when people don't pay, and how long should a hold last?`, a: `Pick the TTL from the payment-time distribution, typically 5 to 10 minutes. Release with a delayed message per hold for timeliness and a sweeper over (status, expires_at) as a safety net. Every release is a conditional update from HELD that increments stock only if a row changed, so a unit comes back exactly once even if several actors race.`, diff: `med` },
    { q: `Why not rely on Redis key expiry events to release holds?`, a: `Redis removes expired keys when they're accessed or found by background sampling, so the event can lag, and keyspace notifications are fire-and-forget pub/sub: lost if no listener is connected. Fine as a fast path, but stock leaks whenever an event is missed, so a sweeper over the database is still required.`, diff: `med` },
    { q: `Payment succeeds just after the hold expired and the unit was resold. What happens?`, a: `The webhook tries UPDATE ... SET status = 'PAID' WHERE status = 'HELD'; zero rows change because it's EXPIRED. With authorise-then-capture we void the authorisation, so the customer is never charged; otherwise we refund automatically. Either way, only one person can own the unit because transitions are conditional.`, diff: `hard` },
    { q: `How do you prevent double charges and make the webhook handler safe?`, a: `Require an idempotency key on the pay request, store it with the outcome in the transaction that creates the order, and pass it to the provider. In the webhook, verify the signature, record event IDs and skip duplicates, apply conditional transitions, and return 2xx only after commit so the provider retries on failure. A reconciliation job queries the provider for anything left pending.`, diff: `med` },
    { q: `Why use a waiting room instead of just scaling the backend?`, a: `The spike lasts seconds; autoscaling takes minutes, and pre-scaling everything is expensive and still leaves the hot counter as a limit. A waiting room admits users at the rate the backend can serve, so it runs at full throughput with few errors, users see a position instead of failures, and the queue is where fairness and bot checks happen.`, diff: `med` },
    { q: `How do you stop people bypassing the waiting room?`, a: `On admission, issue a short-lived signed token with user ID, sale ID and expiry, and require it on the reserve API. The gateway verifies the signature without a database call and rejects missing or expired tokens; the service checks the token's user matches the authenticated user so tokens can't be shared.`, diff: `med` },
    { q: `What does fair mean, and how would you implement it?`, a: `It's a product decision. FCFS rewards the fastest clients, mostly bots. A randomised start shuffles everyone who arrived before opening, so refresh-hammering doesn't help. A pre-registered raffle verifies accounts first and draws winners, strongest against bots. In all cases add one per account, rate limits and tie queue entries to verified accounts so extra sessions don't buy extra chances.`, diff: `hard` },
    { q: `Summarise your final design in a minute.`, a: `Static page and waiting room on the CDN, randomising pre-start arrivals and admitting at backend capacity with signed tokens. The gateway checks tokens, rate limits and a sold-out flag. A Redis Lua script claims a unit (one per user, stock > 0); winners write a HELD reservation with an expiry to Postgres. Delayed messages plus a sweeper expire holds conditionally. Payment uses an idempotency key, authorises first and captures when the webhook moves the hold to PAID. Reconciliation keeps Redis, holds and orders consistent.`, diff: `med` },
  ],
});
