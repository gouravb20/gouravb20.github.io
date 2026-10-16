// Deep dive: Chapter 7, The practicalities of persistent state. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch7 = {
  hook: `<p>An ad network wants to know which ad led to each purchase. A shopper sees a banner at 12:00, clicks through to a shoes page, browses to checkout, and buys at 12:05. The stream processor has to connect that purchase back to the banner, for millions of shoppers, all day, without stopping.</p>
<p>Two things get in the way. First, the events do not arrive in order: the purchase can show up before the click that led to it, because the click was logged by a slower server. Second, machines fail. If a worker crashes at 3 p.m., the pipeline cannot rerun everything since midnight, and it must not credit the same purchase twice when it recovers.</p>
<p>Both problems are about <strong>state</strong>: what the pipeline remembers between events, where it keeps it, and when it acts on it. This chapter walks through the three forms state takes, from the simplest (keep every input) to the most flexible (your own data structures plus timers), and shows why the attribution problem needs the last one.</p>`,
  sections: [
    {
      id: "why-state",
      title: "Why pipelines need persistent state",
      kicker: "Motivation",
      blocks: [
        {
          type: "problem",
          html: `<p>A batch job that fails can be rerun from the start: its input is finite and still on disk. An unbounded stream has no start you can afford to go back to, and no end at which you could rerun. Losing a worker's memory means either losing data or reprocessing an ever-growing history.</p>`,
        },
        {
          type: "text",
          html: `<p>Persistent state solves two separate problems. The first is <strong>correctness despite failures</strong>: if partial results survive a crash, the pipeline can resume without dropping inputs or counting them twice. The second is <strong>efficiency</strong>: if a running count is kept, the next event costs one addition, not a recount of everything seen so far.</p>
<p>Recovery always rests on two ingredients working together. The input must be <strong>replayable</strong>: a set of files, or a log such as Kafka where you can rewind to an offset. And the state must be <strong>checkpointed</strong>: written to durable storage along with the input position it reflects. After a crash, the system loads the last checkpoint and replays input from the position recorded in it. Only the work done since that checkpoint is repeated.</p>`,
        },
        {
          type: "diagram",
          title: "Checkpoints bound how much work a crash costs",
          caption: "The input log is replayable. Each checkpoint saves state together with the input offset it covers. After the crash, the worker restores checkpoint 2 and replays only the records after it.",
          svg: `<svg viewBox="0 0 600 190" role="img" aria-label="A replayable input log with two checkpoints and a crash; only records after the second checkpoint are replayed">
<text x="40" y="24" font-size="13" font-weight="700">Input log (replayable)</text>
<rect x="40" y="70" width="36" height="30" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="80" y="70" width="36" height="30" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="120" y="70" width="36" height="30" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="160" y="70" width="36" height="30" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="200" y="70" width="36" height="30" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="240" y="70" width="36" height="30" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="280" y="70" width="36" height="30" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="320" y="70" width="36" height="30" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="360" y="70" width="36" height="30" rx="4" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<rect x="400" y="70" width="36" height="30" rx="4" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<rect x="440" y="70" width="36" height="30" rx="4" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<rect x="480" y="70" width="36" height="30" rx="4" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<rect x="520" y="70" width="36" height="30" rx="4" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<line x1="198" y1="58" x2="198" y2="110" style="stroke: var(--dg-ok)" stroke-width="3"/>
<text x="198" y="50" text-anchor="middle" font-size="12">checkpoint 1</text>
<line x1="358" y1="58" x2="358" y2="110" style="stroke: var(--dg-ok)" stroke-width="3"/>
<text x="358" y="50" text-anchor="middle" font-size="12">checkpoint 2</text>
<line x1="472" y1="58" x2="484" y2="44" style="stroke: var(--dg-bad)" stroke-width="3"/>
<line x1="472" y1="44" x2="484" y2="58" style="stroke: var(--dg-bad)" stroke-width="3"/>
<text x="492" y="56" font-size="12" style="fill: var(--dg-bad)">crash</text>
<path d="M40 122 L40 130 L356 130 L356 122" fill="none" style="stroke: var(--dg-1)" stroke-width="2"/>
<text x="198" y="150" text-anchor="middle" font-size="12">saved in checkpoints: not redone</text>
<path d="M360 122 L360 130 L476 130 L476 122" fill="none" style="stroke: var(--dg-3)" stroke-width="2"/>
<text x="418" y="150" text-anchor="middle" font-size="12">replayed</text>
<text x="538" y="150" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">not read yet</text>
<text x="40" y="178" font-size="12" style="fill: var(--dg-muted)">More frequent checkpoints: less replay after a crash, more overhead while healthy.</text>
</svg>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Apache Flink", title: "Barrier snapshots", html: "Flink periodically injects checkpoint barriers into its input streams. When an operator has seen the barrier on all inputs, it snapshots its state to durable storage; together with the source offsets, the snapshots form a consistent checkpoint the job can restart from. The design is inspired by the Chandy-Lamport snapshot algorithm." },
            { org: "Kafka Streams", title: "Changelog topics", html: "Each local state store is backed by a compacted Kafka topic that records every update. If an instance dies, another rebuilds the store by replaying that changelog, and input offsets are committed so processing resumes where it stopped." },
            { org: "Google MillWheel and Dataflow", title: "Per-record persistence", html: "MillWheel wrote state changes and produced records to durable storage as part of processing, and deduplicated records by id, which let it offer exactly-once processing per record. Chapter 5 covers this design." },
          ],
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>Checkpoint frequency is a dial, not a fixed property. Checkpoint every second and a crash replays at most a second of input, but you pay for writing state constantly. Checkpoint every ten minutes and steady-state cost drops, but recovery replays up to ten minutes of data, which can mean a visible latency spike.</p>`,
        },
      ],
    },
    {
      id: "raw-grouping",
      title: "Implicit state: raw grouping keeps everything",
      kicker: "The simplest form",
      blocks: [
        {
          type: "text",
          html: `<p>The most basic grouping operation, group-by-key, needs no state design at all from the user. For every key and window, the system keeps <strong>a list of every input</strong> it has received. When the trigger fires, the aggregation runs over the whole list. This is implicit state: it exists, but you never declared it.</p>
<p>It has one big virtue: it works for <em>any</em> computation. Median, top 10, "the third event after the first error": whatever you can compute from a list, you can compute from raw grouping, because the list is all there.</p>`,
        },
        {
          type: "text",
          html: `<h3>Where the cost hides</h3>
<p>Say a window receives 100,000 purchase amounts and you want their sum, with an early result every minute so a dashboard stays fresh. Raw grouping stores all 100,000 numbers. Every early firing re-sums the entire list from scratch: 10,000 numbers at the first firing, 20,000 at the second, and so on. Storage grows linearly with the input, and total compute grows roughly with the input times the number of firings.</p>
<p>Merging windows add a third cost. When two session windows merge, their lists are concatenated, so the merged window carries every element of both. And nothing can be combined before the shuffle, because the system does not know what you will compute: every single element crosses the network to the worker that owns its key.</p>`,
        },
        {
          type: "tradeoffs",
          pros: [
            "Works for any computation over the inputs",
            "No state design: the system keeps the list for you",
            "Easy to reason about: the aggregation sees exactly what arrived",
          ],
          cons: [
            "Storage grows with the number of inputs per key and window",
            "Every firing reprocesses the whole list",
            "Every element is shuffled; a hot key sends millions of records to one worker",
          ],
        },
      ],
    },
    {
      id: "incremental-combining",
      title: "Incremental combining: keep an accumulator, not a list",
      kicker: "Cheaper state",
      blocks: [
        {
          type: "idea",
          html: `<p>If the computation is <strong>commutative and associative</strong>, you don't need the list. Keep a small <strong>accumulator</strong> per key and window, fold each input into it as it arrives, and merge accumulators computed in different places. Order and grouping of the inputs no longer matter.</p>`,
        },
        {
          type: "text",
          html: `<p>Beam calls this a <code>CombineFn</code>. It has four operations: create an empty accumulator, add one input to an accumulator, merge several accumulators into one, and extract the final output from an accumulator. The classic example is an average. An average itself does not combine (the average of two averages is wrong unless the groups have equal sizes), but a pair <code>(sum, count)</code> does.</p>`,
        },
        {
          type: "code",
          lang: "java",
          title: "A mean as a combiner",
          code: `// Accumulator: (sum, count). Adding and merging are commutative and associative.
Acc create()                      { return new Acc(0, 0); }
Acc add(Acc a, double x)          { return new Acc(a.sum + x, a.count + 1); }
Acc merge(List<Acc> parts) {
  Acc out = create();
  for (Acc p : parts) out = new Acc(out.sum + p.sum, out.count + p.count);
  return out;
}
double extract(Acc a)             { return a.count == 0 ? 0 : a.sum / a.count; }

// Worker 1 sees 4, 8      -> (12, 2)
// Worker 2 sees 6         -> (6, 1)
// merge -> (18, 3) -> extract -> 6.0, in any order`,
        },
        {
          type: "text",
          html: `<p>Those two algebraic properties buy two separate wins. <strong>Incrementalization</strong>: the accumulator replaces the list, so storage is usually constant per key and window, each input is processed once, and an early firing is just an extract. <strong>Parallelization</strong>: since partial accumulators merge in any order, they can be computed anywhere, including before the shuffle.</p>
<h3>Combiner lifting and hot keys</h3>
<p>Combiner lifting is the payoff of parallelization. Each worker combines the elements it holds locally <em>before</em> the shuffle and sends one accumulator per key, instead of every element. A key that would have shipped millions of records to a single reducer ships one accumulator per upstream worker. Merging windows get cheaper too: merging two sessions merges two accumulators instead of concatenating two lists.</p>`,
        },
        {
          type: "diagram",
          title: "Combiner lifting shrinks a hot key's shuffle",
          caption: "Three workers each hold four records for the hot key K. Without lifting, all twelve cross the network to K's reducer. With lifting, each worker combines first and sends a single accumulator.",
          svg: `<svg viewBox="0 0 610 260" role="img" aria-label="Without combiner lifting twelve records are shuffled; with lifting three accumulators are shuffled">
<defs><marker id="ss7-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-ink)"/></marker></defs>
<text x="150" y="24" text-anchor="middle" font-size="13" font-weight="700">Without combiner lifting</text>
<rect x="20" y="50" width="80" height="44" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="60" y="68" text-anchor="middle" font-size="12" font-weight="700">worker 1</text>
<text x="60" y="86" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">4 × (K, 1)</text>
<rect x="110" y="50" width="80" height="44" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="150" y="68" text-anchor="middle" font-size="12" font-weight="700">worker 2</text>
<text x="150" y="86" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">4 × (K, 1)</text>
<rect x="200" y="50" width="80" height="44" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="240" y="68" text-anchor="middle" font-size="12" font-weight="700">worker 3</text>
<text x="240" y="86" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">4 × (K, 1)</text>
<line x1="60" y1="96" x2="138" y2="176" style="stroke: var(--dg-bad)" stroke-width="5" marker-end="url(#ss7-arrow)"/>
<line x1="150" y1="96" x2="150" y2="176" style="stroke: var(--dg-bad)" stroke-width="5" marker-end="url(#ss7-arrow)"/>
<line x1="240" y1="96" x2="162" y2="176" style="stroke: var(--dg-bad)" stroke-width="5" marker-end="url(#ss7-arrow)"/>
<rect x="95" y="180" width="110" height="40" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="150" y="205" text-anchor="middle" font-size="12" font-weight="700">reducer for K</text>
<text x="150" y="246" text-anchor="middle" font-size="12" style="fill: var(--dg-bad)">12 records shuffled</text>
<text x="460" y="24" text-anchor="middle" font-size="13" font-weight="700">With combiner lifting</text>
<rect x="330" y="50" width="80" height="44" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="370" y="68" text-anchor="middle" font-size="12" font-weight="700">worker 1</text>
<text x="370" y="86" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">acc (K, 4)</text>
<rect x="420" y="50" width="80" height="44" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="460" y="68" text-anchor="middle" font-size="12" font-weight="700">worker 2</text>
<text x="460" y="86" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">acc (K, 4)</text>
<rect x="510" y="50" width="80" height="44" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="550" y="68" text-anchor="middle" font-size="12" font-weight="700">worker 3</text>
<text x="550" y="86" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">acc (K, 4)</text>
<line x1="370" y1="96" x2="448" y2="176" style="stroke: var(--dg-ok)" stroke-width="2" marker-end="url(#ss7-arrow)"/>
<line x1="460" y1="96" x2="460" y2="176" style="stroke: var(--dg-ok)" stroke-width="2" marker-end="url(#ss7-arrow)"/>
<line x1="550" y1="96" x2="472" y2="176" style="stroke: var(--dg-ok)" stroke-width="2" marker-end="url(#ss7-arrow)"/>
<rect x="405" y="180" width="110" height="40" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="460" y="205" text-anchor="middle" font-size="12" font-weight="700">reducer for K</text>
<text x="460" y="246" text-anchor="middle" font-size="12" style="fill: var(--dg-ok)">3 accumulators shuffled</text>
</svg>`,
        },
        {
          type: "lab",
          id: "stateCost",
          caption: "Compare raw grouping and a CombineFn on one window with repeated early firings, measure the shuffle for a hot key with and without combiner lifting, and split a mean's (sum, count) accumulators across workers in any order.",
        },
        {
          type: "realworld",
          items: [
            { org: "Hadoop MapReduce", title: "Combiners", html: "A job can register a combiner class that runs on map output before the shuffle. It is only safe when the reduce logic is commutative and associative, which is exactly the CombineFn condition." },
            { org: "Apache Spark", title: "reduceByKey vs groupByKey", html: "<code>reduceByKey</code> combines values on each partition before shuffling; <code>groupByKey</code> ships every value and builds the full list. The Spark documentation steers users toward the former for aggregations for this reason." },
            { org: "Apache Flink", title: "AggregateFunction", html: "Flink's <code>AggregateFunction</code> has the same shape: <code>createAccumulator</code>, <code>add</code>, <code>getResult</code> and <code>merge</code>, used for incremental window aggregation." },
          ],
        },
        {
          type: "quiz",
          q: "Which of these can be written as a CombineFn with a small, fixed-size accumulator and still give an exact answer?",
          options: ["The exact median of the values", "The maximum value", "The values in arrival order", "The last value by arrival time"],
          answer: 1,
          explain: "Max is commutative and associative: the max of partial maxes is the overall max, so the accumulator is one number. An exact median needs all the values (approximate quantile sketches do combine). Arrival order and \"last arrived\" depend on ordering, which a commutative combine throws away.",
        },
      ],
    },
    {
      id: "generalized-state",
      title: "Generalized state and timers",
      kicker: "Maximum flexibility",
      blocks: [
        {
          type: "problem",
          html: `<p>Combining fails as soon as the logic needs order (what came before what), is not associative, or must cross-reference several kinds of input, such as linking purchases to clicks to ads. And even when the aggregation combines, the trigger model can be too rigid: real business logic often wants to decide for itself when to compute and emit.</p>`,
        },
        {
          type: "text",
          html: `<p>Generalized state hands those decisions to the pipeline author. It offers three kinds of flexibility.</p>
<ol>
<li><strong>Data structures.</strong> Pick a state type that fits the access pattern: a single value, a bag (append-only list), a set, or a map. Beam offers <code>ValueState</code>, <code>BagState</code>, <code>SetState</code>, <code>MapState</code> and a combining state; Flink offers <code>ValueState</code>, <code>ListState</code>, <code>MapState</code> and reducing and aggregating states.</li>
<li><strong>Read and write granularity.</strong> Touch only what you need: look up one map entry rather than loading a whole list, or append to a bag without reading it. With a disk-backed state store this is the difference between reading a few bytes and reading megabytes per event.</li>
<li><strong>Scheduling of processing.</strong> <strong>Timers</strong> bind a point in time to a callback. You decide when work happens, independently of when input arrives.</li>
</ol>`,
        },
        {
          type: "text",
          html: `<h3>Two kinds of timer</h3>
<p>An <strong>event-time timer</strong> fires when the input watermark passes its timestamp. It is completeness-driven: it means "call me once all data up to this event time has probably arrived". A <strong>processing-time timer</strong> fires when the wall clock reaches its deadline. It is latency-driven: it means "call me in 30 seconds, whatever has or hasn't arrived".</p>
<p>The difference shows up during a backlog. If the pipeline falls an hour behind, event-time timers wait, because the watermark has not advanced; they will fire with complete data once the backlog is processed. Processing-time timers fire on schedule and act on whatever partial data has been read so far.</p>`,
        },
        {
          type: "table",
          headers: ["", "Event-time timer", "Processing-time timer"],
          rows: [
            ["Fires when", "The watermark passes the timestamp", "The wall clock reaches the deadline"],
            ["Use for", "Logic that needs complete data: attribution, closing a window, final results", "Latency-bound work: periodic flushes, real-time inactivity timeouts, heartbeats"],
            ["During a backlog", "Waits for the data, so it stays correct", "Fires anyway, possibly on incomplete data"],
          ],
        },
        {
          type: "realworld",
          items: [
            { org: "Apache Beam", title: "Stateful DoFn", html: "A DoFn declares state cells with <code>@StateId</code> and timers with <code>@TimerId</code>, choosing <code>TimeDomain.EVENT_TIME</code> or <code>PROCESSING_TIME</code>. State and timers are scoped per key and window." },
            { org: "Apache Flink", title: "KeyedProcessFunction", html: "Per-key state handles plus a <code>TimerService</code> with <code>registerEventTimeTimer</code> and <code>registerProcessingTimeTimer</code>; the <code>onTimer</code> callback runs when a timer fires." },
          ],
        },
        {
          type: "compare",
          title: "Choosing a form of state",
          items: [
            { title: "Raw grouping", tone: "warn", html: "Stores every input, reprocesses all of it per firing. Use when the computation needs the full set and volumes per key are modest." },
            { title: "Incremental combining", tone: "ok", html: "Stores one accumulator, supports combiner lifting. Use whenever the aggregation is commutative and associative: counts, sums, max, means, sketches." },
            { title: "Generalized state and timers", tone: "info", html: "You choose the layout and when to compute. Use for order-dependent, cross-referencing or custom-timed logic, at the cost of more code to get right." },
          ],
        },
      ],
    },
    {
      id: "attribution",
      title: "Case study: conversion attribution",
      kicker: "State and timers in practice",
      blocks: [
        {
          type: "text",
          html: `<p>Back to the hook. Three kinds of event arrive for each user. <strong>Impressions</strong>: an ad was shown, pointing at some target URL. <strong>Visits</strong>: a page was loaded, with a referer saying which page the user came from. <strong>Goals</strong>: a visit to a page that counts as a conversion, such as an order confirmation. For each goal, the pipeline walks back through the chain of referring visits until it reaches the visit an ad pointed to, and credits that impression.</p>
<p>The real-world constraints are what make this hard: events arrive out of order, volumes are high, impressions can be spammy or duplicated and must not be credited repeatedly, and the work per event must stay small. None of that fits a CombineFn: the logic is order-dependent and cross-references three input types.</p>`,
        },
        {
          type: "diagram",
          title: "One user's path, and the order the events arrived",
          caption: "The goal is walked back along referers (arrows) to the landing-page visit, then matched to the impression that targeted it. The goal arrives first and the landing visit last, so attributing on arrival would fail.",
          svg: `<svg viewBox="0 0 620 200" role="img" aria-label="An impression, two visits and a goal in event-time order, with arrows walking back from the goal, and their out-of-order arrival">
<defs><marker id="ss7-arrow2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-ink)"/></marker></defs>
<text x="20" y="26" font-size="13" font-weight="700">Event-time order, left to right</text>
<rect x="20" y="44" width="110" height="56" rx="8" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="2"/>
<text x="75" y="66" text-anchor="middle" font-size="13" font-weight="700">Impression</text>
<text x="75" y="86" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">ad → /shoes</text>
<rect x="175" y="44" width="110" height="56" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="230" y="66" text-anchor="middle" font-size="13" font-weight="700">Visit</text>
<text x="230" y="86" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">/shoes</text>
<rect x="330" y="44" width="110" height="56" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="385" y="66" text-anchor="middle" font-size="13" font-weight="700">Visit</text>
<text x="385" y="86" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">/checkout</text>
<rect x="485" y="44" width="110" height="56" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="540" y="66" text-anchor="middle" font-size="13" font-weight="700">Goal</text>
<text x="540" y="86" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">/thanks</text>
<line x1="483" y1="72" x2="444" y2="72" style="stroke: var(--dg-ink)" stroke-width="2" marker-end="url(#ss7-arrow2)"/>
<line x1="328" y1="72" x2="289" y2="72" style="stroke: var(--dg-ink)" stroke-width="2" marker-end="url(#ss7-arrow2)"/>
<line x1="173" y1="72" x2="134" y2="72" style="stroke: var(--dg-ink)" stroke-width="2" marker-end="url(#ss7-arrow2)"/>
<text x="75" y="126" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">event 12:00</text>
<text x="230" y="126" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">event 12:01</text>
<text x="385" y="126" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">event 12:03</text>
<text x="540" y="126" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">event 12:05</text>
<text x="75" y="148" text-anchor="middle" font-size="12" font-weight="700">arrives 3rd</text>
<text x="230" y="148" text-anchor="middle" font-size="12" font-weight="700" style="fill: var(--dg-bad)">arrives 4th</text>
<text x="385" y="148" text-anchor="middle" font-size="12" font-weight="700">arrives 2nd</text>
<text x="540" y="148" text-anchor="middle" font-size="12" font-weight="700" style="fill: var(--dg-bad)">arrives 1st</text>
<text x="20" y="184" font-size="12" style="fill: var(--dg-muted)">Arrows: follow each visit's referer back toward the page the ad pointed to.</text>
</svg>`,
        },
        {
          type: "text",
          html: `<h3>The state layout</h3>
<p>Everything is keyed by user, so one user's events meet on one worker. Per user, the pipeline keeps:</p>
<ul>
<li>a <strong>map from URL to visit</strong>, so the walk-back can jump from a referer to the visit at that URL in one lookup;</li>
<li>a <strong>map from target URL to impression</strong>, which doubles as deduplication: a repeated impression for the same target is noticed and not stored or credited again;</li>
<li>a <strong>set of pending goals</strong> that have arrived but not yet been attributed;</li>
<li>a <strong>value holding the earliest pending goal's timestamp</strong>, and a single <strong>event-time timer</strong> set to it.</li>
</ul>
<p>Why one timer and a "minimum goal" value instead of one timer per goal? In the Beam version of this design, timers are declared statically on the DoFn, so there is no dynamic set of timers to create. The workaround is to keep one timer aimed at the earliest pending goal and move it whenever an earlier goal shows up or the current one is handled.</p>`,
        },
        {
          type: "code",
          lang: "text",
          title: "Sketch of the per-user logic",
          code: `on element e (per user):
  if e is an impression: if impressions has no entry for e.target, store it
  if e is a visit:       visits[e.url] = e
  if e is a goal:        visits[e.url] = e; pendingGoals.add(e)
                         if e.time < minGoal: minGoal = e.time
                                              setEventTimer(minGoal)

on event-time timer (watermark has passed minGoal):
  for each goal g in pendingGoals with g.time <= watermark:
    v = g
    while v exists and impressions has no entry for v.url:
      v = visits[v.referer]               // walk back one hop
    if v exists: emit attribution(g, impressions[v.url])
    pendingGoals.remove(g)
  minGoal = earliest remaining goal time; setEventTimer(minGoal) if any`,
          caption: "An original simplification; a production version also bounds how far back it walks and expires old visits and impressions.",
        },
        {
          type: "text",
          html: `<p>The event-time timer is what makes this correct. If the goal were attributed the moment it arrived, the walk-back would hit a missing link: in the diagram, the <code>/shoes</code> visit has not arrived yet, so the chain breaks at <code>/checkout</code> and the goal is either dropped or credited to nothing. Setting a timer at the goal's event time defers the work until the watermark says everything up to that time has (probably) arrived. By then the whole chain is in state.</p>`,
        },
        {
          type: "lab",
          id: "attribution",
          caption: "Step through one user's out-of-order events. Compare attributing immediately on arrival with waiting for an event-time timer, and watch the state maps, the pending goals, the timer and the walk-back.",
        },
        {
          type: "quiz",
          q: "In the attribution pipeline, what is the main risk of using a processing-time timer (say, 10 seconds after a goal arrives) instead of an event-time timer?",
          options: [
            "It uses more state per user",
            "During a backlog it can fire before the earlier visits and impression have been read, so the walk-back fails",
            "It cannot be reset to an earlier time",
            "It makes duplicate impressions impossible to detect",
          ],
          answer: 1,
          explain: "A processing-time timer fires on wall-clock schedule regardless of what input has been read. If the pipeline is behind, the referring visits may still be sitting unread in the input. An event-time timer waits for the watermark, which only advances once earlier data has been processed.",
        },
      ],
    },
    {
      id: "interview",
      title: "Using it in a design interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "text",
          html: `<p>State comes up in any streaming design that aggregates, deduplicates, joins or detects patterns: counting views, fraud rules over a user's recent activity, sessionization, ad attribution. Interviewers want to hear where the state lives, how it survives failure, how big it gets, and when results are emitted.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>A strong answer covers:</p>
<ol>
<li>Why state must be persistent: replayable input plus checkpointed state, so recovery redoes only the work since the last checkpoint and never double-counts.</li>
<li>Pick the cheapest form that works: a combiner (accumulator, combiner lifting) for commutative and associative aggregates; raw lists only when you need every element.</li>
<li>For custom logic, choose state structures that match the access pattern (maps for lookups, bags for appends) and use timers to decide when to compute.</li>
<li>Event-time timers for completeness-dependent logic, processing-time timers for latency and timeouts. Mention state cleanup so per-key state doesn't grow forever.</li>
</ol>`,
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>"We'll keep each user's events in a list and recompute on every event." It works in a demo and falls over at scale: state grows without bound and per-event cost grows with it. Say what you keep instead (an accumulator, a map keyed by what you look up) and when you expire it.</p>`,
        },
        {
          type: "quiz",
          q: "A per-key count is being shuffled from 200 workers, and one celebrity key overloads its reducer. What is the most direct fix?",
          options: [
            "Switch from a CombineFn to raw grouping",
            "Use a combiner so each worker sends one partial count per key before the shuffle",
            "Use processing-time timers instead of event-time timers",
            "Checkpoint more often",
          ],
          answer: 1,
          explain: "Counting is commutative and associative, so combiner lifting applies: each of the 200 workers sends one accumulator for the hot key instead of every record. Timers and checkpoint frequency don't change shuffle volume, and raw grouping makes it worse.",
        },
      ],
    },
  ],
  takeaways: [
    "Persistent state gives correctness through failures and efficiency on unbounded input. Recovery needs replayable input plus checkpointed state.",
    "Raw grouping keeps every input: it works for anything, but storage and per-firing compute grow with the input and every element is shuffled.",
    "A CombineFn (create, add, merge, extract) needs commutative and associative logic and buys incrementalization and parallelization.",
    "Combiner lifting merges partial accumulators before the shuffle, which tames hot keys.",
    "Generalized state offers flexible data structures, fine-grained reads and writes, and timers to schedule processing.",
    "Event-time timers wait for completeness; processing-time timers fire on the wall clock. Use event time when correctness depends on having all the data.",
    "Conversion attribution needs maps for lookups, a set of pending goals and an event-time timer, because out-of-order data breaks the walk-back if you act on arrival.",
  ],
  furtherReading: [
    { title: "Streaming Systems, Chapter 7 (Akidau, Chernyak, Lax, 2018)", note: "The full attribution case study with Beam code." },
    { title: "MillWheel: Fault-Tolerant Stream Processing at Internet Scale (Akidau et al., VLDB 2013)", note: "Persistent per-key state, timers and low watermarks in Google's stream processor." },
    { title: "Lightweight Asynchronous Snapshots for Distributed Dataflows (Carbone et al., 2015)", note: "The checkpointing algorithm behind Apache Flink." },
  ],
};
