// Deep dive: Scaling Writes. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP["scaling-writes"] = {
  hook: `<p>A read can be answered by any copy of the data; a write has exactly one place it must go. That asymmetry is why write-heavy systems (likes, view counts, location pings, chat, telemetry) hit a wall that replicas and caches can't move. This deep dive follows a write from the client to the disk to see where the cost comes from, then works through each way of reducing it: faster storage, sharding by the right key, queues and back-pressure, batching and aggregation, splitting hot keys, and resharding a live system.</p>`,
  sections: [
    {
      id: "anatomy-of-a-write",
      title: "Where the cost of a write comes from",
      kicker: "The problem",
      blocks: [
        {
          type: "text",
          html: `<p>Consider one like on a relational database. The request arrives at the primary, which takes a lock on the affected rows, appends a record to its write-ahead log and flushes it to disk so the change survives a crash, updates the table and each secondary index, and streams the log record to its replicas. Only then does it acknowledge. Each of those steps has its own ceiling, and the cheapest one to hit depends on the workload.</p>`,
        },
        {
          type: "diagram",
          title: "One write, four costs",
          caption: "The primary does all the work for every write: lock, durable log flush, table and index updates, and replication. Replicas take reads off the primary but each one must replay every write too.",
          svg: `<svg viewBox="0 0 620 250" role="img" aria-label="A write passing through locking, log flush, index updates and replication on the primary">
<defs><marker id="pt5-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="15" y="100" width="90" height="40" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<text x="60" y="125" text-anchor="middle" font-size="12" font-weight="700">Client</text>
<line x1="105" y1="120" x2="143" y2="120" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#pt5-arrow)"/>
<rect x="145" y="20" width="270" height="210" rx="10" style="fill: var(--dg-panel); stroke: var(--dg-1)" stroke-width="2"/>
<text x="280" y="42" text-anchor="middle" font-size="13" font-weight="700">Primary</text>
<rect x="165" y="55" width="230" height="34" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="280" y="77" text-anchor="middle" font-size="12">1. Lock rows (contention on hot rows)</text>
<rect x="165" y="97" width="230" height="34" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="280" y="119" text-anchor="middle" font-size="12">2. Append WAL + fsync (disk)</text>
<rect x="165" y="139" width="230" height="34" rx="6" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/>
<text x="280" y="161" text-anchor="middle" font-size="12">3. Update table + every index</text>
<rect x="165" y="181" width="230" height="34" rx="6" style="fill: var(--dg-5-soft); stroke: var(--dg-5)"/>
<text x="280" y="203" text-anchor="middle" font-size="12">4. Ship log to replicas</text>
<line x1="415" y1="198" x2="478" y2="80" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#pt5-arrow)"/>
<line x1="415" y1="198" x2="478" y2="140" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#pt5-arrow)"/>
<line x1="415" y1="198" x2="478" y2="200" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#pt5-arrow)"/>
<rect x="480" y="60" width="125" height="36" rx="8" style="fill: var(--dg-6-soft); stroke: var(--dg-6)"/>
<text x="542" y="83" text-anchor="middle" font-size="12">Replica: replays</text>
<rect x="480" y="122" width="125" height="36" rx="8" style="fill: var(--dg-6-soft); stroke: var(--dg-6)"/>
<text x="542" y="145" text-anchor="middle" font-size="12">Replica: replays</text>
<rect x="480" y="184" width="125" height="36" rx="8" style="fill: var(--dg-6-soft); stroke: var(--dg-6)"/>
<text x="542" y="207" text-anchor="middle" font-size="12">Replica: replays</text>
<text x="480" y="40" font-size="12" style="fill: var(--dg-muted)">more replicas = more</text>
<text x="480" y="54" font-size="12" style="fill: var(--dg-muted)">work per write</text>
</svg>`,
        },
        {
          type: "table",
          title: "Which limit you hit, and what relieves it",
          headers: ["Limit", "Symptom", "Relief"],
          rows: [
            ["Log flush (fsync) per commit", "Throughput flat while CPU is idle; many tiny transactions", "Batch rows per commit; group commit"],
            ["Random page writes", "Disk busy with small random I/O as tables outgrow memory", "LSM storage; append-only schemas"],
            ["Index maintenance", "Insert cost grows with each index added", "Drop unused indexes; move secondary access paths elsewhere"],
            ["Row lock contention", "A few rows dominate; latency spikes, deadlocks", "Aggregate before writing; split hot keys"],
            ["Replication", "Replica lag climbs during write peaks", "Fewer synchronous replicas; shard to cut per-primary load"],
            ["Everything at once", "Average rate simply beyond one node", "Shard"],
          ],
        },
        {
          type: "quiz",
          q: "A team adds three more read replicas to cope with a growing stream of writes. What happens to the primary's write capacity?",
          options: [
            "It roughly quadruples, because the load is shared by four nodes",
            "It stays the same or drops slightly, because the primary still takes every write and now ships it to more replicas",
            "It doubles, because replicas take over index maintenance",
            "It is unaffected, but writes become strongly consistent",
          ],
          answer: 1,
          explain: "Replicas copy data; they don't divide ownership. Every write still goes to the one primary, which now streams it to more followers, each of which also replays it. Replicas help reads only. To add write capacity you must split which node owns which data.",
        },
      ],
    },
    {
      id: "faster-single-node",
      title: "Making one node take more writes",
      kicker: "Before sharding",
      blocks: [
        {
          type: "text",
          html: `<p>Sharding is expensive to build and to operate, so first get the most out of a single node. Three levers matter: how the storage engine lays writes on disk, how much work each write triggers, and how many writes share one commit.</p>`,
        },
        {
          type: "idea",
          title: "LSM trees turn random writes into sequential ones",
          html: `<p>A B-tree updates the page that holds the row, wherever it is on disk. A <strong>log-structured merge tree</strong> never updates in place: it appends to a commit log for durability, inserts into a sorted in-memory table (the memtable), and when that fills, writes it out as an immutable sorted file (an SSTable). Background compaction merges files and discards overwritten values. The comparison in depth is in <a href="../../core-concepts/ch10/">core concepts ch10</a>, and the time-series write path built on the same idea is in <a href="../../advanced-topics/ch8/">advanced topics ch8</a>.</p>`,
        },
        {
          type: "diagram",
          title: "The LSM write path",
          caption: "A write touches only the sequential commit log and memory before it is acknowledged. Flushing and compaction happen later, in the background, as large sequential I/O.",
          svg: `<svg viewBox="0 0 620 220" role="img" aria-label="LSM write path: commit log and memtable, flushed to SSTables, merged by compaction">
<defs><marker id="pt5-lsm" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="15" y="90" width="80" height="40" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<text x="55" y="115" text-anchor="middle" font-size="12" font-weight="700">Write</text>
<line x1="95" y1="105" x2="148" y2="60" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#pt5-lsm)"/>
<line x1="95" y1="115" x2="148" y2="160" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#pt5-lsm)"/>
<rect x="150" y="35" width="150" height="45" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="225" y="55" text-anchor="middle" font-size="12" font-weight="700">Commit log</text>
<text x="225" y="71" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">append, on disk</text>
<rect x="150" y="140" width="150" height="45" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="225" y="160" text-anchor="middle" font-size="12" font-weight="700">Memtable</text>
<text x="225" y="176" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">sorted, in memory</text>
<line x1="300" y1="162" x2="348" y2="162" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#pt5-lsm)"/>
<text x="324" y="150" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">flush</text>
<g style="fill: var(--dg-4-soft); stroke: var(--dg-4)">
<rect x="350" y="120" width="70" height="26" rx="4"/><rect x="350" y="150" width="70" height="26" rx="4"/><rect x="350" y="180" width="70" height="26" rx="4"/>
</g>
<g font-size="12" text-anchor="middle"><text x="385" y="138">SSTable</text><text x="385" y="168">SSTable</text><text x="385" y="198">SSTable</text></g>
<line x1="420" y1="163" x2="478" y2="163" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#pt5-lsm)"/>
<text x="449" y="150" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">compact</text>
<rect x="480" y="140" width="125" height="45" rx="8" style="fill: var(--dg-5-soft); stroke: var(--dg-5)"/>
<text x="542" y="160" text-anchor="middle" font-size="12" font-weight="700">Merged SSTable</text>
<text x="542" y="176" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">old versions dropped</text>
<text x="320" y="40" font-size="12" style="fill: var(--dg-muted)">Acknowledged after log + memtable.</text>
<text x="320" y="58" font-size="12" style="fill: var(--dg-muted)">Reads may check several files,</text>
<text x="320" y="76" font-size="12" style="fill: var(--dg-muted)">so bloom filters and compaction</text>
<text x="320" y="94" font-size="12" style="fill: var(--dg-muted)">keep them fast.</text>
</svg>`,
        },
        {
          type: "keypoints",
          title: "Trimming the write path",
          items: [
            "<strong>Indexes:</strong> every secondary index is another structure to update per insert. Keep the ones the hot queries use; serve rare access paths from a separate store.",
            "<strong>Append instead of update:</strong> inserting an event row (\"user 7 liked post 42\") avoids reading and locking a shared row. Totals can be derived later.",
            "<strong>Synchronous side work:</strong> triggers, foreign-key checks on hot tables and synchronous replication to distant regions all add to every commit.",
            "<strong>Batching:</strong> one commit of 100 rows pays one log flush and one round trip instead of 100. Databases also do this internally (group commit) when many transactions commit at once.",
          ],
        },
        {
          type: "code",
          lang: "python",
          title: "Why batching helps: a fixed cost per commit plus a small cost per row",
          code: `# Illustrative model: a commit costs F (round trip + log flush) plus r per row.
F, r = 1.0, 0.1          # fixed cost assumed 10x the per-row cost

def rows_per_second(commits_budget, batch):
    cost_per_commit = F + r * batch
    return commits_budget / cost_per_commit * batch

for b in (1, 10, 100):
    print(b, round(rows_per_second(10_000, b)))
# 1    ->  9,091   rows/s
# 10   -> 50,000   rows/s
# 100  -> 90,909   rows/s   (approaching the 1/r = 100,000 ceiling)`,
        },
        {
          type: "realworld",
          items: [
            { org: "Apache Cassandra", html: "<p>Writes go to a commit log and a memtable, which is flushed to immutable SSTables merged by compaction. Combined with partitioning by key across nodes, this is why Cassandra and its relative ScyllaDB are common picks for message stores and telemetry.</p>" },
            { org: "RocksDB", html: "<p>An embeddable LSM key-value engine from Facebook, used as the storage layer inside many other systems, including as a state store in stream processors such as Kafka Streams and Flink.</p>" },
          ],
        },
      ],
    },
    {
      id: "partition-keys",
      title: "Sharding: choosing the partition key",
      kicker: "Spread",
      blocks: [
        {
          type: "text",
          html: `<p>Once the average write rate is beyond one node, the only lever left is to split ownership: each shard owns a slice of the keys and takes only their writes. The shard map, routing and rebalancing mechanics are in <a href="../../core-concepts/ch14/">core concepts ch14</a>. What decides whether sharding works is the <strong>partition key</strong>, and a key has two jobs that can pull in opposite directions: spread the writes, and keep the common read on one shard.</p>`,
        },
        {
          type: "diagram",
          title: "Range on time versus hash of the user",
          caption: "Range partitioning by creation time puts every new write in the newest range while the older shards sit idle. Hashing the user ID spreads the same writes across all shards, and a compound key keeps each user's rows ordered by time inside their shard.",
          svg: `<svg viewBox="0 0 620 230" role="img" aria-label="Write load per shard under range-by-time and hash-by-user partitioning">
<text x="20" y="24" font-size="13" font-weight="700">range(created_at)</text>
<text x="330" y="24" font-size="13" font-weight="700">hash(user_id), created_at</text>
<line x1="20" y1="190" x2="290" y2="190" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<line x1="330" y1="190" x2="600" y2="190" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<g style="fill: var(--dg-line)">
<rect x="30" y="184" width="44" height="6"/><rect x="84" y="184" width="44" height="6"/><rect x="138" y="184" width="44" height="6"/>
</g>
<rect x="192" y="40" width="44" height="150" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)"/>
<text x="214" y="58" text-anchor="middle" font-size="12" font-weight="700">100%</text>
<g style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)">
<rect x="340" y="150" width="44" height="40"/><rect x="394" y="146" width="44" height="44"/><rect x="448" y="152" width="44" height="38"/><rect x="502" y="148" width="44" height="42"/>
</g>
<g font-size="12" text-anchor="middle" style="fill: var(--dg-muted)">
<text x="52" y="208">Jan</text><text x="106" y="208">Feb</text><text x="160" y="208">Mar</text><text x="214" y="208">Apr (now)</text>
<text x="362" y="208">s1</text><text x="416" y="208">s2</text><text x="470" y="208">s3</text><text x="524" y="208">s4</text>
</g>
<text x="30" y="226" font-size="12" style="fill: var(--dg-muted)">old ranges: idle</text>
<text x="340" y="226" font-size="12" style="fill: var(--dg-muted)">about 25% each</text>
</svg>`,
        },
        {
          type: "lab",
          id: "swShardLoad",
          caption: "Compare the four keys at 8 shards, then add shards. Watch both panels: write spread on the left, shards touched per read on the right.",
        },
        {
          type: "table",
          title: "Worked choices",
          headers: ["System", "Key", "Why", "Trap avoided"],
          rows: [
            ["Chat messages", "(chat_id, time bucket), sorted by message ID", "Loading a chat is one partition, already ordered", "user_id scatters group chats; time alone is one hot shard"],
            ["Likes", "post_id for like records; counter separately", "Dedup check and count for a post are local", "Celebrity posts: split the counter"],
            ["Ride location pings", "driver_id", "Writes spread across drivers; a driver's trail is local", "Querying by area needs a geo index, not the key"],
            ["IoT telemetry", "(device_id, day)", "Spreads by device, bounds partition size, easy retention", "Bare timestamp key"],
            ["E-commerce orders", "customer_id", "Order history is one shard", "Merchant dashboards come from a second copy"],
          ],
        },
        {
          type: "keypoints",
          title: "What sharding costs",
          items: [
            "<strong>Cross-shard queries</strong> become scatter-gather; latency follows the slowest shard. Serve them from a second copy built by CDC or a stream (see <a href=\"../../core-concepts/ch15/\">core concepts ch15</a>).",
            "<strong>Cross-shard transactions</strong> need sagas or two-phase commit. Choose the key so that things updated together live together.",
            "<strong>Global uniqueness</strong> (usernames, emails) needs a separate lookup table partitioned by that value.",
            "<strong>Unbounded partitions:</strong> a key whose data grows forever (one channel's messages since 2015) eventually overloads its node; add a time bucket to the key.",
          ],
        },
        {
          type: "quiz",
          q: "A metrics service stores readings with partition key = minute_of_day (0-1439), hash partitioned over 64 nodes. Writes are 300K/s from 2 million devices. What goes wrong?",
          options: [
            "Nothing; 1,440 values hashed over 64 nodes spreads evenly",
            "All writes in a given minute hit the single node that owns that minute, so one node takes the whole load at a time",
            "Reads for one device become single-shard",
            "The hash function produces collisions",
          ],
          answer: 1,
          explain: "Hashing spreads the 1,440 keys across nodes, but at any moment every device writes the same key, the current minute. One node takes all 300K/s and the rest idle, rotating each minute. Partition by device (plus a day bucket) so concurrent writes have different keys.",
        },
      ],
    },
    {
      id: "queues-and-backpressure",
      title: "Queues, back-pressure and load shedding",
      kicker: "Smooth",
      blocks: [
        {
          type: "text",
          html: `<p>Capacity planning for writes is about the peak, and peaks are often several times the average: the end of a match, a push notification to millions, a product launch. A durable queue or log between the API and the database lets the database run at a steady rate while the queue soaks up the difference. Two numbers describe its health: <strong>depth</strong> (writes waiting) and <strong>drain rate</strong> (writes committed per second). Depth divided by drain rate is how far behind the database is.</p>`,
        },
        {
          type: "lab",
          id: "swQueueBurst",
          caption: "Make the spike long and big enough that the unbounded queue's delay passes a minute, then switch to the bounded queue with shedding. Lower the database capacity below 4K/s to see a backlog that never drains.",
        },
        {
          type: "compare",
          items: [
            { title: "Burst", tone: "ok", html: "<p>Arrivals exceed drain only for a while. Depth rises, then falls once traffic drops. The queue is doing its job; the only question is whether the delay is acceptable.</p>" },
            { title: "Capacity shortfall", tone: "bad", html: "<p>Average arrivals exceed drain. Depth rises without limit and lag grows by the hour. No queue setting fixes it; add capacity (shard, batch, aggregate) or reduce what is written.</p>" },
          ],
        },
        {
          type: "table",
          title: "A shedding policy decided in advance",
          headers: ["Write type", "Example", "When the queue is full"],
          rows: [
            ["Critical", "Payment, order, chat message", "Keep; apply back-pressure (429 / 503 with Retry-After) rather than drop"],
            ["Important but derivable", "Like, follow", "Keep the record; defer counter updates"],
            ["Low value", "View event, analytics click", "Sample (keep 1 in 10, scale counts up)"],
            ["Ephemeral", "Presence ping, typing indicator", "Drop; the next one replaces it"],
          ],
        },
        {
          type: "keypoints",
          items: [
            "<strong>Partition the queue by the same key as the data</strong> (Kafka partitions by message key) so updates to one entity stay in order and one consumer can batch them.",
            "<strong>More consumers help only until the database is the bottleneck.</strong> After that, bigger batches or more shards are the lever.",
            "<strong>Delivery is at least once.</strong> Consumers must be idempotent: insert-if-absent on a natural key, or record processed offsets with the write.",
            "<strong>Alert on consumer lag</strong>, not only on errors. A healthy-looking API with a two-hour backlog is an outage users notice later.",
            "<strong>Don't queue decisions.</strong> Writes whose result the user needs now (inventory, uniqueness, balances) belong in a synchronous path; see the contention chapter.",
          ],
        },
        {
          type: "quiz",
          q: "A queue's depth grows steadily all day and never returns to zero, even overnight. Consumers are at 30% CPU; the database is at 95% disk utilisation. What is the most effective fix?",
          options: [
            "Double the number of consumers",
            "Increase the queue's retention so nothing is lost",
            "Raise rows per commit, aggregate updates before writing, or shard the database",
            "Switch from Kafka to a different broker",
          ],
          answer: 2,
          explain: "The backlog never clears, so this is a capacity shortfall, and the database, not the consumers, is saturated. More consumers would only push harder on the same disk. Reduce the work per row (batching, aggregation) or add write capacity (sharding). Longer retention just delays data loss.",
        },
      ],
    },
    {
      id: "aggregation",
      title: "Batching and hierarchical aggregation",
      kicker: "Shrink",
      blocks: [
        {
          type: "text",
          html: `<p>Counters are the classic write-amplification problem: millions of "+1"s to a small set of popular rows. Since readers only want the total, combine increments before they reach storage. A server holding a map of key to pending count flushes one "count += n" per key per interval; a popular key that received 50,000 increments in the window costs one write. A second tier (regional aggregators, or a stream processor partitioned by key) merges again, because each aggregator sees a larger share of the traffic and so more repeats of each key.</p>`,
        },
        {
          type: "diagram",
          title: "Two tiers of aggregation",
          caption: "Each tier combines increments for the same key before passing them on. The database sees one write per key per flush from each aggregator; each tier adds one flush interval of staleness.",
          svg: `<svg viewBox="0 0 620 220" role="img" aria-label="App servers aggregate counts, send to regional aggregators, which flush totals to the database">
<defs><marker id="pt5-agg" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<text x="20" y="22" font-size="12" style="fill: var(--dg-muted)">1,000,000 views/s</text>
<g style="fill: var(--dg-3-soft); stroke: var(--dg-3)">
<rect x="20" y="35" width="110" height="30" rx="6"/><rect x="20" y="75" width="110" height="30" rx="6"/><rect x="20" y="115" width="110" height="30" rx="6"/><rect x="20" y="155" width="110" height="30" rx="6"/>
</g>
<g font-size="12" text-anchor="middle"><text x="75" y="55">app server</text><text x="75" y="95">app server</text><text x="75" y="135">app server</text><text x="75" y="175">app server</text></g>
<g stroke-width="2" style="stroke: var(--dg-muted)">
<line x1="130" y1="50" x2="228" y2="80" marker-end="url(#pt5-agg)"/><line x1="130" y1="90" x2="228" y2="88" marker-end="url(#pt5-agg)"/>
<line x1="130" y1="130" x2="228" y2="142" marker-end="url(#pt5-agg)"/><line x1="130" y1="170" x2="228" y2="150" marker-end="url(#pt5-agg)"/>
</g>
<text x="180" y="205" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">partial counts every T</text>
<rect x="230" y="65" width="140" height="40" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="300" y="90" text-anchor="middle" font-size="12" font-weight="700">aggregator (region A)</text>
<rect x="230" y="125" width="140" height="40" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="300" y="150" text-anchor="middle" font-size="12" font-weight="700">aggregator (region B)</text>
<line x1="370" y1="85" x2="458" y2="112" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#pt5-agg)"/>
<line x1="370" y1="145" x2="458" y2="122" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#pt5-agg)"/>
<rect x="460" y="95" width="140" height="45" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="530" y="115" text-anchor="middle" font-size="12" font-weight="700">counter store</text>
<text x="530" y="131" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">count += n</text>
<text x="415" y="190" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">totals every T</text>
</svg>`,
        },
        {
          type: "lab",
          id: "swAggregate",
          caption: "Compare the three strategies at 2M views/s with a 10 s flush, then change the number of app servers. More servers means each sees fewer repeats, which is exactly what the aggregator tier recovers.",
        },
        {
          type: "code",
          lang: "python",
          title: "An idempotent windowed flush: replaying a window overwrites instead of double-counting",
          code: `# Consumer reads view events from Kafka, partitioned by video_id.
pending = defaultdict(int)
window_start = now_window()

for event in consumer:
    pending[event.video_id] += 1
    if now_window() != window_start:
        # One row per (video, window): a replay writes the same value again.
        db.upsert_many(
            ("view_windows", (vid, window_start), {"views": n})
            for vid, n in pending.items()
        )
        consumer.commit()        # offsets only after the totals are durable
        pending.clear()
        window_start = now_window()

# Readers sum recent windows, or a periodic job rolls windows into a total.`,
        },
        {
          type: "callout",
          tone: "mistake",
          title: "Blind increments plus replays",
          html: `<p>If the flush is "count += n" and the consumer crashes after writing but before committing its offset, the replay adds n again. Either write per-window totals keyed by window (as above), store the last applied offset in the same transaction as the counts, or accept small overcounts for metrics where that's fine. Say which in the interview.</p>`,
        },
        {
          type: "text",
          html: `<p>When even aggregated totals are more precision than the product needs, store a sketch. HyperLogLog counts unique viewers in a few kilobytes per item, and Count-Min Sketch tracks heavy hitters; both are covered in <a href="../../advanced-topics/ch4/">advanced topics ch4</a>.</p>`,
        },
      ],
    },
    {
      id: "hot-keys",
      title: "Hot keys and key splitting",
      kicker: "Split",
      blocks: [
        {
          type: "problem",
          html: `<p>A celebrity posts and the like counter for that one post receives 100,000 writes per second. The cluster has 200 nodes, but the counter is one key, and one key lives on one partition. That partition saturates, its writes are throttled or time out, and other keys that share it suffer too. Sharding distributed the keys; it did nothing for the load of a single key.</p>`,
        },
        {
          type: "diagram",
          title: "Splitting one counter into sub-keys",
          caption: "Writes pick a random suffix, so the load spreads over up to N partitions. A read fetches all N sub-counters and sums them, usually from a short-lived cache.",
          svg: `<svg viewBox="0 0 620 230" role="img" aria-label="A hot counter split into four sub-keys on different partitions, summed on read">
<defs><marker id="pt5-split" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="15" y="90" width="120" height="45" rx="8" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)"/>
<text x="75" y="110" text-anchor="middle" font-size="12" font-weight="700">likes on post123</text>
<text x="75" y="126" text-anchor="middle" font-size="12">100K/s</text>
<text x="160" y="80" font-size="12" style="fill: var(--dg-muted)">random k in 0..3</text>
<g stroke-width="2" style="stroke: var(--dg-muted)">
<line x1="135" y1="105" x2="228" y2="40" marker-end="url(#pt5-split)"/><line x1="135" y1="110" x2="228" y2="92" marker-end="url(#pt5-split)"/>
<line x1="135" y1="118" x2="228" y2="144" marker-end="url(#pt5-split)"/><line x1="135" y1="125" x2="228" y2="196" marker-end="url(#pt5-split)"/>
</g>
<g style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)">
<rect x="230" y="22" width="170" height="36" rx="6"/><rect x="230" y="74" width="170" height="36" rx="6"/><rect x="230" y="126" width="170" height="36" rx="6"/><rect x="230" y="178" width="170" height="36" rx="6"/>
</g>
<g font-size="12" text-anchor="middle">
<text x="315" y="45">post123#0 on partition 7</text><text x="315" y="97">post123#1 on partition 2</text><text x="315" y="149">post123#2 on partition 11</text><text x="315" y="201">post123#3 on partition 4</text>
</g>
<g stroke-width="2" style="stroke: var(--dg-muted)">
<line x1="400" y1="40" x2="478" y2="108" marker-end="url(#pt5-split)"/><line x1="400" y1="92" x2="478" y2="112" marker-end="url(#pt5-split)"/>
<line x1="400" y1="144" x2="478" y2="118" marker-end="url(#pt5-split)"/><line x1="400" y1="196" x2="478" y2="122" marker-end="url(#pt5-split)"/>
</g>
<rect x="480" y="92" width="125" height="45" rx="8" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/>
<text x="542" y="112" text-anchor="middle" font-size="12" font-weight="700">read: sum of 4</text>
<text x="542" y="128" text-anchor="middle" font-size="12">cached ~2 s</text>
</svg>`,
        },
        {
          type: "lab",
          id: "swHotKeySplit",
          caption: "At 20K likes/s, find the smallest N with nothing throttled. Note that some sub-keys collide on the same partition, so N must exceed the bare minimum.",
        },
        {
          type: "steps",
          title: "Handling hot keys in practice",
          items: [
            "<strong>Absorb first:</strong> buffer writes for the key in memory or a stream processor and write totals every second. This alone often brings a hot key under the partition limit.",
            "<strong>Split what remains:</strong> N sub-keys with N ≥ peak rate / per-partition capacity, plus headroom for collisions and growth.",
            "<strong>Split selectively:</strong> keep a small, replicated set of hot keys (with their N) that writers and readers both consult. Ordinary keys stay unsplit and cost one read.",
            "<strong>Detect early:</strong> sample per-key write rates at the API or proxy and track the top keys over short windows (a heavy-hitters sketch works); watch per-partition throttling metrics.",
            "<strong>Pre-split the predictable:</strong> accounts with huge followings, scheduled flash sales, a live event's vote counter.",
            "<strong>Cache the read:</strong> the sum of N sub-keys changes constantly; serve it from a cache with a TTL of a second or two.",
          ],
        },
        {
          type: "realworld",
          items: [
            { org: "Amazon DynamoDB", html: "<p>Documents per-partition throughput limits (about 1,000 write units per second) and recommends write sharding, appending a random or calculated suffix to the partition key, for keys that would otherwise concentrate writes. Its adaptive capacity can shift throughput toward busy partitions, but one item's writes still land on one partition.</p>" },
            { org: "Discord", html: "<p>Described storing messages in Cassandra with a partition key of channel ID plus a fixed time bucket, so a busy channel's history is split across many partitions instead of growing one forever.</p>" },
          ],
        },
        {
          type: "quiz",
          q: "You split every post's like counter into 32 sub-keys to be safe. Likes are 50K/s overall; count reads are 2M/s. What is the main cost?",
          options: [
            "Writes get 32 times more expensive",
            "Every count read now needs 32 lookups, multiplying read load about 32 times for posts that were never hot",
            "Likes can no longer be deduplicated",
            "Sub-keys break consistent hashing",
          ],
          answer: 1,
          explain: "Each write still touches one sub-key, so write cost is unchanged. Reads pay: 2M count reads become about 64M lookups. Split only keys detected or expected to be hot, and cache the summed value.",
        },
      ],
    },
    {
      id: "resharding",
      title: "Resharding a live system",
      kicker: "Growth",
      blocks: [
        {
          type: "text",
          html: `<p>Whatever shard count you start with, growth will outrun it. With naive <code>hash(key) mod N</code>, changing N moves almost every key. Two ideas avoid that. <strong>Consistent hashing</strong> (<a href="../../core-concepts/ch16/">core concepts ch16</a>) moves only the keys adjacent to a new node. <strong>Logical shards</strong> go further: hash keys into a large fixed number of logical shards (say 4,096) from day one and keep a small map from logical shard to physical database. Growing means moving whole logical shards to new machines and updating the map; no key is ever rehashed.</p>`,
        },
        {
          type: "steps",
          title: "Moving data while serving writes",
          items: [
            "<strong>Copy:</strong> start a bulk copy of the logical shard (or key range) to the new location, throttled so live traffic doesn't suffer.",
            "<strong>Catch up:</strong> stream changes made during the copy, from the database's log (CDC) or by dual-writing to old and new locations.",
            "<strong>Verify:</strong> compare row counts and checksums, or shadow-read from both and log differences.",
            "<strong>Cut over:</strong> briefly pause writes for that shard (milliseconds to seconds), apply the last changes, flip the routing map, resume.",
            "<strong>Clean up:</strong> keep the old copy until the new one has proven itself, then delete it. Every step before this one should be reversible.",
          ],
        },
        {
          type: "realworld",
          items: [
            { org: "Instagram", html: "<p>Described sharding Postgres into thousands of logical shards mapped onto far fewer physical servers, so capacity grows by moving logical shards rather than re-splitting data, and embedding the logical shard ID in generated IDs.</p>" },
            { org: "Vitess", html: "<p>The MySQL sharding layer originally built at YouTube supports resharding by copying data to new shards, keeping them in sync from the binlog, then switching traffic over.</p>" },
          ],
        },
        {
          type: "callout",
          tone: "interview",
          title: "The short answer",
          html: `<p>"I'll hash keys into many logical shards from the start, mapped to a handful of databases. To grow, I copy a logical shard to a new machine, catch up from the binlog, verify, then flip its entry in the routing map during a short write pause. No key changes shard except the ones being moved."</p>`,
        },
      ],
    },
    {
      id: "tradeoffs-and-interview",
      title: "Trade-offs and the interview",
      kicker: "Putting it together",
      blocks: [
        {
          type: "tradeoffs",
          prosLabel: "What these techniques buy",
          consLabel: "What they cost",
          pros: [
            "Sharding scales total write throughput roughly linearly with the number of shards.",
            "Queues absorb bursts and protect the database from overload.",
            "Batching and aggregation cut database writes by orders of magnitude for counters.",
            "Key splitting lets one hot entity exceed a single partition's limit.",
          ],
          cons: [
            "Cross-shard queries, transactions and uniqueness get harder; resharding is real work.",
            "Queued writes are applied later; users may not see their own action immediately.",
            "Aggregated data is stale by the flush interval and can be lost or double-counted on crashes without care.",
            "Split keys multiply read cost and add a hot-key registry to maintain.",
          ],
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>Interviewers listen for a sequence, not a list of tools:</p>
<ol>
<li><strong>Number first:</strong> the write rate and peak from your estimate, against what one node handles.</li>
<li><strong>Partition key:</strong> chosen for even spread <em>and</em> single-shard main reads, with time as a secondary component.</li>
<li><strong>Bursts:</strong> a bounded queue, back-pressure, and an explicit shedding order.</li>
<li><strong>Less writing:</strong> batching, in-memory or tiered aggregation, sketches for approximate counts.</li>
<li><strong>Hot keys:</strong> named before you are asked, with detection and splitting.</li>
<li><strong>Failure and growth:</strong> what is lost on a crash, how replays stay idempotent, how you reshard.</li>
</ol>`,
        },
        {
          type: "quiz",
          q: "A design does 800 writes/s today, with growth to 3,000/s expected in two years. The candidate proposes 16 Cassandra shards and Kafka in front. What is the best critique?",
          options: [
            "Cassandra should be replaced with MongoDB",
            "16 shards is too few for 3,000 writes/s",
            "The load fits comfortably on a single relational primary; the extra components add cost and failure modes without solving a real problem",
            "Kafka should be replaced with SQS",
          ],
          answer: 2,
          explain: "A few thousand simple writes per second is within reach of one well-provisioned database. Scaling writes starts with the number: shard when the estimate demands it, and say what would trigger the change (for example sustained load above a set fraction of one node's capacity).",
        },
      ],
    },
  ],
  takeaways: [
    "Replicas and caches scale reads; writes scale only by splitting ownership of the data, smoothing them in time, or writing less.",
    "Get the most from one node first: LSM storage for append-heavy data, fewer indexes, append-only schemas, batched commits.",
    "A partition key must spread writes evenly and keep the main read on one shard; use time only as a second component, never alone.",
    "Queues smooth bursts but can't fix a shortfall in capacity; bound them, apply back-pressure, and shed low-value writes first.",
    "Aggregate counters in memory or in tiers before writing; make flushes idempotent and keep raw events in a durable log.",
    "A hot key defeats any number of shards; absorb, then split it into N sub-keys summed on read, only for keys that are actually hot.",
    "Plan resharding from day one with many logical shards mapped to fewer machines.",
  ],
  furtherReading: [
    { title: "Designing Data-Intensive Applications, chapter 6: Partitioning (Martin Kleppmann)", note: "Key-range versus hash partitioning, skewed workloads and hot spots, secondary indexes and rebalancing." },
    { title: "Designing Data-Intensive Applications, chapter 3: Storage and Retrieval", note: "LSM trees and B-trees, and why their write paths differ." },
    { title: "Amazon DynamoDB Developer Guide: best practices for partition key design", note: "Per-partition limits and write sharding with key suffixes." },
    { title: "How Discord Stores Billions of Messages (Discord engineering blog, 2017)", note: "Choosing a Cassandra partition key of channel plus time bucket." },
    { title: "Sharding & IDs at Instagram (Instagram engineering blog)", note: "Logical shards mapped to physical Postgres servers, and shard IDs embedded in generated IDs." },
  ],
};
