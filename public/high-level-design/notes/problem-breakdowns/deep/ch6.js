// Deep dive: Chapter 6, Scoping a flash sale. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch6 = {
  hook: `<p>A flash sale must turn almost everyone away, quickly and fairly, without ever promising one unit to two people. This chapter pins down the requirements that make that possible: the reservation step, where strong consistency is needed, the numbers, and what "fair" means.</p>`,
  sections: [
    {
      id: "shape-of-the-problem",
      title: "The shape of the problem",
      kicker: "Supply, demand and one second",
      blocks: [
        {
          type: "problem",
          html: `<p>A flash sale combines three things that are each manageable alone: <strong>scarce, fixed stock</strong> (20,000 units, no restocking), <strong>enormous demand</strong> (500 people per unit) and <strong>synchronised arrival</strong> (everyone knows the start time). Together they produce a load spike measured in seconds, a single contended number at the centre of it, and a crowd that is mostly going to be disappointed.</p>`,
        },
        {
          type: "idea",
          html: `<p>Treat the system as a <strong>funnel</strong>. Each layer should discard as much traffic as it can, as cheaply as it can, so that only a trickle of requests reaches the one place that must be exactly right: the stock counter. The CDN absorbs page loads, a waiting room meters entry, a fast gate hands out the 20,000 claims, and only those winners touch the database and the payment provider.</p>`,
        },
        {
          type: "diagram",
          title: "The flash-sale funnel",
          caption: "Each layer removes traffic before the next. Millions of page loads end at the CDN; the waiting room admits users at the rate the backend can serve; the stock gate turns attempts into 20,000 claims; only claims become database writes and payments.",
          svg: `<svg viewBox="0 0 640 300" role="img" aria-label="A funnel narrowing from ten million users at the CDN, through the waiting room and the stock gate, to twenty thousand reservations and payments">
<path d="M40 20 L600 20 L520 90 L120 90 Z" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<path d="M120 100 L520 100 L450 160 L190 160 Z" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="1.5"/>
<path d="M190 170 L450 170 L390 225 L250 225 Z" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="1.5"/>
<rect x="250" y="235" width="140" height="50" rx="8" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="1.5"/>
<text x="320" y="48" text-anchor="middle" font-size="14" font-weight="700">CDN: page, images, countdown</text>
<text x="320" y="70" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">~10M users, millions of requests per second</text>
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
      ],
    },
    {
      id: "requirements",
      title: "Requirements, and the step most people miss",
      kicker: "Reserve, then pay",
      blocks: [
        {
          type: "text",
          html: `<p>Three actions: <strong>view</strong> the item, <strong>reserve</strong> one unit for a limited time, <strong>pay</strong> for a reserved unit. Reserve carries the design, because payment goes through an external provider and takes seconds to minutes.</p>`,
        },
        {
          type: "compare",
          title: "Two ways to sell the last console",
          items: [
            { title: "Pay first, decrement on success", tone: "bad", html: "<p>Thousands of people start paying for the last few units at once. Whoever's payment settles first gets a console; everyone else has already been charged, or at least authorised, and needs a refund and an apology. The stock is never oversold, but the customer experience is.</p>" },
            { title: "Lock stock while paying", tone: "bad", html: "<p>Take a lock on the stock row, call the provider, decrement, release. Correct, but every other buyer waits for the slowest payment in the queue. At one payment every few seconds, 20,000 units would take a day to sell.</p>" },
            { title: "Reserve, then pay", tone: "ok", html: "<p>Claim a unit with a fast, local, atomic operation, record a hold that expires in a few minutes, and let the buyer pay against the hold. The scarce resource is secured in milliseconds; the slow external step happens afterwards; abandoned holds go back on the shelf.</p>" },
          ],
        },
        {
          type: "keypoints",
          title: "Non-functional requirements",
          items: [
            "<strong>Never oversell:</strong> reserved plus sold never exceeds stock.",
            "<strong>Survive the spike:</strong> ~1M requests/s for a short time.",
            "<strong>Say no fast:</strong> once stock is gone, everyone still trying finds out instantly.",
            "<strong>Be fair</strong> under an agreed definition, and resist bots.",
          ],
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>If you reach for the reservation step yourself, say why in one sentence: "payment is slow and external, so I'll secure the unit first with a short hold and settle the money against the hold". Interviewers often steer candidates towards it; arriving there unprompted is a clear signal.</p>`,
        },
      ],
    },
    {
      id: "strong-where-it-counts",
      title: "Strong consistency only where it counts",
      kicker: "Splitting the paths",
      blocks: [
        {
          type: "idea",
          html: `<p>"Never oversell" is a property of one number and the records that depend on it. Cache the busy paths; give strong guarantees only to the small, contended one.</p>`,
        },
        {
          type: "table",
          title: "What each path needs",
          headers: ["Path", "Volume", "Staleness allowed", "Where it lives"],
          rows: [
            ["Sale page, images, countdown", "Highest", "Minutes (it's static)", "CDN"],
            ["Sale status: open, sold out", "Very high", "A second or two", "Short-TTL cache at the edge"],
            ["\"Units left\" badge", "High", "Seconds; approximate is fine", "Cache, refreshed from the counter"],
            ["Reserve a unit", "Burst of attempts", "None", "Atomic counter plus database"],
            ["Pay, confirm order", "About the number of units", "None", "Database plus payment provider"],
          ],
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p><strong>Displays can lie a little; decisions can't.</strong> "12 left" when there are 9 is harmless if the reserve call is exact.</p>`,
        },
      ],
    },
    {
      id: "the-numbers",
      title: "The numbers that shape the design",
      kicker: "Back of the envelope",
      blocks: [
        {
          type: "steps",
          title: "Estimating the console launch",
          items: [
            "<strong>Users:</strong> about 10 million, most arriving within a minute of opening.",
            "<strong>Requests:</strong> about 5 per user in that minute (page, status polls, reserve attempts, retries), so ~50 million requests, <span class=\"formula\">50M ÷ 60 s ≈ 830K/s</span> on average and a few times that in the first seconds.",
            "<strong>Success rate:</strong> <span class=\"formula\">20,000 ÷ 10,000,000 = 0.2%</span>. 499 of every 500 users must be told no.",
            "<strong>Hot row:</strong> a locked database row updated in about 1 ms handles <span class=\"formula\">1 ÷ 1 ms ≈ 1,000/s</span>. Reserve attempts arrive at hundreds of thousands per second.",
            "<strong>In-memory counter:</strong> a Redis node handles on the order of 100K simple operations per second, about 100× a locked row.",
            "<strong>Writes that matter:</strong> roughly 20,000 reservations plus their payments. Tiny, if the losers never reach the database.",
          ],
        },
        {
          type: "lab",
          id: "flashEstimator",
          caption: "Start with the defaults and look at the gap between reserve attempts and what one locked row can take. Then shrink the crowd to 100K users spread over five minutes: at small scale the simple design is fine. The point is to know which side of the line you're on.",
        },
        {
          type: "quiz",
          q: "Stock is 20,000 and 10 million users try to reserve within a minute. Which statement best describes the main engineering challenge?",
          options: [
            "Storing 10 million reservations",
            "Absorbing a short burst of attempts at one contended counter and rejecting almost all of them quickly, without ever exceeding stock",
            "Processing 10 million payments per minute",
            "Serving the product page, which requires a large database cluster",
          ],
          answer: 1,
          explain: "Only 20,000 attempts can succeed, so there are at most 20,000 reservations and payments. The page is static and belongs on a CDN. What's hard is the burst at the counter: deciding the winners exactly and turning millions of losers away fast.",
        },
      ],
    },
    {
      id: "fairness-and-scope",
      title: "Defining fair, and drawing the line",
      kicker: "Before you design anything",
      blocks: [
        {
          type: "text",
          html: `<p>Processing requests in arrival order rewards the lowest latency, which usually means bots. Agree which model the business wants:</p>
<ul>
<li><strong>First come, first served:</strong> arrival order decides. Easy to explain, easy to game.</li>
<li><strong>Random among the punctual:</strong> everyone who arrives before the start gets a random place in line; later arrivals queue behind them.</li>
<li><strong>Raffle:</strong> register in advance, verify accounts, draw winners, give them a window to buy.</li>
</ul>
<p>Add a <strong>per-customer limit</strong> (one console per account) regardless of the model. Chapter 10 builds each option and measures them against bots.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Ticketmaster", title: "The Eras Tour presale (2022)", html: "Ticketmaster said the November 2022 presale for Taylor Swift's tour saw about 3.5 billion system requests, roughly four times its previous peak, despite using its Verified Fan pre-registration. It's the canonical example of demand overwhelming a sale, and of pre-registration as a fairness and load tool." },
            { org: "Nike SNKRS", title: "Draws instead of a race", html: "Nike runs many high-demand sneaker releases in its SNKRS app as a draw: entrants sign up during a window and winners are picked at random, rather than first come, first served, which takes the speed advantage away from bots." },
          ],
        },
        {
          type: "quiz",
          q: "Why is first come, first served a weak fairness model for a flash sale?",
          options: [
            "It's impossible to implement at scale",
            "It rewards whoever has the lowest latency and fastest automation, which is usually bots, so differences of milliseconds decide the winners",
            "It always oversells",
            "It requires users to register in advance",
          ],
          answer: 1,
          explain: "Arrival order is decided in the first milliseconds, when automated clients close to the servers dominate. Randomising the order among everyone who arrived on time, or running a verified raffle, takes that advantage away.",
        },
      ],
    },
  ],
  takeaways: [
    "A flash sale is a <strong>funnel</strong>: each layer turns away as much demand as it can, as cheaply as it can, so only winners reach the database.",
    "The <strong>reservation</strong> is the key functional step: claim a unit fast and atomically, then pay against a short hold.",
    "<strong>Strong consistency</strong> is needed only for the stock counter and the reservation and order records; pages, status and badges can be cached.",
    "Numbers: ~10M users, ~1M requests/s at the peak, 0.2% success, ~1,000 updates/s on a locked row vs ~100K/s on a Redis node.",
    "<strong>Define fair</strong> up front (first come, random among the punctual, or raffle) and add a per-customer limit.",
  ],
  furtherReading: [
    { title: "Hello Interview: Design a Flash Sale System", url: "https://www.hellointerview.com/learn/system-design/problem-breakdowns/flash-sale", note: "The original problem breakdown these notes follow; read their walkthrough there." },
  ],
};
