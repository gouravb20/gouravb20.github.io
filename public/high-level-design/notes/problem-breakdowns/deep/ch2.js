// Deep dive: Chapter 2, A first working design. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch2 = {
  hook: `<p>Ten minutes into the interview, you have the requirements and the numbers from Chapter 1: four windows, exact counts, at most a minute of lag, reads in tens of milliseconds, around 800K views a second. It is tempting to jump straight to Kafka, Flink, sharded stores and sketches. Resist it. An interviewer who sees five clever boxes and no explanation of the data flow will start poking at whichever box you understand least.</p>
<p>Instead, draw something you could build in an afternoon: one consumer, one database, one API. It will be too slow, and that is the point. Every place it breaks becomes an item on your agenda, and you get to name those places before the interviewer does. This chapter builds that baseline, finds its four bottlenecks, and fixes the cheapest one, the read path, for good.</p>`,
  sections: [
    {
      id: "start-simple",
      title: "Why the first design should be naive",
      kicker: "Strategy",
      blocks: [
        {
          type: "idea",
          html: `<p>Start with a design that is <strong>complete and obviously correct</strong>, however slow. It gives you and the interviewer a shared picture, it proves you understand the data flow end to end, and its flaws define the deep dives that follow.</p>`,
        },
        {
          type: "text",
          html: `<p>The baseline has three moving parts. A consumer reads view events from the Kafka topic and, for each one, increments that video's counter in Postgres. A second table keeps one row per video per hour, so windowed questions can be answered. A stateless API serves <code>GET /v1/top-videos</code> by running a SQL query against those tables on every request.</p>
<p>Nothing here is exotic, and every piece is correct: counts are exact, every window can be answered, and a crash just means the consumer resumes from its last committed Kafka offset. What it is not is fast, on either side. The rest of the chapter measures exactly how slow, so the fixes later are aimed at real problems rather than imagined ones.</p>`,
        },
        {
          type: "diagram",
          title: "The baseline: one consumer, one database, one API",
          caption: "Every view becomes a database write, and every client request becomes a database query. The two red notes are the bottlenecks we will fix: writes in Chapter 3, reads in this chapter and Chapter 4.",
          svg: `<svg viewBox="0 0 640 230" role="img" aria-label="Baseline architecture: Kafka to a consumer that updates Postgres; clients query Postgres through an API">
<defs><marker id="pb2-base-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="20" y="40" width="110" height="50" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<text x="75" y="61" text-anchor="middle" font-size="13" font-weight="700">Kafka</text>
<text x="75" y="78" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">view-events</text>
<rect x="180" y="40" width="120" height="50" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="240" y="61" text-anchor="middle" font-size="13" font-weight="700">Consumer</text>
<text x="240" y="78" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">+1 per view</text>
<rect x="340" y="25" width="170" height="190" rx="10" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<text x="425" y="47" text-anchor="middle" font-size="13" font-weight="700">Postgres</text>
<rect x="352" y="60" width="146" height="44" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1"/>
<text x="425" y="78" text-anchor="middle" font-size="12" font-weight="700">video_views</text>
<text x="425" y="95" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">(id, views)</text>
<rect x="352" y="120" width="146" height="44" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1"/>
<text x="425" y="138" text-anchor="middle" font-size="12" font-weight="700">video_views_hourly</text>
<text x="425" y="155" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">(id, hour, views)</text>
<rect x="20" y="160" width="110" height="50" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="75" y="190" text-anchor="middle" font-size="13" font-weight="700">Clients</text>
<rect x="180" y="160" width="120" height="50" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="1.5"/>
<text x="240" y="181" text-anchor="middle" font-size="13" font-weight="700">Top-K API</text>
<text x="240" y="198" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">SQL per request</text>
<line x1="130" y1="65" x2="178" y2="65" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#pb2-base-arrow)"/>
<line x1="300" y1="65" x2="338" y2="65" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#pb2-base-arrow)"/>
<line x1="130" y1="185" x2="178" y2="185" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#pb2-base-arrow)"/>
<line x1="300" y1="185" x2="338" y2="185" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#pb2-base-arrow)"/>
<text x="525" y="70" font-size="12" font-weight="700" style="fill: var(--dg-bad)">~800K row</text>
<text x="525" y="86" font-size="12" font-weight="700" style="fill: var(--dg-bad)">updates/s</text>
<text x="525" y="180" font-size="12" font-weight="700" style="fill: var(--dg-bad)">scan and sum</text>
<text x="525" y="196" font-size="12" font-weight="700" style="fill: var(--dg-bad)">per request</text>
</svg>`,
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>Jumping straight to a streaming architecture risks spending the interview defending components before you have shown you understand what flows between them. A naive design that you then improve tells a story: here is the problem, here is where it hurts, here is the fix.</p>`,
        },
      ],
    },
    {
      id: "counter-table",
      title: "All-time top K: a counter table and an index",
      kicker: "The easy window",
      blocks: [
        {
          type: "text",
          html: `<p>For all time, keep one row per video with its total views and put a B-tree index on the views column. A B-tree keeps its entries in sorted order, so <code>ORDER BY views DESC LIMIT 100</code> does not sort anything: the database walks the first 100 entries of the index and fetches those rows. The read costs about K steps no matter how many billions of videos exist.</p>`,
        },
        {
          type: "code",
          title: "Baseline schema and all-time query",
          lang: "sql",
          code: `CREATE TABLE video_views (
  video_id text PRIMARY KEY,
  views    bigint NOT NULL
);
CREATE INDEX video_views_by_views ON video_views (views DESC);

-- per view event (the consumer):
INSERT INTO video_views (video_id, views) VALUES ($1, 1)
ON CONFLICT (video_id) DO UPDATE SET views = video_views.views + 1;

-- all-time top K: an index walk, about K steps
SELECT video_id, views FROM video_views ORDER BY views DESC LIMIT 100;`,
        },
        {
          type: "text",
          html: `<p>The price is paid on every write. An increment changes the indexed column, so the row's position in the views index must move: the old entry becomes dead and a new entry is inserted at the new position, an O(log n) operation. In Postgres specifically, an <code>UPDATE</code> writes a new version of the row (that is how its multi-version concurrency control works), and because an indexed column changed, it cannot use the cheaper "heap-only tuple" update path, so both indexes receive new entries. Vacuum later cleans up the dead versions.</p>
<p>Do that 800K times a second and the numbers from Chapter 1 bite: a single node handling on the order of 10K indexed updates per second is about 80 times too slow on average. The hottest rows make it worse, because concurrent increments of the same popular video serialise on that row's lock.</p>`,
        },
        {
          type: "quiz",
          q: "Why is the all-time query fast while each increment is relatively expensive?",
          options: [
            "Postgres caches the query result automatically",
            "The index keeps videos sorted by views, so reading the top K is a short walk; but every increment must move the video's entry within that sorted index and write a new row version",
            "Increments are slow because bigint arithmetic is slow",
            "The query is fast only because the table is small",
          ],
          answer: 1,
          explain: "A sorted index makes reads cheap precisely because writes keep it sorted. Each increment changes the key the index is ordered by, so it costs an index update (and, in Postgres, a new row version) on top of the row write.",
        },
      ],
    },
    {
      id: "hour-buckets",
      title: "Windows: hour buckets and why summing them hurts",
      kicker: "The hard windows",
      blocks: [
        {
          type: "text",
          html: `<p>All-time counts cannot answer "the last day", because they have forgotten when views happened. The simplest fix is a second table with one row per video per hour. The consumer increments the row for the event's hour; a window query sums each video's buckets in range and sorts by the sum.</p>`,
        },
        {
          type: "code",
          title: "Hour buckets and the windowed query",
          lang: "sql",
          code: `CREATE TABLE video_views_hourly (
  video_id text,
  hour     timestamptz,
  views    bigint,
  PRIMARY KEY (video_id, hour)
);

-- last day: sum every video's 24 buckets, then sort
SELECT video_id, SUM(views) AS views
FROM   video_views_hourly
WHERE  hour >= :day_start AND hour < :day_end
GROUP  BY video_id
ORDER  BY views DESC
LIMIT  100;`,
        },
        {
          type: "problem",
          html: `<p>No index can hand you the order of a <em>sum</em>. Even if every hour's buckets were stored sorted by views, the ranking of the totals is not the ranking of any one hour, nor a simple merge of the hourly leaders. The database has to add up every video's buckets before it knows which videos are on top.</p>`,
        },
        {
          type: "table",
          title: "A video can win the day without ever leading an hour",
          headers: ["Video", "Hour 1", "Hour 2", "Hour 3", "Total"],
          rows: [
            ["A", "<strong>900</strong>", "100", "100", "1,100"],
            ["B", "500", "500", "500", "<strong>1,500</strong>"],
            ["C", "100", "<strong>950</strong>", "50", "1,100"],
            ["D", "50", "60", "<strong>980</strong>", "1,090"],
          ],
          note: "Taking each hour's leader (A, C, D) and merging would miss B, the true winner. Only summing every video's buckets finds it.",
        },
        {
          type: "text",
          html: `<p>Now put numbers on it. Assume about 20 million distinct videos get at least one view in a typical hour (an assumption; the true figure depends on how long the tail of the catalogue is). The last-day query then reads up to <span class="formula">24 × 20M ≈ 480M rows</span>, hash-aggregates them into tens of millions of groups, and sorts. At an optimistic 20 million rows per second of scan-and-aggregate, that is <span class="formula">≈ 24 s</span> per query. The last month reads up to <span class="formula">720 × 20M ≈ 14B rows</span>, about twelve minutes. Those are batch jobs, not queries.</p>
<p>The table also grows without bound: tens of millions of new rows every hour, hundreds of millions a day. And the consumer now writes two rows per view instead of one, doubling the write problem from the previous section.</p>`,
        },
        {
          type: "quiz",
          q: "Someone suggests answering \"last day\" by taking the top 1,000 of each hour and merging the 24 lists. What goes wrong?",
          options: [
            "Nothing; it is exact and faster",
            "It can miss videos that are steadily popular all day but never in any single hour's top 1,000, and it undercounts videos whose views fall outside some hours' lists",
            "It double-counts the views of the top video",
            "It only works for tumbling windows",
          ],
          answer: 1,
          explain: "Ranking by a sum needs every addend. A video ranked 1,200th in every hour can easily beat one that was 1st for an hour and absent afterwards. Merging per-hour top lists drops the steady performer entirely and sums incomplete counts for others.",
        },
      ],
    },
    {
      id: "bottlenecks",
      title: "Naming the bottlenecks before fixing them",
      kicker: "Diagnosis",
      blocks: [
        {
          type: "text",
          html: `<p>Before improving anything, say out loud where the baseline breaks. Interviewers want evidence that you see the failure points yourself; it also gives you a clear agenda for the rest of the hour, so you are steering the conversation rather than reacting to it.</p>`,
        },
        {
          type: "list",
          title: "The four bottlenecks",
          items: [
            "<strong>One database write per view:</strong> ~800K single-row updates per second, each also updating an index. Far beyond one node. (Chapter 3)",
            "<strong>A fast-growing bucket table:</strong> one row per video per active hour, forever. (Chapters 3 and 4)",
            "<strong>Scan-heavy window queries:</strong> every windowed answer aggregates every video in the window before it can sort. (Chapter 4)",
            "<strong>Every client request reaching the database:</strong> thousands of identical expensive queries per second. (This chapter)",
          ],
        },
        {
          type: "text",
          html: `<p>Notice the asymmetry hidden in that list. The read side asks only a handful of distinct questions: four windows, and every K is a prefix of the top 1,000. The write side handles hundreds of thousands of distinct updates per second. That tells you where to spend your effort: the read path can be solved once with precomputation, and the real engineering belongs to counting and aggregating writes.</p>`,
        },
        {
          type: "keypoints",
          items: [
            "Fix the cheap problem first: a few distinct read questions can be answered once and reused.",
            "The expensive problem is writes: they must be aggregated before they reach storage.",
            "Window queries remain expensive even when hidden behind a cache; something still has to compute them.",
          ],
        },
      ],
    },
    {
      id: "cache-and-precompute",
      title: "Serving reads: cache with a TTL, or precompute?",
      kicker: "Fixing the read path",
      blocks: [
        {
          type: "problem",
          html: `<p>If thousands of clients a second each trigger a 24-second query, the database is finished. But they are all asking the same four questions. Caching the answer is the obvious move; the subtle part is what happens at the moment the cached answer expires.</p>`,
        },
        {
          type: "text",
          html: `<p>The first idea is a cache with a time-to-live. Store each window's result in Redis under a key such as <code>topk:day:2026-10-12</code>, with a TTL of a few minutes. Store the largest K you support (1,000) and slice it for smaller requests, so one key serves every K. A hit returns in about a millisecond.</p>
<p>The trouble is the <strong>expiry cliff</strong>. When the key expires, or when a new window starts and its key does not exist yet, every request in the next few seconds misses and fires the expensive query itself. With 2,000 requests per second and a 15-second query, thousands of copies of the same query pile onto a database that can run a handful at once. <strong>Coalescing</strong> (letting only one request per key, or per server, run the query while the others wait for its result) protects the database, but the waiting requests still take as long as the query: seconds, against a 50-millisecond target.</p>
<p>The better move is to stop reacting to misses altogether. A <strong>refresher job</strong> computes every window's top K on a schedule, say once a minute, inside the freshness budget, and writes the results into the cache. The API only ever reads the cache, so it never waits on the database. The job also gets ahead of window boundaries: it can compute the new day's answer the moment the day closes, before anyone asks.</p>`,
        },
        {
          type: "lab",
          id: "servingStrategy",
          caption: "Compare the four strategies. With a TTL, watch the latency spike every time a key expires; add coalescing and the database survives but the spike remains; switch to scheduled precompute and latency stays flat. Raise the query time to see when the refresher can no longer finish all four windows within its interval.",
        },
        {
          type: "table",
          title: "Serving strategies side by side",
          headers: ["Strategy", "Database queries", "Latency at expiry", "Staleness", "Moving parts"],
          rows: [
            ["Query on every request", "One per request", "Always slow", "None", "None"],
            ["Cache with TTL", "Burst at every expiry", "Slow spike", "Up to the TTL", "Cache"],
            ["TTL + coalescing", "One per key per server", "Still slow for waiters", "Up to the TTL", "Cache, locks"],
            ["Scheduled precompute", "Windows × refreshes", "Flat", "Up to the refresh interval", "Cache, job, lag alert"],
          ],
        },
        {
          type: "diagram",
          title: "Precompute: the slow query leaves the request path",
          caption: "A background refresher runs the four window queries every minute and overwrites the cached answers. The API reads only from Redis, so a slow query delays freshness, never a request.",
          svg: `<svg viewBox="0 0 640 230" role="img" aria-label="Refresher job queries Postgres every minute and writes answers to Redis; the API reads only from Redis">
<defs><marker id="pb2-pre-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<text x="175" y="40" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">background, every minute</text>
<text x="520" y="40" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">shared by both paths</text>
<rect x="10" y="80" width="120" height="50" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<text x="70" y="101" text-anchor="middle" font-size="13" font-weight="700">Postgres</text>
<text x="70" y="118" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">counts</text>
<rect x="200" y="80" width="140" height="50" rx="8" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="1.5"/>
<text x="270" y="101" text-anchor="middle" font-size="13" font-weight="700">Refresher job</text>
<text x="270" y="118" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">every 60 s</text>
<rect x="440" y="80" width="160" height="50" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<text x="520" y="101" text-anchor="middle" font-size="13" font-weight="700">Redis</text>
<text x="520" y="118" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">topk:{window}</text>
<rect x="200" y="165" width="140" height="44" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="270" y="192" text-anchor="middle" font-size="13" font-weight="700">Clients</text>
<rect x="440" y="165" width="160" height="44" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="1.5"/>
<text x="520" y="192" text-anchor="middle" font-size="13" font-weight="700">Top-K API</text>
<line x1="200" y1="105" x2="132" y2="105" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#pb2-pre-arrow)"/>
<text x="165" y="97" text-anchor="middle" font-size="12">4 queries</text>
<line x1="340" y1="105" x2="438" y2="105" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#pb2-pre-arrow)"/>
<text x="390" y="97" text-anchor="middle" font-size="12">SET, long TTL</text>
<line x1="340" y1="187" x2="438" y2="187" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#pb2-pre-arrow)"/>
<text x="390" y="179" text-anchor="middle" font-size="12">request</text>
<line x1="520" y1="165" x2="520" y2="132" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#pb2-pre-arrow)"/>
<text x="528" y="152" font-size="12">~1 ms read</text>
</svg>`,
        },
        {
          type: "text",
          html: `<h3>Serve stale rather than nothing</h3>
<p>Give each cached answer a TTL much longer than the refresh interval, say an hour against a one-minute refresh. If the refresher slows down or dies, readers keep getting the last computed list, a few minutes old, instead of errors or a stampede onto the database. For a "most viewed" shelf that is clearly the right trade. Pair it with an alert on the age of the newest answer so a stuck job is noticed in minutes.</p>
<p>Window boundaries need one more detail. If the API computed "today's key" from the clock, the first requests after midnight would look for a key the refresher has not written yet. Instead, have the refresher write the new window's answer first and then update a small pointer key (for example <code>topk:day:latest</code>) that the API reads. Readers then switch to the new window only once it exists.</p>
<p>Finally, the refresher must keep up. Four windows refreshed every minute is 240 heavy queries an hour, and from the previous section a month query alone takes minutes. With hour buckets, the refresher cannot meet its own schedule. Precomputation fixed the <em>latency</em> of reads; it did not make the <em>work</em> cheaper. That is Chapter 4's job.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Facebook memcache", title: "Leases (NSDI 2013)", html: "The \"Scaling Memcache at Facebook\" paper describes leases: on a miss, only the client holding the lease recomputes a key, and others wait briefly or accept a slightly stale value. It is coalescing built into the cache protocol." },
            { org: "Go", title: "singleflight", html: "The <code>golang.org/x/sync/singleflight</code> package collapses concurrent calls for the same key into one execution whose result is shared by every caller, a common way to coalesce misses inside one server." },
            { org: "HTTP caching", title: "stale-while-revalidate", html: "RFC 5861 defines the <code>stale-while-revalidate</code> Cache-Control extension: a cache may keep serving a stale response while it refreshes in the background, the same \"stale beats slow\" policy applied to HTTP." },
          ],
        },
        {
          type: "quiz",
          q: "You add coalescing so that only one request per API server runs the query when a key expires. Why does this still miss the latency target?",
          options: [
            "Coalescing does not reduce database load",
            "The other requests wait for that one query to finish, so they take as long as the query itself, seconds instead of milliseconds",
            "Coalescing makes the cache return wrong results",
            "Coalescing only works with sliding windows",
          ],
          answer: 1,
          explain: "Coalescing fixes the thundering herd on the database: twenty copies of the query instead of thousands. But a coalesced request is still a request waiting on the slow query. Only moving the computation off the request path, by precomputing before anyone asks, keeps every read fast.",
        },
      ],
    },
    {
      id: "interview",
      title: "Presenting the baseline in an interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "text",
          html: `<p>This part of the interview should be quick, around five to eight minutes. Draw the baseline, walk one view event from Kafka to Postgres and one request from the client to the database, then list the bottlenecks and fix the read path immediately. That leaves most of the time for the write path and windowing, which is where the interviewer will want depth.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>Points worth making explicitly:</p>
<ul>
<li>All-time top K is an index walk; windowed top K requires summing buckets before sorting, and no index helps with that.</li>
<li>The baseline's four bottlenecks, in your own words, before the interviewer names them.</li>
<li>Read/write asymmetry: four questions versus 800K writes a second, so precompute the reads.</li>
<li>Precompute on a schedule rather than TTL caching, because of the expiry cliff; serve stale with a long TTL and alert on refresher lag.</li>
<li>Cache keys by window type and window start, storing the top 1,000 and slicing for smaller K.</li>
</ul>`,
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Declaring the read path "solved by Redis" and moving on. A cache hides query cost from users, but the refresher still runs those queries, and with hour buckets the month query cannot finish inside the refresh interval. Say that the cache fixed latency, and that the cost of computing each window is still open.</p>`,
        },
        {
          type: "quiz",
          q: "The interviewer asks: \"What happens if the refresher job crashes at 10:00?\" Which answer is best?",
          options: [
            "All top-K requests start failing immediately",
            "Readers keep getting the last computed answers until their long TTL expires; an alert on answer age fires, the scheduler restarts the job, and because each run is idempotent, rerunning it is harmless",
            "The API falls back to querying Postgres directly on every request",
            "Nothing, because Redis recomputes the answers itself",
          ],
          answer: 1,
          explain: "With a TTL far longer than the refresh interval, a dead refresher degrades the product to \"a few minutes stale\" rather than broken. Falling back to direct queries would recreate the thundering herd at the worst moment. Each run simply overwrites the answers, so retries and duplicate runs are safe.",
        },
      ],
    },
  ],
  takeaways: [
    "Start with a complete, obviously correct design and let its bottlenecks set the agenda for the deep dives.",
    "All-time top K is cheap with an index on views (an index walk of K entries), but every increment pays to move that index entry.",
    "Windowed top K is expensive because the ranking of a sum needs every addend: no index or per-hour top list can stand in for summing every video's buckets.",
    "Read/write asymmetry: four distinct questions against ~800K writes per second, so precompute reads and focus engineering on writes.",
    "Prefer scheduled precomputation to TTL caching: TTL expiry causes a burst of slow misses that coalescing can shield the database from, but not the waiting users.",
    "Keep cached answers far longer than the refresh interval, alert on their age, and switch windows through a pointer key, so a slow or dead refresher means stale, not broken.",
  ],
  furtherReading: [
    { title: "Scaling Memcache at Facebook (Nishtala et al., NSDI 2013)", note: "Leases for thundering herds and stale sets, and how a large cache tier is operated." },
    { title: "PostgreSQL documentation: INSERT, ON CONFLICT clause", url: "https://www.postgresql.org/docs/current/sql-insert.html", note: "The upsert used by the baseline consumer and, in batches, by later chapters." },
    { title: "RFC 5861: HTTP Cache-Control Extensions for Stale Content", note: "Defines stale-while-revalidate and stale-if-error." },
  ],
};
