// Deep dive: DDIA Chapter 12, The Future of Data Systems. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch12 = {
  hook: `<p>Look at the architecture diagram of almost any company that has been around for five years. PostgreSQL for orders. Elasticsearch for product search. Redis in front of both. A warehouse for analytics, fed by nightly exports. A recommendations service with its own key-value store. Kafka somewhere in the middle. Each system was the right tool for its job, and each holds a copy of some of the same facts. Then a customer changes their address and asks why the old one still appears on an invoice, in search results and in a marketing email.</p>
<p>No single database does everything well, so real systems are compositions. The final chapter of the book steps back from individual tools and asks how to compose them so that the whole stays correct: which copy is the truth, how the others are derived from it, how to recover when code is wrong, how to enforce rules without distributed transactions, and, finally, what responsibilities come with building systems that hold data about people.</p>`,
  sections: [
    {
      id: "data-integration",
      title: "Data integration: one truth, many derived views",
      kicker: "Composing tools",
      blocks: [
        {
          type: "problem",
          html: `<p>Every data system is designed around particular access patterns, and its weaknesses are the price of its strengths. A search index is great at relevance ranking and poor at transactions; an OLTP database is the reverse. So applications combine several systems, and the hard problem becomes keeping them consistent with each other.</p>`,
        },
        {
          type: "idea",
          html: `<p>Make one system the <strong>system of record</strong>, give its writes a single total order (a log), and derive every other store from that log with deterministic processing. Derived stores can then be thrown away and rebuilt, and they all converge on the same history.</p>`,
        },
        {
          type: "text",
          html: `<p>The previous chapter showed why application-level dual writes fail: two clients can update the database and the search index in opposite orders, and a crash between writes leaves one system without the change. The fix is to decide <em>which</em> system receives writes first and route all changes through it in a fixed order, using change data capture or event sourcing. Every downstream consumer applies the same changes in the same order, so they end up in the same state, just with some lag.</p>
<p>The alternative is distributed transactions across all the systems, using two-phase commit or XA. Both approaches aim at the same goal (all systems reflect the same writes), but they make different trade-offs.</p>`,
        },
        {
          type: "diagram",
          title: "The log as integration backbone",
          caption: "Writes enter one ordered log, the system of record. Each derived store is maintained by a consumer that applies the log in order, so all of them converge on the same history and any of them can be rebuilt by replaying it.",
          svg: `<svg viewBox="0 0 640 260" role="img" aria-label="An event log feeding a database, search index, cache and warehouse through consumers">
<defs><marker id="ddia12-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="16" y="100" width="110" height="50" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="71" y="122" text-anchor="middle" font-size="13" font-weight="700">application</text>
<text x="71" y="140" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">writes</text>
<rect x="170" y="90" width="150" height="70" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="245" y="118" text-anchor="middle" font-size="13" font-weight="700">event log</text>
<text x="245" y="138" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">system of record</text>
<line x1="128" y1="125" x2="166" y2="125" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia12-arrow)"/>
<rect x="430" y="20" width="190" height="40" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="525" y="45" text-anchor="middle" font-size="12">OLTP database view</text>
<rect x="430" y="80" width="190" height="40" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="525" y="105" text-anchor="middle" font-size="12">search index</text>
<rect x="430" y="140" width="190" height="40" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="525" y="165" text-anchor="middle" font-size="12">cache</text>
<rect x="430" y="200" width="190" height="40" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="525" y="225" text-anchor="middle" font-size="12">analytics warehouse</text>
<line x1="322" y1="112" x2="426" y2="42" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia12-arrow)"/>
<line x1="322" y1="120" x2="426" y2="100" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia12-arrow)"/>
<line x1="322" y1="130" x2="426" y2="158" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia12-arrow)"/>
<line x1="322" y1="138" x2="426" y2="218" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia12-arrow)"/>
<text x="245" y="185" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">consumers derive</text>
<text x="245" y="203" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">each view in order</text>
</svg>`,
        },
        {
          type: "compare",
          items: [
            { title: "Distributed transactions (2PC/XA)", tone: "info", html: "Order is decided by locks; atomicity by atomic commit. Gives linearizability, so you can read your own writes everywhere immediately. But it couples the availability of every participant, holds locks across round trips, and support across heterogeneous systems is limited." },
            { title: "Derived data via an ordered log", tone: "ok", html: "Order comes from the log; atomicity from deterministic, retried processing with deduplication. Derived systems update asynchronously, so reads may be stale, but faults stay contained and any view can be rebuilt by replay." },
          ],
        },
        {
          type: "text",
          html: `<p>A single totally ordered log has limits too. Its throughput is capped by what one leader can handle, so large systems partition it, and order across partitions becomes ambiguous. Geographically distributed systems usually have a leader per region, with no order between regions. Microservices that each own their own storage share no log at all. Deciding a total order is equivalent to consensus, and most consensus algorithms assume one node can handle all the traffic. For many applications, it is enough to preserve <em>causal</em> order (for example, by recording which version of a record an event was based on) rather than a global total order.</p>`,
        },
        {
          type: "quiz",
          q: "A team keeps PostgreSQL and Elasticsearch in sync by writing to both in the request handler, inside a try/catch that retries the Elasticsearch write. Why is that still unsafe?",
          options: [
            "Elasticsearch cannot accept retries",
            "Concurrent requests can apply writes to the two systems in different orders, and a crash between the writes loses the second one",
            "PostgreSQL does not support transactions",
            "It is safe as long as the retry count is high enough",
          ],
          answer: 1,
          explain: "Retries fix transient failures but not ordering: two concurrent updates can land A-then-B in one system and B-then-A in the other. And if the process dies after the database commit, the retry never runs. Deriving the index from the database's change log fixes both problems.",
        },
      ],
    },
    {
      id: "batch-and-stream",
      title: "Batch and stream together: Lambda and Kappa",
      kicker: "Reprocessing",
      blocks: [
        {
          type: "text",
          html: `<p>Derived data is not only about keeping views fresh; it is also how systems <strong>evolve</strong>. Suppose you want a new search index layout, or a recommendation model that uses a new feature. With a log of history, you can build the new view alongside the old one by reprocessing the log, compare the two, move a small share of users to the new view, and switch over gradually. If something goes wrong, the old view is still there. Schema migrations stop being risky one-way doors.</p>
<p>That raises a design question: should historical reprocessing be done by a batch system and fresh updates by a stream system, or can one system do both?</p>
<h3>The Lambda architecture</h3>
<p>Nathan Marz proposed running both paths over an immutable log of events. A <strong>batch layer</strong> (originally Hadoop) periodically recomputes a correct view from all history; a <strong>speed layer</strong> (originally Storm) processes recent events quickly to fill the gap since the last batch run. Queries merge the two. The motivation was that stream processors of the time were approximate and less reliable, while batch was simple and correct.</p>
<p>In practice the costs added up: every piece of logic has to be written for two frameworks and kept in sync (tools like Twitter's Summingbird tried to share code between them), outputs from both paths must be merged, and reprocessing all history in the batch layer became expensive, pushing teams toward incremental batches that reintroduced streaming's problems with windows and late data.</p>
<h3>The Kappa architecture</h3>
<p>In 2014 Jay Kreps argued for a single path: use a stream processor for everything, and when logic changes, start a second instance of the new code reading the log from the beginning (or from a retained point), let it catch up into a new output, then switch readers over and retire the old job. This needs a log that retains enough history and a stream processor that can handle replay at high throughput with event-time semantics.</p>`,
        },
        {
          type: "diagram",
          title: "Lambda versus Kappa",
          caption: "Lambda maintains two implementations of the same logic and merges their outputs. Kappa runs one implementation; to reprocess, it starts a new version reading the log from the start and swaps the resulting view in when it catches up.",
          svg: `<svg viewBox="0 0 640 255" role="img" aria-label="Lambda architecture with batch and speed layers compared with Kappa architecture with replayed stream jobs">
<defs><marker id="ddia12-arrow2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<text x="160" y="24" text-anchor="middle" font-size="14" font-weight="700">Lambda</text>
<text x="480" y="24" text-anchor="middle" font-size="14" font-weight="700">Kappa</text>
<line x1="320" y1="14" x2="320" y2="230" stroke-width="1" style="stroke: var(--dg-line)"/>
<rect x="110" y="40" width="100" height="34" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="160" y="62" text-anchor="middle" font-size="12">event log</text>
<rect x="20" y="110" width="120" height="34" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="80" y="132" text-anchor="middle" font-size="12">batch layer</text>
<rect x="180" y="110" width="120" height="34" rx="6" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="2"/>
<text x="240" y="132" text-anchor="middle" font-size="12">speed layer</text>
<rect x="90" y="180" width="140" height="34" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="160" y="202" text-anchor="middle" font-size="12">merge at query</text>
<line x1="145" y1="76" x2="86" y2="106" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia12-arrow2)"/>
<line x1="175" y1="76" x2="234" y2="106" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia12-arrow2)"/>
<line x1="80" y1="146" x2="132" y2="176" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia12-arrow2)"/>
<line x1="240" y1="146" x2="188" y2="176" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia12-arrow2)"/>
<rect x="420" y="40" width="120" height="34" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="480" y="62" text-anchor="middle" font-size="12">event log</text>
<rect x="340" y="110" width="125" height="34" rx="6" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="2"/>
<text x="402" y="132" text-anchor="middle" font-size="12">stream job v1</text>
<rect x="495" y="110" width="130" height="34" rx="6" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="2" stroke-dasharray="5 4"/>
<text x="560" y="132" text-anchor="middle" font-size="12">job v2, replaying</text>
<rect x="340" y="180" width="125" height="34" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="402" y="202" text-anchor="middle" font-size="12">view v1</text>
<rect x="495" y="180" width="130" height="34" rx="6" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="560" y="202" text-anchor="middle" font-size="12">view v2, swap in</text>
<line x1="465" y1="76" x2="410" y2="106" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia12-arrow2)"/>
<line x1="495" y1="76" x2="552" y2="106" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia12-arrow2)"/>
<line x1="402" y1="146" x2="402" y2="176" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia12-arrow2)"/>
<line x1="560" y1="146" x2="560" y2="176" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia12-arrow2)"/>
<text x="160" y="246" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">two code paths</text>
<text x="480" y="246" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">one code path, replay to reprocess</text>
</svg>`,
        },
        {
          type: "table",
          title: "Lambda versus Kappa",
          headers: ["", "Lambda", "Kappa"],
          rows: [
            ["Processing paths", "Batch plus stream", "Stream only"],
            ["Reprocessing history", "Rerun the batch layer", "Replay the log into a new job and swap"],
            ["Code to maintain", "Same logic twice", "Once"],
            ["Requirements", "Batch framework, stream framework, merge logic", "Long log retention, a stream processor that handles replay and event time"],
            ["Proposed by", "Nathan Marz", "Jay Kreps"],
          ],
        },
        {
          type: "callout",
          tone: "modern",
          html: `<p>Since 2017 the gap between batch and stream has narrowed in the engines themselves. Apache Flink treats a bounded dataset as a stream that ends, Apache Beam offers one programming model for both, and Spark Structured Streaming runs the same DataFrame code incrementally. Kafka added tiered storage in its 3.x releases, moving old log segments to object storage so topics can retain long history cheaply, which makes Kappa-style replay more practical. Table formats such as Apache Iceberg and Delta Lake support both batch and streaming reads and writes of the same table.</p>`,
        },
      ],
    },
    {
      id: "unbundling-databases",
      title: "Unbundling the database",
      kicker: "Dataflow as architecture",
      blocks: [
        {
          type: "text",
          html: `<p>Look at what happens inside a relational database when you run <code>CREATE INDEX</code>. The database takes a consistent snapshot of the table, builds the index from it, then applies every write that happened during the build, and from then on keeps the index updated on every transaction. That is exactly the process of creating a new derived view by replaying a log and following it. A database's secondary indexes, materialized views and replication are all <strong>derived data</strong> maintained by internal dataflow.</p>
<p>Unbundling means doing the same thing across systems: treat a log of events as the shared backbone, and treat search indexes, caches, warehouses and specialised stores as indexes on it, each maintained by a stream processor. Adding a new kind of index becomes adding a consumer, not a dual write.</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "Federated databases (unify reads)", tone: "info", html: "One query interface over many stores, such as PostgreSQL foreign data wrappers or Trino querying several sources. Good for reading across systems, but it does nothing to keep their data consistent with each other." },
            { title: "Unbundled databases (unify writes)", tone: "ok", html: "Changes flow through an ordered log, and every store is kept in sync asynchronously by consumers, with idempotent writes so that failures can be retried. It solves the synchronization problem that federation ignores." },
          ],
        },
        {
          type: "text",
          html: `<h3>Application code as derivation functions</h3>
<p>Many derived datasets are not simple indexes: a feature-extraction step, a fraud score, a cache of rendered pages. In this model application code is a <strong>derivation function</strong>: it consumes changes and produces derived state. Think of a spreadsheet, where you change a cell and every formula depending on it updates automatically. That is the ideal for data systems too: declare how each view depends on its inputs and let the infrastructure keep it current.</p>
<p>This also changes how services interact. Suppose an order service needs exchange rates. The usual approach queries a currency service synchronously for each order, which adds latency and a runtime dependency. The dataflow approach subscribes to the stream of rate changes and keeps a local copy, so converting a price is a local lookup that keeps working if the currency service is down.</p>
<h3>The write path and the read path</h3>
<p>Every derived view divides work between a <strong>write path</strong>, done eagerly whenever input changes, and a <strong>read path</strong>, done lazily when someone asks. Indexes, caches and materialized views move that boundary: they do more work on writes so reads are cheaper.</p>`,
        },
        {
          type: "diagram",
          title: "Moving the boundary between write path and read path",
          caption: "With no index, writes are cheap and every read scans everything. Each step to the right does more work when data is written (indexing, caching, precomputing timelines) so that reads become cheaper.",
          svg: `<svg viewBox="0 0 640 190" role="img" aria-label="A spectrum from scanning on read to fully precomputed results, showing the trade-off between write and read cost">
<defs><marker id="ddia12-arrow3" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<text x="40" y="34" font-size="12" style="fill: var(--dg-muted)">boundary near writes: cheap writes, expensive reads</text>
<text x="600" y="58" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">boundary near reads: expensive writes, cheap reads</text>
<rect x="20" y="88" width="70" height="36" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="55" y="111" text-anchor="middle" font-size="13" font-weight="700">write</text>
<rect x="550" y="88" width="70" height="36" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="585" y="111" text-anchor="middle" font-size="13" font-weight="700">read</text>
<line x1="92" y1="106" x2="546" y2="106" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia12-arrow3)"/>
<circle cx="160" cy="106" r="7" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<circle cx="285" cy="106" r="7" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<circle cx="405" cy="106" r="7" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<circle cx="500" cy="106" r="7" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="160" y="146" text-anchor="middle" font-size="12">scan on read</text>
<text x="160" y="164" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">(no index)</text>
<text x="285" y="146" text-anchor="middle" font-size="12">full-text</text>
<text x="285" y="164" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">index</text>
<text x="405" y="146" text-anchor="middle" font-size="12">cache of</text>
<text x="405" y="164" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">common queries</text>
<text x="510" y="146" text-anchor="middle" font-size="12">precomputed</text>
<text x="510" y="164" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">timelines</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>Push the boundary all the way to the user's device and you get a familiar modern pattern: the client holds derived state locally (an offline-first app, a live dashboard) and the server pushes changes over a WebSocket or server-sent events instead of the client polling. The idea can go further: treat reads themselves as events, logged and routed through the same processors as writes, which gives a record of which data each decision was based on.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Kafka plus Debezium plus Elasticsearch", title: "Unbundling in practice", html: "A common stack: the primary database's changes stream through Kafka, and connectors maintain the search index, cache and warehouse as derived views." },
            { org: "Streaming databases", title: "Materialized views over streams", html: "Systems such as Materialize, RisingWave and ksqlDB let you declare a SQL view over streams and keep it incrementally up to date, close to the spreadsheet ideal." },
          ],
        },
        {
          type: "quiz",
          q: "Which statement best describes 'unbundling the database'?",
          options: [
            "Replacing all databases with a single Kafka cluster",
            "Using one query language to read from many databases",
            "Treating an ordered log as the backbone and maintaining specialised stores as derived views, the way a database maintains its own indexes",
            "Splitting a database into microservices that each call each other synchronously",
          ],
          answer: 2,
          explain: "The point is to compose specialised stores using the same dataflow techniques a single database uses internally for indexes and replication. The log carries changes in order; stores are derived from it. Federation (one query interface) unifies reads but does not keep stores in sync.",
        },
      ],
    },
    {
      id: "end-to-end-correctness",
      title: "Aiming for correctness: the end-to-end argument",
      kicker: "Correctness",
      blocks: [
        {
          type: "problem",
          html: `<p>Stream processors, brokers and databases each offer guarantees: exactly-once processing, idempotent producers, serializable transactions. It is tempting to assume that stacking them gives a correct system. It does not, because the guarantees stop at each component's boundary, and the failures that matter often happen between components.</p>`,
        },
        {
          type: "text",
          html: `<p>Consider a money transfer. A user clicks "pay"; the browser sends a request; the server runs a serializable transaction and commits; the response is lost on the way back. The user sees a timeout and clicks again. TCP deduplicates packets only within one connection, and this is a new connection. The database's transaction guarantee does not help, because from its point of view this is a new transaction. The money moves twice, and every layer behaved correctly.</p>
<p>This is an instance of the <strong>end-to-end argument</strong> (Saltzer, Reed and Clark, 1984): some properties can only be fully implemented with knowledge held by the endpoints of the communication. Lower layers can help with performance, but cannot guarantee correctness for the whole path. Duplicate suppression is the classic example.</p>`,
        },
        {
          type: "code",
          lang: "sql",
          title: "Duplicate suppression with an end-to-end request ID",
          code: `-- The client generates request_id once (for example a UUID when the form
-- is rendered) and resends the same ID on every retry.
BEGIN;
INSERT INTO requests (request_id, from_account, to_account, amount)
VALUES ('0286FDB8-...', 4321, 1234, 11.00);   -- unique constraint on request_id
UPDATE accounts SET balance = balance + 11.00 WHERE account_id = 1234;
UPDATE accounts SET balance = balance - 11.00 WHERE account_id = 4321;
COMMIT;
-- A retry with the same request_id violates the unique constraint,
-- so the transaction aborts and the transfer happens exactly once.`,
        },
        {
          type: "text",
          html: `<p>The <code>requests</code> table also acts as an event log: each row records an intent, and the balance updates are derived from it. Note what makes this work: an ID generated at the true origin of the request (the client), carried through every hop, and checked at the place the effect happens. No amount of infrastructure guarantee in the middle replaces that.</p>`,
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>"Our message broker has exactly-once semantics, so we don't need idempotency." The broker's guarantee covers messages inside it. A user double-clicking, a load balancer retrying, or a client SDK resending after a timeout all happen outside it. Put a request ID at the edge and deduplicate where the effect is applied.</p>`,
        },
        {
          type: "quiz",
          q: "Which design gives end-to-end protection against a payment being applied twice when a mobile app retries after a timeout?",
          options: [
            "Enable Kafka's idempotent producer between the API and the payment processor",
            "Use SERIALIZABLE isolation in the payments database",
            "Have the app generate a payment ID once, send it on every retry, and enforce uniqueness on it where the payment is recorded",
            "Use TCP keepalives so connections never drop",
          ],
          answer: 2,
          explain: "The duplicate originates at the client, so only an ID created there and checked where the effect is applied can catch it. The idempotent producer only removes duplicates between producer and broker, and serializable isolation treats each retry as a separate valid transaction.",
        },
      ],
    },
    {
      id: "enforcing-constraints",
      title: "Enforcing constraints without distributed transactions",
      kicker: "Correctness, part 2",
      blocks: [
        {
          type: "text",
          html: `<p>Some rules seem to demand coordination: a username must be unique, an account must not go negative, a seat must not be sold twice. In a log-based architecture these can still be enforced, by routing every request that could conflict to the same place.</p>
<h3>Uniqueness through a partitioned log</h3>
<p>Write every "claim username" request to a log partitioned by a hash of the username. One stream processor consumes each partition sequentially, keeps the set of taken names in local state, and emits "accepted" or "rejected" for each request. Because all claims for "alice" land in one partition and are processed one at a time, the first one wins deterministically. It scales by adding partitions, and needs no locks across machines. The client waits for its decision message to know the outcome.</p>
<h3>Multi-partition requests</h3>
<p>A transfer touches two accounts that may live in different partitions. Instead of an atomic commit across them, break it into steps that each touch one partition:</p>`,
        },
        {
          type: "steps",
          items: [
            "The client's transfer request, with a unique request ID, is appended to a request log, partitioned by request ID. Once that append succeeds, the request is durable and will be carried out.",
            "A processor reads the request, validates it once (for example, checks the payer's balance, if the payer's partition owns that state), and emits a debit instruction to the payer's partition and a credit instruction to the payee's partition, both tagged with the request ID.",
            "Each account's processor applies the instruction, deduplicating by request ID, so a crash and replay never applies it twice.",
            "Because the steps are deterministic and the log is durable, a crash at any point leads to the same outcome on replay. No two-phase commit is needed.",
          ],
        },
        {
          type: "diagram",
          title: "A transfer split into single-partition steps",
          caption: "The request is made durable once in a log keyed by its ID. A processor turns it into a debit and a credit on the two accounts' partitions. Every step is a single-partition append, and duplicates are dropped by request ID.",
          svg: `<svg viewBox="0 0 640 240" role="img" aria-label="A transfer request logged once and split into debit and credit instructions on two account partitions">
<defs><marker id="ddia12-arrow4" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="16" y="90" width="130" height="60" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="81" y="114" text-anchor="middle" font-size="12" font-weight="700">transfer $50</text>
<text x="81" y="134" text-anchor="middle" font-size="12">A to B, id r-91</text>
<rect x="175" y="90" width="130" height="60" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="240" y="114" text-anchor="middle" font-size="12" font-weight="700">request log</text>
<text x="240" y="134" text-anchor="middle" font-size="12">keyed by id</text>
<rect x="335" y="90" width="110" height="60" rx="8" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="2"/>
<text x="390" y="114" text-anchor="middle" font-size="12" font-weight="700">processor</text>
<text x="390" y="134" text-anchor="middle" font-size="12">validate, split</text>
<rect x="475" y="35" width="155" height="56" rx="8" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)" stroke-width="2"/>
<text x="552" y="58" text-anchor="middle" font-size="12" font-weight="700">account A partition</text>
<text x="552" y="78" text-anchor="middle" font-size="12">debit $50, id r-91</text>
<rect x="475" y="150" width="155" height="56" rx="8" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="552" y="173" text-anchor="middle" font-size="12" font-weight="700">account B partition</text>
<text x="552" y="193" text-anchor="middle" font-size="12">credit $50, id r-91</text>
<line x1="148" y1="120" x2="171" y2="120" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia12-arrow4)"/>
<line x1="307" y1="120" x2="331" y2="120" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia12-arrow4)"/>
<line x1="447" y1="108" x2="471" y2="72" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia12-arrow4)"/>
<line x1="447" y1="132" x2="471" y2="168" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia12-arrow4)"/>
<text x="320" y="230" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">no two-phase commit: each step appends to one partition</text>
</svg>`,
        },
        {
          type: "text",
          html: `<h3>Timeliness versus integrity</h3>
<p>"Consistency" hides two different requirements. <strong>Timeliness</strong> means users see an up-to-date state; a stale read is a timeliness problem, and it fixes itself once the system catches up. <strong>Integrity</strong> means the data is not corrupted: no lost or duplicated transfers, no derived view that contradicts its source. An integrity violation does not fix itself by waiting; it must be detected and repaired.</p>
<p>For most applications integrity matters far more. A credit card statement that omits yesterday's purchase for a few hours is normal; one that charges a purchase twice is not. The log-based approach above gives strong integrity (exactly-once effects through deterministic processing and deduplication) while relaxing timeliness (results arrive asynchronously), and that is the right trade for many systems.</p>
<h3>Loosely interpreted constraints</h3>
<p>Many business constraints are softer than they look. Airlines overbook and compensate passengers who are bumped; a shop that oversells apologises and offers a refund or a back-order; a bank may allow an overdraft and charge a fee. If a violation can be corrected later by a compensating action, it may be cheaper to check optimistically and apologise occasionally than to coordinate on every request. Strict, synchronous checks are needed only where an apology is not acceptable.</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "Coordinate synchronously", tone: "info", html: "Check the constraint inside a transaction or consensus round before confirming. Necessary when a violation is unacceptable or irreversible, such as moving money out of the system. Costs latency and availability." },
            { title: "Check asynchronously, compensate", tone: "ok", html: "Accept the request, validate in the stream, and issue a compensating action (refund, apology, cancellation) on the rare violation. Highly available and fast; acceptable when the business already has a process for mistakes." },
          ],
        },
        {
          type: "quiz",
          q: "A dashboard showing an account balance is two seconds behind the latest transaction. A separate bug occasionally applies a deposit twice. Which statement is correct?",
          options: [
            "Both are integrity problems",
            "Both are timeliness problems",
            "The lag is a timeliness issue that resolves on its own; the double deposit is an integrity violation that must be detected and fixed",
            "The lag is worse, because users notice it",
          ],
          answer: 2,
          explain: "Staleness heals as the derived view catches up. A duplicated deposit stays wrong forever unless something detects and repairs it, which is why systems should give up timeliness before integrity.",
        },
      ],
    },
    {
      id: "trust-but-verify",
      title: "Trust, but verify",
      kicker: "Auditing",
      blocks: [
        {
          type: "text",
          html: `<p>Every system model assumes some things never happen: that a disk does not silently flip bits, that fsync really persists data, that the database's isolation level works as documented. Mostly those assumptions hold, but "mostly" is not "always". Hardware corrupts data in memory and on disk occasionally; software, including mature databases, has bugs, as independent testing such as the Jepsen analyses keeps showing; and application code has far more bugs than either. Violations are rare enough that they are easy to ignore, and common enough at scale that they will happen to you.</p>
<p>The response is to <strong>audit</strong>: periodically check that the data is what it should be, instead of assuming the systems that produced it were correct. Financial systems have done this for centuries with double-entry bookkeeping and reconciliation.</p>`,
        },
        {
          type: "list",
          title: "Practical auditing techniques",
          items: [
            "<strong>Reconcile derived data with its source.</strong> Recompute counts and totals from the raw event log and compare with the warehouse, the search index or the cache.",
            "<strong>Rebuild and diff.</strong> Because derived views can be rebuilt by replaying the log, periodically rebuild one and compare it with the live version.",
            "<strong>Test your backups</strong> by actually restoring them; a backup that has never been restored is a hope, not a backup.",
            "<strong>Keep checksums end to end</strong>, so corruption introduced anywhere along the path is detected where data is read.",
            "<strong>Use tamper-evident logs</strong> where trust is in question: hash chains and Merkle trees let anyone verify that a log has only been appended to.",
          ],
        },
        {
          type: "text",
          html: `<p>Event-based designs make auditing easier. With a mutable database, a wrong value simply overwrites the right one and the evidence is gone; you can see that a balance is wrong but not why. With an immutable log of events and deterministic derivations, you can replay exactly what happened, find the event or code version that introduced the error, fix it and rebuild. Ideally, systems are <strong>self-validating</strong>: checking integrity continuously as part of normal operation, rather than relying on blind trust in components.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Certificate Transparency", title: "Verifiable logs", html: "Public logs of TLS certificates are built on Merkle trees (RFC 6962), so browsers and monitors can verify that a certificate was logged and that the log was never rewritten." },
            { org: "Storage systems", title: "Background scrubbing", html: "Filesystems such as ZFS and many distributed stores checksum every block and periodically read all data to detect silent corruption and repair it from replicas." },
          ],
        },
      ],
    },
    {
      id: "doing-the-right-thing",
      title: "Doing the right thing",
      kicker: "Ethics",
      blocks: [
        {
          type: "text",
          html: `<p>The book closes by reminding engineers that the data in these systems is largely about people: their behaviour, interests and identities. Technical choices about what to collect, how long to keep it and how to use it have consequences for those people, and "we built it to spec" is not a sufficient answer.</p>
<h3>Predictive analytics and bias</h3>
<p>Algorithms increasingly decide who gets a loan, an insurance policy, a job interview or extra police attention. A model trained on historical data learns the patterns in that data, including discrimination. Removing a protected attribute such as race does not help when other inputs (postcode, school, shopping habits) correlate with it. A model can be systematically unfair while appearing neutral, and its decisions are hard for the affected person to understand or appeal.</p>
<h3>Feedback loops</h3>
<p>Automated decisions change the world they then observe. Someone denied credit because a model rates them as risky may lose access to the opportunities that would have improved their record; the next round of training data then "confirms" the prediction. Recommendation systems can similarly narrow what people see until it reinforces what they already believed. Thinking about the whole system, including the people and the incentives in it, is part of engineering.</p>
<h3>Privacy and tracking</h3>
<p>Much data is collected as a by-product: the location history of a phone, the pages a person reads, who they message and when. Users rarely understand what is collected or how it is combined, and they cannot negotiate the terms. Kleppmann suggests a thought experiment: reread descriptions of data-driven products with the word "data" replaced by "surveillance", and see how they sound. Data is also a liability, because whatever you store can leak, be subpoenaed or be misused by a future owner of the company.</p>`,
        },
        {
          type: "list",
          title: "Questions to ask of a data system",
          items: [
            "Do we need this data at all, or could we solve the problem with less, or with aggregated or anonymised data?",
            "Did users meaningfully understand and agree to this use?",
            "How long do we keep it, and is deletion actually implemented, including in backups, logs and derived views?",
            "Have we tested the model's outcomes across groups, and who bears the cost when it is wrong?",
            "Could this system create a feedback loop that reinforces existing disadvantage?",
            "If this dataset leaked tomorrow, who would be harmed?",
          ],
        },
        {
          type: "callout",
          tone: "modern",
          html: `<p>Regulation has caught up with some of these concerns since the book appeared. The EU's General Data Protection Regulation took effect in May 2018, with rights of access, correction and erasure and limits on purpose and retention; California's Consumer Privacy Act took effect in 2020; and the EU AI Act, adopted in 2024, adds obligations for high-risk automated decision systems. For engineers this turns "can we delete one person's data from every derived store?" from an ethical aspiration into a legal requirement, which is one more argument for knowing exactly how each dataset is derived.</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "Collect everything, decide later", tone: "warn", html: "More signals for models and analytics, and flexibility for questions nobody has asked yet. But everything stored must be secured, retained under some policy, deletable on request, and it widens the harm of any leak or misuse." },
            { title: "Collect only what the purpose needs", tone: "ok", html: "Less to protect and delete, and easier compliance with privacy law. Some analyses become impossible or less accurate, which is a cost to weigh openly rather than avoid by default." },
          ],
        },
      ],
    },
    {
      id: "interview",
      title: "Using it in a design interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "text",
          html: `<p>This chapter is the synthesis that makes a senior design answer coherent. Whenever your design has more than one store (database, cache, search, warehouse), the interviewer will want to know how they stay consistent, what happens when a write fails halfway, and how you recover from a bug that corrupted data. The answers all come from here.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>A strong end-to-end answer:</p>
<ol>
<li><strong>Name the system of record</strong> and derive every other store from its ordered change log (CDC or events); no dual writes.</li>
<li><strong>Make every effect idempotent</strong> with a request ID generated at the client and checked where the effect is applied (end-to-end argument).</li>
<li><strong>Enforce constraints by partitioning:</strong> route conflicting requests to the same partition; split multi-entity operations into deduplicated single-partition steps; use synchronous coordination only where an apology is unacceptable.</li>
<li><strong>Prefer integrity over timeliness,</strong> and be explicit in the product about what may be stale.</li>
<li><strong>Plan reprocessing:</strong> retain the log so you can build a new view beside the old one, compare, and switch over (Kappa-style).</li>
<li><strong>Audit:</strong> reconcile derived data against the source and test restores.</li>
</ol>
<p>If the design handles personal data, mention minimisation, retention limits and how deletion propagates to derived stores.</p>`,
        },
        {
          type: "table",
          title: "Principles and how to apply them",
          headers: ["Principle", "In practice"],
          rows: [
            ["One ordered source of truth", "CDC from the primary database, or an event-sourced log"],
            ["Derived views are disposable", "Rebuild by replay; build new versions side by side"],
            ["End-to-end idempotence", "Client-generated request IDs, unique constraints, dedup by ID in consumers"],
            ["Constraints without 2PC", "Partition by the constrained key; single-partition steps"],
            ["Integrity before timeliness", "Asynchronous derivation, explicit staleness in the UI"],
            ["Trust but verify", "Reconciliation jobs, restore tests, checksums"],
          ],
        },
        {
          type: "quiz",
          q: "An interviewer asks how you would add a recommendations store to a system that already has PostgreSQL, Elasticsearch and a cache, without risking inconsistency. What is the best answer?",
          options: [
            "Add a fourth write in every API handler",
            "Have the recommendations service query PostgreSQL directly on every request",
            "Add a new consumer of the existing change stream, backfill it by replaying from a snapshot, compare its output, then route traffic to it",
            "Run a nightly batch export forever",
          ],
          answer: 2,
          explain: "Adding a derived view as a new consumer of the ordered change log avoids dual writes, lets it be built from history without touching the source, and allows a gradual cutover. That is the unbundled-database pattern in one move.",
        },
      ],
    },
  ],
  takeaways: [
    "Real systems compose specialised stores; keep them consistent by choosing one <strong>system of record</strong> and deriving the rest from its ordered log, not by dual writes.",
    "Derived views can be rebuilt by replay, which makes evolution safe: build the new view beside the old one and switch gradually.",
    "Lambda runs batch and stream paths and merges them; Kappa uses one stream path and replays the log to reprocess. Modern engines make the single-path approach practical.",
    "\"Unbundling the database\" applies the database's internal dataflow (indexes, materialized views) across systems, with application code as derivation functions.",
    "Correctness is end to end: generate a request ID at the client and deduplicate where the effect happens; infrastructure guarantees stop at component boundaries.",
    "Constraints can be enforced without distributed transactions by partitioning on the constrained key; favour <strong>integrity over timeliness</strong>, and compensate where the business allows.",
    "Audit continuously: reconcile, rebuild and diff, test restores. And treat the people behind the data as stakeholders: collect less, check for bias and feedback loops, implement deletion.",
  ],
  furtherReading: [
    { title: "End-to-End Arguments in System Design (Saltzer, Reed and Clark, 1984)", note: "The classic paper behind end-to-end duplicate suppression." },
    { title: "Questioning the Lambda Architecture (Jay Kreps, O'Reilly Radar, 2014)", note: "The case for a single stream-processing path with replay." },
    { title: "Turning the database inside out (Martin Kleppmann, 2014 talk)", note: "The talk that introduced many of this chapter's unbundling ideas." },
    { title: "RFC 6962: Certificate Transparency", url: "https://www.rfc-editor.org/rfc/rfc6962", note: "A practical example of verifiable, append-only logs." },
  ],
};
