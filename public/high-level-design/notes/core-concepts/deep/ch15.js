// Deep dive: Chapter 15, Sharding challenges. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch15 = {
  hook: `<p>A social network shards its database by <code>user_id</code> across 64 machines. The dashboards look healthy: storage is even and average load per shard is a comfortable 30%. Then a pop star with 80 million followers posts, and shard 23, which owns her account, goes to 100% CPU while 63 shards idle. Meanwhile the new "trending posts" page asks all 64 shards for their top posts, and its p99 latency is ten times the p99 of any single shard. And product wants a "send money to a friend" feature, where the friend usually lives on a different shard.</p>
<p>None of this is a bug in the sharding. It is the price of it. Sharding solves capacity and creates three new classes of problem: <strong>hot spots</strong>, <strong>cross-shard queries</strong> and <strong>cross-shard transactions</strong>. Knowing each one, and the standard responses, is what separates "I'd shard it" from a design that survives contact with real traffic.</p>`,
  sections: [
    {
      id: "hot-spots",
      title: "Hot spots and the celebrity problem",
      kicker: "Challenge 1",
      blocks: [
        {
          type: "problem",
          html: `<p>Sharding only helps if load spreads. A <strong>hot spot</strong> is a shard that receives far more than its share of traffic, so it saturates while others idle, and the whole system is only as fast as that one machine. Even distribution of <em>data</em> does not guarantee even distribution of <em>traffic</em>.</p>`,
        },
        {
          type: "text",
          html: `<p>Hot spots come from two sources. <strong>Hot ranges</strong> appear with range sharding on keys that move together, the classic case being time: today's data is where all the writes go and most reads look. Hashing the key fixes this, which is why hash sharding is the default.</p>
<p><strong>Hot keys</strong> are harder. With <code>user_id</code> sharding, a celebrity account generates orders of magnitude more reads (profile views, timeline fetches) and sometimes writes (incoming likes and comments) than a typical user. Hashing cannot help, because the problem is one key, and one key always maps to exactly one shard. More shards just add idle machines.</p>
<h3>Responses to hot keys</h3>
<ul>
<li><strong>Cache and replicate reads.</strong> Most celebrity traffic is reads. Put their profile and recent posts in a cache (with an in-process layer for the very hottest keys) and serve the rest from that shard's read replicas.</li>
<li><strong>Split the key.</strong> Use a compound key such as <code>(user_id, bucket)</code> with bucket 0-15, or <code>(user_id, month)</code>, so one entity's data spreads over several shards. Writes spread, but reading that entity now means querying all its buckets.</li>
<li><strong>Isolate.</strong> Keep a small directory of exceptions that pins known heavy keys (large tenants, celebrities) to dedicated shards with more hardware.</li>
<li><strong>Split shards dynamically.</strong> Some systems split a hot or oversized shard and move half elsewhere automatically; others leave it to operators.</li>
</ul>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Amazon DynamoDB", title: "Adaptive capacity", html: "DynamoDB's documentation describes adaptive capacity that lets a busy partition borrow unused throughput and can isolate frequently accessed items onto their own partitions. A single item still has per-partition limits, so a truly hot key needs caching or write sharding." },
            { org: "MongoDB and Vitess", title: "Splitting and moving data", html: "MongoDB splits chunks and its balancer migrates them between shards automatically. Vitess supports resharding a keyspace into more shards as an operator-driven workflow, copying data and then cutting traffic over." },
            { org: "Social timelines", title: "Treating celebrities differently", html: "A widely discussed approach in feed systems is to fan out ordinary users' posts to followers' timelines at write time, but to merge very high-follower accounts' posts in at read time, so one post does not trigger tens of millions of writes." },
          ],
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>You cannot fix hot spots you cannot see. Monitor per-shard request rate, CPU and latency, not just cluster averages; a 64-shard average of 30% CPU can hide one shard at 100%.</p>`,
        },
        {
          type: "quiz",
          q: "Your orders table is sharded by hash(merchant_id). One merchant runs a flash sale and writes 50 times more orders than anyone else, overloading its shard. Which change spreads that merchant's writes?",
          options: [
            "Add more shards with the same key",
            "Shard by (merchant_id, bucket) for large merchants, so their orders spread over several shards",
            "Switch from hash to range sharding on merchant_id",
            "Increase the cache TTL on merchant pages",
          ],
          answer: 1,
          explain: "Every row with the same merchant_id hashes to the same shard regardless of how many shards exist. Adding a bucket to the key splits one merchant's orders across several shards. The cost is that reading all of that merchant's orders must query each bucket. Caching helps reads, not writes.",
        },
      ],
    },
    {
      id: "scatter-gather",
      title: "Scatter-gather queries and tail latency",
      kicker: "Challenge 2",
      blocks: [
        {
          type: "problem",
          html: `<p>A query that includes the shard key goes to one shard. A query that does not, such as "top 10 posts globally" or "find users named Garcia" in a database sharded by user id, has no way to know where matching rows live. It must ask <strong>every</strong> shard, wait for all of them, and merge the results. This is called scatter-gather or fan-out.</p>`,
        },
        {
          type: "text",
          html: `<p>Fan-out costs grow in two ways. Total work grows with the number of shards: a query that hits 64 shards does 64 times the work of a single-shard query, and if it is common, every shard spends capacity on it. Latency gets worse in a less obvious way: the response cannot return until the <strong>slowest</strong> shard answers, so the query's latency is the maximum of all the shards' latencies, not the average.</p>
<h3>Why rare slowness becomes common slowness</h3>
<p>Every server is occasionally slow: a garbage-collection pause, a busy disk, a background compaction, a noisy neighbour. Say each shard exceeds its p99 latency 1% of the time. A query touching one shard is slow 1% of the time. A query touching 100 shards is slow whenever <em>any</em> of them is, with probability <span class="formula">1 &minus; 0.99<sup>100</sup> &asymp; 63%</span>. What was a rare tail event for each server becomes the typical experience for the fan-out query.</p>`,
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
          type: "text",
          html: `<h3>Taming the tail</h3>
<p><strong>Hedged requests</strong> send the same request to a second replica if the first has not answered within a short delay (around the normal p95), and use whichever answer arrives first. Because the delay is long enough that most requests have already finished, only a few percent of requests are duplicated, but the far tail shrinks sharply. <strong>Timeouts with partial results</strong> help where completeness is optional: a search page can return results from 63 of 64 shards rather than wait. The best fix, though, is not to fan out on the common path at all.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Google", title: "The Tail at Scale (2013)", html: "Jeff Dean and Luiz Andr&eacute; Barroso's CACM article explains how fan-out turns rare per-server slowness into frequent slowness for whole requests, and describes hedged and tied requests as ways to reduce it." },
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
      id: "avoiding-cross-shard-reads",
      title: "Designing away cross-shard reads",
      kicker: "Responses",
      blocks: [
        {
          type: "text",
          html: `<p>If a common use case needs "ask every shard", the design or the shard key needs rethinking. Rare queries, such as an admin report or a nightly job, can simply be slow. For the common ones, there are four standard moves.</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "Precompute global views", tone: "ok", html: "Trending posts, leaderboards and global counts tolerate being a minute old. A background job or stream processor (fed by like and view events) computes them periodically and stores the result in a cache or small table. Reads become a single key lookup." },
            { title: "Denormalize onto the reader's shard", tone: "ok", html: "Copy the data a query needs onto the shard that serves it. A user's feed shard can store the posts it shows, not just ids; a conversation shard can store participant names. Writes do more work so reads stay local." },
            { title: "Global secondary index", tone: "info", html: "Maintain a second copy of the data sharded by the other key, for example orders by <code>customer_id</code> and an index of orders by <code>merchant_id</code>. It is usually updated asynchronously, so it lags the main table." },
            { title: "Search engine", tone: "info", html: "For flexible queries on many fields (\"users named Garcia in Madrid\"), stream changes into Elasticsearch or OpenSearch with CDC, and query that instead of the shards." },
          ],
        },
        {
          type: "realworld",
          items: [
            { org: "Amazon DynamoDB", title: "Global secondary indexes", html: "A GSI lets you query a table by a different partition key. DynamoDB maintains it asynchronously, and GSI reads are eventually consistent only, which is the general trade-off of any index sharded differently from its table." },
          ],
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>Every one of these responses trades freshness or write cost for read locality. That is usually a good deal, because cross-shard reads are paid on every request while the extra write work is paid once per change. Say which consistency the feature can tolerate when you choose.</p>`,
        },
      ],
    },
    {
      id: "cross-shard-transactions",
      title: "Cross-shard transactions and two-phase commit",
      kicker: "Challenge 3",
      blocks: [
        {
          type: "problem",
          html: `<p>Transfer $200 from Alice (shard 1) to Bob (shard 2). Inside one database this is one transaction: both updates commit or neither does. Across two independent databases, there is no shared transaction. Do the two writes separately and a crash between them leaves $200 debited from Alice and never credited to Bob, or credited to Bob and never debited from Alice.</p>`,
        },
        {
          type: "text",
          html: `<p>The first answer is the best one: <strong>design so it rarely happens</strong>. Choose shard boundaries that keep data changed together on the same shard: one user's balance, ledger and settings live together, so most operations are single-shard transactions. If the product constantly needs transactions spanning shards, that is a strong hint the shard key is wrong.</p>
<p>When an operation genuinely spans shards, there are two families of solution: make the participants agree atomically (<strong>two-phase commit</strong>), or break the operation into local steps with undo actions (<strong>sagas</strong>, next section).</p>`,
        },
        {
          type: "steps",
          title: "Two-phase commit (2PC)",
          items: [
            "<strong>Prepare.</strong> A coordinator asks every participant to prepare: each does the work, writes it durably, takes the locks it needs, and votes yes or no.",
            "<strong>Decide.</strong> If every participant voted yes, the coordinator durably records \"commit\"; if any said no or timed out, it records \"abort\".",
            "<strong>Commit or abort.</strong> The coordinator tells every participant the decision, and they commit or roll back and release their locks.",
          ],
        },
        {
          type: "text",
          html: `<p>2PC gives real atomicity, but it is expensive. Every transaction needs extra network round trips, and participants hold locks from the prepare until the decision arrives, which limits throughput on contended rows. The bigger problem is <strong>blocking</strong>: a participant that voted yes has promised to commit if told to, so it cannot decide on its own. If the coordinator crashes after the prepares, participants sit holding locks until it recovers. And every participant must be up for any transaction to succeed, so availability is the product of all of them.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "XA transactions", title: "Classic 2PC", html: "The X/Open XA standard, supported by MySQL, PostgreSQL (prepared transactions) and many message brokers, implements 2PC across resources. It is used in some enterprise systems but is generally avoided in high-throughput services because of the locking and blocking costs." },
            { org: "Google Spanner", title: "2PC over replicated participants", html: "Spanner runs two-phase commit across shards, but each participant (and the coordinator) is itself a Paxos-replicated group, so the failure of one machine does not leave the protocol stuck. That is how it offers cross-shard ACID transactions, at the cost of cross-replica latency on every commit." },
          ],
        },
        {
          type: "quiz",
          q: "In two-phase commit, both participants have voted yes and the coordinator crashes before sending the decision. What happens?",
          options: [
            "Each participant commits on its own after a timeout",
            "Each participant aborts on its own after a timeout",
            "Participants stay blocked, holding locks, until they learn the decision from the recovered coordinator",
            "The transaction commits on one participant and aborts on the other",
          ],
          answer: 2,
          explain: "After voting yes, a participant cannot unilaterally commit (the other might have been told to abort) or abort (the coordinator might have decided commit). It must wait for the decision, holding its locks. This blocking behaviour is the main reason most production systems avoid plain 2PC.",
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
          html: `<p>Split the operation into a sequence of <strong>local transactions</strong>, each on one shard and each committed independently. For every step, define a <strong>compensating action</strong> that semantically undoes it. If a later step fails permanently, run the compensations for the completed steps in reverse order.</p>`,
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
          type: "text",
          html: `<p>Several details make sagas work in practice:</p>
<ul>
<li><strong>Idempotent steps.</strong> Networks fail after work is done, so every step will sometimes be retried. Key each one by the transfer id ("debit for transfer t-981 already applied") so a retry is a no-op.</li>
<li><strong>Durable saga state.</strong> Record which steps have completed in a log or table, so a crashed coordinator can resume or compensate after restarting instead of forgetting the transfer halfway.</li>
<li><strong>Visible intermediate states.</strong> Between steps, Alice has been debited and Bob not yet credited. There is no isolation, so model it explicitly: a transfer row with status <code>pending</code>, and balances that each stay correct on their own shard.</li>
<li><strong>Compensations are business actions.</strong> You cannot un-send an email; you send a correction. A compensation is a new forward action (a refund), not a database rollback.</li>
</ul>
<p>Sagas come in two styles. In <strong>orchestration</strong>, a central coordinator tells each service what to do next and tracks state, which is easier to follow and debug. In <strong>choreography</strong>, each step emits an event that triggers the next one, which avoids a central component but spreads the flow across many services.</p>`,
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
            "Fits naturally with services that own their own databases",
          ],
          cons: [
            "Only eventually consistent: intermediate states are visible",
            "Every step needs an idempotency key and a correct compensation",
            "Harder to reason about and test than a single transaction",
          ],
        },
        {
          type: "realworld",
          items: [
            { org: "Origins", title: "Garcia-Molina and Salem (1987)", html: "The term saga comes from a 1987 paper on long-lived transactions, which proposed breaking them into a sequence of smaller transactions with compensating transactions." },
            { org: "Temporal and AWS Step Functions", title: "Saga orchestrators", html: "Workflow engines like these persist each step's state durably and retry or compensate on failure, which is exactly the bookkeeping an orchestrated saga needs." },
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
          type: "text",
          html: `<p>Once you propose sharding, expect the interviewer to probe its weak spots: "what about a celebrity?", "how do you show trending posts?", "how does a transfer between users work?". These are not trick questions; they test whether you know the costs of the choice you just made. Answer each with the problem in one sentence and the standard fix.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>Ready answers for the three follow-ups:</p>
<ol>
<li><strong>Hot key:</strong> "Cache the celebrity's data aggressively and serve reads from replicas; if their writes are the problem, split their data with a compound key or pin them to a dedicated shard. And I'd monitor per-shard load."</li>
<li><strong>Global query:</strong> "That would be scatter-gather, slow because the slowest of N shards sets the latency. I'll precompute it in the background and serve it from a cache; it tolerates a minute of staleness."</li>
<li><strong>Cross-shard write:</strong> "Avoid 2PC; use a saga: debit locally with a transfer id, credit locally, refund on permanent failure. Steps are idempotent and the saga state is durable."</li>
</ol>`,
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Answering every cross-shard need with "use a distributed transaction". Interviewers usually want to hear that you would first co-locate data so the transaction is single-shard, and that you know why 2PC is slow and blocking before reaching for it.</p>`,
        },
        {
          type: "quiz",
          q: "You sharded posts by user_id. Product wants a \"most liked posts this hour\" page on the home screen for every user. What is the best approach?",
          options: [
            "Query all shards on each page load and merge the top results",
            "Have a stream processor aggregate like events into an hourly top list, store it in a cache, and serve it as one lookup",
            "Re-shard posts by like count",
            "Use two-phase commit to keep a global counter",
          ],
          answer: 1,
          explain: "A home-screen query on every load must not fan out to every shard. The list tolerates being a minute stale, so computing it continuously from events and serving it from a cache turns a 64-shard query into a single key read. Re-sharding by a constantly changing value would be chaos.",
        },
      ],
    },
  ],
  takeaways: [
    "Sharding spreads data, not necessarily traffic: hot ranges come from monotonic keys, hot keys from celebrities and giant tenants.",
    "Hot keys need caching, read replicas, compound keys that split one entity across shards, or dedicated shards; adding shards alone does nothing.",
    "Queries without the shard key fan out to every shard, and the slowest shard sets the latency: 1% per-shard slowness becomes 63% at 100 shards.",
    "Avoid fan-out on hot paths by precomputing global views, denormalizing onto the reader's shard, or keeping a secondary index or search engine sharded by the other key.",
    "Two-phase commit is atomic but slow and blocking when the coordinator fails; most systems avoid it.",
    "Sagas run local transactions with compensating actions; they need idempotent steps, durable state and explicit intermediate states. Best of all, choose shard boundaries that keep transactions on one shard.",
  ],
  furtherReading: [
    { title: "The Tail at Scale (Dean and Barroso, Communications of the ACM, 2013)", url: "https://research.google/pubs/the-tail-at-scale/", note: "Why fan-out amplifies tail latency, and hedged requests." },
    { title: "Sagas (Garcia-Molina and Salem, SIGMOD 1987)", note: "The original paper on long-lived transactions with compensations." },
    { title: "Spanner: Google's Globally-Distributed Database (Corbett et al., OSDI 2012)", note: "Two-phase commit over Paxos-replicated groups." },
  ],
};
