// Main tab: Chapter 17, CAP theorem and consistency models. Format: DeepSection[] in public/shared/notes.d.ts.
window.MAIN = window.MAIN || {};
MAIN.ch17 = [
  {
    id: "the-real-question",
    title: "CAP comes down to one question",
    kicker: "Mental model",
    blocks: [
      {
        type: "text",
        html: `<p>The CAP theorem says that a system whose data is copied across machines cannot promise all three of these at once: <strong>consistency</strong> (every read sees the most recent write), <strong>availability</strong> (every request to a working node gets a real answer) and <strong>partition tolerance</strong> (the system keeps running when the network between nodes breaks).</p><p>The "pick two" framing is misleading, because partitions are not something you get to opt out of. Cables get cut, switches fail and cloud regions lose contact. Any distributed system must tolerate them. So the theorem really asks one practical question: <strong>while the network is split, do you answer with data that might be stale, or do you refuse to answer?</strong> Refusing keeps you consistent; answering keeps you available.</p>`,
      },
      {
        type: "steps",
        title: "Worked example: two regions lose contact",
        items: [
          "A user profile service runs in the US and the EU, replicating writes between them.",
          "The link between regions fails. A user in the US changes their display name.",
          "A friend in the EU loads that profile. The EU replica has not received the change and cannot check.",
          "Choose consistency and the EU returns an error or times out until the link heals. Choose availability and the EU shows the old name, catching up once the link returns.",
          "For a profile name, the stale answer is clearly better. For the last seat on a flight, selling it twice is clearly worse than an error.",
        ],
      },
      {
        type: "callout",
        tone: "warning",
        title: "Not the C in ACID",
        html: `<p>CAP consistency means every replica returns the latest write, as if there were only one copy. ACID consistency means a transaction never breaks the database's rules and invariants. They are different ideas that share a word, and a single-node database is not subject to CAP at all.</p>`,
      },
    ],
  },
  {
    id: "choosing",
    title: "Choosing per feature",
    kicker: "Making the call",
    blocks: [
      {
        type: "text",
        html: `<p>Ask: would it cause real harm if a user briefly saw out-of-date data? If yes, favour consistency. If no, favour availability. The senior move is to notice that one product usually needs both. A ticketing site must never sell the same seat twice, but the event description page can safely be a few seconds old. A marketplace needs exact inventory at checkout but not for product reviews.</p>`,
      },
      {
        type: "table",
        headers: ["Feature", "Favour", "Because"],
        rows: [
          ["Seat booking, inventory at checkout", "Consistency", "Acting on stale data means double booking or overselling"],
          ["Payments, account balances", "Consistency", "Money must be exact"],
          ["Profiles, posts, like counts", "Availability", "A few seconds stale is harmless"],
          ["Feeds, reviews, recommendations", "Availability", "An old result beats an error page"],
        ],
      },
      {
        type: "compare",
        title: "What each choice looks like in the design",
        items: [
          { title: "Designing for consistency", tone: "info", html: "Critical data lives behind a single primary or a consensus-replicated store; reads go to the leader or use quorums; replication is synchronous where losing an acknowledged write is unacceptable. Expect higher latency and refusals during failures." },
          { title: "Designing for availability", tone: "ok", html: "Replicas serve reads independently and replicate asynchronously; caches and search are fed by change data capture; conflicts are settled by rules such as last-write-wins. Expect stale reads." },
        ],
      },
    ],
  },
  {
    id: "spectrum",
    title: "Between the extremes: quorums and consistency models",
    kicker: "The spectrum",
    blocks: [
      {
        type: "text",
        html: `<p>Consistency is not just on or off. In Dynamo-style stores you can tune it with <strong>quorums</strong>. With N copies of each item, a write waits for W of them to confirm and a read asks R of them. If R + W &gt; N, every set of replicas you read from overlaps the set that took the latest write, so the read can find it. With N = 3, choosing W = 2 and R = 2 gives that overlap while tolerating one replica being down; W = 1 and R = 1 is faster but may return stale data.</p>`,
      },
      {
        type: "table",
        title: "Models worth naming, strongest first",
        headers: ["Model", "What it promises", "Good fit"],
        rows: [
          ["Strong (linearizable)", "Every read sees the latest completed write", "Balances, seat locks"],
          ["Causal", "Things that depend on each other appear in order for everyone", "Comments and their replies"],
          ["Read-your-own-writes", "You always see your own changes immediately", "Editing your own profile or post"],
          ["Eventual", "Replicas agree once writes stop; no promise in between", "Like counts, view counts, DNS"],
        ],
      },
      {
        type: "callout",
        tone: "insight",
        title: "PACELC: the trade-off you face every day",
        html: `<p>Partitions are rare, but the cost of consistency is not. PACELC extends CAP: during a <strong>P</strong>artition choose <strong>A</strong> or <strong>C</strong>; <strong>E</strong>lse choose <strong>L</strong>atency or <strong>C</strong>onsistency. Waiting for replicas to confirm makes every request slower even when nothing is broken.</p>`,
      },
    ],
  },
  {
    id: "interview-angle",
    title: "Using CAP in an interview",
    kicker: "When and how",
    blocks: [
      {
        type: "text",
        html: `<p>Raise it early, while listing non-functional requirements, because the answer shapes the database and replication choices that follow. Phrase it as a requirement, not a lecture: "booking needs strong consistency; browsing can be eventually consistent." Then let it drive the design: a strongly consistent store with conditional writes for seats, and caches and replicas for the read-heavy pages.</p>`,
      },
      {
        type: "list",
        title: "Common mistakes",
        items: [
          `Saying "I'll choose CA." A distributed system cannot skip partition tolerance; the choice is consistency or availability during a partition.`,
          "Making one global choice for the whole product instead of deciding per feature.",
          "Confusing CAP consistency with ACID consistency.",
          "Forgetting read-your-own-writes, so a user edits their profile and immediately sees the old version from a lagging replica.",
        ],
      },
    ],
  },
];
