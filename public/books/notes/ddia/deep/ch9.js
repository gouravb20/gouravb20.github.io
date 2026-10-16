// Deep dive: DDIA Chapter 9, Consistency and Consensus. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch9 = {
  hook: `<p>Two people are refreshing a football score page during the final minute. Alice sees "Final score: 2&ndash;1" and shouts it across the room. Bob refreshes a second later and still sees the match in progress, because his request hit a replica that is a few hundred milliseconds behind. Nothing was lost and the replica will catch up, but for a moment the system contradicted itself in a way anyone in the room could notice.</p>
<p>For a score page that is harmless. For a lock service, a leader election, a username registry or a bank's account balance, it is not: two nodes acting on contradictory views is exactly how you get two leaders, two owners of one username, or money that exists twice. This chapter is about the strongest guarantees a replicated system can offer, what they cost, and the one primitive, <strong>consensus</strong>, that the others reduce to.</p>`,
  sections: [
    {
      id: "linearizability",
      title: "Linearizability: behaving like a single copy",
      kicker: "The strongest model",
      blocks: [
        {
          type: "problem",
          html: `<p>Replication creates several copies of the data, and with asynchronous replication they disagree for a while. Eventual consistency promises only that they converge "at some point", which tells you nothing about what a particular read will return. Application code written as if there were one copy breaks in subtle ways.</p>`,
        },
        {
          type: "idea",
          html: `<p><strong>Linearizability</strong> (also called atomic or strong consistency, defined by Herlihy and Wing in 1990) makes a replicated system look as if there were only one copy of the data, and every operation took effect instantly at some single point between when it was called and when it returned. Once any read has returned a new value, every later read, from any client, must return it too.</p>`,
        },
        {
          type: "text",
          html: `<p>It is a <strong>recency guarantee</strong> on single objects. If operation A finishes before operation B starts (in real, wall-clock time), B must see A's effect. Operations that overlap in time can take effect in either order, but there must be one order consistent with everyone's observations, and the value can never "go back" once a read has seen the new one.</p>
<p>The timing diagram below shows the classic violation. A write of <code>x = 1</code> is in progress. Alice's read happens to see the new value and returns. Bob starts his read <em>after</em> Alice's read has finished, yet he gets the old value 0. Each read alone is defensible (the write had not yet returned), but together they show the value going from 1 back to 0, which a single copy could never do.</p>`,
        },
        {
          type: "diagram",
          title: "A read that breaks linearizability",
          caption: "Bob's read starts after Alice's has already returned the new value, so a linearizable system must give Bob 1 as well. Returning 0 means the system is not behaving like one copy.",
          svg: `<svg viewBox="0 0 640 260" role="img" aria-label="Timing diagram: Alice reads the new value 1, then Bob reads the old value 0 afterwards, violating linearizability">
<defs><marker id="ddia9-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<text x="16" y="64" font-size="13" font-weight="700">Writer</text>
<text x="16" y="134" font-size="13" font-weight="700">Alice</text>
<text x="16" y="204" font-size="13" font-weight="700">Bob</text>
<rect x="130" y="45" width="380" height="30" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="320" y="65" text-anchor="middle" font-size="12">write(x, 1) in progress</text>
<rect x="200" y="115" width="140" height="30" rx="6" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="270" y="135" text-anchor="middle" font-size="12">read x: 1</text>
<rect x="390" y="185" width="140" height="30" rx="6" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)" stroke-width="2"/>
<text x="460" y="205" text-anchor="middle" font-size="12" font-weight="700">read x: 0</text>
<line x1="340" y1="150" x2="340" y2="222" stroke-width="2" stroke-dasharray="5 4" style="stroke: var(--dg-muted)"/>
<text x="330" y="182" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">Alice's read returned</text>
<text x="330" y="200" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">before Bob's began</text>
<line x1="130" y1="242" x2="620" y2="242" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ddia9-arrow)"/>
<text x="16" y="246" font-size="12" style="fill: var(--dg-muted)">real time</text>
</svg>`,
        },
        {
          type: "compare",
          title: "Linearizability is not serializability",
          items: [
            { title: "Serializability", tone: "info", html: "An isolation property of <em>transactions</em> over many objects: the outcome equals <em>some</em> serial order. That order need not match real time; a snapshot read of slightly old data is fine." },
            { title: "Linearizability", tone: "info", html: "A recency property of <em>single-object</em> reads and writes: operations take effect in an order consistent with real time. It says nothing about grouping several operations into a transaction." },
            { title: "Strict serializability", tone: "ok", html: "Both at once: transactions appear in a serial order that also respects real time. Two-phase locking and actual serial execution give it; Google Spanner offers it globally and calls it external consistency." },
          ],
        },
        {
          type: "quiz",
          q: "A database runs serializable snapshot isolation on a single node. Is it linearizable?",
          options: [
            "Yes, serializable always implies linearizable",
            "Not necessarily: a transaction reads from a snapshot taken at its start, so it may miss writes that committed while it ran",
            "No, nothing on a single node can be linearizable",
            "Only if it uses two-phase commit",
          ],
          answer: 1,
          explain: "Snapshot-based reads deliberately return data as of the transaction's start, ignoring writes that committed afterwards, so the results can lag real time. That is fine for serializability but not linearizability. Two-phase locking or serial execution, by contrast, are typically linearizable as well.",
        },
      ],
    },
    {
      id: "linearizability-in-practice",
      title: "Where you need it, and what it costs",
      kicker: "Linearizability in practice",
      blocks: [
        {
          type: "text",
          html: `<p>Most applications can live with weaker guarantees most of the time. A few situations genuinely need linearizability:</p>
<ul>
<li><strong>Locks and leader election.</strong> Every node must agree on who holds the lock. If one node could read a stale "lock is free", two leaders follow. This is why ZooKeeper and etcd exist.</li>
<li><strong>Uniqueness constraints.</strong> Two users registering the same username, two bookings for the same seat, a balance that must not go negative: all are effectively a lock on a value, so they need a single up-to-date answer.</li>
<li><strong>Cross-channel timing.</strong> A web server stores an uploaded photo in file storage, then puts a "resize photo 42" message on a queue. If the queue is faster than storage replication, the resizer can fetch the old photo or nothing. The two channels (storage and queue) race, and only a linearizable store prevents the resizer from seeing stale data.</li>
</ul>`,
        },
        {
          type: "table",
          title: "Which replication schemes can be linearizable",
          headers: ["Replication", "Linearizable?", "Why"],
          rows: [
            ["Single-leader", "Potentially", "Reads and writes must go to the current leader, and you must be sure it really is the leader (a deposed leader serving reads breaks it). Async failover can lose writes."],
            ["Consensus (Raft, Paxos, Zab)", "Yes", "Designed for it: they prevent split brain and stale reads when used correctly (for example etcd's default reads)."],
            ["Multi-leader", "No", "Concurrent writes on different leaders are merged afterwards, so there is no single copy."],
            ["Leaderless (Dynamo-style)", "Usually not", "Even strict quorums (w + r &gt; n) can return a new value to one reader and an old one to a later reader when writes and reads race; last-write-wins with clock skew makes it worse."],
          ],
        },
        {
          type: "text",
          html: `<h3>CAP, stated precisely</h3>
<p>Imagine a database replicated across two datacenters, and the link between them fails. Clients can still reach both sides. Now you must choose. If every write must be linearizable, the side that cannot reach the leader (or the majority) must refuse requests: it is <strong>unavailable</strong>. If both sides keep serving, they will diverge: it is <strong>not linearizable</strong>.</p>
<p>That is the whole content of the CAP theorem, conjectured by Eric Brewer in 2000 and proved by Gilbert and Lynch in 2002: <em>when the network is partitioned</em>, you choose between linearizability and availability. The popular "pick two of three" reading is misleading, because partitions are not optional; they happen whether you choose them or not. CAP also says nothing about latency, disk failures or any consistency model other than linearizability, so it is less useful in design than it sounds.</p>
<h3>The everyday cost is latency</h3>
<p>Partitions are rare, but the cost of linearizability is paid constantly. Every linearizable read or write needs coordination with other replicas, so its response time cannot be below a network round trip, and theoretical results (Attiya and Welch) show it must grow with the <em>uncertainty</em> of network delays. Many systems give up linearizability not for partition tolerance but for speed. Even the RAM in a multi-core CPU is not linearizable: each core has caches and store buffers, and another core's write is not visible until a memory barrier forces it.</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "Consistent under partition (CP-leaning)", tone: "info", html: "The minority side refuses writes, and often linearizable reads. Examples: ZooKeeper, etcd, Consul, Spanner, CockroachDB. Correct answers or errors, never wrong answers." },
            { title: "Available under partition (AP-leaning)", tone: "warn", html: "Both sides keep accepting requests and reconcile later. Examples: Cassandra and DynamoDB at their default settings, Riak. Always an answer, possibly stale or conflicting." },
          ],
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>Daniel Abadi's PACELC framing is a more practical lens: if there is a <strong>P</strong>artition, choose <strong>A</strong> or <strong>C</strong>; <strong>E</strong>lse, in normal operation, choose <strong>L</strong>atency or <strong>C</strong>onsistency. Most real trade-offs happen in the "else" branch, every day, not during partitions.</p>`,
        },
      ],
    },
    {
      id: "ordering-and-causality",
      title: "Ordering, causality and logical clocks",
      kicker: "Weaker but cheaper",
      blocks: [
        {
          type: "problem",
          html: `<p>Linearizability puts every operation on one timeline, which requires coordination on every operation. But most of what applications need is weaker: an answer must come after its question, a reply after the message it replies to, an update after the insert it modifies. Can we preserve that order without paying for a global timeline?</p>`,
        },
        {
          type: "text",
          html: `<p>Operation A <strong>happens before</strong> B if B could have known about A: they ran on the same node in that order, or a message carried knowledge of A to the node that did B, directly or through a chain of messages. If neither happens before the other, they are <strong>concurrent</strong>. This relation, defined by Leslie Lamport in 1978, is the <strong>causal order</strong>. It is a partial order: some pairs are simply incomparable.</p>
<p>A system is <strong>causally consistent</strong> if every node sees causally related operations in their causal order. That is weaker than linearizability, which is a total order consistent with real time, but it is known to be the strongest consistency model that can remain available during network partitions. That makes it attractive for geo-distributed systems where coordination across continents is too slow.</p>
<h3>Lamport timestamps</h3>
<p>Tracking full causal history is expensive. Lamport's trick gives a cheap total order that is <em>consistent with</em> causality. Every node keeps a counter. It increments the counter for each event and attaches <code>(counter, nodeId)</code> to every message. On receiving a message, a node sets its counter to <code>max(local, received) + 1</code>. Timestamps are compared by counter first, then node ID to break ties.</p>`,
        },
        {
          type: "diagram",
          title: "Lamport timestamps across two nodes",
          caption: "Each circle is an event with its counter. Node B jumps from 1 to 3 when it receives A's message stamped 2, and A jumps to 5 when it receives B's message stamped 4. Every causal chain gets increasing timestamps.",
          svg: `<svg viewBox="0 0 640 280" role="img" aria-label="Lamport timestamps: counters jump forward to max of local and received plus one">
<defs><marker id="ddia9-arrow2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<text x="16" y="84" font-size="13" font-weight="700">Node A</text>
<text x="16" y="204" font-size="13" font-weight="700">Node B</text>
<line x1="100" y1="80" x2="620" y2="80" stroke-width="2" style="stroke: var(--dg-line)"/>
<line x1="100" y1="200" x2="620" y2="200" stroke-width="2" style="stroke: var(--dg-line)"/>
<line x1="256" y1="94" x2="326" y2="184" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia9-arrow2)"/>
<line x1="444" y1="186" x2="506" y2="96" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia9-arrow2)"/>
<circle cx="140" cy="80" r="16" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="140" y="85" text-anchor="middle" font-size="13" font-weight="700">1</text>
<circle cx="240" cy="80" r="16" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="240" y="85" text-anchor="middle" font-size="13" font-weight="700">2</text>
<circle cx="520" cy="80" r="16" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="520" y="85" text-anchor="middle" font-size="13" font-weight="700">5</text>
<circle cx="180" cy="200" r="16" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="180" y="205" text-anchor="middle" font-size="13" font-weight="700">1</text>
<circle cx="340" cy="200" r="16" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="340" y="205" text-anchor="middle" font-size="13" font-weight="700">3</text>
<circle cx="430" cy="200" r="16" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="430" y="205" text-anchor="middle" font-size="13" font-weight="700">4</text>
<text x="240" y="52" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">send, stamp 2</text>
<text x="520" y="52" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">max(2, 4) + 1 = 5</text>
<text x="340" y="236" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">max(1, 2) + 1 = 3</text>
<text x="430" y="256" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">send, stamp 4</text>
<text x="160" y="138" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">A's 1 and B's 1 are</text>
<text x="160" y="156" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">concurrent; tie broken by ID</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>Lamport timestamps have a limit that matters in practice: they define an order only <em>after the fact</em>. Suppose two users try to claim the username "alice" at the same moment on different nodes. Each node can give its request a timestamp, but to know whether it won, a node must hear from every other node that it has no request with a smaller timestamp. If one node is unreachable, nobody can decide. Uniqueness needs to know when the order is <em>final</em>, which is the job of total order broadcast, next.</p>
<p><strong>Vector clocks</strong> (and the closely related version vectors used to compare replica states) go the other way: each node tracks a counter for every node, so you can tell whether two events are causally ordered or truly concurrent. Lamport timestamps cannot tell you that, because they force every pair into an order.</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "Lamport timestamps", tone: "info", html: "Constant size: one counter plus a node ID. Give a total order consistent with causality, but cannot tell concurrent events apart from causally ordered ones." },
            { title: "Vector clocks", tone: "info", html: "One counter per node, so size grows with the cluster. Give a partial order that exactly matches causality, so concurrent writes can be detected and surfaced or merged." },
          ],
        },
        {
          type: "quiz",
          q: "Event X has Lamport timestamp (7, A) and event Y has (9, B). What can you conclude?",
          options: [
            "X happened before Y in causal order",
            "Y did not happen before X; X may have happened before Y, or they may be concurrent",
            "X and Y are concurrent",
            "Y happened before X, because B > A",
          ],
          answer: 1,
          explain: "Lamport timestamps are consistent with causality: if Y had happened before X, Y's timestamp would be smaller. So Y did not happen before X. But a smaller timestamp does not prove causality; X and Y could be unrelated events on different nodes. Only vector clocks can distinguish the two cases.",
        },
      ],
    },
    {
      id: "total-order-broadcast",
      title: "Total order broadcast: one log everyone agrees on",
      kicker: "From ordering to agreement",
      blocks: [
        {
          type: "idea",
          html: `<p><strong>Total order broadcast</strong> (also called atomic broadcast) is a protocol for delivering messages to every node such that no message is lost, and <em>every node delivers the same messages in the same order</em>. Once a message is delivered, its position is fixed forever; nodes cannot insert anything earlier.</p>`,
        },
        {
          type: "text",
          html: `<p>That is the missing piece from Lamport timestamps: the order is final at the moment of delivery. And it is exactly what you need for <strong>state machine replication</strong>: if every replica starts in the same state and applies the same deterministic commands in the same order, they all end in the same state. A replicated database's log is a total order broadcast.</p>
<p>It also gives you linearizable operations. To claim the username "alice", append "claim alice by user A" to the log, then read the log until your own message comes back. If the first claim for "alice" in the log is yours, you won; otherwise you lost. Every node reaches the same conclusion, because every node sees the same order. (Reads need care too: either append a read marker to the log, or ask the leader to confirm it is still the leader before answering, as etcd's ReadIndex does.)</p>`,
        },
        {
          type: "diagram",
          title: "One agreed log, many identical replicas",
          caption: "Two users race to claim the username alice. Consensus fixes the order of log entries; every replica applies the same entries in the same order, so all of them decide that A's claim (entry 2) wins and B's (entry 3) is rejected.",
          svg: `<svg viewBox="0 0 640 270" role="img" aria-label="A totally ordered log applied to three replicas produces the same state on each">
<defs><marker id="ddia9-arrow3" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<text x="320" y="36" text-anchor="middle" font-size="13" font-weight="700">Totally ordered log, fixed by consensus</text>
<rect x="45" y="54" width="100" height="48" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="95" y="74" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">#1</text>
<text x="95" y="92" text-anchor="middle" font-size="12">x = 1</text>
<rect x="155" y="54" width="100" height="48" rx="6" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="205" y="74" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">#2</text>
<text x="205" y="92" text-anchor="middle" font-size="12">alice by A</text>
<rect x="265" y="54" width="100" height="48" rx="6" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)" stroke-width="2"/>
<text x="315" y="74" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">#3</text>
<text x="315" y="92" text-anchor="middle" font-size="12">alice by B</text>
<rect x="375" y="54" width="100" height="48" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="425" y="74" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">#4</text>
<text x="425" y="92" text-anchor="middle" font-size="12">y = 7</text>
<rect x="485" y="54" width="100" height="48" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-dasharray="5 4" stroke-width="2"/>
<text x="535" y="83" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">next...</text>
<line x1="315" y1="106" x2="130" y2="176" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia9-arrow3)"/>
<line x1="315" y1="106" x2="315" y2="176" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia9-arrow3)"/>
<line x1="315" y1="106" x2="500" y2="176" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia9-arrow3)"/>
<rect x="45" y="180" width="170" height="60" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="130" y="204" text-anchor="middle" font-size="13" font-weight="700">Replica 1</text>
<text x="130" y="224" text-anchor="middle" font-size="12">x=1, y=7, alice=A</text>
<rect x="230" y="180" width="170" height="60" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="315" y="204" text-anchor="middle" font-size="13" font-weight="700">Replica 2</text>
<text x="315" y="224" text-anchor="middle" font-size="12">x=1, y=7, alice=A</text>
<rect x="415" y="180" width="170" height="60" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="500" y="204" text-anchor="middle" font-size="13" font-weight="700">Replica 3</text>
<text x="500" y="224" text-anchor="middle" font-size="12">x=1, y=7, alice=A</text>
</svg>`,
        },
        {
          type: "text",
          html: `<h3>Equivalent to consensus</h3>
<p>Here is the key theoretical result. Total order broadcast is equivalent to repeated rounds of consensus: deciding "which message goes in slot 1, then slot 2, ..." is one consensus decision per slot. Conversely, if you have total order broadcast, you can run consensus by having every node broadcast its proposal and picking the first one delivered. Linearizable compare-and-set registers are equivalent to them too. So all of these hard problems (a linearizable lock, unique usernames, a replicated log, leader election) are the same problem in disguise.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "ZooKeeper", title: "Zab", html: "Every write goes through the ZooKeeper Atomic Broadcast protocol, which delivers it to all servers in one agreed order, tagged with a <code>zxid</code>." },
            { org: "etcd and Consul", title: "Raft log", html: "Each write is a Raft log entry; the key-value store is the state machine that applies committed entries in order." },
            { org: "Apache Kafka", title: "Per-partition order", html: "A Kafka partition is a totally ordered, replicated log. Ordering holds only within a partition, which is why related events share a key: all events for one key land in one partition." },
          ],
        },
      ],
    },
    {
      id: "two-phase-commit",
      title: "Atomic commit and two-phase commit",
      kicker: "Distributed transactions",
      blocks: [
        {
          type: "problem",
          html: `<p>A transaction that writes to several nodes (two database shards, or a database and a message broker) must commit on all of them or none. Simply sending "commit" to each node fails: one may commit while another hits a constraint violation, crashes or times out, and committed data cannot be uncommitted, because other transactions may already have read it.</p>`,
        },
        {
          type: "text",
          html: `<p><strong>Two-phase commit (2PC)</strong> introduces a <strong>coordinator</strong> (often a library inside the application, or a transaction manager) and splits commit into two rounds:</p>
<ol>
<li><strong>Prepare.</strong> The coordinator asks every participant, "can you commit?" A participant that votes yes must first make the transaction durable and check every constraint, because a yes is a binding promise: from now on it must commit if told to, even after a crash and restart.</li>
<li><strong>Commit or abort.</strong> If every vote was yes, the coordinator writes "commit" to its own log on disk. That write is the <strong>commit point</strong>. It then tells everyone to commit, and retries forever until each one acknowledges. If any vote was no or timed out, it tells everyone to abort.</li>
</ol>
<p>The protocol works because of two points of no return: the participant's yes vote and the coordinator's logged decision.</p>`,
        },
        {
          type: "diagram",
          title: "Two-phase commit",
          caption: "Both databases vote yes and are now prepared: they hold their locks and cannot decide alone. The coordinator's logged decision is the commit point. If it crashes between the dashed line and sending commit, the participants stay in doubt until it recovers.",
          svg: `<svg viewBox="0 0 640 280" role="img" aria-label="Two-phase commit with a coordinator and two databases, showing the prepare phase, the commit point and the commit phase">
<text x="215" y="24" text-anchor="middle" font-size="13" font-weight="700">Phase 1: prepare</text>
<text x="545" y="24" text-anchor="middle" font-size="13" font-weight="700">Phase 2: commit</text>
<text x="16" y="74" font-size="13" font-weight="700">Coordinator</text>
<text x="16" y="164" font-size="13" font-weight="700">Database 1</text>
<text x="16" y="254" font-size="13" font-weight="700">Database 2</text>
<line x1="125" y1="70" x2="628" y2="70" stroke-width="1" style="stroke: var(--dg-line)"/>
<line x1="125" y1="160" x2="628" y2="160" stroke-width="1" style="stroke: var(--dg-line)"/>
<line x1="125" y1="250" x2="628" y2="250" stroke-width="1" style="stroke: var(--dg-line)"/>
<line x1="375" y1="36" x2="375" y2="272" stroke-width="2" stroke-dasharray="6 4" style="stroke: var(--dg-bad)"/>
<rect x="135" y="53" width="120" height="34" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="195" y="75" text-anchor="middle" font-size="12">send prepare</text>
<rect x="305" y="53" width="140" height="34" rx="6" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)" stroke-width="2"/>
<text x="375" y="75" text-anchor="middle" font-size="12" font-weight="700">log "commit"</text>
<rect x="490" y="53" width="120" height="34" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="550" y="75" text-anchor="middle" font-size="12">send commit</text>
<rect x="175" y="143" width="130" height="34" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="240" y="165" text-anchor="middle" font-size="12">vote yes (prepared)</text>
<text x="437" y="165" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">in doubt</text>
<rect x="500" y="143" width="110" height="34" rx="6" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="555" y="165" text-anchor="middle" font-size="12">commit</text>
<rect x="175" y="233" width="130" height="34" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="240" y="255" text-anchor="middle" font-size="12">vote yes (prepared)</text>
<text x="437" y="255" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">in doubt</text>
<rect x="500" y="233" width="110" height="34" rx="6" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="555" y="255" text-anchor="middle" font-size="12">commit</text>
<text x="381" y="112" font-size="12" style="fill: var(--dg-bad)">commit point</text>
</svg>`,
        },
        {
          type: "text",
          html: `<h3>The blocking problem</h3>
<p>If the coordinator crashes after participants have voted yes but before they hear the decision, they are <strong>in doubt</strong>. They cannot abort on their own (the coordinator may have logged commit and told someone else), and they cannot commit on their own (it may have decided abort). They must wait, holding row locks the whole time, until the coordinator recovers and reads its log. If the coordinator's log is lost, an administrator has to resolve the transactions by hand. Meanwhile every other transaction that touches those rows is stuck. This is why 2PC is called a <strong>blocking</strong> atomic commit protocol.</p>
<p>Three-phase commit tries to avoid blocking but assumes bounded network delay and reliable failure detection, which real networks do not provide, so it is rarely used.</p>`,
        },
        {
          type: "tradeoffs",
          pros: [
            "Gives atomic commit across heterogeneous systems (XA works across databases and message brokers)",
            "Well understood and supported: PostgreSQL <code>PREPARE TRANSACTION</code>, MySQL XA, Java JTA",
          ],
          cons: [
            "Blocks with locks held if the coordinator fails at the wrong moment",
            "Needs every participant to answer: one slow or failed node stalls or aborts everyone",
            "Extra disk forces and round trips on every transaction; often a large throughput cost",
            "A coordinator embedded in an app server becomes a single point of failure whose log must be durable",
          ],
        },
        {
          type: "callout",
          tone: "modern",
          html: `<p>Distributed SQL databases kept 2PC but removed its worst weakness by replicating every participant and the coordinator's state with consensus. Google Spanner runs 2PC across Paxos groups; CockroachDB and TiDB run transactions across Raft-replicated ranges and store the transaction record in a replicated range. A crashed machine no longer leaves participants in doubt, because another replica of the same group takes over. Across services that each own their own database, the more common answer is to avoid distributed transactions altogether, using sagas with compensating actions or the outbox pattern.</p>`,
        },
        {
          type: "quiz",
          q: "In 2PC, a participant has voted yes, and then loses contact with the coordinator for ten minutes. What should it do?",
          options: [
            "Abort after a timeout to release its locks",
            "Commit after a timeout, since everyone probably voted yes",
            "Keep waiting in the prepared state until it learns the decision",
            "Ask a majority of the other participants and follow their vote",
          ],
          answer: 2,
          explain: "Once it voted yes, the participant gave up the right to decide alone. The coordinator may have logged either outcome, so a unilateral commit or abort risks breaking atomicity. It must wait (it may ask other participants, but they may be in doubt too). This waiting is exactly 2PC's blocking problem.",
        },
      ],
    },
    {
      id: "consensus-algorithms",
      title: "Fault-tolerant consensus: Paxos, Raft and Zab",
      kicker: "The core primitive",
      blocks: [
        {
          type: "text",
          html: `<p><strong>Consensus</strong> means getting several nodes to agree on a value. Formally an algorithm must satisfy four properties:</p>
<ul>
<li><strong>Uniform agreement:</strong> no two nodes decide differently.</li>
<li><strong>Integrity:</strong> no node decides twice.</li>
<li><strong>Validity:</strong> the decided value was proposed by some node (no trivial "always decide null").</li>
<li><strong>Termination:</strong> every node that does not crash eventually decides.</li>
</ul>
<p>The first three are safety properties. Termination is liveness, and it is what makes consensus fault tolerant: 2PC satisfies the safety properties but not termination, because one crashed coordinator stops everyone. A consensus algorithm keeps deciding as long as a <strong>majority</strong> of nodes is up and can talk: 3 nodes tolerate 1 failure, 5 tolerate 2, and in general <code>2f + 1</code> tolerate <code>f</code>.</p>`,
        },
        {
          type: "text",
          html: `<h3>How the leader-based algorithms work</h3>
<p>Paxos (in its Multi-Paxos form), Raft, Zab and Viewstamped Replication share the same skeleton. They elect a leader, and the leader proposes log entries that followers accept; an entry is committed once a majority has it. The subtle part is leadership itself, since agreeing on a leader is a consensus problem too. They break the circularity with a monotonically increasing <strong>epoch</strong> number (Raft calls it a term, Paxos a ballot number, Zab an epoch):</p>
<ol>
<li>A node that suspects the leader is dead starts an election with a higher epoch and asks for votes. A node votes at most once per epoch, so at most one leader can win any given epoch.</li>
<li>Before a leader's proposal counts, a majority must accept it, and each acceptor rejects proposals from any epoch older than one it has seen. A deposed leader that wakes up is refused, because some node in every majority already knows the newer epoch: it is fencing, built in.</li>
<li>Because the election majority and the commit majority always overlap in at least one node, a new leader can always learn about every committed entry. Raft enforces this by only granting votes to candidates whose log is at least as up to date as the voter's.</li>
</ol>`,
        },
        {
          type: "table",
          title: "The common algorithms",
          headers: ["Algorithm", "Origin", "Known for", "Used by"],
          rows: [
            ["Paxos / Multi-Paxos", "Lamport; published 1998", "The original; notoriously hard to understand and to implement fully", "Google Chubby, Spanner"],
            ["Zab", "Yahoo, for ZooKeeper", "Atomic broadcast with a recovery phase on leader change", "ZooKeeper"],
            ["Raft", "Ongaro and Ousterhout, 2014", "Designed for understandability, with a precise specification", "etcd, Consul, CockroachDB, TiKV, Kafka (KRaft), RabbitMQ quorum queues"],
            ["Viewstamped Replication", "Oki and Liskov, 1988", "An early leader-based protocol, closely related to Raft", "Mainly research and teaching"],
          ],
        },
        {
          type: "text",
          html: `<h3>Limits and costs</h3>
<p>Consensus is not free. Every decision needs a round trip to a majority, so writes are slower than on a single node, and in a geographically spread group the latency is set by the distance to the nearest majority. The membership is usually a fixed set, and changing it needs care (Raft has a dedicated reconfiguration mechanism). Leader election relies on timeouts, so on a flaky network a cluster can spend its time electing leaders instead of doing work. And the group should be small, typically 3 or 5 nodes, because adding nodes adds latency without adding throughput.</p>
<p>The <strong>FLP result</strong> (Fischer, Lynch and Paterson, 1985) proves that in a fully asynchronous model, with no clocks or timeouts, no deterministic algorithm can guarantee termination if even one node can crash. Real algorithms escape it by using timeouts (assuming partial synchrony) or randomness: Raft's randomised election timeouts make repeated split votes unlikely. They stay safe at all times and make progress whenever the network behaves well enough.</p>`,
        },
        {
          type: "callout",
          tone: "modern",
          html: `<p>Since 2017 Raft has become the default choice for new systems. The biggest example is Apache Kafka, which replaced ZooKeeper with its own Raft-based controller quorum (KRaft, proposed in KIP-500). KRaft was declared production-ready in Kafka 3.3 (2022), and Kafka 4.0 (2025) removed ZooKeeper support entirely. RabbitMQ's quorum queues and many newer databases also use Raft, while Paxos variants remain inside Google's systems.</p>`,
        },
        {
          type: "quiz",
          q: "A Raft cluster has 4 nodes. How many node failures can it tolerate while still committing writes?",
          options: ["0", "1", "2", "3"],
          answer: 1,
          explain: "A majority of 4 is 3, so it can lose only 1 node, the same as a 3-node cluster. That is why consensus groups use odd sizes: the fourth node adds latency and cost but no extra fault tolerance. Five nodes tolerate two failures.",
        },
      ],
    },
    {
      id: "coordination-services",
      title: "Coordination services: consensus you can rent",
      kicker: "ZooKeeper, etcd, Consul",
      blocks: [
        {
          type: "text",
          html: `<p>Few teams should implement consensus themselves. Instead, systems lean on a small, specialised service such as ZooKeeper, etcd or Consul that runs a consensus algorithm over a few nodes and exposes simple, useful primitives. They hold small amounts of data that fit in memory (configuration, membership, who leads what) and change slowly, not your application's main dataset.</p>
<p>The features that make them useful go beyond a replicated key-value store:</p>
<ul>
<li><strong>Linearizable atomic operations:</strong> compare-and-set on a key, which is all you need to build a lock.</li>
<li><strong>Total ordering of operations:</strong> every change gets a monotonically increasing ID (<code>zxid</code> in ZooKeeper, revision in etcd), usable as a fencing token.</li>
<li><strong>Failure detection:</strong> clients hold a session or lease kept alive by heartbeats. ZooKeeper <em>ephemeral nodes</em> and etcd keys attached to a lease disappear when the client stops heartbeating, which releases its locks automatically.</li>
<li><strong>Change notifications:</strong> clients can watch a key or prefix and be told when it changes, instead of polling.</li>
</ul>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Kubernetes", title: "etcd as the source of truth", html: "All cluster state (pods, deployments, leases used for controller leader election) lives in etcd. The API server is the only component that talks to it, and controllers watch for changes." },
            { org: "Apache HBase", title: "ZooKeeper for coordination", html: "Uses ZooKeeper to track which servers are alive, elect the active master, and locate region metadata." },
            { org: "HashiCorp Consul", title: "Service discovery", html: "Uses Raft among its server nodes and offers service registration, health checks, a key-value store and DNS-based discovery." },
          ],
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p>Not every read from a coordination service is linearizable. ZooKeeper serves reads from whichever server the client is connected to, which may be slightly behind; a client that needs the latest value calls <code>sync()</code> first. etcd's reads are linearizable by default, but a client can request cheaper "serializable" reads that are served locally and may be stale. Know which kind your lock or leader check uses.</p>`,
        },
        {
          type: "text",
          html: `<p>Common uses: electing one active node among several (a primary database, a job scheduler), assigning partitions to nodes and rebalancing when nodes join or leave, and service discovery. Note that service discovery usually does <em>not</em> need linearizability: a slightly stale list of healthy backends is fine, which is why DNS, with its caching, works for it.</p>`,
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
          html: `<p>These ideas appear whenever a design needs "exactly one" of something: one leader, one owner of a username or seat, one worker per job, one transfer per request. They also appear in every CAP question. Interviewers look for precise vocabulary (linearizable versus serializable, consensus versus 2PC) and for knowing where to put the strong guarantee so the rest of the system can stay cheap.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>Good habits that signal depth:</p>
<ol>
<li>Restate CAP correctly: during a partition, choose linearizability or availability; mention PACELC for the latency trade-off in normal operation.</li>
<li>Use strong consistency only where an invariant demands it (locks, uniqueness, balances) and weaker models (causal, eventual) elsewhere.</li>
<li>Delegate leader election and locks to etcd or ZooKeeper, with leases and fencing tokens, rather than inventing a protocol.</li>
<li>Explain why consensus groups have 3 or 5 nodes (majority of 2f+1 tolerates f failures) and why 2PC blocks while consensus does not.</li>
<li>For cross-service transactions, prefer sagas or the outbox pattern; mention that Spanner-style systems run 2PC over consensus groups.</li>
</ol>`,
        },
        {
          type: "table",
          title: "Consistency models, strongest to weakest",
          headers: ["Model", "Guarantee", "Available during a partition?"],
          rows: [
            ["Strict serializability", "Serializable transactions in real-time order", "No"],
            ["Linearizability", "Single-object operations behave like one copy, in real-time order", "No"],
            ["Sequential consistency", "One order seen by all, respecting each client's own order, not real time", "No"],
            ["Causal consistency", "Causally related operations seen in causal order by everyone", "Yes"],
            ["Eventual consistency", "Replicas converge if writes stop; no ordering promise", "Yes"],
          ],
        },
        {
          type: "quiz",
          q: "An interviewer says: 'We'll use 2PC between the orders service and the payments service so an order and its payment always commit together.' What is the strongest objection?",
          options: [
            "2PC is not atomic",
            "If the coordinator fails after both services vote yes, both stay blocked holding locks, coupling the availability of two independent services; a saga or outbox is usually preferred",
            "2PC only works within a single database",
            "2PC requires a majority of services to agree",
          ],
          answer: 1,
          explain: "2PC is atomic, and XA works across systems, but it needs every participant and blocks on coordinator failure. Across independently deployed services this couples their availability and holds locks across network round trips. Sagas with compensating actions, or an outbox plus idempotent consumers, give eventual atomicity without blocking.",
        },
      ],
    },
  ],
  takeaways: [
    "<strong>Linearizability</strong> makes replicas behave like one copy with real-time ordering; it is a recency guarantee on single objects, distinct from serializability for transactions.",
    "You need it for locks, leader election, uniqueness constraints and cross-channel races; its everyday cost is latency, and during a partition it costs availability (the precise meaning of CAP).",
    "Causal consistency is the strongest model that stays available under partitions. Lamport timestamps give a cheap total order consistent with causality; vector clocks detect concurrency.",
    "Total order broadcast, linearizable compare-and-set and consensus are equivalent problems; a replicated log is all three.",
    "Two-phase commit gives atomic commit but blocks if the coordinator fails; consensus only needs a majority and keeps going.",
    "Raft, Multi-Paxos and Zab elect a leader per epoch and commit entries on a majority; 2f+1 nodes tolerate f failures, and they are always safe, live when the network behaves (escaping FLP).",
    "Don't implement consensus yourself: use etcd, ZooKeeper or Consul for leases, locks, fencing tokens and membership.",
  ],
  furtherReading: [
    { title: "In Search of an Understandable Consensus Algorithm (Ongaro and Ousterhout, 2014)", url: "https://raft.github.io/raft.pdf", note: "The Raft paper; readable and precise." },
    { title: "Linearizability: A Correctness Condition for Concurrent Objects (Herlihy and Wing, 1990)", note: "The original definition." },
    { title: "Time, Clocks, and the Ordering of Events in a Distributed System (Lamport, 1978)", note: "Happens-before and logical clocks." },
    { title: "KIP-500: Replace ZooKeeper with a Self-Managed Metadata Quorum", note: "Kafka's move from ZooKeeper to its Raft-based KRaft controller." },
  ],
};
