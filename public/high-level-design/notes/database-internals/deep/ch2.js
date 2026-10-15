// Deep dive: Chapter 2, B-Tree basics. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch2 = {
  hook: `<p>You need to look up one user among a billion by ID. In memory, a balanced binary search tree does it in about 30 comparisons, which takes well under a microsecond. Now put that same tree on a spinning disk, one node per disk location. Each of those 30 steps is a random read costing on the order of 10 milliseconds, so a single lookup takes around a third of a second. A web page that needs a few such lookups is now unusably slow.</p>
<p>The comparisons were never the problem; the trips to disk were. A structure for disk has to make each trip count, by bringing back hundreds of useful keys per read instead of one. That is the whole idea of the B-Tree, and it is why, half a century after it was invented, it still sits under PostgreSQL, MySQL, SQLite and almost every other relational database.</p>`,
  sections: [
    {
      id: "bst-on-disk",
      title: "Why binary search trees fail on disk",
      kicker: "The problem",
      blocks: [
        {
          type: "text",
          html: `<p>A <strong>binary search tree</strong> (BST) stores one key per node, with smaller keys in the left subtree and larger keys in the right. Searching halves the candidates at each step, so a lookup takes about log<sub>2</sub>N comparisons, but only if the tree is <strong>balanced</strong>. Insert keys in sorted order without rebalancing and every new node becomes the right child of the previous one: the tree degenerates into a linked list and lookups take N steps.</p>
<p>Balanced variants such as AVL and red-black trees fix this by <strong>rotating</strong> nodes after inserts so that the height stays close to log<sub>2</sub>N. In memory that works beautifully. On disk, three things go wrong.</p>`,
        },
        {
          type: "list",
          title: "Three reasons a BST makes a poor on-disk structure",
          items: [
            "<strong>Fanout of 2 means great height.</strong> Each node has only two children, so a billion keys need about 30 levels, and each level is a separate disk read.",
            "<strong>No locality.</strong> A node's children can be anywhere on disk. Reading one 4 KB block to get one 16-byte key wastes almost the entire transfer.",
            "<strong>Rebalancing touches many pages.</strong> A rotation rewrites pointers in several nodes, which on disk means rewriting several pages for a single insert.",
          ],
        },
        {
          type: "idea",
          html: `<p>The two properties an on-disk tree needs are <strong>high fanout</strong> (many children per node, so the tree is short) and <strong>low height</strong> (few disk reads per lookup). Pack as many keys as fit into one disk page per node and you get both. The B-Tree is exactly that design.</p>`,
        },
        {
          type: "quiz",
          q: "You insert the keys 1, 2, 3, ..., 1,000,000 in order into a plain (non-balancing) binary search tree. How many nodes does a search for key 1,000,000 visit?",
          options: ["About 20", "About 1,000", "About 1,000,000", "Exactly 1"],
          answer: 2,
          explain: "Each key is larger than every key before it, so each becomes the right child of the previous one. The tree is a linked list a million nodes long, and finding the last key walks all of it. Balancing (or a B-Tree) exists to rule out this case.",
        },
      ],
    },
    {
      id: "hard-disks",
      title: "Hard disks: seeks are the enemy",
      kicker: "Know your hardware",
      blocks: [
        {
          type: "text",
          html: `<p>A hard disk drive stores data on spinning magnetic platters, read by heads on a moving arm. To read something, the arm must <strong>seek</strong> to the right track and then wait for the right part of the platter to rotate under the head. Only then do bytes flow, and once they do, reading consecutive bytes is fast.</p>
<p>Some quick arithmetic shows the asymmetry. A 7,200 rpm disk completes a revolution every 8.33 ms, so on average you wait half of that, about 4.2 ms, for the data to come around, on top of a seek of several milliseconds. Meanwhile, sequential transfer runs at well over 100 MB/s on a modern drive. In the 10 ms one random read costs, a sequential read could have delivered a megabyte or more.</p>`,
        },
        {
          type: "text",
          html: `<p>The smallest unit a disk transfers is a <strong>sector</strong>, historically 512 bytes and 4 KB on modern "Advanced Format" drives. The operating system builds on this with a <strong>block device</strong> abstraction: programs read and write whole blocks, and asking for a single byte reads the entire block that contains it.</p>
<p>That abstraction is the reason page-based design matters so much. If the hardware hands you 4 KB (or more) whether you want it or not, the best data structure is one where that whole 4 KB is useful: many keys, all relevant to the search you are doing.</p>`,
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>On HDDs, the cost model is simple: count the random seeks. Everything in classic B-Tree design, from wide nodes to sequential leaf scans, is an effort to minimize them.</p>`,
        },
      ],
    },
    {
      id: "solid-state-drives",
      title: "Solid state drives: erase blocks and the FTL",
      kicker: "Know your hardware",
      blocks: [
        {
          type: "text",
          html: `<p>SSDs have no moving parts, so the gap between random and sequential <em>reads</em> is far smaller than on a hard disk, and a drive can serve many requests in parallel. But flash has its own strange rules, and they show up on the <em>write</em> path.</p>
<p>Flash memory is built from cells, grouped into <strong>pages</strong> (typically 2 to 16 KB), which are grouped into <strong>blocks</strong> of 64 to 512 pages. You can read and write individual pages, but you can only write a page that has been <strong>erased</strong>, and erasing works only on a whole block at a time. There is no way to overwrite a page in place.</p>`,
        },
        {
          type: "steps",
          title: "What an overwrite really does on an SSD",
          items: [
            "The application rewrites logical page 17. The drive cannot overwrite the physical page that holds it.",
            "The controller writes the new contents to a free, already-erased physical page and updates its mapping so logical page 17 now points there.",
            "The old physical page is marked invalid (stale). It still occupies space until its whole block is erased.",
            "When free blocks run low, garbage collection picks a victim block, copies its still-valid pages to a free block, and erases the victim.",
          ],
        },
        {
          type: "diagram",
          title: "SSD garbage collection",
          caption: "The victim block holds 3 live pages and 5 stale ones. Before it can be erased, the 3 live pages are copied elsewhere. Those copies are writes the application never asked for: write amplification.",
          svg: `<svg viewBox="0 0 620 230" role="img" aria-label="SSD garbage collection copies live pages out of a victim block before erasing it">
<defs><marker id="di2-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-ink)"/></marker></defs>
<text x="120" y="38" text-anchor="middle" font-size="13" font-weight="700">Block A (victim)</text>
<text x="500" y="38" text-anchor="middle" font-size="13" font-weight="700">Block B (was free)</text>
<rect x="20" y="48" width="200" height="98" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<rect x="28" y="56" width="44" height="38" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)"/><text x="50" y="80" text-anchor="middle" font-size="12">live</text>
<rect x="76" y="56" width="44" height="38" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)"/><text x="98" y="80" text-anchor="middle" font-size="12">stale</text>
<rect x="124" y="56" width="44" height="38" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)"/><text x="146" y="80" text-anchor="middle" font-size="12">stale</text>
<rect x="172" y="56" width="44" height="38" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)"/><text x="194" y="80" text-anchor="middle" font-size="12">live</text>
<rect x="28" y="100" width="44" height="38" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)"/><text x="50" y="124" text-anchor="middle" font-size="12">stale</text>
<rect x="76" y="100" width="44" height="38" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)"/><text x="98" y="124" text-anchor="middle" font-size="12">stale</text>
<rect x="124" y="100" width="44" height="38" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)"/><text x="146" y="124" text-anchor="middle" font-size="12">stale</text>
<rect x="172" y="100" width="44" height="38" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)"/><text x="194" y="124" text-anchor="middle" font-size="12">live</text>
<line x1="228" y1="97" x2="392" y2="97" stroke-width="2" style="stroke: var(--dg-ink)" marker-end="url(#di2-arrow)"/>
<text x="310" y="86" text-anchor="middle" font-size="12">copy 3 live pages</text>
<text x="310" y="116" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">then erase block A</text>
<rect x="400" y="48" width="200" height="98" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<rect x="408" y="56" width="44" height="38" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)"/><text x="430" y="80" text-anchor="middle" font-size="12">live</text>
<rect x="456" y="56" width="44" height="38" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)"/><text x="478" y="80" text-anchor="middle" font-size="12">live</text>
<rect x="504" y="56" width="44" height="38" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)"/><text x="526" y="80" text-anchor="middle" font-size="12">live</text>
<rect x="552" y="56" width="44" height="38" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="574" y="80" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">free</text>
<rect x="408" y="100" width="44" height="38" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="430" y="124" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">free</text>
<rect x="456" y="100" width="44" height="38" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="478" y="124" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">free</text>
<rect x="504" y="100" width="44" height="38" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="526" y="124" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">free</text>
<rect x="552" y="100" width="44" height="38" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="574" y="124" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">free</text>
<rect x="20" y="176" width="16" height="16" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)"/><text x="44" y="189" font-size="12">live: current data</text>
<rect x="210" y="176" width="16" height="16" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)"/><text x="234" y="189" font-size="12">stale: overwritten elsewhere</text>
<rect x="440" y="176" width="16" height="16" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="464" y="189" font-size="12">free: erased</text>
<text x="20" y="218" font-size="12" style="fill: var(--dg-muted)">Write amplification grows with the number of live pages GC must move per erased block.</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>All this bookkeeping is done by the drive's <strong>Flash Translation Layer</strong> (FTL): it maps logical page numbers to physical pages, tracks which pages are free, valid or stale, and runs garbage collection. It is invisible to the database, but it is not free. If writes are small, random and scattered, blocks end up with a mix of live and stale pages, and garbage collection has to copy a lot of live data to reclaim each block. That extra internal copying is <strong>write amplification</strong>, and it costs both throughput (and sometimes latency spikes) and drive lifetime.</p>
<p>The takeaway for storage engines: on SSDs, random reads are cheap enough, but writes should be large, sequential and aligned where possible. Chapter 7 shows how LSM Trees exploit this, and how stacking log-structured layers on top of each other can backfire.</p>`,
        },
        {
          type: "quiz",
          q: "An SSD has two workloads writing the same number of bytes per second. Workload A appends large sequential chunks; workload B overwrites random 4 KB pages across the whole drive. Which one causes more internal write amplification, and why?",
          options: [
            "A, because sequential writes fill blocks faster",
            "B, because victim blocks are left with many live pages that garbage collection must copy",
            "Neither; SSDs have no seek cost, so patterns don't matter",
            "Both equally, since the bytes written are identical",
          ],
          answer: 1,
          explain: "Random overwrites invalidate pages scattered over many blocks, so any block chosen for erasure still holds many live pages to relocate. Sequential writes tend to invalidate whole blocks together, which can be erased with little or no copying.",
        },
      ],
    },
    {
      id: "btree-structure",
      title: "The B-Tree: wide, short and sorted",
      kicker: "The key idea",
      blocks: [
        {
          type: "idea",
          html: `<p>Make each tree node exactly one disk page and fill it with as many sorted keys as fit, often hundreds. A node with N keys has N+1 children, so the tree fans out enormously at every level and stays only a few levels tall even for billions of records.</p>`,
        },
        {
          type: "text",
          html: `<p>A B-Tree has three kinds of nodes. The <strong>root</strong> has no parent. <strong>Leaves</strong> are the bottom layer and have no children. Everything in between is an <strong>internal node</strong>. All leaves are at the same depth, which is what "balanced" means here. The maximum number of children per node is its <strong>fanout</strong>, and how full a node currently is, its <strong>occupancy</strong>.</p>
<p>Keys in internal nodes are <strong>separator keys</strong>: they divide the key space among the children. If an internal node holds separators 20 and 35, its first child covers keys below 20, the second covers 20 up to (but not including) 35, and the third covers 35 and above. A separator is only a signpost. If the record with key 20 is later deleted, the separator 20 can stay in the internal node and keep routing correctly.</p>`,
        },
        {
          type: "diagram",
          title: "A three-level B+-Tree",
          caption: "Internal nodes hold only separator keys; records live in the leaves, which are linked to their siblings (dashed) so a range scan can walk sideways without returning to the parents.",
          svg: `<svg viewBox="0 0 620 250" role="img" aria-label="A three-level B+-Tree with a root, two internal nodes and six linked leaves">
<text x="20" y="40" font-size="12" style="fill: var(--dg-muted)">root</text>
<text x="20" y="114" font-size="12" style="fill: var(--dg-muted)">internal</text>
<rect x="275" y="20" width="70" height="30" rx="5" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="310" y="40" text-anchor="middle" font-size="13" font-weight="700">50</text>
<line x1="295" y1="50" x2="157" y2="95" stroke-width="1.5" style="stroke: var(--dg-muted)"/>
<line x1="325" y1="50" x2="463" y2="95" stroke-width="1.5" style="stroke: var(--dg-muted)"/>
<rect x="107" y="95" width="100" height="30" rx="5" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="157" y="115" text-anchor="middle" font-size="13" font-weight="700">20 | 35</text>
<rect x="413" y="95" width="100" height="30" rx="5" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="463" y="115" text-anchor="middle" font-size="13" font-weight="700">70 | 85</text>
<line x1="117" y1="125" x2="55" y2="175" stroke-width="1.5" style="stroke: var(--dg-muted)"/>
<line x1="157" y1="125" x2="157" y2="175" stroke-width="1.5" style="stroke: var(--dg-muted)"/>
<line x1="197" y1="125" x2="259" y2="175" stroke-width="1.5" style="stroke: var(--dg-muted)"/>
<line x1="423" y1="125" x2="361" y2="175" stroke-width="1.5" style="stroke: var(--dg-muted)"/>
<line x1="463" y1="125" x2="463" y2="175" stroke-width="1.5" style="stroke: var(--dg-muted)"/>
<line x1="503" y1="125" x2="565" y2="175" stroke-width="1.5" style="stroke: var(--dg-muted)"/>
<rect x="15" y="175" width="80" height="34" rx="5" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/><text x="55" y="197" text-anchor="middle" font-size="12">5  12</text>
<rect x="117" y="175" width="80" height="34" rx="5" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/><text x="157" y="197" text-anchor="middle" font-size="12">20  28</text>
<rect x="219" y="175" width="80" height="34" rx="5" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/><text x="259" y="197" text-anchor="middle" font-size="12">35  41</text>
<rect x="321" y="175" width="80" height="34" rx="5" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/><text x="361" y="197" text-anchor="middle" font-size="12">50  63</text>
<rect x="423" y="175" width="80" height="34" rx="5" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/><text x="463" y="197" text-anchor="middle" font-size="12">70  77</text>
<rect x="525" y="175" width="80" height="34" rx="5" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/><text x="565" y="197" text-anchor="middle" font-size="12">85  93</text>
<line x1="95" y1="192" x2="117" y2="192" stroke-width="2" stroke-dasharray="4 3" style="stroke: var(--dg-3)"/>
<line x1="197" y1="192" x2="219" y2="192" stroke-width="2" stroke-dasharray="4 3" style="stroke: var(--dg-3)"/>
<line x1="299" y1="192" x2="321" y2="192" stroke-width="2" stroke-dasharray="4 3" style="stroke: var(--dg-3)"/>
<line x1="401" y1="192" x2="423" y2="192" stroke-width="2" stroke-dasharray="4 3" style="stroke: var(--dg-3)"/>
<line x1="503" y1="192" x2="525" y2="192" stroke-width="2" stroke-dasharray="4 3" style="stroke: var(--dg-3)"/>
<text x="310" y="238" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">leaves: keys with their values, linked to siblings</text>
</svg>`,
        },
        {
          type: "text",
          html: `<h3>B-Tree or B+-Tree?</h3>
<p>The original B-Tree stored values in every node, internal ones included. The <strong>B+-Tree</strong> variant stores values only in the leaves and keeps internal nodes as pure routing structure. That has three benefits. Internal nodes hold more separators per page, so fanout is higher and the tree is shorter. Inserts, updates and deletes of records only modify leaves; internal nodes change only when a leaf splits or merges. And range scans are easy: find the first leaf, then follow <strong>sibling pointers</strong> from leaf to leaf.</p>
<p>In practice, when databases say "B-Tree" they almost always mean a B+-Tree. The rest of this book (and these notes) follows that convention.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "PostgreSQL", title: "nbtree", html: "PostgreSQL's default index type is a B+-Tree based on the Lehman and Yao design, with 8 KB pages, separator keys in internal pages and sibling links on every level, not just the leaves." },
            { org: "MySQL InnoDB", title: "16 KB pages", html: "InnoDB stores both tables (the clustered index) and secondary indexes as B+-Trees, using 16 KB pages by default, with leaf pages chained in a doubly linked list." },
            { org: "SQLite", title: "Two flavours in one file", html: "SQLite's file format uses B+-Trees for tables, with all row data in the leaves, and plain B-Trees for indexes, where keys appear in interior pages too. The default page size is 4,096 bytes." },
          ],
        },
      ],
    },
    {
      id: "lookup-cost",
      title: "Lookup cost: block transfers versus comparisons",
      kicker: "How it works",
      blocks: [
        {
          type: "text",
          html: `<p>A lookup starts at the root, binary searches the node's sorted separators to choose a child, reads that child, and repeats until it reaches a leaf, where one more binary search finds the key (or proves it is absent). There are two honest ways to count the cost.</p>
<ul>
<li><strong>Block transfers</strong>: one page read per level, so log<sub>K</sub>M for M records and K keys per node. This is what the disk feels.</li>
<li><strong>Comparisons</strong>: binary search inside each node costs log<sub>2</sub>K, and over all levels that adds up to log<sub>2</sub>M. This is what the CPU feels.</li>
</ul>
<p>For 4 billion keys, log<sub>2</sub>M is about 32. A B-Tree does those 32 comparisons too, but spreads them over a handful of page reads instead of 32 separate ones.</p>`,
        },
        {
          type: "text",
          html: `<h3>Worked example: how tall is a billion-row table?</h3>
<p>Suppose 16 KB pages, internal entries of about 16 bytes (an 8-byte key, a page pointer and a little overhead), so roughly 1,000 children per internal node. Leaves hold the rows themselves; at about 160 bytes per row, a leaf holds about 100 rows.</p>
<ul>
<li>1 billion rows / 100 per leaf = <strong>10 million leaves</strong>.</li>
<li>10 million / 1,000 = <strong>10,000</strong> internal nodes one level up.</li>
<li>10,000 / 1,000 = <strong>10</strong> nodes above those, and then <strong>1</strong> root.</li>
</ul>
<p>That is a tree of <strong>4 levels</strong>. Better still, all the internal levels together are about 10,011 pages, roughly 160 MB, which fits comfortably in the buffer pool. In steady state a point lookup costs one disk read, for the leaf. A balanced BST over the same data would need about 30 levels and could cache only a few of them.</p>`,
        },
        {
          type: "lab",
          id: "btreeHeight",
          caption: "Compare the height of a binary tree and a B-Tree as the key count grows, try sorted inserts into an unbalanced BST, and cache the top levels in memory as a real page cache would.",
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>Fanout is driven by key size. A 100-byte composite key fits about ten times fewer entries per page than an 8-byte integer, which lowers fanout, raises height and shrinks how much of the tree fits in cache. That is one reason schema guides push for compact keys, and why engines compress key prefixes (Chapter 4).</p>`,
        },
        {
          type: "quiz",
          q: "A B-Tree has a fanout of about 500. Roughly how many levels does it need for 100 million keys?",
          options: ["2", "3", "4", "27"],
          answer: 1,
          explain: "500 to the power of 3 is 125 million, which covers 100 million keys, while two levels hold only 250,000. So about 3 levels. A binary tree would need about 27 (2 to the 27th is about 134 million).",
        },
      ],
    },
    {
      id: "splits-and-merges",
      title: "Keeping balance: splits and merges",
      kicker: "How it changes",
      blocks: [
        {
          type: "text",
          html: `<p>A B-Tree never rotates. It stays balanced by growing and shrinking at the <em>top</em>. New nodes appear only by splitting a full one, and nodes disappear only by merging underfull neighbours.</p>`,
        },
        {
          type: "steps",
          title: "Inserting into a full leaf",
          items: [
            "Search down to the leaf where the key belongs, remembering the path.",
            "If the leaf has room, insert the key in sorted position. Done.",
            "If it is full, allocate a new node and move the upper half of the keys into it, putting the new key in whichever half it belongs.",
            "Insert the first key of the new node (the split point) into the parent as a new separator, with a pointer to the new node. This is called <strong>promoting</strong> the key.",
            "If the parent is now full, split it the same way. Splits can cascade up the path.",
            "If the root splits, create a new root with two children. The tree is now one level taller, and every leaf is still at the same depth.",
          ],
        },
        {
          type: "diagram",
          title: "A leaf split",
          caption: "Inserting 25 into the full leaf [10 20 30 40] (capacity 4) splits it into [10 20 25] and [30 40]. The first key of the new leaf, 30, is promoted to the parent as a separator.",
          svg: `<svg viewBox="0 0 620 230" role="img" aria-label="A full B-Tree leaf splits in two and promotes key 30 to the parent">
<text x="150" y="22" text-anchor="middle" font-size="13" font-weight="700">Before: insert 25</text>
<text x="470" y="22" text-anchor="middle" font-size="13" font-weight="700">After: split and promote 30</text>
<line x1="305" y1="10" x2="305" y2="220" stroke-width="1" stroke-dasharray="4 4" style="stroke: var(--dg-line)"/>
<rect x="120" y="45" width="60" height="30" rx="5" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="150" y="65" text-anchor="middle" font-size="13">50</text>
<line x1="135" y1="75" x2="95" y2="130" stroke-width="1.5" style="stroke: var(--dg-muted)"/>
<line x1="165" y1="75" x2="235" y2="130" stroke-width="1.5" style="stroke: var(--dg-muted)"/>
<rect x="20" y="130" width="150" height="34" rx="5" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)"/>
<text x="95" y="152" text-anchor="middle" font-size="12">10  20  30  40</text>
<text x="95" y="184" text-anchor="middle" font-size="12" style="fill: var(--dg-bad)">full</text>
<rect x="195" y="130" width="80" height="34" rx="5" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<text x="235" y="152" text-anchor="middle" font-size="12">50  70</text>
<rect x="425" y="45" width="90" height="30" rx="5" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="470" y="65" text-anchor="middle" font-size="13"><tspan font-weight="700" style="fill: var(--dg-ok)">30</tspan> | 50</text>
<line x1="435" y1="75" x2="370" y2="130" stroke-width="1.5" style="stroke: var(--dg-muted)"/>
<line x1="470" y1="75" x2="468" y2="130" stroke-width="1.5" style="stroke: var(--dg-muted)"/>
<line x1="505" y1="75" x2="552" y2="130" stroke-width="1.5" style="stroke: var(--dg-muted)"/>
<rect x="322" y="130" width="96" height="34" rx="5" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<text x="370" y="152" text-anchor="middle" font-size="12">10  20  25</text>
<rect x="432" y="130" width="72" height="34" rx="5" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)"/>
<text x="468" y="152" text-anchor="middle" font-size="12">30  40</text>
<text x="468" y="184" text-anchor="middle" font-size="12" style="fill: var(--dg-ok)">new leaf</text>
<rect x="516" y="130" width="72" height="34" rx="5" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<text x="552" y="152" text-anchor="middle" font-size="12">50  70</text>
</svg>`,
        },
        {
          type: "text",
          html: `<h3>Deleting and merging</h3>
<p>Deletes work in reverse. Removing a key from a leaf may leave it underfull. If a neighbouring sibling has few enough keys that both fit in one node, the engine <strong>merges</strong> them: it moves one node's contents into the other, removes the separator between them from the parent (for internal nodes, the separator is pulled down into the merged node instead), and frees the empty page. Like splits, merges can cascade upward, and if the root ends up with a single child, that child becomes the new root and the tree loses a level.</p>
<p>Many implementations prefer <strong>redistribution</strong> first: if a sibling has spare keys, move a few across and adjust the separator in the parent. That keeps both nodes reasonably full without changing the tree's shape. Some engines go further and never merge eagerly at all, leaving underfull pages to background maintenance.</p>`,
        },
        {
          type: "lab",
          id: "btree",
          caption: "Insert keys until a leaf splits and promotes a separator, keep going until the root splits, then delete keys to trigger redistribution and merges and watch the root collapse.",
        },
        {
          type: "text",
          html: `<p>After a split, both halves are about 50% full. Under random inserts, B-Tree pages settle at roughly two-thirds to 70% occupancy on average, so a classic B-Tree carries a fair amount of empty space by design. That space is not pure waste: it absorbs future inserts without splits. Chapter 4 shows how split policies, sequential-insert optimizations and bulk loading change these numbers.</p>`,
        },
        {
          type: "quiz",
          q: "In a B-Tree, every leaf is at the same depth. Which mechanism guarantees that?",
          options: [
            "Rotations after every insert",
            "The tree only grows by splitting the root, which adds a level above every leaf at once",
            "Leaves are periodically rebuilt by a background job",
            "Inserts are only allowed in the rightmost leaf",
          ],
          answer: 1,
          explain: "New leaves are created next to existing ones by splits, at the same depth. The only way the tree gets taller is a root split, which pushes every leaf one level further from the new root at the same time, so depth stays uniform without rotations.",
        },
      ],
    },
    {
      id: "interview",
      title: "B-Trees in an interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "text",
          html: `<p>"Why does every database index use a B-Tree?" is a classic warm-up, and the follow-ups go straight to the mechanics: how many disk reads per lookup, what happens on insert into a full page, why not a hash table or a binary tree. The answers all come back to the cost of a disk access and the size of a page.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>A strong answer to "why B-Trees for disk?" covers:</p>
<ol>
<li><strong>Disk reads are the cost</strong>: the device transfers whole blocks, and random accesses are expensive (very expensive on HDDs).</li>
<li><strong>High fanout</strong>: a page-sized node holds hundreds of keys, so height is log<sub>K</sub>N, about 3 or 4 levels for billions of rows, versus about 30 for a binary tree.</li>
<li><strong>Caching</strong>: the internal levels are a tiny fraction of the tree and stay in memory, so a lookup typically costs one disk read.</li>
<li><strong>Balance via splits and merges</strong>: local operations that grow or shrink the tree at the root, keeping every leaf at the same depth.</li>
<li><strong>B+-Tree details</strong>: values only in leaves, sibling-linked leaves for fast range scans.</li>
</ol>`,
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Saying a B-Tree lookup is "O(log N), same as a binary tree" misses the point. The comparison count is indeed about log<sub>2</sub>N for both. What differs is the number of <em>page reads</em>, log<sub>K</sub>N, and that is what dominates on disk.</p>`,
        },
        {
          type: "quiz",
          q: "An interviewer asks why you wouldn't use a hash index instead of a B-Tree for a table's primary key. What is the strongest argument for the B-Tree?",
          options: [
            "Hash indexes cannot be stored on disk",
            "B-Trees keep keys sorted, so they support range scans, ordered results and prefix searches; hash indexes only support equality",
            "B-Trees always need fewer disk reads for point lookups",
            "Hash functions are too slow to compute",
          ],
          answer: 1,
          explain: "A hash index can match a B-Tree on point lookups, but it scatters adjacent keys, so it can't answer BETWEEN, ORDER BY or prefix queries efficiently. The B-Tree's sorted order serves both point and range access, which is why it is the general-purpose default.",
        },
      ],
    },
  ],
  takeaways: [
    "On disk, the cost of a lookup is the number of block reads, not the number of comparisons.",
    "Binary search trees fail on disk: fanout 2 means about 30 levels for a billion keys, children land on random pages, and rebalancing rewrites many pages.",
    "HDDs punish seeks; SSDs punish small random writes, because pages can only be written after their whole block is erased and the FTL's garbage collection copies live pages (write amplification).",
    "A B-Tree node is one page holding hundreds of sorted keys, so height is log<sub>K</sub>N: about 3 or 4 levels for billions of rows, with the internal levels small enough to cache.",
    "B+-Trees keep values only in leaves, use internal separator keys purely for routing, and link leaves for range scans. Databases mean B+-Tree when they say B-Tree.",
    "B-Trees stay balanced through splits (promote a separator; a root split adds a level) and merges or redistribution (a root with one child drops a level), never rotations.",
  ],
  furtherReading: [
    { title: "Organization and Maintenance of Large Ordered Indices (Bayer and McCreight, 1972)", note: "The paper that introduced the B-Tree." },
    { title: "The Ubiquitous B-Tree (Comer, 1979)", note: "A classic survey that explains the B+-Tree variant and why B-Trees took over." },
    { title: "SQLite Database File Format", url: "https://www.sqlite.org/fileformat.html", note: "A precise, readable description of real B-Tree pages on disk." },
  ],
};
