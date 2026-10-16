// Deep dive: Chapter 2, Discerning coupling. Format: DeepDive in public/shared/notes.d.ts.
window.DEEP = window.DEEP || {};
DEEP.ch2 = {
  hook: `<p>Basket's first "microservices" project took eight months. Six services came out of the monolith, each in its own repository with its own pipeline. Then a column rename in the orders table broke four of them in production at once, and a slow stock query made checkout, storefront and delivery all time out together. The team had split the code, but not the coupling.</p>
<p>The book opens Part I by insisting on precise vocabulary for coupling, because "loosely coupled" means nothing until you say <em>coupled how</em>. It separates what a service needs to start (static coupling) from how it behaves while running (dynamic coupling), and defines the <strong>architecture quantum</strong> as the unit where operational characteristics such as scalability and availability actually live. This deep dive works through those ideas with Basket's services.</p>`,
  sections: [
    {
      id: "what-coupling-means",
      title: "Coupling, precisely",
      kicker: "Vocabulary first",
      blocks: [
        {
          type: "idea",
          html: `<p>Two parts of a system are <strong>coupled</strong> if a change in one might require a change in the other. That definition is deliberately neutral: some coupling is the point of the system (checkout must know prices), and some is accidental (checkout breaks when the reporting team renames a column). The architect's job is to know which is which and what each costs.</p>`
        },
        {
          type: "text",
          html: `<p>The book's key move is to split coupling into two questions that have different answers and different fixes:</p>
<ul><li><strong>Static coupling</strong>: what must exist for this piece of software to start and run? Its database, the libraries and frameworks it links, the message broker it connects to, the configuration service it reads at boot, the operating system and container image. You can find it by reading build files and deployment manifests.</li>
<li><strong>Dynamic coupling</strong>: what happens at runtime when it talks to other pieces? Does it wait for an answer? Must the combined work be all-or-nothing? Who decides what happens next? You find it by watching traffic and traces.</li></ul>
<p>Basket's failed migration had low-looking dynamic coupling on the whiteboard (clean service boxes) but very high static coupling (one database), plus synchronous calls everywhere, which is high dynamic coupling. Both bit them.</p>`
        },
        {
          type: "compare",
          items: [
            { title: "Static coupling", tone: "info", html: `<p><strong>Question:</strong> what does it need to boot?</p><p><strong>Examples:</strong> shared database, shared library version, broker, config store.</p><p><strong>Hurts:</strong> independent deployment and change.</p>` },
            { title: "Dynamic coupling", tone: "warn", html: `<p><strong>Question:</strong> how does it interact while running?</p><p><strong>Examples:</strong> synchronous call chains, distributed transactions, a central orchestrator.</p><p><strong>Hurts:</strong> availability, latency, scalability.</p>` }
          ]
        }
      ]
    },
    {
      id: "architecture-quantum",
      title: "The architecture quantum",
      kicker: "The unit of independence",
      blocks: [
        {
          type: "text",
          html: `<p>The book defines an <strong>architecture quantum</strong> as an independently deployable artifact with high functional cohesion, high static coupling and synchronous dynamic coupling. Unpacked, that means three properties:</p>`
        },
        {
          type: "steps",
          items: [
            `<strong>Independently deployable.</strong> You can release it without releasing anything else. Anything it can't run without (its database, typically) is part of the quantum. Shared databases therefore merge the services that share them into one quantum.`,
            `<strong>High functional cohesion.</strong> It does something meaningful in the domain, like a bounded context in domain-driven design, rather than a technical layer. A deployable full of unrelated features is independent but not cohesive.`,
            `<strong>Synchronous dynamic coupling inside.</strong> Within a quantum, parts communicate synchronously and share operational characteristics. Between quanta, synchronous calls temporarily entangle them; asynchronous messaging keeps them apart.`
          ]
        },
        {
          type: "diagram",
          title: "Counting quanta in three Basket layouts",
          caption: "Left: services sharing one database are one quantum, however many processes they run. Middle: a service-based layout with a shared database is still one quantum. Right: services with their own databases are separate quanta, so each can set its own scale and availability.",
          svg: `<svg viewBox="0 0 660 250" role="img" aria-label="Three layouts and their architecture quanta">
<g font-size="12" text-anchor="middle">
<text x="110" y="20" font-weight="700">Microservices, shared DB</text>
<rect x="15" y="32" width="190" height="200" rx="12" style="fill: var(--dg-5-soft); stroke: var(--dg-5)" stroke-width="2" stroke-dasharray="6 4"/>
<rect x="30" y="50" width="70" height="30" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="65" y="70">Checkout</text>
<rect x="120" y="50" width="70" height="30" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="155" y="70">Payment</text>
<rect x="30" y="100" width="70" height="30" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="65" y="120">Stock</text>
<rect x="120" y="100" width="70" height="30" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="155" y="120">Delivery</text>
<rect x="55" y="170" width="110" height="34" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/><text x="110" y="192">one database</text>
<text x="110" y="224" style="fill: var(--dg-muted)">1 quantum</text>
<text x="330" y="20" font-weight="700">Service-based, shared DB</text>
<rect x="235" y="32" width="190" height="200" rx="12" style="fill: var(--dg-5-soft); stroke: var(--dg-5)" stroke-width="2" stroke-dasharray="6 4"/>
<rect x="250" y="55" width="160" height="30" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="330" y="75">Ordering service</text>
<rect x="250" y="100" width="160" height="30" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="330" y="120">Fulfilment service</text>
<rect x="275" y="170" width="110" height="34" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/><text x="330" y="192">one database</text>
<text x="330" y="224" style="fill: var(--dg-muted)">1 quantum</text>
<text x="550" y="20" font-weight="700">Database per service</text>
<rect x="455" y="32" width="90" height="85" rx="10" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2" stroke-dasharray="6 4"/>
<rect x="465" y="44" width="70" height="28" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="500" y="63">Checkout</text>
<rect x="475" y="82" width="50" height="24" rx="5" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/><text x="500" y="99">DB</text>
<rect x="555" y="32" width="90" height="85" rx="10" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2" stroke-dasharray="6 4"/>
<rect x="565" y="44" width="70" height="28" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="600" y="63">Payment</text>
<rect x="575" y="82" width="50" height="24" rx="5" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/><text x="600" y="99">DB</text>
<rect x="455" y="127" width="90" height="85" rx="10" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="2" stroke-dasharray="6 4"/>
<rect x="465" y="139" width="70" height="28" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="500" y="158">Stock</text>
<rect x="475" y="177" width="50" height="24" rx="5" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/><text x="500" y="194">DB</text>
<rect x="555" y="127" width="90" height="85" rx="10" style="fill: var(--dg-6-soft); stroke: var(--dg-6)" stroke-width="2" stroke-dasharray="6 4"/>
<rect x="565" y="139" width="70" height="28" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="600" y="158">Delivery</text>
<rect x="575" y="177" width="50" height="24" rx="5" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/><text x="600" y="194">DB</text>
<text x="550" y="232" style="fill: var(--dg-muted)">4 quanta</text>
</g>
</svg>`
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>Why care about the count? Because operational characteristics (how much it scales, how available it must be, how elastic) can only differ <em>between</em> quanta. If checkout needs to absorb a 10× spike at 6 am but reporting doesn't, and they're one quantum, you're scaling reporting too, along with the database both depend on.</p>`
        },
        {
          type: "text",
          html: `<p>The user interface can also bind quanta together. If every service's screens are compiled into one front-end that must be redeployed when any of them changes, the UI is a piece of static coupling across all of them. Micro-frontends, where each domain ships its own UI fragments, extend quantum boundaries up to the screen.</p>`
        }
      ]
    },
    {
      id: "sync-entanglement",
      title: "How synchronous calls entangle quanta",
      kicker: "Dynamic coupling at work",
      blocks: [
        {
          type: "problem",
          html: `<p>Basket gave each service its own database: four quanta on paper. But storefront calls checkout, which calls payment and stock, all synchronously. During a stock database incident, storefront requests pile up waiting for checkout, which is waiting for stock. Four quanta, one outage.</p>`
        },
        {
          type: "idea",
          html: `<p>A synchronous call makes the caller's operational characteristics depend on the callee's <em>for as long as the call is outstanding</em>. Latency adds up along the chain, availability multiplies down it, and the caller can only scale as far as its slowest synchronous dependency lets it. The book describes the quanta as temporarily entangled. Asynchronous messaging removes the entanglement: the caller hands off the work and carries on, and the callee can be slow or down without blocking it.</p>`
        },
        {
          type: "code",
          title: "Availability multiplies along a synchronous chain",
          lang: "text",
          code: `each service 99.9%, each database 99.95%

storefront alone                          99.9% x 99.95%            = 99.85%
storefront -> checkout                    99.9%^2 x 99.95%^2       = 99.70%
storefront -> checkout -> payment, stock  99.9%^4 x 99.95%^4       = 99.40%
                                          ~ 4.3 hours down / month

make checkout -> payment async            99.9%^3 x 99.95%^3       = 99.55%`
        },
        {
          type: "lab",
          id: "quantumFinder",
          caption: "Start with a database per service, then switch calls between sync and async and watch the entangled groups and Storefront's availability."
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p>Asynchrony isn't free. If checkout no longer waits for payment, an order can exist in a "payment pending" state, the UI has to say so, and something must handle a payment that never confirms. You've traded availability coupling for workflow complexity. Chapters 11 and 12 are about paying that bill well.</p>`
        }
      ]
    },
    {
      id: "three-dimensions",
      title: "Three dimensions of dynamic coupling",
      kicker: "Setting up the sagas",
      blocks: [
        {
          type: "text",
          html: `<p>The book breaks dynamic coupling into three independent choices, each a spectrum from tighter to looser:</p>`
        },
        {
          type: "table",
          headers: ["Dimension", "Choice", "Tighter end", "Looser end"],
          rows: [
            ["Communication", "Does the caller wait?", "Synchronous (request-response)", "Asynchronous (messages, events)"],
            ["Consistency", "Must the workflow be all-or-nothing?", "Atomic (as if one transaction)", "Eventual (each step commits; converge later)"],
            ["Coordination", "Who directs the steps?", "Orchestrated (a coordinator)", "Choreographed (services react to events)"]
          ]
        },
        {
          type: "diagram",
          title: "Eight combinations at the corners of a cube",
          caption: "Each corner is one combination of the three choices; the book names each one as a saga pattern (Chapter 12). The corner nearest the viewer (sync, atomic, orchestrated) is the most tightly coupled; the far corner (async, eventual, choreographed) the loosest.",
          svg: `<svg viewBox="0 0 560 300" role="img" aria-label="Cube of eight dynamic coupling combinations">
<g style="stroke: var(--dg-line)" stroke-width="1.5" fill="none">
<polygon points="120,110 320,110 320,270 120,270"/>
<polygon points="220,40 420,40 420,200 220,200" stroke-dasharray="5 4"/>
<line x1="120" y1="110" x2="220" y2="40"/><line x1="320" y1="110" x2="420" y2="40"/>
<line x1="320" y1="270" x2="420" y2="200"/><line x1="120" y1="270" x2="220" y2="200" stroke-dasharray="5 4"/>
</g>
<g font-size="11" text-anchor="middle">
<circle cx="120" cy="270" r="6" style="fill: var(--dg-bad)"/><text x="120" y="292">sync·atomic·orch</text>
<circle cx="320" cy="270" r="6" style="fill: var(--dg-3)"/><text x="330" y="292">async·atomic·orch</text>
<circle cx="120" cy="110" r="6" style="fill: var(--dg-3)"/><text x="70" y="104">sync·eventual·orch</text>
<circle cx="320" cy="110" r="6" style="fill: var(--dg-2)"/><text x="350" y="128">async·eventual·orch</text>
<circle cx="220" cy="200" r="6" style="fill: var(--dg-3)"/><text x="190" y="190">sync·atomic·chor</text>
<circle cx="420" cy="200" r="6" style="fill: var(--dg-bad)"/><text x="490" y="204">async·atomic·chor</text>
<circle cx="220" cy="40" r="6" style="fill: var(--dg-2)"/><text x="220" y="28">sync·eventual·chor</text>
<circle cx="420" cy="40" r="6" style="fill: var(--dg-ok)"/><text x="480" y="36">async·eventual·chor</text>
</g>
<g font-size="12" style="fill: var(--dg-muted)">
<text x="220" y="140" text-anchor="middle">→ async</text>
<text x="70" y="200" text-anchor="middle">↑ eventual</text>
<text x="380" y="145">↗ choreographed</text>
</g>
</svg>`
        },
        {
          type: "text",
          html: `<p>The dimensions are independent choices but not independent in effect. Asynchronous communication combined with atomic consistency and no coordinator is far harder to build than any of those choices alone, because every service has to track in-flight work and react to failures that arrive out of order. That's why the book treats them as an entangled set and analyses all eight combinations rather than each choice in isolation.</p>`
        },
        {
          type: "quiz",
          q: "Basket's checkout, payment and stock services each have their own database, but checkout calls the other two synchronously on every order. Which statement is most accurate?",
          options: ["They are one architecture quantum because they call each other", "They are three quanta, but during each order their availability and latency are entangled", "They are three quanta and fully independent at runtime", "They are one quantum until they move to separate servers"],
          answer: 1,
          explain: `<p>Separate databases make them independently deployable, so three quanta statically. The synchronous calls entangle their operational characteristics while each request is in flight: checkout's latency includes the others', and its availability is the product of all three.</p>`
        }
      ]
    }
  ],
  takeaways: [
    `Coupling means a change in one part may force a change in another. Ask what kind, and what it costs.`,
    `Static coupling (what's needed to boot) determines what deploys together; dynamic coupling (runtime interaction) determines how failures and latency spread.`,
    `An architecture quantum is independently deployable and functionally cohesive; a shared database merges services into one quantum.`,
    `Synchronous calls entangle quanta for the duration of the call: latency adds, availability multiplies.`,
    `Communication, consistency and coordination are three entangled dimensions with eight combinations, the basis of the saga catalogue.`
  ],
  furtherReading: [
    { title: "Domain-Driven Design (Eric Evans)", note: "Source of the bounded context idea that functional cohesion leans on." },
    { title: "Micro Frontends (martinfowler.com)", url: "https://martinfowler.com/articles/micro-frontends.html", note: "How to keep the UI from coupling independent services back together." },
    { title: "Building Evolutionary Architectures", note: "Where the architecture quantum concept was first introduced by some of the same authors." }
  ]
};
