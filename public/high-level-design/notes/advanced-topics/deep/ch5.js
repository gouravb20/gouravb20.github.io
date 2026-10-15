// Deep dive: Chapter 5, Morris counter: approximate counting in log log n bits. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch5 = {
  hook: `<p>Your cache holds 500 million keys, and the eviction policy wants to know which ones are popular. The natural answer is an access counter per key. A 32-bit counter is only 4 bytes, but 500 million of them is 2 GB of RAM spent on bookkeeping rather than data, and most of those counters will never pass a few hundred.</p>
<p>Eviction does not care whether a key was read 1,041,227 times or 1,100,000 times. It cares whether a key was read about a thousand times or about a million times. If you only need the <em>order of magnitude</em>, you can store something like the logarithm of the count instead, and a single byte reaches astronomically high. The catch is that a logarithm can't be incremented by one. Robert Morris's 1978 answer was to increment it <strong>at random</strong>, and that small idea is the subject of this chapter.</p>`,
  sections: [
    {
      id: "small-registers",
      title: "When even a counter is too big",
      kicker: "The problem",
      blocks: [
        {
          type: "problem",
          html: `<p>An exact counter that must reach n needs log<sub>2</sub> n bits. Eight bits stop at 255; 16 at 65,535; 32 at about 4.3 billion. A single counter is cheap, but systems that keep one counter per key, per network flow or per word sequence have millions or billions of them, and some counters live in tiny hardware registers where every bit is precious.</p>`,
        },
        {
          type: "text",
          html: `<p>The arithmetic is unforgiving. Five hundred million keys at 4 bytes each is 2 GB; at 1 byte each it is 500 MB. A language-model n-gram table with billions of entries pays the same multiplier. Shaving bytes off each counter is often the difference between fitting in memory and not.</p>
<p>The way out is to notice that many uses only need <strong>relative</strong> accuracy. "Roughly 10,000, give or take 10%" is just as useful as the exact figure for ranking, eviction or monitoring. A counter whose error is a fixed <em>fraction</em> of the true count can have far fewer distinct states than one that tracks every single event, and fewer states means fewer bits.</p>`,
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
      ],
    },
    {
      id: "coin-flip",
      title: "The obvious idea: count only some of the events",
      kicker: "A first attempt",
      blocks: [
        {
          type: "text",
          html: `<p>The simplest approximate counter is a sampling, or coin-flip, counter. On every event, increment the register with a fixed probability p; to read it, divide by p. With p = 1/2, an 8-bit register counts to about 510 instead of 255. The register follows a binomial distribution, so its mean is np and its standard deviation is &radic;(np(1 &minus; p)), which gives a relative error of</p>
<p><span class="formula">relative error of a coin-flip counter = &radic;((1 &minus; p) / (np))</span></p>`,
        },
        {
          type: "text",
          html: `<p>Worked example with p = 1/2. After 400 events the register averages 200 with a standard deviation of 10, so the estimate 2v averages 400 with a standard deviation of 20: a 5% error. After only 10 events the register's standard deviation is about 1.6, so the estimate is off by about 3 events, roughly 30%. The error shrinks as n grows, which sounds good until you look at range.</p>
<p>The range only grows <em>linearly</em> in 1/p. To count to a billion in one byte you need p &asymp; 255 / 10<sup>9</sup>, about 1 in 3.9 million. Now look at a key with a million hits: its register's expected value is about 0.26, so it almost always reads 0 (an estimate of zero) and occasionally 1 (an estimate of 3.9 million). Every count below a few million is noise. A fixed probability can serve small counts or huge ranges, never both.</p>`,
        },
        {
          type: "lab",
          id: "coinFlipCounter",
          caption: "Give both counters one byte. Pick a coin-flip probability and a Morris parameter, then sweep the true count: the coin-flip counter is hopeless at small counts and overflows at large ones, while the Morris counter's relative error stays in one band across every scale.",
        },
        {
          type: "compare",
          items: [
            { title: "Coin flip, fixed p", tone: "warn", html: "Error is roughly a fixed number of events, about &radic;(n(1 &minus; p)/p), so it is huge relative to small counts. The range is 255/p in a byte: a linear stretch." },
            { title: "Morris, shrinking p", tone: "ok", html: "Error is a fixed fraction of n at every scale. The range grows exponentially with the register, so a byte reaches beyond any count you will ever see." },
          ],
        },
        {
          type: "quiz",
          q: "A coin-flip counter with p = 1/1,000 has seen 1,000 events. What will its estimate usually be?",
          options: [
            "Very close to 1,000",
            "Usually 0, 1,000 or 2,000, because the register holds 0, 1 or 2 most of the time",
            "Exactly 1,000, since the expected value is unbiased",
            "About 31,600",
          ],
          answer: 1,
          explain: "The register is binomial with mean np = 1. It is 0 about 37% of the time, 1 about 37% and 2 about 18%, so the estimate jumps between 0, 1,000 and 2,000. It is unbiased on average but useless for any single reading at this scale.",
        },
      ],
    },
    {
      id: "store-the-logarithm",
      title: "Morris's idea: store the exponent, increment at random",
      kicker: "The key idea",
      blocks: [
        {
          type: "idea",
          html: `<p>Keep v, roughly log<sub>2</sub>(1 + n), instead of n. The counter can't see n, so it decides on each event, at random, whether this event is the one that should push v up a step. At v the next step stands for 2<sup>v</sup> more events, so increment with probability <strong>2<sup>&minus;v</sup></strong>.</p>`,
        },
        {
          type: "steps",
          title: "The base-2 Morris counter",
          items: [
            "Start with v = 0.",
            "On each event, draw a uniform random number r in [0, 1). If r &lt; 2<sup>&minus;v</sup>, set v = v + 1. At v = 0 that always happens, at v = 1 half the time, at v = 2 a quarter of the time, and so on.",
            "To read the counter, report n&#770; = 2<sup>v</sup> &minus; 1.",
          ],
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
          html: `<p>The general recipe behind the rule is worth remembering, because every variant follows it. Decide what count n(v) each register value should represent. Then increment with probability</p>
<p><span class="formula">P(increment at v) = 1 / (n(v + 1) &minus; n(v))</span></p>
<p>the reciprocal of how many events one step is worth. For n(v) = 2<sup>v</sup> &minus; 1 the gap is 2<sup>v</sup>, giving 2<sup>&minus;v</sup>. Big steps get rare increments, so on average the register climbs exactly as fast as the count it represents.</p>`,
        },
        {
          type: "code",
          lang: "python",
          title: "A Morris counter",
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
          caption: "With a = 1 the base is 2, the probability is 2^-v and the estimate is 2^v - 1. The parameter a is explained two sections down.",
        },
      ],
    },
    {
      id: "unbiased-and-error",
      title: "Why it is right on average, and how wrong a single run is",
      kicker: "The maths",
      blocks: [
        {
          type: "text",
          html: `<p>Track the quantity X = 2<sup>v</sup>, which starts at 1. On any event, with probability 2<sup>&minus;v</sup> it doubles from 2<sup>v</sup> to 2<sup>v+1</sup>, a rise of 2<sup>v</sup>; otherwise it stays put. Its expected rise per event is therefore</p>
<p><span class="formula">E[&Delta;X] = 2<sup>&minus;v</sup> &middot; 2<sup>v</sup> = 1</span></p>
<p>whatever v happens to be. Each event adds exactly 1 to the expectation, so after n events E[X] = n + 1, and the estimate 2<sup>v</sup> &minus; 1 has expected value exactly n. The counter is <strong>unbiased</strong> at every n, even though it never looks at n.</p>`,
        },
        {
          type: "text",
          html: `<h3>The spread</h3>
<p>Unbiased is not the same as accurate. For the base-2 counter the variance of the estimate works out to</p>
<p><span class="formula">Var(n&#770;) = n(n &minus; 1) / 2 &nbsp;&rArr;&nbsp; standard deviation &asymp; 0.71 n</span></p>
<p>The absolute error grows with n, but as a fraction of n it stays fixed: about 71% whether you have counted a thousand events or a trillion. That is precisely the property Morris wanted, a relative error that does not depend on scale. The number itself, though, is far too loose for most uses. Worked example: after 1,000 events a single base-2 counter has a standard deviation of about 707, so readings of 255 or 2,047 (v = 8 or v = 11) are entirely normal.</p>`,
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
      title: "Making it accurate: a smaller base, or more counters",
      kicker: "Tuning",
      blocks: [
        {
          type: "text",
          html: `<p>Morris also gave a family of counters with a tunable base. Pick a parameter a; the base becomes 1 + 1/a, and</p>
<p><span class="formula">P(increment) = (1 + 1/a)<sup>&minus;v</sup> &nbsp;&nbsp; n&#770; = a &middot; ((1 + 1/a)<sup>v</sup> &minus; 1)</span></p>
<p>With a = 1 this is the base-2 counter. A larger a means a base closer to 1, so each step stands for a smaller multiplicative jump and the random walk is smoother. The variance becomes n(n &minus; 1)/(2a), so the relative standard error is about <span class="formula">1 / &radic;(2a)</span>.</p>
<p>The cost is range. A smaller base means the register must climb higher to reach the same count, roughly a &middot; ln(n/a) steps for large n. In 8 bits (v &le; 255), a = 30 gives about 12.9% error and reaches about 128,000; widen the register to 10 bits and the same a reaches past a billion.</p>`,
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
          type: "text",
          html: `<h3>The second knob: averaging</h3>
<p>Run k independent counters on the same events and average their estimates. Independent errors partly cancel, so the variance falls by a factor of k and the relative error to about 1/&radic;(2ak). For guarantees that hold with high probability rather than just on average, take the <em>median</em> of several such averages, the standard "median of means" trick.</p>
<p>Which knob is cheaper? Compare bits for roughly 13% error with a range above 100,000. One counter with a = 30 does it in 8 bits. Averaging base-2 counters needs 1/&radic;(2k) &asymp; 0.13, so about 30 counters of 5 bits each, around 150 bits. Per bit, shrinking the base wins by a wide margin; averaging earns its place when you want tight probability bounds or can't change the counter's base.</p>`,
        },
        {
          type: "lab",
          id: "morrisCounter",
          caption: "Each line is one counter, or the average of k counters, fed the same stream. Try a = 1 and watch the wild early jumps, then raise a or k and see the band of estimate &divide; true count narrow while it stays centred on 1.",
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
      id: "where-used",
      title: "Where approximate counters earn their place",
      kicker: "Real systems",
      blocks: [
        {
          type: "text",
          html: `<p>Morris counters have a second, less obvious advantage: they rarely <strong>write</strong>. Over n events the register changes only about log n times (more with larger a); every other event is a random draw that leaves memory untouched. That matters when a write is the expensive part, such as counters in flash memory that wears out with writes, or shared counters where each update forces a cache line to move between CPU cores.</p>
<p>The best-known production example is Redis's LFU eviction policy. Each key keeps an 8-bit logarithmic access counter next to a 16-bit timestamp, squeezed into space Redis already uses per object. New keys start at 5 so they aren't evicted the moment they arrive. On each access the counter is raised with a probability of roughly 1 / ((c &minus; 5) &times; <code>lfu-log-factor</code> + 1), so the higher it is, the harder it is to raise. With the default factor of 10, by about a million hits the counter has saturated at 255.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Redis", title: "LFU eviction", html: "With <code>maxmemory-policy allkeys-lfu</code>, Redis samples a few keys and evicts the one with the lowest counter. The counter also decays as time passes without access, controlled by <code>lfu-decay-time</code> (default 1 minute), so last week's hot keys can eventually leave. The increment schedule differs from Morris's exponential one, but the principle of an increment probability that shrinks as the counter grows is the same." },
            { org: "Networking and streaming", title: "Per-flow statistics", html: "Routers and measurement systems that track packets or bytes for huge numbers of flows use approximate counters to fit the counters into fast, small memory." },
            { org: "Language models", title: "n-gram counts", html: "Tables of word-sequence counts with billions of entries only need counts to within a factor, so small logarithmic counters shrink them substantially." },
          ],
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
          type: "callout",
          tone: "warning",
          html: `<p>Don't use one for anything billed, audited, enforced as a quota or tracked as inventory. And don't use one when you only have a handful of counters: a 64-bit integer in a database row costs nothing and is exact. The savings only appear when there are millions of counters or the bits physically aren't there.</p>`,
        },
      ],
    },
    {
      id: "interview",
      title: "Using approximate counters in a design interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "text",
          html: `<p>Morris counters rarely headline a design question, but they make a strong supporting point in cache design (LFU eviction), analytics with per-key counters, and any discussion of memory budgets at the scale of hundreds of millions of keys. They are also a common "explain this algorithm" question because the unbiasedness argument fits on a whiteboard.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>For "store access-frequency counters for 500 million cache keys", a strong answer covers:</p>
<ol>
<li><strong>The budget:</strong> 32-bit counters are about 2 GB; eviction only needs rough popularity, so use one byte per key, about 500 MB.</li>
<li><strong>The counter:</strong> a logarithmic counter incremented with a probability that falls as it grows, so one byte represents up to about a million hits.</li>
<li><strong>Ageing:</strong> keep a coarse last-access time beside it and decay the counter by elapsed time, or yesterday's hot keys never leave.</li>
<li><strong>Eviction:</strong> sample a few keys and evict the lowest counter, rather than maintaining a global order.</li>
</ol>
<p>If asked to explain the algorithm, give the rule (increment with probability 2<sup>&minus;v</sup>, estimate 2<sup>v</sup> &minus; 1), the one-line unbiasedness argument, and the two accuracy knobs: a larger a or averaging k counters.</p>`,
        },
        {
          type: "keypoints",
          items: [
            "Coin-flip counters scale their range linearly and are useless for small counts; Morris counters keep a constant relative error at every scale.",
            "Space is O(log log n): counting to 2<sup>32</sup> needs v &le; 32, which fits in 6 bits.",
            "\"Page views\" is a Morris-style question; \"unique visitors\" is a HyperLogLog question.",
          ],
        },
        {
          type: "quiz",
          q: "An interviewer asks how many bits a base-2 Morris counter needs to count to about a trillion (roughly 2^40). What's the answer?",
          options: ["40 bits", "About 20 bits", "6 bits", "2 bits"],
          answer: 2,
          explain: "The register only needs to reach about log2(2^40) = 40, and any value up to 63 fits in 6 bits. That is the log log n saving: 6 bits instead of the 40 an exact counter would need.",
        },
      ],
    },
  ],
  takeaways: [
    "An exact counter needs log<sub>2</sub> n bits; a Morris counter stores roughly log<sub>2</sub> n instead, which takes only about log<sub>2</sub> log<sub>2</sub> n bits.",
    "Coin-flip counters use a fixed probability, so their range grows only linearly and small counts drown in noise.",
    "Morris increments with probability 2<sup>&minus;v</sup> and estimates 2<sup>v</sup> &minus; 1; each event raises E[2<sup>v</sup>] by exactly 1, so the estimate is unbiased.",
    "The base-2 counter's error is about 71% of n at every scale. A base of 1 + 1/a cuts it to about 1/&radic;(2a) at the cost of range; averaging k counters divides the variance by k.",
    "The register changes only about log n times, which helps where writes are expensive.",
    "Redis's LFU eviction uses an 8-bit logarithmic counter per key with time decay; anything billed or enforced still needs exact counts.",
  ],
  furtherReading: [
    { title: "Counting Large Numbers of Events in Small Registers (Robert Morris, Communications of the ACM, 1978)", note: "The original paper, including the generalized base." },
    { title: "Approximate Counting: A Detailed Analysis (Philippe Flajolet, BIT, 1985)", note: "A precise analysis of the counter's mean and variance." },
    { title: "Space-Efficient Counting: Exploring Morris' Algorithm (Arpit Bhayani)", url: "https://arpitbhayani.me/blogs/morris-counter/", note: "The essay this chapter's notes are based on, with derivations and plots." },
    { title: "Redis documentation: key eviction, and the LFU section of redis.conf", note: "The LFU policy, lfu-log-factor and lfu-decay-time." },
  ],
};
