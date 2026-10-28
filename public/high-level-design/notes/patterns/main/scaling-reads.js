// Main tab: Scaling Reads. Format: DeepSection[] in public/shared/notes.d.ts.
window.MAIN = window.MAIN || {};
MAIN["scaling-reads"] = [
  {
    id: `the-problem`,
    title: `Reads outgrow one database first`,
    kicker: `The problem`,
    blocks: [
      { type: `text`, html: `<p>Think about how often data is written compared with how often it is looked at. A tweet is written once and read by every follower who scrolls past it. A product page is edited a few times a month and viewed all day. A short link is created once and clicked thousands of times. Read:write ratios of <strong>10:1</strong> are ordinary and <strong>1000:1</strong> is not unusual, so in most designs the read path is what breaks first.</p><p>It breaks in a predictable way. Early on, one database answers everything quickly. As data grows, queries that scan or join get slower; as traffic grows, the same machine has to answer more of them per second. CPU, memory and disk throughput on one box are finite, and you can only buy so big a box. At some point the read load simply exceeds what one database can serve, and latency climbs for everyone, including writers.</p>` },
      { type: `idea`, html: `<p>Scaling reads is a ladder with three rungs: <strong>make each read cheaper inside the database</strong>, then <strong>spread reads across more database machines</strong>, then <strong>serve reads without the database</strong>. Climb only as far as the numbers force you, because every rung above the first adds a copy of the data that can be stale.</p>` },
      { type: `diagram`, title: `The read-scaling ladder`, caption: `Lower rungs are cheaper and keep data fresh. Higher rungs handle far more traffic but add copies, and every copy can lag the source.`, svg: `<svg viewBox="0 0 620 270" role="img" aria-label="Three rungs: optimise the database, scale it horizontally, add caches; complexity and staleness grow upward">
<defs><marker id="pt4-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="60" y="190" width="420" height="58" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="76" y="213" font-size="13" font-weight="700">1. Optimise within the database</text>
<text x="76" y="234" font-size="12" style="fill: var(--dg-muted)">indexes, denormalise, precompute, bigger machine</text>
<rect x="60" y="110" width="420" height="58" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="76" y="133" font-size="13" font-weight="700">2. Scale the database horizontally</text>
<text x="76" y="154" font-size="12" style="fill: var(--dg-muted)">read replicas; shards when the data won't fit</text>
<rect x="60" y="30" width="420" height="58" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<text x="76" y="53" font-size="13" font-weight="700">3. Add caching layers outside it</text>
<text x="76" y="74" font-size="12" style="fill: var(--dg-muted)">Redis / Memcached, CDN at the edge</text>
<line x1="30" y1="250" x2="30" y2="32" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#pt4-arrow)"/>
<text x="22" y="150" font-size="12" text-anchor="middle" transform="rotate(-90 22 150)" style="fill: var(--dg-muted)">read capacity</text>
<line x1="500" y1="250" x2="500" y2="32" stroke-width="2" style="stroke: var(--dg-bad)" marker-end="url(#pt4-arrow)"/>
<text x="512" y="60" font-size="12" style="fill: var(--dg-ink)">more copies,</text>
<text x="512" y="78" font-size="12" style="fill: var(--dg-ink)">more staleness,</text>
<text x="512" y="96" font-size="12" style="fill: var(--dg-ink)">more moving</text>
<text x="512" y="114" font-size="12" style="fill: var(--dg-ink)">parts</text>
<text x="512" y="222" font-size="12" style="fill: var(--dg-muted)">fresh, simple</text>
</svg>` },
      { type: `lab`, id: `srReadLadder`, caption: `Start at 10K reads/s with no index and watch the primary saturate. Climb one rung at a time and notice which one each traffic level actually needs. Then set the ratio to 10:1 at 1M reads/s: writes alone saturate the primary, and no read-side rung helps.` },
    ],
  },
  {
    id: `optimise-in-db`,
    title: `Rung 1: make each read cheaper`,
    kicker: `Optimise within the database`,
    blocks: [
      { type: `text`, html: `<p>Before adding machines, reduce the work each read does. This rung adds no new copies, so nothing can go stale, and it is often all you need.</p>` },
      { type: `keypoints`, items: [
        `<strong>Indexes.</strong> A query filtered by user_id and sorted by created_at, with no index, reads the whole table. A composite index on (user_id, created_at) reads a handful of pages. Find the hot queries, check their plans, and give each one an index that matches its filter and sort. How indexes work is covered in <a href="../../core-concepts/ch10/">Core Concepts ch10</a>.`,
        `<strong>Denormalise.</strong> If every post view joins to users to show the author's name, store the name on the post. If every view counts likes, keep a like_count column. You pay a little at write time (and must keep the copies in sync) to save a lot on every read.`,
        `<strong>Precompute.</strong> Results that are expensive and read often, such as leaderboards, dashboards or a user's feed, can be computed ahead of time into a materialised view or a summary table, refreshed on a schedule or from change events. A read becomes a single lookup.`,
        `<strong>Bigger hardware.</strong> More RAM so the working set stays in memory, faster disks, more cores. It is unglamorous, but one large server goes a long way and introduces no consistency problems. Mention its ceiling and that it is still one machine.`,
      ] },
      { type: `callout`, tone: `tip`, title: `Say it first`, html: `<p>Interviewers notice when a candidate jumps straight to Redis. "First I'd make sure the feed query is indexed on (user_id, created_at) and denormalise the author name onto posts" costs one sentence and shows you know where read cost comes from.</p>` },
    ],
  },
  {
    id: `scale-horizontally`,
    title: `Rung 2: spread reads over more machines`,
    kicker: `Scale the database horizontally`,
    blocks: [
      { type: `text`, html: `<p><strong>Read replicas</strong> are the standard next step. The primary takes all writes and streams its change log to one or more replicas; each replica replays the changes and serves reads. Five replicas give you roughly five times the read capacity, with no change to the data model, and they double as failover candidates.</p><p>Replicas have two limits. They don't help writes, since every replica applies every write. And with the usual asynchronous replication, a replica is a little behind the primary: <strong>replication lag</strong>, usually milliseconds, sometimes seconds under heavy write load. Most readers never notice. The person who just wrote does: they save a change, the page reloads from a replica, and their change is missing.</p>` },
      { type: `compare`, title: `Giving the writer read-your-own-writes`, items: [
        { title: `Primary for a short window`, tone: `ok`, html: `<p>Remember when each user last wrote (in their session). For the next few seconds, send their reads to the primary. Simple and cheap; fails only if lag exceeds the window.</p>` },
        { title: `Log position token`, tone: `info`, html: `<p>The write returns its position in the log (an LSN in Postgres, a GTID in MySQL). Reads carry it, and only a replica that has replayed that far may answer; otherwise fall back to the primary. Exact, more plumbing.</p>` },
      ] },
      { type: `lab`, id: `srReplicaLag`, caption: `Set the lag to 200 ms and reload after 300 ms: a noticeable share of users see stale data from "any replica". Then turn on lag spikes and move the reload to about 2.5 s: reloads now land after the 2-second window, a few leak through, and the token strategy stays at zero.` },
      { type: `text`, html: `<p>Replicas copy the whole dataset. When the data or its hot working set no longer fits on one machine, you need <strong>sharding</strong>: split the data by a key so each database holds and serves a slice, each with its own replicas. Choose a key that most reads include (user_id for a user's timeline), so a read touches one shard instead of all of them. Shard keys and their pitfalls are in <a href="../../core-concepts/ch14/">Core Concepts ch14</a>; for a pure read problem, sharding usually comes after replicas and caching, not before.</p>` },
    ],
  },
  {
    id: `caching-layers`,
    title: `Rung 3: serve reads without the database`,
    kicker: `External caching layers`,
    blocks: [
      { type: `text`, html: `<p>A cache keeps recently read results in memory, in a separate service such as Redis or Memcached. A lookup takes well under a millisecond and one node can serve on the order of a hundred thousand requests per second. The usual pattern is <strong>cache-aside</strong>: look in the cache; on a miss, read the database, store the result with a TTL, and return it. With a 95% hit rate, the database sees one read in twenty. Where to place caches and the read and write strategies are covered in <a href="../../core-concepts/ch12/">Core Concepts ch12</a>.</p><p>Further out, a <strong>CDN</strong> caches HTTP responses in data centres close to users. It is ideal for images, video, scripts and public pages, and useless for anything personalised, because one cached response would be served to everyone who asks for that URL.</p>` },
      { type: `keypoints`, title: `What a cache adds that you must answer for`, items: [
        `<strong>Staleness.</strong> An entry can be out of date until its TTL expires. Invalidate on write (update the database, then delete the key) and keep the TTL as a safety net.`,
        `<strong>Cold starts.</strong> If the cache empties, the database suddenly sees every read. Plan for it: warm the cache, restart nodes one at a time, and limit database connections.`,
        `<strong>Stampedes and hot keys.</strong> One popular entry expiring, or one key that one shard must serve, can undo the benefit. These are the classic deep dives below.`,
      ] },
    ],
  },
  {
    id: `in-the-interview`,
    title: `Using the pattern in an interview`,
    kicker: `When to use it, and when not`,
    blocks: [
      { type: `text`, html: `<p>Read scaling shows up whenever the requirements describe many viewers and few creators: social feeds, news sites, e-commerce catalogues, URL shorteners, video platforms, ticketing event pages, maps and places. Estimate the read rate early ("100M daily users, 20 feed loads each, about 25K reads per second average, maybe 100K at peak") and let that number decide how far up the ladder you go.</p>` },
      { type: `compare`, items: [
        { title: `Reach for it when`, tone: `ok`, html: `<p>Reads clearly dominate; the estimate exceeds what one indexed database serves; latency targets are tight (tens of milliseconds); or the same items are read over and over (a popular post, a hot product).</p>` },
        { title: `Hold back when`, tone: `bad`, html: `<p>The load fits on one database (a few hundred or a few thousand simple reads per second); every read must be exactly current (balances at checkout, inventory at the moment of purchase); or writes are the real bottleneck, which is the <a href="../scaling-writes/">Scaling Writes</a> chapter.</p>` },
      ] },
      { type: `callout`, tone: `interview`, title: `What a strong answer sounds like`, html: `<p>"Reads outnumber writes about 100 to 1, so I'll index the feed query and denormalise author info first. At 100K reads per second I'll add read replicas, and put Redis in front of the feed with a five-minute TTL and delete-on-write invalidation. Images go through a CDN. After a user posts, I'll route their own reads to the primary for a few seconds so they see their post. For a celebrity's post I'd cache it locally in each app server for a second to avoid a hot key."</p>` },
    ],
  },
  {
    id: `common-deep-dives`,
    title: `Common deep dives`,
    kicker: `Follow-up questions`,
    blocks: [
      { type: `text`, html: `<p>Once the ladder is on the whiteboard, interviewers poke at the places where copies and caches fail. Four questions come up again and again.</p>` },
      { type: `list`, items: [
        `<strong>"Queries get slower as the data grows."</strong> Look at the query plan before anything else. Add the composite or covering index the query needs, denormalise the join, or precompute the aggregate. If the indexes themselves no longer fit in memory, that is the signal to shard.`,
        `<strong>"Millions of users read the same item."</strong> One key lives on one cache shard, which saturates. Store several copies of the key across shards and read a random one, or cache the value in each app server's memory for a second or two. Put it on the CDN if it is public.`,
        `<strong>"A hot entry expires and every request rebuilds it."</strong> That is a stampede. Let one request rebuild while others wait (single-flight per server, or a short lock in the cache), or keep serving the old value while one request refreshes it, or refresh it just before it expires. Add jitter to TTLs so keys don't expire together.`,
        `<strong>"An update must be visible immediately."</strong> Delete the cache key after the database write (not before, and don't write the value in), drive invalidation from the database's change log when many caches are involved, and keep a TTL as backup. If a path truly can't tolerate staleness, read it from the primary.`,
      ] },
      { type: `lab`, id: `srStampede`, caption: `At 3K reads/s and a 200 ms rebuild, "no protection" sends hundreds of identical queries per expiry. Push the rate up to see the rebuild slow down and collapse, then try each protection.` },
      { type: `lab`, id: `srHotKey`, caption: `Give one key 20% of half a million reads per second. One shard is far over capacity while the other seven sit at half load. Compare replicating the key with a one-second local cache.` },
    ],
  },
];
