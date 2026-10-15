// Deep dive: Chapter 6, B-Tree variants. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch6 = {
  hook: `<p>A user changes their display name, a 20-byte edit. The B-Tree finds the leaf, changes 20 bytes, and eventually writes the whole 16 KB page back to disk, first logging the change to the WAL. If the same page is touched again a second later by an unrelated update, the cycle repeats. Meanwhile, every reader that wants that page must take a latch on it, and any split along the path must coordinate with all of them.</p>
<p>The classic B-Tree pays for its read performance with write amplification, half-empty pages and latch traffic. This chapter tours designs that keep the B-Tree's sorted, shallow shape but change the rules: never overwrite a page, buffer changes before applying them, append small deltas instead of rewriting nodes, or lay the tree out so it is fast for any cache size. Each one borrows an idea, buffering, immutability or layout, that the next chapter takes to its extreme.</p>`,
  sections: [
    {
      id: "why-variants",
      title: "What the classic B-Tree pays for",
      kicker: "Motivation",
      blocks: [
        {
          type: "text",
          html: `<p>Three costs drive every variant in this chapter.</p>
<ul>
<li><strong>Write amplification.</strong> The unit of writing is a page, so a tiny change costs a full page write (plus a log record). Changing 100 bytes in a 16 KB page writes about 160 times more data than was modified, before counting the WAL.</li>
<li><strong>Space amplification.</strong> Pages are deliberately kept partly empty to absorb inserts; after random inserts they average around 70% full. Updates and deletes leave fragmentation behind.</li>
<li><strong>Concurrency overhead.</strong> Pages are updated in place, so readers and writers must latch them, and splits and merges have to coordinate across levels (Chapter 5).</li>
</ul>`,
        },
        {
          type: "idea",
          html: `<p>Pull one of three levers. <strong>Immutability</strong>: never modify a page in place, so readers need no latches and crashes can't leave pages half-written. <strong>Buffering</strong>: collect updates in memory and apply many at once, so each page write carries more useful changes. <strong>Layout</strong>: arrange nodes in memory so that any block or cache-line size is used well.</p>`,
        },
        {
          type: "table",
          title: "The variants by lever",
          headers: ["Variant", "Buffering", "Immutable", "Main idea"],
          rows: [
            ["Copy-on-write B-Tree (LMDB)", "no", "yes", "Copy the path to a new root; readers never latch"],
            ["Lazy B-Tree (WiredTiger, LA-Tree)", "yes", "no", "Per-page or per-subtree update buffers, applied in batches"],
            ["FD-Tree", "yes", "yes", "A small mutable head tree plus immutable sorted runs"],
            ["Bw-Tree", "yes (deltas)", "yes", "Delta chains, a mapping table and compare-and-swap; latch-free"],
            ["Cache-oblivious B-Tree", "no", "no", "van Emde Boas layout; efficient for every block size"],
          ],
        },
      ],
    },
    {
      id: "copy-on-write",
      title: "Copy-on-write B-Trees",
      kicker: "Immutability",
      blocks: [
        {
          type: "idea",
          html: `<p>Never change a page. To update a leaf, write a modified copy of it; its parent now needs to point at the copy, so copy the parent too, and so on up to a new root. When the new path is complete, switch the root pointer atomically. The old root still describes the old tree, unchanged.</p>`,
        },
        {
          type: "diagram",
          title: "Path copying on an update to leaf L4",
          caption: "The update writes new copies of L4, B and the root. Everything off the path (A, L1, L2, L3) is shared by both versions. Readers that started from the old root keep seeing the old tree; the old R, B and L4 become garbage once those readers finish.",
          svg: `<svg viewBox="0 0 620 260" role="img" aria-label="Copy-on-write B-Tree: an update copies the leaf, its parent and the root, sharing the rest of the tree">
<text x="200" y="16" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">old root</text>
<text x="420" y="16" text-anchor="middle" font-size="12" style="fill: var(--dg-ok)">new root</text>
<line x1="200" y1="55" x2="110" y2="105" stroke-width="1.5" stroke-dasharray="4 3" style="stroke: var(--dg-muted)"/>
<line x1="200" y1="55" x2="290" y2="105" stroke-width="1.5" stroke-dasharray="4 3" style="stroke: var(--dg-muted)"/>
<line x1="420" y1="55" x2="110" y2="105" stroke-width="2" style="stroke: var(--dg-ok)"/>
<line x1="420" y1="55" x2="440" y2="105" stroke-width="2" style="stroke: var(--dg-ok)"/>
<line x1="110" y1="135" x2="60" y2="185" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<line x1="110" y1="135" x2="150" y2="185" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<line x1="290" y1="135" x2="250" y2="185" stroke-width="1.5" stroke-dasharray="4 3" style="stroke: var(--dg-muted)"/>
<line x1="290" y1="135" x2="340" y2="185" stroke-width="1.5" stroke-dasharray="4 3" style="stroke: var(--dg-muted)"/>
<line x1="440" y1="135" x2="250" y2="185" stroke-width="2" style="stroke: var(--dg-ok)"/>
<line x1="440" y1="135" x2="490" y2="185" stroke-width="2" style="stroke: var(--dg-ok)"/>
<rect x="170" y="25" width="60" height="30" rx="5" stroke-dasharray="4 3" style="fill: var(--dg-panel); stroke: var(--dg-muted)"/><text x="200" y="45" text-anchor="middle" font-size="13">R</text>
<rect x="390" y="25" width="60" height="30" rx="5" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/><text x="420" y="45" text-anchor="middle" font-size="13">R'</text>
<rect x="80" y="105" width="60" height="30" rx="5" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/><text x="110" y="125" text-anchor="middle" font-size="13">A</text>
<rect x="260" y="105" width="60" height="30" rx="5" stroke-dasharray="4 3" style="fill: var(--dg-panel); stroke: var(--dg-muted)"/><text x="290" y="125" text-anchor="middle" font-size="13">B</text>
<rect x="410" y="105" width="60" height="30" rx="5" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/><text x="440" y="125" text-anchor="middle" font-size="13">B'</text>
<rect x="30" y="185" width="60" height="30" rx="5" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/><text x="60" y="205" text-anchor="middle" font-size="12">L1</text>
<rect x="120" y="185" width="60" height="30" rx="5" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/><text x="150" y="205" text-anchor="middle" font-size="12">L2</text>
<rect x="220" y="185" width="60" height="30" rx="5" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/><text x="250" y="205" text-anchor="middle" font-size="12">L3</text>
<rect x="310" y="185" width="60" height="30" rx="5" stroke-dasharray="4 3" style="fill: var(--dg-panel); stroke: var(--dg-muted)"/><text x="340" y="205" text-anchor="middle" font-size="12">L4</text>
<rect x="460" y="185" width="60" height="30" rx="5" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/><text x="490" y="205" text-anchor="middle" font-size="12">L4'</text>
<rect x="20" y="236" width="14" height="14" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/><text x="40" y="248" font-size="12">shared by both versions</text>
<rect x="215" y="236" width="14" height="14" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)"/><text x="235" y="248" font-size="12">copied by this update</text>
<rect x="400" y="236" width="14" height="14" stroke-dasharray="3 2" style="fill: var(--dg-panel); stroke: var(--dg-muted)"/><text x="420" y="248" font-size="12">old, freed later</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>The payoff is substantial. A reader grabs the current root and then sees a perfectly consistent snapshot for as long as it likes, with <strong>no latches</strong>, because nothing it can reach will ever change. A crash can never leave the tree half-updated: either the root pointer was switched or it wasn't, so there is no need for a write-ahead log to repair pages. And snapshots are free; keeping an old root around keeps an old version of the whole database.</p>
<p>The costs are just as clear. Every update writes a full path: in a four-level tree, changing one value writes four pages instead of one. Old pages consume space until no reader can reach them, so the engine needs a way to know when that is. And because each update produces a new root, writers must take turns, so these engines typically allow one writer at a time.</p>`,
        },
        {
          type: "lab",
          id: "copyOnWrite",
          caption: "Update values and watch the leaf, its ancestors and a new root get copied while an earlier reader keeps its old root; then see which pages become garbage once no reader can reach them.",
        },
        {
          type: "realworld",
          items: [
            { org: "LMDB", title: "Lightning Memory-Mapped Database", html: "LMDB, written for OpenLDAP, is a copy-on-write B+-Tree that memory-maps its file and has no application-level page cache. It keeps two meta pages and alternates between them, so committing is writing a new meta page that points at the new root. Readers never block, there is a single writer at a time, and freed pages are reused once no active reader can still see them." },
            { org: "Btrfs", title: "A copy-on-write filesystem", html: "Btrfs, the Linux filesystem, is built on copy-on-write B-Trees, which is what gives it cheap snapshots." },
            { org: "Apache CouchDB", title: "Append-only B+-Trees", html: "CouchDB appends modified B+-Tree nodes to the end of its file rather than overwriting them, and periodically compacts the file to reclaim the space taken by old versions." },
          ],
        },
        {
          type: "tradeoffs",
          pros: [
            "Readers see consistent snapshots with no latches",
            "No torn or half-updated tree after a crash, so no WAL is needed for structural safety",
            "Snapshots and point-in-time reads come almost for free",
          ],
          cons: [
            "Every update rewrites the whole root-to-leaf path",
            "Old pages occupy space until the last reader that can see them finishes",
            "Writers are effectively serialized on the root",
          ],
        },
        {
          type: "quiz",
          q: "In a copy-on-write B-Tree of height 4, how many pages does a single-value update write, and why don't readers need latches?",
          options: [
            "1 page; readers latch only the leaf",
            "4 pages (leaf, two internal nodes, new root); readers only ever see pages that are never modified",
            "All pages in the tree; readers wait for the copy to finish",
            "2 pages; the root is updated in place under a latch",
          ],
          answer: 1,
          explain: "Each modified page needs its parent to point at the new copy, so the whole path to the root is rewritten: 4 pages for 4 levels. Pages are never changed after being written, so a reader holding any root can traverse without coordination.",
        },
      ],
    },
    {
      id: "lazy-btrees",
      title: "Lazy B-Trees: buffer first, apply later",
      kicker: "Buffering",
      blocks: [
        {
          type: "text",
          html: `<p>A copy-on-write tree avoids overwriting pages but still writes something for every update. A different approach accepts in-place structure but defers the work. The enabling idea is to <strong>separate the in-memory representation of a node from its on-disk page</strong>. Updates are applied to an in-memory structure attached to the page, and only when the page is written out are the base page and the pending updates <strong>reconciled</strong> into a new on-disk image.</p>
<p>If a hot page receives 50 updates between flushes, they become one page write instead of 50. The tree is still ordered and mutable, but each disk write now carries many logical changes.</p>`,
        },
        {
          type: "steps",
          title: "An update in a WiredTiger-style lazy B-Tree",
          items: [
            "Find the leaf page in cache. If it isn't there, load the clean on-disk image as-is.",
            "Instead of rewriting the page's cells, record the change in the page's in-memory update buffer, typically a skiplist, so concurrent updates are cheap and ordered.",
            "Reads of that page merge the base image with the buffered updates on the fly.",
            "When the page is evicted or a checkpoint runs, reconciliation merges base and updates into one or more new page images, splitting them if they have grown too large, and writes them out.",
          ],
        },
        {
          type: "text",
          html: `<p><strong>Lazy-Adaptive Trees</strong> (LA-Trees) push the idea up the tree. Instead of a buffer per page, buffers are attached to <em>subtrees</em>. Updates are first appended to the buffer at the top; when a buffer fills, its contents are cascaded down to the buffers of the next level, and eventually applied to the leaves in large batches. That turns many small writes into a few big ones, which is particularly valuable on flash, where small random writes are expensive.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "WiredTiger", title: "MongoDB's default engine", html: "WiredTiger keeps in-memory pages in a different format from on-disk pages, records modifications in per-page update structures, and reconciles them into new on-disk blocks when pages are evicted or checkpointed. It doesn't overwrite blocks in place: a checkpoint switches to the newly written blocks." },
            { org: "TokuDB / TokuMX", title: "Fractal tree indexes", html: "Tokutek's fractal tree indexes attach message buffers to internal nodes and flush them down toward the leaves in batches, the same subtree-buffering idea as LA-Trees, aimed at fast inserts into indexes much larger than memory." },
          ],
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>Buffering moves cost from writes to reads: a read must now consult the buffers as well as the base page. Every buffered design is a bet that many updates will be combined before anyone needs a fully reconciled page. Chapter 7's memtable makes the same bet on a larger scale.</p>`,
        },
        {
          type: "quiz",
          q: "A page receives 200 small updates between two evictions. Roughly how many page writes does a lazy B-Tree with per-page update buffers perform for it, compared with an in-place B-Tree that flushes after each change?",
          options: [
            "200 versus 1",
            "About 1 versus up to 200",
            "200 versus 200",
            "0 versus 200",
          ],
          answer: 1,
          explain: "The lazy tree accumulates all 200 updates in memory and reconciles them into a single new page image at eviction (durability still comes from the log). An in-place tree that wrote the page after every change would write it up to 200 times; real engines also delay flushes, but the lazy design makes the batching structural.",
        },
      ],
    },
    {
      id: "fd-trees",
      title: "FD-Trees and fractional cascading",
      kicker: "Buffering plus immutability",
      blocks: [
        {
          type: "text",
          html: `<p><strong>FD-Trees</strong> (flash disk trees) were designed for SSDs, which handle sequential writes far better than small random ones. The structure has two parts: a small, mutable <strong>head tree</strong> that absorbs incoming writes, and a series of immutable <strong>sorted runs</strong> on disk, each a fixed factor larger than the previous one. When the head tree fills, its contents are merged with the first run to produce a new run; if that run overflows its size limit, it is merged into the next one, and so on.</p>
<p>All disk writes are now sequential merge output, and runs are fully packed, so space use is good. The cost is on the read side: a lookup may have to search the head tree and then every run. Searching each run independently would take a full binary search per run. Fractional cascading cuts that down.</p>`,
        },
        {
          type: "idea",
          html: `<p><strong>Fractional cascading</strong>: copy a sample of every next-level array (say, every other element) into the current level as <strong>bridges</strong>, each remembering its position in the level below. After one binary search at the top level, the nearest bridges tell you where to look in the next level, so each lower level costs only a few comparisons instead of a fresh binary search.</p>`,
        },
        {
          type: "text",
          html: `<h3>Worked example</h3>
<p>Say the top run is <code>[10, 40, 70]</code> and the next run is <code>[15, 25, 45, 55, 85, 95]</code>. Copy every other element of the lower run, 25, 55 and 95, into the top run as bridges: <code>[10, 25*, 40, 55*, 70, 95*]</code>, where each starred value remembers its index below. To find 50, binary search the top run: 50 falls between 40 and 55*. The bridges on either side of that spot, 25* and 55*, bracket the answer, so in the lower run you only need to look between 25 and 55, finding 45 and then 55 immediately. With many runs, every level after the first costs a constant number of steps instead of a logarithmic search.</p>
<p>FD-Trees use this "fence pointer" idea between their runs. Chapter 7's LSM Trees face the same multi-run search problem and mostly answer it differently, with Bloom filters and per-file indexes.</p>`,
        },
        {
          type: "lab",
          id: "fractionalCascading",
          caption: "Search three sorted arrays separately, then with bridges copied up from each lower level, and compare how many comparisons each lower level needs.",
        },
        {
          type: "quiz",
          q: "A lookup must search 5 sorted runs of a million entries each. Roughly how many comparisons does it take without and with fractional cascading?",
          options: [
            "About 20 without, about 100 with",
            "About 100 without (5 binary searches of about 20 steps), about 20 plus a few per level with",
            "Exactly 5 either way",
            "About 5 million without, about 20 with",
          ],
          answer: 1,
          explain: "A binary search over a million entries takes about 20 comparisons, so five independent searches take about 100. With bridges, only the first level needs the full binary search; each subsequent level is narrowed to a small window by the bridges and costs a handful of comparisons.",
        },
      ],
    },
    {
      id: "bw-trees",
      title: "Bw-Trees: latch-free delta chains",
      kicker: "Buffering plus immutability",
      blocks: [
        {
          type: "problem",
          html: `<p>Even a buffered B-Tree latches pages, and latches mean threads wait for each other. On many-core machines that waiting, plus the cache-line traffic of the latches themselves, becomes the bottleneck. Could a B-Tree be updated without any thread ever blocking another?</p>`,
        },
        {
          type: "idea",
          html: `<p>Never modify a node; instead, prepend a small <strong>delta record</strong> describing the change ("insert key 42", "delete key 17") that points at the node's current state. Each logical node is a <strong>base node plus a chain of deltas</strong>, newest first. An in-memory <strong>mapping table</strong> maps each logical node ID to the head of its chain, and installing a new delta is a single <strong>compare-and-swap</strong> (CAS) on that table entry.</p>`,
        },
        {
          type: "diagram",
          title: "A Bw-Tree node: mapping table, delta chain and base node",
          caption: "Entry 8 points at the newest delta, which points at older deltas and finally the base node. A writer builds a new delta pointing at the current head and swings entry 8 to it with one compare-and-swap.",
          svg: `<svg viewBox="0 0 620 220" role="img" aria-label="Bw-Tree mapping table entry pointing to a chain of delta records ending in a base node, with a new delta being installed by compare-and-swap">
<defs><marker id="di6-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-ink)"/></marker></defs>
<text x="75" y="30" text-anchor="middle" font-size="12" font-weight="700">mapping table</text>
<rect x="20" y="40" width="110" height="34" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="75" y="62" text-anchor="middle" font-size="12">node 7</text>
<rect x="20" y="74" width="110" height="34" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/><text x="75" y="96" text-anchor="middle" font-size="12">node 8</text>
<rect x="20" y="108" width="110" height="34" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="75" y="130" text-anchor="middle" font-size="12">node 9</text>
<line x1="130" y1="91" x2="176" y2="91" stroke-width="2" style="stroke: var(--dg-ink)" marker-end="url(#di6-arrow)"/>
<rect x="180" y="74" width="120" height="34" rx="5" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/><text x="240" y="96" text-anchor="middle" font-size="12">delta: insert 42</text>
<line x1="300" y1="91" x2="326" y2="91" stroke-width="2" style="stroke: var(--dg-ink)" marker-end="url(#di6-arrow)"/>
<rect x="330" y="74" width="120" height="34" rx="5" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/><text x="390" y="96" text-anchor="middle" font-size="12">delta: delete 17</text>
<line x1="450" y1="91" x2="476" y2="91" stroke-width="2" style="stroke: var(--dg-ink)" marker-end="url(#di6-arrow)"/>
<rect x="480" y="74" width="120" height="34" rx="5" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/><text x="540" y="96" text-anchor="middle" font-size="12">base node</text>
<rect x="180" y="150" width="120" height="34" rx="5" stroke-dasharray="5 3" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/><text x="240" y="172" text-anchor="middle" font-size="12">new delta: insert 5</text>
<line x1="240" y1="150" x2="240" y2="112" stroke-width="2" style="stroke: var(--dg-ok)" marker-end="url(#di6-arrow)"/>
<path d="M75 108 C 75 170, 120 167, 176 167" fill="none" stroke-width="2" stroke-dasharray="5 3" style="stroke: var(--dg-ok)" marker-end="url(#di6-arrow)"/>
<text x="320" y="164" font-size="12">CAS entry 8: expected old head,</text>
<text x="320" y="182" font-size="12">new value = new delta</text>
<text x="20" y="210" font-size="12" style="fill: var(--dg-muted)">If another thread changed entry 8 first, the CAS fails and this update retries.</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>The mapping table is what makes this work. Parents point at <em>logical</em> node IDs, not at physical addresses. When a new delta becomes the head of node 8's chain, only node 8's table entry changes; no parent has to be rewritten. If two threads race to update node 8, both build a delta pointing at the same old head, and both attempt a CAS; exactly one succeeds, and the other sees the CAS fail, rereads the head and tries again. No thread ever waits on a latch.</p>
<p>Long chains slow reads down, because every read of node 8 must walk the chain to reconstruct the node's contents. So when a chain exceeds a threshold, a thread <strong>consolidates</strong> it: it builds a fresh base node with all deltas applied and installs it with, again, one CAS.</p>`,
        },
        {
          type: "lab",
          id: "bwTree",
          caption: "Prepend deltas with compare-and-swap, simulate a racing writer whose CAS fails and retries, and watch reads slow down as the chain grows until consolidation rebuilds the base node.",
        },
        {
          type: "text",
          html: `<h3>Splits, merges and freeing memory without latches</h3>
<p>Structural changes can't happen in one CAS, so Bw-Trees perform them as multi-step <strong>structure modification operations</strong> (SMOs). A split first posts a split delta on the node being split, which redirects searches for the upper half of its keys to the new sibling, and then posts an index entry delta on the parent. Between those steps the tree is still searchable. Any thread that stumbles on a half-finished SMO helps finish it before continuing, so no operation is left dangling. Merges work similarly, with remove-node, merge and abort deltas.</p>
<p>Finally, memory. After consolidation, the old chain is unreachable from the mapping table, but a reader that started earlier may still be walking it. Freeing it immediately would be a use-after-free bug. Bw-Trees use <strong>epoch-based reclamation</strong>: threads announce which epoch they are operating in, and memory retired in an epoch is freed only once every thread that could have seen it has left that epoch.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Microsoft SQL Server", title: "In-Memory OLTP", html: "The Bw-Tree was developed at Microsoft Research, and SQL Server's memory-optimized tables (Hekaton) use it for their range (nonclustered) indexes. Its storage layer, LLAMA, is log-structured and access-method aware (see Chapter 7)." },
            { org: "OpenBw-Tree", title: "Academic reimplementation", html: "A 2018 SIGMOD paper from Carnegie Mellon reimplemented the Bw-Tree, documented the many details the original papers left open, and compared it with other concurrent in-memory indexes." },
          ],
        },
        {
          type: "quiz",
          q: "Why can't a Bw-Tree simply store physical pointers from parents to the head of each child's delta chain?",
          options: [
            "Physical pointers are too large",
            "Every new delta changes the head's address, so every parent would need updating, which cannot be done atomically with one CAS; the mapping table gives children stable logical IDs",
            "Parents do not need to find their children",
            "Physical pointers would make consolidation unnecessary",
          ],
          answer: 1,
          explain: "A delta is a new object at a new address. With direct pointers, publishing it would mean rewriting the parent, and then the grandparent, which is the copy-on-write path again. The mapping table adds one indirection so a single CAS on one entry publishes the change.",
        },
      ],
    },
    {
      id: "cache-oblivious",
      title: "Cache-oblivious B-Trees and the van Emde Boas layout",
      kicker: "Layout",
      blocks: [
        {
          type: "problem",
          html: `<p>A B-Tree is <strong>cache-aware</strong>: its node size is tuned to one transfer unit, the disk page. But a modern machine has a whole hierarchy of transfer units: 64-byte cache lines, 4 KB virtual memory pages, larger disk blocks. A layout tuned for one level is not tuned for the others.</p>`,
        },
        {
          type: "idea",
          html: `<p>A <strong>cache-oblivious</strong> structure is laid out so that it uses blocks efficiently whatever their size, without knowing it. The <strong>van Emde Boas layout</strong> does this for trees: cut the tree at half its height, store the top subtree contiguously, then each bottom subtree contiguously, and apply the same rule recursively inside every subtree.</p>`,
        },
        {
          type: "diagram",
          title: "A 15-node tree in van Emde Boas order",
          caption: "Numbers are positions in memory; colours mark the recursive groups. The highlighted path from the root to node 9 touches two contiguous runs, positions 1 to 3 and 7 to 9. In breadth-first order the same path would be positions 1, 2, 5 and 11, spread over three runs of three.",
          svg: `<svg viewBox="0 0 620 255" role="img" aria-label="A complete binary tree of height four numbered in van Emde Boas order with a highlighted root-to-leaf path">
<line x1="300" y1="35" x2="160" y2="90" stroke-width="3" style="stroke: var(--dg-ok)"/>
<line x1="300" y1="35" x2="440" y2="90" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<line x1="160" y1="90" x2="90" y2="145" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<line x1="160" y1="90" x2="230" y2="145" stroke-width="3" style="stroke: var(--dg-ok)"/>
<line x1="440" y1="90" x2="370" y2="145" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<line x1="440" y1="90" x2="510" y2="145" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<line x1="90" y1="145" x2="55" y2="200" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<line x1="90" y1="145" x2="125" y2="200" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<line x1="230" y1="145" x2="195" y2="200" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<line x1="230" y1="145" x2="265" y2="200" stroke-width="3" style="stroke: var(--dg-ok)"/>
<line x1="370" y1="145" x2="335" y2="200" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<line x1="370" y1="145" x2="405" y2="200" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<line x1="510" y1="145" x2="475" y2="200" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<line x1="510" y1="145" x2="545" y2="200" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<circle cx="300" cy="35" r="17" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/><text x="300" y="40" text-anchor="middle" font-size="13">1</text>
<circle cx="160" cy="90" r="17" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/><text x="160" y="95" text-anchor="middle" font-size="13">2</text>
<circle cx="440" cy="90" r="17" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/><text x="440" y="95" text-anchor="middle" font-size="13">3</text>
<circle cx="90" cy="145" r="17" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/><text x="90" y="150" text-anchor="middle" font-size="13">4</text>
<circle cx="230" cy="145" r="17" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/><text x="230" y="150" text-anchor="middle" font-size="13">7</text>
<circle cx="370" cy="145" r="17" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="2"/><text x="370" y="150" text-anchor="middle" font-size="13">10</text>
<circle cx="510" cy="145" r="17" style="fill: var(--dg-5-soft); stroke: var(--dg-5)" stroke-width="2"/><text x="510" y="150" text-anchor="middle" font-size="13">13</text>
<circle cx="55" cy="200" r="17" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/><text x="55" y="205" text-anchor="middle" font-size="13">5</text>
<circle cx="125" cy="200" r="17" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/><text x="125" y="205" text-anchor="middle" font-size="13">6</text>
<circle cx="195" cy="200" r="17" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/><text x="195" y="205" text-anchor="middle" font-size="13">8</text>
<circle cx="265" cy="200" r="17" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/><text x="265" y="205" text-anchor="middle" font-size="13">9</text>
<circle cx="335" cy="200" r="17" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="2"/><text x="335" y="205" text-anchor="middle" font-size="13">11</text>
<circle cx="405" cy="200" r="17" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="2"/><text x="405" y="205" text-anchor="middle" font-size="13">12</text>
<circle cx="475" cy="200" r="17" style="fill: var(--dg-5-soft); stroke: var(--dg-5)" stroke-width="2"/><text x="475" y="205" text-anchor="middle" font-size="13">14</text>
<circle cx="545" cy="200" r="17" style="fill: var(--dg-5-soft); stroke: var(--dg-5)" stroke-width="2"/><text x="545" y="205" text-anchor="middle" font-size="13">15</text>
<text x="310" y="245" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">top subtree: 1-3, then bottom subtrees 4-6, 7-9, 10-12, 13-15</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>Why does this help for <em>every</em> block size? At some level of the recursion, the subtrees become just small enough to fit in one block. A root-to-leaf path passes through a sequence of such subtrees, each stored contiguously, so it touches only about one or two blocks per subtree. The number of those subtrees along a path works out to O(log<sub>B</sub>N) for block size B, the same as a B-Tree tuned for exactly that B, and it holds simultaneously for cache lines, memory pages and disk blocks.</p>
<p>A static layout doesn't handle inserts, so cache-oblivious B-Trees pair it with a <strong>packed array</strong>: the records live in a sorted array with gaps spread through it, and density thresholds trigger local rebalancing when a region gets too full or too empty.</p>`,
        },
        {
          type: "lab",
          id: "vebLayout",
          caption: "Lay out a complete binary tree breadth-first and in van Emde Boas order, change the block size, and count how many blocks a root-to-leaf path touches in each layout.",
        },
        {
          type: "callout",
          tone: "modern",
          html: `<p>Cache-oblivious B-Trees are elegant and well studied, but production engines still overwhelmingly use cache-aware, page-sized B-Trees, because page-based buffer management, logging and recovery are built around fixed-size pages. The ideas do influence in-memory index design, where layout within a node matters for cache-line efficiency.</p>`,
        },
      ],
    },
    {
      id: "interview",
      title: "B-Tree variants in an interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "text",
          html: `<p>Variants come up when an interviewer pushes past "B-Tree versus LSM Tree": how does an embedded store give readers snapshots without locks, why does MongoDB's engine handle update-heavy workloads well, how can an index avoid latches on a 64-core machine. Framing every answer as a choice of lever, immutability, buffering or layout, makes the trade-offs obvious.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>Have one sentence and one trade-off ready for each:</p>
<ol>
<li><strong>Copy-on-write (LMDB)</strong>: copy the path, swap the root; latch-free consistent snapshots and no WAL, at the cost of path rewrites, delayed space reclamation and a single writer.</li>
<li><strong>Lazy B-Trees (WiredTiger, LA-Trees)</strong>: buffer updates per page or per subtree and reconcile on flush; fewer page writes, more work on reads.</li>
<li><strong>FD-Trees</strong>: small head tree plus immutable sorted runs, searched with fractional cascading; sequential writes for flash.</li>
<li><strong>Bw-Trees</strong>: delta chains, a mapping table and CAS; latch-free, with consolidation, cooperative SMOs and epoch-based reclamation.</li>
<li><strong>Cache-oblivious</strong>: van Emde Boas layout; O(log<sub>B</sub>N) block transfers for every B without tuning.</li>
</ol>`,
        },
        {
          type: "quiz",
          q: "You need an embedded key-value store for a read-heavy service where long-running analytics reads must see a consistent snapshot without blocking the occasional writer. Which design fits best?",
          options: [
            "A classic in-place B-Tree with strict two-phase locking",
            "A copy-on-write B-Tree such as LMDB",
            "A Bw-Tree optimized for many concurrent writers",
            "A hash index",
          ],
          answer: 1,
          explain: "Copy-on-write gives each reader an immutable snapshot rooted at the root it started from, so long reads never block and never see partial updates, while the single writer builds new versions alongside. Its main costs, path rewrites and serialized writers, matter little in a read-heavy workload.",
        },
      ],
    },
  ],
  takeaways: [
    "Classic B-Trees pay with write amplification (a page write per small change), space amplification (partly empty pages) and latch contention; variants pull the levers of immutability, buffering or layout.",
    "Copy-on-write B-Trees copy the root-to-leaf path and swap the root atomically: readers get latch-free snapshots and no WAL is needed, at the cost of path rewrites and delayed reclamation (LMDB).",
    "Lazy B-Trees separate in-memory and on-disk node representations, buffer updates (WiredTiger per page, LA-Trees per subtree) and reconcile them into new pages in batches.",
    "FD-Trees combine a small mutable head tree with immutable sorted runs; fractional cascading turns a search over many runs into one binary search plus a few steps per run.",
    "Bw-Trees prepend deltas and publish them with a CAS on a mapping table of logical node IDs, consolidate long chains, finish SMOs cooperatively and free memory with epoch-based reclamation.",
    "The van Emde Boas layout stores subtrees recursively and contiguously, giving O(log<sub>B</sub>N) block transfers for every block size B without knowing B.",
  ],
  furtherReading: [
    { title: "The Bw-Tree: A B-tree for New Hardware Platforms (Levandoski, Lomet and Sengupta, ICDE 2013)", note: "Delta chains, the mapping table, latch-free SMOs and epoch-based reclamation." },
    { title: "Building a Bw-Tree Takes More Than Just Buzz Words (Wang et al., SIGMOD 2018)", note: "The OpenBw-Tree paper: what it takes to implement a Bw-Tree in practice." },
    { title: "Cache-Oblivious B-Trees (Bender, Demaine and Farach-Colton, 2000)", note: "The van Emde Boas layout combined with a packed array for updates." },
    { title: "LMDB documentation (Symas)", note: "Design notes and API of the copy-on-write, memory-mapped B+-Tree used by OpenLDAP." },
  ],
};
