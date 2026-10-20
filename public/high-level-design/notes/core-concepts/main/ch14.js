// Main tab: Chapter 14, Partitioning and shard keys. Format: DeepSection[] in public/shared/notes.d.ts.
window.MAIN = window.MAIN || {};
MAIN.ch14 = [
  {
    id: "do-you-need-it",
    title: "First question: do you need to shard at all?",
    kicker: "Before you split",
    blocks: [
      {
        type: "text",
        html: `<p>Sharding means splitting one logical database across many machines. It is powerful and it is permanent: once data is spread out, every query, transaction and migration has to know about the split. So the first skill is knowing when <em>not</em> to do it. A single modern database server has tens of cores, hundreds of gigabytes of memory and tens of terabytes of fast SSD. With read replicas for read traffic and a cache in front, one primary goes a very long way.</p><p>Shard when an estimate, not a hunch, says one machine cannot cope. In practice that means one of three things: the data heads toward tens of terabytes, sustained writes approach the low tens of thousands per second that one primary can absorb, or reads outgrow what replicas and caching can soak up.</p>`,
      },
      {
        type: "table",
        title: "Quick check before proposing it",
        headers: ["Pressure", "Try first", "Shard when"],
        rows: [
          ["Read throughput", "Cache, read replicas, better indexes", "Reads still exceed what replicas and cache absorb"],
          ["Storage", "Move blobs to object storage, archive old rows", "Hot, queryable data heads toward tens of TB"],
          ["Write throughput", "Batch writes, a bigger primary", "Sustained writes near one primary's ceiling"],
        ],
      },
      {
        type: "callout",
        tone: "mistake",
        html: `<p>Proposing sharding in the first five minutes, before any numbers, is one of the most common over-engineering signals interviewers note. Do the estimate, then decide.</p>`,
      },
    ],
  },
  {
    id: "partition-vs-shard",
    title: "Partitioning versus sharding",
    kicker: "Two kinds of split",
    blocks: [
      {
        type: "compare",
        items: [
          { title: "Partitioning", tone: "info", html: "Splits a big table into pieces <strong>inside one database server</strong>, for example one partition per month of orders. Queries skip irrelevant partitions and old data can be dropped cheaply. It adds no CPU, memory or disk." },
          { title: "Sharding", tone: "ok", html: "Places pieces of the data on <strong>separate servers</strong>, each a full database holding a subset of rows. Storage and read and write throughput grow with the number of shards. In exchange you must route requests and deal with queries that span shards." },
        ],
      },
      {
        type: "text",
        html: `<p>People use the two words loosely, so be explicit about which you mean: "one machine with the table split by month" is a very different system from "64 machines, each holding a slice of users".</p>`,
      },
    ],
  },
  {
    id: "shard-key",
    title: "Choosing the shard key",
    kicker: "The decision that matters most",
    blocks: [
      {
        type: "text",
        html: `<p>The shard key decides which machine each row lives on, and it is very hard to change later. Get it right and the common request touches one shard. Get it wrong and you either create hot shards or turn everyday queries into fan-outs across the whole cluster. Judge every candidate against three tests.</p>`,
      },
      {
        type: "keypoints",
        items: [
          "<strong>High cardinality.</strong> There must be far more distinct values than shards. A boolean can never feed more than two shards.",
          "<strong>Even distribution.</strong> No single value or time range should own a big share of rows or traffic. Country fails: one country can hold most of the users.",
          "<strong>Aligned with the main query.</strong> The data a typical request needs should share the key, so the request stays on one shard.",
        ],
      },
      {
        type: "table",
        title: "Worked example: a social app's posts table",
        headers: ["Candidate", "Cardinality", "Distribution", "Fits the main query?", "Verdict"],
        rows: [
          ["user_id", "Hundreds of millions", "Even once hashed", "Yes: profile pages and a user's posts are per-user", "Good choice"],
          ["post_id", "Billions", "Even", "Only for single-post lookups; a user's posts scatter", "Weaker for this app"],
          ["created_at", "High", "Every new write hits the newest range", "Time-range queries only", "Write hot spot"],
          ["country", "About 200", "Heavily skewed", "Regional queries only", "Hot shards"],
        ],
      },
    ],
  },
  {
    id: "distribution",
    title: "Mapping keys to shards",
    kicker: "Distribution strategies",
    blocks: [
      {
        type: "text",
        html: `<p>Once you have a key, you need a rule that turns it into a shard. <strong>Hash-based</strong> distribution is the default: hash the key and map the hash to a shard. Hashing scrambles even sequential IDs, so data and load spread evenly. Its cost is that range queries on the key must visit every shard, and a naive <code>hash mod N</code> remaps almost every key when N changes, which is why it is paired with consistent hashing or a fixed set of logical slots.</p><p><strong>Range-based</strong> distribution gives each shard a contiguous slice of key values. Range scans are cheap, but monotonically increasing keys pile every new write onto the last shard. It suits multi-tenant systems where each tenant owns a range. <strong>Directory-based</strong> distribution keeps a lookup table from key to shard. It is the most flexible (you can move one giant customer by editing a row) but every request pays a lookup, and the directory becomes a critical service.</p>`,
      },
      {
        type: "callout",
        tone: "tip",
        title: "Plan for growth on day one",
        html: `<p>Create many more logical shards than machines, for example 256 logical shards on 8 servers. When you add servers you move whole logical shards; no key ever changes its logical shard. Many production systems, including Redis Cluster and Elasticsearch, work this way.</p>`,
      },
      {
        type: "list",
        title: "What to say in an interview",
        items: [
          `"Most requests are scoped to one user, so I'll shard by user_id."`,
          `"Hash-based distribution for even load, with many logical shards so we can add machines without rehashing everything."`,
          `"In practice I'd use a store that shards for us, such as DynamoDB with user_id as the partition key."`,
          `"Global queries like trending won't fit this key; I'll precompute those separately."`,
        ],
      },
    ],
  },
];
