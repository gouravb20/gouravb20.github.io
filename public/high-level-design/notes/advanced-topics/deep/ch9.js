// Deep dive: Chapter 9, Time series databases: the read path, rollups and where they break. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch9 = {
  hook: `<p>This chapter covers the read side of a time series database: the index that finds a few series among millions, the rollups that make long ranges affordable, what a rollup must store to stay correct, and the low-cardinality assumption everything depends on.</p>`,
  sections: [
    {
      id: "read-path",
      title: "The read path: from tags to blocks",
      kicker: "The read path",
      blocks: [
        {
          type: "text",
          html: `<p>A TSDB never searches points. It searches <em>series</em> through an in-memory <strong>inverted index</strong>: for each <code>key=value</code> tag, a sorted <strong>postings list</strong> of series IDs. Then it reads only those series' compressed chunks.</p>`,
        },
        {
          type: "steps",
          title: "Answering \"average CPU for prod hosts in us-west, last hour\"",
          items: [
            "<strong>Pick partitions</strong> overlapping the last hour: usually the in-memory head plus at most one block.",
            "<strong>Resolve series</strong> by intersecting the postings lists for <code>region=us-west</code>, <code>env=prod</code> and the metric name (a linear merge).",
            "<strong>Locate chunks</strong> through each block's series-to-offset index.",
            "<strong>Decompress and aggregate while streaming</strong> into a running sum and count.",
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
          type: "keypoints",
          items: [
            "A Bloom filter's \"no\" safely skips a file; \"maybe\" means check the real index. About 9.6 bits per series gives 1% false positives (1.2 MB per million series). LSM stores like Cassandra and RocksDB use one per file; ClickHouse uses min/max per granule.",
            "Prometheus block indexes hold postings per label pair, evaluated by intersecting (and subtracting) lists. InfluxDB's disk-backed TSI removed the RAM bound on series count, easing but not eliminating cardinality pain.",
          ],
        },
      ],
    },
    {
      id: "downsampling",
      title: "Downsampling: rollups for long ranges",
      kicker: "Long-range queries",
      blocks: [
        {
          type: "idea",
          html: `<p>Raw 10-second data is 8,640 points per series per day, far more than a screen's thousand pixels can show. <strong>Downsample</strong> older data into coarser buckets, keep each resolution for a different time, and let long-range queries read rollups.</p>`,
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
          type: "keypoints",
          items: [
            "<strong>Storage:</strong> a year of raw data is about 3.15 million points per series; under this policy about 32,000, roughly 99x fewer points (about 30x fewer bytes, since buckets hold four numbers: ~4.7 MB to ~0.15 MB).",
            "<strong>Reads:</strong> a 30-day panel at 1-hour resolution reads 720 points per series instead of 259,200.",
            "TimescaleDB continuous aggregates refresh incrementally with their own retention; Prometheus doesn't downsample (recording rules precompute expressions) but Thanos downsamples to 5-minute and 1-hour during compaction; Druid can roll up at ingestion.",
          ],
        },
        {
          type: "lab",
          id: "downsampling",
          caption: "Choose how long to keep raw points and each rollup, and see storage and points read for a dashboard query. The bottom chart shows a 30-second CPU spike inside an hour and what each rollup level reports for it.",
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
          html: `<p>Rollups are a requirements negotiation. For "keep 10-second data for a year", do the multiplication out loud and propose full resolution for a week, then rollups, checking it serves alerting and capacity planning.</p>`,
        },
      ],
    },
    {
      id: "rollup-math",
      title: "What a rollup must keep",
      kicker: "Getting the numbers right",
      blocks: [
        {
          type: "keypoints",
          items: [
            "<strong>Averages of averages lie:</strong> 10 requests at 100 ms and 990 at 10 ms average to 55 ms by averaging averages, but the truth is <strong>10.9 ms</strong>. Store <strong>sum and count</strong>; <code>average = &Sigma;sum / &Sigma;count</code> is exact at any level.",
            "<strong>Averages hide spikes:</strong> 20% CPU with a 30-second spike to 100% averages to <strong>28%</strong> over 5 minutes, so a 90% alert never fires. Keep <strong>min and max</strong>; max of maxes stays exact.",
          ],
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
          html: `<p><strong>Percentiles don't roll up at all:</strong> no formula combines minute p99s into an hourly p99. Keep a mergeable distribution: <strong>histogram buckets</strong> (counts per latency range add across time and hosts; Prometheus uses cumulative <code>le</code> buckets) or <strong>sketches</strong> such as t-digest or DDSketch (Datadog, 2019).</p>`,
        },
        {
          type: "code",
          lang: "text",
          title: "PromQL: merge bucket counts per region first, estimate p99 last",
          code: `histogram_quantile(
  0.99,
  sum by (region, le) (rate(http_request_duration_seconds_bucket[5m]))
)`,
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
      title: "Cardinality, and where TSDBs break",
      kicker: "Where it breaks",
      blocks: [
        {
          type: "text",
          html: `<p>Every structure is sized per <strong>series</strong> (index entry, postings IDs, open chunk in memory), and cardinality can reach the product of tag values. Method (4) &times; endpoint (25) &times; status (5) &times; 200 pods is <strong>100,000 series</strong>; add <code>user_id</code> for a million users and it's several million. At about 3 KB per active series, 10 million series is 30 GB, and the process slows then runs out of memory.</p>`,
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
          type: "callout",
          tone: "mistake",
          html: `<p>"Add <code>user_id</code> as a label to debug per-user latency." Prometheus docs warn against unbounded label values. Also watch <strong>churn</strong>: per-deploy container IDs or paths like <code>/orders/98213</code> keep creating short-lived series that cost index space until their blocks age out.</p>`,
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
          type: "keypoints",
          items: [
            "TSDBs break on ranking across millions of entities, filterable per-user identifiers, joins with relational data and updates to old points.",
            "Prometheus long-term storage and global views come from Thanos, Cortex, Mimir or VictoriaMetrics; InfluxDB 3 rebuilt on Arrow, DataFusion and Parquet aiming at higher cardinality.",
          ],
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
      id: "interview",
      title: "Using it in a design interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "callout",
          tone: "interview",
          html: `<p>After the write path, expect probes on dashboards, a year of data and bad labels. A strong answer covers:</p>
<ol>
<li><strong>Query path:</strong> partitions by time, postings-list intersection to find series, seek to chunks, aggregate while streaming.</li>
<li><strong>Pruning:</strong> block min/max metadata and Bloom filters skip files that can't match.</li>
<li><strong>Downsampling:</strong> raw for a day or week, then 1-minute, 5-minute and 1-hour rollups, about 100x fewer points over a year.</li>
<li><strong>Rollup contents:</strong> min, max, sum and count; histograms or sketches for percentiles.</li>
<li><strong>Cardinality:</strong> memory scales with series, so user_id and similar go to logs, traces or a column store; per-user analytics means ClickHouse beside Prometheus, not a stretched TSDB.</li>
</ol>`,
        },
      ],
    },
  ],
  takeaways: [
    "TSDB queries search series, not points: intersect postings lists from an in-memory tag index, then read only those chunks; time partitions, Bloom filters and min/max metadata prune the rest.",
    "Tiered rollups (raw, 1 minute, 5 minutes, 1 hour) cut a year of points per series by about 100x.",
    "Rollups must keep min, max, sum and count, because averages of averages are wrong and averages hide spikes.",
    "Percentiles don't roll up; keep histogram buckets or mergeable sketches such as t-digest or DDSketch.",
    "Memory scales with series count: high-cardinality or churning tags take TSDBs down, and per-user analytics, ranking or joins belong in a column store, stream processing or Postgres.",
  ],
  furtherReading: [
    { title: "Prometheus documentation: instrumentation best practices", url: "https://prometheus.io/docs/practices/instrumentation/", note: "Guidance on labels and why high-cardinality values do not belong in them." },
    { title: "Prometheus storage documentation", url: "https://prometheus.io/docs/prometheus/latest/storage/", note: "Block layout, index, compaction and retention." },
    { title: "DDSketch: A Fast and Fully-Mergeable Quantile Sketch with Relative-Error Guarantees (Masson, Rim, Lee, VLDB 2019)", note: "How a mergeable sketch keeps percentiles accurate across rollups." },
    { title: "TimescaleDB documentation: continuous aggregates", note: "Incrementally refreshed rollups with their own retention." },
  ],
};
