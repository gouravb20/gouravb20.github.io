// Deep dive: Chapter 3, Storage and retrieval. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch3 = {
  hook: `<p>Your metrics service ingests 200,000 readings per second from sensors, and it is running on PostgreSQL. Inserts are fine at first, then the disks start to saturate even though each write is only a few dozen bytes. A colleague moves the workload to Cassandra and writes become cheap, but now a query for one sensor's latest value sometimes takes ten times longer than it did. Meanwhile the analytics team runs <code>SUM(reading) GROUP BY day</code> over a year of data and it takes an hour on either system, then minutes after it is copied into a columnar warehouse.</p>
<p>Same data, three very different behaviors. The difference is not the query language; it is how each engine lays bytes out on disk and what it does on every write. You will rarely write a storage engine, but you constantly choose between them, and this chapter explains what you are choosing: <strong>log-structured</strong> versus <strong>update-in-place</strong> engines for transactions, and <strong>row</strong> versus <strong>column</strong> layouts for analytics.</p>`,
  sections: [
    {
      id: "log-and-hash-index",
      title: "The simplest database: an append-only log and a hash index",
      kicker: "First principles",
      blocks: [
        {
          type: "problem",
          html: `<p>The fastest possible write is appending to the end of a file: no seeking, no rewriting. But if all you do is append, finding a key means scanning the whole file, which is O(n) per lookup. Every storage engine is an answer to the same tension: <strong>an index makes reads fast but must be updated on every write</strong>, so it always costs something.</p>`,
        },
        {
          type: "text",
          html: `<p>Start with a file where each write appends a <code>key,value</code> record. Updating a key just appends a newer record; the latest one wins. Writes are as fast as the disk can stream. Reads are hopeless without an index.</p>
<p>The simplest index is an in-memory <strong>hash map from each key to the byte offset</strong> of its latest record in the file. A write appends to the file and updates the map; a read looks up the offset and does one seek. This is essentially how Bitcask, a storage engine for the Riak database, works. It is excellent when there are many writes to a modest number of keys, such as a counter per device updated every few seconds, as long as <em>all keys fit in RAM</em>.</p>
<h3>Keeping the log from growing forever</h3>
<p>Break the log into <strong>segments</strong> of a fixed size. Once a segment is closed it is never modified. A background process <strong>compacts</strong> closed segments, keeping only the latest value for each key, and merges small segments into one. Reads keep using the old segments until the merged one is ready, then switch over and delete the old files.</p>
<p>A few details make this production-ready. Deleting a key appends a special <strong>tombstone</strong> record so compaction knows to discard older values. After a crash the hash maps can be rebuilt by reading segments, which is slow, so Bitcask also writes snapshot "hint" files. Checksums detect a half-written final record. And there is only one writer thread, which keeps concurrency simple because segments are append-only and immutable.</p>`,
        },
        {
          type: "tradeoffs",
          prosLabel: "Why append-only is attractive",
          consLabel: "Why a hash index is not enough",
          pros: [
            "Sequential writes are much faster than random writes, especially on spinning disks and still noticeably on SSDs",
            "Immutable segments make crash recovery and concurrency simple: no record is ever half-overwritten",
            "Merging old segments avoids fragmentation",
          ],
          cons: [
            "Every key must fit in memory; an on-disk hash map performs poorly because of random I/O",
            "Range queries are inefficient: finding all keys between <code>sensor:1000</code> and <code>sensor:1999</code> means looking up each one",
          ],
        },
        {
          type: "quiz",
          q: "A Bitcask-style store holds 2 billion distinct keys averaging 40 bytes each, on a server with 32 GB of RAM. What is the main problem?",
          options: [
            "Writes will be slow because of random I/O",
            "The in-memory hash index (at least 80 GB of keys alone) does not fit in RAM",
            "Compaction cannot run on large files",
            "Range queries will be fast, which wastes memory",
          ],
          answer: 1,
          explain: "Writes remain sequential and fast. The limit is that the whole key-to-offset map lives in memory: 2 billion keys of 40 bytes is 80 GB before any per-entry overhead. That is exactly the restriction that sorted, sparsely indexed segments (SSTables) remove.",
        },
      ],
    },
    {
      id: "sstables-and-lsm-trees",
      title: "SSTables and LSM-trees: sorted logs that merge",
      kicker: "Log-structured engines",
      blocks: [
        {
          type: "idea",
          html: `<p>Keep the append-only, immutable-segment design, but require each segment to be <strong>sorted by key</strong>. A sorted segment is called a <strong>Sorted String Table (SSTable)</strong>. Sorting makes merging cheap, lets the index be sparse, and makes range queries possible.</p>`,
        },
        {
          type: "text",
          html: `<p>Sorted segments buy three things. <strong>Merging</strong> works like the merge step of mergesort: read the segments side by side, always emit the smallest key, and when a key appears in several segments keep the value from the newest one. It streams, so segments can be far larger than memory. <strong>The index can be sparse</strong>: keep one key every few kilobytes in memory, and to find any key, jump to the nearest indexed key before it and scan forward a little. And because neighboring keys are stored together, each block can be <strong>compressed</strong>, saving disk space and I/O.</p>
<p>But writes arrive in random order, so how do you produce sorted files by appending? You sort in memory first.</p>`,
        },
        {
          type: "steps",
          title: "The write and read paths of an LSM-tree",
          items: [
            "A write is appended to an on-disk commit log (write-ahead log) so it survives a crash. The log is not sorted; it exists only for recovery.",
            "The write is also inserted into the <strong>memtable</strong>, an in-memory balanced tree or skip list that keeps keys sorted.",
            "When the memtable reaches a threshold (typically tens of megabytes), it is written out as a new SSTable, which is fast because the data is already sorted. A fresh memtable takes new writes, and the commit log for the flushed data can be discarded.",
            "A read checks the memtable first, then SSTables from newest to oldest, stopping at the first match.",
            "In the background, <strong>compaction</strong> merges SSTables, dropping overwritten values and expired tombstones, so the number of files a read must check stays small.",
          ],
        },
        {
          type: "diagram",
          title: "LSM-tree write path",
          caption: "Writes go to a durable commit log and a sorted in-memory memtable. Full memtables are flushed as immutable SSTables, which background compaction merges into larger ones.",
          svg: `<svg viewBox="0 0 620 300" role="img" aria-label="A write goes to the commit log and the memtable; the memtable is flushed to level 0 SSTables, which are compacted into a larger level 1 SSTable">
<defs><marker id="ddia3-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="20" y="40" width="90" height="40" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="65" y="65" text-anchor="middle" font-size="13" font-weight="700">Write</text>
<rect x="150" y="18" width="200" height="94" rx="8" fill="none" stroke-width="1.5" stroke-dasharray="5 4" style="stroke: var(--dg-line)"/>
<text x="160" y="35" font-size="12" style="fill: var(--dg-muted)">Memory</text>
<rect x="170" y="45" width="160" height="52" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="250" y="67" text-anchor="middle" font-size="13" font-weight="700">Memtable</text>
<text x="250" y="86" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">sorted by key</text>
<rect x="150" y="125" width="460" height="160" rx="8" fill="none" stroke-width="1.5" stroke-dasharray="5 4" style="stroke: var(--dg-line)"/>
<text x="160" y="143" font-size="12" style="fill: var(--dg-muted)">Disk</text>
<rect x="170" y="155" width="140" height="40" rx="6" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="2"/>
<text x="240" y="180" text-anchor="middle" font-size="12">Commit log (WAL)</text>
<text x="240" y="215" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">append only</text>
<rect x="380" y="160" width="50" height="34" rx="4" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="405" y="182" text-anchor="middle" font-size="12">SST 3</text>
<rect x="440" y="160" width="50" height="34" rx="4" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="465" y="182" text-anchor="middle" font-size="12">SST 2</text>
<rect x="500" y="160" width="50" height="34" rx="4" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="525" y="182" text-anchor="middle" font-size="12">SST 1</text>
<text x="370" y="182" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">Level 0</text>
<rect x="380" y="232" width="170" height="34" rx="4" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="465" y="254" text-anchor="middle" font-size="12">Larger merged SSTable</text>
<text x="370" y="254" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">Level 1</text>
<line x1="110" y1="60" x2="166" y2="68" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia3-arrow)"/>
<path d="M65 80 V175 H166" fill="none" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia3-arrow)"/>
<path d="M330 70 H465 V156" fill="none" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia3-arrow)"/>
<text x="398" y="62" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">flush when full</text>
<line x1="465" y1="194" x2="465" y2="228" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia3-arrow)"/>
<text x="475" y="216" font-size="12" style="fill: var(--dg-muted)">compact</text>
</svg>`,
        },
        {
          type: "text",
          html: `<h3>Bloom filters and compaction strategies</h3>
<p>Looking up a key that does not exist is the worst case: the engine checks the memtable and then every SSTable before giving up. A <strong>Bloom filter</strong> per SSTable fixes most of that. It is a compact bit array that answers "definitely not here" or "possibly here". With about 10 bits per key it gives roughly a 1% false-positive rate, so 99% of pointless SSTable reads are skipped, and it never produces false negatives.</p>
<p>The order in which SSTables are merged is the <strong>compaction strategy</strong>. <em>Size-tiered</em> compaction merges several SSTables of similar size into a bigger one; it is cheap on writes but can temporarily need a lot of extra disk space and leaves more files for a read to check. <em>Leveled</em> compaction organizes SSTables into levels with non-overlapping key ranges, each level about ten times larger than the one above; reads touch fewer files and space overhead is lower, but data is rewritten more times as it moves down the levels.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Google Bigtable", title: "Where the names come from", html: "The 2006 Bigtable paper described memtables and SSTables. The underlying idea is older: the Log-Structured Merge-Tree paper by O'Neil and colleagues (1996)." },
            { org: "LevelDB and RocksDB", title: "Embedded LSM engines", html: "LevelDB (Google) introduced leveled compaction in a small embeddable library. Facebook forked it as RocksDB, which now sits underneath many systems, including TiKV, Kafka Streams state stores and Flink's RocksDB state backend." },
            { org: "Cassandra and HBase", title: "LSM at cluster scale", html: "Both write to a commit log and memtable and flush to SSTables (HBase calls them HFiles). Cassandra lets you choose a compaction strategy per table: size-tiered, leveled, or time-window for time-series data." },
          ],
        },
        {
          type: "quiz",
          q: "An LSM-tree has 30 SSTables and Bloom filters with a 1% false-positive rate. A client reads a key that exists in none of them. On average, about how many SSTables are actually read from disk?",
          options: ["30", "About 15", "About 0.3", "Exactly 1"],
          answer: 2,
          explain: "Each SSTable's Bloom filter says 'definitely not here' 99% of the time, so the expected number of unnecessary disk reads is 30 &times; 0.01 = 0.3. Without the filters the engine would read all 30 before concluding the key is absent.",
        },
      ],
    },
    {
      id: "b-trees",
      title: "B-trees: fixed pages, updated in place",
      kicker: "Update-in-place engines",
      blocks: [
        {
          type: "idea",
          html: `<p>Instead of variable-size segments written once, a B-tree divides the database into fixed-size <strong>pages</strong> (blocks) and arranges them as a balanced tree of key ranges. A page is <em>overwritten in place</em> when its contents change. B-trees were introduced in 1970 and remain the default index in almost every relational database.</p>`,
        },
        {
          type: "text",
          html: `<p>Each page holds a sorted list of keys and references to child pages. The root page covers the whole key space; each reference covers the range between its two neighboring keys. Leaf pages hold the values themselves or pointers to where the rows live. To find a key you start at the root and follow the child whose range contains it, one page per level, until you reach a leaf.</p>
<p>Page sizes are fixed by the engine: PostgreSQL uses 8 KB pages, MySQL's InnoDB 16 KB, SQLite 4 KB by default. The number of child references per page is the <strong>branching factor</strong>, typically in the hundreds or more.</p>`,
        },
        {
          type: "diagram",
          title: "Looking up key 251",
          caption: "Each level narrows the key range. With a branching factor in the hundreds, even billions of keys need only three or four levels, and the top levels usually stay cached in memory.",
          svg: `<svg viewBox="0 0 620 260" role="img" aria-label="A B-tree lookup for key 251 follows one page per level from the root to a leaf">
<defs><marker id="ddia3-barrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-ok)"/></marker></defs>
<text x="20" y="45" font-size="12" style="fill: var(--dg-muted)">Root page</text>
<text x="20" y="135" font-size="12" style="fill: var(--dg-muted)">Internal page</text>
<text x="20" y="225" font-size="12" style="fill: var(--dg-muted)">Leaf page</text>
<rect x="170" y="20" width="280" height="40" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<line x1="240" y1="20" x2="240" y2="60" stroke-width="1.5" style="stroke: var(--dg-1)"/>
<line x1="310" y1="20" x2="310" y2="60" stroke-width="1.5" style="stroke: var(--dg-1)"/>
<line x1="380" y1="20" x2="380" y2="60" stroke-width="1.5" style="stroke: var(--dg-1)"/>
<text x="205" y="45" text-anchor="middle" font-size="12">&lt;100</text>
<text x="275" y="45" text-anchor="middle" font-size="12">100-199</text>
<rect x="311" y="21" width="68" height="38" style="fill: var(--dg-ok-soft)"/>
<text x="345" y="45" text-anchor="middle" font-size="12" font-weight="700">200-299</text>
<text x="415" y="45" text-anchor="middle" font-size="12">300+</text>
<line x1="205" y1="60" x2="205" y2="80" stroke-width="1.5" stroke-dasharray="3 3" style="stroke: var(--dg-muted)"/>
<line x1="275" y1="60" x2="275" y2="80" stroke-width="1.5" stroke-dasharray="3 3" style="stroke: var(--dg-muted)"/>
<line x1="415" y1="60" x2="415" y2="80" stroke-width="1.5" stroke-dasharray="3 3" style="stroke: var(--dg-muted)"/>
<rect x="220" y="110" width="280" height="40" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<line x1="290" y1="110" x2="290" y2="150" stroke-width="1.5" style="stroke: var(--dg-2)"/>
<line x1="360" y1="110" x2="360" y2="150" stroke-width="1.5" style="stroke: var(--dg-2)"/>
<line x1="430" y1="110" x2="430" y2="150" stroke-width="1.5" style="stroke: var(--dg-2)"/>
<text x="255" y="135" text-anchor="middle" font-size="12">200-229</text>
<text x="325" y="135" text-anchor="middle" font-size="12">230-249</text>
<rect x="361" y="111" width="68" height="38" style="fill: var(--dg-ok-soft)"/>
<text x="395" y="135" text-anchor="middle" font-size="12" font-weight="700">250-269</text>
<text x="465" y="135" text-anchor="middle" font-size="12">270-299</text>
<rect x="280" y="200" width="280" height="40" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<line x1="350" y1="200" x2="350" y2="240" stroke-width="1.5" style="stroke: var(--dg-3)"/>
<line x1="420" y1="200" x2="420" y2="240" stroke-width="1.5" style="stroke: var(--dg-3)"/>
<line x1="490" y1="200" x2="490" y2="240" stroke-width="1.5" style="stroke: var(--dg-3)"/>
<text x="315" y="225" text-anchor="middle" font-size="12">250</text>
<rect x="351" y="201" width="68" height="38" style="fill: var(--dg-ok-soft)"/>
<text x="385" y="225" text-anchor="middle" font-size="12" font-weight="700">251: row</text>
<text x="455" y="225" text-anchor="middle" font-size="12">258</text>
<text x="525" y="225" text-anchor="middle" font-size="12">263</text>
<line x1="345" y1="60" x2="360" y2="106" stroke-width="2" style="stroke: var(--dg-ok)" marker-end="url(#ddia3-barrow)"/>
<line x1="395" y1="150" x2="410" y2="196" stroke-width="2" style="stroke: var(--dg-ok)" marker-end="url(#ddia3-barrow)"/>
</svg>`,
        },
        {
          type: "text",
          html: `<p>A worked example shows why B-trees are shallow. With 16 KB pages and around 1,000 child references per page, a tree of depth three (root, one internal level, leaves) has about a million leaf pages, roughly 16 GB of data. Depth four reaches about a billion leaf pages, on the order of 16 TB. Because the root and the next level are small and hot, they stay in the buffer cache, so most lookups cost one or two actual disk reads.</p>
<h3>Writes, splits and crash safety</h3>
<p>To insert a key, find the leaf whose range covers it and add the key there. If the page is full, <strong>split</strong> it into two half-full pages and add a reference to the new page in the parent, which may split in turn. That keeps the tree balanced: every leaf is at the same depth.</p>
<p>Overwriting pages in place is dangerous. A split modifies several pages; if the machine crashes after writing some of them, the tree is corrupt (for example, a page that no parent points to). So every B-tree engine also keeps a <strong>write-ahead log (WAL)</strong>, also called a redo log: each change is appended to the log and flushed before the pages are modified, and after a crash the log is replayed to bring the tree back to a consistent state. Engines also guard against <em>torn pages</em>, where only part of a page reached disk: PostgreSQL logs a full copy of a page the first time it is modified after a checkpoint, and InnoDB uses a doublewrite buffer.</p>
<p>Concurrent access needs care too, since a reader could see a page halfway through a split. Engines protect pages with lightweight locks called latches. An alternative is <strong>copy-on-write</strong>: write modified pages to new locations and switch the parent pointer atomically, as LMDB does, which also makes consistent snapshots easy.</p>`,
        },
        {
          type: "quiz",
          q: "Why does a B-tree need a write-ahead log, while a pure LSM-tree's SSTables do not need one for their own consistency?",
          options: [
            "B-trees are slower, so they need a log to batch writes",
            "B-trees overwrite pages in place, and a multi-page change such as a split can be interrupted by a crash; SSTables are written once and never modified",
            "LSM-trees never crash",
            "SSTables are stored in memory only",
          ],
          answer: 1,
          explain: "An interrupted split can leave the tree with dangling or orphaned pages, so the intended change is logged first and replayed on recovery. SSTables are immutable once written; a crash during a flush just leaves an incomplete file that is discarded. (LSM engines still keep a commit log, but for the unflushed memtable, not for the SSTables.)",
        },
      ],
    },
    {
      id: "comparing-engines",
      title: "LSM-trees versus B-trees: amplification and predictability",
      kicker: "Trade-offs",
      blocks: [
        {
          type: "text",
          html: `<p>A rule of thumb is that LSM-trees are faster for writes and B-trees for reads. That is a reasonable starting point, but benchmarks are sensitive to workload, so it is better to understand where the costs come from.</p>
<p>The key metric is <strong>write amplification</strong>: how many bytes are written to disk for each byte the application writes. A B-tree writes every change at least twice (once to the WAL and once to the page), and rewrites an entire page even when a few bytes in it changed. An LSM-tree writes each record to the commit log, then to an SSTable, then again every time compaction moves it. Which is worse depends on configuration, but LSM-trees often sustain higher write throughput because their writes are sequential and their files are compactly packed. Write amplification also matters for SSDs, because flash cells can only be rewritten a limited number of times.</p>
<p>LSM files compress better and suffer less fragmentation, because SSTables are rewritten in full and have no partly empty pages. B-tree pages split and leave unused space behind.</p>`,
        },
        {
          type: "table",
          title: "Where each engine wins",
          headers: ["", "B-tree", "LSM-tree"],
          rows: [
            ["Write pattern", "Random page overwrites plus WAL", "Sequential appends plus background merges"],
            ["Point reads", "One root-to-leaf path, predictable", "Memtable plus possibly several SSTables; Bloom filters help"],
            ["Range scans", "Excellent: leaves are in key order", "Good, but must merge across several files"],
            ["Disk usage", "Fragmentation from half-empty pages", "Compact and compressible after compaction"],
            ["Latency tail", "Smooth", "Can spike when compaction competes for disk bandwidth"],
            ["Key exists in one place", "Yes, which makes key-range locking natural", "No, several versions may exist until compaction"],
            ["Examples", "PostgreSQL, MySQL InnoDB, SQL Server, Oracle", "RocksDB, Cassandra, HBase, ScyllaDB"],
          ],
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p>The hidden risk with LSM engines is <strong>compaction falling behind</strong>. If the write rate is high enough, compaction cannot keep up, unmerged SSTables pile up, reads get slower and disk usage grows until space runs out. Engines typically throttle incoming writes when this happens (RocksDB calls these write stalls). You need to monitor pending compaction work explicitly, because nothing fails loudly until it is too late.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Facebook (Meta)", title: "MyRocks", html: "MyRocks plugs RocksDB into MySQL as a storage engine. Facebook moved large MySQL deployments to it and reported substantially less storage used than with compressed InnoDB, because LSM files compress better and waste less space." },
            { org: "CockroachDB", title: "Pebble", html: "CockroachDB used RocksDB for years and then replaced it with Pebble, its own Go implementation of an LSM engine with a RocksDB-compatible file format, which became the default in 2020." },
          ],
        },
        {
          type: "callout",
          tone: "modern",
          html: `<p>Compaction has kept evolving since 2017. Cassandra 5.0 (2024) added the Unified Compaction Strategy, which can be tuned to behave like size-tiered or leveled compaction, or anywhere between, instead of forcing a choice per table. And storage engines increasingly separate large values from keys (an idea known as key-value separation, popularized by the WiscKey paper) so that compaction does not keep rewriting big values.</p>`,
        },
        {
          type: "quiz",
          q: "A logging pipeline writes 500,000 small events per second and reads them only in occasional bulk scans by time range. Which storage engine family is the more natural fit?",
          options: [
            "B-tree, because reads must be predictable",
            "LSM-tree, because the workload is write-heavy and scans are rare and sequential",
            "A hash index, because it supports range queries",
            "Either; write volume does not affect the choice",
          ],
          answer: 1,
          explain: "Sustained high write throughput with sequential appends is where LSM engines shine, and time-ordered SSTables suit range scans. The usual LSM costs (occasional latency spikes, reads checking several files) matter little for rare bulk scans.",
        },
      ],
    },
    {
      id: "more-indexes",
      title: "Clustered, secondary, covering and multi-column indexes",
      kicker: "Index variants",
      blocks: [
        {
          type: "text",
          html: `<p>So far each index mapped a key to a value. Real databases add several variations, and knowing them helps you predict query cost.</p>
<p>A <strong>secondary index</strong> is built on a column that is not the primary key, such as <code>orders(customer_id)</code>. Its keys are not unique, so each entry either lists all matching row references or makes keys unique by appending the row identifier.</p>
<p>Where does the row itself live? In a <strong>heap file</strong>, rows are stored in no particular order and every index, primary included, points to a location in the heap. PostgreSQL works this way. In a <strong>clustered index</strong>, the row is stored inside the primary-key index's leaf pages. MySQL's InnoDB always clusters by primary key, so its secondary indexes store the primary key and a secondary lookup becomes two tree traversals. SQL Server lets you choose one clustered index per table.</p>
<p>A <strong>covering index</strong> stores some extra columns alongside the key, so certain queries can be answered from the index alone without touching the row (an index-only scan). SQL Server and PostgreSQL (since version 11) support an <code>INCLUDE</code> clause for exactly this.</p>
<p>A <strong>concatenated index</strong> combines several columns into one key, like <code>(last_name, first_name)</code>. Because it is sorted by the first column, then the second, it helps queries on the first column or on both, but not on the second alone. Truly multi-dimensional queries ("restaurants within this map rectangle") need spatial indexes such as R-trees; PostGIS builds them with PostgreSQL's GiST index framework.</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "Heap plus indexes (PostgreSQL)", tone: "info", html: "Every index points into an unordered heap. All indexes are equal citizens, and updating a row that does not change indexed columns can avoid touching the indexes. A lookup is index then heap." },
            { title: "Clustered by primary key (InnoDB)", tone: "ok", html: "The table is the primary-key B-tree. Primary-key lookups and range scans are fast and rows with nearby keys sit together. Secondary lookups traverse two trees, and a long primary key bloats every secondary index." },
          ],
        },
        {
          type: "text",
          html: `<h3>Keeping everything in memory</h3>
<p>As RAM got cheaper, many datasets now fit entirely in memory, possibly spread across machines. In-memory databases such as Redis, Memcached (a cache that may lose data), VoltDB and SingleStore keep the working data in RAM and use disk only for durability, through an append-only log, periodic snapshots or replication. Their speed advantage comes less from avoiding disk reads (a disk-based engine with enough cache rarely reads disk either) and more from avoiding the overhead of encoding data structures in a disk-friendly form. They also make data structures practical that are awkward on disk, such as Redis's sorted sets and priority queues.</p>`,
        },
        {
          type: "quiz",
          q: "In MySQL InnoDB, a table has a 36-character UUID string as its primary key and five secondary indexes. Why is this costly?",
          options: [
            "UUIDs cannot be indexed",
            "Every secondary index entry stores the primary key, so the long key is copied into all five indexes; random UUIDs also scatter inserts across the clustered tree",
            "InnoDB does not support secondary indexes on such tables",
            "Clustered indexes cannot hold strings",
          ],
          answer: 1,
          explain: "InnoDB's secondary indexes refer to rows by primary key, so a wide key enlarges every index. And because the table is clustered by that key, random UUIDs insert into random leaf pages, causing page splits and poor cache locality. Compact, roughly increasing keys avoid both problems.",
        },
      ],
    },
    {
      id: "oltp-vs-olap",
      title: "Transactions versus analytics, and the data warehouse",
      kicker: "OLTP and OLAP",
      blocks: [
        {
          type: "problem",
          html: `<p>Everything above is tuned for <strong>online transaction processing (OLTP)</strong>: an application looks up a few records by key, then inserts or updates a few, with users waiting for each response. Analysts ask a completely different kind of question: total revenue per store per month, across billions of rows. Running those scans on the production database steals I/O and cache from user-facing requests at exactly the wrong time.</p>`,
        },
        {
          type: "table",
          headers: ["", "OLTP", "OLAP"],
          rows: [
            ["Typical query", "Fetch or update a few records by key", "Aggregate over millions or billions of rows"],
            ["Writes", "Random, low-latency, from users", "Bulk loads (ETL) or event streams"],
            ["Who uses it", "End users through an application", "Analysts, dashboards, data scientists"],
            ["Data", "Current state", "History of events over time"],
            ["Size", "Gigabytes to terabytes", "Terabytes to petabytes"],
            ["Bottleneck", "Disk seeks and latency per request", "Disk bandwidth and bytes scanned"],
          ],
        },
        {
          type: "text",
          html: `<p>The usual answer is a separate <strong>data warehouse</strong>: a database for analytics that analysts can hammer without affecting operations. Data is copied from the OLTP systems by <strong>Extract-Transform-Load (ETL)</strong>, either as periodic dumps or a continuous stream of changes, and reshaped into an analysis-friendly schema on the way. Both kinds of system often speak SQL, but their internals are optimized for opposite access patterns.</p>
<h3>Star and snowflake schemas</h3>
<p>Warehouses commonly use a <strong>star schema</strong>. At the center is a <strong>fact table</strong> where each row is an event, such as one sale: the date, product, store, customer, quantity and price. Fact tables are huge and can have hundreds of columns. Most of those columns are foreign keys into <strong>dimension tables</strong>, which describe the who, what, where and when: product names and categories, store locations, calendar attributes such as "is this a public holiday".</p>`,
        },
        {
          type: "diagram",
          title: "A star schema",
          caption: "The fact table records events and references small dimension tables. A snowflake schema further normalizes the dimensions, for example splitting product categories into their own table.",
          svg: `<svg viewBox="0 0 560 240" role="img" aria-label="A fact table in the center connected to four dimension tables: date, product, store and customer">
<line x1="200" y1="100" x2="150" y2="60" stroke-width="2" style="stroke: var(--dg-muted)"/>
<line x1="360" y1="100" x2="410" y2="60" stroke-width="2" style="stroke: var(--dg-muted)"/>
<line x1="200" y1="140" x2="150" y2="180" stroke-width="2" style="stroke: var(--dg-muted)"/>
<line x1="360" y1="140" x2="410" y2="180" stroke-width="2" style="stroke: var(--dg-muted)"/>
<rect x="200" y="90" width="160" height="60" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="280" y="115" text-anchor="middle" font-size="13" font-weight="700">fact_sales</text>
<text x="280" y="135" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">one row per sale</text>
<rect x="20" y="20" width="130" height="40" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="85" y="45" text-anchor="middle" font-size="12">dim_date</text>
<rect x="410" y="20" width="130" height="40" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="475" y="45" text-anchor="middle" font-size="12">dim_product</text>
<rect x="20" y="180" width="130" height="40" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="85" y="205" text-anchor="middle" font-size="12">dim_store</text>
<rect x="410" y="180" width="130" height="40" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="475" y="205" text-anchor="middle" font-size="12">dim_customer</text>
</svg>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Cloud warehouses", title: "Analytics as a service", html: "Amazon Redshift (built on ParAccel technology), Google BigQuery (based on Google's internal Dremel system) and Snowflake all store data in columnar form and separate analytics from transactional databases." },
            { org: "Open-source engines", title: "Self-hosted analytics", html: "ClickHouse (open-sourced by Yandex), Apache Druid and Apache Pinot target fast aggregations over large event tables, often fed directly from Kafka." },
          ],
        },
      ],
    },
    {
      id: "column-storage",
      title: "Column-oriented storage and compression",
      kicker: "Columnar layout",
      blocks: [
        {
          type: "problem",
          html: `<p>A fact table might have 100 columns and billions of rows, but a typical analytic query reads only 4 or 5 columns. In a row-oriented layout every row is stored contiguously, so the engine must read all 100 columns of every row from disk just to use a few of them.</p>`,
        },
        {
          type: "idea",
          html: `<p>Store <strong>each column separately</strong>: all values of <code>quantity</code> together, all values of <code>product_id</code> together, and so on, with every column file in the same row order. A query reads only the columns it references, and the <em>n</em>-th entry of each file belongs to the same row.</p>`,
        },
        {
          type: "diagram",
          title: "Same four rows, two layouts",
          caption: "To compute SUM(qty), the row layout reads every field of every row, while the column layout reads only the qty file.",
          svg: `<svg viewBox="0 0 620 270" role="img" aria-label="Row-oriented storage keeps each row together; column-oriented storage keeps each column together, so a query on qty reads one file">
<text x="155" y="22" text-anchor="middle" font-size="13" font-weight="700">Row-oriented</text>
<rect x="20" y="40" width="270" height="30" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<text x="30" y="60" font-size="12">03-01, tent, Lyon, qty 2</text>
<rect x="20" y="78" width="270" height="30" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<text x="30" y="98" font-size="12">03-01, stove, Lyon, qty 1</text>
<rect x="20" y="116" width="270" height="30" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<text x="30" y="136" font-size="12">03-02, tent, Paris, qty 5</text>
<rect x="20" y="154" width="270" height="30" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<text x="30" y="174" font-size="12">03-02, tent, Lyon, qty 1</text>
<text x="155" y="212" text-anchor="middle" font-size="12" style="fill: var(--dg-bad)">SUM(qty) reads every row in full</text>
<line x1="310" y1="10" x2="310" y2="225" stroke-width="1.5" stroke-dasharray="4 4" style="stroke: var(--dg-line)"/>
<text x="465" y="22" text-anchor="middle" font-size="13" font-weight="700">Column-oriented</text>
<rect x="330" y="40" width="280" height="30" rx="4" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="340" y="60" font-size="12">date: 03-01, 03-01, 03-02, 03-02</text>
<rect x="330" y="78" width="280" height="30" rx="4" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="340" y="98" font-size="12">product: tent, stove, tent, tent</text>
<rect x="330" y="116" width="280" height="30" rx="4" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="340" y="136" font-size="12">store: Lyon, Lyon, Paris, Lyon</text>
<rect x="330" y="154" width="280" height="30" rx="4" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="340" y="174" font-size="12" font-weight="700">qty: 2, 1, 5, 1</text>
<text x="470" y="212" text-anchor="middle" font-size="12" style="fill: var(--dg-ok)">SUM(qty) reads one file</text>
<text x="310" y="252" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">Entry n of every column file belongs to row n.</text>
</svg>`,
        },
        {
          type: "text",
          html: `<h3>Compression</h3>
<p>Values in one column share a type and often repeat: a <code>country</code> column has a couple of hundred distinct values across billions of rows. That makes columns highly compressible. A simple, effective scheme is <strong>bitmap encoding</strong>: for each distinct value, store a bitmap with one bit per row, set where the row has that value. Sparse bitmaps then shrink further with <strong>run-length encoding</strong>, storing the lengths of runs of zeros and ones instead of the bits.</p>`,
        },
        {
          type: "table",
          title: "Bitmap encoding of a product column (six rows)",
          headers: ["Row values", "tent", "stove", "tent", "tent", "lamp", "stove"],
          rows: [
            ["Bitmap for tent", "1", "0", "1", "1", "0", "0"],
            ["Bitmap for stove", "0", "1", "0", "0", "0", "1"],
            ["Bitmap for lamp", "0", "0", "0", "0", "1", "0"],
          ],
          note: "WHERE product IN ('tent', 'lamp') becomes a bitwise OR of two bitmaps: 101110. Combining predicates on different columns becomes a bitwise AND, which CPUs do very fast.",
        },
        {
          type: "text",
          html: `<p>Column stores also exploit the CPU. Instead of handling one row at a time through a chain of function calls, <strong>vectorized processing</strong> runs a tight loop over a chunk of compressed column values that fits in the CPU cache, often with SIMD instructions.</p>
<h3>Sort order, writes and precomputation</h3>
<p>Rows can be stored sorted by a chosen key, such as date and then product. Queries filtering on date then skip most of the data, and the sorted first column compresses extremely well because equal values form long runs. Vertica, descended from the C-Store research project, even stores the same data in several sort orders on different replicas and picks the best one per query.</p>
<p>The cost is writes. Inserting one row into the middle of sorted, compressed column files would mean rewriting them, so column stores use an LSM-like approach: new writes go to an in-memory store and are periodically merged into the column files in bulk, while queries combine both.</p>
<p>Finally, a <strong>materialized view</strong> stores the result of a query, such as revenue per store per day, so dashboards do not recompute it. A <strong>data cube</strong> is a grid of such aggregates across several dimensions. They make the anticipated queries instant at the cost of flexibility and extra work on every write.</p>`,
        },
        {
          type: "callout",
          tone: "modern",
          html: `<p>Since 2017 analytics has moved toward open file and table formats. Columnar files in Apache Parquet are stored in object storage such as Amazon S3, and table formats like Apache Iceberg (which originated at Netflix), Delta Lake and Apache Hudi add transactions, schema evolution and snapshots on top, so several engines (Spark, Trino, Flink, warehouses) can query the same tables. At the small end, DuckDB, an in-process columnar database that reached version 1.0 in 2024, brings vectorized analytics to a single laptop.</p>`,
        },
        {
          type: "quiz",
          q: "A table has 120 columns of similar size and 10 billion rows. A query sums one column filtered by another. Roughly how much less data does a column store read than a row store, before compression?",
          options: ["About the same", "About 2 times less", "About 60 times less", "About 1,000 times less"],
          answer: 2,
          explain: "The query touches 2 of 120 columns, so a column store reads about 2/120 of the data, around 60 times less. Compression usually widens the gap further, because single columns compress far better than mixed rows.",
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
          html: `<p>Storage engines come up when you justify a database choice and when you are asked how a database works "under the hood". Interviewers want to hear that you connect the workload (write-heavy, read-heavy, transactional or analytic) to a specific on-disk structure, and that you know the operational costs, not just the happy path.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>A crisp answer to "LSM-tree or B-tree?":</p>
<ol>
<li>LSM-trees buffer writes in a sorted memtable and flush immutable SSTables, so writes are sequential and throughput is high; reads may check several files, helped by Bloom filters; compaction costs background I/O and can cause latency spikes.</li>
<li>B-trees update fixed-size pages in place with a WAL for crash safety; reads follow one predictable path and range scans are cheap; random writes and page splits cost more.</li>
<li>Pick LSM for write-heavy, append-like workloads (metrics, logs, messaging); pick B-tree for read-heavy transactional workloads that need predictable latency.</li>
</ol>
<p>Then separate OLTP from OLAP: analytics belongs in a columnar store fed by ETL or change data capture, not on the primary database.</p>`,
        },
        {
          type: "steps",
          title: "Walking through an insert into a Cassandra-style database",
          items: [
            "Append the mutation to the commit log for durability.",
            "Insert it into the memtable, sorted by key, and acknowledge the client.",
            "When the memtable is full, flush it as an immutable SSTable with its sparse index and Bloom filter.",
            "Background compaction merges SSTables, discarding overwritten values and old tombstones.",
            "A read checks the memtable and then SSTables from newest to oldest, skipping files whose Bloom filter rules the key out.",
          ],
        },
        {
          type: "quiz",
          q: "An interviewer asks why your analytics dashboard should not query the production PostgreSQL database directly. Which answer best reflects this chapter?",
          options: [
            "PostgreSQL cannot run aggregate queries",
            "Large scans compete with user-facing transactions for I/O and cache, and a row-oriented layout reads every column; a columnar warehouse fed by ETL or change data capture reads only the needed columns and isolates the load",
            "Dashboards need NoSQL",
            "SQL is too slow for analytics",
          ],
          answer: 1,
          explain: "The issue is workload isolation and data layout, not capability. Analytical scans hurt OLTP latency, and a row store wastes I/O on unused columns. A separate columnar store, kept up to date by ETL or change data capture, fixes both.",
        },
      ],
    },
  ],
  takeaways: [
    "Every index speeds up reads and slows down writes; storage engines differ in how they pay that cost.",
    "Log-structured engines append to immutable sorted files (SSTables), buffer writes in a memtable, and merge files in the background. They give high write throughput and good compression at the cost of compaction work and reads that may touch several files.",
    "Bloom filters let LSM reads skip files that cannot contain a key: about 10 bits per key gives roughly a 1% false-positive rate and no false negatives.",
    "B-trees update fixed-size pages in place, stay shallow (three or four levels for billions of keys), and need a write-ahead log because multi-page changes are not atomic.",
    "Watch compaction backlog in LSM engines and page splits and fragmentation in B-trees; both show up as latency problems before they show up as errors.",
    "OLTP and OLAP have opposite access patterns, so analytics runs in a separate warehouse fed by ETL, usually with a star schema.",
    "Column stores read only the columns a query needs, compress them heavily with bitmaps and run-length encoding, and process them in vectorized loops; writes are batched in an LSM-like way.",
  ],
  furtherReading: [
    { title: "The Log-Structured Merge-Tree (LSM-Tree) (O'Neil, Cheng, Gawlick and O'Neil, 1996)", note: "The original LSM-tree paper." },
    { title: "Bigtable: A Distributed Storage System for Structured Data (Chang et al., OSDI 2006)", note: "Introduced the memtable and SSTable terminology used by LevelDB, RocksDB, HBase and Cassandra." },
    { title: "C-Store: A Column-oriented DBMS (Stonebraker et al., VLDB 2005)", note: "The research system behind Vertica: column storage, multiple sort orders and a write-optimized store merged into a read-optimized one." },
    { title: "RocksDB Wiki", url: "https://github.com/facebook/rocksdb/wiki", note: "Practical documentation on compaction styles, Bloom filters, write stalls and tuning." },
  ],
};
