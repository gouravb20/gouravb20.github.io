// Software Architecture: The Hard Parts - part 3 data: workflows, sagas, contracts, analytical data, trade-off analysis (chapters 11-15)
window.DATA.chapters.push(
  // ------------------------------------------------------------------
  {
    id: `ch11`, part: 3, number: 11,
    title: `Managing distributed workflows`,
    overview: `A Basket order touches cart, payment, stock, picking, delivery and notifications. In the monolith that was one method; now it's a workflow across services. There are two ways to run it. With <strong>orchestration</strong>, a coordinator service tells each participant what to do and tracks where the workflow is. With <strong>choreography</strong>, each service does its part and publishes an event that triggers the next. Orchestration is easier to reason about, recover and change; choreography responds faster, scales better and couples services less. The chapter also covers where workflow state lives under choreography, and the difference between coupling the domain needs and coupling the implementation adds.`,
    concepts: [
      { term: `Orchestration`, def: `A dedicated orchestrator (mediator) service holds the workflow definition: it calls each participant in turn, handles their responses and errors, and records the workflow's state.`, why: `Workflow logic, error handling and state live in one place, which makes complex flows with many failure paths manageable.`, demo: `workflowSim` },
      { term: `Choreography`, def: `No coordinator. Each service listens for events, does its step and publishes an event for the next step. The workflow is the sum of these reactions.`, why: `Services are decoupled and the flow runs at the speed of events, but nobody owns the overall picture, which complicates error handling and status queries.`, demo: `workflowSim` },
      { term: `Orchestration trade-offs`, def: `Strengths: centralised workflow, error handling, recoverability (the orchestrator can retry or resume), and state management. Weaknesses: responsiveness (every step goes through it), fault tolerance (it's a critical dependency), scalability (it's a shared bottleneck) and coupling (it knows every participant).`, why: `Choose it when a workflow has many failure paths, needs clear status, or changes often.` },
      { term: `Choreography trade-offs`, def: `Strengths: responsiveness, scalability, fault tolerance and decoupling. Weaknesses: workflow logic spread across services, hard state management, hard error handling, and hard recoverability.`, why: `Choose it for simple, linear workflows with few errors and high throughput, where scale matters more than central control.` },
      { term: `Front controller`, def: `In choreography, make the first service in the workflow also responsible for tracking its state, so it can answer "where is my order?".`, why: `Gives one place to query status without a full orchestrator, but that service now carries workflow responsibilities beyond its domain.` },
      { term: `Stateless choreography`, def: `Don't store workflow state at all; when asked, query each participant and assemble the current status on the fly.`, why: `Keeps services simple and decoupled, but status queries become slow, fan-out calls that fail if any participant is down.` },
      { term: `Stamp coupling for workflow state`, def: `Carry the workflow's state inside the messages themselves, so each step sees what's happened so far.`, why: `No central store needed, but the message contract grows and every service is coupled to the full structure.` },
      { term: `Semantic vs implementation coupling`, def: `Semantic coupling is inherent in the domain: an order must be paid before it's picked, whatever the architecture. Implementation coupling is what the chosen design adds on top.`, why: `No architecture can remove semantic coupling. Good designs avoid adding much implementation coupling on top of it; a mismatch (a very complex workflow forced into choreography) makes the system harder than the domain requires.` },
      { term: `Workflow complexity`, def: `How many steps, branches and error conditions a workflow has.`, why: `The more error paths, the more orchestration pays off; choreography's error handling grows with every possible failure, each needing its own events and reactions.`, demo: `workflowSim` }
    ],
    labs: [`workflowSim`],
    cheatsheet: [
      { title: `Orchestration vs choreography`, type: `table`, headers: [``, `Orchestration`, `Choreography`], rows: [
        [`Workflow logic`, `In the orchestrator`, `Spread across services`],
        [`Error handling`, `Central, simpler`, `Distributed, harder`],
        [`State and status`, `Orchestrator knows`, `Front controller, query or stamp`],
        [`Responsiveness`, `Extra hops`, `Event speed`],
        [`Scalability`, `Orchestrator can bottleneck`, `Scales with services`],
        [`Fault tolerance`, `Orchestrator is critical`, `No single coordinator`],
        [`Coupling`, `Orchestrator knows everyone`, `Services know events only`]
      ] },
      { title: `Choreography state options`, type: `table`, headers: [`Option`, `How`, `Cost`], rows: [
        [`Front controller`, `First service tracks state`, `Extra responsibility in one service`],
        [`Stateless`, `Query all participants on demand`, `Slow, fragile status queries`],
        [`Stamp coupling`, `State carried in messages`, `Bigger, more coupled contracts`]
      ] }
    ],
    interview: [
      { q: `When would you choose orchestration over choreography?`, a: `When the workflow is complex, has many error paths or compensation steps, needs a clear status at any time, or changes often. The orchestrator centralises logic, error handling and state at the cost of an extra coupling point and potential bottleneck.`, diff: `easy` },
      { q: `How do you answer "what's the status of my order?" in a choreographed workflow?`, a: `Options: a front controller (first service tracks the state), stateless choreography (query every participant and assemble the answer) or stamp coupling (state travels with the messages, so the last service knows). Each trades responsibility, query cost or contract size.`, diff: `medium` },
      { q: `What is semantic coupling?`, a: `Coupling that comes from the domain itself, such as payment needing to happen before shipping. Architecture can't remove it; it can only avoid adding implementation coupling beyond it.`, diff: `medium` },
      { q: `Why does error handling get harder in choreography?`, a: `Each possible failure needs an event and a reaction in each affected service, and no component knows the whole flow. Compensation has to be orchestrated by events going backwards, and partial failures are hard to observe and recover.`, diff: `medium` },
      { q: `Can you mix the two?`, a: `Yes, and it's common: orchestrate the complex core of a workflow (payment, stock reservation) and let downstream, fire-and-forget steps (notifications, analytics) react to events. Choose per workflow, not per system.`, diff: `hard` }
    ]
  },
  // ------------------------------------------------------------------
  {
    id: `ch12`, part: 3, number: 12,
    title: `Transactional sagas`,
    overview: `A saga is a workflow that spans several services, each committing its own local transaction, with a plan for what happens when a later step fails. The book builds a catalogue of eight saga patterns from the three dynamic coupling dimensions: communication (sync or async), consistency (atomic or eventual) and coordination (orchestrated or choreographed). Each combination behaves differently on coupling, complexity, responsiveness and scale. The chapter then looks at the two ways to deal with failure, <strong>compensating</strong> already-completed steps or managing the workflow as a <strong>state machine</strong> that tolerates partial completion, and argues that the second is often the better fit for distributed systems.`,
    concepts: [
      { term: `Saga`, def: `A sequence of local transactions across services that together implement one business operation, with a defined response to failure at each step.`, why: `It's the distributed replacement for a database transaction. Its shape determines how much of ACID you try to recover and at what cost.`, demo: `sagaExplorer` },
      { term: `Epic Saga (sync, atomic, orchestrated)`, def: `An orchestrator calls each service synchronously and tries to make the whole operation atomic, compensating everything if one step fails.`, why: `Mimics the monolith's transaction, so it's familiar, but it's the most tightly coupled shape, with poor responsiveness and scale, and compensation that can itself fail.`, demo: `sagaExplorer` },
      { term: `Phone Tag Saga (sync, atomic, choreographed)`, def: `Like the Epic Saga without an orchestrator: services call each other in a chain, each passing the request on, and must coordinate compensation among themselves.`, why: `Slightly better scale on the happy path, but error handling becomes much harder because failures must be propagated back through the chain.`, demo: `sagaExplorer` },
      { term: `Fairy Tale Saga (sync, eventual, orchestrated)`, def: `An orchestrator calls services synchronously but each commits independently; the orchestrator manages the workflow and drives the system towards consistency.`, why: `A popular, pragmatic shape: easy to reason about, with no distributed atomicity. Responsiveness is still bounded by synchronous calls.`, demo: `sagaExplorer` },
      { term: `Time Travel Saga (sync, eventual, choreographed)`, def: `Services call each other synchronously in a chain, each committing locally, with no orchestrator.`, why: `Good for simple, high-throughput pipelines with few errors, like a chain of processing stages. Complex workflows quickly become hard to follow.`, demo: `sagaExplorer` },
      { term: `Fantasy Fiction Saga (async, atomic, orchestrated)`, def: `An orchestrator coordinates asynchronous messages while still trying to keep the whole operation atomic.`, why: `Asynchrony makes atomic coordination harder, not easier: the orchestrator must track many in-flight transactions and their ordering. Usually a sign the combination needs rethinking.`, demo: `sagaExplorer` },
      { term: `Horror Story Saga (async, atomic, choreographed)`, def: `Asynchronous messages, no coordinator, and a requirement that everything be atomic.`, why: `The worst combination: every service must track pending transactions and react to out-of-order failures from others. It emerges accidentally when teams adopt async and choreography but keep a monolith's atomicity expectations.`, demo: `sagaExplorer` },
      { term: `Parallel Saga (async, eventual, orchestrated)`, def: `An orchestrator sends asynchronous requests, steps can run in parallel, and each commits locally.`, why: `Combines good responsiveness and scale with a central place for error handling and status. A strong choice for complex workflows at scale.`, demo: `sagaExplorer` },
      { term: `Anthology Saga (async, eventual, choreographed)`, def: `Services react to asynchronous events, commit locally, with no orchestrator: the loosest combination.`, why: `Highest scale and decoupling, but complex workflows and error handling become very hard. Best for simple, linear, high-volume flows.`, demo: `sagaExplorer` },
      { term: `Compensating updates`, def: `When a later step fails, undo earlier steps by issuing reverse operations: refund the payment, release the stock.`, why: `Restores atomicity in appearance only. Other transactions may have seen the intermediate state, side effects (an email sent) can't be undone, and the compensation itself may fail.` },
      { term: `State machine instead of compensation`, def: `Model the operation's lifecycle as explicit states (<code>PLACED → PAID → PICKING → OUT_FOR_DELIVERY</code>, plus <code>PAYMENT_FAILED</code>, <code>NO_STOCK</code>) and handle failures by moving to a state the business understands rather than unwinding everything.`, why: `Usually more robust and more honest about what happened: "order placed, payment pending" is a valid state that users and support staff can see and act on.` }
    ],
    labs: [`sagaExplorer`],
    cheatsheet: [
      { title: `The eight sagas`, type: `table`, headers: [`Saga`, `Communication`, `Consistency`, `Coordination`], rows: [
        [`Epic`, `Sync`, `Atomic`, `Orchestrated`],
        [`Phone Tag`, `Sync`, `Atomic`, `Choreographed`],
        [`Fairy Tale`, `Sync`, `Eventual`, `Orchestrated`],
        [`Time Travel`, `Sync`, `Eventual`, `Choreographed`],
        [`Fantasy Fiction`, `Async`, `Atomic`, `Orchestrated`],
        [`Horror Story`, `Async`, `Atomic`, `Choreographed`],
        [`Parallel`, `Async`, `Eventual`, `Orchestrated`],
        [`Anthology`, `Async`, `Eventual`, `Choreographed`]
      ], note: `Names from the book. Atomic + async + choreographed is the combination to avoid.` },
      { title: `What each dimension costs`, type: `list`, items: [
        `Synchronous: lower responsiveness and availability; failures and latency propagate.`,
        `Atomic: more coordination, locking or compensation; the biggest source of complexity.`,
        `Orchestrated: a coordinator to build and scale, but simpler error handling and status.`,
        `Choreographed: better scale, harder error handling and status queries.`
      ] },
      { title: `Order saga as a state machine`, type: `code`, body: `PLACED ──pay ok──▶ PAID ──stock ok──▶ PICKING ──▶ OUT_FOR_DELIVERY ──▶ DELIVERED
   │                  │
   └─pay failed─▶ PAYMENT_FAILED (retry or cancel)
                      └─no stock─▶ NO_STOCK (substitute, partial refund or cancel)` }
    ],
    interview: [
      { q: `What is a saga and why do we need one?`, a: `A series of local transactions across services that together form one business operation, with defined failure handling. We need it because once data is split, a single ACID transaction can't span the services involved.`, diff: `easy` },
      { q: `Why is the Epic Saga often a poor choice?`, a: `It tries to reproduce a monolith transaction with synchronous calls, atomicity and an orchestrator: the tightest combination. Every service must be up for the operation to succeed, responsiveness is the sum of all calls, and compensation can fail, leaving the system inconsistent anyway.`, diff: `medium` },
      { q: `Why is the Horror Story Saga so hard?`, a: `It demands atomicity with asynchronous, choreographed communication. With no coordinator, each service must track in-flight transactions and handle out-of-order successes and failures from the others to undo work. Complexity explodes, which is why it's usually accidental.`, diff: `hard` },
      { q: `What's wrong with relying only on compensating transactions?`, a: `Intermediate states are visible to others before compensation runs, some side effects can't be undone, and compensation can fail and needs its own retries. A state machine that represents partial outcomes explicitly is often more robust.`, diff: `medium` },
      { q: `Which saga would you pick for a high-volume checkout?`, a: `Often a Parallel Saga: asynchronous for responsiveness and scale, eventual consistency to avoid distributed locking, and an orchestrator to keep error handling and order status manageable. If the flow were simple and linear, an Anthology Saga could work.`, diff: `hard` }
    ]
  },
  // ------------------------------------------------------------------
  {
    id: `ch13`, part: 3, number: 13,
    title: `Contracts`,
    overview: `A contract is whatever two parts of a system agree on to exchange information: an API's request and response shape, an event's payload, a schema. Contracts are a form of coupling, so their style matters. The book places them on a spectrum from <strong>strict</strong> (schemas, generated stubs, exact versions) to <strong>loose</strong> (name-value pairs that consumers pick fields from). It recommends <strong>consumer-driven contracts</strong> to keep loose contracts safe, and examines <strong>stamp coupling</strong>, passing a large structure when consumers need a few fields, which wastes bandwidth and couples consumers to fields they never use, but can also be a deliberate tool for carrying workflow state.`,
    concepts: [
      { term: `Contract`, def: `The format two parts of an architecture use to exchange information: API schemas, message formats, database tables used for integration, even method signatures inside a process.`, why: `Every contract couples its parties. The question is how much change each side can make without breaking the other.` },
      { term: `Strict contracts`, def: `Exact, schema-defined formats checked by tools: XML Schema, JSON Schema with validation, Protocol Buffers/gRPC, GraphQL schemas, RPC stubs.`, why: `Guaranteed fidelity, generated code, documentation and versioning come for free. The cost is tight coupling: any change to the schema can break consumers, so changes need versions.`, demo: `contractBreak` },
      { term: `Loose contracts`, def: `Flexible formats such as JSON or YAML name-value pairs, where consumers read the fields they need and ignore the rest.`, why: `Providers can add fields and evolve freely without breaking consumers. The cost is less build-time checking, so contract management moves to tests and fitness functions.`, demo: `contractBreak` },
      { term: `Strictness spectrum`, def: `Contracts range from strict (RPC with generated stubs) through schema-validated JSON to loose name-value pairs or plain maps.`, why: `The book's guidance: strict contracts inside a bounded context or quantum, where change is coordinated anyway; loose contracts between quanta, where independent evolution matters.` },
      { term: `Consumer-driven contracts`, def: `Each consumer writes tests describing the parts of the provider's contract it relies on; the provider runs all consumers' tests in its build (tools like Pact).`, why: `Combines loose coupling with safety: the provider can change anything no consumer depends on and finds out immediately if it breaks someone.`, demo: `contractBreak` },
      { term: `Versioning`, def: `Publishing new contract versions alongside old ones and deprecating old versions over time.`, why: `Needed constantly with strict contracts; less often with loose ones. Supporting many versions has a real cost, so keep the window short.` },
      { term: `Stamp coupling`, def: `Passing a large data structure to a service that uses only part of it, such as sending the whole customer profile when delivery needs only the address.`, why: `Couples consumers to fields they don't need (a change to the profile structure ripples to them) and wastes bandwidth, which adds up at high call volumes.` },
      { term: `Stamp coupling for workflow management`, def: `Deliberately passing a richer structure through a choreographed workflow so each step can see the state built by previous steps.`, why: `A legitimate use: it replaces a central state store. Do it knowingly and keep the structure stable.` }
    ],
    labs: [`contractBreak`],
    cheatsheet: [
      { title: `Strict vs loose`, type: `table`, headers: [``, `Strict`, `Loose`], rows: [
        [`Examples`, `gRPC, XML Schema, GraphQL schema`, `JSON name-value pairs, maps`],
        [`Checking`, `Build time, tools`, `Tests, fitness functions`],
        [`Evolution`, `Versioned changes`, `Add fields freely`],
        [`Coupling`, `High`, `Low`],
        [`Best for`, `Inside a quantum`, `Between quanta`]
      ] },
      { title: `Stamp coupling cost`, type: `code`, body: `bandwidth = calls/s × payload size
full customer profile: 500 calls/s × 40 KB = 20 MB/s
address only:          500 calls/s × 0.5 KB = 0.25 MB/s  (80× less)` }
    ],
    interview: [
      { q: `Strict or loose contracts between microservices?`, a: `Generally loose between quanta, so providers can evolve without coordinated releases, backed by consumer-driven contract tests. Strict contracts suit tightly coordinated parts, such as inside one quantum or for high-performance internal RPC where generated stubs pay off.`, diff: `medium` },
      { q: `What are consumer-driven contracts?`, a: `Consumers publish tests describing exactly what they rely on from a provider; the provider runs them all in its build. The provider can change anything not covered and learns immediately when a change would break a consumer.`, diff: `easy` },
      { q: `What is stamp coupling, and when is it acceptable?`, a: `Passing a large structure when the receiver uses only a small part, which couples it to unused fields and wastes bandwidth. It's acceptable, even useful, when the structure deliberately carries workflow state through a choreographed process.`, diff: `medium` },
      { q: `Why do strict contracts tend to need more versioning?`, a: `Consumers are bound to the exact schema, so almost any change, even adding a required field or renaming one, breaks them. The provider has to run old and new versions side by side until consumers migrate.`, diff: `easy` },
      { q: `How can you keep loose contracts from drifting into chaos?`, a: `Consumer-driven contract tests, schema registries with compatibility rules (e.g. only additive changes), documentation generated from examples, and fitness functions that detect undocumented field use.`, diff: `hard` }
    ]
  },
  // ------------------------------------------------------------------
  {
    id: `ch14`, part: 3, number: 14,
    title: `Managing analytical data`,
    overview: `Operational data runs Basket; analytical data helps it decide which stores to open, what to stock and how to price. Splitting operational data into many services makes the traditional approaches harder. The book reviews the <strong>data warehouse</strong> (extract, transform and load everything into one central, modelled store) and the <strong>data lake</strong> (load raw data centrally, transform when needed), then presents <strong>data mesh</strong>: domains own their analytical data and publish it as products, on a self-serve platform, under federated governance. The bridge between the two worlds is the <strong>data product quantum</strong>, a deployable analytical unit next to each operational service.`,
    concepts: [
      { term: `Data warehouse`, def: `A central store where data from operational systems is extracted, transformed into a common analytical model (often a star schema of facts and dimensions) and loaded (ETL) for reporting.`, why: `Consistent, curated data for reporting. Weaknesses: a central team becomes a bottleneck, transformations lose domain meaning, and every upstream schema change risks breaking the pipelines.` },
      { term: `Data lake`, def: `A central store of raw data in its original form; consumers transform it when they need it (ELT).`, why: `Fast to load and flexible, but without domain context and ownership it often becomes hard to discover, trust or interpret: the "data swamp".` },
      { term: `Data mesh`, def: `A sociotechnical approach in which analytical data is owned and served by the domains that produce it, with four principles: domain ownership, data as a product, self-serve data platform and federated computational governance.`, why: `It applies to analytical data the same decentralisation that microservices applied to operational systems, removing the central bottleneck.` },
      { term: `Domain ownership of data`, def: `The team that owns an operational domain also owns the analytical data derived from it, and is accountable for its quality.`, why: `The people who understand the data best keep its meaning intact, instead of a central team guessing from raw tables.` },
      { term: `Data as a product`, def: `Analytical data is published with the care of a product: discoverable, addressable, documented, trustworthy (with quality guarantees), interoperable and secure.`, why: `Consumers can find and use data without asking the producing team, which is what makes decentralisation workable.` },
      { term: `Self-serve data platform`, def: `Shared infrastructure and tooling that lets domain teams build, publish and run data products without being data engineering experts.`, why: `Without it, every domain reinvents pipelines and storage, and the mesh collapses under duplicated effort.` },
      { term: `Federated computational governance`, def: `Global rules (privacy, interoperability standards, quality metrics) agreed by domain and platform representatives and enforced automatically by the platform.`, why: `Keeps data products compatible and compliant without central approval for each one.` },
      { term: `Data product quantum (DPQ)`, def: `An independently deployable unit that serves a domain's analytical data, deployed alongside the operational service and owned by the same team, connected to it asynchronously and with eventual consistency.`, why: `Keeps the operational service's quantum independent of analytical workloads while giving analytics a clear, owned source.` },
      { term: `Kinds of data product`, def: `Source-aligned (the domain's own facts, like order events), aggregate (combining several sources, like customer 360) and fit-for-purpose (built for one use, like a demand forecasting feature set).`, why: `Distinguishing them clarifies ownership: source-aligned products belong to the producing domain, others to the team that needs them.` }
    ],
    labs: [],
    cheatsheet: [
      { title: `Warehouse vs lake vs mesh`, type: `table`, headers: [``, `Warehouse`, `Lake`, `Mesh`], rows: [
        [`Ownership`, `Central data team`, `Central platform`, `Domain teams`],
        [`Transform`, `Before load (ETL)`, `On read (ELT)`, `Inside each data product`],
        [`Model`, `One curated schema`, `Raw`, `Per product, interoperable`],
        [`Strength`, `Consistent reporting`, `Fast ingest, flexibility`, `Scales with domains`],
        [`Weakness`, `Bottleneck, brittle ETL`, `Swamp, lost meaning`, `Org change, platform cost`]
      ] },
      { title: `Data mesh principles`, type: `list`, items: [
        `Domain ownership: the producing team owns its analytical data.`,
        `Data as a product: discoverable, documented, trustworthy, interoperable, secure.`,
        `Self-serve platform: domains publish products without specialists.`,
        `Federated computational governance: shared rules, enforced automatically.`
      ] }
    ],
    interview: [
      { q: `What problems with data warehouses does data mesh address?`, a: `The central team as bottleneck, the loss of domain meaning in central transformations, and brittle pipelines that break whenever an upstream schema changes. Data mesh gives ownership to domains, which publish analytical data as products with stable contracts.`, diff: `medium` },
      { q: `What are the four principles of data mesh?`, a: `Domain ownership, data as a product, self-serve data platform, and federated computational governance.`, diff: `easy` },
      { q: `What is a data product quantum?`, a: `An independently deployable unit that serves a domain's analytical data, owned by the same team as the operational service and fed asynchronously from it. It keeps analytical workloads from coupling to the operational quantum.`, diff: `medium` },
      { q: `Why can a data lake turn into a swamp?`, a: `Raw data is loaded without ownership, documentation or quality guarantees. Over time nobody knows what tables mean, whether they're current or who to ask, so the data can't be trusted.`, diff: `easy` },
      { q: `When is data mesh overkill?`, a: `For a small organisation with a few domains and one capable data team, where the central model isn't a bottleneck. Data mesh requires platform investment and organisational change that only pay off at scale.`, diff: `hard` }
    ]
  },
  // ------------------------------------------------------------------
  {
    id: `ch15`, part: 3, number: 15,
    title: `Build your own trade-off analysis`,
    overview: `The book closes by turning its approach into a method you can apply to problems it never covers. Find the dimensions that are entangled in the decision, analyse how they're coupled, and assess trade-offs by asking what each option does to the qualities that matter. Along the way it offers practical techniques: separate qualitative from quantitative analysis, make comparison lists that are mutually exclusive and collectively exhaustive (MECE), beware of judging options out of context, model the relevant domain scenarios, present the bottom line rather than drowning people in evidence, and stay sceptical of evangelism, including your own.`,
    concepts: [
      { term: `Find entangled dimensions`, def: `Identify which parts of the architecture are coupled in this decision: services, data, communication, operational characteristics. Static and dynamic coupling analysis from Chapter 2 is the tool.`, why: `Trade-offs only exist between things that are entangled. If you can't see the coupling, you'll analyse the wrong options.` },
      { term: `Analyse coupling points`, def: `For each coupling, determine its strength and what flows across it: calls, data, transactions, deployments.`, why: `It reveals which forces matter, for example that a choice of messaging style also changes consistency guarantees.` },
      { term: `Assess trade-offs`, def: `For each option, ask how it affects the qualities that matter (scale, consistency, availability, cost, team autonomy) and whether the effect is acceptable here.`, why: `Turns a style debate into a comparison grounded in this system's needs.`, demo: `tradeoffMatrix` },
      { term: `Qualitative vs quantitative analysis`, def: `Architecture decisions are rarely measurable in advance, so most analysis is qualitative: comparing options on a relative scale. Quantify where you can, such as with prototypes, load tests and cost estimates.`, why: `Qualitative isn't vague if it's structured: consistent criteria, relative ratings and stated assumptions.` },
      { term: `MECE lists`, def: `When comparing options, make the list of options and of criteria mutually exclusive (no overlap) and collectively exhaustive (nothing important missing).`, why: `Comparing overlapping or incomplete options produces misleading conclusions, such as comparing a product with a pattern.` },
      { term: `The out-of-context trap`, def: `Judging options by generic pros and cons rather than by which ones matter for this system. A long list of advantages means nothing if none of them matter here.`, why: `Weight criteria by context first; a single critical trade-off can outweigh many minor advantages.`, demo: `tradeoffMatrix` },
      { term: `Model relevant domain cases`, def: `Walk real scenarios from the domain through each option: what happens when payment fails mid-checkout, when a slot sells out, when a region goes down.`, why: `Scenarios expose trade-offs that abstract criteria miss, and stakeholders understand them.` },
      { term: `Bottom line over overwhelming evidence`, def: `Present the decision and the few trade-offs that drive it, in the stakeholder's language, rather than every detail of the analysis.`, why: `Decision-makers need to understand the choice and its cost, not audit the spreadsheet. Keep the detail in the ADR.` },
      { term: `Avoid snake oil and evangelism`, def: `Be sceptical of anyone, including yourself, who presents a technology or pattern as having no downsides.`, why: `Every option has costs. If you can't name them, you haven't analysed it yet.` }
    ],
    labs: [`tradeoffMatrix`],
    cheatsheet: [
      { title: `The method`, type: `list`, items: [
        `Find what is entangled in the decision (static and dynamic coupling).`,
        `Analyse each coupling point: what flows across it, and how strong it is.`,
        `List MECE options and criteria; weight the criteria for this context.`,
        `Model real domain scenarios through each option.`,
        `Present the bottom line and the deciding trade-offs; record an ADR.`,
        `Add fitness functions so the decision stays true.`
      ] },
      { title: `Smells in a trade-off analysis`, type: `table`, headers: [`Smell`, `Fix`], rows: [
        [`Option has no listed cons`, `Keep looking; every option costs something`],
        [`Criteria not weighted`, `Ask which qualities matter most here`],
        [`Comparing a product to a pattern`, `Make options MECE at one level`],
        [`Forty slides of evidence`, `Lead with the decision and two trade-offs`],
        [`"Industry best practice" as the reason`, `Explain why it fits this context`]
      ] }
    ],
    interview: [
      { q: `How do you make an architecture decision when there's no best practice?`, a: `Identify what's entangled, analyse the coupling, list options and the criteria that matter in this context, walk real scenarios through each option, and pick the least worst trade-off. Present the bottom line to stakeholders, record an ADR and add fitness functions.`, diff: `medium` },
      { q: `What is the out-of-context trap?`, a: `Choosing based on generic pros and cons without weighting them for this system. An option with many advantages can lose to one with a single decisive advantage that matters here.`, diff: `easy` },
      { q: `What does MECE mean and why does it matter?`, a: `Mutually exclusive, collectively exhaustive. Options and criteria shouldn't overlap and shouldn't miss anything important, or the comparison is skewed.`, diff: `easy` },
      { q: `How do you present a trade-off analysis to executives?`, a: `Lead with the recommendation and the one or two trade-offs that drive it, in business terms (risk, cost, time, customer impact). Offer scenarios to make it concrete; keep the detailed analysis available in an ADR.`, diff: `medium` },
      { q: `Why is qualitative analysis acceptable for architecture decisions?`, a: `Most architectural qualities can't be measured before the system exists. Structured qualitative comparison (consistent criteria, relative ratings, stated assumptions), supplemented by targeted prototypes or measurements, is the practical option.`, diff: `hard` }
    ]
  }
);
