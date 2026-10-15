// Deep dive: Chapter 6, Partitioning. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch6 = {
  hook: `<p>Your event-tracking service stores every click in one table keyed by timestamp. It reaches 20 TB and 80,000 writes per second, far beyond one machine, so you split it across ten servers by time range: January to February on server 1, and so on. The next morning nine servers are idle and one is on fire, because every click that happens <em>now</em> belongs to the current range and lands on the same machine. You switch to hashing the key, the load evens out beautifully, and then the analytics team's query "all clicks between 9:00 and 9:05" has to ask all ten servers and wait for the slowest.</p>
<p>Splitting data across machines is unavoidable past a certain size, and the way you split it decides which queries stay cheap, where hot spots form, and how painful it is to add the eleventh server. Chapter 6 covers the choices: key-range versus hash partitioning, skew, secondary indexes, rebalancing and request routing.</p>`,
  sections: [
    {
      id: "why-partition",
      title: "Why partition, and how it combines with replication",
      kicker: "Motivation",
      blocks: [
        {
          type: "problem",
          html: `<p>Replication copies the whole dataset to every replica. That helps with failures and read load, but every replica still has to store all the data and apply every write. Once the dataset or the write rate outgrows one machine, you have to break the data into pieces and give different pieces to different machines.</p>`,
        },
        {
          type: "text",
          html: `<p>A <strong>partition</strong> is a subset of the data in which each record belongs to exactly one partition. Different systems use different names for the same idea: a <em>shard</em> in MongoDB, Elasticsearch and SolrCloud, a <em>region</em> in HBase, a <em>tablet</em> in Bigtable, a <em>vnode</em> in Cassandra and Riak, a <em>vBucket</em> in Couchbase, a <em>range</em> in CockroachDB. Each partition behaves like a small database of its own, so queries that touch one partition can run on one node, and the total throughput grows with the number of nodes.</p>
<p>The goal is to spread data and query load <strong>evenly</strong>. If the split is uneven, called <strong>skew</strong>, a few partitions get most of the work and the cluster is only as fast as its busiest node. A partition with disproportionately high load is a <strong>hot spot</strong>.</p>
<p>Partitioning is almost always combined with replication: each partition is stored on several nodes for fault tolerance, and each node stores several partitions. With single-leader replication, every partition has its own leader, and the leaders are spread across nodes so that no one node handles all the writes.</p>`,
        },
        {
          type: "diagram",
          title: "Three partitions, each replicated three times",
          caption: "Each node is the leader for one partition and a follower for the other two, so write load and data are both spread across the cluster. Losing a node loses no data, and the followers elsewhere can take over its leaderships.",
          svg: `<svg viewBox="0 0 620 225" role="img" aria-label="Three nodes each hold three partition replicas: one leader and two followers, with the leaders on different nodes">
<rect x="20" y="15" width="180" height="195" rx="10" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="110" y="40" text-anchor="middle" font-size="13" font-weight="700">Node 1</text>
<rect x="35" y="60" width="150" height="36" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="110" y="83" text-anchor="middle" font-size="12" font-weight="700">P1 leader</text>
<rect x="35" y="110" width="150" height="36" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<text x="110" y="133" text-anchor="middle" font-size="12">P2 follower</text>
<rect x="35" y="160" width="150" height="36" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="1.5"/>
<text x="110" y="183" text-anchor="middle" font-size="12">P3 follower</text>
<rect x="220" y="15" width="180" height="195" rx="10" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="310" y="40" text-anchor="middle" font-size="13" font-weight="700">Node 2</text>
<rect x="235" y="60" width="150" height="36" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="310" y="83" text-anchor="middle" font-size="12" font-weight="700">P2 leader</text>
<rect x="235" y="110" width="150" height="36" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="1.5"/>
<text x="310" y="133" text-anchor="middle" font-size="12">P3 follower</text>
<rect x="235" y="160" width="150" height="36" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<text x="310" y="183" text-anchor="middle" font-size="12">P1 follower</text>
<rect x="420" y="15" width="180" height="195" rx="10" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="510" y="40" text-anchor="middle" font-size="13" font-weight="700">Node 3</text>
<rect x="435" y="60" width="150" height="36" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="510" y="83" text-anchor="middle" font-size="12" font-weight="700">P3 leader</text>
<rect x="435" y="110" width="150" height="36" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<text x="510" y="133" text-anchor="middle" font-size="12">P1 follower</text>
<rect x="435" y="160" width="150" height="36" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<text x="510" y="183" text-anchor="middle" font-size="12">P2 follower</text>
</svg>`,
        },
        {
          type: "keypoints",
          items: [
            "Partitioning splits the data so each node stores and serves only part of it; replication copies each part for fault tolerance.",
            "The aim is even load. Skew and hot spots waste the extra machines.",
            "Partitioning and replication are mostly independent choices: everything from Chapter 5 applies to each partition.",
          ],
        },
        {
          type: "quiz",
          q: "A cluster of 6 nodes stores 12 partitions with a replication factor of 3, using single-leader replication per partition. Spread evenly, how many partition replicas does each node hold, and how many of them is it the leader for?",
          options: ["2 replicas, 2 leaders", "6 replicas, 2 leaders", "12 replicas, 12 leaders", "6 replicas, 6 leaders"],
          answer: 1,
          explain: "There are 12 &times; 3 = 36 replicas in total, so 6 per node. Each partition has exactly one leader, so the 12 leaderships spread over 6 nodes give 2 each. Spreading leaders is what spreads the write load.",
        },
      ],
    },
    {
      id: "key-range-partitioning",
      title: "Partitioning by key range",
      kicker: "Strategy one",
      blocks: [
        {
          type: "idea",
          html: `<p>Give each partition a <strong>continuous range of keys</strong>, like the volumes of a printed encyclopedia: A to Ce in volume 1, Cf to Fo in volume 2, and so on. If you know the boundaries, you know which partition holds any key, and keys inside each partition can be kept sorted.</p>`,
        },
        {
          type: "text",
          html: `<p>The ranges do not need to be the same width, because data is rarely spread evenly across the alphabet or the number line. The boundaries are chosen to balance the amount of data, either by an administrator or, more commonly, automatically by the database, which splits a range when it grows too big. Bigtable, HBase, MongoDB (in its range-sharding mode), CockroachDB, TiKV and Spanner all partition by key range.</p>
<p>Because keys are sorted within each partition, <strong>range scans are efficient</strong>: "all readings for sensor 42 between 10:00 and 11:00" touches one partition, or a few neighboring ones, and reads a contiguous block. A key can also be designed as a concatenated index, such as <code>(sensor_id, timestamp)</code>, to fetch related records in one sweep.</p>
<p>The weakness is that certain access patterns produce hot spots. The classic case is a key that increases with time. If the key is a timestamp, all of today's writes fall in the newest range, so one partition takes all writes while the rest sit idle, which is the problem in the opening story.</p>`,
        },
        {
          type: "text",
          html: `<p>The fix is to put something other than time first in the key. Prefixing the timestamp with the sensor ID spreads writes across partitions as long as many sensors are active at once. The price is that a query for "all sensors between 10:00 and 11:00" must now run a separate range query for each sensor ID prefix. The key design determines which questions are cheap.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "HBase and Bigtable", title: "Splitting regions", html: "Tables start as one region (tablet) and split automatically when a region grows past a size threshold, around 10 GB by default in recent HBase versions. HBase documentation warns specifically against monotonically increasing row keys, and recommends salting or reordering key components." },
            { org: "CockroachDB and Spanner", title: "Ranges that split on size and load", html: "Data is stored as sorted key ranges that split when they exceed a configurable size, and can also split when a range receives disproportionate traffic. Small ranges are merged back together." },
          ],
        },
        {
          type: "quiz",
          q: "An orders table in a range-partitioned database uses an auto-incrementing order ID as its key. Writes have slowed even though the cluster has 20 nodes. What is the most likely cause?",
          options: [
            "Too many partitions",
            "Every new order has the largest ID so far, so all inserts go to the last range and one partition takes all writes",
            "Range partitioning cannot handle integers",
            "The replication factor is too low",
          ],
          answer: 1,
          explain: "Monotonically increasing keys always land in the newest range, so a single partition (and its leader node) absorbs every insert. Hashing the key, prefixing it with a well-distributed value, or using non-sequential IDs spreads the writes.",
        },
      ],
    },
    {
      id: "hash-partitioning",
      title: "Partitioning by hash of key",
      kicker: "Strategy two",
      blocks: [
        {
          type: "idea",
          html: `<p>Run each key through a <strong>hash function</strong> and partition by ranges of the hash instead of the key. A good hash scatters even very similar keys (consecutive timestamps, adjacent IDs) uniformly, so data and writes spread evenly.</p>`,
        },
        {
          type: "text",
          html: `<p>The hash does not need to be cryptographically strong, only well distributed and stable. That rules out some language built-ins: Java's <code>Object.hashCode()</code> and Ruby's <code>Object#hash</code> can return different values for the same key in different processes, which is useless for deciding where data lives. Cassandra uses Murmur3, which maps every key to a token between &minus;2<sup>63</sup> and 2<sup>63</sup>&minus;1, and each partition owns a range of tokens. MongoDB offers hashed sharding as an alternative to range sharding.</p>
<p>Each partition is given a range of hash values, with boundaries spaced evenly or chosen at random. The cost is that you lose the ordering of keys: adjacent keys end up on different partitions, so a range query must be sent to every partition and the results merged (a <strong>scatter-gather</strong>). MongoDB with hashed sharding does exactly this for range queries, and some systems with hash partitioning do not support range queries on the partition key at all.</p>`,
        },
        {
          type: "diagram",
          title: "Key range versus hash partitioning for time-ordered keys",
          caption: "With key ranges, today's writes all hit the newest partition, but time-range scans read one place. With hashing, writes spread across every partition, but a time-range scan must ask them all.",
          svg: `<svg viewBox="0 0 620 265" role="img" aria-label="Key-range partitioning sends all current writes to the last partition; hash partitioning spreads them across all four">
<text x="155" y="22" text-anchor="middle" font-size="13" font-weight="700">Key range (by date)</text>
<rect x="20" y="40" width="270" height="34" rx="5" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<text x="32" y="62" font-size="12">P1: Jan to Mar</text>
<rect x="20" y="84" width="270" height="34" rx="5" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<text x="32" y="106" font-size="12">P2: Apr to Jun</text>
<rect x="20" y="128" width="270" height="34" rx="5" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<text x="32" y="150" font-size="12">P3: Jul to Sep</text>
<rect x="20" y="172" width="270" height="34" rx="5" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)" stroke-width="2"/>
<text x="32" y="194" font-size="12" font-weight="700">P4: Oct to Dec (today)</text>
<text x="278" y="194" text-anchor="end" font-size="12" style="fill: var(--dg-bad)">all writes</text>
<text x="155" y="232" text-anchor="middle" font-size="12" style="fill: var(--dg-ok)">Range scans: one partition</text>
<text x="155" y="250" text-anchor="middle" font-size="12" style="fill: var(--dg-bad)">Writes: one hot partition</text>
<line x1="310" y1="10" x2="310" y2="255" stroke-width="1.5" stroke-dasharray="4 4" style="stroke: var(--dg-line)"/>
<text x="465" y="22" text-anchor="middle" font-size="13" font-weight="700">Hash of key</text>
<rect x="330" y="40" width="280" height="34" rx="5" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="1.5"/>
<text x="342" y="62" font-size="12">P1: hash 0000 to 3FFF</text>
<rect x="330" y="84" width="280" height="34" rx="5" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="1.5"/>
<text x="342" y="106" font-size="12">P2: hash 4000 to 7FFF</text>
<rect x="330" y="128" width="280" height="34" rx="5" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="1.5"/>
<text x="342" y="150" font-size="12">P3: hash 8000 to BFFF</text>
<rect x="330" y="172" width="280" height="34" rx="5" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="1.5"/>
<text x="342" y="194" font-size="12">P4: hash C000 to FFFF</text>
<text x="598" y="106" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">writes spread</text>
<text x="465" y="232" text-anchor="middle" font-size="12" style="fill: var(--dg-bad)">Range scans: ask every partition</text>
<text x="465" y="250" text-anchor="middle" font-size="12" style="fill: var(--dg-ok)">Writes: spread evenly</text>
</svg>`,
        },
        {
          type: "text",
          html: `<h3>Compound keys: the best of both</h3>
<p>Cassandra offers a middle ground. A table's primary key has a <strong>partition key</strong>, which is hashed to choose the partition, and <strong>clustering columns</strong>, which sort rows within the partition. For a messaging app, a key of <code>((conversation_id), sent_at)</code> hashes conversations across the cluster, while all messages in one conversation sit together in time order. "The latest 50 messages in conversation 81" is a single-partition range scan, even though the cluster as a whole is hash-partitioned. The only thing you cannot do cheaply is a range scan across conversations, which you rarely need.</p>
<h3>What about consistent hashing?</h3>
<p>Consistent hashing, in the original 1997 sense, is a way to choose partition boundaries randomly so that adding or removing a node moves as little data as possible, with no central coordination. In practice the term is used loosely; the book prefers to just say <em>hash partitioning</em> and to discuss rebalancing separately, which this chapter does below.</p>`,
        },
        {
          type: "table",
          headers: ["", "Key range", "Hash of key", "Compound key"],
          rows: [
            ["Data distribution", "Uneven unless ranges are tuned or split", "Even", "Even across partition keys"],
            ["Range scans", "Efficient", "Scatter-gather to all partitions", "Efficient within one partition key"],
            ["Hot spots", "Common with time-ordered keys", "Only for individually hot keys", "Only for individually hot partition keys"],
            ["Examples", "HBase, Bigtable, Spanner, CockroachDB", "Cassandra, DynamoDB, Riak, MongoDB hashed", "Cassandra and DynamoDB (partition key plus sort key)"],
          ],
        },
        {
          type: "quiz",
          q: "A Cassandra table for IoT data uses <code>PRIMARY KEY ((device_id), reading_time)</code>. Which query is efficient?",
          options: [
            "All readings from every device in the last hour",
            "The last hour of readings from device 1234",
            "All devices whose latest reading exceeded a threshold",
            "Readings sorted by value across the cluster",
          ],
          answer: 1,
          explain: "device_id is hashed to find one partition, and reading_time sorts rows within it, so one device's recent readings are a contiguous slice of one partition. The other queries span every partition or need an ordering the table does not store.",
        },
      ],
    },
    {
      id: "skew-and-hot-spots",
      title: "Skewed workloads and hot keys",
      kicker: "Skew",
      blocks: [
        {
          type: "problem",
          html: `<p>Hashing spreads <em>keys</em> evenly. It cannot spread the load of a <em>single</em> key, because all requests for the same key hash to the same partition. When one celebrity with tens of millions of followers posts something, every like, reply and view may target that one post's ID, and the node that owns it can be overwhelmed while the rest of the cluster idles.</p>`,
        },
        {
          type: "text",
          html: `<p>Most databases cannot fix this automatically, so it falls to the application. A common technique is <strong>key splitting</strong>: append a small random number to a hot key, for example a two-digit suffix that turns one key into 100 different keys, each of which can land on a different partition. Writes pick a random suffix. Reads must now fetch all 100 keys and combine them, which multiplies their cost, so you only do this for the handful of keys known to be hot, and you need bookkeeping to remember which keys have been split.</p>
<p>Other mitigations depend on whether the hot load is reads or writes:</p>
<ul>
<li>For hot <strong>reads</strong>, put a cache in front (including a small in-process cache on each application server), or keep extra replicas of the hot partition and spread reads across them.</li>
<li>For hot <strong>writes</strong> such as counters, combine writes before they reach the database: accumulate likes in memory for a second and write one increment of 500 instead of 500 increments of one.</li>
<li>Denormalize, so that popular data is copied into the places that read it instead of being fetched from one home.</li>
</ul>`,
        },
        {
          type: "tradeoffs",
          prosLabel: "Key splitting helps",
          consLabel: "Key splitting costs",
          pros: [
            "Turns one overloaded partition into many partitions each carrying a fraction of the load",
            "Works with any hash-partitioned store, with no database support needed",
          ],
          cons: [
            "Every read of the key fans out to all of its splits and merges the results",
            "You must track which keys are split, and when to stop splitting them",
            "Splitting every key would multiply read costs for no benefit",
          ],
        },
        {
          type: "callout",
          tone: "modern",
          html: `<p>Managed databases have gained some automatic hot-spot handling since 2017. DynamoDB's adaptive capacity shifts throughput toward busy partitions and can split partitions that receive heavy traffic, and range-partitioned systems such as CockroachDB and Spanner can split a range based on load as well as size. None of these can split a single item, so a truly hot key still needs application-level work.</p>`,
        },
        {
          type: "quiz",
          q: "A view counter for a viral video receives 200,000 increments per second, all to the key <code>views:video42</code>. The database is hash partitioned across 50 nodes. Which fix addresses the bottleneck?",
          options: [
            "Add 50 more nodes",
            "Switch to key-range partitioning",
            "Buffer increments and write batched totals, or split the counter into many sub-keys and sum them on read",
            "Increase the replication factor of the whole cluster",
          ],
          answer: 2,
          explain: "Every increment hashes to the same partition, so adding nodes or changing the partitioning scheme does not move any of that load. Combining writes reduces the rate; splitting the key spreads it over several partitions, at the price of summing on read.",
        },
      ],
    },
    {
      id: "secondary-indexes",
      title: "Partitioning secondary indexes",
      kicker: "Secondary indexes",
      blocks: [
        {
          type: "problem",
          html: `<p>Everything so far assumed you look records up by their primary key, which tells you exactly which partition to ask. Real applications also search by other attributes: users in a given city, orders with status "pending", products of a certain brand. A secondary index does not map neatly to partitions, because the matching records are scattered across all of them.</p>`,
        },
        {
          type: "text",
          html: `<p>There are two main ways to partition a secondary index.</p>
<p><strong>Document-partitioned (local) indexes.</strong> Each partition maintains an index covering only its own records. A write touches only the partition that holds the record, which keeps writes simple and fast. But a query by the secondary attribute has no idea which partitions contain matches, so it must be sent to every partition and the results combined: scatter-gather. That makes reads expensive and exposed to tail latency, since the query waits for the slowest partition. MongoDB, Elasticsearch and Cassandra use local secondary indexes.</p>
<p><strong>Term-partitioned (global) indexes.</strong> Build one index covering all partitions, and partition the index itself by the indexed value (the term). All entries for <code>city = Lyon</code> live in one index partition, no matter where the records are. A query reads only that index partition. The cost moves to writes: one record update may have to change index partitions on other nodes, which either needs a distributed transaction or, more commonly, is done asynchronously so the index lags behind the data.</p>`,
        },
        {
          type: "diagram",
          title: "Local versus global secondary indexes",
          caption: "Left: each partition indexes only its own users, so a query by city must ask every partition. Right: the index is partitioned by city name, so the query reads one index partition, but writes may have to update an index partition on another node.",
          svg: `<svg viewBox="0 0 620 285" role="img" aria-label="A local index requires querying every partition; a global index partitioned by term sends the query to one index partition">
<defs><marker id="ddia6-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="95" y="20" width="120" height="32" rx="6" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="2"/>
<text x="155" y="41" text-anchor="middle" font-size="12" font-weight="700">city = Lyon</text>
<rect x="15" y="90" width="135" height="150" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="82" y="110" text-anchor="middle" font-size="12" font-weight="700">Partition 0</text>
<text x="25" y="135" font-size="12">user 1: Lyon</text>
<text x="25" y="155" font-size="12">user 4: Oslo</text>
<line x1="25" y1="168" x2="140" y2="168" stroke-width="1" style="stroke: var(--dg-line)"/>
<text x="25" y="188" font-size="12" style="fill: var(--dg-muted)">local index</text>
<text x="25" y="208" font-size="12">Lyon &#8594; 1</text>
<text x="25" y="226" font-size="12">Oslo &#8594; 4</text>
<rect x="160" y="90" width="135" height="150" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="227" y="110" text-anchor="middle" font-size="12" font-weight="700">Partition 1</text>
<text x="170" y="135" font-size="12">user 7: Lyon</text>
<text x="170" y="155" font-size="12">user 9: Rome</text>
<line x1="170" y1="168" x2="285" y2="168" stroke-width="1" style="stroke: var(--dg-line)"/>
<text x="170" y="188" font-size="12" style="fill: var(--dg-muted)">local index</text>
<text x="170" y="208" font-size="12">Lyon &#8594; 7</text>
<text x="170" y="226" font-size="12">Rome &#8594; 9</text>
<line x1="140" y1="52" x2="88" y2="86" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia6-arrow)"/>
<line x1="170" y1="52" x2="222" y2="86" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia6-arrow)"/>
<text x="155" y="268" text-anchor="middle" font-size="12" style="fill: var(--dg-bad)">Query asks every partition</text>
<line x1="310" y1="10" x2="310" y2="275" stroke-width="1.5" stroke-dasharray="4 4" style="stroke: var(--dg-line)"/>
<rect x="405" y="20" width="120" height="32" rx="6" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="2"/>
<text x="465" y="41" text-anchor="middle" font-size="12" font-weight="700">city = Lyon</text>
<rect x="325" y="80" width="135" height="60" rx="8" style="fill: var(--dg-5-soft); stroke: var(--dg-5)" stroke-width="2"/>
<text x="392" y="100" text-anchor="middle" font-size="12" font-weight="700">Index: A to M</text>
<text x="392" y="125" text-anchor="middle" font-size="12">Lyon &#8594; 1, 7</text>
<rect x="470" y="80" width="135" height="60" rx="8" style="fill: var(--dg-5-soft); stroke: var(--dg-5)" stroke-width="1.5"/>
<text x="537" y="100" text-anchor="middle" font-size="12" font-weight="700">Index: N to Z</text>
<text x="537" y="125" text-anchor="middle" font-size="12">Oslo &#8594; 4, Rome &#8594; 9</text>
<rect x="325" y="180" width="135" height="60" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="392" y="203" text-anchor="middle" font-size="12" font-weight="700">Partition 0</text>
<text x="392" y="225" text-anchor="middle" font-size="12">users 1, 4</text>
<rect x="470" y="180" width="135" height="60" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="537" y="203" text-anchor="middle" font-size="12" font-weight="700">Partition 1</text>
<text x="537" y="225" text-anchor="middle" font-size="12">users 7, 9</text>
<line x1="455" y1="52" x2="410" y2="76" stroke-width="2" style="stroke: var(--dg-ok)" marker-end="url(#ddia6-arrow)"/>
<line x1="380" y1="140" x2="380" y2="176" stroke-width="2" stroke-dasharray="5 4" style="stroke: var(--dg-muted)" marker-end="url(#ddia6-arrow)"/>
<line x1="430" y1="140" x2="500" y2="176" stroke-width="2" stroke-dasharray="5 4" style="stroke: var(--dg-muted)" marker-end="url(#ddia6-arrow)"/>
<text x="465" y="268" text-anchor="middle" font-size="12" style="fill: var(--dg-ok)">Query reads one index partition</text>
</svg>`,
        },
        {
          type: "compare",
          items: [
            { title: "Local (document-partitioned)", tone: "info", html: "Writes update one partition, and the index is always consistent with its data. Reads by the secondary attribute fan out to every partition, so they get slower and more tail-sensitive as the cluster grows. Best when most queries also include the partition key." },
            { title: "Global (term-partitioned)", tone: "ok", html: "Reads for one term hit one index partition (range queries on the term are possible too if the index is range partitioned). Writes may touch remote index partitions, so global indexes are usually updated asynchronously and can be briefly stale." },
          ],
        },
        {
          type: "realworld",
          items: [
            { org: "Amazon DynamoDB", title: "Both kinds, with different rules", html: "Local secondary indexes share the table's partition key, must be defined when the table is created, and support strongly consistent reads. Global secondary indexes have their own partition key, can be added later, are updated asynchronously, and support only eventually consistent reads." },
            { org: "Elasticsearch", title: "Local indexes and scatter-gather", html: "Each shard is a self-contained Lucene index over its own documents. A search is sent to one copy of every shard, and a coordinating node merges the top results, which is why queries over very many shards get slower." },
            { org: "Apache Cassandra", title: "Local indexes, used carefully", html: "Cassandra's secondary indexes are local to each node, so queries that do not include the partition key fan out across the cluster. Cassandra 5.0 added Storage-Attached Indexes (SAI), a more efficient local index design, but the guidance remains to include the partition key whenever possible." },
          ],
        },
        {
          type: "quiz",
          q: "An e-commerce site partitions orders by order_id and needs a page 'all orders for customer X', viewed constantly, while order writes are moderate. Which index approach suits it?",
          options: [
            "A local index on customer_id, queried across all partitions on every page view",
            "A global index on customer_id (or a separate table partitioned by customer_id), accepting that it may lag slightly behind writes",
            "No index; scan all orders",
            "Partition orders randomly",
          ],
          answer: 1,
          explain: "The query is frequent and selective, so asking every partition on every page view wastes capacity and suffers tail latency. A global index, or a denormalized copy keyed by customer, sends each query to one place. The cost is slightly more expensive writes and an index that may briefly lag, which is acceptable for an order history page.",
        },
      ],
    },
    {
      id: "rebalancing",
      title: "Rebalancing partitions",
      kicker: "Rebalancing",
      blocks: [
        {
          type: "problem",
          html: `<p>Clusters change. Query load grows and you add CPUs, the dataset grows and you add disks, a machine fails and others must take over. Moving load from one node to another is <strong>rebalancing</strong>, and it must leave the load fairly shared afterward, keep the database accepting reads and writes while it runs, and move no more data than necessary.</p>`,
        },
        {
          type: "text",
          html: `<h3>How not to do it: hash mod N</h3>
<p>Assigning keys to nodes with <code>hash(key) mod N</code> seems natural, but when N changes, most keys change node. Going from 10 to 11 nodes moves about 10 of every 11 keys, turning a routine expansion into a full reshuffle of the dataset. The fix is to stop tying key placement directly to the number of nodes.</p>
<h3>Fixed number of partitions</h3>
<p>Create many more partitions than nodes, say 1,000 partitions on a 10-node cluster, about 100 per node. Keys map to partitions and that mapping never changes. When a node joins, it takes a few partitions from each existing node until the load is even; when a node leaves, its partitions are spread among the others. Only whole partitions move, and only the assignment of partitions to nodes changes. Riak, Elasticsearch, Couchbase and Redis Cluster (16,384 hash slots) work this way.</p>
<p>The catch is choosing the number up front, since it is usually fixed at creation. Each partition holds a fixed fraction of the data, so partitions grow as the data does. Too few, and they become huge and slow to move or recover; too many, and the per-partition overhead adds up. If the dataset size is hard to predict, there is no good number.</p>
<h3>Dynamic partitioning</h3>
<p>For key-range partitioning especially, fixed boundaries are awkward, since a bad choice leaves all data in a few ranges. So databases such as HBase, MongoDB and CockroachDB <strong>split</strong> a partition into two when it grows past a size threshold and <strong>merge</strong> neighbors when they shrink. The number of partitions follows the data volume. One wrinkle: an empty database starts with a single partition, so all early writes go to one node until the first split; HBase and MongoDB let you <strong>pre-split</strong> with an initial set of boundaries.</p>
<h3>Partitioning proportionally to nodes</h3>
<p>Cassandra keeps a fixed number of partitions <em>per node</em> (its <code>num_tokens</code> setting). A new node picks token positions and takes over a share of existing ranges. Partition size then grows with the data per node rather than with the total, so it stays fairly stable as the cluster grows.</p>`,
        },
        {
          type: "table",
          title: "Rebalancing strategies compared",
          headers: ["Strategy", "Partition count", "Partition size", "Used by"],
          rows: [
            ["hash mod N", "Equals node count", "Varies", "Not recommended: most keys move when N changes"],
            ["Fixed partitions", "Fixed at creation", "Grows with total data", "Riak, Elasticsearch, Couchbase, Redis Cluster"],
            ["Dynamic splitting", "Grows and shrinks with data", "Bounded by a threshold", "HBase, MongoDB, CockroachDB, Spanner"],
            ["Proportional to nodes", "Fixed per node", "Grows with data per node", "Cassandra"],
          ],
        },
        {
          type: "realworld",
          items: [
            { org: "Instagram", title: "Logical shards on PostgreSQL", html: "Instagram's 2012 engineering post describes thousands of logical shards mapped onto a much smaller number of physical PostgreSQL servers, so capacity could be added by moving logical shards. Each 64-bit ID encoded a timestamp (41 bits), the logical shard ID (13 bits) and a sequence number (10 bits)." },
            { org: "Apache Kafka", title: "When the partition count is part of the contract", html: "Kafka's default partitioner chooses a partition by hashing the message key modulo the topic's partition count. Partitions can be added but not removed, and adding them changes which partition a key maps to, breaking per-key ordering for consumers. Teams therefore choose partition counts with growth in mind." },
          ],
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p>Fully automatic rebalancing is convenient and dangerous. Moving partitions is expensive: it consumes network and disk on nodes that may already be struggling. Combined with automatic failure detection it can cascade: a node that is merely overloaded looks dead, the cluster moves its partitions elsewhere, which overloads more nodes. That is why some databases generate a proposed partition assignment and wait for an operator to approve it, and why rebalancing speed is usually throttled.</p>`,
        },
        {
          type: "quiz",
          q: "A team plans a key-value cluster of 8 nodes that may grow to 200 over five years, using a fixed number of partitions chosen at creation. Which choice is most sensible?",
          options: [
            "8 partitions, one per node",
            "200 partitions, one per future node",
            "Several thousand partitions, so each future node still gets many and each partition stays reasonably small",
            "Use hash mod N with N equal to the node count",
          ],
          answer: 2,
          explain: "Partitions are the unit of movement, so you need many more than the largest expected node count to rebalance evenly and keep each one small enough to move quickly. With 8 or 200 partitions, growth either cannot spread the load or leaves each partition too big. Hash mod N reshuffles most keys on every change.",
        },
      ],
    },
    {
      id: "request-routing",
      title: "Request routing: finding the right node",
      kicker: "Routing",
      blocks: [
        {
          type: "problem",
          html: `<p>Once data is spread across nodes and partitions move during rebalancing, a client that wants key <code>user:42</code> needs to know which IP address and port to connect to, and that answer changes over time. This is a special case of <strong>service discovery</strong>, and the core difficulty is keeping every participant's view of the partition map up to date.</p>`,
        },
        {
          type: "diagram",
          title: "Three ways to route a request",
          caption: "(a) The client contacts any node, which forwards the request if it does not own the key. (b) A partition-aware routing tier forwards each request. (c) The client knows the partition map and connects directly to the owner.",
          svg: `<svg viewBox="0 0 620 265" role="img" aria-label="Three routing approaches: any node forwards, a routing tier forwards, or a partition-aware client connects directly">
<defs><marker id="ddia6-arrow2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="55" y="30" width="100" height="34" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="105" y="52" text-anchor="middle" font-size="12" font-weight="700">Client</text>
<rect x="20" y="190" width="75" height="34" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="57" y="212" text-anchor="middle" font-size="12">Node 1</text>
<rect x="115" y="190" width="75" height="34" rx="6" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="152" y="212" text-anchor="middle" font-size="12">Node 2</text>
<line x1="90" y1="64" x2="62" y2="186" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia6-arrow2)"/>
<line x1="95" y1="207" x2="111" y2="207" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia6-arrow2)"/>
<text x="105" y="252" text-anchor="middle" font-size="12" font-weight="700">(a) Any node forwards</text>
<line x1="207" y1="15" x2="207" y2="255" stroke-width="1.5" stroke-dasharray="4 4" style="stroke: var(--dg-line)"/>
<rect x="260" y="30" width="100" height="34" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="310" y="52" text-anchor="middle" font-size="12" font-weight="700">Client</text>
<rect x="245" y="110" width="130" height="34" rx="6" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="2"/>
<text x="310" y="132" text-anchor="middle" font-size="12">Routing tier</text>
<rect x="225" y="190" width="75" height="34" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="262" y="212" text-anchor="middle" font-size="12">Node 1</text>
<rect x="320" y="190" width="75" height="34" rx="6" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="357" y="212" text-anchor="middle" font-size="12">Node 2</text>
<line x1="310" y1="64" x2="310" y2="106" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia6-arrow2)"/>
<line x1="330" y1="144" x2="352" y2="186" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia6-arrow2)"/>
<text x="310" y="252" text-anchor="middle" font-size="12" font-weight="700">(b) Routing tier</text>
<line x1="412" y1="15" x2="412" y2="255" stroke-width="1.5" stroke-dasharray="4 4" style="stroke: var(--dg-line)"/>
<rect x="440" y="30" width="150" height="34" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="515" y="52" text-anchor="middle" font-size="12" font-weight="700">Partition-aware client</text>
<rect x="430" y="190" width="75" height="34" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="467" y="212" text-anchor="middle" font-size="12">Node 1</text>
<rect x="525" y="190" width="75" height="34" rx="6" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="562" y="212" text-anchor="middle" font-size="12">Node 2</text>
<line x1="535" y1="64" x2="558" y2="186" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia6-arrow2)"/>
<text x="515" y="252" text-anchor="middle" font-size="12" font-weight="700">(c) Smart client</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>Whichever component makes the routing decision, it must learn about changes in the assignment of partitions to nodes, and every participant must agree, or requests go to the wrong node. Getting agreement in a distributed system is hard, so many systems delegate it to a separate coordination service. <strong>ZooKeeper</strong> is the classic one: nodes register in it, it holds the authoritative partition map, and routers or clients subscribe to changes. HBase and SolrCloud use ZooKeeper, and Kafka historically did. MongoDB uses its own config servers, with <code>mongos</code> processes as the routing tier.</p>
<p>Cassandra and Riak take a different approach: nodes use a <strong>gossip protocol</strong> to spread cluster state among themselves, a client can send a request to any node, and that node forwards it to the right replicas (approach a). Cassandra's drivers can also be token-aware, connecting directly to a replica (approach c). This avoids an external dependency at the cost of more complexity inside each node.</p>
<p>The same question arises for queries that span partitions. Simple key-value systems route only single-key requests; <strong>massively parallel processing (MPP)</strong> databases built for analytics break a complex query into stages that run across many partitions in parallel, the subject of later chapters.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Vitess", title: "A routing tier for sharded MySQL", html: "Vitess, which originated at YouTube, puts <code>vtgate</code> proxies in front of many MySQL shards. Applications connect to vtgate as if it were one database, and it routes queries using shard metadata kept in a topology service such as etcd, ZooKeeper or Consul." },
            { org: "Redis Cluster", title: "Clients that learn the map", html: "If a client sends a command to the wrong node, the node replies with a <code>MOVED</code> redirect naming the slot's owner. Smart clients cache the slot map and update it when redirected, combining approaches (a) and (c)." },
          ],
        },
        {
          type: "callout",
          tone: "modern",
          html: `<p>Kafka has removed its dependency on ZooKeeper. KRaft mode, in which a quorum of Kafka controllers stores cluster metadata in an internal Raft-replicated log, was declared production-ready in Kafka 3.3 (2022), and Kafka 4.0 (2025) dropped ZooKeeper support entirely. More broadly, Raft-based stores such as etcd have become the common choice for this kind of metadata, as in Kubernetes and Vitess.</p>`,
        },
        {
          type: "quiz",
          q: "During rebalancing, partition 17 moves from node A to node B. A client with an outdated partition map sends a request for a key in partition 17 to node A. In a well-designed system, what should happen?",
          options: [
            "Node A serves stale data from its old copy",
            "Node A rejects or redirects the request (or forwards it to B), and the client refreshes its map from the authoritative source",
            "The request is silently dropped",
            "Node A takes partition 17 back",
          ],
          answer: 1,
          explain: "Routing metadata is always slightly behind somewhere, so nodes must recognize requests for partitions they no longer own. Redis Cluster's MOVED redirect is a concrete example; other systems forward the request or return an error that makes the client reload the map from ZooKeeper, a config server or gossip state.",
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
          html: `<p>Partitioning shows up whenever a design outgrows one database: "how would you shard this?", "what is your partition key?", "what happens when a celebrity posts?", "how do you add capacity?". The partition key is the single most consequential decision, because it fixes which queries hit one partition and which become scatter-gathers, and it is very hard to change later.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>A good sharding answer follows the access patterns:</p>
<ol>
<li>List the most frequent queries and pick a partition key that makes them single-partition. For a chat app, partition messages by <code>conversation_id</code> and cluster by time.</li>
<li>Check for hot spots: monotonically increasing keys (avoid as the leading key component) and individually hot keys (celebrities, viral items), with a mitigation such as key splitting, write combining or caching.</li>
<li>Say how secondary access paths work: a global index or a second denormalized table keyed differently, updated asynchronously.</li>
<li>Explain growth: many more partitions than nodes, or automatic splitting, never hash mod N.</li>
<li>Explain routing: a routing tier or smart clients, backed by a coordination service.</li>
</ol>`,
        },
        {
          type: "table",
          title: "Worked example: partitioning a Twitter-like service",
          headers: ["Data", "Partition key", "Clustering or sort", "Why"],
          rows: [
            ["Tweets", "tweet_id (hashed)", "None", "Even spread; lookups by ID are single-partition"],
            ["User timelines (own tweets)", "author_id", "Tweet time, descending", "\"Latest tweets by user X\" reads one partition"],
            ["Home timeline cache", "viewer_id", "Tweet time, descending", "Each viewer's feed is one partition read"],
            ["Follower lists", "followee_id", "follower_id", "Fan-out on write reads one partition per author; split very large accounts"],
            ["Search by hashtag", "Global index by hashtag", "Time", "Avoids asking every tweet partition; updated asynchronously"],
          ],
          note: "Celebrity accounts make the follower-list partition and the fan-out work hot, which is why a hybrid push/pull timeline (Chapter 1) pairs naturally with this layout.",
        },
        {
          type: "quiz",
          q: "An interviewer asks: 'Why not just shard user data by hash(user_id) mod number_of_servers?' What is the strongest objection?",
          options: [
            "Hashing user IDs is insecure",
            "Changing the number of servers remaps almost every user, forcing a near-total data migration; use many fixed partitions or splittable ranges instead",
            "User IDs are not unique",
            "Modulo is too slow to compute",
          ],
          answer: 1,
          explain: "With mod N, a key's server depends on the server count, so going from N to N+1 moves about N/(N+1) of all keys. Mapping keys to a large fixed set of partitions (or to splittable ranges) and moving whole partitions between servers changes only a small fraction of placements.",
        },
      ],
    },
  ],
  takeaways: [
    "Partitioning splits data so each node stores and serves part of it; it is combined with replication so each partition survives node failures.",
    "Key-range partitioning keeps keys sorted, so range scans are cheap, but time-ordered or sequential keys create a single hot partition.",
    "Hash partitioning spreads keys evenly but destroys ordering, turning range queries into scatter-gathers. Compound keys (hashed partition key plus sorted clustering columns) give even spread and cheap per-entity range scans.",
    "No partitioning scheme spreads the load of one hot key. Key splitting, write combining and caching are application-level fixes.",
    "Local secondary indexes keep writes cheap but make queries ask every partition; global indexes make queries cheap but writes cross-partition and usually asynchronous.",
    "Never place data with hash mod N. Use many fixed partitions, dynamic splitting, or a fixed number per node, and move whole partitions, throttled and preferably with a human in the loop.",
    "Routing needs an authoritative, up-to-date partition map: a coordination service (ZooKeeper, etcd, KRaft), config servers, or gossip, plus redirects for clients with stale maps.",
  ],
  furtherReading: [
    { title: "Bigtable: A Distributed Storage System for Structured Data (Chang et al., OSDI 2006)", note: "Range-partitioned tablets that split automatically, located through a metadata hierarchy." },
    { title: "Dynamo: Amazon's Highly Available Key-value Store (2007)", url: "https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf", note: "Hash partitioning on a ring with virtual nodes, and the partitioning strategies Amazon tried." },
    { title: "Redis Cluster specification", url: "https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/", note: "Fixed hash slots, MOVED and ASK redirects, and how slots migrate between nodes." },
    { title: "Sharding & IDs at Instagram (Instagram Engineering, 2012)", note: "Logical shards on PostgreSQL and IDs that embed the shard number." },
  ],
};
