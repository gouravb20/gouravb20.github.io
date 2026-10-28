// Main tab: Scaling Writes. Format: DeepSection[] in public/shared/notes.d.ts.
window.MAIN = window.MAIN || {};
MAIN["scaling-writes"] = [
  {
    id: `the-problem`,
    title: `Writes have to land somewhere`,
    kicker: `The problem`,
    blocks: [
      { type: `text`, html: `<p>Read traffic is forgiving. Any copy of the data can answer a read, so you add replicas, caches and a CDN until the load disappears (the <a href="../scaling-reads/">Scaling Reads</a> chapter). A write has no such escape. It must reach the one node that owns that row, be made durable there, and then be copied to every replica. More copies mean more work per write, not less.</p><p>The pressure shows up in a familiar set of features: likes and reactions, view counters, location pings from drivers, chat messages, IoT telemetry, click and analytics events, votes during a live show. Each individual write is tiny. The problem is that there are hundreds of thousands of them per second, often bunched into spikes, and often aimed at the same few rows.</p>` },
      { type: `keypoints`, title: `What runs out first on one database`, items: [
        `<strong>Disk I/O:</strong> every commit flushes the log to disk (fsync), and a B-tree updates pages in place, which means random writes.`,
        `<strong>Index maintenance:</strong> each secondary index is another write per insert.`,
        `<strong>Lock contention:</strong> many transactions updating the same row (one counter, one hot item) queue behind each other however big the machine is.`,
        `<strong>Replication:</strong> the primary must ship every change to its replicas, and replicas that fall behind serve stale reads.`,
      ] },
      { type: `callout`, tone: `tip`, title: `Check the number before reaching for tools`, html: `<p>A well-provisioned relational database on fast NVMe disks handles thousands to tens of thousands of simple writes per second, more with batching. If your estimate is 2,000 writes/s, say so and move on: one primary is fine. The rest of this chapter is for when the estimate, or its peak, is clearly beyond one node.</p>` },
    ],
  },
  {
    id: `the-ladder`,
    title: `The escalation ladder`,
    kicker: `Solution options`,
    blocks: [
      { type: `text`, html: `<p>The tools fall into four moves, from cheapest to most invasive. Climb only as far as the numbers force you, and say why each step is needed.</p>` },
      { type: `steps`, items: [
        `<strong>Make one node faster.</strong> A bigger machine, faster disks, fewer secondary indexes, append-only inserts instead of read-modify-write updates, and grouping rows into fewer commits. For append-heavy data, a write-optimised LSM store such as Cassandra turns random writes into sequential ones (how B-trees and LSM trees differ is in <a href="../../core-concepts/ch10/">core concepts ch10</a>).`,
        `<strong>Spread the writes across many nodes.</strong> Shard by a partition key so each node owns a slice of the data and takes only its writes.`,
        `<strong>Smooth the writes in time.</strong> Put a queue in front of the database to absorb bursts, apply back-pressure when it fills, and shed low-value writes first.`,
        `<strong>Shrink the writes.</strong> Batch many rows into one commit, aggregate increments in memory before writing totals, and split the few keys that are hotter than any one partition can handle.`,
      ] },
      { type: `table`, title: `Which move fixes which bottleneck`, headers: [`Bottleneck`, `Best first move`], rows: [
        [`Average write rate above one node`, `Sharding (or a store that shards for you)`],
        [`Short spikes well above the average`, `Queue with a bound and back-pressure`],
        [`Many updates to the same rows (counters)`, `In-memory aggregation, then key splitting`],
        [`Per-commit overhead (lots of tiny writes)`, `Batching`],
        [`Random I/O on inserts`, `LSM-based storage, fewer indexes`],
      ] },
    ],
  },
  {
    id: `sharding`,
    title: `Sharding: pick the key that spreads writes and keeps reads on one shard`,
    kicker: `Spread`,
    blocks: [
      { type: `text`, html: `<p>Sharding (horizontal partitioning) splits one table's rows across independent databases. Each shard owns a slice of the key space and takes only those writes, so N shards give roughly N times the throughput, provided the load is even. Everything depends on the <strong>partition key</strong>. The mechanics of shard maps, routing and consistent hashing are in <a href="../../core-concepts/ch14/">core concepts ch14</a> and <a href="../../core-concepts/ch16/">ch16</a>; here the focus is the choice.</p>` },
      { type: `keypoints`, title: `A good partition key`, items: [
        `<strong>Has many distinct values</strong>, so it can spread over many shards. Country or status can't.`,
        `<strong>Spreads writes evenly</strong>: no single value takes a large share of the traffic.`,
        `<strong>Matches the main read</strong>, so the most common request touches one shard. Messages by chat_id, a timeline by user_id, telemetry by (device_id, day).`,
        `<strong>Isn't monotonic</strong> under range partitioning. A bare timestamp sends every new write to the newest range.`,
      ] },
      { type: `compare`, items: [
        { title: `Hash partitioning`, tone: `ok`, html: `<p>shard = hash(key) mod N, or a position on a hash ring. Even spread, no hot range. Range scans across keys hit every shard. The default for write-heavy tables.</p>` },
        { title: `Range partitioning`, tone: `warn`, html: `<p>Each shard owns a contiguous key range. Efficient scans and easy retention (drop an old range), but an increasing key creates a hot tail. Use time as the second part of a compound key, never alone.</p>` },
        { title: `Vertical partitioning`, tone: `info`, html: `<p>Split by table or feature instead of by row: likes in one database, comments in another, or hot counter columns moved out of the main row. A quick win when one feature dominates, but no help once that feature outgrows one machine.</p>` },
      ] },
      { type: `lab`, id: `swShardLoad`, caption: `Try each key. hash(post_id) spreads writes best but scatters a user's posts; range on time sends everything to one shard however many you add; country runs out of values.` },
    ],
  },
  {
    id: `bursts`,
    title: `Bursts: buffer, push back, and shed what matters least`,
    kicker: `Smooth`,
    blocks: [
      { type: `text`, html: `<p>Traffic is rarely flat. A match ends, a notification goes out, a post goes viral, and the write rate jumps several times for a minute. Sizing the database for the peak wastes money the rest of the day. Instead, accept the write into a durable queue or log (Kafka, SQS, Kinesis), acknowledge it, and let consumers drain it into the database at a steady rate.</p>` },
      { type: `keypoints`, items: [
        `<strong>A queue turns errors into delay.</strong> The database works at its comfortable rate; writes that arrive during the spike are stored a little later.`,
        `<strong>A queue can't fix too little capacity.</strong> If the average arrival rate is above the drain rate, the backlog grows forever. Queues smooth bursts; sharding adds capacity.`,
        `<strong>Bound the queue.</strong> An unbounded queue hides overload as ever-growing lag. When it fills, push back on producers (HTTP 429 or 503 with Retry-After) instead of accepting writes you can't store for an hour.`,
        `<strong>Shed low-value writes first.</strong> Sample analytics events, presence pings and view events before refusing messages, orders or payments. Decide that ranking in advance.`,
        `<strong>Consumers must be idempotent.</strong> Delivery is at least once, so replays after a restart must not double-apply.`,
      ] },
      { type: `lab`, id: `swQueueBurst`, caption: `Write directly first and watch the rejected writes. Then switch to a queue, make the spike long enough that the queue grows past its limit, and compare unbounded delay with shedding. Raise consumers until the database, not the consumers, sets the drain rate; then try bigger batches.` },
      { type: `callout`, tone: `warning`, title: `When not to queue`, html: `<p>If the user needs the outcome right away (is the seat still free, did the payment clear, is the username taken), a queue that acknowledges first and validates later makes the design harder. Queue append-like writes whose result can arrive later, not decisions.</p>` },
    ],
  },
  {
    id: `batching`,
    title: `Batching and aggregation: write less often, write more at once`,
    kicker: `Shrink`,
    blocks: [
      { type: `text`, html: `<p>Much write-heavy traffic is the same row being updated over and over: the view count of a popular video, the like count of a post, the latest position of a driver. Storing every update separately is wasteful when only the total or the latest value matters.</p>` },
      { type: `list`, items: [
        `<strong>Batch commits.</strong> Group many rows into one multi-row insert or transaction. The fixed cost of a commit (network round trip, log flush) is shared by the whole batch, at the price of a few milliseconds of latency.`,
        `<strong>Aggregate in memory.</strong> Each server keeps a map of key to count and flushes "count += n" every few seconds. A video watched 10,000 times in that window costs one write per server instead of 10,000.`,
        `<strong>Aggregate in tiers.</strong> Servers send partial counts to a smaller set of aggregators (or a stream processor such as Flink partitioned by key), which merge them again before the database. Each tier adds one flush interval of staleness.`,
        `<strong>Keep only the latest.</strong> For locations, overwrite one value per driver in memory (Redis) and persist samples, not every ping.`,
      ] },
      { type: `lab`, id: `swAggregate`, caption: `Popular videos collapse into one write per flush; the long tail barely compresses. Watch how staleness and the views lost in a crash grow with the flush interval.` },
      { type: `callout`, tone: `insight`, title: `Don't lose counts on a crash`, html: `<p>Counts held in memory vanish when the process dies. The usual fix is to append the raw events to a durable log first, aggregate from the log, and commit the consumer offset only after the totals are written. A crash then replays a few seconds of events rather than losing them. Make the flush idempotent (write per-window totals keyed by window, or deduplicate by offset) so replays don't double-count.</p>` },
    ],
  },
  {
    id: `hot-keys`,
    title: `Hot keys: when one key is hotter than one partition`,
    kicker: `Split`,
    blocks: [
      { type: `text`, html: `<p>Sharding spreads <em>keys</em> across nodes. It can't spread the load of a <em>single</em> key, because one key always lives on one partition. When a celebrity posts, that post's like counter may receive more writes than any partition can take, and adding shards changes nothing. DynamoDB, for example, documents a limit of about 1,000 write units per second for a single partition. Hot spots and cross-shard pain in general are covered in <a href="../../core-concepts/ch15/">core concepts ch15</a>.</p>` },
      { type: `idea`, html: `<p><strong>Split the key.</strong> Instead of one counter post123, keep N sub-counters post123#0 to post123#N-1. Each write picks one at random, so the load spreads over up to N partitions. A read fetches all N and sums them, usually behind a cache with a TTL of a second or two.</p>` },
      { type: `keypoints`, items: [
        `<strong>Choose N from the peak:</strong> at least peak write rate divided by per-partition capacity, with headroom.`,
        `<strong>Split only hot keys.</strong> Every split key costs N reads; splitting every post multiplies read cost for posts that were never hot. Detect hot keys (sampled counts, partition metrics) or split predictable ones (big accounts, scheduled sales) in advance.`,
        `<strong>Combine with aggregation:</strong> buffering likes for a second before writing reduces how large N has to be.`,
      ] },
      { type: `lab`, id: `swHotKeySplit`, caption: `Raise the likes until the single partition saturates, then increase N until nothing is throttled. Switch to splitting every post and watch read operations multiply.` },
    ],
  },
  {
    id: `in-the-interview`,
    title: `Using it in an interview`,
    kicker: `Interview angle`,
    blocks: [
      { type: `text`, html: `<p>Bring this pattern in when your estimate produces a write rate beyond one database, or when the product has an obvious hot spot: counters on viral content, telemetry from millions of devices, chat at scale, live voting. Don't bring it in for a system doing a few hundred writes per second; sharding an app that fits on one node is a red flag, not a strength.</p>` },
      { type: `steps`, title: `A strong answer, in order`, items: [
        `State the write rate and peak from your estimate, and what one node can take.`,
        `Pick the partition key and justify it against the main read: "messages partitioned by chat_id, sorted by time, so loading a chat is one partition."`,
        `Say how bursts are absorbed: a queue with consumers, its bound, and what you shed when it fills.`,
        `Shrink what you can: batching, in-memory aggregation for counters, sampling for analytics.`,
        `Name the hot key and its fix before the interviewer asks.`,
        `Say what the user sees when it degrades: a count a few seconds stale, a 429 with retry, a dropped analytics event.`,
      ] },
      { type: `callout`, tone: `interview`, title: `What it sounds like`, html: `<p>"Likes peak around 200K per second. I'll append like events to Kafka partitioned by post ID and return immediately. Consumers record the like itself in a table partitioned by post, keyed by user for idempotency, and aggregate counts in memory for a second before writing totals. For a celebrity post the counter key is split into 32 sub-counters and the total is cached for two seconds. Counts can be a couple of seconds behind, which is fine for likes."</p>` },
    ],
  },
  {
    id: `common-deep-dives`,
    title: `Common deep dives`,
    kicker: `Follow-up questions`,
    blocks: [
      { type: `compare`, items: [
        { title: `"A celebrity's post gets millions of likes"`, tone: `info`, html: `<p>One key, one partition: it saturates whatever the cluster size. Buffer and aggregate likes in memory or a stream processor, split the counter into N sub-keys summed on read, cache the total, and keep the per-user like records partitioned by post for deduplication.</p>` },
        { title: `"We need to reshard, live"`, tone: `info`, html: `<p>Best: many logical shards from day one, mapped to fewer machines, so you move whole logical shards and update the routing map. Otherwise: dual-write (or CDC) to the new layout, backfill, verify, switch reads, then stop old writes, keeping each step reversible.</p>` },
        { title: `"Your key scatters this other query"`, tone: `info`, html: `<p>Keep the key that serves the main request on one shard. Serve the other access path from a second copy: a global secondary index, a table fed by CDC, or a search or analytics store. Each copy is another write per change; say so.</p>` },
        { title: `"What happens when the queue backs up?"`, tone: `info`, html: `<p>Lag equals depth divided by drain rate. Tell a burst (it will drain) from a capacity shortfall (it won't). Scale consumers if they are the bottleneck, batch if the database is, shed low-value writes, apply back-pressure at the bound, and alert on consumer lag.</p>` },
      ] },
      { type: `text`, html: `<p>The Deep Dive tab walks through each of these in more detail, including LSM write paths, resharding procedures and how real systems handle hot partitions.</p>` },
    ],
  },
];
