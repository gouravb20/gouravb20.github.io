// Deep dive: Chapter 10, Change data capture: keeping stores in sync without dual writes. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch10 = {
  hook: `<p>A merchandiser drops the price of a desk from $199 to $179, then, a second later, to $159 to match a competitor. Postgres, the source of truth, ends at $159. The search index, updated by the same request handler right after the database write, ends at $179, because the two requests reached Elasticsearch in the opposite order. Customers filtering for "under $170" never see the desk. Nobody gets an error, and nothing in the logs says anything went wrong.</p>
<p>Multiply that by a cache that occasionally misses an invalidation, a warehouse export that skips rows when a job crashes, and a recommendations service with its own copy of the catalog, and you have the everyday reality of systems with more than one data store. Change data capture fixes the root cause: instead of the application telling every store about every change, the database's own commit log becomes the single feed that everything else follows.</p>`,
  sections: [
    {
      id: "dual-writes",
      title: "Why dual writes drift apart",
      kicker: "The problem",
      blocks: [
        {
          type: "problem",
          html: `<p>Almost every real system has one source of truth and several <strong>derived stores</strong>: a search index, a cache, a read model, an analytics warehouse, another team's service. The obvious way to keep them in sync is a <strong>dual write</strong>: the application writes the database and then writes the other system in the same request. It works in the demo and drifts in production.</p>`,
        },
        {
          type: "text",
          html: `<p>The two writes are not one atomic operation, and three distinct things go wrong:</p>
<ul>
<li><strong>Partial failure.</strong> The database commit succeeds and the Elasticsearch call times out. You can retry, but if retries are exhausted, or the second write is to a service that is down for an hour, the stores disagree.</li>
<li><strong>Crash between the writes.</strong> The process dies (deploy, out-of-memory kill, node failure) after the commit and before the second write. There is no error to retry; the change is simply never propagated, and nothing records that it was missed.</li>
<li><strong>Races.</strong> Two requests update the same row. They commit to the database in one order and reach the second store in the other order, so the second store keeps the older value. Retries cannot fix this, because neither write failed.</li>
</ul>
<p>Retries address only the first. Wrapping both writes in a distributed transaction (two-phase commit) could address all three, but most search engines, caches and brokers do not support it, and it couples the availability of every store together.</p>`,
        },
        {
          type: "diagram",
          title: "A race that no retry can fix",
          caption: "Request A sets the price to 179 and request B to 159. They commit to Postgres in the order A, B, but their Elasticsearch writes arrive as B, A. Both writes succeed, and the index is left with the stale price.",
          svg: `<svg viewBox="0 0 620 250" role="img" aria-label="Two concurrent dual writes reaching Postgres and Elasticsearch in opposite orders">
<defs><marker id="at10-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<text x="20" y="30" font-size="12" style="fill: var(--dg-muted)">Request A sets price = 179; request B sets price = 159 a moment later.</text>
<text x="20" y="94" font-size="13" font-weight="700">Postgres</text>
<text x="20" y="184" font-size="13" font-weight="700">Elasticsearch</text>
<line x1="130" y1="90" x2="520" y2="90" stroke-width="2" style="stroke: var(--dg-line)"/>
<line x1="130" y1="180" x2="520" y2="180" stroke-width="2" style="stroke: var(--dg-line)"/>
<line x1="200" y1="103" x2="456" y2="165" stroke-width="2" style="stroke: var(--dg-1)" marker-end="url(#at10-arrow)"/>
<line x1="320" y1="103" x2="378" y2="165" stroke-width="2" style="stroke: var(--dg-2)" marker-end="url(#at10-arrow)"/>
<rect x="170" y="77" width="60" height="26" rx="5" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="200" y="95" text-anchor="middle" font-size="12" font-weight="700">A: 179</text>
<rect x="290" y="77" width="60" height="26" rx="5" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="320" y="95" text-anchor="middle" font-size="12" font-weight="700">B: 159</text>
<rect x="350" y="167" width="60" height="26" rx="5" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="380" y="185" text-anchor="middle" font-size="12" font-weight="700">B: 159</text>
<rect x="430" y="167" width="60" height="26" rx="5" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="460" y="185" text-anchor="middle" font-size="12" font-weight="700">A: 179</text>
<rect x="530" y="74" width="80" height="32" rx="6" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)"/>
<text x="570" y="95" text-anchor="middle" font-size="12" font-weight="700">final 159</text>
<rect x="530" y="164" width="80" height="32" rx="6" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)"/>
<text x="570" y="185" text-anchor="middle" font-size="12" font-weight="700">final 179</text>
<line x1="130" y1="225" x2="510" y2="225" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#at10-arrow)"/>
<text x="130" y="243" font-size="12" style="fill: var(--dg-muted)">time</text>
</svg>`,
        },
        {
          type: "keypoints",
          items: [
            "Each failure leaves the stores silently inconsistent, and the inconsistency accumulates over months.",
            "There is no record of what was missed, so the only repair is a full reindex.",
            "The fix is structural: commit each change in exactly one place, and derive everything else from that commit, in commit order.",
          ],
        },
        {
          type: "quiz",
          q: "A team adds aggressive retries with exponential backoff to their dual write into Elasticsearch. Which failure mode remains?",
          options: [
            "Timeouts from Elasticsearch",
            "Brief network blips",
            "Concurrent updates arriving at Elasticsearch in a different order than they committed, and crashes between the two writes",
            "None; retries make dual writes safe",
          ],
          answer: 2,
          explain: "Retries handle transient failures of the second write. They do nothing when the process dies before the second write starts, and nothing when both writes succeed but in conflicting orders. Those need a single ordered source of changes.",
        },
      ],
    },
    {
      id: "reading-the-log",
      title: "CDC: follow the database's own log",
      kicker: "The key idea",
      blocks: [
        {
          type: "idea",
          html: `<p>Databases already keep an ordered, durable record of every committed change for crash recovery and replication. <strong>Change data capture</strong> (CDC) reads that log and publishes each committed row change as an event. The application writes only to the database; every derived store follows the log.</p>`,
        },
        {
          type: "text",
          html: `<p>This solves all three dual-write problems at once. A change appears in the log only if its transaction committed, so there are no phantom updates. If the CDC process crashes, it resumes from the last log position it recorded, so nothing is skipped. And the log is in commit order, so consumers that apply changes in log order (per row, at least) end up with the same final state as the database.</p>
<p>It also requires no change to application code. The service that updates prices does not know that search, cache and warehouse exist, which is a pleasant property when a fourth consumer shows up next quarter.</p>`,
        },
        {
          type: "table",
          title: "Where the changes come from",
          headers: ["Database", "Log", "How CDC reads it"],
          rows: [
            ["PostgreSQL", "Write-ahead log (WAL)", "Logical decoding through a replication slot, typically with the built-in pgoutput plugin"],
            ["MySQL / MariaDB", "Binary log (binlog)", "Act as a replica and read row-based binlog events (binlog_format = ROW)"],
            ["MongoDB", "Oplog", "Change streams (since 3.6), built on the oplog"],
            ["DynamoDB", "-", "DynamoDB Streams (24-hour retention) or Kinesis Data Streams"],
            ["SQL Server", "Transaction log", "Built-in CDC tables populated from the log"],
          ],
        },
        {
          type: "diagram",
          title: "A typical CDC pipeline",
          caption: "The application writes only to Postgres. Debezium, running on Kafka Connect, reads committed changes from a replication slot and publishes them to a Kafka topic keyed by primary key. Each derived store consumes the topic independently.",
          svg: `<svg viewBox="0 0 620 250" role="img" aria-label="CDC pipeline from Postgres through Debezium and Kafka to three consumers">
<defs><marker id="at10-flow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="20" y="12" width="120" height="36" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<text x="80" y="35" text-anchor="middle" font-size="12" font-weight="700">Application</text>
<line x1="80" y1="48" x2="80" y2="76" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#at10-flow)"/>
<text x="90" y="66" font-size="12" style="fill: var(--dg-muted)">one write</text>
<rect x="20" y="80" width="120" height="84" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="80" y="104" text-anchor="middle" font-size="12" font-weight="700">Postgres</text>
<text x="80" y="124" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">WAL</text>
<text x="80" y="142" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">replication slot</text>
<rect x="175" y="92" width="120" height="60" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="235" y="116" text-anchor="middle" font-size="12" font-weight="700">Debezium</text>
<text x="235" y="134" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">on Kafka Connect</text>
<rect x="330" y="50" width="120" height="140" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-4)" stroke-width="2"/>
<text x="390" y="72" text-anchor="middle" font-size="12" font-weight="700">Kafka topic</text>
<text x="390" y="88" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">keyed by id</text>
<g style="fill: var(--dg-4-soft); stroke: var(--dg-4)">
<rect x="345" y="100" width="90" height="20" rx="3"/><rect x="345" y="125" width="90" height="20" rx="3"/><rect x="345" y="150" width="90" height="20" rx="3"/>
</g>
<g font-size="12" text-anchor="middle"><text x="390" y="115">partition 0</text><text x="390" y="140">partition 1</text><text x="390" y="165">partition 2</text></g>
<rect x="490" y="40" width="120" height="40" rx="8" style="fill: var(--dg-5-soft); stroke: var(--dg-5)"/>
<text x="550" y="65" text-anchor="middle" font-size="12">Elasticsearch</text>
<rect x="490" y="100" width="120" height="40" rx="8" style="fill: var(--dg-5-soft); stroke: var(--dg-5)"/>
<text x="550" y="125" text-anchor="middle" font-size="12">Cache invalidator</text>
<rect x="490" y="160" width="120" height="40" rx="8" style="fill: var(--dg-5-soft); stroke: var(--dg-5)"/>
<text x="550" y="185" text-anchor="middle" font-size="12">Warehouse</text>
<line x1="140" y1="122" x2="173" y2="122" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#at10-flow)"/>
<line x1="295" y1="122" x2="328" y2="122" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#at10-flow)"/>
<line x1="450" y1="90" x2="488" y2="62" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#at10-flow)"/>
<line x1="450" y1="120" x2="488" y2="120" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#at10-flow)"/>
<line x1="450" y1="150" x2="488" y2="178" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#at10-flow)"/>
<text x="20" y="200" font-size="12" style="fill: var(--dg-muted)">Only committed changes,</text>
<text x="20" y="217" font-size="12" style="fill: var(--dg-muted)">in commit order, resumable</text>
<text x="20" y="234" font-size="12" style="fill: var(--dg-muted)">from a recorded log position</text>
</svg>`,
        },
        {
          type: "lab",
          id: "dualWrite",
          caption: "Push 10,000 product updates through dual writes and through CDC, with injected failures and concurrent requests. Count how many products end up with a different price in the index than in Postgres under each approach.",
        },
        {
          type: "realworld",
          items: [
            { org: "Debezium", title: "The standard open-source option", html: "A set of Kafka Connect source connectors (PostgreSQL, MySQL, MongoDB, SQL Server, Oracle and others) that tail the database log and write one topic per table, keyed by primary key. Debezium Server can also deliver to non-Kafka destinations, and an embedded engine runs inside a Java application." },
            { org: "Kafka Connect", title: "Source and sink connectors", html: "The framework stores each connector's log position as an offset, so a restarted connector resumes where it stopped. Sink connectors (for Elasticsearch, S3, JDBC databases and more) apply the topics to derived stores." },
            { org: "LinkedIn Databus", title: "An early large-scale design", html: "Described in a 2012 paper, Databus captured changes from LinkedIn's primary databases and fanned them out to search indexes, caches and other services, with a relay and a bootstrap service for consumers that fell behind." },
          ],
        },
      ],
    },
    {
      id: "change-events",
      title: "Change events and the snapshot-then-stream bootstrap",
      kicker: "How it works",
      blocks: [
        {
          type: "text",
          html: `<p>A change event describes one row change. Debezium's envelope is a good model: an operation code, the row <strong>before</strong> and <strong>after</strong> the change, and a <strong>source</strong> block saying exactly where in the log it came from.</p>`,
        },
        {
          type: "code",
          lang: "json",
          title: "A Debezium-style update event (topic shop.public.products, key {\"id\": 42})",
          code: `{
  "op": "u",
  "before": { "id": 42, "name": "Standing desk", "price": 179 },
  "after":  { "id": 42, "name": "Standing desk", "price": 159 },
  "source": { "db": "shop", "table": "products", "lsn": 2894561, "txId": 7731 },
  "ts_ms": 1760362800000
}`,
          caption: "op is c (create), u (update), d (delete) or r (a row read during a snapshot). For a delete, after is null.",
        },
        {
          type: "text",
          html: `<p>The <code>source</code> position matters more than it looks. The Postgres log sequence number (LSN) or the MySQL binlog file and offset increases monotonically with commit order, so consumers can use it as a version: an event with a lower position than what they have already applied is old news.</p>
<p>Two details trip people up. In Postgres, the <code>before</code> image of an update or delete contains only the primary key unless the table's <code>REPLICA IDENTITY</code> is set to <code>FULL</code>, which logs the whole old row at some WAL cost. And for deletes, Debezium by default follows the delete event with a <strong>tombstone</strong> (same key, null value), which tells Kafka's log compaction it may eventually drop every record for that key.</p>
<h3>Bootstrapping: snapshot, then stream</h3>
<p>A new consumer, say a brand-new search index, needs the rows that existed before it started, not just future changes. The log does not go back forever, so CDC tools combine two phases:</p>`,
        },
        {
          type: "steps",
          title: "Snapshot, then stream",
          items: [
            "Record the current log position (or create the replication slot, which pins it).",
            "Read every existing row in a consistent snapshot of the database as of that position, emitting each as a read event (<code>op = r</code>).",
            "Start streaming changes from the recorded position. Nothing committed after the snapshot is missed, and nothing in it is skipped.",
            "Later, to rebuild after a consumer bug, re-snapshot into a new index and switch over, with no downtime for the source.",
          ],
        },
        {
          type: "text",
          html: `<p>A classic snapshot of a huge table can take hours and holds the log position fixed meanwhile. Netflix's DBLog design (2019-2020) showed how to interleave small chunks of table reads with live log events using watermarks, so a snapshot can run incrementally, pause and resume. Debezium's incremental snapshots, triggered through a signalling table, use a similar watermark approach.</p>`,
        },
        {
          type: "quiz",
          q: "A consumer starts streaming changes from the current WAL position and only afterwards runs SELECT * on the products table to load existing rows. What can go wrong?",
          options: [
            "Nothing; the order of these steps does not matter",
            "Without tying the snapshot to a recorded log position, a change can fall into the gap or be applied out of order, for example an older snapshot row overwriting a newer streamed update",
            "The SELECT will fail because the table is being replicated",
            "The WAL will be deleted before streaming starts",
          ],
          answer: 1,
          explain: "The snapshot and the stream must meet at a known log position. If the snapshot reads a row after a streamed update was already applied but from a stale view, or between two positions, the consumer can overwrite a newer value with an older one or miss a change. CDC tools take the snapshot consistently at a recorded position and then stream from exactly that position.",
        },
      ],
    },
    {
      id: "ordering-and-idempotency",
      title: "Ordering by key and idempotent consumers",
      kicker: "Correctness downstream",
      blocks: [
        {
          type: "problem",
          html: `<p>The log is totally ordered, but a single ordered stream does not scale: one consumer thread would apply every change in the company. As soon as you parallelize, you have to decide what order you still need, and you have to cope with the same event arriving twice.</p>`,
        },
        {
          type: "text",
          html: `<p>The answer is <strong>order per key</strong>. A consumer needs updates to product 42 applied in order; it does not care whether product 42's update lands before or after product 77's. So events are partitioned by primary key: all changes to a row go to the same Kafka partition, partitions preserve order, and each partition is read by exactly one consumer in the group. Different rows proceed in parallel across partitions.</p>
<p>Break that rule and the old race returns. If updates to product 42 were spread across partitions (round-robin, or keyed by something else), v4 on a fast partition can be applied after v5 on a slow one, and the index ends at v4.</p>
<h3>At-least-once delivery</h3>
<p>Connectors and consumers commit their positions periodically. After a crash or a rebalance they resume from the last committed position, so some events are delivered again. Duplicates are normal, not exceptional. A consumer must therefore be <strong>idempotent</strong> (applying an event twice equals applying it once) and ideally <strong>version-aware</strong> (an older event never overwrites a newer state).</p>`,
        },
        {
          type: "code",
          lang: "python",
          title: "A version-aware consumer",
          code: `def apply(event):
    key = event["key"]["id"]
    pos = event["source"]["lsn"]
    doc = index.get(key)
    if doc is not None and doc["_src_pos"] >= pos:
        return                                  # duplicate or out-of-date: skip
    if event["op"] == "d":
        index.delete(key)                       # keep a tombstone with pos if deletes can race
    else:
        index.put(key, {**event["after"], "_src_pos": pos})`,
          caption: "Upsert by key, and compare log positions. Elasticsearch can enforce the same rule itself with external versioning, rejecting writes whose version is not higher than the stored one.",
        },
        {
          type: "lab",
          id: "cdcOrdering",
          caption: "Twelve products, five updates each, flowing through a multi-partition topic with variable consumer delays and duplicate deliveries. Switch between keying by product ID and round-robin, and turn version checks on and off, to see which combinations end at v5 for every product.",
        },
        {
          type: "compare",
          items: [
            { title: "Keyed by primary key + version checks", tone: "ok", html: "Per-row order is preserved by the partition, and duplicates or replays are skipped by the position check. Every row converges to the database's final state." },
            { title: "Keyed by primary key, no version checks", tone: "warn", html: "Order is right in normal operation, but a replay after a crash can briefly reapply old events; usually harmless for full-row upserts, dangerous for increments." },
            { title: "Round-robin or wrong key", tone: "bad", html: "Updates to one row race across partitions, and an older version can overwrite a newer one permanently." },
          ],
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Consumers that apply <em>deltas</em> ("increment stock by 1") instead of <em>states</em> ("stock is now 17"). Under at-least-once delivery, a duplicated increment is a wrong number forever. CDC events carry the full after-image, so write consumers that set state, not ones that accumulate it.</p>`,
        },
      ],
    },
    {
      id: "copy-vs-intent",
      title: "Copy or intent: CDC versus the transactional outbox",
      kicker: "Choosing the pattern",
      blocks: [
        {
          type: "text",
          html: `<p>CDC tells consumers what a row looks like now. It does not tell them <em>why</em>. An event saying <code>orders.status</code> changed to <code>cancelled</code> looks the same whether the customer cancelled, the warehouse ran out of stock or fraud detection blocked the order, and those three cases need very different reactions. CDC events also expose your table layout: rename a column and every consumer breaks.</p>
<p>That gives a simple test. If consumers need a <strong>copy of the data</strong> (a search index, a cache, a warehouse, a read model), use CDC. If they need to <strong>react to a business event</strong> (email the customer, issue a refund, notify a partner), publish explicit domain events, and publish them atomically with the transactional outbox.</p>`,
        },
        {
          type: "steps",
          title: "The transactional outbox",
          items: [
            "In the same database transaction as the business change, insert a row into an <code>outbox</code> table describing the event: its type, the entity ID and a payload in a stable, versioned schema.",
            "The transaction commits both or neither, so the event exists if and only if the change happened. No dual write.",
            "A relay publishes outbox rows to the broker: either CDC on the outbox table or a poller that reads unsent rows in order.",
            "Published rows are deleted or marked sent. Consumers still deduplicate by event ID, because the relay delivers at least once.",
          ],
        },
        {
          type: "code",
          lang: "sql",
          title: "Business change and event in one transaction",
          code: `BEGIN;
UPDATE orders SET status = 'cancelled', cancelled_at = now() WHERE id = 991;
INSERT INTO outbox (id, aggregate_type, aggregate_id, event_type, payload)
VALUES (gen_random_uuid(), 'order', 991, 'OrderCancelledByCustomer',
        '{"orderId": 991, "refund": true, "schemaVersion": 2}');
COMMIT;`,
        },
        {
          type: "table",
          title: "Ways to keep a second system in sync",
          headers: ["Approach", "Consistency", "Carries intent?", "Use when"],
          rows: [
            ["Dual write", "Diverges on failure, crash or race", "Yes", "Avoid"],
            ["CDC from the log", "Eventually consistent, ordered per key", "No: row changes", "Consumers need a copy"],
            ["Transactional outbox", "Atomic with the write, delivered eventually", "Yes: domain events", "Consumers react to events"],
            ["Batch export (ETL)", "Hours stale", "No", "Nightly analytics"],
          ],
        },
        {
          type: "realworld",
          items: [
            { org: "Debezium", title: "Outbox event router", html: "Debezium ships a single message transformation that turns CDC events from an outbox table into clean domain events, routing each to a topic based on the aggregate type and using the aggregate ID as the message key. The outbox pattern and CDC end up working together." },
            { org: "Schema registries", title: "Guarding the contract", html: "Tools such as Confluent Schema Registry store Avro, Protobuf or JSON schemas per topic and reject producer changes that break the configured compatibility rule, which catches a dropped column before it breaks consumers." },
          ],
        },
        {
          type: "quiz",
          q: "When an order is cancelled, the billing service must refund the customer only if the customer initiated the cancellation. How should billing learn about it?",
          options: [
            "Consume CDC events from the orders table and refund whenever status becomes 'cancelled'",
            "Have the order service write an OrderCancelledByCustomer event to an outbox in the same transaction, relayed to the broker",
            "Have the order service call billing's API right after committing",
            "Run a nightly batch job that compares the two databases",
          ],
          answer: 1,
          explain: "Billing needs intent, not a row copy: a status column does not say who cancelled. A direct API call is a dual write with all its failure modes. The outbox commits the business change and an explicit, stable event atomically, and the relay delivers it reliably.",
        },
      ],
    },
    {
      id: "operating-cdc",
      title: "Operating a CDC pipeline",
      kicker: "Failure modes",
      blocks: [
        {
          type: "text",
          html: `<p>Interviewers who hear "we'll use CDC" usually follow up with "what goes wrong?" The pipeline has a small number of well-known failure modes, and naming them with their mitigations is what separates a sketch from a design.</p>
<h3>A stalled consumer can fill the database's disk</h3>
<p>A Postgres replication slot guarantees the WAL a consumer has not yet confirmed is kept. That is what makes CDC lossless, and also what makes it dangerous: if the connector stops (crashed, misconfigured, paused for a migration), Postgres keeps every WAL segment from that point on, and the primary database's disk fills. Monitor slot lag, for example the difference between <code>pg_current_wal_lsn()</code> and the slot's <code>confirmed_flush_lsn</code> in <code>pg_replication_slots</code>, alert on it, and drop abandoned slots. Since Postgres 13, <code>max_slot_wal_keep_size</code> caps how much WAL a slot can retain, trading a full disk for an invalidated slot that needs a re-snapshot.</p>
<h3>Schema changes</h3>
<p>Renaming or dropping a column changes every event on that table. Prefer additive changes (add the new column, backfill, migrate consumers, drop the old one later), register schemas with compatibility rules, and keep the outbox for anything other teams depend on.</p>`,
        },
        {
          type: "keypoints",
          title: "More things to plan for",
          items: [
            "<strong>Bursts:</strong> a bulk <code>UPDATE</code> of ten million rows arrives as ten million events at once. Expect lag spikes and size consumers and partitions for them.",
            "<strong>Lag is the consistency window:</strong> derived stores are eventually consistent, typically seconds behind. If a user must see their own write in search immediately, read from the primary or show the change optimistically in the UI.",
            "<strong>Deletes:</strong> consumers must handle delete events and tombstones, or deleted products stay searchable forever.",
            "<strong>Replays:</strong> a consumer bug fix often means reprocessing from an earlier offset or re-snapshotting, so idempotency is not optional.",
            "<strong>Failover:</strong> after a primary database fails over, the CDC connector must reconnect to the new primary and resume from a valid position; test this before you need it.",
          ],
        },
        {
          type: "realworld",
          title: "What teams use CDC for",
          items: [
            { org: "Search and caches", html: "Keeping Elasticsearch or OpenSearch indexes in sync with a relational catalog, and invalidating or refreshing cache entries when rows change." },
            { org: "Analytics", html: "Streaming operational tables into a warehouse or lake continuously instead of nightly exports, often through Kafka into object storage." },
            { org: "Migrations and microservices", html: "Replicating a table into a new database or service while the old one stays live, so traffic can move over without downtime; and sharing reference data between services without direct database access." },
          ],
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p>CDC makes derived stores <em>eventually</em> consistent, not instantly consistent. Say how long "eventually" is expected to be (seconds under normal load), what users see in the meantime, and what alert fires when lag grows.</p>`,
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
          html: `<p>CDC belongs in any design where a database feeds a search index, cache, warehouse or another service: e-commerce search, a social feed's read model, analytics pipelines. Raise it the moment you draw an arrow from the application to a second store.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>A strong answer covers:</p>
<ol>
<li><strong>Why not dual writes:</strong> partial failure, a crash between writes, and races between concurrent requests; retries fix only the first.</li>
<li><strong>CDC:</strong> read committed changes from the WAL or binlog (Debezium on Kafka Connect), publish to a topic keyed by primary key.</li>
<li><strong>Bootstrap:</strong> consistent snapshot at a recorded log position, then stream from it.</li>
<li><strong>Correctness downstream:</strong> order per key via partitioning, at-least-once delivery, idempotent and version-aware consumers.</li>
<li><strong>Copy versus intent:</strong> CDC for mirrors; a transactional outbox for business events.</li>
<li><strong>Operations:</strong> replication-slot lag can fill the disk, schema changes ripple downstream, bulk updates arrive as bursts.</li>
</ol>`,
        },
        {
          type: "quiz",
          q: "Your CDC connector for Postgres has been down for six hours over a weekend. What is the most urgent risk?",
          options: [
            "The search index will be permanently missing six hours of changes",
            "The replication slot has kept six hours of WAL on the primary, which may be close to filling its disk",
            "Kafka will have deleted the topic",
            "Postgres has stopped accepting writes because the connector is down",
          ],
          answer: 1,
          explain: "The slot guarantees no changes are lost: when the connector returns it will resume and catch up, so the index is stale but recoverable. The real danger is on the primary, where retained WAL keeps growing until the disk fills and the database stops. Monitor slot lag, and consider max_slot_wal_keep_size as a safety cap.",
        },
      ],
    },
  ],
  takeaways: [
    "Dual writes fail in three ways: partial failure, a crash between the writes, and races that reorder concurrent updates. Retries fix only the first.",
    "CDC reads the database's own commit log (Postgres WAL, MySQL binlog, MongoDB change streams, DynamoDB Streams), so derived stores see only committed changes, in order, resumably.",
    "Debezium on Kafka Connect publishes one topic per table keyed by primary key, with before and after images and the source log position.",
    "Bootstrap new consumers with a consistent snapshot at a recorded log position, then stream from that position.",
    "Partition by primary key for per-row order, and make consumers idempotent and version-aware because delivery is at least once.",
    "CDC is for copies; when consumers need business intent, use a transactional outbox with stable event schemas.",
    "Watch replication-slot lag (it can fill the primary's disk), plan for schema changes, bursts and deletes.",
  ],
  furtherReading: [
    { title: "Debezium documentation", url: "https://debezium.io/documentation/", note: "Connector setup, the change event format, snapshots, incremental snapshots and the outbox event router." },
    { title: "Transactional outbox pattern (microservices.io)", url: "https://microservices.io/patterns/data/transactional-outbox.html", note: "A concise description of the outbox and its relay options." },
    { title: "All Aboard the Databus! (Das et al., SoCC 2012)", note: "LinkedIn's change-capture system and the problems of bootstrapping consumers." },
    { title: "DBLog: A Watermark Based Change-Data-Capture Framework (Andreakis and Papapanagiotou, Netflix)", note: "Interleaving chunked snapshots with the live log using watermarks." },
  ],
};
