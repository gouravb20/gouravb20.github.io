// Deep dive: Chapter 3, File formats. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch3 = {
  hook: `<p>Your engine writes the integer 300 into a page as four bytes. A colleague's tool reads the same four bytes on another machine and reports 738,263,040. Nobody corrupted anything: the two programs simply disagreed about which byte comes first. Later, you delete a 40-byte record from the middle of a full page and realize that, with records packed back to back, closing the gap means shifting every record after it, and that every index entry pointing at those records is now wrong.</p>
<p>A B-Tree on a whiteboard is boxes and arrows. A B-Tree on disk is bytes in pages, and someone has to decide exactly where each byte goes, how a page finds a record inside itself, where deleted space goes, and how a reader can tell a healthy page from a corrupted one. This chapter is that someone's handbook.</p>`,
  sections: [
    {
      id: "why-formats",
      title: "Why storage engines design their own binary formats",
      kicker: "Motivation",
      blocks: [
        {
          type: "problem",
          html: `<p>In memory, the language runtime does a lot for you: <code>malloc</code> finds space, a garbage collector reclaims it, and pointers just work. On disk there is none of that. The file is a flat array of bytes, read and written in pages, and every structure inside it has to be laid out, located and reclaimed by hand.</p>`,
        },
        {
          type: "analogy",
          html: `<p>Designing a file format is like writing a data structure in C with no allocator: you decide the exact byte layout of every object, how to find objects by offset, how to reuse freed space, and how to defragment when holes appear. The difference is that mistakes persist across restarts.</p>`,
        },
        {
          type: "text",
          html: `<p>The format also decides performance. Because the disk hands out whole pages, the layout determines how many pages a lookup touches and how much of each page is useful. A format that lets a reader jump straight to the field it needs, by arithmetic rather than by parsing everything before it, keeps lookups cheap. A format that wastes space or scatters related bytes makes every operation read more.</p>
<p>The chapter builds a format from the bottom up: how single values become bytes, how values become records, how records sit in pages, and how pages carry the metadata needed to evolve and to detect damage.</p>`,
        },
      ],
    },
    {
      id: "binary-encoding",
      title: "Encoding values: endianness, strings and bit flags",
      kicker: "Building blocks",
      blocks: [
        {
          type: "text",
          html: `<p>Most values in a page are <strong>fixed-size primitives</strong>: an 8-bit byte, a 16-bit short, a 32-bit int, a 64-bit long, or an IEEE 754 float or double. Fixed sizes are what make a format navigable: if the first field is 8 bytes, the second starts at offset 8, always.</p>
<p>The first decision for any multi-byte value is <strong>byte order</strong>. A <strong>big-endian</strong> encoding writes the most significant byte first, the way we write numbers. A <strong>little-endian</strong> encoding writes the least significant byte first, which is what x86 and most ARM configurations use natively. Neither is better, but the writer and the reader must agree, and the format must say which it uses.</p>`,
        },
        {
          type: "diagram",
          title: "The integer 300 in both byte orders",
          caption: "300 is 0x0000012C. Read the little-endian bytes as if they were big-endian and you get 0x2C010000, which is 738,263,040.",
          svg: `<svg viewBox="0 0 620 170" role="img" aria-label="The integer 300 stored as big-endian and little-endian bytes">
<text x="178" y="30" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">byte 0</text>
<text x="238" y="30" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">byte 1</text>
<text x="298" y="30" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">byte 2</text>
<text x="358" y="30" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">byte 3</text>
<text x="20" y="62" font-size="13" font-weight="700">Big-endian</text>
<rect x="150" y="40" width="56" height="34" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/><text x="178" y="62" text-anchor="middle" font-size="13">00</text>
<rect x="210" y="40" width="56" height="34" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/><text x="238" y="62" text-anchor="middle" font-size="13">00</text>
<rect x="270" y="40" width="56" height="34" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/><text x="298" y="62" text-anchor="middle" font-size="13">01</text>
<rect x="330" y="40" width="56" height="34" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/><text x="358" y="62" text-anchor="middle" font-size="13">2C</text>
<text x="405" y="62" font-size="12">most significant byte first</text>
<text x="20" y="112" font-size="13" font-weight="700">Little-endian</text>
<rect x="150" y="90" width="56" height="34" rx="4" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/><text x="178" y="112" text-anchor="middle" font-size="13">2C</text>
<rect x="210" y="90" width="56" height="34" rx="4" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/><text x="238" y="112" text-anchor="middle" font-size="13">01</text>
<rect x="270" y="90" width="56" height="34" rx="4" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/><text x="298" y="112" text-anchor="middle" font-size="13">00</text>
<rect x="330" y="90" width="56" height="34" rx="4" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/><text x="358" y="112" text-anchor="middle" font-size="13">00</text>
<text x="405" y="112" font-size="12">least significant byte first</text>
<text x="20" y="155" font-size="12" style="fill: var(--dg-bad)">Wrong assumption: read 2C 01 00 00 as big-endian = 738,263,040</text>
</svg>`,
        },
        {
          type: "text",
          html: `<h3>Strings and other variable-size values</h3>
<p>A string has no fixed size, so the format must say where it ends. A C-style string ends with a zero byte, which means you must scan every byte to find its length, and the data can't contain a zero. The alternative is a <strong>length-prefixed</strong> (Pascal-style) string: a fixed-size length field followed by exactly that many bytes. Its length is known in constant time, a reader can skip over it without looking inside, and it can be sliced straight out of the page buffer.</p>
<h3>Bit-packed values</h3>
<p>Page headers carry many yes/no facts: is this a leaf, are values variable-size, does any cell spill to an overflow page. Spending a byte on each would be wasteful, so formats pack them as <strong>flags</strong>, one bit each, in a single integer. Mutually exclusive choices, such as the node type (root, internal, leaf), are stored as small <strong>enum</strong> values instead.</p>`,
        },
        {
          type: "code",
          lang: "c",
          title: "Setting, clearing and testing flags",
          code: `#define IS_LEAF        0x01   /* bit 0 */
#define VAR_SIZE_VALS  0x02   /* bit 1 */
#define HAS_OVERFLOW   0x04   /* bit 2 */

uint8_t flags = 0;
flags |= IS_LEAF | HAS_OVERFLOW;        /* set two flags   -> 0x05 */
flags &= ~HAS_OVERFLOW;                 /* clear one       -> 0x01 */
int leaf = (flags & IS_LEAF) != 0;      /* test            -> 1    */`,
          caption: "Each flag is a power of two, so each owns one bit. OR sets, AND with the complement clears, AND tests.",
        },
        {
          type: "lab",
          id: "byteEncoding",
          caption: "Flip the byte order and see what a reader gets when it assumes the wrong one, compare length-prefixed and null-terminated strings in a fixed-schema record, and pack flags into a byte.",
        },
        {
          type: "realworld",
          items: [
            { org: "SQLite", title: "Big-endian everywhere", html: "SQLite's file format stores every multi-byte integer as big-endian, regardless of the CPU, so a database file can be copied between machines unchanged. It also uses its own variable-length integer encoding (1 to 9 bytes) for sizes and row IDs, so small numbers take a single byte." },
            { org: "RocksDB", title: "Platform detection", html: "RocksDB's portability layer detects the target platform's byte order at compile time, and its encoding helpers write fixed-width integers in a defined order and lengths as varints." },
          ],
        },
        {
          type: "quiz",
          q: "Why do most file formats prefer length-prefixed strings over null-terminated ones?",
          options: [
            "They use less space for every string",
            "The length is known without scanning, the reader can skip over the string, and the data may contain zero bytes",
            "Null-terminated strings cannot store ASCII text",
            "CPUs can only compare length-prefixed strings",
          ],
          answer: 1,
          explain: "A length prefix costs a few bytes but makes the size available in constant time, lets a parser jump past the string, and allows any byte value in the payload. A null terminator forces a scan and forbids zero bytes inside the data.",
        },
      ],
    },
    {
      id: "file-and-record-layout",
      title: "Files, pages and fixed-schema records",
      kicker: "Layout",
      blocks: [
        {
          type: "text",
          html: `<p>A typical data file starts with a fixed-size <strong>header</strong>, continues with a sequence of <strong>pages</strong>, and may end with a fixed-size <strong>trailer</strong>. The header and trailer hold what a reader needs before it can decode anything else: a magic number identifying the format, the format version, the page size, and pointers to important pages such as the root.</p>
<p>In-place update structures like B-Trees almost always use pages of one size. That makes addressing trivial: a page ID is enough to find the page, because its byte offset is <code>page_id &times; page_size</code> (plus the header, if it sits outside page 0). With 8 KB pages, page 1,000 starts at byte 8,192,000. No lookup table is needed.</p>`,
        },
        {
          type: "text",
          html: `<h3>Records with a fixed schema</h3>
<p>Inside a page, records follow the same principle: make offsets computable. Put all <strong>fixed-size fields first</strong>, then the variable-size fields, and store each variable field's length (or offset) in the fixed-size part. A reader can then find any field with a little arithmetic. Fixed fields have constant offsets; the first variable field starts right after the fixed part; each later variable field starts where the previous one ends.</p>`,
        },
        {
          type: "diagram",
          title: "A fixed-schema order record",
          caption: "The first five fields have constant offsets, so the engine can read status by jumping to byte 24 without parsing anything. The note's length lives in the fixed part, so the variable part is located just as cheaply.",
          svg: `<svg viewBox="0 0 620 170" role="img" aria-label="Byte layout of a record with fixed-size fields first and a variable-size note at the end">
<line x1="20" y1="50" x2="458" y2="50" stroke-width="2" style="stroke: var(--dg-1)"/>
<text x="239" y="40" text-anchor="middle" font-size="12">fixed-size part: every offset is a constant</text>
<line x1="462" y1="50" x2="600" y2="50" stroke-width="2" style="stroke: var(--dg-2)"/>
<text x="531" y="40" text-anchor="middle" font-size="12">variable part</text>
<rect x="20" y="60" width="100" height="40" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/><text x="70" y="85" text-anchor="middle" font-size="12">order_id</text>
<rect x="120" y="60" width="100" height="40" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/><text x="170" y="85" text-anchor="middle" font-size="12">customer_id</text>
<rect x="220" y="60" width="100" height="40" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/><text x="270" y="85" text-anchor="middle" font-size="12">created_at</text>
<rect x="320" y="60" width="60" height="40" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/><text x="350" y="85" text-anchor="middle" font-size="12">status</text>
<rect x="380" y="60" width="80" height="40" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/><text x="420" y="85" text-anchor="middle" font-size="12">note_len</text>
<rect x="460" y="60" width="140" height="40" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/><text x="530" y="85" text-anchor="middle" font-size="12">note bytes</text>
<text x="20" y="118" font-size="12">0</text>
<text x="120" y="118" text-anchor="middle" font-size="12">8</text>
<text x="220" y="118" text-anchor="middle" font-size="12">16</text>
<text x="320" y="118" text-anchor="middle" font-size="12">24</text>
<text x="380" y="118" text-anchor="middle" font-size="12">25</text>
<text x="460" y="118" text-anchor="middle" font-size="12">27</text>
<text x="20" y="140" font-size="12" style="fill: var(--dg-muted)">byte offsets: three 8-byte fields, a 1-byte status, a 2-byte length</text>
<text x="20" y="160" font-size="12" style="fill: var(--dg-muted)">the note starts at byte 27 and runs for note_len bytes</text>
</svg>`,
        },
        {
          type: "realworld",
          items: [
            { org: "SQLite", title: "A 100-byte file header", html: "Every SQLite database begins with a 100-byte header whose first 16 bytes are the string <code>SQLite format 3</code> followed by a zero byte. The header records the page size, format version numbers and other file-wide settings; page 1 contains the header and then the root of the schema table." },
            { org: "PostgreSQL", title: "Fixed-size pages in segment files", html: "PostgreSQL stores each table and index as files of 8 KB pages (by default), split into 1 GB segment files. A page is located by its block number, so the file offset is simple arithmetic." },
          ],
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>The same principle, "make the position of the next thing computable", shows up at every scale: fixed-size pages make page offsets arithmetic, fixed-first records make field offsets arithmetic, and (next section) offset arrays make cell positions a single array lookup.</p>`,
        },
      ],
    },
    {
      id: "slotted-pages",
      title: "Slotted pages: variable-size records in a fixed-size page",
      kicker: "The centerpiece",
      blocks: [
        {
          type: "problem",
          html: `<p>Pack records back to back in key order and three things break. Inserting a key in the middle means shifting every record after it. Deleting a record leaves a hole that only a record of the same size could reuse. And any external reference to a record by its byte offset goes stale the moment a neighbour moves it.</p>`,
        },
        {
          type: "idea",
          html: `<p>Add a level of indirection inside the page. A small array of fixed-size <strong>offsets</strong> (slots) at the start of the page points to the <strong>cells</strong> that hold the actual data at the end. The two regions grow toward each other, with free space in the middle. Order lives in the offset array; data never has to move to change it.</p>`,
        },
        {
          type: "diagram",
          title: "Anatomy of a slotted page",
          caption: "Records were inserted as Mia, Ben, Zoe, so their cells sit in that order from the end of the page. The offset array is kept sorted by key: slot 0 points to Ben, slot 1 to Mia, slot 2 to Zoe.",
          svg: `<svg viewBox="0 0 620 190" role="img" aria-label="A slotted page with a header, a sorted offset array, free space and cells stored from the end">
<defs><marker id="di3-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-ink)"/></marker></defs>
<rect x="20" y="40" width="580" height="80" rx="4" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<rect x="20" y="40" width="76" height="80" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="58" y="85" text-anchor="middle" font-size="12">header</text>
<rect x="96" y="40" width="30" height="80" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/><text x="111" y="85" text-anchor="middle" font-size="12">0</text>
<rect x="126" y="40" width="30" height="80" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/><text x="141" y="85" text-anchor="middle" font-size="12">1</text>
<rect x="156" y="40" width="30" height="80" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/><text x="171" y="85" text-anchor="middle" font-size="12">2</text>
<text x="283" y="74" text-anchor="middle" font-size="12">free space</text>
<text x="283" y="96" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">slots grow →   ← cells grow</text>
<rect x="380" y="40" width="70" height="80" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/><text x="415" y="85" text-anchor="middle" font-size="12">Zoe</text>
<rect x="450" y="40" width="70" height="80" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/><text x="485" y="85" text-anchor="middle" font-size="12">Ben</text>
<rect x="520" y="40" width="80" height="80" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/><text x="560" y="85" text-anchor="middle" font-size="12">Mia</text>
<path d="M141 40 V22 H560 V36" fill="none" stroke-width="1.5" style="stroke: var(--dg-ink)" marker-end="url(#di3-arrow)"/>
<path d="M111 120 V166 H485 V124" fill="none" stroke-width="1.5" style="stroke: var(--dg-ink)" marker-end="url(#di3-arrow)"/>
<path d="M171 120 V148 H415 V124" fill="none" stroke-width="1.5" style="stroke: var(--dg-ink)" marker-end="url(#di3-arrow)"/>
<text x="20" y="184" font-size="12" style="fill: var(--dg-muted)">slots (sorted by key)</text>
<text x="600" y="184" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">cells (insertion order)</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>Look at what each operation now costs. <strong>Insert</strong>: write the new cell into free space at the cell end, then insert a 2-byte offset at the right position in the slot array; only the small offsets shift. <strong>Reorder</strong>: rearrange offsets, never cells. <strong>Delete</strong>: remove (or mark) the slot and remember that the cell's bytes are free. <strong>Reference from outside</strong>: refer to a record by page ID plus slot number, which stays valid even if the cell moves within the page during defragmentation, because only the slot's offset changes.</p>
<p>Binary search works on the offset array: read the middle slot, follow its offset to the cell, compare keys, repeat. The cells themselves never need to be physically sorted.</p>`,
        },
        {
          type: "lab",
          id: "slottedPage",
          caption: "Insert records into a 512-byte slotted page and watch cells fill from the end while the offset array stays sorted. Delete some, reinsert with first fit or best fit, and trigger defragmentation.",
        },
        {
          type: "realworld",
          items: [
            { org: "PostgreSQL", title: "Line pointers and tuples", html: "A PostgreSQL page has a 24-byte header, then an array of 4-byte line pointers growing forward, then free space, then tuples stored from the end, with an optional special area at the very end used by index pages. A tuple's ID is its block number plus line pointer number." },
            { org: "SQLite", title: "Cell pointer array", html: "SQLite B-Tree pages have a page header followed by a cell pointer array, sorted by key, with cell content packed from the end of the page toward the middle." },
            { org: "MySQL InnoDB", title: "A different trade-off", html: "InnoDB keeps the records in a page as a singly linked list in key order, plus a sparse page directory whose slots point at every few records. A search binary-searches the directory and then walks a short stretch of the list." },
          ],
        },
        {
          type: "quiz",
          q: "A slotted page holds records sorted by key. You insert a new record whose key belongs in the middle. What physically moves?",
          options: [
            "Every cell with a larger key shifts to make room",
            "Only the 2-byte offsets after the insertion point shift; the new cell is written into free space",
            "The whole page is rewritten in sorted order",
            "Nothing moves; the record goes to an overflow page",
          ],
          answer: 1,
          explain: "The cell goes into the free space next to the existing cells, in whatever position is free. Logical order is maintained by inserting its offset at the right index in the slot array, which shifts only a few small offsets.",
        },
      ],
    },
    {
      id: "cells-and-free-space",
      title: "Cell layout and managing free space",
      kicker: "Inside the page",
      blocks: [
        {
          type: "text",
          html: `<p>B-Tree pages hold two kinds of cells. <strong>Key cells</strong>, in internal nodes, contain a separator key and the ID of the child page. <strong>Key-value cells</strong>, in leaves, contain a key and its data record. Because all cells in a page are the same kind, the kind is recorded once in the page header rather than in every cell.</p>
<p>A variable-size cell carries a small header of its own: some flags, the key size and the value size, followed by the key bytes and the value bytes. Given a cell's offset, a reader can find its key by skipping the fixed header and its value by skipping the key, again pure arithmetic.</p>`,
        },
        {
          type: "text",
          html: `<h3>Reusing deleted space</h3>
<p>Deleting a cell doesn't erase or compact anything. The engine records the freed segment, its offset and size, in an <strong>availability list</strong> (freelist) kept in the page. A later insert first looks there for a segment that fits. Two classic strategies decide which one:</p>
<ul>
<li><strong>First fit</strong> takes the first segment that is large enough. It's fast, but can carve a big segment into a useful piece and a leftover too small to use.</li>
<li><strong>Best fit</strong> takes the segment that leaves the smallest remainder. It wastes less, but must scan the whole list.</li>
</ul>`,
        },
        {
          type: "table",
          title: "Worked example: free segments of 40, 120 and 64 bytes",
          headers: ["Step", "First fit", "Best fit"],
          rows: [
            ["Insert a 60-byte cell", "Takes the 120 segment (first that fits); free: 40, 60, 64", "Takes the 64 segment (smallest leftover); free: 40, 120, 4"],
            ["Then insert a 100-byte cell", "No segment fits, although 164 bytes are free in total: defragment the page first", "Takes the 120 segment; free: 40, 20, 4"],
          ],
          note: "Neither strategy wins every sequence: best fit kept a large segment intact here, but it also left a 4-byte sliver that no cell will ever use.",
        },
        {
          type: "steps",
          title: "When an insert doesn't fit",
          items: [
            "Try the availability list (first fit or best fit).",
            "If no single segment is big enough but the total free space is, <strong>defragment</strong>: rewrite the live cells contiguously at the end of the page and update their offsets. Slot numbers don't change, so external references stay valid.",
            "If even the total free space is too small, the page is genuinely full: the B-Tree splits the node, or the value spills into an <strong>overflow page</strong> (Chapter 4).",
          ],
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>Defragmentation is cheap compared with most disk work, since it happens entirely in memory on a page that is already loaded, but it dirties the page, so the page must be written back. Engines usually defragment lazily, only when an insert needs contiguous space.</p>`,
        },
        {
          type: "quiz",
          q: "A page has 300 free bytes spread across six small segments, and an insert needs a contiguous 150 bytes. What should happen?",
          options: [
            "Split the B-Tree node immediately",
            "Defragment the page, then insert",
            "Reject the insert",
            "Allocate an overflow page for the whole page",
          ],
          answer: 1,
          explain: "There is enough free space in total, it is just fragmented. Rewriting the live cells contiguously frees a 300-byte run, and the insert fits. Splitting would add a page and a separator for no reason.",
        },
      ],
    },
    {
      id: "versioning-checksums",
      title: "Versioning and checksums",
      kicker: "Living with change and damage",
      blocks: [
        {
          type: "text",
          html: `<p>Formats evolve: a new release adds a header field or changes how cells are encoded. Old files don't rewrite themselves on upgrade, so the new binary must recognize which format a file uses and decode it accordingly. That requires a <strong>version identifier</strong> stored with the data. Engines put it in different places: in the file name, in a separate file next to the data, or in the file header.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Apache Cassandra", title: "Version in the file name", html: "Each SSTable file name starts with a short format version (for example <code>ma</code> or <code>nb</code>), so a node can read tables written by older releases and pick the right decoder before opening the file." },
            { org: "PostgreSQL", title: "A separate file", html: "A PostgreSQL data directory contains a <code>PG_VERSION</code> file with the major version that created it; the server refuses to start on a directory from a different major version." },
          ],
        },
        {
          type: "text",
          html: `<h3>Detecting corruption</h3>
<p>Bits rot, firmware has bugs, a write can be torn halfway by a power cut, and software can scribble over the wrong page. The worst outcome is silent: a damaged page is read, trusted, and its garbage propagated into indexes, replicas and backups. So engines compute a <strong>checksum</strong> over each page when writing it, store it in the page header, and verify it on every read.</p>
<p>The weakest checks are a plain sum or XOR of the bytes. They are cheap but blind to common patterns. Swapping two bytes leaves a sum unchanged. Flipping the same bit in two different bytes leaves an XOR unchanged. A <strong>cyclic redundancy check</strong> (CRC) treats the data as a polynomial and divides it by a fixed generator; it is designed to catch <strong>burst errors</strong>, runs of consecutive corrupted bits, which is what real storage and transmission failures tend to produce. A 32-bit CRC detects every burst up to 32 bits long.</p>`,
        },
        {
          type: "lab",
          id: "checksum",
          caption: "Corrupt a 16-byte page in different ways (single bit flips, swapped bytes, bursts) and see which of sum, XOR and CRC notice. Then run 2,000 random trials to compare detection rates.",
        },
        {
          type: "realworld",
          items: [
            { org: "MySQL InnoDB", title: "CRC-32 page checksums", html: "InnoDB stores a checksum in every page and verifies it when the page is read; the default algorithm in modern versions is <code>crc32</code>." },
            { org: "PostgreSQL", title: "Page and WAL checks", html: "With data checksums enabled, PostgreSQL keeps a 16-bit checksum in each data page header. WAL records are separately protected by CRC-32C." },
            { org: "RocksDB", title: "Per-block checksums", html: "Every block in a RocksDB SST file carries a checksum (CRC32c or one of several xxHash variants, configurable) that is verified when the block is read." },
          ],
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p>Checksums and CRCs detect accidents, not attacks. Anyone who can modify a page can recompute its CRC. Protecting against deliberate tampering needs cryptographic hashes or MACs, which are far more expensive and rarely used at page level.</p>`,
        },
        {
          type: "quiz",
          q: "Two bytes of a page get swapped by a buggy copy routine. Which check is guaranteed to miss it?",
          options: ["A CRC-32", "A plain sum of all bytes", "Both would always miss it", "Neither could miss it"],
          answer: 1,
          explain: "Addition doesn't care about order, so swapping two bytes leaves the sum unchanged. A CRC depends on each byte's position, so a swap changes it (except in vanishingly unlikely cases).",
        },
      ],
    },
    {
      id: "interview",
      title: "File formats in an interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "text",
          html: `<p>Interviewers who ask about storage internals often probe one level below the B-Tree diagram: "how is a variable-length row stored in a page?", "what happens to space when you delete a row?", "how would you detect a corrupted page?". These are short questions with crisp, mechanical answers, and they are a good way to show you understand what is actually on disk.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>Key points to have ready:</p>
<ol>
<li><strong>Slotted pages</strong>: header, sorted offset array from the front, cells from the back, free space in the middle. Order lives in the offsets, so inserts and reorders move only small pointers, and records are addressed by (page, slot).</li>
<li><strong>Deletes</strong>: mark the cell free and add it to the page's availability list; reuse by first fit or best fit; defragment when space is fragmented; split or overflow when it is truly full.</li>
<li><strong>Records</strong>: fixed-size fields first, lengths of variable fields in the fixed part, length-prefixed strings, so field positions are computable.</li>
<li><strong>Integrity and evolution</strong>: a per-page CRC verified on read; a format version in the file name, a side file or the header.</li>
</ol>`,
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Saying a delete "frees the space" is imprecise. The bytes stay in the page until they are reused or the page is defragmented, and the page itself is not returned to the file's free page list unless it becomes empty and the engine merges or vacuums it. This is why deleting rows rarely shrinks a database file on its own.</p>`,
        },
        {
          type: "quiz",
          q: "Why does a slotted page let other pages refer to a record by (page ID, slot number) rather than by (page ID, byte offset)?",
          options: [
            "Slot numbers are smaller to store",
            "Cells can move within the page (for example during defragmentation) while the slot number stays the same; only the slot's offset changes",
            "Byte offsets cannot be stored on disk",
            "Slot numbers are globally unique across the file",
          ],
          answer: 1,
          explain: "The slot array is a level of indirection inside the page. Defragmentation can relocate a cell to any byte position and simply update its slot, so every external reference by slot number stays valid.",
        },
      ],
    },
  ],
  takeaways: [
    "On disk there is no allocator or garbage collector: a file format is manual memory management, with layout decisions that persist.",
    "Fix a byte order and stick to it; prefer length-prefixed strings; pack booleans as bit flags (set with OR, clear with AND NOT, test with AND).",
    "Make positions computable: same-size pages (offset = page ID &times; page size), fixed-size fields first, and lengths of variable fields stored in the fixed part.",
    "The slotted page (header, sorted offset array, free space, cells from the end) handles variable-size records, keeps order by moving only offsets, and gives records stable (page, slot) addresses.",
    "Deleted cells go on an availability list; inserts reuse them by first fit (fast) or best fit (less waste); defragment when space is fragmented, split or overflow when it is truly full.",
    "Store a format version (in the file name, a side file or the header) so upgrades can read old files.",
    "Store a per-page CRC and verify it on read: sums and XOR miss swaps and cancelling bit flips, while CRCs catch burst errors.",
  ],
  furtherReading: [
    { title: "SQLite Database File Format", url: "https://www.sqlite.org/fileformat.html", note: "The file header, B-Tree page layout, cell formats and varints, all precisely specified." },
    { title: "PostgreSQL documentation: Database Page Layout", url: "https://www.postgresql.org/docs/current/storage-page-layout.html", note: "The page header, line pointer array and tuple layout of a real slotted page." },
  ],
};
