// Deep dive: Chapter 1, When there are no best practices. Format: DeepDive in public/shared/notes.d.ts.
window.DEEP = window.DEEP || {};
DEEP.ch1 = {
  hook: `<p>Ask ten experienced engineers how to log from a .NET service and you'll get roughly the same answer. Ask them whether Basket's payment code should leave the checkout service and you'll get ten answers, each with a good argument behind it. The first question has a best practice because the context barely matters. The second doesn't, because the right answer depends on how much Basket values consistency over responsiveness, how big its audit scope is, and how its teams are organised.</p>
<p>Most of what makes distributed architecture hard lives in that second category. The book's starting point is that architects need a <em>method</em> for those questions, not more answers: a way to find the trade-offs, weigh them for the system in front of them, write the decision down and keep it true. This deep dive covers that toolkit and introduces the running example used throughout these notes.</p>`,
  sections: [
    {
      id: "two-kinds-of-hard",
      title: "Two kinds of \"hard\"",
      kicker: "The premise",
      blocks: [
        {
          type: "text",
          html: `<p>The title plays on two meanings. Some decisions are <strong>hard because they're difficult</strong>: several options are reasonable, each costs something, and nobody can prove which is right in advance. Others are <strong>hard because they're foundational</strong>, in the sense that hardware is "hard" and software is "soft": once built on, they're expensive to change. Service boundaries, data ownership and communication style are usually both.</p>
<p>That combination is what makes them dangerous. A difficult but cheap-to-reverse decision can be made quickly and fixed later. A foundational but obvious one just needs doing. A decision that's both difficult and foundational deserves deliberate analysis, because getting it wrong means living with it for years or paying for a migration.</p>`
        },
        {
          type: "compare",
          title: "Where architectural attention should go",
          items: [
            { title: "Easy and reversible", tone: "ok", html: `<p>Pick a JSON library, a test framework, a log format. Let the team decide and move on.</p>` },
            { title: "Easy but foundational", tone: "info", html: `<p>Use HTTPS everywhere; store money as decimal, not float. Obvious once said, expensive if missed. Write it down as a standard.</p>` },
            { title: "Hard but reversible", tone: "warn", html: `<p>Which cache eviction policy? Which queue product for a non-critical feature? Run an experiment and adjust.</p>` },
            { title: "Hard and foundational", tone: "bad", html: `<p>Split the database? Orchestrate or choreograph orders? Atomic or eventual payments? This is where trade-off analysis earns its keep.</p>` }
          ]
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>A common working definition of architecture, popularised by Martin Fowler and Ralph Johnson, is the set of decisions that are hard to change later. That's a useful filter in practice: if reversing a choice would take more than a sprint and involve more than one team, treat it as architecture, analyse it, and record it.</p>`
        }
      ]
    },
    {
      id: "why-no-best-practice",
      title: "Why there is no best practice",
      kicker: "The core argument",
      blocks: [
        {
          type: "problem",
          html: `<p>Engineers love a rule: "always use a database per service", "never share code between services", "events are better than calls". Each rule is a best practice somewhere. Applied everywhere, each one causes harm somewhere else: a database per service where two services really need a shared transaction; duplicated pricing rules that drift apart; events where the user needs an immediate answer.</p>`
        },
        {
          type: "idea",
          html: `<p>A practice is "best" only relative to the qualities you're optimising for, and in distributed systems those qualities pull against each other. Consistency trades against availability; independence trades against reuse; responsiveness trades against simplicity. Since every system weights them differently, the reusable thing isn't the answer but the <strong>analysis</strong>: find which qualities are in tension, decide which matter more here, and pick the <em>least worst</em> combination.</p>`
        },
        {
          type: "text",
          html: `<p>"Least worst" sounds pessimistic, but it's the honest framing. Every option for a hard decision has downsides; an analysis that lists only upsides hasn't been finished. The goal is a choice whose downsides the business has seen and accepted, rather than a choice whose downsides arrive as surprises.</p>
<p>This also changes the architect's role. Instead of the person with the answers, the architect becomes the person who makes trade-offs visible: "if we split payment out, card data leaves the main audit scope and payment can deploy independently, but checkout gains a network call that can fail, and an order can briefly exist without a confirmed payment. Which of those matters more to you?"</p>`
        },
        {
          type: "lab",
          id: "tradeoffMatrix",
          caption: "Change the weights for the payment decision: the ratings never change, only what you value, and the winner moves."
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>A common failure is to copy a well-known company's architecture. Their choices were the least worst for <em>their</em> scale, team count and failure costs. A grocery startup with three teams copying an architecture built for thousands of engineers inherits the costs without the reasons.</p>`
        }
      ]
    },
    {
      id: "adrs",
      title: "Architecture decision records",
      kicker: "Writing it down",
      blocks: [
        {
          type: "text",
          html: `<p>A trade-off analysis that lives in a meeting room or a chat thread is lost within months. An <strong>architecture decision record</strong> (ADR) is a short document, one per significant decision, kept with the code or in a shared repository. The format, originally from Michael Nygard, is deliberately small: enough to capture the reasoning without becoming a design document.</p>`
        },
        {
          type: "code",
          title: "An ADR for Basket",
          lang: "markdown",
          code: `# ADR-014: Move payment processing out of the checkout service

Status: Accepted (2026-03-02)

Context
  Card data handling puts the whole checkout codebase in PCI audit scope.
  Payment provider changes ship monthly; checkout releases need a freeze.
  Options: keep in checkout; separate service, sync call; separate
  service with async confirmation and explicit order states.

Decision
  Separate payment service with its own database. Checkout calls it
  asynchronously; orders move PLACED -> PAID or PAYMENT_FAILED.
  Chosen because audit scope and independent releases outweigh the
  added complexity of a pending state.

Consequences
  + Audit scope shrinks to one small service.
  + Payment provider changes deploy without a checkout freeze.
  - Orders can briefly exist unpaid; UI and support must show it.
  - New failure mode: payment confirmation lost or delayed.

Compliance
  Build fails if any module outside basket.payment references the
  payment schema (dependency rule in CI). Alert if an order stays
  PLACED for more than 10 minutes.`
        },
        {
          type: "keypoints",
          title: "What makes ADRs useful",
          items: [
            `<strong>Context before decision.</strong> The forces and options matter more than the outcome: they tell a future reader whether the decision still applies.`,
            `<strong>Consequences in both directions.</strong> Listing the downsides is what makes it a trade-off record rather than a sales pitch.`,
            `<strong>Immutable, superseded rather than edited.</strong> When the decision changes, write ADR-031 that supersedes ADR-014, so the history is preserved.`,
            `<strong>Compliance.</strong> The book's addition: how the decision will be checked, which leads straight to fitness functions.`
          ]
        }
      ]
    },
    {
      id: "fitness-functions",
      title: "Fitness functions: keeping decisions true",
      kicker: "Governance",
      blocks: [
        {
          type: "problem",
          html: `<p>Six months after ADR-014, a developer in a hurry adds a report that joins orders with the payment table directly, because the connection string was right there. Nothing fails. The service boundary that justified the whole decision is quietly gone, and nobody notices until the next audit.</p>`
        },
        {
          type: "idea",
          html: `<p>An <strong>architecture fitness function</strong> is any mechanism that objectively checks an architectural characteristic: a test, a metric, a monitor, a chaos experiment. The term comes from evolutionary computing, where a fitness function measures how close a candidate is to the goal. Here it measures whether the architecture still has the properties you decided it should.</p>`
        },
        {
          type: "code",
          title: "A boundary rule as a unit test (C#, NetArchTest)",
          lang: "csharp",
          code: `[Fact]
public void Only_payment_may_reference_the_payment_persistence_layer()
{
    var result = Types.InAssemblies(AllBasketAssemblies)
        .That().DoNotResideInNamespace("Basket.Payment")
        .ShouldNot().HaveDependencyOn("Basket.Payment.Persistence")
        .GetResult();

    Assert.True(result.IsSuccessful, string.Join(", ", result.FailingTypeNames ?? []));
}`
        },
        {
          type: "table",
          title: "Two axes for classifying fitness functions",
          headers: ["", "Triggered (on an event)", "Continuous (always running)"],
          rows: [
            ["Atomic (one characteristic)", "Dependency rule in CI", "p99 latency alert on checkout"],
            ["Holistic (combined)", "Load test with caches disabled before release", "Chaos experiment killing payment nodes in production"]
          ],
          note: "Holistic checks matter because characteristics interact: adding encryption (security) can break a latency budget (performance) while both atomic checks pass."
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>Start small: one dependency rule per important boundary and one production metric per critical characteristic. A handful of fitness functions that always run beats a governance document nobody reads.</p>`
        }
      ]
    },
    {
      id: "data-and-basket",
      title: "Data at the centre, and the running example",
      kicker: "Setting the scene",
      blocks: [
        {
          type: "text",
          html: `<p>The book stresses that data is usually what makes these decisions hard. Code can be redeployed in minutes; data persists, accumulates and carries relationships that the code depends on in ways nobody fully remembers. It distinguishes two kinds:</p>
<ul><li><strong>Operational data</strong> (OLTP) runs the business: orders placed, stock decremented, payments captured. It needs correctness per transaction and fast writes.</li>
<li><strong>Analytical data</strong> (OLAP) explains the business: which products sell on rainy Fridays, how long picking takes per warehouse. It's reshaped, aggregated, and can lag hours behind.</li></ul>
<p>Part I of the book is mostly about pulling operational data apart; Part II about putting it back together, with analytical data getting its own chapter at the end.</p>`
        },
        {
          type: "diagram",
          title: "Basket today: one application, one database",
          caption: "The invented running example. Every module runs in one deployable and shares one relational database, so a promotions bug can take checkout down and every release ships everything.",
          svg: `<svg viewBox="0 0 640 250" role="img" aria-label="Basket monolith with modules sharing one database">
<rect x="20" y="20" width="600" height="140" rx="12" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="320" y="44" text-anchor="middle" font-size="13" font-weight="700">basket-app (one deployable)</text>
<g font-size="12" text-anchor="middle">
<rect x="40" y="60" width="100" height="34" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="90" y="82">Catalogue</text>
<rect x="155" y="60" width="100" height="34" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="205" y="82">Cart</text>
<rect x="270" y="60" width="100" height="34" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="320" y="82">Checkout</text>
<rect x="385" y="60" width="100" height="34" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="435" y="82">Payment</text>
<rect x="500" y="60" width="100" height="34" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="550" y="82">Promotions</text>
<rect x="40" y="106" width="100" height="34" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="90" y="128">Stock</text>
<rect x="155" y="106" width="100" height="34" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="205" y="128">Picking</text>
<rect x="270" y="106" width="100" height="34" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="320" y="128">Delivery</text>
<rect x="385" y="106" width="100" height="34" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="435" y="128">Notify</text>
<rect x="500" y="106" width="100" height="34" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="550" y="128">Reporting</text>
</g>
<line x1="320" y1="160" x2="320" y2="190" stroke-width="2" style="stroke: var(--dg-muted)"/>
<ellipse cx="320" cy="200" rx="110" ry="12" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="1.5"/>
<rect x="210" y="200" width="220" height="30" style="fill: var(--dg-3-soft); stroke: none"/>
<line x1="210" y1="200" x2="210" y2="230" style="stroke: var(--dg-3)" stroke-width="1.5"/><line x1="430" y1="200" x2="430" y2="230" style="stroke: var(--dg-3)" stroke-width="1.5"/>
<ellipse cx="320" cy="230" rx="110" ry="12" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="1.5"/>
<text x="320" y="221" text-anchor="middle" font-size="12" font-weight="700">one relational DB, ~400 tables</text>
</svg>`
        },
        {
          type: "realworld",
          title: "Why the examples are invented",
          items: [
            { org: "The book", html: `<p>The authors follow a fictional company through its migration, with dialogue between architects and stakeholders illustrating each decision. These notes deliberately use a different example, Basket, so the explanations stand on their own; read the book for the authors' story.</p>` },
            { org: "Basket", html: `<p>An online grocer with web and mobile ordering, timed delivery slots, regional warehouses and a driver fleet. Its pains are typical: slow releases, a holiday-weekend outage caused by an unrelated module, and a 6 am slot-release rush the whole application must scale for.</p>` }
          ]
        },
        {
          type: "quiz",
          q: "Which of these decisions most deserves a full trade-off analysis and an ADR?",
          options: ["Switching the JSON serializer used in the cart module", "Whether payment and order data live in the same database", "Renaming the Promotions module to Offers", "Adding a linter rule for unused variables"],
          answer: 1,
          explain: `<p>Data ownership is both difficult (reasonable people disagree, every option costs something) and foundational (expensive to reverse, affects several teams). The others are reversible design choices.</p>`
        }
      ]
    }
  ],
  takeaways: [
    `"Hard" means both difficult and foundational; give deliberate analysis to decisions that are both.`,
    `A practice is only best relative to the qualities you optimise for, and those pull against each other in distributed systems. Look for the least worst combination.`,
    `Record significant decisions as ADRs: context, decision, consequences in both directions, and how compliance will be checked.`,
    `Fitness functions (dependency rules, metrics, chaos tests) turn decisions into checks that fail loudly when the architecture drifts.`,
    `Data, operational and analytical, is what makes most of these decisions hard; the rest of the book is about splitting it and reconnecting it.`
  ],
  furtherReading: [
    { title: "Michael Nygard: Documenting Architecture Decisions", url: "https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions", note: "The original short post that introduced the ADR format." },
    { title: "Building Evolutionary Architectures (Ford, Parsons, Kua, Sadalage)", note: "The book that develops fitness functions in depth." },
    { title: "NetArchTest", url: "https://github.com/BenMorris/NetArchTest", note: "Architecture rules as unit tests for .NET; ArchUnit is the Java equivalent." }
  ]
};
