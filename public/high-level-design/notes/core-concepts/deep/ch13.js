// Deep dive: Chapter 13, Cache eviction and failure modes. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch13 = {
  hook: `<p>The home page feed is cached in Redis with a 60-second TTL. It is requested 20,000 times per second and rebuilding it takes a 300 ms aggregate query. Every minute, at the moment the key expires, the 6,000 or so requests that arrive during that 300 ms all miss, and all of them run the aggregate query at once. The database, which normally sees one such query a minute, now sees thousands; each runs slower because of the others, so the window stays open longer and even more requests pile in.</p>
<p>The cache worked perfectly for 59.7 seconds out of every 60. The outage came from the cache's edges: what it evicts, what happens the instant an entry disappears, what it serves after the data changes, and what happens when the cache itself is gone. Those edges are where interviewers probe, and where real incidents come from.</p>`,
  sections: [
    {
      id: "eviction-policies",
      title: "Eviction: deciding what to throw away",
      kicker: "Eviction policies",
      blocks: [
        {
          type: "problem",
          html: `<p>A cache holds a small fraction of the data, so when it is full, every new entry forces an old one out. Evict the wrong entries and the hit ratio collapses: popular items get dropped and immediately re-fetched from the database, while rarely used items sit in memory doing nothing.</p>`,
        },
        {
          type: "text",
          html: `<p><strong>LRU (least recently used)</strong> evicts the entry that has gone untouched the longest. It bets that anything used recently will be used again soon, which holds for most real traffic. It is cheap, adapts quickly when popularity shifts, and is the safe default answer.</p>
<p><strong>LFU (least frequently used)</strong> evicts the entry with the fewest accesses. It keeps items that are steadily popular (the top playlists, the home page assets) even if they were not touched in the last few seconds, and it resists <em>scans</em>: a batch job reading a million keys once each would flush an LRU cache but barely dents LFU, because each scanned key has a count of one. Its weakness is inertia: yesterday's viral item keeps a high count after it goes cold, so practical LFU uses counters that decay over time.</p>
<p><strong>FIFO</strong> evicts whatever was inserted first, regardless of use. It is simple but throws out hot entries just for being old, so it is rarely the right choice. <strong>TTL</strong> is not a size policy at all: it bounds how stale an entry can get, and it runs alongside LRU or LFU.</p>`,
        },
        {
          type: "diagram",
          title: "How an LRU cache finds and evicts in O(1)",
          caption: "A hash map finds any key's node directly. A doubly linked list keeps nodes in recency order: a hit moves its node to the head, and a full cache evicts from the tail.",
          svg: `<svg viewBox="0 0 600 235" role="img" aria-label="LRU cache built from a hash map pointing into a doubly linked list">
<defs><marker id="cc13-arr1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<text x="20" y="54" font-size="13" font-weight="700">Hash map</text>
<text x="20" y="155" font-size="13" font-weight="700">Linked list</text>
<rect x="170" y="35" width="70" height="30" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="205" y="55" text-anchor="middle" font-size="12">k3</text>
<rect x="270" y="35" width="70" height="30" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="305" y="55" text-anchor="middle" font-size="12">k1</text>
<rect x="370" y="35" width="70" height="30" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="405" y="55" text-anchor="middle" font-size="12">k4</text>
<rect x="470" y="35" width="70" height="30" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="505" y="55" text-anchor="middle" font-size="12">k2</text>
<line x1="205" y1="65" x2="205" y2="128" stroke-width="1.5" marker-end="url(#cc13-arr1)" style="stroke: var(--dg-muted)"/>
<line x1="305" y1="65" x2="305" y2="128" stroke-width="1.5" marker-end="url(#cc13-arr1)" style="stroke: var(--dg-muted)"/>
<line x1="405" y1="65" x2="405" y2="128" stroke-width="1.5" marker-end="url(#cc13-arr1)" style="stroke: var(--dg-muted)"/>
<line x1="505" y1="65" x2="505" y2="128" stroke-width="1.5" marker-end="url(#cc13-arr1)" style="stroke: var(--dg-muted)"/>
<rect x="170" y="130" width="70" height="40" rx="6" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="205" y="155" text-anchor="middle" font-size="12" font-weight="700">k3</text>
<rect x="270" y="130" width="70" height="40" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="305" y="155" text-anchor="middle" font-size="12" font-weight="700">k1</text>
<rect x="370" y="130" width="70" height="40" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="405" y="155" text-anchor="middle" font-size="12" font-weight="700">k4</text>
<rect x="470" y="130" width="70" height="40" rx="6" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)" stroke-width="2"/>
<text x="505" y="155" text-anchor="middle" font-size="12" font-weight="700">k2</text>
<line x1="240" y1="143" x2="268" y2="143" stroke-width="1.5" marker-end="url(#cc13-arr1)" style="stroke: var(--dg-muted)"/>
<line x1="270" y1="158" x2="242" y2="158" stroke-width="1.5" marker-end="url(#cc13-arr1)" style="stroke: var(--dg-muted)"/>
<line x1="340" y1="143" x2="368" y2="143" stroke-width="1.5" marker-end="url(#cc13-arr1)" style="stroke: var(--dg-muted)"/>
<line x1="370" y1="158" x2="342" y2="158" stroke-width="1.5" marker-end="url(#cc13-arr1)" style="stroke: var(--dg-muted)"/>
<line x1="440" y1="143" x2="468" y2="143" stroke-width="1.5" marker-end="url(#cc13-arr1)" style="stroke: var(--dg-muted)"/>
<line x1="470" y1="158" x2="442" y2="158" stroke-width="1.5" marker-end="url(#cc13-arr1)" style="stroke: var(--dg-muted)"/>
<text x="205" y="190" text-anchor="middle" font-size="12" style="fill: var(--dg-ok)">most recent</text>
<text x="505" y="190" text-anchor="middle" font-size="12" style="fill: var(--dg-bad)">evict next</text>
<text x="300" y="222" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">On a hit, unlink the node and move it to the head. When full, drop the tail.</text>
</svg>`,
        },
        {
          type: "lab",
          id: "evictionPolicies",
          caption: "Replay a steady workload, one where the popular set shifts halfway through, and one with periodic scans. Compare how LRU, LFU and FIFO hold up in each case.",
        },
        {
          type: "realworld",
          items: [
            { org: "Redis", title: "maxmemory-policy", html: "Redis's default policy is <code>noeviction</code>, which rejects writes when memory is full, so cache deployments set something like <code>allkeys-lru</code> or <code>allkeys-lfu</code>. Its LRU is approximate: it samples a few keys and evicts the oldest of the sample. LFU (added in Redis 4.0) uses small probabilistic counters that decay over time." },
            { org: "Caffeine (Java)", title: "W-TinyLFU", html: "The Caffeine library admits new entries through a compact frequency sketch and keeps a small LRU window for brand-new items, combining LFU's scan resistance with LRU's quick adaptation." },
          ],
        },
        {
          type: "quiz",
          q: "A nightly analytics job reads every product page once through the same cache that serves shoppers. Each morning the hit ratio crashes for an hour. Which change helps most?",
          options: [
            "Switch the eviction policy from LRU to FIFO",
            "Use LFU (or keep the batch job off the shared cache), since scanned keys are touched only once",
            "Lower every TTL to one minute",
            "Double the number of cache nodes",
          ],
          answer: 1,
          explain: "Under LRU, a full scan makes every scanned key \"recent\" and pushes the genuinely hot items out. LFU keeps items by access count, so one-off reads do not displace them. Better still, the batch job should bypass the cache or use its own.",
        },
      ],
    },
    {
      id: "stampede",
      title: "The cache stampede: when one expiry becomes a flood",
      kicker: "Failure mode 1",
      blocks: [
        {
          type: "problem",
          html: `<p>A <strong>cache stampede</strong> (also called a thundering herd or dog-piling) happens when a hot key disappears and every concurrent request misses at the same moment. Each one independently decides to rebuild the value, so a query that normally runs once per TTL runs thousands of times in a second.</p>`,
        },
        {
          type: "text",
          html: `<p>The damage compounds. The rebuild query was cheap when it ran alone, but thousands of copies compete for the same CPU, locks and disk, so each takes longer. A longer rebuild keeps the miss window open, which lets even more requests in. If the database tips over, other unrelated queries fail too, and if those features have their own caches with keys expiring, the stampede spreads.</p>
<p>Stampedes are triggered by anything that removes a hot key: a TTL expiring, an explicit delete after a write, an eviction under memory pressure, or a cache restart that drops everything at once.</p>`,
        },
        {
          type: "diagram",
          title: "Database queries around the moment a hot key expires",
          caption: "Without protection, every request in the rebuild window queries the database. With request coalescing, the database sees one rebuild query while other requests wait for its result.",
          svg: `<svg viewBox="0 0 600 260" role="img" aria-label="Line chart of database queries spiking when a hot cache key expires, compared with request coalescing">
<line x1="60" y1="215" x2="570" y2="215" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<line x1="60" y1="215" x2="60" y2="30" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<text x="66" y="28" font-size="12" style="fill: var(--dg-muted)">database queries per second</text>
<text x="570" y="238" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">time</text>
<line x1="310" y1="45" x2="310" y2="215" stroke-width="1.5" stroke-dasharray="5 4" style="stroke: var(--dg-muted)"/>
<text x="302" y="58" text-anchor="end" font-size="12">hot key expires</text>
<path d="M60 208 L305 208 L314 50 L334 125 L364 190 L404 207 L570 208" fill="none" stroke-width="2.5" style="stroke: var(--dg-bad)"/>
<path d="M60 211 L306 211 L313 196 L322 211 L570 211" fill="none" stroke-width="2.5" style="stroke: var(--dg-ok)"/>
<text x="345" y="88" font-size="12" style="fill: var(--dg-bad)">no protection: every miss</text>
<text x="345" y="105" font-size="12" style="fill: var(--dg-bad)">runs the rebuild query</text>
<text x="420" y="180" font-size="12" style="fill: var(--dg-ok)">coalescing: one rebuild</text>
<text x="66" y="238" font-size="12" style="fill: var(--dg-muted)">steady state: hits only</text>
</svg>`,
        },
        {
          type: "lab",
          id: "cacheStampede",
          caption: "Let the hot key expire and watch the queue of database queries with no protection, with request coalescing, and with early refresh. Notice how rebuild time grows as concurrent queries pile up.",
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>A stampede is a <em>concurrency</em> problem, not a capacity problem. Average load can be tiny and the database still falls over, because all the misses arrive inside one rebuild window. That is why adding replicas or a bigger cache does not fix it; controlling who rebuilds does.</p>`,
        },
      ],
    },
    {
      id: "stampede-fixes",
      title: "Preventing stampedes: coalesce, refresh early, add jitter",
      kicker: "Fixes",
      blocks: [
        {
          type: "text",
          html: `<h3>Request coalescing (single flight)</h3>
<p>Make sure only one request rebuilds a given key. On a miss, a request tries to take a short lock for that key (for example, <code>SET lock:key 1 NX EX 5</code> in Redis). The winner queries the database and fills the cache. Losers either wait briefly and re-read the cache, or serve a slightly stale copy if one is available. The database sees one query per key per expiry no matter how many requests arrive. Inside a single process, the same idea is a map of in-flight loads that later callers attach to.</p>`,
        },
        {
          type: "code",
          lang: "python",
          title: "Single-flight rebuild with a Redis lock",
          code: `def get(key):
    value = redis.get(key)
    if value is not None:
        return value
    if redis.set(f"lock:{key}", 1, nx=True, ex=5):     # only one rebuilder
        try:
            value = load_from_db(key)
            ttl = 600 + random.randint(0, 60)            # jitter the expiry
            redis.set(key, value, ex=ttl)
            return value
        finally:
            redis.delete(f"lock:{key}")
    time.sleep(0.05)                                     # someone else is rebuilding
    return redis.get(key) or load_from_db(key)           # fall back if still missing`,
        },
        {
          type: "text",
          html: `<h3>Early refresh</h3>
<p>Rebuild hot entries <em>before</em> they expire, so there is never a moment when the key is missing. A background job can refresh a known set of hot keys on a schedule (cache warming), or each read can, with a probability that rises as expiry approaches, trigger an asynchronous refresh while still returning the current value. That probabilistic approach was analysed in the paper "Optimal Probabilistic Cache Stampede Prevention" (Vattani, Chierichetti and Lowenstein, VLDB 2015). Early refresh only helps with TTL expiry; if you delete keys on writes, you still need coalescing.</p>
<h3>Jittered TTLs</h3>
<p>If you warm 100,000 keys at deploy time with a fixed 10-minute TTL, they all expire in the same second ten minutes later. Adding a random offset (say 0 to 10% of the TTL) spreads expiries out so they cannot synchronise.</p>
<h3>Serve stale while revalidating</h3>
<p>Keep the old value slightly past its logical expiry and serve it while one request refreshes it. Users get a value seconds out of date instead of a slow page, and the database is protected.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Facebook memcache", title: "Leases", html: "In the NSDI 2013 paper, a miss returns a lease token, and only the holder may write the value back. The server hands out a new lease for a key only after a delay, so concurrent missers wait or take slightly stale data instead of all querying the database." },
            { org: "NGINX", title: "proxy_cache_lock", html: "With <code>proxy_cache_lock on</code>, only one request at a time populates a new cache element from the upstream; others wait for it. <code>proxy_cache_use_stale updating</code> serves the stale copy while it is being refreshed." },
            { org: "Go", title: "singleflight", html: "The <code>golang.org/x/sync/singleflight</code> package collapses concurrent calls for the same key inside one process into a single execution whose result is shared." },
            { org: "HTTP", title: "stale-while-revalidate", html: "RFC 5861 defines <code>stale-while-revalidate</code> and <code>stale-if-error</code> cache directives, letting CDNs and browsers serve a stale response while fetching a fresh one or when the origin fails." },
          ],
        },
        {
          type: "tradeoffs",
          prosLabel: "Coalescing and early refresh give you",
          consLabel: "What they cost",
          pros: [
            "One database query per hot key per expiry, regardless of traffic",
            "No latency spike at expiry when hot keys are refreshed in the background",
            "Jitter is a one-line change that removes synchronised expiries",
          ],
          cons: [
            "Locks need timeouts; a crashed rebuilder must not block the key forever",
            "Waiting requests add a little latency, or receive slightly stale data",
            "Background refresh spends database work on keys that might not be read again",
          ],
        },
        {
          type: "quiz",
          q: "You already refresh your 1,000 hottest keys in the background 30 seconds before they expire. Writes also delete keys immediately. Are you protected against stampedes?",
          options: [
            "Yes, early refresh covers everything",
            "No: a write deletes a hot key instantly, so concurrent reads all miss; you still need coalescing",
            "No: you need FIFO eviction as well",
            "Yes, as long as TTLs are jittered",
          ],
          answer: 1,
          explain: "Early refresh only prevents expiry-driven misses. A delete-on-write removes the key without warning, and every concurrent reader of a hot key will miss together. Request coalescing (or serving stale while one request refills) is what protects that path.",
        },
      ],
    },
    {
      id: "stale-data",
      title: "Stale data: why you delete instead of update",
      kicker: "Failure mode 2",
      blocks: [
        {
          type: "problem",
          html: `<p>With cache-aside, the database and the cache are updated by separate operations, so there is always a moment where they disagree. A user changes their profile photo, the database has the new one, and everyone else keeps seeing the old one until something removes the cached copy.</p>`,
        },
        {
          type: "text",
          html: `<p>The tempting fix is to <em>write the new value</em> into the cache right after the database write. With concurrent writers, that can leave the cache permanently wrong. Writer A sets the name to "Ana" and writer B sets it to "Anna", in that order in the database. But B's cache update reaches Redis first and A's arrives second, so the cache now says "Ana" while the database says "Anna", and it stays that way until the TTL expires.</p>
<p><strong>Deleting</strong> avoids that ordering problem. Whatever order the deletes arrive in, the key ends up missing, and the next reader loads the current row. Delete is also idempotent, so retrying it is safe.</p>`,
        },
        {
          type: "steps",
          title: "The race that remains even with delete",
          items: [
            "Reader R misses the cache and reads the row from the database: old value.",
            "Before R writes it back, writer W updates the database and deletes the (still missing) key.",
            "R now writes its old value into the cache. The cache is stale until the TTL expires.",
            "This window is narrow (R must be slow at exactly the wrong moment), and a TTL bounds how long it lasts. Leases or version checks can close it fully.",
          ],
        },
        {
          type: "table",
          title: "Choosing a staleness strategy per data type",
          headers: ["Data", "Tolerance", "Strategy"],
          rows: [
            ["Product description", "Minutes to hours", "TTL alone"],
            ["User profile seen by others", "Seconds", "Delete on write plus TTL backstop"],
            ["User's own profile right after editing", "None for that user", "Read-your-writes: bypass the cache for them briefly"],
            ["Stock count at checkout", "None", "Read the source of truth; use the cache only for display"],
          ],
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>Users notice their <em>own</em> stale data far more than anyone else's. Serving a user their freshly edited profile from the primary database (or from the write response) for a few seconds after an edit removes most complaints without making the cache stricter for everyone.</p>`,
        },
      ],
    },
    {
      id: "hot-keys-and-outages",
      title: "Hot keys, cache outages and cold starts",
      kicker: "Failure modes 3 and 4",
      blocks: [
        {
          type: "text",
          html: `<h3>Hot keys</h3>
<p>A cache cluster spreads keys across nodes, but any single key lives on one node. When one key gets an outsized share of traffic, such as a celebrity's profile during a big event or a flash-sale product, that node's CPU or network saturates while the rest of the cluster idles. The hit ratio can be 100% and the system still fails, because the bottleneck is one machine serving one key.</p>
<p>Adding nodes does not help, because the key still has one home. The fixes spread or absorb that one key's reads:</p>
<ul>
<li><strong>Replicate the key</strong> under several names, <code>profile:ts#0</code> to <code>profile:ts#9</code>, written together and read at random, so reads land on up to ten nodes.</li>
<li><strong>Read from replicas</strong> of the cache node that owns it.</li>
<li><strong>Put a tiny in-process cache</strong> with a TTL of a second or two in front, so each app server asks Redis at most once per second for that key.</li>
<li><strong>Rate limit</strong> if the traffic is abusive rather than organic.</li>
</ul>`,
        },
        {
          type: "text",
          html: `<h3>When the cache itself goes down</h3>
<p>A database behind a 95% hit-ratio cache is provisioned for the 5% of reads that miss. If the cache cluster fails, it suddenly receives twenty times its normal read load and is likely to fall over, turning a cache outage into a full outage. Plan for it: run the cache with replicas and automatic failover, put a circuit breaker or load shedding on the fallback path so the database receives only what it can handle, keep a small in-process cache for the hottest keys, and fail soft (serve degraded pages) rather than retrying aggressively.</p>
<h3>Cold starts</h3>
<p>A freshly started or flushed cache has a hit ratio of zero. Deploying a new cache cluster at peak, or restarting every node at once, has the same effect as an outage. Warm popular keys before switching traffic over, restart nodes one at a time, and ramp traffic gradually.</p>`,
        },
        {
          type: "table",
          title: "Failure modes at a glance",
          headers: ["Problem", "Symptom", "Fix"],
          rows: [
            ["Stampede", "Database spike when a hot key expires or is deleted", "Request coalescing, early refresh, jittered TTLs, serve stale"],
            ["Stale data", "Users see old values after writes", "Delete on write, TTL backstop, read-your-writes for the writer"],
            ["Hot key", "One cache node saturated", "Replicate or suffix the key, read replicas, in-process cache"],
            ["Cache down", "Database flooded with every read", "Cache replicas and failover, circuit breaker, load shedding"],
            ["Cold start", "Low hit ratio after deploy or restart", "Warm hot keys, rolling restarts, gradual ramp"],
          ],
        },
        {
          type: "quiz",
          q: "One Redis node in a 12-node cluster is at 100% CPU during a live sports final; the others are at 15%. The hit ratio is 99.9%. What is the best first move?",
          options: [
            "Add 12 more Redis nodes",
            "Serve the hot key from a short-TTL in-process cache on each app server and/or replicate it under several suffixed keys",
            "Switch eviction from LRU to LFU",
            "Lower the TTL so the key refreshes more often",
          ],
          answer: 1,
          explain: "A near-perfect hit ratio with one saturated node means a hot key. More nodes do not move that key, and eviction policy is irrelevant because nothing is being evicted. Absorbing its reads locally or spreading copies across nodes is what removes the bottleneck.",
        },
      ],
    },
    {
      id: "interview",
      title: "Talking about cache failures in an interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "text",
          html: `<p>Once you have added a cache to a design, a good interviewer will push on it: "what happens when that key expires?", "what if Redis goes down?", "a user updates their name and still sees the old one". You do not need to list every failure mode. Pick the one or two that matter most for this system and explain the fix crisply.</p>
<p>It also helps to show restraint. If a query is already well indexed and fast, or the data must be exact, say you would not cache it. Every cache adds invalidation logic and new ways to fail, and interviewers notice when you know that.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>A compact answer that covers the usual follow-ups:</p>
<ol>
<li><strong>Eviction:</strong> "LRU with a TTL; LFU if popularity is stable and scans are a risk."</li>
<li><strong>Stampede:</strong> "Coalesce rebuilds with a short lock per key, refresh the hottest keys early, and jitter TTLs."</li>
<li><strong>Staleness:</strong> "Delete the key after the database write, keep a TTL as a backstop, and serve the writer from the primary for a few seconds."</li>
<li><strong>Hot keys:</strong> "Replicate the key across nodes or front it with an in-process cache."</li>
<li><strong>Cache outage:</strong> "Replicas with failover, plus a circuit breaker so the database is not flattened by the fallback."</li>
</ol>`,
        },
        {
          type: "quiz",
          q: "An interviewer asks why you delete the cache key on write instead of updating it with the new value. What is the core reason?",
          options: [
            "Deleting uses less memory",
            "Concurrent writers' cache updates can arrive out of order, leaving an older value cached; deleting forces the next read to load the current row",
            "Redis cannot overwrite keys",
            "Updating the cache would trigger a stampede",
          ],
          answer: 1,
          explain: "The database serialises the two writes, but the two cache updates race over the network and can land in the opposite order, caching a value the database no longer holds. A delete is order-independent: the key ends up missing and gets reloaded. A narrow reader race remains, which a TTL bounds.",
        },
      ],
    },
  ],
  takeaways: [
    "LRU is the default eviction policy; LFU keeps steadily popular items and resists scans; FIFO is rarely right; TTL bounds staleness alongside any policy.",
    "A stampede is many concurrent misses rebuilding one hot key; it is a concurrency problem that more capacity does not fix.",
    "Request coalescing is the main stampede fix; add early refresh for hot keys, jittered TTLs and serve-stale-while-revalidating.",
    "Delete the cache entry after writing the database rather than updating it, and keep a TTL to bound the small race that remains.",
    "Hot keys overload one node even at a perfect hit ratio: replicate or suffix the key, or absorb reads in an in-process cache.",
    "Plan for the cache failing: replicas and failover for the cache, circuit breakers and load shedding in front of the database, and gradual warm-up after restarts.",
  ],
  furtherReading: [
    { title: "Scaling Memcache at Facebook (Nishtala et al., NSDI 2013)", url: "https://www.usenix.org/conference/nsdi13/technical-sessions/presentation/nishtala", note: "Leases for stampedes and stale sets, and how invalidations flow." },
    { title: "Optimal Probabilistic Cache Stampede Prevention (Vattani, Chierichetti, Lowenstein, VLDB 2015)", note: "The analysis behind probabilistic early refresh." },
    { title: "Redis documentation: key eviction", note: "maxmemory policies, approximated LRU and LFU." },
    { title: "RFC 5861: HTTP Cache-Control Extensions for Stale Content", url: "https://www.rfc-editor.org/rfc/rfc5861", note: "stale-while-revalidate and stale-if-error." },
  ],
};
