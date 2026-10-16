// Deep dive: Chapter 8, Time series databases: the write path. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch8 = {
  hook: `<p>This chapter covers how time series databases ingest tens of thousands of points per second cheaply: grouping by series, LSM-style append-only writes, compression to under 2 bytes per point, and time partitions that make retention a file delete.</p>`,
  sections: [
    {
      id: "workload-and-model",
      title: "The workload and the series data model",
      kicker: "The problem",
      blocks: [
        {
          type: "keypoints",
          title: "The shape of the workload (every TSDB technique exploits one of these)",
          items: [
            "<strong>Writes are huge, steady and append-only</strong>, roughly in time order, almost never updated.",
            "<strong>Reads target recent time ranges of a few series</strong>, usually aggregated.",
            "<strong>Old data is cold</strong> and deleted in bulk by age.",
            "<strong>Adjacent points look alike:</strong> evenly spaced timestamps, slowly changing values.",
          ],
        },
        {
          type: "text",
          html: `<p>Example: 100,000 servers &times; 5 metrics every 10 seconds is <strong>50,000 points per second</strong>, 4.32 billion a day, each with 16 bytes of information. A Postgres row adds a 24-byte tuple header, a 4-byte line pointer, repeated host and metric strings and B-tree entries: <strong>50-100 bytes</strong> per point, around 300 GB of table a day.</p>`,
        },
        {
          type: "table",
          title: "Bytes per point, from naive to specialized",
          headers: ["Storage", "Bytes per point", "Where the bytes go"],
          rows: [
            ["Postgres row (time, host, metric, value)", "50-100", "Tuple header, repeated strings, index entries"],
            ["Raw pair (int64 timestamp, float64 value)", "16", "Nothing wasted, nothing compressed"],
            ["Delta + variable-length integers", "~3-6", "Small differences stored in fewer bytes"],
            ["Gorilla (delta-of-delta + XOR)", "~1.4-3", "About one bit per regular timestamp, short XOR blocks for values"],
          ],
        },
        {
          type: "text",
          html: `<p>A point has a <strong>measurement</strong> (<code>cpu_usage</code>), indexed <strong>tags</strong> or labels (<code>host=web-1</code>), unindexed <strong>fields</strong> (<code>value=45.2</code>) and a <strong>timestamp</strong>. A <strong>series</strong> is one measurement plus one tag set; the engine stores tags once per series and appends (timestamp, value) pairs to it.</p>`,
        },
        {
          type: "code",
          lang: "text",
          title: "InfluxDB line protocol: three points, two series",
          code: `# measurement,tag_set field_set timestamp(ns)
cpu_usage,host=web-1,region=us-west value=45.2 1700000000000000000
cpu_usage,host=web-1,region=us-west value=45.3 1700000010000000000
cpu_usage,host=web-2,region=us-west value=12.0 1700000000000000000`,
        },
        {
          type: "diagram",
          title: "Row per point versus grouped by series",
          caption: "Left: a relational table repeats the host and metric on every row. Right: a TSDB stores the series key once and keeps that series' timestamps and values together, which is also what makes them compress so well.",
          svg: `<svg viewBox="0 0 620 250" role="img" aria-label="Comparison of a row-per-point table with a series-grouped layout">
<rect x="10" y="10" width="290" height="230" rx="10" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<rect x="320" y="10" width="290" height="230" rx="10" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="24" y="36" font-size="13" font-weight="700">One row per point</text>
<text x="334" y="36" font-size="13" font-weight="700">Grouped by series</text>
<g font-size="12" style="fill: var(--dg-muted)">
<text x="24" y="62">time</text><text x="100" y="62">host</text><text x="160" y="62">metric</text><text x="230" y="62">value</text>
</g>
<g style="fill: var(--dg-bad-soft)">
<rect x="96" y="70" width="110" height="20" rx="3"/><rect x="96" y="94" width="110" height="20" rx="3"/><rect x="96" y="118" width="110" height="20" rx="3"/><rect x="96" y="142" width="110" height="20" rx="3"/>
</g>
<g font-size="12">
<text x="24" y="85">10:00:00</text><text x="100" y="85">web-1</text><text x="160" y="85">cpu</text><text x="230" y="85">45.2</text>
<text x="24" y="109">10:00:10</text><text x="100" y="109">web-1</text><text x="160" y="109">cpu</text><text x="230" y="109">45.3</text>
<text x="24" y="133">10:00:20</text><text x="100" y="133">web-1</text><text x="160" y="133">cpu</text><text x="230" y="133">45.1</text>
<text x="24" y="157">10:00:30</text><text x="100" y="157">web-1</text><text x="160" y="157">cpu</text><text x="230" y="157">45.1</text>
</g>
<text x="24" y="192" font-size="12" style="fill: var(--dg-muted)">Header + repeated strings +</text>
<text x="24" y="209" font-size="12" style="fill: var(--dg-muted)">an index entry on every row</text>
<text x="24" y="230" font-size="12" font-weight="700" style="fill: var(--dg-bad)">50-100 B per point</text>
<rect x="334" y="50" width="262" height="26" rx="5" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="346" y="68" font-size="12" font-weight="700">series: cpu {host=web-1}</text>
<text x="334" y="104" font-size="12" style="fill: var(--dg-muted)">times</text>
<text x="334" y="144" font-size="12" style="fill: var(--dg-muted)">values</text>
<g style="fill: var(--dg-1-soft); stroke: var(--dg-1)">
<rect x="384" y="88" width="66" height="24" rx="3"/><rect x="454" y="88" width="44" height="24" rx="3"/><rect x="502" y="88" width="44" height="24" rx="3"/><rect x="550" y="88" width="44" height="24" rx="3"/>
<rect x="384" y="128" width="66" height="24" rx="3"/><rect x="454" y="128" width="44" height="24" rx="3"/><rect x="502" y="128" width="44" height="24" rx="3"/><rect x="550" y="128" width="44" height="24" rx="3"/>
</g>
<g font-size="12" text-anchor="middle">
<text x="417" y="105">10:00:00</text><text x="476" y="105">+10</text><text x="524" y="105">+10</text><text x="572" y="105">+10</text>
<text x="417" y="145">45.2</text><text x="476" y="145">45.3</text><text x="524" y="145">45.1</text><text x="572" y="145">45.1</text>
</g>
<text x="334" y="192" font-size="12" style="fill: var(--dg-muted)">Tags stored once; similar</text>
<text x="334" y="209" font-size="12" style="fill: var(--dg-muted)">neighbours compress well</text>
<text x="334" y="230" font-size="12" font-weight="700" style="fill: var(--dg-ok)">~1.4-3 B per point</text>
</svg>`,
        },
        {
          type: "callout",
          tone: "warning",
          title: "Do not reach for a TSDB too early",
          html: `<p>Timestamps alone aren't a reason for a new database. Postgres with time partitioning, batched inserts and a BRIN index goes far, and TimescaleDB further. TSDBs are <em>worse</em> for ranking across millions of entities, joins or updating old points. And keep high-cardinality values (user IDs, request IDs) out of tags: each distinct value creates a series (next chapter).</p>`,
        },
      ],
    },
    {
      id: "append-and-lsm",
      title: "Append-only writes and the storage engine",
      kicker: "The write path",
      blocks: [
        {
          type: "idea",
          html: `<p>Never update in place. Log each write sequentially, buffer recent points in memory by series, flush them as immutable compressed sorted blocks, and merge blocks in the background: the LSM pattern, specialized for series. Sequential appends sustain far more throughput than random page updates.</p>`,
        },
        {
          type: "diagram",
          title: "The TSDB write path",
          caption: "Each incoming point is appended to the write-ahead log and added to an in-memory buffer organized by series. The buffer is periodically flushed into immutable compressed blocks, which background compaction merges into larger blocks.",
          svg: `<svg viewBox="0 0 620 260" role="img" aria-label="Write path: points go to a WAL and an in-memory buffer, then flush to immutable blocks that are compacted">
<defs><marker id="at8-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="20" y="105" width="110" height="50" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<text x="75" y="126" text-anchor="middle" font-size="12" font-weight="700">Incoming</text>
<text x="75" y="143" text-anchor="middle" font-size="12" font-weight="700">points</text>
<rect x="180" y="30" width="160" height="50" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="260" y="52" text-anchor="middle" font-size="12" font-weight="700">Write-ahead log</text>
<text x="260" y="69" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">disk, append-only</text>
<text x="260" y="104" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">replayed after a crash</text>
<rect x="180" y="170" width="160" height="60" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="260" y="195" text-anchor="middle" font-size="12" font-weight="700">In-memory buffer</text>
<text x="260" y="212" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">grouped by series</text>
<rect x="410" y="170" width="190" height="60" rx="8" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/>
<text x="505" y="195" text-anchor="middle" font-size="12" font-weight="700">Immutable blocks</text>
<text x="505" y="212" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">compressed chunks + index</text>
<rect x="410" y="30" width="190" height="50" rx="8" style="fill: var(--dg-5-soft); stroke: var(--dg-5)"/>
<text x="505" y="52" text-anchor="middle" font-size="12" font-weight="700">Compaction</text>
<text x="505" y="69" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">merges small blocks</text>
<path d="M130 118 L155 118 L155 55 L178 55" fill="none" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#at8-arrow)"/>
<path d="M130 142 L155 142 L155 200 L178 200" fill="none" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#at8-arrow)"/>
<line x1="340" y1="200" x2="408" y2="200" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#at8-arrow)"/>
<text x="374" y="192" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">flush</text>
<line x1="505" y1="168" x2="505" y2="82" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#at8-arrow)"/>
<text x="515" y="130" font-size="12" style="fill: var(--dg-muted)">background</text>
</svg>`,
        },
        {
          type: "steps",
          title: "What happens to one point",
          items: [
            "<strong>Append to the WAL</strong>, batching many points per fsync, so it survives a crash.",
            "<strong>Insert into the in-memory buffer</strong> under its series; recent queries read from here.",
            "<strong>Flush</strong> to an immutable block of per-series compressed chunks plus a series-to-offset index; discard that WAL range.",
            "<strong>Compact</strong> small blocks into larger ones, applying deletions and keeping file counts low. Reading a series is an index lookup plus one chunk.",
          ],
        },
        {
          type: "keypoints",
          items: [
            "<strong>Prometheus:</strong> an in-memory head block with a WAL in 128 MB segments, written out as 2-hour block directories that compaction merges.",
            "<strong>InfluxDB 1.x/2.x:</strong> WAL and cache flush to TSM files compacted in levels; InfluxDB 3 moved to Arrow, DataFusion and Parquet.",
            "<strong>TimescaleDB:</strong> ordinary Postgres chunks; older chunks convert to compressed columnar form grouped by a <code>segmentby</code> column such as host.",
            "<strong>Costs:</strong> reads may check the buffer and several files, compaction rewrites data (write amplification), and late or out-of-order points need special handling.",
          ],
        },
      ],
    },
    {
      id: "compression",
      title: "Compression: from 16 bytes to under 2",
      kicker: "How it works",
      blocks: [
        {
          type: "text",
          html: `<p>Grouped series have regular timestamps and close values, so store <em>differences</em> in as few bits as they need. Plain deltas plus <strong>varints</strong> (7 data bits per byte) turn a 10,000 ms gap into 2 bytes. Gorilla (Facebook, 2015) goes further with delta-of-delta timestamps and XOR-encoded floats.</p>`,
        },
        {
          type: "table",
          title: "Gorilla's delta-of-delta encoding",
          headers: ["Delta-of-delta D", "Bits written", "Total bits"],
          rows: [
            ["0", "0", "1"],
            ["-63 to 64", "10 + 7-bit value", "9"],
            ["-255 to 256", "110 + 9-bit value", "12"],
            ["-2047 to 2048", "1110 + 12-bit value", "16"],
            ["anything else", "1111 + 32-bit value", "36"],
          ],
          note: "Each block header stores a full starting timestamp, and the first delta is stored in 14 bits.",
        },
        {
          type: "keypoints",
          items: [
            "<strong>Timestamps:</strong> gaps 10, 10, 11, 9 give deltas-of-deltas 0, +1, &minus;2: 1 + 9 + 9 = 19 bits for three timestamps. A perfectly regular scrape costs 1 bit instead of 64.",
            "<strong>Values:</strong> XOR each float's 64 bits with the previous one. Identical values cost 1 bit; close values share sign, exponent and leading mantissa, so only the short meaningful block is stored. 12.0 then 15.5 XOR to 13 leading zeros, 3 meaningful bits, 48 trailing: 16 bits instead of 64.",
            "Gorilla reports about <strong>1.37 bytes per point</strong> (about 12x); Prometheus uses Gorilla-style XOR chunks at about 1-2 bytes per sample; TimescaleDB applies delta-of-delta and XOR per column.",
          ],
        },
        {
          type: "lab",
          id: "tsCompression",
          caption: "Two hours of one series at about 10-second intervals. Add timestamp jitter and value noise and watch the real bit counts: regular timestamps cost 1 bit, unchanged values 1 bit, noisy values far more.",
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>Ratios depend on the data: a rarely changing gauge compresses to almost nothing, a noisy full-precision float keeps most mantissa bits. Measure bytes per point on real samples, and round values to the precision you need (two decimals for CPU %) to help XOR compression.</p>`,
        },
        {
          type: "quiz",
          q: "A series reports the exact same value, 0.0, every 10 seconds with perfectly regular timestamps. Under Gorilla encoding, roughly how many bits does each new point cost after the first few?",
          options: ["About 128 bits", "About 64 bits", "About 2 bits", "About 16 bits"],
          answer: 2,
          explain: "The delta-of-delta of a regular timestamp is 0, stored as one bit, and an unchanged value XORs to 0, also one bit. Two bits per point, versus 128 bits for a raw timestamp and float.",
        },
      ],
    },
    {
      id: "time-partitioning",
      title: "Time partitioning and retention by dropping files",
      kicker: "Lifecycle",
      blocks: [
        {
          type: "text",
          html: `<p>Deleting expired rows from one big table means billions of index-maintained deletes plus vacuum, competing with ingest. At an assumed 50,000 deletes per second, one day's 4.32 billion points takes 86,400 seconds: <strong>a full day</strong>. Instead, store each window (say a day) as its own partition: writes hit the current one, queries prune by range, and retention drops the oldest as one file operation.</p>`,
        },
        {
          type: "diagram",
          title: "A sliding window of daily partitions",
          caption: "With a 7-day retention, the oldest daily partition is dropped as a whole. All writes go to today's partition, and a query over the last two days opens only two partitions.",
          svg: `<svg viewBox="0 0 620 210" role="img" aria-label="Eight daily partitions with the oldest dropped and a seven-day retention window">
<line x1="92" y1="50" x2="590" y2="50" stroke-width="2" style="stroke: var(--dg-2)"/>
<line x1="92" y1="44" x2="92" y2="56" stroke-width="2" style="stroke: var(--dg-2)"/>
<line x1="590" y1="44" x2="590" y2="56" stroke-width="2" style="stroke: var(--dg-2)"/>
<text x="341" y="38" text-anchor="middle" font-size="12" font-weight="700">retention window: 7 days</text>
<rect x="20" y="70" width="66" height="60" rx="6" stroke-dasharray="5 4" stroke-width="1.5" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)"/>
<text x="53" y="96" text-anchor="middle" font-size="12">Day 1</text>
<text x="53" y="114" text-anchor="middle" font-size="12" font-weight="700" style="fill: var(--dg-bad)">DROP</text>
<g style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5">
<rect x="92" y="70" width="66" height="60" rx="6"/><rect x="164" y="70" width="66" height="60" rx="6"/><rect x="236" y="70" width="66" height="60" rx="6"/>
<rect x="308" y="70" width="66" height="60" rx="6"/><rect x="380" y="70" width="66" height="60" rx="6"/><rect x="452" y="70" width="66" height="60" rx="6"/>
</g>
<rect x="524" y="70" width="66" height="60" rx="6" stroke-width="3" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/>
<g font-size="12" text-anchor="middle">
<text x="125" y="105">Day 2</text><text x="197" y="105">Day 3</text><text x="269" y="105">Day 4</text>
<text x="341" y="105">Day 5</text><text x="413" y="105">Day 6</text><text x="485" y="105">Day 7</text>
</g>
<text x="557" y="92" text-anchor="middle" font-size="12" font-weight="700">Day 8</text>
<text x="557" y="108" text-anchor="middle" font-size="12">today:</text>
<text x="557" y="123" text-anchor="middle" font-size="12">writes</text>
<line x1="452" y1="146" x2="590" y2="146" stroke-width="2" style="stroke: var(--dg-3)"/>
<line x1="452" y1="140" x2="452" y2="152" stroke-width="2" style="stroke: var(--dg-3)"/>
<line x1="590" y1="140" x2="590" y2="152" stroke-width="2" style="stroke: var(--dg-3)"/>
<text x="521" y="170" text-anchor="middle" font-size="12">query: last 2 days</text>
<text x="20" y="160" font-size="12" style="fill: var(--dg-muted)">Oldest partition: deleted</text>
<text x="20" y="177" font-size="12" style="fill: var(--dg-muted)">as one file operation,</text>
<text x="20" y="194" font-size="12" style="fill: var(--dg-muted)">no row-by-row DELETE</text>
</svg>`,
        },
        {
          type: "lab",
          id: "timePartition",
          caption: "Compare one big table, where expired rows are deleted every day, with one partition per day, where the oldest partition is dropped. Change the ingest rate and retention and see how long each approach spends on deletion.",
        },
        {
          type: "keypoints",
          items: [
            "TimescaleDB hypertables use chunks (7 days by default, <code>chunk_time_interval</code>) with <code>add_retention_policy</code>; Prometheus deletes whole blocks (15-day default retention); InfluxDB drops expired shard groups.",
            "<strong>Sizing:</strong> the current partition and its indexes should fit in memory, and retention should be a small multiple of the partition size. Too small means thousands of files per long query.",
            "Partitions make tiering easy: recent on fast SSD, older compressed or on cheaper storage.",
          ],
        },
        {
          type: "code",
          lang: "sql",
          title: "Partitioning and retention in TimescaleDB",
          code: `CREATE TABLE metrics (
  time   timestamptz NOT NULL,
  host   text        NOT NULL,
  metric text        NOT NULL,
  value  double precision
);
SELECT create_hypertable('metrics', 'time', chunk_time_interval => INTERVAL '1 day');

ALTER TABLE metrics SET (timescaledb.compress, timescaledb.compress_segmentby = 'host, metric');
SELECT add_compression_policy('metrics', INTERVAL '2 days');   -- compress chunks older than 2 days
SELECT add_retention_policy('metrics', INTERVAL '7 days');     -- drop chunks older than 7 days`,
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
          html: `<p>Start from points per second, bytes per point and retention. A strong answer covers:</p>
<ol>
<li><strong>The numbers:</strong> 100,000 hosts &times; 5 metrics / 10 s = 50,000 points/s, about 4.3 billion a day.</li>
<li><strong>Why not a row per point:</strong> 50-100 bytes each, an index update per insert, and DELETE-based retention that can't keep up.</li>
<li><strong>The write path:</strong> WAL plus an in-memory buffer by series, flushed to immutable compressed blocks, compacted in the background.</li>
<li><strong>Compression:</strong> delta-of-delta and XOR, about 1.4 bytes per point, so a day is about 6 GB instead of hundreds.</li>
<li><strong>Time partitions:</strong> writes to the current one, range pruning, retention by dropping partitions.</li>
</ol>`,
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>The Top-K trap: "trending hashtags" has timestamps, but TSDBs read a <em>few</em> series over time, while Top-K ranks <em>millions</em> of items, and item IDs as tags explode the series count. Use streaming aggregation (Flink, Kafka Streams, count-min sketches) or a columnar OLAP store.</p>`,
        },
        {
          type: "quiz",
          q: "An interviewer proposes Postgres with one row per metric point and a nightly DELETE for 30-day retention, at 50,000 points per second. What is the most important problem to raise first?",
          options: [
            "Postgres cannot store floating-point numbers precisely",
            "Retention: each night must delete about 4.3 billion rows with index maintenance and vacuum, which competes with ingest; partition by time and drop old partitions instead",
            "Postgres does not support timestamps with time zones",
            "Reads will be slow because Postgres has no B-tree indexes",
          ],
          answer: 1,
          explain: "Storage per row and index cost on insert matter too, but the DELETE-based retention is the part that cannot scale: deleting a day of rows at realistic rates takes on the order of a day. Time partitioning (native Postgres partitioning or TimescaleDB chunks) turns retention into dropping a partition.",
        },
      ],
    },
  ],
  takeaways: [
    "Time series workloads are append-heavy, read recent ranges of a few series, delete old data in bulk and have similar neighbouring points; every TSDB technique exploits one of these.",
    "A row per point costs 50-100 bytes for 16 bytes of information; grouping by series stores tags once and keeps a series' points together.",
    "The write path is LSM-shaped: WAL, in-memory buffer by series, immutable compressed blocks, background compaction.",
    "Delta-of-delta timestamps and XOR floats (1 bit each when regular or unchanged) got Gorilla to about 1.37 bytes per point.",
    "Partition by time so retention is dropping a file; stretch Postgres first, and don't use a TSDB for ranking across millions of entities.",
  ],
  furtherReading: [
    { title: "Gorilla: A Fast, Scalable, In-Memory Time Series Database (Pelkonen et al., VLDB 2015)", note: "Describes the delta-of-delta timestamp and XOR value compression in detail, with measurements on Facebook's data." },
    { title: "Prometheus storage documentation", url: "https://prometheus.io/docs/prometheus/latest/storage/", note: "Head block, WAL, 2-hour blocks, compaction, retention and capacity planning." },
    { title: "TimescaleDB documentation: hypertables, compression and data retention", note: "How chunks, compression policies and retention policies work in Postgres." },
  ],
};
