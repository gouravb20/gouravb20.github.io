// Deep dive: Chapter 10, Admission, fairness and the final design. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch10 = {
  hook: `<p>Even a fast gate can't take ten million people at once. This chapter controls admission with a virtual waiting room, decides who gets in first (the fairness model), layers bot defences, and assembles the final design.</p>`,
  sections: [
    {
      id: "admission",
      title: "Why admit at capacity",
      kicker: "Overload and retries",
      blocks: [
        {
          type: "problem",
          html: `<p>Past capacity, a system serves <em>fewer</em> requests, not the same number more slowly: queues fill, requests time out after using resources, and clients retry, raising load exactly when the system is weakest. Autoscaling takes minutes; the spike lasts seconds.</p>`,
        },
        {
          type: "idea",
          html: `<p>Hold the excess outside. Admit users into the purchase flow at the rate the backend can serve, so it runs at full throughput with near-zero errors, and give everyone else a position instead of an error.</p>`,
        },
        {
          type: "lab",
          id: "waitingRoom",
          caption: "Compare the red and green lines: without a waiting room the backend is offered many times its capacity and fails millions of requests; with one it runs just below capacity. Turn retries off to see how much of the overload is self-inflicted.",
        },
      ],
    },
    {
      id: "waiting-room",
      title: "The virtual waiting room",
      kicker: "Queue at the edge, token to enter",
      blocks: [
        {
          type: "steps",
          title: "How it works",
          items: [
            "Users load a static queue page from the CDN and get a position (one entry per verified account).",
            "The page polls a cheap status endpoint for its position and the sale state.",
            "An admitter lets in A users per second, sized to backend capacity.",
            "Admitted users receive a short-lived <strong>signed token</strong> {user, sale, expiry}.",
            "The gateway verifies the token without a database call; requests without one are rejected.",
            "When stock is gone, the queue page switches to \"sold out\" and offers a waitlist for units released from expired holds.",
          ],
        },
        {
          type: "code",
          title: "Admission token check at the gateway",
          lang: "text",
          code: `token   = HMAC_SHA256(secret, user_id | sale_id | expires_at) + payload
on POST /sales/{id}/reservations:
  reject if token missing, signature invalid, expired,
         token.sale != id, or token.user != authenticated user
  reject fast if soldOut[id]
  else forward to reservation service`,
        },
        {
          type: "realworld",
          items: [
            { org: "Cloudflare", title: "Waiting Room", html: "A managed waiting room at the CDN edge: you set the number of users allowed on the origin, and excess visitors see a queue page until a slot frees up." },
            { org: "Queue-it", title: "Virtual waiting rooms", html: "A vendor that specialises in queueing visitors for ticket sales and product drops. Its pre-queue can randomise the order of visitors who arrive before the sale starts." },
          ],
        },
      ],
    },
    {
      id: "fairness",
      title: "Who goes first",
      kicker: "Fairness models",
      blocks: [
        {
          type: "compare",
          items: [
            { title: "First come, first served", tone: "bad", html: "<p>Arrival order decides. Milliseconds matter, so scripts near your servers win.</p>" },
            { title: "Randomised start", tone: "warn", html: "<p>Everyone who joins before opening gets a random position; later arrivals queue behind. Refresh-hammering no longer helps. Extra sessions still mean extra tickets unless entries are tied to verified accounts.</p>" },
            { title: "Pre-registered raffle", tone: "ok", html: "<p>Register in advance, verify accounts, draw winners, give each a purchase window. Strongest against bots and gentlest on load; more friction for buyers.</p>" },
          ],
        },
        {
          type: "lab",
          id: "fairnessModes",
          caption: "Add 50,000 bot accounts and compare the three models. Then turn off the one-per-account limit: under first come, first served the bots take everything.",
        },
        {
          type: "quiz",
          q: "Why does a randomised start help humans against bots?",
          options: [
            "It blocks bots entirely",
            "It removes the speed advantage: arriving first no longer matters, only arriving before the start, so bots get roughly their share of entries",
            "It makes the sale finish faster",
            "It removes the need for a per-account limit",
          ],
          answer: 1,
          explain: "Bots win first come, first served because they're fastest. Randomising everyone who arrived on time takes speed out of the equation. Bots can still add entries with more accounts, which is why it's combined with verification and per-account limits.",
        },
      ],
    },
    {
      id: "bots",
      title: "Layered bot defences",
      kicker: "No single fix",
      blocks: [
        {
          type: "keypoints",
          items: [
            "<strong>One unit per account</strong>, enforced atomically (unique constraint or the Redis holders set).",
            "<strong>Rate limits</strong> per account, device and IP at the edge.",
            "<strong>Friction at queue entry:</strong> CAPTCHA or proof-of-work, so each extra session costs something.",
            "<strong>Risk signals:</strong> account age, purchase history, payment-method reuse; verify before a raffle draw.",
            "<strong>Signed admission tokens</strong> bound to the user, so the queue can't be skipped or shared.",
          ],
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Relying on a single defence. Each one is bypassable alone; together they raise the cost of running thousands of sessions above the resale profit.</p>`,
        },
      ],
    },
    {
      id: "final-design",
      title: "The final design",
      kicker: "Putting it together",
      blocks: [
        {
          type: "diagram",
          title: "Flash sale: final design",
          caption: "Static content and the queue live at the CDN. The waiting room admits at capacity with signed tokens. The gateway enforces tokens, rate limits and the sold-out flag. Redis decides winners; Postgres records holds; delayed messages and a sweeper expire them; the order service authorises payment and captures on the webhook.",
          svg: `<svg viewBox="0 0 640 330" role="img" aria-label="Final design: user to CDN and waiting room, then API gateway, reservation service with Redis gate and Postgres, expiry workers, order service and payment provider">
<defs><marker id="pb10-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="10" y="20" width="90" height="44" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="55" y="47" text-anchor="middle" font-size="13" font-weight="700">User</text>
<rect x="140" y="12" width="200" height="60" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<text x="240" y="36" text-anchor="middle" font-size="13" font-weight="700">CDN + waiting room</text>
<text x="240" y="54" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">page, queue, signed token</text>
<rect x="380" y="12" width="240" height="60" rx="8" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="1.5"/>
<text x="500" y="36" text-anchor="middle" font-size="13" font-weight="700">API gateway</text>
<text x="500" y="54" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">token, rate limits, sold-out flag</text>
<rect x="380" y="110" width="240" height="50" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="1.5"/>
<text x="500" y="140" text-anchor="middle" font-size="13" font-weight="700">Reservation service</text>
<rect x="140" y="110" width="200" height="50" rx="8" style="fill: var(--dg-5-soft); stroke: var(--dg-5)" stroke-width="1.5"/>
<text x="240" y="131" text-anchor="middle" font-size="13" font-weight="700">Redis gate</text>
<text x="240" y="148" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">Lua: limit 1, stock &gt; 0</text>
<rect x="380" y="195" width="240" height="50" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<text x="500" y="216" text-anchor="middle" font-size="13" font-weight="700">Postgres (record)</text>
<text x="500" y="233" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">holds, inventory, orders</text>
<rect x="140" y="195" width="200" height="50" rx="8" style="fill: var(--dg-6-soft); stroke: var(--dg-6)" stroke-width="1.5"/>
<text x="240" y="216" text-anchor="middle" font-size="13" font-weight="700">Expiry workers</text>
<text x="240" y="233" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">delayed msgs + sweeper</text>
<rect x="380" y="270" width="110" height="50" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="1.5"/>
<text x="435" y="300" text-anchor="middle" font-size="12" font-weight="700">Order service</text>
<rect x="510" y="270" width="110" height="50" rx="8" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="1.5"/>
<text x="565" y="292" text-anchor="middle" font-size="12" font-weight="700">Payment</text>
<text x="565" y="308" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">provider</text>
<line x1="100" y1="42" x2="138" y2="42" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#pb10-arrow)"/>
<line x1="340" y1="42" x2="378" y2="42" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#pb10-arrow)"/>
<line x1="500" y1="72" x2="500" y2="108" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#pb10-arrow)"/>
<line x1="380" y1="135" x2="342" y2="135" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#pb10-arrow)"/>
<line x1="500" y1="160" x2="500" y2="193" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#pb10-arrow)"/>
<line x1="340" y1="220" x2="378" y2="220" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#pb10-arrow)"/>
<line x1="240" y1="195" x2="240" y2="162" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#pb10-arrow)"/>
<line x1="435" y1="245" x2="435" y2="268" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#pb10-arrow)"/>
<line x1="490" y1="295" x2="508" y2="295" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#pb10-arrow)"/>
</svg>`,
        },
        {
          type: "table",
          title: "Requirement to component",
          headers: ["Requirement", "Component"],
          rows: [
            ["Never oversell", "Atomic Redis claim, Postgres of record, conditional transitions, reconciliation"],
            ["Survive the spike", "CDN, waiting room admitting at capacity"],
            ["Say no fast", "Sold-out flag at the gateway and on the queue page"],
            ["Fair, bot-resistant", "Randomised start or raffle, one per account, rate limits, CAPTCHA"],
            ["No lost or double payments", "Idempotency keys, authorise then capture, idempotent webhooks"],
            ["Stock comes back", "Delayed messages plus sweeper, waitlist for released units"],
          ],
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>Summarise in one pass: CDN and waiting room with randomised start and signed tokens; gateway checks token, limits and sold-out flag; Redis Lua gate decides winners, Postgres records HELD holds; delayed messages and a sweeper expire them conditionally; payment is idempotent, authorised first and captured on the webhook; reconciliation keeps Redis, holds and orders consistent. Mention a load test and kill switches before launch.</p>`,
        },
        {
          type: "quiz",
          q: "Stock is gone but 2 million users are still in the waiting room. What should happen?",
          options: [
            "Keep admitting them so they see \"sold out\" from the reservation service",
            "Switch the queue page to \"sold out\" immediately via the sold-out flag, stop their polling, and offer a waitlist for units released from expired holds",
            "Shut down the CDN",
            "Restock automatically",
          ],
          answer: 1,
          explain: "Admitting doomed users wastes backend capacity and their time. The flag lets the edge answer instantly; a waitlist turns later releases into sales without reopening the stampede.",
        },
      ],
    },
  ],
  takeaways: [
    "Past capacity, throughput <strong>falls</strong>; retries make it worse. Admit at capacity instead.",
    "A <strong>waiting room</strong> at the edge plus a <strong>signed admission token</strong> turns the spike into a steady stream.",
    "<strong>Randomised start</strong> or a <strong>raffle</strong> beats first come, first served against bots.",
    "Bot defence is <strong>layered</strong>: one per account, rate limits, friction at entry, risk signals.",
    "The final design maps each requirement to a component; finish with load tests, dashboards and kill switches.",
  ],
  furtherReading: [
    { title: "Hello Interview: Design a Flash Sale System", url: "https://www.hellointerview.com/learn/system-design/problem-breakdowns/flash-sale", note: "The original walkthrough of this problem." },
    { title: "Cloudflare Waiting Room documentation", url: "https://developers.cloudflare.com/waiting-room/" },
  ],
};
