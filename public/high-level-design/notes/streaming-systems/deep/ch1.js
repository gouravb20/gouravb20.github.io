// Deep dive: Chapter 1, Streaming 101. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch1 = {
  hook: `<p>A mobile game shows an hourly leaderboard per team. At 08:55 a player on a subway scores 20 points for Team Red, but the phone has no signal, so the event sits in a local buffer. At 09:21 the train surfaces, the phone uploads, and the live pipeline counts those 20 points in the <strong>09:00 hour</strong>, because that is when it saw them. At midnight a nightly batch job re-reads the day's logs, groups by the timestamp inside each event, and credits the points to the <strong>08:00 hour</strong>. Two systems, one dataset, two different leaderboards.</p>
<p>The usual fix is to keep both: a fast streaming job everyone knows is a bit wrong, and a slow batch job that corrects it hours later. This chapter argues that the split is a symptom, not a law of nature. If a streaming engine can be <em>correct</em> and can <em>reason about time</em>, it can do everything the batch job does, and the second system goes away.</p>`,
  sections: [
    {
      id: "what-streaming-means",
      title: "What a streaming system actually is",
      kicker: "Definitions",
      blocks: [
        {
          type: "problem",
          html: `<p>For years "streaming" was shorthand for "fast but approximate". Early engines dropped or duplicated records on failure and grouped data by arrival time, so their answers drifted from the truth. People started treating those shortcomings as the definition, and concluded that anything that must be right needs a batch job.</p>`,
        },
        {
          type: "idea",
          html: `<p>Define a streaming system by the data it is built for, not by the shortcuts of its ancestors: it is <strong>an engine designed with infinite datasets in mind</strong>. Low latency is a nice side effect. Approximation is an implementation choice, not a requirement.</p>`,
        },
        {
          type: "text",
          html: `<p>Two pairs of words get mixed up constantly, and keeping them apart clears up most streaming confusion.</p>
<p><strong>Cardinality</strong> describes the data. A <strong>bounded</strong> dataset is finite: yesterday's log file, a table export, the orders placed in September. An <strong>unbounded</strong> dataset keeps growing for as long as the business runs: clicks, payments, sensor readings. <em>Batch</em> and <em>streaming</em> describe the engine. A batch engine assumes its input ends. A streaming engine does not assume that, which is why it can process bounded input too: a bounded dataset is just an unbounded one that happens to stop.</p>
<p><strong>Constitution</strong> describes how you look at the data. A <strong>table</strong> is the whole dataset at one moment, like an account balance. A <strong>stream</strong> is the element-by-element story of how it changes, like the list of deposits and withdrawals. Every real pipeline uses both: a stream of transactions gets aggregated into a table of balances, and a table's change log is a stream. The book returns to this duality in Chapter 6.</p>`,
        },
        {
          type: "table",
          title: "Keep the words straight",
          headers: ["Word", "Describes", "Example"],
          rows: [
            ["Bounded / unbounded", "The data (cardinality)", "A September export vs the live click stream"],
            ["Batch / streaming", "The engine", "A nightly Spark job vs a Flink job running for months"],
            ["Table / stream", "The view (constitution)", "Current balances vs the transaction log"],
          ],
        },
        {
          type: "callout",
          tone: "history",
          html: `<p>Apache Storm, open-sourced by Twitter in 2011, made low-latency processing popular, but its original design offered at-least-once delivery and no built-in notion of event time. That is a big part of why the industry learned to pair streaming with a batch "source of truth". The engines this book builds on (Google's MillWheel and Dataflow, Apache Flink, Apache Beam) were designed to remove those gaps.</p>`,
        },
        {
          type: "quiz",
          q: "A team runs a Flink job over the 30 log files written yesterday, then the job exits. Which description is accurate?",
          options: [
            "Unbounded data processed by a batch engine",
            "Bounded data processed by a streaming engine",
            "It cannot be streaming because the input ends",
            "It is a table, so it cannot be processed as a stream",
          ],
          answer: 1,
          explain: "Thirty files are finite, so the data is bounded. Flink is an engine built for unbounded input, which makes it a streaming engine, and streaming engines can process bounded data perfectly well. Bounded/unbounded describes the data; batch/streaming describes the engine.",
        },
      ],
    },
    {
      id: "superset-of-batch",
      title: "Why streaming can be a superset of batch",
      kicker: "The thesis",
      blocks: [
        {
          type: "text",
          html: `<p>If streaming engines are untrustworthy, you end up with the <strong>Lambda architecture</strong>, a name coined by Nathan Marz. Every event goes to two places: a streaming job that produces quick, approximate answers, and a batch job that recomputes exact answers later. A serving layer merges the two so readers see fresh data that is eventually corrected.</p>
<p>It works, and it doubles your work. You write the same business logic twice, in two frameworks, and then spend your time explaining why the two disagree. Every logic change ships twice. Every bug is investigated twice.</p>
<p>In 2014 Jay Kreps proposed the alternative now called the <strong>Kappa architecture</strong>: keep one streaming pipeline and store its input in a replayable log such as Kafka. To reprocess (after a bug fix, say), start a second copy of the job reading the log from the beginning, let it catch up, and switch readers over.</p>`,
        },
        {
          type: "diagram",
          title: "Two pipelines versus one",
          caption: "Lambda keeps a batch job and a streaming job and merges their output. Kappa keeps one streaming job and reprocesses by replaying the log into a new version.",
          svg: `<svg viewBox="0 0 620 270" role="img" aria-label="Lambda architecture with batch and speed layers compared to Kappa architecture with one streaming job and replay">
<defs><marker id="ss1-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<text x="10" y="16" font-size="13" font-weight="700">Lambda</text>
<rect x="10" y="56" width="100" height="40" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="60" y="80" text-anchor="middle" font-size="12">Event log</text>
<rect x="170" y="24" width="150" height="34" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="245" y="45" text-anchor="middle" font-size="12">Batch job (nightly)</text>
<rect x="170" y="92" width="150" height="34" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="245" y="113" text-anchor="middle" font-size="12">Streaming job</text>
<rect x="380" y="56" width="120" height="40" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="440" y="80" text-anchor="middle" font-size="12">Merge at query</text>
<rect x="540" y="56" width="70" height="40" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="575" y="80" text-anchor="middle" font-size="12">Readers</text>
<line x1="110" y1="70" x2="168" y2="44" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ss1-arrow)"/>
<line x1="110" y1="82" x2="168" y2="106" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ss1-arrow)"/>
<line x1="320" y1="44" x2="378" y2="68" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ss1-arrow)"/>
<line x1="320" y1="106" x2="378" y2="84" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ss1-arrow)"/>
<line x1="500" y1="76" x2="538" y2="76" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ss1-arrow)"/>
<text x="245" y="146" text-anchor="middle" font-size="12" style="fill: var(--dg-bad)">same logic, written twice</text>
<line x1="10" y1="162" x2="610" y2="162" stroke-width="1" stroke-dasharray="4 4" style="stroke: var(--dg-line)"/>
<text x="10" y="184" font-size="13" font-weight="700">Kappa</text>
<rect x="10" y="206" width="140" height="40" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="80" y="230" text-anchor="middle" font-size="12">Replayable log</text>
<rect x="210" y="192" width="180" height="30" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="300" y="212" text-anchor="middle" font-size="12">Streaming job v1</text>
<rect x="210" y="232" width="180" height="30" rx="6" stroke-dasharray="5 3" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<text x="300" y="252" text-anchor="middle" font-size="12">v2: replay from offset 0</text>
<rect x="460" y="206" width="150" height="40" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="535" y="230" text-anchor="middle" font-size="12">Serving table</text>
<line x1="150" y1="220" x2="208" y2="208" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ss1-arrow)"/>
<line x1="150" y1="232" x2="208" y2="246" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ss1-arrow)"/>
<line x1="390" y1="208" x2="458" y2="220" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ss1-arrow)"/>
<line x1="390" y1="246" x2="458" y2="234" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ss1-arrow)"/>
</svg>`,
        },
        {
          type: "text",
          html: `<p>Kappa only works if the single streaming job is as trustworthy as the batch job it replaces. The book names exactly two ingredients for that:</p>
<ol>
<li><strong>Correctness.</strong> State must survive failures and every record must affect it exactly once, so a crash or retry never double-counts or loses data. Chapter 5 shows how.</li>
<li><strong>Tools for reasoning about time.</strong> Unbounded, out-of-order data needs windowing, watermarks and triggers so the engine can group by when things happened and decide when an answer is ready. Chapters 2 to 4 build these.</li>
</ol>
<p>With both in place, batch becomes a special case: the input happens to be bounded, so the engine can wait until the end before emitting. That is the sense in which streaming is a <strong>superset</strong> of batch.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Apache Beam", title: "One pipeline, two modes", html: "A Beam pipeline is written once against PCollections that may be bounded or unbounded. Runners such as Dataflow, Flink and Spark execute it in batch or streaming mode depending on the input." },
            { org: "Apache Flink", title: "Batch as a mode of the stream runtime", html: "Since Flink 1.12 the DataStream API can run with <code>execution.runtime-mode</code> set to <code>BATCH</code> over bounded sources, using the same program that runs continuously in <code>STREAMING</code> mode." },
            { org: "Apache Kafka", title: "Replay as reprocessing", html: "Because topics retain data for a configurable period, which can be unlimited, a new consumer group can start at the earliest offset and rebuild state, which is the mechanism Kappa relies on." },
          ],
        },
        {
          type: "tradeoffs",
          prosLabel: "Kappa gains",
          consLabel: "Kappa costs",
          pros: [
            "One codebase and one set of semantics",
            "Reprocessing is the same code path as normal processing",
            "Fresh results without a separate correction layer",
          ],
          cons: [
            "The log must retain enough history to replay, which costs storage",
            "Replaying months of data through a streaming job can be slower than a purpose-built batch scan",
            "Requires an engine with exactly-once state and event-time support",
          ],
        },
      ],
    },
    {
      id: "event-time-vs-processing-time",
      title: "Event time versus processing time",
      kicker: "The core distinction",
      blocks: [
        {
          type: "problem",
          html: `<p>Every record has at least two timestamps, and they rarely agree. If you group by the wrong one, your 08:00 hour quietly absorbs events from 07:45, and your 09:00 hour gets credit for the subway rider's 08:55 score.</p>`,
        },
        {
          type: "text",
          html: `<p><strong>Event time</strong> is when the thing happened: the tap, the payment, the sensor reading. It is usually stamped by the device or service that produced the record. <strong>Processing time</strong> is when your pipeline observes the record. It is read from the pipeline worker's clock.</p>
<p>In a perfect world the two would match. In practice, records travel through phones that go offline, mobile networks, load balancers, queues, retries and workers that pause for garbage collection or fall behind during a traffic spike. Each of those adds delay, and the delay varies from record to record. It is not a constant you can subtract: one event arrives 200 milliseconds late, the next one four hours late.</p>
<p>The delay also scrambles order. Two events that happened at 12:00:10 and 12:00:20 can be observed in either order, so any logic that assumes records arrive sorted by event time is fragile.</p>`,
        },
        {
          type: "diagram",
          title: "Reading the event-time versus processing-time plot",
          caption: "Event time runs left to right and processing time bottom to top. Ideally every event is processed the moment it happens (the dashed diagonal). The solid curve is how far the pipeline has really got. The vertical gap is lag; the horizontal gap is skew.",
          svg: `<svg viewBox="0 0 600 345" role="img" aria-label="Plot of event time against processing time showing the ideal diagonal, a lagging reality curve, processing-time lag and event-time skew">
<defs><marker id="ss1-tip" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-ink)"/></marker></defs>
<line x1="80" y1="290" x2="500" y2="290" stroke-width="1.5" style="stroke: var(--dg-ink)"/>
<line x1="80" y1="290" x2="80" y2="34" stroke-width="1.5" style="stroke: var(--dg-ink)"/>
<text x="80" y="308" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">0</text>
<text x="180" y="308" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">2</text>
<text x="280" y="308" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">4</text>
<text x="380" y="308" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">6</text>
<text x="480" y="308" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">8</text>
<text x="290" y="334" text-anchor="middle" font-size="12">Event time (minutes after 12:00)</text>
<text x="70" y="294" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">0</text>
<text x="70" y="234" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">2</text>
<text x="70" y="174" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">4</text>
<text x="70" y="114" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">6</text>
<text x="70" y="54" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">8</text>
<text x="26" y="170" text-anchor="middle" font-size="12" transform="rotate(-90 26 170)">Processing time (minutes)</text>
<line x1="80" y1="290" x2="480" y2="50" stroke-width="2" stroke-dasharray="6 5" style="stroke: var(--dg-muted)"/>
<polyline points="80,260 140,200 205,140 280,110 330,80 355,50" fill="none" stroke-width="3" style="stroke: var(--dg-ok)"/>
<line x1="205" y1="213" x2="205" y2="144" stroke-width="2" style="stroke: var(--dg-2)" marker-start="url(#ss1-tip)" marker-end="url(#ss1-tip)"/>
<text x="214" y="246" font-size="12" font-weight="700" style="fill: var(--dg-2)">lag = 2.5 min</text>
<text x="214" y="262" font-size="12" style="fill: var(--dg-muted)">(vertical gap)</text>
<line x1="284" y1="110" x2="378" y2="110" stroke-width="2" style="stroke: var(--dg-4)" marker-start="url(#ss1-tip)" marker-end="url(#ss1-tip)"/>
<text x="392" y="124" font-size="12" font-weight="700" style="fill: var(--dg-4)">skew = 2 min</text>
<text x="392" y="140" font-size="12" style="fill: var(--dg-muted)">(horizontal gap)</text>
<text x="96" y="56" font-size="12" style="fill: var(--dg-muted)">Dashed: ideal, zero delay</text>
<text x="96" y="76" font-size="12" style="fill: var(--dg-ok)">Solid: actual progress</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>The plot gives two ways to measure the same gap. <strong>Processing-time lag</strong> is vertical: the event from 2.5 minutes after noon was not seen until 5 minutes after noon, so it was 2.5 minutes late. That is what an end-to-end latency dashboard shows. <strong>Event-time skew</strong> is horizontal: at 6 minutes past noon by the wall clock, the pipeline is only complete up to 4 minutes past noon, so it is 2 minutes behind. Skew is the quantity a watermark tries to estimate, which is why it gets a whole chapter (Chapter 3).</p>`,
        },
        {
          type: "lab",
          id: "skew",
          caption: "Drag processing time along the vertical axis and watch the horizontal skew between the ideal line and the watermark curve grow and shrink as the nine scores trickle in.",
        },
        {
          type: "quiz",
          q: "At 12:07 by the wall clock, a pipeline has seen every event up to 12:02 event time. What is the 5-minute gap called?",
          options: ["Processing-time lag", "Event-time skew", "Allowed lateness", "Window size"],
          answer: 1,
          explain: "Holding processing time fixed and asking how far behind the pipeline is in event time is the horizontal gap on the plot: skew. Lag fixes an event and asks how long after it happened it was processed (the vertical gap).",
        },
      ],
    },
    {
      id: "processing-patterns",
      title: "Four ways to process unbounded data",
      kicker: "Processing patterns",
      blocks: [
        {
          type: "text",
          html: `<p>Before the patterns, accept one uncomfortable fact: with unbounded, out-of-order data <strong>you can never be sure you have seen everything</strong> up to a given time. The subway rider's phone might be in a drawer for a week. Any system that waits for certainty either waits forever or makes a guess. Each pattern below is a different response to that fact.</p>
<h3>1. Time-agnostic processing</h3>
<p>Some logic does not care about time at all. <strong>Filtering</strong> keeps or drops each record on its own merits ("only events from the EU region"), so it behaves identically in batch and streaming. An <strong>inner join</strong> is also time-agnostic in meaning: when a record arrives from one side, buffer it until its partner arrives from the other side, then emit the pair. The catch is the buffer. If a partner never shows up, its counterpart waits forever, and without some cleanup policy the buffer grows without limit.</p>
<h3>2. Approximation algorithms</h3>
<p>Algorithms such as approximate top-N and streaming k-means consume unbounded input and keep a small summary that is close to the right answer. They are useful when "roughly right, right now" is the goal, but they are few, complicated to design, and their accuracy often depends on arrival order. They do not solve the general problem.</p>
<h3>3. Windowing by processing time</h3>
<p>Cut the stream into windows by the clock on the pipeline's wall: everything that arrives between 09:00 and 10:00 is the 09:00 window. Simple, and you always know when a window is complete. But the answer depends on arrival order.</p>
<h3>4. Windowing by event time</h3>
<p>Cut the stream by the timestamp inside each record. Answers are correct no matter how records arrive, but windows stay open longer and you need some way to decide when they are done.</p>`,
        },
        {
          type: "code",
          lang: "java",
          title: "A time-agnostic filter and a windowed sum, Beam style",
          code: `// Pattern 1: no notion of time needed. Same result in batch or streaming.
PCollection<Event> eu = events.apply(Filter.by(e -> e.region().equals("EU")));

// Pattern 4: group by when each event happened, in 1-hour windows.
PCollection<KV<String, Integer>> hourly = events
    .apply(WithTimestamps.of(e -> e.eventTime()))
    .apply(Window.into(FixedWindows.of(Duration.standardHours(1))))
    .apply(MapElements.via(e -> KV.of(e.team(), e.points())))
    .apply(Sum.integersPerKey());`,
          caption: "Simplified pseudo-code in the shape of the Beam Java SDK; type hints and coders are omitted.",
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>The unknowable-completeness problem is what motivates every tool in the next three chapters. <strong>Windows</strong> make the work finite. <strong>Watermarks</strong> estimate how complete a window is. <strong>Triggers</strong> decide when to emit anyway. <strong>Accumulation</strong> decides how to fix an answer that turned out to be early.</p>`,
        },
      ],
    },
    {
      id: "window-shapes",
      title: "Windows: fixed, sliding and sessions",
      kicker: "Chopping time",
      blocks: [
        {
          type: "text",
          html: `<p>A sum or a count over an infinite stream never finishes. <strong>Windowing</strong> chops the stream into finite pieces along time boundaries so that grouping operations have something they can complete. Three shapes cover most needs.</p>
<ul>
<li><strong>Fixed windows</strong> (also called tumbling) are equal-sized and do not overlap: 09:00 to 10:00, 10:00 to 11:00. Each event lands in exactly one window. Hourly revenue and daily active users use them.</li>
<li><strong>Sliding windows</strong> (also called hopping) have a size and a period. A 4-minute window every 2 minutes means windows start at 0, 2, 4 and so on, and each one overlaps its neighbours, so each event lands in two windows. Moving averages use them. When the period equals the size, sliding windows are just fixed windows.</li>
<li><strong>Session windows</strong> are cut by the data itself: a session is a burst of activity for one key that ends when no event arrives for longer than a timeout (the gap). They model things like a user's visit to a site.</li>
</ul>`,
        },
        {
          type: "diagram",
          title: "Three window shapes on the same timeline",
          caption: "Fixed windows tile time without overlap. Sliding windows of 4 minutes every 2 minutes overlap, so each instant is covered twice. Sessions with a 1.5-minute gap follow each key's own activity (dots), so key A and key B get different boundaries.",
          svg: `<svg viewBox="0 0 620 295" role="img" aria-label="Fixed, sliding and session windows drawn on a shared time axis">
<text x="10" y="52" font-size="13" font-weight="700">Fixed</text>
<text x="10" y="68" font-size="12" style="fill: var(--dg-muted)">size 4 min</text>
<rect x="132" y="36" width="156" height="26" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="292" y="36" width="156" height="26" rx="4" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<rect x="452" y="36" width="156" height="26" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="10" y="112" font-size="13" font-weight="700">Sliding</text>
<text x="10" y="128" font-size="12" style="fill: var(--dg-muted)">4 min, every 2</text>
<rect x="132" y="88" width="156" height="22" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="292" y="88" width="156" height="22" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="452" y="88" width="156" height="22" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="212" y="116" width="156" height="22" rx="4" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<rect x="372" y="116" width="156" height="22" rx="4" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<rect x="532" y="116" width="78" height="22" rx="4" stroke-dasharray="4 3" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="10" y="162" font-size="12" style="fill: var(--dg-muted)">Sessions, gap 1.5 min</text>
<text x="10" y="187" font-size="13" font-weight="700">Key A</text>
<rect x="150" y="172" width="120" height="22" rx="4" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<rect x="370" y="172" width="92" height="22" rx="4" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<rect x="570" y="172" width="40" height="22" rx="4" stroke-dasharray="4 3" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<circle cx="150" cy="183" r="4" style="fill: var(--dg-3)"/>
<circle cx="178" cy="183" r="4" style="fill: var(--dg-3)"/>
<circle cx="210" cy="183" r="4" style="fill: var(--dg-3)"/>
<circle cx="370" cy="183" r="4" style="fill: var(--dg-3)"/>
<circle cx="402" cy="183" r="4" style="fill: var(--dg-3)"/>
<circle cx="570" cy="183" r="4" style="fill: var(--dg-3)"/>
<text x="10" y="227" font-size="13" font-weight="700">Key B</text>
<rect x="230" y="212" width="160" height="22" rx="4" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/>
<rect x="490" y="212" width="92" height="22" rx="4" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/>
<circle cx="230" cy="223" r="4" style="fill: var(--dg-4)"/>
<circle cx="270" cy="223" r="4" style="fill: var(--dg-4)"/>
<circle cx="298" cy="223" r="4" style="fill: var(--dg-4)"/>
<circle cx="330" cy="223" r="4" style="fill: var(--dg-4)"/>
<circle cx="490" cy="223" r="4" style="fill: var(--dg-4)"/>
<circle cx="522" cy="223" r="4" style="fill: var(--dg-4)"/>
<line x1="130" y1="258" x2="610" y2="258" stroke-width="1.5" style="stroke: var(--dg-ink)"/>
<text x="130" y="276" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">0</text>
<text x="210" y="276" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">2</text>
<text x="290" y="276" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">4</text>
<text x="370" y="276" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">6</text>
<text x="450" y="276" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">8</text>
<text x="530" y="276" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">10</text>
<text x="604" y="276" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">12</text>
<text x="10" y="276" font-size="12" style="fill: var(--dg-muted)">event time (min)</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>The diagram also shows a second distinction. Fixed and sliding windows are <strong>aligned</strong>: every key shares the same boundaries, so every key's 09:00 window ends at 10:00 together. Sessions are <strong>unaligned</strong>: each key gets boundaries that depend on its own data. Aligned windows are easy to reason about but make all the work arrive at once when a boundary passes. Chapter 4 shows how phase-shifting fixed windows per key spreads that load out without changing what each window means.</p>
<p>There is also a degenerate fourth shape, the <strong>global window</strong>, which covers all of time. On bounded data it gives you a classic batch total. On unbounded data it never closes, so it is only useful combined with triggers that emit periodically.</p>`,
        },
        {
          type: "lab",
          id: "windowTypes",
          caption: "Switch between fixed, sliding and session windows and tune their sizes to see the same events from three keys group in different ways. Notice which strategies give every key the same boundaries.",
        },
        {
          type: "code",
          lang: "java",
          title: "The three shapes in Beam",
          code: `Window.into(FixedWindows.of(Duration.standardMinutes(4)))
Window.into(SlidingWindows.of(Duration.standardMinutes(4))
                          .every(Duration.standardMinutes(2)))
Window.into(Sessions.withGapDuration(Duration.standardSeconds(90)))`,
        },
      ],
    },
    {
      id: "choosing-a-clock",
      title: "Windowing by processing time versus event time",
      kicker: "Choosing a clock",
      blocks: [
        {
          type: "text",
          html: `<p>Return to the leaderboard. Team Red has three events, and we window by the hour:</p>
<ul>
<li>10 points at event time 08:58, arriving at 08:58:30.</li>
<li>5 points at event time 08:59:40, arriving at 09:00:20 after a slow network hop.</li>
<li>20 points at event time 08:55, arriving at 09:21 from the subway phone.</li>
</ul>
<p><strong>By processing time</strong>, the 08:00 window holds only the first event: 10 points. The 09:00 window holds the other two: 25 points. <strong>By event time</strong>, all three belong to 08:00: 35 points, and 09:00 has nothing. Run the same data again with different network conditions and the processing-time answer changes; the event-time answer never does.</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "Processing-time windows", tone: "warn", html: "<p>Simple: buffer whatever arrives until the clock passes the boundary, then emit. Completeness is trivial, because the window is done when the clock says so. But the result describes <em>when the pipeline saw things</em>, so late or reordered data lands in the wrong bucket.</p>" },
            { title: "Event-time windows", tone: "ok", html: "<p>Correct: every event lands in the window for when it happened, regardless of arrival order. The costs are <strong>buffering</strong> (windows stay open longer, so more state) and <strong>completeness</strong> (you must estimate when a window has all its data, using watermarks, and decide when to emit, using triggers).</p>" },
          ],
        },
        {
          type: "text",
          html: `<p>Processing time is not always wrong. When the question is about the system itself, as observed, it is exactly right. "How many requests per second is the API serving right now?" is a question about arrival, and you want to alert on it within seconds, not wait for stragglers. Anything about user behaviour, money or physical events is a question about event time.</p>
<h3>What to key stored results by</h3>
<p>Suppose the pipeline writes its totals to a key-value store such as Bigtable or HBase. Key each row by <strong>key plus event-time window</strong>, for example <code>red#2026-10-12T08:00</code>. When the subway rider's 20 points arrive at 09:21, the pipeline emits an updated total for the 08:00 window and simply overwrites that row: the 15 it held after the first two events becomes 35. A replay of the same input writes the same rows. If you keyed by processing time instead, the 20 points would pollute the 09:00 row and a backfill would produce different rows from the original run.</p>`,
        },
        {
          type: "lab",
          id: "ptVsEt",
          caption: "Replay the same nine events in two arrival orders. Event-time windows give identical totals both times; processing-time windows change with the network.",
        },
        {
          type: "keypoints",
          items: [
            "Business results (billing, analytics, leaderboards): key rows by event-time window and overwrite them as updated results arrive.",
            "Operational monitoring (QPS, ingestion rate): processing-time windows are fine and often exactly what you want.",
            "Keep processing time as metadata (an <code>updated_at</code> column, a pane index), never as the key of business data.",
          ],
        },
        {
          type: "realworld",
          items: [
            { org: "Apache Flink", title: "Both clocks, chosen per window", html: "Flink offers separate window assigners such as <code>TumblingEventTimeWindows</code> and <code>TumblingProcessingTimeWindows</code>, so the choice of clock is explicit in the code." },
            { org: "Apache Kafka", title: "Which timestamp a record carries", html: "Each Kafka record has a timestamp that is either set by the producer (<code>CreateTime</code>) or by the broker when it appends the record (<code>LogAppendTime</code>), chosen per topic with <code>message.timestamp.type</code>. Kafka Streams windows by that record timestamp, so the producer setting effectively picks between event time and ingestion time." },
          ],
        },
        {
          type: "quiz",
          q: "Which of these questions is best answered with processing-time windows?",
          options: [
            "How much did each advertiser spend per hour yesterday?",
            "Has the request rate hitting our checkout service dropped by half in the last minute?",
            "How many minutes did each user play per day?",
            "Which hour of the day do most purchases happen in?",
          ],
          answer: 1,
          explain: "An outage alert is about what the service is observing right now, so arrival time is the right clock, and you want the answer immediately rather than waiting for stragglers. The other three are about when user actions happened and need event time.",
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
          html: `<p>Chapter 1 vocabulary shows up whenever a design includes analytics, metrics, billing or anything aggregated over time from devices or services: ad-click counting, ride-sharing surge pricing, IoT dashboards, game leaderboards. Interviewers listen for whether you separate "when it happened" from "when we saw it" without being prompted.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>A strong answer to "how would you aggregate these events?" hits four points:</p>
<ol>
<li><strong>The data is unbounded</strong>, so the engine must be a streaming engine, and a correct one (exactly-once state) if the numbers matter.</li>
<li><strong>Window by event time</strong>, because devices go offline and networks reorder; name the window shape (fixed for hourly reports, sliding for moving averages, sessions for visits).</li>
<li><strong>Completeness is unknowable</strong>, so you need a watermark to estimate it and a policy for late data (Chapters 2 and 3).</li>
<li><strong>Store results keyed by event-time window</strong> so late updates overwrite the right row and replays are idempotent.</li>
</ol>
<p>If asked about reprocessing, describe Kappa: retain the input in Kafka, start a new job version from the earliest offset, cut over when it catches up.</p>`,
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>"We'll bucket events by the time they reach the server." That is processing-time windowing presented as if it were event time. If the interviewer mentions mobile clients, retries or regional outages, it gives the wrong answer for exactly the events they are asking about.</p>`,
        },
        {
          type: "quiz",
          q: "Your pipeline writes per-team hourly scores to Bigtable. A late event for the 08:00 hour arrives at 09:21. With rows keyed by team and event-time hour, what happens?",
          options: [
            "The event is added to the 09:00 row, because that is when it arrived",
            "The pipeline emits an updated 08:00 total that overwrites the 08:00 row",
            "The event must be dropped, because the 08:00 row was already written",
            "A new row keyed by the arrival timestamp is created alongside the old one",
          ],
          answer: 1,
          explain: "Keying by event-time window means a late event just produces a new, more complete total for the window it belongs to, and writing it overwrites the old value. Keying by arrival time is what would put the points in the wrong hour or scatter one window across rows.",
        },
      ],
    },
  ],
  takeaways: [
    "A streaming system is an engine designed for unbounded data. Low latency and approximation are properties of old implementations, not of streaming.",
    "Bounded/unbounded describes the data, batch/streaming the engine, and table/stream the view. Keep them separate.",
    "With exactly-once correctness and tools for reasoning about time, streaming is a superset of batch, which makes a separate Lambda batch layer unnecessary.",
    "Event time is when something happened; processing time is when the pipeline saw it. The gap is variable and reorders data. Lag is the vertical gap on the plot, skew the horizontal one.",
    "Completeness of unbounded, out-of-order data can never be known for certain, which is why the book needs windows, watermarks, triggers and accumulation.",
    "Fixed and sliding windows are aligned across keys; sessions are unaligned and data-driven.",
    "Window by event time and key stored results by event-time window; use processing time only for questions about the system as observed, such as monitoring.",
  ],
  furtherReading: [
    { title: "The Dataflow Model (Akidau et al., VLDB 2015)", url: "https://www.vldb.org/pvldb/vol8/p1792-Akidau.pdf", note: "The paper behind the book's model: windowing, triggers and accumulation over unbounded, out-of-order data." },
    { title: "The world beyond batch: Streaming 101 (Tyler Akidau, O'Reilly, 2015)", note: "The essay this chapter grew out of." },
    { title: "Questioning the Lambda Architecture (Jay Kreps, O'Reilly, 2014)", note: "The proposal for reprocessing by replaying a log, later called Kappa." },
    { title: "Apache Beam programming guide", url: "https://beam.apache.org/documentation/programming-guide/", note: "PCollections, windowing and the unified batch and streaming model in code." },
  ],
};
