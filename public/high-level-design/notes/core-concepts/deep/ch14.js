// Deep dive: Chapter 14, Partitioning, sharding and choosing a shard key. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch14 = {
  hook: `<p>A messaging startup runs everything on one PostgreSQL primary with two read replicas. Reads are fine: the replicas and a Redis cache absorb them. But every message is a write, and at 40,000 messages per second the primary's disk and WAL can no longer keep up. Replicas do not help, because every replica must apply every write too. There is no bigger machine left to buy.</p>
<p>The only way forward is to split the data so that different machines accept different writes. That raises two questions that will shape the system for years: <strong>which column decides where a row lives</strong>, and <strong>how that column maps to a machine</strong>. Get them right and adding capacity is routine. Get them wrong and you end up with one machine on fire while the rest idle, or with every query asking every machine.</p>`,
  sections: [
    {
      id: "do-you-need-to-shard",
      title: "Do you actually need to shard?",
      kicker: "Before you split",
      blocks: [
        {
          type: "problem",
          html: `<p>Sharding is permanent complexity. Every query needs routing, some queries must ask every shard, transactions across shards need special handling, and moving data between shards is an operational project. Teams that shard too early pay all of those costs for capacity they did not need.</p>`,
        },
        {
          type: "text",
          html: `<p>Modern hardware pushes the point where you <em>must</em> shard very far out. Cloud catalogues routinely offer database instances with around 200 vCPUs and well over a terabyte of RAM, and fast NVMe storage measured in tens of terabytes. A single well-indexed PostgreSQL or MySQL primary handles thousands to tens of thousands of writes per second, and read replicas plus a cache multiply read capacity.</p>
<p>So the order of moves is: fix queries and indexes, add a cache, add read replicas, scale the machine up. Shard only when an estimate shows a limit none of those can move. The usual triggers are:</p>
<ul>
<li><strong>Write throughput</strong> beyond what one primary sustains (replicas do not add write capacity).</li>
<li><strong>Data size</strong> heading past a few tens of terabytes, where backups, restores, index builds and replica rebuilds become painfully slow.</li>
<li><strong>Read load</strong> that replicas and caches cannot absorb, or a working set far larger than one machine's memory.</li>
</ul>`,
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
          html: `<p>"We'll shard the users table from day one." For most products a single primary carries them a long way. Interviewers look for the estimate that justifies sharding, not the reflex. If you do shard, say which number forced it.</p>`,
        },
      ],
    },
    {
      id: "partitioning-vs-sharding",
      title: "Partitioning versus sharding",
      kicker: "Two kinds of split",
      blocks: [
        {
          type: "text",
          html: `<p>The words are often used loosely, so be precise about whether the pieces live on one machine or many.</p>
<p><strong>Partitioning</strong> splits a large table into smaller pieces <em>inside one database</em>. Horizontal partitioning splits rows (one partition per month of orders); vertical partitioning splits columns (keep small, hot columns apart from large, rarely read blobs). Queries that filter on the partition column only scan the relevant pieces, and maintenance gets easier: dropping last year's data becomes dropping a partition rather than deleting billions of rows. But the machine's CPU, memory, disk and connection limits are unchanged.</p>
<p><strong>Sharding</strong> is horizontal partitioning <em>across machines</em>. Each shard is a complete, independent database server holding a subset of rows. Together they hold the whole dataset, and because each has its own hardware, storage and both read and write throughput grow with the number of shards.</p>`,
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
          type: "realworld",
          items: [
            { org: "PostgreSQL", title: "Declarative partitioning", html: "Since version 10, PostgreSQL supports <code>PARTITION BY RANGE</code> and <code>LIST</code>, with <code>HASH</code> added in 11. The planner prunes partitions that cannot match a query, and old partitions can be detached or dropped in one cheap operation." },
            { org: "Citus and Vitess", title: "Sharding layers for existing databases", html: "Citus turns PostgreSQL into a sharded cluster with a coordinator that routes and parallelises queries. Vitess, which started at YouTube, does the same for MySQL, routing queries to shards through a proxy layer." },
          ],
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>The two combine well. A common pattern is to shard by <code>user_id</code> across machines and, inside each shard, partition large append-heavy tables by month so old data can be archived cheaply.</p>`,
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
          html: `<p>The <strong>shard key</strong> is the column whose value decides which shard holds a row. A good one has three properties: <strong>high cardinality</strong> (many distinct values), <strong>even distribution</strong> (no value or range carries a disproportionate share of data or traffic) and <strong>query alignment</strong> (the most common requests include it, so they touch exactly one shard).</p>`,
        },
        {
          type: "text",
          html: `<p>Start from the dominant access pattern, not from the data model. In a social app, nearly every request is "this user's something": their profile, their posts, their inbox. Sharding by <code>user_id</code> keeps each user's rows together, there are millions of users so the data spreads over many shards, and hashing the id spreads them evenly. For an order system where lookups are by order, <code>order_id</code> plays the same role.</p>
<h3>How shard keys go wrong</h3>
<ul>
<li><strong>Low cardinality.</strong> <code>is_premium</code> has two values, so the data can never spread over more than two shards, and one of them holds 90% of users.</li>
<li><strong>Skew.</strong> <code>country</code> has a couple of hundred values, but a few countries hold most users, so their shards are huge and hot while dozens of others are nearly empty.</li>
<li><strong>Monotonic values.</strong> <code>created_at</code> (or an auto-increment id) with range sharding sends every new row to the newest shard. That one shard takes all the writes and most of the reads, because recent data is the hottest.</li>
<li><strong>Misaligned with queries.</strong> Sharding messages by <code>message_id</code> spreads writes perfectly, but "show this conversation" now has to ask every shard.</li>
</ul>`,
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
          html: `<p>Changing a shard key later means rewriting where every row lives, usually with dual writes, backfills and a cutover while the system stays live. Some databases now support online resharding (MongoDB added <code>reshardCollection</code> in 5.0), but it is still a heavy operation. Spend the time to choose well up front.</p>`,
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
      title: "Range, hash and directory: mapping keys to shards",
      kicker: "Distribution strategies",
      blocks: [
        {
          type: "text",
          html: `<p>Once you have a key, you need a rule that turns a key value into a shard. There are three families, and most real systems are one of them or a blend.</p>`,
        },
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
          type: "text",
          html: `<p><strong>Range-based</strong> sharding gives each shard a contiguous interval of keys. Range scans on the key are efficient because neighbours sit together, and the routing table is tiny. But real traffic is rarely uniform across ranges: with time-ordered or sequential keys, the newest range takes all the inserts. Range works best when the key is naturally spread, such as tenants that each own a range, or when range scans by key are the main query.</p>
<p><strong>Hash-based</strong> sharding runs the key through a hash function first, which scatters even sequential keys uniformly. It is the default in interviews and in most key-value stores. The cost is that range queries on the key now touch every shard, and that the naive rule <code>hash(key) mod N</code> moves almost every key when N changes, so real systems use consistent hashing or a fixed set of logical partitions (next section).</p>
<p><strong>Directory-based</strong> sharding keeps an explicit lookup table from key (or key range, or tenant) to shard. It is the most flexible: you can move one heavy tenant to its own machine by changing one row. But every request pays for a lookup, and the directory becomes a critical dependency that must be fast, cached and highly available.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "MongoDB", title: "Ranged or hashed shard keys", html: "MongoDB lets you choose a ranged or hashed shard key per collection, splits data into chunks, and runs a balancer that migrates chunks between shards to even out their sizes." },
            { org: "HBase and Bigtable", title: "Range-partitioned by row key", html: "Tables are split into contiguous row-key ranges (regions or tablets). Both projects' documentation warns that row keys starting with a timestamp concentrate writes on one server, and recommends salting, hashing or reordering key fields." },
            { org: "Vitess", title: "Vindexes", html: "Vitess maps each row to a keyspace id through a configurable \"vindex\", which can be a hash of a column or a lookup table, so the same system can do hash-based or directory-style routing." },
          ],
        },
        {
          type: "compare",
          items: [
            { title: "Use hash when", tone: "ok", html: "You want even data and load regardless of key patterns, and the main queries are point lookups by key. This is the default." },
            { title: "Use range when", tone: "info", html: "Range scans by the key are the main query and load is naturally spread across ranges, for example tenants owning ranges." },
            { title: "Use a directory when", tone: "warn", html: "A few keys need special placement (giant tenants, data residency rules). Often layered on top of hash sharding as a small exception table." },
          ],
        },
      ],
    },
    {
      id: "logical-shards",
      title: "Many logical shards on few machines",
      kicker: "Planning for growth",
      blocks: [
        {
          type: "problem",
          html: `<p>Start with four shards using <code>hash(user_id) mod 4</code>. A year later you need eight. Changing the rule to <code>mod 8</code> sends about half of all rows to a different shard, and the system must copy all of them while staying online. The bigger the dataset, the worse every resize gets.</p>`,
        },
        {
          type: "text",
          html: `<p>The standard fix is a level of indirection. Hash keys into a <strong>fixed, large number of logical shards</strong> (say 1,024), chosen once and never changed. Then assign logical shards to physical machines with a small mapping table. Early on, eight machines might hold 128 logical shards each. To add capacity, move some whole logical shards to new machines and update the mapping. A key's logical shard never changes, so nothing is rehashed; data moves only in whole, well-defined units.</p>
<p>Two practical bonuses follow. Each logical shard can be its own database or schema on the server, so moving one is a familiar operation (replicate it, cut over). And you can place logical shards deliberately to balance load, moving a hot one next to cold ones.</p>
<p>The logical shard count caps how far you can spread: 1,024 logical shards can never use more than 1,024 machines. Pick a number comfortably above any realistic machine count.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Instagram", title: "Logical shards in PostgreSQL (2012)", html: "Instagram's engineering blog described mapping thousands of logical shards onto far fewer physical PostgreSQL servers, and generating 64-bit ids that embed the logical shard: 41 bits of milliseconds, 13 bits of shard id and 10 bits of a per-shard sequence. Any id tells you where its row lives." },
            { org: "Notion", title: "Sharding Postgres (2021)", html: "Notion's engineering blog described splitting its monolithic PostgreSQL database into 480 logical shards spread over 32 physical databases, keyed by workspace, so that a workspace's data stays together." },
            { org: "Redis Cluster and Couchbase", title: "Fixed slots", html: "Redis Cluster hashes every key into one of 16,384 slots and Couchbase into 1,024 vBuckets; nodes own sets of slots, and rebalancing moves whole slots." },
          ],
        },
        {
          type: "text",
          html: `<h3>Usually, the database does it for you</h3>
<p>Many databases have sharding built in, and in an interview naming the right one with the right key is often enough. <strong>DynamoDB</strong> hashes the partition key and splits partitions automatically as data and traffic grow; each partition has documented throughput limits (3,000 read units and 1,000 write units per second), which is why a hot partition key throttles. <strong>Cassandra</strong> places partitions on a token ring with virtual nodes; the partition key decides placement and clustering columns sort rows within it. <strong>MongoDB</strong>, <strong>Vitess</strong> and <strong>Citus</strong> shard document and SQL databases, and <strong>Spanner</strong> and <strong>CockroachDB</strong> split ranges automatically.</p>`,
        },
        {
          type: "quiz",
          q: "You hash user ids into 1,024 logical shards hosted on 16 servers. Traffic doubles and you add 16 more servers. Roughly what moves?",
          options: [
            "Almost every row, because the hash changes",
            "About half of the logical shards (512) move whole to the new servers; no key changes logical shard",
            "Nothing; new servers only take new users",
            "Exactly one logical shard per new server",
          ],
          answer: 1,
          explain: "To balance 1,024 logical shards over 32 servers, each server should hold 32, so 512 of them move to the new machines. Each key still hashes to the same logical shard; only the shard-to-server mapping changes, and data moves in whole shards.",
        },
      ],
    },
    {
      id: "interview",
      title: "Proposing sharding in an interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "text",
          html: `<p>Sharding should appear in your design as the answer to a number, not as a default box on the diagram. Do the estimate first ("40K writes per second and 3 TB of new data a day"), show that one primary with replicas and a cache cannot handle it, and then make the two decisions out loud: the key and the strategy. Finish with what the choice makes hard, because the interviewer will ask anyway.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>A strong sharding answer, in order:</p>
<ol>
<li><strong>Justify it:</strong> the write rate or data size that one primary cannot handle.</li>
<li><strong>Key:</strong> "Most queries are scoped to one user, so I'll shard by <code>user_id</code>: high cardinality, even, and aligned with the main access pattern."</li>
<li><strong>Strategy:</strong> "Hash-based, into 1,024 logical shards mapped onto a smaller number of servers, so growth moves whole shards."</li>
<li><strong>Costs:</strong> "Global queries like trending become scatter-gather, so I'll precompute them; cross-user operations need a saga (next chapter)."</li>
</ol>
<p>If a managed database fits, say so: "DynamoDB with <code>user_id</code> as the partition key handles this for us."</p>`,
        },
        {
          type: "keypoints",
          title: "Red flags interviewers listen for",
          items: [
            "Sharding before showing that one machine is not enough.",
            "Shard keys with low cardinality (status, country, booleans).",
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
    "Shard only when an estimate shows one primary (with replicas, caches and a bigger machine) cannot handle the writes, data size or reads.",
    "Partitioning splits a table within one database for faster scans and easier maintenance; sharding spreads rows across machines for more capacity, at the cost of routing and cross-shard work.",
    "A good shard key has high cardinality, even distribution and matches the dominant query, so common requests touch one shard.",
    "Booleans, skewed categories and monotonically increasing values (under range sharding) make bad shard keys.",
    "Hash-based distribution is the default; range suits range-scan-heavy, naturally spread keys; directories add flexibility at the cost of a lookup.",
    "Hash into many fixed logical shards and map them to fewer machines, so growth moves whole shards instead of rehashing every key.",
  ],
  furtherReading: [
    { title: "Sharding & IDs at Instagram (Instagram Engineering, 2012)", note: "Logical shards on PostgreSQL and ids that embed the shard." },
    { title: "PostgreSQL documentation: Table Partitioning", url: "https://www.postgresql.org/docs/current/ddl-partitioning.html", note: "Range, list and hash partitioning and partition pruning." },
    { title: "MongoDB documentation: Sharding", url: "https://www.mongodb.com/docs/manual/sharding/", note: "Shard keys, chunks, the balancer and hashed versus ranged sharding." },
  ],
};
