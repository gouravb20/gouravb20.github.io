// Deep dive: Chapter 4, Count-Min Sketch and HyperLogLog: counting at scale. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch4 = {
  hook: `<p>A video platform's product team wants two numbers on a live dashboard. First: the 100 most-watched videos in the last hour. Second: how many <em>different</em> people watched anything today. The event stream carries a billion views a day across hundreds of millions of videos and users.</p>
<p>The obvious solution is a hash map of counters for the first question and a hash set of user IDs for the second. Both grow with the number of distinct keys, both must exist for every time window you want to report on, and both must be combined across dozens of stream processors. Before long the dashboard needs more memory than the database it reports on.</p>
<p>Two small structures fix this. A <strong>Count-Min Sketch</strong> estimates how often each item appeared in a fixed table of counters, and it never underestimates. <strong>HyperLogLog</strong> estimates how many distinct items appeared, within about 1%, in 12 KB. Both can be added together across machines and minutes without touching the raw events again.</p>`,
  sections: [
    {
      id: "counting-at-scale",
      title: "Two counting questions that get expensive",
      kicker: "The problem",
      blocks: [
        {
          type: "problem",
          html: `<p>"How many times has X appeared?" (frequency) and "how many different things have appeared?" (cardinality) sound trivial. Answered exactly, each needs memory proportional to the number of <em>distinct</em> items in the stream, and you need that memory again for every window, every shard and every dimension you slice by.</p>`,
        },
        {
          type: "text",
          html: `<p>Put numbers on it. A hash map entry with a 16-byte ID, an 8-byte counter, a pointer and table slack costs roughly 50 bytes. Two hundred million distinct videos in an hour is about 10 GB for one window on one machine. For distinct users, 300 million IDs in a day is about 15 GB for a single day's set, and a "unique visitors per page per day for a year" report multiplies that by pages and days.</p>
<p>The sketches in this chapter replace "memory per distinct item" with <strong>fixed memory chosen up front</strong> and an error you can bound. They are not free: you give up exact answers, and each structure answers only one kind of question. Knowing which question each one answers is half of using them well.</p>`,
        },
        {
          type: "table",
          title: "Which structure answers which question",
          headers: ["Question", "Exact", "Approximate", "Memory", "Error"],
          rows: [
            ["Is X in the set?", "Hash set", "Bloom filter", "~10 bits per item", "False positives"],
            ["How many times has X appeared?", "Hash map of counters", "Count-Min Sketch", "d &times; w counters", "Overestimates by at most &epsilon;N"],
            ["How many distinct items?", "Hash set", "HyperLogLog", "12 KB (Redis)", "~0.81% standard error"],
            ["What are the top K?", "Count everything, sort", "Count-Min Sketch + min-heap", "Sketch plus K entries", "Inherits the sketch's error"],
          ],
        },
      ],
    },
    {
      id: "count-min-sketch",
      title: "Count-Min Sketch: d rows of shared counters",
      kicker: "Frequency",
      blocks: [
        {
          type: "idea",
          html: `<p>Keep a small table of d rows with w counters each, and give every row its own hash function. To count an item, increment one counter per row, the one its hash picks. To estimate an item's count, read those same d counters and take the <strong>minimum</strong>.</p>`,
        },
        {
          type: "text",
          html: `<p>Each row is a tiny hash table that has given up on resolving collisions: many items share each counter, and the counter holds the sum of all their counts. So a counter can only ever be <em>at least</em> the true count of any item mapped to it. The estimate is therefore never too low.</p>
<p>Why several rows? Within one row, a rare item might share a counter with a hugely popular one and look popular too. With independent hashes, it is unlikely to be that unlucky in <em>every</em> row. Taking the minimum picks the row where the item had the least company, which is the least inflated reading.</p>`,
        },
        {
          type: "diagram",
          title: "One item, one counter per row, take the minimum",
          caption: "video:9 hashes to column 2 in row 1, column 5 in row 2 and column 1 in row 3. Its counters read 41, 38 and 45 because other videos share them. The estimate is the minimum, 38.",
          svg: `<svg viewBox="0 0 640 260" role="img" aria-label="A Count-Min Sketch with three rows of eight counters and one item's counters highlighted">
<defs><marker id="at4-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="20" y="102" width="100" height="36" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="70" y="125" text-anchor="middle" font-size="13" font-weight="700">video:9</text>
<g stroke-width="2" style="stroke: var(--dg-muted)">
<line x1="120" y1="112" x2="172" y2="70" marker-end="url(#at4-arrow)"/>
<line x1="120" y1="120" x2="172" y2="120" marker-end="url(#at4-arrow)"/>
<line x1="120" y1="128" x2="172" y2="170" marker-end="url(#at4-arrow)"/>
</g>
<g font-size="12" style="fill: var(--dg-muted)">
<text x="186" y="74">h1</text><text x="186" y="124">h2</text><text x="186" y="174">h3</text>
<text x="220" y="42" text-anchor="middle">0</text><text x="260" y="42" text-anchor="middle">1</text><text x="300" y="42" text-anchor="middle">2</text><text x="340" y="42" text-anchor="middle">3</text>
<text x="380" y="42" text-anchor="middle">4</text><text x="420" y="42" text-anchor="middle">5</text><text x="460" y="42" text-anchor="middle">6</text><text x="500" y="42" text-anchor="middle">7</text>
</g>
<g style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5">
<rect x="200" y="50" width="40" height="40"/><rect x="240" y="50" width="40" height="40"/><rect x="320" y="50" width="40" height="40"/><rect x="360" y="50" width="40" height="40"/>
<rect x="400" y="50" width="40" height="40"/><rect x="440" y="50" width="40" height="40"/><rect x="480" y="50" width="40" height="40"/>
<rect x="200" y="100" width="40" height="40"/><rect x="240" y="100" width="40" height="40"/><rect x="280" y="100" width="40" height="40"/><rect x="320" y="100" width="40" height="40"/>
<rect x="360" y="100" width="40" height="40"/><rect x="440" y="100" width="40" height="40"/><rect x="480" y="100" width="40" height="40"/>
<rect x="200" y="150" width="40" height="40"/><rect x="280" y="150" width="40" height="40"/><rect x="320" y="150" width="40" height="40"/><rect x="360" y="150" width="40" height="40"/>
<rect x="400" y="150" width="40" height="40"/><rect x="440" y="150" width="40" height="40"/><rect x="480" y="150" width="40" height="40"/>
</g>
<rect x="280" y="50" width="40" height="40" stroke-width="2" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/>
<rect x="400" y="100" width="40" height="40" stroke-width="2.5" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)"/>
<rect x="240" y="150" width="40" height="40" stroke-width="2" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/>
<g font-size="13" text-anchor="middle">
<text x="220" y="75">3</text><text x="260" y="75">0</text><text x="300" y="75" font-weight="700">41</text><text x="340" y="75">7</text><text x="380" y="75">0</text><text x="420" y="75">12</text><text x="460" y="75">5</text><text x="500" y="75">2</text>
<text x="220" y="125">9</text><text x="260" y="125">4</text><text x="300" y="125">1</text><text x="340" y="125">6</text><text x="380" y="125">0</text><text x="420" y="125" font-weight="700">38</text><text x="460" y="125">11</text><text x="500" y="125">3</text>
<text x="220" y="175">2</text><text x="260" y="175" font-weight="700">45</text><text x="300" y="175">8</text><text x="340" y="175">0</text><text x="380" y="175">13</text><text x="420" y="175">6</text><text x="460" y="175">1</text><text x="500" y="175">10</text>
</g>
<g font-size="12">
<text x="534" y="74">row 1: 41</text>
<text x="534" y="124" font-weight="700">row 2: 38</text>
<text x="534" y="174">row 3: 45</text>
</g>
<text x="360" y="222" text-anchor="middle" font-size="13" font-weight="700">estimate = min(41, 38, 45) = 38</text>
<text x="360" y="244" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">Collisions only add, so every reading is at least the true count</text>
</svg>`,
        },
        {
          type: "text",
          html: `<h3>How big should the table be?</h3>
<p>Cormode and Muthukrishnan's analysis gives a clean recipe. Choose an error fraction &epsilon; and a failure probability &delta;, then set</p>
<p><span class="formula">w = &lceil;e / &epsilon;&rceil; &nbsp;&nbsp; d = &lceil;ln(1/&delta;)&rceil;</span></p>
<p>With that table, each estimate exceeds the true count by at most <span class="formula">&epsilon; &middot; N</span> with probability at least 1 &minus; &delta;, where N is the total number of events counted. Width controls <em>how big</em> the error can be; depth controls <em>how confident</em> you are in that bound.</p>`,
        },
        {
          type: "steps",
          title: "Worked example: a billion views a day",
          items: [
            "Pick &epsilon; = 0.001 and &delta; = 0.01. Then w = &lceil;2.718 / 0.001&rceil; = 2,719 and d = &lceil;ln 100&rceil; = 5.",
            "The table holds 13,595 counters; at 4 bytes each that is about <strong>54 KB</strong>, whatever the number of distinct videos.",
            "With N = 1 billion views, any estimate is at most 1 million too high, with 99% probability.",
            "For a video with 50 million views that is at most a 2% overcount: excellent. For a video with 1,000 views the bound allows a reading of 1,001,000: useless. The error scales with total traffic, not with the item.",
          ],
        },
        {
          type: "lab",
          id: "countMin",
          caption: "200,000 Zipf-distributed views over 20,000 videos. Shrink the width and watch rare videos inflate first while the top videos stay accurate; set depth to 1 to see what happens without a second opinion.",
        },
        {
          type: "quiz",
          q: "A Count-Min Sketch reports 120 views for a video. What can you say for certain?",
          options: [
            "The video had exactly 120 views",
            "The video had at most 120 views",
            "The video had at least 120 views",
            "The video had between 108 and 132 views",
          ],
          answer: 1,
          explain: "Every counter is the item's true count plus whatever collided with it, so the minimum is an upper bound. The true count is 120 or less; with high probability it is no lower than 120 &minus; &epsilon;N.",
        },
      ],
    },
    {
      id: "heavy-hitters",
      title: "Heavy hitters, Top-K and merging sketches",
      kicker: "Putting it to work",
      blocks: [
        {
          type: "text",
          html: `<p>A sketch can estimate any item's count, but it cannot list items: it stores counters, not keys. To answer "what are the top 100?", pair it with a <strong>min-heap</strong> of size K holding the current leaders and their estimates.</p>`,
        },
        {
          type: "steps",
          title: "Top-K over a stream",
          items: [
            "For each event, increment the item's counters in the sketch and read back its new estimate.",
            "If the item is already in the heap, update its estimate.",
            "Otherwise, if the heap has fewer than K entries, or the estimate beats the heap's minimum, insert the item and evict the minimum.",
            "At any moment the heap holds the approximate top K. Memory is the sketch plus K entries, independent of the number of distinct items.",
          ],
        },
        {
          type: "text",
          html: `<p>Heavy hitters are exactly where the sketch is accurate, because &epsilon;N is small compared with their counts. Items near the cut-off can swap places, and a rare item can sneak in only if its estimate is inflated past real leaders, which a wide enough table makes unlikely.</p>
<h3>Merging across shards and time</h3>
<p>Two sketches built with the same width, depth and hash functions merge by <strong>adding their counters cell by cell</strong>. The result is exactly the sketch you would have built from both streams together. That one property drives the usual architecture: each stream worker keeps its own sketch per minute, and an aggregator adds the last 60 per-minute sketches to answer "last hour" without ever revisiting raw events. Sliding the window means dropping the oldest minute and adding the newest.</p>
<p>A popular refinement is the <strong>conservative update</strong>: on each event, raise only the counters that equal the current minimum, rather than all d. It cuts overcounting noticeably, at the cost of no longer supporting decrements, and it complicates merging.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Redis Stack", title: "CMS and TOPK", html: "<code>CMS.INITBYPROB key 0.001 0.01</code> sizes a sketch from &epsilon; and &delta;; <code>CMS.INCRBY</code> and <code>CMS.QUERY</code> update and read it; <code>CMS.MERGE</code> combines sketches. A separate <code>TOPK</code> structure (<code>TOPK.RESERVE</code>, <code>TOPK.ADD</code>, <code>TOPK.LIST</code>) keeps the leaders for you." },
            { org: "Apache DataSketches", title: "Frequent-items sketches", html: "An open-source library of mergeable sketches for frequency, distinct counts and quantiles, used inside query engines and stream processors." },
          ],
        },
        {
          type: "tradeoffs",
          title: "Count-Min Sketch",
          pros: [
            "Fixed memory, tiny compared with a hash map at scale",
            "Never underestimates, so a heavy hitter can't hide",
            "Merges by addition across shards and time buckets",
          ],
          cons: [
            "Error is a fraction of total volume, so small counts are meaningless",
            "Can't list keys; needs a heap or candidate list for Top-K",
            "Not suitable for anything billed, audited or quota-enforced",
          ],
        },
      ],
    },
    {
      id: "hyperloglog",
      title: "HyperLogLog: distinct counts from leading zeros",
      kicker: "Cardinality",
      blocks: [
        {
          type: "analogy",
          html: `<p>A friend spends the afternoon flipping coins and tells you only one thing: the longest run of heads they got before the first tails was 10. A run of 10 heads has a 1-in-1,024 chance, so you guess they played about a thousand rounds. You can't know for sure, but the record says something about the volume.</p>`,
        },
        {
          type: "text",
          html: `<p>HyperLogLog applies that reasoning to hashed items. Hash each item to a uniformly random-looking bit string. The chance that a hash starts with r zeros is 2<sup>&minus;r</sup>, so if the longest run of leading zeros seen so far is 20, you have probably hashed around a million <em>distinct</em> values. Duplicates are ignored for free: the same item always produces the same hash and cannot set a new record.</p>
<p>A single record is wildly noisy, though; one lucky hash doubles the estimate. The fix, called <strong>stochastic averaging</strong>, is to split the stream into m = 2<sup>p</sup> buckets using the first p bits of each hash, and keep a separate record per bucket in a small <strong>register</strong>. Each register sees about 1/m of the items, and averaging m independent records cancels most of the luck.</p>`,
        },
        {
          type: "diagram",
          title: "Splitting one hash into a register index and a run of zeros",
          caption: "With p = 4 (16 registers), the first four bits 1011 select register 11. The rest of the hash starts with three zeros, so its rank is 4 (zeros plus one), and register 11 keeps the maximum rank it has ever seen.",
          svg: `<svg viewBox="0 0 640 270" role="img" aria-label="A hash split into four index bits and remaining bits, updating one of sixteen registers">
<defs><marker id="at4-arrow2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" style="fill: var(--dg-muted)"/></marker></defs>
<text x="20" y="40" font-size="12" style="fill: var(--dg-muted)">hash(user)</text>
<g stroke-width="1.5">
<rect x="100" y="22" width="30" height="30" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/><rect x="130" y="22" width="30" height="30" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<rect x="160" y="22" width="30" height="30" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/><rect x="190" y="22" width="30" height="30" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<rect x="220" y="22" width="30" height="30" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/><rect x="250" y="22" width="30" height="30" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/>
<rect x="280" y="22" width="30" height="30" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/><rect x="310" y="22" width="30" height="30" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/>
</g>
<g style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5">
<rect x="340" y="22" width="30" height="30"/><rect x="370" y="22" width="30" height="30"/><rect x="400" y="22" width="30" height="30"/><rect x="430" y="22" width="30" height="30"/>
<rect x="460" y="22" width="30" height="30"/><rect x="490" y="22" width="30" height="30"/><rect x="520" y="22" width="30" height="30"/><rect x="550" y="22" width="30" height="30"/>
</g>
<g font-size="13" text-anchor="middle">
<text x="115" y="42">1</text><text x="145" y="42">0</text><text x="175" y="42">1</text><text x="205" y="42">1</text>
<text x="235" y="42" font-weight="700">0</text><text x="265" y="42" font-weight="700">0</text><text x="295" y="42" font-weight="700">0</text><text x="325" y="42" font-weight="700">1</text>
<text x="355" y="42">0</text><text x="385" y="42">1</text><text x="415" y="42">1</text><text x="445" y="42">0</text>
<text x="475" y="42">1</text><text x="505" y="42">0</text><text x="535" y="42">0</text><text x="565" y="42">1</text>
</g>
<text x="160" y="76" text-anchor="middle" font-size="12">first p = 4 bits: 1011 = 11</text>
<text x="280" y="96" text-anchor="middle" font-size="12">3 zeros, then a 1: rank 4</text>
<line x1="120" y1="84" x2="425" y2="160" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#at4-arrow2)"/>
<text x="20" y="190" font-size="12" style="fill: var(--dg-muted)">registers</text>
<g style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5">
<rect x="100" y="168" width="30" height="34"/><rect x="130" y="168" width="30" height="34"/><rect x="160" y="168" width="30" height="34"/><rect x="190" y="168" width="30" height="34"/>
<rect x="220" y="168" width="30" height="34"/><rect x="250" y="168" width="30" height="34"/><rect x="280" y="168" width="30" height="34"/><rect x="310" y="168" width="30" height="34"/>
<rect x="340" y="168" width="30" height="34"/><rect x="370" y="168" width="30" height="34"/><rect x="400" y="168" width="30" height="34"/>
<rect x="460" y="168" width="30" height="34"/><rect x="490" y="168" width="30" height="34"/><rect x="520" y="168" width="30" height="34"/><rect x="550" y="168" width="30" height="34"/>
</g>
<rect x="430" y="168" width="30" height="34" stroke-width="2.5" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)"/>
<g font-size="13" text-anchor="middle">
<text x="115" y="190">2</text><text x="145" y="190">1</text><text x="175" y="190">3</text><text x="205" y="190">1</text>
<text x="235" y="190">2</text><text x="265" y="190">5</text><text x="295" y="190">1</text><text x="325" y="190">2</text>
<text x="355" y="190">3</text><text x="385" y="190">1</text><text x="415" y="190">2</text><text x="445" y="190" font-weight="700">4</text>
<text x="475" y="190">1</text><text x="505" y="190">3</text><text x="535" y="190">2</text><text x="565" y="190">1</text>
</g>
<g font-size="12" text-anchor="middle" style="fill: var(--dg-muted)">
<text x="115" y="220">0</text><text x="445" y="220">11</text><text x="565" y="220">15</text>
</g>
<text x="340" y="252" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">register 11 = max(old value, 4); the estimate combines all 16 with a harmonic mean</text>
</svg>`,
        },
        {
          type: "text",
          html: `<h3>From registers to an estimate</h3>
<p>Let M[j] be register j's value, the largest rank (leading zeros plus one) seen in that bucket. Flajolet and colleagues' 2007 estimator combines them with a <strong>harmonic mean</strong>, which damps the effect of the occasional freakishly high register:</p>
<p><span class="formula">E = &alpha;<sub>m</sub> &middot; m<sup>2</sup> / &Sigma;<sub>j</sub> 2<sup>&minus;M[j]</sup></span></p>
<p>where &alpha;<sub>m</sub> &asymp; 0.7213 / (1 + 1.079/m) corrects a systematic bias (for m of 128 or more). When the count is small relative to m, many registers are still 0 and the formula is poor, so implementations switch to <strong>linear counting</strong>, m &middot; ln(m / V), where V is the number of empty registers.</p>
<p>The standard error is about <span class="formula">1.04 / &radic;m</span>. With p = 14, m = 16,384 and the error is 1.04 / 128 &asymp; <strong>0.81%</strong>. A register only needs to hold numbers up to about 50, which fits in 6 bits, so 16,384 registers take 16,384 &times; 6 / 8 = 12,288 bytes: <strong>12 KB</strong>, whether the true count is a thousand or a billion.</p>`,
        },
        {
          type: "lab",
          id: "hyperLogLog",
          caption: "Vary the true number of distinct users and the precision p. Watch the error track 1.04/&radic;m regardless of the count, switch duplicates on to see the estimate stay put, and drop p low to see the run-to-run noise.",
        },
      ],
    },
    {
      id: "hll-in-practice",
      title: "HyperLogLog in practice: merges, unions and intersections",
      kicker: "Using it well",
      blocks: [
        {
          type: "table",
          title: "Registers versus error",
          headers: ["Registers m", "Memory (6-bit registers)", "Standard error 1.04/&radic;m"],
          rows: [
            ["256", "192 B", "6.5%"],
            ["1,024", "768 B", "3.25%"],
            ["4,096", "3 KB", "1.6%"],
            ["16,384 (Redis)", "12 KB", "0.81%"],
          ],
          note: "Halving the error costs four times the memory; memory never depends on the count.",
        },
        {
          type: "text",
          html: `<p><strong>Merging is a register-wise maximum.</strong> If register j saw a rank of 5 on one server and 7 on another, then across both streams it saw 7. Taking the maximum of each register gives exactly the sketch of the combined stream, so distinct counts across shards, pages or days are free. The classic use: keep one sketch per page per day, then merge any set of pages and any date range on demand. A hundred pages for a year is 36,500 sketches of at most 12 KB, about 440 MB, and in practice less because small sketches are stored compactly.</p>
<p><strong>Intersections are a trap.</strong> There is no register operation for "users in both A and B". You can estimate it by inclusion-exclusion, |A &cap; B| = |A| + |B| &minus; |A &cup; B|, but the errors of the three estimates add up. Worked example: two pages with 1 million visitors each and 10,000 in common. The union is about 1.99 million, with a standard error of roughly 16,000; each page's estimate is off by roughly 8,000. Combined, the overlap estimate is uncertain by around &plusmn;20,000, larger than the 10,000 you are trying to measure.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Redis", title: "PFADD, PFCOUNT, PFMERGE", html: "Redis HyperLogLogs use 16,384 registers for about 0.81% standard error, at most 12 KB per key. Small sets start in a sparse encoding and switch to the dense 12 KB form as they grow. <code>PFCOUNT</code> over several keys returns the count of their union." },
            { org: "Google", title: "HyperLogLog++", html: "Heule, Nunkesser and Hall (2013) improved the algorithm with a 64-bit hash, empirical bias correction for small and mid-range counts, and a sparse representation. BigQuery's <code>HLL_COUNT</code> functions implement HLL++ and let you store and merge sketches as column values." },
          ],
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>The two sketches fail in opposite places. Count-Min is accurate for <em>big</em> items and noisy for small ones, because its error is a fraction of total volume. HyperLogLog's error is a fixed <em>percentage</em> of the answer at every scale, except that tiny counts lean on linear counting. Keep that in mind when deciding what a dashboard can show.</p>`,
        },
        {
          type: "quiz",
          q: "You keep one HyperLogLog per day of unique visitors. How do you get unique visitors for the whole week?",
          options: [
            "Add the seven daily estimates",
            "Average the seven daily estimates and multiply by 7",
            "Merge the seven sketches by taking the maximum of each register, then estimate",
            "It can't be done; you need the raw events",
          ],
          answer: 2,
          explain: "Adding daily counts would count a visitor who came on three days three times. The register-wise maximum gives exactly the sketch of the whole week's stream, so the estimate is the week's distinct count with the usual 0.81% error.",
        },
      ],
    },
    {
      id: "interview",
      title: "Using sketches in a design interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "text",
          html: `<p>These structures appear in Top-K / trending designs, analytics dashboards, ad impression counting, rate limiting discussions and abuse detection. The interviewer usually wants to see three things: that you match the right sketch to the question, that you can size it, and that you know when approximate is unacceptable.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>For "top 100 trending videos in the last hour at very high event rates", a strong answer goes:</p>
<ol>
<li>Partition view events by video ID through Kafka to stream workers.</li>
<li>Each worker keeps a Count-Min Sketch plus a min-heap of its local top K for each one-minute bucket.</li>
<li>An aggregator adds the last 60 per-minute sketches (sketches merge by addition), re-scores the union of the workers' candidates, and keeps a global top K.</li>
<li>Serve the result from a cache refreshed every few seconds.</li>
<li>If counts feed payouts, compute exact numbers separately in a batch job over the raw log.</li>
</ol>
<p>For "unique visitors per page for any date range", answer with one HyperLogLog per page per day and merges on read.</p>`,
        },
        {
          type: "compare",
          title: "Approximate or exact?",
          items: [
            { title: "Sketches are fine", tone: "ok", html: "Trending lists, dashboards, capacity planning, abuse heuristics, approximate unique reach: anywhere a 1% error is invisible and freshness matters more." },
            { title: "Must be exact", tone: "bad", html: "Billing, creator payouts, quotas and rate limits that are enforced, inventory, anything audited. Use exact counters or a batch job over raw events, often alongside the real-time sketch." },
          ],
        },
        {
          type: "quiz",
          q: "Marketing asks for \"how many users saw both campaign A and campaign B\" and both campaigns reached about 5 million users. You only have a HyperLogLog per campaign. What should you say?",
          options: [
            "Compute |A| + |B| &minus; |A &cup; B| from the sketches; the result will be within 0.81%",
            "Take the register-wise minimum of the two sketches",
            "Inclusion-exclusion works, but its error is a percentage of the 10 million total, so a small overlap may be lost in noise; for an accurate answer use exact sets, a join over raw data, or a sketch designed for intersections",
            "Multiply the two estimates and divide by the total user base",
          ],
          answer: 2,
          explain: "The union's error of about 0.81% of roughly 10 million is around 80,000 users, before adding the errors of the individual estimates. If the true overlap is tens of thousands, the estimate is mostly noise. A register-wise minimum is not a valid intersection.",
        },
      ],
    },
  ],
  takeaways: [
    "Exact frequency and distinct counting cost memory per distinct item, per window, per shard; sketches swap that for fixed memory and a bounded error.",
    "A Count-Min Sketch increments one counter in each of d rows and reports the minimum. It never underestimates and overcounts by at most &epsilon;N with probability 1 &minus; &delta;, using w = e/&epsilon; and d = ln(1/&delta;).",
    "Its error scales with total traffic, so it is accurate for heavy hitters and meaningless for rare items; pair it with a min-heap for Top-K.",
    "HyperLogLog keeps the maximum leading-zero rank per register and combines registers with a harmonic mean; standard error is about 1.04/&radic;m, 0.81% in 12 KB for Redis.",
    "Both merge cleanly: Count-Min by adding counters, HyperLogLog by taking register-wise maxima. That makes per-shard, per-minute sketches the standard architecture.",
    "Unions are easy; intersections by inclusion-exclusion can be swamped by error. Anything billed or enforced needs exact counts.",
  ],
  furtherReading: [
    { title: "An Improved Data Stream Summary: The Count-Min Sketch and its Applications (Cormode and Muthukrishnan, 2005)", note: "The original analysis, including the w = e/&epsilon;, d = ln(1/&delta;) bounds." },
    { title: "HyperLogLog: the analysis of a near-optimal cardinality estimation algorithm (Flajolet, Fusy, Gandouet and Meunier, 2007)", note: "The estimator, the bias constant and the small-range correction." },
    { title: "HyperLogLog in Practice: Algorithmic Engineering of a State of The Art Cardinality Estimation Algorithm (Heule, Nunkesser and Hall, EDBT 2013)", note: "Google's HLL++ improvements." },
    { title: "Redis PFCOUNT command reference", url: "https://redis.io/docs/latest/commands/pfcount/", note: "How Redis estimates cardinality, merges keys on read, and the memory and error figures." },
  ],
};
