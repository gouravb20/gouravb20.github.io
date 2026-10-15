// Deep dive: Chapter 3, Bloom filters: probabilistic set membership. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch3 = {
  hook: `<p>Your web crawler has already fetched 10 billion pages. Before it downloads the next link it must ask one question: <em>have I seen this URL before?</em> An exact answer means keeping every URL you have ever seen. At around 80 bytes per URL that is 800 GB of strings before any hash-table overhead, and the check sits on the hot path of every fetch.</p>
<p>Now relax the requirement slightly. Suppose the answer may occasionally say "seen it" for a URL you have not seen, and you skip one new page in a hundred, but it must never say "new" for a page you already crawled. With that one concession, the whole seen-set fits in about <strong>12 GB</strong> of RAM, a 60-fold saving, and each check costs a handful of memory reads. That structure is a Bloom filter, and the trade it makes is the model for every probabilistic structure in this part of the book.</p>`,
  sections: [
    {
      id: "why-probabilistic",
      title: "When exact sets get too big",
      kicker: "The problem",
      blocks: [
        {
          type: "problem",
          html: `<p>An exact set has to store each member, or at least enough of it to tell members apart. Its memory grows with both the number of items and the size of each key, plus the overhead of the hash table itself. At billions of items, or on a hot path where a disk or network lookup is too slow, that cost decides the design.</p>`,
        },
        {
          type: "text",
          html: `<p>Probabilistic data structures accept a small, <strong>bounded and one-sided</strong> error in return for memory that is fixed or much smaller. The key word is one-sided. A Bloom filter can be wrong in only one direction: it may claim an item is present when it is not, but it never claims an item is absent when it was added. That asymmetry is what makes it safe to put in front of a slower exact store.</p>
<p>A quick sense of scale: a hash set of 1 billion 16-byte IDs needs tens of gigabytes once pointers, padding and load factor are counted. A Bloom filter for the same billion items at a 1% false-positive rate needs about 1.2 GB, and the figure would be the same if each key were a 2 KB document, because the filter never stores the key at all.</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "Exact set (hash set, Redis set)", tone: "info", html: "Answers yes or no correctly. Memory grows with item count <em>and</em> key size. Supports deletes, listing members and counting them. The right default up to tens of millions of items." },
            { title: "Bloom filter", tone: "ok", html: "Answers <strong>definitely not</strong> or <strong>probably yes</strong>. About 10 bits per item for 1% false positives, whatever the key size. No deletes, no listing. Worth it at billions, or where every lookup saved is a disk read avoided." },
          ],
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Reaching for a Bloom filter when the set is small. Ten million 16-byte IDs fit in a few hundred megabytes in a hash set or a Redis set, with no false positives and full delete support. Justify a probabilistic structure with a number: item count, memory budget and the cost of a lookup it saves.</p>`,
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
          html: `<p>Start with m bits, all zero, and pick k hash functions that each map an item to one of the m positions. To <strong>add</strong> an item, set its k bits to 1. To <strong>check</strong> an item, look at its k bits: if any of them is 0, the item was never added. If all are 1, it probably was.</p>`,
        },
        {
          type: "text",
          html: `<p>Why "probably"? Bits are shared. Every item sets k of them, and after enough inserts a fresh item's k positions may all have been switched on by <em>other</em> items. The filter cannot tell whose bits they are, so it says "maybe". That is a <strong>false positive</strong>.</p>
<p>The reverse can never happen. Bits only ever go from 0 to 1, so once an item has set its k bits they stay set. Checking that same item later always finds all k bits at 1: <strong>no false negatives</strong>, ever. Both operations cost exactly k hash computations and k memory reads, independent of how many items are in the filter.</p>`,
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
          html: `<p>The false-positive rate depends on three numbers: m bits, n items and k hash functions. The derivation is short enough to do on a whiteboard.</p>
<p>One hash of one insert misses a given bit with probability 1 &minus; 1/m. After n items, each hashed k times, the bit is still 0 with probability (1 &minus; 1/m)<sup>kn</sup>, which is very close to e<sup>&minus;kn/m</sup>. A false positive needs all k bits of a new item to be 1:</p>
<p><span class="formula">p &asymp; (1 &minus; e<sup>&minus;kn/m</sup>)<sup>k</sup></span></p>`,
        },
        {
          type: "text",
          html: `<h3>Choosing k</h3>
<p>Too few hash functions and each check looks at too few bits to rule items out. Too many and every insert sets so many bits that the array fills up. The minimum sits at</p>
<p><span class="formula">k<sub>opt</sub> = (m / n) &middot; ln 2 &asymp; 0.69 &middot; m/n</span></p>
<p>At that k, exactly half the bits end up set, and the false-positive rate becomes p = (1/2)<sup>k</sup>. Turning it around gives the sizing rule you actually use:</p>
<p><span class="formula">m / n = &minus;ln p / (ln 2)<sup>2</sup> &asymp; 1.44 &middot; log<sub>2</sub>(1/p) bits per item</span></p>
<p>For p = 1%, that is 1.44 &times; 6.64 &asymp; <strong>9.6 bits per item</strong> with k = 7. Each further tenfold cut in p costs another 1.44 &times; log<sub>2</sub> 10 &asymp; 4.8 bits per item.</p>`,
        },
        {
          type: "steps",
          title: "Worked example: 100 million usernames at 1%",
          items: [
            "Bits per item: &minus;ln(0.01) / (ln 2)<sup>2</sup> = 4.605 / 0.480 &asymp; 9.59.",
            "Total bits: 100,000,000 &times; 9.59 &asymp; 959 million bits, about <strong>120 MB</strong>.",
            "Hash functions: 9.59 &times; 0.693 &asymp; 6.6, so k = 7.",
            "Each signup check reads 7 bits. Ninety-nine of every hundred names not yet taken get a definite \"available\" with no database query; the rest go to the database to confirm.",
          ],
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
          type: "text",
          html: `<h3>You don't need k independent hash functions</h3>
<p>Computing seven good hashes per item would be wasteful. Kirsch and Mitzenmacher showed in 2006 that two hashes are enough: derive the i-th position as <code>(h1 + i &middot; h2) mod m</code>, and the false-positive rate is essentially unchanged. Most libraries do exactly this, usually with a fast non-cryptographic hash such as MurmurHash or xxHash.</p>`,
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
        {
          type: "quiz",
          q: "You need a 0.1% false-positive rate for 50 million items. Roughly how much memory does the Bloom filter need?",
          options: ["About 6 MB", "About 60 MB", "About 90 MB", "About 900 MB"],
          answer: 2,
          explain: "0.1% needs about 14.4 bits per item (9.6 for 1% plus 4.8 for one more factor of ten). 50 million &times; 14.4 = 720 million bits, which is 90 MB.",
        },
      ],
    },
    {
      id: "limits-and-variants",
      title: "Saturation, deletion and the variants that fix them",
      kicker: "Limits",
      blocks: [
        {
          type: "problem",
          html: `<p>A Bloom filter is sized for a fixed n. Keep inserting past it and more and more bits become 1, until nearly every check returns "maybe" and the filter filters nothing. And because bits are shared, you can't remove an item without risking damage to others.</p>`,
        },
        {
          type: "text",
          html: `<p><strong>Saturation is fast.</strong> Take a filter sized for 1 million items at 1% (9.6 bits per item, k = 7). Insert 2 million items and you are effectively at 4.8 bits per item with seven hashes: the formula gives about <strong>16%</strong>. At 3 million it is about <strong>43%</strong>. The filter does not grow in place, because every position depends on m; changing m means rehashing every item, and the filter does not store the items.</p>
<p>The usual fixes: size for expected growth up front; rebuild a bigger filter from the source of truth when a counter of inserts passes the design capacity; or partition by time, one filter per day or per hour, so old filters can simply be dropped and queries check the few recent ones.</p>`,
        },
        {
          type: "text",
          html: `<p><strong>Deletion breaks the guarantee.</strong> Suppose alice and bob share bit 7. Deleting alice by clearing her bits zeroes bit 7, and now a check for bob finds a 0 and reports "definitely not". The one promise a Bloom filter makes, no false negatives, is gone.</p>
<ul>
<li>A <strong>counting Bloom filter</strong> replaces each bit with a small counter (4 bits is the usual choice). Inserts increment, deletes decrement, and a position counts as set while its counter is above zero. It costs about four times the memory.</li>
<li>A <strong>cuckoo filter</strong> (Fan et al., 2014) stores short fingerprints of items in a cuckoo hash table. It supports deletion, and at low false-positive rates it uses about as much space as a Bloom filter, or less.</li>
<li>A <strong>scalable Bloom filter</strong> (Almeida et al., 2007) handles growth by adding a new, larger and slightly stricter filter whenever the current one fills, and checks all of them.</li>
</ul>`,
        },
        {
          type: "table",
          title: "Set-membership structures",
          headers: ["Structure", "False negatives", "False positives", "Delete", "Memory"],
          rows: [
            ["Hash set", "No", "No", "Yes", "Key size plus overhead per item"],
            ["Bloom filter", "No", "Yes, tunable", "No", "~10 bits per item for 1%"],
            ["Counting Bloom filter", "No", "Yes", "Yes", "~4x a Bloom filter"],
            ["Cuckoo filter", "No", "Yes", "Yes", "Similar to Bloom at low error rates"],
          ],
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p>Deletion in a cuckoo or counting filter is only safe for items that really were inserted. Deleting something that was never added (perhaps because of a false positive) decrements or removes someone else's entry and can create false negatives. Delete only what your source of truth confirms.</p>`,
        },
      ],
    },
    {
      id: "where-used",
      title: "Where Bloom filters earn their keep",
      kicker: "Real systems",
      blocks: [
        {
          type: "text",
          html: `<p>The pattern is always the same: a cheap in-memory check stands in front of an expensive lookup, and most lookups are for things that are not there. A "definitely not" short-circuits the expensive path; a "maybe" pays for it as before.</p>
<p>The most widespread use is inside storage engines built on <strong>log-structured merge trees</strong>. An LSM tree keeps data in many immutable sorted files (SSTables). A point read for a key that is in none of them, or in only one, would otherwise have to probe file after file. Each SSTable therefore carries a Bloom filter of its keys, kept in memory, and the read only touches files whose filter says "maybe".</p>`,
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
          type: "realworld",
          items: [
            { org: "RocksDB, Cassandra, HBase", title: "Per-file filters", html: "All three can attach a Bloom filter to each on-disk file. RocksDB configures it in bits per key (10 bits is a common setting, roughly 1%); Cassandra exposes <code>bloom_filter_fp_chance</code> per table, trading memory against wasted disk reads." },
            { org: "Akamai", title: "Cache on second hit", html: "Akamai has described using Bloom filters to admit an object into its CDN caches only on the second request. A large share of objects are requested once and never again; keeping them out leaves room for content that will be reused." },
            { org: "Redis Stack", title: "RedisBloom", html: "<code>BF.RESERVE key error_rate capacity</code> creates a filter, <code>BF.ADD</code> and <code>BF.EXISTS</code> use it. By default it grows like a scalable Bloom filter, stacking new sub-filters as each fills, so many app servers can share one filter." },
          ],
        },
        {
          type: "list",
          title: "Other good fits",
          items: [
            "<strong>Web crawlers:</strong> 10 billion seen URLs at 1% is about 12 GB; a false positive skips one new page.",
            "<strong>Username or key existence:</strong> most checks are for names that are free, and those return without a query.",
            "<strong>Distributed joins:</strong> ship a filter of one side's keys to the other side so rows that cannot match are dropped before crossing the network.",
            "<strong>Known-bad lists:</strong> malicious URLs or leaked passwords, where a \"maybe\" triggers a slower exact check.",
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
          type: "text",
          html: `<p>Bloom filters come up in web crawlers, URL shorteners (is this short code taken?), recommendation feeds (has this user already seen this item?), and any storage-engine discussion that reaches LSM trees. They are also a favourite trap: the interviewer may be checking whether you reach for one when a plain set would do.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>A strong answer covers four points:</p>
<ol>
<li><strong>Semantics:</strong> "definitely not" or "probably yes"; no false negatives, tunable false positives, no deletes.</li>
<li><strong>Sizing:</strong> about 9.6 bits per item and 7 hashes for 1%, plus 4.8 bits per item for each further factor of ten. Do the arithmetic for your n out loud.</li>
<li><strong>Placement:</strong> it sits in front of an exact store; a "maybe" goes on to confirm, so a false positive costs a lookup, not a wrong answer.</li>
<li><strong>Lifecycle:</strong> it saturates and can't grow, so size for growth, rebuild, use time-partitioned filters, or use a scalable or cuckoo variant.</li>
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
    "A Bloom filter is m bits plus k hashes: adding sets k bits, checking tests them. Any zero means <strong>definitely not</strong>; all ones means <strong>probably yes</strong>.",
    "It never gives false negatives, which is why it is safe as a pre-check in front of an exact store.",
    "False-positive rate is about (1 &minus; e<sup>&minus;kn/m</sup>)<sup>k</sup>; the best k is (m/n) ln 2, and 9.6 bits per item gives 1%, with 4.8 more bits for every further factor of ten.",
    "Memory depends on the item count and target error, never on key size.",
    "It saturates and can't be resized or have items removed; use rebuilds, time partitions, scalable, counting or cuckoo filters when that matters.",
    "Its biggest production use is skipping SSTables in LSM-tree databases; justify any other use with an item count that a plain set can't handle.",
  ],
  furtherReading: [
    { title: "Space/Time Trade-offs in Hash Coding with Allowable Errors (Burton H. Bloom, CACM 1970)", note: "The original paper." },
    { title: "Less Hashing, Same Performance: Building a Better Bloom Filter (Kirsch and Mitzenmacher, 2006)", note: "Why two hash functions are enough." },
    { title: "Cuckoo Filter: Practically Better Than Bloom (Fan, Andersen, Kaminsky and Mitzenmacher, CoNEXT 2014)", note: "Fingerprints in a cuckoo hash table, with deletion." },
    { title: "RocksDB wiki: RocksDB Bloom Filter", url: "https://github.com/facebook/rocksdb/wiki/RocksDB-Bloom-Filter", note: "How a production LSM engine sizes and uses per-file filters." },
  ],
};
