// Deep dive: Chapter 14, Partitioning, sharding and choosing a shard key. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch14 = {
  hook: `<p>This chapter answers when to shard and the two decisions that shape the system for years: which column decides where a row lives, and how that value maps to a machine. Get them right and adding capacity is routine; get them wrong and one machine burns while the rest idle.</p>`,
  sections: [
    {
      id: "do-you-need-to-shard",
      title: "Do you actually need to shard?",
      kicker: "Before you split",
      blocks: [
        {
          type: "text",
          html: `<p>Sharding is permanent complexity: routing, cross-shard queries and transactions, and data moves. Single machines go far (around 200 vCPUs, over a terabyte of RAM, tens of terabytes of NVMe), and one well-indexed primary handles thousands to tens of thousands of writes per second.</p>`,
        },
        {
          type: "keypoints",
          items: [
            "<strong>Order of moves:</strong> fix queries and indexes, add a cache, add read replicas, scale up. Shard only when an estimate shows none of those suffice.",
            "<strong>Triggers:</strong> write throughput beyond one primary (replicas don't add write capacity); data heading past a few tens of terabytes; reads or a working set no cache and replicas can absorb.",
          ],
        },
        {
          type: "table",
          title: "Quick check: one machine or many?",
          headers: ["Workload", "Estimate", "Verdict"],
          rows: [
            ["500M users at 5 KB each", "2.5 TB", "One primary with replicas"],
            ["2K writes/s, 50K reads/s, 90% cache hits", "5K reads/s reach the DB", "One primary with replicas"],
            ["40K message writes/s, 1 KB each", "~3.5 TB of new data per day", "Shard: write rate and growth both exceed one primary"],
            ["Click events at 500K/s", "Write-heavy, append-only", "A natively partitioned store (Cassandra, Kafka plus a warehouse)"],
          ],
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>"We'll shard the users table from day one." Interviewers look for the number that justifies sharding, not the reflex.</p>`,
        },
      ],
    },
    {
      id: "partitioning-vs-sharding",
      title: "Partitioning versus sharding",
      kicker: "Two kinds of split",
      blocks: [
        {
          type: "compare",
          items: [
            { title: "Partitioning", tone: "info", html: "Splits a table <em>inside one database</em>: by rows (one partition per month) or columns (hot columns apart from blobs). Queries prune partitions and old data drops cheaply (PostgreSQL range, list and hash partitioning). Same CPU, disk and connection limits." },
            { title: "Sharding", tone: "ok", html: "Horizontal partitioning <em>across machines</em>. Each shard is an independent server with a subset of rows, so storage and read and write throughput grow with shard count. Citus (PostgreSQL) and Vitess (MySQL, from YouTube) add it to existing databases." },
          ],
        },
        {
          type: "diagram",
          title: "Partitioning stays on one machine; sharding spreads across many",
          caption: "Left: one database holds three time-based partitions of the orders table. Right: a router sends each request to one of three independent database servers based on the shard key.",
          svg: `<svg viewBox="0 0 640 260" role="img" aria-label="Partitioning within one database compared with sharding across three servers">
<text x="155" y="24" text-anchor="middle" font-size="13" font-weight="700">Partitioning: one machine</text>
<rect x="20" y="40" width="270" height="170" rx="10" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="155" y="62" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">one PostgreSQL primary</text>
<rect x="40" y="75" width="230" height="35" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<text x="155" y="97" text-anchor="middle" font-size="12">orders_2024</text>
<rect x="40" y="120" width="230" height="35" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<text x="155" y="142" text-anchor="middle" font-size="12">orders_2025</text>
<rect x="40" y="165" width="230" height="35" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="155" y="187" text-anchor="middle" font-size="12" font-weight="700">orders_2026 (hot)</text>
<text x="480" y="24" text-anchor="middle" font-size="13" font-weight="700">Sharding: many machines</text>
<rect x="395" y="40" width="170" height="34" rx="6" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="2"/>
<text x="480" y="62" text-anchor="middle" font-size="12" font-weight="700">Router (by shard key)</text>
<line x1="450" y1="74" x2="370" y2="128" stroke-width="1.5" style="stroke: var(--dg-muted)"/>
<line x1="480" y1="74" x2="480" y2="128" stroke-width="1.5" style="stroke: var(--dg-muted)"/>
<line x1="510" y1="74" x2="590" y2="128" stroke-width="1.5" style="stroke: var(--dg-muted)"/>
<rect x="330" y="130" width="80" height="70" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="370" y="160" text-anchor="middle" font-size="12" font-weight="700">Shard 1</text>
<text x="370" y="178" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">own disk</text>
<rect x="440" y="130" width="80" height="70" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="480" y="160" text-anchor="middle" font-size="12" font-weight="700">Shard 2</text>
<text x="480" y="178" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">own disk</text>
<rect x="550" y="130" width="80" height="70" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="590" y="160" text-anchor="middle" font-size="12" font-weight="700">Shard 3</text>
<text x="590" y="178" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">own disk</text>
<text x="155" y="232" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">Faster scans, easier maintenance</text>
<text x="155" y="250" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">Same CPU, disk and connections</text>
<text x="480" y="232" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">More storage and write capacity</text>
<text x="480" y="250" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">Plus routing and cross-shard work</text>
</svg>`,
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>They combine well: shard by <code>user_id</code> across machines and, inside each shard, partition append-heavy tables by month so old data archives cheaply.</p>`,
        },
      ],
    },
    {
      id: "shard-key",
      title: "Choosing the shard key",
      kicker: "The decision that matters most",
      blocks: [
        {
          type: "idea",
          html: `<p>A good shard key has <strong>high cardinality</strong>, <strong>even distribution</strong> and <strong>query alignment</strong>: the most common requests include it, so they touch one shard. Start from the dominant access pattern: "this user's something" means <code>user_id</code>.</p>`,
        },
        {
          type: "list",
          title: "How shard keys go wrong",
          items: [
            "<strong>Low cardinality:</strong> <code>is_premium</code> can never spread past two shards, one with 90% of users.",
            "<strong>Skew:</strong> <code>country</code> puts most users on a few huge, hot shards.",
            "<strong>Monotonic values</strong> under range sharding: <code>created_at</code> sends every new (and hottest) row to the newest shard.",
            "<strong>Misaligned with queries:</strong> messages by <code>message_id</code> spread writes perfectly but \"show this conversation\" asks every shard.",
          ],
        },
        {
          type: "lab",
          id: "shardKey",
          caption: "Pick a shard key (user_id, country, is_premium or signup time) and a strategy, then compare how evenly data, new signups and reads land on the shards. Turn on the celebrity to see one key overload a shard no matter how even the rest is.",
        },
        {
          type: "table",
          title: "Evaluating candidate keys for a users table",
          headers: ["Candidate", "Cardinality", "Distribution", "Query fit", "Verdict"],
          rows: [
            ["user_id (hashed)", "Very high", "Even", "User-scoped queries hit one shard", "Good"],
            ["country", "Low (~200)", "Heavily skewed", "Only regional queries", "Bad: hot shards"],
            ["is_premium", "2", "90/10", "None", "Bad: two shards at most"],
            ["created_at (range)", "High", "All new writes at the end", "Time-range queries", "Bad for writes"],
          ],
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p>Changing a shard key later means rewriting where every row lives (dual writes, backfills, cutover). Even with online resharding (MongoDB's <code>reshardCollection</code>, 5.0), it's heavy. Choose well up front.</p>`,
        },
        {
          type: "quiz",
          q: "A multi-tenant SaaS product has 5,000 customer companies. Almost every query is scoped to one company, but three customers are 100 times larger than the median. Which shard key is the best starting point?",
          options: [
            "created_at, so data spreads by time",
            "tenant_id, with a plan to move the few very large tenants to dedicated shards",
            "A random UUID per row",
            "The customer's country",
          ],
          answer: 1,
          explain: "tenant_id aligns with almost every query, so each request touches one shard, and 5,000 values spread well. The skew from a few giant tenants is real, which is why many SaaS designs keep a small directory of exceptions that pins large tenants to their own shards. Random row ids would spread data but scatter every tenant's queries across all shards.",
        },
      ],
    },
    {
      id: "distribution-strategies",
      title: "Mapping keys to shards, and logical shards",
      kicker: "Distribution strategies",
      blocks: [
        {
          type: "diagram",
          title: "Three ways to route key 1,234,567",
          caption: "Range sharding looks up which interval the key falls in. Hash sharding scrambles the key first. Directory sharding looks the key up in a table that can say anything.",
          svg: `<svg viewBox="0 0 640 270" role="img" aria-label="Routing a key to a shard with range, hash and directory strategies">
<defs><marker id="cc14-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<text x="110" y="22" text-anchor="middle" font-size="13" font-weight="700">Range</text>
<text x="320" y="22" text-anchor="middle" font-size="13" font-weight="700">Hash</text>
<text x="530" y="22" text-anchor="middle" font-size="13" font-weight="700">Directory</text>
<rect x="45" y="34" width="130" height="26" rx="13" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="1.5"/>
<text x="110" y="52" text-anchor="middle" font-size="12">key 1,234,567</text>
<rect x="255" y="34" width="130" height="26" rx="13" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="1.5"/>
<text x="320" y="52" text-anchor="middle" font-size="12">key 1,234,567</text>
<rect x="465" y="34" width="130" height="26" rx="13" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="1.5"/>
<text x="530" y="52" text-anchor="middle" font-size="12">key 1,234,567</text>
<line x1="110" y1="60" x2="110" y2="84" stroke-width="1.5" marker-end="url(#cc14-arr)" style="stroke: var(--dg-muted)"/>
<line x1="320" y1="60" x2="320" y2="84" stroke-width="1.5" marker-end="url(#cc14-arr)" style="stroke: var(--dg-muted)"/>
<line x1="530" y1="60" x2="530" y2="84" stroke-width="1.5" marker-end="url(#cc14-arr)" style="stroke: var(--dg-muted)"/>
<rect x="15" y="86" width="190" height="50" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="110" y="107" text-anchor="middle" font-size="12">S0: 1-1M   S1: 1M-2M</text>
<text x="110" y="125" text-anchor="middle" font-size="12">S2: 2M-3M</text>
<rect x="225" y="86" width="190" height="50" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="320" y="107" text-anchor="middle" font-size="12">hash(key) mod 3</text>
<text x="320" y="125" text-anchor="middle" font-size="12">= 2</text>
<rect x="435" y="86" width="190" height="50" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="530" y="107" text-anchor="middle" font-size="12">lookup table</text>
<text x="530" y="125" text-anchor="middle" font-size="12">1,234,567 is on S0</text>
<line x1="110" y1="136" x2="110" y2="160" stroke-width="1.5" marker-end="url(#cc14-arr)" style="stroke: var(--dg-muted)"/>
<line x1="320" y1="136" x2="384" y2="160" stroke-width="1.5" marker-end="url(#cc14-arr)" style="stroke: var(--dg-muted)"/>
<line x1="530" y1="136" x2="466" y2="160" stroke-width="1.5" marker-end="url(#cc14-arr)" style="stroke: var(--dg-muted)"/>
<rect x="18" y="162" width="56" height="32" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="46" y="183" text-anchor="middle" font-size="12">S0</text>
<rect x="82" y="162" width="56" height="32" rx="5" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="110" y="183" text-anchor="middle" font-size="12" font-weight="700">S1</text>
<rect x="146" y="162" width="56" height="32" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="174" y="183" text-anchor="middle" font-size="12">S2</text>
<rect x="228" y="162" width="56" height="32" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="256" y="183" text-anchor="middle" font-size="12">S0</text>
<rect x="292" y="162" width="56" height="32" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="320" y="183" text-anchor="middle" font-size="12">S1</text>
<rect x="356" y="162" width="56" height="32" rx="5" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="384" y="183" text-anchor="middle" font-size="12" font-weight="700">S2</text>
<rect x="438" y="162" width="56" height="32" rx="5" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="466" y="183" text-anchor="middle" font-size="12" font-weight="700">S0</text>
<rect x="502" y="162" width="56" height="32" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="530" y="183" text-anchor="middle" font-size="12">S1</text>
<rect x="566" y="162" width="56" height="32" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="594" y="183" text-anchor="middle" font-size="12">S2</text>
<text x="110" y="226" text-anchor="middle" font-size="12" style="fill: var(--dg-ok)">+ cheap range scans</text>
<text x="110" y="246" text-anchor="middle" font-size="12" style="fill: var(--dg-bad)">- newest range runs hot</text>
<text x="320" y="226" text-anchor="middle" font-size="12" style="fill: var(--dg-ok)">+ even spread</text>
<text x="320" y="246" text-anchor="middle" font-size="12" style="fill: var(--dg-bad)">- ranges hit every shard</text>
<text x="530" y="226" text-anchor="middle" font-size="12" style="fill: var(--dg-ok)">+ place any key anywhere</text>
<text x="530" y="246" text-anchor="middle" font-size="12" style="fill: var(--dg-bad)">- extra lookup, critical service</text>
</svg>`,
        },
        {
          type: "compare",
          items: [
            { title: "Hash (the default)", tone: "ok", html: "Scatters even sequential keys evenly; best for point lookups. Ranges on the key hit every shard, and plain <code>hash mod N</code> moves almost every key when N changes." },
            { title: "Range", tone: "info", html: "Contiguous key intervals: cheap range scans, tiny routing table. Sequential keys make the newest range hot (HBase and Bigtable docs warn against timestamp-first row keys)." },
            { title: "Directory", tone: "warn", html: "An explicit lookup table: move one giant tenant by changing a row. Every request pays a lookup, and the directory must be fast, cached and highly available. Often a small exception table over hash." },
          ],
        },
        {
          type: "text",
          html: `<p><strong>Logical shards</strong> fix resizing. Hash keys into a fixed, large number of logical shards (say 1,024), chosen once, and map them to fewer physical machines with a small table. To grow, move whole logical shards and update the map; no key is rehashed. The logical count caps the machine count, so pick it well above any realistic need.</p>`,
        },
        {
          type: "keypoints",
          items: [
            "Instagram mapped thousands of logical shards onto few PostgreSQL servers, with 64-bit IDs embedding the shard (41 bits time, 13 bits shard, 10 bits sequence). Notion split into 480 logical shards on 32 databases, keyed by workspace.",
            "Redis Cluster uses 16,384 slots and Couchbase 1,024 vBuckets; rebalancing moves whole slots.",
            "Often the database does it: DynamoDB hashes the partition key and splits automatically (per-partition limits of 3,000 read and 1,000 write units per second explain hot-key throttling); Cassandra uses a token ring; Spanner and CockroachDB split ranges.",
          ],
        },
      ],
    },
    {
      id: "interview",
      title: "Proposing sharding in an interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "callout",
          tone: "interview",
          html: `<p>Make sharding the answer to a number. A strong answer, in order:</p>
<ol>
<li><strong>Justify it:</strong> the write rate or data size one primary can't handle.</li>
<li><strong>Key:</strong> "Most queries are scoped to one user, so <code>user_id</code>: high cardinality, even, aligned with the main access pattern."</li>
<li><strong>Strategy:</strong> "Hash into 1,024 logical shards mapped onto fewer servers, so growth moves whole shards."</li>
<li><strong>Costs:</strong> "Global queries like trending become scatter-gather, so precompute them; cross-user operations need a saga."</li>
</ol>
<p>If a managed database fits, say so: "DynamoDB with <code>user_id</code> as the partition key."</p>`,
        },
        {
          type: "keypoints",
          title: "Red flags interviewers listen for",
          items: [
            "Sharding before showing one machine is not enough.",
            "Low-cardinality keys (status, country, booleans).",
            "Time-based range sharding for a write-heavy table.",
            "Plain <code>hash mod N</code> with no plan for adding shards.",
          ],
        },
        {
          type: "quiz",
          q: "You are designing a chat app and propose sharding messages by message_id (hashed). The interviewer frowns. What is the most likely problem?",
          options: [
            "message_id has too few distinct values",
            "Loading a conversation needs messages from every shard, because the key does not match the main query; conversation_id would keep a chat together",
            "Hash sharding cannot handle chat workloads",
            "message_id causes a write hot spot on the newest shard",
          ],
          answer: 1,
          explain: "Hashed message ids spread data perfectly but scatter each conversation across all shards, so the most common read becomes a fan-out. Sharding by conversation_id keeps a conversation's messages together and serves \"load this chat\" from one shard. Distribution is necessary but not sufficient; query alignment matters as much.",
        },
      ],
    },
  ],
  takeaways: [
    "Shard only when an estimate shows one primary (with replicas, caches and a bigger machine) can't handle the writes, data size or reads.",
    "Partitioning splits a table within one database; sharding spreads rows across machines for capacity, at the cost of routing and cross-shard work.",
    "A good shard key has high cardinality, even distribution and matches the dominant query; booleans, skewed categories and monotonic range keys are bad.",
    "Hash distribution is the default; range suits range scans on naturally spread keys; directories add flexibility for exceptions.",
    "Hash into many fixed logical shards mapped to fewer machines, so growth moves whole shards instead of rehashing keys.",
  ],
  furtherReading: [
    { title: "Sharding & IDs at Instagram (Instagram Engineering, 2012)", note: "Logical shards on PostgreSQL and ids that embed the shard." },
    { title: "PostgreSQL documentation: Table Partitioning", url: "https://www.postgresql.org/docs/current/ddl-partitioning.html", note: "Range, list and hash partitioning and partition pruning." },
    { title: "MongoDB documentation: Sharding", url: "https://www.mongodb.com/docs/manual/sharding/", note: "Shard keys, chunks, the balancer and hashed versus ranged sharding." },
  ],
};
