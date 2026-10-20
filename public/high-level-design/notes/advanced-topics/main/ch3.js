// Main tab: Chapter 3, Bloom filters. Format: DeepSection[] in public/shared/notes.d.ts.
window.MAIN = window.MAIN || {};
MAIN.ch3 = [
  {
    id: `the-question`,
    title: `The question a Bloom filter answers`,
    kicker: `Mental model`,
    blocks: [
      { type: `text`, html: `<p>A Bloom filter answers one question: <em>could this item be in the set?</em> It replies either "definitely not" or "maybe". It never says "definitely yes", and it never wrongly says "definitely not". In exchange for that one-sided uncertainty it uses a small, fixed amount of memory per item, about 10 bits for a 1% false positive rate, no matter whether the items are 8-byte IDs or 200-byte URLs.</p>
<p>That shape of answer is exactly what you want in front of an expensive lookup. Most lookups in many systems are for things that don't exist: a key that isn't in this disk file, a URL the crawler hasn't seen, a username nobody has taken. A Bloom filter turns those into an in-memory "no" and only lets the "maybe" cases go on to the real store.</p>` },
      { type: `keypoints`, items: [
        `<strong>No false negatives.</strong> If the item was added, the filter will always say "maybe".`,
        `<strong>Tunable false positives.</strong> You choose the rate when you size it.`,
        `<strong>No deletes, no listing, no counting.</strong> It only answers membership.`,
      ] },
    ],
  },
  {
    id: `how-it-works`,
    title: `A bit array and a few hash functions`,
    kicker: `Mechanics`,
    blocks: [
      { type: `text`, html: `<p>The structure is an array of m bits, all starting at zero, plus k hash functions that each map an item to a position in the array.</p>` },
      { type: `steps`, title: `Add and check`, items: [
        `<strong>Add an item:</strong> hash it k times and set each of those k bits to 1.`,
        `<strong>Check an item:</strong> hash it the same k ways and look at those bits.`,
        `If <strong>any</strong> of the bits is 0, the item was never added. Answer "definitely not".`,
        `If <strong>all</strong> of them are 1, the item was probably added, but other items might have set those same bits. Answer "maybe".`,
      ] },
      { type: `text`, html: `<p>A tiny example: a 16-bit filter with k = 3. Adding "alice" sets bits 2, 7 and 11. Adding "bob" sets bits 4, 7 and 13. Checking "carol" hashes to 2, 5 and 13; bit 5 is zero, so carol is definitely absent. Checking "dave" hashes to 4, 11 and 13, all of which happen to be set by alice and bob, so dave gets a "maybe" even though he was never added. That is a false positive, and it is the only kind of error a Bloom filter makes.</p>
<p>The same example shows why you can't delete. Clearing alice's bits would also clear bit 7, which bob needs, and bob would start reporting "definitely not": a false negative, which breaks the one guarantee the filter offers.</p>` },
    ],
  },
  {
    id: `sizing`,
    title: `Sizing it from two numbers`,
    kicker: `The math you need`,
    blocks: [
      { type: `text`, html: `<p>You size a Bloom filter from the number of items you expect, n, and the false positive rate you can tolerate, p. The full formula is p &asymp; (1 &minus; e<sup>&minus;kn/m</sup>)<sup>k</sup>, with the best number of hashes k = (m/n) &middot; ln 2. In an interview, the rules of thumb are enough:</p>` },
      { type: `keypoints`, items: [
        `About <strong>9.6 bits per item gives 1%</strong> false positives, with 7 hash functions.`,
        `Every extra <strong>4.8 bits per item cuts the rate by ten</strong>: 14.4 bits for 0.1%, 19.2 bits for 0.01%.`,
        `Memory depends only on the item count and the rate, never on how large each item is.`,
      ] },
      { type: `text`, html: `<p><strong>Worked example.</strong> A sign-up form checks whether a username is taken, across 2 billion accounts. At 1%, the filter needs 2 &times; 10<sup>9</sup> &times; 9.6 bits, about 2.4 GB, which fits in memory on every application server or in one Redis Bloom key. At 0.1% it needs about 3.6 GB. A hash set of the same names would need tens of gigabytes once you count the strings and per-entry overhead. A "definitely not" lets the form say "available" instantly; a "maybe" goes to the database to confirm.</p>` },
      { type: `callout`, tone: `warning`, title: `Saturation`, html: `<p>A Bloom filter can't grow. Insert far more items than it was sized for and most bits become 1, until nearly every check says "maybe" and the filter does nothing. Size for expected growth, rebuild periodically from the source of truth, keep one filter per time window so old ones can be dropped, or use a scalable Bloom filter that adds layers as it fills.</p>` },
    ],
  },
  {
    id: `when-to-use`,
    title: `When it belongs in a design, and when it doesn't`,
    kicker: `Decision rule`,
    blocks: [
      { type: `text`, html: `<p>Bloom filters show up in a handful of places again and again. Recognise the pattern: a huge set, a cheap check that must avoid an expensive one, and a false positive whose cost is small or can be caught by a follow-up lookup.</p>` },
      { type: `table`, headers: [`Where`, `What the filter holds`, `Cost of a false positive`], rows: [
        [`LSM-tree databases (Cassandra, RocksDB, HBase)`, `The keys in each immutable on-disk file`, `One unnecessary file read`],
        [`Web crawler`, `URLs already fetched`, `One new page is skipped`],
        [`CDN or cache admission`, `Objects requested once before`, `A one-hit object gets cached`],
        [`Pre-check before a database`, `Taken usernames, known-bad URLs, existing keys`, `One extra database lookup`],
      ] },
      { type: `list`, title: `Checklist before proposing one`, items: [
        `Is the set too big for a hash set or a Redis set? Ten million IDs is a few hundred megabytes; that is not "too big".`,
        `Can the system tolerate a false positive, or confirm it against an exact store?`,
        `Is the set append-mostly? If items must be removed, use a counting Bloom filter or a cuckoo filter, or rebuild on a schedule.`,
        `Do you know the expected item count, so you can state the memory and error rate?`,
      ] },
      { type: `callout`, tone: `interview`, title: `What to say`, html: `<p>Give the number: "Ten billion URLs at a 1% false positive rate is about 12 GB, so a Bloom filter of seen URLs fits across a few machines. A false positive skips one page, which is fine." Using a Bloom filter where a hash table would do reads as over-engineering, so justify it with the size every time.</p>` },
    ],
  },
];
