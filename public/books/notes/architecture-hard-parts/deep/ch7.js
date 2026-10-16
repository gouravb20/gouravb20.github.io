// Deep dive: Chapter 7, Service granularity. Format: DeepDive in public/shared/notes.d.ts.
window.DEEP = window.DEEP || {};
DEEP.ch7 = {
  hook: `<p>Two Basket architects are arguing. One wants a single Notification service: it sends messages to customers, that's one job. The other wants three, email, SMS and push, because they use different providers, scale differently and fail differently. Both are right about something, and neither can win by appeal to "microservices should be small" or "don't over-split".</p>
<p>The book resolves arguments like this by naming the forces. <strong>Granularity disintegrators</strong> are reasons to break a service apart; <strong>granularity integrators</strong> are reasons to keep pieces together. You list which ones apply, judge their strength, and present the balance to the people who own the consequences. This deep dive goes through every force with Basket examples, then shows how to run the conversation.</p>`,
  sections: [
    {
      id: "size-is-an-outcome",
      title: "Size is an outcome, not a goal",
      kicker: "Reframing the question",
      blocks: [
        {
          type: "idea",
          html: `<p>"How big should a service be?" has no direct answer. What has an answer is "what forces act on this piece of functionality, and which way do they push?". Size falls out of that analysis. A service can be large and right, if everything inside it changes, scales and fails together; or small and wrong, if it can never be changed or deployed without its neighbours.</p>`
        },
        {
          type: "text",
          html: `<p>The book separates <strong>modularity</strong> (breaking a system into parts at all) from <strong>granularity</strong> (how big those parts are). Chapter 3 justified modularity. This chapter is about granularity, and it offers two simple measures to make size discussable: the number of <em>statements</em> in a service, and the number of <em>public operations</em> it exposes. Neither is a target; both make drift visible.</p>`
        },
        {
          type: "diagram",
          title: "The tug of war",
          caption: "Disintegrators pull functionality into separate services; integrators pull it back together. The right size is where they balance for this particular piece of functionality.",
          svg: `<svg viewBox="0 0 640 210" role="img" aria-label="Disintegrators versus integrators tug of war">
<line x1="40" y1="105" x2="600" y2="105" style="stroke: var(--dg-line)" stroke-width="4"/>
<circle cx="320" cy="105" r="16" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="320" y="70" text-anchor="middle" font-size="12" font-weight="700">service size</text>
<g font-size="12">
<text x="30" y="30" font-weight="700" style="fill: var(--dg-1)">← Integrators (keep together)</text>
<text x="30" y="140">Database transactions</text>
<text x="30" y="158">Workflow / chatty calls</text>
<text x="30" y="176">Shared domain code</text>
<text x="30" y="194">Data relationships</text>
<text x="610" y="30" text-anchor="end" font-weight="700" style="fill: var(--dg-5)">Disintegrators (split) →</text>
<text x="610" y="140" text-anchor="end">Scope and function</text>
<text x="610" y="158" text-anchor="end">Code volatility</text>
<text x="610" y="176" text-anchor="end">Scalability and throughput</text>
<text x="610" y="194" text-anchor="end">Fault tolerance · Security · Extensibility</text>
</g>
</svg>`
        }
      ]
    },
    {
      id: "disintegrators",
      title: "Granularity disintegrators",
      kicker: "Reasons to split",
      blocks: [
        {
          type: "text",
          html: `<p><strong>Service scope and function.</strong> The first question is cohesion: does the service do one thing in the domain, or several loosely related things? Size matters too, but cohesion matters more. Notification is cohesive (its one purpose is telling customers things); a service handling both payments and delivery slots isn't, and should be split regardless of size.</p>
<p><strong>Code volatility.</strong> When parts of a service change at very different rates, the slow-changing parts get retested and redeployed with every change to the fast ones. If Basket's push notification code changes weekly (new campaign formats) while email and SMS change twice a year, splitting push out stops email and SMS from riding a weekly release train for no reason.</p>
<p><strong>Scalability and throughput.</strong> When parts have very different load profiles, keeping them together means scaling everything for the busiest part. SMS might handle 50 messages a second most of the day and 5,000 a second when slots open; email barely moves.</p>`
        },
        {
          type: "text",
          html: `<p><strong>Fault tolerance.</strong> When one part fails more often, or depends on something unreliable, separating it keeps its failures away from the rest. If the SMS provider's client library occasionally exhausts memory and crashes the process, email shouldn't go down with it.</p>
<p><strong>Security.</strong> When part of a service handles more sensitive data or needs stricter access, separating it lets the strict controls apply only there. Basket's stored payment methods need tighter controls than the order history next to them.</p>
<p><strong>Extensibility.</strong> When a part is expected to keep growing new variants (a new payment method every quarter: card, wallet, buy-now-pay-later), separating it means adding a variant doesn't touch or retest the others.</p>`
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p>"It's too big" on its own is a weak reason. Ask <em>which</em> disintegrator the size is a symptom of. If you can't name one, a large but cohesive service that changes and scales as a unit is fine.</p>`
        }
      ]
    },
    {
      id: "integrators",
      title: "Granularity integrators",
      kicker: "Reasons to keep together",
      blocks: [
        {
          type: "text",
          html: `<p><strong>Database transactions.</strong> If two pieces of functionality must commit atomically, splitting them replaces a local ACID transaction with a distributed workflow: eventual consistency, compensation, intermediate states visible to users. This is usually the strongest integrator, and the right response is to ask the business directly whether atomicity is truly required.</p>
<p><strong>Workflow and choreography.</strong> If two pieces call each other constantly to complete a single request, splitting turns in-process calls into network hops. Each hop adds latency, a failure point and data that must be passed and kept consistent. If one user action needs five round trips between two services that are always used together, they want to be one service.</p>
<p><strong>Shared code.</strong> If pieces depend on the same non-trivial domain code, splitting them means sharing that code as a library or service (Chapter 8), and every change to it ripples to both. When the shared part is large and volatile, keeping them together may be cheaper.</p>
<p><strong>Data relationships.</strong> If the data used by two pieces is intertwined (each needs most of the other's tables), splitting the services means splitting the data, which means constant cross-service calls or copies to answer simple questions.</p>`
        },
        {
          type: "code",
          title: "The cost of splitting a chatty pair",
          lang: "text",
          code: `Before: checkout + promotions in one service
  1 request = 1 network hop (client -> checkout), ~5 ms of in-process calls

After: separate services, checkout calls promotions per cart line
  20-line cart = 20 calls x 4 ms           = 80 ms added latency
  availability = 99.9% x 99.9%             = 99.8%  (one more thing to fail)
  plus: retries, timeouts, partial failure handling, contract versioning

Mitigations: batch the call (1 hop), cache rules locally, or keep them together.`
        }
      ]
    },
    {
      id: "balancing",
      title: "Finding the balance",
      kicker: "Putting it together",
      blocks: [
        {
          type: "text",
          html: `<p>No force wins by default. A strong scalability disintegrator can lose to a strong transaction integrator; three weak disintegrators may not justify a split that turns one transaction into a saga. The lab lets you set each force for three Basket candidates and see where the balance falls.</p>`
        },
        {
          type: "lab",
          id: "granularityBalance",
          caption: "Try Orders + payment: strong disintegrators, but a strong transaction integrator too. Notice how the verdict tells you which question to ask."
        },
        {
          type: "table",
          title: "Three Basket decisions",
          headers: ["Candidate", "Strongest disintegrators", "Strongest integrators", "Outcome"],
          rows: [
            ["Notification: email / SMS / push", "Fault tolerance (SMS provider crashes), scalability (SMS bursts)", "Shared templating and preference code", "Split SMS out; keep email and push together"],
            ["Delivery slots: search / admin", "Scalability (6 am search spike), security (admin rights)", "Shared slot data", "Split search as a read-only service over replicated data"],
            ["Orders + payment", "Security (card data), extensibility (new methods)", "Transactions, chatty workflow", "Split, but only with an explicit order state machine accepted by the business"]
          ]
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>When asked "how would you decide whether to split this service?", list the disintegrators and integrators that apply, say which you think are strongest, and say what you'd ask the business to break the tie. That answer demonstrates the method, which matters more than the verdict.</p>`
        }
      ]
    },
    {
      id: "talking-to-the-business",
      title: "Turning forces into a business conversation",
      kicker: "Who decides",
      blocks: [
        {
          type: "problem",
          html: `<p>Engineers often settle granularity among themselves, then present the result. But the consequences, such as an order that can briefly exist without a confirmed payment, or a notification that arrives a few seconds later, land on the business. Hiding the trade-off doesn't remove it; it just means the business finds out from customers.</p>`
        },
        {
          type: "idea",
          html: `<p>Translate each force into a consequence a stakeholder can weigh, and let them choose what they would rather give up. "We can split payments out so card data is audited in one small place. The cost is that for a few seconds after checkout an order might show 'payment pending'. Is that acceptable?" That's a decision a product owner can make; "should we decompose the payment bounded context?" isn't.</p>`
        },
        {
          type: "compare",
          items: [
            { title: "Engineer framing", tone: "bad", html: `<p>"Should we split the order service for granularity reasons? It violates SRP and has high volatility."</p>` },
            { title: "Stakeholder framing", tone: "ok", html: `<p>"Splitting lets promotions ship weekly without touching checkout and halves the risk of a sale-day outage. It means a discount might appear on an order a few seconds after it's placed. Which matters more to you?"</p>` }
          ]
        },
        {
          type: "quiz",
          q: "Basket's slot search and slot administration share a service. Search needs 20× capacity at 6 am; admin is used by five staff. Both read the same slot tables, but only admin writes. What's the most balanced move?",
          options: ["Keep them together because they share data", "Split them and give each its own copy of the slot tables, both writable", "Split search into a read-only service over replicated slot data; admin keeps ownership", "Split admin into three smaller services"],
          answer: 2,
          explain: `<p>Scalability is a strong disintegrator for search; the shared data is an integrator, but since only admin writes, search can work from a read-only replica or cache (Chapter 10). Ownership stays in one place and search scales on its own.</p>`
        }
      ]
    }
  ],
  takeaways: [
    `Service size is the outcome of balancing forces; "micro" is not the goal.`,
    `Disintegrators: scope and function, code volatility, scalability, fault tolerance, security, extensibility.`,
    `Integrators: database transactions (usually strongest), chatty workflows, shared domain code, data relationships.`,
    `Name the specific disintegrator behind "it's too big"; if there isn't one, a large cohesive service is fine.`,
    `Present the balance to stakeholders as consequences they can weigh, and record the outcome in an ADR.`
  ],
  furtherReading: [
    { title: "Microservices granularity (Mark Richards, Software Architecture Monday)", note: "Short videos by one of the authors on granularity drivers." },
    { title: "Team Topologies (Skelton, Pais)", note: "How team cognitive load and ownership influence service boundaries." }
  ]
};
