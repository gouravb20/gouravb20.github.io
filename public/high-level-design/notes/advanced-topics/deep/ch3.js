// Deep dive: Chapter 3, Bloom filters: probabilistic set membership. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch3 = {
  hook: `<p>This chapter explains how a Bloom filter answers "have I seen this?" in a fraction of the memory of an exact set, by allowing occasional false "yes" answers but never a false "no". That trade is the model for every probabilistic structure in this part.</p>`,
  sections: [
    {
      id: "why-probabilistic",
      title: "When exact sets get too big",
      kicker: "The problem",
      blocks: [
        {
          type: "text",
          html: `<p>An exact set's memory grows with item count <em>and</em> key size. Probabilistic structures accept a small, <strong>bounded, one-sided</strong> error for much less memory. A Bloom filter for a billion items at 1% false positives needs about 1.2 GB, whether keys are 16-byte IDs or 2 KB documents, because it never stores keys. For a crawler's 10 billion seen URLs (around 800 GB as strings), that's about 12 GB.</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "Exact set (hash set, Redis set)", tone: "info", html: "Correct yes or no. Memory grows with count and key size. Supports deletes, listing and counting. The right default up to tens of millions of items." },
            { title: "Bloom filter", tone: "ok", html: "Answers <strong>definitely not</strong> or <strong>probably yes</strong>. About 10 bits per item for 1%, whatever the key size. No deletes or listing. Worth it at billions, or where each saved lookup is a disk read." },
          ],
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Using a Bloom filter for a small set. Ten million 16-byte IDs fit in a few hundred megabytes in a hash set, exact and deletable. Justify it with item count, memory budget and the cost of the lookup it saves.</p>`,
        },
      ],
    },
    {
      id: "how-it-works",
      title: "A bit array and k hash functions",
      kicker: "How it works",
      blocks: [
        {
          type: "idea",
          html: `<p>Start with m zero bits and k hash functions. <strong>Add</strong> sets an item's k bits to 1. <strong>Check</strong> reads them: any 0 means never added; all 1 means probably added.</p>`,
        },
        {
          type: "keypoints",
          items: [
            "<strong>False positives:</strong> bits are shared, so a new item's k bits may all have been set by others.",
            "<strong>No false negatives, ever:</strong> bits only go from 0 to 1, so an added item always finds its bits set.",
            "Both operations cost k hashes and k memory reads, regardless of how many items are stored.",
          ],
        },
        {
          type: "diagram",
          title: "Two inserts, one true negative, one false positive",
          caption: "With k = 3, alice and bob set five bits. dave hits two zeros, so he was definitely never added. carol was never added either, but her three bits were all set by alice and bob, so the filter wrongly says \"maybe\".",
          svg: `<svg viewBox="0 0 620 300" role="img" aria-label="A 16-bit Bloom filter with two inserted names and two lookups">
<defs><marker id="at3-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="110" y="22" width="80" height="28" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="150" y="41" text-anchor="middle" font-size="13" font-weight="700">add alice</text>
<rect x="360" y="22" width="80" height="28" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="400" y="41" text-anchor="middle" font-size="13" font-weight="700">add bob</text>
<g stroke-width="2">
<line x1="140" y1="50" x2="128" y2="126" style="stroke: var(--dg-1)" marker-end="url(#at3-arrow)"/>
<line x1="160" y1="50" x2="282" y2="126" style="stroke: var(--dg-1)" marker-end="url(#at3-arrow)"/>
<line x1="180" y1="50" x2="476" y2="126" style="stroke: var(--dg-1)" marker-end="url(#at3-arrow)"/>
<line x1="380" y1="50" x2="196" y2="126" style="stroke: var(--dg-2)" marker-end="url(#at3-arrow)"/>
<line x1="400" y1="50" x2="294" y2="126" style="stroke: var(--dg-2)" marker-end="url(#at3-arrow)"/>
<line x1="420" y1="50" x2="416" y2="126" style="stroke: var(--dg-2)" marker-end="url(#at3-arrow)"/>
</g>
<g style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5">
<rect x="48" y="130" width="32" height="32"/><rect x="80" y="130" width="32" height="32"/><rect x="144" y="130" width="32" height="32"/>
<rect x="208" y="130" width="32" height="32"/><rect x="240" y="130" width="32" height="32"/><rect x="304" y="130" width="32" height="32"/>
<rect x="336" y="130" width="32" height="32"/><rect x="368" y="130" width="32" height="32"/><rect x="432" y="130" width="32" height="32"/>
<rect x="496" y="130" width="32" height="32"/><rect x="528" y="130" width="32" height="32"/>
</g>
<g style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="1.5">
<rect x="112" y="130" width="32" height="32"/><rect x="176" y="130" width="32" height="32"/><rect x="272" y="130" width="32" height="32"/>
<rect x="400" y="130" width="32" height="32"/><rect x="464" y="130" width="32" height="32"/>
</g>
<g font-size="13" text-anchor="middle">
<text x="64" y="151">0</text><text x="96" y="151">0</text><text x="128" y="151" font-weight="700">1</text><text x="160" y="151">0</text>
<text x="192" y="151" font-weight="700">1</text><text x="224" y="151">0</text><text x="256" y="151">0</text><text x="288" y="151" font-weight="700">1</text>
<text x="320" y="151">0</text><text x="352" y="151">0</text><text x="384" y="151">0</text><text x="416" y="151" font-weight="700">1</text>
<text x="448" y="151">0</text><text x="480" y="151" font-weight="700">1</text><text x="512" y="151">0</text><text x="544" y="151">0</text>
</g>
<g stroke-width="2" stroke-dasharray="5 4">
<line x1="130" y1="236" x2="96" y2="166" style="stroke: var(--dg-ok)" marker-end="url(#at3-arrow)"/>
<line x1="150" y1="236" x2="192" y2="166" style="stroke: var(--dg-ok)" marker-end="url(#at3-arrow)"/>
<line x1="170" y1="236" x2="224" y2="166" style="stroke: var(--dg-ok)" marker-end="url(#at3-arrow)"/>
<line x1="400" y1="236" x2="292" y2="166" style="stroke: var(--dg-bad)" marker-end="url(#at3-arrow)"/>
<line x1="420" y1="236" x2="416" y2="166" style="stroke: var(--dg-bad)" marker-end="url(#at3-arrow)"/>
<line x1="440" y1="236" x2="476" y2="166" style="stroke: var(--dg-bad)" marker-end="url(#at3-arrow)"/>
</g>
<rect x="100" y="236" width="100" height="28" rx="6" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="150" y="255" text-anchor="middle" font-size="13" font-weight="700">check dave</text>
<rect x="370" y="236" width="100" height="28" rx="6" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)" stroke-width="2"/>
<text x="420" y="255" text-anchor="middle" font-size="13" font-weight="700">check carol</text>
<text x="150" y="286" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">two zeros: definitely not</text>
<text x="420" y="286" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">all ones: "maybe" (false positive)</text>
</svg>`,
        },
        {
          type: "lab",
          id: "bloomFilter",
          caption: "Top: add names to a 32-bit filter with 3 hash functions and check others; look for a name that was never added but reports \"probably\". Bottom: pick a size and bits per item, then compare the measured false-positive rate with the formula.",
        },
        {
          type: "quiz",
          q: "A Bloom filter says an item is NOT in the set. How confident can you be?",
          options: [
            "About 99%, depending on the false-positive rate",
            "Completely: at least one of its bits is 0, and bits are never cleared, so it was never added",
            "It depends on how full the filter is",
            "Not at all; you must always confirm with the database",
          ],
          answer: 1,
          explain: "Adding an item sets all k of its bits and nothing ever clears them. A zero among an item's bits proves it was never added. Uncertainty exists only on the \"maybe\" side.",
        },
      ],
    },
    {
      id: "the-math",
      title: "Sizing it: the false-positive formula",
      kicker: "The numbers",
      blocks: [
        {
          type: "text",
          html: `<p>After n items hashed k times into m bits, a bit is still 0 with probability about e<sup>&minus;kn/m</sup>, and a false positive needs all k bits set:</p>
<p><span class="formula">p &asymp; (1 &minus; e<sup>&minus;kn/m</sup>)<sup>k</sup></span></p>
<p>The best k is <code>(m / n) &middot; ln 2 &asymp; 0.69 &middot; m/n</code>, which leaves half the bits set and gives the sizing rule:</p>
<p><span class="formula">m / n = &minus;ln p / (ln 2)<sup>2</sup> &asymp; 1.44 &middot; log<sub>2</sub>(1/p) bits per item</span></p>`,
        },
        {
          type: "table",
          title: "Bits per item, optimal k and the resulting rate",
          headers: ["Bits per item", "Best k", "False-positive rate", "Memory for 1 billion items"],
          rows: [
            ["4.8", "3", "~10%", "600 MB"],
            ["9.6", "7", "~1%", "1.2 GB"],
            ["14.4", "10", "~0.1%", "1.8 GB"],
            ["19.2", "13", "~0.01%", "2.4 GB"],
          ],
          note: "Memory grows linearly while the error falls exponentially: each 4.8 extra bits per item cuts it tenfold.",
        },
        {
          type: "keypoints",
          items: [
            "<strong>Worked example:</strong> 100 million usernames at 1% is 9.59 bits each, about 959 million bits (<strong>120 MB</strong>), k = 7. Ninety-nine of every hundred free names get a definite \"available\" with no database query.",
            "<strong>Two hashes are enough</strong> (Kirsch and Mitzenmacher, 2006): position i = <code>(h1 + i &middot; h2) mod m</code>, usually with MurmurHash or xxHash.",
          ],
        },
        {
          type: "code",
          lang: "python",
          title: "A Bloom filter in a few lines",
          code: `import math, mmh3

class Bloom:
    def __init__(self, n, p):
        self.m = math.ceil(-n * math.log(p) / math.log(2) ** 2)   # bits
        self.k = max(1, round(self.m / n * math.log(2)))          # hashes
        self.bits = bytearray((self.m + 7) // 8)

    def _positions(self, item):
        h1, h2 = mmh3.hash(item, 0), mmh3.hash(item, 1)
        return [(h1 + i * h2) % self.m for i in range(self.k)]

    def add(self, item):
        for i in self._positions(item):
            self.bits[i // 8] |= 1 << (i % 8)

    def maybe_contains(self, item):
        return all(self.bits[i // 8] >> (i % 8) & 1 for i in self._positions(item))`,
        },
      ],
    },
    {
      id: "limits-and-where-used",
      title: "Limits, variants and where filters earn their keep",
      kicker: "Real systems",
      blocks: [
        {
          type: "keypoints",
          items: [
            "<strong>Saturation is fast:</strong> a filter sized for 1 million at 1% hits about 16% false positives at 2 million and 43% at 3 million. It can't grow in place (positions depend on m, and keys aren't stored), so size for growth, rebuild from the source of truth, or keep one filter per day or hour.",
            "<strong>Deletion breaks the guarantee:</strong> clearing alice's bits can zero a bit bob shares, creating a false negative.",
            "Variants: a <strong>counting Bloom filter</strong> (4-bit counters, about 4x memory) supports deletes; a <strong>cuckoo filter</strong> (2014) stores fingerprints, deletes, and uses similar space at low error rates; a <strong>scalable Bloom filter</strong> (2007) stacks larger, stricter filters as each fills.",
          ],
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p>Delete from a counting or cuckoo filter only what your source of truth confirms was inserted. Deleting a false positive removes someone else's entry and creates false negatives.</p>`,
        },
        {
          type: "text",
          html: `<p>The pattern: a cheap in-memory check in front of an expensive lookup, where most lookups are for absent things. The biggest use is in <strong>LSM-tree</strong> engines: each immutable SSTable carries an in-memory filter, so a point read only touches files that answer "maybe".</p>`,
        },
        {
          type: "diagram",
          title: "An LSM point read skips files with Bloom filters",
          caption: "Reading key k: the memtable misses, then each SSTable's in-memory filter is checked. Only the file that answers \"maybe\" is read from disk.",
          svg: `<svg viewBox="0 0 640 250" role="img" aria-label="A point read checking a memtable then four SSTables, each guarded by a Bloom filter">
<defs><marker id="at3-arrow2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="20" y="40" width="90" height="44" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="65" y="60" text-anchor="middle" font-size="13" font-weight="700">get(k)</text>
<text x="65" y="76" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">memtable: miss</text>
<line x1="110" y1="62" x2="140" y2="62" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#at3-arrow2)"/>
<g font-size="12" text-anchor="middle">
<rect x="145" y="40" width="100" height="44" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="195" y="58">filter 1</text><text x="195" y="76" style="fill: var(--dg-ok)">no</text>
<rect x="265" y="40" width="100" height="44" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="315" y="58">filter 2</text><text x="315" y="76" style="fill: var(--dg-ok)">no</text>
<rect x="385" y="40" width="100" height="44" rx="6" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="2"/>
<text x="435" y="58">filter 3</text><text x="435" y="76" font-weight="700">maybe</text>
<rect x="505" y="40" width="100" height="44" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="555" y="58">filter 4</text><text x="555" y="76" style="fill: var(--dg-ok)">no</text>
</g>
<line x1="245" y1="62" x2="260" y2="62" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#at3-arrow2)"/>
<line x1="365" y1="62" x2="380" y2="62" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#at3-arrow2)"/>
<line x1="485" y1="62" x2="500" y2="62" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#at3-arrow2)"/>
<line x1="20" y1="112" x2="620" y2="112" stroke-width="1.5" stroke-dasharray="6 4" style="stroke: var(--dg-line)"/>
<text x="24" y="104" font-size="12" style="fill: var(--dg-muted)">memory</text>
<text x="24" y="132" font-size="12" style="fill: var(--dg-muted)">disk</text>
<g font-size="12" text-anchor="middle">
<rect x="145" y="150" width="100" height="44" rx="4" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-dasharray="4 3"/>
<text x="195" y="177" style="fill: var(--dg-muted)">SSTable 1</text>
<rect x="265" y="150" width="100" height="44" rx="4" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-dasharray="4 3"/>
<text x="315" y="177" style="fill: var(--dg-muted)">SSTable 2</text>
<rect x="385" y="150" width="100" height="44" rx="4" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="2"/>
<text x="435" y="177" font-weight="700">SSTable 3</text>
<rect x="505" y="150" width="100" height="44" rx="4" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-dasharray="4 3"/>
<text x="555" y="177" style="fill: var(--dg-muted)">SSTable 4</text>
</g>
<line x1="435" y1="84" x2="435" y2="145" stroke-width="2.5" style="stroke: var(--dg-4)" marker-end="url(#at3-arrow2)"/>
<text x="320" y="228" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">One disk read instead of four; dashed files are never touched</text>
</svg>`,
        },
        {
          type: "list",
          title: "Where they're used",
          items: [
            "<strong>RocksDB, Cassandra, HBase:</strong> per-file filters (RocksDB commonly 10 bits per key, roughly 1%; Cassandra's <code>bloom_filter_fp_chance</code> per table).",
            "<strong>Akamai:</strong> admit an object to CDN caches only on its second request, since many objects are requested once.",
            "<strong>RedisBloom:</strong> <code>BF.RESERVE</code>, <code>BF.ADD</code>, <code>BF.EXISTS</code>; grows as a scalable filter so many app servers share one.",
            "<strong>Crawlers, username checks, distributed joins</strong> (ship one side's key filter to drop non-matching rows) and <strong>known-bad lists</strong> where \"maybe\" triggers an exact check.",
          ],
        },
      ],
    },
    {
      id: "interview",
      title: "Using Bloom filters in a design interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "callout",
          tone: "interview",
          html: `<p>They come up in crawlers, URL shorteners, "already seen" feeds and LSM discussions, and as a trap when a plain set would do. A strong answer covers:</p>
<ol>
<li><strong>Semantics:</strong> "definitely not" or "probably yes"; no false negatives, tunable false positives, no deletes.</li>
<li><strong>Sizing:</strong> about 9.6 bits per item and 7 hashes for 1%, plus 4.8 bits per item per further factor of ten. Do the arithmetic for your n.</li>
<li><strong>Placement:</strong> in front of an exact store, so a false positive costs a lookup, not a wrong answer.</li>
<li><strong>Lifecycle:</strong> it saturates and can't grow: size for growth, rebuild, time-partition, or use a scalable or cuckoo variant.</li>
</ol>`,
        },
        {
          type: "tradeoffs",
          title: "Should this design use a Bloom filter?",
          prosLabel: "Good signs",
          consLabel: "Warning signs",
          pros: [
            "Billions of items, or a strict memory budget",
            "Most lookups are for items that are absent",
            "A false positive only costs a follow-up check or a skipped item",
          ],
          cons: [
            "A few million items: a hash set is simpler and exact",
            "Items must be deleted, listed or counted",
            "A false positive causes real harm and there is no exact store to confirm against",
          ],
        },
        {
          type: "quiz",
          q: "A news feed uses a Bloom filter per user to avoid showing posts they've already seen. Users report that some new posts never appear. What's happening, and what's a reasonable fix?",
          options: [
            "False negatives: switch to a counting Bloom filter",
            "False positives: some unseen posts look \"seen\". Size the filter for the user's real history, or rotate time-partitioned filters so old ones stop filling it",
            "Hash collisions in the database; add an index",
            "The filter is too large; shrink it to reduce errors",
          ],
          answer: 1,
          explain: "A Bloom filter never misses a post that was added, so the missing posts are false positives, which grow quickly as a filter fills past its design size. Heavy users saturate fixed-size filters first. Size per user, or keep one filter per week and drop old ones.",
        },
      ],
    },
  ],
  takeaways: [
    "A Bloom filter is m bits plus k hashes: any zero means <strong>definitely not</strong>, all ones means <strong>probably yes</strong>, and there are no false negatives.",
    "About 9.6 bits per item gives 1% false positives (best k = (m/n) ln 2), with 4.8 more bits per further factor of ten; memory never depends on key size.",
    "It sits in front of an exact store, so a false positive costs a lookup, not a wrong answer.",
    "It saturates and can't be resized or have items removed; use rebuilds, time partitions, or scalable, counting or cuckoo filters.",
    "Its biggest production use is skipping SSTables in LSM engines; justify any other use with an item count a plain set can't handle.",
  ],
  furtherReading: [
    { title: "Space/Time Trade-offs in Hash Coding with Allowable Errors (Burton H. Bloom, CACM 1970)", note: "The original paper." },
    { title: "Less Hashing, Same Performance: Building a Better Bloom Filter (Kirsch and Mitzenmacher, 2006)", note: "Why two hash functions are enough." },
    { title: "Cuckoo Filter: Practically Better Than Bloom (Fan, Andersen, Kaminsky and Mitzenmacher, CoNEXT 2014)", note: "Fingerprints in a cuckoo hash table, with deletion." },
    { title: "RocksDB wiki: RocksDB Bloom Filter", url: "https://github.com/facebook/rocksdb/wiki/RocksDB-Bloom-Filter", note: "How a production LSM engine sizes and uses per-file filters." },
  ],
};
