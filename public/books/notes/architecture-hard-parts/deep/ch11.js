// Deep dive: Chapter 11, Managing distributed workflows. Format: DeepDive in public/shared/notes.d.ts.
window.DEEP = window.DEEP || {};
DEEP.ch11 = {
  hook: `<p>In the monolith, placing a Basket order was one method: validate the cart, take payment, reserve stock, create a picking task, book the delivery slot, send the confirmation. If anything threw, the transaction rolled back. Now those six steps belong to five services, and somebody has to decide who runs the sequence, what happens when step four fails, and how a customer support agent finds out where order 4711 got stuck.</p>
<p>There are two basic answers. An <strong>orchestrator</strong> can direct the workflow from one place, or the services can <strong>choreograph</strong> it among themselves by reacting to each other's events. The book compares them carefully, adds a third question that's easy to overlook (where does workflow state live without an orchestrator?), and introduces the distinction between coupling that comes from the domain and coupling that comes from the design.</p>`,
  sections: [
    {
      id: "two-styles",
      title: "Orchestration and choreography",
      kicker: "The two styles",
      blocks: [
        {
          type: "diagram",
          title: "The same order workflow, two ways",
          caption: "Top: the order orchestrator calls each service in turn and handles their responses. Bottom: each service reacts to the previous event and publishes the next; no service sees the whole flow.",
          svg: `<svg viewBox="0 0 660 330" role="img" aria-label="Orchestrated versus choreographed order workflow">
<defs><marker id="ahp11-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<g font-size="12" text-anchor="middle">
<text x="20" y="20" text-anchor="start" font-weight="700">Orchestration</text>
<rect x="255" y="30" width="150" height="38" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/><text x="330" y="54" font-weight="700">Order orchestrator</text>
<rect x="40" y="110" width="100" height="34" rx="7" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="90" y="132">Payment</text>
<rect x="190" y="110" width="100" height="34" rx="7" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="240" y="132">Stock</text>
<rect x="370" y="110" width="100" height="34" rx="7" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="420" y="132">Picking</text>
<rect x="520" y="110" width="100" height="34" rx="7" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="570" y="132">Delivery</text>
<g style="stroke: var(--dg-muted)" stroke-width="1.5">
<line x1="270" y1="68" x2="100" y2="108" marker-end="url(#ahp11-arr)"/><line x1="310" y1="68" x2="245" y2="108" marker-end="url(#ahp11-arr)"/>
<line x1="350" y1="68" x2="415" y2="108" marker-end="url(#ahp11-arr)"/><line x1="390" y1="68" x2="560" y2="108" marker-end="url(#ahp11-arr)"/>
</g>
<text x="170" y="92" font-size="11" style="fill: var(--dg-muted)">1</text><text x="268" y="92" font-size="11" style="fill: var(--dg-muted)">2</text><text x="392" y="92" font-size="11" style="fill: var(--dg-muted)">3</text><text x="490" y="92" font-size="11" style="fill: var(--dg-muted)">4</text>
<line x1="20" y1="170" x2="640" y2="170" style="stroke: var(--dg-line)" stroke-dasharray="4 4"/>
<text x="20" y="196" text-anchor="start" font-weight="700">Choreography</text>
<rect x="20" y="230" width="100" height="34" rx="7" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="70" y="252">Order</text>
<rect x="150" y="230" width="100" height="34" rx="7" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="200" y="252">Payment</text>
<rect x="280" y="230" width="100" height="34" rx="7" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="330" y="252">Stock</text>
<rect x="410" y="230" width="100" height="34" rx="7" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="460" y="252">Picking</text>
<rect x="540" y="230" width="100" height="34" rx="7" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="590" y="252">Delivery</text>
<g style="stroke: var(--dg-muted)" stroke-width="1.5" stroke-dasharray="5 4">
<line x1="120" y1="247" x2="148" y2="247" marker-end="url(#ahp11-arr)"/><line x1="250" y1="247" x2="278" y2="247" marker-end="url(#ahp11-arr)"/>
<line x1="380" y1="247" x2="408" y2="247" marker-end="url(#ahp11-arr)"/><line x1="510" y1="247" x2="538" y2="247" marker-end="url(#ahp11-arr)"/>
</g>
<g font-size="11" style="fill: var(--dg-muted)">
<text x="135" y="290">OrderPlaced</text><text x="265" y="290">PaymentTaken</text><text x="395" y="290">StockReserved</text><text x="525" y="290">PickCompleted</text>
</g>
<text x="330" y="320" font-size="11" style="fill: var(--dg-muted)">dashed: asynchronous events on a broker</text>
</g>
</svg>`
        },
        {
          type: "text",
          html: `<p>With <strong>orchestration</strong>, a dedicated service owns the workflow definition. It calls payment, waits for the result, calls stock, and so on. It knows at every moment which step each order is on, and it contains all the decisions: what to do if payment declines, how long to wait for stock, when to give up. Participants are simple: they do their step and report back.</p>
<p>With <strong>choreography</strong>, there's no conductor. The order service publishes <code>OrderPlaced</code>; payment reacts and publishes <code>PaymentTaken</code>; stock reacts to that, and so on. Each service knows only which events it consumes and which it emits. The workflow exists as the sum of those reactions.</p>`
        },
        {
          type: "compare",
          items: [
            { title: "Orchestration strengths", tone: "ok", html: `<ul><li>Workflow defined in one place</li><li>Central error handling</li><li>Recoverability: retry or resume from known state</li><li>State and status are easy to query</li></ul>` },
            { title: "Orchestration costs", tone: "bad", html: `<ul><li>Responsiveness: every step goes through it</li><li>Fault tolerance: it's a critical dependency</li><li>Scalability: it can become the bottleneck</li><li>Coupling: it knows every participant</li></ul>` },
            { title: "Choreography strengths", tone: "ok", html: `<ul><li>Responsiveness: steps flow at event speed</li><li>Scalability: no central bottleneck</li><li>Fault tolerance: no single coordinator</li><li>Decoupling: services know only events</li></ul>` },
            { title: "Choreography costs", tone: "bad", html: `<ul><li>Workflow logic scattered across services</li><li>State management is hard</li><li>Error handling is hard</li><li>Recoverability is hard</li></ul>` }
          ]
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>The two lists are almost exact mirror images. Orchestration is strong on the things that matter when something goes wrong; choreography on the things that matter when everything goes right. That's a useful heuristic: the more often a workflow fails or branches, the more orchestration pays off.</p>`
        }
      ]
    },
    {
      id: "error-handling",
      title: "Where error handling grows",
      kicker: "The deciding factor",
      blocks: [
        {
          type: "problem",
          html: `<p>Stock can't be reserved because the last jar of the item sold a second ago. Payment has already been taken. Under orchestration, the orchestrator sees the failure and calls payment to refund. Under choreography, stock publishes <code>StockUnavailable</code>, and payment must be listening for it to refund; and if picking had already started for other items, picking must listen too. Every new failure mode adds handlers in every earlier service.</p>`
        },
        {
          type: "text",
          html: `<p>In a choreographed workflow of <em>n</em> steps, each step may need to react to the failure of any later step, so the number of compensation handlers grows roughly with <em>n</em>(<em>n</em>−1)/2, spread across services that each see only part of the flow. An orchestrator holds the same decisions as <em>n</em> branches in one place. Messages and latency go the other way: the orchestrator doubles the number of hops (command plus reply for each step).</p>`
        },
        {
          type: "lab",
          id: "workflowSim",
          caption: "Raise the step count and failure rate: choreography stays faster, but its compensation handlers grow quadratically."
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>You don't have to choose once per system. A common shape is to orchestrate the core where failures are frequent and costly (payment, stock, slot booking) and let fire-and-forget steps (confirmation email, analytics, loyalty points) react to a final <code>OrderConfirmed</code> event.</p>`
        }
      ]
    },
    {
      id: "choreography-state",
      title: "Where does state live without an orchestrator?",
      kicker: "Workflow state",
      blocks: [
        {
          type: "text",
          html: `<p>A customer calls: "where's my order?". With an orchestrator, the answer is one lookup. With choreography, no service holds the whole picture. The book describes three ways to get one.</p>`
        },
        {
          type: "table",
          headers: ["Option", "How it works", "Good", "Costs"],
          rows: [
            ["Front controller", "The first service in the workflow (Order) also tracks the state, updating it as it observes each event", "One place to query; no extra service", "Order carries workflow responsibility beyond its domain; must consume every event"],
            ["Stateless choreography", "Store no workflow state; when asked, query every participant and assemble the answer", "Services stay simple and decoupled", "Status queries fan out, are slow, and fail if any participant is down"],
            ["Stamp coupling", "Each event carries the accumulated workflow state forward", "No central store; each step sees history", "Bigger, more coupled message contracts (Chapter 13)"]
          ]
        },
        {
          type: "code",
          title: "Stamp-coupled event carrying workflow state",
          lang: "json",
          code: `{
  "type": "StockReserved",
  "orderId": "4711",
  "workflow": {
    "placedAt": "2026-10-16T07:58:12Z",
    "payment":  { "status": "TAKEN", "ref": "pi_93kd" },
    "stock":    { "status": "RESERVED", "warehouse": "LDN-2", "substitutions": 1 },
    "picking":  { "status": "PENDING" },
    "delivery": { "status": "PENDING", "slot": "2026-10-16T18:00/19:00" }
  }
}`
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p>The front controller is a quiet slide back towards orchestration: the order service starts knowing about every step, and soon it's deciding what happens on failure too. That can be fine, but recognise it and decide on purpose.</p>`
        }
      ]
    },
    {
      id: "semantic-coupling",
      title: "Semantic coupling and implementation coupling",
      kicker: "What design can and can't remove",
      blocks: [
        {
          type: "idea",
          html: `<p><strong>Semantic coupling</strong> is the coupling inherent in the problem: an order must be paid for before it's picked; a slot must be booked before a driver is assigned. No architecture removes it, because it's what the business does. <strong>Implementation coupling</strong> is what the chosen design adds: an orchestrator that must know every service's API, events that carry whole objects, synchronous calls that tie availability together.</p>`
        },
        {
          type: "text",
          html: `<p>The book's point is that a good design adds as little implementation coupling as possible on top of the semantic coupling, and that the implementation should match the shape of the workflow. A highly interdependent workflow with many branches and compensations has a lot of semantic coupling; forcing it into pure choreography doesn't make it less coupled, it just hides the coupling in event handlers scattered across teams. Conversely, wrapping a simple linear pipeline in a heavyweight orchestrator adds coupling the domain never needed.</p>`
        },
        {
          type: "compare",
          items: [
            { title: "Good match", tone: "ok", html: `<p>Basket's checkout (payment, stock, slot booking, with frequent failures and substitutions) uses an orchestrator. The confirmation email, loyalty points and analytics react to <code>OrderConfirmed</code> events.</p>` },
            { title: "Mismatch", tone: "bad", html: `<p>The whole checkout flow is choreographed. Substitution logic lives partly in stock, partly in payment (to adjust the charge) and partly in order (to update totals), and nobody can explain the full behaviour without reading three codebases.</p>` }
          ]
        },
        {
          type: "quiz",
          q: "Basket's returns workflow has 7 steps with many branches (partial returns, damaged items, refunds to different payment methods), and support staff need to see each return's status. Which approach fits best?",
          options: ["Pure choreography with stateless status queries", "Orchestration, with a returns orchestrator owning state and error handling", "Choreography with stamp coupling and no status tracking", "A nightly batch that reconciles returns"],
          answer: 1,
          explain: `<p>Many branches and failure paths plus a need for clear status are exactly what orchestration handles well. The workflow's semantic coupling is high; centralising it keeps it understandable instead of scattering it across event handlers.</p>`
        }
      ]
    }
  ],
  takeaways: [
    `Orchestration centralises workflow logic, error handling, recovery and state; choreography wins on responsiveness, scale, fault tolerance and decoupling.`,
    `Error handling grows roughly quadratically with steps under choreography; the more a workflow fails or branches, the more orchestration pays off.`,
    `Without an orchestrator, workflow state needs a front controller, stateless queries or stamp coupling, each with its own cost.`,
    `Semantic coupling comes from the domain and can't be designed away; avoid adding implementation coupling on top, and match the style to the workflow's shape.`,
    `Mixing styles per workflow (orchestrated core, choreographed edges) is common and often best.`
  ],
  furtherReading: [
    { title: "Temporal / Durable Functions", url: "https://temporal.io/", note: "Workflow engines that make orchestration durable and recoverable." },
    { title: "Enterprise Integration Patterns (Hohpe, Woolf)", url: "https://www.enterpriseintegrationpatterns.com/", note: "The classic catalogue of messaging patterns behind choreography." }
  ]
};
