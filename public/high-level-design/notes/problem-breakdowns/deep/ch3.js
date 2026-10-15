// Deep dive: Chapter 3, The write path. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch3 = {
  hook: `<p>Picture the baseline from Chapter 2 on its first real day. Views arrive at roughly 800K a second; the consumer applies them to Postgres at perhaps 10K indexed updates a second. Every second, the backlog grows by about 790K events. After one minute the consumer is some 47 million events behind; after an hour, close to three billion. The "last hour" shelf is showing yesterday, and it will never catch up.</p>
<p>Throwing hardware at it helps only a little: you would need around 80 database nodes on an average day and more at peak, and the hottest videos would still queue on their own rows. The fix is to change what reaches the database. This chapter splits the stream so each video has one owner, shards the counters the same way, and, most importantly, adds up views in memory before writing anything.</p>`,
  sections: [
    {
      id: "write-wall",
      title: "Hitting the write wall",
      kicker: "The problem",
      blocks: [
        {
          type: "problem",
          html: `<p>One write per view means the database must absorb the raw event rate. At <span class="formula">800K/s ÷ 10K/s per node ≈ 80 nodes</span> on average (about 150 at a 2× peak), the write path would be the most expensive part of the system by far, and it would still be fragile: one viral video concentrates its load on one row on one node.</p>`,
        },
        {
          type: "idea",
          html: `<p>Pull three levers, in order of impact: <strong>partition</strong> the event log by video ID so each video has a single owner; <strong>shard</strong> the counters on the same key; and above all <strong>aggregate before writing</strong>, so the database receives one sum per video per interval instead of one row per view.</p>`,
        },
        {
          type: "text",
          html: `<p>The levers reinforce each other. Partitioning gives every video exactly one consumer, so no two workers ever race to update the same counter. Sharding the storage on the same key means each consumer talks to one shard, and (as the next section shows) it keeps the final top-K merge exact. Aggregation then cuts the number of writes per shard by one to two orders of magnitude, because a small fraction of videos receives most of the views.</p>`,
        },
        {
          type: "diagram",
          title: "The write path, partitioned end to end by video ID",
          caption: "Kafka routes each video's events to one partition; one stream task owns each partition, sums views per video in memory and periodically upserts the sums into the shard that owns those videos. No two tasks ever touch the same counter.",
          svg: `<svg viewBox="0 0 640 265" role="img" aria-label="View events flow into a Kafka topic with four partitions keyed by video ID, through four stream tasks that sum per video, into four counter shards">
<defs><marker id="pb3-path-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="10" y="105" width="90" height="50" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="55" y="126" text-anchor="middle" font-size="13" font-weight="700">View</text>
<text x="55" y="143" text-anchor="middle" font-size="13" font-weight="700">events</text>
<text x="190" y="22" text-anchor="middle" font-size="12" font-weight="700">Kafka (key = videoId)</text>
<rect x="130" y="32" width="120" height="196" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<text x="360" y="22" text-anchor="middle" font-size="12" font-weight="700">Stream job</text>
<rect x="290" y="32" width="140" height="196" rx="8" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="1.5"/>
<text x="550" y="22" text-anchor="middle" font-size="12" font-weight="700">Counter shards</text>
<rect x="470" y="32" width="160" height="196" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<rect x="140" y="45" width="100" height="32" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-1)" stroke-width="1"/>
<text x="190" y="66" text-anchor="middle" font-size="12">partition 0</text>
<rect x="140" y="90" width="100" height="32" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-1)" stroke-width="1"/>
<text x="190" y="111" text-anchor="middle" font-size="12">partition 1</text>
<rect x="140" y="135" width="100" height="32" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-1)" stroke-width="1"/>
<text x="190" y="156" text-anchor="middle" font-size="12">partition 2</text>
<rect x="140" y="180" width="100" height="32" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-1)" stroke-width="1"/>
<text x="190" y="201" text-anchor="middle" font-size="12">partition 3</text>
<rect x="300" y="45" width="120" height="32" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-4)" stroke-width="1"/>
<text x="360" y="66" text-anchor="middle" font-size="12">sum per video</text>
<rect x="300" y="90" width="120" height="32" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-4)" stroke-width="1"/>
<text x="360" y="111" text-anchor="middle" font-size="12">sum per video</text>
<rect x="300" y="135" width="120" height="32" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-4)" stroke-width="1"/>
<text x="360" y="156" text-anchor="middle" font-size="12">sum per video</text>
<rect x="300" y="180" width="120" height="32" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-4)" stroke-width="1"/>
<text x="360" y="201" text-anchor="middle" font-size="12">sum per video</text>
<rect x="490" y="45" width="120" height="32" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-2)" stroke-width="1"/>
<text x="550" y="66" text-anchor="middle" font-size="12">shard 0</text>
<rect x="490" y="90" width="120" height="32" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-2)" stroke-width="1"/>
<text x="550" y="111" text-anchor="middle" font-size="12">shard 1</text>
<rect x="490" y="135" width="120" height="32" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-2)" stroke-width="1"/>
<text x="550" y="156" text-anchor="middle" font-size="12">shard 2</text>
<rect x="490" y="180" width="120" height="32" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-2)" stroke-width="1"/>
<text x="550" y="201" text-anchor="middle" font-size="12">shard 3</text>
<line x1="100" y1="130" x2="128" y2="130" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#pb3-path-arrow)"/>
<line x1="240" y1="61" x2="298" y2="61" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#pb3-path-arrow)"/>
<line x1="240" y1="106" x2="298" y2="106" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#pb3-path-arrow)"/>
<line x1="240" y1="151" x2="298" y2="151" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#pb3-path-arrow)"/>
<line x1="240" y1="196" x2="298" y2="196" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#pb3-path-arrow)"/>
<line x1="420" y1="61" x2="488" y2="61" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#pb3-path-arrow)"/>
<line x1="420" y1="106" x2="488" y2="106" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#pb3-path-arrow)"/>
<line x1="420" y1="151" x2="488" y2="151" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#pb3-path-arrow)"/>
<line x1="420" y1="196" x2="488" y2="196" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#pb3-path-arrow)"/>
<text x="190" y="250" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">~800K events/s in</text>
<text x="360" y="250" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">state in memory</text>
<text x="550" y="250" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">batched upserts</text>
</svg>`,
        },
      ],
    },
    {
      id: "partition-and-shard",
      title: "Partition the log, shard the counters, merge exactly",
      kicker: "One owner per video",
      blocks: [
        {
          type: "text",
          html: `<p>Kafka decides a message's partition from its key: with the default partitioner, messages with the same key always hash to the same partition (as long as the partition count does not change). Use the video ID as the key and every view of a video lands in one partition. Within a consumer group, each partition is read by exactly one consumer instance, so each video's counter has exactly <strong>one owner</strong>: no locks between consumers, no double counting, no lost updates.</p>
<p>Shard the counter tables by the same hash of video ID, aligned with the partitions, so each consumer writes to one shard. To read the global top K, ask every shard for its own top K and merge the lists. That merge is <strong>exact</strong>, and the reason is worth being able to state precisely.</p>`,
        },
        {
          type: "steps",
          title: "Why merging per-shard top K lists is exact when sharded by video",
          items: [
            "Every view of a video is on one shard, so that shard holds the video's complete count.",
            "Take any video V in the true global top K. Fewer than K videos in the whole system have a higher count than V.",
            "The videos that beat V on its own shard are a subset of those, so fewer than K of them exist there too.",
            "So V appears in its shard's local top K, with its full count. The merged list therefore contains every true top-K video with correct counts.",
          ],
        },
        {
          type: "text",
          html: `<p>Now break the precondition. Spread events round robin, so each video's views are split across shards, and the merge can fail badly. With two shards and K = 1: shard 1 sees A with 50 views and B with 45; shard 2 sees C with 50 and B with 45. Each shard reports its own leader, A and C, at 50 each. The true leader is B with 90, and it appears in neither list. Partial counts kept it out of every local top K.</p>
<p>Round robin does balance load perfectly, which is why it is tempting. The lab lets you see both sides of that trade.</p>`,
        },
        {
          type: "lab",
          id: "shardMerge",
          caption: "Start with partitioning by video ID and check that the merged list matches the true top K exactly. Switch to round robin: load evens out, but reported counts come up short and videos near position K go missing. Turn on the viral video to see one shard carry far more than its share, then try the two-stage option, which keeps both even load and exact counts.",
        },
        {
          type: "quiz",
          q: "Counters are sharded by video ID across 16 shards. You merge each shard's top 100 to get the global top 100. Which statement is true?",
          options: [
            "The result is approximate; you should fetch each shard's top 1,600 to be safe",
            "The result is exact, because each video's full count lives on one shard, so every global top-100 video is in its own shard's top 100",
            "The result is exact only if the shards hold equal numbers of videos",
            "The result is exact only for the all-time window",
          ],
          answer: 1,
          explain: "Sharding by the ranked key is what makes the merge exact, for any window. Shard sizes do not matter. Over-fetching is only needed when one item's score is split across shards, which is exactly what sharding by video ID prevents.",
        },
      ],
    },
    {
      id: "hot-keys",
      title: "Hot keys: when one video is the whole stream",
      kicker: "Skew",
      blocks: [
        {
          type: "problem",
          html: `<p>Keyed partitioning trades even load for correctness. If one video suddenly draws 15% of all views, that is about 120K events a second funnelled into one partition, one consumer and one shard, while the others idle. Its consumer falls behind, and because the shelf waits for every partition's watermark to advance, that one lagging partition can delay results for everyone.</p>`,
        },
        {
          type: "text",
          html: `<p>The general cure is <strong>two-stage aggregation</strong>. In stage one, count locally wherever an event happens to land, with no regard for keys, so the load is even. Every flush interval, each stage-one task emits one partial sum per video it saw. In stage two, re-key those partial sums by video ID and add them up. The viral video's millions of events arrive at its single owner as a handful of partial sums, one per stage-one task per flush.</p>
<p>A more targeted variant is <strong>key salting</strong>: when a video is known to be hot, append a suffix to its key (<code>v42#0</code> to <code>v42#7</code>), so its events spread over eight partitions, then add the eight sub-counts back together at the end. It needs a way to detect hot keys and adds a combining step, so it is usually reserved for the few keys that need it. Either way, watch per-partition consumer lag: it is the signal that skew is hurting.</p>`,
        },
        {
          type: "diagram",
          title: "Two-stage aggregation absorbs a viral video",
          caption: "Stage one counts wherever events land, so load is even. Stage two receives one partial sum per stage-one task instead of a million raw events, and its total is exact.",
          svg: `<svg viewBox="0 0 640 245" role="img" aria-label="Four stage-one tasks each send a partial count for video v42 to a single stage-two owner that sums them">
<defs><marker id="pb3-two-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<text x="105" y="24" text-anchor="middle" font-size="12" font-weight="700">Stage 1: any task</text>
<text x="295" y="24" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">re-key by videoId</text>
<text x="500" y="80" text-anchor="middle" font-size="12" font-weight="700">Stage 2: keyed</text>
<rect x="20" y="40" width="170" height="36" rx="6" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="1.5"/>
<text x="105" y="63" text-anchor="middle" font-size="12">task 1: v42 = 250K</text>
<rect x="20" y="90" width="170" height="36" rx="6" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="1.5"/>
<text x="105" y="113" text-anchor="middle" font-size="12">task 2: v42 = 248K</text>
<rect x="20" y="140" width="170" height="36" rx="6" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="1.5"/>
<text x="105" y="163" text-anchor="middle" font-size="12">task 3: v42 = 251K</text>
<rect x="20" y="190" width="170" height="36" rx="6" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="1.5"/>
<text x="105" y="213" text-anchor="middle" font-size="12">task 4: v42 = 251K</text>
<rect x="400" y="95" width="200" height="70" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="500" y="122" text-anchor="middle" font-size="13" font-weight="700">owner of v42</text>
<text x="500" y="144" text-anchor="middle" font-size="12">4 messages, sum = 1M</text>
<line x1="190" y1="58" x2="398" y2="118" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#pb3-two-arrow)"/>
<line x1="190" y1="108" x2="398" y2="126" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#pb3-two-arrow)"/>
<line x1="190" y1="158" x2="398" y2="134" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#pb3-two-arrow)"/>
<line x1="190" y1="208" x2="398" y2="142" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#pb3-two-arrow)"/>
<text x="500" y="195" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">instead of 1M raw events</text>
</svg>`,
        },
        {
          type: "realworld",
          items: [
            { org: "MapReduce", title: "Combiners (OSDI 2004)", html: "The original MapReduce paper describes an optional combiner that partially merges a mapper's output before the shuffle, exactly stage one of two-stage aggregation, to cut network traffic for skewed keys such as common words." },
            { org: "Apache Spark", title: "Partial aggregation", html: "Spark SQL plans a <code>GROUP BY</code> as a partial aggregate on each partition, a shuffle by key, then a final aggregate, so the shuffle carries partial sums rather than raw rows." },
            { org: "Apache Flink SQL", title: "Local-global aggregation", html: "Flink's table planner can split an aggregation into a local phase and a global phase (with mini-batching enabled) specifically to mitigate data skew on hot keys." },
          ],
        },
        {
          type: "tradeoffs",
          prosLabel: "Two-stage aggregation buys",
          consLabel: "It costs",
          pros: [
            "Even load in stage one regardless of skew",
            "Exact final counts, because stage two is still keyed by video",
            "Stage two traffic bounded by distinct videos per task per flush",
          ],
          cons: [
            "An extra shuffle and processing stage",
            "Up to one flush interval of extra delay",
            "More state: each stage-one task holds partial counts for every video it sees",
          ],
        },
      ],
    },
    {
      id: "pre-aggregate",
      title: "Aggregate before you write",
      kicker: "The biggest lever",
      blocks: [
        {
          type: "idea",
          html: `<p>The database does not need to see every view; it needs to see each video's <em>sum</em> per interval. If the stream job adds up views in memory and flushes once per interval, the number of writes per flush equals the number of <strong>distinct videos</strong> watched in that interval, which is far smaller than the number of views.</p>`,
        },
        {
          type: "text",
          html: `<p>This works because popularity is heavily skewed: a small set of videos collects a large share of views, and a long tail gets a few each. Over one minute, the ~48 million views (800K × 60) touch far fewer distinct videos, and the longer the interval, the more repeats are folded together. How much you save depends on how skewed popularity is and how many videos are watched at all, so treat any figure here as an assumption to check, not a fact about YouTube.</p>
<p>The lab's default model assumes Zipf-shaped popularity over 100 million videos watched in a day. Under that model:</p>`,
        },
        {
          type: "table",
          title: "Writes per second vs flush interval (lab default model, ~800K views/s)",
          headers: ["Flush every", "Distinct videos per flush", "Writes per second", "Reduction"],
          rows: [
            ["1 second", "~340K", "~340K", "~2×"],
            ["10 seconds", "~2.5M", "~250K", "~3×"],
            ["1 minute", "~10M", "~170K", "~5×"],
            ["10 minutes", "~48M", "~80K", "~10×"],
            ["1 hour", "~93M", "~26K", "~30×"],
          ],
          note: "Steeper popularity curves save considerably more; a flatter tail saves less. The shape of the curve, not the event rate, decides the benefit.",
        },
        {
          type: "lab",
          id: "batchingWrites",
          caption: "Change the flush interval and popularity skew and watch database writes per second fall as more views fold into each sum. Note the memory held and the extra delay before counts land: intervals beyond a minute break the freshness budget.",
        },
        {
          type: "text",
          html: `<p>The interval is a three-way trade between write volume, freshness and memory. A one-minute flush keeps counts within the freshness budget; an hourly flush saves far more writes but delays results by up to an hour and holds state for every video watched in that hour. The usual answer is to <strong>split the two concerns</strong>: aggregate in one-minute panes for anything that must be fresh, and fold those panes into hourly and daily totals that are written less often. Chapter 4 builds the per-window tables that consume these flushes.</p>
<h3>Write in bulk</h3>
<p>Each flush should go to the database as large batches, not as millions of single statements: multi-row <code>INSERT ... ON CONFLICT DO UPDATE</code>, or <code>COPY</code> into a staging table followed by one merge statement. Per-row overhead (network round trips, transaction commits, write-ahead log flushes) dominates single-row writes, and batching amortises it, so a node applies many more rows per second in bulk than the ~10K single updates assumed earlier. How many more depends on hardware and indexes; measure it rather than quoting a number. One side effect to plan for: hourly flushes are bursty, so spread them over a few minutes or across shards rather than writing tens of millions of rows at the top of every hour.</p>`,
        },
        {
          type: "quiz",
          q: "Doubling the event rate from 800K to 1.6M views per second, with the same popularity curve, roughly doubles the views per flush. What happens to database writes per flush?",
          options: [
            "They double, like the events",
            "They grow by less than double, because the extra views mostly repeat videos already in the sum; writes are bounded by distinct videos, not views",
            "They stay exactly the same",
            "They halve",
          ],
          answer: 1,
          explain: "Writes per flush equal distinct videos per flush. More views of the same popular videos only change the sums, not the number of rows. New distinct videos from the tail do add writes, so the growth is real but well below the growth in events.",
        },
      ],
    },
    {
      id: "stream-processor",
      title: "What the stream processor gives you",
      kicker: "The machinery",
      blocks: [
        {
          type: "text",
          html: `<p>You could hand-write consumers that keep hash maps and flush them on a timer. Before long you would need event-time windows, watermarks, recovery after crashes and rebalancing when instances come and go. That is what a stream processor provides: Apache Flink, Kafka Streams and Spark Structured Streaming all offer some version of the four features below. Interviewers will ask what each one does, so be ready to explain them rather than just name the framework.</p>`,
        },
        {
          type: "list",
          title: "Four features you are relying on",
          items: [
            "<strong>Keyed state:</strong> per-key values (here, counts per video per window) partitioned across tasks by key, kept in memory or in an embedded store such as RocksDB on local disk when it outgrows memory.",
            "<strong>Event-time windows:</strong> the framework assigns each event to its window by its timestamp, not by arrival time, and fires the window when it is complete.",
            "<strong>Watermarks:</strong> the processor's running estimate that no older events are still coming. With 30 seconds of bounded out-of-orderness, a window fires once the watermark passes its end; this is Chapter 1's lateness budget turned into code.",
            "<strong>Checkpoints:</strong> periodic consistent snapshots of all state together with the Kafka offsets consumed so far, so a crashed job can resume as if nothing happened.",
          ],
        },
        {
          type: "code",
          title: "The stream job, in pseudocode",
          lang: "text",
          code: `source  = kafka("view-events")                  # keyed by videoId
            .watermark(maxOutOfOrder = 30s)     # below the 1-minute freshness target
counts  = source.keyBy(videoId)
            .window(tumbling(1 minute))         # small panes; folded into hour/day later
            .count()                            # state: (videoId, window) -> count
counts.sink(upsert("video_views_minute",        # idempotent: writes the full value
                   key = (videoId, windowStart)))
checkpoint(every = 30s)                         # state + Kafka offsets, together`,
        },
        {
          type: "realworld",
          items: [
            { org: "Apache Flink", title: "Checkpoints and RocksDB state", html: "Flink snapshots operator state by flowing checkpoint barriers through the job graph, and its Kafka source stores consumed offsets in the same checkpoint. The RocksDB state backend keeps large keyed state on local disk and supports incremental checkpoints." },
            { org: "Kafka Streams", title: "State stores and changelogs", html: "A library rather than a cluster: windowed counts live in local state stores (RocksDB by default) that are backed up to compacted changelog topics in Kafka, so a restarted instance can rebuild its state." },
            { org: "Spark Structured Streaming", title: "Micro-batches", html: "Processes the stream as a series of small batches, with watermarks for event-time windows and a checkpoint location that records offsets and state between batches." },
          ],
        },
      ],
    },
    {
      id: "failures",
      title: "Crashes, replays and idempotent writes",
      kicker: "Failure handling",
      blocks: [
        {
          type: "problem",
          html: `<p>A checkpoint captures state and offsets at one instant. If the job crashes thirty seconds later, it restores that snapshot and replays the log from the saved offsets, so everything it did in those thirty seconds happens again, including writes to the database. Unless the writes tolerate repetition, replay double-counts.</p>`,
        },
        {
          type: "compare",
          title: "Replaying a flush for video v42, window 10:00",
          items: [
            { title: "Increment: \"add 37\"", tone: "bad", html: "The job writes <code>views = views + 37</code>, crashes before the next checkpoint, restores, replays the same events and writes <code>+ 37</code> again. The stored count is now 74. Wrong, silently." },
            { title: "Upsert the full value: \"set 37\"", tone: "ok", html: "The job writes <code>(v42, 10:00) = 37</code>. After the replay it writes <code>(v42, 10:00) = 37</code> again. The row is unchanged. Repeating the write is harmless, which is what <em>idempotent</em> means." },
          ],
        },
        {
          type: "text",
          html: `<p>So the sink writes the <strong>complete aggregate for a (video, window) key</strong>, never a delta. Because the window's count lives in checkpointed state, the replayed job recomputes the same value and overwrites the row with it. This gives effectively-once results without distributed transactions. Flink can also provide end-to-end exactly-once delivery with transactional (two-phase commit) sinks, but idempotent upserts are simpler and enough here.</p>
<p>Chapter 4 adds a wrinkle: per-window running totals are naturally updated with deltas ("add this minute's count"). Keeping those idempotent needs care, for example recording the last applied pane per shard in the same database transaction as the update, so a replayed pane is recognised and skipped.</p>`,
        },
        {
          type: "list",
          title: "Failure questions to expect, and answers",
          items: [
            "<strong>Consumer crash:</strong> restore the last checkpoint, replay from its offsets, rely on idempotent upserts.",
            "<strong>Events later than the watermark:</strong> drop them and count the drops, send them to a side output for reconciliation, or allow lateness and re-emit the window's corrected full value (still idempotent).",
            "<strong>Viral video:</strong> two-stage aggregation or salting; alert on per-partition consumer lag.",
            "<strong>Database shard down:</strong> the sink blocks, backpressure slows the job's consumption, and Kafka keeps the events until the shard recovers; then the job catches up.",
          ],
        },
        {
          type: "quiz",
          q: "Why does the stream job write \"(v42, 10:00) = 37\" rather than \"add 37 to v42's 10:00 row\"?",
          options: [
            "Full values are smaller on the wire",
            "After a crash the job replays events since the last checkpoint; writing the full value makes the repeated write harmless, while an increment would be applied twice",
            "Postgres does not support increments",
            "Increments cannot be batched",
          ],
          answer: 1,
          explain: "Replay is how stream processors recover, so any write may happen more than once. Setting a key to its full value is idempotent; adding a delta is not. That single design choice is what turns at-least-once processing into correct counts.",
        },
      ],
    },
    {
      id: "interview",
      title: "Defending the write path in an interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "text",
          html: `<p>The write path is usually the first deep dive the interviewer asks for, because the baseline's per-view writes are its most obvious failure. Lead with the arithmetic, then the levers in order of impact, then the correctness arguments. Interviewers at senior level and above will push on two things: whether your merge is really exact, and what happens when something fails.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>A strong answer covers:</p>
<ol>
<li><strong>The wall:</strong> ~800K writes/s against ~10K per node means ~80 nodes; sharding alone is a blunt instrument.</li>
<li><strong>Partition by video ID:</strong> one owner per counter, no contention.</li>
<li><strong>Shard by the same key:</strong> each video's full count on one shard, so merging per-shard top K is exact (and say why).</li>
<li><strong>Aggregate before writing:</strong> writes scale with distinct videos per interval, not views; bulk upserts.</li>
<li><strong>Skew:</strong> two-stage aggregation or salting; monitor per-partition lag.</li>
<li><strong>Recovery:</strong> checkpoints with offsets, replay, idempotent upserts of full values.</li>
</ol>`,
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>"Just add database shards until the writes fit." It works on paper, but it attacks the symptom: most of those writes are increments to the same popular videos. Aggregating in memory removes them at the source, and a few shards then suffice.</p>`,
        },
        {
          type: "quiz",
          q: "An interviewer proposes spreading view events round robin across shards \"for perfect balance\" and merging each shard's top 100. What is your response?",
          options: [
            "Agree; balance is the main goal",
            "The merge becomes approximate: a video's views are split across shards, so its partial counts may miss every local top 100. Keep keyed sharding for exactness and handle skew with two-stage aggregation",
            "Agree, but fetch the top 10 from each shard instead",
            "Round robin is fine as long as there are fewer than 10 shards",
          ],
          answer: 1,
          explain: "Exactness of the merge depends on each video's full count living in one place. Round robin breaks that. Two-stage aggregation gives you round robin's even load in stage one and keyed exactness in stage two.",
        },
      ],
    },
  ],
  takeaways: [
    "One database write per view needs about 80 nodes at ~800K views/s; the fix is to change what reaches the database, not just to add nodes.",
    "Use the video ID as the Kafka key so every video has one partition and one consumer: no contention, no double counting.",
    "Shard counters by the same key. Because each video's full count lives on one shard, merging per-shard top K lists is exact; round robin breaks this.",
    "Aggregate in memory before writing: writes per flush equal distinct videos per interval, which skewed popularity keeps far below the view count.",
    "Handle hot keys with two-stage aggregation (count anywhere, then re-key partial sums) or by salting known hot keys.",
    "Checkpoint state with Kafka offsets, replay after a crash, and make every write an idempotent upsert of the full value for a (video, window) key.",
  ],
  furtherReading: [
    { title: "MapReduce: Simplified Data Processing on Large Clusters (Dean and Ghemawat, OSDI 2004)", note: "Introduces the combiner, the original form of two-stage aggregation." },
    { title: "Apache Kafka documentation", url: "https://kafka.apache.org/documentation/", note: "Partitions, keys, consumer groups, offsets and retention." },
    { title: "Designing Data-Intensive Applications (Kleppmann, O'Reilly, 2017), chapter 11", note: "Stream processing, event time, fault tolerance and idempotence." },
  ],
};
