// Deep dive: Chapter 5, Approximation, specialised stores and the final design. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch5 = {
  hook: `<p>Every design so far keeps an exact counter for every video in every window. In the last hour that means around 20 million videos, most of them watched a handful of times, each with its own row, index entry and slice of stream state. Yet the shelf shows 1,000 of them. Nearly all the memory and write traffic goes into counting videos that will never come close to the list.</p>
<p>Now suppose the product manager says: "It's a trending shelf. If video 998 and video 1,003 swap places now and then, nobody will notice." That one sentence lets you count heavy hitters in a few megabytes, whatever the size of the catalogue. This chapter shows how, then asks whether an off-the-shelf store could replace the pipeline we built, and finishes by assembling the whole design.</p>`,
  sections: [
    {
      id: "when-approximate",
      title: "When approximate is good enough",
      kicker: "The problem",
      blocks: [
        {
          type: "problem",
          html: `<p>Exact top K forces you to keep a count for every item that <em>might</em> be in the answer, which, since any video could get a burst of views, means every item. The state grows with the catalogue and its long tail, not with K.</p>`,
        },
        {
          type: "text",
          html: `<p>Approximation is acceptable when two things hold. First, the errors are <strong>bounded and small relative to the gaps between the items you care about</strong>. At the top of a popularity curve, neighbouring videos are often separated by large margins, so a small overcount changes nothing. The errors only bite near position K, where many videos have similar counts and can swap places. Second, the feature is about <strong>trends, not money or contracts</strong>. A trending shelf can live with an occasional swap at position 998; creator payouts, ad billing and public view counters cannot.</p>
<p>That is why Chapter 1 proposed exact counts first. Exact is the stricter requirement, so the design that meets it is the baseline, and approximation is an optimisation you offer with a clear statement of its error. Ask the interviewer before switching; "the shelf tolerates small errors near the cut-off, so I could cut memory by orders of magnitude" is a strong offer, not an assumption.</p>`,
        },
        {
          type: "keypoints",
          items: [
            "Approximation trades exactness near position K for state that does not grow with the catalogue.",
            "It fits trending features; it does not fit anything that pays people or is shown as an official count.",
            "Offer it as an optimisation once the exact design is on the board, and say what errors it introduces.",
          ],
        },
      ],
    },
    {
      id: "count-min-sketch",
      title: "The Count-Min Sketch",
      kicker: "The key idea",
      blocks: [
        {
          type: "idea",
          html: `<p>A <strong>Count-Min Sketch</strong> is a small grid of counters, <code>d</code> rows by <code>w</code> columns, with one hash function per row. Each item increments one counter in every row; its estimated count is the <strong>minimum</strong> of those <code>d</code> counters. Memory depends on the error you accept, not on how many distinct items exist.</p>`,
        },
        {
          type: "text",
          html: `<p>To add a view of <code>video:42</code>, hash the ID with each row's hash function to pick one column per row, and add 1 to each of those <code>d</code> cells. To estimate its count, look at the same <code>d</code> cells and take the smallest.</p>
<p>Why the minimum? A cell holds video 42's views <em>plus</em> the views of every other video that happens to hash to the same cell in that row. Collisions only ever add, so every cell is an overestimate, never an underestimate. Different rows use independent hashes, so it is unlikely that video 42 collides with a heavy video in every row at once; the least-polluted cell is the best estimate.</p>`,
        },
        {
          type: "diagram",
          title: "One item, one cell per row, take the minimum",
          caption: "video:42 hashes to one highlighted cell in each of three rows. Each cell includes its own views plus collisions with other videos, so the smallest of the three is the estimate. It can be too high, never too low.",
          svg: `<svg viewBox="0 0 640 220" role="img" aria-label="A Count-Min Sketch grid of 3 rows and 8 columns with one highlighted cell per row for video 42">
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
</svg>`,
        },
        {
          type: "text",
          html: `<h3>Sizing it from the error you accept</h3>
<p>The Count-Min guarantee, from Cormode and Muthukrishnan's paper: with <span class="formula">w = ⌈e/ε⌉</span> columns and <span class="formula">d = ⌈ln(1/δ)⌉</span> rows, each estimate exceeds the true count by at most <span class="formula">εN</span> with probability at least <span class="formula">1 − δ</span>, where N is the total number of events added. The error is a fraction of the <em>whole stream</em>, which is why sketches are good at heavy hitters and useless for tail items.</p>
<p>Work it through for the last hour. At ~800K views a second, an hour holds <span class="formula">N ≈ 2.9B views</span>. Choose ε = 10<sup>−5</sup>, so the overcount is at most about 29K views, and δ = 0.001:</p>
<ul>
<li><span class="formula">w = e / 10<sup>−5</sup> ≈ 272K columns</span></li>
<li><span class="formula">d = ln(1,000) ≈ 7 rows</span></li>
<li><span class="formula">272K × 7 × 8 B ≈ 15 MB</span> with 8-byte counters</li>
</ul>
<p>Compare that with exact counts for the ~20 million videos active in an hour, around a gigabyte at ~50 bytes each, and far more for a month. Whether 29K views of slack is acceptable depends on how far apart videos near position 1,000 are, which you would measure from real data rather than guess. If the gaps are smaller, widen the sketch: the error shrinks in proportion to w.</p>`,
        },
        {
          type: "quiz",
          q: "A Count-Min Sketch reports 905 views for a video. What can you say about its true count?",
          options: [
            "It is exactly 905",
            "It is at most 905, and with high probability at least 905 − εN",
            "It is at least 905",
            "Nothing; it could be any number",
          ],
          answer: 1,
          explain: "Collisions only add, so every cell, and therefore the minimum, is at least the true count: the estimate is an upper bound. The guarantee bounds the overcount by εN with probability 1 − δ, so the true count lies between 905 − εN and 905 with high probability.",
        },
      ],
    },
    {
      id: "sketch-plus-heap",
      title: "Sketch plus heap: remembering who is heavy",
      kicker: "How it works",
      blocks: [
        {
          type: "problem",
          html: `<p>A sketch can estimate the count of any video you ask about, but it does not remember which videos it has seen. Its cells are anonymous sums. To list the top K you need the IDs, and storing every ID would bring back exactly the memory we were trying to save.</p>`,
        },
        {
          type: "steps",
          title: "For each view event",
          items: [
            "Add the view to the sketch and read back the video's new estimate.",
            "If the video is already in the candidate min-heap, update its value to the new estimate.",
            "Otherwise, if the heap has room, insert it.",
            "Otherwise, if its estimate beats the heap's minimum, evict the minimum and insert this video.",
            "To answer a query, read the heap and return its K largest entries.",
          ],
        },
        {
          type: "text",
          html: `<p>The two structures split the work: the sketch supplies a count for any video, including ones not currently tracked, and the heap remembers the IDs that look heavy. Keep the heap <strong>several times larger than K</strong> (say 3,000 to 5,000 entries for K = 1,000). Videos near the boundary rise and fall; a heap barely bigger than K evicts videos that would have climbed back, while a roomier heap keeps them in contention. Each event costs <code>d</code> hash-and-increment operations plus an O(log H) heap update.</p>
<p>The errors are worth stating precisely. Counts are overestimated, never under. Videos near position K can be ordered wrongly or swapped with the next one out. And if the sketch is too narrow, collisions inflate the estimates of light videos enough to crowd the heap, pushing a real top-K video out. A wider sketch and a larger heap shrink both effects.</p>`,
        },
        {
          type: "lab",
          id: "cmsTopK",
          caption: "200K views over 50K videos. Narrow the sketch and watch inflated counts let low-ranked videos into the list; widen it and the error bound e·N/w shrinks. Shrink the candidate heap to just above K and see videos near the boundary get lost. Compare the sketch's memory with exact counting.",
        },
        {
          type: "compare",
          title: "Two families of heavy-hitter algorithms",
          items: [
            { title: "Sketch + heap (Count-Min)", tone: "info", html: "A hashed counter grid answers \"how many?\" for any item; a separate heap tracks candidate IDs. Sketches with the same dimensions and hash functions <strong>merge by adding cell by cell</strong>, which suits distributed and windowed counting." },
            { title: "Counter-based (Misra-Gries, Space-Saving)", tone: "ok", html: "Keep a fixed number of (item, count) slots. When a new item arrives and the slots are full, Misra-Gries decrements every slot while Space-Saving takes over the smallest slot. They track IDs directly and give deterministic error bounds; merging summaries is possible but less trivial." },
          ],
        },
        {
          type: "text",
          html: `<h3>Windows and placement</h3>
<p>Keep one sketch and heap <strong>per tumbling window</strong>. Because a Count-Min Sketch is linear, sketches built with the same dimensions and hashes can be added cell by cell: 24 hourly sketches sum to a daily sketch, and the union of their candidate IDs, re-queried against the summed sketch, gives the daily candidates. Linearity also makes a sliding hour possible: keep a sketch per minute, add the newest minute's cells and subtract the expired minute's, the add/subtract pattern from Chapter 4. The candidate heap still needs re-evaluating as counts fall.</p>
<p>Where should the sketch live? Redis with the RedisBloom module offers sketch commands, so a consumer could increment a sketch and update a sorted set per event. It is simple, but the sketch's increments are not idempotent, and Redis persistence cannot be lined up with Kafka offsets: after a consumer crash and replay, some views are counted twice. Keeping the sketch and heap in the stream processor's checkpointed state restores them together with the offsets, so replay is consistent, which is the same argument as Chapter 3.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "RedisBloom", title: "CMS and TOPK commands", html: "Provides <code>CMS.INITBYDIM</code>, <code>CMS.INCRBY</code>, <code>CMS.QUERY</code> and <code>CMS.MERGE</code> for Count-Min Sketches, plus a separate <code>TOPK</code> structure that keeps a list of heavy hitters directly (Redis documents it as based on the HeavyKeeper algorithm)." },
            { org: "ClickHouse", title: "topK aggregate function", html: "Documented as returning an approximate list of the most frequent values, using a Space-Saving style algorithm, so it trades exactness for bounded memory per group." },
          ],
        },
        {
          type: "quiz",
          q: "You keep a Count-Min Sketch per hour. How do you get the top K for the day?",
          options: [
            "Take the top K of each hourly heap and pick the 24 largest",
            "Add the 24 hourly sketches cell by cell, take the union of the hourly candidate IDs, and re-estimate each candidate against the summed sketch",
            "Average the 24 sketches",
            "It is impossible; sketches cannot be combined",
          ],
          answer: 1,
          explain: "Sketches with identical dimensions and hashes are linear, so their cell-wise sum is exactly the sketch of the whole day. The IDs come from the hourly candidate lists (plus some slack for steady performers), each re-scored against the daily sketch. Merging hourly top lists by value would repeat the mistake from Chapter 2.",
        },
      ],
    },
    {
      id: "specialised-stores",
      title: "Could a specialised store do all this?",
      kicker: "Build or adopt",
      blocks: [
        {
          type: "text",
          html: `<p>An interviewer will often ask whether a time series database or a real-time analytics engine could replace the pipeline. The honest answer depends on how each store organises data, and whether that organisation matches "rank billions of items by a windowed sum".</p>
<h3>Generic time series databases: a poor fit</h3>
<p>InfluxDB and Prometheus store one series per unique combination of tags or labels, and they are fast at reading a few series over time. Make the video ID a tag and you have billions of series. Prometheus's own documentation warns against labels with unbounded values such as user IDs, and ranking across all series means touching every one. They are excellent for plotting one video's views over time and poor at ranking all videos.</p>
<h3>TimescaleDB: our design, maintained by the database</h3>
<p>TimescaleDB is Postgres with time-partitioned hypertables and <strong>continuous aggregates</strong>: materialised views that are refreshed incrementally as new data arrives, and can combine materialised results with the most recent raw rows. Continuous aggregates for the last hour, day and month are essentially the rollups and per-window totals of Chapter 4, maintained for you. You would still pre-aggregate in the stream at this write rate, still cache the answers, and likely still shard.</p>
<h3>Real-time OLAP: rollups on ingest</h3>
<p>Apache Druid, Apache Pinot and ClickHouse ingest directly from Kafka and pre-aggregate as they go. Druid can roll rows up by time bucket and dimensions at ingestion; Pinot offers star-tree indexes that pre-aggregate across dimension combinations; ClickHouse pairs materialised views with <code>SummingMergeTree</code> tables, which add up rows with the same key during background merges (so queries still use <code>SUM ... GROUP BY</code>, because merges are not guaranteed to have happened). All of them answer "group by video, order by views, limit K, over a time range" quickly.</p>`,
        },
        {
          type: "table",
          title: "Specialised stores for windowed top K",
          headers: ["Store", "Fit", "Why"],
          rows: [
            ["InfluxDB / Prometheus", "<span class=\"hl-bad\">Poor</span>", "A series per video ID; ranking touches every series"],
            ["TimescaleDB", "<span class=\"hl-good\">Good</span>", "Continuous aggregates are per-window totals; still pre-aggregate, cache and shard"],
            ["Druid / Pinot / ClickHouse", "<span class=\"hl-good\">Good</span>", "Ingest-time rollups and fast top-N queries; heavy to operate at this scale"],
            ["Redis sorted sets", "Serving layer", "Holds precomputed answers; not a place to count 800K views a second"],
          ],
        },
        {
          type: "callout",
          tone: "insight",
          title: "The shard-merge question comes back",
          html: `<p>Druid's documentation describes its TopN query as approximate: each data process ranks its own segments and returns only its top results to the broker for merging. Druid partitions segments primarily by time, not by your ranking dimension, so one video's views are spread across many segments, which is exactly the round-robin case from Chapter 3. Druid also offers exact <code>GROUP BY</code> queries at a higher cost. Knowing <em>why</em> a store is approximate is the kind of depth interviewers reward.</p>`,
        },
        {
          type: "text",
          html: `<p>When would you pick one? When the organisation already runs it, or when the product needs many slice-and-dice queries beyond four fixed windows (top videos by country, by category, by device). Their ingest-time rollups do what our stream job and per-window tables do. In an interview, only propose one if you can explain its ingestion and rollup path; "we'll use Druid" with nothing behind it invites the hardest follow-up questions.</p>`,
        },
      ],
    },
    {
      id: "final-design",
      title: "The final design, end to end",
      kicker: "Putting it together",
      blocks: [
        {
          type: "diagram",
          title: "The complete Top K design",
          caption: "Write path along the top: Kafka keyed by video, a stream job with a 30-second watermark that aggregates into minute panes and bulk-upserts per-window totals sharded by video. Read path along the bottom: a refresher merges each shard's top 1,000 every minute into Redis, and a stateless API reads only Redis.",
          svg: `<svg viewBox="0 0 640 290" role="img" aria-label="Final architecture: view events to Kafka to stream job to sharded per-window totals; refresher to Redis; clients read through a stateless API">
<defs><marker id="pb5-final-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<text x="10" y="26" font-size="12" font-weight="700" style="fill: var(--dg-muted)">write path</text>
<text x="10" y="180" font-size="12" font-weight="700" style="fill: var(--dg-muted)">read path</text>
<rect x="10" y="40" width="100" height="56" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="60" y="64" text-anchor="middle" font-size="13" font-weight="700">View</text>
<text x="60" y="81" text-anchor="middle" font-size="13" font-weight="700">events</text>
<rect x="150" y="40" width="120" height="56" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<text x="210" y="64" text-anchor="middle" font-size="13" font-weight="700">Kafka</text>
<text x="210" y="81" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">key = videoId</text>
<rect x="310" y="40" width="140" height="56" rx="8" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="1.5"/>
<text x="380" y="64" text-anchor="middle" font-size="13" font-weight="700">Stream job</text>
<text x="380" y="81" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">watermark 30 s</text>
<rect x="490" y="40" width="140" height="56" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<text x="560" y="64" text-anchor="middle" font-size="13" font-weight="700">Per-window totals</text>
<text x="560" y="81" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">sharded, indexed</text>
<rect x="490" y="190" width="140" height="56" rx="8" style="fill: var(--dg-5-soft); stroke: var(--dg-5)" stroke-width="1.5"/>
<text x="560" y="214" text-anchor="middle" font-size="13" font-weight="700">Refresher</text>
<text x="560" y="231" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">every 60 s</text>
<rect x="310" y="190" width="140" height="56" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<text x="380" y="214" text-anchor="middle" font-size="13" font-weight="700">Redis</text>
<text x="380" y="231" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">topk:{window}</text>
<rect x="150" y="190" width="120" height="56" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="1.5"/>
<text x="210" y="214" text-anchor="middle" font-size="13" font-weight="700">Top-K API</text>
<text x="210" y="231" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">stateless</text>
<rect x="10" y="190" width="100" height="56" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="60" y="223" text-anchor="middle" font-size="13" font-weight="700">Clients</text>
<line x1="110" y1="68" x2="148" y2="68" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#pb5-final-arrow)"/>
<line x1="270" y1="68" x2="308" y2="68" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#pb5-final-arrow)"/>
<line x1="450" y1="68" x2="488" y2="68" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#pb5-final-arrow)"/>
<line x1="560" y1="96" x2="560" y2="188" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#pb5-final-arrow)"/>
<line x1="490" y1="218" x2="452" y2="218" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#pb5-final-arrow)"/>
<line x1="270" y1="218" x2="308" y2="218" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#pb5-final-arrow)"/>
<line x1="110" y1="218" x2="148" y2="218" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#pb5-final-arrow)"/>
<text x="210" y="116" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">replay, 30+ days</text>
<text x="380" y="116" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">minute panes, checkpoints</text>
<text x="552" y="140" text-anchor="end" font-size="12">top 1,000 per shard,</text>
<text x="552" y="156" text-anchor="end" font-size="12">merged per window</text>
<text x="380" y="268" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">long TTL, serve stale</text>
<text x="210" y="268" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">reads cache only</text>
<text x="560" y="268" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">idempotent writes</text>
</svg>`,
        },
        {
          type: "steps",
          title: "Walking one view and one request through it",
          items: [
            "A view is published to the <code>view-events</code> topic with the video ID as key, so it lands in that video's partition. The topic keeps at least 30 days, enough to replay a month or to run a lagged subtractor.",
            "The stream job, with a 30-second bounded-out-of-orderness watermark, adds the view to the video's minute pane in keyed state; skew is absorbed by two-stage aggregation if needed. State and offsets are checkpointed together.",
            "As each pane closes, the job bulk-upserts the sums into the per-window totals: a sliding hour (add the new minute, subtract the expired one), tumbling day and month built in fresh tables and swapped at the boundary, and all time. Writes are idempotent so replays are harmless.",
            "Every minute the refresher reads the top 1,000 per window from each shard's views index, merges them (exact, because shards are keyed by video) and publishes each list to Redis with an atomic rename and a long TTL.",
            "A client calls <code>GET /v1/top-videos?window=hour&amp;k=100</code>; a stateless API server behind the load balancer reads the first 100 entries of the cached list in about a millisecond.",
          ],
        },
        {
          type: "table",
          title: "Every component traces back to a requirement",
          headers: ["Component", "Requirement it serves"],
          rows: [
            ["Kafka keyed by video, long retention", "Absorb ~800K events/s; replay after bugs or crashes; one owner per video"],
            ["Stream job with watermark and minute panes", "Lateness budget inside the 1-minute freshness target; writes cut to distinct videos per interval"],
            ["Per-window totals sharded by video, indexed by views", "Cheap, exact top K for every window; exact shard merge"],
            ["Hybrid windows (sliding hour, tumbling day and month)", "\"Trending now\" moves every minute without terabytes of buckets"],
            ["Refresher and Redis with long TTL", "Reads in tens of milliseconds; stale rather than broken if the refresher lags"],
            ["Optional sketch + heap per window", "Fixed memory if the product accepts small errors near position K"],
          ],
        },
      ],
    },
    {
      id: "interview",
      title: "What interviewers expect at each level",
      kicker: "Interview angle",
      blocks: [
        {
          type: "text",
          html: `<p>Top K rewards breadth first, then depth where your experience is real. Get a complete design on the board within the first third of the interview, then go deep on whichever of the write path, windows or approximation the interviewer steers towards. Expectations differ by level, so calibrate how much you drive.</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "Mid-level", tone: "info", html: "A working end-to-end design: counters, windows, a cache. Recognises some bottlenecks (per-view writes, expensive window queries) and fixes them with some guidance." },
            { title: "Senior", tone: "ok", html: "Reaches something close to the final design largely unprompted: quantifies the write rate, aggregates before writing, keeps the shard merge exact, precomputes reads, and argues tumbling versus sliding with product reasons." },
            { title: "Staff and above", tone: "warn", html: "Sees the whole solution space and chooses with clear judgement: stream state versus database totals, sketches versus exact counts, building versus adopting an OLAP store, plus failure handling and operability, going beyond the standard deep dives." },
          ],
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>When approximation comes up, a strong answer is short and precise:</p>
<ol>
<li>Confirm the product tolerates small errors near position K; keep exact counts for anything that pays people.</li>
<li>Count-Min Sketch: d × w counters, one hash per row, estimate is the minimum; never undercounts; overcount at most εN with probability 1 − δ, sized by <code>w = e/ε</code>, <code>d = ln(1/δ)</code>.</li>
<li>Pair it with a candidate heap a few times larger than K, because the sketch forgets IDs.</li>
<li>One sketch per tumbling window; merge by adding cells; keep it in checkpointed stream state so replay stays consistent.</li>
</ol>`,
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Opening with "we'll use a Count-Min Sketch". It skips the exact design the interviewer wanted to see, and a sketch alone cannot list the top K. Present it as an optimisation after the exact design, together with the heap and the error it introduces.</p>`,
        },
        {
          type: "quiz",
          q: "Near the end of the interview you are asked: \"Would you use InfluxDB to store the counts?\" Which answer is strongest?",
          options: [
            "Yes, it is built for time series and view counts are time series",
            "No: it keys data by series, and with video ID as a tag there would be billions of series; ranking all of them touches every series. It is a good fit for one video's view graph, not for ranking. TimescaleDB continuous aggregates or an OLAP store fit better",
            "No, because InfluxDB cannot handle writes",
            "Yes, if we shard it by video ID",
          ],
          answer: 1,
          explain: "The answer turns on how the store organises data. Series-per-tag designs suffer at very high cardinality and are built to read a few series, not to rank all of them. Naming what it is good at, and what would fit instead, shows judgement rather than a reflexive yes or no.",
        },
      ],
    },
  ],
  takeaways: [
    "Approximation is an optimisation for trend features: it trades small, bounded errors near position K for memory that does not grow with the catalogue.",
    "A Count-Min Sketch estimates any item's count as the minimum of d hashed counters; it never undercounts, and with w = e/ε and d = ln(1/δ) overcounts by at most εN with probability 1 − δ.",
    "A sketch forgets IDs, so pair it with a candidate min-heap several times larger than K; reading the top K means reading the heap.",
    "Sketches are linear: hourly sketches add up to a daily one, and minute sketches can be added and subtracted for a sliding hour. Keep them in checkpointed stream state so replay does not double-count.",
    "Generic time series databases struggle with billions of video-ID series; TimescaleDB continuous aggregates and Druid, Pinot or ClickHouse automate the rollups we built, at an operational cost.",
    "The final design: Kafka keyed by video, a stream job with a watermark and minute panes, per-window totals sharded by video, a refresher merging shard top lists every minute into Redis, and a stateless API that reads only the cache.",
  ],
  furtherReading: [
    { title: "An Improved Data Stream Summary: The Count-Min Sketch and its Applications (Cormode and Muthukrishnan, Journal of Algorithms, 2005)", note: "The original paper, with the error bounds used in this chapter." },
    { title: "Efficient Computation of Frequent and Top-k Elements in Data Streams (Metwally, Agrawal and El Abbadi, ICDT 2005)", note: "Introduces the Space-Saving algorithm." },
    { title: "Prometheus documentation: Metric and label naming", url: "https://prometheus.io/docs/practices/naming/", note: "Includes the warning against labels with unbounded, high-cardinality values." },
    { title: "Apache Druid documentation: TopN queries", note: "Explains why TopN results are approximate and when to use GroupBy instead." },
  ],
};
