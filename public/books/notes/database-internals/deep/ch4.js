// Deep dive: Chapter 4, Implementing B-Trees. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch4 = {
  hook: `<p>You load ten million rows with an auto-incrementing ID into a fresh table and check the index size. It is nearly twice what the arithmetic predicts. Nothing is wrong with the data: every insert landed in the rightmost leaf, every full leaf was split down the middle, and the left half of each split never received another key. Half of every page in the index is empty, permanently.</p>
<p>The textbook B-Tree from Chapter 2 is correct, but it is not what ships. Real engines add page headers with extra pointers, spill big values to overflow pages, remember the path they took down the tree, special-case sequential inserts, build indexes bottom-up, compress pages and clean up after themselves. This chapter is about those details, which are the difference between a B-Tree that works and one that works well.</p>`,
  sections: [
    {
      id: "page-header",
      title: "What goes in a page header",
      kicker: "Anatomy",
      blocks: [
        {
          type: "text",
          html: `<p>Every B-Tree page starts with a header that describes the page itself: flags (leaf or internal, variable-size values, overflow present), the cell count, where free space begins and ends, a checksum, and often the log sequence number of the last change, used by recovery (Chapter 5). Beyond the slotted-page bookkeeping from Chapter 3, four fields are specific to B-Trees.</p>
<ul>
<li><strong>Magic number</strong>: a known multi-byte constant identifying the block as a page of this kind. If a read lands on the wrong offset, or the page is garbage, the magic number won't match. It is a cheap sanity check before anything else is trusted.</li>
<li><strong>Sibling links</strong>: the page IDs of the left and right neighbours on the same level, so range scans can move sideways without climbing back up to the parent. Splits and merges must keep them correct, which complicates concurrency.</li>
<li><strong>Rightmost pointer</strong>: one way to deal with an awkward asymmetry, described below.</li>
<li><strong>High key</strong>: the other way.</li>
</ul>`,
        },
        {
          type: "problem",
          html: `<p>An internal node with N separator keys has N+1 child pointers. If every cell is a (key, pointer) pair, one pointer is left without a key. Where does it go?</p>`,
        },
        {
          type: "diagram",
          title: "Two answers to the N+1 pointer problem",
          caption: "Top: the extra child pointer is stored once in the page header. Bottom: the node also stores its upper bound, the high key, so every pointer pairs with a key and every cell has the same shape.",
          svg: `<svg viewBox="0 0 620 210" role="img" aria-label="An internal node with a rightmost pointer in its header compared with a node that stores a high key">
<text x="20" y="24" font-size="13" font-weight="700">Rightmost pointer in the header (SQLite)</text>
<rect x="20" y="36" width="120" height="44" rx="5" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="80" y="63" text-anchor="middle" font-size="12">header: right = P3</text>
<rect x="150" y="36" width="92" height="44" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="196" y="63" text-anchor="middle" font-size="12">P0 | 10</text>
<rect x="250" y="36" width="92" height="44" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="296" y="63" text-anchor="middle" font-size="12">P1 | 20</text>
<rect x="350" y="36" width="92" height="44" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="396" y="63" text-anchor="middle" font-size="12">P2 | 30</text>
<text x="458" y="55" font-size="12" style="fill: var(--dg-muted)">3 keys, 4 pointers:</text>
<text x="458" y="72" font-size="12" style="fill: var(--dg-muted)">the 4th sits in the header</text>
<text x="20" y="118" font-size="13" font-weight="700">High key (Blink-Trees, PostgreSQL)</text>
<rect x="20" y="130" width="120" height="44" rx="5" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="80" y="157" text-anchor="middle" font-size="12">header</text>
<rect x="150" y="130" width="92" height="44" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="196" y="157" text-anchor="middle" font-size="12">P0 | 10</text>
<rect x="250" y="130" width="92" height="44" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="296" y="157" text-anchor="middle" font-size="12">P1 | 20</text>
<rect x="350" y="130" width="92" height="44" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="396" y="157" text-anchor="middle" font-size="12">P2 | 30</text>
<rect x="450" y="130" width="92" height="44" rx="5" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/><text x="496" y="157" text-anchor="middle" font-size="12">P3 | 40</text>
<text x="496" y="196" text-anchor="middle" font-size="12" style="fill: var(--dg-2)">high key: upper bound</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>The rightmost-pointer approach keeps cells uniform by parking the odd pointer in the header. When the rightmost child splits, the new separator becomes an ordinary cell and the header pointer is reassigned to the new right child.</p>
<p>The high-key approach adds information rather than hiding it. Storing the node's upper bound means each pointer describes a closed range. That turns out to matter for concurrency: a reader who arrives at a node just after it split can compare the search key with the high key, notice the key is now beyond this node, and follow the right sibling link. Chapter 5 builds Blink-Trees on exactly this trick.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "SQLite", title: "Right-most pointer", html: "SQLite interior pages have a 12-byte header (leaf pages have 8 bytes); the extra 4 bytes hold the right-most child pointer." },
            { org: "PostgreSQL", title: "High keys", html: "Every PostgreSQL B-Tree page except the rightmost one on its level stores a high key as its first item. Searches compare against it to detect concurrent splits and move right when needed." },
          ],
        },
        {
          type: "quiz",
          q: "A reader descends to a leaf, but before it reads the leaf, a concurrent insert splits it and moves the upper half of its keys to a new right sibling. With high keys and sibling links, how does the reader still find a key that moved?",
          options: [
            "It restarts the search from the root every time",
            "It sees the search key is greater than the leaf's high key and follows the right sibling link",
            "It waits until the parent is updated",
            "It cannot; the lookup returns not found",
          ],
          answer: 1,
          explain: "The high key tells the reader the upper bound of what this page now covers. If the key is beyond it, the key must have moved right, and the sibling link leads there directly, without going back to the parent.",
        },
      ],
    },
    {
      id: "overflow-pages",
      title: "Overflow pages for large values",
      kicker: "Big records",
      blocks: [
        {
          type: "problem",
          html: `<p>A node's fanout depends on how many cells fit in a page. If a single record can be as large as the page, one big value could leave room for only one or two cells, collapsing fanout and breaking the assumptions that keep the tree short. Some records simply don't fit at all.</p>`,
        },
        {
          type: "idea",
          html: `<p>Cap how much of any record lives in the B-Tree page, and spill the rest into a chain of linked <strong>overflow pages</strong>. The cap, <code>max_payload_size</code>, is chosen as the node size divided by the desired fanout, so a page can always hold at least that many cells.</p>`,
        },
        {
          type: "text",
          html: `<h3>Worked example</h3>
<p>Take 4 KB pages and require every node to hold at least 16 cells. Then <code>max_payload_size</code> = 4,096 / 16 = 256 bytes. A 100-byte record fits entirely in the page. A 1,000-byte record keeps its first 256 bytes in the page, including its key, and the remaining 744 bytes go to one overflow page, with the cell storing that page's ID. A 20 KB record needs a chain of about five overflow pages, each pointing to the next.</p>
<p>Searches compare keys, and keys (or at least their prefixes) stay in the primary page, so a lookup that only needs to find a record never touches the overflow chain. Reading the full value is what costs extra page reads, one per overflow page.</p>`,
        },
        {
          type: "lab",
          id: "overflowPages",
          caption: "Grow a record past max_payload_size and watch the overflow chain lengthen, while the key stays in the primary page for searching.",
        },
        {
          type: "realworld",
          items: [
            { org: "SQLite", title: "Linked overflow pages", html: "When a cell's payload is too large, SQLite stores the first part in the B-Tree page and the rest in a linked list of overflow pages; each overflow page begins with the page number of the next one." },
            { org: "PostgreSQL", title: "TOAST and an index entry limit", html: "PostgreSQL takes a different route for tables: when a row exceeds roughly 2 KB, large field values are compressed and, if still too big, moved to a separate TOAST table, leaving a pointer behind. B-Tree index entries are capped at roughly a third of a page (about 2.7 KB with 8 KB pages), which guarantees that every index page holds at least three items." },
            { org: "MySQL InnoDB", title: "Off-page columns", html: "With the DYNAMIC row format (the default in recent versions), long BLOB, TEXT and VARCHAR values that don't fit are stored entirely on separate overflow pages, and the clustered index record keeps a 20-byte pointer to them." },
          ],
        },
        {
          type: "quiz",
          q: "With 8 KB pages and a required minimum of 32 cells per node, what is max_payload_size, and what happens to a 1,000-byte record?",
          options: [
            "8 KB; the record fits inline",
            "256 bytes; 256 bytes stay in the page and 744 bytes spill to an overflow page",
            "32 bytes; the record is split across 32 pages",
            "1,000 bytes; the record fits exactly",
          ],
          answer: 1,
          explain: "8,192 / 32 = 256 bytes may live in the page per record. The remaining 744 bytes go to an overflow page referenced from the cell. The key stays inline, so searching never needs the overflow page.",
        },
      ],
    },
    {
      id: "search-and-breadcrumbs",
      title: "Binary search through offsets, and breadcrumbs",
      kicker: "Navigation",
      blocks: [
        {
          type: "text",
          html: `<p>Inside a slotted page, binary search runs over the sorted offset array, not over the cells. Each probe reads an offset, jumps to the cell it points at, and compares that cell's key with the search key. A common convention returns the slot index if the key is found and a negative number, <code>-(insertion point) - 1</code>, if it is not. The negative result tells an insert exactly where the new offset belongs, and the <code>- 1</code> keeps "not found at position 0" distinguishable from "found at position 0".</p>`,
        },
        {
          type: "code",
          lang: "text",
          title: "Binary search through the offset array",
          code: `search(page, key):
  lo = 0; hi = page.cellCount - 1
  while lo <= hi:
    mid = (lo + hi) / 2
    k = page.cellAt(page.offsets[mid]).key   // one indirection per probe
    if k < key:      lo = mid + 1
    else if k > key: hi = mid - 1
    else:            return mid
  return -(lo + 1)                           // not found: insertion point lo`,
        },
        {
          type: "problem",
          html: `<p>A split in a leaf must insert a separator into the leaf's parent, and maybe the parent's parent. But B-Tree pages usually don't store parent pointers, because keeping them correct would mean rewriting every child's page whenever a parent splits and half its children get a new parent.</p>`,
        },
        {
          type: "idea",
          html: `<p>Remember the way down. As the search descends from the root, push each visited page (and which child pointer was followed) onto a stack of <strong>breadcrumbs</strong>. When a split or merge needs the parent, pop the stack.</p>`,
        },
        {
          type: "steps",
          title: "A split propagating through breadcrumbs",
          items: [
            "Descend root, then internal page 12, then leaf 87, pushing (root, child 2) and (page 12, child 5) on the way.",
            "Leaf 87 is full; split it into 87 and a new page 140.",
            "Pop (page 12, child 5): insert the new separator and pointer to page 140 at position 6 of page 12.",
            "If page 12 overflows, split it too and pop (root, child 2) to insert its new separator into the root.",
            "If the root splits, there is nothing left to pop: create a new root above the two halves.",
          ],
        },
        {
          type: "realworld",
          items: [
            { org: "PostgreSQL", title: "BTStack", html: "PostgreSQL's B-Tree code builds a stack of parent pages and offsets during descent (the <code>BTStack</code> structure) and uses it to insert downlinks after a split. Because a concurrent split may have moved things, it re-checks the remembered position and moves right if necessary." },
          ],
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>Breadcrumbs are a small instance of a big theme: avoid storing information that must be kept in sync on disk when it can be recomputed cheaply in memory. The path from root to leaf is rediscovered on every descent anyway, so remembering it costs nothing.</p>`,
        },
      ],
    },
    {
      id: "split-policies",
      title: "Split policies: rebalancing and right-only appends",
      kicker: "Occupancy",
      blocks: [
        {
          type: "text",
          html: `<p>How full pages are, their <strong>occupancy</strong>, decides how many pages the tree needs, how tall it is and how much of it fits in cache. A plain half split leaves both halves about 50% full. Under random inserts, pages settle around 70% on average. Two refinements push occupancy higher.</p>
<p><strong>Rebalancing</strong>: before splitting a full node, check whether a sibling has room, and if so shift a few keys into it and adjust the separator in the parent. <strong>B*-Trees</strong> take this further: they keep redistributing between neighbours until both are full, then split two nodes into three, so nodes stay at least about two-thirds full. The price is more work per insert and more pages touched by each structural change.</p>`,
        },
        {
          type: "problem",
          html: `<p>Auto-incrementing keys, timestamps and other monotonically increasing values always go to the rightmost leaf. Split it in half, and the left half will never receive another key, because every future key is larger. The index ends up with nearly every page half empty.</p>`,
        },
        {
          type: "diagram",
          title: "Twelve ascending keys, leaf capacity 4",
          caption: "A half split strands the left half of each split leaf, giving 5 pages at 60% occupancy. Starting a new empty page when appending at the far right gives 3 full pages.",
          svg: `<svg viewBox="0 0 620 180" role="img" aria-label="Leaf pages after inserting twelve ascending keys with half splits versus right-only appends">
<text x="20" y="26" font-size="13" font-weight="700">Half split: 5 pages, 60% full</text>
<rect x="20" y="38" width="100" height="36" rx="4" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><rect x="20" y="38" width="50" height="36" rx="4" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)"/><text x="45" y="61" text-anchor="middle" font-size="12">1 2</text>
<rect x="140" y="38" width="100" height="36" rx="4" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><rect x="140" y="38" width="50" height="36" rx="4" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)"/><text x="165" y="61" text-anchor="middle" font-size="12">3 4</text>
<rect x="260" y="38" width="100" height="36" rx="4" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><rect x="260" y="38" width="50" height="36" rx="4" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)"/><text x="285" y="61" text-anchor="middle" font-size="12">5 6</text>
<rect x="380" y="38" width="100" height="36" rx="4" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><rect x="380" y="38" width="50" height="36" rx="4" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)"/><text x="405" y="61" text-anchor="middle" font-size="12">7 8</text>
<rect x="500" y="38" width="100" height="36" rx="4" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/><text x="550" y="61" text-anchor="middle" font-size="12">9 10 11 12</text>
<text x="20" y="96" font-size="12" style="fill: var(--dg-muted)">Each left half stays half empty: no later key is ever small enough to land there.</text>
<text x="20" y="128" font-size="13" font-weight="700">Right-only append: 3 pages, 100% full</text>
<rect x="20" y="140" width="100" height="36" rx="4" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)"/><text x="70" y="163" text-anchor="middle" font-size="12">1 2 3 4</text>
<rect x="140" y="140" width="100" height="36" rx="4" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)"/><text x="190" y="163" text-anchor="middle" font-size="12">5 6 7 8</text>
<rect x="260" y="140" width="100" height="36" rx="4" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)"/><text x="310" y="163" text-anchor="middle" font-size="12">9 10 11 12</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>The fix for <strong>right-only appends</strong> is to recognize the pattern. When the key goes past the end of the rightmost leaf and that leaf is full, don't split it in half; leave it full and start a new, empty page for the new key. Engines also skip the descent entirely by caching a pointer to the rightmost leaf, since the next key will almost certainly go there too.</p>
<p>At scale the difference is large. Insert 10 million ascending keys into leaves that hold 100 each: half splits produce about 200,000 half-full leaves, while appending produces about 100,000 full ones. That is half the pages to cache, scan, back up and replicate.</p>`,
        },
        {
          type: "lab",
          id: "fillFactor",
          caption: "Insert keys sequentially or randomly and compare the leaf occupancy of half splits, B* rebalancing, right-only appends and bulk loading.",
        },
        {
          type: "realworld",
          items: [
            { org: "PostgreSQL", title: "Fastpath and rightmost splits", html: "PostgreSQL caches the rightmost leaf of a B-Tree index so that inserts of ever-increasing keys can skip the descent (the fastpath). When it does split the rightmost page on a level, it leaves the left page filled to the index fillfactor (90% by default for B-Trees) instead of 50%." },
            { org: "SQLite", title: "quickbalance", html: "When a new cell is appended at the far right of the rightmost leaf and it overflows, SQLite's balance-quick path allocates a new empty sibling for just that cell instead of redistributing the full page." },
            { org: "MySQL InnoDB", title: "Leave 1/16 free", html: "InnoDB's documentation says it tries to leave 1/16 of each index page free for future inserts and updates; when records arrive in sequential order, pages end up about 15/16 full." },
          ],
        },
        {
          type: "quiz",
          q: "A table's primary key is a random UUID instead of an auto-increment integer. What happens to the clustered index compared with sequential keys?",
          options: [
            "Nothing changes; B-Trees are insensitive to key order",
            "Inserts land all over the tree, pages split in the middle and settle around 70% full, and many more distinct pages get dirtied",
            "Every page stays 100% full",
            "The tree becomes unbalanced",
          ],
          answer: 1,
          explain: "Random keys defeat the right-only append optimization: every insert touches a random leaf, splits are ordinary half splits, average occupancy drops to roughly 70%, and writes are spread over the whole index instead of one hot page. The tree stays balanced; it just gets bigger and costlier to maintain.",
        },
      ],
    },
    {
      id: "bulk-loading",
      title: "Bulk loading: building a tree bottom-up",
      kicker: "Optimization",
      blocks: [
        {
          type: "text",
          html: `<p>Creating an index on a 100-million-row table by inserting one key at a time would do 100 million descents and countless splits. If the data can be sorted first, there is a much better way: build the tree from the bottom.</p>`,
        },
        {
          type: "steps",
          title: "Bottom-up construction from sorted data",
          items: [
            "Sort the keys (with an external sort if they don't fit in memory).",
            "Fill leaf pages left to right, each to its target occupancy, and write them out sequentially.",
            "Every time a new leaf starts, append its first key and its page ID to the parent level, which is being filled the same way.",
            "When a parent page fills, start a new one and push its first key one level higher.",
            "Finish when a level fits in a single page: that page is the root.",
          ],
        },
        {
          type: "diagram",
          title: "Bulk loading sixteen sorted keys",
          caption: "Leaves are written full and in order; the parent is assembled from the first key of each leaf after the first. No page is ever split.",
          svg: `<svg viewBox="0 0 620 195" role="img" aria-label="A B-Tree built bottom-up from sorted keys with full leaves and a parent made of their first keys">
<rect x="230" y="40" width="120" height="34" rx="5" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="290" y="62" text-anchor="middle" font-size="13" font-weight="700">5 | 9 | 13</text>
<text x="380" y="54" font-size="12" style="fill: var(--dg-muted)">parent: first key of each</text>
<text x="380" y="71" font-size="12" style="fill: var(--dg-muted)">leaf after the first</text>
<line x1="245" y1="74" x2="80" y2="130" stroke-width="1.5" style="stroke: var(--dg-muted)"/>
<line x1="275" y1="74" x2="220" y2="130" stroke-width="1.5" style="stroke: var(--dg-muted)"/>
<line x1="305" y1="74" x2="360" y2="130" stroke-width="1.5" style="stroke: var(--dg-muted)"/>
<line x1="335" y1="74" x2="500" y2="130" stroke-width="1.5" style="stroke: var(--dg-muted)"/>
<rect x="20" y="130" width="120" height="34" rx="5" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)"/><text x="80" y="152" text-anchor="middle" font-size="12">1 2 3 4</text>
<rect x="160" y="130" width="120" height="34" rx="5" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)"/><text x="220" y="152" text-anchor="middle" font-size="12">5 6 7 8</text>
<rect x="300" y="130" width="120" height="34" rx="5" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)"/><text x="360" y="152" text-anchor="middle" font-size="12">9 10 11 12</text>
<rect x="440" y="130" width="120" height="34" rx="5" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)"/><text x="500" y="152" text-anchor="middle" font-size="12">13 14 15 16</text>
<text x="290" y="186" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">leaves written left to right, sequentially, completely full</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>The benefits stack up. There are no splits or merges at all. Occupancy is whatever you choose, up to 100%. Pages are written sequentially, which suits every kind of storage device. And the result is perfectly ordered on disk, so range scans read contiguous pages. Immutable structures, such as the sorted files of an LSM Tree or a read-only B-Tree, are always built this way.</p>
<p>Filling pages to 100% is not always wise, though. If the table will see random inserts afterwards, every full page splits on its first insert. Engines therefore let you leave some room: a fill factor below 100% trades a little space for fewer early splits.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "PostgreSQL", title: "CREATE INDEX", html: "PostgreSQL builds a new B-Tree index by sorting the table's keys and writing the tree bottom-up, filling leaf pages to the index's fillfactor (90% by default)." },
            { org: "MySQL InnoDB", title: "Sorted index builds", html: "InnoDB builds secondary indexes and rebuilds tables with a bottom-up sorted index build, and the <code>innodb_fill_factor</code> setting controls how full each page is left." },
          ],
        },
        {
          type: "quiz",
          q: "You bulk load a table's index at 100% fill and then the application inserts keys uniformly at random across the whole range. What happens next?",
          options: [
            "Inserts are as cheap as ever because pages are full",
            "Nearly every early insert hits a full page and causes a split, so a fill factor below 100% would have been better",
            "The index must be rebuilt after every insert",
            "Random inserts go to overflow pages",
          ],
          answer: 1,
          explain: "A completely full page has no room for even one more key, so the first random insert into almost any leaf splits it. Leaving 10% or so free during the bulk load absorbs a burst of inserts before splits start. For append-only or read-only data, 100% is ideal.",
        },
      ],
    },
    {
      id: "compression",
      title: "Compression: trading CPU for I/O",
      kicker: "Optimization",
      blocks: [
        {
          type: "text",
          html: `<p>Compressing data means fewer bytes to read, write, cache and store, paid for in CPU time to compress and decompress. For storage engines the hard question is not whether to compress but at what <strong>granularity</strong>, because a B-Tree reads and writes individual pages and wants to find records without decompressing the world.</p>`,
        },
        {
          type: "table",
          title: "Where to compress",
          headers: ["Granularity", "Gain", "Cost"],
          rows: [
            ["Whole file", "Best compression ratio", "Reading one page means decompressing a large region; impractical for random access"],
            ["Page", "Good ratio; each page decompressed on its own when loaded", "Compressed pages are smaller than disk blocks and vary in size, which complicates aligned I/O and page addressing"],
            ["Row or field", "Fine-grained; only the values touched are decompressed", "Lower ratio (little context to exploit) and more CPU per access"],
            ["Key prefixes and suffixes", "Cheap, keeps pages searchable, raises fanout", "Only shrinks keys, not values"],
          ],
        },
        {
          type: "text",
          html: `<p>Page-level compression is the most common choice for general data. Its awkwardness is physical: a 16 KB page might compress to 6 KB one day and 9 KB the next, so it no longer maps neatly onto fixed-size slots on disk. Engines handle this with a smaller on-disk page size, with variable-size blocks plus a mapping, or with filesystem support for releasing the unused tail of each block.</p>
<p>Key compression is cheaper and helps the tree's shape directly. Neighbouring keys in a sorted page often share a long prefix (<code>user:000123:...</code>, <code>user:000124:...</code>), so storing the prefix once raises the number of keys per page. Separator keys in internal nodes only need enough bytes to distinguish two children, so they can be truncated to the shortest distinguishing prefix.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "PostgreSQL", title: "Suffix truncation and deduplication", html: "PostgreSQL 12 added suffix truncation of separator (pivot) keys in B-Tree internal pages, and PostgreSQL 13 added deduplication, which stores a repeated key once with a list of tuple IDs." },
            { org: "WiredTiger", title: "Block and prefix compression", html: "MongoDB's WiredTiger engine compresses collection data blocks (Snappy by default) and uses prefix compression for index keys." },
            { org: "MySQL InnoDB", title: "Two schemes", html: "InnoDB offers table compression with a smaller on-disk page size (<code>KEY_BLOCK_SIZE</code>) and transparent page compression, which relies on filesystem hole punching to release the space a compressed page doesn't use." },
          ],
        },
      ],
    },
    {
      id: "vacuum-maintenance",
      title: "Vacuum and maintenance",
      kicker: "Keeping it healthy",
      blocks: [
        {
          type: "problem",
          html: `<p>A B-Tree that has seen years of updates and deletes is not the tree it was on day one. Pages hold cells that nothing references anymore. Splits have scattered logically adjacent pages across the file, so a "sequential" range scan jumps around. Whole pages may be empty but still part of the file. Reads touch more pages than they should and the file is bigger than its live data.</p>`,
        },
        {
          type: "text",
          html: `<p>The leftovers come from several places. Deleted cells are usually just removed from the offset array, leaving their bytes behind (Chapter 3). Updates that change a record's size may write a new cell and abandon the old one. Engines with multiversion concurrency keep old versions around until no transaction can see them. All of this is <strong>garbage</strong>: bytes that occupy pages but are unreachable.</p>
<p><strong>Vacuum</strong> (or compaction, or maintenance; the names vary) is the background work that reclaims it. It removes garbage cells and defragments pages; it merges or frees pages that became empty; it records freed pages in a <strong>free page list</strong> so new pages are taken from there before the file grows; and in some engines it relocates pages to restore physical order. Running it in the background keeps the cost off the query path, but it still competes for I/O, and it must coordinate with concurrent readers so nobody is mid-read on a page that vanishes.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "PostgreSQL", title: "VACUUM and VACUUM FULL", html: "Plain <code>VACUUM</code> (usually run by autovacuum) removes dead row versions, records reusable space in the free space map and recycles empty index pages, without returning disk space to the OS in most cases. <code>VACUUM FULL</code> rewrites the table into a new file, which shrinks it but requires an exclusive lock." },
            { org: "SQLite", title: "Freelist and VACUUM", html: "SQLite tracks unused pages in a freelist inside the file and reuses them for new pages. The <code>VACUUM</code> command rebuilds the database file compactly, and the <code>auto_vacuum</code> setting can truncate free pages from the end of the file automatically." },
            { org: "MySQL InnoDB", title: "Merge threshold", html: "InnoDB tries to merge an index page with a neighbour when deletes or updates drop its fill below <code>MERGE_THRESHOLD</code>, which defaults to 50%." },
          ],
        },
        {
          type: "quiz",
          q: "You delete 60% of a PostgreSQL table's rows and autovacuum runs. The file on disk is about the same size afterwards. Why?",
          options: [
            "Autovacuum failed",
            "Plain vacuum marks the space reusable for future rows but generally doesn't shrink the file; only a rewrite (VACUUM FULL or similar) returns it to the OS",
            "Deleted rows are never removed in PostgreSQL",
            "The OS caches the old file size",
          ],
          answer: 1,
          explain: "Vacuum turns dead tuples into free space inside existing pages and records it in the free space map, so new inserts reuse it. Giving the space back to the operating system requires rewriting the table compactly, which is what VACUUM FULL does, at the cost of an exclusive lock.",
        },
      ],
    },
    {
      id: "interview",
      title: "Implementation details in an interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "text",
          html: `<p>These details show up in practical interview questions: "why shouldn't I use a random UUID as a clustered primary key?", "why is my index bigger than expected?", "why didn't deleting rows free disk space?", "how does a database create an index on a huge table quickly?". Each has a short mechanical answer from this chapter.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>Points worth having ready:</p>
<ol>
<li><strong>Sequential vs random keys</strong>: ascending keys hit one hot rightmost leaf; engines append instead of half-splitting, so pages stay full. Random keys (UUIDv4) spread writes over every leaf, split pages in the middle and leave them around 70% full.</li>
<li><strong>Large values</strong>: at most <code>max_payload_size</code> = page size / fanout lives inline; the rest goes to overflow pages (or a TOAST table), keeping fanout intact.</li>
<li><strong>Finding the parent</strong>: breadcrumbs collected on the way down, not parent pointers.</li>
<li><strong>Index builds</strong>: sort, then bulk load bottom-up with no splits, at a chosen fill factor.</li>
<li><strong>Space reclamation</strong>: deletes leave garbage; vacuum or compaction reclaims it in the background, and usually reuses space rather than shrinking the file.</li>
</ol>`,
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>If asked for a primary key that is globally unique but index-friendly, mention time-ordered identifiers such as UUIDv7 or Snowflake-style IDs. Their leading bits increase over time, so inserts behave like appends at the right edge of the B-Tree instead of random writes.</p>`,
        },
        {
          type: "quiz",
          q: "An interviewer asks why a B-Tree stores sibling links if a range scan could always go back through the parent. What is the best answer?",
          options: [
            "Sibling links are required for point lookups",
            "Following a sibling link moves to the next leaf in one step without re-reading or re-latching parent pages, which makes range scans cheaper and, with high keys, lets readers recover from concurrent splits",
            "Parents do not store pointers to leaves",
            "Sibling links replace the need for separator keys",
          ],
          answer: 1,
          explain: "Without sibling links, moving to the next leaf means climbing to a common ancestor and descending again. Links make the next leaf one pointer away, and in Blink-Tree designs they are also how a reader catches up with keys that moved right during a split.",
        },
      ],
    },
  ],
  takeaways: [
    "Page headers carry magic numbers (sanity checks), sibling links (range scans), and either a rightmost pointer or a high key to handle the N+1 child pointer of an internal node.",
    "High keys make every pointer a bounded range and let concurrent readers detect splits and follow the right sibling link.",
    "Cap inline payload at max_payload_size = page size / fanout and spill the rest to overflow pages, so a node always has room for its fanout and searches never read the overflow chain.",
    "Binary search runs through the offset array, and breadcrumbs collected on the way down replace parent pointers when splits and merges propagate.",
    "Half splits leave sequential inserts at about 50% occupancy; right-only appends (PostgreSQL fastpath, SQLite quickbalance) and B* rebalancing keep pages fuller.",
    "Bulk loading sorted data bottom-up avoids splits entirely, writes sequentially and lets you pick the fill factor.",
    "Compression trades CPU for I/O; page compression complicates aligned I/O, while key prefix and suffix compression raise fanout cheaply.",
    "Updates and deletes leave garbage; vacuum reclaims it in the background and tracks free pages for reuse, which usually doesn't shrink the file.",
  ],
  furtherReading: [
    { title: "Efficient Locking for Concurrent Operations on B-Trees (Lehman and Yao, 1981)", note: "The origin of high keys and right links, which PostgreSQL's B-Tree implementation follows." },
    { title: "PostgreSQL source: src/backend/access/nbtree/README", note: "A detailed, readable account of a production B-Tree: high keys, BTStack, page deletion, fastpath and deduplication." },
    { title: "SQLite Database File Format", url: "https://www.sqlite.org/fileformat.html", note: "Interior page headers with the right-most pointer, payload limits and overflow page chains." },
  ],
};
