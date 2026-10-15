// System design core concepts - part 3 data: caching, sharding, consistent hashing, CAP, numbers (chapters 12-18)
window.DATA.chapters.push(
  // ------------------------------------------------------------------
  {
    id: `ch12`, part: 5, number: 12,
    title: `Caching: where to cache and how reads and writes flow`,
    overview: `A cache keeps hot data in memory so most reads skip the database: a Redis read takes about a millisecond where a database query might take tens. Caches live at several layers: the client, a <strong>CDN</strong>, <strong>in-process</strong> memory, and most importantly an <strong>external cache</strong> like Redis shared by all servers. How data flows through it is the pattern: <strong>cache-aside</strong> is the default; <strong>write-through</strong>, <strong>write-behind</strong> and <strong>read-through</strong> trade write latency, freshness and durability differently.`,
    concepts: [
      { term: `Why cache`, def: `Memory is far faster than disk-backed queries: ~1 ms for Redis versus 20-50 ms or more for a database query, and the database's CPU is spared.`, why: `Caching cuts latency and absorbs read load, but adds staleness, invalidation and failure modes. Justify it with a number first.`, demo: `cacheAside` },
      { term: `External cache (default)`, def: `A standalone service such as Redis or Memcached that every app server shares over the network, with TTLs and eviction (LRU) to bound memory.`, why: `The cache interviewers expect for any high-read system. Start here; add other layers only if the problem needs them.`, demo: `cacheAside` },
      { term: `CDN`, def: `Geographically distributed edge servers that cache content near users and fetch from the origin on a miss.`, why: `Static media at scale is the classic reason: an image served from India's edge in 20-40 ms instead of 250-300 ms from Virginia. CDNs can also cache public API responses and run edge logic.` },
      { term: `Client-side cache`, def: `Browser HTTP cache and local storage, mobile on-device storage, or client libraries caching metadata (Redis clients cache the cluster's slot map).`, why: `Saves round trips entirely, but the backend has little control over staleness and invalidation.` },
      { term: `In-process cache`, def: `Data cached in the application's own memory: config, feature flags, small reference data, very hot keys, precomputed values.`, why: `Faster than Redis (no network hop), but each instance has its own copy and invalidation doesn't propagate. An optimization layer on top of an external cache, not a replacement.` },
      { term: `Cache-aside (lazy loading)`, def: `The application checks the cache; on a miss it reads the database, writes the result to the cache and returns it. On writes it updates the database and deletes (or updates) the cache entry.`, why: `The default pattern. Only requested data is cached, and a cache outage degrades to database reads. The cost: each miss pays extra latency.`, demo: `cachePatterns` },
      { term: `Write-through`, def: `The application writes to the cache, which synchronously writes the database before acknowledging.`, why: `Reads are fresh, but writes are slower and the cache fills with data that may never be read. Still a dual write that can partially fail; needs a cache layer or library that supports it (Redis doesn't natively).`, demo: `cachePatterns` },
      { term: `Write-behind (write-back)`, def: `The application writes only to the cache; the cache flushes to the database asynchronously in batches.`, why: `Very fast writes and high throughput, but data is lost if the cache dies before flushing. Fits metrics and analytics, not payments.`, demo: `cachePatterns` },
      { term: `Read-through`, def: `The cache sits in front of the database as a proxy and loads missing data itself.`, why: `Centralizes loading logic but needs a specialized cache. CDNs are read-through caches; with Redis, cache-aside is far more common.` },
      { term: `Hit ratio and skew`, def: `Hit ratio = hits / lookups. Real traffic is skewed (roughly Zipf): a small fraction of keys gets most reads, so a cache holding a few percent of the data can serve most requests.`, why: `Database load is proportional to the miss ratio: going from 90% to 99% hits cuts database reads tenfold.`, demo: `cacheAside` },
      { term: `Cache keys`, def: `Name keys by entity and version: <code>user:123:profile</code>, <code>trending:posts:global</code>, <code>feed:42:v3</code>.`, why: `Clear keys make invalidation possible; versioned keys let you invalidate a whole class of entries by bumping a version.` },
      { term: `When to bring caching up`, def: `Read-heavy load, expensive queries (a feed join taking 200 ms), database CPU pressure, or a latency target the database can't meet.`, why: `Identify the bottleneck, quantify it, then say what to cache, which pattern, which eviction and TTL, and how you'll handle invalidation and cache failure.` }
    ],
    cheatsheet: [
      { title: `Where to cache`, type: `table`, headers: [`Layer`, `Latency`, `Shared?`, `Use for`], rows: [
        [`In-process`, `~100 ns`, `No (per instance)`, `Config, flags, very hot keys`],
        [`External (Redis)`, `~0.5-1 ms`, `Yes`, `Default: profiles, sessions, query results`],
        [`CDN edge`, `~10-40 ms to user`, `Per region`, `Images, video, static assets, public responses`],
        [`Client`, `0 (no request)`, `Per user`, `Assets, offline data`]
      ] },
      { title: `Cache patterns`, type: `table`, headers: [`Pattern`, `Write path`, `Read path`, `Trade-off`], rows: [
        [`Cache-aside`, `DB, then delete cache key`, `Cache, else DB and fill`, `Default; miss latency, brief staleness`],
        [`Write-through`, `Cache and DB synchronously`, `Cache`, `Fresh reads, slower writes, cold data cached`],
        [`Write-behind`, `Cache; DB later in batches`, `Cache`, `Fast writes; data loss on cache crash`],
        [`Read-through`, `-`, `Cache loads from DB itself`, `Central logic; needs special cache (e.g. CDN)`]
      ] },
      { title: `Cache-aside in code`, type: `code`, body: `def get_user(user_id):
    key = f"user:{user_id}:profile"
    cached = redis.get(key)
    if cached is not None:
        return cached                      # hit (~1 ms)
    user = db.query("SELECT ... WHERE id = %s", user_id)   # miss (~20-50 ms)
    redis.set(key, user, ex=600)           # TTL 10 minutes
    return user

def update_user(user_id, fields):
    db.update(user_id, fields)
    redis.delete(f"user:{user_id}:profile")   # invalidate; next read refills` }
    ],
    interview: [
      { q: `Walk me through adding a cache to this read-heavy service.`, a: `First the bottleneck in numbers: say 50K profile reads per second at 30 ms each is saturating the database. Cache user profiles in Redis with cache-aside under keys like <code>user:{id}:profile</code>, a 10-minute TTL and LRU eviction. On profile updates, write the database and delete the key. Then the failure modes: a stampede on hot keys (request coalescing), and Redis going down (fall back to the database behind a circuit breaker or rate limit so it isn't crushed).`, diff: `medium` },
      { q: `Cache-aside vs write-through?`, a: `Cache-aside caches lazily on reads and invalidates on writes: simple, resilient (a cache outage just means more database reads), but the first read after a change or eviction is slow and there's a short staleness window. Write-through writes the cache and database together so reads are always warm and fresh, at the cost of slower writes, caching data nobody reads, and needing a cache layer that supports it. Default to cache-aside.`, diff: `medium` },
      { q: `When is write-behind acceptable?`, a: `When write throughput matters more than durability and losing a few seconds of updates is tolerable: view counters, metrics, analytics events, rate limiter state. Never for payments, orders or anything users expect to be durable once acknowledged, because a cache crash before the flush loses data.`, diff: `easy` },
      { q: `When would you add a CDN?`, a: `When the system serves static media (images, video, JS and CSS) to users spread across regions. The edge serves cached copies in tens of milliseconds instead of hundreds from a distant origin, and offloads bandwidth from the origin. It can also cache public, rarely changing API responses. Use versioned URLs for assets so updates don't depend on purging.`, diff: `easy` },
      { q: `Why does a 99% hit ratio matter so much more than 90%?`, a: `The database only sees misses. At 90% hits it serves 10% of reads; at 99% it serves 1%, a tenfold reduction in database load, and average latency drops similarly because misses dominate it. Small hit-ratio gains at the top end are worth a lot.`, diff: `medium` },
      { q: `What is in-process caching good for, and what's the catch?`, a: `Tiny, very hot, rarely changing data: config, feature flags, reference tables, and extremely hot keys that would hammer a single Redis node. It avoids a network hop entirely. The catch is that every instance has its own copy, so updates don't propagate; use short TTLs or a pub/sub invalidation signal and accept brief inconsistency.`, diff: `medium` }
    ],
    labs: [`cacheAside`, `cachePatterns`]
  },
  // ------------------------------------------------------------------
  {
    id: `ch13`, part: 5, number: 13,
    title: `Cache eviction and failure modes: stampedes, staleness, hot keys`,
    overview: `Caches are small, so they must decide what to evict: <strong>LRU</strong> is the safe default, <strong>LFU</strong> suits steadily popular keys, FIFO is rarely right, and <strong>TTL</strong> bounds staleness on top of any policy. Caching also brings new ways to fail: a <strong>stampede</strong> when a hot entry expires, <strong>stale data</strong> after writes, <strong>hot keys</strong> that overload one node, and the database being crushed when the cache itself goes down. Naming one or two of these and how you'd handle them is what interviewers want.`,
    concepts: [
      { term: `LRU (least recently used)`, def: `Evict the entry that hasn't been accessed for the longest time, tracked with a hash map and a doubly linked list for O(1) operations.`, why: `Adapts well to most workloads, where recently used data is likely to be used again. The safe default answer.`, demo: `evictionPolicies` },
      { term: `LFU (least frequently used)`, def: `Evict the entry with the fewest accesses, usually with approximate counters that decay over time.`, why: `Better when popularity is stable (top playlists, trending videos) and resists one-off scans that would flush an LRU cache.`, demo: `evictionPolicies` },
      { term: `FIFO`, def: `Evict the oldest inserted entry regardless of use.`, why: `Simple, but evicts hot entries just because they're old. Rarely the right choice.`, demo: `evictionPolicies` },
      { term: `TTL`, def: `An expiry time per key, combined with an eviction policy.`, why: `Not an eviction policy by itself: it bounds how stale data can get, which matters for API responses, sessions and anything that must refresh.` },
      { term: `Cache stampede (thundering herd)`, def: `A hot key expires and every concurrent request misses at once and queries the database to rebuild it.`, why: `One query becomes thousands in a second, which can take the database down and cascade.`, demo: `cacheStampede` },
      { term: `Request coalescing (single flight)`, def: `On a miss, one request takes a short lock and rebuilds the entry while others wait for its result (or briefly serve the old value).`, why: `The most effective stampede fix: the database sees one query per key per expiry.`, demo: `cacheStampede` },
      { term: `Early refresh and jittered TTLs`, def: `Refresh popular keys before they expire (cache warming or probabilistic early expiration), and add random jitter to TTLs so keys don't all expire together.`, why: `Warming only helps with TTL-based expiry; if you delete keys on writes, coalescing is still needed.`, demo: `cacheStampede` },
      { term: `Stale data`, def: `The database changed but the cache still holds the old value, because writes go to the database and the cache catches up later.`, why: `There's no perfect fix: choose per data type between delete-on-write, short TTLs and simply accepting eventual consistency.`, demo: `cachePatterns` },
      { term: `Delete, don't update, on write`, def: `After updating the database, delete the cache key rather than writing the new value into it.`, why: `Two concurrent writers updating the cache can leave the older value last; deleting forces the next read to load the current row. A small race remains (a slow reader refilling an old value), which a short TTL bounds.` },
      { term: `Hot keys`, def: `One key gets a huge share of traffic (a celebrity's profile), overloading the single cache node or shard that owns it even when the hit ratio is perfect.`, why: `Fixes: replicate the key across nodes (or suffix it, e.g. <code>user:ts#0..9</code>) and spread reads, add an in-process cache in front, rate limit abusive patterns.` },
      { term: `Cache failure`, def: `If Redis goes down, every request falls through to the database at once.`, why: `Plan for it: replicas or a cluster for the cache, circuit breakers and rate limits on the fallback path, and a small in-process cache as a last resort.` },
      { term: `Don't cache everything`, def: `Cache data that is read often, changes rarely and is expensive to fetch. A well-indexed query that's already fast may not need a cache.`, why: `Every cache adds invalidation logic and failure modes. Show you know when it's not worth it.` }
    ],
    cheatsheet: [
      { title: `Eviction policies`, type: `table`, headers: [`Policy`, `Evicts`, `Good for`, `Weakness`], rows: [
        [`LRU`, `Least recently used`, `Most workloads (default)`, `A one-off scan flushes hot data`],
        [`LFU`, `Least frequently used`, `Stable popularity`, `Slow to adapt when trends change`],
        [`FIFO`, `Oldest inserted`, `Very simple caches`, `Evicts hot entries`],
        [`TTL`, `Expired entries`, `Bounding staleness`, `Not a size policy on its own`]
      ] },
      { title: `Failure modes and fixes`, type: `table`, headers: [`Problem`, `Symptom`, `Fix`], rows: [
        [`Stampede`, `DB spike when a hot key expires`, `Request coalescing, early refresh, jittered TTLs`],
        [`Stale data`, `Users see old values after writes`, `Delete on write, short TTL, accept eventual consistency`],
        [`Hot key`, `One cache node saturated`, `Replicate or suffix the key, in-process cache`],
        [`Cache down`, `DB flooded`, `Cache replicas, circuit breaker, rate limit, local cache`],
        [`Cold start`, `Low hit ratio after deploy or restart`, `Warm popular keys, roll out gradually`]
      ] },
      { title: `Single-flight rebuild`, type: `code`, body: `def get(key):
    v = redis.get(key)
    if v is not None:
        return v
    if redis.set(f"lock:{key}", 1, nx=True, ex=5):     # only one rebuilder
        try:
            v = load_from_db(key)
            redis.set(key, v, ex=600 + random.randint(0, 60))   # jittered TTL
        finally:
            redis.delete(f"lock:{key}")
        return v
    sleep(0.05)                     # others wait briefly, then re-read the cache
    return redis.get(key) or load_from_db(key)` }
    ],
    interview: [
      { q: `What is a cache stampede and how do you prevent it?`, a: `When a popular entry expires, every request that arrives before it is rebuilt misses and hits the database, turning one query into thousands. Prevent it with request coalescing: one request rebuilds under a short lock while others wait or serve the stale value. Add proactive refresh of hot keys and random jitter on TTLs so many keys don't expire at the same moment.`, diff: `medium` },
      { q: `LRU or LFU?`, a: `LRU is the default: it assumes recently used data will be used again, which fits most traffic, and it's cheap. LFU keeps items that are consistently popular and resists scans that touch many keys once, but it adapts slowly when popularity shifts and needs decaying counters. Redis supports both (allkeys-lru, allkeys-lfu).`, diff: `easy` },
      { q: `A user updates their profile picture but others still see the old one. Why, and what do you do?`, a: `The database was updated but the cached profile wasn't, so readers get the old value until the TTL expires. Delete the cache key right after the database write so the next read reloads it. If brief staleness is acceptable, a short TTL alone may do; for the user themselves, read-your-writes can be served by bypassing the cache for their own profile for a moment.`, diff: `medium` },
      { q: `How do you handle a hot key in Redis?`, a: `Spread its reads: replicate the value under several keys (<code>key#0</code> to <code>key#9</code>, picked at random) so they land on different nodes, or serve it from read replicas. Put a small in-process cache with a short TTL in front so most requests never reach Redis. Rate limit if the traffic is abusive. Sharding alone doesn't help because one key lives on one node.`, diff: `medium` },
      { q: `What happens if your cache cluster goes down?`, a: `All reads fall through to the database, which was sized for the miss traffic only and may be overwhelmed. Mitigations: run the cache with replicas and automatic failover, protect the database with a circuit breaker or load shedding on the fallback path, keep a small in-process cache for the hottest keys, and warm the cache gradually when it returns.`, diff: `medium` },
      { q: `Why delete the cache entry on write instead of updating it?`, a: `With concurrent writers, cache updates can arrive in a different order from the database commits, leaving an older value cached indefinitely. Deleting avoids that: the next reader loads the current row. A narrow race remains where a slow reader refills a value read before the write, so keep a TTL as a backstop.`, diff: `hard` }
    ],
    labs: [`evictionPolicies`, `cacheStampede`]
  },
  // ------------------------------------------------------------------
  {
    id: `ch14`, part: 6, number: 14,
    title: `Partitioning, sharding and choosing a shard key`,
    overview: `When one database can no longer hold the data or keep up with writes, split it. <strong>Partitioning</strong> splits a big table into pieces inside one database; <strong>sharding</strong> spreads rows across many independent machines. Two decisions matter: the <strong>shard key</strong> (high cardinality, even distribution, aligned with the main query) and the <strong>distribution strategy</strong> (range, hash or directory). Hash-based is the default. And most importantly: don't shard until the numbers say you must.`,
    concepts: [
      { term: `Vertical scaling first`, def: `A bigger machine is the simplest fix and goes far: today's instances have 100+ vCPUs and terabytes of RAM; managed databases like Aurora store up to ~256 TiB.`, why: `Premature sharding is the number one mistake. Do the math before proposing it.`, demo: `estimator` },
      { term: `Partitioning`, def: `Splitting a table into smaller pieces within one database instance. <strong>Horizontal</strong>: rows split (one partition per year of orders). <strong>Vertical</strong>: columns split (hot columns separate from large, rarely read ones).`, why: `Queries scan only relevant partitions, and maintenance (vacuum, index rebuilds, dropping old data) works per partition. No new machines needed.` },
      { term: `Sharding`, def: `Horizontal partitioning across machines. Each shard is a standalone database with its own CPU, memory, disk and connections; together they hold the full dataset.`, why: `Scales storage and both read and write throughput. In exchange you take on routing, hot spots, cross-shard queries and resharding.` },
      { term: `Good shard key`, def: `<strong>High cardinality</strong> (many distinct values), <strong>even distribution</strong> (no value dominates) and <strong>aligned with queries</strong> (the common request touches one shard).`, why: `user_id for a user-centric app and order_id for orders are classic good keys.`, demo: `shardKey` },
      { term: `Bad shard keys`, def: `A boolean like is_premium (two shards, at most); country (one shard gets most users); created_at for a growing table (all new writes hit the newest shard).`, why: `Low cardinality caps the shard count; skew creates hot shards; time keys create write hot spots.`, demo: `shardKey` },
      { term: `Range-based sharding`, def: `Contiguous key ranges per shard: user IDs 1-1M on shard 1, 1M-2M on shard 2.`, why: `Simple and efficient for range scans, but traffic is rarely spread evenly over ranges (recent data is hot). Fits multi-tenant systems where each tenant owns a range.`, demo: `shardKey` },
      { term: `Hash-based sharding (default)`, def: `shard = hash(key) mod N, or better, consistent hashing. The hash scrambles keys so data and load spread evenly.`, why: `The default interviewers assume. Plain modulo moves almost every key when N changes, so pair it with consistent hashing or many fixed virtual partitions.`, demo: `shardKey` },
      { term: `Directory-based sharding`, def: `A lookup table or service maps each key (or key range) to a shard.`, why: `Maximum flexibility (move one heavy tenant to its own shard), but every request pays a lookup and the directory is a critical dependency. Rarely the interview answer.`, demo: `shardKey` },
      { term: `Fixed logical partitions`, def: `Create many more partitions than machines (e.g. 1,024 slots) and assign slots to nodes; rebalancing moves whole slots.`, why: `Redis Cluster (16,384 slots), Elasticsearch shards and many databases work this way. Keys never change partition, only partitions change machines.` },
      { term: `Sharding is usually built in`, def: `Cassandra (token ring with virtual nodes), DynamoDB (hash partitions that split automatically), MongoDB (range chunks with a balancer), Vitess and Citus for MySQL and PostgreSQL, Spanner and Aurora for distributed SQL.`, why: `In an interview, "DynamoDB with user_id as the partition key" is enough unless you're asked about internals.` },
      { term: `When to propose sharding`, def: `When an estimate exceeds one machine: storage beyond a few to tens of TB, sustained writes beyond what one primary handles (tens of thousands per second), or reads beyond what replicas and caches absorb.`, why: `The formula: identify the bottleneck, show why one database won't do, then propose the shard key, strategy, trade-offs and growth plan.`, demo: `estimator` }
    ],
    cheatsheet: [
      { title: `Sharding strategies`, type: `table`, headers: [`Strategy`, `How`, `Pros`, `Cons`], rows: [
        [`Range`, `Key ranges per shard`, `Range scans, simple`, `Hot recent ranges, uneven load`],
        [`Hash (default)`, `hash(key) to shard`, `Even spread`, `No range scans; resharding needs consistent hashing`],
        [`Directory`, `Lookup table per key`, `Flexible placement`, `Extra lookup, critical dependency`]
      ] },
      { title: `Shard key checklist`, type: `table`, headers: [`Candidate`, `Cardinality`, `Distribution`, `Query fit`, `Verdict`], rows: [
        [`user_id`, `High`, `Even`, `User-scoped queries hit one shard`, `Good`],
        [`order_id`, `High`, `Even`, `Order lookups hit one shard`, `Good`],
        [`country`, `Low`, `Skewed`, `Region queries`, `Bad: hot shard`],
        [`is_premium`, `2`, `Skewed`, `-`, `Bad: two shards max`],
        [`created_at`, `High`, `Writes all at the end`, `Time ranges`, `Bad for writes`]
      ] },
      { title: `What to say`, type: `list`, items: [
        `"Most queries are scoped to one user, so I'll shard by user_id."`,
        `"Hash-based distribution with consistent hashing for even load and cheap growth."`,
        `"Global queries like trending become scatter-gather; I'll precompute and cache them."`,
        `"Start with, say, 64 logical shards on fewer machines so growth moves whole shards."`
      ] }
    ],
    interview: [
      { q: `How do you choose a shard key?`, a: `Start from the dominant access pattern: the key should put everything a common request needs on one shard. Then check cardinality (enough distinct values for many shards) and distribution (no value or time range takes a disproportionate share). For a social app, user_id: most queries are about one user, there are millions of them, and hashing spreads them evenly.`, diff: `easy` },
      { q: `Why is created_at usually a bad shard key?`, a: `Writes always carry the current time, so with range sharding every new row lands on the newest shard, which becomes a write hot spot while older shards sit idle. Reads skew the same way because recent data is hottest. Time ranges suit archival partitioning within a database, not distributing a write-heavy table.`, diff: `easy` },
      { q: `What's the difference between partitioning and sharding?`, a: `Partitioning splits a table into pieces inside one database instance (by date range or hash), which speeds scans and maintenance but adds no capacity. Sharding puts partitions on different machines, adding storage and throughput but bringing routing, cross-shard queries and distributed transactions. People use the words loosely; be clear whether data lives on one machine or many.`, diff: `easy` },
      { q: `Hash or range sharding?`, a: `Hash by default: it spreads data and load evenly regardless of key patterns. Range when queries scan contiguous keys and load is naturally spread across ranges, for example multi-tenant systems where each tenant owns a range, or when range scans by the key are the main query. Range invites hot spots on monotonically increasing keys.`, diff: `medium` },
      { q: `When would you NOT shard?`, a: `When the numbers fit one machine: a few TB of data, a few thousand writes per second and reads that replicas and a cache can absorb. A single well-indexed PostgreSQL primary with read replicas handles a lot. Sharding adds permanent complexity (routing, rebalancing, cross-shard queries and transactions), so propose it only when an estimate forces it.`, diff: `medium` },
      { q: `Why create more logical shards than machines?`, a: `So capacity can grow by moving whole logical shards to new machines instead of rehashing every key. With 1,024 logical partitions on 8 nodes, adding a node means moving some partitions, and keys never change partition. It also helps balance load by placing partitions deliberately.`, diff: `hard` }
    ],
    labs: [`shardKey`]
  },
  // ------------------------------------------------------------------
  {
    id: `ch15`, part: 6, number: 15,
    title: `Sharding challenges: hot spots, cross-shard queries and transactions`,
    overview: `Sharding solves capacity and creates three new problems. <strong>Hot spots</strong>: some keys (a celebrity) or ranges (today) get far more traffic than others. <strong>Cross-shard operations</strong>: queries that don't include the shard key must fan out to every shard and are only as fast as the slowest one. <strong>Consistency</strong>: a transaction touching two shards can't use one database transaction, so you avoid it by design, use a <strong>saga</strong> with compensating steps, or accept eventual consistency.`,
    concepts: [
      { term: `Hot spots`, def: `One shard gets disproportionate load, so it becomes the bottleneck and sharding's benefit disappears.`, why: `Detect them by monitoring per-shard latency, CPU and request rates.` },
      { term: `The celebrity problem`, def: `With user_id sharding, a celebrity's shard serves orders of magnitude more traffic than others. Hashing doesn't help: the problem is one key, not the distribution.`, why: `Fixes: isolate hot keys on dedicated shards, replicate and cache their data, or split their data with a compound key (user_id plus a bucket or date).` },
      { term: `Compound shard keys`, def: `Shard by hash(user_id, bucket) or (user_id, month) so one heavy entity's data spreads over several shards.`, why: `Spreads write-heavy entities, but reads for that entity now fan out over its buckets.` },
      { term: `Dynamic splitting`, def: `Split a shard that grows too big or hot and move part of it elsewhere: automatic in MongoDB's balancer and DynamoDB, operator-driven in Vitess.`, why: `Rebalancing online is hard; prefer systems that do it for you.` },
      { term: `Scatter-gather queries`, def: `A query without the shard key ("top 10 posts globally") goes to every shard; the results are merged.`, why: `Cost and latency grow with the number of shards, and the slowest shard sets the response time (tail latency amplification).`, demo: `scatterGather` },
      { term: `Tail latency amplification`, def: `If each shard is slow (say past its p99) 1% of the time, a request touching 100 shards hits at least one slow shard about 63% of the time.`, why: `Fan-out turns rare slowness into common slowness. Keep common queries single-shard; use hedged requests and timeouts for fan-outs.`, demo: `scatterGather` },
      { term: `Avoiding cross-shard reads`, def: `Cache or precompute global results (leaderboards, trending), denormalize data onto the shard that reads it, or build a secondary index sharded by the other key.`, why: `If a common use case needs "query all shards", the design (or shard key) needs rethinking. Rare admin queries can just be slow.` },
      { term: `Cross-shard transactions`, def: `An operation that must change rows on two shards atomically, like a transfer between users on different shards.`, why: `There's no single database transaction across independent databases.`, demo: `saga` },
      { term: `Two-phase commit (2PC)`, def: `A coordinator asks every participant to prepare, then tells all to commit (or abort).`, why: `Atomic, but slow (extra round trips, locks held while waiting) and blocking if the coordinator fails mid-protocol. Most production systems avoid it.` },
      { term: `Sagas`, def: `Break the operation into local transactions, each with a <strong>compensating action</strong>. If a later step fails, run the compensations for completed steps in reverse.`, why: `Eventually consistent and non-blocking. Steps must be idempotent (they'll be retried), and intermediate states are visible, so design for them (e.g. "pending").`, demo: `saga` },
      { term: `Design to avoid them`, def: `Choose shard boundaries so one user's balance, history and profile live together, making most transactions single-shard.`, why: `Constantly needing distributed transactions usually means the wrong shard key.` }
    ],
    cheatsheet: [
      { title: `Challenges and responses`, type: `table`, headers: [`Challenge`, `Response`], rows: [
        [`Celebrity / hot key`, `Dedicated shard, replicas, cache, compound key`],
        [`Time-based write hot spot`, `Hash the key; time-partition only within a shard`],
        [`Global queries`, `Precompute and cache; denormalize; accept for rare queries`],
        [`Fan-out tail latency`, `Fewer shards per query, timeouts, hedged requests`],
        [`Cross-shard transaction`, `Co-locate data; saga with compensations; eventual consistency`]
      ] },
      { title: `Fan-out math`, type: `code`, body: `P(request is slow) = 1 - (1 - p)^N      p = chance one shard is slow, N = shards hit
p = 1%:   N = 1 -> 1%    N = 10 -> 9.6%    N = 100 -> 63%
p = 0.1%: N = 100 -> 9.5%` },
      { title: `Transfer saga`, type: `list`, items: [
        `1. Debit A on shard 1 (record transfer id; idempotent).`,
        `2. Credit B on shard 2.`,
        `3. If step 2 fails permanently: compensate step 1 by refunding A.`,
        `Track saga state durably (orchestrator or event log) so it resumes after crashes.`
      ] }
    ],
    interview: [
      { q: `How do you handle a celebrity user on a user_id-sharded database?`, a: `Their key generates far more reads and writes than average, so their shard runs hot. For reads, cache their profile and posts aggressively and serve from replicas. For writes or very large data, split their data with a compound key (user_id plus a bucket) across several shards, or move them to a dedicated shard via a small directory of exceptions. Then monitor per-shard load to catch new hot keys.`, diff: `medium` },
      { q: `Why are cross-shard queries expensive?`, a: `They fan out to every shard, so total work grows with the shard count and the response waits for the slowest shard. If each shard is slow 1% of the time, a query over 100 shards is slow about 63% of the time. Plus merging and sorting the partial results. Keep common queries on one shard and precompute or cache global views.`, diff: `medium` },
      { q: `How would you transfer money between users on different shards?`, a: `Avoid 2PC and use a saga: debit the sender in a local transaction recording a transfer ID, then credit the receiver in another; if the credit fails permanently, refund the sender as a compensating step. Each step is idempotent keyed by the transfer ID so retries are safe, and saga state is persisted so it resumes after crashes. Balances are briefly inconsistent across users, which is acceptable if each account's own balance stays correct.`, diff: `hard` },
      { q: `Why do production systems avoid two-phase commit?`, a: `It needs extra round trips and holds locks on every participant until the decision, so throughput and latency suffer. If the coordinator crashes after participants prepare, they're stuck holding locks until it recovers. Availability is limited by every participant being up. Sagas and co-locating data are usually preferred.`, diff: `medium` },
      { q: `You sharded posts by user_id. How do you serve "trending posts" globally?`, a: `Don't compute it on each request across all shards. A background job (or a stream processor fed by like and view events) computes the top posts periodically, and the result is stored in a cache or a small table and served directly. Trending tolerates being a minute stale, so eventual consistency is fine.`, diff: `medium` }
    ],
    labs: [`scatterGather`, `saga`]
  },
  // ------------------------------------------------------------------
  {
    id: `ch16`, part: 7, number: 16,
    title: `Consistent hashing`,
    overview: `With <code>hash(key) mod N</code>, adding or removing one server changes N and remaps almost every key, triggering a storm of data movement. <strong>Consistent hashing</strong> puts both servers and keys on a ring and assigns each key to the next server clockwise, so a membership change moves only the keys in one arc: about 1/N of the data. <strong>Virtual nodes</strong> (many positions per server) even out the load and spread a failed node's keys over all survivors. It balances keys, not traffic, so hot keys still need replication.`,
    concepts: [
      { term: `Modulo hashing`, def: `server = hash(key) mod N.`, why: `Even spread for fixed N, but changing N from 3 to 4 moves about 75% of keys (in general N/(N+1)), causing load spikes and slow or failed requests during rebalancing.`, demo: `modVsRing` },
      { term: `The hash ring`, def: `Map the hash space (e.g. 0 to 2^32 - 1) onto a circle. Place each server at hash(server id). A key belongs to the first server clockwise from hash(key).`, why: `A server only owns the arc before it, so changes are local.`, demo: `hashRing` },
      { term: `Adding a node`, def: `The new node takes over the arc between its predecessor and itself, taken from one existing node. Nothing else moves.`, why: `About 1/N of keys move instead of nearly all of them.`, demo: `modVsRing` },
      { term: `Removing a node`, def: `Its keys move to the next node clockwise; everything else stays put.`, why: `Without virtual nodes, that single successor suddenly carries double load.`, demo: `hashRing` },
      { term: `Virtual nodes`, def: `Each physical server gets many ring positions (hash("db1-vn1"), hash("db1-vn2"), ...), interleaved with other servers' positions.`, why: `Arcs average out, so each server's share is close to 1/N; a failed server's keys spread across all survivors; a new server takes a little from everyone. More virtual nodes means more even load. Servers with more capacity can get more virtual nodes.`, demo: `hashRing` },
      { term: `Hot spots are about traffic`, def: `Consistent hashing evens out the number of keys per node, not requests per key. One viral key still lands on one node.`, why: `Virtual nodes fix structural imbalance; replication, key salting (taylor-swift-0..9) and adaptive rebalancing fix workload imbalance.` },
      { term: `Replication on the ring`, def: `Store each key on the next R distinct servers clockwise (Cassandra, Dynamo).`, why: `When a node fails, replicas already hold its data, so nothing has to move immediately. Data moves only for planned membership changes, and then only a bounded fraction.` },
      { term: `Fixed hash slots`, def: `Redis Cluster divides keys into 16,384 slots with CRC16(key) mod 16384 and assigns slot ranges to nodes.`, why: `Simpler to reason about; rebalancing moves slots between nodes with more coordination. A valid alternative to discuss.` },
      { term: `Where it's used`, def: `Cassandra and Dynamo-style stores, DynamoDB partition placement, distributed caches (memcached clients), CDNs choosing which edge caches an object, load balancers needing key affinity.`, why: `Anywhere data or requests must be spread over a changing set of servers.` },
      { term: `When to go deep`, def: `In product designs, "the database (Cassandra, DynamoDB) handles partitioning with consistent hashing" is enough. In infrastructure designs (distributed cache, database, message broker), explain the ring, virtual nodes, failures, hot spots and replication.`, why: `Recognize which kind of interview you're in.` }
    ],
    cheatsheet: [
      { title: `Modulo vs consistent hashing`, type: `table`, headers: [``, `hash mod N`, `Ring`, `Ring + virtual nodes`], rows: [
        [`Keys moved adding 1 of N+1 nodes`, `~N/(N+1) (most)`, `~1/(N+1), from one node`, `~1/(N+1), from all nodes`],
        [`Node failure`, `Almost everything remaps`, `Successor takes all its keys`, `Spread across survivors`],
        [`Balance`, `Even`, `Uneven arcs`, `Close to even`],
        [`Lookup`, `O(1)`, `O(log V) binary search`, `O(log V)`]
      ] },
      { title: `Ring lookup`, type: `code`, body: `ring = sorted([(hash(f"{node}-vn{i}"), node) for node in nodes for i in range(V)])

def owner(key):
    h = hash(key)
    i = bisect_left(ring, (h,))          # first position >= h
    return ring[i % len(ring)][1]        # wrap around the circle

def replicas(key, r=3):                  # next r distinct physical nodes clockwise
    ...` },
      { title: `Interview points`, type: `list`, items: [
        `Why modulo fails when N changes.`,
        `Ring: walk clockwise to the first node.`,
        `Virtual nodes for balance and graceful failure.`,
        `Hot keys need replication or salting, not just hashing.`,
        `Replication makes failures cheap; data moves only on planned changes.`
      ] }
    ],
    interview: [
      { q: `What problem does consistent hashing solve?`, a: `Minimizing data movement when servers join or leave. With hash mod N, changing N remaps almost every key, so adding one cache node causes a near-total miss storm and adding a database shard means moving most rows. On a hash ring each key goes to the next server clockwise, so a change only affects the keys in one arc, about 1/N of the total.`, diff: `easy` },
      { q: `Why use virtual nodes?`, a: `With one position per server, arcs are uneven by chance, so some servers own much more than others, and when a server fails its whole arc goes to one neighbour, doubling that neighbour's load. With many virtual positions per server, each server's share averages out close to 1/N, a failed server's keys spread across all survivors, a new server takes a little from everyone, and bigger machines can be given more positions.`, diff: `medium` },
      { q: `Does consistent hashing fix hot keys?`, a: `No. It spreads keys evenly, but one extremely popular key still maps to one node. Hot keys need replication of that key across nodes with reads load-balanced, key salting into several sub-keys, local caching, or adaptive rebalancing. Virtual nodes fix structural imbalance; those fix traffic imbalance.`, diff: `medium` },
      { q: `Design the partitioning for a distributed cache.`, a: `Clients (or a routing proxy) hash keys onto a ring of cache nodes with a hundred or so virtual nodes each, and look up the owner with a binary search over sorted positions. Adding a node moves about 1/N of keys, so the miss storm is small and spread out. For availability, replicate each key to the next distinct node or accept misses on failure, since a cache can refill from the database. Hot keys get replicated or locally cached. Membership comes from a config service or gossip.`, diff: `hard` },
      { q: `Consistent hashing vs Redis Cluster's hash slots?`, a: `Redis Cluster hashes keys into 16,384 fixed slots and assigns slot ranges to nodes; rebalancing moves slots, and keys never change slot. It's like consistent hashing with many fixed virtual partitions: easy to reason about and inspect, with explicit coordination when moving slots. A ring with random virtual node positions needs less central assignment but is harder to reason about precisely.`, diff: `hard` }
    ],
    labs: [`modVsRing`, `hashRing`]
  },
  // ------------------------------------------------------------------
  {
    id: `ch17`, part: 8, number: 17,
    title: `CAP theorem and consistency models`,
    overview: `CAP says a distributed system can't guarantee all of <strong>consistency</strong> (every read sees the latest write), <strong>availability</strong> (every request to a working node gets a response) and <strong>partition tolerance</strong> (it keeps working when the network splits). Partitions happen whatever you do, so the real question is: <strong>during a partition, do you return possibly stale data or refuse?</strong> Ask it early, during non-functional requirements, and answer it per feature: bookings and payments choose consistency, profiles and feeds choose availability. Beyond that binary sits a spectrum of consistency models.`,
    concepts: [
      { term: `The three properties`, def: `<strong>C</strong>onsistency: all nodes return the most recent write. <strong>A</strong>vailability: every request to a non-failing node gets a non-error response, possibly stale. <strong>P</strong>artition tolerance: the system keeps operating despite lost messages between nodes.`, why: `CAP's "consistency" means linearizability, which is not the C in ACID (which is about application invariants).`, demo: `capPartition` },
      { term: `P is not optional`, def: `In any distributed system networks fail, so partitions will occur. The choice is only what to do while one is happening.`, why: `"We'll pick CA" isn't a real option for a distributed system; say "consistency or availability during a partition".`, demo: `capPartition` },
      { term: `Choosing consistency (CP)`, def: `During a partition, nodes that can't confirm they have the latest data refuse or time out rather than answer.`, why: `For seat and ticket booking, inventory, payments and order books, where acting on stale data causes double booking, overselling or wrong trades.`, demo: `capPartition` },
      { term: `Choosing availability (AP)`, def: `Every node keeps answering with what it has; replicas converge after the partition heals (eventual consistency), with conflicts resolved by rules such as last-write-wins.`, why: `For social profiles, content descriptions, reviews and feeds, where briefly stale data beats an error.`, demo: `capPartition` },
      { term: `The key question`, def: `"Would it be catastrophic if users briefly saw inconsistent data?" or "Must every read see the latest write?"`, why: `Yes means prioritize consistency; no means availability.` },
      { term: `Per-feature choices`, def: `One product often needs both: Ticketmaster books seats consistently but serves event pages for availability; a dating app needs consistent matches but can show slightly stale profiles.`, why: `Saying this explicitly is a senior-level signal.` },
      { term: `Designing for consistency`, def: `A single primary database (or consensus-replicated store) for the critical data, synchronous replication or quorum reads, distributed transactions where unavoidable. PostgreSQL, Spanner, DynamoDB strongly consistent reads.`, why: `Costs latency and, during failures, availability.` },
      { term: `Designing for availability`, def: `Asynchronous replicas serving reads, multi-region writes, change data capture propagating updates to caches and search. Cassandra, DynamoDB global tables, Redis replicas.`, why: `Fast and always up, but readers may see stale data.` },
      { term: `Quorums`, def: `With N replicas, writes wait for W acknowledgements and reads query R replicas. If R + W &gt; N, every read set overlaps the latest write set, so reads see it.`, why: `Tunable consistency in Dynamo-style stores: (N=3, W=2, R=2) for consistency, (W=1, R=1) for speed and availability.`, demo: `quorum` },
      { term: `Strong consistency`, def: `Every read reflects the most recent completed write, as if there were one copy.`, why: `Most expensive; needed for balances and bookings.` },
      { term: `Causal consistency`, def: `Operations that depend on each other are seen in the same order by everyone (a reply never appears before the comment it answers); unrelated operations may be seen in different orders.`, why: `Cheaper than strong consistency and removes the most confusing anomalies.` },
      { term: `Read-your-own-writes`, def: `A user always sees their own updates immediately, even if others see them later.`, why: `Common for profiles and posts. Implement by reading from the primary (or a caught-up replica) for that user for a short time after they write.` },
      { term: `Eventual consistency`, def: `If writes stop, all replicas eventually converge. No guarantee about what a read sees meanwhile.`, why: `Default for most distributed databases and DNS; what you're choosing when you choose availability.` },
      { term: `PACELC`, def: `Extends CAP: if there's a Partition, choose A or C; Else, choose Latency or Consistency.`, why: `Even without failures, stronger consistency costs latency (waiting for replicas), which is the trade-off you face most of the time.` }
    ],
    cheatsheet: [
      { title: `Consistency or availability?`, type: `table`, headers: [`System / feature`, `Choose`, `Why`], rows: [
        [`Seat or ticket booking`, `Consistency`, `No double booking`],
        [`Inventory, checkout`, `Consistency`, `No overselling`],
        [`Payments, balances, order books`, `Consistency`, `Money and prices must be exact`],
        [`Social profiles, posts, likes`, `Availability`, `Stale for seconds is fine`],
        [`Product or event descriptions`, `Availability`, `Old text beats an error`],
        [`Reviews, feeds, recommendations`, `Availability`, `Freshness is nice-to-have`]
      ] },
      { title: `Consistency spectrum`, type: `table`, headers: [`Model`, `Guarantee`, `Example use`], rows: [
        [`Strong (linearizable)`, `Reads see the latest write`, `Bank balance, seat locks`],
        [`Causal`, `Dependent events in order for all`, `Comments and replies`],
        [`Read-your-writes`, `You see your own updates`, `Editing your profile`],
        [`Eventual`, `Replicas converge eventually`, `Like counts, DNS`]
      ] },
      { title: `Quorum rule`, type: `code`, body: `N = replicas, W = write acks, R = replicas read
R + W > N   -> read and write sets overlap -> reads see the latest write
N=3: W=2,R=2 (balanced)   W=3,R=1 (fast reads)   W=1,R=1 (fast, may be stale)
Writes need W reachable replicas; reads need R: a partition can block either.` }
    ],
    interview: [
      { q: `Explain the CAP theorem in one minute.`, a: `A distributed system can't guarantee consistency, availability and partition tolerance all at once. Since network partitions will happen, the practical choice is what to do during one: refuse requests that might return stale data (consistency) or keep answering with possibly stale data (availability). For example, if the US and EU replicas lose contact, should an EU reader see a possibly outdated profile name or an error?`, diff: `easy` },
      { q: `Which would you choose for a ticket booking system?`, a: `Consistency for booking: two users must never get the same seat, so seat reservation goes through a strongly consistent store (a single primary or consensus-replicated database, with a seat lock or conditional update), and it's acceptable to fail a booking during a partition. Event browsing chooses availability: slightly stale descriptions or availability counts from caches and replicas are fine.`, diff: `medium` },
      { q: `What does R + W > N mean?`, a: `In a quorum system with N replicas, a write is acknowledged by W of them and a read asks R of them. If R + W &gt; N, any read set must include at least one replica that took the latest write, so the read can return it (using version numbers to pick the newest). With N=3, W=2 and R=2 you get that overlap while tolerating one replica being down.`, diff: `medium` },
      { q: `What is read-your-own-writes consistency and how do you implement it?`, a: `A user always sees their own changes immediately, even if replicas lag for others. Implement by routing that user's reads to the primary for a short window after they write, or reading from a replica only if it has caught up to the user's last write position, or by serving their own content from their session or the response they already got.`, diff: `medium` },
      { q: `Is CAP's consistency the same as ACID's consistency?`, a: `No. CAP consistency means every read sees the most recent write across replicas (linearizability). ACID consistency means a transaction takes the database from one valid state to another, respecting constraints and invariants, which is mostly up to the application. A single-node ACID database isn't subject to CAP trade-offs at all.`, diff: `easy` },
      { q: `What is PACELC and why is it useful?`, a: `It extends CAP: during a Partition choose Availability or Consistency; Else, in normal operation, choose Latency or Consistency. It captures the everyday trade-off: waiting for synchronous replication or quorums makes every request slower even when nothing is broken. DynamoDB and Cassandra default to lower latency; Spanner pays latency for consistency.`, diff: `hard` }
    ],
    labs: [`capPartition`, `quorum`]
  },
  // ------------------------------------------------------------------
  {
    id: `ch18`, part: 9, number: 18,
    title: `Numbers to know and back-of-the-envelope estimation`,
    overview: `Scale decisions (cache or not, shard or not, one region or many) depend on knowing what modern hardware can do. Numbers from older books underestimate it by orders of magnitude and lead to over-engineered designs. Know a few <strong>latencies</strong> (memory, SSD, network within and across regions), <strong>capacities</strong> (RAM and disk per machine) and <strong>throughputs</strong> (requests per second for app servers, caches, databases and queues), and practise turning daily active users into requests per second, storage and bandwidth.`,
    concepts: [
      { term: `Modern servers are big`, def: `General-purpose instances offer hundreds of GiB of RAM and 100+ vCPUs (e.g. 512 GiB, 128 vCPUs); memory-optimized instances reach 4 TB and even 24 TB of RAM.`, why: `Many workloads that once needed a cluster fit on one machine, including entire datasets in memory.`, demo: `estimator` },
      { term: `Storage is cheap and large`, def: `Tens of TB of local NVMe SSD per instance (60 TB), hundreds of TB of HDD (336 TB), and effectively unlimited object storage (S3) for blobs.`, why: `Storage size alone is rarely the reason to shard; put large objects in object storage, not the database.` },
      { term: `Network`, def: `25 Gbps is standard within a data centre, 50-100+ Gbps for high-performance instances. Latency: under 1 ms within an availability zone, 1-2 ms across zones in a region, 50-150 ms across regions.`, why: `Cross-region round trips dominate; same-region calls are cheap enough to chain a few.`, demo: `latencyLadder` },
      { term: `Latency ladder`, def: `Roughly: L1 cache ~1 ns, main memory ~100 ns, SSD random read ~100 µs, same-zone network round trip ~0.5 ms, HDD seek ~10 ms, cross-region round trip ~100 ms.`, why: `Each step is 10-1000x the last; memory is ~1,000x faster than SSD and SSD ~100x faster than HDD seeks.`, demo: `latencyLadder` },
      { term: `Cache numbers (Redis)`, def: `Sub-millisecond reads and writes; on the order of 100K+ operations per second per instance (more with pipelining or clustering); memory from tens of GB up to ~1 TB per node.`, why: `A single cache node handles most interview read loads; shard the cache when data or throughput exceeds one node.`, demo: `estimator` },
      { term: `Database numbers (PostgreSQL/MySQL)`, def: `Tens of TB of data per primary is manageable; indexed point reads in ~1-5 ms (faster when cached); thousands to tens of thousands of writes per second and tens of thousands of simple reads per second per node, more with replicas.`, why: `Shard when sustained writes approach the low tens of thousands per second, data approaches tens of TB, or replicas and caches can't absorb reads.`, demo: `estimator` },
      { term: `Application servers`, def: `Tens of cores and 64-512 GB RAM; thousands to tens of thousands of requests per second for simple endpoints; 100K+ concurrent idle connections with async I/O.`, why: `Stateless servers scale horizontally; CPU usage, not connection count, is usually what to watch.` },
      { term: `Message queues (Kafka)`, def: `Hundreds of thousands to ~1M messages per second per broker, single-digit-millisecond latency, retention from days to weeks and many TB per broker.`, why: `A queue is rarely the bottleneck; partitions set the parallelism.` },
      { term: `Converting DAU to QPS`, def: `Requests per second = DAU x requests per user per day / 86,400 (round to 100K seconds). Peak is typically 2-10x the average.`, why: `10M DAU x 20 requests = 200M per day = ~2,300 per second on average, maybe 10K at peak: one database plus a cache territory.`, demo: `estimator` },
      { term: `Storage estimates`, def: `Storage per year = writes per day x bytes per write x 365, times the replication factor; keep media separate (object storage).`, why: `Text records are small: 100M records x 1 KB = 100 GB. Media is what gets big.`, demo: `estimator` },
      { term: `Read:write ratio`, def: `Most consumer apps read 10-100x more than they write.`, why: `High ratios point to caches and read replicas; write-heavy systems point to LSM stores, queues and sharding.` },
      { term: `Over-engineering is a red flag`, def: `Sharding a database that fits on one machine, caching data that's already fast, multi-region for a regional app.`, why: `Using modern numbers shows hands-on judgment; outdated limits (split at 100 GB, avoid large memory) show book knowledge only.` }
    ],
    cheatsheet: [
      { title: `Latencies`, type: `table`, headers: [`Operation`, `Time`, `Relative`], rows: [
        [`L1 cache reference`, `~1 ns`, `1x`],
        [`Main memory reference`, `~100 ns`, `100x`],
        [`Read 1 MB sequentially from memory`, `~10-50 µs`, ``],
        [`SSD random read`, `~16-100 µs`, `~1,000x memory`],
        [`Redis GET in the same zone`, `~0.2-1 ms`, ``],
        [`Round trip within an AZ`, `~0.5 ms`, ``],
        [`Round trip across AZs`, `~1-2 ms`, ``],
        [`HDD seek`, `~10 ms`, ``],
        [`Indexed DB query (on disk)`, `~1-10 ms`, ``],
        [`Cross-region round trip`, `~50-150 ms`, ``]
      ] },
      { title: `Component limits (rough, one node)`, type: `table`, headers: [`Component`, `Throughput`, `Capacity`, `Scale out when`], rows: [
        [`App server`, `1K-10K+ req/s`, `64-512 GB RAM`, `CPU-bound`],
        [`Redis`, `~100K+ ops/s`, `up to ~1 TB RAM`, `Data or ops exceed a node`],
        [`PostgreSQL / MySQL`, `~5-20K writes/s, more reads`, `tens of TB`, `Writes or data exceed a primary`],
        [`Kafka broker`, `~100K-1M msgs/s`, `tens of TB`, `Throughput per partition`],
        [`Object storage`, `Very high, per-prefix limits`, `Unlimited`, `-`]
      ] },
      { title: `Estimation template`, type: `code`, body: `QPS (avg)    = DAU x actions/user/day / 86,400     (~1e5 s/day)
QPS (peak)   = avg x 2-10
storage/yr   = writes/day x bytes/write x 365 x replication
bandwidth    = QPS x response size
cache size   = hot fraction (e.g. 20%) x daily read set

1M req/day   ~ 12 req/s        100M req/day ~ 1,200 req/s
1 KB x 1B    = 1 TB            1 MB x 1M    = 1 TB` }
    ],
    interview: [
      { q: `Estimate the QPS for a service with 50M daily active users who each make 30 requests per day.`, a: `50M x 30 = 1.5 billion requests per day. Divided by about 86,400 seconds (round to 100,000) that's roughly 15-17K requests per second on average. Peaks are typically 2-5x, so plan for 50-80K per second. That's a fleet of stateless app servers behind a load balancer; whether the database needs a cache or sharding depends on the read:write split and what each request touches.`, diff: `easy` },
      { q: `Your schema has 500M users at 5 KB each. Do you need to shard?`, a: `500M x 5 KB = 2.5 TB. One modern PostgreSQL primary with fast SSDs handles that, plus read replicas for read throughput. I wouldn't shard for storage yet; I'd shard if write throughput approaches what one primary sustains (tens of thousands per second) or if 10x growth is expected soon, and I'd pick the shard key now so it's ready.`, diff: `medium` },
      { q: `How much faster is a Redis read than a database read, and why?`, a: `Roughly 1 ms or less for Redis versus 5-50 ms for a database query that touches disk or does more work. Redis keeps data in memory with simple key lookups, while a database may read pages from SSD, use indexes, take locks and parse SQL. Memory access is about 1,000x faster than an SSD read.`, diff: `easy` },
      { q: `Why are outdated numbers a problem in interviews?`, a: `They lead to over-engineering: sharding at 100 GB, distributing data that fits in one machine's RAM, or avoiding caching objects that easily fit in memory. Modern machines have hundreds of GB to TBs of RAM and tens of TB of SSD, and a single database or cache node handles far more than older rules of thumb suggest. Using current numbers signals real experience.`, diff: `easy` },
      { q: `Estimate storage for a photo-sharing app: 10M uploads per day, 2 MB per photo, kept 5 years.`, a: `10M x 2 MB = 20 TB per day; per year about 7.3 PB; over 5 years about 36 PB, before replication or multiple resolutions. That clearly belongs in object storage (S3) with a CDN in front; the database only stores metadata: 10M rows per day at around 1 KB is 10 GB per day, about 3.6 TB per year, which fits comfortably in a sharded or even single relational database for a while.`, diff: `medium` },
      { q: `How many concurrent WebSocket connections can one server hold?`, a: `With async I/O, a single modern server can hold on the order of 100K or more mostly idle connections; the limits are memory per connection (tens of KB), file descriptors and CPU for the messages actually flowing. So 10M concurrent users means roughly 100+ connection servers, plus a way to route messages to the server holding each user's connection.`, diff: `medium` }
    ],
    labs: [`latencyLadder`, `estimator`]
  }
);
