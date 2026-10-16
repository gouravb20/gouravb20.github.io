// System design problem breakdowns - interactive notes data.
// Original study notes. Problem list follows Hello Interview's "Question Breakdowns":
// https://www.hellointerview.com/learn/system-design/problem-breakdowns/top-k
window.DATA = {
  book: {
    title: `System Design Problem Breakdowns`,
    subtitle: `Classic system design interview problems, worked through from requirements to a final design, with labs that let you poke at each decision. Part I: <strong>YouTube Top K</strong>, the most-viewed videos for the last hour, day, month and all time at ~70 billion views a day. Part II: <strong>Flash Sale</strong>, 20,000 consoles for 10 million buyers without overselling. The problems follow Hello Interview's <a href="https://www.hellointerview.com/learn/system-design/problem-breakdowns/top-k" target="_blank" rel="noopener" style="color:var(--accent)">Top K</a> and <a href="https://www.hellointerview.com/learn/system-design/problem-breakdowns/flash-sale" target="_blank" rel="noopener" style="color:var(--accent)">Flash Sale</a> breakdowns; these notes and labs are written independently, so read the original walkthroughs there.`,
    storageKey: `problem_breakdowns_notes_v1`,
    appId: `problem-breakdowns-notes`,
    exportPrefix: `problem-breakdowns-progress`,
    pillarsTitle: `Four habits for any breakdown`,
    takeawaysTitle: `Ten things to remember`,
    labsIntro: `Each lab models one decision in the design. The numbers come from simple, stated assumptions rather than production measurements, so read them as shapes and ratios, not benchmarks. Labs reset when you leave the tab.`,
    mono: `PB`,
    shortTitle: `Problem Breakdowns`,
    tagline: `Interactive interview prep`
  },
  parts: {
    1: `Part I &middot; YouTube Top K`
  },
  fourQuestions: [
    { cls: `what`, q: `Pin down the contract`, text: `Top-K problems hide their difficulty in the requirements: which windows, sliding or tumbling, exact or approximate, how fresh, how large K can be. Propose concrete defaults and let the interviewer push back; every later choice depends on them.`, answer: `Ch 1: requirements, windows and estimates.` },
    { cls: `where`, q: `Let the numbers choose`, text: `70 billion views a day is roughly 800K events per second. That one number rules out "a counter row per video in one database" and points you at partitioning, sharding and aggregating in the stream before anything is written.`, answer: `Ch 1 (estimates), Ch 3 (the write path).` },
    { cls: `when`, q: `Start with something that works`, text: `A consumer incrementing counters in Postgres, plus an ORDER BY ... LIMIT query, is a complete answer. Draw it, then name its bottlenecks out loud before fixing them one at a time.`, answer: `Ch 2: the baseline and its bottlenecks.` },
    { cls: `how`, q: `Move work to write time`, text: `There are only a handful of distinct questions (four windows), asked millions of times. Precompute each answer, keep running totals per window, and serve from a cache, so a read never aggregates anything.`, answer: `Ch 2 (caching), Ch 4 (per-window totals), Ch 5 (final design).` }
  ],
  takeaways: [
    `Clarify windows first. <strong>Tumbling</strong> windows (10:00-11:00) put each event in exactly one bucket; <strong>sliding</strong> windows (the trailing 60 minutes) must add events and later remove them.`,
    `Write down the non-functional numbers: a <strong>lateness budget</strong> (e.g. 1 minute), <strong>exact vs approximate</strong>, read latency in <strong>tens of milliseconds</strong>, and a cap on K (e.g. 1,000).`,
    `Estimate with round numbers: ~10<sup>5</sup> seconds per day, so 70B views/day is ~700-800K writes per second; billions of videos at 16 bytes per counter is tens of GB.`,
    `A <strong>B-tree index on the count column</strong> makes all-time top K a short index walk, but windowed top K must sum every video in the window before sorting, which is a scan.`,
    `Reads are the easy half: a few distinct answers, refreshed by a scheduled job and served from <strong>Redis</strong>. Precomputing beats TTL caching because there's no expiry cliff.`,
    `<strong>Partition the event log and shard the counters by video ID.</strong> Each video then lives on one shard, so the global top K is guaranteed to be among the per-shard top Ks.`,
    `<strong>Aggregate in the stream</strong> (Flink, Kafka Streams): popularity is so skewed that summing per video per minute or hour cuts database writes by one to two orders of magnitude.`,
    `Keep <strong>running totals per window</strong> with an index on views, so top K is an index walk. Sliding windows update as "add the newest minute, subtract the minute that fell out".`,
    `A sliding month at minute granularity needs 43,200 buckets per video. Offer a hybrid: <strong>sliding last hour, tumbling day and month</strong>, or a lagged consumer that replays events to subtract them.`,
    `If "approximately right" is acceptable, a <strong>Count-Min Sketch plus a bounded heap</strong> finds heavy hitters in fixed memory. Generic time series databases fail here because every video ID is a separate series.`
  ],
  chapters: [
    // ------------------------------------------------------------------
    {
      id: `ch1`, part: 1, number: 1,
      title: `Scoping Top K: requirements, windows and the numbers`,
      overview: `"Show the most viewed videos" sounds like one sorted query, but almost every word in it hides a decision: over what time window, measured how, how exactly, how fresh, how many results, at what scale. In this problem those answers change the architecture more than usual, so the first minutes go into turning vague words into numbers and proposing sensible defaults. We settle on top K (K ≤ 1,000) for the last hour, day and month as <strong>tumbling</strong> windows plus all time, exact counts, at most a minute of lag, reads in tens of milliseconds, and a firehose of roughly 70 billion views a day.`,
      concepts: [
        { term: `Top-K query`, def: `Return the K items with the highest score within some scope, sorted. Here the items are videos, the score is view count and the scope is a time window.`, why: `The answer is tiny (at most K rows) and there are only a few scopes, so it can be computed ahead of time. What makes the problem hard is the scope: counting over a moving window for billions of videos.`, demo: `topkEstimator` },
        { term: `View event stream`, def: `Assume another part of the platform already emits a view event (video ID, event time, perhaps user ID) to a durable log such as Kafka whenever playback counts as a view. Our system consumes that log rather than exposing a "record view" API.`, why: `It skips boilerplate ingestion and gives you replay for free: if a consumer crashes or a bug corrupts counts, rewind the log and recompute.` },
        { term: `Tumbling window`, def: `Fixed-size, non-overlapping windows aligned to clock boundaries: 10:00-11:00, 11:00-12:00. "Last hour" means the most recent complete hour.`, why: `Every event belongs to exactly one window and the answer only changes when a window closes. That makes aggregation and precomputation simple, so it's the right default to propose first.`, demo: `windowTypes` },
        { term: `Sliding window`, def: `A trailing interval that ends now: at 10:06 "last hour" means 09:06-10:06. In practice it advances in small steps (for example every minute).`, why: `Fresher and what users intuitively expect for "trending now", but each event must be added when it arrives and removed when it ages out, so state has to remember when views happened.`, demo: `windowTypes` },
        { term: `Event time and the lateness budget`, def: `A view happens at its event time but may reach the pipeline seconds or minutes later. A lateness budget says how long a window waits for stragglers before its result is final, for example one minute.`, why: `It is the knob between freshness and completeness. It also tells the stream processor how far its watermark should trail the newest events.`, demo: `windowTypes` },
        { term: `Exact vs approximate`, def: `Exact means every view is counted and ties are resolved correctly. Approximate allows small, bounded errors in counts or ordering in exchange for far less memory and work.`, why: `A "trending" shelf doesn't care whether a video has 4,812,331 or 4,812,900 views; a creator payout does. Start exact (it's the harder constraint), then offer approximation as an optimisation.` },
        { term: `Bounded K`, def: `Cap how many results a client can ask for, typically 1,000.`, why: `A bounded answer can be precomputed, cached as one value and returned without pagination. A request for the top million is really a request for the dataset and belongs to an analytics export.` },
        { term: `Latency target drives precomputation`, def: `A read budget of tens of milliseconds rules out aggregating anything at query time; the answer must already exist when the request arrives.`, why: `This one requirement decides the shape of the read path: precomputed answers in a cache, refreshed in the background.` },
        { term: `Parking arbitrary time ranges`, def: `Supporting any historical range ("top videos for 3-17 June 2024") needs a general analytical store, because nothing can be precomputed for every possible range.`, why: `Explicitly marking it out of scope keeps the problem tractable and shows you know where the cliff is. Fixed windows ending now are what product features need.` },
        { term: `Back-of-the-envelope numbers`, def: `Use ~10<sup>5</sup> seconds per day: 70B views/day ≈ 700K-800K views per second on average, more at peak. With about an hour of video uploaded per second and videos averaging a few minutes, that's roughly a million new videos a day, billions over a decade. A video ID plus a count is ~16 bytes, so one counter per video is tens of GB.`, why: `These numbers settle the big questions: one database node can't absorb the writes, but one set of counters fits in memory on a large machine.`, demo: `topkEstimator` }
      ],
      cheatsheet: [
        { title: `Requirement decisions`, type: `table`, headers: [`Question`, `Default to propose`, `What it changes`], rows: [
          [`Which windows?`, `Last hour, day, month, all time`, `How many sets of counters you maintain`],
          [`Tumbling or sliding?`, `Tumbling, sliding as a deep dive`, `Whether you must subtract old views`],
          [`Exact or approximate?`, `Exact first`, `Whether sketches are allowed`],
          [`How fresh?`, `≤ 1 minute after the view`, `Watermark delay and refresh interval`],
          [`How big can K be?`, `≤ 1,000`, `Size of each precomputed answer`],
          [`Read latency?`, `Tens of ms`, `Precompute and cache; no query-time aggregation`],
          [`Arbitrary ranges?`, `Out of scope`, `Avoids a general OLAP store`]
        ] },
        { title: `Tumbling vs sliding windows`, type: `table`, headers: [``, `Tumbling`, `Sliding`], rows: [
          [`"Last hour" at 10:06`, `09:00-10:00`, `09:06-10:06`],
          [`Events per window`, `Each in exactly one`, `Each in many overlapping windows`],
          [`State to keep`, `One running total per window`, `Recent buckets, to subtract later`],
          [`Answer changes`, `Once per window`, `Every step (e.g. each minute)`],
          [`Good for`, `Day and month charts`, `"Trending right now"`]
        ] },
        { title: `API and estimates`, type: `code`, body: `GET /v1/top-videos?window=hour|day|month|all&k=100
200 OK
{ "window": "day", "asOf": "2026-10-13T10:00:00Z",
  "videos": [ { "videoId": "v_8f2c", "views": 48213377 }, ... ] }

writes:   70e9 views/day / 1e5 s/day      ~ 700K/s (peak 2x)
videos:   3,600 s uploaded/s / 360 s avg  ~ 10 videos/s ~ 1M/day
catalog:  1M/day * 365 * 10 years         ~ 3.6B videos
counters: 3.6B * (8 B id + 8 B count)     ~ 58 GB` }
      ],
      interview: [
        { q: `What would you ask before designing a top-K system?`, a: `Which windows (hour, day, month, all time), and whether they're tumbling or sliding; exact or approximate; the freshness budget; the maximum K; read latency and query volume; the scale of events and items; and whether arbitrary historical ranges are needed. Each answer changes the design, so I'd propose defaults (tumbling, exact, 1 minute, K ≤ 1,000, tens of ms) and check them.`, diff: `easy` },
        { q: `Why propose tumbling windows first?`, a: `Each view lands in exactly one window, so a window is a running total that's final once the window closes and the lateness budget passes. Sliding windows need every view to be subtracted later, which means remembering per-minute history. Starting tumbling gets a working design quickly, and sliding becomes a deliberate deep dive.`, diff: `easy` },
        { q: `Estimate the write rate and storage.`, a: `70B views/day over ~10<sup>5</sup> seconds is ~700K writes per second on average, maybe 1.5M at peak. New videos: about an hour of content per second divided by a few minutes per video is ~10 videos per second, ~1M per day, a few billion over ten years. At 16 bytes per (ID, count), one set of all-time counters is ~60 GB. So the counts fit in memory, but the write rate is far beyond one database node.`, diff: `medium` },
        { q: `What does a one-minute lateness budget buy you?`, a: `Permission to close a window a minute after it ends and treat it as final, which bounds how long state stays open and lets the stream processor's watermark trail event time by a fixed amount. It also gives the read path a refresh budget: recomputing each answer every minute is enough.`, diff: `medium` },
        { q: `Why cap K?`, a: `So each answer is a small, fixed-size value that can be precomputed, cached under one key and returned without pagination. Anyone asking for millions of results wants the dataset, which should come from a warehouse export, not a low-latency API.`, diff: `easy` }
      ],
      labs: [`topkEstimator`, `windowTypes`]
    },
    // ------------------------------------------------------------------
    {
      id: `ch2`, part: 1, number: 2,
      title: `A first working design: counters, hour buckets and cached answers`,
      overview: `Begin with something correct, however slow. A consumer reads view events and increments a counter row per video in Postgres; an index on the count column turns all-time top K into reading the first K index entries. For windows, store one row per video per hour and sum the buckets at query time: correct, but it aggregates hundreds of millions of rows per query. Then fix the cheap half first. There are only a few distinct questions, so cache their answers, and better still precompute them on a schedule so no request ever waits on the database.`,
      concepts: [
        { term: `Counter table with an index on views`, def: `A table (video_id, views) with a B-tree index on views. All-time top K is ORDER BY views DESC LIMIT K, answered by walking the first K entries of the index.`, why: `Reads are O(K). The price is on writes: every increment also moves the row's entry in the index (O(log n)), and there are hundreds of thousands per second.` },
        { term: `Hour-bucket rows`, def: `One row per (video_id, hour) holding that hour's views. A window query sums the buckets in range per video, then sorts.`, why: `Simple and correct for any of our windows. But the row count grows with every hour each video is watched, and the query can't use the views index.`, demo: `windowQueryCost` },
        { term: `Why windowed top K is expensive`, def: `To rank videos by views over a day you must first add up every video's 24 hourly buckets; only then can you sort. Sorted inputs don't help, because the sum of several sorted lists isn't sorted.`, why: `This is the core difficulty of the problem. Any design that aggregates at read time scans data proportional to the window, so the fix is to aggregate ahead of time.` },
        { term: `Naming the bottlenecks`, def: `Say them as you draw: one database write per view, a fast-growing bucket table, and scan-heavy window queries, plus every client request reaching the database.`, why: `Interviewers want to see you know where the design breaks before you fix it. It also gives you the agenda for the deep dives.` },
        { term: `Caching the answer`, def: `Put each window's result in Redis under a key such as topk:day:2026-10-13 with a TTL. A hit returns in well under a millisecond.`, why: `Reads are massively repetitive (four windows, a few K values), so even a short TTL removes almost all database reads.`, demo: `servingStrategy` },
        { term: `The expiry cliff`, def: `When a cached answer expires, or a new window starts with an empty key, every request in the next few seconds misses and fires the expensive query.`, why: `Coalescing (one in-flight query per key) protects the database, but the requests waiting on it still miss the latency target. TTL caching alone can't meet "tens of ms, always".`, demo: `servingStrategy` },
        { term: `Precomputing on a schedule`, def: `A refresher job computes every window's top K, say once a minute (inside the freshness budget), and writes the results into the cache. The API only ever reads the cache.`, why: `The slow query moves off the request path entirely, so latency is flat. The job also gets ahead of window boundaries instead of reacting to them.`, demo: `servingStrategy` },
        { term: `Serving stale rather than nothing`, def: `Keep each answer with a TTL much longer than the refresh interval, and alert on refresher lag.`, why: `If the job is slow or down, users see a list that's a few minutes old instead of errors. For a "most viewed" shelf that's the right trade.` },
        { term: `Read/write asymmetry`, def: `There are a handful of distinct read questions but hundreds of thousands of writes per second.`, why: `It tells you where to spend your time: the read path is solved by precomputation, and the real engineering is in counting and aggregating writes.` }
      ],
      cheatsheet: [
        { title: `Baseline schema and queries`, type: `code`, body: `CREATE TABLE video_views (video_id text PRIMARY KEY, views bigint NOT NULL);
CREATE INDEX ON video_views (views DESC);
-- all time: index walk, O(K)
SELECT video_id, views FROM video_views ORDER BY views DESC LIMIT 100;

CREATE TABLE video_views_hourly (video_id text, hour timestamptz, views bigint,
                                 PRIMARY KEY (video_id, hour));
-- last day: sums every video's buckets before sorting (a scan)
SELECT video_id, SUM(views) AS views FROM video_views_hourly
WHERE hour >= :day_start AND hour < :day_end
GROUP BY video_id ORDER BY views DESC LIMIT 100;` },
        { title: `Serving strategies`, type: `table`, headers: [`Strategy`, `DB queries`, `Latency at expiry`, `Staleness`, `Moving parts`], rows: [
          [`Query on every request`, `One per request`, `Always slow`, `None`, `None`],
          [`Cache with TTL`, `Burst at each expiry`, `Slow spike`, `≤ TTL`, `Cache`],
          [`TTL + coalescing`, `One per key per server`, `Still slow for waiters`, `≤ TTL`, `Cache, locks`],
          [`Scheduled precompute`, `Windows × refreshes`, `Flat`, `≤ refresh interval`, `Cache, job, lag alert`]
        ] },
        { title: `Bottlenecks to call out`, type: `list`, items: [
          `~800K single-row writes per second, each also updating an index.`,
          `Hour-bucket rows: one per video per active hour, growing without bound.`,
          `Window queries that aggregate every video in the window before sorting.`,
          `Every client request hitting the database (fixed by caching / precompute).`
        ] }
      ],
      interview: [
        { q: `Why is all-time top K cheap but last-day top K expensive in the baseline?`, a: `All-time counts live in one row per video with an index on views, so the top K are the first K index entries. Last-day counts must be built by summing 24 hourly buckets for every video viewed that day, and only then sorted. No index on the buckets can give you the order of their sums, so the database scans and hash-aggregates hundreds of millions of rows.`, diff: `medium` },
        { q: `Cache with a TTL or precompute?`, a: `Precompute. With a TTL, every expiry and every new window creates a burst of misses that run the expensive query and break the latency target; coalescing protects the database but not the waiting requests. A scheduled job that writes each answer before it's needed keeps reads flat, and a long TTL lets you serve slightly stale data if the job falls behind.`, diff: `medium` },
        { q: `How would you choose cache keys?`, a: `By window type and window start, for example topk:hour:2026-10-13T09 and topk:all. Store the largest K you support (1,000) and slice for smaller requests, so one key serves every K.`, diff: `easy` },
        { q: `What happens if the refresher job dies?`, a: `Readers keep getting the last computed answer until its long TTL runs out, so the product degrades to "a bit stale" rather than failing. Alert on the age of the newest answer, run the job with a leader lock or on a scheduler that restarts it, and make each run idempotent so a retry is harmless.`, diff: `medium` },
        { q: `Why start with a deliberately naive design?`, a: `It's complete and obviously correct, it gives the interviewer a shared picture, and its flaws define the deep dives. Jumping straight to a streaming architecture risks spending the interview defending components before you've shown you understand the data flow.`, diff: `easy` }
      ],
      labs: [`servingStrategy`]
    },
    // ------------------------------------------------------------------
    {
      id: `ch3`, part: 1, number: 3,
      title: `The write path: partitioning, sharding and aggregating in the stream`,
      overview: `Around 800K view events per second is far more than one relational node can apply as indexed updates (think ~10K per second). There are three levers. <strong>Partition</strong> the event log by video ID so each video's events go to one consumer. <strong>Shard</strong> the counters the same way, which keeps the top-K merge correct. Most importantly, <strong>aggregate before writing</strong>: views are so concentrated on popular videos that summing per video per minute or per hour in a stream processor turns hundreds of thousands of writes per second into a periodic batch of upserts.`,
      concepts: [
        { term: `Partition the log by video ID`, def: `Use the video ID as the Kafka message key, so all views of a video land in the same partition and are handled by the same consumer instance.`, why: `One owner per counter means no cross-consumer contention or double counting, and it creates a clean seam to split everything downstream.` },
        { term: `Shard the counters the same way`, def: `Split the counter tables across database shards by hash of video ID, aligned with the partitions, so each consumer writes to one shard.`, why: `It divides the write load. Writing per event at ~10K writes per second per node would still take ~80 shards, so sharding alone is a blunt instrument.`, demo: `shardMerge` },
        { term: `Merging per-shard top K`, def: `Ask each shard for its own top K and merge the lists.`, why: `This is exact only because each video's whole count lives on one shard: a video in the global top K must be in its own shard's top K. If one video's views were spread across shards, partial counts could keep it out of every local list.`, demo: `shardMerge` },
        { term: `Hot keys and skew`, def: `A viral video can send a large share of all events to one partition and one shard.`, why: `Keyed partitioning trades even load for correctness. Mitigate it by pre-aggregating before the keyed stage, or by splitting a known hot key into sub-keys (video#1..video#8) and adding them back together at the end.`, demo: `shardMerge` },
        { term: `Two-stage aggregation`, def: `First count locally in whatever partition an event happens to land in, then re-key the partial sums by video ID and add them up.`, why: `This is how stream processors and MapReduce combiners handle skew: the hot video's millions of events become a few partial sums before they reach its single owner.`, demo: `shardMerge` },
        { term: `Pre-aggregating in the stream`, def: `Count views per (video, window) in memory and flush the sums periodically, for example every minute or at the end of each hour.`, why: `Popularity follows a power law, so the number of distinct videos in an interval is far smaller than the number of events. Writes drop by one to two orders of magnitude, and bulk upserts are much cheaper per row than single updates.`, demo: `batchingWrites` },
        { term: `Stream processor`, def: `A framework such as Flink, Kafka Streams or Spark Structured Streaming that provides keyed state, event-time windows, watermarks and checkpointing over a log.`, why: `You get correct windowed aggregation and failure recovery without building them yourself. Be ready to explain what each of those features does, because interviewers will ask.` },
        { term: `Watermarks and allowed lateness`, def: `A watermark is the processor's estimate that no older events are still coming. With a bounded-out-of-orderness watermark of, say, 30 seconds, a window closes once the watermark passes its end; later stragglers are dropped, sent to a side output, or used to update the result.`, why: `This is how the lateness budget from the requirements becomes code. Set it below the freshness target (e.g. 30 seconds against a 1-minute budget).` },
        { term: `Checkpoints, replay and idempotent sinks`, def: `The processor periodically snapshots its state together with the Kafka offsets it has consumed. After a crash it restores the snapshot and replays the log from those offsets.`, why: `Replay means some aggregates are emitted twice, so sinks must be idempotent: upsert keyed by (video, window) with the full value, not "add 37".` },
        { term: `Bulk upserts`, def: `Write each flush as large batches (multi-row INSERT ... ON CONFLICT, or COPY into a staging table followed by a merge).`, why: `Per-row overhead (round trips, transaction commits, WAL flushes) dominates single-row writes; batching amortises it.` }
      ],
      cheatsheet: [
        { title: `Write-path levers`, type: `table`, headers: [`Lever`, `Effect`, `Cost`], rows: [
          [`Partition log by video ID`, `One owner per counter`, `Hot partitions for viral videos`],
          [`Shard counters by video ID`, `Divides writes; merge stays exact`, `Many nodes; scatter-gather reads`],
          [`Aggregate per minute / hour`, `10-100× fewer writes`, `State in memory; lag up to the flush interval`],
          [`Two-stage aggregation`, `Absorbs skew`, `Extra shuffle stage`],
          [`Bulk upserts`, `Cheaper per row`, `Bursty write pattern`]
        ] },
        { title: `Stream job sketch`, type: `code`, body: `source  = kafka("view-events")                 # keyed by videoId
            .watermark(maxOutOfOrder = 30s)        # lateness budget < 1 min
counts  = source.keyBy(videoId)
            .window(tumbling(1 hour))              # or 1-minute panes
            .count()                               # state: videoId -> count
counts.sink(upsert("video_views_hourly",           # idempotent: full value
                   key = (videoId, windowStart)))
checkpoint(every = 30s)                            # state + Kafka offsets` },
        { title: `Failure questions to expect`, type: `list`, items: [
          `Consumer crash: restore the last checkpoint, replay from its offsets, rely on idempotent upserts.`,
          `Late events beyond the watermark: drop and count them, or emit corrections.`,
          `Viral video: pre-aggregate or salt the hot key; watch per-partition lag.`,
          `Database shard down: the stream processor buffers (backpressure) and Kafka retains events until it recovers.`
        ] }
      ],
      interview: [
        { q: `Is merging the per-shard top K lists exact?`, a: `Yes, if the data is sharded by video ID. Every view of a video is on one shard, so its full count is there; any video in the global top K beats all but at most K−1 videos overall, so it beats all but at most K−1 on its own shard and appears in that shard's top K. If views of one video were spread across shards (round-robin), the merge could miss videos whose partial counts never make a local list.`, diff: `medium` },
        { q: `How much does pre-aggregation actually save?`, a: `It depends on how many distinct videos are watched per interval. With a power-law popularity curve, a minute's ~50M views might touch a few million distinct videos, and an hour's views far fewer per event, so writes per second drop by 10-100×. Longer flush intervals save more but delay results and keep more state in memory.`, diff: `medium` },
        { q: `A video goes viral. What breaks and how do you fix it?`, a: `Its partition and its counter's owner receive a disproportionate share of events, so that consumer lags. Pre-aggregate in an earlier stage so the owner receives a few partial sums instead of millions of events, or split the hot key into sub-keys and recombine. Monitor consumer lag per partition to spot it.`, diff: `hard` },
        { q: `How do you avoid double counting after a crash?`, a: `Checkpoint state together with consumed offsets, restore and replay from there, and make every write idempotent: upsert the full aggregate for (video, window) rather than incrementing. Replayed windows then overwrite themselves with the same value.`, diff: `medium` },
        { q: `Why not just add database shards until the writes fit?`, a: `At ~10K indexed writes per second per node that's around 80 shards for a counter table, which is costly and still fragile at peaks. Aggregating first attacks the cause: most writes are to the same popular videos, and summing them in memory makes a few shards enough.`, diff: `easy` }
      ],
      labs: [`shardMerge`, `batchingWrites`]
    },
    // ------------------------------------------------------------------
    {
      id: `ch4`, part: 1, number: 4,
      title: `The read path: rollups, per-window totals and sliding windows`,
      overview: `Caching hides query cost from users, but the refresher still has to compute each window's top K, and summing hourly buckets across a month for billions of videos is batch-job sized. Three ways out: keep <strong>coarser rollups</strong> so long windows sum fewer rows; keep a <strong>running total per window</strong> with an index on views, so top K is an index walk again; or keep all of that state <strong>inside the stream processor</strong> and emit top K directly to the cache. Sliding windows add one more twist: every view must eventually be subtracted, which costs either minute-level history or a second, delayed pass over the log.`,
      concepts: [
        { term: `Rollup tables`, def: `Besides hourly buckets, maintain daily and monthly totals per video, written by the stream job or by a periodic job.`, why: `A month query sums ~30 daily rows per video instead of ~720 hourly ones. It still aggregates every video at query time, just over fewer rows.`, demo: `windowQueryCost` },
        { term: `Per-window running totals`, def: `One table per window (views_last_hour, views_last_day, views_last_month, views_all_time) holding each video's current total, each with an index on views.`, why: `Top K becomes an index walk for every window, so the refresher is trivial. The cost moves to writes: each flush updates four tables instead of one.`, demo: `windowQueryCost` },
        { term: `Swapping tumbling windows`, def: `For a tumbling window, build the next window's totals in a fresh table while the current one is served, then switch atomically (rename, or change which table the refresher reads).`, why: `Readers never see a half-built window, and expiring the old window is a cheap table drop rather than millions of deletes.` },
        { term: `Sliding update: add the new, subtract the old`, def: `Every minute: add the counts from the minute that just finished, and subtract the counts from the minute that just left the window (60 minutes ago for "last hour").`, why: `It keeps a sliding total current with work proportional to recent activity, not the window size. But you need the old minute's counts at subtraction time.`, demo: `slidingCounter` },
        { term: `The retention cost of sliding windows`, def: `Subtracting means keeping minute-level counts for the whole window: 60 buckets per video for an hour, 1,440 for a day, 43,200 for a month.`, why: `For a sliding month that's a huge, mostly useless table. It's the main reason to push back on "everything must slide".`, demo: `slidingCounter` },
        { term: `Hybrid windows`, def: `Slide the last hour at minute granularity; keep day and month tumbling (or sliding in coarse hourly steps).`, why: `It matches what users notice: "trending now" should move every minute, while a monthly chart barely changes. Proposing it shows product judgement, not just technique.`, demo: `slidingCounter` },
        { term: `Lagged consumer for subtraction`, def: `Run a second consumer group on the same Kafka topic that trails the live consumer by exactly the window length and subtracts each event as it passes.`, why: `No minute-level table is needed; the log itself is the history. The topic must retain at least one window (a month), which Kafka handles cheaply because it's sequential storage.`, demo: `slidingCounter` },
        { term: `All state in the stream processor`, def: `Keep per-window counts in the processor's keyed state (backed by RocksDB on local disk), compute each window's top K in a second stage with a heap, and write results straight to a Redis sorted set.`, why: `It removes the counter database and the refresher. The catch is depth: you must be able to explain keyed state, checkpoints and the two-stage job, and some interviewers will steer you back to simpler primitives.` },
        { term: `Native sliding windows multiply state`, def: `A stream engine's sliding window of one month that advances every minute keeps a separate aggregate for every overlapping window: 43,200 copies per key.`, why: `It looks like a one-liner but explodes memory. Use small tumbling panes (minute or hour sums) and combine them, which is what the add/subtract approach does.` },
        { term: `Sorted sets for serving`, def: `Redis sorted sets keep members ordered by score: ZADD to set a score, ZINCRBY to add, ZREVRANGE 0 K-1 to read the top K in O(log n + K).`, why: `A natural home for precomputed answers, and even for live counters at small scale. Keep only the top few thousand members per window so memory stays bounded.` }
      ],
      cheatsheet: [
        { title: `Ways to answer a windowed top-K query`, type: `table`, headers: [`Design`, `Work per refresh`, `Writes per flush`, `Notes`], rows: [
          [`Hour buckets, sum at query`, `Every bucket in the window`, `1 table`, `Simple; month queries are huge scans`],
          [`Hour + day + month rollups`, `Fewer, coarser rows`, `2-3 tables`, `Still aggregates every video`],
          [`Per-window totals + index`, `K index entries`, `4 tables`, `Fast reads; heavier writes`],
          [`State in the stream processor`, `Heap per window`, `Cache only`, `Least infrastructure; most expertise`]
        ] },
        { title: `Sliding update, per minute`, type: `code`, body: `-- new  = counts for the minute that just closed      (from the stream job)
-- old  = counts for the minute that left the window   (minute = now - 60)
UPDATE views_last_hour t
SET    views = t.views + COALESCE(n.views, 0) - COALESCE(o.views, 0)
FROM   minute_counts n FULL JOIN minute_counts o USING (video_id)
WHERE  n.minute = :just_closed AND o.minute = :just_expired
AND    t.video_id = COALESCE(n.video_id, o.video_id);
-- all-time window: subtract nothing` },
        { title: `Choosing a sliding-window strategy`, type: `list`, items: [
          `Minute buckets plus add/subtract: simple, but stores 60 × window-in-hours buckets per active video.`,
          `Lagged consumer: no bucket table; requires topic retention ≥ window and a second consumer.`,
          `Hybrid: sliding hour, tumbling day and month. Usually the right product answer.`,
          `Avoid engine-native sliding windows with tiny slides over long windows: state is multiplied by window ÷ slide.`
        ] }
      ],
      interview: [
        { q: `Rollups or per-window totals?`, a: `Rollups reduce how many rows a long-window query sums, but the refresher still aggregates every video each time. Per-window totals with an index on views make every window's top K an index walk, at the cost of updating several tables per flush. With batched upserts from the stream job, per-window totals win for this problem because reads must be cheap and writes are already aggregated.`, diff: `medium` },
        { q: `How do you support a sliding last hour?`, a: `Aggregate views per minute in the stream job. Every minute, add the newest minute's counts to views_last_hour and subtract the counts from the minute that is now 61 minutes old, which means keeping an hour of minute buckets. Refresh the cached top K right after.`, diff: `medium` },
        { q: `Why not make the month window slide every minute too?`, a: `You'd need 43,200 minute buckets per video to subtract from, and the ranking would barely change minute to minute anyway. Offer hourly steps for the month, or tumbling, and point out that users judge freshness on the hour window, not the month.`, diff: `medium` },
        { q: `Explain the lagged-consumer trick.`, a: `A second consumer group reads the same view topic, but only processes events once they are exactly one window old, and subtracts them from the window total. The log is the history, so there is no minute table. It needs topic retention of at least the window length and careful handling of time (use event time with the same watermark as the adder).`, diff: `hard` },
        { q: `What's the risk of keeping everything in Flink?`, a: `It's elegant (no counter database, top K written straight to Redis), but it moves the hard parts into framework internals: keyed state size, RocksDB, checkpoint duration, rescaling, a second keyed stage per window. If the interviewer doesn't know Flink, you'll spend the time explaining it, so present it as an option after the primitives-based design.`, diff: `hard` }
      ],
      labs: [`windowQueryCost`, `slidingCounter`]
    },
    // ------------------------------------------------------------------
    {
      id: `ch5`, part: 1, number: 5,
      title: `Approximation, specialised stores and the final design`,
      overview: `So far precision has forced us to keep a counter for every video in every window. If the product can live with small errors (and trending lists usually can, since the top videos are separated by large margins), a <strong>Count-Min Sketch paired with a bounded heap</strong> finds the heavy hitters in fixed memory. This chapter also asks whether a specialised store could do the job: generic time series databases fail on billions of video IDs, while TimescaleDB and real-time OLAP engines (Druid, Pinot, ClickHouse) essentially automate the rollups we built by hand. It ends with the full design and what interviewers expect at each level.`,
      concepts: [
        { term: `When approximation is acceptable`, def: `Errors are bounded and small relative to the gaps between top items, and the feature is about trends rather than money or contracts.`, why: `It unlocks fixed-memory structures. Errors only matter near the boundary at position K, where items with similar counts might swap.`, demo: `cmsTopK` },
        { term: `Count-Min Sketch`, def: `A d × w grid of counters. Each item increments one counter per row (one hash per row); its estimate is the minimum of its d counters. Estimates never undercount, and with w = e/ε and d = ln(1/δ) they overcount by at most εN with probability 1 − δ.`, why: `Memory depends on the error you accept, not on how many videos exist. But a sketch forgets item IDs, so it can't list the top items by itself.`, demo: `cmsTopK` },
        { term: `Sketch plus heap`, def: `For each event, add it to the sketch and read back its estimate. Keep a min-heap of candidates (a few times K); if the item is already there update it, otherwise insert it if its estimate beats the heap minimum, evicting the minimum.`, why: `The sketch provides counts for any item; the heap remembers which IDs are heavy. Reading the top K is reading the heap.`, demo: `cmsTopK` },
        { term: `Counter-based heavy hitters`, def: `Misra-Gries and Space-Saving keep a fixed number of (item, count) slots and, when a new item arrives and slots are full, reuse the smallest slot.`, why: `They track IDs directly and give deterministic error bounds, a good alternative to mention if the interviewer asks what else exists.` },
        { term: `Sketches per window`, def: `Keep one sketch and heap per tumbling window. Sketches with the same dimensions and hashes merge by adding cell by cell.`, why: `Merging means hourly sketches can be rolled up into daily ones. Sliding windows need subtraction, which a Count-Min Sketch supports only for items previously added, and which Redis's sketch commands don't offer.` },
        { term: `Where the sketch lives`, def: `Redis (RedisBloom) offers sketch commands and sorted sets, so a consumer can increment, query and ZADD per event. Alternatively the sketch and heap live in the stream processor's checkpointed state.`, why: `Redis is simple, but an update can land in the sketch and not the sorted set, and Redis persistence can't be lined up with Kafka offsets. In the stream processor both are restored together with the offsets.` },
        { term: `Generic time series databases`, def: `InfluxDB and Prometheus store one series per unique tag combination and query individual series quickly.`, why: `With video ID as a tag there are billions of series, far beyond what they're built for, and "top K across all series" touches every one. Good for one video's view graph, bad for ranking all of them.` },
        { term: `TimescaleDB`, def: `Postgres with time-partitioned hypertables and continuous aggregates (incrementally maintained materialised views).`, why: `Continuous aggregates for the last hour, day and month are our per-window totals, maintained by the database. You still need caching, and likely sharding at this write rate.` },
        { term: `Real-time OLAP`, def: `Druid, Pinot and ClickHouse ingest from Kafka and pre-aggregate on ingest: Druid rolls rows up by time bucket, Pinot uses star-tree indexes, ClickHouse uses materialised views into SummingMergeTree tables.`, why: `They answer GROUP BY video ORDER BY views LIMIT K over a window quickly. They're operationally heavy at this scale, and you must be able to explain their ingestion path when asked.` },
        { term: `The final design`, def: `Kafka (keyed by video) → stream job (watermark, minute/hour aggregation, checkpoints) → per-window totals in sharded storage or processor state → refresher computing each window's top K every minute → Redis → stateless top-K API behind a load balancer.`, why: `Every box traces back to a requirement: the log for replay, the stream job for write volume and lateness, per-window totals for cheap ranking, the cache for latency.` },
        { term: `Expectations by level`, def: `Mid-level: a working end-to-end design and some of its bottlenecks. Senior: a near-optimal design, proactive about bottlenecks, comfortable with streaming vs batch trade-offs. Staff+: sees the whole solution space and picks between options with clear judgement, going beyond the standard deep dives.`, why: `It tells you how to spend the time: breadth first, then depth where your experience is real.` }
      ],
      cheatsheet: [
        { title: `Specialised stores for top K`, type: `table`, headers: [`Store`, `Fit`, `Why`], rows: [
          [`InfluxDB / Prometheus`, `Poor`, `A series per video ID; ranking scans every series`],
          [`TimescaleDB`, `Good`, `Continuous aggregates = per-window totals; still cache and shard`],
          [`Druid / Pinot / ClickHouse`, `Good`, `Ingest-time rollups and fast top-N; heavy to run`],
          [`Redis sorted sets`, `Serving layer`, `Precomputed answers; bounded member count`]
        ] },
        { title: `Final design`, type: `code`, body: `view events ──► Kafka "view-events" (key = videoId, retention ≥ 30 days)
                    │
                    ▼
      stream job: watermark 30 s · minute panes · checkpoints
                    │  idempotent bulk upserts per flush
                    ▼
      per-window totals (hour sliding, day, month, all time)
      sharded by videoId, index on views   ── or processor state
                    │  every minute: top 1,000 per window, merge shards
                    ▼
                Redis  topk:{window}  (long TTL, serve stale)
                    ▲
      clients ──► LB ──► top-K API (stateless, cache reads only)` },
        { title: `Approximate top K checklist`, type: `list`, items: [
          `Confirm the product tolerates small, bounded errors.`,
          `Size the sketch from the error bound (w = e/ε, d = ln 1/δ), not from the catalogue size.`,
          `Keep a candidate heap several times larger than K to protect the boundary.`,
          `One sketch per tumbling window; merge sketches to roll up.`,
          `Prefer processor state over Redis when you need recovery aligned with Kafka offsets.`
        ] }
      ],
      interview: [
        { q: `How does a Count-Min Sketch find the top K if it doesn't store IDs?`, a: `It doesn't on its own. Pair it with a heap: after adding each event to the sketch, query its estimated count and offer the item to a bounded min-heap of candidates. The heap holds the IDs; the sketch supplies counts for any item, including ones not in the heap.`, diff: `medium` },
        { q: `What errors can the sketch-plus-heap approach make?`, a: `Counts are overestimated, never under, by at most about e·N/w with high probability. Items near the K-th position can be ordered wrongly or swapped with the next one. Rarely, an item evicted early from the heap is undercounted when it returns, because its heap entry restarts from the sketch estimate (which is still an overestimate). A larger candidate heap and wider sketch shrink both.`, diff: `hard` },
        { q: `Would you use InfluxDB for this?`, a: `No. It keys data by series, and with video ID as a tag there would be billions of series. Ranking across all of them touches every series, which it isn't built for. It's great for plotting one video's views over time.`, diff: `medium` },
        { q: `When would you pick Druid or ClickHouse over the custom pipeline?`, a: `When the organisation already runs one, or when the product needs many slice-and-dice queries beyond fixed windows. Their ingest-time rollups do what our stream job and per-window tables do. In an interview, only propose one if you can explain its ingestion and rollup mechanics.`, diff: `medium` },
        { q: `Walk through the final design end to end.`, a: `View events go to Kafka keyed by video ID. A stream job with a 30-second watermark aggregates per video per minute and hour, checkpointing state with offsets, and bulk-upserts idempotent aggregates into per-window totals sharded by video ID (sliding hour, tumbling day and month, all time). A refresher reads the top 1,000 per window from each shard every minute, merges them and writes Redis. The stateless API reads Redis only, so reads stay in the low milliseconds, and stale answers are served if the refresher lags.`, diff: `hard` },
        { q: `What separates a senior answer from a mid-level one here?`, a: `A mid-level answer gets an end-to-end design and fixes some bottlenecks with help. A senior answer gets near the final design largely unprompted: it quantifies the write rate, aggregates before writing, keeps the shard merge exact, precomputes reads, and argues tumbling vs sliding with product reasons. Staff+ adds judgement across alternatives (stream state vs database, sketches, OLAP) and failure handling.`, diff: `easy` }
      ],
      labs: [`cmsTopK`]
    }
  ]
};
