// Deep dive: Scaling Reads. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP["scaling-reads"] = {
  hook: `<p>A read-heavy system rarely fails all at once. It degrades: the feed query that took 5 ms at launch takes 80 ms a year later, the database CPU sits at 90% every evening, and then one evening a popular post goes viral, a cache node restarts, and the database is suddenly asked for twenty times its usual load.</p><p>This deep dive goes one level below the Main tab: where read cost actually comes from, how replicas and caches are kept honest about staleness, the exact races that leave a cache wrong, how stampedes and hot keys form and how to stop them, and how to reason about failures on the read path. The basic mechanics of indexes, caches and sharding live in Core Concepts; here the focus is on choosing between the options and making them safe.</p>`,
  sections: [
    {
      id: `read-cost`,
      title: `Where read cost comes from`,
      kicker: `Diagnose before scaling`,
      blocks: [
        { type: `text`, html: `<p>"The database is slow" has a few distinct causes, and each points at a different rung of the ladder. Naming the cause is what separates a reasoned answer from a reflexive "add Redis".</p>` },
        { type: `table`, title: `Symptom, cause, first fix`, headers: [`Symptom`, `Likely cause`, `First fix`], rows: [
          [`One query type is slow even when the system is idle`, `Full scans or a bad plan`, `An index matching the filter and sort`],
          [`Queries slow as tables grow, idle or not`, `Joins or aggregates over growing data`, `Denormalise or precompute`],
          [`Fast when quiet, slow at peak, CPU high`, `Too many reads for one machine`, `Read replicas, then a cache`],
          [`Slow at peak, disk reads high, memory full`, `Working set no longer fits in RAM`, `More memory, a cache, or sharding`],
          [`A few keys or rows dominate`, `Skewed popularity`, `Cache the hot items, handle hot keys`],
          [`Writes also slow, replicas lagging`, `Write load, not read load`, `Scaling writes, not this chapter`]
        ] },
        { type: `text`, html: `<p>The memory point deserves emphasis. A database is fast when the pages it needs are in its buffer cache and slow when it has to fetch them from disk. As long as the <strong>working set</strong> (the rows and index pages that hot queries touch) fits in RAM, a single server can serve a surprising load. When it stops fitting, latency jumps even though nothing in the code changed. That is why "a bigger machine with more memory" is a legitimate rung, and why an index that is too large to stay in memory is a sign that sharding is near.</p>` },
        { type: `callout`, tone: `mistake`, title: `Scaling the wrong thing`, html: `<p>Replicas add capacity, not speed. A 400 ms query is still 400 ms on a replica; you just can run more of them at once. If the complaint is latency on individual requests, the fix is on rung 1 (cheaper queries) or rung 3 (skip the database), not rung 2.</p>` },
        { type: `quiz`, q: `A dashboard query takes 2 seconds even at 3 a.m. when traffic is near zero. Which fix addresses the cause?`, options: [`Add three read replicas`, `Put a CDN in front of the dashboard`, `Look at the query plan, then index or precompute the result`, `Shard the database by customer`], answer: 2, explain: `Slowness with no load means each execution does too much work. Replicas and sharding add capacity for many concurrent queries but leave each one just as slow. A CDN can't cache a per-customer dashboard. Fix the query itself, or precompute its result.` },
      ],
    },
    {
      id: `read-models`,
      title: `Shaping data for reads: denormalisation and precomputation`,
      kicker: `Rung 1 in depth`,
      blocks: [
        { type: `text`, html: `<p>Normalised schemas are designed for correct writes: every fact stored once. Read-heavy systems often benefit from the opposite: store data the way screens consume it, even if that means storing it more than once. This is the idea behind <strong>read models</strong>: a table, document or list built specifically to answer one kind of read cheaply.</p>` },
        { type: `list`, items: [
          `<strong>Copied columns:</strong> the author's display name on each post, the product's current price on each cart line. A read skips a join.`,
          `<strong>Counters:</strong> like_count, follower_count, comment_count kept on the parent row instead of counting child rows on every view.`,
          `<strong>Materialised views and summary tables:</strong> the result of an aggregate query stored as a table and refreshed periodically or incrementally.`,
          `<strong>Precomputed lists:</strong> a per-user home feed of post IDs, built when posts are created (fan-out on write) so reading the feed is a single lookup.`,
        ] },
        { type: `code`, title: `A materialised view for a trending page (PostgreSQL)`, lang: `sql`, code: `CREATE MATERIALIZED VIEW trending_posts AS
SELECT p.id, p.title, p.author_name, count(l.*) AS likes_24h
FROM posts p
JOIN likes l ON l.post_id = p.id AND l.created_at > now() - interval '24 hours'
GROUP BY p.id
ORDER BY likes_24h DESC
LIMIT 100;

-- A unique index lets the refresh run without blocking readers.
CREATE UNIQUE INDEX ON trending_posts (id);

-- Run every minute from a scheduler; reads always hit the stored result.
REFRESH MATERIALIZED VIEW CONCURRENTLY trending_posts;`, caption: `Reads become a scan of 100 stored rows. The page is at most a minute stale, which is fine for "trending".` },
        { type: `tradeoffs`, prosLabel: `What you gain`, consLabel: `What you take on`, pros: [`Reads become simple key lookups or small scans`, `No new infrastructure and no new failure mode`, `Pays off more the higher the read:write ratio`], cons: [`Every write must update the copies (or a job must)`, `Copies can disagree briefly, or permanently if an update path is forgotten`, `Precomputed results are only as fresh as their last refresh`] },
        { type: `callout`, tone: `insight`, title: `Moving cost from reads to writes`, html: `<p>Denormalisation and fan-out on write are the same trade: do more work once, when data changes, to do less work many times, when it is read. At 100 reads per write, spending ten times more on each write still cuts total work sharply. The trade breaks for outliers, such as an account with millions of followers, where one post would trigger millions of feed writes; those are usually merged in at read time instead.</p>` },
      ],
    },
    {
      id: `replicas-and-lag`,
      title: `Read replicas, replication lag and session guarantees`,
      kicker: `Rung 2 in depth`,
      blocks: [
        { type: `text`, html: `<p>A replica follows the primary's change log (the write-ahead log in PostgreSQL, the binary log in MySQL) and replays it. How the primary waits for replicas decides how stale they can be:</p>` },
        { type: `table`, headers: [`Mode`, `Primary commits when`, `Replica staleness`, `Write latency`], rows: [
          [`Asynchronous`, `Its own log is durable`, `Milliseconds normally, unbounded under stress`, `Lowest`],
          [`Semi-synchronous`, `At least one replica has received the change`, `Same for reads; less data lost on failover`, `One network round trip more`],
          [`Synchronous`, `Chosen replicas have the change (and, if configured, applied it)`, `Can be zero for those replicas`, `Highest; a slow replica slows every write`]
        ], note: `Most read-scaling setups use asynchronous replicas and handle staleness in the application.` },
        { type: `text`, html: `<p>Lag grows when the replica can't replay as fast as the primary writes: a burst of writes, a long transaction that must be applied in one piece, a replica with weaker hardware, or a long-running query on the replica that conflicts with replay. Monitor it directly: PostgreSQL reports per-replica lag in <code>pg_stat_replication</code>, MySQL in <code>SHOW REPLICA STATUS</code>. Alert on it, and take a replica out of the read pool when it falls too far behind.</p>` },
        { type: `keypoints`, title: `Session guarantees worth naming`, items: [
          `<strong>Read-your-own-writes:</strong> after I write, my reads see that write. Fix with a primary-after-write window, or a log-position token.`,
          `<strong>Monotonic reads:</strong> I never see data go backwards. Without it, two reloads hitting two replicas with different lag can show a comment, then hide it. Fix by pinning a user's session to one replica (hash the user ID), or with the same token.`,
          `<strong>Everyone else:</strong> usually fine with eventual consistency. Not every read needs a guarantee, which is what makes replicas cheap.`,
        ] },
        { type: `diagram`, title: `Routing a read with a log-position token`, caption: `The write returns the primary's log position (LSN 1042). The client sends it with its next read. Replica A has replayed only to 1038, so the router skips it; replica B is at 1045 and answers. If no replica is far enough along, the router uses the primary.`, svg: `<svg viewBox="0 0 620 260" role="img" aria-label="Write returns LSN 1042; router sends the next read to the replica that has replayed past it">
<defs><marker id="pt4-tok" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="20" y="100" width="100" height="50" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<text x="70" y="122" text-anchor="middle" font-size="13" font-weight="700">Client</text>
<text x="70" y="140" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">holds LSN 1042</text>
<rect x="190" y="100" width="100" height="50" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="240" y="130" text-anchor="middle" font-size="13" font-weight="700">Router</text>
<rect x="400" y="20" width="200" height="50" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="500" y="42" text-anchor="middle" font-size="13" font-weight="700">Primary</text>
<text x="500" y="60" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">at LSN 1047</text>
<rect x="400" y="110" width="200" height="50" rx="8" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)"/>
<text x="500" y="132" text-anchor="middle" font-size="13" font-weight="700">Replica A</text>
<text x="500" y="150" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">replayed to 1038: too old</text>
<rect x="400" y="190" width="200" height="50" rx="8" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)"/>
<text x="500" y="212" text-anchor="middle" font-size="13" font-weight="700">Replica B</text>
<text x="500" y="230" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">replayed to 1045: serves</text>
<path d="M70 100 L70 45 L398 45" fill="none" stroke-width="2" style="stroke: var(--dg-1)" marker-end="url(#pt4-tok)"/>
<text x="80" y="38" font-size="12" style="fill: var(--dg-ink)">1. write, returns LSN 1042</text>
<line x1="120" y1="125" x2="188" y2="125" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#pt4-tok)"/>
<text x="124" y="176" font-size="12" style="fill: var(--dg-ink)">2. read + 1042</text>
<line x1="290" y1="128" x2="398" y2="135" stroke-width="2" stroke-dasharray="5 4" style="stroke: var(--dg-bad)"/>
<line x1="290" y1="140" x2="398" y2="210" stroke-width="2" style="stroke: var(--dg-ok)" marker-end="url(#pt4-tok)"/>
<text x="300" y="200" font-size="12" style="fill: var(--dg-ink)">3. route</text>
</svg>` },
        { type: `code`, title: `Log positions in PostgreSQL`, lang: `sql`, code: `-- On the primary, right after the write commits:
SELECT pg_current_wal_lsn();          -- e.g. 0/3000148, returned to the client

-- On a replica, before serving a read that carries that token:
SELECT pg_last_wal_replay_lsn() >= '0/3000148'::pg_lsn AS caught_up;
-- caught_up = false: try another replica, wait briefly, or read the primary.` , caption: `MySQL offers the same idea with GTIDs: a replica can wait until a given GTID set has been applied (WAIT_FOR_EXECUTED_GTID_SET).` },
        { type: `lab`, id: `srReplicaLag`, caption: `Compare the four routing strategies under the same lag. The token strategy gets zero stale reads while sending only the reads that need it to the primary.` },
        { type: `quiz`, q: `A user posts a comment, reloads, sees it, reloads again, and it's gone; a third reload shows it again. What is happening?`, options: [`The comment was written twice`, `Reloads are hitting different replicas with different lag: a monotonic-reads violation`, `The cache TTL is too long`, `The primary rolled back the write`], answer: 1, explain: `The first reload reached a replica that had applied the write, the second one a replica that hadn't. Pinning each user to one replica, or carrying the last-seen log position, prevents reads from going backwards.` },
      ],
    },
    {
      id: `sharding-for-reads`,
      title: `When replicas aren't enough: sharding for reads`,
      kicker: `Rung 2, continued`,
      blocks: [
        { type: `text`, html: `<p>Every replica stores the whole dataset. Once the data, or the indexes that hot queries need, stop fitting in one machine's memory, adding replicas multiplies a slow machine. Sharding splits the data so each machine holds a slice small enough to be fast again. For reads, the decisive question is whether a read can be answered by <strong>one</strong> shard.</p>` },
        { type: `compare`, items: [
          { title: `Reads include the shard key`, tone: `ok`, html: `<p>Shard posts by author_id, read a profile's posts by author_id: one shard answers. Capacity grows with the number of shards.</p>` },
          { title: `Reads don't include it`, tone: `bad`, html: `<p>Search posts by hashtag across author-sharded data: every shard must be asked (scatter-gather). The slowest shard sets the latency, and adding shards adds work to every query. Build a separate index or read model keyed by hashtag instead.</p>` },
        ] },
        { type: `callout`, tone: `tip`, title: `Order of moves`, html: `<p>For a problem that is purely about read volume, caching usually comes before sharding because it is cheaper to operate and removes load entirely. Sharding becomes unavoidable when the data size or the write rate outgrows one primary. The mechanics, shard keys and rebalancing are in <a href="../../core-concepts/ch14/">Core Concepts ch14</a>.</p>` },
      ],
    },
    {
      id: `cache-consistency`,
      title: `Keeping a cache honest when data changes`,
      kicker: `Rung 3 in depth`,
      blocks: [
        { type: `text`, html: `<p>With cache-aside, the application owns two copies of the data and nothing makes them agree automatically. The standard rule is: <strong>write the database, then delete the cache key</strong>. Deleting rather than writing the new value avoids a race where two concurrent writers set the cache in the opposite order from the one in which they committed. The next read repopulates the key from the database.</p><p>Even delete-on-write leaves one narrow race, and interviewers who know caching like to ask about it.</p>` },
        { type: `diagram`, title: `The stale-set race`, caption: `A reader misses and reads the old value v1 from the database. Before it writes that to the cache, a writer commits v2 and deletes the key (there's nothing to delete yet). The reader then sets v1. The cache now holds v1 until its TTL expires, although the database has v2.`, svg: `<svg viewBox="0 0 620 250" role="img" aria-label="Timeline: reader reads v1, writer commits v2 and deletes, reader sets stale v1 in cache">
<defs><marker id="pt4-race" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<text x="20" y="64" font-size="13" font-weight="700">Reader</text>
<text x="20" y="134" font-size="13" font-weight="700">Writer</text>
<text x="20" y="204" font-size="13" font-weight="700">Cache</text>
<line x1="100" y1="60" x2="600" y2="60" stroke-width="2" style="stroke: var(--dg-line)"/>
<line x1="100" y1="130" x2="600" y2="130" stroke-width="2" style="stroke: var(--dg-line)"/>
<line x1="100" y1="200" x2="600" y2="200" stroke-width="2" style="stroke: var(--dg-line)"/>
<rect x="110" y="44" width="110" height="32" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="165" y="65" text-anchor="middle" font-size="12">miss, read v1</text>
<rect x="240" y="114" width="130" height="32" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="305" y="135" text-anchor="middle" font-size="12">commit v2</text>
<rect x="380" y="114" width="90" height="32" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="425" y="135" text-anchor="middle" font-size="12">delete key</text>
<rect x="485" y="44" width="105" height="32" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="537" y="65" text-anchor="middle" font-size="12">set v1</text>
<line x1="537" y1="76" x2="537" y2="182" stroke-width="2" style="stroke: var(--dg-bad)" marker-end="url(#pt4-race)"/>
<rect x="470" y="184" width="135" height="32" rx="6" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)"/>
<text x="537" y="205" text-anchor="middle" font-size="12" font-weight="700">holds stale v1</text>
<text x="100" y="240" font-size="12" style="fill: var(--dg-muted)">time →  database holds v2 from "commit v2" onward</text>
</svg>` },
        { type: `text`, html: `<p>The window is small, so for most products a short TTL is an acceptable bound. When it isn't, there are three common tightenings:</p>` },
        { type: `list`, items: [
          `<strong>Leases:</strong> a cache miss hands the reader a token; a delete invalidates outstanding tokens, and the cache refuses a set whose token is no longer valid. Facebook described this for memcache, where leases also throttle how many clients rebuild the same key.`,
          `<strong>Versioned values:</strong> store a version (or the row's update timestamp) with the cached value and only accept a set that is newer than what is there.`,
          `<strong>Invalidation from the change log:</strong> instead of the application deleting keys, a consumer tails the database's log (CDC) and deletes or updates keys in commit order. Nothing depends on every code path remembering to invalidate, and many caches across regions can be kept in step.`,
        ] },
        { type: `table`, title: `Choosing a freshness strategy`, headers: [`Strategy`, `Staleness`, `Effort`, `Fits`], rows: [
          [`TTL only`, `Up to the TTL`, `Trivial`, `Counts, trending lists, anything "roughly right"`],
          [`Delete on write + TTL`, `Usually none; race window bounded by TTL`, `Low`, `Most entity caches (users, products, posts)`],
          [`CDC-driven invalidation`, `Seconds of pipeline lag; no forgotten paths`, `A connector and consumers`, `Many caches, many writers, several services`],
          [`Write-through`, `None on the write path; still racy with readers`, `Medium`, `Data read right after it's written`],
          [`Don't cache`, `None`, `None`, `Balances, inventory at purchase, permissions`]
        ] },
        { type: `quiz`, q: `Why do most designs delete the cache key after a database write instead of writing the new value into the cache?`, options: [`Deleting is faster than writing`, `Two concurrent writers could otherwise leave the older value in the cache, in an order that disagrees with the database`, `Caches can't store updated values`, `It avoids needing a TTL`], answer: 1, explain: `If writer A commits first and writer B second, but B's cache write lands before A's, the cache keeps A's older value indefinitely. A delete is the same no matter the order, and the next read fetches whatever the database holds.` },
      ],
    },
    {
      id: `stampedes`,
      title: `Stampedes: when a popular entry goes missing`,
      kicker: `Deep dive`,
      blocks: [
        { type: `problem`, html: `<p>A key read 5,000 times per second expires. Rebuilding it takes 200 ms. In that window about 1,000 requests miss and all run the same query. If the database slows under the burst, the rebuild takes longer, more requests miss, and the load feeds itself. The cache that was protecting the database becomes the trigger for its outage.</p>` },
        { type: `steps`, title: `Defences, from simplest to strongest`, items: [
          `<strong>TTL jitter.</strong> Add a random spread to TTLs (300 s plus 0-60 s) so keys written together don't all expire together. Cheap and always worth doing, but it does nothing for a single hot key.`,
          `<strong>Single-flight per process.</strong> Inside each app server, the first request for a missing key fetches it and concurrent requests for the same key wait on that result. The database sees one query per server.`,
          `<strong>Distributed rebuild lock.</strong> A request that misses tries to set a short-lived lock key in the cache (set-if-absent with an expiry). The winner rebuilds; the others wait a few milliseconds and re-read, or serve a fallback. One query in total. The expiry matters: if the rebuilder crashes, the lock must free itself.`,
          `<strong>Stale-while-revalidate.</strong> Keep two expiries: a soft one after which the value should be refreshed, and a hard one after which it must not be served. Between them, serve the old value and let one request refresh it in the background. Nobody waits. HTTP caches support the same idea with the stale-while-revalidate Cache-Control extension.`,
          `<strong>Probabilistic early refresh.</strong> Each read recomputes the value early with a probability that grows as expiry approaches and with how long the rebuild takes. Under heavy traffic, some request almost certainly refreshes just before expiry, so the key never goes missing.`,
        ] },
        { type: `code`, title: `Probabilistic early expiration (the "XFetch" rule)`, lang: `python`, code: `import math, random, time

def fetch(key, recompute, ttl, beta=1.0):
    entry = cache.get(key)                 # stores value, delta (rebuild seconds), expiry
    now = time.time()
    # Refresh early with rising probability as expiry nears; slow rebuilds start earlier.
    if entry is None or now - entry.delta * beta * math.log(random.random()) >= entry.expiry:
        start = time.time()
        value = recompute()
        delta = time.time() - start
        cache.set(key, Entry(value, delta, now + ttl), ttl)
        return value
    return entry.value`, caption: `log(random()) is negative, so the check moves "now" forward by a random amount scaled by the rebuild time. beta above 1 refreshes earlier. The rule comes from the 2015 VLDB paper "Optimal Probabilistic Cache Stampede Prevention" by Vattani, Chierichetti and Lowenstein.` },
        { type: `lab`, id: `srStampede`, caption: `Push reads up to 30K/s with a 500 ms rebuild and "no protection": the rebuild window feeds itself. Then compare one query per server, one query in total, and no waiting at all.` },
        { type: `callout`, tone: `interview`, title: `A complete answer`, html: `<p>"Hot keys get a soft and a hard TTL. After the soft TTL we serve the stale value and one request, holding a short lock in Redis, refreshes it in the background. All TTLs get jitter. Inside each server we coalesce concurrent misses with single-flight, so even the lock is contested by one request per server." That covers the hot key, the many-keys case, and the per-server burst.</p>` },
      ],
    },
    {
      id: `hot-keys`,
      title: `Hot keys: when one item gets everyone's attention`,
      kicker: `Deep dive`,
      blocks: [
        { type: `text`, html: `<p>Caches are sharded by key, which spreads load evenly only if popularity is spread evenly. It rarely is. A celebrity's post, the product in a flash sale or the score of a final can draw a large share of all reads to one key, and therefore one cache node. Adding nodes doesn't move a single key; the hot node saturates while the rest idle.</p>` },
        { type: `compare`, items: [
          { title: `Replicate the key`, tone: `info`, html: `<p>Store N copies under derived names (post:42#0 to post:42#7) that hash to different shards; readers pick one at random. Load splits N ways. Updates must write or delete all N copies, and readers may briefly see different versions.</p>` },
          { title: `Local in-process cache`, tone: `ok`, html: `<p>Keep the hot value in each app server's memory for a second or two. The shared cache then sees at most one request per server per TTL, however large the traffic. Costs a little staleness and memory on every server.</p>` },
          { title: `Push it to the edge`, tone: `ok`, html: `<p>If the content is public and identical for everyone, let the CDN serve it. The origin sees a trickle of revalidations instead of the full read rate.</p>` },
        ] },
        { type: `text`, html: `<p>All three need to know which keys are hot. Options: a fixed list for predictable cases (the home page, a scheduled launch), counting requests per key in the app servers with a small sampling sketch and promoting the top keys, or letting the cache itself report its hottest keys. Promotion should be automatic: a post becomes hot within minutes and stops being hot within hours.</p>` },
        { type: `lab`, id: `srHotKey`, caption: `Give one key 30% of 800K reads/s. Then try 4 copies, 8 copies, and a one-second local cache, and watch the hottest shard.` },
        { type: `realworld`, items: [
          { org: `Facebook (memcache)`, title: `Scaling Memcache at Facebook, NSDI 2013`, html: `<p>Described leases to stop stale sets and throttle rebuilds of the same key, a separate "gutter" pool that takes over for failed cache servers so their load doesn't fall straight onto databases, and invalidations driven by daemons that read the MySQL commit log.</p>` },
          { org: `Facebook (TAO)`, title: `USENIX ATC 2013`, html: `<p>A read-optimised graph store for the social graph: tiers of caches in front of sharded MySQL, with followers in each region serving reads and a leader tier handling writes and invalidation. A real system built around a very high read:write ratio.</p>` },
          { org: `Twitter`, title: `Home timelines`, html: `<p>Publicly described precomputing each user's home timeline in an in-memory cache by fanning tweets out at write time, and merging tweets from accounts with very large followings at read time instead.</p>` },
        ] },
      ],
    },
    {
      id: `read-path-failures`,
      title: `What happens when part of the read path fails`,
      kicker: `Failure handling`,
      blocks: [
        { type: `text`, html: `<p>Each rung adds a component that can fail. A good design says what the user sees and what protects the database in each case.</p>` },
        { type: `table`, headers: [`Failure`, `Immediate effect`, `Mitigation`], rows: [
          [`Cache node dies`, `Its keys all miss; database load jumps by that node's share`, `Consistent hashing so only that slice moves; coalesce misses; a standby or gutter pool`],
          [`Whole cache cold (restart, deploy, new region)`, `Database sees every read: 20x at a 95% hit rate`, `Warm from logs before taking traffic; roll nodes one at a time; admission limits on the database`],
          [`Replica falls far behind`, `Stale reads, and lagging read-your-writes`, `Monitor lag; remove it from the pool past a threshold; tokens route around it`],
          [`Replica dies`, `Its reads move to the others`, `Headroom: run N+1 replicas so losing one doesn't overload the rest`],
          [`Primary dies`, `Writes stop; reads continue from replicas`, `Promote a replica; async replication may lose the last few writes`],
          [`CDN purge or miss storm`, `Origin sees full traffic for that content`, `Origin shield (a mid-tier cache); coalesce at the edge; stagger purges`]
        ] },
        { type: `callout`, tone: `warning`, title: `Size the database for misses, not for the hit rate`, html: `<p>If the database can only survive at a 95% hit rate, the cache is no longer an optimisation; it is a load-bearing wall with no redundancy. Either give the database enough headroom to survive a partial cache loss, or make sure a cold cache can never meet full traffic: shed load, queue requests, or serve a degraded page.</p>` },
        { type: `quiz`, q: `A cache cluster with a 95% hit rate is restarted during peak. The database was running at 40% CPU. Roughly what load does it face right after the restart?`, options: [`About the same, 40%`, `About double, 80%`, `About 20 times the read load it normally sees, far beyond capacity`, `Less, because the cache is empty`], answer: 2, explain: `At 95% hits the database saw 5% of reads. With an empty cache it sees 100%, twenty times as many. Even if reads were all of its 40% load, that is many times its capacity until the cache refills.` },
      ],
    },
    {
      id: `worked-example`,
      title: `Worked example: a news feed's read path`,
      kicker: `Putting it together`,
      blocks: [
        { type: `steps`, items: [
          `<strong>Estimate.</strong> 50M daily users, 20 feed loads a day: 1B loads, about 12K per second on average, say 40K at peak. Posts: 5M a day, about 60 per second. Read:write is roughly 200:1.`,
          `<strong>Rung 1.</strong> Index posts on (author_id, created_at). Denormalise author name and avatar onto posts, keep like_count and comment_count on the post row. Precompute each user's feed as a list of post IDs (fan-out on write), except for accounts with huge followings, merged at read time.`,
          `<strong>Rung 2.</strong> Even cheap queries at 40K per second, each assembling a page of posts, call for several read replicas. Route a user's reads to the primary for a few seconds after they post or comment.`,
          `<strong>Rung 3.</strong> Feeds and post objects in Redis with TTLs of minutes, deleted on edit. Images and video through a CDN. Hot posts cached for a second in each app server.`,
          `<strong>Protect it.</strong> Jittered TTLs, single-flight on misses, stale-while-revalidate for the hottest feeds, replica lag monitoring, and a database sized to survive losing one cache node.`,
          `<strong>Name the staleness.</strong> Other users see a new post within seconds; the author sees it immediately; like counts may lag by a TTL. Say that out loud.`,
        ] },
        { type: `quiz`, q: `In the feed design, which piece of data should NOT be served from a long-TTL cache?`, options: [`A celebrity's latest post`, `The author's avatar image`, `Whether the current user is allowed to see a private post`, `The like count on a popular post`], answer: 2, explain: `Permission checks must reflect changes (a block, a privacy setting) promptly and must never be served from a cache shared across users. Posts, images and counts tolerate seconds or minutes of staleness; access control generally doesn't.` },
      ],
    },
  ],
  takeaways: [
    `Read:write ratios of 10:1 to 1000:1 make the read path the first thing to outgrow one database.`,
    `Climb the ladder in order: cheaper reads inside the database, then more database machines, then caches and a CDN. Attach a number to each step.`,
    `Replicas add capacity, not speed, and do nothing for writes or for data that doesn't fit one machine.`,
    `Every copy can be stale. Give the writer read-your-own-writes (primary window or log-position token) and let everyone else read eventually consistent replicas.`,
    `Update the database, then delete the cache key; keep a TTL as the safety net; use change-log invalidation when many caches or services are involved.`,
    `Hot entries expiring cause stampedes: coalesce misses, serve stale while refreshing, refresh early, and jitter TTLs.`,
    `A hot key lives on one shard: replicate it under several names or cache it in each app server for a second.`,
    `Size the database to survive cache misses, or the cache becomes a single point of failure.`
  ],
  furtherReading: [
    { title: `Scaling Memcache at Facebook (NSDI 2013)`, url: `https://www.usenix.org/conference/nsdi13/technical-sessions/presentation/nishtala`, note: `Leases, gutter pools and commit-log-driven invalidation at very large scale.` },
    { title: `TAO: Facebook's Distributed Data Store for the Social Graph (USENIX ATC 2013)`, url: `https://www.usenix.org/conference/atc13/technical-sessions/presentation/bronson`, note: `A read-optimised, cache-heavy store in front of sharded MySQL.` },
    { title: `RFC 5861: HTTP Cache-Control Extensions for Stale Content`, url: `https://www.rfc-editor.org/rfc/rfc5861`, note: `Defines stale-while-revalidate and stale-if-error.` },
    { title: `Go singleflight package`, url: `https://pkg.go.dev/golang.org/x/sync/singleflight`, note: `A compact, widely used implementation of in-process request coalescing.` },
    { title: `PostgreSQL documentation: Hot Standby`, url: `https://www.postgresql.org/docs/current/hot-standby.html`, note: `Read queries on replicas, and how they interact with replay.` },
    { title: `Optimal Probabilistic Cache Stampede Prevention (VLDB 2015)`, note: `Vattani, Chierichetti and Lowenstein; the source of the early-expiration rule above.` }
  ]
};
