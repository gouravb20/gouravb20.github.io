// Main tab: Chapter 9, Time series databases: the read path, rollups and where they break. Format: DeepSection[] in public/shared/notes.d.ts.
window.MAIN = window.MAIN || {};
MAIN.ch9 = [
  {
    id: `read-path`,
    title: `Reads never search raw rows`,
    kicker: `Mental model`,
    blocks: [
      { type: `text`, html: `<p>A TSDB stays fast on reads by narrowing twice before it decompresses anything: first by <strong>time</strong>, then by <strong>series</strong>. Time partitions rule out most files immediately. An in-memory <strong>tag index</strong>, an inverted index from each tag value to the list of series that carry it, rules out most series. Only then does the engine read the few compressed blocks that can contain the answer, and it aggregates while it streams through them.</p>` },
      { type: `steps`, title: `Answering "average CPU for prod hosts in us-west, last hour"`, items: [
        `<strong>Pick partitions:</strong> only those overlapping the last hour.`,
        `<strong>Resolve series:</strong> look up region=us-west and env=prod in the tag index and intersect the two series lists. The us-east series are never touched.`,
        `<strong>Prune files and blocks:</strong> each file's index locates the series' blocks; Bloom filters skip files that don't contain a series; block metadata (min and max timestamp) skips blocks outside the range.`,
        `<strong>Read and aggregate:</strong> decompress just those blocks plus recent points still in memory, and compute the average as the points stream past.`,
      ] },
      { type: `text`, html: `<p>This is the same idea as a search engine's term index, applied to series instead of documents. It also explains the chapter's main risk: the tag index lives in memory, and its size grows with the number of series.</p>` },
    ],
  },
  {
    id: `rollups`,
    title: `Rollups for long time ranges`,
    kicker: `Downsampling`,
    blocks: [
      { type: `text`, html: `<p>A dashboard showing a year of 10-second data for one series would read over 3 million points to draw a few hundred pixels. <strong>Downsampling</strong> fixes this: background jobs compute coarser summaries as data ages, and queries read the coarsest level that still answers them. A common policy keeps raw 10-second points for a day, 1-minute rollups for a week, 5-minute rollups for a month and 1-hour rollups for a year. One hour-level series is 24 points a day instead of 8,640, a 360-fold reduction.</p>` },
      { type: `callout`, tone: `mistake`, title: `Don't store only the average`, html: `<p>Averages of averages are wrong when the buckets hold different numbers of samples. Suppose one minute saw 10 requests averaging 100 ms and the next saw 1,000 requests averaging 20 ms. The average of the two averages is 60 ms; the true average is about 21 ms. Averages also hide spikes: 20 seconds of CPU at 100% inside five minutes at 25% shows up as a 30% average, and the alert never fires.</p>` },
      { type: `keypoints`, title: `What each rollup bucket should keep`, items: [
        `<strong>sum and count</strong>, so the correct average can be computed at any coarser level.`,
        `<strong>min and max</strong>, so spikes and dips survive.`,
        `<strong>Histogram buckets or a mergeable sketch</strong> (t-digest, DDSketch) for latency. A p99 cannot be computed from the p99s of smaller windows, but histograms and sketches merge.`,
      ] },
      { type: `callout`, tone: `interview`, title: `Treat retention as a negotiation`, html: `<p>If the requirement says "10-second data for a year", estimate the size and propose full resolution for a week plus rollups afterwards, then confirm that still serves the use case. Spotting the cost and offering an alternative reads as senior judgement, even if the interviewer keeps the original requirement.</p>` },
    ],
  },
  {
    id: `cardinality`,
    title: `Cardinality: the assumption everything rests on`,
    kicker: `Where it breaks`,
    blocks: [
      { type: `text`, html: `<p><strong>Cardinality</strong> is the number of distinct series: the combinations of tag values that actually occur together. The tag index and the per-series write buffers grow with it, regardless of how many points each series has.</p>
<p><strong>Worked example.</strong> 200 services, 20 endpoints each, 5 status codes and 3 regions gives at most 60,000 series, which any TSDB handles comfortably. Now add a user_id tag for a million active users. Even if each user touches only ten of those combinations, that is 10 million series, most of them holding a handful of points. The index outgrows memory, ingestion slows, and queries that used to scan a few thousand series now scan millions. This is the classic way to take down a Prometheus or InfluxDB deployment.</p>` },
      { type: `table`, title: `Tag or not?`, headers: [`Value`, `Distinct values`, `Treatment`], rows: [
        [`region, env, service, status code`, `Tens`, `Tag`],
        [`Stable host or pod name`, `Thousands`, `Tag, with care`],
        [`Container ID that changes every deploy`, `Grows forever`, `Avoid; aggregate by service instead`],
        [`user_id, request_id, trace ID`, `Millions and up`, `Never a tag; use a field, logs or traces`],
      ] },
    ],
  },
  {
    id: `choosing-the-store`,
    title: `Matching the workload to the tool`,
    kicker: `Decision rule`,
    blocks: [
      { type: `text`, html: `<p>A TSDB is the right tool exactly when the assumptions hold: low cardinality, append-only, regular data, and queries over a few series at a time. When they fail, pick something else and say why.</p>` },
      { type: `table`, headers: [`Need`, `Good fit`, `Reason`], rows: [
        [`Service and infrastructure metrics with alerting`, `Prometheus, or a managed equivalent`, `Low-cardinality labels, recent-range queries, built-in rollup and alert rules`],
        [`Time series next to relational data you already keep in Postgres`, `TimescaleDB`, `Partitions, compression and continuous aggregates without a new system`],
        [`Per-user or per-request event analytics`, `ClickHouse or Druid`, `Column stores handle high-cardinality columns and aggregate billions of rows`],
        [`Top-K ranking across millions of items`, `Streaming aggregation with sketches, or an OLAP store`, `A TSDB would scan millions of series and explode cardinality`],
      ] },
      { type: `callout`, tone: `interview`, title: `What to say`, html: `<p>"Queries resolve series through the in-memory tag index and only read blocks in the time range. For long ranges I'd keep rollups that store min, max, sum and count, plus histograms for percentiles. I'll keep tags low-cardinality; anything per user goes to logs or a column store, because a user_id tag would multiply the series count and break the index."</p>` },
    ],
  },
];
