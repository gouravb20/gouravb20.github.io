// Main tab: Chapter 5, Morris counter. Format: DeepSection[] in public/shared/notes.d.ts.
window.MAIN = window.MAIN || {};
MAIN.ch5 = [
  {
    id: `when-counters-are-too-big`,
    title: `When even a counter costs too much`,
    kicker: `The problem`,
    blocks: [
      { type: `text`, html: `<p>One counter is never a memory problem; a 64-bit integer costs nothing. The problem appears when you need <strong>hundreds of millions of counters</strong> at once (one per cache key, per network flow, per word sequence in a language model) or when a counter has to fit in a tiny hardware register. An exact counter needs log<sub>2</sub> n bits to reach n: 8 bits stop at 255 and 32 bits at about 4.3 billion.</p>
<p>Take 500 million cache keys that each need an access counter for eviction decisions. At 4 bytes each, the counters alone use 2 GB. At 1 byte each, they use 500 MB. If the eviction policy only needs to know roughly how popular each key is (hundreds of hits versus millions), the exact count is wasted precision. A <strong>Morris counter</strong> keeps the order of magnitude and throws away the rest.</p>` },
      { type: `callout`, tone: `insight`, title: `Total events, not distinct items`, html: `<p>A Morris counter counts every event, repeats included: page views, packets, hits. That separates it from HyperLogLog, which counts distinct items and ignores repeats, and from Count-Min Sketch, which estimates a count for each of many items in one shared table.</p>` },
    ],
  },
  {
    id: `the-idea`,
    title: `Store the exponent, increment by coin flip`,
    kicker: `Mechanics`,
    blocks: [
      { type: `text`, html: `<p>Instead of storing the count n, the register stores v, roughly log<sub>2</sub>(n + 1). The counter never sees n; it only knows v. On every event it draws a random number and increments v with probability 2<sup>&minus;v</sup>. The estimate is 2<sup>v</sup> &minus; 1.</p>` },
      { type: `table`, title: `What each register value means`, headers: [`Register v`, `Chance the next event increments it`, `Estimated count 2<sup>v</sup> &minus; 1`], rows: [
        [`0`, `Always`, `0`],
        [`1`, `1 in 2`, `1`],
        [`2`, `1 in 4`, `3`],
        [`3`, `1 in 8`, `7`],
        [`10`, `1 in 1,024`, `1,023`],
        [`20`, `about 1 in a million`, `about a million`],
        [`32`, `about 1 in 4.3 billion`, `about 4.3 billion`],
      ], note: `Each step up stands for twice as many events as the last, so it should happen half as often.` },
      { type: `text`, html: `<p><strong>Why it's right on average.</strong> Look at X = 2<sup>v</sup>. On each event, with probability 2<sup>&minus;v</sup> it doubles, gaining 2<sup>v</sup>; otherwise it stays. The expected gain per event is 2<sup>&minus;v</sup> &times; 2<sup>v</sup> = 1. Starting from X = 1, after n events the expected value of X is n + 1, so the estimate 2<sup>v</sup> &minus; 1 equals n on average.</p>
<p><strong>Why it's tiny.</strong> Counting to 4 billion only requires v to reach 32, and 32 fits in 6 bits. The register needs about log<sub>2</sub> log<sub>2</sub> n bits, so going from a billion to a quintillion adds roughly one bit. A side benefit: the register changes only about log n times over n events, which matters when writes are expensive (flash memory, or a shared counter where every write is a cache-line transfer).</p>` },
    ],
  },
  {
    id: `accuracy`,
    title: `Loose by default, and the two ways to tighten it`,
    kicker: `Tuning`,
    blocks: [
      { type: `text`, html: `<p>The base-2 counter has a standard deviation of about 0.71n. The error is a constant <em>fraction</em> of the count (about 71% whether you have seen a hundred events or a billion), which is the property Morris wanted, but 71% is too rough for most uses. Compare the naive alternative, a coin-flip counter that increments with a fixed probability p and multiplies by 1/p: its range only grows linearly, and with p = 1/1000 a true count of 1,000 is usually estimated as 0, 1,000 or 2,000.</p>` },
      { type: `compare`, items: [
        { title: `Use a smaller base`, tone: `ok`, html: `<p>Increment with probability (1 + 1/a)<sup>&minus;v</sup> and estimate a((1 + 1/a)<sup>v</sup> &minus; 1). Base 2 is a = 1. The relative error is about 1/&radic;(2a), but the register climbs faster, so the range per bit shrinks. In 8 bits, a = 8 gives about 25% error up to about 9 &times; 10<sup>13</sup>; a = 30 gives about 13% up to about 128,000.</p>` },
        { title: `Average several counters`, tone: `info`, html: `<p>Run k independent counters on the same events and average their estimates. The variance falls by a factor of k, so the error falls by &radic;k. Eight base-2 counters reach about 25% error, but cost eight registers. Taking the median of several averages gives high-probability bounds.</p>` },
      ] },
      { type: `callout`, tone: `tip`, title: `Choosing the knob`, html: `<p>Compare memory against error for the largest count you expect. In the example above, one 8-bit counter with a = 8 matches the error of eight averaged base-2 counters at a fraction of the memory, so changing the base is usually the first move. Pick the largest a whose range still covers your maximum count, or add a couple of bits.</p>` },
    ],
  },
  {
    id: `using-it`,
    title: `Where it fits in a design`,
    kicker: `Interview angle`,
    blocks: [
      { type: `text`, html: `<p>The pattern to recognise is <strong>millions of counters where the order of magnitude matters and the exact value doesn't</strong>. The best-known production example is Redis's LFU eviction: every key carries an 8-bit logarithmic access counter that increments probabilistically, so one byte represents up to about a million hits with the default settings. The same idea appears in per-flow network statistics, streaming algorithms and huge n-gram count tables.</p>` },
      { type: `steps`, title: `Worked answer: LFU counters for 500 million keys`, items: [
        `Exact 32-bit counters would cost 2 GB, and eviction only needs a rough popularity ranking.`,
        `Store an 8-bit Morris-style counter per key, about 500 MB, tuned so 255 corresponds to roughly a million hits.`,
        `Make popularity decay: store a coarse last-access time beside the counter and reduce the counter by the time elapsed when the key is touched, so last week's hot keys can leave.`,
        `To evict, sample a handful of keys and drop the one with the lowest counter, rather than maintaining a global ordering.`,
      ] },
      { type: `keypoints`, title: `Common mistakes`, items: [
        `Using one for a handful of counters, where a 64-bit integer is free.`,
        `Using one where exact counts matter: billing, quotas, inventory or strict rate limits.`,
        `Confusing it with HyperLogLog. "How many page views?" is a Morris question; "how many unique visitors?" is a HyperLogLog question.`,
        `Quoting the base-2 counter without mentioning its 71% error or how to tune it.`,
      ] },
    ],
  },
];
