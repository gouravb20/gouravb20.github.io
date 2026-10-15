// Deep dive: Chapter 17, CAP theorem and consistency models. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch17 = {
  hook: `<p>A concert-ticket site runs in two data centres, one in Virginia and one in Frankfurt, each with copies of the seat map. At 10:00 the big show goes on sale. At 10:02 a fibre cut leaves both data centres running but unable to talk to each other. A fan in Berlin clicks seat F14 and the Frankfurt servers have to decide something right now: sell it, or say "try again later"?</p>
<p>If Frankfurt sells it, a fan in Boston may buy the same seat from Virginia a second later, and two people show up for one chair. If Frankfurt refuses, the site is down for every European fan until the link comes back. There is no third option that gives both. That forced choice, during a network split, is what the CAP theorem is about, and deciding it per feature early in an interview is one of the clearest signals of design maturity.</p>`,
  sections: [
    {
      id: "three-properties",
      title: "What C, A and P actually mean",
      kicker: "The definitions",
      blocks: [
        {
          type: "text",
          html: `<p>CAP is about a system that keeps copies of the same data on several machines and serves reads and writes from them. It names three properties:</p>
<ul>
<li><strong>Consistency (C):</strong> every read returns the most recent completed write, as if there were only one copy. Formally this is <em>linearizability</em>: once a write is acknowledged, no reader anywhere can see the old value.</li>
<li><strong>Availability (A):</strong> every request to a node that has not crashed gets a non-error response, without a guarantee that it reflects the latest write.</li>
<li><strong>Partition tolerance (P):</strong> the system keeps operating even when the network drops or delays messages between nodes, splitting them into groups that cannot communicate.</li>
</ul>
<p>The theorem says you cannot guarantee all three at once. While the network is split, a node that receives a request either answers with what it has (possibly stale, so not C) or refuses until it can confirm it is up to date (an error, so not A).</p>`,
        },
        {
          type: "callout",
          tone: "warning",
          title: "Not the C in ACID",
          html: `<p>CAP's consistency is about replicas agreeing on the latest value. ACID's consistency is about a transaction moving the database from one valid state to another, respecting constraints and invariants such as "balance never negative". They are unrelated ideas that share a word. A single-node ACID database is not subject to CAP at all, because there is no second copy to disagree with.</p>`,
        },
        {
          type: "callout",
          tone: "history",
          html: `<p>Eric Brewer presented the idea as a conjecture in a keynote at the PODC conference in 2000. Seth Gilbert and Nancy Lynch published a formal proof in 2002. In 2012 Brewer wrote a retrospective, "CAP Twelve Years Later", arguing that the "pick two of three" slogan is misleading, because the choice only bites during a partition and can be made differently for different operations.</p>`,
        },
        {
          type: "keypoints",
          items: [
            "C means linearizability: every read sees the latest acknowledged write.",
            "A means every non-crashed node answers, possibly with stale data.",
            "P means the system survives lost messages between nodes.",
          ],
        },
      ],
    },
    {
      id: "partitions-force-a-choice",
      title: "Partitions happen, so the real choice is C or A",
      kicker: "The key idea",
      blocks: [
        {
          type: "idea",
          html: `<p>In any system spread over a network, partitions are not optional: links fail, switches reboot, cloud regions lose connectivity, long GC pauses make a node look dead. So "CA" is not a real design for a distributed system. The useful question is narrower: <strong>during a partition, does this operation return possibly stale data, or does it refuse?</strong></p>`,
        },
        {
          type: "diagram",
          title: "A partition between the US and EU data centres",
          caption: "Five replicas: three in the US, two in the EU. When the link breaks, the US side still has a majority. The EU side must choose between refusing requests (CP) and answering from its possibly stale copies (AP).",
          svg: `<svg viewBox="0 0 620 260" role="img" aria-label="Two data centres separated by a network partition, with a majority of replicas in the US">
<rect x="20" y="40" width="230" height="130" rx="10" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="135" y="64" text-anchor="middle" font-size="13" font-weight="700">US data centre</text>
<circle cx="75" cy="115" r="22" style="fill: var(--dg-panel); stroke: var(--dg-1)" stroke-width="2"/>
<text x="75" y="120" text-anchor="middle" font-size="12" font-weight="700">R1</text>
<circle cx="135" cy="115" r="22" style="fill: var(--dg-panel); stroke: var(--dg-1)" stroke-width="2"/>
<text x="135" y="120" text-anchor="middle" font-size="12" font-weight="700">R2</text>
<circle cx="195" cy="115" r="22" style="fill: var(--dg-panel); stroke: var(--dg-1)" stroke-width="2"/>
<text x="195" y="120" text-anchor="middle" font-size="12" font-weight="700">R3</text>
<rect x="370" y="40" width="230" height="130" rx="10" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="485" y="64" text-anchor="middle" font-size="13" font-weight="700">EU data centre</text>
<circle cx="450" cy="115" r="22" style="fill: var(--dg-panel); stroke: var(--dg-2)" stroke-width="2"/>
<text x="450" y="120" text-anchor="middle" font-size="12" font-weight="700">R4</text>
<circle cx="520" cy="115" r="22" style="fill: var(--dg-panel); stroke: var(--dg-2)" stroke-width="2"/>
<text x="520" y="120" text-anchor="middle" font-size="12" font-weight="700">R5</text>
<line x1="250" y1="115" x2="370" y2="115" stroke-width="2" stroke-dasharray="6 5" style="stroke: var(--dg-bad)"/>
<line x1="300" y1="100" x2="320" y2="130" stroke-width="3" style="stroke: var(--dg-bad)"/>
<line x1="320" y1="100" x2="300" y2="130" stroke-width="3" style="stroke: var(--dg-bad)"/>
<text x="310" y="90" text-anchor="middle" font-size="12" font-weight="700" style="fill: var(--dg-bad)">partition</text>
<text x="135" y="198" text-anchor="middle" font-size="12" font-weight="700">Majority side (3 of 5)</text>
<text x="135" y="216" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">can keep accepting writes</text>
<text x="485" y="198" text-anchor="middle" font-size="12" font-weight="700">Minority side (2 of 5)</text>
<text x="485" y="216" text-anchor="middle" font-size="12">CP: refuse or time out</text>
<text x="485" y="234" text-anchor="middle" font-size="12">AP: answer, maybe stale</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p><strong>Choosing consistency (CP)</strong> means a node that cannot confirm it has the latest data refuses or times out. In the diagram, the EU replicas cannot reach a majority, so they stop serving reads and writes that need fresh data; the US side, holding three of five replicas, keeps working. No one ever reads a stale value, but EU users see errors.</p>
<p><strong>Choosing availability (AP)</strong> means every node keeps answering from what it has. EU users can read and even write, but they may see old values, and writes on both sides can conflict. When the partition heals, replicas exchange updates and converge, resolving conflicts with a rule such as <em>last write wins</em> (by timestamp), version vectors, or merge logic in the application.</p>
<p>Notice that the choice only matters <em>while</em> a partition is happening. When the network is healthy, a well-built system can be both consistent and available. That is why the trade-off you face most of the time is a different one: latency (covered under PACELC below).</p>`,
        },
        {
          type: "lab",
          id: "capPartition",
          caption: "Toggle the partition, then try updating a profile name and booking a seat under CP and under AP. Watch which side refuses, which side serves stale data, and how last-write-wins reconciles after the partition heals.",
        },
        {
          type: "quiz",
          q: "During a partition, an AP system lets users on both sides update the same profile's display name. What happens when the partition heals?",
          options: [
            "Both updates are rejected",
            "Replicas exchange updates and resolve the conflict with a rule such as last-write-wins, so one of the two names is kept",
            "The system crashes until an operator intervenes",
            "Both names are always kept side by side",
          ],
          answer: 1,
          explain: "AP systems accept writes on both sides and reconcile later. With last-write-wins, the update with the later timestamp survives and the other is silently discarded, which is fine for a display name but unacceptable for a seat booking. Some systems keep both versions and let the application merge them, but that has to be designed in.",
        },
      ],
    },
    {
      id: "choosing-per-feature",
      title: "Choosing per feature, not per system",
      kicker: "Making the call",
      blocks: [
        {
          type: "text",
          html: `<p>The question that decides it is simple: <strong>would it be harmful if a user briefly saw or acted on stale data?</strong> If two people buying the same seat, overselling the last unit of stock, or trading on an old price would be a real problem, choose consistency for that operation. If the worst case is someone seeing an old bio or a like count that is a few seconds behind, choose availability.</p>
<p>Most products need both, for different data. A ticketing site books seats with strong consistency but serves the event description, images and venue map from caches and replicas that favour availability. A marketplace takes payments consistently but shows reviews and recommendations with eventual consistency. Saying this explicitly ("seat holds are CP, everything else on the page is AP") is a senior-level signal in an interview.</p>`,
        },
        {
          type: "table",
          title: "Typical choices",
          headers: ["Feature", "During a partition", "Why"],
          rows: [
            ["Seat or ticket booking", "Consistency", "Never sell one seat twice"],
            ["Inventory at checkout", "Consistency", "No overselling the last item"],
            ["Payments, balances, order books", "Consistency", "Money and prices must be exact"],
            ["Usernames and unique handles", "Consistency", "Two people must not claim the same name"],
            ["Profiles, posts, likes", "Availability", "A few seconds stale is fine"],
            ["Product and event descriptions", "Availability", "Old text beats an error page"],
            ["Feeds, reviews, recommendations", "Availability", "Freshness is nice to have"],
          ],
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>Ask the consistency question during non-functional requirements, before drawing any boxes. It decides the database and replication choices that follow, and it is much harder to retrofit.</p>`,
        },
        {
          type: "quiz",
          q: "A food-delivery app has three features: restaurant menus, the live order-status page, and charging the customer's card. Which should be designed to choose consistency over availability during a partition?",
          options: [
            "All three",
            "Only charging the card",
            "Only the restaurant menus",
            "None; availability is always better for users",
          ],
          answer: 1,
          explain: "Charging must never double-charge or lose a payment, so it should refuse rather than act on uncertain state. A menu that is a few minutes old is harmless, and an order-status page that lags by a few seconds is better than an error. Mixed choices within one product are normal.",
        },
      ],
    },
    {
      id: "designing-for-each",
      title: "What CP and AP designs look like",
      kicker: "Building it",
      blocks: [
        {
          type: "compare",
          items: [
            { title: "Designing for consistency", tone: "info", html: "Send all writes for the critical data through a single leader, or through a consensus protocol (Raft, Paxos) that needs a majority to commit. Read from the leader or use quorum reads. Replicate synchronously where losing an acknowledged write is unacceptable. Expect higher latency, and expect the minority side of a partition to stop serving." },
            { title: "Designing for availability", tone: "ok", html: "Let replicas serve reads (and sometimes writes) independently. Replicate asynchronously, possibly across regions with writes accepted in each. Propagate changes to caches and search indexes with change data capture. Expect stale reads, and decide how conflicting writes are merged." },
          ],
        },
        {
          type: "realworld",
          items: [
            { org: "etcd and ZooKeeper", title: "CP coordination stores", html: "Both replicate through a majority-based consensus protocol (Raft for etcd, Zab for ZooKeeper). A node cut off from the majority cannot commit writes, which is exactly what you want for locks, leader election and cluster configuration." },
            { org: "Google Spanner", title: "Consistency across regions", html: "Spanner replicates with Paxos and uses its TrueTime clock API to give externally consistent transactions, waiting out clock uncertainty at commit. It pays latency for consistency, and replicas that lose their Paxos majority cannot accept writes." },
            { org: "Apache Cassandra", title: "Tunable, AP by default", html: "Each request picks a consistency level such as <code>ONE</code>, <code>QUORUM</code>, <code>LOCAL_QUORUM</code> or <code>ALL</code>. Lower levels keep answering when replicas are unreachable; higher levels refuse when they cannot gather enough replicas." },
            { org: "Amazon DynamoDB", title: "Both options per read", html: "Reads are eventually consistent by default; a strongly consistent read costs twice the read capacity. Global tables replicate across regions asynchronously and resolve concurrent writes with last-writer-wins." },
          ],
        },
        {
          type: "text",
          html: `<p>A pattern that shows up again and again is to <strong>shrink the consistent part</strong>. Keep the small, critical piece of state (a seat hold, an inventory counter, a username registry) in a strongly consistent store with a conditional write, and let everything else flow through caches, replicas and search indexes that favour availability. The expensive guarantees are paid only where they matter.</p>`,
        },
        {
          type: "tradeoffs",
          prosLabel: "Strong consistency gives",
          consLabel: "Strong consistency costs",
          pros: [
            "No stale reads, no conflicting writes to merge",
            "Simple reasoning for invariants such as \"one seat, one buyer\"",
            "Correctness without compensating logic in the application",
          ],
          cons: [
            "Higher latency: writes wait for a majority or a leader, often across zones or regions",
            "Unavailability on the minority side of a partition, or when the leader is lost",
            "Lower throughput on contended keys",
          ],
        },
      ],
    },
    {
      id: "quorums",
      title: "Quorums: tuning consistency with N, W and R",
      kicker: "Tunable consistency",
      blocks: [
        {
          type: "idea",
          html: `<p>Store each value on <strong>N</strong> replicas. A write succeeds once <strong>W</strong> replicas acknowledge it; a read asks <strong>R</strong> replicas and returns the newest version among their answers. If <strong>R + W &gt; N</strong>, every read set overlaps every write set in at least one replica, so a read always reaches someone who has the latest acknowledged write.</p>`,
        },
        {
          type: "diagram",
          title: "Why R + W > N guarantees overlap",
          caption: "With N = 3, the write was acknowledged by A and B (W = 2). Any read of two replicas (R = 2) must include A or B. Here it reads B and C, sees versions v2 and v1, and returns v2.",
          svg: `<svg viewBox="0 0 640 240" role="img" aria-label="Three replicas with a write quorum of two and a read quorum of two overlapping on one replica">
<path d="M150 82 L150 72 L330 72 L330 82" fill="none" stroke-width="2.5" style="stroke: var(--dg-1)"/>
<text x="240" y="60" text-anchor="middle" font-size="12" font-weight="700" style="fill: var(--dg-1)">write acknowledged by W = 2</text>
<circle cx="180" cy="122" r="30" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="180" y="118" text-anchor="middle" font-size="13" font-weight="700">A</text>
<text x="180" y="136" text-anchor="middle" font-size="12">v2</text>
<circle cx="300" cy="122" r="30" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="3"/>
<text x="300" y="118" text-anchor="middle" font-size="13" font-weight="700">B</text>
<text x="300" y="136" text-anchor="middle" font-size="12">v2</text>
<circle cx="420" cy="122" r="30" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="420" y="118" text-anchor="middle" font-size="13" font-weight="700">C</text>
<text x="420" y="136" text-anchor="middle" font-size="12">v1</text>
<text x="462" y="126" font-size="12" style="fill: var(--dg-muted)">lagging, not yet updated</text>
<path d="M270 162 L270 172 L450 172 L450 162" fill="none" stroke-width="2.5" style="stroke: var(--dg-2)"/>
<text x="360" y="192" text-anchor="middle" font-size="12" font-weight="700" style="fill: var(--dg-2)">read asks R = 2</text>
<text x="320" y="226" text-anchor="middle" font-size="12">R + W = 4 &gt; N = 3: every read set includes a replica holding v2.</text>
</svg>`,
        },
        {
          type: "table",
          title: "Common settings with N = 3",
          headers: ["W", "R", "R + W > N?", "Behaviour"],
          rows: [
            ["2", "2", "Yes", "Balanced: reads see the latest write, and one replica can be down for both reads and writes"],
            ["3", "1", "Yes", "Fast reads, but any one replica down blocks writes"],
            ["1", "3", "Yes", "Fast writes, but any one replica down blocks reads"],
            ["1", "1", "No", "Fastest and most available, but reads can be stale"],
          ],
        },
        {
          type: "lab",
          id: "quorum",
          caption: "Adjust N, W and R, then read shortly after a write. See when reads return stale versions, and take replicas down to watch reads or writes start failing when a quorum cannot be reached.",
        },
        {
          type: "text",
          html: `<p>Quorums make the CAP trade-off a dial rather than a switch. A partition that leaves fewer than W replicas reachable blocks writes; fewer than R blocks reads. Lowering W and R keeps the system answering through more failures at the cost of possibly stale reads.</p>
<p>Two caveats keep the rule honest. Overlap alone is not full linearizability: with concurrent writes and replicas catching up at different speeds, edge cases remain unless the system also does things like read repair or coordinates versions carefully. And some Dynamo-style systems use <em>sloppy quorums</em>, accepting writes on substitute nodes during failures (with hinted handoff later), which improves availability but means R + W &gt; N no longer guarantees the overlap.</p>`,
        },
        {
          type: "quiz",
          q: "A Dynamo-style store uses N = 3, W = 1, R = 1 for speed. Users sometimes see their own just-saved settings revert after a refresh. Which change most directly fixes it while still tolerating one replica failure?",
          options: ["N = 3, W = 2, R = 2", "N = 3, W = 3, R = 3", "N = 5, W = 1, R = 1", "N = 1, W = 1, R = 1"],
          answer: 0,
          explain: "With W = 1 and R = 1, a read can hit a replica the write has not reached yet. W = 2, R = 2 gives R + W > N, so reads overlap the latest write, and with three replicas either operation still succeeds if one is down. W = 3, R = 3 is consistent but any single failure blocks everything.",
        },
      ],
    },
    {
      id: "consistency-spectrum",
      title: "Beyond the binary: consistency models and PACELC",
      kicker: "The spectrum",
      blocks: [
        {
          type: "text",
          html: `<p>"Consistent or not" is too coarse for real designs. Between strong consistency and "anything goes" sit models that remove the most confusing anomalies at a fraction of the cost.</p>
<ul>
<li><strong>Strong (linearizable):</strong> every read reflects the latest completed write, as if there were one copy. Needed for balances, seat holds and locks. The most expensive.</li>
<li><strong>Causal:</strong> operations that depend on each other are seen in the same order by everyone. A reply never appears before the comment it answers; unrelated posts may appear in different orders for different users.</li>
<li><strong>Read-your-own-writes:</strong> a user always sees their own changes immediately, even if others see them later. Implement it by routing that user's reads to the leader (or to a replica known to be caught up past their last write) for a short window after they write.</li>
<li><strong>Eventual:</strong> if writes stop, replicas converge. Nothing is promised about what a read sees in the meantime. The default for many distributed databases, DNS and caches.</li>
</ul>`,
        },
        {
          type: "table",
          title: "Matching models to features",
          headers: ["Model", "Guarantee", "Example use"],
          rows: [
            ["Strong", "Reads see the latest write", "Bank balance, seat lock, username claim"],
            ["Causal", "Dependent events in order for everyone", "Comments and replies, chat threads"],
            ["Read-your-writes", "You see your own updates at once", "Editing your profile, posting a photo"],
            ["Eventual", "Replicas converge eventually", "Like counts, view counts, DNS"],
          ],
        },
        {
          type: "text",
          html: `<h3>PACELC: the trade-off you face every day</h3>
<p>CAP only talks about partitions, which are rare. Daniel Abadi's PACELC formulation extends it: if there is a <strong>P</strong>artition, choose <strong>A</strong> or <strong>C</strong>; <strong>E</strong>lse, in normal operation, choose <strong>L</strong>atency or <strong>C</strong>onsistency. Waiting for a majority of replicas, possibly in other zones or regions, makes every request slower even when nothing is broken. A synchronous cross-region write pays at least one cross-region round trip, often 70 to 150 ms.</p>
<p>Systems sit at different points. Cassandra and DynamoDB default to low latency and eventual consistency (PA/EL), with stronger options per request. Spanner pays latency for consistency all the time (PC/EC). Naming the "else" half shows you understand why strong consistency is not free even on a good day.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "MongoDB", title: "Write and read concerns", html: "A write with <code>writeConcern: \"majority\"</code> is acknowledged only after a majority of replica-set members have it, and <code>readConcern</code> levels such as <code>\"majority\"</code> and <code>\"linearizable\"</code> control what reads may return. Each step up costs latency." },
          ],
        },
        {
          type: "quiz",
          q: "A user edits their bio and immediately reloads their profile, which is read from an asynchronous replica. Sometimes they see the old bio and think the save failed. Which guarantee fixes this with the least cost?",
          options: [
            "Strong consistency for all reads by all users",
            "Read-your-own-writes: route this user's profile reads to the leader for a short time after they write",
            "Causal consistency for the whole database",
            "Turn off replication",
          ],
          answer: 1,
          explain: "Only the writer cares about seeing the change instantly; other viewers tolerate a few seconds of lag. Read-your-writes targets exactly that, without making every read in the system pay for strong consistency.",
        },
      ],
    },
    {
      id: "interview",
      title: "Using CAP in a design interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "text",
          html: `<p>Bring consistency up while gathering non-functional requirements, and frame it as a question about the product rather than a recital of the theorem: "if two users try to book the same seat during a network problem, should one of them get an error, or could we risk a double booking?" Then commit per feature, and let the answer drive the storage choice.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>A strong one-minute answer:</p>
<ol>
<li><strong>The theorem in one line:</strong> during a network partition, a replicated system must either refuse requests or risk stale answers.</li>
<li><strong>P is given:</strong> so the choice is consistency or availability during a partition, not "pick two".</li>
<li><strong>Per feature:</strong> "Seat booking is CP: a strongly consistent store with a conditional write, and we fail the booking if we cannot confirm. Event pages are AP: cached and replicated, a little stale is fine."</li>
<li><strong>Beyond CAP:</strong> quorums (R + W &gt; N) as a tuning knob, read-your-writes for the user's own edits, and PACELC for the everyday latency cost.</li>
</ol>`,
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>"Our system is CA." For anything with more than one machine, partitions will happen, so this signals a misunderstanding. Also avoid declaring the whole system CP or AP; real designs mix both.</p>`,
        },
        {
          type: "quiz",
          q: "An interviewer asks: \"Is a single PostgreSQL server CP or AP?\" What is the best answer?",
          options: [
            "CP, because it is ACID",
            "AP, because it is always up",
            "CAP does not really apply: with one copy there is nothing to partition between replicas. It becomes relevant once you add replicas, depending on whether reads go to async replicas or only the primary",
            "CA, which is the best of both",
          ],
          answer: 2,
          explain: "CAP is about replicated data. A single node is consistent trivially and unavailable when it is down. Once you add replicas, the question appears: reading from asynchronous replicas trades consistency for availability and load, while reading only from the primary (or using synchronous replication) favours consistency.",
        },
      ],
    },
  ],
  takeaways: [
    "CAP: during a network partition, a replicated system must either refuse some requests (consistency) or answer with possibly stale data (availability).",
    "Partitions are unavoidable in distributed systems, so \"CA\" is not an option; the real question is C or A during a partition.",
    "CAP's consistency is linearizability, unrelated to the C in ACID.",
    "Decide per feature: bookings, inventory, payments and unique names choose consistency; profiles, feeds and descriptions choose availability.",
    "Quorums with R + W &gt; N make consistency tunable in Dynamo-style stores; fewer reachable replicas than W or R blocks writes or reads.",
    "Between strong and eventual sit causal and read-your-own-writes consistency, which fix the most visible anomalies cheaply.",
    "PACELC adds the everyday trade-off: even without partitions, stronger consistency costs latency.",
  ],
  furtherReading: [
    { title: "Brewer's Conjecture and the Feasibility of Consistent, Available, Partition-Tolerant Web Services (Gilbert and Lynch, 2002)", note: "The formal proof of CAP." },
    { title: "CAP Twelve Years Later: How the \"Rules\" Have Changed (Brewer, IEEE Computer, 2012)", note: "Why \"pick two\" is misleading and how real systems manage partitions." },
    { title: "Consistency Tradeoffs in Modern Distributed Database System Design (Abadi, IEEE Computer, 2012)", note: "The PACELC formulation." },
    { title: "Dynamo: Amazon's Highly Available Key-value Store (2007)", url: "https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf", note: "Quorums, sloppy quorums and conflict resolution in an AP store." },
  ],
};
