// Database Internals (Alex Petrov, O'Reilly 2019) - interactive notes data, part 1 (book info + chapters 1-4). Part I: Storage Engines only.
window.DATA = {
  book: {
    title: `Database Internals`,
    subtitle: `Chapter-wise interactive notes on Part I (<em>Storage Engines</em>) of Alex Petrov's <em>Database Internals: A Deep Dive into How Distributed Data Systems Work</em>. Every chapter has core concepts, hands-on labs (B-Tree splits and merges, slotted pages, page caches, ARIES recovery, isolation anomalies, Bw-Trees, LSM compaction, Bloom filters, SSD garbage collection...), a cheatsheet and interview Q&amp;A.`,
    storageKey: `database_internals_notes_v1`,
    appId: `database-internals-notes`,
    exportPrefix: `database-internals-progress`,
    pillarsTitle: `Four ideas that shape every storage engine`,
    takeawaysTitle: `Twelve takeaways to remember`,
    labsIntro: `Each lab is a small, self-contained simulator of an idea from the chapter, built on the book's own examples where it has them (the stock quotes table, Tom/Leslie/Ron in a slotted page, the A1/A2 write skew, the fractional cascading arrays, the merge-iteration iterators, the 16-bit Bloom filter). Sizes are toy-scale, but the algorithms and trade-offs are the book's. Labs reset when you leave the tab.`
  },
  parts: {
    1: `Foundations`,
    2: `Building a B-Tree engine`,
    3: `Beyond in-place B-Trees`
  },
  fourQuestions: [
    { cls: `what`, q: `Respect the block`, text: `Disks (HDD sectors, SSD pages) are read and written in blocks, never single bytes. On-disk structures therefore want high fanout, low height, few out-of-page pointers and good locality.`, answer: `Ch 1-2: row vs column layout, BST vs B-Tree, HDD/SSD internals.` },
    { cls: `where`, q: `Buffering`, text: `Collect changes in memory before writing them out. It amortizes I/O and always helps write amplification, whether the target is a mutable page (WiredTiger, LA-Tree) or a new immutable file (LSM).`, answer: `Ch 5-7: page cache, lazy B-Trees, memtables, Bw-Tree deltas.` },
    { cls: `when`, q: `Immutability`, text: `Never modify data in place: append or copy-on-write instead. Writes become sequential and readers need fewer locks, at the cost of deferred rewrites (compaction, garbage collection).`, answer: `Ch 6-7: copy-on-write B-Trees, Bw-Trees, FD-Trees, LSM Trees, Bitcask.` },
    { cls: `how`, q: `Ordering`, text: `Keeping records in key order makes range scans and merges cheap. Dropping order (Bitcask, WiscKey values) makes writes cheaper but loses efficient range queries.`, answer: `Ch 2-4 and 7: B-Tree invariants, slotted pages, SSTables, merge-iteration.` }
  ],
  takeaways: [
    `A DBMS is layered: <strong>transport</strong>, <strong>query processor</strong> (parser + optimizer), <strong>execution engine</strong> and <strong>storage engine</strong> (transaction manager, lock manager, access methods, buffer manager, recovery manager).`,
    `<strong>Row stores</strong> keep whole records together (good for point access and OLTP); <strong>column stores</strong> keep each column together (good for scans, aggregates and compression). Wide-column stores like Bigtable are <em>not</em> column stores.`,
    `Data files can be <strong>index-organized</strong>, <strong>heap</strong> or <strong>hashed</strong>. Secondary indexes point either at a file offset (fast reads) or at the primary key (cheap relocation, extra lookup).`,
    `Disks are accessed block-wise. A binary search tree needs log<sub>2</sub>N seeks; a B-Tree with fanout K needs only log<sub>K</sub>N <strong>page transfers</strong>, while still doing about log<sub>2</sub>N <strong>comparisons</strong>.`,
    `A B-Tree <strong>splits</strong> an overflowing node and promotes the separator to the parent, and <strong>merges</strong> or redistributes underflowing siblings. The tree grows and shrinks at the <strong>root</strong>, so it stays balanced.`,
    `<strong>Slotted pages</strong> = header + sorted offset array + cells appended from the end. They support variable-size records, deletion through freelists and reordering without moving data.`,
    `B-Tree implementations add <strong>sibling links</strong>, <strong>rightmost pointers</strong>, <strong>high keys</strong>, <strong>overflow pages</strong>, <strong>breadcrumbs</strong>, <strong>rebalancing</strong>, <strong>right-only append</strong> fast paths, <strong>bulk loading</strong> and <strong>vacuum</strong>.`,
    `The <strong>page cache</strong> keeps hot pages in memory, flushes dirty pages, pins hot ones and evicts with FIFO, LRU, 2Q, LRU-K, CLOCK or TinyLFU.`,
    `The <strong>WAL</strong> makes changes durable before pages are flushed. <strong>ARIES</strong> (steal / no-force) recovers with <strong>analysis, redo, undo</strong> and writes CLRs for the undone changes.`,
    `Isolation levels are defined by the anomalies they allow. <strong>Snapshot isolation</strong> prevents lost updates but still allows <strong>write skew</strong>. 2PL can deadlock; detect deadlocks with a waits-for graph or avoid them with wait-die / wound-wait.`,
    `<strong>LSM Trees</strong> buffer writes in a memtable, flush immutable sorted SSTables, merge them on reads with a priority queue and compact them in the background. Choosing between leveled and size-tiered compaction trades read, write and space amplification (the <strong>RUM conjecture</strong>).`,
    `Every structure in Part I can be described by three properties: <strong>buffering</strong>, <strong>immutability</strong> and <strong>ordering</strong> (Figure I-1). Mix and match them, but every choice makes some operation more expensive.`
  ],
  chapters: [
    // ------------------------------------------------------------------
    {
      id: `ch1`, part: 1, number: 1,
      title: `Introduction and Overview`,
      overview: `A map of the territory. The chapter splits a database into its components, then classifies storage engines along three axes: <strong>memory- vs disk-based</strong>, <strong>row- vs column-oriented</strong>, and how <strong>data files and index files</strong> are organized (index-organized, heap, hashed; clustered vs nonclustered; primary key vs offset indirection). It ends with the three variables that the rest of Part I keeps returning to: <strong>buffering, mutability and ordering</strong>.`,
      concepts: [
        { term: `DBMS architecture`, def: `Client requests arrive through the <strong>transport</strong> subsystem, go to the <strong>query processor</strong> (parser, then optimizer that picks an execution plan), run on the <strong>execution engine</strong> (local and remote execution), which uses the <strong>storage engine</strong>.`, why: `Knowing the layers tells you where a concern lives: a slow plan is an optimizer problem, a slow page read is a storage engine problem.` },
        { term: `Storage engine components`, def: `<strong>Transaction manager</strong> (schedules transactions, keeps state consistent), <strong>lock manager</strong> (locks on database objects), <strong>access methods</strong> (heap files, B-Trees, LSM Trees), <strong>buffer manager</strong> (caches pages in memory) and <strong>recovery manager</strong> (log, restore after failure).`, why: `Chapters 2-7 are essentially a tour of these components, starting with access methods.` },
        { term: `Memory- vs disk-based DBMS`, def: `In-memory databases keep data primarily in RAM and use disk for recovery and logging. Disk-based databases keep most data on disk and cache it in memory.`, why: `RAM is still more expensive and volatile, but in-memory engines can use simpler structures because they don't have to manage variable-size disk pages. Moving pointers in memory is cheap; on disk it is expensive.`, ex: `An in-memory engine stays durable by writing a WAL sequentially and periodically applying it to a <strong>backup copy</strong> (a checkpoint), so the log can be trimmed.` },
        { term: `Row-oriented layout`, def: `All fields of a record are stored together, so one block holds whole rows.`, why: `Ideal when records are read and written as a unit (OLTP, user profiles). Reading one column of many rows pages in all the other columns too.`, ex: `The book's users table: ID, Name, Birth Date, Phone Number (10 John, 20 Sam, 30 Keith).`, demo: `rowColumn` },
        { term: `Column-oriented layout`, def: `Values of each column are stored contiguously, in separate files or file segments. Tuples are reconstructed by an explicit key or an implicit <strong>virtual ID</strong> (the position).`, why: `Analytical scans read only the needed columns. Same-type data compresses better and enables vectorized processing. MonetDB and C-Store (Vertica's predecessor) are examples, and Parquet and ORC are column-oriented formats.`, ex: `Stock quotes: Symbol: 1:DOW; 2:DOW; 3:S&amp;P; 4:S&amp;P, then Date and Price columns stored the same way.`, demo: `rowColumn` },
        { term: `Wide column stores`, def: `Bigtable and HBase store data as a multidimensional map: rows keyed by row key, grouped into <strong>column families</strong> that are stored together, with versioned cells.`, why: `Despite the name they are <strong>not</strong> column-oriented. Within a column family, data is stored row-wise.` },
        { term: `Data files`, def: `Also called primary files. They can be <strong>index-organized tables</strong> (IOT: the records live in the index itself, in key order), <strong>heap files</strong> (records in no particular order, usually write order) or <strong>hashed files</strong> (records in buckets chosen by a hash of the key).`, why: `IOTs save one disk seek on reads by primary key and make range scans sequential. Heap files make appends cheap but need an extra index for lookups.` },
        { term: `Index files`, def: `Structures that map keys to data record locations. A <strong>primary index</strong> is built over the primary key; all others are <strong>secondary indexes</strong>.`, why: `Secondary indexes can hold several entries per search key, and many can exist per table.` },
        { term: `Clustered vs nonclustered`, def: `An index is <strong>clustered</strong> when the data records are stored in the same order as the search key. Otherwise it is <strong>nonclustered</strong>.`, why: `Index-organized tables are clustered by definition, and primary indexes are usually clustered. Secondary indexes are nonclustered by definition.` },
        { term: `Primary key as indirection`, def: `Secondary indexes can store the record's file offset directly, or store the <strong>primary key</strong> and look the record up through the primary index.`, why: `Direct offsets mean fewer lookups on reads, but every index must be updated when a record moves. Primary-key indirection costs an extra lookup on reads but cuts index updates on relocation. MySQL InnoDB uses the primary key. A hybrid stores both and falls back to the primary key when the offset is stale.`, demo: `indexIndirection` },
        { term: `Buffering`, def: `Whether the structure collects some amount of data in memory before putting it on disk.`, why: `Every on-disk structure buffers to some degree (the minimum unit is a block). The interesting cases are avoidable buffering: in-memory buffers on B-Tree nodes, or memtables in LSM Trees.` },
        { term: `Mutability (in-place update vs immutable)`, def: `Whether parts of the file are updated in place, or written once and only appended or copied-on-write.`, why: `Mutable structures overwrite pages; immutable ones never modify existing data. The book's labels: in-place update storage vs append-only storage.` },
        { term: `Ordering`, def: `Whether records are stored in key order in the pages, so keys adjacent in order are adjacent on disk.`, why: `Ordering enables efficient range scans. Unordered (insertion order) storage gives cheaper writes but expensive range queries.` },
        { term: `Deletion markers (tombstones)`, def: `Many engines don't remove deleted records right away; they write a marker (tombstone) and reclaim space later during garbage collection.`, why: `It keeps deletes cheap and explains why disk space is freed only after compaction or vacuum.` }
      ],
      cheatsheet: [
        { title: `DBMS components`, type: `table`, headers: [`Layer`, `Responsibilities`], rows: [
          [`Transport`, `Client communication; cluster communication with other nodes`],
          [`Query processor`, `Parse and validate the query; the optimizer picks the most efficient plan`],
          [`Execution engine`, `Run the plan: local execution and remote execution (distributed)`],
          [`Storage engine`, `Transaction manager, lock manager, access methods, buffer manager, recovery manager`]
        ] },
        { title: `Row vs column vs wide column`, type: `table`, headers: [`Layout`, `Stored together`, `Good for`, `Examples`], rows: [
          [`Row-oriented`, `All fields of a record`, `Point reads/writes of whole records (OLTP)`, `MySQL, PostgreSQL`],
          [`Column-oriented`, `Values of one column`, `Scans, aggregates, compression (OLAP)`, `MonetDB, C-Store, Vertica; Parquet, ORC`],
          [`Wide column`, `Column family per row key (row-wise within the family)`, `Sparse, versioned, keyed data`, `Bigtable, HBase`]
        ] },
        { title: `Data file organizations`, type: `table`, headers: [`Organization`, `Record placement`, `Notes`], rows: [
          [`Index-organized table`, `Inside the index, in key order`, `Clustered by definition; saves a seek on primary-key reads`],
          [`Heap file`, `No order (usually write order)`, `Cheap appends; needs separate indexes; records referenced by offset`],
          [`Hashed file`, `Bucket chosen by hash(key)`, `Fast point lookups; no ordered range scans`]
        ], note: `Secondary indexes are nonclustered by definition. Direct offsets mean faster reads; primary-key references mean fewer index updates.` },
        { title: `The three variables`, type: `list`, items: [
          `<strong>Buffering</strong>: hold data in memory before writing it (memtables, node buffers).`,
          `<strong>Mutability</strong>: update pages in place, or append / copy-on-write.`,
          `<strong>Ordering</strong>: records in key order (range scans) or insertion order (cheap writes).`,
          `B-Trees: mutable + ordered. LSM Trees: buffered + immutable + ordered. Bitcask: immutable + unordered.`
        ] }
      ],
      interview: [
        { q: `Name the components of a storage engine.`, a: `Transaction manager (schedules transactions and ensures they leave the database consistent), lock manager (locks on database objects for concurrent transactions), access methods (the storage structures: heap files, B-Trees, LSM Trees), buffer manager (caches data pages in memory) and recovery manager (maintains the operation log and restores state after a failure).`, diff: `easy` },
        { q: `How do in-memory databases stay durable?`, a: `They write every operation to a write-ahead log on disk before acknowledging it, and periodically apply log records to a backup copy (a checkpoint) kept on disk in sorted form. After a crash they load the latest checkpoint and replay the remaining log. Batching log writes keeps this cheap.`, diff: `med` },
        { q: `When would you pick a column store over a row store?`, a: `For analytical workloads that scan many rows but few columns: aggregates, trends, averages. A column store reads only the queried columns, compresses same-type values well and allows vectorized processing. For OLTP that reads and writes whole records by key, a row store has better locality.`, diff: `easy` },
        { q: `Is Bigtable a column-oriented database?`, a: `No. It is a wide-column store: a multidimensional sorted map keyed by row key, where columns are grouped into column families that are stored together. Within a column family, data is stored row-wise. Column-oriented means every column is stored separately, as in Vertica or Parquet.`, diff: `med` },
        { q: `Compare index-organized tables and heap files.`, a: `An IOT stores records in the index itself in key order, so a primary-key lookup finds the data directly and range scans are sequential. A heap file stores records in arbitrary (usually write) order, so appends are cheap but every lookup goes through a separate index that stores offsets.`, diff: `med` },
        { q: `Should secondary indexes store file offsets or primary keys?`, a: `Offsets give one lookup per read, but every secondary index must be updated whenever a record moves (page split, update that changes size, compaction). Primary keys need an extra primary-index lookup per read, but records can move freely with only the primary index updated. InnoDB uses primary keys. A hybrid stores both and falls back to the primary key when the offset is stale.`, diff: `hard` },
        { q: `What are the three variables the book uses to classify storage structures?`, a: `Buffering (collect data in memory before writing), mutability (update in place vs append or copy-on-write) and ordering (records in key order vs insertion order). B-Trees are mutable and ordered; LSM Trees are buffered, immutable and ordered; Bitcask is immutable and unordered.`, diff: `easy` },
        { q: `What is the difference between a clustered and a primary index?`, a: `A primary index is built over the primary key. An index is clustered when the order of data records follows the order of the index key. Primary indexes are most often clustered (and IOTs are clustered by definition), but the terms are not identical. Secondary indexes are always nonclustered.`, diff: `med` }
      ],
      labs: [`rowColumn`, `indexIndirection`]
    },
    // ------------------------------------------------------------------
    {
      id: `ch2`, part: 1, number: 2,
      title: `B-Tree Basics`,
      overview: `Why B-Trees rule disk-based storage. Binary search trees are elegant in memory but on disk they have a low <strong>fanout</strong> and large <strong>height</strong>, rebalancing moves lots of pointers, and neighbouring nodes land on random pages. After a look at <strong>HDD and SSD</strong> internals (sectors, seeks, pages, erase blocks, the FTL) the chapter introduces the <strong>B-Tree</strong>: wide, short, sorted nodes with separator keys, and the lookup, split and merge algorithms that keep it balanced.`,
      concepts: [
        { term: `Binary search tree (BST)`, def: `A sorted in-memory structure where each node has a key, a value and two children. Keys in the left subtree are smaller and keys in the right subtree are larger.`, why: `Lookups take O(log<sub>2</sub>N) only if the tree is <strong>balanced</strong>. Inserting keys in sorted order degenerates it into a linked list (a pathological tree).`, demo: `btreeHeight` },
        { term: `Tree balancing`, def: `Reorganizing nodes (for example with rotations) after inserts so the height stays close to log<sub>2</sub>N, where N is the number of items.`, why: `Balanced trees bound the worst case. On disk, rebalancing means rewriting pointers on many pages.` },
        { term: `Why BSTs fail on disk`, def: `Locality: children of a node can live on any page. Fanout of 2: height is log<sub>2</sub>N, so one disk seek per level. Pointer maintenance on every rebalance.`, why: `High fanout and low height are the properties of an optimal on-disk structure. The B-Tree is designed around them.`, demo: `btreeHeight` },
        { term: `Hard disk drives`, def: `Data on spinning platters. Random reads need a <strong>seek</strong> (head movement) and rotation; after that, sequential bytes are cheap. The smallest transfer unit is a <strong>sector</strong> (512 B to 4 KB).`, why: `Head positioning is the most expensive part, which is why sequential I/O is preferred.` },
        { term: `Solid state drives`, def: `Cells form strings, then arrays, then pages (2-16 KB), then blocks (64-512 pages), then planes and dies. Reads and writes happen per <strong>page</strong>, but only erased cells can be written, and erasing happens per <strong>block</strong> (erase block).`, why: `Random vs sequential reads matter less than on HDDs, but random and unaligned writes trigger expensive garbage collection.`, demo: `ftl` },
        { term: `Flash Translation Layer (FTL)`, def: `Controller logic that maps logical page IDs to physical locations, tracks empty, written and discarded pages, and garbage-collects: relocates live pages out of a block, then erases it.`, why: `Its work is invisible but drives write amplification and latency spikes on SSDs.`, demo: `ftl` },
        { term: `Block device abstraction`, def: `The OS hides the disk structure and exposes blocks: reading one word reads the whole block containing it.`, why: `On-disk structures must be designed around blocks: fewer disk accesses, better locality, fewer out-of-page pointers.` },
        { term: `B-Tree structure`, def: `A sorted tree of <strong>nodes</strong> (one page each) holding up to N keys and N+1 child pointers. <strong>Root</strong> at the top, <strong>internal nodes</strong> in the middle, <strong>leaves</strong> at the bottom. Keys within a node are sorted, which enables binary search.`, why: `Fanout in the hundreds means a billion records fit in a tree just 3-4 levels deep.`, demo: `btree` },
        { term: `B+-Tree`, def: `A variant that stores values only in <strong>leaf</strong> nodes. Internal nodes hold only <strong>separator keys</strong> that guide the search. Leaves are often linked with sibling pointers for range scans.`, why: `Most databases mean B+-Tree when they say B-Tree. Inserts, updates and deletes only change leaves; internal nodes change only on splits and merges.`, demo: `btree` },
        { term: `Separator keys`, def: `Keys in internal nodes that split the tree into subtrees. Child pointer i leads to keys between separator i-1 (inclusive, in many implementations) and separator i.`, why: `They are just guides: a separator may no longer exist as a record in a leaf.`, demo: `btree` },
        { term: `Lookup complexity`, def: `Two ways to count: <strong>block transfers</strong> are log<sub>K</sub>M (K keys per node, M records), and <strong>comparisons</strong> are log<sub>2</sub>M because each node is binary searched.`, why: `The disk cares about transfers; the CPU cares about comparisons. 4 billion items need about 32 comparisons either way, but a B-Tree needs only a handful of page reads.`, demo: `btreeHeight` },
        { term: `Node splits`, def: `When inserting into a full node (a leaf holds N key-value pairs; an internal node holds N+1 pointers), allocate a new node, move half the elements to it, and <strong>promote</strong> the first key of the new node (or the midpoint) into the parent. If the parent is full, split it too.`, why: `Splits can cascade up to the root. When the root splits, a new root is created and the tree grows by one level.`, demo: `btree` },
        { term: `Node merges`, def: `When deletes leave neighbouring nodes with few enough keys to fit in one node, copy one into the other, remove the separator (leaf) or demote it (internal) from the parent, and free the page. Some implementations redistribute keys instead.`, why: `Merges can cascade upward. If the root ends up with one child, that child becomes the new root and the height shrinks.`, demo: `btree` },
        { term: `Occupancy`, def: `How full the nodes are. B-Trees keep nodes between half full and full.`, why: `Higher occupancy means fewer pages, lower height and better cache use. Split policies and bulk loading change it.`, demo: `fillFactor` }
      ],
      cheatsheet: [
        { title: `BST vs B-Tree on disk`, type: `table`, headers: [`Property`, `Binary search tree`, `B-Tree`], rows: [
          [`Fanout`, `2`, `Hundreds (as many keys as fit in a page)`],
          [`Height`, `log<sub>2</sub>N`, `log<sub>K</sub>N`],
          [`Disk seeks per lookup`, `One per level (~32 for 4B items)`, `3-4 for billions of items`],
          [`Comparisons per lookup`, `log<sub>2</sub>N`, `log<sub>2</sub>N (binary search inside nodes)`],
          [`Locality`, `Children anywhere`, `A whole node per page`],
          [`Balancing`, `Rotations, pointer updates`, `Splits and merges, growing and shrinking at the root`]
        ] },
        { title: `HDD vs SSD`, type: `table`, headers: [`Aspect`, `HDD`, `SSD`], rows: [
          [`Smallest unit`, `Sector (512 B-4 KB)`, `Page (2-16 KB) for read/write; block (64-512 pages) for erase`],
          [`Expensive part`, `Seek + rotation`, `Erase + garbage collection`],
          [`Random vs sequential reads`, `Huge gap`, `Small gap (prefetching, parallelism)`],
          [`Writes`, `In place`, `Only to erased pages, sequentially within a block`]
        ] },
        { title: `B-Tree lookup, insert and delete`, type: `code`, body: `lookup(key):
  node = root
  while node is internal:
    i = binary_search(node.keys, key)   // first separator > key
    node = node.children[i]
  return binary_search(node.keys, key)  // in the leaf

insert(key, value):
  leaf = find_leaf(key)
  insert into leaf in sorted position
  if leaf overflows:
    split leaf, move half to new node
    promote first key of new node to parent   // may cascade
    if root splits: new root, height + 1

delete(key):
  remove from leaf
  if leaf underflows and sibling can absorb it:
    merge into sibling, remove separator from parent  // may cascade
    if root has one child: child becomes root, height - 1` },
        { title: `Terminology`, type: `list`, items: [
          `<strong>Root</strong>: top node, no parent. <strong>Leaf</strong>: bottom layer, no children. <strong>Internal</strong>: everything else.`,
          `<strong>Fanout</strong>: maximum children per node. <strong>Occupancy</strong>: how full a node is.`,
          `<strong>Separator keys</strong> (index entries, divider cells): split the key space between children.`,
          `<strong>B+-Tree</strong>: values only in leaves; <strong>sibling pointers</strong> link nodes on the same level.`
        ] }
      ],
      interview: [
        { q: `Why are B-Trees preferred over binary search trees for on-disk storage?`, a: `On disk, each node access is a block transfer. A BST has fanout 2, so its height (and seek count) is log2 N, nodes are scattered with poor locality, and rebalancing rewrites many pointers. A B-Tree packs hundreds of keys in a page-sized node, so height is log_K N (3-4 levels for billions of records), each node read brings many useful keys, and balancing is done with local splits and merges.`, diff: `easy` },
        { q: `What is the lookup complexity of a B-Tree?`, a: `Two perspectives: log_K M block transfers (K keys per node, M total) and log_2 M key comparisons, since each node is binary searched. The I/O count is what matters on disk.`, diff: `med` },
        { q: `Walk through a B-Tree node split.`, a: `Insert into a leaf that is full. Allocate a new node, move half the keys (from the split point) into it, add the new key to the correct half, then insert the first key of the new node and a pointer to it into the parent. If the parent overflows, split it the same way. If the root splits, create a new root with two children: the tree grows by one level.`, diff: `med` },
        { q: `When are B-Tree nodes merged?`, a: `When deletes leave a node underfull and its sibling has few enough keys that both fit in one node. Contents are moved into one node, the separator is removed from the parent (or demoted into the merged node for internal nodes) and the empty page is freed. Merges can cascade, and if the root ends up with one child, that child becomes the root. Implementations may prefer redistributing keys between siblings instead.`, diff: `med` },
        { q: `What is the difference between a B-Tree and a B+-Tree?`, a: `The original B-Tree stores values in every node. A B+-Tree stores values only in leaves; internal nodes contain only separator keys. This raises internal fanout, confines record changes to leaves, and makes range scans easy by following sibling pointers between leaves. Most databases use B+-Trees.`, diff: `easy` },
        { q: `Why do SSDs care about write patterns?`, a: `SSDs read and write pages but erase whole blocks, and pages can only be written after erase. Overwrites mark old pages as discarded and write elsewhere. The FTL must garbage-collect: relocate live pages from a victim block and erase it. Random, unaligned writes leave blocks half-live, so GC moves more data, causing write amplification and latency spikes. Sequential, block-aligned writes avoid most of that.`, diff: `hard` },
        { q: `Why does a B-Tree grow from the root instead of the leaves?`, a: `New nodes are created by splitting. A full root splits into two and a new root is created above them, so every leaf stays at the same depth. That is how the tree stays balanced without rotations.`, diff: `med` },
        { q: `How many comparisons does it take to find one of 4 billion keys?`, a: `About 32, since log2(4 billion) ≈ 32. A balanced BST would need ~32 disk seeks for that, while a B-Tree with a fanout of a few hundred needs about 4 page reads and does the comparisons in memory with binary search inside each node.`, diff: `easy` }
      ],
      labs: [`btreeHeight`, `btree`]
    },
    // ------------------------------------------------------------------
    {
      id: `ch3`, part: 2, number: 3,
      title: `File Formats`,
      overview: `How a B-Tree actually looks on disk. Starting from <strong>binary encoding</strong> (primitive types, endianness, strings, bit-packed booleans, enums and flags), the chapter builds up a file: header, pages, trailer and fixed-schema records. Its centerpiece is the <strong>slotted page</strong>: an offset array plus cells, which handles variable-size records, deletion and reordering. It closes with cell layouts, free-space management (first fit vs best fit), <strong>versioning</strong> and <strong>checksumming</strong>.`,
      concepts: [
        { term: `Why a custom format`, def: `On disk there is no malloc/free and no garbage collector: you serialize, lay out and manage space yourself. Data is read in pages, so the format controls how much is read.`, why: `Creating file formats is similar to building data structures in languages with manual memory management.` },
        { term: `Endianness`, def: `The byte order of multi-byte values. <strong>Big-endian</strong> starts with the most significant byte (0xAABBCCDD is stored AA BB CC DD); <strong>little-endian</strong> starts with the least significant (DD CC BB AA).`, why: `Encoder and decoder must agree. RocksDB has platform-specific definitions to detect the target platform's byte order.`, demo: `byteEncoding` },
        { term: `Primitive types`, def: `Fixed-size integers (byte 8 bits, short 2 bytes, int 4, long 8) and IEEE 754 floating-point numbers (sign, exponent, fraction).`, why: `Fixed sizes make offsets computable, which is what lets you jump into a page without parsing it.` },
        { term: `Strings and variable-size data`, def: `Serialized as size + bytes (a <strong>Pascal string</strong>: a fixed-size length header followed by data). The alternative, null-terminated C strings, requires scanning to find the end.`, why: `Size-prefixed strings give constant-time length and can be sliced without scanning.`, demo: `byteEncoding` },
        { term: `Bit-packed data`, def: `Booleans packed 8 per byte, <strong>enums</strong> as small integers (ROOT 0x00, INTERNAL 0x01, LEAF 0x02), and <strong>flags</strong> as power-of-two masks combined in one integer.`, why: `Page headers are full of flags. Set with <code>flags |= MASK</code>, unset with <code>flags &amp;= ~MASK</code>, test with <code>(flags &amp; MASK) != 0</code>.`, ex: `IS_LEAF_MASK = 0x01, VARIABLE_SIZE_VALUES = 0x02, HAS_OVERFLOW_PAGES = 0x04.`, demo: `byteEncoding` },
        { term: `File organization`, def: `A fixed-size <strong>header</strong>, then pages, possibly a fixed-size <strong>trailer</strong>. Header and trailer hold information needed to decode the rest of the file.`, why: `Most in-place update structures use same-size pages, which simplifies addressing: page ID × page size = offset.` },
        { term: `Fixed-schema records`, def: `Fixed-size fields first, then variable-size ones, with their lengths (or offsets) stored in the fixed area.`, why: `Any field can be located with arithmetic instead of parsing.`, ex: `Employee: employee_id (4 B), tax_number (4 B), date (3 B), gender (1 B), first_name_length (2 B), last_name_length (2 B), then first_name, last_name.`, demo: `byteEncoding` },
        { term: `Naive fixed-size page layout`, def: `Pack fixed-size records back to back in key order.`, why: `Inserting in the middle means relocating every following record, deleting leaves holes, and variable-size records don't fit the scheme.` },
        { term: `Slotted page`, def: `A page with a <strong>header</strong>, an <strong>offset array</strong> of pointers growing from the start, and <strong>cells</strong> growing from the end. Free space sits in the middle.`, why: `Records are referenced by slot ID. Reordering means only rewriting short offsets, not moving data. Deleted space can be reclaimed by defragmenting. Used by PostgreSQL and many others.`, ex: `Insert Tom, Leslie, Ron: cells are appended in insertion order, but the offset array is kept sorted (Leslie, Ron, Tom).`, demo: `slottedPage` },
        { term: `Cell layout`, def: `<strong>Key cells</strong> (internal nodes) hold a key and a child page ID. <strong>Key-value cells</strong> (leaves) hold a key and data. Variable-size cells have a header: cell type flags, key size, value size, then the bytes.`, why: `Keeping cell metadata in the cell and page-wide information (like the cell kind) in the page header avoids duplicating it per cell.` },
        { term: `Availability list (freelist)`, def: `Deleted cells are just marked and their segments added to a freelist with offsets and sizes. New cells are placed with <strong>first fit</strong> (the first segment that fits) or <strong>best fit</strong> (the one leaving the smallest remainder).`, why: `First fit is fast but may leave unusable fragments. Best fit wastes less but needs a full scan. If total free space suffices but no segment fits, the page is <strong>defragmented</strong>. If even that won't help, an overflow page is needed.`, demo: `slottedPage` },
        { term: `Versioning`, def: `Storing the format version so old and new binaries can read files correctly: in the file name (Cassandra's na-, ma- prefixes), in a separate file (PostgreSQL's PG_VERSION) or in the file header.`, why: `Formats evolve. Without a version number, an upgrade can't tell how to decode older files.` },
        { term: `Checksums and CRC`, def: `A checksum (sum or XOR of bytes) is the weakest check. A <strong>cyclic redundancy check (CRC)</strong> detects burst errors (several consecutive bits corrupted) and is computed per page, stored in the page header.`, why: `Corruption from software bugs or hardware should be detected before it propagates. Checksums are for error detection, not protection against attackers; that needs cryptographic hashes.`, demo: `checksum` }
      ],
      cheatsheet: [
        { title: `Bit flag operations`, type: `code`, body: `int IS_LEAF_MASK         = 0x01; // bit #1
int VARIABLE_SIZE_VALUES = 0x02; // bit #2
int HAS_OVERFLOW_PAGES   = 0x04; // bit #3

flags |= HAS_OVERFLOW_PAGES;       // set   (or flags |= (1 << 2))
flags &= ~HAS_OVERFLOW_PAGES;      // unset (or flags &= ~(1 << 2))
is_set = (flags & HAS_OVERFLOW_PAGES) != 0;   // test` },
        { title: `Slotted page anatomy`, type: `table`, headers: [`Part`, `Grows`, `Contents`], rows: [
          [`Header`, `Fixed`, `Flags, cell count, free space pointers, checksum, sibling links...`],
          [`Offset array`, `Forward (from start)`, `Pointers to cells, sorted in key order`],
          [`Free space`, `Shrinks`, `Gap between the offset array and the cells`],
          [`Cells`, `Backward (from end)`, `Key cells or key-value cells, in insertion order`]
        ], note: `Records are addressed by slot ID; moving a cell means updating one pointer.` },
        { title: `Free space placement`, type: `table`, headers: [`Strategy`, `Picks`, `Trade-off`], rows: [
          [`First fit`, `The first freelist segment large enough`, `Fast; can leave small unusable remainders`],
          [`Best fit`, `The segment leaving the smallest remainder`, `Less waste; scans the whole freelist`],
          [`Defragmentation`, `Rewrite the page compactly`, `When total free space suffices but no single segment does`],
          [`Overflow page`, `A new linked page`, `When the page really is full`]
        ] },
        { title: `File format checklist`, type: `list`, items: [
          `Fixed-size header (and maybe trailer) with metadata, magic numbers, version.`,
          `Same-size pages so offset = page ID × page size.`,
          `Fixed-size fields first; sizes or offsets of variable fields in the fixed area.`,
          `Pick an endianness and stick to it.`,
          `Pascal-style size-prefixed strings.`,
          `Per-page CRC checksum in the header.`
        ] }
      ],
      interview: [
        { q: `What is a slotted page and why is it used?`, a: `A page with a header, an offset array (slots) at the start and cells at the end, growing towards each other. It stores variable-size records, keeps them logically sorted by sorting only the offset array, lets external references use stable slot IDs, and reclaims space from deleted records by defragmenting the page rather than relocating everything.`, diff: `med` },
        { q: `Explain big-endian vs little-endian.`, a: `They are byte orders for multi-byte values. Big-endian puts the most significant byte first (0xAABBCCDD is stored AA BB CC DD); little-endian puts the least significant first (DD CC BB AA). A file format must fix one and the decoder must convert if the CPU differs.`, diff: `easy` },
        { q: `How do you represent variable-length strings on disk?`, a: `As a Pascal string: a fixed-size length prefix followed by the bytes. The size is known in constant time and the string can be sliced out without scanning. In fixed-schema records you put lengths (or offset + length) in the fixed-size area so each variable field can be located directly.`, diff: `easy` },
        { q: `What happens when a record is deleted from a slotted page?`, a: `The cell is not physically removed. Its offset is removed from the offset array (or marked) and its segment is added to an availability list with its offset and size. New inserts reuse free segments by first fit or best fit. When total free space is enough but fragmented, the page is defragmented by rewriting cells contiguously.`, diff: `med` },
        { q: `First fit vs best fit?`, a: `First fit takes the first free segment that is large enough: fast, but it may leave remainders too small for anything. Best fit takes the segment that leaves the smallest remainder: less fragmentation, but it scans the whole list.`, diff: `easy` },
        { q: `Why use CRC instead of a simple checksum?`, a: `Simple sums or XOR miss common corruption patterns. For example, two flipped bits in the same position of different bytes cancel out in XOR. CRCs are designed to detect burst errors (consecutive corrupted bits), which are typical for storage and transmission. Databases compute a CRC per page and verify it on read.`, diff: `med` },
        { q: `How do databases handle file format changes across versions?`, a: `They store a version identifier: in the file name prefix (Cassandra), in a separate file (PostgreSQL's PG_VERSION), or in the file header. Readers dispatch to the right decoder, so old files stay readable after upgrades.`, diff: `easy` },
        { q: `How are flags stored and manipulated in a page header?`, a: `As power-of-two masks packed into one integer: each flag is one bit. Set with OR, unset with AND NOT, test by ANDing and comparing to zero. Enums are packed as small integers when values are mutually exclusive.`, diff: `easy` }
      ],
      labs: [`byteEncoding`, `slottedPage`, `checksum`]
    },
    // ------------------------------------------------------------------
    {
      id: `ch4`, part: 2, number: 4,
      title: `Implementing B-Trees`,
      overview: `From textbook B-Tree to production. The chapter covers what goes into the <strong>page header</strong> (magic numbers, sibling links, rightmost pointers, high keys), <strong>overflow pages</strong> for large values, binary search through indirection pointers, <strong>breadcrumbs</strong> for propagating splits and merges, and optimizations: <strong>rebalancing</strong>, <strong>right-only appends</strong>, <strong>bulk loading</strong> and <strong>compression</strong>. It ends with <strong>vacuum and maintenance</strong>: fragmentation, garbage collection and free page tracking.`,
      concepts: [
        { term: `Magic numbers`, def: `A known multibyte constant in the page header (for example 50 41 47 45, "PAGE") identifying the block as a page of a certain kind.`, why: `A cheap sanity check that the right page was loaded and the offset is correct.` },
        { term: `Sibling links`, def: `Forward and backward pointers to the left and right siblings on the same level.`, why: `Range scans move between neighbours without going back to the parent. Splits and merges must update them, which complicates concurrency (and is exploited by Blink-Trees).` },
        { term: `Rightmost pointers`, def: `A node with N separator keys has N+1 child pointers. The extra one is stored separately in the header (SQLite does this).`, why: `Keeps every cell a (key, pointer) pair. When the rightmost child splits, the new separator goes into a cell and the rightmost pointer is reassigned.` },
        { term: `Node high keys`, def: `Store the upper bound of the subtree in the node as well (Blink-Trees, PostgreSQL). Then each node has N keys and N pointers, each pair describing a bounded range.`, why: `Uniform cells, and concurrent readers can tell if a key moved to the right sibling during a split.` },
        { term: `Overflow pages`, def: `Nodes can grow by linking 4 KB extension pages. Each record keeps at most <strong>max_payload_size</strong> bytes in the primary page (node size / fanout), and the rest spills to overflow pages.`, why: `This guarantees a node always has room for its fanout. Overflow data needs extra page reads, but usually only to fetch the full value: the key prefix stays in the primary page for searching.`, demo: `overflowPages` },
        { term: `Binary search with indirection`, def: `Keys are searched through the sorted offset array: read the offset, follow it to the cell, compare. The result is the index if found, or a negative insertion point (-(insertion point) - 1) if not.`, why: `Cells don't need to be sorted physically; only the offsets do.` },
        { term: `Breadcrumbs`, def: `During descent, keep a stack of the visited nodes (and child indexes). Splits and merges propagate back up by popping it. PostgreSQL calls it BTStack.`, why: `Avoids storing parent pointers in every node, which would need updating whenever pages move.` },
        { term: `Rebalancing`, def: `Instead of splitting a full node, move elements into a less occupied sibling, updating the parent separator. <strong>B*-Trees</strong> keep distributing between neighbours until both are full, then split two nodes into three.`, why: `Higher occupancy and fewer levels, at the cost of more complex maintenance.`, demo: `fillFactor` },
        { term: `Right-only appends`, def: `With auto-incrementing keys, every insert lands in the rightmost leaf. PostgreSQL's <strong>fastpath</strong> caches the rightmost leaf to skip the descent; SQLite's <strong>quickbalance</strong> allocates a new empty rightmost page instead of splitting the full one in half.`, why: `Half-splits on sequential inserts leave every left page 50% empty. Appending leaves them full.`, demo: `fillFactor` },
        { term: `Bulk loading`, def: `Build the tree bottom-up from presorted data: fill leaves to capacity, and promote the first key of each new leaf to the level above.`, why: `No splits or merges, almost 100% occupancy, and pages are written sequentially. Used for initial loads and index rebuilds. Immutable B-Trees can be built this way too.`, demo: `fillFactor` },
        { term: `Compression`, def: `Compress whole files (impractical: whole-file reads), individual pages (page sizes stop aligning with disk blocks) or individual rows or fields (more CPU, finer grain).`, why: `It trades CPU for I/O and disk space. Page-level compression complicates aligned I/O, since compressed pages are smaller than disk blocks.` },
        { term: `Fragmentation and garbage`, def: `Updates and deletes leave unreferenced cells in pages (garbage), and splits leave pages out of physical order.`, why: `Reads touch more pages and scans become random. Deleted space must be reclaimed eventually.` },
        { term: `Vacuum and maintenance`, def: `Background processes that rewrite pages compactly, reclaim garbage cells, relocate pages and track freed pages in a <strong>free page list</strong> (SQLite freelist) for reuse.`, why: `Without maintenance, space usage and read cost grow over time. Doing it in the background avoids slowing down queries.` }
      ],
      cheatsheet: [
        { title: `Page header fields`, type: `table`, headers: [`Field`, `Purpose`], rows: [
          [`Magic number`, `Validate page type and alignment`],
          [`Flags`, `Leaf/internal, variable-size values, has overflow pages`],
          [`Cell count, free space offsets`, `Slotted page bookkeeping`],
          [`Sibling links`, `Left/right neighbours for scans`],
          [`Rightmost pointer`, `The N+1th child pointer`],
          [`High key`, `Upper bound of the subtree (Blink-Trees)`],
          [`Checksum, LSN`, `Corruption detection, recovery bookkeeping`]
        ] },
        { title: `Split strategies and occupancy`, type: `table`, headers: [`Strategy`, `How`, `Typical result`], rows: [
          [`Half split`, `Move half the keys to a new node`, `~50% after sequential inserts, ~70% random`],
          [`Rebalancing / B*`, `Shift keys to a sibling; split 2 nodes into 3`, `Higher occupancy, more work per insert`],
          [`Right-only append`, `New empty rightmost page (quickbalance) + cached rightmost leaf (fastpath)`, `~100% for sequential keys`],
          [`Bulk loading`, `Build bottom-up from sorted data`, `~100%, no splits`]
        ] },
        { title: `Binary search through offsets`, type: `code`, body: `// returns index if found, -(insertionPoint) - 1 if not
int search(page, key):
  lo = 0, hi = page.cellCount - 1
  while lo <= hi:
    mid = (lo + hi) / 2
    cellKey = page.cellAt(page.offsets[mid]).key   // indirection
    if cellKey < key:  lo = mid + 1
    elif cellKey > key: hi = mid - 1
    else: return mid
  return -(lo + 1)` },
        { title: `Maintenance checklist`, type: `list`, items: [
          `Garbage: cells shadowed by updates or marked deleted.`,
          `Defragment pages: rewrite live cells contiguously.`,
          `Track freed pages in a free list; reuse before growing the file.`,
          `Run vacuum/compaction in the background, coordinated with readers.`,
          `Rebuild or bulk load indexes to restore physical order.`
        ] }
      ],
      interview: [
        { q: `What are overflow pages and when are they used?`, a: `Linked extension pages for records too large for their node. Each record may keep at most max_payload_size bytes (node size divided by fanout) in the primary page; the rest spills into overflow pages. The node then always has room for its fanout. The key prefix normally stays in the primary page, so searching doesn't require reading the overflow chain.`, diff: `med` },
        { q: `How does a B-Tree find the parent when propagating a split?`, a: `With breadcrumbs: during the root-to-leaf descent, push each visited node (and the child index followed) onto a stack. After a split or merge, pop the stack to get the parent. PostgreSQL calls it BTStack. This avoids storing and maintaining parent pointers in every node.`, diff: `med` },
        { q: `Why are sequential inserts bad for a naive B-Tree, and how is it fixed?`, a: `Every insert hits the rightmost leaf. Splitting it in half leaves the left page half empty forever, since no keys will ever go there, so occupancy drops to ~50%. PostgreSQL's fastpath caches the rightmost leaf to skip the descent, and SQLite's quickbalance allocates a new empty page for the new key instead of splitting the full one in half, keeping pages full.`, diff: `hard` },
        { q: `What is bulk loading?`, a: `Building a B-Tree from presorted data bottom-up: write leaves full and sequentially, and add the first key of each leaf to the parent level, recursively. No splits, near-100% occupancy, sequential writes. It's used for initial loads, index creation and rebuilds.`, diff: `easy` },
        { q: `What are B*-Trees?`, a: `A B-Tree variant that postpones splits by redistributing keys to siblings. When both neighbours are full, it splits two nodes into three instead of one into two. Occupancy is higher (nodes are at least two-thirds full), so the tree is shorter, at the cost of more complex inserts.`, diff: `med` },
        { q: `Why store high keys or a separate rightmost pointer?`, a: `A node with N keys has N+1 pointers, which breaks the uniform (key, pointer) cell format. SQLite stores the extra pointer separately in the header. Blink-Trees and PostgreSQL store a high key (the subtree's upper bound) so each pointer pairs with a key, and concurrent readers can detect a split by comparing the search key to the high key and following the sibling link.`, diff: `hard` },
        { q: `What does vacuum do in a B-Tree storage engine?`, a: `It reclaims space left by updates and deletes: removes garbage cells, defragments pages, adds freed pages to a free page list for reuse, and can relocate pages to restore locality. It runs in the background so it doesn't slow down queries.`, diff: `easy` },
        { q: `What compression granularities exist and what are the trade-offs?`, a: `Whole file (best ratio but you must decompress large regions to read anything), page (compressed pages no longer align with disk blocks, which complicates I/O), row or field (fine-grained, more CPU, less overall gain). The choice trades CPU and complexity for less I/O and storage.`, diff: `med` }
      ],
      labs: [`fillFactor`, `overflowPages`]
    }
  ]
};
