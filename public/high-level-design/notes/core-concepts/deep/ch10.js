// Deep dive: Chapter 10, How indexes work. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch10 = {
  hook: `<p>Your login endpoint runs <code>SELECT * FROM users WHERE email = ?</code>. With ten thousand users it returns in a millisecond and nobody thinks about it. Two years later there are fifty million users, the same query takes several seconds, login p99 is on fire, and the database CPU is pinned at 100% even though each request asks for exactly one row.</p>
<p>The query did not change. What changed is that the database has no way to find that one row except by looking at all fifty million of them. An index is the structure that lets it jump straight to the right place, and the choice of index structure (B-tree, LSM tree or hash) decides how fast reads are, how expensive writes become, and which queries are possible at all.</p>`,
  sections: [
    {
      id: "full-scans",
      title: "Why finding one row can mean reading the whole table",
      kicker: "The problem",
      blocks: [
        {
          type: "problem",
          html: `<p>A table is stored as a pile of fixed-size <strong>pages</strong> on disk (8 KB in PostgreSQL, 16 KB by default in MySQL's InnoDB). New rows go wherever there is room, so the rows are in no useful order. Asking for <code>email = 'ana@example.com'</code> gives the database no hint about which page holds it, so it must read every page and check every row.</p>`,
        },
        {
          type: "text",
          html: `<p>Put numbers on it. Fifty million rows at about 100 rows per page is 500,000 pages, roughly 4 GB. Even reading those pages sequentially at 0.01 ms each takes about five seconds, and that is for a single query. Run a few hundred of those per second and no amount of hardware keeps up. The cost of the query grows with the size of the table, not with the size of the answer.</p>
<p>An <strong>index</strong> is a second, separate structure, organised by the values of one or more columns, that stores where each row lives. Instead of scanning, the database consults the index, learns "page 81,442, slot 7", and reads that page. A handful of page reads replaces half a million.</p>`,
        },
        {
          type: "text",
          html: `<h3>Nothing is free: what every index costs</h3>
<p>The index is a copy of the indexed column plus a pointer for every row, so it takes real disk space, sometimes a large fraction of the table itself. Worse for busy systems, it must be kept exactly in sync: every <code>INSERT</code> adds an entry to every index on the table, every <code>DELETE</code> removes one, and every <code>UPDATE</code> that changes an indexed column moves one. A table with eight indexes does roughly nine writes for each logical write.</p>
<p>That is why "index every column" is wrong. You index for the queries your endpoints actually run, and you accept the write cost only where a read pattern pays for it. An append-only log table that is rarely queried, or a lookup table with 50 rows that fits in one page, may be better with no secondary index at all.</p>`,
        },
        {
          type: "lab",
          id: "indexScan",
          caption: "Run a point query and a range query with no index, a B-tree, a hash index and an LSM tree. Count the pages each one reads, and note which index types cannot serve the range query at all.",
        },
        {
          type: "keypoints",
          items: [
            "Without an index the database reads every page: cost grows with the table, not the result.",
            "An index maps column values to row locations, turning O(N) page reads into a few.",
            "Each index costs disk space and an extra write on every insert, delete and relevant update.",
          ],
        },
      ],
    },
    {
      id: "b-trees",
      title: "B-trees: a sorted tree only three or four pages deep",
      kicker: "The default index",
      blocks: [
        {
          type: "idea",
          html: `<p>Keep the index keys <strong>sorted</strong> in a tree whose nodes are exactly one disk page. Because a page holds hundreds of keys, every node has hundreds of children, so even billions of rows sit just three or four levels below the root.</p>`,
        },
        {
          type: "text",
          html: `<p>A B-tree node is a page full of sorted keys with child pointers between them. To find a key you start at the root, binary-search the keys in that page to pick the right child, read that child page, and repeat until you reach a leaf. Every leaf sits at the same depth, so every lookup costs the same number of page reads.</p>
<p>Almost every relational database actually uses the <strong>B+ tree</strong> variant: inner nodes hold only keys and child pointers (so more of them fit per page), all entries live in the leaves, and each leaf points to its right-hand neighbour. That last detail matters for ranges: find the first matching key with one descent, then walk sideways along the leaves until you pass the end of the range.</p>`,
        },
        {
          type: "diagram",
          title: "A B+ tree lookup for key 60",
          caption: "One descent from the root to a leaf finds key 60 (highlighted path). Linked leaves let a range query keep reading sideways without going back up the tree.",
          svg: `<svg viewBox="0 0 600 260" role="img" aria-label="A three-level B+ tree with linked leaves and a highlighted lookup path">
<defs><marker id="cc10-arr1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="240" y="20" width="120" height="36" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="300" y="43" text-anchor="middle" font-size="13" font-weight="700">50 | 100</text>
<text x="20" y="43" font-size="12" style="fill: var(--dg-muted)">Root (in memory)</text>
<line x1="265" y1="56" x2="100" y2="100" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<line x1="300" y1="56" x2="300" y2="100" stroke-width="3" style="stroke: var(--dg-2)"/>
<line x1="335" y1="56" x2="500" y2="100" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<rect x="60" y="100" width="80" height="34" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="100" y="122" text-anchor="middle" font-size="13">25</text>
<rect x="260" y="100" width="80" height="34" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="300" y="122" text-anchor="middle" font-size="13" font-weight="700">75</text>
<rect x="460" y="100" width="80" height="34" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="500" y="122" text-anchor="middle" font-size="13">125</text>
<line x1="85" y1="134" x2="60" y2="180" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<line x1="115" y1="134" x2="155" y2="180" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<line x1="285" y1="134" x2="250" y2="180" stroke-width="3" style="stroke: var(--dg-2)"/>
<line x1="315" y1="134" x2="345" y2="180" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<line x1="485" y1="134" x2="440" y2="180" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<line x1="515" y1="134" x2="535" y2="180" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<rect x="20" y="180" width="80" height="34" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="1.5"/>
<text x="60" y="202" text-anchor="middle" font-size="12">1&#8211;24</text>
<rect x="115" y="180" width="80" height="34" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="1.5"/>
<text x="155" y="202" text-anchor="middle" font-size="12">25&#8211;49</text>
<rect x="210" y="180" width="80" height="34" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2.5"/>
<text x="250" y="202" text-anchor="middle" font-size="12" font-weight="700">50&#8211;74</text>
<rect x="305" y="180" width="80" height="34" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="1.5"/>
<text x="345" y="202" text-anchor="middle" font-size="12">75&#8211;99</text>
<rect x="400" y="180" width="80" height="34" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="1.5"/>
<text x="440" y="202" text-anchor="middle" font-size="12">100&#8211;124</text>
<rect x="495" y="180" width="80" height="34" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="1.5"/>
<text x="535" y="202" text-anchor="middle" font-size="12">125+</text>
<line x1="100" y1="197" x2="114" y2="197" stroke-width="1.5" marker-end="url(#cc10-arr1)" style="stroke: var(--dg-muted)"/>
<line x1="195" y1="197" x2="209" y2="197" stroke-width="1.5" marker-end="url(#cc10-arr1)" style="stroke: var(--dg-muted)"/>
<line x1="290" y1="197" x2="304" y2="197" stroke-width="1.5" marker-end="url(#cc10-arr1)" style="stroke: var(--dg-muted)"/>
<line x1="385" y1="197" x2="399" y2="197" stroke-width="1.5" marker-end="url(#cc10-arr1)" style="stroke: var(--dg-muted)"/>
<line x1="480" y1="197" x2="494" y2="197" stroke-width="1.5" marker-end="url(#cc10-arr1)" style="stroke: var(--dg-muted)"/>
<text x="300" y="244" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">Leaves hold the keys and row pointers, and each links to the next.</text>
</svg>`,
        },
        {
          type: "text",
          html: `<h3>Why the tree stays so shallow</h3>
<p>With an 8 KB page and a key plus pointer of roughly 20 bytes, one node holds about 400 entries. One level indexes 400 keys, two levels 160,000, three levels 64 million, and four levels about 25 billion. A billion-row table is four levels deep.</p>
<p>The top of the tree is tiny: the root plus its 400 children is about 3 MB, so it always stays in the database's buffer cache. A point lookup therefore usually costs one or two real disk reads (the leaf, and then the table page the leaf points to), not four. That is the difference between milliseconds and seconds.</p>
<p>When an insert lands in a full leaf, the leaf <strong>splits</strong> into two half-full pages and pushes a separator key into its parent. Splits ripple upward only rarely, and a root split is the only way the tree grows taller, which keeps every leaf at the same depth no matter what order keys arrive in.</p>`,
        },
        {
          type: "table",
          title: "B-tree depth with ~400 entries per page",
          headers: ["Levels", "Keys it can index", "Pages read per lookup (cold)"],
          rows: [
            ["1", "400", "1"],
            ["2", "160,000", "2"],
            ["3", "64,000,000", "3"],
            ["4", "25,600,000,000", "4"],
          ],
          note: "In practice the upper one or two levels are cached, so real disk reads per lookup are usually one or two.",
        },
        {
          type: "text",
          html: `<p>Sorted order is what makes the B-tree the general-purpose default. The same structure answers equality (<code>email = ?</code>), ranges (<code>created_at &gt; ?</code>), prefixes (<code>name LIKE 'Gar%'</code>) and <code>ORDER BY</code> on the indexed column without a separate sort. PostgreSQL builds a B-tree automatically for every primary key and <code>UNIQUE</code> constraint, InnoDB stores whole tables as B+ trees, and MongoDB, SQLite and SQL Server indexes are B-trees too.</p>`,
        },
        {
          type: "quiz",
          q: "A B-tree index over 2 billion rows has about 400 entries per page. A point lookup reads about how many index pages from disk, assuming the top two levels are cached?",
          options: ["About 1 or 2", "About 11 (log base 2 of 2,000)", "About 31 (log base 2 of 2 billion)", "About 2 million"],
          answer: 0,
          explain: "400^3 is 64 million and 400^4 is 25.6 billion, so 2 billion keys need 4 levels. With the root and second level in memory, only the lower two levels are read from disk. Binary-tree depth (about 31) is the wrong mental model: the fan-out is hundreds, not two.",
        },
      ],
    },
    {
      id: "clustered-and-secondary",
      title: "Where the row lives: clustered, secondary and selective indexes",
      kicker: "How lookups finish",
      blocks: [
        {
          type: "text",
          html: `<p>An index leaf tells you where the row is, but the row itself still has to be fetched. How that happens depends on how the table is stored, and it explains why the same query plan can cost very different amounts in different databases.</p>
<p>A <strong>primary</strong> or <strong>clustered</strong> index decides the physical order of the rows: the table <em>is</em> the index. In InnoDB the table is a B+ tree keyed by the primary key, and the leaves contain the full rows. A <strong>secondary</strong> index is any other index; its leaves hold the indexed value plus a way to reach the row.</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "MySQL InnoDB", tone: "info", html: "Rows live in the primary key's B+ tree. Secondary index leaves store the <strong>primary key value</strong>, so a lookup by email descends the email index, gets the id, then descends the primary key tree. Two tree walks per row; short primary keys keep every secondary index smaller." },
            { title: "PostgreSQL", tone: "info", html: "Rows live in an unordered heap. Every index, including the primary key's, stores a physical row address (page and slot). A lookup is one tree walk plus one heap page read, but updates that move a row may need to touch the indexes." },
          ],
        },
        {
          type: "text",
          html: `<p>The extra step is cheap for one row and expensive for ten thousand: each row costs a random read. That is why the next chapter's <em>covering indexes</em> matter, and why a planner will sometimes ignore your index entirely.</p>
<h3>Selectivity: when the planner skips your index</h3>
<p>An index pays off when it narrows the result to a small fraction of the table. An index on <code>user_id</code> or <code>email</code>, with millions of distinct values, narrows a lookup to one or a few rows. An index on <code>is_active</code>, where 95% of rows are true, narrows almost nothing: following 95% of the table through the index means a random read per row, which is slower than just scanning the pages in order.</p>
<p>Query planners know this. They keep statistics on how many distinct values each column has and how they are distributed, estimate how many rows a filter returns, and choose a sequential scan when the index would not help. A low-cardinality index then costs write overhead on every insert and is never used.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "PostgreSQL", title: "Planner statistics", html: "<code>ANALYZE</code> samples each table and records per-column statistics such as the number of distinct values and the most common values. The planner uses them to estimate row counts and decide between an index scan, a bitmap scan and a sequential scan." },
            { org: "MySQL InnoDB", title: "Clustered primary key", html: "Because rows are stored in primary-key order, a random UUID primary key scatters inserts across the whole tree and causes many page splits, while an auto-increment key appends to the right edge. This is a common reason teams prefer sequential or time-ordered ids in InnoDB." },
          ],
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>Best index candidates: high-cardinality columns that appear in <code>WHERE</code>, <code>JOIN</code> or <code>ORDER BY</code> clauses of frequent queries. Poor candidates: booleans, status fields with three values, and columns only touched by a nightly report.</p>`,
        },
      ],
    },
    {
      id: "lsm-trees",
      title: "LSM trees: making writes sequential",
      kicker: "Write-heavy workloads",
      blocks: [
        {
          type: "problem",
          html: `<p>A B-tree updates pages <em>in place</em>. Inserting a 100-byte row into a random spot of a large index means reading the right leaf, modifying it and eventually writing the whole 8 KB page back, plus a log record. At hundreds of thousands of writes per second (metrics, click events, IoT readings) those scattered page writes become the bottleneck.</p>`,
        },
        {
          type: "idea",
          html: `<p>A <strong>log-structured merge tree</strong> never updates data in place. It collects writes in memory, writes them to disk in large sorted batches, and cleans up old versions later in the background. Every disk write becomes a big sequential append.</p>`,
        },
        {
          type: "steps",
          title: "The write path",
          items: [
            "Append the write to a <strong>write-ahead log</strong> on disk, so it survives a crash. This is sequential and cheap.",
            "Insert it into the <strong>memtable</strong>, an in-memory sorted structure such as a skip list or balanced tree. The write is now acknowledged.",
            "When the memtable reaches a size limit (tens of MB), freeze it and write it out as an immutable, sorted file: an <strong>SSTable</strong> (sorted string table). Start a fresh memtable and discard the old log segment.",
            "In the background, <strong>compaction</strong> merges SSTables into larger ones, keeping only the newest version of each key and dropping deleted keys.",
          ],
        },
        {
          type: "diagram",
          title: "How an LSM tree writes and reads",
          caption: "Writes go to the log and the memtable, then flush to immutable SSTables that compaction merges. A read checks the newest data first and uses Bloom filters to skip files that cannot contain the key.",
          svg: `<svg viewBox="0 0 620 280" role="img" aria-label="LSM tree write path through memtable and SSTables, and read path checking newest first">
<defs><marker id="cc10-arr2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="10" y="70" width="70" height="40" rx="6" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="2"/>
<text x="45" y="95" text-anchor="middle" font-size="13" font-weight="700">Write</text>
<line x1="80" y1="82" x2="108" y2="62" stroke-width="1.5" marker-end="url(#cc10-arr2)" style="stroke: var(--dg-muted)"/>
<line x1="80" y1="98" x2="108" y2="125" stroke-width="1.5" marker-end="url(#cc10-arr2)" style="stroke: var(--dg-muted)"/>
<rect x="110" y="35" width="140" height="50" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="180" y="57" text-anchor="middle" font-size="13" font-weight="700">Memtable</text>
<text x="180" y="75" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">sorted, in RAM</text>
<rect x="110" y="105" width="140" height="44" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="180" y="125" text-anchor="middle" font-size="13">WAL</text>
<text x="180" y="141" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">append-only, disk</text>
<line x1="250" y1="55" x2="298" y2="55" stroke-width="1.5" marker-end="url(#cc10-arr2)" style="stroke: var(--dg-muted)"/>
<text x="274" y="45" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">flush</text>
<rect x="300" y="35" width="130" height="30" rx="5" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<text x="365" y="55" text-anchor="middle" font-size="12">SSTable 3 (newest)</text>
<rect x="300" y="75" width="130" height="30" rx="5" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<text x="365" y="95" text-anchor="middle" font-size="12">SSTable 2</text>
<rect x="300" y="115" width="130" height="30" rx="5" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<text x="365" y="135" text-anchor="middle" font-size="12">SSTable 1 (oldest)</text>
<line x1="430" y1="90" x2="476" y2="90" stroke-width="1.5" marker-end="url(#cc10-arr2)" style="stroke: var(--dg-muted)"/>
<rect x="478" y="70" width="132" height="40" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="544" y="95" text-anchor="middle" font-size="12" font-weight="700">Merged SSTable</text>
<text x="544" y="130" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">compaction keeps the</text>
<text x="544" y="146" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">newest version only</text>
<line x1="10" y1="172" x2="610" y2="172" stroke-width="1" stroke-dasharray="4 4" style="stroke: var(--dg-line)"/>
<text x="20" y="221" font-size="13" font-weight="700">Read k</text>
<rect x="100" y="200" width="100" height="32" rx="5" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<text x="150" y="221" text-anchor="middle" font-size="12">memtable</text>
<rect x="230" y="200" width="100" height="32" rx="5" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<text x="280" y="221" text-anchor="middle" font-size="12">SSTable 3</text>
<rect x="360" y="200" width="100" height="32" rx="5" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<text x="410" y="221" text-anchor="middle" font-size="12">SSTable 2</text>
<rect x="490" y="200" width="100" height="32" rx="5" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<text x="540" y="221" text-anchor="middle" font-size="12">SSTable 1</text>
<line x1="72" y1="216" x2="98" y2="216" stroke-width="1.5" marker-end="url(#cc10-arr2)" style="stroke: var(--dg-muted)"/>
<line x1="200" y1="216" x2="228" y2="216" stroke-width="1.5" marker-end="url(#cc10-arr2)" style="stroke: var(--dg-muted)"/>
<line x1="330" y1="216" x2="358" y2="216" stroke-width="1.5" marker-end="url(#cc10-arr2)" style="stroke: var(--dg-muted)"/>
<line x1="460" y1="216" x2="488" y2="216" stroke-width="1.5" marker-end="url(#cc10-arr2)" style="stroke: var(--dg-muted)"/>
<text x="310" y="262" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">Stop at the first hit. A Bloom filter per SSTable skips files that cannot hold k.</text>
</svg>`,
        },
        {
          type: "text",
          html: `<h3>Reads pay for cheap writes</h3>
<p>Because SSTables are immutable, an updated key may exist in several files, and only the newest copy counts. A read checks the memtable, then the SSTables from newest to oldest, and stops at the first match. Deletes are written as a <strong>tombstone</strong> marker that hides older copies until compaction removes them.</p>
<p>Checking many files would be slow, so each SSTable carries a <strong>Bloom filter</strong>: a compact bit array that answers "definitely not here" or "maybe here". Most files are skipped without a disk read. A small sparse index inside each file then points to the right block. Range scans merge the sorted streams from all the files, which works but touches more data than one B-tree leaf walk.</p>
<p>Compaction is the bill that comes later. It rewrites data again and again as files are merged, consuming disk bandwidth and CPU that would otherwise serve queries, and the disk holds obsolete versions until it runs. Leveled compaction (the LevelDB and RocksDB style) keeps reads fast at the cost of more rewriting; size-tiered compaction rewrites less but leaves more files for reads to check.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Google Bigtable", title: "The 2006 paper", html: "Bigtable described the memtable, SSTables and compactions that later systems copied, building on the LSM-tree paper by O'Neil and colleagues (1996)." },
            { org: "RocksDB and LevelDB", title: "Embedded LSM engines", html: "LevelDB came out of Google; Facebook forked it into RocksDB, which now sits underneath many other systems as a storage engine, including MyRocks for MySQL and the storage layer of CockroachDB before it moved to its own Pebble engine." },
            { org: "Apache Cassandra and HBase", title: "Wide-column stores", html: "Both write to a commit log and memtable, flush SSTables (HFiles in HBase) and compact in the background, with Bloom filters to keep reads from checking every file." },
          ],
        },
        {
          type: "tradeoffs",
          prosLabel: "LSM tree wins",
          consLabel: "LSM tree pays",
          pros: [
            "Very high write throughput: all disk writes are large and sequential",
            "Good compression, since immutable sorted files compress well",
            "Fits SSD wear patterns better than many small in-place page writes",
          ],
          cons: [
            "Read amplification: a lookup may consult several structures",
            "Compaction competes with foreground traffic for I/O and can cause latency spikes",
            "Space amplification: old versions and tombstones linger until compacted",
          ],
        },
      ],
    },
    {
      id: "hash-indexes",
      title: "Hash indexes and choosing between the three",
      kicker: "Exact match only",
      blocks: [
        {
          type: "text",
          html: `<p>A <strong>hash index</strong> is a hash table from key to row location. Computing <code>hash(key)</code> leads straight to a bucket, so an exact-match lookup costs about one step regardless of table size. For a pure key-value workload that is as fast as an index gets.</p>
<p>The price is ordering. Hashing deliberately scatters neighbouring keys, so <code>ana@</code> and <code>anb@</code> land in unrelated buckets. A hash index cannot answer <code>created_at &gt; ?</code>, cannot do <code>LIKE 'ana%'</code>, and cannot return rows in sorted order. For any of those the database falls back to a scan.</p>
<p>In practice a B-tree lookup is only a few cached page reads, so the speed advantage is usually small, while the loss of ranges is permanent. That is why hash indexes are mostly found where the whole dataset is in memory and every access is by exact key.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Redis", title: "A hash table is the database", html: "Redis keeps its keyspace in an in-memory hash table, which is why <code>GET</code> is constant time. Ordered access needs a different structure, such as a sorted set." },
            { org: "Bitcask (Riak)", title: "Hash index over a log", html: "Bitcask appends every write to a log file on disk and keeps an in-memory hash map from each key to its latest offset. Reads are one seek, writes are appends, and the catch is that every key must fit in RAM." },
            { org: "PostgreSQL and InnoDB", title: "Niche, and automatic", html: "PostgreSQL offers <code>USING hash</code> indexes for equality only, and they have been crash-safe since version 10. InnoDB builds an <em>adaptive hash index</em> by itself over frequently accessed B-tree pages to speed up hot equality lookups." },
          ],
        },
        {
          type: "table",
          title: "Picking an index structure",
          headers: ["", "B-tree / B+ tree", "LSM tree", "Hash"],
          rows: [
            ["Point lookup", "A few page reads", "Memtable plus a few files (Bloom filters help)", "About one step"],
            ["Range and ORDER BY", "Excellent: walk the leaves", "Supported: merge sorted files", "Not supported"],
            ["Write cost", "Random in-place page writes", "Sequential appends, compaction later", "Cheap, but resizing can be costly"],
            ["Typical home", "PostgreSQL, MySQL, SQLite, MongoDB", "Cassandra, RocksDB, HBase, ScyllaDB", "Redis, Bitcask, in-memory maps"],
          ],
        },
        {
          type: "text",
          html: `<h3>Read amplification and write amplification</h3>
<p>Two terms let you compare the structures precisely. <strong>Write amplification</strong> is how many bytes hit the disk for each byte the application writes: a B-tree rewriting an 8 KB page for a 100-byte change has a high ratio, and an LSM tree pays its share each time compaction rewrites the data. <strong>Read amplification</strong> is how much work a lookup does: a B-tree reads one root-to-leaf path, while an LSM tree may consult the memtable and several files.</p>
<p>Roughly, B-trees favour reads and predictable latency, and LSM trees favour sustained write throughput. Neither is free, and the right answer depends on the read:write ratio of the workload.</p>`,
        },
        {
          type: "quiz",
          q: "You store sensor readings: 300,000 inserts per second, and queries ask for one sensor's readings over the last hour. Which storage structure fits best?",
          options: [
            "A hash index on sensor_id",
            "An LSM-tree store keyed by (sensor_id, timestamp)",
            "A B-tree on a boolean is_recent column",
            "No index; scan the table each time",
          ],
          answer: 1,
          explain: "The write rate calls for sequential, batched writes, and a key of (sensor_id, timestamp) keeps each sensor's readings sorted by time, so the hour-long range is one contiguous read. A hash index cannot do the time range, a boolean index has terrible selectivity, and scanning at this size is hopeless.",
        },
      ],
    },
    {
      id: "interview",
      title: "Using indexes in a design interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "text",
          html: `<p>In most product-design interviews, indexing comes up when you sketch the data model. The interviewer wants to hear that you connect each important endpoint to an index: "the feed endpoint filters posts by <code>author_id</code> and sorts by <code>created_at</code>, so I'll index those". Infrastructure-heavy interviews (design a key-value store, a metrics database) go further and expect you to pick between B-trees and LSM trees and justify it.</p>
<p>Two habits signal experience. First, size things: "a B-tree over 500 million rows is about four levels, so the lookup is a couple of disk reads at worst". Second, name the cost: "this table takes 20,000 writes per second, so I'll keep it to two indexes".</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>A strong answer to "how would you make this query fast?" covers:</p>
<ol>
<li>Which columns the query filters, joins and sorts on, and the index that serves them.</li>
<li>Why a B-tree: sorted, so equality, ranges and ordering all work, and only 3-4 levels deep.</li>
<li>The write and storage cost, and why you are not indexing everything.</li>
<li>If the workload is write-heavy (logs, metrics, events), an LSM-based store such as Cassandra or RocksDB, with Bloom filters and compaction as the trade-off.</li>
</ol>
<p>If you are asked about hash indexes, say they are great for exact matches and useless for ranges, which is why B-trees remain the default.</p>`,
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Proposing an index on a low-cardinality column such as <code>status</code> or <code>is_deleted</code> as the fix for a slow query. The planner will likely ignore it. If you need it, combine it with a selective column (next chapter) or use a partial index.</p>`,
        },
        {
          type: "quiz",
          q: "An interviewer says writes to your orders table got 40% slower after a teammate added six new indexes, but most queries got no faster. What is the best response?",
          options: [
            "Switch the table to a hash index for everything",
            "Check which indexes queries actually use and drop the unused or low-selectivity ones",
            "Add more indexes so the writes are spread out",
            "Move the table to an in-memory cache",
          ],
          answer: 1,
          explain: "Each index is maintained on every write, so six unused indexes are pure overhead. Index usage statistics (for example PostgreSQL's pg_stat_user_indexes) and query plans show which ones earn their keep. Indexes should follow real query patterns.",
        },
      ],
    },
  ],
  takeaways: [
    "Without an index, a query reads every page of the table; an index turns that into a few page reads at the cost of space and extra work on every write.",
    "B+ trees are the default: page-sized nodes with hundreds of children keep even billions of rows 3-4 levels deep, and sorted order serves equality, ranges and ORDER BY.",
    "Secondary indexes often need a second step to fetch the row (a primary-key lookup in InnoDB, a heap read in PostgreSQL), which is why fetching many rows through an index gets expensive.",
    "Low-selectivity indexes (booleans, small enums) are usually ignored by the planner and only slow down writes.",
    "LSM trees buffer writes in a memtable and flush sorted, immutable SSTables, trading read amplification and compaction for very high write throughput.",
    "Hash indexes give one-step exact matches but no ranges or sorting, so they live mostly in in-memory stores.",
  ],
  furtherReading: [
    { title: "PostgreSQL documentation: Index Types", url: "https://www.postgresql.org/docs/current/indexes-types.html", note: "B-tree, hash, GiST, GIN, BRIN and when each one is used." },
    { title: "The Log-Structured Merge-Tree (O'Neil, Cheng, Gawlick, O'Neil, 1996)", note: "The original LSM-tree paper." },
    { title: "Bigtable: A Distributed Storage System for Structured Data (Chang et al., 2006)", note: "Memtables, SSTables and compaction in a production system." },
  ],
};
