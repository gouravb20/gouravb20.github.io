// Deep dive: Chapter 13, Cache eviction and failure modes. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch13 = {
  hook: `<p>This chapter covers the edges of a cache, where interviewers probe and real incidents start: what it evicts, what happens the instant a hot entry disappears, what it serves after data changes, and what happens when the cache itself is gone.</p>`,
  sections: [
    {
      id: "eviction-policies",
      title: "Eviction: deciding what to throw away",
      kicker: "Eviction policies",
      blocks: [
        {
          type: "text",
          html: `<p>A full cache must evict an entry for every new one. Evict the wrong ones and popular items are dropped and re-fetched while cold ones waste memory.</p>`,
        },
        {
          type: "table",
          headers: ["Policy", "Evicts", "Strength", "Weakness"],
          rows: [
            ["LRU", "Least recently used", "Cheap, adapts fast; the safe default", "A one-off scan flushes the hot set"],
            ["LFU", "Least frequently used", "Keeps steadily popular items; resists scans", "Inertia: yesterday's viral item lingers unless counters decay"],
            ["FIFO", "Oldest inserted", "Simple", "Throws out hot entries just for being old"],
            ["TTL", "Expired entries", "Bounds staleness", "Not a size policy; runs alongside LRU or LFU"],
          ],
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
          type: "keypoints",
          items: [
            "Redis defaults to <code>noeviction</code> (rejects writes when full), so caches set <code>allkeys-lru</code> or <code>allkeys-lfu</code>. Its LRU samples a few keys; its LFU (since 4.0) uses decaying probabilistic counters.",
            "Java's Caffeine uses W-TinyLFU: a frequency sketch for admission plus a small LRU window for new items.",
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
      title: "Cache stampedes and how to prevent them",
      kicker: "Failure mode 1",
      blocks: [
        {
          type: "text",
          html: `<p>A <strong>stampede</strong> (thundering herd) happens when a hot key disappears (TTL expiry, delete on write, eviction, cache restart) and every concurrent request rebuilds it. Thousands of copies of a cheap query compete, each runs slower, the miss window stays open longer and more requests pile in. It is a <em>concurrency</em> problem: more capacity doesn't fix it; controlling who rebuilds does.</p>`,
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
          type: "keypoints",
          items: [
            "<strong>Request coalescing (single flight):</strong> one request takes a short per-key lock and rebuilds; others wait and re-read or serve stale. Facebook's memcache uses leases; NGINX has <code>proxy_cache_lock</code>; Go has <code>singleflight</code>.",
            "<strong>Early refresh:</strong> rebuild hot keys before expiry, on a schedule or probabilistically as expiry nears (Vattani et al., VLDB 2015). Doesn't cover delete-on-write.",
            "<strong>Jittered TTLs:</strong> add 0-10% random offset so keys warmed together don't expire together.",
            "<strong>Serve stale while revalidating:</strong> keep the old value briefly past expiry while one request refreshes (HTTP's <code>stale-while-revalidate</code>, RFC 5861).",
          ],
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
          type: "callout",
          tone: "warning",
          html: `<p>Locks need timeouts so a crashed rebuilder can't block a key forever, and waiting requests pay a little latency or get slightly stale data.</p>`,
        },
      ],
    },
    {
      id: "stale-data",
      title: "Stale data: delete instead of update",
      kicker: "Failure mode 2",
      blocks: [
        {
          type: "text",
          html: `<p>Writing the new value into the cache after a database write can leave it permanently wrong: writers A then B update the database, but B's cache write lands first and A's second, so the cache holds A's value until the TTL. <strong>Deleting</strong> is order-independent (the key ends up missing and reloads) and idempotent.</p>`,
        },
        {
          type: "steps",
          title: "The race that remains even with delete",
          items: [
            "Reader R misses and reads the old row.",
            "Writer W updates the database and deletes the (still missing) key.",
            "R writes its old value into the cache, stale until the TTL expires.",
            "The window is narrow and the TTL bounds it; leases or version checks close it fully.",
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
      ],
    },
    {
      id: "hot-keys-and-outages",
      title: "Hot keys, cache outages and cold starts",
      kicker: "Failure modes 3 and 4",
      blocks: [
        {
          type: "keypoints",
          items: [
            "<strong>Hot keys:</strong> each key lives on one node, so a celebrity profile can saturate that node at a 100% hit ratio. More nodes don't help. Replicate it as <code>profile:ts#0</code>..<code>#9</code> and read one at random, read from replicas, or front it with a 1-2 second in-process cache.",
            "<strong>Cache down:</strong> a database behind a 95% hit ratio is sized for 5% of reads and gets twenty times that. Run cache replicas with failover, put a circuit breaker or load shedding on the fallback, and fail soft.",
            "<strong>Cold starts:</strong> a fresh cache has a zero hit ratio. Warm hot keys, restart nodes one at a time and ramp traffic gradually.",
          ],
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
          type: "callout",
          tone: "interview",
          html: `<p>Pick the one or two failure modes that matter for this system, and say what you would <em>not</em> cache. A compact answer to the usual follow-ups:</p>
<ol>
<li><strong>Eviction:</strong> "LRU with a TTL; LFU if popularity is stable and scans are a risk."</li>
<li><strong>Stampede:</strong> "Coalesce rebuilds with a short per-key lock, refresh the hottest keys early, jitter TTLs."</li>
<li><strong>Staleness:</strong> "Delete after the database write, TTL as backstop, serve the writer from the primary for a few seconds."</li>
<li><strong>Hot keys:</strong> "Replicate the key across nodes or front it with an in-process cache."</li>
<li><strong>Outage:</strong> "Replicas with failover, plus a circuit breaker so the fallback doesn't flatten the database."</li>
</ol>`,
        },
      ],
    },
  ],
  takeaways: [
    "LRU is the default eviction policy; LFU keeps steadily popular items and resists scans; TTL bounds staleness alongside either.",
    "A stampede is many concurrent misses rebuilding one hot key; fix it with request coalescing, early refresh, jittered TTLs and serve-stale.",
    "Delete the cache entry after writing the database rather than updating it, and keep a TTL to bound the race that remains.",
    "Hot keys overload one node even at a perfect hit ratio: replicate the key or absorb reads in an in-process cache.",
    "Plan for cache failure: replicas, circuit breakers and load shedding in front of the database, and gradual warm-up after restarts.",
  ],
  furtherReading: [
    { title: "Scaling Memcache at Facebook (Nishtala et al., NSDI 2013)", url: "https://www.usenix.org/conference/nsdi13/technical-sessions/presentation/nishtala", note: "Leases for stampedes and stale sets, and how invalidations flow." },
    { title: "Optimal Probabilistic Cache Stampede Prevention (Vattani, Chierichetti, Lowenstein, VLDB 2015)", note: "The analysis behind probabilistic early refresh." },
    { title: "Redis documentation: key eviction", note: "maxmemory policies, approximated LRU and LFU." },
    { title: "RFC 5861: HTTP Cache-Control Extensions for Stale Content", url: "https://www.rfc-editor.org/rfc/rfc5861", note: "stale-while-revalidate and stale-if-error." },
  ],
};
