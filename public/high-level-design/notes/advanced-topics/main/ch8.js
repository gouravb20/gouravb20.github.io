// Main tab: Chapter 8, Time series databases: the write path. Format: DeepSection[] in public/shared/notes.d.ts.
window.MAIN = window.MAIN || {};
MAIN.ch8 = [
  {
    id: `the-workload`,
    title: `A workload with strong assumptions`,
    kicker: `Mental model`,
    blocks: [
      { type: `text`, html: `<p>A time series database is not magic; it is a storage engine that bets heavily on the shape of its workload. Metrics, sensor readings and similar data share four traits, and every TSDB technique exploits at least one of them. When a workload breaks those traits, the specialised engine loses its advantage.</p>` },
      { type: `keypoints`, items: [
        `<strong>Append-only:</strong> new points arrive at the current time; old points are almost never updated.`,
        `<strong>Regular:</strong> each series reports at a fixed interval, and consecutive values change little.`,
        `<strong>Recent and narrow reads:</strong> queries ask for a time range over a few series, usually aggregated.`,
        `<strong>Ageing data:</strong> old data is read rarely and eventually deleted in bulk.`,
      ] },
      { type: `text`, html: `<p>The data model follows from this. A point has a <strong>measurement</strong> (cpu_usage), <strong>tags</strong> that identify where it came from (host=web-1, region=us-west), <strong>fields</strong> holding the measured values (value=45.2) and a <strong>timestamp</strong>. A <strong>series</strong> is one measurement with one specific combination of tag values. Tags are indexed and define series; fields are not. That split becomes critical on the read path.</p>` },
    ],
  },
  {
    id: `why-not-rows`,
    title: `Why one row per point breaks`,
    kicker: `Worked example`,
    blocks: [
      { type: `text`, html: `<p>Take 100,000 servers each reporting 5 metrics every 10 seconds. That is 50,000 points per second, or about 4.3 billion points a day.</p>` },
      { type: `table`, headers: [`Storage`, `Bytes per point`, `Per day`], rows: [
        [`Postgres row: timestamp, host, metric name, value`, `about 70`, `about 300 GB`],
        [`Raw pair: 8-byte timestamp, 8-byte float`, `16`, `about 70 GB`],
        [`TSDB compression (delta-of-delta and XOR)`, `about 1.5`, `about 6.5 GB`],
      ], note: `The row cost comes from the tuple header, repeated host and metric strings, and index entries.` },
      { type: `text`, html: `<p>Storage isn't the only problem. Each inserted row updates B-tree indexes with random I/O, and deleting last month's data is a DELETE over billions of rows followed by heavy vacuuming. A general-purpose table fails on write throughput and retention long before queries become the bottleneck.</p>` },
    ],
  },
  {
    id: `write-path`,
    title: `The write path: append, buffer, compress, flush`,
    kicker: `Storage engine`,
    blocks: [
      { type: `steps`, title: `What happens to one point`, items: [
        `<strong>WAL:</strong> the point is appended to a write-ahead log for durability. A sequential append, never a seek.`,
        `<strong>In-memory buffer:</strong> it is added to an in-memory structure grouped by series, so each series' recent points sit together.`,
        `<strong>Flush:</strong> when the buffer fills or a time window closes, each series' points are compressed into a block and written to a new immutable file, with an index at the end mapping series to blocks.`,
        `<strong>Compaction:</strong> background jobs merge small files into larger ones and drop deleted data. This is the LSM-tree pattern: fast sequential writes, paid for later with extra rewriting.`,
      ] },
      { type: `text`, html: `<p><strong>Compression is where the bytes go.</strong> Timestamps arriving every 10 seconds look like 1000, 1010, 1020, 1030, 1041. Their differences are 10, 10, 10, 11, and the differences of those differences are 0, 0, 1. Most are zero, and a zero can be stored in a single bit. For values, each float is XORed with the previous one: an unchanged value gives all zeros (one bit), and a slightly changed value differs only in a short run of middle bits, which is all that gets stored. Facebook's Gorilla scheme reported about 1.37 bytes per point on real metrics. Noisy or irregular data compresses much less, which is another way the workload's assumptions show up.</p>` },
    ],
  },
  {
    id: `time-partitions`,
    title: `Partition by time, delete by dropping files`,
    kicker: `Retention`,
    blocks: [
      { type: `text`, html: `<p>TSDBs group data into partitions by time window: one per day, or two-hour blocks in Prometheus, or chunks in TimescaleDB. Writes always go to the current partition, so the hot data stays in memory. A query for the last hour opens one partition and skips the rest. And retention becomes trivial: keeping seven days means deleting partitions older than seven days, which is a metadata change and a file delete rather than a scan of billions of rows.</p>` },
      { type: `tradeoffs`, prosLabel: `What the design buys`, consLabel: `What it costs`, pros: [
        `Sustained high write throughput from sequential appends`,
        `10 to 50 times less storage than row-per-point`,
        `Cheap retention and easy tiering of old partitions to cheaper storage`,
      ], cons: [
        `Reads may check several files until compaction merges them`,
        `Compaction uses disk bandwidth and CPU in the background`,
        `Updating or deleting individual old points is slow or unsupported`,
      ] },
      { type: `callout`, tone: `interview`, title: `Don't reach for one too early`, html: `<p>Having timestamps isn't a reason to choose a TSDB. Interviewers reward stretching what you already have, such as Postgres with time partitioning or TimescaleDB, and naming the specialised store only when the numbers demand it. Workloads that rank across millions of items, need joins, or update old data are often worse in a TSDB. A good line: "At 50,000 points a second with a short retention window, a TSDB's compression and partition drops pay off; at a few hundred points a second, a partitioned Postgres table is simpler."</p>` },
    ],
  },
];
