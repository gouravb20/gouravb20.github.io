// Main tab: Chapter 15, Sharding challenges. Format: DeepSection[] in public/shared/notes.d.ts.
window.MAIN = window.MAIN || {};
MAIN.ch15 = [
  {
    id: "three-problems",
    title: "The bill that comes with sharding",
    kicker: "Mental model",
    blocks: [
      {
        type: "text",
        html: `<p>Sharding buys capacity by splitting data across machines that do not share memory, disk or transactions. Everything that used to be easy because the data sat in one place now has a cost. Three problems account for almost every follow-up question an interviewer will ask once you have proposed a shard key: some shards run much hotter than others, some queries need data from every shard, and some operations must change rows on two shards at once. Knowing a standard answer to each is what makes a sharding proposal sound credible.</p>`,
      },
      {
        type: "table",
        headers: ["Problem", "Root cause", "Standard answer"],
        rows: [
          ["Hot shard", "Traffic is concentrated on one key or range", "Cache and replicate hot data; split heavy keys"],
          ["Cross-shard query", "The query does not include the shard key", "Precompute, denormalize, or add a secondary index"],
          ["Cross-shard transaction", "One operation touches rows on two shards", "Co-locate the data, or use a saga"],
        ],
      },
    ],
  },
  {
    id: "hot-spots",
    title: "Hot spots and the celebrity problem",
    kicker: "Problem 1",
    blocks: [
      {
        type: "text",
        html: `<p>A good shard key spreads <em>rows</em> evenly, but traffic is not spread over rows. Shard by user_id and a celebrity with 100 million followers sits on one shard like any other user, while generating thousands of times more reads. Hashing does not help, because the problem is one key, not the distribution of keys. Time-based keys create a similar hot spot for writes: every new row lands on whichever shard owns "now".</p>`,
      },
      {
        type: "keypoints",
        title: "Ways to cool a hot shard",
        items: [
          "<strong>Cache and replicate</strong> the hot entity's data so reads never reach its home shard. This handles most read-heavy celebrity cases.",
          "<strong>Split the key</strong>: shard a heavy entity by a compound key such as user_id plus a bucket number, spreading its writes over several shards. Reads for that entity now fan out over its buckets.",
          "<strong>Isolate</strong>: move a known heavy tenant to a dedicated shard using a small exception directory on top of hash routing.",
          "<strong>Monitor</strong> per-shard request rate, CPU and latency, so new hot spots are found before users feel them.",
        ],
      },
    ],
  },
  {
    id: "cross-shard-queries",
    title: "Queries that span every shard",
    kicker: "Problem 2",
    blocks: [
      {
        type: "text",
        html: `<p>Any query that does not include the shard key has to ask every shard and merge the answers. This is called scatter-gather. The total work grows with the number of shards, and the response cannot return until the slowest shard replies. That last point is the one to remember: rare slowness on individual shards becomes common slowness for fan-out queries.</p>`,
      },
      {
        type: "steps",
        title: "Worked example: why fan-out hurts the tail",
        items: [
          "Suppose each shard answers slowly (beyond its 99th percentile) 1% of the time.",
          "A query that touches one shard is slow 1% of the time.",
          "A query that touches 100 shards is fast only if all 100 are fast: 0.99 to the power 100, about 37%.",
          "So roughly 63% of those fan-out queries are slow, even though every shard looks healthy on its own dashboard.",
        ],
      },
      {
        type: "list",
        title: "Keep the common path on one shard",
        items: [
          "<strong>Precompute global views</strong> such as trending posts or leaderboards in a background job, and serve them from a cache.",
          "<strong>Denormalize</strong> data onto the shard that reads it, so writes do a little more and reads stay local.",
          "<strong>Add a secondary index</strong> sharded by the other key (orders by merchant as well as by customer), usually updated asynchronously.",
          "<strong>Accept the fan-out</strong> for rare admin or reporting queries, with timeouts. If a <em>common</em> query needs every shard, revisit the shard key.",
        ],
      },
    ],
  },
  {
    id: "cross-shard-transactions",
    title: "Transactions that span shards",
    kicker: "Problem 3",
    blocks: [
      {
        type: "text",
        html: `<p>Each shard is an independent database, so a transfer from a user on shard 1 to a user on shard 2 cannot be one local transaction. There are three answers, and you should reach for them in this order.</p>`,
      },
      {
        type: "compare",
        items: [
          { title: "1. Avoid it by design", tone: "ok", html: "Pick shard boundaries so data that changes together lives together: a user's balance, ledger and profile on one shard. Most operations then stay local." },
          { title: "2. Use a saga", tone: "info", html: "Run a sequence of local transactions, each with a compensating action. Debit the sender; credit the receiver; if the credit fails permanently, refund the sender. Every step is idempotent and keyed by a transfer ID, and saga state is stored durably so it resumes after a crash." },
          { title: "3. Two-phase commit", tone: "warn", html: "A coordinator asks all shards to prepare, then to commit. It is atomic, but it holds locks across network round trips and blocks if the coordinator dies. Most systems avoid it outside specialized databases." },
        ],
      },
      {
        type: "callout",
        tone: "interview",
        title: "Say the trade-off out loud",
        html: `<p>A saga is eventually consistent: for a moment the money has left one account and not yet arrived in the other. Say that you will model the in-between state explicitly (a transfer marked pending) and that each account's own balance is always correct. That shows you understand what you gave up by not using one database transaction.</p>`,
      },
      {
        type: "list",
        title: "Mistakes that weaken an answer",
        items: [
          "Claiming hashing solves the celebrity problem. It spreads keys, not the traffic on a single key.",
          "Leaving a common product query as an unbounded scatter-gather across every shard.",
          "Reaching for two-phase commit first, or forgetting that saga steps must be idempotent because they will be retried.",
        ],
      },
    ],
  },
];
