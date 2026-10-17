// Deep dives: YouTube Top K. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP["top-k"] = {
  hook: `<p>The baseline on the Solution tab is correct and hopeless. On day one, views arrive at ~800K a second and the consumer applies ~10K; the backlog grows by almost 50 million events a minute. Meanwhile every "last month" request asks Postgres to sum fourteen billion rows.</p>
<p>Each deep dive below is one question an interviewer pushes on once the baseline is on the board. Each starts with what goes wrong, then works from weak answers to strong ones, so you can see why the final design looks the way it does and what each step costs.</p>`,
  sections: [
    {
      id: `write-path`,
      title: `How do we absorb ~800K views a second?`,
      kicker: `Scaling the write path`,
      blocks: [
        { type: `problem`, html: `<p>One database write per view means the database absorbs the raw event rate: <span class="formula">800K/s ÷ ~10K/s per node ≈ 80 nodes</span>, about 150 at peak. Even then, a viral video's increments queue on one row on one node.</p>` },
        { type: `compare`, items: [
          { title: `Weak: more database shards`, tone: `bad`, html: `Shard the counter table until writes fit. It works on paper, but it pays for ~80 nodes to apply increments that mostly hit the same popular videos, and hot rows still serialise.` },
          { title: `Better: partition and shard by video ID`, tone: `warn`, html: `Key Kafka messages by video ID and shard counters on the same key. Each video has one owner, so there is no contention and per-shard top-K lists merge exactly. Still one write per view, just spread out.` },
          { title: `Best: also aggregate in the stream`, tone: `ok`, html: `A stream processor sums views per video per minute in memory and flushes bulk upserts. Writes now scale with <em>distinct videos</em> per interval, not views: 10-100× fewer, and a few shards suffice.` }
        ] },
        { type: `diagram`, title: `The write path, partitioned end to end by video ID`, caption: `Kafka routes each video's events to one partition; one stream task owns each partition, sums views per video in memory and periodically upserts the sums into the shard that owns those videos.`, svg: `<svg viewBox="0 0 640 265" role="img" aria-label="View events flow into a Kafka topic with four partitions keyed by video ID, through four stream tasks that sum per video, into four counter shards">
<defs><marker id="tk-arrow-part" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
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
<line x1="100" y1="130" x2="128" y2="130" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#tk-arrow-part)"/>
<line x1="240" y1="61" x2="298" y2="61" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#tk-arrow-part)"/>
<line x1="240" y1="106" x2="298" y2="106" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#tk-arrow-part)"/>
<line x1="240" y1="151" x2="298" y2="151" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#tk-arrow-part)"/>
<line x1="240" y1="196" x2="298" y2="196" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#tk-arrow-part)"/>
<line x1="420" y1="61" x2="488" y2="61" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#tk-arrow-part)"/>
<line x1="420" y1="106" x2="488" y2="106" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#tk-arrow-part)"/>
<line x1="420" y1="151" x2="488" y2="151" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#tk-arrow-part)"/>
<line x1="420" y1="196" x2="488" y2="196" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#tk-arrow-part)"/>
<text x="190" y="250" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">~800K events/s in</text>
<text x="360" y="250" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">state in memory</text>
<text x="550" y="250" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">batched upserts</text>
</svg>` },
        { type: `steps`, title: `Why merging per-shard top K is exact when sharded by video`, items: [
          `Every view of a video is on one shard, so that shard holds the video's complete count.`,
          `A video V in the true global top K is beaten by fewer than K videos in the whole system.`,
          `The videos that beat V on its own shard are a subset of those, so fewer than K of them exist there.`,
          `So V is in its shard's local top K, with its full count, and the merged list is exact.`
        ] },
        { type: `text`, html: `<p>Break the precondition and the merge fails. Spread events round robin across two shards with K = 1: shard 1 sees A = 50, B = 45; shard 2 sees C = 50, B = 45. Each reports its leader at 50, but B has 90 and appears in neither list. Round robin balances load perfectly, which is why it is tempting.</p>` },
        { type: `lab`, id: `shardMerge`, caption: `Partition by video ID and check that the merged list matches the true top K. Switch to round robin: load evens out but counts come up short and videos near position K go missing. Turn on the viral video, then try the two-stage option.` },
        { type: `text`, html: `<h3>Hot keys</h3>
<p>Keyed partitioning trades even load for correctness. A video drawing 15% of all views sends ~120K events/s to one partition, and its lagging consumer holds back the watermark for everyone. The cure is <strong>two-stage aggregation</strong>: stage one counts wherever events land (even load) and emits one partial sum per video per flush; stage two re-keys partial sums by video and adds them (exact). The viral video's million events reach its owner as a handful of messages. A targeted alternative is <strong>salting</strong> known hot keys (<code>v42#0..7</code>) and recombining. Either way, alert on per-partition consumer lag.</p>
<h3>How much aggregation saves</h3>
<p>Writes per flush equal distinct videos per interval, and popularity is heavily skewed. The lab's default model (Zipf popularity over 100M videos watched a day) gives:</p>` },
        { type: `table`, headers: [`Flush every`, `Distinct videos per flush`, `Writes per second`, `Reduction`], rows: [
          [`1 second`, `~340K`, `~340K`, `~2×`],
          [`1 minute`, `~10M`, `~170K`, `~5×`],
          [`10 minutes`, `~48M`, `~80K`, `~10×`],
          [`1 hour`, `~93M`, `~26K`, `~30×`]
        ], note: `Assumptions, not YouTube data: a steeper popularity curve saves much more, a flatter tail less.` },
        { type: `lab`, id: `batchingWrites`, caption: `Change the flush interval and skew and watch writes per second fall. Note the memory held and the delay before counts land: intervals beyond a minute break the freshness budget.` },
        { type: `text`, html: `<p>The interval trades write volume against freshness and memory. Split the concerns: <strong>minute panes</strong> for anything that must be fresh, folded into hourly and daily totals written less often. Send every flush as bulk upserts (multi-row <code>INSERT ... ON CONFLICT</code>, or <code>COPY</code> into staging plus one merge), which amortises round trips, commits and log flushes, and spread hourly flushes over a few minutes so they don't land at once.</p>` },
        { type: `quiz`, q: `The event rate doubles from 800K to 1.6M views/s with the same popularity curve. What happens to database writes per flush?`, options: [
          `They double, like the events`,
          `They grow by much less than double, because extra views mostly repeat videos already in the sums`,
          `They stay exactly the same`,
          `They halve`
        ], answer: 1, explain: `Writes per flush equal distinct videos per flush. More views of popular videos only change the sums. New tail videos add some writes, so growth is real but well below the growth in events.` }
      ]
    },
    {
      id: `serving-reads`,
      title: `How do reads stay in tens of milliseconds?`,
      kicker: `Serving reads`,
      blocks: [
        { type: `problem`, html: `<p>Thousands of clients a second ask the same four questions, and each answer takes seconds to minutes to compute. Caching is obvious; the subtle part is what happens the moment a cached answer expires, or a new window starts with no answer yet.</p>` },
        { type: `compare`, items: [
          { title: `Weak: query per request`, tone: `bad`, html: `Every request runs the window query. Correct and fresh, and the database is finished at the first traffic peak.` },
          { title: `Better: cache with a TTL`, tone: `warn`, html: `Store each window's top 1,000 in Redis (<code>topk:day:2026-10-13</code>) and slice for smaller K. Hits take ~1 ms, but every expiry triggers a burst of misses that all run the slow query: the <strong>expiry cliff</strong>.` },
          { title: `Better still: TTL + coalescing`, tone: `warn`, html: `Only one request per key runs the query; others wait for its result. The database survives, but the waiters still take as long as the query: seconds against a 50 ms target.` },
          { title: `Best: scheduled precompute`, tone: `ok`, html: `A refresher computes every window each minute (inside the freshness budget) and writes the cache. The API only reads Redis, so latency is flat, and new windows are written before anyone asks.` }
        ] },
        { type: `diagram`, title: `Precompute: the slow query leaves the request path`, caption: `A background refresher computes each window every minute and overwrites the cached answers. A slow refresh delays freshness, never a request.`, svg: `<svg viewBox="0 0 640 230" role="img" aria-label="Refresher job reads the counters every minute and writes answers to Redis; the API reads only from Redis">
<defs><marker id="tk-arrow-pre" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<text x="175" y="40" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">background, every minute</text>
<text x="520" y="40" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">shared by both paths</text>
<rect x="10" y="80" width="120" height="50" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<text x="70" y="101" text-anchor="middle" font-size="13" font-weight="700">Counters</text>
<text x="70" y="118" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">per window</text>
<rect x="200" y="80" width="140" height="50" rx="8" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="1.5"/>
<text x="270" y="101" text-anchor="middle" font-size="13" font-weight="700">Refresher job</text>
<text x="270" y="118" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">every 60 s</text>
<rect x="440" y="80" width="160" height="50" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<text x="520" y="101" text-anchor="middle" font-size="13" font-weight="700">Redis</text>
<text x="520" y="118" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">topk:{window}</text>
<rect x="200" y="165" width="140" height="44" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="270" y="192" text-anchor="middle" font-size="13" font-weight="700">Clients</text>
<rect x="440" y="165" width="160" height="44" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="1.5"/>
<text x="520" y="192" text-anchor="middle" font-size="13" font-weight="700">Query service</text>
<line x1="200" y1="105" x2="132" y2="105" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#tk-arrow-pre)"/>
<text x="165" y="97" text-anchor="middle" font-size="12">4 reads</text>
<line x1="340" y1="105" x2="438" y2="105" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#tk-arrow-pre)"/>
<text x="390" y="97" text-anchor="middle" font-size="12">swap, long TTL</text>
<line x1="340" y1="187" x2="438" y2="187" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#tk-arrow-pre)"/>
<text x="390" y="179" text-anchor="middle" font-size="12">request</text>
<line x1="520" y1="165" x2="520" y2="132" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#tk-arrow-pre)"/>
<text x="528" y="152" font-size="12">~1 ms read</text>
</svg>` },
        { type: `lab`, id: `servingStrategy`, caption: `Compare the four strategies. With a TTL, latency spikes at every expiry; coalescing saves the database but not the spike; scheduled precompute stays flat. Raise the query time to see when the refresher can no longer finish within its interval.` },
        { type: `code`, title: `Publishing and reading one window`, lang: `text`, code: `# refresher, once a minute
DEL    topk:hour:tmp
ZADD   topk:hour:tmp 48213377 v_8f2c 47100210 v_19aa ...   # top 1,000 only
RENAME topk:hour:tmp topk:hour                             # atomic swap
EXPIRE topk:hour 3600                                      # long TTL: serve stale

# query service, per request
ZRANGE topk:hour 0 99 REV WITHSCORES                       # top 100` },
        { type: `keypoints`, items: [
          `<strong>Serve stale, not nothing:</strong> a TTL far longer than the refresh interval means a dead refresher degrades to "a few minutes old". Alert on answer age.`,
          `<strong>Switch windows through a pointer:</strong> write the new day's answer first, then update <code>topk:day:latest</code>, so readers never look for a key that isn't there yet.`,
          `<strong>Bound the membership:</strong> keep only the top few thousand per window so memory stays small and predictable.`,
          `<strong>Don't count live views in a sorted set</strong> at this scale: one key lives on one Redis node and would take every view.`,
          `Precompute fixed read <em>latency</em>, not the refresher's <em>work</em>: with hour buckets it still can't finish a month query every minute. That's the next deep dive.`
        ] },
        { type: `quiz`, q: `You add coalescing so only one request per server runs the query when a key expires. Why does this still miss the latency target?`, options: [
          `Coalescing does not reduce database load`,
          `The other requests wait for that query, so they take as long as the query itself`,
          `Coalescing returns wrong results`,
          `Coalescing only works with sliding windows`
        ], answer: 1, explain: `Coalescing fixes the thundering herd on the database, but a coalesced request is still waiting on the slow query. Only computing before anyone asks keeps every read fast.` }
      ]
    },
    {
      id: `windowed-counts`,
      title: `How do we compute a window without scanning it?`,
      kicker: `Windowed counts`,
      blocks: [
        { type: `problem`, html: `<p>The refresher runs every window every minute. Assume ~20M videos watched per hour (growing to ~80M over a day and ~400M over a month) and ~20M rows/s of scan-and-aggregate. With hour buckets: the hour takes 1-2 s, the day ~30 s over 480M rows, the month ~12 minutes over 14B rows. The refresher falls behind forever.</p>` },
        { type: `compare`, items: [
          { title: `Weak: sum hour buckets at read time`, tone: `bad`, html: `Correct for every window, but cost scales with window length × active videos. The month is a batch job, not a refresh.` },
          { title: `Better: hour + day + month rollups`, tone: `warn`, html: `Also keep daily (and monthly) rows per video. A month sums ~30 rows per video instead of 720. Still groups every active video on every refresh.` },
          { title: `Best: running total per window, indexed by views`, tone: `ok`, html: `Tables <code>views_last_hour</code>, <code>_day</code>, <code>_month</code>, <code>_all_time</code>, each indexed by views. Each flush updates them; every refresh is an index walk of ~1,000 entries, for any window.` },
          { title: `Alternative: state in the stream processor`, tone: `info`, html: `Keep per-window counts in keyed state, track a local top K per task, merge in a final stage and write Redis directly. No database or refresher, but more framework depth.` }
        ] },
        { type: `diagram`, title: `One flush fans out to four running totals`, caption: `The stream job writes each video's new sums into every window's totals. The refresher never aggregates; it walks the first 1,000 entries of each views index.`, svg: `<svg viewBox="0 0 640 240" role="img" aria-label="Stream job writes to four per-window tables, each indexed by views; the refresher reads the top entries of each">
<defs><marker id="tk-arrow-fan" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="10" y="90" width="120" height="60" rx="8" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="1.5"/>
<text x="70" y="115" text-anchor="middle" font-size="13" font-weight="700">Stream job</text>
<text x="70" y="133" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">minute sums</text>
<rect x="220" y="15" width="170" height="38" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<text x="305" y="39" text-anchor="middle" font-size="12" font-weight="700">views_last_hour</text>
<rect x="220" y="70" width="170" height="38" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<text x="305" y="94" text-anchor="middle" font-size="12" font-weight="700">views_last_day</text>
<rect x="220" y="125" width="170" height="38" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<text x="305" y="149" text-anchor="middle" font-size="12" font-weight="700">views_last_month</text>
<rect x="220" y="180" width="170" height="38" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<text x="305" y="204" text-anchor="middle" font-size="12" font-weight="700">views_all_time</text>
<rect x="470" y="90" width="160" height="60" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="1.5"/>
<text x="550" y="115" text-anchor="middle" font-size="13" font-weight="700">Refresher</text>
<text x="550" y="133" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">walk 1,000 entries</text>
<line x1="130" y1="120" x2="218" y2="34" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#tk-arrow-fan)"/>
<line x1="130" y1="120" x2="218" y2="89" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#tk-arrow-fan)"/>
<line x1="130" y1="120" x2="218" y2="144" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#tk-arrow-fan)"/>
<line x1="130" y1="120" x2="218" y2="199" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#tk-arrow-fan)"/>
<line x1="390" y1="34" x2="468" y2="112" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#tk-arrow-fan)"/>
<line x1="390" y1="89" x2="468" y2="116" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#tk-arrow-fan)"/>
<line x1="390" y1="144" x2="468" y2="124" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#tk-arrow-fan)"/>
<line x1="390" y1="199" x2="468" y2="128" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#tk-arrow-fan)"/>
<text x="70" y="178" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">1 flush, 4 upserts</text>
<text x="550" y="178" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">no aggregation</text>
<text x="305" y="234" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">each table: index on views</text>
</svg>` },
        { type: `lab`, id: `windowQueryCost`, caption: `Pick a window and compare rows read per refresh for hour buckets, rollups and per-window totals. Per-window totals read ~1,000 index entries for every window, at the price of more rows written per flush.` },
        { type: `text`, html: `<p>This is the all-time trick generalised: all time was cheap because a running total was maintained on every write. Do it per window and reads never aggregate. Two details make it work:</p>
<ul>
<li><strong>Rolling over a tumbling window:</strong> build the next window's totals in a fresh table while the current one is served, then switch atomically once it has closed and passed the lateness budget. Expiring the old window is a table drop, not millions of deletes.</li>
<li><strong>Idempotent deltas:</strong> running totals are updated with "add this minute's 37", which double-counts on replay. Record the last applied pane per shard in the same transaction and skip panes already applied.</li>
</ul>` },
        { type: `tradeoffs`, prosLabel: `Per-window totals buy`, consLabel: `They cost`, pros: [
          `Every refresh is an index walk of ~K entries, for any window length`,
          `A trivial refresher that finishes in milliseconds`,
          `Shard-aligned tables keep the per-shard merge exact`
        ], cons: [
          `Each flush writes up to four tables, each with an index`,
          `Delta updates need explicit replay protection`,
          `Window rollover needs a build-then-swap step`
        ] },
        { type: `table`, title: `Could a specialised store do this?`, headers: [`Store`, `Fit`, `Why`], rows: [
          [`InfluxDB / Prometheus`, `<span class="hl-bad">Poor</span>`, `One series per video ID: billions of series, and ranking touches all of them`],
          [`TimescaleDB`, `<span class="hl-good">Good</span>`, `Continuous aggregates are per-window totals maintained by the database; still pre-aggregate, cache and shard`],
          [`Druid / Pinot / ClickHouse`, `<span class="hl-good">Good</span>`, `Roll up on ingest from Kafka; fast group-by-limit. Heavy to operate; Druid's TopN is approximate because segments are split by time, not video`]
        ], note: `Propose one only if you can explain its ingestion and rollup path, or the organisation already runs it.` },
        { type: `quiz`, q: `Why do per-window totals make the refresher cheap when rollups do not?`, options: [
          `Rollups are stored on slower disks`,
          `Per-window totals are already summed per video and indexed by views, so top K is the first K index entries; rollups must still be summed before sorting`,
          `Per-window totals are approximate`,
          `Rollups cannot be sharded`
        ], answer: 1, explain: `The cost of windowed top K is aggregating before sorting. Rollups shrink the inputs; per-window totals do the aggregation incrementally at write time, so reads only walk a sorted index.` }
      ]
    },
    {
      id: `sliding-windows`,
      title: `What if "last hour" must really slide?`,
      kicker: `Sliding windows`,
      blocks: [
        { type: `problem`, html: `<p>A tumbling total only grows until it is swapped out. A sliding "last hour" must also shrink: every minute, the views from an hour ago fall out. To subtract them you need each video's count for that particular minute, an hour after the fact.</p>` },
        { type: `idea`, html: `<p>Have the stream job count views per video per minute, and every minute apply <span class="formula">total(now) = total(prev) + count(minute just closed) − count(minute just expired)</span>. Work is proportional to recent activity, not to the window's length.</p>` },
        { type: `diagram`, title: `One sliding update at 10:06`, caption: `The window covers 09:06-10:05. Minute 10:05 has just closed and is added; 09:05 has just left and is subtracted. Nothing else changes.`, svg: `<svg viewBox="0 0 640 210" role="img" aria-label="Minute cells from 09:05 to 10:05; the newest minute is added and the expired minute is subtracted">
<text x="326" y="34" text-anchor="middle" font-size="12" font-weight="700">sliding last hour at 10:06 (09:06-10:05)</text>
<line x1="98" y1="48" x2="554" y2="48" stroke-width="1.5" style="stroke: var(--dg-2)"/>
<line x1="98" y1="42" x2="98" y2="54" stroke-width="1.5" style="stroke: var(--dg-2)"/>
<line x1="554" y1="42" x2="554" y2="54" stroke-width="1.5" style="stroke: var(--dg-2)"/>
<rect x="30" y="65" width="60" height="40" rx="5" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)" stroke-width="2"/>
<text x="60" y="90" text-anchor="middle" font-size="12">09:05</text>
<rect x="98" y="65" width="60" height="40" rx="5" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<text x="128" y="90" text-anchor="middle" font-size="12">09:06</text>
<rect x="166" y="65" width="60" height="40" rx="5" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<text x="196" y="90" text-anchor="middle" font-size="12">09:07</text>
<rect x="234" y="65" width="60" height="40" rx="5" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<text x="264" y="90" text-anchor="middle" font-size="12">09:08</text>
<text x="326" y="90" text-anchor="middle" font-size="14" font-weight="700" style="fill: var(--dg-muted)">…</text>
<rect x="358" y="65" width="60" height="40" rx="5" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<text x="388" y="90" text-anchor="middle" font-size="12">10:03</text>
<rect x="426" y="65" width="60" height="40" rx="5" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<text x="456" y="90" text-anchor="middle" font-size="12">10:04</text>
<rect x="494" y="65" width="60" height="40" rx="5" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="524" y="90" text-anchor="middle" font-size="12">10:05</text>
<text x="60" y="126" text-anchor="middle" font-size="12" font-weight="700" style="fill: var(--dg-bad)">subtract</text>
<text x="524" y="126" text-anchor="middle" font-size="12" font-weight="700" style="fill: var(--dg-ok)">add</text>
<text x="320" y="162" text-anchor="middle" font-size="13">total(10:06) = total(10:05) + count(10:05) − count(09:05)</text>
<text x="320" y="190" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">needs every video's minute counts for the past hour</text>
</svg>` },
        { type: `code`, title: `The per-minute update (sketch)`, lang: `sql`, code: `UPDATE views_last_hour t
SET    views = t.views + COALESCE(n.views, 0) - COALESCE(o.views, 0)
FROM   (SELECT video_id, views FROM minute_counts WHERE minute = :just_closed)  n
FULL JOIN
       (SELECT video_id, views FROM minute_counts WHERE minute = :just_expired) o
       USING (video_id)
WHERE  t.video_id = COALESCE(n.video_id, o.video_id);
-- upsert new videos first; delete rows that reach 0; run per shard before the refresher` },
        { type: `lab`, id: `slidingCounter`, caption: `Move "now" and watch one video's total change by exactly the green minute minus the red one; the check confirms it matches a full recount. Below, compare what each sliding strategy costs in minute buckets and Kafka retention.` },
        { type: `text`, html: `<h3>The retention bill</h3>
<p>Subtracting needs minute counts for the whole window. With ~3M videos watched per minute at ~24 bytes per (video, minute) count: a sliding hour is <span class="formula">60 × 3M × 24 B ≈ 4.6 GB</span>, a day ~100 GB, a month <span class="formula">43,200 × 3M × 24 B ≈ 3.3 TB</span>. That last number is why you push back on "every window must slide".</p>` },
        { type: `compare`, items: [
          { title: `Weak: engine-native sliding window`, tone: `bad`, html: `A 30-day window sliding every minute assigns each event to every overlapping window: 43,200 accumulators per video. A one-liner that explodes state.` },
          { title: `Better: minute buckets, add and subtract`, tone: `warn`, html: `Exact and simple. Fine for an hour (a few GB); terabytes for a month.` },
          { title: `Best: hybrid`, tone: `ok`, html: `Slide the hour by the minute; tumble the day and month, or step them hourly (24 or 720 hourly buckets). Users judge freshness on "trending now", not on the monthly chart.` },
          { title: `Alternative: lagged consumer`, tone: `info`, html: `A second consumer group trails the live one by exactly the window and subtracts each event as it ages out. No bucket table, but a month of retention (~85 TB at ~40 B/event) and an extra read of every event. Use the same event time and lateness rules as the adder.` }
        ] },
        { type: `quiz`, q: `A video's sliding-hour total is 12,000 at 10:05. Minute 10:05 had 300 views and minute 09:05 had 500. What is the total at 10:06?`, options: [`12,300`, `11,800`, `12,800`, `11,500`], answer: 1, explain: `12,000 + 300 − 500 = 11,800. The video is cooling down, which only a sliding window shows while the hour is in progress.` }
      ]
    },
    {
      id: `approximate`,
      title: `Can we trade exactness for far less memory?`,
      kicker: `Approximate top K`,
      blocks: [
        { type: `problem`, html: `<p>Exact top K keeps a count for every video that <em>might</em> make the list, which means every video: ~20M rows for the last hour alone, to show 1,000. If the product says "an occasional swap at position 998 is fine", heavy hitters can be found in megabytes.</p>` },
        { type: `text`, html: `<p>Approximation fits when errors are <strong>small relative to the gaps between top items</strong> (they only bite near position K) and the feature is about <strong>trends, not money</strong>. Payouts and public view counters stay exact. Offer it once the exact design is on the board, with its error stated.</p>
<h3>Count-Min Sketch</h3>
<p>A grid of <code>d</code> rows × <code>w</code> counters, one hash per row. Adding a view increments one cell per row; the estimate is the <strong>minimum</strong> of those <code>d</code> cells. Collisions only add, so estimates never undercount; independent hashes make it unlikely that a video collides with a heavy one in every row.</p>` },
        { type: `diagram`, title: `One item, one cell per row, take the minimum`, caption: `video:42 hashes to one highlighted cell in each row. Each cell holds its views plus collisions, so the smallest is the estimate: possibly too high, never too low.`, svg: `<svg viewBox="0 0 640 220" role="img" aria-label="A Count-Min Sketch grid of 3 rows and 8 columns with one highlighted cell per row for video 42">
<text x="331" y="26" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">w = 8 counters per row</text>
<text x="20" y="95" font-size="13" font-weight="700">video:42</text>
<text x="20" y="113" font-size="12" style="fill: var(--dg-muted)">+1 in each row</text>
<text x="140" y="62" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">h1</text>
<text x="140" y="102" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">h2</text>
<text x="140" y="142" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">h3</text>
<rect x="150" y="40" width="40" height="34" rx="3" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="170" y="62" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">120</text>
<rect x="196" y="40" width="40" height="34" rx="3" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="216" y="62" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">87</text>
<rect x="242" y="40" width="40" height="34" rx="3" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/><text x="262" y="62" text-anchor="middle" font-size="12" font-weight="700">912</text>
<rect x="288" y="40" width="40" height="34" rx="3" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="308" y="62" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">45</text>
<rect x="334" y="40" width="40" height="34" rx="3" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="354" y="62" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">301</text>
<rect x="380" y="40" width="40" height="34" rx="3" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="400" y="62" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">66</text>
<rect x="426" y="40" width="40" height="34" rx="3" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="446" y="62" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">150</text>
<rect x="472" y="40" width="40" height="34" rx="3" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="492" y="62" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">98</text>
<rect x="150" y="80" width="40" height="34" rx="3" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="170" y="102" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">74</text>
<rect x="196" y="80" width="40" height="34" rx="3" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="216" y="102" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">210</text>
<rect x="242" y="80" width="40" height="34" rx="3" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="262" y="102" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">33</text>
<rect x="288" y="80" width="40" height="34" rx="3" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="308" y="102" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">129</text>
<rect x="334" y="80" width="40" height="34" rx="3" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="354" y="102" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">58</text>
<rect x="380" y="80" width="40" height="34" rx="3" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/><text x="400" y="102" text-anchor="middle" font-size="12" font-weight="700">905</text>
<rect x="426" y="80" width="40" height="34" rx="3" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="446" y="102" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">41</text>
<rect x="472" y="80" width="40" height="34" rx="3" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="492" y="102" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">177</text>
<rect x="150" y="120" width="40" height="34" rx="3" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="170" y="142" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">63</text>
<rect x="196" y="120" width="40" height="34" rx="3" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/><text x="216" y="142" text-anchor="middle" font-size="12" font-weight="700">940</text>
<rect x="242" y="120" width="40" height="34" rx="3" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="262" y="142" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">112</text>
<rect x="288" y="120" width="40" height="34" rx="3" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="308" y="142" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">88</text>
<rect x="334" y="120" width="40" height="34" rx="3" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="354" y="142" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">19</text>
<rect x="380" y="120" width="40" height="34" rx="3" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="400" y="142" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">256</text>
<rect x="426" y="120" width="40" height="34" rx="3" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="446" y="142" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">70</text>
<rect x="472" y="120" width="40" height="34" rx="3" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="492" y="142" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">134</text>
<text x="331" y="185" text-anchor="middle" font-size="13">estimate = min(912, 905, 940) = 905</text>
<text x="331" y="207" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">true count 900: the 5 extra views are a collision in row h2</text>
</svg>` },
        { type: `text`, html: `<p><strong>Sizing from the error you accept</strong> (Cormode and Muthukrishnan): with <span class="formula">w = ⌈e/ε⌉</span> and <span class="formula">d = ⌈ln(1/δ)⌉</span>, each estimate exceeds the true count by at most <span class="formula">εN</span> with probability 1 − δ, where N is the total events added. For an hour, N ≈ 2.9B; ε = 10<sup>−5</sup> (≤ ~29K views of slack) and δ = 0.001 give <span class="formula">272K × 7 × 8 B ≈ 15 MB</span>, against ~1 GB of exact counts. Whether 29K is acceptable depends on the gaps near position 1,000; measure them.</p>` },
        { type: `steps`, title: `Sketch plus heap, per view event`, items: [
          `Add the view to the sketch and read back the video's estimate.`,
          `If the video is in the candidate min-heap, update its value.`,
          `Otherwise insert it if the heap has room, or if its estimate beats the heap minimum (evicting the minimum).`,
          `To answer, return the heap's K largest entries. Keep the heap 3-5× K so videos near the boundary aren't evicted too eagerly.`
        ] },
        { type: `lab`, id: `cmsTopK`, caption: `Narrow the sketch and watch inflated counts let low-ranked videos in; widen it and the error bound e·N/w shrinks. Shrink the heap to just above K and see boundary videos get lost. Compare the sketch's memory with exact counting.` },
        { type: `compare`, items: [
          { title: `Sketch + heap (Count-Min)`, tone: `info`, html: `Answers "how many?" for any item; a heap remembers IDs. Sketches with the same dimensions and hashes <strong>merge by adding cells</strong>: 24 hourly sketches sum to a day, and minute sketches can be added and subtracted for a sliding hour.` },
          { title: `Counter-based (Misra-Gries, Space-Saving)`, tone: `ok`, html: `A fixed number of (item, count) slots; when full, a new item takes over (Space-Saving) or decrements (Misra-Gries) the slots. Tracks IDs directly with deterministic error bounds.` }
        ] },
        { type: `callout`, tone: `warning`, title: `Where the sketch lives matters`, html: `<p>RedisBloom offers sketch commands, so a consumer could increment a sketch and a sorted set per event. But increments aren't idempotent and Redis persistence can't be lined up with Kafka offsets, so a crash and replay double-counts. Keep the sketch and heap in the stream processor's checkpointed state, restored together with the offsets.</p>` },
        { type: `quiz`, q: `A Count-Min Sketch reports 905 views for a video. What do you know about its true count?`, options: [
          `It is exactly 905`,
          `It is at most 905, and with high probability at least 905 − εN`,
          `It is at least 905`,
          `Nothing`
        ], answer: 1, explain: `Collisions only add, so the estimate is an upper bound. The guarantee bounds the overcount by εN with probability 1 − δ.` }
      ]
    },
    {
      id: `fault-tolerance`,
      title: `What happens on crashes, replays and late events?`,
      kicker: `Fault tolerance`,
      blocks: [
        { type: `problem`, html: `<p>A stream job checkpoints state and Kafka offsets at one instant. If it crashes thirty seconds later, it restores that snapshot and replays the log, so everything it did in those thirty seconds happens again, including database writes. Unless writes tolerate repetition, replay double-counts.</p>` },
        { type: `compare`, title: `Replaying a flush for video v42, minute 10:00`, items: [
          { title: `Weak: increment "add 37"`, tone: `bad`, html: `The job writes <code>views = views + 37</code>, crashes before the next checkpoint, replays and adds 37 again. The stored count is 74, silently wrong.` },
          { title: `Better: transactional (two-phase commit) sinks`, tone: `warn`, html: `End-to-end exactly-once by committing writes with the checkpoint. Correct, but more machinery and slower commits.` },
          { title: `Best: upsert the full value "set 37"`, tone: `ok`, html: `Write <code>(v42, 10:00) = 37</code>. The replay writes the same value; nothing changes. For running totals, store the last applied pane per shard in the same transaction and skip repeats.` }
        ] },
        { type: `table`, title: `Failure playbook`, headers: [`Failure`, `What happens`, `Mitigation`], rows: [
          [`Stream task crashes`, `Restores last checkpoint, replays from its offsets`, `Idempotent upserts; checkpoint every ~30 s`],
          [`Events later than the watermark`, `Window already final`, `Drop and count them, side output for reconciliation, or re-emit the corrected full value`],
          [`Viral video`, `One partition lags and holds back the watermark`, `Two-stage aggregation or salting; per-partition lag alerts`],
          [`Counter shard down`, `Sink blocks; backpressure slows consumption`, `Kafka retains events; the job catches up after recovery`],
          [`Refresher down`, `Answers age`, `Long TTL serves stale; answer-age alert; scheduler restarts the idempotent job`],
          [`Redis node lost`, `Cache misses for some windows`, `Replica failover; the refresher rewrites every window within a minute`],
          [`Bug corrupts counts`, `Wrong totals in storage`, `Fix, then replay the retained log into fresh tables and swap them in`]
        ] },
        { type: `callout`, tone: `interview`, html: `<p>The two lines interviewers listen for: "the log is the source of truth, so any derived state can be rebuilt by replaying it", and "every write is idempotent, so at-least-once processing still gives correct counts". Then name your late-data policy and why it suits a trending shelf.</p>` },
        { type: `quiz`, q: `Why does the stream job write "(v42, 10:00) = 37" rather than "add 37 to v42's 10:00 row"?`, options: [
          `Full values are smaller on the wire`,
          `Recovery replays events since the last checkpoint; a full-value write is harmless to repeat, an increment would be applied twice`,
          `Postgres does not support increments`,
          `Increments cannot be batched`
        ], answer: 1, explain: `Replay is how stream processors recover, so any write may happen more than once. Setting a key to its full value is idempotent; adding a delta is not.` }
      ]
    }
  ],
  takeaways: [
    `Partition the log and shard counters by video ID: one owner per counter, and merging per-shard top K lists is exact. Round robin breaks that.`,
    `Aggregate in the stream before writing. Writes scale with distinct videos per interval, which skewed popularity keeps far below the view count.`,
    `Precompute every window's answer on a schedule and serve it from Redis with a long TTL; TTL caching alone hits an expiry cliff that coalescing can't hide from users.`,
    `Keep a running total per window, indexed by views, so every refresh is an index walk; roll tumbling windows over by building the next table and swapping.`,
    `Slide the hour with minute buckets (add newest, subtract expired); tumble or step hourly the day and month, because a sliding month costs terabytes.`,
    `If the product accepts small errors near position K, a Count-Min Sketch plus a heap 3-5× K finds heavy hitters in megabytes; keep it in checkpointed stream state.`,
    `Checkpoint state with offsets, replay after failures and make every write idempotent; the retained log lets you rebuild any derived state after a bug.`
  ],
  furtherReading: [
    { title: `Apache Flink documentation: Windows`, url: `https://nightlies.apache.org/flink/flink-docs-stable/docs/dev/datastream/operators/windows/`, note: `Tumbling and sliding assigners, allowed lateness and side outputs.` },
    { title: `Apache Kafka documentation`, url: `https://kafka.apache.org/documentation/`, note: `Partitions, keys, consumer groups, offsets and retention.` },
    { title: `Redis documentation: Sorted sets`, url: `https://redis.io/docs/latest/develop/data-types/sorted-sets/`, note: `Commands, complexity and leaderboard patterns.` },
    { title: `An Improved Data Stream Summary: The Count-Min Sketch and its Applications (Cormode and Muthukrishnan, 2005)`, note: `The original paper and its error bounds.` },
    { title: `Streaming Systems (Akidau, Chernyak and Lax, O'Reilly, 2018)`, note: `Event time, windows, watermarks and exactly-once processing in depth.` }
  ]
};
