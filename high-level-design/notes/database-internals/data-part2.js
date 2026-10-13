// Database Internals - interactive notes data, part 2 (chapters 5-7)
window.DATA.chapters.push(
  // ------------------------------------------------------------------
  {
    id: `ch5`, part: 2, number: 5,
    title: `Transaction Processing and Recovery`,
    overview: `How a storage engine makes transactions <strong>atomic, consistent, isolated and durable</strong>. Three components do the work: the <strong>buffer manager</strong> (page cache, eviction, pinning), the <strong>log manager</strong> (write-ahead log, steal/force policies, ARIES recovery, checkpoints) and <strong>concurrency control</strong> (isolation levels and anomalies, optimistic, multiversion and pessimistic schemes, two-phase locking, deadlocks, and latches with latch crabbing and Blink-Trees).`,
    concepts: [
      { term: `ACID`, def: `<strong>Atomicity</strong>: all or nothing. <strong>Consistency</strong>: application-defined invariants hold (the only property mostly up to the user). <strong>Isolation</strong>: concurrent transactions don't see each other's partial work. <strong>Durability</strong>: once committed, changes survive crashes.`, why: `Each property maps to engine components: the transaction manager and log for A and D, the lock manager for I.` },
      { term: `Page cache (buffer pool)`, def: `In-memory copies of disk pages. Reads check the cache first and <strong>page in</strong> on a miss. Modified pages are <strong>dirty</strong> until flushed. When the cache is full, a page is <strong>evicted</strong> (dirty ones are flushed first).`, why: `Hides disk latency and batches writes. Many engines open files with O_DIRECT to bypass the kernel page cache, since the database knows its access patterns better than the OS.`, demo: `pageCache` },
      { term: `Pinning`, def: `Keeping pages in the cache that are likely to be used soon, such as the top levels of a B-Tree.`, why: `Every lookup touches the root and upper levels, which are a tiny fraction of the tree. Pinning them saves disk reads on every query.`, demo: `pageCache` },
      { term: `Page replacement: FIFO and LRU`, def: `<strong>FIFO</strong> evicts the page paged in earliest, ignoring later accesses. <strong>LRU</strong> moves a page to the tail on each access and evicts the least recently used.`, why: `FIFO would evict the root first, since it was paged in first. LRU fixes that but relinking on every access is costly under concurrency. 2Q and LRU-K distinguish recently from frequently used pages.`, demo: `pageCache` },
      { term: `CLOCK`, def: `Pages sit in a circular buffer with an access bit. The hand sweeps: bit 1 means clear it and move on; bit 0 means evict. Referenced pages are skipped.`, why: `A cheap, cache-friendly LRU approximation that can be updated with compare-and-swap. Linux uses a variant; PostgreSQL uses CLOCK-sweep.`, demo: `pageCache` },
      { term: `LFU and TinyLFU`, def: `Evict by usage frequency instead of recency. <strong>TinyLFU</strong> keeps a compact frequency histogram, with admission (LRU), probation and protected queues; an item is admitted only if it is more frequent than the eviction victim.`, why: `Under heavy load, recency says little about value. TinyLFU is used in the Caffeine Java library.`, demo: `pageCache` },
      { term: `Write-ahead log (WAL)`, def: `An append-only on-disk log of operations. A page change is durable once its log record is flushed, before the page itself is written. Each record has a monotonically increasing <strong>log sequence number (LSN)</strong>.`, why: `Lets the cache keep dirty pages in memory, and lets recovery redo or undo operations after a crash. Commit = the commit record is flushed (fsync).`, demo: `walRecovery` },
      { term: `Physical vs logical logging`, def: `<strong>Physical</strong> (before/after images of bytes) vs <strong>logical</strong> (the operation, like "insert X") logs. Real systems often combine them: physical redo for speed, logical undo for concurrency.`, why: `Physical redo is deterministic and fast; logical undo works even after pages were reorganized by other transactions.` },
      { term: `Steal and force policies`, def: `<strong>Steal</strong>: dirty pages of uncommitted transactions may be flushed (so recovery needs <strong>undo</strong>). <strong>Force</strong>: all pages of a transaction are flushed before commit (so no <strong>redo</strong> is needed).`, why: `No-steal/force needs neither undo nor redo but is slow and memory-hungry. Steal/no-force is the most flexible and needs both. ARIES uses it.`, demo: `walRecovery` },
      { term: `ARIES`, def: `A steal/no-force recovery algorithm in three phases: <strong>analysis</strong> (find dirty pages and active transactions at crash time), <strong>redo</strong> (repeat history from the earliest dirty page's LSN, including uncommitted changes), <strong>undo</strong> (roll back uncommitted transactions in reverse order, writing <strong>compensation log records (CLRs)</strong>).`, why: `CLRs make undo idempotent: if the system crashes during recovery, undone work isn't undone twice.`, demo: `walRecovery` },
      { term: `Checkpoints`, def: `Points in the log after which earlier records aren't needed for recovery. A <strong>sync checkpoint</strong> flushes all dirty pages (stalls); a <strong>fuzzy checkpoint</strong> writes begin_checkpoint, then end_checkpoint with the dirty page and active transaction tables, while pages flush asynchronously.`, why: `They bound recovery time and allow log trimming.` },
      { term: `Serializability`, def: `A schedule (interleaving of transaction operations) is serializable if it is equivalent to some serial execution of the same transactions.`, why: `Isolation in ACID means serializability. It doesn't impose any particular order, only that the outcome matches some serial one.` },
      { term: `Read and write anomalies`, def: `Reads: <strong>dirty read</strong> (uncommitted data), <strong>nonrepeatable read</strong> (row changes between two reads), <strong>phantom read</strong> (range result changes). Writes: <strong>lost update</strong>, <strong>dirty write</strong> (writing on top of an uncommitted value), <strong>write skew</strong> (each transaction keeps the invariant alone, but not together).`, why: `Isolation levels are defined by which anomalies they allow.`, ex: `Write skew: A1 = 100, A2 = 150, invariant A1 + A2 ≥ 0. T1 withdraws 200 from A1, T2 withdraws 200 from A2. Both see 250 available and commit: A1 = -100, A2 = -50.`, demo: `isolation` },
      { term: `Isolation levels`, def: `<strong>Read uncommitted</strong> allows dirty, nonrepeatable and phantom reads. <strong>Read committed</strong> forbids dirty reads. <strong>Repeatable read</strong> also forbids nonrepeatable reads. <strong>Serializable</strong> forbids all. <strong>Snapshot isolation</strong> reads from a snapshot taken at start; the first committer wins on conflicting writes.`, why: `Snapshot isolation prevents lost updates but still allows write skew, because the two transactions modify different records.`, demo: `isolation` },
      { term: `Optimistic concurrency control (OCC)`, def: `Execute without locks in three phases: <strong>read</strong> (into a private context), <strong>validation</strong> (check read/write sets against concurrently committed transactions), <strong>write</strong> (apply).`, why: `Great when conflicts are rare; with many conflicts, frequent aborts and retries waste work.` },
      { term: `Multiversion concurrency control (MVCC)`, def: `Keep multiple timestamped versions of each record. Readers see the version that was committed as of their snapshot, so they don't block writers.`, why: `The basis of snapshot isolation in PostgreSQL, Oracle and others. Old versions must be garbage-collected.` },
      { term: `Pessimistic schemes and timestamp ordering`, def: `Avoid conflicts up front. Timestamp ordering aborts an operation that would violate timestamp order; the <strong>Thomas write rule</strong> lets an outdated write be ignored instead of aborting.`, why: `No locks, but more aborts. Lock-based schemes are the more common pessimistic approach.` },
      { term: `Two-phase locking (2PL)`, def: `A transaction acquires locks in a <strong>growing phase</strong> and releases them in a <strong>shrinking phase</strong>; once it releases any lock it can't acquire new ones. Strict 2PL holds write locks until commit.`, why: `Guarantees serializable schedules, but transactions wait for each other, which can deadlock.`, demo: `deadlock` },
      { term: `Deadlocks`, def: `Transactions waiting for each other's locks in a cycle. Handle with <strong>timeouts</strong>, <strong>conservative 2PL</strong> (take all locks up front), detection with a <strong>waits-for graph</strong>, or avoidance with timestamps: <strong>wait-die</strong> (older waits, younger aborts) and <strong>wound-wait</strong> (older aborts the younger, younger waits).`, why: `Detection aborts one transaction in a cycle; avoidance prevents cycles but may abort transactions that wouldn't have deadlocked.`, demo: `deadlock` },
      { term: `Locks vs latches`, def: `<strong>Locks</strong> protect logical data (keys, ranges) for a transaction's duration and are managed by the lock manager. <strong>Latches</strong> protect the physical structure (a page) for the duration of one operation.`, why: `A page split must not be seen half-done by another reader, even within one transaction. That's latching, not locking. Readers-writer latches allow shared reads.` },
      { term: `Latch crabbing`, def: `Acquire a latch on the child, then release the parent if the child is <strong>safe</strong>: it can't split (insert, not full) or merge (delete, not near-empty). Reads release the parent right away.`, why: `Holding latches only on the part of the path that might change maximizes concurrency. Optimistic variants take read latches on the way down and restart with write latches only if a split is needed (latch upgrading).`, demo: `latchCrabbing` },
      { term: `Blink-Trees`, def: `B-Trees with <strong>high keys</strong> and <strong>sibling links</strong>. A split creates the right node and links it before the parent is updated, so a reader that arrives at the old node mid-split compares the key with the high key and follows the sibling link.`, why: `Removes the need to hold parent latches during splits. Readers simply chase the link instead of blocking.` }
    ],
    cheatsheet: [
      { title: `Isolation levels and anomalies (Figure 5-5)`, type: `table`, headers: [`Level`, `Dirty read`, `Nonrepeatable read`, `Phantom read`], rows: [
        [`Read uncommitted`, `allowed`, `allowed`, `allowed`],
        [`Read committed`, `-`, `allowed`, `allowed`],
        [`Repeatable read`, `-`, `-`, `allowed`],
        [`Serializable`, `-`, `-`, `-`]
      ], note: `Snapshot isolation prevents lost updates (first committer wins) but allows write skew.` },
      { title: `Steal / force`, type: `table`, headers: [`Policy`, `No force`, `Force`], rows: [
        [`<strong>Steal</strong>`, `Undo + redo (ARIES, most flexible)`, `Undo only`],
        [`<strong>No steal</strong>`, `Redo only`, `Neither (slowest, most memory)`]
      ] },
      { title: `ARIES recovery`, type: `code`, body: `1. Analysis: scan from last checkpoint
   -> dirty page table (pages + recLSN)
   -> active transaction table (losers)
2. Redo: from min(recLSN), repeat history
   for every logged change (even of losers)
   if page.LSN < record.LSN
3. Undo: roll back losers newest-first,
   write a CLR for each undone change
   (CLRs are redo-only, never undone)` },
      { title: `Concurrency control families`, type: `table`, headers: [`Family`, `Idea`, `Cost`], rows: [
        [`Optimistic (OCC)`, `Read, validate, write`, `Aborts under contention`],
        [`MVCC`, `Versions + snapshots; readers don't block writers`, `Version garbage collection`],
        [`Timestamp ordering`, `Order by start timestamp; Thomas write rule`, `Aborts on late operations`],
        [`2PL`, `Growing then shrinking lock phases`, `Blocking, deadlocks`]
      ] },
      { title: `Deadlock handling`, type: `table`, headers: [`Scheme`, `Older Ti requests lock held by younger Tj`, `Younger Tj requests lock held by older Ti`], rows: [
        [`Wait-die`, `Ti waits`, `Tj aborts (dies)`],
        [`Wound-wait`, `Ti aborts Tj (wounds)`, `Tj waits`],
        [`Waits-for graph`, `Wait; abort a victim when a cycle appears`, `same`],
        [`Timeout`, `Abort after waiting too long`, `same`]
      ] }
    ],
    interview: [
      { q: `What is the difference between steal/no-steal and force/no-force?`, a: `Steal allows flushing a page with uncommitted changes, so recovery must undo them. Force requires flushing all of a transaction's pages before commit, so committed changes never need redo. Steal/no-force (ARIES) gives the cache full freedom but needs both undo and redo; no-steal/force needs neither but is slow and holds dirty pages in memory.`, diff: `med` },
      { q: `Explain the three phases of ARIES.`, a: `Analysis scans the log from the last checkpoint to rebuild the dirty page table and the active (loser) transactions. Redo repeats history from the smallest recLSN, reapplying all changes, even uncommitted ones, when page LSN &lt; record LSN. Undo rolls back the losers in reverse LSN order, writing compensation log records so repeated crashes during recovery don't undo twice.`, diff: `hard` },
      { q: `Why does a database need its own page cache instead of relying on the OS?`, a: `The database knows access patterns the OS doesn't: it can pin upper B-Tree levels, choose eviction policies that resist scan pollution, control when dirty pages are flushed relative to the WAL (WAL must reach disk before the page), and avoid double caching. PostgreSQL still uses the OS cache partially, but most engines manage their own buffer pool.`, diff: `med` },
      { q: `Why is FIFO a bad eviction policy for a B-Tree?`, a: `It evicts pages by page-in time, ignoring later accesses. The root and top-level pages are paged in first, so FIFO evicts them first, even though nearly every lookup needs them again. LRU, CLOCK or LFU keep them because they are accessed constantly.`, diff: `easy` },
      { q: `What is write skew and which isolation level prevents it?`, a: `Each transaction reads overlapping data, preserves an invariant locally, and writes different records, so together they break it. Example: A1 = 100, A2 = 150 with A1 + A2 ≥ 0; two transactions each withdraw 200 from a different account and both commit, leaving -150 in total. Snapshot isolation allows it, since there's no write-write conflict. Serializable isolation prevents it.`, diff: `hard` },
      { q: `How does latch crabbing work?`, a: `Descend the tree latching the child before releasing the parent. For reads, release the parent immediately. For inserts and deletes, keep ancestors latched until reaching a safe node (one that won't split or merge as a result), then release everything above it. This bounds contention to the part of the tree that might change.`, diff: `med` },
      { q: `What are Blink-Trees and why do they help concurrency?`, a: `B-Trees whose nodes have high keys and right-sibling links. A split first creates and links the new right sibling, then updates the parent later. A reader that lands on the old node during a split sees its key is above the high key and follows the sibling link. Splits don't need to latch the parent, and readers never block.`, diff: `hard` },
      { q: `Compare deadlock detection and avoidance.`, a: `Detection lets transactions wait, builds a waits-for graph and aborts a victim when it finds a cycle (or uses timeouts). Avoidance uses timestamps: wait-die (an older transaction waits for a younger one, a younger one requesting an older's lock aborts) and wound-wait (an older one aborts the younger holder, a younger one waits). Avoidance never deadlocks but may abort unnecessarily.`, diff: `med` },
      { q: `Locks vs latches?`, a: `Locks protect logical data for the duration of a transaction and are managed by the lock manager, often with deadlock handling. Latches are short-lived physical guards on pages or in-memory structures held for the duration of one operation (a read, a split), so structural changes aren't seen half-done.`, diff: `easy` }
    ],
    labs: [`pageCache`, `walRecovery`, `isolation`, `deadlock`, `latchCrabbing`]
  },
  // ------------------------------------------------------------------
  {
    id: `ch6`, part: 3, number: 6,
    title: `B-Tree Variants`,
    overview: `Classic B-Trees overwrite pages in place, need latches, and suffer from write amplification. This chapter surveys variants that borrow buffering, immutability or new layouts: <strong>copy-on-write</strong> B-Trees (LMDB), <strong>lazy B-Trees</strong> that buffer updates (WiredTiger, LA-Trees), <strong>FD-Trees</strong> with immutable sorted runs and fractional cascading, latch-free <strong>Bw-Trees</strong> with delta chains and a mapping table, and <strong>cache-oblivious B-Trees</strong> using the van Emde Boas layout.`,
    concepts: [
      { term: `Copy-on-write B-Trees`, def: `Never modify a page: copy it, change the copy, and copy every ancestor up to a new root. Switch the root pointer atomically. Old pages stay readable by existing readers until no one references them.`, why: `Readers need no latches and always see a consistent snapshot; the tree is never in a corrupt state, so no WAL is needed. The cost is extra page writes and space.`, demo: `copyOnWrite` },
      { term: `LMDB`, def: `Lightning Memory-Mapped Database: a copy-on-write B-Tree used by OpenLDAP. It keeps two root versions (latest and the one being written), memory-maps the file, and has no application-level page cache (single-level store).`, why: `Shows how far copy-on-write can simplify an engine: reads go straight to the mapped pages, writes are serialized.`, demo: `copyOnWrite` },
      { term: `Abstracting node updates`, def: `Keep an in-memory representation that differs from the on-disk page, apply updates to it, and reconcile into a page when flushing.`, why: `The basis of lazy B-Trees: you can buffer, reorder and batch updates before they hit disk.` },
      { term: `WiredTiger`, def: `MongoDB's default storage engine. Clean pages are loaded as-is; modifications go into per-page <strong>update buffers</strong> (skiplists). On flush, <strong>reconciliation</strong> merges base page and updates into new pages, possibly splitting them.`, why: `Many updates to the same page are amortized into one write: less write amplification, still ordered and mutable.` },
      { term: `Lazy-Adaptive Tree (LA-Tree)`, def: `Buffers are attached to subtrees instead of individual nodes. When a buffer fills, its contents are pushed (cascaded) to the buffers at lower levels, and eventually applied to leaves.`, why: `Batches writes for whole subtrees, which suits flash storage where small writes are expensive.` },
      { term: `FD-Trees`, def: `Flash Disk Trees: a small mutable <strong>head tree</strong> plus a series of immutable <strong>sorted runs</strong> of logarithmically growing size. When the head fills, it is merged into the next run, which may cascade.`, why: `Random writes become sequential merges, and space use is good because runs are fully packed.` },
      { term: `Fractional cascading`, def: `Make searching across several sorted arrays cheaper: pull every other element of the next array into the current one as a <strong>bridge</strong> (fence pointer), so after locating a key in level i, you jump into level i+1 near the right spot.`, why: `You binary search only the first array; each next level needs just a few comparisons around the bridge. FD-Trees use it to search their runs.`, ex: `A1 = [12, 24, 32, 34, 39], A2 = [22, 25, 28, 30, 35], A3 = [11, 16, 24, 26, 30]. Bridging gives A1 = [12, 24, 25, 30, 32, 34, 39], A2 = [16, 22, 25, 26, 28, 30, 35].`, demo: `fractionalCascading` },
      { term: `Bw-Trees`, def: `Buzzword-Trees: each logical node is a <strong>base node</strong> plus a chain of <strong>delta nodes</strong> (newest first). An in-memory <strong>mapping table</strong> maps logical node IDs to the head of each chain, updated with <strong>compare-and-swap</strong>.`, why: `Updates are small appends instead of page rewrites (less write amplification), and nodes are latch-free: a failed CAS means another update won, so retry.`, demo: `bwTree` },
      { term: `Consolidation`, def: `When a delta chain gets long, rebuild the node: apply all deltas to the base node and install the new node with a single CAS on the mapping table.`, why: `Long chains slow down reads (every read walks the chain). Consolidation trades a rewrite for faster reads.`, demo: `bwTree` },
      { term: `Structural modification operations (SMOs)`, def: `Splits and merges in a Bw-Tree happen in steps: a split delta on the old node, then an index entry delta on the parent. Any thread that encounters an incomplete SMO must finish it before proceeding. Merges use remove node, merge and abort deltas.`, why: `Cooperative completion keeps the tree latch-free and always navigable.` },
      { term: `Epoch-based reclamation`, def: `Replaced nodes and deltas are freed only after all threads that might have seen them (those in an earlier epoch) have finished.`, why: `Without latches, some reader may still hold a pointer to an old chain; freeing it right away would be a use-after-free.` },
      { term: `Cache-oblivious structures`, def: `Structures that perform well without knowing the block or cache size, so they are efficient at every level of the memory hierarchy at once.`, why: `Cache-aware B-Trees are tuned to one page size; cache-oblivious ones adapt automatically.` },
      { term: `van Emde Boas layout`, def: `Split the tree at its middle level into a top subtree and many bottom subtrees, lay each one out contiguously, and recurse inside each.`, why: `Any root-to-leaf path touches only O(log<sub>B</sub>N) blocks for any block size B. Combined with a packed array with gaps (density thresholds) to support updates.`, demo: `vebLayout` }
    ],
    cheatsheet: [
      { title: `Variant comparison`, type: `table`, headers: [`Variant`, `Buffering`, `Immutable`, `Main idea`], rows: [
        [`Classic B-Tree`, `-`, `-`, `In-place page updates`],
        [`Copy-on-write (LMDB)`, `-`, `yes`, `Copy path to new root; readers never latch`],
        [`WiredTiger`, `yes`, `-`, `Per-page update buffers + reconciliation`],
        [`LA-Tree`, `yes`, `-`, `Buffers per subtree, cascaded down`],
        [`FD-Tree`, `yes`, `yes`, `Small head tree + immutable sorted runs, fractional cascading`],
        [`Bw-Tree`, `yes (deltas)`, `yes`, `Delta chains + mapping table + CAS, latch-free`],
        [`Cache-oblivious`, `-`, `-`, `van Emde Boas layout, packed array`]
      ] },
      { title: `Bw-Tree update`, type: `code`, body: `1. Traverse root -> leaf via mapping table (logical IDs)
2. Create delta node pointing at current chain head
3. CAS(mappingTable[nodeId], expectedHead, newDelta)
   - success: update visible
   - failure: someone else updated; retry
4. If chain length > threshold: consolidate
   (apply deltas to base, CAS the new base in)
5. Old chain freed with epoch-based reclamation` },
      { title: `Fractional cascading (book example)`, type: `table`, headers: [`Array`, `Original`, `With bridges`], rows: [
        [`A1`, `12, 24, 32, 34, 39`, `12, 24, <strong>25, 30</strong>, 32, 34, 39`],
        [`A2`, `22, 25, 28, 30, 35`, `<strong>16</strong>, 22, 25, <strong>26</strong>, 28, 30, 35`],
        [`A3`, `11, 16, 24, 26, 30`, `11, 16, 24, 26, 30`]
      ], note: `Bridged elements carry a pointer into the next array, so after one binary search each lower level costs only a few steps.` },
      { title: `Why variants exist`, type: `list`, items: [
        `Write amplification: in-place B-Trees rewrite a whole page for a tiny change.`,
        `Space amplification: pages are kept partly empty to absorb inserts.`,
        `Concurrency: latches on pages and the complexity of concurrent splits.`,
        `Answers: buffering (WiredTiger, LA-Tree), immutability (COW, FD-Tree, Bw-Tree), layout (cache-oblivious).`
      ] }
    ],
    interview: [
      { q: `How does a copy-on-write B-Tree work and what are its trade-offs?`, a: `An update copies the leaf, then every ancestor up to a new root, and atomically swaps the root pointer. Readers holding the old root see a consistent snapshot without latches, and the structure is never half-updated, so no WAL is needed. The costs are writing a whole path per update (write amplification), extra space until old pages are reclaimed, and serialized writers. LMDB uses this approach.`, diff: `med` },
      { q: `What problem do lazy B-Trees like WiredTiger solve?`, a: `Write amplification from in-place updates. WiredTiger keeps modifications in per-page in-memory update buffers (skiplists) and only reconciles them with the base page when the page is flushed or evicted. Many small updates to the same page become one write.`, diff: `med` },
      { q: `Explain the Bw-Tree.`, a: `A latch-free B-Tree. Logical nodes are a base node plus a chain of delta records. An in-memory mapping table maps node IDs to the chain head; updates prepend a delta and install it with compare-and-swap, retrying on conflict. Long chains are consolidated into a new base node. Splits and merges are multistep SMOs that any thread can help complete. Memory is reclaimed with epoch-based reclamation. Microsoft built it for Hekaton/LLAMA; Sled and OpenBw-Tree are implementations.`, diff: `hard` },
      { q: `Why does a Bw-Tree need a mapping table?`, a: `Prepending deltas changes a node's physical head. Without indirection, every parent would need rewriting to point at the new head. The mapping table maps stable logical IDs to physical locations, so a single CAS on one entry publishes the update, and parents keep pointing at logical IDs.`, diff: `med` },
      { q: `What is fractional cascading and where is it used?`, a: `A technique to search the same key across several sorted arrays quickly. Elements from each next-level array are copied into the current level as bridges with pointers, so once you find the position in level i, the bridge tells you where to look in level i+1 with only a few comparisons. FD-Trees use it to search their sorted runs.`, diff: `med` },
      { q: `What is a cache-oblivious B-Tree?`, a: `A structure that is efficient for any block size without being tuned to one. It uses the van Emde Boas layout: recursively split the tree at the middle level and store each subtree contiguously, so any root-to-leaf path touches O(log_B N) blocks for every B. A packed array with gaps supports inserts.`, diff: `hard` },
      { q: `How do FD-Trees handle writes?`, a: `Writes go to a small mutable head tree. When it fills, its contents are merged into the first immutable sorted run; runs grow logarithmically and merges cascade to bigger runs. Random writes become sequential merges, which suits flash. Lookups search the head and then each run using fractional cascading.`, diff: `med` },
      { q: `Why do Bw-Trees need epoch-based reclamation?`, a: `They are latch-free, so after consolidation replaces a chain, some thread may still be traversing the old one. Nodes removed in an epoch are freed only once every thread that started in that epoch or earlier has finished, so nobody can still hold a pointer to them.`, diff: `hard` }
    ],
    labs: [`copyOnWrite`, `bwTree`, `fractionalCascading`, `vebLayout`]
  },
  // ------------------------------------------------------------------
  {
    id: `ch7`, part: 3, number: 7,
    title: `Log-Structured Storage`,
    overview: `Immutable storage taken all the way. <strong>LSM Trees</strong> buffer writes in a memtable, flush them as immutable sorted files (SSTables), and merge files in the background through <strong>compaction</strong>. The chapter covers deletes with tombstones, lookups through <strong>merge-iteration</strong> and reconciliation, <strong>leveled vs size-tiered</strong> compaction, read/write/space amplification and the <strong>RUM conjecture</strong>, SSTables, <strong>Bloom filters</strong> and skiplists, unordered stores (<strong>Bitcask</strong>, <strong>WiscKey</strong>), and <strong>log stacking</strong>: what happens when an LSM Tree runs on a log-structured filesystem on a log-structured SSD.`,
    concepts: [
      { term: `LSM Tree`, def: `Log-Structured Merge Tree: writes go to an in-memory <strong>memtable</strong> (sorted), which is flushed to disk as an immutable sorted file when it fills. Files are periodically merged.`, why: `All disk writes are sequential and there are no in-place updates, so writes are fast and space is fully used. Reads may have to check several files.`, demo: `lsmTree` },
      { term: `Two-component vs multicomponent`, def: `The original LSM Tree had one memory component and one disk B-Tree, merged continuously. Modern LSM Trees are <strong>multicomponent</strong>: many disk tables, merged by compaction.`, why: `Multicomponent trees flush cheaply but need compaction to keep the number of tables (and read cost) under control.` },
      { term: `Memtable and WAL`, def: `The memtable is mutable and sorted (often a skiplist). Writes also go to a WAL for durability. When full, it is switched to a read-only flushing memtable and a new one takes writes.`, why: `After a flush completes, the WAL segment covering it can be discarded.`, demo: `lsmTree` },
      { term: `Tombstones`, def: `Deletes write a <strong>delete entry</strong> (tombstone) that shadows older values. <strong>Range tombstones</strong> (delete predicates) remove key ranges, like k2 inclusive to k4 exclusive.`, why: `Data in older immutable tables can't be removed right away. Tombstones are dropped only when compaction reaches the oldest level that could hold shadowed data.`, demo: `mergeIteration` },
      { term: `Merge-iteration`, def: `Read several sorted sources at once: put each iterator's head into a <strong>priority queue</strong> (min-heap), repeatedly take the smallest, and refill from the same iterator. Records with equal keys are reconciled.`, why: `Lookups, range scans and compaction all use it. Cost is O(N log M) for N records from M sources.`, ex: `Iterator 1: {k2:v1} {k4:v2}. Iterator 2: {k1:v3} {k2:v4} {k3:v5}. The merged result is k1:v3, k2:v4, k3:v5, k4:v2.`, demo: `mergeIteration` },
      { term: `Reconciliation`, def: `When several tables contain the same key, pick the newest record by timestamp (or sequence number). A tombstone as the winner means the key is deleted.`, why: `Without timestamps, it's impossible to know which value is current.`, demo: `mergeIteration` },
      { term: `Leveled compaction`, def: `RocksDB's default. Level 0 holds flushed tables that may overlap. From level 1 on, each level is a set of non-overlapping key-range partitions, and each level is about 10x bigger than the previous one. Compaction merges an overflowing table into the overlapping tables of the next level.`, why: `Few tables per level means cheap reads and little space waste, at the cost of rewriting data many times (high write amplification).`, demo: `lsmTree` },
      { term: `Size-tiered compaction`, def: `Group tables of similar size. When enough tables are at one tier, merge them into one table in the next, larger tier. Cassandra's default strategy.`, why: `Lower write amplification but more overlapping tables to read and temporary space overhead during merges. Large tables can suffer from <strong>table starvation</strong>.`, demo: `lsmTree` },
      { term: `Read, write and space amplification`, def: `<strong>Read</strong>: extra tables consulted per lookup. <strong>Write</strong>: data rewritten by compaction. <strong>Space</strong>: obsolete records still stored.`, why: `LSM Trees trade one for another depending on compaction. B-Trees have their own: page rewrites for small changes and half-empty pages.`, demo: `amplification` },
      { term: `RUM conjecture`, def: `Read overhead, Update overhead, Memory (space) overhead: reducing two of them makes the third worse.`, why: `A compact way to explain why no storage structure is optimal for everything.`, demo: `amplification` },
      { term: `SSTables`, def: `Sorted String Tables: an index component (keys and offsets, for example a B-Tree or hash table) and a data component (key-value pairs in key order). Immutable once written.`, why: `Sequential reads for ranges, binary or index lookup for points. Can be merged efficiently because they are sorted.` },
      { term: `Bloom filters`, def: `A bit array of m bits and k hash functions. Adding a key sets k bits. Querying checks the k bits: any 0 means "definitely not present"; all 1 means "maybe present".`, why: `Each table gets a filter so a lookup can skip tables that can't contain the key. False positives are possible, false negatives are not. Used in Cassandra and RocksDB.`, ex: `16-bit array, 3 hashes: key1 sets bits 3, 5, 10; key2 sets 5, 8, 14. key3 hashes to 3, 10, 14, all set, so it's a false positive.`, demo: `bloomFilter` },
      { term: `Skiplists`, def: `Sorted linked lists with multiple levels of express lanes; each node gets a random height. Search, insert and delete are O(log N) on average.`, why: `Simple to implement and to make concurrent, which makes them a popular memtable structure (Cassandra secondary index memtables, RocksDB, WiredTiger buffers).` },
      { term: `Bitcask`, def: `An unordered log-structured store (Riak's default): records are appended to log files, and an in-memory hash table (<strong>keydir</strong>) maps every key to the latest record's location.`, why: `One disk seek per read and pure appends on write. But all keys must fit in memory and range scans aren't supported.` },
      { term: `WiscKey`, def: `Separates keys from values: keys and value pointers live in a small sorted LSM Tree; values go into an unordered append-only <strong>vLog</strong>.`, why: `Compaction moves only small keys, which cuts write amplification. Range scans become random reads of values (fine on SSDs with parallelism). The vLog needs garbage collection.` },
      { term: `Log stacking`, def: `An LSM Tree on a log-structured filesystem on an SSD whose FTL is also log-structured. Each layer does its own garbage collection and remapping.`, why: `Redundant logging, write amplification multiplied across layers, and misaligned segments that make GC worse.`, demo: `ftl` },
      { term: `Flash Translation Layer and GC`, def: `SSDs write pages out of place and erase whole blocks. The FTL maps logical to physical pages and garbage-collects blocks full of discarded pages, relocating live ones first.`, why: `Its write amplification depends on how many live pages GC has to move: random overwrites and low over-provisioning make it worse.`, demo: `ftl` },
      { term: `LLAMA and open-channel SSDs`, def: `LLAMA is the latch-free, log-structured, access-method aware storage layer under Bw-Trees: it consolidates deltas during GC. <strong>Open-channel SSDs</strong> expose flash internals so the application manages placement and GC itself.`, why: `Coordinating layers ("mindful stacking") removes redundant work instead of stacking logs blindly.` }
    ],
    cheatsheet: [
      { title: `LSM write and read path`, type: `code`, body: `write(k, v):
  append to WAL
  insert into memtable (skiplist)
  if memtable full: switch, flush as SSTable to L0

read(k):
  check memtable, then flushing memtable
  for each table newest -> oldest:
    if bloom(table).mightContain(k):
      look up k in table index
  reconcile by timestamp; tombstone => not found

compaction:
  merge-iterate selected tables
  keep newest version per key
  drop tombstones only at the bottom level` },
      { title: `Leveled vs size-tiered`, type: `table`, headers: [`Aspect`, `Leveled`, `Size-tiered`], rows: [
        [`Structure`, `L0 overlapping; L1+ non-overlapping partitions, ~10x per level`, `Tiers of similar-size tables`],
        [`Read amplification`, `Low (one table per level from L1)`, `Higher (many overlapping tables)`],
        [`Write amplification`, `High (data rewritten at each level)`, `Lower`],
        [`Space amplification`, `Low`, `Higher; merges need temporary space`],
        [`Default in`, `RocksDB, LevelDB`, `Cassandra`]
      ] },
      { title: `Bloom filter math`, type: `table`, headers: [`Quantity`, `Formula`], rows: [
        [`False positive rate`, `p ≈ (1 - e<sup>-kn/m</sup>)<sup>k</sup>`],
        [`Optimal number of hashes`, `k = (m / n) · ln 2`],
        [`Bits for target p`, `m = -n · ln p / (ln 2)<sup>2</sup> (≈ 9.6 bits per key for 1%)`],
        [`Guarantees`, `No false negatives; false positives possible`]
      ], note: `The formulas are the standard analysis; the book explains the trade-off between filter size, hash count and false positive rate.` },
      { title: `Storage structures by property (Figure I-1)`, type: `table`, headers: [`Structure`, `Buffering`, `Immutability`, `Ordering`], rows: [
        [`B-Tree`, `-`, `-`, `yes`],
        [`WiredTiger, LA-Tree`, `yes`, `-`, `yes`],
        [`Copy-on-write B-Tree`, `-`, `yes`, `yes`],
        [`2C / MC LSM Tree, FD-Tree`, `yes`, `yes`, `yes`],
        [`Bitcask`, `-`, `yes`, `-`],
        [`WiscKey`, `keys only`, `yes`, `keys only`],
        [`Bw-Tree`, `yes (deltas)`, `yes`, `consolidated nodes only`]
      ] },
      { title: `Unordered stores`, type: `table`, headers: [`Store`, `Keys`, `Values`, `Range scans`], rows: [
        [`Bitcask`, `In-memory hash (keydir)`, `Append-only log files`, `No`],
        [`WiscKey`, `Sorted LSM Tree`, `Unordered vLog`, `Yes, via key order + random value reads`]
      ] }
    ],
    interview: [
      { q: `Walk through the write path of an LSM Tree.`, a: `The write is appended to the WAL and inserted into the memtable (a sorted structure such as a skiplist). When the memtable fills, it is switched to read-only and flushed to disk as an immutable SSTable, and a fresh memtable takes new writes. The WAL segment is discarded after the flush. Background compaction later merges SSTables.`, diff: `easy` },
      { q: `How does an LSM Tree delete data?`, a: `It writes a tombstone (delete entry) that shadows older values during reads. Range tombstones delete key ranges. Older values are physically removed when compaction merges the tables; the tombstone itself can be dropped only once compaction reaches the oldest level where shadowed data could exist, or deleted data could reappear.`, diff: `med` },
      { q: `Explain merge-iteration.`, a: `To read sorted runs from M tables as one, put each iterator's current head in a min-heap keyed by key. Pop the smallest, emit it (reconciling with any other entries of the same key by timestamp), and push the next item from that iterator. The result is fully sorted output in O(N log M). Lookups, scans and compaction all use it.`, diff: `med` },
      { q: `Leveled vs size-tiered compaction?`, a: `Leveled (RocksDB): non-overlapping tables per level, each level ~10x larger; reads check at most one table per level and space overhead is low, but data is rewritten at every level (high write amplification). Size-tiered (Cassandra): merge tables of similar size into larger ones; lower write amplification, but more overlapping tables per read and more temporary space.`, diff: `med` },
      { q: `How does a Bloom filter work and what errors can it make?`, a: `A bit array of m bits and k hash functions. Adding a key sets the k bits it hashes to. A query checks those k bits: if any is 0, the key was never added; if all are 1, it might have been. It can give false positives (bits set by other keys) but never false negatives. LSM Trees keep one per SSTable to skip tables during lookups.`, diff: `easy` },
      { q: `What is the RUM conjecture?`, a: `Any access method trades off Read overhead, Update overhead and Memory (space) overhead: optimizing two makes the third worse. B-Trees are read-optimized; LSM Trees are write-optimized; leveled vs tiered compaction moves the balance within LSM Trees.`, diff: `easy` },
      { q: `Compare Bitcask and WiscKey.`, a: `Bitcask appends records to log files and keeps an in-memory hash (keydir) from every key to its latest location: one seek per read, cheap writes, but all keys must fit in memory and there are no range scans. WiscKey keeps keys sorted in an LSM Tree with pointers into an unordered value log, so compaction moves only small keys; range scans work but read values randomly, and the vLog needs GC.`, diff: `hard` },
      { q: `What is log stacking and why is it a problem?`, a: `Running a log-structured store on a log-structured filesystem on an SSD with a log-structured FTL. Each layer maintains its own log, does its own GC and remaps data, so work is duplicated, write amplification multiplies, and segments can be misaligned, so one layer's GC fragments the next. Approaches like LLAMA (access-method aware) and open-channel SSDs coordinate layers instead.`, diff: `hard` },
      { q: `Why are LSM Trees good for SSDs and write-heavy workloads?`, a: `All writes are sequential and large (memtable flushes and compaction outputs), no page is overwritten in place, and immutable files are fully packed. That suits SSDs, which can't overwrite pages and erase whole blocks, and gives high write throughput. The price is read amplification (mitigated by Bloom filters) and background compaction work.`, diff: `med` }
    ],
    labs: [`lsmTree`, `mergeIteration`, `bloomFilter`, `amplification`, `ftl`]
  }
);
