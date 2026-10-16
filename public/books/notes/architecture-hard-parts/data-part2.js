// Software Architecture: The Hard Parts - part 2 data: operational data, granularity, reuse, ownership, data access (chapters 6-10)
window.DATA.chapters.push(
  // ------------------------------------------------------------------
  {
    id: `ch6`, part: 2, number: 6,
    title: `Pulling apart operational data`,
    overview: `Code can be copied, forked and refactored; a database holds years of tangled data that the business can't afford to lose or corrupt. So splitting data deserves its own analysis. The book frames it with <strong>data disintegrators</strong>, reasons to split (change control, connection management, scalability, fault tolerance, architecture quanta, database-type optimisation), and <strong>data integrators</strong>, reasons to keep data together (relationships and transactions). It then gives a five-step process for moving a monolithic database into per-domain databases, and a way to compare database types once each domain can pick its own.`,
    concepts: [
      { term: `Data disintegrators`, def: `Forces that justify splitting a database: limiting the blast radius of schema changes, managing connections, scaling data independently, isolating failures, letting each quantum own its data, and picking a database type per domain.`, why: `Each one is a concrete pain, so you can point to which problem a split solves instead of splitting on principle.` },
      { term: `Change control`, def: `When many services share tables, a schema change (renaming a column, splitting a table) can break any of them, and finding out which ones is hard.`, why: `It's often the first driver felt in practice: teams stop changing the schema because nobody can say who reads what. Bounded contexts around data restore the freedom to change it.` },
      { term: `Connection management`, def: `Every service instance holds a pool of database connections. With many services, each scaled out, the total demand can exceed what one database server accepts.`, why: `It's a hard limit that appears suddenly as you scale out. Splitting data spreads connections over several servers.`, demo: `connectionBudget` },
      { term: `Data scalability and fault tolerance`, def: `One shared database must handle the combined load of every service and is a single point of failure for all of them.`, why: `Once Basket's catalogue browsing and its checkout share a server, a catalogue query storm slows checkout and an outage stops everything.` },
      { term: `Database-type optimisation`, def: `Different domains suit different databases: a key-value store for carts, a search engine for the catalogue, a relational database for payments, a time-series store for driver locations.`, why: `A shared database forces one compromise on every domain. Split data lets each pick, at the cost of more technologies to run.` },
      { term: `Data integrators`, def: `Forces that keep data together: relationships between tables (foreign keys, joins, views, triggers, stored procedures) and the need for atomic transactions across them.`, why: `Splitting breaks both. Joins become service calls or copies, and ACID transactions become distributed workflows (Chapters 9-12). If a domain truly needs them, keeping the data together may be right.` },
      { term: `Five-step database decomposition`, def: `1) Analyse the database and define data domains. 2) Assign tables to domain schemas. 3) Make each service connect only to its domain's schema. 4) Move schemas onto separate database servers. 5) Switch over and decommission the shared connections.`, why: `Each step is independently shippable and reversible, so the risky moment (moving data between servers) happens only after the code no longer depends on cross-domain access.` },
      { term: `Data domain`, def: `A group of tables that belong together and change together, owned by one service or a few closely related services. In the decomposition it becomes a schema, later its own database.`, why: `Cross-schema queries become visible as violations once data domains exist, which shows exactly what has to be untangled.` },
      { term: `Choosing a database type`, def: `Compare candidate databases on qualities such as ease of learning, ease of modelling, scalability and throughput, availability and partition tolerance, consistency, language support, product maturity, SQL support and community.`, why: `There's no best database, only one that fits this domain's access patterns and the team's skills.` }
    ],
    labs: [`connectionBudget`],
    cheatsheet: [
      { title: `Disintegrators vs integrators`, type: `table`, headers: [`Split the data because…`, `Keep it together because…`], rows: [
        [`Schema changes break unknown consumers`, `Tables are joined by foreign keys and views`],
        [`Connections exceed the server limit`, `Workflows need ACID transactions`],
        [`One domain's load hurts another`, `Reports join across domains in real time`],
        [`One database outage stops everything`, `The team can't run several databases`],
        [`A domain needs a different database type`, ``]
      ] },
      { title: `Five steps to split a database`, type: `list`, items: [
        `Analyse: find tables that belong together; define data domains.`,
        `Assign: move each table into its domain's schema; replace cross-schema joins with service calls or copies.`,
        `Separate connections: each service connects only to its own schema.`,
        `Move schemas to separate servers (replicate, then cut over).`,
        `Switch over: decommission the shared connections and old server.`
      ] },
      { title: `Database types, roughly`, type: `table`, headers: [`Type`, `Good at`, `Weak at`], rows: [
        [`Relational`, `Transactions, ad-hoc queries`, `Horizontal write scale`],
        [`Key-value`, `Fast lookups by key, simple scale`, `Queries beyond the key`],
        [`Document`, `Nested aggregates, flexible schema`, `Cross-document joins`],
        [`Column family`, `Huge write volumes, wide rows`, `Ad-hoc queries`],
        [`Graph`, `Relationship traversal`, `Bulk aggregate scans`],
        [`NewSQL`, `SQL plus horizontal scale`, `Operational maturity, cost`],
        [`Time series`, `Append-heavy, time-ranged reads`, `General-purpose queries`]
      ] }
    ],
    interview: [
      { q: `Why is splitting a database harder than splitting code?`, a: `Data is stateful and long-lived: you can't redeploy it, mistakes corrupt the business record, and relationships (foreign keys, joins, transactions) encode assumptions all over the code. Code that's wrong can be rolled back; data that's been migrated wrong has to be repaired.`, diff: `easy` },
      { q: `Name some data disintegrators and integrators.`, a: `Disintegrators: change control, connection management, scalability, fault tolerance, architecture quantum, database-type optimisation. Integrators: data relationships (foreign keys, views, triggers) and database transactions.`, diff: `easy` },
      { q: `How would you migrate a shared database to per-service databases?`, a: `Define data domains; move tables into per-domain schemas; remove cross-schema access by going through owning services; restrict each service's connection to its schema; then move each schema to its own server (replicate, verify, cut over) and retire the shared one.`, diff: `medium` },
      { q: `How can connection management force a database split?`, a: `Each service instance opens a pool. With 20 services × 10 instances × 20 connections that's 4,000 connections, far over a typical server limit. Splitting data across servers, or adding a proxy pooler, keeps each server under its limit.`, diff: `medium` },
      { q: `When might you keep data together even in a microservices system?`, a: `When a group of tables changes together and needs atomic transactions or heavy joins, and the services using it belong to one domain. A shared data domain (or merging the services) can be better than a fragile distributed transaction.`, diff: `hard` }
    ]
  },
  // ------------------------------------------------------------------
  {
    id: `ch7`, part: 2, number: 7,
    title: `Service granularity`,
    overview: `How big should a service be? The book's answer is that size is the result of two opposing sets of forces. <strong>Granularity disintegrators</strong> push a service apart: mixed responsibilities, parts changing at different rates, different scaling needs, fault isolation, security and extensibility. <strong>Granularity integrators</strong> pull services together: the need for database transactions, chatty workflows between pieces, shared code and data relationships. Instead of aiming for "micro", you list the forces that apply, weigh them, and explain the choice to the business in terms of what it gets and what it gives up.`,
    concepts: [
      { term: `Granularity vs modularity`, def: `Modularity is about breaking a system into separate parts; granularity is about the size of those parts, roughly how much each one does.`, why: `A system can be well modularised yet badly sized: thirty tiny services that must always change together are modular in name only.` },
      { term: `Measuring size`, def: `Two simple measures: the number of statements in a service, and the number of public operations it exposes.`, why: `They give a common language for "too big" and "too small", and make size drift visible as a fitness function.` },
      { term: `Disintegrator: scope and function`, def: `A service doing several loosely related things (low cohesion), or simply very large, is a candidate to split. Cohesion matters more than size.`, why: `A notification service sending email, SMS and push may be cohesive (one purpose: tell customers things). A service handling payments and delivery slots isn't.` },
      { term: `Disintegrator: code volatility`, def: `Parts of a service that change at very different rates. Splitting the volatile part keeps the stable part from being retested and redeployed on every change.`, why: `If Basket's promotions rules change weekly but the cart logic changes yearly, coupling them means cart is redeployed weekly for no reason.` },
      { term: `Disintegrator: scalability and throughput`, def: `Parts of a service with very different load profiles. Splitting lets each scale on its own.`, why: `Delivery-slot lookup peaks at 6 am; slot administration barely moves. Together, the whole service scales for the peak.` },
      { term: `Disintegrator: fault tolerance`, def: `Separating a part that fails often, or has risky dependencies, so its failures don't take the rest down.`, why: `If the SMS provider integration crashes the process, email notifications shouldn't stop with it.` },
      { term: `Disintegrator: security and extensibility`, def: `Security: separating functions with stricter access requirements (card data) so the strict controls apply only there. Extensibility: separating parts that are expected to gain new variants (new payment methods) so adding one doesn't touch the others.`, why: `Both reduce the surface that must be audited or retested when things change.` },
      { term: `Integrator: database transactions`, def: `If two pieces must commit atomically, splitting them turns a local ACID transaction into a distributed workflow with eventual consistency or compensation.`, why: `Usually the strongest integrator. Ask the business whether the operations truly must be atomic; if they must, keep them together.` },
      { term: `Integrator: workflow and choreography`, def: `Pieces that call each other constantly to complete a request. Split, every call adds latency, a failure point and data-consistency concerns.`, why: `If one user action needs five network hops between services that are always used together, they probably belong together.` },
      { term: `Integrators: shared code and data relationships`, def: `Shared code: pieces that rely on the same non-trivial domain code, so changes ripple everywhere it's shared. Data relationships: pieces whose data is so intertwined that splitting the data would require constant cross-service calls.`, why: `They create coupling that a service boundary doesn't remove; it just turns it into versioning and remote calls.` },
      { term: `Finding the balance`, def: `List the disintegrators and integrators that apply, judge their strength, and present the trade-off to stakeholders in business terms: "splitting gives independent scaling of slot search; keeping them together keeps bookings atomic".`, why: `It turns a style argument into a decision the business can own, and documents it for later.`, demo: `granularityBalance` }
    ],
    labs: [`granularityBalance`],
    cheatsheet: [
      { title: `Forces on service size`, type: `table`, headers: [`Disintegrators (split)`, `Integrators (merge)`], rows: [
        [`Scope and function: low cohesion, too big`, `Database transactions: must be atomic`],
        [`Code volatility: parts change at different rates`, `Workflow: constant calls between parts`],
        [`Scalability: different load profiles`, `Shared code: same non-trivial domain code`],
        [`Fault tolerance: isolate failure-prone parts`, `Data relationships: intertwined data`],
        [`Security: stricter access for some parts`, ``],
        [`Extensibility: new variants expected`, ``]
      ] },
      { title: `Questions to ask stakeholders`, type: `list`, items: [
        `If the payment succeeds but the order record fails, is a few seconds of inconsistency acceptable?`,
        `Do these two features need to scale differently?`,
        `How often do these parts change, and do they change together?`,
        `If this part is down, should the other part keep working?`,
        `Does this function need a stricter audit scope than the rest?`
      ] }
    ],
    interview: [
      { q: `What forces push a service to be split?`, a: `Granularity disintegrators: low cohesion or excessive size, different rates of change, different scalability needs, fault isolation, security boundaries and extensibility.`, diff: `easy` },
      { q: `What forces pull services together?`, a: `Granularity integrators: the need for atomic database transactions, chatty workflows between the pieces, shared domain code, and closely related data.`, diff: `easy` },
      { q: `A notification service sends email, SMS and push. Should it be split?`, a: `Not because of its scope alone: it has one purpose. Split if a real disintegrator applies: SMS needs very different scaling, push changes far more often, or one channel's provider is unreliable and crashes the others. Otherwise one service is fine.`, diff: `medium` },
      { q: `How do you resolve a conflict between a scalability disintegrator and a transaction integrator?`, a: `Make the trade-off explicit to the business: either keep atomicity and scale the combined service, or split for independent scaling and accept eventual consistency with compensation. The deciding question is usually whether the business truly needs the operations to be atomic.`, diff: `hard` },
      { q: `Why is "microservice" a misleading guide to size?`, a: `"Micro" suggests small is the goal. The real goal is a boundary where the forces balance; a service can be large and right, or small and wrong if it can never change or deploy on its own.`, diff: `medium` }
    ]
  },
  // ------------------------------------------------------------------
  {
    id: `ch8`, part: 3, number: 8,
    title: `Reuse patterns`,
    overview: `Part II starts by putting things back together, beginning with code. Once services are separate, code they used to share needs a new home. The book covers four options. <strong>Code replication</strong> copies small, stable code into each service. A <strong>shared library</strong> links common code at build time. A <strong>shared service</strong> exposes it at runtime. <strong>Sidecars</strong> and a <strong>service mesh</strong> handle operational concerns such as logging, metrics and security outside the service's own code. Each trades change risk, performance, fault tolerance and versioning differently. A recurring lesson: reuse pays off for code that changes slowly; for volatile code it mostly spreads coupling.`,
    concepts: [
      { term: `Code replication`, def: `Copy the shared code into each service's codebase.`, why: `No coupling at all, so each service can evolve its copy freely. Only sensible for small, simple, very stable code (an annotation, a small value type), because bug fixes must be copied by hand.` },
      { term: `Shared library`, def: `Package common code as a versioned library (JAR, DLL, NuGet, npm) that each service links at build time.`, why: `Fast (in-process calls), no runtime dependency, and works offline. The cost is versioning: every consumer must upgrade to pick up a change, so versions drift across services.`, demo: `reuseCost` },
      { term: `Library granularity`, def: `One large shared library versus several small, focused ones.`, why: `A large library forces every consumer to take every change, even to parts they don't use; small libraries limit that churn but create a dependency web to manage. Split by rate of change and by consumer.` },
      { term: `Versioning and deprecation`, def: `Release shared code with semantic versions, support a few versions at once, and announce a deprecation window before removing old ones.`, why: `Always forcing the latest version makes every library change a coordinated release, which defeats independent deployability.` },
      { term: `Shared service`, def: `Put the common functionality behind its own service and have others call it at runtime.`, why: `A change is deployed once and every consumer sees it immediately, which is great for volatile logic and polyglot consumers. The cost: network latency, a shared failure point, scaling for everyone's load, and changes that can break all callers at once.`, demo: `reuseCost` },
      { term: `Sidecar`, def: `A separate process deployed alongside each service instance that handles operational concerns: logging, metrics, mTLS, retries, configuration.`, why: `It keeps cross-cutting technical concerns consistent without putting them in each service's code, and works across languages.` },
      { term: `Service mesh`, def: `The network of sidecars across all services plus a control plane that configures them centrally (Istio, Linkerd).`, why: `Gives one place to apply policies (security, traffic shaping, observability) across the whole fleet. It's operational reuse, not domain reuse.` },
      { term: `Domain vs operational coupling`, def: `Domain logic (pricing rules) and operational behaviour (logging, monitoring, circuit breaking) are different kinds of shared code. Sidecars suit the second; libraries and services suit the first.`, why: `Putting domain logic into a sidecar or mesh hides business behaviour in infrastructure; putting operational code in every service duplicates platform work.` },
      { term: `Reuse and rate of change`, def: `Reuse works best for code that rarely changes, such as frameworks, operating systems and platform tooling. Highly volatile shared code turns every change into a coordination problem.`, why: `It's a useful filter: before sharing something, ask how often it changes and how many teams it would then bind together.` }
    ],
    labs: [`reuseCost`],
    cheatsheet: [
      { title: `Reuse options compared`, type: `table`, headers: [``, `Replication`, `Shared library`, `Shared service`, `Sidecar`], rows: [
        [`Binding`, `Copy`, `Build time`, `Runtime call`, `Co-deployed process`],
        [`Change reaches consumers`, `Manually`, `On upgrade`, `Immediately`, `On fleet rollout`],
        [`Performance`, `In-process`, `In-process`, `Network hop`, `Local hop`],
        [`Failure impact`, `None shared`, `None shared`, `All callers`, `Per instance`],
        [`Polyglot`, `Rewrite per language`, `One per language`, `Yes`, `Yes`],
        [`Best for`, `Tiny, stable code`, `Stable domain code`, `Volatile or polyglot logic`, `Operational concerns`]
      ] },
      { title: `Rules of thumb`, type: `list`, items: [
        `Share code that rarely changes; isolate code that changes often.`,
        `Prefer several focused libraries over one "commons" library.`,
        `Version everything; support N and N-1; announce deprecations.`,
        `Treat a shared service as a product with an SLA, not a utility.`,
        `Put logging, metrics, mTLS and retries in sidecars, not business code.`
      ] }
    ],
    interview: [
      { q: `Shared library or shared service for common code?`, a: `Library when the code is stable, performance-sensitive and consumers share a language: in-process, no runtime dependency, at the cost of versioning. Service when the code changes often or must serve several languages: one deploy updates everyone, at the cost of latency, a shared failure point and shared scaling.`, diff: `medium` },
      { q: `What's the risk of a single large "commons" library?`, a: `Every change, however small, produces a new version that every consumer must consider. Consumers end up on many different versions or are forced into lockstep upgrades. Splitting by function and rate of change reduces churn.`, diff: `easy` },
      { q: `What problem does a sidecar solve?`, a: `Consistent operational behaviour (logging, metrics, security, retries) across services, possibly in different languages, without embedding it in each codebase. A service mesh configures those sidecars centrally.`, diff: `easy` },
      { q: `When is copying code the right answer?`, a: `When it's small, simple and practically never changes, such as a few value types or annotations. The independence is worth more than the occasional manual fix.`, diff: `easy` },
      { q: `How does a shared service affect fault tolerance and scalability?`, a: `Every consumer depends on it at runtime, so its outage or slowness affects all of them, and it must scale for their combined load. It needs high availability, capacity planning and careful change management, like any critical platform service.`, diff: `medium` }
    ]
  },
  // ------------------------------------------------------------------
  {
    id: `ch9`, part: 3, number: 9,
    title: `Data ownership and distributed transactions`,
    overview: `Once tables are spread across services, someone has to own each one. The book's rule of thumb: the service that writes a table owns it. That's easy when one service writes (single ownership), trickier when many write (common ownership) and hardest when a few closely related services write (joint ownership), for which it offers four techniques. It then contrasts ACID transactions with distributed transactions, introduces BASE and eventual consistency, and compares three ways to get eventual consistency: background synchronisation, orchestrated request-based updates and event-based updates.`,
    concepts: [
      { term: `Ownership follows writes`, def: `The service that writes to a table owns it. Other services read it through that owner (or a copy the owner publishes), never by writing directly.`, why: `It gives each piece of data one place where its rules are enforced, which is what makes independent deployment of data possible.` },
      { term: `Single ownership`, def: `Only one service writes to the table. It owns it outright and others read via that service.`, why: `The easy case; most tables end up here if the domains are drawn well.` },
      { term: `Common ownership`, def: `Many services write to the same table, for example an audit log or a customer activity table.`, why: `Splitting it among writers makes no sense. The usual answer is a dedicated service that owns the table, with the others sending writes to it, ideally asynchronously.` },
      { term: `Joint ownership`, def: `A few services in the same domain write to the same table, often different columns. Example: Basket's catalogue service writes product details and the stock service writes quantities to one <code>product</code> table.`, why: `The hard case. The book offers four techniques: table split, data domain, delegate and service consolidation.` },
      { term: `Table split technique`, def: `Split the jointly owned table so each service owns its part (<code>product</code> for catalogue, <code>product_stock</code> for stock) and keep shared keys in step through messaging or calls.`, why: `Restores single ownership at the cost of synchronising the split rows, usually eventually.` },
      { term: `Data domain technique`, def: `The joint owners share a small schema that both write to directly, accepting a wider bounded context around that data.`, why: `Keeps atomicity and performance but couples the services' schema changes and deployments together around that domain.` },
      { term: `Delegate technique`, def: `One service becomes the sole owner and the others ask it to make their writes. Choosing the owner either by domain priority (whose core data is it?) or by operational priority (who needs the fastest writes?).`, why: `Single ownership without splitting the table, but the delegating service now depends on the owner for every write.` },
      { term: `Service consolidation technique`, def: `Merge the joint owners into one service.`, why: `Removes the problem completely, at the cost of a coarser service with combined testing, deployment and scaling.` },
      { term: `ACID vs BASE`, def: `ACID: atomic, consistent, isolated, durable transactions in one database. BASE: basically available, soft state, eventually consistent, the model distributed systems fall back to when one transaction can't span all the data.`, why: `Splitting data forces a choice for each workflow: build a distributed transaction (hard, slow, fragile) or accept BASE and design for temporary inconsistency.` },
      { term: `Eventual consistency patterns`, def: `Three ways to bring copies of data back into agreement: background synchronisation (a batch job reconciles data stores), orchestrated request-based (one service updates the others during the request), and event-based (the owner publishes an event and others update themselves).`, why: `They trade responsiveness, coupling and time-to-consistency against each other differently.`, demo: `consistencyWindow` }
    ],
    labs: [`consistencyWindow`],
    cheatsheet: [
      { title: `Ownership cases`, type: `table`, headers: [`Case`, `Who writes`, `Typical answer`], rows: [
        [`Single`, `One service`, `That service owns it`],
        [`Common`, `Many services`, `Dedicated owning service; others send writes`],
        [`Joint`, `A few related services`, `Table split, data domain, delegate or consolidate`]
      ] },
      { title: `Joint ownership techniques`, type: `table`, headers: [`Technique`, `Gain`, `Cost`], rows: [
        [`Table split`, `Single ownership restored`, `Sync between split tables`],
        [`Data domain`, `Atomic writes, fast reads`, `Shared schema, wider context`],
        [`Delegate`, `One owner, no split`, `Remote call for every delegated write`],
        [`Consolidation`, `Problem disappears`, `Coarser service`]
      ] },
      { title: `Eventual consistency patterns`, type: `table`, headers: [`Pattern`, `Consistency lag`, `Coupling`, `Responsiveness`], rows: [
        [`Background sync`, `Batch interval (minutes-hours)`, `High: job knows every store`, `Good`],
        [`Orchestrated request-based`, `Near zero, if all succeed`, `High: orchestrator calls all`, `Poor: user waits`],
        [`Event-based`, `Seconds`, `Low: publish and forget`, `Good`]
      ] }
    ],
    interview: [
      { q: `Who should own a table in a distributed system?`, a: `The service that writes to it. Others read through that owner's API or a published copy. With several writers, decide between a dedicated owning service (common ownership) or one of the joint-ownership techniques.`, diff: `easy` },
      { q: `Two services both write to a product table. What are your options?`, a: `Split the table so each owns its columns and synchronise keys; share a small data domain and accept schema coupling; delegate writes to one owner chosen by domain or operational priority; or merge the services. The choice depends on how atomic the writes need to be and how independently the services must deploy.`, diff: `medium` },
      { q: `Contrast ACID with BASE.`, a: `ACID gives atomic, consistent, isolated, durable transactions inside one database. BASE accepts that a distributed system stays basically available with soft, temporarily inconsistent state that converges over time. Splitting data usually means moving from the first to the second for cross-service workflows.`, diff: `easy` },
      { q: `Compare the three eventual consistency patterns.`, a: `Background sync is simple and responsive but slow to converge and couples the job to every data store. Orchestrated request-based gives fast convergence but makes the user wait and puts error handling in the orchestrator. Event-based is responsive and decoupled with fast convergence, but needs durable messaging and careful error handling.`, diff: `medium` },
      { q: `What goes wrong with background synchronisation as a system grows?`, a: `The batch job must know the schema of every data store it reconciles, so it breaks bounded contexts and has to change whenever any of them change. Inconsistency also lasts a full batch interval, which grows as data grows.`, diff: `hard` }
    ]
  },
  // ------------------------------------------------------------------
  {
    id: `ch10`, part: 3, number: 10,
    title: `Distributed data access`,
    overview: `Owning data is one thing; reading data you don't own is the daily problem. Basket's delivery service needs customer addresses, which the customer service owns. The book compares four access patterns. <strong>Interservice communication</strong>: ask the owner each time. <strong>Column schema replication</strong>: copy the needed columns into your own table and keep them updated. <strong>Replicated caching</strong>: the owner maintains an in-memory cache that is replicated into each reader. <strong>Data domain</strong>: share the tables directly in a common schema. They trade latency, consistency, fault tolerance, scalability and data ownership against each other.`,
    concepts: [
      { term: `Interservice communication pattern`, def: `The reader calls the owning service's API whenever it needs the data.`, why: `Simplest and always consistent with the source of truth, but adds latency to every read, ties the reader's availability to the owner's, and makes the owner scale for everyone's reads.`, demo: `dataAccess` },
      { term: `Column schema replication pattern`, def: `The reader keeps a copy of just the columns it needs in its own database, updated asynchronously by events from the owner.`, why: `Fast local reads and independence from the owner's uptime. The costs are consistency lag, a synchronisation mechanism to build, and the risk that readers start treating the copy as theirs to change.`, demo: `dataAccess` },
      { term: `Replicated caching pattern`, def: `The owner holds the data in an in-memory cache that a caching product (such as Hazelcast or Apache Ignite) replicates into each reader's memory. Readers read locally; only the owner writes.`, why: `Very fast reads and owner outages don't block readers once started. Limited by data volume (it must fit in memory on every reader), update rate, and a startup dependency on the owner's cache.`, demo: `dataAccess` },
      { term: `Data domain pattern`, def: `Owner and reader share a schema containing the tables both need, each reading and writing directly.`, why: `Good performance and strong consistency with no synchronisation. It widens the bounded context: schema changes now need agreement, and the services can't deploy their data independently.`, demo: `dataAccess` },
      { term: `Data volume`, def: `How much data the reader needs: a few reference rows, or millions of customers.`, why: `It quickly rules patterns out. Replicated caching only works if the dataset fits comfortably in every reader's memory.` },
      { term: `Update rate`, def: `How often the shared data changes.`, why: `High update rates make replication expensive and widen the consistency gap; low rates make copies nearly free.` },
      { term: `Fault tolerance of reads`, def: `Whether the reader can keep working when the owner is unavailable.`, why: `Calling the owner fails with it; local copies and replicated caches keep serving, possibly stale.` },
      { term: `Ownership leakage`, def: `When a copy or shared table lets non-owners write, the owner's rules can be bypassed.`, why: `Every pattern except interservice communication needs a guard (read-only access, fitness functions) to keep writes going through the owner.` }
    ],
    labs: [`dataAccess`],
    cheatsheet: [
      { title: `Four ways to read someone else's data`, type: `table`, headers: [``, `Interservice call`, `Column replication`, `Replicated cache`, `Data domain`], rows: [
        [`Read latency`, `Network hop`, `Local`, `In memory`, `Local`],
        [`Consistency`, `Always current`, `Eventual`, `Eventual (fast)`, `Strong`],
        [`Owner down`, `Reads fail`, `Reads continue`, `Reads continue*`, `n/a (shared DB)`],
        [`Data volume`, `Any`, `Any`, `Must fit in memory`, `Any`],
        [`Coupling`, `Runtime`, `Event contract`, `Cache product`, `Schema`]
      ], note: `* After startup; a reader that starts while the owner is down may have no data.` },
      { title: `Picking a pattern`, type: `list`, items: [
        `Small, slowly changing reference data, read everywhere: replicated cache.`,
        `Large data, read often, staleness of seconds OK: column replication.`,
        `Freshness critical, read rate modest: interservice call.`,
        `Tightly related services that change together: data domain.`
      ] }
    ],
    interview: [
      { q: `Delivery needs customer addresses owned by the customer service. What are the options?`, a: `Call customer service on each delivery (simple, current, but latency and runtime coupling); replicate the address columns into delivery's database via events (fast, available, eventually consistent); replicate an in-memory address cache if the dataset is small; or share a customer-address data domain if the services are tightly related.`, diff: `medium` },
      { q: `When is replicated caching a bad fit?`, a: `When the dataset is too large to hold in every reader's memory, when it changes very often, or when readers must start even while the owner is down. It suits small, read-heavy reference data.`, diff: `medium` },
      { q: `What's the main risk with column schema replication?`, a: `Consistency lag and ownership leakage: the copy can be stale, and readers may start writing to or extending it, so the owner's rules are bypassed. It also needs a reliable synchronisation mechanism.`, diff: `easy` },
      { q: `Why does the interservice communication pattern hurt scalability?`, a: `Every reader's reads become load on the owner, so the owner must scale for the sum of all readers, and each read pays a network round trip. Hot reference data multiplies this quickly.`, diff: `easy` },
      { q: `What does the data domain pattern give up?`, a: `Independent ownership of the shared tables. The services' bounded context widens to include the shared schema, so schema changes need coordination and the services lose independent deployability of that data.`, diff: `medium` }
    ]
  }
);
