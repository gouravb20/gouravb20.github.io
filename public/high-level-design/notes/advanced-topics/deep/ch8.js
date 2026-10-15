// Deep dive: Chapter 8, Time series databases: the write path. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch8 = {
  hook: `<p>You are building monitoring for a fleet of 100,000 servers. Each reports 5 metrics (CPU, memory, disk, network in, network out) every 10 seconds. That is <strong>50,000 data points per second</strong>, 4.32 billion a day, every day, forever. Each point carries 16 bytes of real information: an 8-byte timestamp and an 8-byte float.</p>
<p>The first design stores each point as a row in Postgres: <code>(time, host, metric, value)</code>. By the end of the first week you have about 30 billion rows. Every insert updates a B-tree index with random I/O, each row costs several times its 16 bytes once you add headers, repeated strings and index entries, and the nightly job that deletes data older than a week runs for most of the day. None of this is Postgres misbehaving. It is a general-purpose engine being asked to do a very particular job, and time series databases exist because that job has a shape you can exploit.</p>`,
  sections: [
    {
      id: "the-workload",
      title: "What makes time series data different",
      kicker: "The problem",
      blocks: [
        {
          type: "problem",
          html: `<p>A general-purpose database is built for any mix of inserts, updates, deletes and lookups. Metrics and sensor data use almost none of that flexibility, but still pay for all of it: per-row overhead, index maintenance on every write, and expensive deletes when old data has to go.</p>`,
        },
        {
          type: "keypoints",
          title: "The shape of the workload",
          items: [
            "<strong>Writes are huge, steady and append-only.</strong> New points arrive in roughly time order and are almost never updated.",
            "<strong>Reads target recent time ranges of a few series</strong>, usually aggregated: average CPU of these hosts over the last hour.",
            "<strong>Old data is cold</strong>, read rarely, and eventually deleted in bulk by age.",
            "<strong>Adjacent points look alike.</strong> Timestamps are evenly spaced and values change slowly.",
          ],
        },
        {
          type: "text",
          html: `<p>Every technique in a time series database (TSDB) exploits one of those four facts. Append-only means sequential writes with no read-modify-write. Recent-range reads mean organizing by time. Bulk deletion by age means partitioning by time so retention is a file delete. And similarity between neighbours means compression that gets a 16-byte point down to one or two bytes.</p>
<h3>What a row-per-point table really costs</h3>
<p>In Postgres every row carries a tuple header of 23 bytes (padded to 24) plus a 4-byte line pointer in the page. Add the 8-byte timestamp, the 8-byte value, and the host and metric names repeated as text in every row, perhaps 25 bytes together, and you are near 70 bytes. A B-tree on <code>(host, metric, time)</code> adds another few tens of bytes per row. So 16 bytes of information costs roughly <strong>50-100 bytes</strong>, and at 4.32 billion points a day that is around 300 GB of table per day before indexes.</p>`,
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
          type: "callout",
          tone: "warning",
          title: "Do not reach for a TSDB too early",
          html: `<p>Having timestamps in your data is not a reason to add a new database. Postgres with time-based partitioning, batched inserts and a BRIN index (which stores min and max per block range and suits append-ordered data) handles a surprising load, and extensions such as TimescaleDB go much further. TSDBs can also be <em>worse</em> for workloads that rank across millions of entities, join with relational data, or update old points. In an interview, stretch the general-purpose option first and name the specialized tool when a concrete bottleneck appears.</p>`,
        },
        {
          type: "quiz",
          q: "Which property of metric data does delta-of-delta timestamp compression exploit?",
          options: [
            "Old data is read rarely",
            "Points arrive at regular intervals, so the gap between gaps is usually zero",
            "Most queries aggregate over many series",
            "Values are always integers",
          ],
          answer: 1,
          explain: "A series scraped every 10 seconds has gaps of 10, 10, 10... so the change in the gap is 0 almost every time, and a zero can be stored in a single bit. Time partitioning exploits cold old data; compression of values exploits slowly changing values.",
        },
      ],
    },
    {
      id: "data-model",
      title: "The data model: measurements, tags, fields and series",
      kicker: "Organizing by series",
      blocks: [
        {
          type: "text",
          html: `<p>TSDBs model a point in four parts. The <strong>measurement</strong> (or metric name) says what is measured: <code>cpu_usage</code>. <strong>Tags</strong> (Prometheus calls them labels) are indexed key-value metadata describing the source: <code>host=web-1</code>, <code>region=us-west</code>. <strong>Fields</strong> are the measured values: <code>value=45.2</code>. And the <strong>timestamp</strong> says when.</p>
<p>A <strong>series</strong> is one measurement plus one specific set of tag values. <code>cpu_usage{host=web-1, region=us-west}</code> is a series; the same metric on <code>web-2</code> is another. This is the central idea of the storage layout: the engine stores the tags <em>once per series</em>, then appends a long run of (timestamp, value) pairs to that series.</p>`,
        },
        {
          type: "code",
          lang: "text",
          title: "InfluxDB line protocol: one point per line",
          code: `# measurement,tag_set field_set timestamp(ns)
cpu_usage,host=web-1,region=us-west value=45.2 1700000000000000000
cpu_usage,host=web-1,region=us-west value=45.3 1700000010000000000
cpu_usage,host=web-2,region=us-west value=12.0 1700000000000000000`,
          caption: "Three points, two series. On disk, the tag set is stored once per series, not once per point.",
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
          type: "text",
          html: `<p>The split between tags and fields is a design decision with consequences. Tags are indexed and define series, so you filter and group by them cheaply. Fields are not indexed. Put something with millions of distinct values (a user ID, a request ID) in a tag and you create millions of series, which is the cardinality problem covered in the next chapter. Put something you filter by constantly in a field and every query scans more than it should.</p>`,
        },
        {
          type: "table",
          title: "The four parts of a point",
          headers: ["Part", "Example", "Indexed?", "Rule of thumb"],
          rows: [
            ["Measurement", "cpu_usage", "Yes", "Like a table name"],
            ["Tags", "host=web-1, region=us-west", "Yes", "Low-cardinality metadata you filter and group by"],
            ["Fields", "value=45.2", "No", "The measured numbers"],
            ["Timestamp", "1700000000", "Via time partitions", "Seconds or milliseconds is usually enough"],
          ],
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
          html: `<p>Never update in place. Log every write sequentially for durability, collect recent points in memory grouped by series, and periodically flush them as immutable, compressed, sorted files. Merge small files into bigger ones in the background. This is the log-structured merge (LSM) pattern, specialized for series.</p>`,
        },
        {
          type: "text",
          html: `<p>Updating data in place means finding the right page, reading it, modifying it and writing it back: random I/O for every write. Appending to the end of a file is sequential, and both spinning disks and SSDs sustain much higher throughput for sequential writes than for small random ones. An append-only design turns 50,000 points per second into a steady stream of large sequential writes.</p>`,
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
            "<strong>Append to the write-ahead log (WAL).</strong> A sequential write so the point survives a crash. Batching many points per fsync keeps this cheap.",
            "<strong>Insert into the in-memory buffer</strong>, under its series. Recent queries read straight from here.",
            "<strong>Flush.</strong> When the buffer covers enough time or memory, its series are compressed and written as an immutable block: per-series chunks of timestamps and values, plus an index from series to chunk offsets at the end of the file. The WAL up to that point can then be discarded.",
            "<strong>Compact.</strong> Background jobs merge small blocks into larger ones covering longer time ranges, apply deletions, and keep the number of files a query must open small.",
          ],
        },
        {
          type: "text",
          html: `<p>Because each block holds one series' points contiguously, reading a series over a time range is cheap: look up the series in the block's index, then read one compressed chunk. That is the read-side payoff of grouping by series on write.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Prometheus", title: "Head block, WAL, 2-hour blocks", html: "Recent samples live in an in-memory head block backed by a WAL on disk (in 128 MB segments). Periodically the oldest two hours of the head are written out as a persistent block directory with chunk files, an index and metadata; compaction later merges blocks into larger ones." },
            { org: "InfluxDB 1.x and 2.x", title: "The TSM engine", html: "A WAL and in-memory cache flush into Time-Structured Merge (TSM) files, read-only and compressed per series, which are compacted in levels. InfluxDB 3 moved to a new engine built on Apache Arrow, DataFusion and Parquet." },
            { org: "TimescaleDB", title: "Postgres underneath", html: "Writes go to ordinary Postgres tables (chunks) with Postgres' own WAL. Older chunks can be converted to a compressed columnar form, grouped by a <code>segmentby</code> column such as the host, which recovers much of the per-series layout." },
          ],
        },
        {
          type: "tradeoffs",
          prosLabel: "What the LSM shape buys",
          consLabel: "What it costs",
          pros: [
            "Writes are sequential appends plus an in-memory insert: no random I/O on the hot path",
            "Immutable files are simple to cache, compress, copy and back up",
            "Compaction is a natural place to compress harder, apply deletions and downsample",
          ],
          cons: [
            "A read may need to check the buffer and several files (block time ranges and indexes keep this small)",
            "Compaction rewrites data, spending disk bandwidth and CPU: write amplification",
            "Out-of-order or very late points complicate the in-memory buffer and may be rejected or handled specially",
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
          html: `<p>Grouping a series' points together sets up the real win. Consecutive timestamps are evenly spaced and consecutive values are close, so the engine stores <em>differences</em> instead of absolute numbers, using as few bits as each difference needs.</p>
<h3>Step 1: deltas and variable-length integers</h3>
<p>Store the first timestamp in full, then only the gap to the previous one. With millisecond timestamps 10 seconds apart, every gap is 10,000, which needs 14 bits. A <strong>varint</strong> (variable-length integer) uses 7 bits of each byte for data and 1 bit to say "more bytes follow", so 10,000 takes 2 bytes instead of 8. The same trick works for integer values that change by small amounts.</p>
<h3>Step 2: delta-of-delta for timestamps</h3>
<p>Take one more difference. If the gaps are 10, 10, 11, 9 seconds, their differences are 0, +1, &minus;2. For a perfectly regular series every one of them is 0. Facebook's Gorilla paper (2015) encodes these with a variable-length prefix code:</p>`,
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
          type: "text",
          html: `<p>Worked example: timestamps at :00, :10, :20, :31 and :40 seconds give gaps 10, 10, 11, 9. After the header and first delta, the deltas-of-deltas 0, +1, &minus;2 cost 1 + 9 + 9 = 19 bits for three timestamps. A perfectly regular scrape costs 1 bit per timestamp instead of 64.</p>
<h3>Step 3: XOR for floating-point values</h3>
<p>Differences do not work well for floats, so Gorilla XORs each value's 64 bits with the previous value's. Identical values XOR to zero, stored as a single <code>0</code> bit. Close values share their sign, exponent and leading mantissa bits, so the XOR has a run of leading zeros and usually trailing zeros too, with a short "meaningful" block in the middle. Only that block is stored, plus a few control bits giving its position.</p>
<p>Worked example: 12.0 is <code>0x4028000000000000</code> and 15.5 is <code>0x402F000000000000</code>. Their XOR is <code>0x0007000000000000</code>: 13 leading zeros, 3 meaningful bits, 48 trailing zeros. Gorilla writes a <code>1</code> (value changed), a <code>1</code> (new position), 5 bits for the leading-zero count, 6 bits for the block length and the 3 bits themselves: 16 bits instead of 64. If the next reading is 15.5 again, it costs 1 bit. When the meaningful bits fit inside the previous value's window, the encoder skips the position fields and writes even less.</p>`,
        },
        {
          type: "lab",
          id: "tsCompression",
          caption: "Two hours of one series at about 10-second intervals. Add timestamp jitter and value noise and watch the real bit counts: regular timestamps cost 1 bit, unchanged values 1 bit, noisy values far more.",
        },
        {
          type: "realworld",
          items: [
            { org: "Facebook Gorilla", title: "VLDB 2015", html: "An in-memory TSDB for Facebook's monitoring data. Combining delta-of-delta timestamps and XOR values, the paper reports an average of about <strong>1.37 bytes per point</strong>, roughly a 12x reduction from 16 bytes." },
            { org: "Prometheus", title: "Gorilla-style chunks", html: "Prometheus encodes samples in XOR chunks derived from the Gorilla scheme, and its documentation puts the on-disk cost at about 1-2 bytes per sample on average, which is what its capacity-planning formula uses." },
            { org: "TimescaleDB", title: "Columnar compression", html: "Compressed chunks store each column separately and pick an algorithm per type, including delta-of-delta for timestamps and integers and Gorilla-style XOR for floats." },
          ],
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>Compression ratios depend on the data, not the engine's marketing. A gauge that rarely changes (disk capacity) compresses to almost nothing; a noisy float with full precision (a jittery latency average) keeps most of its mantissa bits. If storage estimates matter, measure bytes per point on a sample of your real metrics. Rounding values to the precision you need (two decimals for a CPU percentage) can dramatically improve XOR compression.</p>`,
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
          type: "problem",
          html: `<p>Monitoring data has a shelf life. You keep detailed metrics for a week or a month, then delete them. In one big table, deleting old data means a <code>DELETE</code> that finds billions of rows through an index, removes each one, updates every index, and leaves dead tuples behind for vacuum to clean up, all while new writes keep arriving.</p>`,
        },
        {
          type: "text",
          html: `<p>Put numbers on it. The fleet writes 4.32 billion points a day. Suppose deletion runs at 50,000 rows per second including index maintenance (the assumption in the lab below). Deleting one day's worth of expired rows takes 4.32 &times; 10<sup>9</sup> / 50,000 = 86,400 seconds: <strong>a full day</strong>. Retention alone would consume the database.</p>
<p>The fix is <strong>time-based partitioning</strong>. Store each time window, such as one day, in its own partition (its own table, chunk or block directory). Writes always land in the current partition. Queries touch only partitions overlapping their time range. And retention becomes "drop the oldest partition": a metadata change and a file delete that takes about the same time whether the partition holds a thousand rows or a billion.</p>`,
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
          type: "realworld",
          items: [
            { org: "TimescaleDB", title: "Hypertables and chunks", html: "A hypertable is split into chunks by time (7 days by default, configurable with <code>chunk_time_interval</code>). <code>add_retention_policy</code> drops whole chunks on a schedule, and queries skip chunks outside their time range." },
            { org: "Prometheus", title: "Blocks", html: "Each persisted block covers a time range, and retention (15 days by default) deletes whole block directories once they fall out of the window." },
            { org: "InfluxDB", title: "Shard groups", html: "Data is stored in shards grouped by time; retention policies remove entire shard groups when they expire." },
          ],
        },
        {
          type: "text",
          html: `<h3>Choosing the partition size</h3>
<p>Partitions that are too large make retention coarse (you can only delete in big steps) and leave the active partition's indexes too big for memory. Partitions that are too small mean thousands of files and per-partition overhead in every long-range query. A useful target is that the current partition and its indexes fit comfortably in memory, and that retention is a small multiple of the partition size. Partitions also make tiering easy: recent ones on fast SSDs, older ones compressed or moved to cheaper storage.</p>`,
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
          type: "text",
          html: `<p>Time series storage comes up in metrics and monitoring systems, IoT and sensor platforms, ad and click counters, and financial tick data. Start from the arithmetic: points per second, bytes per point, retention. Those three numbers decide everything else.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>A strong answer covers:</p>
<ol>
<li><strong>The numbers:</strong> 100,000 hosts &times; 5 metrics / 10 s = 50,000 points/s, about 4.3 billion per day.</li>
<li><strong>Why not a row per point:</strong> 50-100 bytes per point, an index update per insert, and DELETE-based retention that cannot keep up.</li>
<li><strong>The write path:</strong> WAL plus an in-memory buffer by series, flushed to immutable compressed blocks, compacted in the background.</li>
<li><strong>Compression:</strong> delta-of-delta timestamps and XOR values, about 1.4 bytes per point in Gorilla's data, so a day is about 6 GB instead of hundreds.</li>
<li><strong>Time partitions:</strong> writes to the current one, queries prune by range, retention drops whole partitions.</li>
</ol>
<p>Then add the caveat: if the workload is ranking across millions of entities or needs joins, a TSDB is the wrong tool.</p>`,
        },
        {
          type: "text",
          html: `<p>Watch for the Top-K trap. "Trending hashtags" or "most viewed products" involves timestamps, so a TSDB sounds natural. But TSDBs are fast at reading a <em>few</em> series over time. Top-K means aggregating and ranking across <em>millions</em> of items, and storing item IDs as tags explodes the series count. A streaming aggregation (Flink, Kafka Streams, count-min sketches) or a columnar OLAP store fits better.</p>`,
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
    "The write path is LSM-shaped: WAL for durability, an in-memory buffer by series, immutable compressed blocks, background compaction.",
    "Delta-of-delta timestamps (1 bit when regular) and XOR-encoded floats (1 bit when unchanged) got Gorilla to about 1.37 bytes per point.",
    "Partition by time: writes hit one partition, queries prune by range, and retention is dropping a file instead of deleting billions of rows.",
    "Stretch Postgres (partitioning, BRIN, TimescaleDB) before adding a TSDB, and do not use a TSDB for ranking across millions of entities.",
  ],
  furtherReading: [
    { title: "Gorilla: A Fast, Scalable, In-Memory Time Series Database (Pelkonen et al., VLDB 2015)", note: "Describes the delta-of-delta timestamp and XOR value compression in detail, with measurements on Facebook's data." },
    { title: "Prometheus storage documentation", url: "https://prometheus.io/docs/prometheus/latest/storage/", note: "Head block, WAL, 2-hour blocks, compaction, retention and capacity planning." },
    { title: "TimescaleDB documentation: hypertables, compression and data retention", note: "How chunks, compression policies and retention policies work in Postgres." },
  ],
};
