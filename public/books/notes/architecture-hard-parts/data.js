// Software Architecture: The Hard Parts - interactive notes data (chapters 1-5).
// Original study notes on the book by Neal Ford, Mark Richards, Pramod Sadalage and Zhamak Dehghani (O'Reilly, 2021).
// The running example (Basket, an online grocery service) is invented for these notes.
window.DATA = {
  book: {
    title: `Software Architecture: The Hard Parts`,
    subtitle: `Study notes on the book by Neal Ford, Mark Richards, Pramod Sadalage and Zhamak Dehghani (O'Reilly, 2021), about the decisions in distributed architecture that have no best practice: where to split a system and its data, and how to stitch the pieces back together with reuse, workflows, sagas and contracts. The explanations, examples and labs are written independently around an invented running example, <strong>Basket</strong>, an online grocery service breaking up its monolith. Read the book for the authors' full treatment.`,
    storageKey: `architecture_hard_parts_notes_v1`,
    appId: `architecture-hard-parts-notes`,
    exportPrefix: `architecture-hard-parts-progress`,
    pillarsTitle: `Four questions behind every hard part`,
    takeawaysTitle: `Ten things to remember`,
    labsIntro: `Each lab turns one trade-off into something you can push on: coupling graphs, granularity forces, saga shapes, data access patterns. The scores come from simple models stated in each lab, not from measurements, so read them as directions and ratios rather than verdicts. Labs reset when you leave the tab.`,
    mono: `SA`,
    shortTitle: `Architecture: The Hard Parts`,
    tagline: `Trade-off analysis for distributed architecture`
  },
  parts: {
    1: `Introduction`,
    2: `Part I &middot; Pulling Things Apart`,
    3: `Part II &middot; Putting Things Back Together`
  },
  fourQuestions: [
    { cls: `what`, q: `What is coupled to what?`, text: `Before splitting anything, map the coupling. Static coupling is what a piece needs in order to start (a database, a library, a broker). Dynamic coupling is how pieces talk at runtime. The smallest unit that deploys and behaves independently, the architecture quantum, falls out of both.`, answer: `Ch 2: static and dynamic coupling, the architecture quantum.` },
    { cls: `where`, q: `Where do the seams go?`, text: `Split only for a reason the business cares about (deploy faster, scale one part, survive a failure), then let forces decide the size: volatility, scaling and security push services apart; shared transactions, chatty workflows and shared data pull them together.`, answer: `Ch 3-7: modularity drivers, decomposition, data and granularity.` },
    { cls: `when`, q: `When must data agree?`, text: `Once data is split, every cross-service write is a distributed transaction. Decide per workflow whether it needs atomic consistency or can be eventually consistent, who owns each table, and how other services read data they don't own.`, answer: `Ch 9-12: ownership, data access, workflows and sagas.` },
    { cls: `how`, q: `How do you decide without a best practice?`, text: `Find which dimensions are entangled, compare the options on the characteristics that matter for this system, show the trade-offs to stakeholders in their terms, and record the decision and its consequences.`, answer: `Ch 1 and Ch 15: trade-off analysis, ADRs and fitness functions.` }
  ],
  takeaways: [
    `There are no best practices for the hard parts, only trade-offs. The architect's job is to find the <strong>least worst</strong> combination for this system, and to explain why.`,
    `<strong>Static coupling</strong> is what a service needs to boot; <strong>dynamic coupling</strong> is how it talks while running. A shared database makes several services one deployable unit, whatever the repository layout says.`,
    `An <strong>architecture quantum</strong> is an independently deployable piece with high functional cohesion. Synchronous calls entangle the operational characteristics of the caller and callee for as long as the call lasts.`,
    `Break a monolith for a business reason: faster delivery, independent scaling, fault isolation. "Everyone does microservices" is not a reason, and a migration without a driver usually ends as a distributed monolith.`,
    `Decompose in steps: make components explicit, consolidate duplicated domain code, group components into domains, then move domains into services. Tactical forking (copy everything, delete what you don't own) is the alternative for a codebase that can't be untangled.`,
    `Splitting a database is harder than splitting code. Move tables into per-domain schemas first, cut cross-schema joins, then move schemas onto their own servers.`,
    `Service size is a tug of war: <strong>disintegrators</strong> (scope, volatility, scale, fault tolerance, security, extensibility) versus <strong>integrators</strong> (transactions, workflow, shared code, data relationships). Neither side wins by default.`,
    `Every cross-service write needs an answer to "atomic or eventual?". The three dynamic-coupling dimensions (sync/async, atomic/eventual, orchestrated/choreographed) give <strong>eight saga shapes</strong>, each with a different cost.`,
    `Reading data you don't own has four answers: call the owner, replicate a column, share a replicated cache, or share a small data domain. Each trades latency, consistency and coupling differently.`,
    `Prefer <strong>loose contracts</strong> between services and strict ones inside a quantum, and let data mesh treat analytical data as a product owned by the domain that produces it.`
  ],
  chapters: [
    // ------------------------------------------------------------------
    {
      id: `ch1`, part: 1, number: 1,
      title: `When there are no best practices`,
      overview: `Most of software has a well-trodden answer somewhere: a library, a pattern, a style guide. Distributed architecture mostly doesn't. Whether to split a service, who owns a table, or how to keep two databases in step depends on this system, this team and this business, and every answer gives something up. The book's premise is that architects need a repeatable way to analyse trade-offs rather than a catalogue of answers. This chapter sets up that toolkit: what makes a decision architectural, how to record it (architecture decision records), how to keep it true over time (fitness functions), why data sits at the centre, and the running example these notes use, Basket, a grocery delivery business whose monolith is starting to hurt.`,
      concepts: [
        { term: `The hard parts`, def: `The book uses "hard" in two senses: decisions that are difficult because there is no clear right answer, and decisions that are foundational, like the hard drive versus software on top, because they are expensive to change later.`, why: `Recognising which kind of decision you're facing tells you how much analysis it deserves. A logging library can be swapped next quarter; the way services share data cannot.` },
        { term: `Trade-off analysis over best practice`, def: `For decisions without a generic answer, compare options against the qualities that matter for this system (scale, consistency, team autonomy, cost) and pick the combination with the most acceptable downsides.`, why: `It replaces "what do others do?" with "what does this choice cost us?". The outcome is a defensible decision, not a correct one, and it can be revisited when the context changes.`, demo: `tradeoffMatrix` },
        { term: `Architecture vs design`, def: `A useful line: architecture covers decisions that are structural and costly to reverse (service boundaries, data ownership, communication style); design covers decisions inside those boundaries (class structure, a library choice).`, why: `Architects need to spend their attention on what's hard to undo, and leave reversible choices to the teams that live with them.` },
        { term: `Architecture decision record (ADR)`, def: `A short document per significant decision: title, status, context (forces and constraints), the decision itself with its justification, and consequences (what gets better, what gets worse). The book also adds a compliance section (how it will be checked) and notes.`, why: `Records the <em>why</em> next to the <em>what</em>. When someone asks two years later why orders and payments share a database, the ADR answers without archaeology.`, ex: `ADR-014: Payment becomes its own service. Context: PCI scope. Decision: separate service and database. Consequences: checkout gains a network hop; card data leaves the monolith's audit scope.` },
        { term: `Architecture fitness function`, def: `Any mechanism that gives an objective check of some architectural characteristic: a unit test that forbids a package dependency, a cycle detector in CI, a latency monitor in production, a chaos experiment.`, why: `Decisions erode silently. A fitness function turns "services must not call the payment database directly" from a wiki page into a failing build.`, ex: `An ArchUnit (Java) or NetArchTest (.NET) rule asserting that nothing outside <code>basket.payment</code> imports <code>basket.payment.db</code>.` },
        { term: `Atomic vs holistic fitness functions`, def: `An atomic fitness function checks one characteristic in isolation (no dependency cycles). A holistic one checks a combination that only shows up together (latency under load while the cache is cold).`, why: `Some qualities trade against each other, such as security and performance, so a change can pass every atomic check while breaking the system as a whole.` },
        { term: `Operational vs analytical data`, def: `Operational data runs the business transaction by transaction (orders, stock, payments; OLTP). Analytical data is used to understand the business after the fact (trends, forecasts; OLAP), usually reshaped and aggregated.`, why: `They have different owners, shapes and consistency needs, so the book handles them separately: Chapters 6, 9 and 10 for operational data, Chapter 14 for analytical.` },
        { term: `Running example: Basket`, def: `An invented grocery delivery company used throughout these notes. One large application handles catalogue, cart, checkout, payments, stock, warehouse picking, delivery slots, drivers, notifications and reporting, all on one relational database.`, why: `The hard parts only make sense against a concrete system. The book follows its own fictional company through a migration; these notes use Basket so the examples are independent.` }
      ],
      labs: [`tradeoffMatrix`],
      cheatsheet: [
        { title: `ADR template`, type: `code`, body: `# ADR-NNN: <short decision title>
Status:       Proposed | Accepted | Superseded by ADR-MMM
Context:      forces at play, constraints, options considered
Decision:     what we will do, and why this option over the others
Consequences: what improves, what gets worse, what we must now watch
Compliance:   how we will check it (fitness function, review, metric)
Notes:        author, date, links` },
        { title: `Kinds of fitness function`, type: `table`, headers: [`Kind`, `Example`, `Runs`], rows: [
          [`Atomic, triggered`, `No dependency cycles between packages`, `In CI on every build`],
          [`Atomic, continuous`, `p99 checkout latency under 400 ms`, `Production monitoring`],
          [`Holistic, triggered`, `Load test with cache disabled`, `Before a release`],
          [`Holistic, continuous`, `Chaos test: kill a payment node at random`, `Scheduled in production`]
        ] },
        { title: `Questions that expose a hard part`, type: `list`, items: [
          `Would reversing this decision take more than a sprint?`,
          `Does it change who owns data, or how data stays consistent?`,
          `Does it change how services communicate at runtime?`,
          `Would two reasonable architects pick differently here?`,
          `Can you name what you give up with each option?`
        ] }
      ],
      interview: [
        { q: `Why does the book argue there are no best practices in distributed architecture?`, a: `Because the decisions depend on context that differs between systems: scale, consistency needs, team structure, regulation. A practice that's best for one system is harmful for another, so the reusable skill is analysing trade-offs, not memorising answers.`, diff: `easy` },
        { q: `What goes into an ADR, and why bother?`, a: `Title, status, context, decision with justification, consequences, and in the book's variant compliance and notes. It preserves the reasoning, so future maintainers can tell whether the context that justified a decision still holds before they change it.`, diff: `easy` },
        { q: `Give an example of a fitness function for a service boundary.`, a: `A build-time test that fails if any code outside the payment module references the payment module's persistence package, or a dependency check that flags a new service reading the payment schema. It makes the boundary enforceable rather than aspirational.`, diff: `medium` },
        { q: `Why separate operational and analytical data in an architecture discussion?`, a: `They serve different purposes and tolerate different things. Operational data needs correctness per transaction and fast writes; analytical data is read-heavy, reshaped and can be minutes or hours behind. Lumping them together leads to reporting queries hurting checkout, or to a warehouse that blocks domain teams.`, diff: `medium` },
        { q: `What makes a decision architectural rather than a design choice?`, a: `Mostly cost of change and blast radius. If it shapes structure, communication or data ownership and is expensive to reverse, it's architectural. If it can be changed inside one team's boundary without coordinating others, it's design.`, diff: `easy` }
      ]
    },
    // ------------------------------------------------------------------
    {
      id: `ch2`, part: 2, number: 2,
      title: `Discerning coupling`,
      overview: `Every split of a system is really a decision about coupling, so the book starts Part I by making coupling precise. It separates <strong>static coupling</strong>, what a piece of software needs in order to start up, from <strong>dynamic coupling</strong>, how pieces communicate while running. From these it defines the <strong>architecture quantum</strong>: the smallest piece that can be deployed on its own, does something meaningful in the domain, and carries its own operational characteristics such as scale and availability. Dynamic coupling then breaks into three independent dimensions, communication, consistency and coordination, which return in Chapter 12 as the eight saga patterns.`,
      concepts: [
        { term: `Coupling`, def: `Two parts of a system are coupled if a change in one can force a change in the other. Coupling isn't bad in itself; a system with none does nothing.`, why: `The useful question is never "is this coupled?" but "what kind of coupling, and is it worth what it costs?".` },
        { term: `Static coupling`, def: `The dependencies a service needs to boot and run: its database, libraries and frameworks, message broker, configuration store, container image. You could draw it from deployment descriptors without watching any traffic.`, why: `It decides what has to be deployed and changed together. Two services that share a database are statically coupled even if they never call each other.`, demo: `quantumFinder` },
        { term: `Dynamic coupling`, def: `How services depend on each other at runtime: who calls whom, whether the caller waits, whether the work must succeed or fail as a unit, and who coordinates it.`, why: `It decides how failures, latency and load spread. A synchronous call chain makes the slowest member set the pace for all of them.`, demo: `quantumFinder` },
        { term: `Architecture quantum`, def: `An independently deployable artifact with high functional cohesion, high static coupling within it, and synchronous dynamic coupling. In practice: the smallest unit you can deploy, scale and keep available on its own.`, why: `Operational characteristics live at the quantum level. If checkout needs ten times the elasticity of reporting, they must be different quanta, or checkout's scaling drags reporting along.`, demo: `quantumFinder` },
        { term: `Independently deployable`, def: `Can be released without releasing anything else. A shared database breaks this: a schema change for one service is a deployment event for every service using that schema.`, why: `It's the quickest test for counting quanta. Ten microservices on one database are one quantum operationally, which is the classic distributed monolith.` },
        { term: `High functional cohesion`, def: `The quantum does one purposeful thing in the domain, in DDD terms roughly a bounded context, rather than a technical slice like "all the DAOs".`, why: `A deployable unit that is technically independent but not cohesive forces every feature to touch several units at once.` },
        { term: `Communication: sync vs async`, def: `Synchronous: the caller waits for a response before continuing (HTTP/gRPC request-response). Asynchronous: the caller sends a message and carries on; the response, if any, arrives later (queues, events).`, why: `Synchronous calls entangle the two services' availability and performance for the length of the call. Asynchronous calls decouple them at the cost of harder error handling.` },
        { term: `Consistency: atomic vs eventual`, def: `Atomic: a multi-service workflow either fully happens or fully doesn't, as if it were one transaction. Eventual: each service commits locally and the system converges to agreement some time later.`, why: `Atomicity across services is expensive (coordination, locking, compensation) and is the biggest single driver of saga complexity.` },
        { term: `Coordination: orchestration vs choreography`, def: `Orchestrated: a coordinator (orchestrator, mediator) directs the steps and tracks state. Choreographed: each service reacts to events and triggers the next step itself; no one holds the full picture.`, why: `Orchestration centralises error handling and state but adds a coupling point; choreography scales and decouples but scatters the workflow logic.` },
        { term: `Three dimensions, eight combinations`, def: `Communication × consistency × coordination is 2 × 2 × 2 = 8 combinations. The book names each one as a saga pattern (Chapter 12).`, why: `The dimensions are entangled: choosing one constrains how well the others work. You can't pick "async" in isolation from "atomic" and expect a simple system.` }
      ],
      labs: [`quantumFinder`],
      cheatsheet: [
        { title: `Static vs dynamic coupling`, type: `table`, headers: [``, `Static`, `Dynamic`], rows: [
          [`Question`, `What must exist for this to start?`, `What happens when it runs?`],
          [`Examples`, `Shared DB, library, broker, config`, `HTTP call, event, workflow step`],
          [`Seen in`, `Build files, deployment manifests`, `Traces, call graphs`],
          [`Affects`, `What deploys together`, `How failure and latency spread`]
        ] },
        { title: `Dynamic coupling dimensions`, type: `table`, headers: [`Dimension`, `Tighter`, `Looser`], rows: [
          [`Communication`, `Synchronous`, `Asynchronous`],
          [`Consistency`, `Atomic`, `Eventual`],
          [`Coordination`, `Orchestrated`, `Choreographed`]
        ], note: `Orchestration is "tighter" only in coupling terms; it is often simpler to reason about.` },
        { title: `Counting quanta`, type: `list`, items: [
          `Group services that share a database (or a monolithic UI they all deploy with): each group is at most one quantum.`,
          `Within a quantum, everything is deployed and scaled under the same constraints.`,
          `Synchronous calls between quanta entangle their availability and latency while the call is in flight.`,
          `Asynchronous messaging between quanta keeps their operational characteristics independent.`
        ] }
      ],
      interview: [
        { q: `Define an architecture quantum.`, a: `An independently deployable unit with high functional cohesion, high static coupling inside it and synchronous dynamic coupling. Practically, it's the smallest piece that can be deployed, scaled and kept available independently, so it's the granularity at which operational characteristics are set.`, diff: `medium` },
        { q: `Ten microservices share one database. How many quanta?`, a: `One. They can't be deployed independently if a schema change affects all of them, and their availability is bound to the same database. The repository and process boundaries don't change that; it's a distributed monolith.`, diff: `easy` },
        { q: `How does a synchronous call affect two otherwise independent services?`, a: `For the duration of the call the caller's latency includes the callee's, and if the callee is down or slow the caller fails or waits. Their operational characteristics are entangled while the call is outstanding. Async messaging removes that, at the cost of harder error and state handling.`, diff: `medium` },
        { q: `What are the three dimensions of dynamic coupling?`, a: `Communication (synchronous or asynchronous), consistency (atomic or eventual) and coordination (orchestrated or choreographed). Together they define eight possible interaction patterns, which the book later names as saga patterns.`, diff: `easy` },
        { q: `Why does the book separate static from dynamic coupling?`, a: `They fail differently and are fixed differently. Static coupling determines what must be deployed and changed together; dynamic coupling determines how latency and failure propagate. A design can have low static coupling but terrible dynamic coupling (separate databases, long synchronous call chains), or the reverse.`, diff: `hard` }
      ]
    },
    // ------------------------------------------------------------------
    {
      id: `ch3`, part: 2, number: 3,
      title: `Architectural modularity: why break things apart`,
      overview: `Splitting a monolith is expensive and risky, so it needs a reason that someone outside engineering would recognise. The book calls these <strong>modularity drivers</strong>. Some are technical (maintainability, testability, deployability, scalability and elasticity, availability and fault tolerance) and the business ones are speed to market and competitive advantage. This chapter explains each driver, how modularity improves it, and how to turn it into a case that stakeholders can weigh against the cost. For Basket, the trigger is concrete: a promotions bug took checkout down during a holiday weekend, and every release now needs a two-hour freeze.`,
      concepts: [
        { term: `Modularity drivers`, def: `The reasons that justify breaking a system into separately deployable parts: maintainability, testability, deployability, scalability, elasticity, availability and fault tolerance, plus the business outcomes they serve.`, why: `Naming the driver up front decides the shape of the split. Splitting for deployability favours different boundaries from splitting for elasticity.` },
        { term: `Maintainability`, def: `How easily you can add, change or remove features. It improves when a typical change touches one small, cohesive part rather than several layers across the whole codebase.`, why: `In a technically layered monolith, "add a delivery fee" touches UI, service, persistence and database layers shared by everyone; in a domain-partitioned system it touches the delivery module.` },
        { term: `Testability`, def: `How easily and completely changes can be tested. A smaller deployable unit has a smaller test scope, so a change can be verified fully without regression-testing the whole system.`, why: `When a full regression run takes hours, teams start skipping it, and quality drops exactly when releases speed up.` },
        { term: `Deployability`, def: `How often, how safely and with how little ceremony you can release. It covers deployment frequency, risk per deployment and the process around it.`, why: `Large monolith releases bundle many unrelated changes, so one risky change delays or endangers all of them. Smaller units let low-risk changes ship on their own.` },
        { term: `Scalability vs elasticity`, def: `Scalability is handling growing load over time without performance falling off. Elasticity is responding to sudden spikes quickly, which depends on how fast new instances start and how small the scaled unit is.`, why: `A monolith can be scalable but rarely elastic: starting another copy takes minutes and scales parts that aren't busy. Basket's "slots open at 6 am" rush needs elasticity in one place.`, demo: `elasticitySpike` },
        { term: `Availability and fault tolerance`, def: `The ability of the rest of the system to keep working when one part fails. It requires separate quanta and, between them, communication that doesn't wait on the failed part.`, why: `Splitting services but keeping synchronous calls everywhere doesn't improve fault tolerance: a failing dependency still takes callers down. Asynchrony or graceful degradation is part of the deal.` },
        { term: `Speed to market (agility)`, def: `The business outcome of maintainability, testability and deployability together: getting a change from idea to production quickly and safely.`, why: `It's the driver business leaders usually care about most, so phrase technical arguments in its terms: "we can ship pricing changes daily instead of monthly".` },
        { term: `Building the business case`, def: `Tie each proposed split to a driver, the problem it solves now, and the cost (time, new failure modes, operational overhead). Prefer measurable claims: deployment lead time, incident blast radius, time to scale.`, why: `Migrations justified by fashion stall halfway, leaving the worst of both worlds. A driver gives you a way to decide what to split first and when to stop.` }
      ],
      labs: [`elasticitySpike`],
      cheatsheet: [
        { title: `Drivers and what they need`, type: `table`, headers: [`Driver`, `Improves when`, `Watch out for`], rows: [
          [`Maintainability`, `Changes stay inside one domain unit`, `Technical layering across services`],
          [`Testability`, `Test scope matches a small unit`, `Contract drift between units`],
          [`Deployability`, `Units release independently`, `Shared databases, lockstep releases`],
          [`Scalability`, `Hot paths scale on their own`, `Shared bottleneck (DB, broker)`],
          [`Elasticity`, `Small units start in seconds`, `Large images, slow warm-up`],
          [`Fault tolerance`, `Failures stay inside one quantum`, `Synchronous call chains`]
        ] },
        { title: `Pitching a migration`, type: `list`, items: [
          `Start from a pain the business already feels (outages, slow releases, missed peaks).`,
          `Name the driver and the measurable outcome.`,
          `State the cost: time, new failure modes, operational work.`,
          `Propose the first slice and how you'll know it worked.`,
          `Record the decision in an ADR with a fitness function.`
        ] }
      ],
      interview: [
        { q: `What's the difference between scalability and elasticity?`, a: `Scalability is coping with steadily growing load while keeping performance acceptable. Elasticity is coping with sudden bursts, which depends on how quickly capacity can be added, so small units with short startup times are more elastic.`, diff: `easy` },
        { q: `Why doesn't splitting into services automatically improve availability?`, a: `If services still call each other synchronously, a failure or slowdown in one still propagates to its callers. You need separate quanta and communication that tolerates the dependency being unavailable, such as messaging, caching or degraded fallbacks.`, diff: `medium` },
        { q: `How would you justify breaking up a monolith to a non-technical leader?`, a: `Start from a business problem they recognise, map it to a driver, and give measurable outcomes and costs. For example: releases happen monthly because everything ships together; splitting checkout and promotions lets pricing changes ship daily, at the cost of two quarters of work and more operational tooling.`, diff: `medium` },
        { q: `Which modularity drivers combine into speed to market?`, a: `Maintainability (changes are easy to make), testability (they're easy to verify) and deployability (they're easy to release). Together they shorten the time from idea to production.`, diff: `easy` },
        { q: `When should you not break a monolith apart?`, a: `When there's no driver it would serve, when the domain boundaries aren't understood yet, or when the team can't run the operational overhead. A well-modularised monolith delivers much of the maintainability and testability benefit without distributed failure modes.`, diff: `hard` }
      ]
    },
    // ------------------------------------------------------------------
    {
      id: `ch4`, part: 2, number: 4,
      title: `Architectural decomposition`,
      overview: `Once there's a reason to split, the next questions are whether the codebase can be split at all and how. The book offers a quick feasibility check using classic code metrics: coupling counts, abstractness, instability and distance from the main sequence. It then contrasts two approaches. <strong>Component-based decomposition</strong> refactors the monolith into well-defined components and moves them out step by step, usually via a service-based architecture. <strong>Tactical forking</strong> copies the whole codebase for each new service and deletes everything that service doesn't need. The right approach depends on how tangled the code is.`,
      concepts: [
        { term: `Is the codebase decomposable?`, def: `Before planning services, measure whether the code has internal structure to cut along. A codebase where everything depends on everything (a big ball of mud) can't be split by extraction without first being restructured.`, why: `Knowing this early saves months: it decides between component-based decomposition and tactical forking, or a rewrite.` },
        { term: `Afferent and efferent coupling`, def: `Afferent coupling (Ca) counts incoming dependencies: how many other components use this one. Efferent coupling (Ce) counts outgoing ones: how many components this one uses.`, why: `High Ca means many things break if this changes; high Ce means this breaks when many things change. Both make a component harder to extract.`, demo: `mainSequence` },
        { term: `Abstractness`, def: `The ratio of abstract types (interfaces, abstract classes) to all types in a component, from 0 (all concrete) to 1 (all abstract).`, why: `Code that many others depend on should be abstract enough to change behind a stable interface.`, demo: `mainSequence` },
        { term: `Instability`, def: `I = Ce / (Ca + Ce). Close to 0 means many incoming and few outgoing dependencies (stable, hard to change); close to 1 means the reverse (easy to change, nothing depends on it).`, why: `Instability isn't bad; leaf components should be unstable. Trouble starts when something is both depended upon and concrete.`, demo: `mainSequence` },
        { term: `Distance from the main sequence`, def: `D = |A + I − 1|. The main sequence is the line A + I = 1, where abstractness and instability balance. Components far from it fall into the zone of pain (stable and concrete: rigid) or the zone of uselessness (unstable and abstract: unused abstractions).`, why: `A quick, automatable signal for which components are healthy and which will resist extraction. Track it as a fitness function.`, demo: `mainSequence` },
        { term: `Component-based decomposition`, def: `Restructure the monolith into clearly bounded components (usually namespaces or packages), group them into domains, and extract domains into services one at a time.`, why: `Incremental and low-risk: the system keeps running after each step, and each extraction is a known chunk of code with known dependencies. Works when the code is reasonably structured.` },
        { term: `Tactical forking`, def: `Copy the entire monolith once per target service and let each team delete what their service doesn't use, until only their part remains.`, why: `Deleting is easier than extracting from a tangle: you don't need to understand every dependency up front, just remove code until tests still pass. The cost is leftover dead code, duplicated shared code and old names lingering.` },
        { term: `Service-based architecture as a stepping stone`, def: `A small number (4-12) of coarse domain services, often sharing one database, behind a UI. A common intermediate target before going finer-grained.`, why: `It captures most deployability and maintainability gains without splitting data yet, and shows where finer splits are actually needed.` }
      ],
      labs: [`mainSequence`],
      cheatsheet: [
        { title: `Metrics at a glance`, type: `table`, headers: [`Metric`, `Formula`, `Reading`], rows: [
          [`Afferent coupling`, `Ca = incoming deps`, `High: many dependants`],
          [`Efferent coupling`, `Ce = outgoing deps`, `High: depends on many`],
          [`Abstractness`, `A = abstract / total types`, `0 concrete … 1 abstract`],
          [`Instability`, `I = Ce / (Ca + Ce)`, `0 stable … 1 unstable`],
          [`Distance`, `D = |A + I − 1|`, `0 on the main sequence`]
        ] },
        { title: `Component-based vs tactical forking`, type: `table`, headers: [``, `Component-based`, `Tactical forking`], rows: [
          [`Starts by`, `Refactoring into components`, `Copying the whole codebase`],
          [`Best when`, `Code has internal structure`, `Code is a big ball of mud`],
          [`Risk`, `Slow, needs understanding`, `Dead code, duplication`],
          [`Leaves behind`, `Clean component boundaries`, `Leftover code to prune`]
        ] }
      ],
      interview: [
        { q: `What is the zone of pain?`, a: `Components with low abstractness and low instability: concrete code that many things depend on. Every change ripples to dependants, so they're rigid. Database schema code and widely used utility classes often land there.`, diff: `medium` },
        { q: `Calculate instability for a component used by 6 others that depends on 2.`, a: `Ca = 6, Ce = 2, so I = 2 / (6 + 2) = 0.25: fairly stable. If its abstractness is also low, say 0.1, then D = |0.1 + 0.25 − 1| = 0.65, well into the zone of pain.`, diff: `medium` },
        { q: `When would you choose tactical forking?`, a: `When the codebase is too tangled to extract components cleanly and the team needs services quickly. Each team takes a full copy and deletes what it doesn't need. You accept dead code and duplication, then clean up over time.`, diff: `medium` },
        { q: `Why is service-based architecture a useful intermediate step?`, a: `It gives coarse, separately deployable domain services while keeping one database, so you get deployability and team ownership without solving data decomposition yet. It also shows which domains really need finer splits.`, diff: `easy` },
        { q: `What are the limits of these metrics?`, a: `They measure static structure at class and namespace level and can't see runtime coupling, data coupling or domain cohesion. They're a feasibility signal and a fitness function, not a design method.`, diff: `hard` }
      ]
    },
    // ------------------------------------------------------------------
    {
      id: `ch5`, part: 2, number: 5,
      title: `Component-based decomposition patterns`,
      overview: `Component-based decomposition becomes a sequence of six patterns, each with something to look for, a refactoring to apply and a fitness function to keep it from regressing. Identify and size components; gather duplicated domain functionality into one place; flatten component hierarchies so every class belongs to a leaf component; map component dependencies; group components into domains; and finally move each domain into a service. Applied to Basket, the patterns turn a codebase where "notifications" lives in five places into a handful of coherent domains ready to extract.`,
      concepts: [
        { term: `Component`, def: `A building block with a clear role and responsibility, usually a leaf namespace or package (<code>basket.checkout.payment</code>) that holds the classes implementing it.`, why: `Components are what you'll move around, so they need clean edges first. Services are made of one or more components.` },
        { term: `Identify and size components`, def: `List every component with its size, measured in statements rather than lines or files, and its share of the codebase. Flag components much larger or smaller than the rest, for example more than two standard deviations from the mean.`, why: `Oversized components usually hide several responsibilities and should be split; tiny ones may be fragments that belong elsewhere. Evenly sized components make even services.`, demo: `componentSizes` },
        { term: `Gather common domain components`, def: `Find domain functionality implemented in several places (sending notifications, validating addresses) and consolidate it into one component, to be shared or turned into a service.`, why: `Duplicated domain logic diverges over time and each copy becomes a hidden dependency during extraction. Note the difference from technical shared code like logging, which is handled with reuse patterns (Chapter 8).` },
        { term: `Flatten components`, def: `Make sure code lives only in leaf namespaces. Classes sitting in a parent namespace whose children are also components (orphaned classes) get moved into a leaf, or the children get merged up.`, why: `With hierarchical namespaces it's otherwise unclear which component owns which class, so moving "the checkout component" leaves orphans behind.` },
        { term: `Determine component dependencies`, def: `Map which components depend on which, and how heavily. Lots of fan-in and fan-out across the whole codebase is a sign that splitting will be hard.`, why: `It tells you whether the migration is feasible, which components can move first, and which will need interfaces or shared libraries.` },
        { term: `Create component domains`, def: `Group related components into logical domains (Customer, Ordering, Fulfilment, Delivery) and realign namespaces to match: <code>basket.fulfilment.picking</code>, <code>basket.fulfilment.stock</code>.`, why: `Domains become service boundaries. Making them visible in the code before extraction means the extraction is mostly moving folders.` },
        { term: `Create domain services`, def: `Move each component domain into its own separately deployed service, typically into a service-based architecture first, sharing the database for now.`, why: `This is the step that changes deployment. Because the previous patterns did the structural work, each move is low-risk and reversible.` },
        { term: `Fitness functions per pattern`, def: `Each pattern gets an automated guard: a size check that warns when a component grows past a threshold, a rule against classes in non-leaf namespaces, a dependency test between domains.`, why: `Without guards, the structure decays while the migration is underway, as features keep landing in the old places.` }
      ],
      labs: [`componentSizes`],
      cheatsheet: [
        { title: `The six patterns in order`, type: `table`, headers: [`#`, `Pattern`, `Output`], rows: [
          [`1`, `Identify and size components`, `Inventory with sizes, outliers flagged`],
          [`2`, `Gather common domain components`, `One home for duplicated domain logic`],
          [`3`, `Flatten components`, `Code only in leaf namespaces`],
          [`4`, `Determine component dependencies`, `Dependency map and feasibility call`],
          [`5`, `Create component domains`, `Namespaces aligned to domains`],
          [`6`, `Create domain services`, `Domains deployed as services`]
        ] },
        { title: `Example fitness functions`, type: `list`, items: [
          `Fail the build if any component exceeds 10% of total statements.`,
          `Warn when a component is more than 2 standard deviations from mean size.`,
          `Forbid classes directly in a namespace that has child namespaces.`,
          `Forbid dependencies from <code>basket.delivery</code> into <code>basket.checkout.*</code> internals.`
        ] }
      ],
      interview: [
        { q: `Why measure component size in statements rather than lines of code?`, a: `Statements count units of work independent of formatting, comments and line-wrapping style, so they compare components more fairly. Files or classes vary even more in size.`, diff: `easy` },
        { q: `What's an orphaned class and why does it matter?`, a: `A class in a non-leaf namespace, such as <code>basket.checkout</code> when <code>basket.checkout.payment</code> and <code>basket.checkout.cart</code> exist. It's unclear which component owns it, so extractions leave it behind or drag it into the wrong service. Flattening fixes it.`, diff: `medium` },
        { q: `How is gathering common domain components different from shared libraries?`, a: `It targets duplicated business functionality (e.g. notification rules), which should have one owner and often becomes a service. Shared technical code like logging or formatting is better handled with libraries or sidecars.`, diff: `medium` },
        { q: `Why create component domains before creating services?`, a: `It makes the target boundaries visible and testable inside the monolith. Problems such as cross-domain dependencies surface while they're still cheap to fix, and the later extraction becomes mostly mechanical.`, diff: `easy` },
        { q: `Walk through decomposing a monolith with these patterns.`, a: `Inventory and size components, flag outliers and split the big ones; consolidate duplicated domain logic; flatten so code lives only in leaves; map dependencies to check feasibility; group components into domains and realign namespaces, guarded by fitness functions; then move each domain into a service, usually a service-based architecture first.`, diff: `hard` }
      ]
    }
  ]
};
