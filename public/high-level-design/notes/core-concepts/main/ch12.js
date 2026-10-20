// Main tab: Chapter 12, Caching. Format: DeepSection[] in public/shared/notes.d.ts.
window.MAIN = window.MAIN || {};
MAIN.ch12 = [
  {
    id: "why-cache",
    title: "What a cache buys you, and what it costs",
    kicker: "Mental model",
    blocks: [
      {
        type: "text",
        html: `<p>A cache is a small, fast copy of data whose real home is somewhere slower. Reading a value from Redis takes well under a millisecond; the same value from a database query might take 20 to 50 milliseconds once you count parsing, index lookups and disk. More importantly, every read the cache answers is a read the database never sees, so the cache protects the database's CPU and connections as much as it cuts latency.</p><p>Caches work because real traffic is lopsided. A small slice of keys (today's popular posts, active users' profiles) gets most of the reads, so a cache holding a few percent of the data can answer the large majority of requests. The number to watch is the <strong>hit ratio</strong>. The database only sees misses, so moving from a 90% to a 99% hit ratio cuts database reads by a factor of ten.</p>`,
      },
      {
        type: "tradeoffs",
        prosLabel: "You gain",
        consLabel: "You take on",
        pros: [
          "Lower read latency for hot data.",
          "Far less read load on the database, often the cheapest way to scale reads.",
          "Somewhere to keep expensive computed results such as a ranked feed.",
        ],
        cons: [
          "Stale reads: the copy can lag the source of truth.",
          "Invalidation logic that must run on every write path.",
          "A new dependency whose failure can flood the database.",
        ],
      },
      {
        type: "callout",
        tone: "mistake",
        html: `<p>Do not add a cache by reflex. If the query is already a fast indexed lookup and the database is nowhere near its limits, a cache adds failure modes and buys little. Justify it with a number: the read rate, the query cost, or a latency target the database cannot meet.</p>`,
      },
    ],
  },
  {
    id: "where-to-cache",
    title: "Where the cache sits",
    kicker: "Layers",
    blocks: [
      {
        type: "text",
        html: `<p>A request can be answered at several points on its way to the database. The further out it is answered, the faster it is and the less control you have over freshness. In a typical interview design, the <strong>external cache</strong> is the default and the others are additions you justify by the problem.</p>`,
      },
      {
        type: "table",
        headers: ["Layer", "Answers in", "Shared across servers?", "Use it for"],
        rows: [
          ["Client (browser, app)", "No request at all", "No, one per user", "Static assets, offline data, rarely changing settings"],
          ["CDN edge", "Tens of ms, near the user", "Per region", "Images, video, JS and CSS, public cacheable responses"],
          ["In-process memory", "Well under a microsecond", "No, one per server", "Config, feature flags, tiny reference data, extremely hot keys"],
          ["External cache (Redis, Memcached)", "About 1 ms", "Yes", "The default: profiles, sessions, query and feed results"],
        ],
      },
      {
        type: "keypoints",
        items: [
          "Bring in a <strong>CDN</strong> as soon as the system serves media to users spread across regions.",
          "Use an <strong>in-process cache</strong> as a layer on top of Redis, not instead of it: each server's copy is invalidated separately, so keep TTLs short.",
          "Remember that each layer is another place stale data can hide. Fewer layers are easier to reason about.",
        ],
      },
    ],
  },
  {
    id: "read-write-patterns",
    title: "How reads and writes flow through the cache",
    kicker: "Patterns",
    blocks: [
      {
        type: "text",
        html: `<p><strong>Cache-aside</strong> (also called lazy loading) is the pattern to reach for first. The application owns the logic: on a read it checks the cache; on a miss it queries the database, stores the result with a TTL, and returns it. On a write it updates the database and then deletes the cache key, so the next reader loads a fresh copy. Only data someone actually asked for gets cached, and if the cache disappears the system still works, just more slowly.</p><p>The alternatives move the work around. <strong>Write-through</strong> writes the cache and the database together before acknowledging, so reads are always warm and fresh, but every write pays both latencies and the cache fills with data nobody reads. <strong>Write-behind</strong> acknowledges once the cache has the write and flushes to the database later in batches, which is very fast and very risky: anything not yet flushed is lost if the cache node dies. <strong>Read-through</strong> puts the cache in front of the database as a proxy that loads misses itself; a CDN is the everyday example.</p>`,
      },
      {
        type: "compare",
        items: [
          { title: "Cache-aside", tone: "ok", html: "Default choice. Simple, resilient to cache outages. Costs one slow read per miss and a short staleness window." },
          { title: "Write-through", tone: "info", html: "Fresh reads, slower writes, cold data cached. Needs a cache layer or library that supports it." },
          { title: "Write-behind", tone: "warn", html: "Fastest writes. Acceptable for counters, metrics and analytics; never for payments or orders." },
          { title: "Read-through", tone: "info", html: "Loading logic lives in the cache. Common with CDNs, uncommon with Redis." },
        ],
      },
    ],
  },
  {
    id: "interview-recipe",
    title: "Adding a cache in an interview",
    kicker: "Decision checklist",
    blocks: [
      {
        type: "text",
        html: `<p>The right time to raise caching is when you hit a read bottleneck during the deep dives: a read-heavy endpoint, an expensive query, or a latency requirement. Interviewers listen for a complete thought, not just the word Redis. Work through the same short checklist each time.</p>`,
      },
      {
        type: "steps",
        items: [
          "<strong>State the bottleneck with a number.</strong> For example: 40,000 profile reads per second at 25 ms each is more than one database should carry.",
          "<strong>Say what you cache and under what key.</strong> For example: user profiles under <code>user:{id}:profile</code>.",
          "<strong>Pick the pattern.</strong> Cache-aside unless there is a reason not to.",
          "<strong>Choose a TTL and eviction policy.</strong> For example: ten minutes, with LRU eviction to bound memory.",
          "<strong>Explain invalidation.</strong> On profile update, write the database, then delete the key.",
          "<strong>Name one failure mode and its fix.</strong> A stampede on a hot key, or the cache going down and the database needing protection.",
        ],
      },
      {
        type: "callout",
        tone: "interview",
        title: "A one-breath version",
        html: `<p>"Profiles are read about a hundred times for every update, so I'll put them in Redis with cache-aside, a ten-minute TTL and LRU eviction, delete the key on every update, and use request coalescing so a hot profile expiring doesn't stampede the database."</p>`,
      },
    ],
  },
];
