// Deep dive: Chapter 7, A first working design. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch7 = {
  hook: `<p>A correct baseline: a static page on the CDN, a conditional decrement plus a hold in one transaction, and payment with an idempotency key. Along the way, why the obvious read-then-write version oversells, and which three bottlenecks the later chapters fix.</p>`,
  sections: [
    {
      id: "baseline",
      title: "The baseline, end to end",
      kicker: "Correct before fast",
      blocks: [
        {
          type: "text",
          html: `<p>Four entities: <strong>Sale</strong> (item, start, stock, per-customer limit), <strong>Inventory</strong> (units remaining), <strong>Reservation</strong> (holder, status, expires_at) and <strong>Order</strong> (payment against a reservation). Reservation and order stay separate because claiming is fast and local while paying is slow and external.</p>`,
        },
        {
          type: "diagram",
          title: "The baseline design",
          caption: "Page loads stop at the CDN. Reserve calls go to the reservation service, which decrements stock and inserts a hold in one transaction. Pay calls go to the order service, which talks to the payment provider; the provider's webhook confirms the result.",
          svg: `<svg viewBox="0 0 640 290" role="img" aria-label="Client talks to a CDN for the page, to a reservation service that writes inventory and reservations in Postgres, and to an order service that calls a payment provider, which sends a webhook back">
<defs><marker id="pb7-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
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
<line x1="100" y1="135" x2="168" y2="50" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#pb7-arrow)"/>
<line x1="100" y1="145" x2="168" y2="145" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#pb7-arrow)"/>
<line x1="100" y1="155" x2="168" y2="240" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#pb7-arrow)"/>
<line x1="310" y1="150" x2="388" y2="175" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#pb7-arrow)"/>
<line x1="310" y1="240" x2="388" y2="205" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#pb7-arrow)"/>
<line x1="310" y1="255" x2="388" y2="258" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#pb7-arrow)"/>
<path d="M520 262 C 600 262, 600 120, 455 120 L 340 120 L 312 232" style="fill: none; stroke: var(--dg-5)" stroke-width="1.5" stroke-dasharray="5 4" marker-end="url(#pb7-arrow)"/>
<text x="560" y="140" font-size="12" style="fill: var(--dg-muted)">webhook</text>
</svg>`,
        },
        {
          type: "table",
          title: "API",
          headers: ["Call", "Purpose", "Contended?"],
          rows: [
            ["<code>GET /sales/{id}</code>", "Page data and status", "No: CDN, short-TTL status"],
            ["<code>POST /sales/{id}/reservations</code>", "Claim a unit; returns hold and expiry", "Yes: the stock counter"],
            ["<code>POST /reservations/{id}/order</code>", "Start payment, with <code>Idempotency-Key</code>", "No"],
            ["<code>POST /webhooks/payments</code>", "Provider reports the outcome", "No"],
          ],
        },
      ],
    },
    {
      id: "the-race",
      title: "How the obvious version oversells",
      kicker: "Read, check, write",
      blocks: [
        {
          type: "steps",
          title: "Two requests, one console",
          items: [
            "Request A runs <code>SELECT remaining</code> and sees <strong>1</strong>.",
            "Request B runs <code>SELECT remaining</code> a moment later and also sees <strong>1</strong>; A hasn't written yet.",
            "Both check <code>remaining &gt; 0</code> in application code. Both pass.",
            "A writes <code>remaining = 0</code> and inserts its reservation.",
            "B writes <code>remaining = 0</code> and inserts its reservation. Two holds exist for one unit, and the counter looks perfectly normal.",
          ],
        },
        {
          type: "text",
          html: `<p>The bug is the gap between read and write. In a flash sale it's hit constantly, and because each write overwrites the last, the counter can stay positive while holds already exceed stock. Nothing alerts.</p>`,
        },
        {
          type: "compare",
          title: "Making the check part of the write",
          items: [
            { title: "Check in the application", tone: "bad", html: "<p><code>SELECT remaining</code>, then <code>if remaining &gt; 0</code>, then <code>UPDATE ... SET remaining = :value - 1</code>. The decision uses a value that may already be stale when the write lands.</p>" },
            { title: "Check in the statement", tone: "ok", html: "<p><code>UPDATE inventory SET remaining = remaining - 1 WHERE sale_id = :s AND remaining &gt; 0</code>, then look at the affected-row count. The database evaluates the condition and applies the change under the row lock, as one step. Zero rows means sold out.</p>" },
          ],
        },
        {
          type: "lab",
          id: "oversellRace",
          caption: "Start on \"read, check, write\" with the defaults and count the holds granted against the stock. Switch to the conditional update: exactly the stock is sold, in one statement per buyer. Then compare SELECT ... FOR UPDATE (correct, but buyers queue on the lock) and optimistic versioning (correct, but it tells people \"sold out\" while stock remains).",
        },
        {
          type: "quiz",
          q: "Why doesn't adding a CHECK (remaining >= 0) constraint fix the read-then-write version?",
          options: [
            "Constraints are ignored inside transactions",
            "Each write sets remaining to a value computed from a stale read (for example 0), which satisfies the constraint, so many holds are created while the counter never goes negative",
            "CHECK constraints only work on integer columns",
            "It does fix it",
          ],
          answer: 1,
          explain: "The racing writers all compute the same new value from the same old read. None of them writes a negative number, so the constraint never fires. The fix is a relative, conditional update (remaining = remaining - 1 WHERE remaining > 0), where the constraint becomes a harmless backstop.",
        },
      ],
    },
    {
      id: "holds",
      title: "Holds: one transaction and a small state machine",
      kicker: "Keeping the counter and the records in step",
      blocks: [
        {
          type: "text",
          html: `<p>Decrement and hold insert go in <strong>one transaction</strong>: a decrement without a hold leaks a unit; a hold without a decrement oversells. A unique constraint on <code>(sale_id, user_id)</code> enforces one hold per customer.</p>`,
        },
        {
          type: "code",
          title: "The reserve transaction",
          lang: "sql",
          code: `BEGIN;
UPDATE inventory
   SET remaining = remaining - 1
 WHERE sale_id = :sale AND remaining > 0;
-- 0 rows affected: sold out -> ROLLBACK, return 409 "sold out"

INSERT INTO reservations (id, sale_id, user_id, status, expires_at)
VALUES (:id, :sale, :user, 'HELD', now() + interval '10 minutes');
-- unique violation on (sale_id, user_id): already holds one -> ROLLBACK

COMMIT;  -- return { reservationId, expiresAt }`,
        },
        {
          type: "diagram",
          title: "Reservation lifecycle",
          caption: "A hold starts as HELD and ends in exactly one terminal state. Every arrow is a conditional update from HELD, so a late payment, an expiry job and a cancel request can race and only one of them wins. EXPIRED and CANCELLED return the unit to stock in the same transaction.",
          svg: `<svg viewBox="0 0 640 210" role="img" aria-label="State machine: HELD moves to PAID on payment confirmed, to EXPIRED when the TTL passes, or to CANCELLED when the user releases; expired and cancelled return the unit to stock">
<defs><marker id="pb7-sm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="30" y="80" width="120" height="50" rx="25" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="1.5"/>
<text x="90" y="110" text-anchor="middle" font-size="14" font-weight="700">HELD</text>
<rect x="420" y="15" width="150" height="44" rx="22" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="1.5"/>
<text x="495" y="42" text-anchor="middle" font-size="14" font-weight="700">PAID</text>
<rect x="420" y="83" width="150" height="44" rx="22" style="fill: var(--dg-6-soft); stroke: var(--dg-6)" stroke-width="1.5"/>
<text x="495" y="110" text-anchor="middle" font-size="14" font-weight="700">EXPIRED</text>
<rect x="420" y="151" width="150" height="44" rx="22" style="fill: var(--dg-6-soft); stroke: var(--dg-6)" stroke-width="1.5"/>
<text x="495" y="178" text-anchor="middle" font-size="14" font-weight="700">CANCELLED</text>
<line x1="150" y1="95" x2="418" y2="37" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#pb7-sm-arrow)"/>
<line x1="150" y1="105" x2="418" y2="105" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#pb7-sm-arrow)"/>
<line x1="150" y1="115" x2="418" y2="173" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#pb7-sm-arrow)"/>
<text x="285" y="55" text-anchor="middle" font-size="12">payment confirmed</text>
<text x="285" y="98" text-anchor="middle" font-size="12">expires_at passed</text>
<text x="285" y="160" text-anchor="middle" font-size="12">user releases</text>
<text x="600" y="110" font-size="12" style="fill: var(--dg-muted)">+1</text>
<text x="600" y="178" font-size="12" style="fill: var(--dg-muted)">+1</text>
</svg>`,
        },
      ],
    },
    {
      id: "paying",
      title: "Paying without double charges",
      kicker: "Idempotency and webhooks",
      blocks: [
        {
          type: "text",
          html: `<p>Two rules:</p>
<ul>
<li><strong>Idempotency key on every pay request.</strong> Store it with the outcome in the transaction that creates the order, and pass it to the provider. A retry after a lost response returns the stored result instead of charging twice.</li>
<li><strong>The provider is the source of truth for money.</strong> Its signed webhook moves the reservation to PAID with a conditional update. Webhooks are retried, so the handler must be idempotent.</li>
</ul>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Stripe", title: "Idempotency-Key header", html: "Stripe's API accepts an <code>Idempotency-Key</code> header on POST requests; it saves the first result for a key and returns it for retries with the same key. Keys can be pruned once they're at least 24 hours old." },
            { org: "Stripe", title: "Webhook retries", html: "In live mode Stripe retries undelivered webhook events with exponential backoff for up to three days, and recommends that handlers record processed event IDs because duplicates can arrive." },
          ],
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p>Don't mark an order paid because the browser came back to a "success" URL. Redirects can be replayed, forged or never happen. Only the provider's signed webhook, or a server-side query to the provider, settles the payment state.</p>`,
        },
      ],
    },
    {
      id: "bottlenecks",
      title: "Where the baseline breaks",
      kicker: "The agenda for the deep dives",
      blocks: [
        {
          type: "keypoints",
          title: "Three bottlenecks to name out loud",
          items: [
            "<strong>The hot row.</strong> Every reserve attempt, including the millions that will fail, takes the same row lock. At ~1 ms per update that's ~1,000 attempts per second against hundreds of thousands arriving. (Chapter 8)",
            "<strong>Stock that leaks into holds.</strong> Some holders never pay. Until something expires their hold, the unit is invisible to everyone else. (Chapter 9)",
            "<strong>The crowd.</strong> Even with a perfect counter, letting ten million people into the purchase flow at once overloads every service in front of it. (Chapter 10)",
          ],
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>A strong baseline answer covers:</p>
<ol>
<li><strong>Entities and API:</strong> sale, inventory, reservation, order; four endpoints, only one contended.</li>
<li><strong>The race:</strong> read-then-write oversells; a conditional update fixes it.</li>
<li><strong>One transaction:</strong> decrement plus hold, unique per customer.</li>
<li><strong>State machine:</strong> conditional transitions from HELD.</li>
<li><strong>Payment:</strong> idempotency key, provider webhook as source of truth.</li>
<li><strong>Bottlenecks:</strong> hot row, abandoned holds, the crowd.</li>
</ol>`,
        },
        {
          type: "quiz",
          q: "The payment webhook and the expiry job process the same reservation at the same moment. Both use conditional updates from status HELD. What happens?",
          options: [
            "Both succeed, and the unit is both sold and returned to stock",
            "Exactly one update changes the row; the other sees zero rows affected and takes its fallback path (void the payment, or skip the expiry)",
            "The database deadlocks",
            "The second one overwrites the first",
          ],
          answer: 1,
          explain: "Both statements include WHERE status = 'HELD'. The row lock serialises them; the first changes the status, so the second no longer matches and affects zero rows. Checking the row count tells each path whether it won.",
        },
      ],
    },
  ],
  takeaways: [
    "Four entities (sale, inventory, reservation, order) and four endpoints; only <strong>reserve</strong> touches the contended counter.",
    "<strong>Read, check, write oversells</strong> under concurrency, and the counter can look normal while it happens.",
    "Use a <strong>conditional decrement</strong> (<code>remaining = remaining - 1 WHERE remaining &gt; 0</code>) and insert the hold in the <strong>same transaction</strong>, unique per customer.",
    "Make every reservation transition <strong>conditional from HELD</strong>, so racing payments, expiries and cancels resolve to exactly one outcome.",
    "Pay with an <strong>idempotency key</strong>, and let the provider's <strong>webhook</strong> settle the state.",
  ],
  furtherReading: [
    { title: "Hello Interview: Design a Flash Sale System", url: "https://www.hellointerview.com/learn/system-design/problem-breakdowns/flash-sale", note: "The original walkthrough of this problem." },
    { title: "Stripe API reference: Idempotent requests", url: "https://docs.stripe.com/api/idempotent_requests" },
    { title: "Stripe: Receive webhook events", url: "https://docs.stripe.com/webhooks" },
  ],
};
