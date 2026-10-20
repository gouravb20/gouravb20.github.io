// Main tab: Chapter 4, Count-Min Sketch and HyperLogLog. Format: DeepSection[] in public/shared/notes.d.ts.
window.MAIN = window.MAIN || {};
MAIN.ch4 = [
  {
    id: `two-questions`,
    title: `Two counting questions that outgrow a hash map`,
    kicker: `Mental model`,
    blocks: [
      { type: `text`, html: `<p>Counting is easy until the number of distinct things becomes enormous. An exact answer needs memory for every distinct item, and when you want those counts per minute, per region and per shard, the memory multiplies. Two questions come up again and again in trending, analytics and abuse-detection designs, and each has a standard approximate structure with fixed memory.</p>` },
      { type: `compare`, items: [
        { title: `How many times has this item appeared?`, tone: `info`, html: `<p>Views per video, searches per query, requests per IP. Exact answer: a hash map of counters that grows with every new key. Approximate answer: a <strong>Count-Min Sketch</strong>, a small fixed table that can only overestimate.</p>` },
        { title: `How many distinct items have we seen?`, tone: `info`, html: `<p>Unique visitors per day, distinct devices per campaign. Exact answer: a set of every item. Approximate answer: <strong>HyperLogLog</strong>, about 12 KB for roughly 1% error whether the answer is a thousand or a billion.</p>` },
      ] },
      { type: `text`, html: `<p>Both structures share two properties that make them valuable in distributed systems: their memory doesn't grow with the data, and two of them can be <strong>merged</strong> into one that represents both inputs. That lets you count per shard or per minute and combine later without re-reading raw events.</p>` },
    ],
  },
  {
    id: `count-min`,
    title: `Count-Min Sketch: shared counters, take the minimum`,
    kicker: `Frequency`,
    blocks: [
      { type: `steps`, title: `How it works`, items: [
        `Allocate d rows of w counters each, all zero, with a different hash function per row.`,
        `<strong>To count an item,</strong> hash it once per row and increment the counter it lands on in every row.`,
        `<strong>To estimate an item,</strong> look up its counter in every row and return the smallest.`,
      ] },
      { type: `text`, html: `<p>Many items share each counter, so a counter holds the item's true count plus everyone else who collided with it. Collisions only ever add, so every counter is at least the true count, and so is the minimum. Taking the minimum across independent rows picks the least polluted counter. The result is a <strong>one-sided error</strong>: a sketch never underestimates, which means a genuinely popular item can never hide.</p>
<p>The error is bounded relative to the <strong>total</strong> number of events N, not the item's own count. Choose the width w = e/&epsilon; and the depth d = ln(1/&delta;), and the estimate exceeds the truth by at most &epsilon;N with probability 1 &minus; &delta;.</p>` },
      { type: `text`, html: `<p><strong>Worked example.</strong> A video site logs a billion views a day. With &epsilon; = 0.0001 and 99% confidence, the sketch is 5 rows of about 27,000 counters, roughly 540 KB of 4-byte counters. Any estimate is at most 100,000 views too high. For a video with 5 million views that is within 2%; for a video with 300 views the estimate is noise. That is the right behaviour for trending, where only the heavy hitters matter.</p>` },
      { type: `text`, html: `<p><strong>Top-K.</strong> A sketch alone can't list the most popular items, because it doesn't store keys. Pair it with a min-heap of size K: after each increment, compare the item's estimate with the smallest entry in the heap and swap it in if it is larger. For "top 100 videos in the last hour", keep one sketch per minute, add the last 60 together (sketches with the same dimensions and hashes merge by adding counters), and recompute the heap.</p>` },
    ],
  },
  {
    id: `hyperloglog`,
    title: `HyperLogLog: distinct counts from lucky hashes`,
    kicker: `Cardinality`,
    blocks: [
      { type: `text`, html: `<p>Hash every item to a random-looking bit string. Half of all hashes start with a 0, a quarter with 00, one in a million with twenty zeros. So if the longest run of leading zeros you have ever seen is 20, you have probably hashed around a million distinct items. Duplicates change nothing, because the same item always produces the same hash.</p>
<p>One such observation is very noisy, since a single lucky hash throws it off. HyperLogLog splits the stream into m buckets (registers) using the first few bits of each hash, tracks the longest zero run per register, and combines the registers with a harmonic mean that damps outliers.</p>` },
      { type: `keypoints`, items: [
        `<strong>Accuracy:</strong> standard error is about 1.04 / &radic;m. Redis uses 16,384 registers in 12 KB for about 0.81%. Quadrupling the registers halves the error.`,
        `<strong>Memory is fixed:</strong> the same 12 KB counts ten visitors or ten billion.`,
        `<strong>Merge:</strong> take the maximum of each register. The result is the distinct count of the union, so daily HLLs combine into weekly ones.`,
        `<strong>No intersections:</strong> "users who visited both A and B" estimated by subtraction inherits the error of the union, which can exceed a small overlap entirely.`,
      ] },
      { type: `text`, html: `<p><strong>Worked example.</strong> Unique visitors for 100 pages over any date range: keep one HLL per page per day. A year of them is 100 &times; 365 &times; 12 KB, about 440 MB. Any page and range is a merge of the relevant days (<code>PFMERGE</code> in Redis), answered in milliseconds without touching raw logs.</p>` },
    ],
  },
  {
    id: `approximate-or-exact`,
    title: `Approximate or exact: the decision`,
    kicker: `Interview angle`,
    blocks: [
      { type: `list`, title: `Use a sketch when all of these hold`, items: [
        `The exact structure would not fit: billions of distinct keys, or many windows times many dimensions.`,
        `A small error is invisible to the user: dashboards, trending lists, monitoring, rough analytics.`,
        `You benefit from merging across shards or time windows.`,
      ] },
      { type: `callout`, tone: `mistake`, title: `Never for money or limits`, html: `<p>Billing, creator payouts, quotas and anything audited need exact counts. The common production pattern is both: sketches for the real-time view, and an exact batch job over the raw events for the numbers that matter financially. Proposing a sketch for a few million keys that fit easily in a hash map is also a mistake; it adds error for no benefit.</p>` },
      { type: `callout`, tone: `interview`, title: `What to say`, html: `<p>"Views per video go into a Count-Min Sketch per minute with a heap of the top K; it never undercounts, and the error is bounded by a fraction of total views, so the popular videos are accurate. Unique viewers go into a HyperLogLog per day at 12 KB each and about 1% error. Both merge, so I can serve any window. Payouts come from an exact batch job." Naming Redis (<code>PFADD</code>, <code>CMS.INCRBY</code>, <code>TOPK</code>) shows you know they exist off the shelf.</p>` },
    ],
  },
];
