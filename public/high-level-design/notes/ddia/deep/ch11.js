// Deep dive: DDIA Chapter 11, Stream Processing. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch11 = {
  hook: `<p>Your fraud team runs a batch job every night that flags suspicious card payments. It works well, except that a stolen card can be used for 20 hours before anyone notices, and by then the money is gone. The team asks for the same rules to run "as payments happen". At the same time, the search team complains that products updated in the database take an hour to show up in search results, because their index is rebuilt by a batch job too.</p>
<p>Both requests have the same shape: the input never ends. Payments and product edits arrive continuously, and waiting for a day's worth to accumulate is too slow. Stream processing is batch processing with the boundaries removed: process each event shortly after it happens. This chapter covers how events are transported (message brokers and logs), how databases themselves become streams (change data capture and event sourcing), and how to compute correct results over data that is infinite, late and out of order.</p>`,
  sections: [
    {
      id: "events-and-brokers",
      title: "Events and message brokers",
      kicker: "Transmitting streams",
      blocks: [
        {
          type: "text",
          html: `<p>In stream processing the unit of data is an <strong>event</strong>: a small, self-contained, immutable record that something happened at a particular time. "User 42 viewed /pricing at 10:00:03", "payment 981 authorised", "sensor 7 read 21.4&deg;C". A <strong>producer</strong> generates the event once; any number of <strong>consumers</strong> may process it. Related events are grouped into a topic or stream.</p>
<p>A consumer could poll a database for new rows, but polling frequently is expensive and polling rarely adds latency. It is better for consumers to be notified when new events appear, and a general-purpose database is not built for that. Specialised <strong>messaging systems</strong> are. Two questions distinguish them:</p>
<ul>
<li><strong>What if producers send faster than consumers can process?</strong> The system can drop messages, buffer them in a queue (and then: what happens when the buffer fills, and does it spill to disk?), or apply <strong>backpressure</strong>, blocking the producer until the consumer catches up, as Unix pipes and TCP do.</li>
<li><strong>What if a node crashes?</strong> Are messages lost? Durability requires writing to disk or replicating, which costs throughput. Losing a few sensor readings may be fine; losing a payment is not.</li>
</ul>`,
        },
        {
          type: "text",
          html: `<h3>Traditional message brokers</h3>
<p>Some systems send messages directly from producer to consumer: UDP multicast for market data feeds, brokerless libraries such as ZeroMQ, or webhooks, where a service calls a URL you registered. These are fast but lose messages when a consumer is offline.</p>
<p>A <strong>message broker</strong> is a server that sits in between and absorbs the difference: producers write to it, consumers read from it, and either side can come and go. Brokers following the JMS and AMQP standards (RabbitMQ, ActiveMQ, and cloud services such as Amazon SQS work similarly) share a common model. A message is delivered to a consumer, the consumer <strong>acknowledges</strong> it once processed, and the broker then deletes it. If a consumer dies without acknowledging, the broker redelivers the message to another consumer. Queues are expected to be short-lived; brokers are optimized for messages that leave quickly.</p>`,
        },
        {
          type: "compare",
          title: "Two delivery patterns with multiple consumers",
          items: [
            { title: "Load balancing (competing consumers)", tone: "info", html: "Each message goes to <em>one</em> of the consumers. Useful when processing is expensive and you want to add workers to share it, such as a queue of image-resizing jobs." },
            { title: "Fan-out (publish/subscribe)", tone: "info", html: "Each message goes to <em>all</em> subscribers, so independent systems (billing, analytics, email) each get their own copy. In AMQP this is done with exchanges bound to several queues." },
          ],
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p>Load balancing plus redelivery breaks ordering. Suppose consumer 1 takes message m3 and crashes while consumer 2 is busy with m4. The broker redelivers m3 to consumer 2, which now processes m4 before m3. If the messages are causally related ("create order" then "cancel order"), that reordering is a bug. Avoid it by giving each consumer its own queue, or by using a log-based broker, below.</p>`,
        },
      ],
    },
    {
      id: "log-based-brokers",
      title: "Log-based message brokers",
      kicker: "Kafka and friends",
      blocks: [
        {
          type: "idea",
          html: `<p>Instead of deleting messages once they are consumed, append every message to a durable <strong>log</strong> on disk and let consumers keep track of how far they have read. Reading does not change the log, so any number of consumers can read it at their own pace, and a consumer can go back and read it again.</p>`,
        },
        {
          type: "text",
          html: `<p>A single log on a single machine would limit throughput, so a topic is split into <strong>partitions</strong>, each an independent append-only log hosted (and replicated) on different machines. Within a partition, every message gets a monotonically increasing <strong>offset</strong>, and order is guaranteed. Across partitions there is no ordering. Producers choose the partition, usually by hashing a key such as the user ID, so all events for one key are kept in order.</p>
<p>Consumers join a <strong>consumer group</strong>, and the broker assigns each partition to exactly one consumer in the group. That consumer reads the partition sequentially, and periodically records its offset. If it dies, another consumer takes over the partition from the last recorded offset, so messages after that offset may be processed twice, but none are skipped. The broker does not need to track acknowledgements per message, only one number per partition per group, which is a big reason log-based brokers reach very high throughput.</p>`,
        },
        {
          type: "diagram",
          title: "A partitioned log with consumer offsets",
          caption: "Each partition is an ordered log of offsets. Consumer groups A and B read partition 0 independently, each at its own offset; within group A, each partition is owned by exactly one consumer.",
          svg: `<svg viewBox="0 0 640 250" role="img" aria-label="A topic with three partitions, two consumer groups at different offsets, and consumers owning partitions">
<text x="16" y="24" font-size="13" font-weight="700">Topic "page-views", 3 partitions</text>
<text x="16" y="62" font-size="12">partition 0</text>
<text x="16" y="137" font-size="12">partition 1</text>
<text x="16" y="212" font-size="12">partition 2</text>
<rect x="110" y="40" width="36" height="34" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/><text x="128" y="62" text-anchor="middle" font-size="12">0</text>
<rect x="148" y="40" width="36" height="34" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/><text x="166" y="62" text-anchor="middle" font-size="12">1</text>
<rect x="186" y="40" width="36" height="34" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/><text x="204" y="62" text-anchor="middle" font-size="12">2</text>
<rect x="224" y="40" width="36" height="34" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/><text x="242" y="62" text-anchor="middle" font-size="12">3</text>
<rect x="262" y="40" width="36" height="34" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/><text x="280" y="62" text-anchor="middle" font-size="12">4</text>
<rect x="300" y="40" width="36" height="34" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/><text x="318" y="62" text-anchor="middle" font-size="12">5</text>
<rect x="338" y="40" width="36" height="34" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/><text x="356" y="62" text-anchor="middle" font-size="12">6</text>
<rect x="376" y="40" width="36" height="34" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/><text x="394" y="62" text-anchor="middle" font-size="12">7</text>
<rect x="414" y="40" width="36" height="34" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/><text x="432" y="62" text-anchor="middle" font-size="12">8</text>
<path d="M196 88 L212 88 L204 78 z" style="fill: var(--dg-2)"/>
<text x="204" y="102" text-anchor="middle" font-size="12" style="fill: var(--dg-2)">group B at 2</text>
<path d="M386 88 L402 88 L394 78 z" style="fill: var(--dg-3)"/>
<text x="394" y="102" text-anchor="middle" font-size="12" style="fill: var(--dg-3)">group A at 7</text>
<rect x="110" y="115" width="36" height="34" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/><text x="128" y="137" text-anchor="middle" font-size="12">0</text>
<rect x="148" y="115" width="36" height="34" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/><text x="166" y="137" text-anchor="middle" font-size="12">1</text>
<rect x="186" y="115" width="36" height="34" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/><text x="204" y="137" text-anchor="middle" font-size="12">2</text>
<rect x="224" y="115" width="36" height="34" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/><text x="242" y="137" text-anchor="middle" font-size="12">3</text>
<rect x="262" y="115" width="36" height="34" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/><text x="280" y="137" text-anchor="middle" font-size="12">4</text>
<rect x="300" y="115" width="36" height="34" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/><text x="318" y="137" text-anchor="middle" font-size="12">5</text>
<rect x="110" y="190" width="36" height="34" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/><text x="128" y="212" text-anchor="middle" font-size="12">0</text>
<rect x="148" y="190" width="36" height="34" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/><text x="166" y="212" text-anchor="middle" font-size="12">1</text>
<rect x="186" y="190" width="36" height="34" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/><text x="204" y="212" text-anchor="middle" font-size="12">2</text>
<rect x="224" y="190" width="36" height="34" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/><text x="242" y="212" text-anchor="middle" font-size="12">3</text>
<rect x="262" y="190" width="36" height="34" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/><text x="280" y="212" text-anchor="middle" font-size="12">4</text>
<rect x="300" y="190" width="36" height="34" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/><text x="318" y="212" text-anchor="middle" font-size="12">5</text>
<rect x="338" y="190" width="36" height="34" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/><text x="356" y="212" text-anchor="middle" font-size="12">6</text>
<text x="300" y="244" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">new messages are appended on the right</text>
<rect x="480" y="45" width="150" height="56" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="555" y="68" text-anchor="middle" font-size="12" font-weight="700">group A, consumer 1</text>
<text x="555" y="88" text-anchor="middle" font-size="12">owns partitions 0, 1</text>
<rect x="480" y="160" width="150" height="56" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="555" y="183" text-anchor="middle" font-size="12" font-weight="700">group A, consumer 2</text>
<text x="555" y="203" text-anchor="middle" font-size="12">owns partition 2</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>The log cannot grow forever, so it is divided into segments and old segments are deleted after a retention period or size limit, or compacted (see the next section). Even so, a log on disk can hold a lot: a few terabytes of retention at typical event rates often means days or weeks of history, so a consumer that falls behind is not in danger unless it falls behind by more than the retention period. And because consumers only read, a slow consumer affects nobody but itself.</p>
<p>The cost of partition-level assignment is <strong>head-of-line blocking</strong>: a single slow message holds up everything after it in that partition, and you cannot have more active consumers in a group than partitions. Log-based brokers shine when messages are cheap to process and order matters; a traditional queue is better when each message is an expensive, independent job.</p>`,
        },
        {
          type: "table",
          title: "Traditional queue versus log-based broker",
          headers: ["", "AMQP/JMS style (RabbitMQ, SQS)", "Log-based (Kafka, Kinesis, Pulsar)"],
          rows: [
            ["After consumption", "Message deleted once acknowledged", "Message stays until retention expires"],
            ["Replay", "Not possible", "Reset the offset and reread"],
            ["Ordering", "Can be lost on redelivery", "Strict within a partition"],
            ["Parallelism", "Any number of competing consumers", "At most one consumer per partition per group"],
            ["Bookkeeping", "Per-message acknowledgements", "One offset per partition per group"],
            ["Best for", "Independent, expensive jobs", "High-volume ordered event streams, many readers"],
          ],
        },
        {
          type: "realworld",
          items: [
            { org: "Apache Kafka", title: "The reference design", html: "Built at LinkedIn and open-sourced in 2011. Partitions are replicated across brokers, consumers commit offsets to an internal topic, and topics can be configured to retain data for a time, a size, or by key with log compaction." },
            { org: "Amazon Kinesis Data Streams", title: "Managed shards", html: "A hosted log with shards instead of partitions, per-shard ordering and a configurable retention period." },
            { org: "RabbitMQ Streams", title: "Convergence", html: "RabbitMQ added an append-only, replayable stream type in version 3.9 (2021), showing how the log model has spread into traditional brokers." },
          ],
        },
        {
          type: "quiz",
          q: "A Kafka topic has 6 partitions. You run a consumer group with 10 consumers to speed up processing. What happens?",
          options: [
            "All 10 consumers share the work evenly",
            "6 consumers each get one partition and 4 sit idle",
            "Kafka creates 4 more partitions automatically",
            "Each message is processed 10 times",
          ],
          answer: 1,
          explain: "Each partition is assigned to at most one consumer in a group, which is what preserves per-partition order. Parallelism is capped by the partition count, so choose it with future scale in mind. A different consumer group would receive all messages independently.",
        },
      ],
    },
    {
      id: "change-data-capture",
      title: "Databases as streams: change data capture",
      kicker: "Keeping systems in sync",
      blocks: [
        {
          type: "problem",
          html: `<p>Most applications store the same data in several systems: the database for transactions, a search index for queries, a cache for speed, a warehouse for analytics. The tempting way to keep them in sync is <strong>dual writes</strong>: the application writes to the database, then to the search index, then invalidates the cache. That approach has two failure modes that do not go away with careful coding.</p>`,
        },
        {
          type: "diagram",
          title: "Dual writes race",
          caption: "Two clients each write their value to both systems. The database applies A then B, the search index applies B then A. Both writes succeeded, nothing reported an error, and the two systems now disagree permanently.",
          svg: `<svg viewBox="0 0 640 265" role="img" aria-label="Two clients write to a database and a search index in different orders, leaving them inconsistent">
<text x="320" y="28" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">Client 1 writes x = A to both systems; client 2 writes x = B to both, at the same time</text>
<text x="16" y="84" font-size="13" font-weight="700">Database</text>
<text x="16" y="194" font-size="13" font-weight="700">Search index</text>
<line x1="120" y1="80" x2="628" y2="80" stroke-width="1" style="stroke: var(--dg-line)"/>
<line x1="120" y1="190" x2="628" y2="190" stroke-width="1" style="stroke: var(--dg-line)"/>
<rect x="130" y="62" width="150" height="36" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="205" y="85" text-anchor="middle" font-size="12">x = A (client 1)</text>
<rect x="300" y="62" width="150" height="36" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="375" y="85" text-anchor="middle" font-size="12">x = B (client 2)</text>
<rect x="490" y="62" width="135" height="36" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="557" y="85" text-anchor="middle" font-size="12" font-weight="700">final: x = B</text>
<rect x="130" y="172" width="150" height="36" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="205" y="195" text-anchor="middle" font-size="12">x = B (client 2)</text>
<rect x="300" y="172" width="150" height="36" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="375" y="195" text-anchor="middle" font-size="12">x = A (client 1)</text>
<rect x="490" y="172" width="135" height="36" rx="6" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)" stroke-width="2"/>
<text x="557" y="195" text-anchor="middle" font-size="12" font-weight="700">final: x = A</text>
<text x="320" y="250" text-anchor="middle" font-size="12" font-weight="700">Inconsistent forever, and no error was raised.</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>The first failure mode is the race above. The second is partial failure: the database write succeeds and the search index write fails (or the process crashes in between), so one system has the change and the other never will. Fixing that properly would need an atomic commit across both systems, which is expensive and often unavailable.</p>
<h3>Change data capture</h3>
<p>The database already has a perfectly ordered record of every change: its replication log (the PostgreSQL write-ahead log, the MySQL binlog, the MongoDB oplog). <strong>Change data capture (CDC)</strong> reads that log and publishes each committed change as an event, usually into a log-based broker. Search indexes, caches and warehouses consume the stream and apply the changes in the same order as the database did. The database is the single leader; everything else is a follower. There are no dual writes, and every consumer converges on the database's state.</p>
<p>Two details make CDC practical. A new consumer needs the existing data, not just future changes, so CDC tools take a consistent <strong>initial snapshot</strong> and record the log position it corresponds to, then stream changes from that position. And to avoid keeping every change forever, the broker can use <strong>log compaction</strong>: for each key, keep only the most recent value (a deletion is written as a "tombstone" with a null value). A compacted topic is then a full copy of the table that a new consumer can read from offset 0.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Debezium", title: "Open-source CDC", html: "Runs on Kafka Connect and reads PostgreSQL logical decoding, the MySQL binlog, MongoDB change streams and others, emitting one event per row change with before and after values." },
            { org: "LinkedIn Databus", title: "An early example", html: "Captured changes from LinkedIn's primary databases and fed them to search indexes, caches and other derived systems." },
            { org: "Transactional outbox", title: "When you need business events", html: "The service writes its business change and an event row to an <code>outbox</code> table in the same transaction; CDC then publishes the outbox rows. This gets the atomicity of one database transaction with the reach of a message broker." },
          ],
        },
        {
          type: "quiz",
          q: "A service updates a row in PostgreSQL and then publishes an event to Kafka. Occasionally Kafka is unreachable after the commit, and consumers never learn about the change. Which fix removes the problem rather than making it rarer?",
          options: [
            "Retry the Kafka publish three times",
            "Publish to Kafka first, then write to PostgreSQL",
            "Write the event to an outbox table in the same transaction and publish it via CDC",
            "Use a longer Kafka timeout",
          ],
          answer: 2,
          explain: "Any order of two separate writes leaves a window where one succeeds and the other does not. With an outbox, the change and the event commit atomically in one database transaction, and CDC reliably streams committed rows to Kafka afterwards, retrying as needed.",
        },
      ],
    },
    {
      id: "event-sourcing",
      title: "Event sourcing and immutable state",
      kicker: "The log as the source of truth",
      blocks: [
        {
          type: "idea",
          html: `<p><strong>Event sourcing</strong> stores every change to application state as an immutable event in an append-only log, written by the application in terms of the business domain: "SeatReserved", "ReservationCancelled", "PaymentReceived". The current state is not stored as the primary record; it is <em>derived</em> by replaying the events.</p>`,
        },
        {
          type: "text",
          html: `<p>Event sourcing and CDC both end with a log of changes, but they differ in where the log comes from and what it says. CDC extracts low-level row changes from a mutable database, which remains the source of truth, and the application does not know it is happening. Event sourcing makes the event log the source of truth, and the events record intent at the level of the application ("the customer cancelled"), not the side effects ("row 81 in <code>reservations</code> had <code>status</code> set to 3").</p>
<p>An important distinction is between <strong>commands</strong> and <strong>events</strong>. A command ("reserve seat 14C") is a request that may still be rejected, for example because the seat is taken. The application validates it, and only if it succeeds writes an event ("seat 14C reserved by user 42"). From then on, the event is a fact; consumers cannot reject it. A mistake is corrected by appending a compensating event, not by editing history, which is how accountants have always kept ledgers.</p>
<h3>State, streams and immutability</h3>
<p>A useful way to see it: the current state of a database is the result of applying every change in its log, and the log is the history that produced the state. A changelog is the derivative of state over time, and state is the integral of the changelog. Keeping the log, not just the state, gives you an audit trail, lets you debug by replaying what happened, and lets you build new read-optimized views later from the full history. Separating the write-optimized log from read-optimized views is often called <strong>command query responsibility segregation (CQRS)</strong>.</p>`,
        },
        {
          type: "table",
          title: "Change data capture versus event sourcing",
          headers: ["", "Change data capture", "Event sourcing"],
          rows: [
            ["Source of truth", "The mutable database", "The event log"],
            ["Who writes the events", "Extracted from the database's log", "The application, deliberately"],
            ["Granularity", "Row-level changes", "Domain events expressing intent"],
            ["Compaction", "Later value for a key replaces earlier ones", "Usually not: later events don't supersede earlier ones"],
            ["Typical use", "Sync search, caches, warehouses", "Auditable domains, rebuilding views with new logic"],
          ],
        },
        {
          type: "tradeoffs",
          pros: [
            "Complete audit history: you know how the state came to be",
            "New views can be built at any time by replaying the log",
            "Bugs in a view are fixed by fixing the code and replaying",
            "Writes are simple appends, decoupled from the shape of reads",
          ],
          cons: [
            "Reading current state needs a materialized view, which may lag the log",
            "Event schemas live forever, so versioning them takes discipline",
            "Replaying a long history can be slow without snapshots",
            "Truly deleting data (for privacy law) conflicts with an immutable log",
          ],
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p>Immutability has limits. If a user exercises a legal right to erasure, you must actually remove their data, not append "deleted". Approaches include rewriting log segments without the affected events, keeping personal data out of events and referencing it by ID, or encrypting each person's data with their own key and destroying the key ("crypto-shredding"). Design for this before the first event is written.</p>`,
        },
      ],
    },
    {
      id: "time-and-windows",
      title: "Processing streams: time, windows and watermarks",
      kicker: "Reasoning about time",
      blocks: [
        {
          type: "text",
          html: `<p>Once you have a stream, you can do three broad things with it: write its events to a store (a database, cache, search index) to keep it in sync; push events to people (alerts, notifications, dashboards); or process it into another stream. The processing can be <strong>complex event processing</strong> (search for patterns, such as Esper queries over events), <strong>stream analytics</strong> (rates, rolling averages, comparisons with the previous window), <strong>maintaining materialized views</strong>, or even search in reverse: Elasticsearch's percolator stores queries and matches each new document against them.</p>
<p>Almost all of these involve time, which is where things get subtle.</p>
<h3>Event time versus processing time</h3>
<p>Every event has an <strong>event time</strong>, when it actually happened, and a <strong>processing time</strong>, when the stream processor sees it. They can differ by milliseconds or by days: a phone records a purchase while offline on a plane and uploads it hours later; a consumer restarts and works through a backlog; a network link is congested. Computing "requests per minute" by processing time would show a quiet period followed by an impossible spike during a backlog; computing it by event time gives the true picture, but now you must decide how long to wait for stragglers.</p>`,
        },
        {
          type: "diagram",
          title: "Event time, processing time and a late event",
          caption: "Each line connects an event's event time (top) to when it reached the processor (bottom). The watermark passes 10:01 at about 10:01:10, closing the 10:00 window. The phone that was offline delivers an event from 10:00:50 at 10:01:45, after the window closed.",
          svg: `<svg viewBox="0 0 640 245" role="img" aria-label="Events mapped from event time to processing time, with a watermark and a late event">
<text x="16" y="64" font-size="13" font-weight="700">event time</text>
<text x="16" y="186" font-size="13" font-weight="700">processing</text>
<text x="16" y="202" font-size="13" font-weight="700">time</text>
<rect x="120" y="44" width="240" height="32" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<text x="240" y="36" text-anchor="middle" font-size="12" style="fill: var(--dg-1)">1-minute window, 10:00 to 10:01</text>
<line x1="120" y1="60" x2="600" y2="60" stroke-width="2" style="stroke: var(--dg-muted)"/>
<line x1="120" y1="190" x2="600" y2="190" stroke-width="2" style="stroke: var(--dg-muted)"/>
<line x1="160" y1="60" x2="168" y2="190" stroke-width="1.5" style="stroke: var(--dg-2)"/>
<line x1="280" y1="60" x2="284" y2="190" stroke-width="1.5" style="stroke: var(--dg-2)"/>
<line x1="320" y1="60" x2="540" y2="190" stroke-width="2" stroke-dasharray="5 4" style="stroke: var(--dg-bad)"/>
<line x1="380" y1="60" x2="384" y2="190" stroke-width="1.5" style="stroke: var(--dg-2)"/>
<circle cx="160" cy="60" r="5" style="fill: var(--dg-2)"/>
<circle cx="280" cy="60" r="5" style="fill: var(--dg-2)"/>
<circle cx="320" cy="60" r="5" style="fill: var(--dg-bad)"/>
<circle cx="380" cy="60" r="5" style="fill: var(--dg-2)"/>
<circle cx="168" cy="190" r="5" style="fill: var(--dg-2)"/>
<circle cx="284" cy="190" r="5" style="fill: var(--dg-2)"/>
<circle cx="540" cy="190" r="5" style="fill: var(--dg-bad)"/>
<circle cx="384" cy="190" r="5" style="fill: var(--dg-2)"/>
<line x1="400" y1="172" x2="400" y2="208" stroke-width="2.5" style="stroke: var(--dg-4)"/>
<text x="120" y="210" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">10:00</text>
<text x="360" y="210" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">10:01</text>
<text x="600" y="210" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">10:02</text>
<text x="400" y="230" text-anchor="middle" font-size="12" style="fill: var(--dg-4)">watermark passes 10:01</text>
<text x="560" y="230" text-anchor="middle" font-size="12" style="fill: var(--dg-bad)">late event arrives</text>
</svg>`,
        },
        {
          type: "text",
          html: `<h3>Windows</h3>
<p>An aggregation over an infinite stream needs boundaries. Common window types:</p>
<ul>
<li><strong>Tumbling</strong>: fixed length, no overlap. Every event belongs to exactly one window, such as 10:00&ndash;10:01, 10:01&ndash;10:02.</li>
<li><strong>Hopping</strong>: fixed length, overlapping: a 5-minute window that advances every minute, giving smoothed values.</li>
<li><strong>Sliding</strong>: all events within some interval of each other, such as any two events less than 5 minutes apart, with boundaries defined by the events themselves.</li>
<li><strong>Session</strong>: no fixed length; a user's events are grouped until they are inactive for some gap, say 30 minutes. Natural for website analytics.</li>
</ul>
<h3>Watermarks and stragglers</h3>
<p>When can you emit the count for 10:00&ndash;10:01? Never with certainty: an event from that minute could still be on a phone in airplane mode. A <strong>watermark</strong> is the processor's declaration that it does not expect more events older than time <em>T</em>, typically estimated as "the latest event time seen, minus a few seconds". When the watermark passes the end of a window, the window is emitted. Events that arrive later still are <strong>stragglers</strong>: you can drop them (and count how many you dropped), or emit a correction for the already-published window.</p>
<p>Device clocks add another problem: a phone's clock may simply be wrong. A useful technique is to record three timestamps: the event time by the device clock, the send time by the device clock, and the receive time by the server clock. The difference between send and receive estimates the device's clock offset (ignoring network delay), which can be applied to the event time.</p>`,
        },
        {
          type: "callout",
          tone: "modern",
          html: `<p>The event-time, window and watermark model was formalised in Google's Dataflow paper (Akidau et al., 2015) and is now standard. Apache Beam, Apache Flink and Spark Structured Streaming all expose event-time windows and watermarks with configurable lateness, and streaming SQL engines (Flink SQL, ksqlDB, RisingWave, Materialize) let you express windows declaratively.</p>`,
        },
        {
          type: "quiz",
          q: "A dashboard shows sales per minute, computed by processing time. A consumer was down for 20 minutes and then caught up. What does the chart show?",
          options: [
            "The correct sales figures for every minute",
            "Zero sales for 20 minutes, then a huge spike when the backlog was processed",
            "An error, because processing time cannot be used for windows",
            "Duplicated sales for the whole day",
          ],
          answer: 1,
          explain: "Processing-time windows count events when the processor sees them, so an outage looks like no sales followed by an impossible surge. Event-time windows place each sale in the minute it happened, at the cost of waiting for late data via watermarks.",
        },
      ],
    },
    {
      id: "stream-joins",
      title: "Stream joins",
      kicker: "Combining streams",
      blocks: [
        {
          type: "text",
          html: `<p>Batch jobs join two bounded datasets. Stream processors face a harder version: new events can arrive on either side at any time, so the processor must keep <strong>state</strong> about what it has seen in order to match future events. There are three kinds of stream join.</p>
<h3>Stream-stream join (window join)</h3>
<p>Match events from two streams that occur close together in time. Example: a search results page emits a "search" event, and a click on a result emits a "click" event; to compute click-through rate, join each click with its search by session ID within, say, one hour. The processor keeps both sides' recent events in state, indexed by the join key, and emits a match when the counterpart arrives. If no click arrives within the hour, it emits "search with no click", which is just as valuable. State is bounded by the window length.</p>
<h3>Stream-table join (enrichment)</h3>
<p>Each event needs data from a table: append the user's country and plan to every page-view event. Querying the database per event is slow and can overload it. Instead, the processor keeps a <strong>local copy of the table</strong>, loaded once and kept current by subscribing to the table's CDC stream. The join is then a local lookup. Kafka Streams calls this a KStream-KTable join.</p>
<h3>Table-table join (materialized view maintenance)</h3>
<p>Both inputs are changelogs and the output is a continuously maintained join result. Example: a social timeline cache, where the timeline of each user must change when someone they follow posts, deletes a post, or when they follow or unfollow someone. The processor keeps both tables (posts and follow relationships) and, on every change to either, updates the affected timelines. This is exactly what a database does when maintaining a materialized view, done as a stream.</p>`,
        },
        {
          type: "table",
          title: "Stream join types",
          headers: ["Join", "Inputs", "State kept", "Example"],
          rows: [
            ["Stream-stream", "Two event streams", "Events from both sides within the window", "Join searches and clicks within an hour"],
            ["Stream-table", "Event stream plus a table changelog", "Local copy of the table, updated by CDC", "Add user profile fields to page views"],
            ["Table-table", "Two table changelogs", "Both tables", "Maintain each user's timeline as posts and follows change"],
          ],
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>Stream joins are <strong>time-dependent</strong>. If a user moves from Germany to France and you enrich their purchase events, should a purchase from last week be tagged with the old country or the new one? Reprocessing the stream later may give a different answer from the first run, because the table state was different. Data warehouses call this a slowly changing dimension and solve it by versioning the table rows (country as of a date) and joining on the version that was valid at the event's time.</p>`,
        },
        {
          type: "quiz",
          q: "You need to tag each payment event with the merchant's current risk score, which lives in a database table that changes a few times a day. Which approach is best?",
          options: [
            "Query the database for every payment event",
            "Stream-table join: keep a local copy of the risk table updated from its CDC stream and look up each payment locally",
            "Stream-stream join with a one-second window",
            "Batch job every night",
          ],
          answer: 1,
          explain: "A per-event database query adds latency and load. A local, CDC-maintained copy makes each lookup a fast local read and still reflects updates within seconds. A stream-stream window join would only match risk changes that happen close in time to a payment.",
        },
      ],
    },
    {
      id: "fault-tolerance",
      title: "Fault tolerance and exactly-once processing",
      kicker: "Surviving failures",
      blocks: [
        {
          type: "problem",
          html: `<p>A batch job can simply rerun a failed task, because its input is fixed and its output is discarded until the task succeeds. A stream processor never finishes, and it may have already produced output for an event (sent an email, updated a database) before it crashed. Restarting from the last committed offset reprocesses some events, which is <strong>at-least-once</strong>: no event is lost, but some effects happen twice.</p>`,
        },
        {
          type: "text",
          html: `<p>"Exactly-once" is really <strong>effectively-once</strong>: each event's effect is visible once, even though it may be processed more than once internally. There are several techniques, usually combined.</p>
<ul>
<li><strong>Microbatching.</strong> Spark Streaming split the stream into small batches (about a second each) and treated each as a tiny batch job. Simple, but it adds latency, and windows are tied to batch boundaries.</li>
<li><strong>Checkpointing.</strong> Apache Flink periodically injects <strong>barriers</strong> into the stream. When an operator has received a barrier on all its inputs, it snapshots its state to durable storage and passes the barrier on, so each checkpoint is a consistent cut across the whole job (an approach inspired by the Chandy-Lamport snapshot algorithm). After a failure, every operator restores its state from the last completed checkpoint, and sources rewind to the matching offsets.</li>
<li><strong>Atomic commit of outputs.</strong> Restoring state does not undo external side effects. Kafka's transactions (since version 0.11) let a processor atomically write its output messages, update its state changelog and commit its input offsets: all happen, or none. Flink's two-phase-commit sinks extend this to some external systems.</li>
<li><strong>Idempotent writes.</strong> If writing the same result twice has the same effect as once, duplicates are harmless. Setting a key to a value is idempotent; incrementing a counter is not, unless you store the offset of the last applied event with the value and skip events you have already seen.</li>
</ul>`,
        },
        {
          type: "diagram",
          title: "Checkpoint barriers flowing through a job",
          caption: "The source injects barrier n into the stream. Each operator snapshots its state when barrier n reaches it, so all snapshots for checkpoint n reflect exactly the events before the barrier. Recovery restores them together and rewinds the source to the barrier's offset.",
          svg: `<svg viewBox="0 0 640 220" role="img" aria-label="Checkpoint barriers move through source, window operator and sink; each snapshots state to durable storage">
<defs><marker id="ddia11-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="20" y="50" width="120" height="50" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="80" y="72" text-anchor="middle" font-size="13" font-weight="700">Kafka source</text>
<text x="80" y="90" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">offset 5012</text>
<rect x="260" y="50" width="120" height="50" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="320" y="72" text-anchor="middle" font-size="13" font-weight="700">window count</text>
<text x="320" y="90" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">state: counts</text>
<rect x="500" y="50" width="120" height="50" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="560" y="72" text-anchor="middle" font-size="13" font-weight="700">sink</text>
<text x="560" y="90" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">transactional</text>
<line x1="142" y1="75" x2="256" y2="75" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia11-arrow)"/>
<line x1="382" y1="75" x2="496" y2="75" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia11-arrow)"/>
<circle cx="165" cy="75" r="4" style="fill: var(--dg-ink)"/>
<circle cx="182" cy="75" r="4" style="fill: var(--dg-ink)"/>
<rect x="198" y="60" width="8" height="30" style="fill: var(--dg-bad)"/>
<circle cx="222" cy="75" r="4" style="fill: var(--dg-ink)"/>
<circle cx="239" cy="75" r="4" style="fill: var(--dg-ink)"/>
<text x="202" y="50" text-anchor="middle" font-size="12" style="fill: var(--dg-bad)">barrier n</text>
<rect x="160" y="160" width="320" height="40" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="320" y="185" text-anchor="middle" font-size="12" font-weight="700">durable checkpoint storage (e.g. S3)</text>
<line x1="80" y1="102" x2="200" y2="158" stroke-width="1.5" stroke-dasharray="5 4" style="stroke: var(--dg-muted)" marker-end="url(#ddia11-arrow)"/>
<line x1="320" y1="102" x2="320" y2="156" stroke-width="1.5" stroke-dasharray="5 4" style="stroke: var(--dg-muted)" marker-end="url(#ddia11-arrow)"/>
<line x1="560" y1="102" x2="440" y2="158" stroke-width="1.5" stroke-dasharray="5 4" style="stroke: var(--dg-muted)" marker-end="url(#ddia11-arrow)"/>
<text x="110" y="140" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">offsets</text>
<text x="330" y="134" font-size="12" style="fill: var(--dg-muted)">state</text>
<text x="530" y="140" font-size="12" style="fill: var(--dg-muted)">pending txn</text>
</svg>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Apache Flink", title: "Checkpoints and savepoints", html: "Periodic, asynchronous checkpoints of operator state (often in a RocksDB state backend) to durable storage. Savepoints are manually triggered checkpoints used to upgrade or rescale a job without losing state." },
            { org: "Kafka Streams", title: "Changelog topics", html: "Each local state store is backed by a compacted Kafka topic. When a task moves to another machine, it rebuilds its state by replaying that topic; with exactly-once enabled, output, state updates and offsets commit in one Kafka transaction." },
            { org: "Spark Structured Streaming", title: "Micro-batches with offsets", html: "Records the source offsets for each micro-batch in a write-ahead log and relies on replayable sources and idempotent or transactional sinks for end-to-end guarantees." },
          ],
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>"Kafka has exactly-once, so our pipeline is exactly-once." The guarantee covers reading from and writing to Kafka within a transaction. The moment your processor calls an external API, sends an email or writes to a database outside that transaction, a crash and replay can repeat the effect. Make those effects idempotent with a unique event ID, or route them through a transactional or deduplicating sink.</p>`,
        },
        {
          type: "quiz",
          q: "A stream processor sums payment amounts per merchant into a database row with <code>UPDATE totals SET sum = sum + ?</code>. After a crash it replays from the last committed offset. How do you prevent double counting?",
          options: [
            "Commit offsets more often",
            "Store the last applied offset in the same row and update both in one transaction, skipping events at or below it",
            "Use processing time instead of event time",
            "Increase the Kafka replication factor",
          ],
          answer: 1,
          explain: "Committing more often shrinks the replay window but does not close it. Storing the offset alongside the total in one atomic update makes the write idempotent: a replayed event is recognised and skipped.",
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
          html: `<p>Streams appear in almost every modern design: keeping a search index or cache in sync, activity feeds, real-time analytics and leaderboards, fraud detection, notifications, and any time the interviewer asks "how do the other services find out?". Expect follow-ups about ordering, duplicates, late data and what happens when a consumer crashes.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>A strong streaming answer usually covers:</p>
<ol>
<li><strong>Transport:</strong> a partitioned log (Kafka, Kinesis) keyed by the entity whose order matters; a queue (SQS, RabbitMQ) for independent jobs.</li>
<li><strong>No dual writes:</strong> CDC or a transactional outbox from the source database.</li>
<li><strong>Time:</strong> event-time windows with watermarks; say what happens to late events.</li>
<li><strong>Joins:</strong> enrich with a local, CDC-maintained table instead of per-event database calls.</li>
<li><strong>Delivery:</strong> at-least-once plus idempotent writes keyed by event ID, or transactions where the framework supports them; checkpointed state for recovery.</li>
<li><strong>Replay:</strong> retention long enough to rebuild a consumer's output after a bug.</li>
</ol>`,
        },
        {
          type: "table",
          title: "Delivery guarantees",
          headers: ["Guarantee", "How it happens", "Risk"],
          rows: [
            ["At-most-once", "Commit the offset before processing", "Events lost on crash"],
            ["At-least-once", "Commit the offset after processing", "Duplicates after crash"],
            ["Effectively-once", "At-least-once plus idempotence, or atomic commit of output and offsets", "Only as strong as the weakest sink"],
          ],
        },
        {
          type: "quiz",
          q: "An interviewer asks how to keep an Elasticsearch index in sync with a PostgreSQL products table. Which design is most robust?",
          options: [
            "In the API handler, write to PostgreSQL and then to Elasticsearch",
            "Rebuild the whole index from PostgreSQL every five minutes",
            "Stream changes with CDC (Debezium into Kafka), and have a consumer upsert documents keyed by product ID, starting from an initial snapshot",
            "Have Elasticsearch poll PostgreSQL for each search query",
          ],
          answer: 2,
          explain: "CDC preserves the database's commit order, removes dual-write races and partial failures, and lets the consumer replay after a crash. Upserts keyed by product ID make replays idempotent. A periodic full rebuild works for small tables but scales badly and adds staleness.",
        },
      ],
    },
  ],
  takeaways: [
    "A stream is an unbounded sequence of immutable events; stream processing is batch processing with the end removed.",
    "Traditional brokers delete messages on acknowledgement and suit independent jobs; <strong>log-based brokers</strong> keep a partitioned, replayable log with per-partition order and one offset per consumer group.",
    "Dual writes race and fail partially. Use <strong>change data capture</strong> (or a transactional outbox) so one database's commit order drives every derived system.",
    "Event sourcing makes an application-level event log the source of truth; current state is a view derived from it, which gives auditability and rebuildable views.",
    "Use <strong>event time</strong> for correct analytics, windows to bound aggregations, and watermarks to decide when a window is complete; plan for late events.",
    "Stream-stream, stream-table and table-table joins all keep state; enrichment uses a local table copy maintained by CDC, and joins are time-dependent.",
    "Exactly-once is really effectively-once: checkpointed state, atomic commits of output and offsets, and idempotent writes keyed by event ID.",
  ],
  furtherReading: [
    { title: "The Log: What every software engineer should know about real-time data's unifying abstraction (Jay Kreps, 2013)", note: "The case for the log as the backbone of data integration." },
    { title: "The Dataflow Model (Akidau et al., VLDB 2015)", note: "Event time, windows, watermarks and triggers, formalised." },
    { title: "Lightweight Asynchronous Snapshots for Distributed Dataflows (Carbone et al., 2015)", note: "How Flink's checkpoint barriers work." },
    { title: "Debezium documentation", url: "https://debezium.io/documentation/", note: "Practical change data capture from PostgreSQL, MySQL, MongoDB and others." },
  ],
};
