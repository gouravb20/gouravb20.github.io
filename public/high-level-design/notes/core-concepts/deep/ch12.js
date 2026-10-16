// Deep dive: Chapter 12, Caching: where to cache and how reads and writes flow. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch12 = {
  hook: `<p>This chapter covers when a cache pays off, where it should live and how reads and writes flow through it. Done right, the same few hot answers stop hitting the database thousands of times a second.</p>`,
  sections: [
    {
      id: "why-cache",
      title: "Why a cache pays off: hit ratio and skew",
      kicker: "The problem",
      blocks: [
        {
          type: "text",
          html: `<p>A database query typically takes 5 to 50 ms on a machine that is hard to scale out; Redis or Memcached answers a key lookup in well under a millisecond, around a hundred thousand operations per second per node. A cache both cuts latency and removes reads from the database.</p>`,
        },
        {
          type: "keypoints",
          items: [
            "<strong>Database load is proportional to the miss ratio.</strong> Going from 90% to 99% hits cuts database reads tenfold.",
            "Latency follows: with 1 ms hits and 31 ms misses, 90% hits average about 4 ms, 99% about 1.3 ms.",
            "<strong>Skew</strong> (roughly Zipf) means a small hot set gets most requests, so a cache holding a few percent of the data can absorb most reads, if eviction keeps the right items.",
          ],
        },
        {
          type: "lab",
          id: "cacheAside",
          caption: "Change the cache size and how skewed the traffic is. Notice how a cache holding only a small slice of 100K profiles can still serve most reads when traffic is skewed, and how average latency falls as the hit ratio climbs.",
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p>A cache adds a second copy that can be stale, invalidation logic that can have bugs and a component that can fail. Justify it with a number ("40K reads per second at 30 ms is saturating the primary").</p>`,
        },
        {
          type: "quiz",
          q: "A cache in front of a database serves 50,000 reads per second at a 95% hit ratio. You tune it to 99%. What happens to the read load on the database?",
          options: [
            "It drops by about 4%",
            "It drops from about 2,500 to about 500 reads per second",
            "It stays the same; only latency improves",
            "It drops to zero",
          ],
          answer: 1,
          explain: "The database serves the misses: 5% of 50,000 is 2,500 per second, and 1% is 500. A four-point gain in hit ratio is a fivefold cut in database reads, which is why the last few percent of hit ratio are so valuable.",
        },
      ],
    },
    {
      id: "where-to-cache",
      title: "Where caches live",
      kicker: "Cache layers",
      blocks: [
        {
          type: "text",
          html: `<p>Each layer that answers a request saves the work of every layer behind it. Layers closer to the user are faster but shared by fewer requests and harder to invalidate.</p>`,
        },
        {
          type: "diagram",
          title: "Layers a request can be answered from",
          caption: "Each layer that can answer a request saves the work of every layer to its right. Layers further left are faster but shared by fewer requests and harder to invalidate.",
          svg: `<svg viewBox="0 0 640 210" role="img" aria-label="Request path from client through CDN, app server with in-process cache, Redis and database">
<defs><marker id="cc12-arr1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="10" y="50" width="95" height="60" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="57" y="85" text-anchor="middle" font-size="13" font-weight="700">Client</text>
<rect x="130" y="50" width="95" height="60" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="177" y="85" text-anchor="middle" font-size="13" font-weight="700">CDN edge</text>
<rect x="250" y="40" width="120" height="80" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="310" y="64" text-anchor="middle" font-size="13" font-weight="700">App server</text>
<rect x="265" y="76" width="90" height="30" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-3)" stroke-width="1.5"/>
<text x="310" y="96" text-anchor="middle" font-size="12">in-process</text>
<rect x="395" y="50" width="100" height="60" rx="8" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="2"/>
<text x="445" y="85" text-anchor="middle" font-size="13" font-weight="700">Redis</text>
<rect x="520" y="50" width="110" height="60" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="575" y="85" text-anchor="middle" font-size="13" font-weight="700">Database</text>
<line x1="105" y1="80" x2="128" y2="80" stroke-width="1.5" marker-end="url(#cc12-arr1)" style="stroke: var(--dg-muted)"/>
<line x1="225" y1="80" x2="248" y2="80" stroke-width="1.5" marker-end="url(#cc12-arr1)" style="stroke: var(--dg-muted)"/>
<line x1="370" y1="80" x2="393" y2="80" stroke-width="1.5" marker-end="url(#cc12-arr1)" style="stroke: var(--dg-muted)"/>
<line x1="495" y1="80" x2="518" y2="80" stroke-width="1.5" marker-end="url(#cc12-arr1)" style="stroke: var(--dg-muted)"/>
<text x="57" y="145" text-anchor="middle" font-size="12" font-weight="700">no request</text>
<text x="177" y="145" text-anchor="middle" font-size="12" font-weight="700">~10-40 ms</text>
<text x="310" y="145" text-anchor="middle" font-size="12" font-weight="700">~100 ns</text>
<text x="445" y="145" text-anchor="middle" font-size="12" font-weight="700">~0.5-1 ms</text>
<text x="575" y="145" text-anchor="middle" font-size="12" font-weight="700">~5-50 ms</text>
<text x="57" y="165" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">one user</text>
<text x="177" y="165" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">one region</text>
<text x="310" y="165" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">one instance</text>
<text x="445" y="165" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">all servers</text>
<text x="575" y="165" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">source of truth</text>
<text x="320" y="200" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">Top row: time to answer from that layer. Bottom row: who shares the cached copy.</text>
</svg>`,
        },
        {
          type: "table",
          headers: ["Layer", "Typical latency", "Shared by", "Invalidation", "Good for"],
          rows: [
            ["Client", "None (no request)", "One user", "Headers, versioned URLs", "Static assets, offline data"],
            ["CDN", "~10-40 ms to user", "Users near one edge", "TTL, purge API, versioned URLs", "Media, static files, public responses"],
            ["In-process", "~100 ns", "One app instance", "Short TTL or a pub/sub signal", "Config, flags, very hot keys"],
            ["External (Redis)", "~0.5-1 ms", "All app servers", "Delete key on write, TTL", "Profiles, sessions, query results"],
          ],
        },
        {
          type: "keypoints",
          items: [
            "<strong>External cache</strong> is the default: shared, with its own memory budget, TTLs and one place to invalidate.",
            "<strong>CDN</strong> wins on physics: a nearby edge answers in tens of ms where a cross-world origin takes hundreds. Fingerprinted assets use <code>Cache-Control: max-age=31536000, immutable</code>; changing ones use <code>ETag</code> and <code>304</code>.",
            "<strong>In-process</strong> is about a thousand times faster than Redis, but 50 servers mean 50 copies an update doesn't reach. Since Redis 6, server-assisted invalidation makes it safer in front of Redis.",
          ],
        },
      ],
    },
    {
      id: "cache-aside",
      title: "Cache-aside: the default flow",
      kicker: "Pattern 1",
      blocks: [
        {
          type: "idea",
          html: `<p>The application owns the logic: read the cache; on a miss read the database and fill the cache. On a write, update the database, then <strong>delete</strong> the key so the next read reloads it.</p>`,
        },
        {
          type: "diagram",
          title: "A cache-aside miss, then a hit",
          caption: "The first read misses, loads from the database and fills the cache with a TTL. Later reads for the same key are served from Redis without touching the database.",
          svg: `<svg viewBox="0 0 600 300" role="img" aria-label="Sequence diagram of a cache-aside miss followed by a hit">
<defs><marker id="cc12-arr2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="50" y="15" width="100" height="32" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="100" y="36" text-anchor="middle" font-size="13" font-weight="700">App</text>
<rect x="250" y="15" width="100" height="32" rx="6" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="2"/>
<text x="300" y="36" text-anchor="middle" font-size="13" font-weight="700">Redis</text>
<rect x="450" y="15" width="100" height="32" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="500" y="36" text-anchor="middle" font-size="13" font-weight="700">Database</text>
<line x1="100" y1="47" x2="100" y2="290" stroke-width="1" stroke-dasharray="4 4" style="stroke: var(--dg-line)"/>
<line x1="300" y1="47" x2="300" y2="290" stroke-width="1" stroke-dasharray="4 4" style="stroke: var(--dg-line)"/>
<line x1="500" y1="47" x2="500" y2="290" stroke-width="1" stroke-dasharray="4 4" style="stroke: var(--dg-line)"/>
<line x1="100" y1="80" x2="297" y2="80" stroke-width="1.5" marker-end="url(#cc12-arr2)" style="stroke: var(--dg-muted)"/>
<text x="200" y="73" text-anchor="middle" font-size="12">1. GET user:42</text>
<line x1="300" y1="106" x2="103" y2="106" stroke-width="1.5" stroke-dasharray="5 3" marker-end="url(#cc12-arr2)" style="stroke: var(--dg-bad)"/>
<text x="200" y="99" text-anchor="middle" font-size="12">2. miss</text>
<line x1="100" y1="140" x2="497" y2="140" stroke-width="1.5" marker-end="url(#cc12-arr2)" style="stroke: var(--dg-muted)"/>
<text x="400" y="133" text-anchor="middle" font-size="12">3. SELECT ... id = 42</text>
<line x1="500" y1="166" x2="103" y2="166" stroke-width="1.5" stroke-dasharray="5 3" marker-end="url(#cc12-arr2)" style="stroke: var(--dg-muted)"/>
<text x="400" y="159" text-anchor="middle" font-size="12">4. row (~30 ms)</text>
<line x1="100" y1="200" x2="297" y2="200" stroke-width="1.5" marker-end="url(#cc12-arr2)" style="stroke: var(--dg-muted)"/>
<text x="200" y="193" text-anchor="middle" font-size="12">5. SET user:42, TTL 600 s</text>
<line x1="20" y1="222" x2="580" y2="222" stroke-width="1" style="stroke: var(--dg-line)"/>
<text x="580" y="238" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">later requests</text>
<line x1="100" y1="250" x2="297" y2="250" stroke-width="1.5" marker-end="url(#cc12-arr2)" style="stroke: var(--dg-muted)"/>
<text x="200" y="243" text-anchor="middle" font-size="12">GET user:42</text>
<line x1="300" y1="276" x2="103" y2="276" stroke-width="1.5" stroke-dasharray="5 3" marker-end="url(#cc12-arr2)" style="stroke: var(--dg-ok)"/>
<text x="200" y="269" text-anchor="middle" font-size="12">hit (~1 ms)</text>
</svg>`,
        },
        {
          type: "code",
          lang: "python",
          title: "Cache-aside in a few lines",
          code: `def get_profile(user_id):
    key = f"user:{user_id}:profile"
    value = redis.get(key)
    if value is not None:
        return deserialize(value)            # hit
    row = db.fetch_profile(user_id)          # miss: go to the source of truth
    redis.set(key, serialize(row), ex=600)   # fill with a 10-minute TTL
    return row

def update_profile(user_id, changes):
    db.update_profile(user_id, changes)      # write the database first
    redis.delete(f"user:{user_id}:profile")  # then invalidate; next read refills`,
        },
        {
          type: "tradeoffs",
          prosLabel: "Why it's the default",
          consLabel: "What it costs",
          pros: [
            "Caches only what is read, so memory goes to the hot set",
            "Degrades gracefully: if Redis is down, fall through to the database",
            "Works with any plain key-value store (Facebook's memcache paper describes this look-aside design)",
          ],
          cons: [
            "Every key's first read pays the query plus the fill",
            "A short window where readers see a stale value",
            "Deleting (not overwriting) on write avoids races between writers; keep a TTL as a backstop for lost deletes",
          ],
        },
        {
          type: "list",
          title: "Running it",
          items: [
            "<strong>Keys you can compute at write time:</strong> <code>user:123:profile</code>. For derived data or format changes, a <strong>versioned key</strong> (<code>feed:v8:42</code>) makes every old entry unreachable at once; old ones age out by TTL.",
            "<strong>TTL from business tolerance:</strong> a product description can be an hour old, a stock count a few seconds.",
            "<strong>Size for the hot set:</strong> 100M users × 2 KB is 200 GB; a 20% hot set is about 40 GB, plus 1.5-2× overhead and replicas: a few nodes. Cache the smallest useful unit.",
            "<strong>Don't cache</strong> what is already fast and rarely read, or what must be exactly current (a balance during a transfer).",
          ],
        },
      ],
    },
    {
      id: "write-patterns",
      title: "Write-through, write-behind and read-through",
      kicker: "Other patterns",
      blocks: [
        {
          type: "text",
          html: `<p>These patterns put a cache layer <em>in the path</em> to the database, trading write latency, freshness and durability differently.</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "Write-through", tone: "info", html: "The cache layer writes the database <strong>synchronously</strong> before acknowledging. Fresh, warm reads; writes pay both latencies and the cache fills with unread data. Plain Redis doesn't do it; DAX in front of DynamoDB does." },
            { title: "Write-behind (write-back)", tone: "warn", html: "The cache acknowledges immediately and flushes <strong>later, in batches</strong> (e.g. Hazelcast map stores). Fast writes, far fewer database writes; unflushed writes vanish if the node dies." },
            { title: "Read-through", tone: "ok", html: "The cache <strong>loads missing data itself</strong>, so application code just asks the cache. CDNs are the most common example." },
          ],
        },
        {
          type: "lab",
          id: "cachePatterns",
          caption: "Compare write latency, how often readers see stale data, how much is lost when the cache node crashes, and what ends up in the cache under each pattern.",
        },
        {
          type: "table",
          title: "The patterns side by side",
          headers: ["Pattern", "Write cost", "Read freshness", "Lost if cache crashes", "Fits"],
          rows: [
            ["Cache-aside", "DB write + delete", "Stale until delete or TTL", "Nothing (DB has it)", "Default for most read-heavy data"],
            ["Write-through", "DB + cache, synchronous", "Fresh", "Nothing (DB has it)", "Read-after-write heavy data with a supporting cache layer"],
            ["Write-behind", "Cache only", "Fresh from the cache", "Unflushed writes", "Counters, metrics, analytics"],
            ["Read-through", "Depends on write path", "Stale until TTL or purge", "Nothing", "CDNs, caching libraries with loaders"],
          ],
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Write-behind for orders or payments. The "success" comes from memory, so a crash before the flush silently loses data. Keep it for view counts, rate-limiter state and analytics.</p>`,
        },
        {
          type: "quiz",
          q: "A video platform records a view event on every play, about 500,000 per second, and shows approximate view counts. Which write pattern fits the counter best?",
          options: ["Write-through to the database on every view", "Write-behind: increment in the cache, flush aggregated counts periodically", "Cache-aside with delete on every view", "No cache; write every view to the primary database"],
          answer: 1,
          explain: "Counts are approximate and losing a few seconds of increments on a crash is acceptable, while 500K synchronous database writes per second is not. Incrementing in memory and flushing totals in batches cuts database writes by orders of magnitude.",
        },
      ],
    },
    {
      id: "interview",
      title: "Adding a cache in a design interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "callout",
          tone: "interview",
          html: `<p>Bring caching up when you can point at a reason, then be specific. A complete answer takes about a minute:</p>
<ol>
<li><strong>Why:</strong> "Profile reads are 50K per second at 30 ms; that saturates the primary."</li>
<li><strong>What and where:</strong> "Cache profiles in Redis under <code>user:{id}:profile</code>."</li>
<li><strong>Pattern:</strong> "Cache-aside: read through the cache, delete the key after updating the database."</li>
<li><strong>Expiry:</strong> "10-minute TTL as a backstop, LRU eviction."</li>
<li><strong>Failure modes:</strong> "Coalesce rebuilds of hot keys to avoid a stampede; protect the database with a circuit breaker if Redis goes down."</li>
</ol>
<p>Add a CDN when serving media or static assets to many regions.</p>`,
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Using an in-process cache as the main cache in a horizontally scaled service: with 40 instances, an update leaves 39 stale copies. Use it only as a small layer in front of a shared cache.</p>`,
        },
      ],
    },
  ],
  takeaways: [
    "Database load is proportional to the miss ratio; skewed traffic lets a small cache serve most reads. Justify a cache with numbers.",
    "The external cache (Redis, Memcached) is the default; CDNs serve media near users; in-process caches suit tiny, very hot data.",
    "Cache-aside is the default: read the cache, fill on a miss, delete the key after writing the database, keep a TTL as a backstop.",
    "Write-through keeps reads fresh at the cost of write latency; write-behind is fast but can lose acknowledged writes; read-through centralises loading.",
    "Name keys so they can be invalidated, and size the cache for the hot set, not the whole dataset.",
  ],
  furtherReading: [
    { title: "Scaling Memcache at Facebook (Nishtala et al., NSDI 2013)", url: "https://www.usenix.org/conference/nsdi13/technical-sessions/presentation/nishtala", note: "A look-aside cache at very large scale, including invalidation and regional replication." },
    { title: "MDN: HTTP caching", url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching", note: "Cache-Control, ETags and how browsers and shared caches decide what to reuse." },
    { title: "Redis documentation: client-side caching", note: "Server-assisted invalidation for in-process caches in front of Redis." },
  ],
};
