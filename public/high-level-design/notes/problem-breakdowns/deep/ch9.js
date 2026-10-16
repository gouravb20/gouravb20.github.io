// Deep dive: Chapter 9, Expiring reservations and payment. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch9 = {
  hook: `<p>Holds that are never paid hide stock from everyone else until they expire. This chapter covers how long holds should last, three ways to expire them, how to release a unit exactly once, and how to take payment without double charges or two owners.</p>`,
  sections: [
    {
      id: "leaking-stock",
      title: "Abandoned holds leak stock",
      kicker: "TTL and abandonment",
      blocks: [
        {
          type: "problem",
          html: `<p>Some winners never pay: distraction, a declined card, or a bot hoarding to resell. Each abandoned hold keeps a unit off the shelf for the full TTL plus however long release takes. With high abandonment, a sale that "sold out" in seconds keeps releasing units for many minutes, while the people who were told "sold out" have left.</p>`,
        },
        {
          type: "keypoints",
          title: "Choosing the hold length",
          items: [
            "Base it on the <strong>payment-time distribution</strong>: cover the long tail (3-D Secure, slow typists), typically 5 to 10 minutes.",
            "Too short: genuine payers lose their unit mid-checkout, the worst experience in the system.",
            "Too long: every abandoned hold hides a unit for longer.",
            "Show a countdown; optionally extend once if payment has started.",
          ],
        },
        {
          type: "lab",
          id: "holdTimeout",
          caption: "Push abandonment to 40% and watch how long the last 10% of units take to sell. Drop the hold to 2 minutes with a 3-minute median payment time to see genuine payers cut off. Compare the sweeper with the delayed message.",
        },
      ],
    },
    {
      id: "expiry-options",
      title: "Three ways to expire holds",
      kicker: "Lazy, sweeper, delayed message",
      blocks: [
        {
          type: "table",
          headers: ["Mechanism", "How", "Release delay", "Watch out for"],
          rows: [
            ["Lazy", "Treat holds past expires_at as free when someone claims", "~0", "Every read filters by time; hard to express with a counter"],
            ["Sweeper", "Job every S seconds releases expired holds in batches", "Up to S", "Job lag; needs an index on (status, expires_at)"],
            ["Delayed message", "Schedule a message per hold for its expiry time", "~seconds", "Lost messages: keep a sweeper as a safety net"],
          ],
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p><strong>Redis key expiry is not a timer.</strong> Expired-key notifications fire when Redis notices the expiry (on access or by background sampling) and are fire-and-forget pub/sub. Use them as a fast path at most, never as the only way stock comes back.</p>`,
        },
        {
          type: "code",
          title: "Sweeper batch",
          lang: "sql",
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
-- with a Redis gate, also INCRBY stock:{sale} n and SREM the holders`,
        },
      ],
    },
    {
      id: "release-once",
      title: "Release exactly once",
      kicker: "Conditional transitions",
      blocks: [
        {
          type: "idea",
          html: `<p>The sweeper, a delayed message, a cancel and a late payment can all act on the same hold. Make every transition a conditional update from <code>HELD</code> and act only if a row changed; the stock increment goes in the same transaction. Exactly one actor wins.</p>`,
        },
        {
          type: "diagram",
          title: "Payment and expiry race for one hold",
          caption: "Both actors run a conditional update from HELD. The row lock orders them; the first changes the status, the second matches nothing and takes its fallback.",
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
          type: "quiz",
          q: "A cancel request and the sweeper both release the same HELD reservation at the same moment. Both increment stock if their update succeeded. How many units return to stock?",
          options: [
            "Two, one from each",
            "One: both updates include WHERE status = 'HELD', so only the first changes the row and increments stock",
            "Zero: they cancel each other out",
            "It depends on the isolation level only",
          ],
          answer: 1,
          explain: "The row lock serialises the two conditional updates. The second no longer matches status = 'HELD', affects zero rows, and skips the increment.",
        },
      ],
    },
    {
      id: "payment",
      title: "Taking payment safely",
      kicker: "Authorise, then capture",
      blocks: [
        {
          type: "steps",
          title: "A safe payment flow",
          items: [
            "Client calls pay with an <strong>Idempotency-Key</strong>; the server passes the same key to the provider.",
            "<strong>Authorise</strong> the card (funds reserved, not taken).",
            "Webhook arrives: verify the signature, skip event IDs already processed.",
            "Run <code>UPDATE reservations SET status = 'PAID' WHERE id = :id AND status = 'HELD'</code>.",
            "One row changed: <strong>capture</strong> and create the order. Zero rows (hold expired): <strong>void</strong> the authorisation and tell the user.",
            "A backstop job polls the provider for anything stuck in pending.",
          ],
        },
        {
          type: "compare",
          items: [
            { title: "Charge first, check later", tone: "bad", html: "<p>A late payment on an expired hold means a captured charge, then a refund. Slower for the customer and more support load.</p>" },
            { title: "Authorise, then capture", tone: "ok", html: "<p>The hold's state decides whether money moves. An expired hold just voids the authorisation; nobody is charged.</p>" },
          ],
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>A strong answer: pick the TTL from payment times; expire with delayed messages or a frequent sweeper (plus a sweeper safety net); make releases conditional so units return exactly once; pay with an idempotency key, authorise first, capture only after HELD becomes PAID; idempotent webhooks plus a reconciliation job.</p>`,
        },
      ],
    },
  ],
  takeaways: [
    "Abandoned holds hide stock for <strong>TTL + release delay</strong>; pick the TTL from the payment-time distribution.",
    "Expire with a <strong>delayed message or frequent sweeper</strong>, keep a sweeper as a safety net, and don't rely on Redis expiry events.",
    "Every transition is <strong>conditional from HELD</strong>; the stock increment happens only if the row changed.",
    "<strong>Authorise, then capture</strong> after HELD becomes PAID; void on expired holds.",
    "<strong>Idempotency keys</strong> on pay requests and <strong>idempotent webhooks</strong>, with a reconciliation job as backstop.",
  ],
  furtherReading: [
    { title: "Hello Interview: Design a Flash Sale System", url: "https://www.hellointerview.com/learn/system-design/problem-breakdowns/flash-sale", note: "The original walkthrough of this problem." },
    { title: "Redis documentation: Keyspace notifications", url: "https://redis.io/docs/latest/develop/use/keyspace-notifications/" },
    { title: "Stripe: Place a hold on a payment method (authorise and capture later)", url: "https://docs.stripe.com/payments/place-a-hold-on-a-payment-method" },
  ],
};
