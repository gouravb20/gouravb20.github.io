// Deep dive: Chapter 17, CAP theorem and consistency models. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch17 = {
  hook: `<p>This chapter answers what CAP actually forces you to choose, how to make that choice per feature, and the tools that make consistency tunable: quorums, weaker consistency models and the everyday latency trade-off captured by PACELC.</p>`,
  sections: [
    {
      id: "cap-basics",
      title: "What CAP says, and why the choice is C or A",
      kicker: "The key idea",
      blocks: [
        {
          type: "keypoints",
          items: [
            "<strong>Consistency (C):</strong> linearizability: every read sees the latest acknowledged write, as if there were one copy.",
            "<strong>Availability (A):</strong> every non-crashed node answers without error, possibly with stale data.",
            "<strong>Partition tolerance (P):</strong> the system keeps operating when messages between nodes are lost.",
            "Partitions are unavoidable in networked systems, so \"CA\" isn't a real option. The question is: <strong>during a partition, does this operation answer possibly stale, or refuse?</strong>",
          ],
        },
        {
          type: "callout",
          tone: "warning",
          title: "Not the C in ACID",
          html: `<p>ACID consistency means transactions respect invariants; CAP consistency means replicas agree. A single-node database isn't subject to CAP at all. (Brewer's 2000 conjecture was proved by Gilbert and Lynch in 2002; his 2012 retrospective calls "pick two" misleading.)</p>`,
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
          type: "compare",
          items: [
            { title: "CP during a partition", tone: "info", html: "Nodes that can't confirm the latest data refuse or time out. The minority side stops serving; nobody reads a stale value." },
            { title: "AP during a partition", tone: "ok", html: "Every node answers from what it has. Reads may be stale and writes on both sides may conflict; after healing, replicas converge via last-write-wins, version vectors or application merges." },
          ],
        },
        {
          type: "lab",
          id: "capPartition",
          caption: "Toggle the partition, then try updating a profile name and booking a seat under CP and under AP. Watch which side refuses, which side serves stale data, and how last-write-wins reconciles after the partition heals.",
        },
      ],
    },
    {
      id: "choosing-and-designing",
      title: "Choosing per feature, and what each design looks like",
      kicker: "Making the call",
      blocks: [
        {
          type: "text",
          html: `<p>Ask: <strong>would it be harmful if a user briefly saw or acted on stale data?</strong> Double-selling a seat or overselling stock: consistency. An old bio or a lagging like count: availability. Most products mix both, and saying so ("seat holds are CP, the rest of the page is AP") is a senior signal.</p>`,
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
          type: "compare",
          items: [
            { title: "Designing for consistency", tone: "info", html: "A single leader or a majority consensus protocol (Raft, Paxos); leader or quorum reads; synchronous replication where losing an acknowledged write is unacceptable. etcd, ZooKeeper and Spanner work this way. Expect higher latency and a stalled minority side." },
            { title: "Designing for availability", tone: "ok", html: "Replicas serve reads (sometimes writes) independently, replicate asynchronously and feed caches and search via CDC. Cassandra is tunable and AP by default; DynamoDB reads are eventual by default (strong reads cost twice the capacity) and global tables use last-writer-wins." },
          ],
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p><strong>Shrink the consistent part.</strong> Keep the small critical state (a seat hold, an inventory counter, a username registry) in a strongly consistent store with a conditional write, and let everything else flow through caches and replicas. Ask the question during non-functional requirements; it drives storage choices and is hard to retrofit.</p>`,
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
          html: `<p>Store each value on <strong>N</strong> replicas; a write needs <strong>W</strong> acknowledgements and a read asks <strong>R</strong> replicas and takes the newest. If <strong>R + W &gt; N</strong>, every read set overlaps every write set, so a read always reaches the latest acknowledged write.</p>`,
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
          type: "keypoints",
          items: [
            "Quorums turn CAP into a dial: fewer than W reachable replicas blocks writes, fewer than R blocks reads.",
            "Overlap isn't full linearizability: concurrent writes and lagging replicas leave edge cases without read repair or careful versioning.",
            "<strong>Sloppy quorums</strong> accept writes on substitute nodes (hinted handoff later), so R + W &gt; N no longer guarantees overlap.",
          ],
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
      title: "Consistency models and PACELC",
      kicker: "The spectrum",
      blocks: [
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
          html: `<p><strong>Read-your-writes</strong> is cheap to add: route a user's reads to the leader (or a caught-up replica) for a short window after they write. <strong>PACELC</strong> (Abadi) adds the everyday trade-off: if <strong>P</strong>artition, <strong>A</strong> or <strong>C</strong>; <strong>E</strong>lse, <strong>L</strong>atency or <strong>C</strong>onsistency. A synchronous cross-region write pays at least one cross-region round trip, often 70 to 150 ms.</p>`,
        },
        {
          type: "keypoints",
          items: [
            "Cassandra and DynamoDB default to low latency and eventual consistency (PA/EL), with stronger options per request.",
            "Spanner pays latency for consistency all the time (PC/EC), using Paxos and TrueTime.",
            "MongoDB's <code>writeConcern: \"majority\"</code> and <code>readConcern</code> levels (<code>\"majority\"</code>, <code>\"linearizable\"</code>) each trade latency for stronger guarantees.",
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
          type: "callout",
          tone: "interview",
          html: `<p>Frame it as a product question during requirements ("double booking or an error?"), then commit per feature. A strong one-minute answer:</p>
<ol>
<li><strong>One line:</strong> during a network partition, a replicated system must either refuse requests or risk stale answers.</li>
<li><strong>P is given,</strong> so the choice is consistency or availability during a partition, not "pick two".</li>
<li><strong>Per feature:</strong> "Seat booking is CP: a strongly consistent store with a conditional write, failing if we can't confirm. Event pages are AP: cached and replicated."</li>
<li><strong>Beyond CAP:</strong> quorums (R + W &gt; N), read-your-writes for a user's own edits, and PACELC for the everyday latency cost.</li>
</ol>`,
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>"Our system is CA," or declaring the whole system CP or AP. Partitions will happen, and real designs mix both. (A single PostgreSQL server isn't really CP or AP: CAP applies once you add replicas.)</p>`,
        },
      ],
    },
  ],
  takeaways: [
    "During a partition, a replicated system must refuse some requests (consistency) or answer possibly stale (availability); \"CA\" isn't an option.",
    "CAP's consistency is linearizability, unrelated to the C in ACID.",
    "Decide per feature: bookings, inventory, payments and unique names choose consistency; profiles, feeds and descriptions choose availability. Keep the consistent part small.",
    "Quorums with R + W &gt; N make consistency tunable in Dynamo-style stores.",
    "Causal and read-your-writes fix visible anomalies cheaply; PACELC adds that stronger consistency costs latency even without partitions.",
  ],
  furtherReading: [
    { title: "Brewer's Conjecture and the Feasibility of Consistent, Available, Partition-Tolerant Web Services (Gilbert and Lynch, 2002)", note: "The formal proof of CAP." },
    { title: "CAP Twelve Years Later: How the \"Rules\" Have Changed (Brewer, IEEE Computer, 2012)", note: "Why \"pick two\" is misleading and how real systems manage partitions." },
    { title: "Consistency Tradeoffs in Modern Distributed Database System Design (Abadi, IEEE Computer, 2012)", note: "The PACELC formulation." },
    { title: "Dynamo: Amazon's Highly Available Key-value Store (2007)", url: "https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf", note: "Quorums, sloppy quorums and conflict resolution in an AP store." },
  ],
};
