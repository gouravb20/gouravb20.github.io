// Deep dive: Chapter 1, Introduction and overview. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch1 = {
  hook: `<p>Your orders table has 200 million rows. Two queries arrive in the same minute. The checkout service asks for <code>order 81723</code> with every field, and it wants the answer in a millisecond. The finance dashboard asks for <code>total revenue per month in 2025</code>, which touches every row but only two of the thirty columns. The same database runs both, and one of them is going to be slow.</p>
<p>Which one depends on decisions you never see in SQL: whether a disk block holds whole rows or slices of one column, whether rows are stored in key order or wherever they landed, and whether an index points at a physical location or at another key. Those decisions belong to the <strong>storage engine</strong>, and this chapter is the map of them that the rest of the book fills in.</p>`,
  sections: [
    {
      id: "dbms-architecture",
      title: "Where the storage engine sits in a database",
      kicker: "The map",
      blocks: [
        {
          type: "problem",
          html: `<p>"The database is slow" is not a diagnosis. A query can be slow because the optimizer picked a bad plan, because the network is saturated, because a lock is held, or because every lookup reads ten pages from disk. Each of those lives in a different part of the system, and you can only reason about them if you know which part does what.</p>`,
        },
        {
          type: "text",
          html: `<p>Almost every database follows the same layered shape, even though the boundaries are fuzzier in real code than on a diagram. A request enters through the <strong>transport</strong> layer, which handles client connections and, in a distributed database, talks to other nodes. The <strong>query processor</strong> parses and validates the query, and its optimizer turns it into an execution plan: which index to use, which join order, whether to scan or seek. The <strong>execution engine</strong> runs that plan, locally or by shipping parts of it to other nodes.</p>
<p>At the bottom sits the <strong>storage engine</strong>. It knows nothing about SQL. Its job is to store, find and change records on disk safely while many transactions run at once. That is the subject of the whole of Part I.</p>`,
        },
        {
          type: "diagram",
          title: "The layers of a database management system",
          caption: "Requests flow down through the layers. The storage engine at the bottom is itself made of five cooperating components, and the next six chapters take them apart one by one.",
          svg: `<svg viewBox="0 0 600 360" role="img" aria-label="DBMS layers: transport, query processor, execution engine and storage engine with its five components, above the disk">
<defs><marker id="di1-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="230" y="8" width="140" height="30" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="300" y="28" text-anchor="middle" font-size="13" font-weight="700">Client</text>
<line x1="300" y1="38" x2="300" y2="53" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#di1-arrow)"/>
<rect x="40" y="55" width="520" height="36" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="300" y="78" text-anchor="middle" font-size="13"><tspan font-weight="700">Transport</tspan>: client and cluster communication</text>
<line x1="300" y1="91" x2="300" y2="103" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#di1-arrow)"/>
<rect x="40" y="105" width="520" height="36" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="300" y="128" text-anchor="middle" font-size="13"><tspan font-weight="700">Query processor</tspan>: parser, then optimizer, then plan</text>
<line x1="300" y1="141" x2="300" y2="153" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#di1-arrow)"/>
<rect x="40" y="155" width="520" height="36" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<text x="300" y="178" text-anchor="middle" font-size="13"><tspan font-weight="700">Execution engine</tspan>: local and remote execution</text>
<line x1="300" y1="191" x2="300" y2="203" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#di1-arrow)"/>
<rect x="40" y="205" width="520" height="95" rx="6" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/>
<text x="54" y="224" font-size="13" font-weight="700">Storage engine</text>
<rect x="52" y="234" width="92" height="54" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-4)"/>
<text x="98" y="257" text-anchor="middle" font-size="12">Transaction</text>
<text x="98" y="273" text-anchor="middle" font-size="12">manager</text>
<rect x="153" y="234" width="92" height="54" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-4)"/>
<text x="199" y="257" text-anchor="middle" font-size="12">Lock</text>
<text x="199" y="273" text-anchor="middle" font-size="12">manager</text>
<rect x="254" y="234" width="92" height="54" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-4)"/>
<text x="300" y="257" text-anchor="middle" font-size="12">Access</text>
<text x="300" y="273" text-anchor="middle" font-size="12">methods</text>
<rect x="355" y="234" width="92" height="54" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-4)"/>
<text x="401" y="257" text-anchor="middle" font-size="12">Buffer</text>
<text x="401" y="273" text-anchor="middle" font-size="12">manager</text>
<rect x="456" y="234" width="92" height="54" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-4)"/>
<text x="502" y="257" text-anchor="middle" font-size="12">Recovery</text>
<text x="502" y="273" text-anchor="middle" font-size="12">manager</text>
<line x1="300" y1="300" x2="300" y2="315" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#di1-arrow)"/>
<rect x="220" y="317" width="160" height="34" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="300" y="339" text-anchor="middle" font-size="13">Disk: data files and log</text>
</svg>`,
        },
        {
          type: "list",
          title: "The five storage engine components",
          items: [
            "<strong>Transaction manager</strong>: schedules transactions and makes sure each one leaves the database in a consistent state.",
            "<strong>Lock manager</strong>: grants and releases locks on database objects so concurrent transactions don't trample each other.",
            "<strong>Access methods</strong>: the on-disk data structures themselves, such as heap files, B-Trees and LSM Trees (Chapters 2 to 4, 6 and 7).",
            "<strong>Buffer manager</strong>: keeps hot pages in memory and decides which to evict (Chapter 5).",
            "<strong>Recovery manager</strong>: keeps the operation log and restores a consistent state after a crash (Chapter 5).",
          ],
        },
        {
          type: "realworld",
          items: [
            { org: "MySQL", title: "Pluggable storage engines", html: "MySQL makes the storage engine boundary explicit: the same SQL layer can sit on InnoDB (the default since 5.5), MyISAM, or MyRocks, a RocksDB-based engine built at Facebook. The same query can behave very differently depending on which engine owns the table." },
            { org: "MongoDB", title: "WiredTiger", html: "MongoDB acquired WiredTiger and made it the default storage engine in version 3.2. The query language and replication stayed the same; what changed underneath was page layout, compression and concurrency control." },
          ],
        },
        {
          type: "quiz",
          q: "A query that used to take 5 ms now takes 2 seconds, and EXPLAIN shows it switched from an index seek to a full table scan after statistics were refreshed. Which layer made the change?",
          options: ["Transport", "Query processor (optimizer)", "Buffer manager", "Recovery manager"],
          answer: 1,
          explain: "Choosing between a seek and a scan is a planning decision, made by the optimizer from table statistics. The storage engine just executes whichever access path it is handed. Knowing the layers tells you to look at statistics and plans, not at disks.",
        },
      ],
    },
    {
      id: "memory-vs-disk",
      title: "Memory-based versus disk-based engines",
      kicker: "First axis",
      blocks: [
        {
          type: "text",
          html: `<p>The first way to classify an engine is where the data primarily lives. A <strong>disk-based</strong> engine keeps the full dataset on disk and caches a working set of pages in memory. An <strong>in-memory</strong> engine keeps the full dataset in RAM and uses disk only to survive restarts.</p>
<p>It is tempting to think an in-memory database is just a disk-based one with a very large cache. It isn't. A disk-based engine must organize everything around fixed-size pages: it serializes records into bytes, packs them into pages, manages free space inside each page and tracks references between pages by page number. An in-memory engine can use ordinary pointers, variable-size allocations and data structures that would be terrible on disk, because following a pointer in RAM costs tens of nanoseconds while a random disk read costs microseconds to milliseconds.</p>`,
        },
        {
          type: "idea",
          html: `<p>An in-memory engine is not volatile by design. It stays durable the same way a disk-based one does: by writing a <strong>log</strong> to disk before acknowledging a change, and by periodically writing a <strong>checkpoint</strong> so the log can be trimmed.</p>`,
        },
        {
          type: "steps",
          title: "How an in-memory engine survives a restart",
          items: [
            "A write is applied to the in-memory structures and appended to a write-ahead log on disk. The client gets its acknowledgment only after the log record is durable.",
            "Log writes are sequential and can be batched: one disk flush can cover many transactions.",
            "Periodically, the engine writes a checkpoint, a backup copy of the data (often in sorted form) that reflects every log record up to some point.",
            "Log records older than the checkpoint are no longer needed and are discarded.",
            "After a crash, the engine loads the latest checkpoint and replays only the log written after it.",
          ],
        },
        {
          type: "text",
          html: `<p>The trade-off is cost and capacity, not durability. RAM costs far more per byte than SSD, so in-memory engines suit datasets that comfortably fit in memory, such as session stores, leaderboards, and hot transactional tables. Disk-based engines handle datasets much larger than memory, at the price of the page-management machinery the next chapters describe.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Redis", title: "Snapshots and an append-only file", html: "Redis keeps its dataset in memory. For durability it can write point-in-time snapshots (RDB files), an append-only file (AOF) of every write, or both. The AOF plays the role of the log and the snapshot plays the role of the checkpoint." },
            { org: "SQL Server", title: "In-Memory OLTP", html: "Memory-optimized tables in SQL Server live entirely in RAM, use lock-free structures instead of pages, and persist through the transaction log plus checkpoint files, which is exactly the log-and-checkpoint pattern above." },
          ],
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>Most "disk-based" databases spend their lives reading from memory: a well-sized buffer pool serves the vast majority of page reads. The difference that remains is structural. A disk-based engine still pays for page layouts, serialization and buffer management even when every page happens to be cached.</p>`,
        },
      ],
    },
    {
      id: "row-vs-column",
      title: "Row-oriented versus column-oriented layout",
      kicker: "Second axis",
      blocks: [
        {
          type: "problem",
          html: `<p>Disks and the OS hand out whole <strong>blocks</strong>, never single values. So the question "which values sit next to each other in a block?" decides how much useless data every query drags in. Store rows together and a one-column aggregate reads every column. Store columns together and fetching one whole record touches a file per column.</p>`,
        },
        {
          type: "text",
          html: `<p>In a <strong>row-oriented</strong> layout, all fields of a record are written next to each other, so a block holds a handful of complete rows. This is ideal when the application reads and writes whole records by key: load a user profile, insert an order, update an account. One block read brings everything about the record.</p>
<p>In a <strong>column-oriented</strong> layout, each column's values are stored contiguously, in a separate file or file segment. A query that touches two columns reads two files and ignores the rest. To put a record back together, the engine needs to know which value in each column belongs to which row: either every value carries the row key, or (more commonly) the position in the column is an implicit <strong>virtual ID</strong>, so value number 1,042 of every column belongs to the same row.</p>`,
        },
        {
          type: "text",
          html: `<h3>A worked example</h3>
<p>Take a table with 100 million rows and 10 columns, each 8 bytes, so 80 bytes per row and 8 GB in total. A 4 KB block holds about 51 rows in a row store, or 512 values of one column in a column store.</p>
<p>Now run <code>SUM(price)</code>. The row store has to read every block of the table, 8 GB, to get at 800 MB of prices. The column store reads only the price column: 800 MB, a tenth of the I/O, before any compression. Fetch a single row by key and the picture flips: the row store reads one block, while the column store reads ten, one per column file.</p>`,
        },
        {
          type: "diagram",
          title: "The same four rows, stored two ways",
          caption: "Highlighted cells are the values SUM(price) needs. The row store must read both blocks because prices are interleaved with every other column; the column store reads only the price file.",
          svg: `<svg viewBox="0 0 620 290" role="img" aria-label="Four product rows stored row-wise in two blocks versus column-wise in four column files">
<text x="20" y="22" font-size="13" font-weight="700">Row store: blocks of whole rows</text>
<text x="330" y="22" font-size="13" font-weight="700">Column store: a file per column</text>
<rect x="20" y="34" width="270" height="104" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-1)" stroke-width="2"/>
<rect x="30" y="46" width="62" height="36" style="fill: var(--dg-1-soft); stroke: var(--dg-line)"/><text x="61" y="69" text-anchor="middle" font-size="12">1</text>
<rect x="92" y="46" width="62" height="36" style="fill: var(--dg-1-soft); stroke: var(--dg-line)"/><text x="123" y="69" text-anchor="middle" font-size="12">Pen</text>
<rect x="154" y="46" width="62" height="36" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/><text x="185" y="69" text-anchor="middle" font-size="12">1.50</text>
<rect x="216" y="46" width="62" height="36" style="fill: var(--dg-1-soft); stroke: var(--dg-line)"/><text x="247" y="69" text-anchor="middle" font-size="12">120</text>
<rect x="30" y="90" width="62" height="36" style="fill: var(--dg-1-soft); stroke: var(--dg-line)"/><text x="61" y="113" text-anchor="middle" font-size="12">2</text>
<rect x="92" y="90" width="62" height="36" style="fill: var(--dg-1-soft); stroke: var(--dg-line)"/><text x="123" y="113" text-anchor="middle" font-size="12">Cup</text>
<rect x="154" y="90" width="62" height="36" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/><text x="185" y="113" text-anchor="middle" font-size="12">4.00</text>
<rect x="216" y="90" width="62" height="36" style="fill: var(--dg-1-soft); stroke: var(--dg-line)"/><text x="247" y="113" text-anchor="middle" font-size="12">35</text>
<rect x="20" y="148" width="270" height="104" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-1)" stroke-width="2"/>
<rect x="30" y="160" width="62" height="36" style="fill: var(--dg-1-soft); stroke: var(--dg-line)"/><text x="61" y="183" text-anchor="middle" font-size="12">3</text>
<rect x="92" y="160" width="62" height="36" style="fill: var(--dg-1-soft); stroke: var(--dg-line)"/><text x="123" y="183" text-anchor="middle" font-size="12">Ink</text>
<rect x="154" y="160" width="62" height="36" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/><text x="185" y="183" text-anchor="middle" font-size="12">9.25</text>
<rect x="216" y="160" width="62" height="36" style="fill: var(--dg-1-soft); stroke: var(--dg-line)"/><text x="247" y="183" text-anchor="middle" font-size="12">8</text>
<rect x="30" y="204" width="62" height="36" style="fill: var(--dg-1-soft); stroke: var(--dg-line)"/><text x="61" y="227" text-anchor="middle" font-size="12">4</text>
<rect x="92" y="204" width="62" height="36" style="fill: var(--dg-1-soft); stroke: var(--dg-line)"/><text x="123" y="227" text-anchor="middle" font-size="12">Mug</text>
<rect x="154" y="204" width="62" height="36" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/><text x="185" y="227" text-anchor="middle" font-size="12">6.00</text>
<rect x="216" y="204" width="62" height="36" style="fill: var(--dg-1-soft); stroke: var(--dg-line)"/><text x="247" y="227" text-anchor="middle" font-size="12">51</text>
<text x="362" y="50" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">id</text>
<text x="432" y="50" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">name</text>
<text x="502" y="50" text-anchor="middle" font-size="12" font-weight="700">price</text>
<text x="572" y="50" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">stock</text>
<rect x="330" y="58" width="64" height="152" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<rect x="400" y="58" width="64" height="152" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<rect x="470" y="58" width="64" height="152" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<rect x="540" y="58" width="64" height="152" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="362" y="84" text-anchor="middle" font-size="12">1</text><text x="362" y="120" text-anchor="middle" font-size="12">2</text><text x="362" y="156" text-anchor="middle" font-size="12">3</text><text x="362" y="192" text-anchor="middle" font-size="12">4</text>
<text x="432" y="84" text-anchor="middle" font-size="12">Pen</text><text x="432" y="120" text-anchor="middle" font-size="12">Cup</text><text x="432" y="156" text-anchor="middle" font-size="12">Ink</text><text x="432" y="192" text-anchor="middle" font-size="12">Mug</text>
<text x="502" y="84" text-anchor="middle" font-size="12">1.50</text><text x="502" y="120" text-anchor="middle" font-size="12">4.00</text><text x="502" y="156" text-anchor="middle" font-size="12">9.25</text><text x="502" y="192" text-anchor="middle" font-size="12">6.00</text>
<text x="572" y="84" text-anchor="middle" font-size="12">120</text><text x="572" y="120" text-anchor="middle" font-size="12">35</text><text x="572" y="156" text-anchor="middle" font-size="12">8</text><text x="572" y="192" text-anchor="middle" font-size="12">51</text>
<text x="155" y="276" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">SUM(price): read both blocks</text>
<text x="467" y="276" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">SUM(price): read the price file only</text>
</svg>`,
        },
        {
          type: "lab",
          id: "rowColumn",
          caption: "Pick a query and watch which values each layout pages in, then scale the table up and turn on compression to see the block counts diverge.",
        },
        {
          type: "text",
          html: `<p>Columns win twice more. Values of one type sitting side by side compress far better than mixed rows: a <code>country</code> column with a few hundred distinct values shrinks dramatically with dictionary or run-length encoding. And a tight array of same-typed values is exactly what modern CPUs process fastest, a batch at a time with SIMD instructions, which is called <strong>vectorized</strong> execution.</p>`,
        },
        {
          type: "callout",
          tone: "mistake",
          title: "Wide column is not column-oriented",
          html: `<p>Bigtable, HBase and Cassandra are often called "column stores", but they are <strong>wide column</strong> stores. Data is a sorted map keyed by row key, with columns grouped into <strong>column families</strong> that are stored together. Inside a family, the data for one row sits together, so the layout is row-wise per family. True column orientation, as in Vertica, ClickHouse or a Parquet file, stores every column separately.</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "Row-oriented", tone: "info", html: "Whole records together. Best for OLTP: point reads and writes of complete rows by key. PostgreSQL, MySQL InnoDB, SQLite." },
            { title: "Column-oriented", tone: "ok", html: "Each column separately. Best for OLAP: scans and aggregates over a few columns of many rows, heavy compression, vectorized processing. Vertica (descended from the C-Store research project), MonetDB, ClickHouse; Parquet and ORC files." },
          ],
        },
      ],
    },
    {
      id: "data-files",
      title: "How data files are organized",
      kicker: "Third axis",
      blocks: [
        {
          type: "text",
          html: `<p>Whatever the layout, records have to live in some file, and how they are arranged inside it is the next big choice. The book names three organizations for these <strong>data files</strong> (also called primary files).</p>
<ul>
<li><strong>Heap file</strong>: records go wherever there is room, usually in write order. Appending is trivial, but finding anything requires a separate index that maps keys to record locations.</li>
<li><strong>Hashed file</strong>: a hash of the key picks a bucket, and the record goes into that bucket. Point lookups are fast; range scans are hopeless, because adjacent keys land in unrelated buckets.</li>
<li><strong>Index-organized table (IOT)</strong>: the records are stored inside the index itself, in key order. A lookup by primary key finds the data at the end of the index search, with no extra hop, and a range scan reads neighbouring records from neighbouring pages.</li>
</ul>`,
        },
        {
          type: "text",
          html: `<p>The difference between a heap and an IOT shows up on every primary-key read. With a heap, the engine walks the index to find a location such as "page 7, slot 3", then reads page 7. With an IOT, the walk ends at the leaf that holds the record. That is one fewer page read per lookup, and for range scans the saving is much larger, because a heap scatters key-adjacent records across the file.</p>
<p>The price of an IOT is that records move. When a leaf splits, half its records go to a new page. Anything else that remembered "page 7, slot 3" is now wrong, which is the problem the next section is about.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "MySQL InnoDB", title: "Clustered on the primary key", html: "Every InnoDB table is an index-organized table: the rows live in the leaves of the primary key B-Tree, which InnoDB calls the clustered index. If you don't declare a primary key, InnoDB picks a unique non-null index or generates a hidden row ID." },
            { org: "PostgreSQL", title: "Heap tables", html: "PostgreSQL tables are heap files. Every index, including the primary key, stores a tuple identifier (a block number and an item offset within that block) that points into the heap." },
            { org: "SQLite", title: "Rowid and WITHOUT ROWID", html: "An ordinary SQLite table is stored as a B-Tree keyed by its integer rowid. A <code>WITHOUT ROWID</code> table is stored in a B-Tree keyed by its declared primary key instead, which makes it clustered on that key." },
            { org: "Oracle and SQL Server", title: "Both options", html: "Oracle offers heap tables and index-organized tables (the term IOT comes from Oracle). SQL Server tables are heaps unless they have a clustered index." },
          ],
        },
        {
          type: "quiz",
          q: "An events table is written 50,000 times a second and is read almost exclusively by full scans in a nightly batch job. Which data file organization fits best?",
          options: ["Index-organized table on event ID", "Heap file", "Hashed file on event ID", "It makes no difference"],
          answer: 1,
          explain: "Writes dominate and reads never look up individual keys, so the cheapest append wins. A heap file just puts each record where there is room. An IOT would pay to keep records in key order, and a hashed file buys fast point lookups that nobody performs.",
        },
      ],
    },
    {
      id: "index-files",
      title: "Index files, clustering and indirection",
      kicker: "Pointing at records",
      blocks: [
        {
          type: "text",
          html: `<p>An <strong>index</strong> maps search keys to the records that hold them. The index built over the primary key is the <strong>primary index</strong>; every other one is a <strong>secondary index</strong>. A table has at most one primary index but can have many secondary ones, and a secondary index can hold many entries for the same key, since many users can share a last name.</p>
<p>An index is <strong>clustered</strong> when the data records are physically stored in the order of its key. An IOT is clustered by definition, and primary indexes usually are. Secondary indexes are always nonclustered, because the data can only be sorted one way. "Primary" and "clustered" often coincide, but they are different properties: one is about which key, the other about physical order.</p>`,
        },
        {
          type: "problem",
          html: `<p>A secondary index entry has to lead to the record somehow. If it stores the record's physical location, it goes stale whenever the record moves: a page split, an update that makes the row too big for its page, or a compaction. If a table has six secondary indexes, one relocation means six index updates.</p>`,
        },
        {
          type: "diagram",
          title: "Two ways for a secondary index to find a record",
          caption: "Top: the index stores a physical location, so reads are one hop but every move rewrites every index. Bottom: the index stores the primary key, so reads go through the primary index but moves only touch the primary index.",
          svg: `<svg viewBox="0 0 620 230" role="img" aria-label="Direct offset versus primary key indirection for a secondary index">
<defs><marker id="di1-arrow2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-ink)"/></marker></defs>
<text x="20" y="26" font-size="13" font-weight="700">Direct offset</text>
<rect x="20" y="38" width="160" height="52" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="100" y="59" text-anchor="middle" font-size="12" font-weight="700">email index</text>
<text x="100" y="78" text-anchor="middle" font-size="12">ann@ → (page 7, slot 3)</text>
<line x1="180" y1="64" x2="226" y2="64" stroke-width="2" style="stroke: var(--dg-ink)" marker-end="url(#di1-arrow2)"/>
<rect x="230" y="38" width="160" height="52" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="310" y="59" text-anchor="middle" font-size="12" font-weight="700">data file</text>
<text x="310" y="78" text-anchor="middle" font-size="12">page 7: record id 42</text>
<text x="410" y="58" font-size="12" style="fill: var(--dg-ok)">reads: 1 index lookup</text>
<text x="410" y="78" font-size="12" style="fill: var(--dg-bad)">on move: update every index</text>
<text x="20" y="136" font-size="13" font-weight="700">Primary key indirection</text>
<rect x="20" y="148" width="160" height="52" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="100" y="169" text-anchor="middle" font-size="12" font-weight="700">email index</text>
<text x="100" y="188" text-anchor="middle" font-size="12">ann@ → id 42</text>
<line x1="180" y1="174" x2="226" y2="174" stroke-width="2" style="stroke: var(--dg-ink)" marker-end="url(#di1-arrow2)"/>
<rect x="230" y="148" width="160" height="52" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<text x="310" y="169" text-anchor="middle" font-size="12" font-weight="700">primary index on id</text>
<text x="310" y="188" text-anchor="middle" font-size="12">leaf holds record 42</text>
<text x="410" y="168" font-size="12" style="fill: var(--dg-bad)">reads: 2 index lookups</text>
<text x="410" y="188" font-size="12" style="fill: var(--dg-ok)">on move: update primary only</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>Neither choice is free. With direct offsets, a secondary-index read costs one index search plus one page read. With primary key indirection it costs one secondary-index search plus one full primary-index search, which is typically three or four more page accesses (most of them cached). In exchange, records can move freely: a leaf split in the primary index changes nothing in any secondary index. A <strong>hybrid</strong> stores both the offset and the primary key, tries the offset first, and falls back to the primary key if the offset turns out to be stale.</p>`,
        },
        {
          type: "lab",
          id: "indexIndirection",
          caption: "Slide the share of relocations and the number of secondary indexes and see where direct offsets stop paying off and primary key indirection (or the hybrid) wins.",
        },
        {
          type: "realworld",
          items: [
            { org: "MySQL InnoDB", title: "Secondary indexes store the primary key", html: "InnoDB secondary index entries contain the primary key columns, and a lookup through a secondary index finishes with a search of the clustered index. That is why InnoDB advice favours short primary keys: every secondary index repeats them." },
            { org: "PostgreSQL", title: "Indexes store tuple locations", html: "PostgreSQL indexes point straight at heap tuples. Because an update writes a new tuple version, normally every index needs a new entry. The heap-only tuple (HOT) optimization skips the index updates when no indexed column changed and the new version fits on the same page. Uber's 2016 engineering post on moving from PostgreSQL to MySQL cited this index write amplification as one of its reasons." },
          ],
        },
        {
          type: "compare",
          items: [
            { title: "Direct offsets", tone: "info", html: "Fewest page reads per secondary-index lookup, and entries are small. But every relocation (split, growing update, compaction) rewrites an entry in every index. Best when records rarely move or there are few indexes." },
            { title: "Primary key indirection", tone: "ok", html: "Records move freely without touching any secondary index. But every secondary read pays an extra primary-index search, and entries repeat the primary key, so a long key bloats every index. Best when records move often or there are many indexes." },
          ],
        },
        {
          type: "quiz",
          q: "A table has 8 secondary indexes, is updated constantly, and its rows often grow and move to new pages. Reads through secondary indexes are rare. Which design suits it?",
          options: ["Direct offsets", "Primary key indirection", "No secondary indexes at all", "A hashed data file"],
          answer: 1,
          explain: "Relocations are frequent and each one would rewrite 8 index entries under direct offsets. Primary key indirection confines relocation work to the primary index, and the extra lookup it costs on reads hardly matters when those reads are rare.",
        },
      ],
    },
    {
      id: "three-variables",
      title: "Buffering, mutability and ordering",
      kicker: "The three variables",
      blocks: [
        {
          type: "idea",
          html: `<p>Instead of memorizing dozens of storage structures, describe each one with three yes-or-no questions. Does it <strong>buffer</strong> writes in memory before they reach disk? Is it <strong>mutable</strong> (updating pages in place) or immutable? Does it keep records <strong>ordered</strong> by key? Almost every design in Part I is a different set of answers.</p>`,
        },
        {
          type: "text",
          html: `<p><strong>Buffering.</strong> Every on-disk structure buffers a little, because the smallest unit you can write is a block. The interesting question is whether a structure deliberately collects many changes in memory to write them together. An LSM Tree's memtable and the per-page update buffers of some B-Tree variants do exactly that, turning many small random writes into fewer large ones.</p>
<p><strong>Mutability.</strong> A mutable structure finds the page that holds a record, changes it and writes the page back to the same place. An immutable (append-only) one never modifies data once written: updates go somewhere new, either appended to a log or copied into a new page. Immutability makes writes sequential and crash safety simpler, but leaves old versions behind that must be cleaned up later.</p>
<p><strong>Ordering.</strong> If records are stored in key order, keys that are close are physically close, so a range scan reads contiguous pages. Storing records in insertion order makes writes cheaper but turns range queries into random reads.</p>`,
        },
        {
          type: "table",
          title: "Classic structures by the three variables",
          headers: ["Structure", "Buffering", "Mutable", "Ordered", "Chapter"],
          rows: [
            ["B-Tree", "no", "yes", "yes", "2 to 4"],
            ["Copy-on-write B-Tree (LMDB)", "no", "no", "yes", "6"],
            ["Lazy B-Tree (WiredTiger)", "yes", "yes", "yes", "6"],
            ["LSM Tree (RocksDB, Cassandra)", "yes", "no", "yes", "7"],
            ["Bitcask", "no", "no", "no", "7"],
            ["WiscKey", "yes (keys)", "no", "keys only", "7"],
          ],
          note: "These are simplifications: real engines mix techniques, but the labels predict their strengths and weaknesses well.",
        },
        {
          type: "text",
          html: `<h3>Deletion markers</h3>
<p>A recurring consequence of these choices is that deletes rarely free space immediately. Immutable structures cannot erase a record from a file they will never modify, so they write a <strong>tombstone</strong> that says "this key is deleted" and remove the old data later, during compaction. Many mutable engines do something similar for concurrency reasons: PostgreSQL leaves dead tuples behind until <code>VACUUM</code> reclaims them. If you have ever deleted half a table and seen the disk usage stay flat, this is why.</p>`,
        },
        {
          type: "quiz",
          q: "A structure keeps new writes in a sorted in-memory table, flushes it to disk as a new file when it fills, and never modifies files on disk. How does it answer the three questions?",
          options: [
            "Buffered, mutable, unordered",
            "Unbuffered, immutable, ordered",
            "Buffered, immutable, ordered",
            "Unbuffered, mutable, ordered",
          ],
          answer: 2,
          explain: "Collecting writes in memory first is buffering; never modifying files on disk is immutability; a sorted in-memory table flushed as sorted files is ordering. That is the profile of an LSM Tree, which Chapter 7 covers in depth.",
        },
      ],
    },
    {
      id: "interview",
      title: "Using this map in an interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "text",
          html: `<p>Storage questions rarely ask you to recite definitions. They ask you to choose: which database for this workload, why is this query slow, what happens to write throughput if we add another index. The vocabulary from this chapter lets you answer with mechanisms rather than brand names.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>When asked to pick or justify a storage engine, walk through the axes out loud:</p>
<ol>
<li><strong>Working set vs memory</strong>: does the hot data fit in RAM? If so, an in-memory store with a log and snapshots may be simplest.</li>
<li><strong>Access pattern</strong>: whole records by key (row-oriented) or aggregates over a few columns of many rows (column-oriented)?</li>
<li><strong>Read/write mix</strong>: write-heavy workloads favour buffered, immutable structures (LSM Trees); read-heavy point and range lookups favour mutable, ordered ones (B-Trees).</li>
<li><strong>Index cost</strong>: every secondary index is extra work on writes, and how it points at records (offset or primary key) decides what a row move costs.</li>
</ol>`,
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>A crisp way to show depth: "InnoDB clusters rows by primary key, so secondary-index reads take two B-Tree searches, but rows can move without touching secondary indexes. PostgreSQL uses heap tables, so index reads go straight to the tuple, but updates usually add entries to every index unless they qualify as HOT updates."</p>`,
        },
        {
          type: "quiz",
          q: "An interviewer asks why an analytics team gets 10x faster dashboards after copying data from PostgreSQL into Parquet files, even though both live on the same SSDs. Which answer is most complete?",
          options: [
            "Parquet files are stored in memory",
            "Columnar layout reads only the queried columns, compresses same-type values well and allows vectorized processing",
            "Parquet uses B-Trees and PostgreSQL does not",
            "PostgreSQL cannot read from SSDs efficiently",
          ],
          answer: 1,
          explain: "Analytical queries touch a few columns of many rows. A column format reads just those columns, compresses them much better than mixed rows, and lets the engine process tight arrays of values in batches. The hardware is the same; the bytes read and the CPU work per value are not.",
        },
      ],
    },
  ],
  takeaways: [
    "A database is layered: transport, query processor, execution engine, and at the bottom the storage engine with its transaction, lock, access-method, buffer and recovery components.",
    "In-memory engines are not volatile by design: they log every change and checkpoint periodically, exactly like disk-based engines, but skip the page-management machinery.",
    "Row stores keep whole records together for OLTP; column stores keep each column together for scans, compression and vectorized execution. Wide column stores (Bigtable, HBase) are not column-oriented.",
    "Data files are heaps, hashed files or index-organized tables. IOTs (InnoDB) save a hop on primary-key reads and make range scans sequential, at the cost of records that move.",
    "Secondary indexes point at records by physical offset (fast reads, every move rewrites every index) or by primary key (an extra lookup, but moves are cheap).",
    "Buffering, mutability and ordering describe almost every storage structure: B-Trees are mutable and ordered, LSM Trees are buffered, immutable and ordered, Bitcask is immutable and unordered.",
    "Deletes in immutable (and many MVCC) engines leave tombstones or dead versions behind, so space comes back only after compaction or vacuum.",
  ],
  furtherReading: [
    { title: "C-Store: A Column-oriented DBMS (Stonebraker et al., 2005)", note: "The research system behind Vertica and much of the modern case for column stores." },
    { title: "Bigtable: A Distributed Storage System for Structured Data (Chang et al., 2006)", note: "Where the wide column model, column families and SSTables were popularized." },
    { title: "MySQL Reference Manual: Clustered and Secondary Indexes", url: "https://dev.mysql.com/doc/refman/8.0/en/innodb-index-types.html", note: "How InnoDB clusters rows by primary key and what secondary index entries contain." },
  ],
};
