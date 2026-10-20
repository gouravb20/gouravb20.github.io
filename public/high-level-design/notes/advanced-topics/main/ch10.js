// Main tab: Chapter 10, Change data capture. Format: DeepSection[] in public/shared/notes.d.ts.
window.MAIN = window.MAIN || {};
MAIN.ch10 = [
  {
    id: `dual-writes`,
    title: `Why writing to every store from the app goes wrong`,
    kicker: `The problem`,
    blocks: [
      { type: `text`, html: `<p>Most real systems keep copies of the same data in several places. Products live in Postgres, but search runs on Elasticsearch, a cache holds hot product pages, and the warehouse wants every change for analytics. The obvious approach is a <strong>dual write</strong>: the request handler writes to the database, then to each other store. It works in a demo and drifts in production, for three separate reasons.</p>` },
      { type: `list`, items: [
        `<strong>Partial failure.</strong> The database write succeeds and the Elasticsearch write times out. Retries help, until the retry budget runs out.`,
        `<strong>Crashes.</strong> The process dies between the two writes. The second write never happens and nothing records that it was owed.`,
        `<strong>Races.</strong> Two requests update the same product. Request A writes price 199 to the database, request B writes 179, then B reaches Elasticsearch first and A second. The database says 179, search says 199, and no retry can fix it because each write succeeded.`,
      ] },
      { type: `text`, html: `<p>The stores slowly diverge, and there is no record of why. The fix is to commit a change in exactly one place and have every other store follow from it.</p>` },
    ],
  },
  {
    id: `how-cdc-works`,
    title: `CDC: follow the database's own log`,
    kicker: `Mechanics`,
    blocks: [
      { type: `text`, html: `<p>Every serious database already records each committed change in order, for crash recovery and replication: the WAL in Postgres, the binlog in MySQL, the oplog in MongoDB. <strong>Change data capture</strong> reads that log and publishes each committed row change as an event. The log contains only committed changes, is already in commit order, and needs no change to application code.</p>` },
      { type: `steps`, title: `A typical pipeline`, items: [
        `The application writes to the database as normal. Nothing else.`,
        `A connector such as Debezium reads the log (for Postgres, through a logical replication slot).`,
        `It publishes one event per row change to a Kafka topic per table, keyed by primary key. Each event carries the operation, the row before and after, and its log position.`,
        `Consumers apply the events: an Elasticsearch sink upserts documents, a cache consumer invalidates keys, a warehouse loader appends history.`,
        `A new consumer first takes a consistent snapshot of the existing rows, notes the log position, then streams changes from that point. The same procedure rebuilds an index after a bug.`,
      ] },
    ],
  },
  {
    id: `ordering-and-idempotency`,
    title: `Ordering by key and idempotent consumers`,
    kicker: `Correctness`,
    blocks: [
      { type: `text`, html: `<p>CDC removes the dual-write race only if consumers apply changes to a row in the order they were committed. Two rules get you there, and interviewers usually probe both.</p>` },
      { type: `keypoints`, items: [
        `<strong>Partition by primary key.</strong> All changes to product 42 go to the same partition, which one consumer reads in order. Changes to different products spread across partitions and are processed in parallel.`,
        `<strong>Expect duplicates.</strong> Connectors and consumers retry, so delivery is at least once. Consumers should upsert by key rather than blindly insert.`,
        `<strong>Check versions.</strong> Store the source log position (or a row version) with each downstream document and ignore any event older than what is already applied. Replays and stray reorderings then become harmless.`,
      ] },
      { type: `callout`, tone: `tip`, title: `Back to the race`, html: `<p>With CDC, the two price updates appear in the log in commit order, 199 then 179, both keyed by product 42, so they land in one partition in that order. Even if 199 is redelivered later, its log position is older than the stored one and the consumer skips it. Search ends at 179, matching the database.</p>` },
    ],
  },
  {
    id: `copy-or-intent`,
    title: `Copy or intent: CDC versus the outbox`,
    kicker: `Decision rule`,
    blocks: [
      { type: `text`, html: `<p>CDC tells consumers the new state of a row, not why it changed. A row whose status becomes "cancelled" doesn't say whether the customer cancelled or fraud detection did, and every consumer is now coupled to your table layout. That gives a simple test.</p>` },
      { type: `compare`, items: [
        { title: `Consumers need a copy: use CDC`, tone: `ok`, html: `<p>Search indexes, caches, read models and warehouses just mirror data. Row-level changes are exactly what they need, and the application stays untouched.</p>` },
        { title: `Consumers react to events: use an outbox`, tone: `info`, html: `<p>Sending an email, issuing a refund or notifying a partner needs business meaning. In the same transaction as the business change, insert an event row such as OrderCancelledByCustomer into an <strong>outbox table</strong>. A relay, often CDC on that table, publishes it. The event is atomic with the change and has a stable contract.</p>` },
      ] },
      { type: `keypoints`, title: `Operational questions to answer`, items: [
        `<strong>Stalled connector:</strong> a Postgres replication slot keeps WAL until it is read, so a stuck connector can fill the disk. Monitor slot lag and alert on it.`,
        `<strong>Schema changes:</strong> renaming or dropping a column changes every event. Use a schema registry and prefer additive changes.`,
        `<strong>Bursts:</strong> a bulk update or backfill arrives as a flood of events and a lag spike downstream.`,
        `<strong>Deletes:</strong> consumers must handle delete events and tombstones, or deleted rows live on in search.`,
      ] },
      { type: `callout`, tone: `interview`, title: `What to say`, html: `<p>"I won't dual-write. The database is the source of truth; Debezium streams its WAL to Kafka keyed by primary key, and an idempotent, version-checking consumer keeps Elasticsearch in sync. Search is eventually consistent, typically within a second or two. For business events like order cancellations I'd use a transactional outbox so consumers get intent, not just a row." Then mention replication-slot lag as the thing you would monitor.</p>` },
    ],
  },
];
