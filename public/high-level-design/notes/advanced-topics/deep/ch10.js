// Deep dive: Chapter 10, Change data capture: keeping stores in sync without dual writes. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch10 = {
  hook: `<p>This chapter explains why writing to a database and a second store in the same request drifts apart, and how change data capture fixes it by making the database's own commit log the single feed every derived store follows.</p>`,
  sections: [
    {
      id: "dual-writes",
      title: "Why dual writes drift apart",
      kicker: "The problem",
      blocks: [
        {
          type: "text",
          html: `<p>Most systems have one source of truth and several <strong>derived stores</strong> (search index, cache, warehouse, another service). A <strong>dual write</strong> updates the database, then the other store, in the same request. The two writes aren't atomic, and three things go wrong:</p>`,
        },
        {
          type: "keypoints",
          items: [
            "<strong>Partial failure:</strong> the commit succeeds and the second write times out past its retries.",
            "<strong>Crash between writes:</strong> a deploy or OOM kill after the commit; no error to retry and no record of the miss.",
            "<strong>Races:</strong> two updates commit in one order and reach the second store in the other, so it keeps the older value. Neither write failed.",
          ],
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
          type: "text",
          html: `<p>Retries fix only the first. Two-phase commit could fix all three, but most search engines, caches and brokers don't support it, and it couples every store's availability. The inconsistency is silent and accumulates; the only repair is a full reindex. The fix is structural: <strong>commit each change in one place and derive everything else from that commit, in commit order</strong>.</p>`,
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
          html: `<p>Databases already keep an ordered, durable log of committed changes. <strong>Change data capture</strong> reads it and publishes each row change as an event. Only committed changes appear, a crashed reader resumes from its recorded position, and the order is commit order. Application code doesn't change.</p>`,
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
          type: "code",
          lang: "json",
          title: "A Debezium-style update event (topic shop.public.products, key {\"id\": 42}); op is c, u, d or r (snapshot read)",
          code: `{
  "op": "u",
  "before": { "id": 42, "name": "Standing desk", "price": 179 },
  "after":  { "id": 42, "name": "Standing desk", "price": 159 },
  "source": { "db": "shop", "table": "products", "lsn": 2894561, "txId": 7731 },
  "ts_ms": 1760362800000
}`,
        },
        {
          type: "keypoints",
          items: [
            "<strong>Debezium</strong> runs on Kafka Connect (which stores each connector's log position as an offset), writing one topic per table keyed by primary key; sink connectors apply topics to Elasticsearch, S3 and more.",
            "The <strong>source position</strong> (Postgres LSN, MySQL binlog offset) rises with commit order, so consumers can use it as a version.",
            "Postgres <code>before</code> images hold only the key unless <code>REPLICA IDENTITY FULL</code>; deletes are followed by a <strong>tombstone</strong> (null value) so log compaction can drop the key.",
            "<strong>Bootstrap:</strong> record a log position, read a consistent snapshot as of it (<code>op = r</code>), then stream from exactly that position. Netflix's DBLog and Debezium incremental snapshots interleave chunked reads with the live log using watermarks.",
          ],
        },
      ],
    },
    {
      id: "ordering-and-idempotency",
      title: "Ordering by key and idempotent consumers",
      kicker: "Correctness downstream",
      blocks: [
        {
          type: "text",
          html: `<p>Consumers need <strong>order per key</strong>, not global order. Partition events by primary key: each row's changes go to one Kafka partition, partitions preserve order, and each is read by one consumer in the group. Spread one row across partitions and the race returns. Delivery is <strong>at least once</strong> (positions are committed periodically), so consumers must be idempotent and ideally version-aware.</p>`,
        },
        {
          type: "code",
          lang: "python",
          title: "A version-aware consumer (Elasticsearch external versioning enforces the same rule)",
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
        },
        {
          type: "lab",
          id: "cdcOrdering",
          caption: "Twelve products, five updates each, flowing through a multi-partition topic with variable consumer delays and duplicate deliveries. Switch between keying by product ID and round-robin, and turn version checks on and off, to see which combinations end at v5 for every product.",
        },
        {
          type: "compare",
          items: [
            { title: "Keyed by primary key + version checks", tone: "ok", html: "Per-row order from the partition; duplicates and replays skipped by the position check. Every row converges to the database's final state." },
            { title: "Keyed by primary key, no version checks", tone: "warn", html: "Right in normal operation, but a replay can briefly reapply old events: usually harmless for full-row upserts, dangerous for increments." },
            { title: "Round-robin or wrong key", tone: "bad", html: "Updates to one row race across partitions, and an older version can overwrite a newer one permanently." },
          ],
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Consumers that apply <em>deltas</em> ("increment stock by 1") instead of <em>states</em> ("stock is now 17"). Under at-least-once delivery a duplicated increment is wrong forever; CDC events carry the full after-image, so set state.</p>`,
        },
      ],
    },
    {
      id: "outbox-and-operations",
      title: "Copy or intent, and operating CDC",
      kicker: "Choosing and running it",
      blocks: [
        {
          type: "text",
          html: `<p>CDC says what a row looks like now, not <em>why</em>: "status became cancelled" looks the same for a customer cancel, a stock-out or a fraud block, and it exposes your table layout. Use CDC when consumers need a <strong>copy</strong>; publish explicit domain events through a <strong>transactional outbox</strong> when they must <strong>react</strong>.</p>`,
        },
        {
          type: "steps",
          title: "The transactional outbox",
          items: [
            "In the same transaction as the business change, insert an <code>outbox</code> row: event type, entity ID and a versioned payload. Both commit or neither.",
            "A relay publishes outbox rows (CDC on the outbox table, or an ordered poller). Debezium's outbox event router routes them by aggregate type, keyed by aggregate ID.",
            "Mark or delete sent rows; consumers still deduplicate by event ID.",
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
          type: "keypoints",
          title: "Operating the pipeline",
          items: [
            "<strong>A stalled consumer can fill the primary's disk:</strong> a Postgres replication slot retains all unconfirmed WAL. Alert on slot lag (<code>pg_current_wal_lsn()</code> versus <code>confirmed_flush_lsn</code>), drop abandoned slots, and consider <code>max_slot_wal_keep_size</code> (Postgres 13+), which invalidates the slot instead.",
            "<strong>Schema changes:</strong> prefer additive changes and a schema registry with compatibility rules; keep the outbox for anything other teams depend on.",
            "<strong>Bursts:</strong> a ten-million-row <code>UPDATE</code> arrives as ten million events.",
            "<strong>Lag is the consistency window</strong> (typically seconds): read from the primary or update the UI optimistically when users must see their own write.",
            "<strong>Deletes, replays and failover:</strong> handle tombstones, keep consumers idempotent for reprocessing, and test reconnecting to a new primary.",
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
          type: "callout",
          tone: "interview",
          html: `<p>Raise CDC the moment you draw an arrow from the application to a second store. A strong answer covers:</p>
<ol>
<li><strong>Why not dual writes:</strong> partial failure, a crash between writes, and races; retries fix only the first.</li>
<li><strong>CDC:</strong> committed changes from the WAL or binlog (Debezium on Kafka Connect), published to a topic keyed by primary key.</li>
<li><strong>Bootstrap:</strong> consistent snapshot at a recorded log position, then stream from it.</li>
<li><strong>Downstream correctness:</strong> order per key via partitioning, at-least-once delivery, idempotent and version-aware consumers.</li>
<li><strong>Copy versus intent:</strong> CDC for mirrors; a transactional outbox for business events.</li>
<li><strong>Operations:</strong> slot lag can fill the disk, schema changes ripple downstream, bulk updates arrive as bursts.</li>
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
    "Dual writes fail through partial failure, crashes between writes and races that reorder updates; retries fix only the first.",
    "CDC reads the database's commit log (WAL, binlog, change streams, DynamoDB Streams), so derived stores see only committed changes, in order, resumably.",
    "Bootstrap with a consistent snapshot at a recorded log position, then stream from that position.",
    "Partition by primary key for per-row order, and make consumers idempotent and version-aware because delivery is at least once.",
    "CDC is for copies; use a transactional outbox for business intent, and watch replication-slot lag, schema changes, bursts and deletes.",
  ],
  furtherReading: [
    { title: "Debezium documentation", url: "https://debezium.io/documentation/", note: "Connector setup, the change event format, snapshots, incremental snapshots and the outbox event router." },
    { title: "Transactional outbox pattern (microservices.io)", url: "https://microservices.io/patterns/data/transactional-outbox.html", note: "A concise description of the outbox and its relay options." },
    { title: "All Aboard the Databus! (Das et al., SoCC 2012)", note: "LinkedIn's change-capture system and the problems of bootstrapping consumers." },
    { title: "DBLog: A Watermark Based Change-Data-Capture Framework (Andreakis and Papapanagiotou, Netflix)", note: "Interleaving chunked snapshots with the live log using watermarks." },
  ],
};
