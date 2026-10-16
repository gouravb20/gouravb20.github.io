// Deep dive: Chapter 5, Morris counter: approximate counting in log log n bits. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch5 = {
  hook: `<p>This chapter explains the Morris counter, which stores roughly the logarithm of a count and increments it at random, so one byte can count to astronomical numbers with a fixed relative error. It matters when you keep millions of counters, such as per-key popularity for cache eviction.</p>`,
  sections: [
    {
      id: "small-registers",
      title: "When even a counter is too big",
      kicker: "The problem",
      blocks: [
        {
          type: "text",
          html: `<p>An exact counter to n needs log<sub>2</sub> n bits. Five hundred million keys at 4 bytes is 2 GB; at 1 byte, 500 MB. Ranking, eviction and monitoring only need <strong>relative</strong> accuracy ("roughly 10,000, give or take 10%"), and a counter whose error is a fixed fraction needs far fewer states, so far fewer bits.</p>`,
        },
        {
          type: "diagram",
          title: "Bits needed to count to n",
          caption: "An exact counter needs about log<sub>2</sub> n bits. A base-2 Morris register only needs to reach about log<sub>2</sub> n, which takes about log<sub>2</sub> log<sub>2</sub> n bits: 6 bits are enough for a quintillion.",
          svg: `<svg viewBox="0 0 640 260" role="img" aria-label="Bar chart comparing bits for an exact counter and a Morris register at four counts">
<rect x="150" y="18" width="14" height="14" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="170" y="30" font-size="12">exact counter</text>
<rect x="290" y="18" width="14" height="14" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<text x="310" y="30" font-size="12">Morris register (base 2)</text>
<g font-size="13" text-anchor="end">
<text x="140" y="74">1 thousand</text>
<text x="140" y="124">1 million</text>
<text x="140" y="174">1 billion</text>
<text x="140" y="224">1 quintillion</text>
</g>
<g stroke-width="1.5">
<rect x="150" y="56" width="70" height="16" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="150" y="76" width="28" height="16" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<rect x="150" y="106" width="140" height="16" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="150" y="126" width="35" height="16" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<rect x="150" y="156" width="210" height="16" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="150" y="176" width="35" height="16" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<rect x="150" y="206" width="420" height="16" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="150" y="226" width="42" height="16" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
</g>
<g font-size="12">
<text x="226" y="69">10 bits</text><text x="184" y="89" style="fill: var(--dg-muted)">4 bits</text>
<text x="296" y="119">20 bits</text><text x="191" y="139" style="fill: var(--dg-muted)">5 bits</text>
<text x="366" y="169">30 bits</text><text x="191" y="189" style="fill: var(--dg-muted)">5 bits</text>
<text x="576" y="219">60 bits</text><text x="198" y="239" style="fill: var(--dg-muted)">6 bits</text>
</g>
</svg>`,
        },
        {
          type: "text",
          html: `<p>The obvious first try is a <strong>coin-flip counter</strong>: increment with fixed probability p, report the register divided by p. Its relative error is <code>&radic;((1 &minus; p) / (np))</code>, and its range is only 255/p in a byte. To reach a billion in one byte, p &asymp; 1 in 3.9 million, so a key with a million hits almost always reads 0 and occasionally 3.9 million.</p>`,
        },
        {
          type: "lab",
          id: "coinFlipCounter",
          caption: "Give both counters one byte. Pick a coin-flip probability and a Morris parameter, then sweep the true count: the coin-flip counter is hopeless at small counts and overflows at large ones, while the Morris counter's relative error stays in one band across every scale.",
        },
        {
          type: "compare",
          items: [
            { title: "Coin flip, fixed p", tone: "warn", html: "Error is roughly a fixed number of events, about &radic;(n(1 &minus; p)/p), so it's huge for small counts. Range stretches only linearly in 1/p." },
            { title: "Morris, shrinking p", tone: "ok", html: "Error is a fixed fraction of n at every scale. Range grows exponentially with the register, so a byte reaches beyond any real count." },
          ],
        },
      ],
    },
    {
      id: "store-the-logarithm",
      title: "Store the exponent, increment at random",
      kicker: "The key idea",
      blocks: [
        {
          type: "idea",
          html: `<p>Keep v &asymp; log<sub>2</sub>(1 + n). At v, the next step represents 2<sup>v</sup> more events, so increment with probability <strong>2<sup>&minus;v</sup></strong> and report <strong>2<sup>v</sup> &minus; 1</strong> (Robert Morris, 1978).</p>`,
        },
        {
          type: "diagram",
          title: "Each step up is rarer and stands for more events",
          caption: "The expected path of a base-2 Morris counter. The number on each flat stretch is the chance that one event raises v. On average v reaches 1, 2, 3, 4, 5 after 1, 3, 7, 15 and 31 events, which are exactly the estimates 2<sup>v</sup> &minus; 1.",
          svg: `<svg viewBox="0 0 640 290" role="img" aria-label="A staircase showing the register value rising after exponentially longer runs of events">
<line x1="70" y1="240" x2="610" y2="240" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<line x1="70" y1="240" x2="70" y2="50" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<g font-size="12" text-anchor="end" style="fill: var(--dg-muted)">
<text x="60" y="244">0</text><text x="60" y="208">1</text><text x="60" y="172">2</text><text x="60" y="136">3</text><text x="60" y="100">4</text><text x="60" y="64">5</text>
</g>
<text x="20" y="36" font-size="12" style="fill: var(--dg-muted)">register v</text>
<text x="130" y="36" font-size="12" style="fill: var(--dg-muted)">number on each step: chance that one event raises v</text>
<path d="M70,240 H86 V204 H118 V168 H182 V132 H310 V96 H566 V60 H600" fill="none" stroke-width="3" style="stroke: var(--dg-2)"/>
<g font-size="12" text-anchor="middle" font-weight="700">
<text x="78" y="232">1</text>
<text x="102" y="196">1/2</text>
<text x="150" y="160">1/4</text>
<text x="246" y="124">1/8</text>
<text x="438" y="88">1/16</text>
<text x="583" y="52">1/32</text>
</g>
<g stroke-width="1" stroke-dasharray="3 3" style="stroke: var(--dg-line)">
<line x1="86" y1="204" x2="86" y2="240"/><line x1="118" y1="168" x2="118" y2="240"/><line x1="182" y1="132" x2="182" y2="240"/><line x1="310" y1="96" x2="310" y2="240"/><line x1="566" y1="60" x2="566" y2="240"/>
</g>
<g font-size="12" text-anchor="middle">
<text x="86" y="258">1</text><text x="118" y="258">3</text><text x="182" y="258">7</text><text x="310" y="258">15</text><text x="566" y="258">31</text>
</g>
<text x="610" y="280" font-size="12" text-anchor="end" style="fill: var(--dg-muted)">events seen (expected), equal to the estimate 2^v &#8722; 1</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>The general recipe behind every variant: decide the count n(v) each register value represents, then increment with probability <code>1 / (n(v + 1) &minus; n(v))</code>, the reciprocal of what one step is worth. Big steps get rare increments, so on average the register climbs as fast as the count.</p>`,
        },
        {
          type: "code",
          lang: "python",
          title: "A Morris counter (a = 1 is base 2: probability 2^-v, estimate 2^v - 1)",
          code: `import random

class MorrisCounter:
    def __init__(self, a=1.0):
        self.a = a      # a = 1 is the base-2 counter; larger a means smaller steps
        self.v = 0      # the only state

    def increment(self):
        base = 1 + 1 / self.a
        if random.random() < base ** -self.v:
            self.v += 1

    def estimate(self):
        base = 1 + 1 / self.a
        return self.a * (base ** self.v - 1)`,
        },
      ],
    },
    {
      id: "unbiased-and-error",
      title: "Right on average, loose in any single run",
      kicker: "The maths",
      blocks: [
        {
          type: "text",
          html: `<p>Track X = 2<sup>v</sup>, starting at 1. With probability 2<sup>&minus;v</sup> it rises by 2<sup>v</sup>, so <code>E[&Delta;X] = 2<sup>&minus;v</sup> &middot; 2<sup>v</sup> = 1</code> whatever v is. After n events E[X] = n + 1, so the estimate is <strong>unbiased</strong> at every n.</p>
<p>The spread is large: <code>Var(n&#770;) = n(n &minus; 1) / 2</code>, a standard deviation of about <strong>0.71 n</strong> at every scale. After 1,000 events, readings of 255 or 2,047 are normal.</p>`,
        },
        {
          type: "table",
          title: "The base-2 counter, step by step",
          headers: ["Register v", "Estimate 2<sup>v</sup> &minus; 1", "Chance an event raises v", "Expected events to the next step"],
          rows: [
            ["0", "0", "1", "1"],
            ["1", "1", "1/2", "2"],
            ["4", "15", "1/16", "16"],
            ["10", "1,023", "1/1,024", "1,024"],
            ["20", "~1 million", "~1 in a million", "~1 million"],
            ["30", "~1 billion", "~1 in a billion", "~1 billion"],
          ],
          note: "Only about log2 n increments happen in n events; every other event is a random draw that changes nothing.",
        },
        {
          type: "quiz",
          q: "Why does incrementing with probability 2^-v make the estimate 2^v - 1 unbiased?",
          options: [
            "Because v is always close to log2 n",
            "Because each event raises the expected value of 2^v by exactly 1: it doubles with probability 2^-v, a rise of 2^v",
            "Because random errors cancel out after many events",
            "Because the register can never overflow",
          ],
          answer: 1,
          explain: "With probability 2^-v the quantity 2^v grows by 2^v, so its expected growth per event is 1 regardless of v. After n events its expectation is n + 1, so E[2^v - 1] = n. Being close to log2 n is a consequence, not the reason.",
        },
      ],
    },
    {
      id: "tuning-accuracy",
      title: "Tuning accuracy, and where it's used",
      kicker: "Tuning and real systems",
      blocks: [
        {
          type: "text",
          html: `<p>With a parameter a, the base becomes 1 + 1/a: <code>P(increment) = (1 + 1/a)<sup>&minus;v</sup>, n&#770; = a &middot; ((1 + 1/a)<sup>v</sup> &minus; 1)</code>. Variance becomes n(n &minus; 1)/(2a), a relative error of about <code>1 / &radic;(2a)</code>, but the register climbs roughly a &middot; ln(n/a) steps, so range shrinks.</p>`,
        },
        {
          type: "table",
          title: "Choosing a for an 8-bit register",
          headers: ["a", "Relative std error 1/&radic;(2a)", "Largest count at v = 255"],
          rows: [
            ["1", "70.7%", "5.8 &times; 10<sup>76</sup>"],
            ["2", "50%", "1.6 &times; 10<sup>45</sup>"],
            ["8", "25%", "8.9 &times; 10<sup>13</sup>"],
            ["30", "12.9%", "~128,000"],
            ["50", "10%", "~7,700"],
            ["128", "6.3%", "~800"],
          ],
          note: "Choose the largest a whose range still covers your biggest expected count, or add bits.",
        },
        {
          type: "keypoints",
          items: [
            "<strong>Averaging</strong> k independent counters cuts relative error to about 1/&radic;(2ak); a median of means gives high-probability bounds. Per bit, a smaller base wins: a = 30 gets 13% in 8 bits, versus about 30 five-bit base-2 counters (150 bits).",
            "<strong>Rare writes:</strong> the register changes only about log n times, useful where writes wear flash or bounce cache lines between cores.",
            "<strong>Redis LFU</strong> (<code>allkeys-lfu</code>) keeps an 8-bit logarithmic counter plus a 16-bit timestamp per key. New keys start at 5; increments happen with probability about 1 / ((c &minus; 5) &times; <code>lfu-log-factor</code> + 1), saturating at 255 around a million hits with the default factor 10, and <code>lfu-decay-time</code> (default 1 minute) ages counters.",
          ],
        },
        {
          type: "lab",
          id: "morrisCounter",
          caption: "Each line is one counter, or the average of k counters, fed the same stream. Try a = 1 and watch the wild early jumps, then raise a or k and see the band of estimate &divide; true count narrow while it stays centred on 1.",
        },
        {
          type: "table",
          title: "Three approximate counters, three questions",
          headers: ["Structure", "Question it answers", "Repeats", "Memory"],
          rows: [
            ["Morris counter", "How many events in total?", "Counted", "log log n bits per counter"],
            ["HyperLogLog", "How many distinct items?", "Ignored", "12 KB for ~0.81% error"],
            ["Count-Min Sketch", "How many times did each item appear?", "Counted", "d &times; w shared counters"],
          ],
          note: "They combine: a Count-Min Sketch can store small Morris-style counters in its cells to save even more space.",
        },
        {
          type: "quiz",
          q: "You need a counter per key that reaches at least 100,000 with roughly 13% relative error, and you have 8 bits per key. What do you choose?",
          options: [
            "A base-2 Morris counter (a = 1)",
            "A single Morris counter with a = 30",
            "A coin-flip counter with p = 1/400",
            "A single Morris counter with a = 128",
          ],
          answer: 1,
          explain: "a = 30 gives 1/&radic;60 &asymp; 12.9% error and reaches about 128,000 at v = 255. a = 1 is far too noisy (71%), a = 128 tops out near 800, and a coin flip with p = 1/400 would be extremely noisy for small counts.",
        },
      ],
    },
    {
      id: "interview",
      title: "Using approximate counters in a design interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "callout",
          tone: "interview",
          html: `<p>For "access-frequency counters for 500 million cache keys", a strong answer covers:</p>
<ol>
<li><strong>Budget:</strong> 32-bit counters are about 2 GB; eviction only needs rough popularity, so one byte per key, about 500 MB.</li>
<li><strong>Counter:</strong> logarithmic, incremented with a probability that falls as it grows, so a byte represents up to about a million hits.</li>
<li><strong>Ageing:</strong> a coarse last-access time beside it, decaying the counter, or yesterday's hot keys never leave.</li>
<li><strong>Eviction:</strong> sample a few keys and evict the lowest counter.</li>
<li><strong>If asked for the algorithm:</strong> increment with probability 2<sup>&minus;v</sup>, estimate 2<sup>v</sup> &minus; 1, the one-line unbiasedness argument, and the two knobs (larger a, or averaging k counters).</li>
</ol>`,
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p>Not for anything billed, audited, enforced or tracked as inventory, and pointless for a handful of counters where a 64-bit integer is exact and free. \"Page views\" is a Morris question; \"unique visitors\" is a HyperLogLog question.</p>`,
        },
      ],
    },
  ],
  takeaways: [
    "A Morris counter stores roughly log<sub>2</sub> n, so it needs only about log<sub>2</sub> log<sub>2</sub> n bits; coin-flip counters scale range only linearly and drown small counts in noise.",
    "Increment with probability 2<sup>&minus;v</sup> and estimate 2<sup>v</sup> &minus; 1; each event raises E[2<sup>v</sup>] by exactly 1, so the estimate is unbiased.",
    "The base-2 error is about 71% of n at every scale; a base of 1 + 1/a cuts it to about 1/&radic;(2a) at the cost of range, and averaging k counters divides the variance by k.",
    "The register changes only about log n times, which helps where writes are expensive.",
    "Redis LFU eviction uses an 8-bit logarithmic counter per key with time decay; anything billed or enforced still needs exact counts.",
  ],
  furtherReading: [
    { title: "Counting Large Numbers of Events in Small Registers (Robert Morris, Communications of the ACM, 1978)", note: "The original paper, including the generalized base." },
    { title: "Approximate Counting: A Detailed Analysis (Philippe Flajolet, BIT, 1985)", note: "A precise analysis of the counter's mean and variance." },
    { title: "Space-Efficient Counting: Exploring Morris' Algorithm (Arpit Bhayani)", url: "https://arpitbhayani.me/blogs/morris-counter/", note: "The essay this chapter's notes are based on, with derivations and plots." },
    { title: "Redis documentation: key eviction, and the LFU section of redis.conf", note: "The LFU policy, lfu-log-factor and lfu-decay-time." },
  ],
};
