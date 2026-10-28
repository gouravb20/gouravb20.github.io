// System design patterns - interactive notes data.
// Original study notes. Topic outline follows Hello Interview's "Patterns" series:
// https://www.hellointerview.com/learn/system-design/patterns/realtime-updates
// Each pattern lives in chapters/<id>.js; chapterOrder lists them, and the loader sorts and numbers the chapters.
window.DATA = {
  book: {
    title: `System Design Patterns`,
    subtitle: `The recurring problems behind most system design interviews, each worked as one chapter: <strong>real-time updates</strong> (getting changes to clients the moment they happen), <strong>dealing with contention</strong> (many users fighting over the same row, seat or item), <strong>multi-step processes</strong> (workflows that span services and must survive failures), <strong>scaling reads</strong> and <strong>scaling writes</strong>. Every chapter opens on the pattern itself, then core concepts, a deep dive, labs, interview Q&amp;A and a cheatsheet. Topics follow Hello Interview's <a href="https://www.hellointerview.com/learn/system-design/patterns/realtime-updates" target="_blank" rel="noopener" style="color:var(--accent)">Patterns</a> series; the notes and labs are written independently.`,
    storageKey: `patterns_notes_v1`,
    appId: `patterns-notes`,
    exportPrefix: `patterns-progress`,
    pillarsTitle: `Four questions every pattern answers`,
    takeawaysTitle: `Things to remember`,
    labsIntro: `Each lab is a small model of one idea. The numbers come from simple, stated assumptions rather than real measurements, so read them as shapes and ratios, not benchmarks. Labs reset when you leave the tab.`,
    mono: `PT`,
    shortTitle: `Patterns`,
    tagline: `Interactive interview prep`
  },
  parts: {
    1: `Part I &middot; Real-time Updates`,
    2: `Part II &middot; Dealing with Contention`,
    3: `Part III &middot; Multi-Step Processes`,
    4: `Part IV &middot; Scaling Reads`,
    5: `Part V &middot; Scaling Writes`
  },
  fourQuestions: [
    { cls: `what`, q: `Name the pressure first`, text: `Each pattern starts from one kind of pressure: clients that need changes now, many writers on one item, work that spans services, read traffic that outgrows one database, or writes that do. Say which one the requirement creates before reaching for a tool.`, answer: `Ch 1-5: one pressure per chapter.` },
    { cls: `where`, q: `Start simple, then earn complexity`, text: `Polling before WebSockets, a database transaction before a distributed lock, a queue and retries before a workflow engine, indexes and replicas before caches, a bigger box before sharding. Move up only when a number forces it.`, answer: `The "escalation ladder" section in every chapter.` },
    { cls: `when`, q: `Know what breaks under failure`, text: `Connections drop, locks expire, steps fail halfway, caches go cold, a shard gets hot. Strong answers say what happens to the user when each piece fails and how the system recovers.`, answer: `Each chapter's deep dive and interview Q&amp;A.` },
    { cls: `how`, q: `Trade freshness, consistency and cost explicitly`, text: `Every pattern trades something: push vs pull, pessimistic vs optimistic, orchestration vs choreography, fresh vs cached, synchronous vs batched. State the trade-off you're choosing and why it fits this product.`, answer: `The trade-off tables and cheatsheets.` }
  ],
  takeaways: [
    `<strong>Real-time updates</strong> have two hops: server to client (polling, long polling, SSE, WebSockets) and inside the backend, getting the event to the server that holds the user's connection (pub/sub or consistent hashing).`,
    `Default to <strong>polling or SSE</strong> unless the client also sends frequently; WebSockets add stateful servers, sticky routing and reconnect logic.`,
    `<strong>Contention</strong> inside one database: use a transaction with row locks (pessimistic) when conflicts are common, version checks (optimistic) when they are rare.`,
    `Across databases or services, prefer <strong>reservations with expiry</strong> and sagas over two-phase commit; reach for distributed locks only with fencing tokens.`,
    `<strong>Multi-step processes</strong> fail halfway. Make every step idempotent, persist progress, and compensate instead of rolling back; a durable workflow engine (Temporal, Step Functions) earns its keep once steps wait on humans or timers.`,
    `<strong>Scaling reads</strong> follows a ladder: indexes and denormalised read models, then read replicas, then caches and a CDN. Name the staleness each step adds.`,
    `<strong>Scaling writes</strong>: shard by a key that spreads load and keeps a request on one shard, batch and buffer through a queue, and split hot keys before they melt one partition.`,
    `In every pattern, say what the user sees when something fails, and how the system recovers.`
  ],
  chapterOrder: [
    `realtime-updates`, `dealing-with-contention`, `multi-step-processes`, `scaling-reads`, `scaling-writes`
  ],
  chapters: []
};
