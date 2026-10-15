// Deep dive: Chapter 7, Log-structured storage. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch7 = {
  hook: `<p>A fleet of sensors sends 200,000 readings a second, each a small record keyed by device and timestamp. Put them in a B-Tree and every insert lands in some leaf somewhere, reads the page if it isn't cached, modifies a few bytes, and eventually writes the whole page back. The disk spends its life doing small random writes, and the SSD's garbage collector quietly multiplies them.</p>
<p>Now try the opposite: never update anything in place. Collect writes in memory, sorted, and when a few megabytes accumulate, write them out as one sorted, immutable file in a single sequential stream. Writes become nearly free. The bill arrives elsewhere: a read may have to check many files, deleted data lingers, and something has to merge all those files in the background. This chapter is about that bargain, the <strong>Log-Structured Merge Tree</strong>, and the machinery that makes it work in RocksDB, Cassandra, LevelDB and HBase.</p>`,
  sections: [
    {
      id: "lsm-basics",
      title: "The LSM Tree: buffer, flush, merge",
      kicker: "The key idea",
      blocks: [
        {
          type: "idea",
          html: `<p>Buffer writes in a sorted in-memory table, the <strong>memtable</strong>. When it fills, write it to disk as an immutable sorted file (an <strong>SSTable</strong>) in one sequential pass. Never modify files on disk; instead, periodically merge them in the background, which is called <strong>compaction</strong>. Every disk write is sequential, and no page is ever rewritten in place.</p>`,
        },
        {
          type: "diagram",
          title: "Write path of a leveled LSM Tree",
          caption: "A write goes to the WAL and the active memtable. A full memtable becomes immutable and is flushed to level 0, where tables may overlap. Compaction merges tables downward into levels whose tables cover disjoint key ranges.",
          svg: `<svg viewBox="0 0 620 285" role="img" aria-label="LSM Tree write path: put goes to WAL and memtable, memtable flushes to level 0, compaction into levels 1 and 2">
<defs><marker id="di7-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-ink)"/></marker></defs>
<rect x="20" y="20" width="580" height="80" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="30" y="38" font-size="12" style="fill: var(--dg-muted)">memory</text>
<text x="40" y="70" font-size="13" font-weight="700">put(k, v)</text>
<line x1="104" y1="66" x2="146" y2="66" stroke-width="2" style="stroke: var(--dg-ink)" marker-end="url(#di7-arrow)"/>
<rect x="150" y="48" width="180" height="36" rx="5" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="240" y="71" text-anchor="middle" font-size="12">active memtable</text>
<line x1="330" y1="66" x2="366" y2="66" stroke-width="2" style="stroke: var(--dg-ink)" marker-end="url(#di7-arrow)"/>
<rect x="370" y="48" width="210" height="36" rx="5" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="475" y="71" text-anchor="middle" font-size="12">immutable memtable (flushing)</text>
<rect x="20" y="115" width="580" height="162" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="30" y="133" font-size="12" style="fill: var(--dg-muted)">disk</text>
<line x1="62" y1="78" x2="62" y2="146" stroke-width="2" style="stroke: var(--dg-ink)" marker-end="url(#di7-arrow)"/>
<rect x="30" y="150" width="100" height="34" rx="5" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/>
<text x="80" y="172" text-anchor="middle" font-size="12">WAL</text>
<line x1="475" y1="84" x2="382" y2="146" stroke-width="2" style="stroke: var(--dg-ink)" marker-end="url(#di7-arrow)"/>
<text x="462" y="110" font-size="12">flush</text>
<text x="160" y="172" font-size="13" font-weight="700">L0</text>
<rect x="190" y="150" width="120" height="34" rx="5" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/><text x="250" y="172" text-anchor="middle" font-size="12">SST: c to x</text>
<rect x="320" y="150" width="120" height="34" rx="5" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/><text x="380" y="172" text-anchor="middle" font-size="12">SST: a to r</text>
<text x="455" y="172" font-size="12" style="fill: var(--dg-muted)">ranges overlap</text>
<text x="160" y="217" font-size="13" font-weight="700">L1</text>
<rect x="190" y="195" width="90" height="34" rx="5" style="fill: var(--dg-5-soft); stroke: var(--dg-5)"/><text x="235" y="217" text-anchor="middle" font-size="12">a to f</text>
<rect x="286" y="195" width="90" height="34" rx="5" style="fill: var(--dg-5-soft); stroke: var(--dg-5)"/><text x="331" y="217" text-anchor="middle" font-size="12">g to m</text>
<rect x="382" y="195" width="90" height="34" rx="5" style="fill: var(--dg-5-soft); stroke: var(--dg-5)"/><text x="427" y="217" text-anchor="middle" font-size="12">n to s</text>
<rect x="478" y="195" width="90" height="34" rx="5" style="fill: var(--dg-5-soft); stroke: var(--dg-5)"/><text x="523" y="217" text-anchor="middle" font-size="12">t to z</text>
<text x="160" y="260" font-size="13" font-weight="700">L2</text>
<rect x="190" y="240" width="60" height="30" rx="5" style="fill: var(--dg-6-soft); stroke: var(--dg-6)"/><text x="220" y="260" text-anchor="middle" font-size="12">a-c</text>
<rect x="254" y="240" width="60" height="30" rx="5" style="fill: var(--dg-6-soft); stroke: var(--dg-6)"/><text x="284" y="260" text-anchor="middle" font-size="12">d-f</text>
<rect x="318" y="240" width="60" height="30" rx="5" style="fill: var(--dg-6-soft); stroke: var(--dg-6)"/><text x="348" y="260" text-anchor="middle" font-size="12">g-j</text>
<rect x="382" y="240" width="60" height="30" rx="5" style="fill: var(--dg-6-soft); stroke: var(--dg-6)"/><text x="412" y="260" text-anchor="middle" font-size="12">k-o</text>
<rect x="446" y="240" width="60" height="30" rx="5" style="fill: var(--dg-6-soft); stroke: var(--dg-6)"/><text x="476" y="260" text-anchor="middle" font-size="12">p-t</text>
<rect x="510" y="240" width="60" height="30" rx="5" style="fill: var(--dg-6-soft); stroke: var(--dg-6)"/><text x="540" y="260" text-anchor="middle" font-size="12">u-z</text>
</svg>`,
        },
        {
          type: "steps",
          title: "The write path",
          items: [
            "Append the write to the write-ahead log, so it survives a crash before the memtable reaches disk.",
            "Insert it into the active memtable, a sorted in-memory structure (usually a skiplist).",
            "When the memtable reaches its size limit, switch it to read-only and start a fresh one, so writes never wait for the flush.",
            "Flush the read-only memtable to disk as a new sorted, immutable table. Once the flush is durable, the WAL segment that covered it can be deleted.",
            "In the background, compaction merges tables to keep their number, and therefore read cost, under control.",
          ],
        },
        {
          type: "text",
          html: `<p>The original 1996 LSM Tree paper described a <strong>two-component</strong> design: one memory component and one disk component (a B-Tree-like structure), merged continuously as the memory part filled. Modern systems are <strong>multicomponent</strong>: many disk tables, flushed independently and merged by compaction. Flushing becomes trivial (just write a sorted file), at the price of having to manage how many files exist and how they overlap.</p>
<p>In the book's three-variable terms from Chapter 1, an LSM Tree is <strong>buffered</strong> (the memtable), <strong>immutable</strong> (tables are never modified) and <strong>ordered</strong> (memtables and tables are sorted). Each property contributes: buffering batches writes, immutability makes them sequential, and ordering makes merging cheap and range scans possible.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "LevelDB and RocksDB", title: "Embedded LSM engines", html: "LevelDB, written at Google, is the compact reference design: skiplist memtable, WAL, sorted tables and leveled compaction. RocksDB, forked from it at Facebook, adds many compaction styles, column families and tuning options, and sits under systems such as MyRocks and TiKV." },
            { org: "Apache Cassandra and HBase", title: "Distributed LSM stores", html: "Cassandra writes to a commit log and memtables and flushes SSTables; HBase does the same with a WAL, MemStores and HFiles. Both inherit the layout from Google's Bigtable paper." },
          ],
        },
      ],
    },
    {
      id: "reads-and-deletes",
      title: "Reads, tombstones and merge-iteration",
      kicker: "How reads work",
      blocks: [
        {
          type: "problem",
          html: `<p>Because nothing is updated in place, the same key can exist in many places at once: an old value in a level-2 table, a newer one in level 0, the newest in the memtable. And a delete can't erase a value sitting in an immutable file. A read has to find all candidate versions and decide which one is true.</p>`,
        },
        {
          type: "text",
          html: `<p>Deletes are writes. Deleting a key inserts a <strong>tombstone</strong>, a special record that says "this key is deleted as of now". A read that finds the tombstone as the newest version reports the key as absent, even though older values still exist further down. <strong>Range tombstones</strong> delete a whole interval of keys with one record, for example everything from <code>user:100</code> (inclusive) to <code>user:200</code> (exclusive), which is far cheaper than writing a tombstone per key.</p>
<p>To decide which version wins, every record carries a timestamp or, more commonly inside one engine, a monotonically increasing sequence number. <strong>Reconciliation</strong> keeps the record with the highest one. Without that ordering information, two versions of a key would be indistinguishable.</p>`,
        },
        {
          type: "text",
          html: `<h3>Merge-iteration</h3>
<p>Range scans and compaction need to read several sorted sources as if they were one sorted stream. The tool is a <strong>min-heap</strong> (priority queue) holding the current head of each source's iterator. Repeatedly pop the smallest key, emit it, and push the next record from the same source. When several sources hold the same key, their records come out of the heap adjacent to each other and are reconciled on the spot. For N records from M sources, this costs O(N log M).</p>
<p>Worked example. An older table holds <code>a:1, b:1, d:4, e:5</code>; a newer table holds <code>b:2</code> and a tombstone for <code>d</code>. The heap yields <code>a</code> (only in the older table, emit <code>a:1</code>), then both <code>b</code> records (the newer wins, emit <code>b:2</code>), then both <code>d</code> records (the newest is a tombstone, emit nothing), then <code>e:5</code>. The merged view is <code>a:1, b:2, e:5</code>.</p>`,
        },
        {
          type: "lab",
          id: "mergeIteration",
          caption: "Step through a min-heap merging two sorted tables, reconcile duplicate keys by recency, and see how a tombstone and a range tombstone hide older values.",
        },
        {
          type: "callout",
          tone: "warning",
          title: "When can a tombstone be dropped?",
          html: `<p>A tombstone must survive until compaction has merged it with every older table that might still hold a value for that key, which in practice means until it reaches the bottom level. Drop it earlier and the older value, no longer shadowed, comes back to life. Distributed stores add another constraint: Cassandra keeps tombstones for at least <code>gc_grace_seconds</code> (10 days by default) so that replicas that missed the delete can learn about it through repair.</p>`,
        },
        {
          type: "quiz",
          q: "A key has a value in an L2 table, a tombstone in an L1 table, and a newer value in the memtable. What does a point read return?",
          options: [
            "The L2 value, because it is the oldest",
            "Nothing, because a tombstone exists",
            "The memtable value, because it is the newest version",
            "An error, because the versions conflict",
          ],
          answer: 2,
          explain: "Reconciliation picks the version with the highest sequence number. The memtable value was written after the delete, so the key exists again with that value. The tombstone only hides versions older than itself.",
        },
      ],
    },
    {
      id: "compaction",
      title: "Compaction: leveled versus size-tiered",
      kicker: "Keeping reads cheap",
      blocks: [
        {
          type: "text",
          html: `<p>Without compaction, every memtable flush adds a table, and a read for a missing key would have to check every one of them. Compaction merges tables with merge-iteration, keeps only the newest version of each key, drops tombstones when safe, and writes the result as new tables. The question is <em>which</em> tables to merge and when, and the two classic answers make opposite trade-offs.</p>`,
        },
        {
          type: "text",
          html: `<h3>Leveled compaction</h3>
<p>Level 0 receives memtable flushes, so its tables can overlap. From level 1 down, each level is a set of tables with <strong>disjoint key ranges</strong>, and each level is allowed to be about 10 times larger than the one above. When a level exceeds its budget, one of its tables is merged with the tables in the next level whose ranges overlap it. For example, with level 1 capped at 256 MB, level 2 holds about 2.5 GB, level 3 about 25 GB and level 4 about 256 GB.</p>
<p>Reads are cheap: below level 0, at most one table per level can contain a given key. Space overhead is small, since most data sits in the last level and only a little of it is obsolete. The cost is writing. Pushing one table down means rewriting it together with the roughly ten overlapping tables below, so each byte may be rewritten about ten times per level on its way to the bottom.</p>
<h3>Size-tiered compaction</h3>
<p>Size-tiered compaction groups tables of similar size. When enough tables of one size class accumulate (four, say), they are merged into one bigger table in the next tier. Each byte is rewritten only once per tier, so write amplification is much lower. But many tables with overlapping ranges coexist, so reads may check more of them, and merging the largest tables temporarily needs extra disk space about the size of the inputs. Very large tables can also wait a long time for enough peers to merge with, leaving obsolete data in them: <strong>table starvation</strong>.</p>`,
        },
        {
          type: "lab",
          id: "lsmTree",
          caption: "Write keys, flush memtables and run leveled or size-tiered compaction; delete keys to create tombstones, and look keys up newest-first with and without Bloom filters.",
        },
        {
          type: "compare",
          items: [
            { title: "Leveled", tone: "info", html: "Disjoint tables per level, each level about 10x the previous. Low read and space amplification, high write amplification. Default in LevelDB and RocksDB." },
            { title: "Size-tiered", tone: "warn", html: "Merge groups of similar-size tables into a bigger tier. Low write amplification; more tables per read, temporary space spikes, possible table starvation. The long-standing default in Cassandra; RocksDB's universal compaction follows the same idea." },
          ],
        },
        {
          type: "realworld",
          items: [
            { org: "Apache Cassandra", title: "Choose per table", html: "Cassandra lets each table pick a compaction strategy: size-tiered for write-heavy tables, leveled for read-heavy ones, and time-window compaction for time series, where whole windows expire together. Cassandra 5.0 added the Unified Compaction Strategy, which can be tuned between the two behaviours." },
            { org: "RocksDB", title: "Leveled with options", html: "RocksDB defaults to leveled compaction with a 10x size ratio between levels and offers universal (tiered) and FIFO compaction for workloads that favour write throughput or simple expiry." },
          ],
        },
        {
          type: "quiz",
          q: "A table receives a heavy stream of inserts and is read rarely, mostly by batch jobs. Disk space is plentiful. Which compaction strategy fits better?",
          options: ["Leveled", "Size-tiered", "No compaction at all", "Compaction only at level 0"],
          answer: 1,
          explain: "Size-tiered compaction rewrites each byte far fewer times, which matters most for a write-heavy table. Its weaknesses, more tables per read and temporary space overhead, are tolerable when reads are rare and space is plentiful.",
        },
      ],
    },
    {
      id: "amplification",
      title: "Read, write and space amplification",
      kicker: "Trade-offs",
      blocks: [
        {
          type: "text",
          html: `<p>Three numbers describe what any storage structure costs beyond the ideal.</p>
<ul>
<li><strong>Read amplification</strong>: how many tables, pages or disk reads one logical read needs.</li>
<li><strong>Write amplification</strong>: how many bytes are physically written per byte the application writes.</li>
<li><strong>Space amplification</strong>: how many bytes are stored per byte of live data.</li>
</ul>
<p>B-Trees have them too: a 100-byte update writes a whole page (write amplification), and pages are partly empty (space amplification), while reads are cheap. LSM Trees move the costs around depending on compaction.</p>`,
        },
        {
          type: "idea",
          html: `<p>The <strong>RUM conjecture</strong> says you can optimize at most two of Read overhead, Update overhead and Memory (space) overhead; improving two makes the third worse. It is a compact way to say there is no storage structure that is best at everything, only structures tuned for different workloads.</p>`,
        },
        {
          type: "table",
          title: "Back-of-envelope costs (size ratio T = 10, L = 4 levels)",
          headers: ["Structure", "Write amplification", "Runs checked per read", "Space amplification"],
          rows: [
            ["In-place B-Tree", "A page per small change", "1 path (one leaf read if internals are cached)", "About 1.3 to 1.5 (partly empty pages)"],
            ["Leveled LSM", "About T &times; L = 40 (worst case)", "About L = 4, plus level 0", "About 1 + 1/T = 1.1"],
            ["Size-tiered LSM", "About L = 4", "Up to T &times; L = 40", "Up to T in the worst case, during large merges"],
          ],
          note: "These are standard simplified models from the LSM literature, not measurements; real numbers depend heavily on key distribution, Bloom filters, caching and configuration.",
        },
        {
          type: "lab",
          id: "amplification",
          caption: "Change the size ratio and number of levels and compare an in-place B-Tree with leveled and size-tiered LSM Trees on read, update and memory overhead.",
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>Bloom filters (next section) are what make LSM read amplification tolerable in practice. "Runs checked per read" counts tables whose key range contains the key; a filter lets a point lookup skip nearly all of them after a few memory probes, so the real disk cost of a lookup is often one or two reads.</p>`,
        },
        {
          type: "quiz",
          q: "A team switches a RocksDB workload from leveled to universal (size-tiered style) compaction to cut SSD wear. What should they expect?",
          options: [
            "Lower write amplification, but more tables per read and larger temporary space needs",
            "Lower write, read and space amplification all at once",
            "No change, since compaction does not affect write volume",
            "Higher write amplification but faster reads",
          ],
          answer: 0,
          explain: "Tiered compaction rewrites data fewer times, which reduces bytes written and SSD wear. Per the RUM trade-off, the cost shows up elsewhere: more overlapping tables to consult on reads and more temporary disk space while big merges run.",
        },
      ],
    },
    {
      id: "sstables-and-filters",
      title: "SSTables, Bloom filters and skiplists",
      kicker: "Building blocks",
      blocks: [
        {
          type: "text",
          html: `<p>A <strong>Sorted String Table</strong> (SSTable) has two parts. The data part holds key-value records in key order, usually grouped into blocks of a few kilobytes that can be compressed and checksummed individually. The index part maps keys (typically the first or last key of each block) to block offsets, so a point lookup binary-searches the small index, reads one block and searches inside it. Because the file is sorted and immutable, range scans are sequential reads, merges are cheap, and the index can be cached aggressively.</p>`,
        },
        {
          type: "text",
          html: `<h3>Bloom filters</h3>
<p>Most tables don't contain the key you are looking for, and finding that out by reading their index and a block is wasted I/O. A <strong>Bloom filter</strong> answers "could this table contain key k?" from memory. It is an array of m bits and k hash functions. Adding a key sets the k bits it hashes to. Querying checks those k bits: if any is 0, the key was <strong>definitely never added</strong>; if all are 1, it <strong>might</strong> have been. False positives happen when other keys happened to set all k bits; false negatives cannot happen.</p>`,
        },
        {
          type: "diagram",
          title: "A 12-bit Bloom filter with three hash functions",
          caption: "Adding apple and pear set five bits. A query for plum hits a zero bit, so plum is certainly absent. A query for fig finds all three bits set by other keys: a false positive, costing one unnecessary table read.",
          svg: `<svg viewBox="0 0 620 200" role="img" aria-label="A 12-bit Bloom filter showing a definite miss and a false positive">
<text x="40" y="24" font-size="12">add apple: bits 1, 5, 9</text>
<text x="330" y="24" font-size="12">add pear: bits 3, 5, 10</text>
<text x="60" y="66" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">0</text>
<text x="104" y="66" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">1</text>
<text x="148" y="66" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">2</text>
<text x="192" y="66" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">3</text>
<text x="236" y="66" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">4</text>
<text x="280" y="66" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">5</text>
<text x="324" y="66" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">6</text>
<text x="368" y="66" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">7</text>
<text x="412" y="66" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">8</text>
<text x="456" y="66" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">9</text>
<text x="500" y="66" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">10</text>
<text x="544" y="66" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">11</text>
<rect x="40" y="74" width="40" height="36" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="60" y="97" text-anchor="middle" font-size="13">0</text>
<rect x="84" y="74" width="40" height="36" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/><text x="104" y="97" text-anchor="middle" font-size="13">1</text>
<rect x="128" y="74" width="40" height="36" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="148" y="97" text-anchor="middle" font-size="13">0</text>
<rect x="172" y="74" width="40" height="36" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/><text x="192" y="97" text-anchor="middle" font-size="13">1</text>
<rect x="216" y="74" width="40" height="36" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="236" y="97" text-anchor="middle" font-size="13">0</text>
<rect x="260" y="74" width="40" height="36" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/><text x="280" y="97" text-anchor="middle" font-size="13">1</text>
<rect x="304" y="74" width="40" height="36" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="324" y="97" text-anchor="middle" font-size="13">0</text>
<rect x="348" y="74" width="40" height="36" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)" stroke-width="2"/><text x="368" y="97" text-anchor="middle" font-size="13">0</text>
<rect x="392" y="74" width="40" height="36" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="412" y="97" text-anchor="middle" font-size="13">0</text>
<rect x="436" y="74" width="40" height="36" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/><text x="456" y="97" text-anchor="middle" font-size="13">1</text>
<rect x="480" y="74" width="40" height="36" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/><text x="500" y="97" text-anchor="middle" font-size="13">1</text>
<rect x="524" y="74" width="40" height="36" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="544" y="97" text-anchor="middle" font-size="13">0</text>
<text x="40" y="150" font-size="12" style="fill: var(--dg-ok)">query plum: bits 1, 7, 10. Bit 7 is 0, so plum is definitely absent.</text>
<text x="40" y="178" font-size="12" style="fill: var(--dg-bad)">query fig: bits 3, 9, 10. All set by other keys: "maybe", a false positive.</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>The false positive rate depends on bits per key and the number of hash functions. With n keys in m bits and k hashes, it is approximately <span class="formula">p &asymp; (1 &minus; e<sup>&minus;kn/m</sup>)<sup>k</sup></span>, minimized when <span class="formula">k = (m/n) ln 2</span>. Plugging in 10 bits per key gives k &asymp; 7 and p &asymp; 0.8%. A 1% rate needs about 9.6 bits per key, and each further 10x reduction costs about 4.8 more bits per key. So a table with 100 million keys spends about 120 MB of memory for a filter that rejects about 99% of lookups for absent keys.</p>`,
        },
        {
          type: "lab",
          id: "bloomFilter",
          caption: "Add keys to a small filter and query for definite misses and false positives, then switch to the scale view and tune bits per key and hash count against the false positive rate.",
        },
        {
          type: "text",
          html: `<h3>Skiplists</h3>
<p>The memtable needs to stay sorted under a stream of concurrent inserts. A <strong>skiplist</strong> is a sorted linked list with extra "express lane" levels: each node is given a random height, and higher levels skip over many nodes at a time. Search, insert and delete take O(log N) on average, with no rebalancing at all, and inserts touch only a few pointers, which makes concurrent and even lock-free versions practical. That simplicity is why skiplists are the default memtable in LevelDB and RocksDB.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "LevelDB and RocksDB", title: "Per-table filters", html: "Both support a Bloom filter per table, commonly configured at around 10 bits per key, checked before any table index or data block is read." },
            { org: "Apache Cassandra", title: "Tunable false positives", html: "Cassandra keeps a Bloom filter per SSTable and lets each table set its target false positive rate with <code>bloom_filter_fp_chance</code>, trading memory for fewer wasted disk reads." },
          ],
        },
        {
          type: "quiz",
          q: "A lookup checks a table's Bloom filter and gets \"maybe present\". What can you conclude?",
          options: [
            "The key is definitely in the table",
            "The key is definitely not in the table",
            "The key may be in the table; the engine must check the table's index and data to know",
            "The filter is corrupted",
          ],
          answer: 2,
          explain: "All k bits being set is consistent with the key having been added, but other keys could have set those bits. Only a 0 bit gives a definite answer. A \"maybe\" means the engine reads the table to find out, and with a well-sized filter that is rarely wasted.",
        },
      ],
    },
    {
      id: "unordered-stores",
      title: "Unordered log-structured stores: Bitcask and WiscKey",
      kicker: "Variations",
      blocks: [
        {
          type: "text",
          html: `<p>Keeping data sorted is what makes compaction rewrite so much. Two designs relax ordering to cut that cost.</p>
<p><strong>Bitcask</strong>, built as a storage backend for the Riak database, drops ordering entirely. Every write is appended to the current log file. An in-memory hash table, the <strong>keydir</strong>, maps every key to the file and offset of its latest value. A read is one hash lookup and one disk read; a write is one append. A background merge process rewrites old log files to drop overwritten and deleted values, and writes hint files that let a restarting node rebuild the keydir without scanning every log. The catches: all keys must fit in memory, and there are no range scans, because nothing is sorted.</p>
<p><strong>WiscKey</strong> keeps keys sorted but moves values out of the tree. Keys, with pointers to their values, live in a small LSM Tree; the values themselves are appended to an unordered <strong>value log</strong> (vLog). Compaction now shuffles only keys and small pointers, so write amplification drops sharply when values are large. Range scans still work through the sorted keys, but each value is a random read, which SSDs handle well with parallel requests. The value log needs its own garbage collection, which must check whether each value is still the live version before copying it forward.</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "Bitcask", tone: "info", html: "Keys: in-memory hash (keydir). Values: append-only log files. One seek per read, pure appends per write. No range scans; all keys must fit in RAM." },
            { title: "WiscKey", tone: "ok", html: "Keys: a sorted LSM Tree with value pointers. Values: an unordered vLog. Much lower write amplification for large values; range scans become random value reads; the vLog needs garbage collection." },
          ],
        },
        {
          type: "realworld",
          items: [
            { org: "Badger", title: "Key-value separation in Go", html: "Badger, the Go key-value store from Dgraph, follows the WiscKey design of keeping keys in an LSM Tree and values in a separate value log." },
            { org: "RocksDB and TiKV", title: "BlobDB and Titan", html: "RocksDB's BlobDB feature stores large values in separate blob files, and TiKV's Titan plugin for RocksDB applies the same key-value separation idea." },
          ],
        },
        {
          type: "quiz",
          q: "You need a store for 500 million keys with 4 KB values, write-heavy, and the application frequently scans ranges of keys. Which fits better, Bitcask or WiscKey?",
          options: [
            "Bitcask, because writes are pure appends",
            "WiscKey, because it keeps keys sorted for range scans while large values avoid repeated compaction rewrites",
            "Neither can store 4 KB values",
            "Bitcask, because its keydir supports range scans",
          ],
          answer: 1,
          explain: "Range scans rule out Bitcask, whose hash-based keydir has no order (and 500 million keys in RAM is a heavy requirement). WiscKey keeps keys sorted, and with 4 KB values, separating them from the LSM Tree avoids rewriting them at every compaction.",
        },
      ],
    },
    {
      id: "log-stacking",
      title: "Log stacking: logs on top of logs",
      kicker: "The full stack",
      blocks: [
        {
          type: "text",
          html: `<p>Chapter 2 showed that an SSD is itself log-structured: its Flash Translation Layer writes pages out of place, remaps logical pages to physical ones and garbage-collects erase blocks, copying live pages before erasing. An LSM Tree on an SSD is therefore one log on top of another. Put a log-structured filesystem in between, and there are three.</p>`,
        },
        {
          type: "lab",
          id: "ftl",
          caption: "Overwrite pages on a simulated SSD, let the FTL's garbage collector pick victim blocks, and see how write amplification changes with over-provisioning and with random versus sequential writes.",
        },
        {
          type: "diagram",
          title: "Three logs stacked",
          caption: "Each layer appends, remaps and garbage-collects on its own, without knowing what the others are doing. Their write amplification multiplies.",
          svg: `<svg viewBox="0 0 620 235" role="img" aria-label="An LSM Tree on a log-structured filesystem on an SSD flash translation layer, each with its own garbage collection">
<defs><marker id="di7-arrow2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="30" y="20" width="340" height="46" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="200" y="48" text-anchor="middle" font-size="13">LSM Tree: SSTables</text>
<line x1="200" y1="66" x2="200" y2="86" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#di7-arrow2)"/>
<rect x="30" y="90" width="340" height="46" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="200" y="118" text-anchor="middle" font-size="13">Log-structured filesystem: segments</text>
<line x1="200" y1="136" x2="200" y2="156" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#di7-arrow2)"/>
<rect x="30" y="160" width="340" height="46" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<text x="200" y="188" text-anchor="middle" font-size="13">SSD flash translation layer: erase blocks</text>
<text x="395" y="48" font-size="12">GC: compaction</text>
<text x="395" y="118" font-size="12">GC: segment cleaning</text>
<text x="395" y="188" font-size="12">GC: block garbage collection</text>
<text x="30" y="228" font-size="12" style="fill: var(--dg-muted)">physical writes = app writes &#215; LSM WA &#215; filesystem WA &#215; FTL WA</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>The problems compound. Work is duplicated: each layer keeps its own mapping and its own log of what is live. Write amplification multiplies: if compaction rewrites data 10 times and the SSD's garbage collection doubles that, every application byte costs about 20 bytes of flash writes, before the filesystem adds its share. And layers are misaligned: one layer's segments don't line up with the next layer's erase blocks, so when the LSM Tree deletes a whole SSTable, the freed space is scattered across many flash blocks that still hold other live data, and the FTL has to copy that live data to reclaim them.</p>
<p>The remedy is coordination rather than more logs. The LLAMA storage layer under the Bw-Tree is log-structured but aware of the access method above it, so it can consolidate deltas while it garbage-collects. <strong>Open-channel SSDs</strong> expose flash internals so the application can manage placement and garbage collection itself. More recently, <strong>zoned namespace</strong> (ZNS) SSDs expose zones that must be written sequentially and reset as a unit, which maps naturally onto immutable SSTables.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "RocksDB", title: "ZenFS", html: "ZenFS is a RocksDB file system plugin that places SSTables directly into the zones of zoned block devices, so deleting a table can free whole zones instead of leaving scattered garbage for the drive to clean." },
          ],
        },
        {
          type: "quiz",
          q: "An LSM Tree's compaction has a write amplification of 12, and the SSD's internal garbage collection adds a factor of 1.5. Roughly how many bytes reach flash for each byte the application writes?",
          options: ["About 13.5", "About 18", "About 12", "About 1.5"],
          answer: 1,
          explain: "Amplification factors in stacked layers multiply, not add: 12 times 1.5 is 18. This is why aligning LSM files with the device's erase units (or zones) pays off: it pushes the device-level factor toward 1.",
        },
      ],
    },
    {
      id: "interview",
      title: "LSM Trees in an interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "text",
          html: `<p>"B-Tree or LSM Tree?" is one of the most common storage questions in system design interviews, usually hidden inside a bigger design: a metrics pipeline, a chat history store, an activity feed, a key-value service. The interviewer wants to hear that you know where each structure pays and how an LSM Tree keeps its read and space costs in check.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>A strong answer walks through:</p>
<ol>
<li><strong>Write path</strong>: WAL, sorted memtable (skiplist), flush to an immutable SSTable, background compaction. All disk writes are sequential.</li>
<li><strong>Read path</strong>: memtable, then tables newest to oldest, skipping most with Bloom filters; reconcile by sequence number; a tombstone means not found.</li>
<li><strong>Deletes</strong>: tombstones, dropped only when compaction reaches the oldest data they shadow.</li>
<li><strong>Compaction</strong>: leveled (cheap reads, little wasted space, high write amplification) versus size-tiered (cheap writes, more tables per read, temporary space).</li>
<li><strong>The trade-off</strong>: RUM. LSM Trees favour writes and space; B-Trees favour reads. Pick by workload.</li>
</ol>`,
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Claiming LSM Trees are "faster" than B-Trees, full stop. They are better at absorbing writes, but point reads can touch several tables, range scans must merge many sources, and compaction consumes background I/O that can cause latency spikes if it falls behind. Name the workload before naming the winner.</p>`,
        },
        {
          type: "quiz",
          q: "In a design interview you propose an LSM-based store for a write-heavy metrics workload. The interviewer asks what happens if compaction can't keep up with ingest. What is the best answer?",
          options: [
            "Nothing; compaction is optional",
            "Level 0 and the number of tables grow, so reads check more tables and space grows; engines respond by slowing or stalling writes until compaction catches up, so you provision I/O headroom or pick a lower-write-amplification compaction strategy",
            "The memtable grows without bound in memory",
            "Old data is silently dropped",
          ],
          answer: 1,
          explain: "Compaction debt shows up as more overlapping tables (read amplification) and more obsolete data (space amplification). To stay healthy, engines such as RocksDB throttle or stall writes when level 0 or pending compaction grows too large. The fixes are more I/O headroom, tiered compaction, or time-window strategies for data that expires in bulk.",
        },
      ],
    },
  ],
  takeaways: [
    "An LSM Tree buffers writes in a sorted memtable (backed by a WAL), flushes immutable sorted tables, and merges them in the background with compaction, so every disk write is sequential.",
    "Deletes are tombstones (or range tombstones) that shadow older values; they can be dropped only once compaction has merged them with every older table that might hold the key.",
    "Reads and compaction use merge-iteration: a min-heap over sorted sources, O(N log M), reconciling duplicate keys by sequence number.",
    "Leveled compaction gives cheap reads and little wasted space at high write amplification; size-tiered gives cheap writes at the cost of more tables per read and temporary space.",
    "Read, write and space amplification trade off against each other (the RUM conjecture); B-Trees favour reads, LSM Trees favour writes.",
    "Bloom filters let lookups skip tables from memory: no false negatives, and about 10 bits per key gives under 1% false positives.",
    "Bitcask (hash keydir, append-only values, no range scans) and WiscKey (sorted keys, separate value log) relax ordering to cut compaction cost.",
    "Stacking logs (LSM on a log-structured filesystem on an SSD FTL) multiplies write amplification; coordinated designs (LLAMA, open-channel and zoned SSDs) avoid the duplicated work.",
  ],
  furtherReading: [
    { title: "The Log-Structured Merge-Tree (O'Neil, Cheng, Gawlick and O'Neil, 1996)", note: "The original LSM Tree paper, published in Acta Informatica." },
    { title: "WiscKey: Separating Keys from Values in SSD-Conscious Storage (Lu et al., FAST 2016)", note: "Key-value separation and its effect on write amplification." },
    { title: "Bitcask: A Log-Structured Hash Table for Fast Key/Value Data (Sheehy and Smith, 2010)", note: "A short, readable paper describing the keydir, merging and hint files." },
    { title: "Don't Stack Your Log On My Log (Yang et al., 2014)", note: "Measures what goes wrong when log-structured layers are stacked." },
  ],
};
