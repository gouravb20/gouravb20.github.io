// Deep dive: Chapter 4, The read path. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch4 = {
  hook: `<p>Chapter 2 moved the expensive window queries off the request path: a refresher recomputes every window once a minute and the API only reads Redis. Chapter 3 made the writes affordable. But look at what the refresher is now doing every sixty seconds. With hour buckets, the last-day query reads about half a billion rows and the last-month query about fourteen billion. The month query alone runs for over ten minutes. The refresher starts a new cycle before the previous one has finished, falls further behind every minute, and the "one minute fresh" promise quietly becomes "whenever it finishes".</p>
<p>Users never see the slow query, but they do see stale lists. This chapter makes computing each window cheap: first by summing fewer rows, then by not summing at query time at all. Then it tackles the version of the problem everyone underestimates: making "last hour" really mean the last sixty minutes.</p>`,
  sections: [
    {
      id: "refresher-cost",
      title: "The refresher's bill, and rollups",
      kicker: "The problem",
      blocks: [
        {
          type: "problem",
          html: `<p>Precomputation hides query cost from readers, but it does not make the work smaller. Every refresh still sums every video's buckets for each window before it can sort. The cost is proportional to the window's length times the number of videos active in it, and it is paid four times a minute.</p>`,
        },
        {
          type: "text",
          html: `<p>Keep the assumptions from Chapter 2: about 20 million distinct videos are watched in a typical hour, and the number of distinct videos grows to roughly 4 times that over a day and 20 times over a month (more of the long tail gets watched as the window widens). Assume a scan-and-aggregate speed of about 20 million rows a second. Then, with hour buckets only:</p>
<ul>
<li>Last hour: <span class="formula">20M rows ≈ 1-2 s</span></li>
<li>Last day: <span class="formula">24 × 20M ≈ 480M rows ≈ 30 s</span>, grouping about 80M videos</li>
<li>Last month: <span class="formula">720 × 20M ≈ 14B rows ≈ 12 min</span>, grouping about 400M videos in a hash table of around 20 GB</li>
</ul>
<p>The first fix is <strong>rollups</strong>: besides the hourly buckets, keep one row per video per day (and, if you like, per month), written by the stream job alongside the hourly flush or by a periodic job. A month query then sums about 30 daily rows per video instead of 720 hourly ones: roughly 2.4 billion rows and a couple of minutes. A daily query on a tumbling day reads one row per video.</p>
<p>That is a real improvement, but notice what it does not change. The refresher still aggregates <em>every video watched in the window</em> before it can sort, hundreds of millions of groups for the month, every minute. Rollups shrink the number of rows per video; they do not remove the aggregation.</p>`,
        },
        {
          type: "keypoints",
          items: [
            "Read-time aggregation costs scale with window length × active videos, and the refresher pays them every minute.",
            "Rollups (daily, monthly rows) cut rows per video by 24× or more, but every refresh still groups every active video.",
            "To make a refresh cheap regardless of window length, the aggregation has to happen at write time.",
          ],
        },
      ],
    },
    {
      id: "per-window-totals",
      title: "Running totals per window, with an index on views",
      kicker: "The key idea",
      blocks: [
        {
          type: "idea",
          html: `<p>Keep <strong>one table per window</strong> holding each video's current total for that window, each with an index on views: <code>views_last_hour</code>, <code>views_last_day</code>, <code>views_last_month</code>, <code>views_all_time</code>. Top K for any window becomes the same index walk that made all-time top K cheap in Chapter 2.</p>`,
        },
        {
          type: "text",
          html: `<p>This is the all-time trick generalised. All time was cheap because a running total per video was maintained on every write, so reading needed no aggregation. Do the same for each window and every refresh reads about 1,000 index entries, a few milliseconds, whether the window is an hour or a month.</p>
<p>The cost moves to the write side: each flush from the stream job now updates up to four tables instead of one, and each update moves an index entry. That is exactly the kind of cost Chapter 3 made affordable. Writes arrive as pre-aggregated sums in bulk upserts, and with shards aligned by video ID, each table is spread over the same few nodes. Reads must be cheap and frequent; writes are already batched. Per-window totals put the work where it is cheapest.</p>`,
        },
        {
          type: "diagram",
          title: "One flush fans out to four running totals",
          caption: "The stream job writes each video's new sums into the totals for every window. The refresher never aggregates; for each window it walks the first 1,000 entries of the views index.",
          svg: `<svg viewBox="0 0 640 240" role="img" aria-label="Stream job writes to four per-window tables, each with an index on views; the refresher reads the top entries of each index">
<defs><marker id="pb4-fan-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="10" y="90" width="120" height="60" rx="8" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="1.5"/>
<text x="70" y="115" text-anchor="middle" font-size="13" font-weight="700">Stream job</text>
<text x="70" y="133" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">minute + hour sums</text>
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
<line x1="130" y1="120" x2="218" y2="34" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#pb4-fan-arrow)"/>
<line x1="130" y1="120" x2="218" y2="89" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#pb4-fan-arrow)"/>
<line x1="130" y1="120" x2="218" y2="144" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#pb4-fan-arrow)"/>
<line x1="130" y1="120" x2="218" y2="199" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#pb4-fan-arrow)"/>
<line x1="390" y1="34" x2="468" y2="112" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#pb4-fan-arrow)"/>
<line x1="390" y1="89" x2="468" y2="116" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#pb4-fan-arrow)"/>
<line x1="390" y1="144" x2="468" y2="124" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#pb4-fan-arrow)"/>
<line x1="390" y1="199" x2="468" y2="128" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#pb4-fan-arrow)"/>
<text x="70" y="178" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">1 flush, 4 upserts</text>
<text x="550" y="178" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">no aggregation</text>
<text x="305" y="234" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">each table: index on views</text>
</svg>`,
        },
        {
          type: "lab",
          id: "windowQueryCost",
          caption: "Pick a window and compare rows read per refresh for hour buckets, rollups and per-window totals. The month window with hour buckets is a batch job; per-window totals read 1,000 index entries for every window, at the price of more rows written per flush.",
        },
        {
          type: "text",
          html: `<h3>Rolling over a tumbling window</h3>
<p>For a tumbling window, the "current" table must switch from one window to the next at a boundary. Build the next window's totals in a fresh table while the current one is still served, then switch atomically once the new window has closed and passed its lateness budget: rename tables in one transaction, or simply change which table the refresher reads. Readers never see a half-built window, and expiring the old one is a cheap table drop (or detaching a partition) instead of millions of deletes.</p>
<h3>Keeping delta updates idempotent</h3>
<p>Running totals are naturally updated with deltas ("add this minute's 37 views"), and Chapter 3 showed that deltas double-count on replay. Two common fixes: write the stream job's pane sums as full values into a per-pane table and derive totals from them in the database, or record the last applied pane for each shard in the same transaction as the delta update, so a replayed pane is detected and skipped.</p>`,
        },
        {
          type: "tradeoffs",
          prosLabel: "Per-window totals buy",
          consLabel: "They cost",
          pros: [
            "Every refresh is an index walk of about K entries, for any window length",
            "The refresher becomes trivial and finishes in milliseconds",
            "Shard-aligned tables keep the per-shard top-K merge exact",
          ],
          cons: [
            "Each flush writes up to four tables, each with an index to maintain",
            "Delta updates need explicit idempotency on replay",
            "Window rollover needs a build-then-swap procedure",
          ],
        },
        {
          type: "quiz",
          q: "Why do per-window totals make the refresher cheap when rollups do not?",
          options: [
            "Rollups are stored on slower disks",
            "Per-window totals are already aggregated per video and indexed by views, so the top K is the first K index entries; rollups still have to be summed per video before sorting",
            "Per-window totals use approximate counts",
            "Rollups cannot be sharded",
          ],
          answer: 1,
          explain: "The fundamental cost of windowed top K is aggregating before sorting. Rollups shrink the inputs to that aggregation; per-window totals perform it incrementally at write time, so reads only have to walk a sorted index.",
        },
      ],
    },
    {
      id: "sliding-add-subtract",
      title: "Sliding windows: add the newest minute, subtract the oldest",
      kicker: "Sliding",
      blocks: [
        {
          type: "problem",
          html: `<p>A tumbling total only ever grows until it is swapped out. A sliding "last hour" must also shrink: every minute, views from 61 minutes ago fall out of the window. To subtract them, the system has to know how many views each video had in that particular minute, an hour after the fact.</p>`,
        },
        {
          type: "idea",
          html: `<p>Have the stream job count views per video per minute. Every minute, update the sliding total with <span class="formula">total(now) = total(previous minute) + count(minute that just closed) − count(minute that just left)</span>. The work per update is proportional to recent activity, not to the window's length.</p>`,
        },
        {
          type: "diagram",
          title: "One sliding update at 10:06",
          caption: "At 10:06 the window covers the minutes 09:06 to 10:05. The minute 10:05 has just closed and is added; 09:05 has just left the window and is subtracted. Nothing else changes.",
          svg: `<svg viewBox="0 0 640 210" role="img" aria-label="Minute cells from 09:05 to 10:05; the newest minute is added and the expired minute is subtracted">
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
</svg>`,
        },
        {
          type: "code",
          title: "The per-minute sliding update",
          lang: "sql",
          code: `-- new = counts for the minute that just closed   (written by the stream job)
-- old = counts for the minute that left the window (minute = now - 61 min)
UPDATE views_last_hour t
SET    views = t.views + COALESCE(n.views, 0) - COALESCE(o.views, 0)
FROM   (SELECT video_id, views FROM minute_counts WHERE minute = :just_closed)  n
FULL JOIN
       (SELECT video_id, views FROM minute_counts WHERE minute = :just_expired) o
       USING (video_id)
WHERE  t.video_id = COALESCE(n.video_id, o.video_id);
-- new videos need an INSERT ... ON CONFLICT first; rows that reach 0 can be deleted`,
          caption: "A sketch, not production SQL: in practice you would upsert new videos, delete zeroed rows, and run this per shard right before the refresher reads the table.",
        },
        {
          type: "lab",
          id: "slidingCounter",
          caption: "Move \"now\" and watch one video's total change by exactly the green minute minus the red one; the check confirms it matches a full recount. Below, compare what each sliding strategy costs across the whole catalogue in minute buckets and Kafka retention.",
        },
        {
          type: "text",
          html: `<h3>The retention bill</h3>
<p>Subtraction needs the minute counts for the whole window. That is 60 buckets per active video for an hour, 1,440 for a day and 43,200 for a month. Assume about 3 million distinct videos are watched in a typical minute and each stored (video, minute) count costs about 24 bytes:</p>
<ul>
<li>Sliding hour: <span class="formula">60 × 3M × 24 B ≈ 4.6 GB</span>, easily held in memory</li>
<li>Sliding day: <span class="formula">1,440 × 3M × 24 B ≈ 100 GB</span></li>
<li>Sliding month: <span class="formula">43,200 × 3M × 24 B ≈ 3.3 TB</span>, a huge table read every minute to find what expired</li>
</ul>
<p>The month figure is the main reason to push back when someone says every window must slide.</p>`,
        },
        {
          type: "quiz",
          q: "The sliding hour total for a video is 12,000 at 10:05. The minute 10:05 had 300 views and the minute 09:05 had 500. What is the total at 10:06?",
          options: ["12,300", "11,800", "12,800", "11,500"],
          answer: 1,
          explain: "Add the minute that just closed and subtract the one that just left: 12,000 + 300 − 500 = 11,800. The video is cooling down, which only a sliding window shows while the hour is still in progress.",
        },
      ],
    },
    {
      id: "hybrid-and-lagged",
      title: "Hybrid windows and the lagged consumer",
      kicker: "Choosing a sliding strategy",
      blocks: [
        {
          type: "text",
          html: `<p>The cheapest sliding window is the one you do not build. Users judge freshness on the short window: "trending now" should move minute by minute. A monthly chart barely changes from one minute to the next, and nobody notices whether it covers the last 30 days to the minute or to the hour. So propose a <strong>hybrid</strong>: slide the last hour at minute granularity, keep the day and month tumbling (or sliding in coarse hourly steps, which needs only 24 or 720 hourly buckets per video instead of 1,440 or 43,200 minute buckets). It costs a few gigabytes of minute buckets and shows product judgement, not just technique.</p>
<p>If the interviewer insists on fine-grained sliding for long windows, there is a neat trick that avoids bucket tables entirely: the <strong>lagged consumer</strong>. Run a second consumer group on the same Kafka topic that trails the live consumer by exactly the window length. Every event it reads has just left the window, so it subtracts that view from the total. The log itself is the history.</p>
<p>The price is retention and reading. The topic must keep at least one full window of events: at ~70 billion views a day and an assumed ~40 bytes per event, 30 days is roughly <span class="formula">70B × 30 × 40 B ≈ 85 TB</span> before replication. Kafka handles that kind of sequential storage well, but it is a real cost, and every event is now read once more per sliding window. Time needs care too: the subtractor should use event time and the same watermark and lateness policy as the adder, so any view the adder dropped as late is also skipped by the subtractor. Kafka can look up the offset for a timestamp (<code>offsetsForTimes</code>), which helps position the lagged group when it starts.</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "Minute buckets, add and subtract", tone: "info", html: "Simple and exact. Stores 60 buckets per active video per hour of window. Fine for an hour; terabytes for a month." },
            { title: "Hybrid", tone: "ok", html: "Slide the hour by minute; tumble day and month (or step them hourly). Gigabytes of state. Usually the right product answer." },
            { title: "Lagged consumer", tone: "warn", html: "No bucket tables: a second consumer subtracts events as they age out. Needs topic retention of at least the longest window and an extra read of every event." },
          ],
        },
        {
          type: "callout",
          tone: "warning",
          title: "Engine-native sliding windows multiply state",
          html: `<p>Stream processors offer sliding windows as a one-liner, for example a 30-day window that slides every minute. Under the hood, each event is assigned to every overlapping window, and each window keeps its own aggregate per key: <span class="formula">30 days ÷ 1 minute = 43,200</span> accumulators per video. Instead, aggregate into small tumbling panes (minute or hour sums) and combine them, which is exactly what the add/subtract approach does.</p>`,
        },
        {
          type: "quiz",
          q: "Product wants \"last month\" to slide every minute. What is the strongest response?",
          options: [
            "Use the engine's built-in sliding window with a one-minute slide",
            "Explain that it needs 43,200 minute buckets per video (terabytes) or a month of Kafka retention, for a ranking that barely changes minute to minute; propose hourly steps or tumbling for the month and minute-level sliding for the hour",
            "Refuse; sliding windows are impossible at this scale",
            "Recompute the month from raw events every minute",
          ],
          answer: 1,
          explain: "Put a cost on the request and tie the answer to what users notice. Freshness matters on the short window; a month that slides hourly or tumbles daily is indistinguishable to users and orders of magnitude cheaper.",
        },
      ],
    },
    {
      id: "state-in-processor",
      title: "Keeping all the state in the stream processor",
      kicker: "An alternative design",
      blocks: [
        {
          type: "text",
          html: `<p>Everything so far keeps per-window totals in a database and runs a refresher. An alternative removes both: keep the per-window counts in the stream processor's keyed state and have the job emit each window's top K straight to the cache. Flink, for instance, can hold large keyed state in RocksDB on local disk and checkpoint it incrementally.</p>`,
        },
        {
          type: "steps",
          title: "A two-stage job that emits top K",
          items: [
            "Stage one is keyed by video ID. Each task keeps that video's counts per window (minute panes for the sliding hour, totals for day, month and all time) in keyed state.",
            "Each stage-one task also tracks the local top K among the videos it owns. Because tasks own disjoint sets of videos, these local lists merge exactly, the same argument as the shard merge in Chapter 3.",
            "Every minute, the tasks send their local top-K lists to a final, single-parallelism stage that merges at most (tasks × K) entries per window.",
            "The final stage writes each window's merged list to Redis, replacing the previous answer atomically.",
          ],
        },
        {
          type: "text",
          html: `<p>One subtlety: for tumbling windows counts only grow, so a bounded min-heap of candidates per task works. For a sliding window counts also fall, and a video outside the heap can overtake one inside it as the inside one cools. Either keep an ordered structure over all of the task's keys, or recompute the local top K from state each minute, which is affordable when each task owns a slice of the 20 million videos active in the hour.</p>`,
        },
        {
          type: "tradeoffs",
          pros: [
            "No counter database and no refresher: fewer systems to run",
            "Lowest latency from view to updated answer",
            "State and Kafka offsets are checkpointed together, so recovery is consistent",
          ],
          cons: [
            "The hard parts move into framework internals: state size, RocksDB tuning, checkpoint duration, rescaling",
            "You must be able to explain keyed state, checkpoints and the two-stage topology in depth",
            "Ad hoc queries and debugging are harder without a database holding the totals",
          ],
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>Present this as an option <em>after</em> the database-backed design, not instead of it. It is elegant, but if the interviewer does not know Flink well you will spend your time explaining the framework rather than the design, and some interviewers will steer you back to simpler primitives anyway.</p>`,
        },
      ],
    },
    {
      id: "serving-sorted-sets",
      title: "Redis sorted sets for serving",
      kicker: "The serving layer",
      blocks: [
        {
          type: "text",
          html: `<p>Whichever design computes the answers, they end up in a cache. A Redis <strong>sorted set</strong> is a natural home: it stores members ordered by a numeric score. <code>ZADD</code> sets a member's score in O(log n), <code>ZINCRBY</code> adds to it, and reading the top K by descending score is O(log n + K), using <code>ZRANGE key 0 K-1 REV</code> (Redis 6.2 and later) or the older <code>ZREVRANGE</code>.</p>
<p>Two habits keep it healthy. First, bound the membership: store only the top few thousand videos per window and trim the rest with <code>ZREMRANGEBYRANK</code>, so memory stays small and predictable. Second, publish atomically: write the new answer into a temporary key and <code>RENAME</code> it over the live key, so readers see either the old list or the new one, never a half-written mix.</p>`,
        },
        {
          type: "code",
          title: "Publishing and reading one window",
          lang: "text",
          code: `# refresher (or final stream stage), once a minute
DEL   topk:hour:tmp
ZADD  topk:hour:tmp  48213377 v_8f2c  47100210 v_19aa  ...   # top 1,000
RENAME topk:hour:tmp topk:hour                               # atomic swap
EXPIRE topk:hour 3600                                        # long TTL: serve stale

# API, per request
ZRANGE topk:hour 0 99 REV WITHSCORES                         # top 100`,
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p>Sorted sets can also hold <em>live</em> counters (<code>ZINCRBY</code> per view), which is a fine design at small scale. At ~800K views a second it is not: a sorted set is one key, one key lives on one Redis node, and every view of every video would hit it. Use sorted sets for the precomputed answers, and keep counting in the stream job.</p>`,
        },
      ],
    },
    {
      id: "interview",
      title: "Talking about windows in an interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "text",
          html: `<p>The read path deep dive is where interviewers check whether you understand <em>why</em> windowed top K is hard. Start from the refresher's cost, move from rollups to per-window totals, and only then take on sliding windows, ideally by proposing the hybrid yourself before you are asked.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>A strong answer covers:</p>
<ol>
<li>Caching hid query cost from users, but the refresher still pays it; month windows over hour buckets take minutes per refresh.</li>
<li>Rollups reduce rows per video; per-window totals with an index on views remove aggregation from reads entirely, at the cost of more writes per flush.</li>
<li>Tumbling rollover by building the next table and swapping atomically.</li>
<li>Sliding updates as add-newest, subtract-oldest, and the retention cost that implies (60, 1,440, 43,200 buckets per video).</li>
<li>The hybrid as the product answer; the lagged consumer and stream-state designs as alternatives with their costs.</li>
</ol>`,
        },
        {
          type: "quiz",
          q: "The interviewer asks why you would not just use the stream engine's sliding window of one hour with a one-minute slide. What is the precise issue?",
          options: [
            "Stream engines cannot do sliding windows",
            "It keeps a separate aggregate for each of the 60 overlapping windows per video, multiplying state by window ÷ slide; minute panes plus add/subtract keep one total per video plus the panes",
            "It would produce approximate counts",
            "It cannot use event time",
          ],
          answer: 1,
          explain: "For a one-hour window that is a 60× state multiplier, tolerable but wasteful; for a month it is 43,200×. Pane-based add/subtract stores each minute once and updates one running total, which is why it scales to longer windows.",
        },
      ],
    },
  ],
  takeaways: [
    "Precomputation hides query cost from users, but the refresher still pays it; read-time aggregation scales with window length × active videos.",
    "Rollups cut rows per video but keep the aggregation; per-window running totals with an index on views make every window's top K an index walk.",
    "Roll tumbling windows over by building the next table and swapping atomically, and make delta updates idempotent (full-value panes or last-applied-pane tracking).",
    "A sliding total is updated each minute by adding the newest minute and subtracting the one that left, which requires keeping minute counts for the whole window.",
    "Slide the hour, tumble (or step hourly) the day and month: freshness matters on the short window, and a sliding month costs terabytes of buckets.",
    "A lagged consumer trades bucket tables for Kafka retention; keeping all state in the stream processor removes the database at the cost of framework depth.",
    "Serve answers from bounded Redis sorted sets published with an atomic rename; do not count live views in one sorted set at this scale.",
  ],
  furtherReading: [
    { title: "Redis documentation: Sorted sets", url: "https://redis.io/docs/latest/develop/data-types/sorted-sets/", note: "Commands, complexity and common leaderboard patterns." },
    { title: "Apache Flink documentation: Windows", url: "https://nightlies.apache.org/flink/flink-docs-stable/docs/dev/datastream/operators/windows/", note: "How sliding window assigners place each element into multiple windows." },
    { title: "Streaming Systems (Akidau, Chernyak and Lax, O'Reilly, 2018)", note: "Windowing, triggers and how incremental aggregation works in practice." },
  ],
};
