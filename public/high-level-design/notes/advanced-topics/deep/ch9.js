// Deep dive: Chapter 9, Time series databases: the read path, rollups and where they break. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch9 = {
  hook: `<p>It is 3 a.m. and checkout is slow. The on-call engineer opens a dashboard: average CPU for production hosts in us-west over the last hour, then p99 latency over the last 30 days to see whether this is new. The first panel needs a handful of series out of millions. The second spans 30 days of 10-second data, about 259,000 points per series. Both should render in under a second.</p>
<p>A week earlier, a well-meaning developer added a <code>user_id</code> label to the request-latency metric "for debugging". Overnight the metrics server's memory doubled, then it fell over. Both stories are about the read side of a time series database: the structures that make queries cheap, the rollups that make long ranges affordable, and the one assumption, low cardinality, that all of it depends on.</p>`,
  sections: [
    {
      id: "anatomy-of-a-query",
      title: "Anatomy of a query: from tags to blocks",
      kicker: "The read path",
      blocks: [
        {
          type: "problem",
          html: `<p>A monitoring TSDB may hold millions of series and billions of points. A typical query wants a few dozen series over a recent window. Scanning raw points and filtering them, the way a table scan would, reads thousands of times more data than the answer needs.</p>`,
        },
        {
          type: "text",
          html: `<p>The trick is that a TSDB never searches points. It searches <em>series</em>, through an index small enough to live in memory, and only then reads the compressed chunks of the series it found. That index is an <strong>inverted index</strong>, the same structure a search engine uses for words, applied to tag values: for every <code>key=value</code> pair, a sorted list (a <em>postings list</em>) of the IDs of series that have it.</p>`,
        },
        {
          type: "steps",
          title: "Answering \"average CPU for prod hosts in us-west, last hour\"",
          items: [
            "<strong>Pick partitions.</strong> Only blocks whose time range overlaps the last hour are candidates; usually that is the in-memory head plus at most one recent block.",
            "<strong>Resolve series.</strong> Look up <code>region=us-west</code> and <code>env=prod</code> (and the metric name) in the tag index and intersect the sorted postings lists.",
            "<strong>Locate chunks.</strong> Each block's own index maps a series ID to the offsets of its chunks, so the engine seeks straight to them.",
            "<strong>Decompress and aggregate while streaming.</strong> Decode just those chunks, drop points outside the hour, and fold values into a running sum and count. Raw points never pile up in memory.",
          ],
        },
        {
          type: "diagram",
          title: "Intersecting postings lists",
          caption: "Each tag value maps to a sorted list of series IDs. Intersecting the lists for region=us-west and env=prod leaves series 2 and 7, and only their chunks are read. Series in us-east or in dev are never touched.",
          svg: `<svg viewBox="0 0 620 240" role="img" aria-label="Two postings lists intersected to find matching series">
<defs><marker id="at9-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<text x="20" y="30" font-size="13" font-weight="700">Tag index (in memory)</text>
<rect x="20" y="48" width="150" height="32" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="95" y="69" text-anchor="middle" font-size="12">region=us-west</text>
<rect x="20" y="98" width="150" height="32" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="95" y="119" text-anchor="middle" font-size="12">env=prod</text>
<g style="fill: var(--dg-panel); stroke: var(--dg-line)">
<rect x="190" y="48" width="40" height="32" rx="4"/><rect x="278" y="48" width="40" height="32" rx="4"/>
<rect x="234" y="98" width="40" height="32" rx="4"/><rect x="322" y="98" width="40" height="32" rx="4"/>
</g>
<g style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="1.5">
<rect x="234" y="48" width="40" height="32" rx="4"/><rect x="322" y="48" width="40" height="32" rx="4"/>
<rect x="190" y="98" width="40" height="32" rx="4"/><rect x="278" y="98" width="40" height="32" rx="4"/>
</g>
<g font-size="12" text-anchor="middle">
<text x="210" y="69">1</text><text x="254" y="69">2</text><text x="298" y="69">5</text><text x="342" y="69">7</text>
<text x="210" y="119">2</text><text x="254" y="119">3</text><text x="298" y="119">7</text><text x="342" y="119">9</text>
</g>
<line x1="20" y1="148" x2="362" y2="148" stroke-width="1" stroke-dasharray="4 4" style="stroke: var(--dg-line)"/>
<rect x="20" y="168" width="150" height="32" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="95" y="189" text-anchor="middle" font-size="12" font-weight="700">intersection</text>
<g style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2">
<rect x="190" y="168" width="40" height="32" rx="4"/><rect x="234" y="168" width="40" height="32" rx="4"/>
</g>
<text x="210" y="189" text-anchor="middle" font-size="12" font-weight="700">2</text>
<text x="254" y="189" text-anchor="middle" font-size="12" font-weight="700">7</text>
<line x1="280" y1="184" x2="418" y2="184" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#at9-arrow)"/>
<text x="430" y="40" font-size="13" font-weight="700">Then read only</text>
<text x="430" y="58" font-size="13" font-weight="700">those chunks</text>
<text x="430" y="96" font-size="12" style="fill: var(--dg-muted)">Series 1, 3, 5, 9 and</text>
<text x="430" y="113" font-size="12" style="fill: var(--dg-muted)">every us-east or dev</text>
<text x="430" y="130" font-size="12" style="fill: var(--dg-muted)">series: never read</text>
<rect x="420" y="152" width="180" height="28" rx="5" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/>
<text x="510" y="171" text-anchor="middle" font-size="12">series 2: last-hour chunk</text>
<rect x="420" y="190" width="180" height="28" rx="5" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/>
<text x="510" y="209" text-anchor="middle" font-size="12">series 7: last-hour chunk</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>Intersecting sorted lists is a linear merge, and the lists are small compared with the data: a few million series IDs at most, often far fewer per tag value. With the series resolved, the query reads a few kilobytes of compressed chunks per series. Two kinds of locality do the work together: <strong>time locality</strong> (partitions) narrows which files to open, and <strong>series locality</strong> (per-series chunks) narrows which bytes inside them to read.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Prometheus", title: "Postings in the block index", html: "Every block's index file stores the label names and values, a postings list of series IDs for each label pair, and per-series chunk references. PromQL label matchers are evaluated by intersecting (and for negative matchers, subtracting) postings lists." },
            { org: "InfluxDB", title: "TSI", html: "InfluxDB originally kept its series index entirely in memory. The disk-backed Time Series Index (TSI) was added so that the number of series is no longer bounded by RAM, which helps with, but does not eliminate, high-cardinality pain." },
          ],
        },
      ],
    },
    {
      id: "skipping-work",
      title: "Skipping work: block metadata and Bloom filters",
      kicker: "Pruning",
      blocks: [
        {
          type: "text",
          html: `<p>A query over the last month might overlap dozens of immutable files. Most of them cannot contribute anything: the series is not in them, or their time range or values are outside the filter. A TSDB layers cheap checks that rule files and blocks out before any data is decompressed.</p>
<h3>Block metadata</h3>
<p>Every block (and often every chunk within it) records its minimum and maximum timestamp, and some engines also keep the minimum and maximum value. A query for 14:00-15:00 skips any block whose range ends before 14:00 or starts after 15:00. A filter such as <code>value &gt; 90</code> can skip a chunk whose recorded maximum is 72 without decoding it. The check costs a couple of comparisons against metadata already in memory.</p>
<h3>Bloom filters</h3>
<p>A Bloom filter answers "might this file contain series X?" with either <em>definitely not</em> or <em>maybe</em>. It is a bit array; adding a key sets k bits chosen by k hash functions, and a lookup checks whether all k bits are set. False negatives are impossible, so a "no" safely skips the file. False positives cost an unnecessary read. The space needed for a target false-positive rate p is about <span class="formula">bits per key = &minus;ln p / (ln 2)<sup>2</sup></span>, so a 1% rate costs about <strong>9.6 bits per series</strong> with 7 hash functions. For a file holding a million series that is about 1.2 MB, a tiny price for skipping most files on point lookups.</p>`,
        },
        {
          type: "table",
          title: "The layers of pruning",
          headers: ["Layer", "Question it answers", "What it skips"],
          rows: [
            ["Time partitions", "Does this partition overlap the query's range?", "Whole days or blocks"],
            ["Tag index", "Which series match the tag filters?", "All non-matching series"],
            ["Bloom filter per file", "Could this file contain the series?", "Files that definitely lack it"],
            ["Block and chunk min/max", "Can this block satisfy the time or value filter?", "Chunks outside the range"],
          ],
        },
        {
          type: "text",
          html: `<p>Which of these layers a given engine uses varies. LSM-based stores such as Cassandra and RocksDB keep a Bloom filter per immutable file, which matters most when a lookup for one key could otherwise touch many files. Engines whose blocks each cover a distinct time range rely more on time metadata, since only a few blocks overlap a recent query anyway. Columnar stores such as ClickHouse use min/max indexes per granule of rows, the same idea applied to analytic columns.</p>`,
        },
        {
          type: "quiz",
          q: "A file's Bloom filter says series X 'might be present'. What does the engine know?",
          options: [
            "Series X is definitely in the file",
            "Series X is definitely not in the file",
            "Series X is probably in the file, but the engine must read the index to be sure",
            "Nothing; Bloom filters only work for time ranges",
          ],
          answer: 2,
          explain: "A Bloom filter has no false negatives but does have false positives. 'Not present' lets the engine skip the file safely; 'might be present' means it must check the file's real index, which occasionally finds nothing.",
        },
      ],
    },
    {
      id: "downsampling",
      title: "Downsampling: rollups for long ranges",
      kicker: "Long-range queries",
      blocks: [
        {
          type: "problem",
          html: `<p>Raw 10-second data is 8,640 points per series per day. A 30-day panel over 500 series asks for about 130 million points, and a one-year capacity-planning chart for over 3 million points per series. The screen can show perhaps a thousand points across its width. Reading the rest is pure waste, and so is storing them forever.</p>`,
        },
        {
          type: "idea",
          html: `<p><strong>Downsample</strong>: background jobs summarize older raw data into coarser buckets (1 minute, 5 minutes, 1 hour), and each resolution is kept for a different length of time. Long-range queries read the coarse rollups; recent, detailed queries read raw points.</p>`,
        },
        {
          type: "table",
          title: "A typical tiered retention policy",
          headers: ["Age", "Resolution", "Points per series per day", "Good for"],
          rows: [
            ["0-24 hours", "10 s raw", "8,640", "Debugging, alerting"],
            ["1-7 days", "1 minute", "1,440", "Recent trends"],
            ["7-30 days", "5 minutes", "288", "Weekly dashboards"],
            ["30-365 days", "1 hour", "24", "Capacity planning"],
          ],
          note: "Each rollup bucket stores min, max, sum and count, not just an average.",
        },
        {
          type: "text",
          html: `<p>Work out the storage for one series over a year. Raw at 10 seconds: 8,640 &times; 365 &asymp; <strong>3.15 million points</strong>. Under the policy above: 8,640 raw + 6 days &times; 1,440 + 23 days &times; 288 + 335 days &times; 24 &asymp; <strong>32,000 points</strong>, about 99 times fewer. Rollup buckets are bigger than raw points because each holds four numbers, so the saving in bytes is smaller; with the lab's assumptions of about 1.5 bytes per compressed raw point and 6 bytes per bucket, a year shrinks from about 4.7 MB to about 0.15 MB per series, roughly 30x.</p>
<p>Reads improve even more. The 30-day panel at 1-hour resolution reads 720 points per series instead of 259,200, a 360x reduction, and still has more points than pixels.</p>`,
        },
        {
          type: "lab",
          id: "downsampling",
          caption: "Choose how long to keep raw points and each rollup, and see storage and points read for a dashboard query. The bottom chart shows a 30-second CPU spike inside an hour and what each rollup level reports for it.",
        },
        {
          type: "realworld",
          items: [
            { org: "TimescaleDB", title: "Continuous aggregates", html: "A materialized view over <code>time_bucket()</code> groups that refreshes incrementally in the background as new data arrives. It can be configured to combine materialized buckets with not-yet-materialized raw data for up-to-date results, and given its own, longer retention than the raw table." },
            { org: "Prometheus and Thanos", title: "Recording rules and compaction", html: "Prometheus itself does not downsample; recording rules precompute expensive expressions into new series. Thanos, which stores Prometheus blocks in object storage, can downsample old blocks to 5-minute and 1-hour resolutions during compaction." },
            { org: "Apache Druid", title: "Rollup at ingestion", html: "Druid can roll up rows as it ingests them, combining events with the same dimensions in the same time bucket into one row of aggregates. Raw detail is gone from the start, in exchange for much smaller segments." },
          ],
        },
        {
          type: "code",
          lang: "sql",
          title: "A 1-minute rollup as a TimescaleDB continuous aggregate",
          code: `CREATE MATERIALIZED VIEW metrics_1m
WITH (timescaledb.continuous) AS
SELECT time_bucket('1 minute', time) AS bucket,
       host, metric,
       min(value) AS min_v, max(value) AS max_v,
       sum(value) AS sum_v, count(*)   AS n
FROM metrics
GROUP BY bucket, host, metric;

SELECT add_continuous_aggregate_policy('metrics_1m',
  start_offset => INTERVAL '1 hour', end_offset => INTERVAL '1 minute',
  schedule_interval => INTERVAL '1 minute');`,
        },
        {
          type: "callout",
          tone: "tip",
          title: "Rollups are a requirements negotiation",
          html: `<p>When a requirement says "keep 10-second data for a year", do the multiplication out loud, then propose full resolution for a week and rollups after that, and ask whether that serves the actual use cases (alerting needs fresh detail; capacity planning needs hourly trends). Even if the interviewer insists on the original requirement, spotting the cost and offering an alternative is exactly the judgement being assessed.</p>`,
        },
      ],
    },
    {
      id: "rollup-math",
      title: "What a rollup must keep: min, max, sum, count and sketches",
      kicker: "Getting the numbers right",
      blocks: [
        {
          type: "problem",
          html: `<p>The obvious rollup stores one number per bucket: the average. It is also wrong in two ways that matter in production. Averages cannot be combined correctly, and averages erase exactly the spikes that alerts and incident reviews care about.</p>`,
        },
        {
          type: "text",
          html: `<h3>Averages of averages lie</h3>
<p>Suppose minute A served 10 requests averaging 100 ms and minute B served 990 requests averaging 10 ms. The average of the two averages is 55 ms. The true average over both minutes is (10 &times; 100 + 990 &times; 10) / 1,000 = <strong>10.9 ms</strong>. Combining 1-minute rollups into 5-minute or hourly ones repeats the error at every level. Store <strong>sum and count</strong> instead: sums add, counts add, and <span class="formula">average = &Sigma;sum / &Sigma;count</span> is exact at any resolution.</p>
<h3>Averages hide spikes</h3>
<p>A CPU idles at 20% and spikes to 100% for 30 seconds. Over a 5-minute bucket the average is (30 &times; 100 + 270 &times; 20) / 300 = <strong>28%</strong>. A dashboard built on averages shows a calm line, and an alert at 90% never fires. Keeping <strong>max</strong> (and min) per bucket preserves the extremes, and max of maxes is exact when you roll up further.</p>`,
        },
        {
          type: "diagram",
          title: "The same five minutes, three ways",
          caption: "Raw 10-second points show a 30-second spike to 100%. The 5-minute average reports 28%, below a 90% alert threshold; the 5-minute max keeps the spike visible.",
          svg: `<svg viewBox="0 0 620 260" role="img" aria-label="A CPU spike compared with its five-minute average and maximum">
<line x1="60" y1="210" x2="400" y2="210" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<line x1="60" y1="30" x2="60" y2="210" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<text x="52" y="34" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">100%</text>
<text x="52" y="214" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">0%</text>
<text x="60" y="228" font-size="12" style="fill: var(--dg-muted)">0 min</text>
<text x="400" y="228" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">5 min</text>
<line x1="60" y1="48" x2="400" y2="48" stroke-width="1.5" stroke-dasharray="6 4" style="stroke: var(--dg-bad)"/>
<line x1="60" y1="30" x2="400" y2="30" stroke-width="2" stroke-dasharray="2 3" style="stroke: var(--dg-ok)"/>
<line x1="60" y1="160" x2="400" y2="160" stroke-width="2.5" stroke-dasharray="8 4" style="stroke: var(--dg-4)"/>
<polyline points="60,174 196,174 200,30 226,30 230,174 400,174" fill="none" stroke-width="2.5" style="stroke: var(--dg-1)"/>
<text x="410" y="34" font-size="12" font-weight="700" style="fill: var(--dg-ok)">5-min max = 100%</text>
<text x="410" y="54" font-size="12" style="fill: var(--dg-bad)">alert threshold 90%</text>
<text x="410" y="157" font-size="12" font-weight="700" style="fill: var(--dg-4)">5-min avg = 28%</text>
<text x="410" y="181" font-size="12" style="fill: var(--dg-1)">raw 10 s points</text>
<text x="410" y="214" font-size="12" style="fill: var(--dg-muted)">An alert on the</text>
<text x="410" y="231" font-size="12" style="fill: var(--dg-muted)">average never fires.</text>
</svg>`,
        },
        {
          type: "text",
          html: `<h3>Percentiles do not roll up at all</h3>
<p>Latency objectives are usually stated as percentiles: p99 under 300 ms. There is no formula that combines the p99 of each minute into the p99 of the hour; you need the underlying distribution. Two mergeable representations solve this:</p>
<ul>
<li><strong>Histogram buckets.</strong> Count requests per latency range (under 10 ms, under 25 ms, under 50 ms...). Counts add across time and across hosts, and a percentile is estimated from the merged counts. Prometheus histograms work this way, with a cumulative bucket series per <code>le</code> (less-or-equal) boundary.</li>
<li><strong>Sketches.</strong> Compact, mergeable summaries with accuracy guarantees, such as t-digest (accurate at the tails) and DDSketch (a bounded relative error, described by Datadog in 2019). Store one per bucket and merge them for any coarser window.</li>
</ul>`,
        },
        {
          type: "code",
          lang: "text",
          title: "PromQL: p99 per region from mergeable histogram buckets",
          code: `histogram_quantile(
  0.99,
  sum by (region, le) (rate(http_request_duration_seconds_bucket[5m]))
)`,
          caption: "Bucket counts from every host are summed per region and boundary first; the percentile is estimated last, from the merged distribution.",
        },
        {
          type: "compare",
          items: [
            { title: "Store only the average", tone: "bad", html: "Wrong when rolled up further (bucket counts differ), hides spikes, and cannot produce percentiles." },
            { title: "Store min, max, sum, count (+ histogram or sketch)", tone: "ok", html: "Exact averages at any level from sum/count, exact extremes from min/max, and percentiles from merged histograms or sketches. A few more bytes per bucket." },
          ],
        },
        {
          type: "quiz",
          q: "You have per-minute p99 latency values stored for the last day. A manager asks for the daily p99. What is the correct answer?",
          options: [
            "The average of the 1,440 per-minute p99 values",
            "The maximum of the per-minute p99 values",
            "It cannot be computed exactly from those values; you need per-minute histograms or sketches to merge",
            "The median of the per-minute p99 values",
          ],
          answer: 2,
          explain: "Percentiles are not decomposable. Minutes with very different traffic contribute very differently to the daily distribution, and the per-minute p99 discards that information. Keep histogram bucket counts or a mergeable sketch per minute, merge them for the day, and compute p99 from the result.",
        },
      ],
    },
    {
      id: "cardinality",
      title: "Cardinality: the assumption everything rests on",
      kicker: "Where it breaks",
      blocks: [
        {
          type: "problem",
          html: `<p>Every structure in this chapter and the last is sized per <strong>series</strong>: an entry in the tag index, a postings ID in several lists, an open chunk and buffer in memory. A TSDB is efficient when there are few series with many points each. Flip that ratio and the design collapses.</p>`,
        },
        {
          type: "text",
          html: `<p><strong>Cardinality</strong> is the number of distinct series. In the worst case it is the product of the distinct values of each tag: <span class="formula">series &le; |metric names| &times; |tag<sub>1</sub> values| &times; |tag<sub>2</sub> values| &times; ...</span>, limited in practice to combinations that actually occur. 1,000 hosts &times; 50 metrics is 50,000 series, which any TSDB handles comfortably.</p>
<p>Now take one request metric labelled by method (4 values), endpoint (25) and status code (5) across 200 pods: 4 &times; 25 &times; 5 &times; 200 = <strong>100,000 series</strong>. Add <code>user_id</code> for a million active users. Even if each user touches only three method-endpoint-status combinations, that is several million new series, and each new user creates more. At the lab's assumption of about 3 KB of memory per active series, 100,000 series is 300 MB; 10 million is 30 GB. Ingestion slows as the index grows, queries that match a label touch huge postings lists, and eventually the process runs out of memory.</p>`,
        },
        {
          type: "lab",
          id: "cardinality",
          caption: "Build up a fleet's series count tag by tag, then add one high-cardinality tag such as user_id or a per-deploy container ID and watch memory per node blow past the limit.",
        },
        {
          type: "table",
          title: "Tag or field?",
          headers: ["Value", "Distinct values", "Make it a..."],
          rows: [
            ["region, env, service", "Tens", "Tag"],
            ["host, pod name (stable)", "Hundreds to thousands", "Tag, with care"],
            ["Container ID that changes every deploy", "Grows forever", "Avoid as a tag; aggregate by service"],
            ["user_id, request_id, trace ID, email", "Millions or unbounded", "Field, log or trace, never a tag"],
          ],
        },
        {
          type: "text",
          html: `<p>Note the third row. A value does not need millions of distinct values at any moment to cause trouble; it only needs to keep producing new ones. Pod or container IDs that change on every deploy, or URL paths that include IDs (<code>/orders/98213</code>), create a steady stream of new short-lived series, called <strong>churn</strong>. Each one costs index space even after it stops receiving points, until its block ages out.</p>`,
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>"Let's add <code>user_id</code> as a label so we can debug per-user latency." The Prometheus documentation explicitly warns against labels with unbounded values such as user IDs or email addresses. Per-user questions belong in logs, traces or a column store, where high cardinality is cheap. Keep metric labels to things you would put on a dashboard's group-by menu.</p>`,
        },
        {
          type: "quiz",
          q: "A metric has labels service (20 values), endpoint (30 per service) and status (5). Someone adds a label for the client's IP address, with about 50,000 distinct IPs seen per day, each hitting about two endpoints. Roughly how many series does that metric have afterwards?",
          options: [
            "About 3,000, unchanged",
            "About 3,050",
            "Hundreds of thousands, and growing as new IPs appear",
            "Exactly 50,000",
          ],
          answer: 2,
          explain: "Before, at most 20 &times; 30 &times; 5 = 3,000 series. Each IP now creates its own series for every endpoint and status combination it produces: 50,000 IPs &times; 2 endpoints &times; at least one status is 100,000 or more series per day, with new IPs adding churn indefinitely. That is the classic cardinality explosion.",
        },
      ],
    },
    {
      id: "where-tsdbs-break",
      title: "Where TSDBs break, and what to use instead",
      kicker: "Choosing a tool",
      blocks: [
        {
          type: "text",
          html: `<p>A TSDB's advantages come from its assumptions: append-only writes, regular points, low cardinality, queries over a few series. Each assumption has a matching workload that breaks it.</p>
<ul>
<li><strong>Ranking across millions of entities</strong> (top products, trending hashtags) needs to scan and sort huge numbers of series.</li>
<li><strong>Per-user or per-request analytics</strong> needs high-cardinality identifiers as filterable columns.</li>
<li><strong>Joins with relational data</strong> (metrics plus customer plans plus billing) are awkward or impossible in most TSDBs.</li>
<li><strong>Frequent updates to old points</strong> fight immutable compressed blocks.</li>
</ul>`,
        },
        {
          type: "compare",
          title: "The landscape",
          items: [
            { title: "Prometheus", tone: "ok", html: "Pull-based monitoring with a local TSDB (2-hour blocks), PromQL and alerting. The default for service metrics with low-cardinality labels. Long-term storage and global views via Thanos, Cortex, Mimir or VictoriaMetrics." },
            { title: "InfluxDB", tone: "info", html: "A purpose-built TSDB with line-protocol ingestion and its own query languages; version 3 rebuilt the engine on Arrow, DataFusion and Parquet with a stated goal of handling higher cardinality." },
            { title: "TimescaleDB", tone: "info", html: "A Postgres extension: hypertables, columnar compression and continuous aggregates with full SQL and joins. The natural choice if you already run Postgres." },
            { title: "ClickHouse, Druid", tone: "warn", html: "Column-oriented analytic stores. Not TSDBs in the narrow sense, but excellent for high-cardinality event data: billions of rows with user IDs, filtered and aggregated quickly." },
          ],
        },
        {
          type: "table",
          title: "Matching workloads to tools",
          headers: ["Workload", "Good fit", "Why"],
          rows: [
            ["Service CPU, latency, error rates", "Prometheus (plus long-term store)", "Low-cardinality labels, alerting built in"],
            ["Sensor data next to device and customer tables", "TimescaleDB", "SQL joins, Postgres operations"],
            ["Per-user request analytics", "ClickHouse or Druid", "High-cardinality columns are cheap"],
            ["Real-time top-K trending items", "Stream processing (Flink, Kafka Streams) with sketches", "Aggregates across millions of keys as events arrive"],
          ],
        },
        {
          type: "tradeoffs",
          prosLabel: "When a TSDB is the right call",
          consLabel: "When it is not",
          pros: [
            "Very high write rates of regular, append-only points",
            "Queries over recent ranges of a modest number of series",
            "Retention, compression and downsampling handled by the engine",
          ],
          cons: [
            "Identifiers with millions of values must be filterable",
            "Ranking or sorting across huge numbers of entities",
            "Joins with relational data or updates to historical points",
          ],
        },
      ],
    },
    {
      id: "interview",
      title: "Using it in a design interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "text",
          html: `<p>After you have sketched the write path for a metrics system, interviewers typically probe the read side: how does a dashboard query stay fast, how do you keep a year of data, and what happens when someone adds a bad label. Have a crisp answer for each.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>A strong answer covers:</p>
<ol>
<li><strong>Query path:</strong> pick partitions by time, intersect postings lists in the tag index to find series, seek to their chunks, decompress and aggregate while streaming.</li>
<li><strong>Pruning:</strong> block min/max metadata and Bloom filters skip files that cannot match.</li>
<li><strong>Downsampling:</strong> raw for a day or a week, then 1-minute, 5-minute and 1-hour rollups, roughly 100x fewer points over a year.</li>
<li><strong>Rollup contents:</strong> min, max, sum and count; histograms or sketches for percentiles, because percentiles do not roll up.</li>
<li><strong>Cardinality:</strong> memory scales with series, so identifiers such as user_id go in logs, traces or a column store, never in tags.</li>
</ol>`,
        },
        {
          type: "text",
          html: `<p>If the interviewer asks for per-user analytics on the same data, do not stretch the TSDB. Say that the requirement breaks the low-cardinality assumption and propose sending the raw events to a column store such as ClickHouse alongside the service metrics in Prometheus.</p>`,
        },
        {
          type: "quiz",
          q: "A dashboard shows the hourly average of request latency, computed by averaging the per-minute averages stored in a rollup table. Traffic varies a lot within each hour. What should you change?",
          options: [
            "Nothing; averaging averages is exact",
            "Store sum and count per minute and compute the hourly average as total sum divided by total count",
            "Switch to median instead of mean",
            "Increase the rollup resolution to 10 seconds",
          ],
          answer: 1,
          explain: "When minutes have different request counts, a plain average of averages over-weights quiet minutes. Sum and count roll up exactly, so the hourly average is the sum of the minute sums divided by the sum of the minute counts.",
        },
      ],
    },
  ],
  takeaways: [
    "TSDB queries search series, not points: an in-memory inverted index maps tag values to postings lists, and intersecting them finds the series to read.",
    "Time partitions, Bloom filters and block min/max metadata prune files and chunks before anything is decompressed.",
    "Downsampling into tiered rollups (raw, 1 minute, 5 minutes, 1 hour) cuts a year of points per series by about 100x and makes long-range dashboards cheap.",
    "Rollups must keep min, max, sum and count: averages of averages are wrong and averages hide spikes.",
    "Percentiles do not roll up; keep histogram buckets or mergeable sketches such as t-digest or DDSketch.",
    "Memory scales with the number of series. High-cardinality or churning tags (user_id, request IDs, per-deploy container IDs) are the classic way to take a TSDB down.",
    "For per-user analytics, ranking or joins, use a column store, stream processing or Postgres instead of stretching a TSDB.",
  ],
  furtherReading: [
    { title: "Prometheus documentation: instrumentation best practices", url: "https://prometheus.io/docs/practices/instrumentation/", note: "Guidance on labels and why high-cardinality values do not belong in them." },
    { title: "Prometheus storage documentation", url: "https://prometheus.io/docs/prometheus/latest/storage/", note: "Block layout, index, compaction and retention." },
    { title: "DDSketch: A Fast and Fully-Mergeable Quantile Sketch with Relative-Error Guarantees (Masson, Rim, Lee, VLDB 2019)", note: "How a mergeable sketch keeps percentiles accurate across rollups." },
    { title: "TimescaleDB documentation: continuous aggregates", note: "Incrementally refreshed rollups with their own retention." },
  ],
};
