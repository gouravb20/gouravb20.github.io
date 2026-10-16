// Deep dive: Chapter 15, Build your own trade-off analysis. Format: DeepDive in public/shared/notes.d.ts.
window.DEEP = window.DEEP || {};
DEEP.ch15 = {
  hook: `<p>Basket's next decision isn't in any book: whether the new "scheduled weekly shop" feature should be a separate service that places orders through checkout's API, or a module inside the ordering service. No catalogue of patterns covers it exactly. That's the normal state of affairs: the book's examples run out, and the problems keep coming.</p>
<p>So the book ends by turning its approach into a method. Find what's entangled in the decision, analyse how it's coupled, assess the trade-offs in this context, and communicate the result in a way stakeholders can act on. Along the way it offers techniques and warnings drawn from the rest of the book. This deep dive applies them end to end to Basket's weekly shop decision.</p>`,
  sections: [
    {
      id: "the-method",
      title: "Three steps",
      kicker: "The method",
      blocks: [
        {
          type: "steps",
          items: [
            `<strong>Find what is entangled.</strong> Identify which parts of the architecture are coupled in this decision: services, data, transactions, deployment, operational characteristics. The tools are static and dynamic coupling analysis from Chapter 2: what must start together, what calls what, what must commit together.`,
            `<strong>Analyse the coupling points.</strong> For each coupling, work out what flows across it and how strong it is: a key reference, a synchronous call per request, a shared transaction, a shared schema. This shows which forces actually matter.`,
            `<strong>Assess the trade-offs.</strong> For each option, ask what it does to the qualities that matter here (scale, consistency, availability, change speed, team autonomy, cost) and whether the effect is acceptable. Then pick the least worst, and say what you're giving up.`
          ]
        },
        {
          type: "table",
          title: "Weekly shop: what's entangled",
          headers: ["Coupling point", "What flows", "Strength", "Matters because"],
          rows: [
            ["Weekly shop → checkout", "Places an order every week per subscriber", "Runtime call, ~50K orders in a 2-hour Sunday window", "Load spike on checkout; failure handling"],
            ["Weekly shop ↔ orders data", "Reads past orders to build the list", "Read-only, large", "Data access pattern (Chapter 10)"],
            ["Weekly shop → payment", "Charges a saved card", "Must succeed or notify the customer", "Saga shape (Chapter 12)"],
            ["Weekly shop ↔ ordering team", "Same team today", "Organisational", "Ownership and deployment cadence"]
          ]
        }
      ]
    },
    {
      id: "techniques",
      title: "Techniques for a sound analysis",
      kicker: "Doing it well",
      blocks: [
        {
          type: "text",
          html: `<p><strong>Qualitative versus quantitative.</strong> Architecture decisions are rarely measurable before the system exists, so most analysis is qualitative: comparing options relative to each other on consistent criteria. That isn't the same as vague. State the criteria, rate options consistently, write down assumptions, and quantify wherever it's cheap: a load test of checkout at 50K orders in two hours is worth more than a page of argument.</p>
<p><strong>MECE lists.</strong> Make options and criteria <em>mutually exclusive</em> (no overlaps) and <em>collectively exhaustive</em> (nothing important missing). Comparing "a separate service" with "use Kafka" fails both tests: one is a boundary decision, the other a technology, and they aren't alternatives. Keep each comparison at one level.</p>
<p><strong>Model relevant domain cases.</strong> Walk real scenarios through each option. What happens when a subscriber's card has expired? When checkout is down at 07:00 on Sunday? When a product in the weekly list is discontinued? Scenarios expose trade-offs abstract criteria miss, and stakeholders can follow them.</p>`
        },
        {
          type: "lab",
          id: "tradeoffMatrix",
          caption: "Use the matrix as a thinking tool: the interesting output is the sensitivity line, which tells you which weight is worth debating."
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>A weighted matrix is a way to make your reasoning visible, not a calculator that decides for you. If the totals are close, don't trust them; model scenarios instead. If one criterion's weight flips the result, that weight is the conversation to have with stakeholders.</p>`
        }
      ]
    },
    {
      id: "traps",
      title: "Traps",
      kicker: "What goes wrong",
      blocks: [
        {
          type: "compare",
          items: [
            { title: "The out-of-context trap", tone: "bad", html: `<p>Listing generic pros and cons and counting them. A separate service has "more advantages" on paper (independent deploys, independent scaling, clear ownership), but if the one thing that matters is not adding load to checkout on Sunday morning, the count is irrelevant. Weight by context first.</p>` },
            { title: "Overwhelming evidence", tone: "bad", html: `<p>Presenting forty slides of analysis to a product director. Decision-makers need the recommendation and the one or two trade-offs that drive it. Keep the detail in the ADR for anyone who wants to check the reasoning.</p>` },
            { title: "Snake oil and evangelism", tone: "bad", html: `<p>Anyone, including you, presenting an option with no downsides. Every option costs something; if you can't name the cost, you haven't analysed it yet. Be most sceptical of technologies you're excited about.</p>` },
            { title: "Comparing at mixed levels", tone: "warn", html: `<p>"Microservices vs PostgreSQL vs event sourcing" isn't a comparison. Split it into separate decisions, each with options at the same level.</p>` }
          ]
        }
      ]
    },
    {
      id: "worked-example",
      title: "Worked example: Basket's weekly shop",
      kicker: "End to end",
      blocks: [
        {
          type: "table",
          title: "Options compared on what matters here",
          headers: ["Criterion (weight)", "Module in ordering", "Separate service, sync calls", "Separate service, queued orders"],
          rows: [
            ["Checkout load on Sunday (high)", "Same process: competes directly", "50K sync calls in 2 hours", "Queue smooths load over the window"],
            ["Failure handling (high)", "Local transaction", "Retry logic in a new service", "Messages retry; failures become order states"],
            ["Independent release (medium)", "Ships with ordering", "Yes", "Yes"],
            ["Operational cost (medium)", "None added", "New service to run", "New service plus queue"],
            ["Team ownership (low)", "Ordering team", "Ordering team (for now)", "Ordering team (for now)"]
          ]
        },
        {
          type: "text",
          html: `<p>Scenarios settle it. If checkout is down at 07:00 on Sunday, the module fails with it; the synchronous service fails 50K calls and has to retry them all; the queued service simply waits and drains the queue when checkout returns. If a subscriber's card has expired, all three need the same customer notification, but only the queued design naturally turns it into an order state (<code>PAYMENT_FAILED</code>) without blocking others. The extra operational cost of a queue is real but small next to Sunday's risk.</p>`
        },
        {
          type: "code",
          title: "The bottom line, as it goes to the product director",
          lang: "text",
          code: `Recommendation: build weekly shop as a small separate service that queues
orders for checkout to process, rather than calling it directly.

Why: Sunday morning puts ~50K orders on checkout in two hours. Queuing them
protects checkout from that spike and means a checkout outage delays weekly
shops instead of failing them.

Cost: one more service and a queue to operate; weekly shop orders may be
placed a few minutes later than scheduled during peaks.

Decision needed from you: is "within 15 minutes of the scheduled time"
acceptable for weekly shop orders?`
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>Notice what the summary does: it leads with the recommendation, names the one trade-off that drives it, states the cost in business terms, and ends with a decision only the business can make. The full matrix and scenarios go into ADR-047 for anyone who wants to check.</p>`
        }
      ]
    },
    {
      id: "closing",
      title: "Closing the loop",
      kicker: "After the decision",
      blocks: [
        {
          type: "keypoints",
          items: [
            `<strong>Record it.</strong> An ADR with context, options, the decision, consequences in both directions, and how compliance is checked (Chapter 1).`,
            `<strong>Guard it.</strong> Fitness functions for the properties that justified the choice: queue depth and age alerts, a rule that weekly shop never calls checkout synchronously.`,
            `<strong>Revisit it.</strong> Note what would change the decision ("if weekly shop exceeds 30% of orders, revisit ownership"), so the next architect knows when the context has moved.`
          ]
        },
        {
          type: "quiz",
          q: "A colleague's analysis lists twelve advantages for a new event-streaming platform and no disadvantages. What's the most useful response?",
          options: ["Approve it: twelve advantages is overwhelming evidence", "Ask which of the twelve matter for this system, and what the platform costs: operations, skills, failure modes", "Reject it: new technology is always risky", "Ask for twenty more advantages to be sure"],
          answer: 1,
          explain: `<p>An option with no listed downsides hasn't been fully analysed (the snake oil trap), and a count of generic advantages ignores context (the out-of-context trap). Weight the advantages by what matters here and make the costs explicit.</p>`
        }
      ]
    }
  ],
  takeaways: [
    `When the patterns run out, use the method: find what's entangled, analyse the coupling points, assess trade-offs in context.`,
    `Structured qualitative analysis is legitimate; quantify where cheap, and keep options and criteria MECE.`,
    `Model real domain scenarios through each option; they expose trade-offs and persuade stakeholders.`,
    `Avoid the out-of-context trap, overwhelming evidence, and evangelism; every option has a cost.`,
    `Lead with the bottom line, record the full reasoning in an ADR, and guard the decision with fitness functions.`
  ],
  furtherReading: [
    { title: "The Pyramid Principle (Barbara Minto)", note: "Origin of the MECE idea and a guide to leading with the conclusion." },
    { title: "Software Architecture: The Hard Parts", note: "The book itself: read it for the authors' full treatment and their running case study." }
  ]
};
