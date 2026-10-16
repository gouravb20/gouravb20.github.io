// Deep dive: Chapter 15, Sharding challenges. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch15 = {
  hook: `<p>This chapter covers the three problems sharding creates (hot spots, cross-shard queries and cross-shard transactions) and the standard response to each. Knowing them separates "I'd shard it" from a design that survives real traffic.</p>`,
  sections: [
    {
      id: "hot-spots",
      title: "Hot spots and the celebrity problem",
      kicker: "Challenge 1",
      blocks: [
        {
          type: "text",
          html: `<p>Even data doesn't mean even traffic. <strong>Hot ranges</strong> come from range sharding on keys that move together (time), and hashing fixes them. <strong>Hot keys</strong> (a celebrity, a giant tenant, a flash-sale merchant) are harder: one key always maps to one shard, so more shards just add idle machines.</p>`,
        },
        {
          type: "list",
          title: "Responses to hot keys",
          items: [
            "<strong>Cache and replicate reads:</strong> most celebrity traffic is reads; cache them (in-process for the very hottest) and use the shard's read replicas.",
            "<strong>Split the key:</strong> <code>(user_id, bucket)</code> with bucket 0-15, or <code>(user_id, month)</code>, spreads one entity's writes; reading it now queries every bucket.",
            "<strong>Isolate:</strong> a small exception directory pins known heavy keys to dedicated shards.",
            "<strong>Split shards dynamically:</strong> MongoDB's balancer splits and migrates chunks; DynamoDB's adaptive capacity can isolate hot items, though a single item keeps per-partition limits.",
            "<strong>Feeds:</strong> fan out ordinary users' posts at write time but merge very high-follower accounts in at read time.",
          ],
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>Monitor per-shard request rate, CPU and latency, not cluster averages: a 64-shard average of 30% CPU can hide one shard at 100%.</p>`,
        },
      ],
    },
    {
      id: "scatter-gather",
      title: "Scatter-gather and tail latency",
      kicker: "Challenge 2",
      blocks: [
        {
          type: "text",
          html: `<p>A query without the shard key ("top 10 posts globally") must ask <strong>every</strong> shard and merge. Work grows with shard count, and latency is the <strong>maximum</strong> of all shards, not the average. If each shard is slow 1% of the time, a 100-shard query is slow with probability <code>1 &minus; 0.99<sup>100</sup> &asymp; 63%</code>.</p>`,
        },
        {
          type: "diagram",
          title: "A fan-out query waits for its slowest shard",
          caption: "Four shards answer in about 5 ms, but one is in a garbage-collection pause. The aggregated response cannot return until it answers.",
          svg: `<svg viewBox="0 0 620 270" role="img" aria-label="An aggregator querying five shards, one of which is slow">
<rect x="20" y="105" width="140" height="50" rx="8" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="2"/>
<text x="90" y="135" text-anchor="middle" font-size="13" font-weight="700">Aggregator</text>
<text x="90" y="178" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">no shard key in query:</text>
<text x="90" y="196" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">ask all, merge results</text>
<line x1="160" y1="130" x2="330" y2="37" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<line x1="160" y1="130" x2="330" y2="82" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<line x1="160" y1="130" x2="330" y2="127" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<line x1="160" y1="130" x2="330" y2="172" stroke-width="3" style="stroke: var(--dg-bad)"/>
<line x1="160" y1="130" x2="330" y2="217" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<rect x="330" y="20" width="110" height="34" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="1.5"/>
<text x="385" y="42" text-anchor="middle" font-size="12">Shard 1</text>
<rect x="330" y="65" width="110" height="34" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="1.5"/>
<text x="385" y="87" text-anchor="middle" font-size="12">Shard 2</text>
<rect x="330" y="110" width="110" height="34" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="1.5"/>
<text x="385" y="132" text-anchor="middle" font-size="12">Shard 3</text>
<rect x="330" y="155" width="110" height="34" rx="6" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)" stroke-width="2"/>
<text x="385" y="177" text-anchor="middle" font-size="12" font-weight="700">Shard 4</text>
<rect x="330" y="200" width="110" height="34" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="1.5"/>
<text x="385" y="222" text-anchor="middle" font-size="12">Shard 5</text>
<text x="455" y="42" font-size="12">5 ms</text>
<text x="455" y="87" font-size="12">4 ms</text>
<text x="455" y="132" font-size="12">6 ms</text>
<text x="455" y="177" font-size="12" font-weight="700" style="fill: var(--dg-bad)">180 ms (GC pause)</text>
<text x="455" y="222" font-size="12">5 ms</text>
<text x="310" y="260" text-anchor="middle" font-size="12" font-weight="700">Response time = the slowest shard = 180 ms</text>
</svg>`,
        },
        {
          type: "table",
          title: "Chance a fan-out request hits at least one slow shard",
          headers: ["Shards queried", "Each slow 1% of the time", "Each slow 0.1% of the time"],
          rows: [
            ["1", "1%", "0.1%"],
            ["10", "9.6%", "1%"],
            ["100", "63%", "9.5%"],
          ],
          note: "P(slow) = 1 - (1 - p)^N for N independent shards.",
        },
        {
          type: "lab",
          id: "scatterGather",
          caption: "Increase the number of shards and watch the fan-out query's latency distribution drift toward the slow tail. Turn on hedged requests to see a backup request to another replica cut the tail.",
        },
        {
          type: "keypoints",
          items: [
            "<strong>Hedged requests</strong> (Dean and Barroso, \"The Tail at Scale\"): resend to another replica after about the p95 delay and take the first answer. Few duplicates, much shorter tail.",
            "<strong>Timeouts with partial results</strong> where completeness is optional: 63 of 64 shards may be fine for search.",
          ],
        },
        {
          type: "compare",
          title: "Better: design fan-out off the common path",
          items: [
            { title: "Precompute global views", tone: "ok", html: "Trending, leaderboards and global counts tolerate a minute of staleness: compute them from events and serve one cached key." },
            { title: "Denormalize onto the reader's shard", tone: "ok", html: "Store what a query needs on the shard that serves it (posts in a feed shard, names in a conversation shard). Writes do more so reads stay local." },
            { title: "Global secondary index", tone: "info", html: "A second copy sharded by the other key (orders by <code>merchant_id</code>), usually updated asynchronously; DynamoDB GSI reads are eventually consistent only." },
            { title: "Search engine", tone: "info", html: "For flexible multi-field queries, stream changes via CDC into Elasticsearch or OpenSearch." },
          ],
        },
        {
          type: "quiz",
          q: "A search service fans out to 50 shards. Each shard is slower than 100 ms only 1% of the time. Roughly how often is a search slower than 100 ms?",
          options: ["About 1%", "About 5%", "About 40%", "About 99%"],
          answer: 2,
          explain: "The search is slow if any shard is: 1 - 0.99^50 is about 0.39, so roughly 40% of searches. This is why fan-out queries need hedging, timeouts, fewer shards per query, or a design that avoids them on hot paths.",
        },
      ],
    },
    {
      id: "cross-shard-transactions",
      title: "Cross-shard transactions and two-phase commit",
      kicker: "Challenge 3",
      blocks: [
        {
          type: "text",
          html: `<p>Transferring $200 from Alice (shard 1) to Bob (shard 2) has no shared transaction; a crash between two writes loses or creates money. The best answer is <strong>co-location</strong>: keep data changed together on one shard. Constant cross-shard transactions hint the shard key is wrong.</p>`,
        },
        {
          type: "steps",
          title: "Two-phase commit (2PC)",
          items: [
            "<strong>Prepare:</strong> each participant does the work, writes it durably, takes locks and votes yes or no.",
            "<strong>Decide:</strong> all yes means the coordinator durably records commit; any no or timeout means abort.",
            "<strong>Commit or abort:</strong> participants apply the decision and release locks.",
          ],
        },
        {
          type: "keypoints",
          items: [
            "<strong>Expensive:</strong> extra round trips, and locks held from prepare to decision.",
            "<strong>Blocking:</strong> a participant that voted yes can't decide alone; if the coordinator dies, it holds locks until recovery.",
            "<strong>Fragile availability:</strong> every participant must be up. XA implements classic 2PC and is generally avoided in high-throughput services; Spanner makes each participant a Paxos group so one machine's failure doesn't stall it.",
          ],
        },
      ],
    },
    {
      id: "sagas",
      title: "Sagas: local steps with compensations",
      kicker: "The common answer",
      blocks: [
        {
          type: "idea",
          html: `<p>Split the operation into <strong>local transactions</strong>, each on one shard and committed independently, with a <strong>compensating action</strong> for each. If a later step fails permanently, run the compensations in reverse (Garcia-Molina and Salem, 1987).</p>`,
        },
        {
          type: "diagram",
          title: "A money transfer as a saga",
          caption: "Step 1 debits Alice on shard 1 and step 2 credits Bob on shard 2, each as its own local transaction. If the credit fails permanently, the saga refunds Alice instead of rolling back.",
          svg: `<svg viewBox="0 0 620 250" role="img" aria-label="Saga with a debit step, a credit step and a compensating refund">
<defs><marker id="cc15-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="20" y="40" width="180" height="56" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="110" y="63" text-anchor="middle" font-size="13" font-weight="700">1. Debit Alice $200</text>
<text x="110" y="83" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">shard 1, local tx</text>
<rect x="240" y="40" width="180" height="56" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="330" y="63" text-anchor="middle" font-size="13" font-weight="700">2. Credit Bob $200</text>
<text x="330" y="83" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">shard 2, local tx</text>
<rect x="460" y="40" width="140" height="56" rx="8" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="530" y="73" text-anchor="middle" font-size="13" font-weight="700">Completed</text>
<line x1="200" y1="68" x2="238" y2="68" stroke-width="1.5" marker-end="url(#cc15-arr)" style="stroke: var(--dg-muted)"/>
<line x1="420" y1="68" x2="458" y2="68" stroke-width="1.5" marker-end="url(#cc15-arr)" style="stroke: var(--dg-ok)"/>
<text x="439" y="58" text-anchor="middle" font-size="12" style="fill: var(--dg-ok)">ok</text>
<line x1="330" y1="96" x2="204" y2="168" stroke-width="2" stroke-dasharray="6 4" marker-end="url(#cc15-arr)" style="stroke: var(--dg-bad)"/>
<text x="292" y="140" font-size="12" style="fill: var(--dg-bad)">credit fails permanently</text>
<rect x="20" y="160" width="180" height="56" rx="8" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)" stroke-width="2"/>
<text x="110" y="183" text-anchor="middle" font-size="13" font-weight="700">Compensate:</text>
<text x="110" y="203" text-anchor="middle" font-size="12">refund Alice $200</text>
<text x="310" y="242" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">Every step is idempotent (keyed by the transfer id) and recorded in a durable saga log.</text>
</svg>`,
        },
        {
          type: "keypoints",
          items: [
            "<strong>Idempotent steps</strong> keyed by the transfer id, so retries are no-ops.",
            "<strong>Durable saga state</strong>, so a crashed coordinator resumes or compensates (Temporal and AWS Step Functions do this bookkeeping).",
            "<strong>Visible intermediate states</strong> (no isolation): model them, e.g. a transfer with status <code>pending</code>.",
            "<strong>Compensations are business actions</strong> (a refund, a correction email), not rollbacks.",
            "<strong>Orchestration</strong> (a coordinator directs each step; easier to debug) or <strong>choreography</strong> (each step emits an event that triggers the next; no central component).",
          ],
        },
        {
          type: "lab",
          id: "saga",
          caption: "Transfer $200 from A on shard 1 to B on shard 2 and inject a failure. Compare two independent writes (money vanishes or appears), two-phase commit (atomic but blocking), and a saga with idempotent steps and a compensating refund.",
        },
        {
          type: "tradeoffs",
          prosLabel: "Sagas",
          consLabel: "Costs",
          pros: [
            "No distributed locks; each step is a fast local transaction",
            "Keeps working when one participant is briefly down (steps retry)",
            "Fits services that own their own databases",
          ],
          cons: [
            "Only eventually consistent: intermediate states are visible",
            "Every step needs an idempotency key and a correct compensation",
            "Harder to reason about and test than a single transaction",
          ],
        },
        {
          type: "quiz",
          q: "A saga debits Alice, then fails to credit Bob because Bob's account was closed. The coordinator crashed right after the failure. What must be true for the system to end up correct?",
          options: [
            "The debit must be rolled back by the database automatically",
            "The saga's progress must be stored durably, so on restart the coordinator sees step 2 failed and runs the idempotent refund to Alice",
            "Two-phase commit must be used for the refund",
            "Nothing; Alice's money is lost",
          ],
          answer: 1,
          explain: "The debit already committed locally, so no database will roll it back. A durable saga log lets the restarted coordinator see where it stopped and run the compensation, and idempotency (keyed by transfer id) makes it safe even if the refund was partly attempted before the crash.",
        },
      ],
    },
    {
      id: "interview",
      title: "Handling sharding follow-ups in an interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "callout",
          tone: "interview",
          html: `<p>Expect probes on the weak spots you just created. Ready answers:</p>
<ol>
<li><strong>Hot key:</strong> "Cache the celebrity's data and serve reads from replicas; if writes are the problem, split with a compound key or pin to a dedicated shard. Monitor per-shard load."</li>
<li><strong>Global query:</strong> "That's scatter-gather, where the slowest of N shards sets latency. Precompute it in the background and serve from cache; it tolerates a minute of staleness."</li>
<li><strong>Cross-shard write:</strong> "Co-locate if possible; otherwise a saga, not 2PC: debit locally with a transfer id, credit locally, refund on permanent failure, with idempotent steps and durable saga state."</li>
</ol>`,
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Answering every cross-shard need with "use a distributed transaction". Say you'd co-locate data first, and why 2PC is slow and blocking.</p>`,
        },
      ],
    },
  ],
  takeaways: [
    "Sharding spreads data, not necessarily traffic; hot keys need caching, replicas, compound keys or dedicated shards, since adding shards does nothing.",
    "Queries without the shard key fan out, and the slowest shard sets latency: 1% per-shard slowness becomes 63% at 100 shards.",
    "Keep fan-out off hot paths with precomputed views, denormalization, secondary indexes or a search engine; hedge what remains.",
    "Two-phase commit is atomic but slow and blocking when the coordinator fails; choose shard boundaries that keep transactions on one shard.",
    "Sagas run local transactions with compensations, and need idempotent steps, durable state and explicit intermediate states.",
  ],
  furtherReading: [
    { title: "The Tail at Scale (Dean and Barroso, Communications of the ACM, 2013)", url: "https://research.google/pubs/the-tail-at-scale/", note: "Why fan-out amplifies tail latency, and hedged requests." },
    { title: "Sagas (Garcia-Molina and Salem, SIGMOD 1987)", note: "The original paper on long-lived transactions with compensations." },
    { title: "Spanner: Google's Globally-Distributed Database (Corbett et al., OSDI 2012)", note: "Two-phase commit over Paxos-replicated groups." },
  ],
};
