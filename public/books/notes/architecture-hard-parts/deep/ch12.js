// Deep dive: Chapter 12, Transactional sagas. Format: DeepDive in public/shared/notes.d.ts.
window.DEEP = window.DEEP || {};
DEEP.ch12 = {
  hook: `<p>At 18:02 a Basket customer checks out. Payment succeeds. Stock reservation fails: the last bag of oranges went to another order a moment earlier. The customer has been charged for an order that can't be fulfilled as placed. In the monolith, the database would have rolled the whole thing back. Here, payment committed in a different database seconds ago, and nothing will undo it unless something is designed to.</p>
<p>A <strong>saga</strong> is the design for that: a multi-service business transaction built from local transactions, with a plan for when a step fails. The book's contribution is to show that "saga" isn't one pattern but eight, one for each combination of the three dynamic-coupling dimensions from Chapter 2, and that they behave very differently. This deep dive walks through all eight, the problems with compensating transactions, and the state-machine alternative the book favours.</p>`,
  sections: [
    {
      id: "what-a-saga-is",
      title: "What a saga is",
      kicker: "Definition",
      blocks: [
        {
          type: "idea",
          html: `<p>A <strong>saga</strong> is a sequence of local transactions, each in one service's database, that together implement one business operation. If a step fails, the saga takes a defined action: undo earlier steps with <strong>compensating transactions</strong>, or move the operation into a known intermediate state that the business can resolve. The term comes from a 1987 database paper by Garcia-Molina and Salem on long-lived transactions; microservices gave it a second life.</p>`
        },
        {
          type: "text",
          html: `<p>Three choices shape every saga, the dimensions from Chapter 2:</p>
<ul><li><strong>Communication:</strong> do services call each other <em>synchronously</em> and wait, or send <em>asynchronous</em> messages?</li>
<li><strong>Consistency:</strong> must the whole operation be <em>atomic</em> (all steps or none, compensating on failure), or is <em>eventual</em> consistency acceptable (each step commits; the system converges)?</li>
<li><strong>Coordination:</strong> is there an <em>orchestrator</em>, or do services <em>choreograph</em> the flow themselves?</li></ul>
<p>Two options per dimension give eight combinations. The book names each one so architects can talk about them precisely.</p>`
        },
        {
          type: "table",
          title: "The eight sagas",
          headers: ["Saga", "Communication", "Consistency", "Coordination", "In one line"],
          rows: [
            ["Epic", "Sync", "Atomic", "Orchestrated", "The monolith's transaction, rebuilt over the network"],
            ["Phone Tag", "Sync", "Atomic", "Choreographed", "Epic without a coordinator; failures passed back down the line"],
            ["Fairy Tale", "Sync", "Eventual", "Orchestrated", "Readable orchestrated flow, local commits"],
            ["Time Travel", "Sync", "Eventual", "Choreographed", "A synchronous chain of local commits"],
            ["Fantasy Fiction", "Async", "Atomic", "Orchestrated", "Atomicity over async messages: harder than it looks"],
            ["Horror Story", "Async", "Atomic", "Choreographed", "The combination to avoid"],
            ["Parallel", "Async", "Eventual", "Orchestrated", "Responsive, scalable, centrally managed"],
            ["Anthology", "Async", "Eventual", "Choreographed", "Loosest coupling, hardest to follow"]
          ]
        }
      ]
    },
    {
      id: "synchronous-sagas",
      title: "The four synchronous sagas",
      kicker: "Callers wait",
      blocks: [
        {
          type: "text",
          html: `<p>Synchronous sagas are easy to reason about because the caller always knows the result of each step before moving on. Their shared weakness is the one from Chapter 2: every synchronous call entangles availability and latency, so the operation is only as fast as the sum of its steps and only as available as the product of its participants.</p>`
        },
        {
          type: "compare",
          items: [
            { title: "Epic Saga (sync, atomic, orchestrated)", tone: "bad", html: `<p>An orchestrator calls payment, stock, picking and delivery in turn, waiting for each, and if any fails it calls the earlier ones to compensate. It feels like the monolith, which is why teams reach for it first. In practice it's the most tightly coupled shape: every participant must be up, the customer waits for every call, and compensations can themselves fail, leaving the system inconsistent anyway.</p>` },
            { title: "Phone Tag Saga (sync, atomic, choreographed)", tone: "bad", html: `<p>No orchestrator: order calls payment, which calls stock, which calls picking. On the happy path it's slightly faster (no central hop). On failure, each service must pass the error back to its caller and undo its own work, so error handling is spread along the chain. Atomicity without a coordinator is hard to get right.</p>` },
            { title: "Fairy Tale Saga (sync, eventual, orchestrated)", tone: "ok", html: `<p>An orchestrator calls each service synchronously, but each commits independently and the orchestrator drives the operation forward rather than trying to make it atomic. If stock fails, the order moves to a "needs attention" state instead of unwinding everything. Easy to read and debug; a pragmatic and popular choice when responsiveness isn't critical.</p>` },
            { title: "Time Travel Saga (sync, eventual, choreographed)", tone: "warn", html: `<p>Services call each other in a chain, each committing locally, with no orchestrator. Good for simple, linear, high-throughput pipelines (a chain of processing stages) with few errors. Once the flow branches or fails often, nobody can see the whole picture.</p>` }
          ]
        },
        {
          type: "diagram",
          title: "Epic Saga: compensation when stock fails",
          caption: "The orchestrator has already called payment successfully. When stock fails, it must call payment again to refund, and cancel the order, to restore the illusion that nothing happened. Between steps 2 and 5, other services can see a paid order that will be cancelled.",
          svg: `<svg viewBox="0 0 640 290" role="img" aria-label="Sequence of an Epic Saga with compensation">
<defs><marker id="ahp12-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker><marker id="ahp12-bad" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-bad)"/></marker></defs>
<g font-size="12" text-anchor="middle">
<rect x="40" y="15" width="110" height="32" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/><text x="95" y="36" font-weight="700">Orchestrator</text>
<rect x="210" y="15" width="100" height="32" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="260" y="36">Order</text>
<rect x="360" y="15" width="100" height="32" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="410" y="36">Payment</text>
<rect x="510" y="15" width="100" height="32" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="560" y="36">Stock</text>
<g style="stroke: var(--dg-line)" stroke-dasharray="3 4"><line x1="95" y1="47" x2="95" y2="280"/><line x1="260" y1="47" x2="260" y2="280"/><line x1="410" y1="47" x2="410" y2="280"/><line x1="560" y1="47" x2="560" y2="280"/></g>
<line x1="95" y1="75" x2="258" y2="75" style="stroke: var(--dg-muted)" stroke-width="1.5" marker-end="url(#ahp12-arr)"/><text x="178" y="69" font-size="11">1 create order ✓</text>
<line x1="95" y1="110" x2="408" y2="110" style="stroke: var(--dg-muted)" stroke-width="1.5" marker-end="url(#ahp12-arr)"/><text x="330" y="104" font-size="11">2 take payment ✓</text>
<line x1="95" y1="145" x2="558" y2="145" style="stroke: var(--dg-bad)" stroke-width="1.5" marker-end="url(#ahp12-bad)"/><text x="480" y="139" font-size="11" style="fill: var(--dg-bad)">3 reserve stock ✗</text>
<line x1="95" y1="190" x2="408" y2="190" style="stroke: var(--dg-bad)" stroke-width="1.5" stroke-dasharray="5 4" marker-end="url(#ahp12-bad)"/><text x="330" y="184" font-size="11" style="fill: var(--dg-bad)">4 refund (compensate)</text>
<line x1="95" y1="225" x2="258" y2="225" style="stroke: var(--dg-bad)" stroke-width="1.5" stroke-dasharray="5 4" marker-end="url(#ahp12-bad)"/><text x="178" y="219" font-size="11" style="fill: var(--dg-bad)">5 cancel order</text>
<rect x="290" y="240" width="300" height="34" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/><text x="440" y="261" font-size="11">What if step 4 fails? Retry, alert, or a human.</text>
</g>
</svg>`
        }
      ]
    },
    {
      id: "asynchronous-sagas",
      title: "The four asynchronous sagas",
      kicker: "Callers move on",
      blocks: [
        {
          type: "text",
          html: `<p>Asynchronous communication improves responsiveness and scale, because nobody waits on a slow participant. It interacts badly with atomicity, though. If the operation must be all-or-nothing but messages are in flight concurrently, something has to track every pending order, every step's outcome, and the order in which successes and failures arrive.</p>`
        },
        {
          type: "compare",
          items: [
            { title: "Fantasy Fiction Saga (async, atomic, orchestrated)", tone: "warn", html: `<p>An orchestrator sends asynchronous requests but still promises atomicity. It must track many in-flight transactions at once, handle replies arriving out of order, and compensate across them. The customer may see an order confirmed and then rolled back. The name hints at the book's view: the promise is harder to keep than it sounds, and it's usually a sign to relax atomicity.</p>` },
            { title: "Horror Story Saga (async, atomic, choreographed)", tone: "bad", html: `<p>Atomicity with asynchronous events and no coordinator. Every service must keep track of pending work and react to failures from any other service, possibly out of order, to undo its own part. Complexity explodes. It usually arrives by accident: a team adopts events and choreography for scale, but the business still expects monolith-style all-or-nothing behaviour.</p>` },
            { title: "Parallel Saga (async, eventual, orchestrated)", tone: "ok", html: `<p>An orchestrator sends asynchronous requests, independent steps run in parallel, and each commits locally. The orchestrator still owns error handling and status, so "where is my order?" has one answer. Responsive, scalable and manageable; a strong default for complex workflows at scale.</p>` },
            { title: "Anthology Saga (async, eventual, choreographed)", tone: "warn", html: `<p>Events, local commits, no coordinator: the loosest coupling and the best scalability of all eight. Also the hardest to follow: the workflow exists only as a set of event handlers in different services. Ideal for simple, linear, high-volume flows with rare errors; painful for complex ones.</p>` }
          ]
        },
        {
          type: "lab",
          id: "sagaExplorer",
          caption: "Flip one dimension at a time and watch the ratings move. Then try the stock failure in Epic, Fairy Tale and Horror Story."
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>Notice which dimension moves complexity the most: <strong>atomic consistency</strong>. Switching from atomic to eventual simplifies every saga shape. That's why the first question to ask the business about any cross-service workflow is whether it truly needs to be all-or-nothing.</p>`
        }
      ]
    },
    {
      id: "compensation-problems",
      title: "Why compensation is weaker than it looks",
      kicker: "The catch",
      blocks: [
        {
          type: "text",
          html: `<p>Compensating transactions are the standard way to make a saga look atomic: if step 3 fails, run "undo step 2" and "undo step 1". The book points out several ways that's weaker than a real rollback:</p>`
        },
        {
          type: "keypoints",
          items: [
            `<strong>No isolation.</strong> Between the original step and its compensation, other transactions can see and act on the intermediate state. Analytics counted the sale; a loyalty service awarded points; a picker started gathering items.`,
            `<strong>Side effects can't be undone.</strong> An email that says "your order is confirmed" can't be unsent. A refund is a new transaction, not an erasure: the customer sees a charge and a refund on their statement.`,
            `<strong>Compensations can fail.</strong> The refund call times out. Now you need retries, idempotency and eventually a human, or the system is left inconsistent anyway.`,
            `<strong>Compensation logic is real business logic.</strong> "Refund a partially picked order with a substitution and a promotion" is not mechanical. Every step needs a designed inverse, tested as thoroughly as the forward path.`
          ]
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Teams often design the happy path carefully and treat compensation as a detail. In production, the compensation paths run exactly when things are already going wrong: under load, with partial outages. They need the most testing, not the least.</p>`
        }
      ]
    },
    {
      id: "state-machines",
      title: "The alternative: manage the saga as a state machine",
      kicker: "What the book recommends",
      blocks: [
        {
          type: "idea",
          html: `<p>Instead of pretending the operation is atomic and unwinding on failure, make its lifecycle explicit. Model the order as a <strong>state machine</strong> with states the business understands, including failure states, and design what happens from each one. A failure moves the order into a state such as <code>NO_STOCK</code> or <code>PAYMENT_FAILED</code> that support staff, the customer and other services can see and act on.</p>`
        },
        {
          type: "diagram",
          title: "Basket's order as a state machine",
          caption: "Happy path along the top. Failures move the order into named states with defined next actions rather than unwinding. A paid order with missing stock offers a substitution or a partial refund instead of cancelling everything.",
          svg: `<svg viewBox="0 0 660 250" role="img" aria-label="Order state machine with failure states">
<defs><marker id="ahp12-sm" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<g font-size="11" text-anchor="middle">
<rect x="10" y="30" width="90" height="34" rx="17" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/><text x="55" y="51">PLACED</text>
<rect x="140" y="30" width="90" height="34" rx="17" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/><text x="185" y="51">PAID</text>
<rect x="270" y="30" width="100" height="34" rx="17" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/><text x="320" y="51">RESERVED</text>
<rect x="410" y="30" width="100" height="34" rx="17" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/><text x="460" y="51">OUT FOR DELIV.</text>
<rect x="550" y="30" width="100" height="34" rx="17" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)"/><text x="600" y="51">DELIVERED</text>
<g style="stroke: var(--dg-muted)" stroke-width="1.5">
<line x1="100" y1="47" x2="138" y2="47" marker-end="url(#ahp12-sm)"/><line x1="230" y1="47" x2="268" y2="47" marker-end="url(#ahp12-sm)"/>
<line x1="370" y1="47" x2="408" y2="47" marker-end="url(#ahp12-sm)"/><line x1="510" y1="47" x2="548" y2="47" marker-end="url(#ahp12-sm)"/>
<line x1="55" y1="64" x2="55" y2="128" marker-end="url(#ahp12-sm)"/><line x1="185" y1="64" x2="250" y2="128" marker-end="url(#ahp12-sm)"/>
<line x1="460" y1="64" x2="500" y2="128" marker-end="url(#ahp12-sm)"/>
</g>
<rect x="5" y="130" width="110" height="34" rx="17" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)"/><text x="60" y="151">PAYMENT FAILED</text>
<rect x="200" y="130" width="110" height="34" rx="17" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/><text x="255" y="151">NO STOCK</text>
<rect x="445" y="130" width="120" height="34" rx="17" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/><text x="505" y="151">DELIVERY FAILED</text>
<text x="60" y="185" style="fill: var(--dg-muted)">retry card · cancel</text>
<text x="255" y="185" style="fill: var(--dg-muted)">substitute · partial refund</text>
<text x="255" y="200" style="fill: var(--dg-muted)">· cancel with refund</text>
<text x="505" y="185" style="fill: var(--dg-muted)">rebook slot · refund</text>
<text x="55" y="20" style="fill: var(--dg-muted)">payment declined ↓</text>
<text x="235" y="100" style="fill: var(--dg-muted)">stock short</text>
<text x="520" y="100" style="fill: var(--dg-muted)">nobody home</text>
</g>
</svg>`
        },
        {
          type: "code",
          title: "Transitions as data, not scattered ifs",
          lang: "csharp",
          code: `public enum OrderState { Placed, Paid, Reserved, OutForDelivery, Delivered,
                         PaymentFailed, NoStock, DeliveryFailed, Cancelled }

static readonly Dictionary<(OrderState, string), OrderState> Transitions = new()
{
    [(OrderState.Placed,   "PaymentTaken")]     = OrderState.Paid,
    [(OrderState.Placed,   "PaymentDeclined")]  = OrderState.PaymentFailed,
    [(OrderState.Paid,     "StockReserved")]    = OrderState.Reserved,
    [(OrderState.Paid,     "StockUnavailable")] = OrderState.NoStock,
    [(OrderState.NoStock,  "SubstituteAccepted")] = OrderState.Reserved,
    [(OrderState.NoStock,  "CustomerCancelled")]  = OrderState.Cancelled, // triggers refund
    [(OrderState.Reserved, "Dispatched")]       = OrderState.OutForDelivery,
    // ...
};`
        },
        {
          type: "tradeoffs",
          title: "State machine vs compensation",
          prosLabel: "State machine",
          consLabel: "Costs",
          pros: [
            `Honest about what happened; intermediate states are visible and actionable.`,
            `Failure handling matches business processes (substitute, rebook, partial refund).`,
            `Fewer compensations to build and test; no illusion of atomicity to maintain.`,
            `Works naturally with asynchronous, eventually consistent sagas.`
          ],
          cons: [
            `Users and support tools must understand more states.`,
            `Requires the business to define what each failure state means and who resolves it.`,
            `State must be stored and queryable, typically by an orchestrator or front controller.`
          ]
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>The book also suggests making saga participation visible in the code, for example by marking classes or endpoints that take part in a saga with an annotation or attribute naming the saga. Tooling can then list every service involved in "order placement" and flag changes that might affect it.</p>`
        }
      ]
    },
    {
      id: "choosing-a-saga",
      title: "Choosing a saga for Basket",
      kicker: "Putting it together",
      blocks: [
        {
          type: "table",
          headers: ["Workflow", "Needs", "Saga", "Why"],
          rows: [
            ["Checkout (payment, stock, slot)", "Responsive at peak, clear status, many failure modes", "Parallel", "Async for scale, eventual with order states, orchestrator for errors and status"],
            ["Nightly route planning pipeline", "High volume, linear, rare errors", "Anthology", "Each stage reacts to the previous one; no coordinator needed"],
            ["Staff refund approval", "Low volume, must be correct, easy to audit", "Fairy Tale", "Synchronous and readable; local commits with a clear owner"],
            ["Gift card purchase and activation", "Card must not activate without payment", "Fairy Tale with a pending state", "Activate only after payment confirms; no distributed rollback needed"]
          ]
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>A strong interview answer names the three dimensions, says which combination you'd pick and why, and explains failure handling with states rather than only compensation: "a Parallel Saga: async for responsiveness, eventual consistency with an explicit order state machine, and an orchestrator so support can see each order's state and retries happen in one place".</p>`
        },
        {
          type: "quiz",
          q: "A team adopted Kafka events and removed their orchestrator for scalability, but product still insists a failed delivery booking must leave no trace of the payment or stock reservation. Which saga have they built?",
          options: ["Anthology Saga", "Parallel Saga", "Horror Story Saga", "Fairy Tale Saga"],
          answer: 2,
          explain: `<p>Asynchronous communication, choreographed coordination and an atomic consistency requirement: the Horror Story Saga. The fix is usually to relax atomicity (explicit failure states and business-level resolution) or reintroduce an orchestrator.</p>`
        }
      ]
    }
  ],
  takeaways: [
    `A saga is a business transaction made of local transactions with a defined response to failure.`,
    `Communication × consistency × coordination gives eight sagas; the book names each (Epic, Phone Tag, Fairy Tale, Time Travel, Fantasy Fiction, Horror Story, Parallel, Anthology).`,
    `Atomic consistency is the biggest source of saga complexity; ask whether the business truly needs it.`,
    `Compensation lacks isolation, can't undo side effects, and can itself fail; design and test it as real business logic.`,
    `Prefer managing sagas as explicit state machines with business-meaningful failure states; Parallel Saga is a strong default for complex flows at scale.`
  ],
  furtherReading: [
    { title: "Sagas (Garcia-Molina, Salem, 1987)", url: "https://www.cs.cornell.edu/andru/cs711/2002fa/reading/sagas.pdf", note: "The original paper on long-lived transactions." },
    { title: "Saga pattern (microservices.io)", url: "https://microservices.io/patterns/data/saga.html", note: "Chris Richardson's overview of orchestrated and choreographed sagas." }
  ]
};
