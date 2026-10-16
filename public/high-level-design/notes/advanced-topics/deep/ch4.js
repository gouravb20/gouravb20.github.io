// Deep dive: Chapter 4, Count-Min Sketch and HyperLogLog: counting at scale. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch4 = {
  hook: `<p>This chapter covers two sketches that count at stream scale in fixed memory: a Count-Min Sketch estimates how often each item appeared (never underestimating), and HyperLogLog estimates how many distinct items appeared, within about 1% in 12 KB. Both merge across machines and time windows.</p>`,
  sections: [
    {
      id: "counting-at-scale",
      title: "Two counting questions that get expensive",
      kicker: "The problem",
      blocks: [
        {
          type: "text",
          html: `<p>Exact frequency ("how many times?") and cardinality ("how many different?") need memory per <em>distinct</em> item, again for every window, shard and dimension. At about 50 bytes per hash-map entry, 200 million distinct videos in an hour is about 10 GB; 300 million distinct users in a day is about 15 GB. Sketches swap that for <strong>fixed memory chosen up front</strong> and a bounded error, each answering one kind of question.</p>`,
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
          html: `<p>Keep d rows of w counters, each row with its own hash. To count an item, increment one counter per row; to estimate, read those d counters and take the <strong>minimum</strong>.</p>`,
        },
        {
          type: "keypoints",
          items: [
            "Each counter holds the sum of every item mapped to it, so it's always <strong>at least</strong> the true count: the sketch never underestimates.",
            "Several independent rows make it unlikely a rare item shares a counter with a popular one in <em>every</em> row; the minimum picks the least inflated reading.",
          ],
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
          html: `<p>Cormode and Muthukrishnan's recipe: choose error fraction &epsilon; and failure probability &delta;, then <code>w = &lceil;e / &epsilon;&rceil;, d = &lceil;ln(1/&delta;)&rceil;</code>. Each estimate exceeds the truth by at most <code>&epsilon; &middot; N</code> (N = total events) with probability 1 &minus; &delta;. Width sets the error size; depth sets confidence.</p>`,
        },
        {
          type: "keypoints",
          title: "Worked example: a billion views a day",
          items: [
            "&epsilon; = 0.001, &delta; = 0.01 gives w = 2,719, d = 5: 13,595 counters, about <strong>54 KB</strong> regardless of distinct videos.",
            "With N = 1 billion, estimates are at most 1 million too high (99% probability).",
            "That's at most 2% on a 50-million-view video, and useless for a 1,000-view one: <strong>error scales with total traffic, not the item</strong>.",
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
      title: "Top-K and merging sketches",
      kicker: "Putting it to work",
      blocks: [
        {
          type: "text",
          html: `<p>A sketch stores counters, not keys, so it can't list items. For top K, pair it with a <strong>min-heap</strong> of size K: after each increment, read the item's estimate and insert it if it beats the heap's minimum. Heavy hitters are exactly where the sketch is accurate, since &epsilon;N is small next to their counts.</p>`,
        },
        {
          type: "keypoints",
          items: [
            "<strong>Merge by adding counters</strong> cell by cell (same width, depth and hashes): the result equals a sketch of both streams. Workers keep per-minute sketches; an aggregator adds the last 60 for \"last hour\" and slides by dropping the oldest.",
            "<strong>Conservative update</strong> raises only counters equal to the current minimum, cutting overcounting but losing decrements and complicating merges.",
            "Redis Stack offers <code>CMS.INITBYPROB</code>, <code>CMS.INCRBY</code>, <code>CMS.QUERY</code>, <code>CMS.MERGE</code> and a separate <code>TOPK</code> structure; Apache DataSketches provides mergeable frequency sketches.",
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
          type: "text",
          html: `<p>Hash each item. A hash starts with r zeros with probability 2<sup>&minus;r</sup>, so a longest run of 20 leading zeros suggests about a million <em>distinct</em> values; duplicates can't set a new record. One record is noisy, so <strong>stochastic averaging</strong> splits items into m = 2<sup>p</sup> buckets by the first p hash bits, each keeping its maximum rank in a small <strong>register</strong>.</p>`,
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
          html: `<p>The 2007 estimator combines registers with a <strong>harmonic mean</strong>, damping freak highs: <code>E = &alpha;<sub>m</sub> &middot; m<sup>2</sup> / &Sigma;<sub>j</sub> 2<sup>&minus;M[j]</sup></code>, with &alpha;<sub>m</sub> &asymp; 0.7213 / (1 + 1.079/m). Small counts switch to linear counting, m &middot; ln(m / V) for V empty registers. Standard error is about <code>1.04 / &radic;m</code>: with p = 14, m = 16,384, <strong>0.81%</strong> in 16,384 6-bit registers = <strong>12 KB</strong>, for a thousand or a billion items.</p>`,
        },
        {
          type: "lab",
          id: "hyperLogLog",
          caption: "Vary the true number of distinct users and the precision p. Watch the error track 1.04/&radic;m regardless of the count, switch duplicates on to see the estimate stay put, and drop p low to see the run-to-run noise.",
        },
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
          type: "keypoints",
          items: [
            "<strong>Merge with a register-wise maximum:</strong> exactly the sketch of the combined stream. One sketch per page per day merges into any page set and date range.",
            "<strong>Intersections are a trap:</strong> inclusion-exclusion adds three estimates' errors. Two pages with 1 million visitors each and 10,000 in common give an overlap uncertain by about &plusmn;20,000.",
            "Redis <code>PFADD</code>/<code>PFCOUNT</code>/<code>PFMERGE</code> use 16,384 registers, sparse when small; <code>PFCOUNT</code> on several keys counts their union. Google's HLL++ (2013) adds a 64-bit hash and bias correction; BigQuery's <code>HLL_COUNT</code> stores sketches as values.",
            "Count-Min is accurate for <em>big</em> items; HyperLogLog's error is a fixed <em>percentage</em> at every scale.",
          ],
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
          type: "callout",
          tone: "interview",
          html: `<p>Match the sketch to the question, size it, and know when approximate is unacceptable. For "top 100 trending videos in the last hour":</p>
<ol>
<li>Partition view events by video ID through Kafka to stream workers.</li>
<li>Each worker keeps a Count-Min Sketch plus a min-heap of its local top K per one-minute bucket.</li>
<li>An aggregator adds the last 60 per-minute sketches, re-scores the union of candidates and keeps a global top K.</li>
<li>Serve from a cache refreshed every few seconds.</li>
<li>If counts feed payouts, compute exact numbers in a batch job over the raw log.</li>
</ol>
<p>For "unique visitors per page for any date range": one HyperLogLog per page per day, merged on read.</p>`,
        },
        {
          type: "compare",
          title: "Approximate or exact?",
          items: [
            { title: "Sketches are fine", tone: "ok", html: "Trending lists, dashboards, capacity planning, abuse heuristics, approximate unique reach: anywhere a 1% error is invisible and freshness matters more." },
            { title: "Must be exact", tone: "bad", html: "Billing, creator payouts, enforced quotas and rate limits, inventory, anything audited. Use exact counters or a batch job over raw events, often alongside the real-time sketch." },
          ],
        },
      ],
    },
  ],
  takeaways: [
    "Exact frequency and distinct counts cost memory per distinct item, per window, per shard; sketches swap that for fixed memory and a bounded error.",
    "A Count-Min Sketch reports the minimum of d counters: it never underestimates and overcounts by at most &epsilon;N (w = e/&epsilon;, d = ln(1/&delta;)), so it is accurate for heavy hitters; pair it with a min-heap for Top-K.",
    "HyperLogLog keeps the maximum leading-zero rank per register; standard error is about 1.04/&radic;m, 0.81% in 12 KB for Redis.",
    "Count-Min merges by adding counters, HyperLogLog by register-wise maxima, which makes per-shard, per-minute sketches the standard architecture.",
    "Unions are easy; intersections can drown in error, and anything billed or enforced needs exact counts.",
  ],
  furtherReading: [
    { title: "An Improved Data Stream Summary: The Count-Min Sketch and its Applications (Cormode and Muthukrishnan, 2005)", note: "The original analysis, including the w = e/&epsilon;, d = ln(1/&delta;) bounds." },
    { title: "HyperLogLog: the analysis of a near-optimal cardinality estimation algorithm (Flajolet, Fusy, Gandouet and Meunier, 2007)", note: "The estimator, the bias constant and the small-range correction." },
    { title: "HyperLogLog in Practice: Algorithmic Engineering of a State of The Art Cardinality Estimation Algorithm (Heule, Nunkesser and Hall, EDBT 2013)", note: "Google's HLL++ improvements." },
    { title: "Redis PFCOUNT command reference", url: "https://redis.io/docs/latest/commands/pfcount/", note: "How Redis estimates cardinality, merges keys on read, and the memory and error figures." },
  ],
};
