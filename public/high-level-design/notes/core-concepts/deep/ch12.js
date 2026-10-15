// Deep dive: Chapter 12, Caching: where to cache and how reads and writes flow. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch12 = {
  hook: `<p>A social app's profile page makes one query: fetch the user, join their stats, count their followers. It takes 30 ms and the database handles it fine at 2,000 requests per second. Then the app is featured in an app store, traffic jumps to 40,000 profile views per second, and the database CPU hits 100%. Latency climbs to seconds, connection pools fill up, and every other feature that shares the database starts failing too.</p>
<p>Look at the traffic and a pattern jumps out: the same few thousand popular profiles are fetched over and over, and they change maybe once a day. The database is doing identical work tens of thousands of times a second. A cache keeps that answer in memory after the first request, so the next ten thousand requests never reach the database at all. Deciding <em>where</em> to put that memory and <em>how</em> reads and writes flow through it is what this chapter is about.</p>`,
  sections: [
    {
      id: "why-cache",
      title: "Why a cache pays off: latency, load and skew",
      kicker: "The problem",
      blocks: [
        {
          type: "problem",
          html: `<p>Databases are durable, flexible and correct, and those properties cost time. A typical query parses SQL, plans it, walks indexes, may read pages from SSD, takes locks and assembles a result: 5 to 50 ms is normal, and a multi-table feed query can take hundreds. Worse, every one of those queries consumes CPU on a machine that is hard to scale out.</p>`,
        },
        {
          type: "text",
          html: `<p>An in-memory key-value store such as Redis or Memcached answers a lookup by key in well under a millisecond from inside the same data centre, and a single node can serve on the order of a hundred thousand operations per second. Putting it in front of the database does two things at once: it cuts latency for every hit, and it removes those reads from the database entirely.</p>
<h3>The number that matters: hit ratio</h3>
<p>The <strong>hit ratio</strong> is hits divided by lookups. The database only sees misses, so its load is proportional to the <em>miss</em> ratio. Moving from 90% to 99% hits sounds like a small tweak but cuts database reads from 10% of traffic to 1%: a tenfold reduction. Average latency follows the same curve. With a 1 ms hit and a 31 ms miss (30 ms query plus filling the cache), 90% hits average about 4 ms, while 99% hits average about 1.3 ms.</p>`,
        },
        {
          type: "text",
          html: `<h3>Why a small cache can serve most traffic</h3>
<p>Real access patterns are heavily skewed, roughly following a Zipf distribution: a small fraction of items receives most of the requests. The top celebrities, the front-page products and today's news get hit constantly, while the long tail is read rarely. A cache that holds a few percent of the data, if it holds the right few percent, can absorb the majority of reads. That is also why eviction policy matters (next chapter): its job is to keep that hot set in memory.</p>`,
        },
        {
          type: "lab",
          id: "cacheAside",
          caption: "Change the cache size and how skewed the traffic is. Notice how a cache holding only a small slice of 100K profiles can still serve most reads when traffic is skewed, and how average latency falls as the hit ratio climbs.",
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p>A cache is not free. It adds a second copy of the data that can be stale, invalidation logic that can have bugs, and a new component that can fail. Justify it with a number ("40K reads per second at 30 ms is saturating the primary") before you add it.</p>`,
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
      title: "Where caches live: client, CDN, in-process and external",
      kicker: "Cache layers",
      blocks: [
        {
          type: "text",
          html: `<p>"Add a cache" is ambiguous until you say where. A request passes through several places that can each keep a copy of the answer, and each one trades speed against how widely it is shared and how much control you keep over staleness.</p>`,
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
          type: "text",
          html: `<p><strong>External cache.</strong> A Redis or Memcached cluster that every app server talks to over the network. It is shared, so one server filling it helps all the others; it has its own memory budget with TTLs and eviction; and you control invalidation in one place. This is the cache interviewers expect by default, and the one to start with.</p>
<p><strong>CDN.</strong> A network of edge servers in many cities that cache responses close to users and fetch from your origin on a miss. Physics is the reason: a round trip from Mumbai to a server in Virginia is a couple of hundred milliseconds no matter how fast the server is, while a nearby edge answers in tens. CDNs are the standard answer for images, video, JavaScript and CSS, and can also cache public API responses.</p>
<p><strong>In-process cache.</strong> A map in the application's own memory, such as a Caffeine or Guava cache in Java. No network hop, so it is about a thousand times faster than Redis. But each instance has its own copy: with 50 servers there are 50 copies, and an update on one does not reach the others. Use it for small, very hot, rarely changing data: config, feature flags, reference tables, and a few keys so hot they would overload a single Redis node.</p>
<p><strong>Client cache.</strong> The browser's HTTP cache, a mobile app's local database, or a library caching metadata (Redis cluster clients cache the slot-to-node map). A client hit costs no request at all, but the backend can only influence it through headers and versioned URLs.</p>`,
        },
        {
          type: "table",
          title: "Comparing the layers",
          headers: ["Layer", "Typical latency", "Shared by", "Invalidation", "Good for"],
          rows: [
            ["Client", "None (no request)", "One user", "Headers, versioned URLs", "Static assets, offline data"],
            ["CDN", "~10-40 ms to user", "Users near one edge", "TTL, purge API, versioned URLs", "Media, static files, public responses"],
            ["In-process", "~100 ns", "One app instance", "Short TTL or a pub/sub signal", "Config, flags, very hot keys"],
            ["External (Redis)", "~0.5-1 ms", "All app servers", "Delete key on write, TTL", "Profiles, sessions, query results"],
          ],
        },
        {
          type: "realworld",
          items: [
            { org: "Netflix Open Connect", title: "A CDN inside ISPs", html: "Netflix built its own CDN and places Open Connect caching appliances inside internet providers' networks, so popular video is served from very close to viewers instead of crossing the internet backbone." },
            { org: "HTTP caching", title: "Cache-Control and ETags", html: "<code>Cache-Control: max-age=31536000, immutable</code> lets browsers and CDNs keep a fingerprinted asset for a year. For changing resources, an <code>ETag</code> lets the client ask \"has this changed?\" and get a tiny <code>304 Not Modified</code> instead of the full body." },
            { org: "Redis", title: "Client-side caching support", html: "Since Redis 6, clients can ask the server to track the keys they have read and send invalidation messages when those keys change, which makes an in-process cache in front of Redis safer to run." },
          ],
        },
      ],
    },
    {
      id: "cache-aside",
      title: "Cache-aside: the default read and write flow",
      kicker: "Pattern 1",
      blocks: [
        {
          type: "idea",
          html: `<p>The application owns the logic. On a read it asks the cache first; on a miss it reads the database and puts the result in the cache for next time. On a write it updates the database and then <strong>deletes</strong> the cache entry, so the next read reloads the fresh value. The cache never talks to the database itself.</p>`,
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
          type: "text",
          html: `<p>Three properties make cache-aside the default. It caches <strong>only what is actually read</strong>, so memory goes to the hot set rather than to every row ever written. It <strong>degrades gracefully</strong>: if Redis is unreachable, the code can fall through to the database and keep working (slower, and with the risk of overload that the next chapter addresses). And it works with <strong>any plain key-value store</strong>, because the cache needs no knowledge of the database.</p>
<p>The costs are a slow first read for every key (the miss pays for the database query plus the cache fill), and a short window where readers can see a stale value. Deleting the key on write, rather than writing the new value into it, avoids a race between concurrent writers; chapter 13 explains why, and why a TTL stays as a backstop.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Facebook", title: "Memcache at scale (NSDI 2013)", html: "Facebook's paper on scaling memcache describes a demand-filled look-aside cache: web servers read from memcache, fall back to the database on a miss, and delete the key after updating the database rather than updating the cached value." },
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
          html: `<p>Cache-aside puts the application in charge. The other patterns move responsibility into a cache layer that sits <em>in the path</em> to the database, and each makes a different trade between write latency, freshness and durability.</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "Write-through", tone: "info", html: "The application writes to the cache layer, which writes the database <strong>synchronously</strong> before acknowledging. Reads after a write are fresh and warm. Writes pay both latencies, and the cache fills with data that may never be read. It is still two writes that can partially fail, and plain Redis does not do it for you: you need a library or a cache product that supports it." },
            { title: "Write-behind (write-back)", tone: "warn", html: "The application writes only to the cache, which acknowledges immediately and flushes to the database <strong>later, in batches</strong>. Writes are fast and the database sees far fewer, larger writes. If the cache node dies before flushing, those acknowledged writes are gone." },
            { title: "Read-through", tone: "ok", html: "The cache acts as a proxy in front of the database and <strong>loads missing data itself</strong>. Application code just asks the cache. Loading logic is centralised, but you need a cache that knows how to reach the source. CDNs are the most common read-through caches." },
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
          type: "realworld",
          items: [
            { org: "Amazon DynamoDB Accelerator (DAX)", title: "Read-through and write-through", html: "DAX sits in front of DynamoDB with a compatible API. Reads that miss are loaded from DynamoDB, and writes go through DAX to the table, so the application code barely changes." },
            { org: "Hazelcast", title: "Write-behind map stores", html: "In-memory data grids such as Hazelcast can be configured to persist map entries to a backing store asynchronously after a delay, batching writes, which is the write-behind pattern built into the cache product." },
            { org: "CDNs", title: "Read-through at the edge", html: "On a miss, the edge fetches from the configured origin, stores the response according to its cache headers, and serves later requests itself." },
          ],
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Proposing write-behind for orders, payments or anything a user expects to be saved once they see "success". The acknowledgement comes from memory, so a crash before the flush silently loses data. Write-behind is for data where losing a few seconds is tolerable: view counts, rate-limiter state, analytics events.</p>`,
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
      id: "keys-ttls-and-sizing",
      title: "Keys, TTLs and sizing the cache",
      kicker: "Making it work",
      blocks: [
        {
          type: "text",
          html: `<h3>Name keys so you can invalidate them</h3>
<p>A cache key must be computable from what you know at write time, or you will never be able to delete it. Name keys by entity and purpose: <code>user:123:profile</code>, <code>post:987:comments:page1</code>, <code>trending:global</code>. If a value is derived from many entities (a rendered feed page), consider a <strong>versioned key</strong> such as <code>feed:42:v7</code>: bump the version stored elsewhere and every old entry becomes unreachable at once, then ages out by TTL. The same trick works for whole classes of data after a schema or format change.</p>
<h3>TTLs bound staleness</h3>
<p>A TTL is the maximum time an entry may live. Even when you delete on write, keep a TTL as a safety net: if a delete is lost (a crash between the database write and the delete, a bug in one code path), the stale value expires on its own. Pick the TTL from the business tolerance: a product description can be an hour old, a stock count perhaps a few seconds.</p>`,
        },
        {
          type: "text",
          html: `<h3>Sizing with a back-of-the-envelope estimate</h3>
<p>Suppose 100 million users with 2 KB profiles: 200 GB in total. If 20% of profiles get almost all of the traffic, the hot set is about 40 GB, which fits on a single large Redis node or a small cluster. Add room for key overhead and fragmentation (often 1.5 to 2 times the raw size) and replicas for availability. The answer is usually "a few nodes", not "a cache as big as the database".</p>
<p>Also check the value size: caching a 2 MB rendered page per user is very different from caching a 2 KB object. Large values eat memory, network bandwidth and serialisation time; cache the smallest useful unit.</p>`,
        },
        {
          type: "keypoints",
          title: "What to cache",
          items: [
            "Read often, changes rarely, expensive to compute or fetch: the ideal candidate.",
            "Already fast and rarely read (a well-indexed lookup at 20 requests per second): probably not worth a cache.",
            "Must be exactly current (account balance during a transfer): read from the source of truth.",
          ],
        },
        {
          type: "quiz",
          q: "You cache each user's rendered feed under feed:{user_id}. A product change alters the feed format for everyone. What is the cleanest way to stop serving old-format feeds?",
          options: [
            "Scan Redis and delete every feed key",
            "Include a format version in the key (feed:v8:{user_id}) and bump it; old keys expire by TTL",
            "Restart all Redis nodes",
            "Lower the TTL to one second forever",
          ],
          answer: 1,
          explain: "Changing the version in the key makes every old entry unreachable instantly, without a costly scan or a cold cache restart, and the old entries age out through their TTL. Lowering TTLs permanently would destroy the hit ratio.",
        },
      ],
    },
    {
      id: "interview",
      title: "Adding a cache in a design interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "text",
          html: `<p>Bring caching up when you can point at a reason: a read-heavy endpoint, an expensive query (a 200 ms feed join), database CPU pressure in your estimates, or a latency target the database cannot meet. Then be specific. Interviewers are listening for <em>what</em> you cache, <em>which</em> pattern, how entries expire and get invalidated, and what happens when the cache misbehaves.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>A complete caching answer takes about a minute:</p>
<ol>
<li><strong>Why:</strong> "Profile reads are 50K per second at 30 ms; that saturates the primary."</li>
<li><strong>What and where:</strong> "Cache profiles in Redis under <code>user:{id}:profile</code>."</li>
<li><strong>Pattern:</strong> "Cache-aside: read through the cache, delete the key after updating the database."</li>
<li><strong>Expiry:</strong> "10-minute TTL as a backstop, LRU eviction."</li>
<li><strong>Failure modes:</strong> "Coalesce rebuilds of hot keys to avoid a stampede, and protect the database with a circuit breaker if Redis goes down."</li>
</ol>
<p>Add a CDN when the system serves media or static assets to users in many regions.</p>`,
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Reaching for an in-process cache as the main cache in a horizontally scaled service. With 40 instances, a profile update leaves 39 stale copies, and every instance warms its own cache separately. Use it only as a small layer in front of a shared cache.</p>`,
        },
        {
          type: "quiz",
          q: "An interviewer asks why you chose cache-aside over write-through for user profiles. Which answer is strongest?",
          options: [
            "Cache-aside is always faster for writes and reads",
            "Cache-aside only caches profiles that are actually read, works with plain Redis, and a cache outage just means more database reads; profiles tolerate a brief stale window",
            "Write-through loses data when the cache crashes",
            "Redis only supports cache-aside, so there is no choice",
          ],
          answer: 1,
          explain: "The strong answer names the concrete benefits (memory spent on the hot set, no special cache layer, graceful degradation) and ties the staleness cost to the data's tolerance. Write-through does not lose data (that is write-behind), and Redis can be used under write-through with a library; it just does not do it natively.",
        },
      ],
    },
  ],
  takeaways: [
    "A cache trades a little staleness and complexity for lower latency and far less database load; justify it with numbers first.",
    "Database load is proportional to the miss ratio: going from 90% to 99% hits cuts database reads tenfold. Skewed traffic is why a small cache can serve most reads.",
    "The external cache (Redis, Memcached) is the default; CDNs serve media near users; in-process caches suit tiny, very hot data; client caches save whole requests.",
    "Cache-aside is the default pattern: read the cache, fill on a miss, delete the key after writing the database.",
    "Write-through keeps reads fresh at the cost of write latency; write-behind is fast but can lose acknowledged writes; read-through centralises loading (CDNs).",
    "Design keys so they can be invalidated, keep a TTL as a backstop even with delete-on-write, and size the cache for the hot set, not the whole dataset.",
  ],
  furtherReading: [
    { title: "Scaling Memcache at Facebook (Nishtala et al., NSDI 2013)", url: "https://www.usenix.org/conference/nsdi13/technical-sessions/presentation/nishtala", note: "A look-aside cache at very large scale, including invalidation and regional replication." },
    { title: "MDN: HTTP caching", url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching", note: "Cache-Control, ETags and how browsers and shared caches decide what to reuse." },
    { title: "Redis documentation: client-side caching", note: "Server-assisted invalidation for in-process caches in front of Redis." },
  ],
};
