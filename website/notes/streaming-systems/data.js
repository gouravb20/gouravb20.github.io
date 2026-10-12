// Streaming Systems (Akidau, Chernyak, Lax) - chapter notes, Part I
// Contract consumed by app.js: window.DATA = { book, parts, fourQuestions, takeaways, chapters: [...] }

window.DATA = {
  book: {
    title: "Streaming Systems",
    subtitle: "Chapter-wise interactive notes on <em>Streaming Systems: The What, Where, When, and How of Large-Scale Data Processing</em> by Tyler Akidau, Slava Chernyak &amp; Reuven Lax. Every chapter has concept cards, a cheatsheet, interview Q&amp;A, flashcards, and <strong>interactive labs</strong> built on the book's own example data (the nine team scores, Table 2-1, the conversion-attribution pipeline, and more)."
  },
  parts: {
    1: "Part I · The Beam Model",
    2: "Part II · Streams and Tables"
  },
  fourQuestions: [
    { cls: "what",  q: "What",  text: "<strong>What</strong> results are calculated?", answer: "Answered by <em>transformations</em>: element-wise (ParDo) and grouping/aggregation (GroupByKey, Sum, Combine)." },
    { cls: "where", q: "Where", text: "<strong>Where</strong> in event time are results calculated?", answer: "Answered by <em>event-time windowing</em>: fixed, sliding, sessions, global, or custom windows." },
    { cls: "when",  q: "When",  text: "<strong>When</strong> in processing time are results materialized?", answer: "Answered by <em>triggers</em> and <em>watermarks</em>: repeated-update, completeness (watermark), early / on-time / late firings, plus allowed lateness for garbage collection." },
    { cls: "how",   q: "How",   text: "<strong>How</strong> do refinements of results relate?", answer: "Answered by <em>accumulation modes</em>: discarding, accumulating, accumulating &amp; retracting." }
  ],
  takeaways: [
    "Streaming is a <strong>superset of batch</strong>. A well-designed streaming engine plus tools for reasoning about time can replace Lambda architectures.",
    "Always distinguish <strong>event time</strong> (when it happened) from <strong>processing time</strong> (when the system saw it). The gap between them is variable and unbounded.",
    "Don't wait for completeness you can't have. Use <strong>windowing</strong> to chop data by event time, and <strong>triggers</strong> to decide when to emit.",
    "A <strong>watermark</strong> is a monotonic estimate of input completeness in event time: \"the oldest work not yet completed\". Perfect watermarks are rare; heuristic ones can be too fast (late data) or too slow (latency).",
    "Combine triggers: <strong>early</strong> speculative results, a single <strong>on-time</strong> watermark pane, and <strong>late</strong> refinements. Bound state with <strong>allowed lateness</strong>.",
    "<strong>Accumulation mode</strong> must match the consumer: overwrite stores want accumulating; additive consumers want discarding; regrouping downstream needs retractions.",
    "Exactly-once in Dataflow = <strong>dedup by record ID</strong> at shuffles + <strong>checkpointing</strong> before side effects (to handle nondeterminism) + idempotent/transactional sinks.",
    "<strong>Streams and tables are two sides of one coin</strong>: streams are data in motion, tables are data at rest. Grouping turns streams into tables; triggering turns tables into streams.",
    "Persistent state exists for correctness and efficiency. <strong>Incremental combining</strong> (CombineFn) beats raw grouping; <strong>state + timers</strong> give total flexibility.",
    "Streaming SQL works over <strong>time-varying relations</strong>. TABLE vs STREAM is just a rendering choice; EMIT expresses triggers; Sys.Undo expresses retractions. Joins are all variations of FULL OUTER."
  ],
  chapters: [
    // =====================================================================
    // CHAPTER 1
    // =====================================================================
    {
      id: "ch1",
      part: 1,
      number: 1,
      title: "Streaming 101",
      overview: `Sets the vocabulary for the whole book. The authors argue that well-designed streaming systems are a <strong>strict superset of batch</strong>. All they need are <strong>correctness</strong> (consistent storage, exactly-once) and <strong>tools for reasoning about time</strong>. The chapter separates <strong>event time</strong> from <strong>processing time</strong>, and surveys how bounded and unbounded data is processed: time-agnostic, approximation, processing-time windowing and event-time windowing.`,
      concepts: [
        { term: "Streaming system", def: "A data processing engine designed with <strong>infinite datasets</strong> in mind. The authors deliberately do not define it as \"low-latency, approximate or speculative\", because those are properties of past implementations, not of streaming itself.", why: "If you define streaming by its historical limitations, you'll never trust it to replace batch.", ex: "Flink, Dataflow, and Kafka Streams are all streaming systems that can produce exact results." },
        { term: "Cardinality: bounded vs unbounded data", def: "<strong>Bounded</strong> data is finite in size. <strong>Unbounded</strong> data is (at least theoretically) infinite. Batch engines are built for bounded data; streaming engines can handle both.", why: "\"Bounded/unbounded\" describes the <em>data</em>; \"batch/streaming\" describes the <em>engine</em>. Mixing the two up causes most streaming confusion.", ex: "A daily log file is bounded; the click stream of a website is unbounded." },
        { term: "Constitution: tables vs streams", def: "A <strong>table</strong> is a holistic view of a dataset at a specific point in time. A <strong>stream</strong> is an element-by-element view of how the dataset evolves over time. The book returns to this duality in Chapter 6.", why: "Batch systems historically processed tables, and streaming systems processed streams. In reality every pipeline uses both.", ex: "A bank balance is a table; the transaction log is a stream." },
        { term: "Streaming ⊇ batch", def: "Two things let a streaming engine beat batch at its own game. The first is <strong>correctness</strong>: consistent, persistent state with exactly-once semantics. The second is <strong>tools for reasoning about time</strong>: windowing, watermarks and triggers.", why: "This is the thesis of the book: with those two ingredients, Lambda architectures (a batch layer plus a speed layer) become unnecessary.", ex: "Dataflow and Flink run the same pipeline over bounded or unbounded inputs and get the same answers." },
        { term: "Lambda vs Kappa architecture", def: "<strong>Lambda</strong> runs a streaming system for low-latency approximate results and a batch system for eventual correctness, then merges the two. <strong>Kappa</strong> (Jay Kreps) runs a single streaming pipeline over a replayable log such as Kafka, and reprocesses by replaying that log.", why: "With Lambda you maintain two codebases that must agree, which is operationally painful. A correct streaming engine makes Kappa viable.", ex: "To reprocess with Kappa, replay Kafka from offset 0 into a new version of the job." },
        { term: "Event time vs processing time", def: "<strong>Event time</strong> is when the event actually occurred. <strong>Processing time</strong> is when the system observes it. In an ideal world they would be equal. In reality, network delays, offline devices, contention, and backlogs create a variable gap.", why: "If you care about <em>when things happened</em> (billing, analytics, anomaly detection on user behavior), you must use event time.", ex: "A phone in airplane mode buffers events for hours, then uploads them all at once.", demo: "skew" },
        { term: "Processing-time lag and event-time skew", def: "On the event-time vs processing-time plot, the <strong>lag</strong> is the vertical distance: how late in processing time an event with time X is observed. The <strong>skew</strong> is the horizontal distance: how far behind the pipeline currently is in event time. Both are views of the same gap.", why: "Skew is what a watermark tries to estimate. Lag is what end-to-end latency dashboards show.", ex: "At 12:07 processing time the pipeline may only be complete up to 12:02 event time, so the skew is 5 minutes.", demo: "skew" },
        { term: "Completeness is not knowable", def: "For unbounded, out-of-order data you can never say for sure \"I have now seen all events up to time X\". Systems that wait for completeness either never finish or must guess.", why: "This motivates every tool in the book: windowing, watermarks (estimates of completeness), triggers (decisions about when to emit), and accumulation (how to fix answers later)." },
        { term: "Windowing", def: "Chopping a dataset into finite chunks along temporal boundaries. There are three major types. <strong>Fixed</strong> (tumbling) windows are equal-sized and non-overlapping. <strong>Sliding</strong> (hopping) windows have a size and a period, so they may overlap. <strong>Sessions</strong> are dynamic windows separated by gaps of inactivity longer than a timeout.", why: "Grouping operations (aggregations, joins) on unbounded data need some finite unit of work.", ex: "Hourly revenue uses fixed windows; a 24h moving average every hour uses sliding windows; user activity bursts use sessions.", demo: "windowTypes" },
        { term: "Aligned vs unaligned windows", def: "<strong>Aligned</strong> windows apply across all the data, for example every key's 12:00–13:00 window. <strong>Unaligned</strong> windows apply to subsets of the data; sessions and per-key phase-shifted fixed windows are examples.", why: "Aligned windows make all windows finish at the same moment, causing bursty load. Unaligned windows spread it out (Chapter 4).", demo: "windowTypes" },
        { term: "Time-agnostic processing", def: "Processing where time is irrelevant: <strong>filtering</strong>, and <strong>inner joins</strong> with an unbounded buffer. These work the same in batch and streaming.", why: "Not every pipeline needs windows. Know when you can skip the complexity.", ex: "Filtering web logs to keep only one domain's traffic." },
        { term: "Approximation algorithms", def: "Algorithms such as approximate Top-N and streaming k-means take unbounded input and produce output that is roughly what you hoped for. They are usually processing-time-based and complicated, and their error bounds are often tied to arrival order.", why: "They are useful but niche. They don't solve the general correctness problem." },
        { term: "Windowing by processing time", def: "The system buffers incoming data into windows until a certain amount of processing time has passed. It is <strong>simple</strong>, judging <strong>completeness</strong> is trivial, and it is perfect when you want to infer something about the source <em>as it is observed</em>. However, results depend on arrival order, so if data arrives late or out of order, the answers change.", why: "It's fine for monitoring (QPS of a web service), but wrong for questions about when events actually happened.", ex: "Mobile usage events uploaded after a flight land in the wrong hourly bucket.", demo: "ptVsEt" },
        { term: "Windowing by event time", def: "Data is placed into windows based on when it occurred, giving <strong>correct</strong> results regardless of arrival order. The costs are <strong>buffering</strong> (windows live longer, so you need more state) and uncertain <strong>completeness</strong> (you need watermarks to estimate it and triggers to act on it).", why: "This is the gold standard for correctness, and the reason the rest of the book exists.", demo: "ptVsEt" },
        { term: "Storing results: event time keys", def: "When materializing streaming results into a persistent store such as Bigtable or HBase, key the rows by <strong>key + event-time window</strong>. Each new pane then simply overwrites the previous row, in accumulating mode. Processing time can be stored as metadata (for example, <em>last updated at</em>), but should not be the key for business data.", why: "Late data updates the right row instead of polluting \"the current minute\". Re-running the pipeline produces identical rows.", ex: "Row key <code>team#2026-10-12T12:00</code> holds the score for the 12:00–12:02 window; a late record later overwrites the value 5 with 14.", demo: "ptVsEt" }
      ],
      cheatsheet: [
        { title: "Terminology at a glance", type: "table", headers: ["Term", "Means", "Opposite"], rows: [
          ["Bounded", "Finite dataset", "Unbounded (infinite)"],
          ["Batch engine", "Built for bounded data", "Streaming engine (handles both)"],
          ["Table", "Dataset at a point in time", "Stream (evolution over time)"],
          ["Event time", "When it happened", "Processing time (when it was observed)"],
          ["Lag", "Vertical gap on the time plot (processing-time delay)", "Skew (horizontal: how far behind in event time)"],
          ["Aligned window", "Same boundaries for all keys", "Unaligned (per key or per subset)"]
        ]},
        { title: "Window types", type: "table", headers: ["Type", "Shape", "Typical use"], rows: [
          ["Fixed (tumbling)", "Equal-size, non-overlapping", "Hourly or daily aggregates"],
          ["Sliding (hopping)", "Size + period; overlap when period &lt; size", "Moving averages"],
          ["Sessions", "Activity bursts separated by a gap &gt; timeout", "User engagement, ad attribution"],
          ["Global", "One window covering all time", "Batch-style totals, plus triggers"]
        ]},
        { title: "Processing-time vs event-time windowing", type: "table", headers: ["", "Processing time", "Event time"], rows: [
          ["Simplicity", "Very simple", "Needs more state"],
          ["Completeness", "Trivial (just wait)", "Unknowable, must estimate (watermarks)"],
          ["Correctness w/ out-of-order data", "Wrong: depends on arrival order", "Correct"],
          ["Good for", "Monitoring what the system sees right now", "Anything about when events happened"]
        ]},
        { title: "Rule of thumb: what time do I key my stored results by?", type: "list", items: [
          "Business results (billing, analytics, leaderboards): key by <strong>event-time window</strong> and write panes in <strong>accumulating</strong> mode so each pane overwrites the row.",
          "Operational monitoring (QPS, ingestion rate): processing time is fine, and is often exactly what you want.",
          "Store processing time (<em>emitted_at</em>, pane index, timing) as <strong>metadata columns</strong>, not as the key.",
          "If the consumer regroups by a different key, emit <strong>retractions</strong> or deltas, not plain overwrites (see Chapter 2)."
        ]},
        { title: "Processing patterns for unbounded data", type: "list", items: [
          "<strong>Time-agnostic</strong>: filtering, inner joins.",
          "<strong>Approximation</strong>: approximate Top-N, streaming k-means.",
          "<strong>Windowing by processing time</strong>: simple, but results depend on arrival order.",
          "<strong>Windowing by event time</strong>: correct, but needs buffering plus completeness estimation."
        ]}
      ],
      interview: [
        { q: "Why do the authors refuse to define streaming as \"low latency, approximate results\"?", a: "Those are characteristics of early <em>implementations</em> (Storm, early Spark Streaming), not inherent limits. Defining streaming as \"an engine designed for infinite datasets\" leaves room for streaming systems that are just as correct as batch. With correctness and tools for reasoning about time, streaming is a superset of batch.", diff: "easy" },
        { q: "Explain event time vs processing time with a real example and why the difference matters.", a: "A user taps a button on a phone in airplane mode at 09:00 (event time). The event is uploaded when the plane lands at 13:00 (processing time). An hourly report windowed by processing time counts that tap in the 13:00 hour, which is wrong if you care about user behavior. Event-time windowing puts it in the 09:00 hour regardless of when it arrives. The gap is variable and unbounded, so you can't just subtract a constant.", diff: "easy" },
        { q: "What's the difference between Lambda and Kappa architectures, and how does the book's thesis relate?", a: "Lambda runs a streaming layer for fast approximate results and a batch layer for correct results, then merges them, which means two codebases to keep in sync. Kappa uses one streaming pipeline and a replayable log, and reprocesses by replaying. The book argues that streaming engines with exactly-once state and event-time tools make the batch layer unnecessary, so Kappa-style designs are sufficient.", diff: "med" },
        { q: "What are processing-time lag and event-time skew? How are they related?", a: "On a plot with event time on X and processing time on Y, the ideal line is the diagonal. Lag is the vertical distance between the ideal and reality: how much later an event of time X was processed. Skew is the horizontal distance: at processing time Y, how far behind in event time the pipeline is. They are two perspectives on the same gap.", diff: "med" },
        { q: "When is processing-time windowing actually the right choice?", a: "When you want to infer something about the <em>source as it is observed</em>, as with monitoring. Examples are measuring QPS hitting a service for outage detection, or alerting on ingestion rate. Processing-time windows are simple and their completeness is trivial. They are wrong when you care about when events happened, because results depend on arrival order.", diff: "med" },
        { q: "What are the two downsides of event-time windowing?", a: "<strong>Buffering</strong>: windows live longer than in processing-time windowing, so more state is kept (mitigated by persistent storage and incremental aggregation). <strong>Completeness</strong>: you can't know when you've seen all data for a window, so you need watermarks to estimate completeness and triggers to decide when to emit, and possibly to update results later.", diff: "med" },
        { q: "You're writing streaming aggregates to Bigtable. Do you key rows by processing time or event time? Why?", a: "Event time: key + event-time window, for example <code>user#window_start</code>. Each trigger firing writes an updated pane for that window in accumulating mode, so it simply overwrites the cell. Late data correctly updates the old window's row, and replays are idempotent. Processing time as a key would scatter one window's value across rows depending on arrival timing, and make backfills non-reproducible. Processing time (emit time, pane index) can be stored as metadata. The exception is pure monitoring use cases, where processing time is the point.", diff: "hard" },
        { q: "Give an example of time-agnostic processing on unbounded data and the hidden cost of streaming inner joins.", a: "Filtering, such as keeping only events from one domain, is purely element-wise. Inner joins are time-agnostic in their semantics: when an element arrives from one source, buffer it and wait for the matching element from the other. The hidden cost is that, without windowing or some garbage-collection policy, the buffers for unmatched elements grow without bound.", diff: "hard" },
        { q: "What are aligned vs unaligned windows and why would you care?", a: "Aligned windows have the same boundaries for all keys, like every key's 12:00–12:02 window. Unaligned windows differ per key or subset, as sessions and phase-shifted fixed windows do. Aligned windows all complete at the same moment, which causes bursts of output and load. Unaligned windows spread the work evenly (Chapter 4's unaligned fixed windows).", diff: "med" }
      ],
      labs: ["skew", "ptVsEt", "windowTypes"]
    },

    // =====================================================================
    // CHAPTER 2
    // =====================================================================
    {
      id: "ch2",
      part: 1,
      number: 2,
      title: "The What, Where, When, and How of Data Processing",
      overview: `The heart of the book. It introduces the four questions every pipeline answers: <span class="q q-what">What</span> results are calculated (transformations), <span class="q q-where">Where</span> in event time (windowing), <span class="q q-when">When</span> in processing time (triggers + watermarks), and <span class="q q-how">How</span> refinements relate (accumulation). It follows a running example: summing team scores from nine records that arrive out of order. Use the <strong>Beam Model simulator</strong> lab to reproduce figures 2-3 through 2-14.`,
      concepts: [
        { term: "Transformations (What)", def: "<strong>Element-wise</strong> transformations (ParDo) process each element independently: map, filter, parse. <strong>Grouping</strong> transformations (GroupByKey, Combine, Sum) bring together all elements with the same key or window.", why: "Grouping is where time matters: you must decide which elements belong together (Where) and when to emit (When).", ex: "<code>input.apply(Sum.integersPerKey())</code> sums scores per team." },
        { term: "PCollection and PTransform", def: "In Beam, a <strong>PCollection</strong> is a dataset (bounded or unbounded) that can be processed in parallel. A <strong>PTransform</strong> is applied to PCollections to create new ones.", why: "This is the vocabulary used in all the book's code samples." },
        { term: "Classic batch over the nine scores", def: "Summing all nine scores in a batch engine waits for the whole input, then emits a single total of <strong>48</strong>. It is simple and correct, but you get nothing until the input is complete, which never happens for unbounded input.", demo: "beamSim" },
        { term: "Windowing (Where)", def: "The pipeline is windowed into 2-minute <strong>fixed event-time windows</strong> with <code>Window.into(FixedWindows.of(TWO_MINUTES))</code>. Batch then emits one result per window: <strong>14, 18, 4, 12</strong>.", why: "Windowing alone doesn't answer when to emit on an unbounded stream. That's the job of triggers.", demo: "beamSim" },
        { term: "Triggers (When)", def: "A trigger declares <strong>when in processing time</strong> the output for a window should be materialized. Each output is a <strong>pane</strong> of the window. There are two families. <strong>Repeated update triggers</strong> fire periodically (per record, or after a processing-time delay). <strong>Completeness triggers</strong> fire when the input for a window is believed complete (the watermark).", why: "Triggers decouple <em>which window</em> data belongs to from <em>when</em> results come out.", demo: "beamSim" },
        { term: "Per-record trigger", def: "<code>Repeatedly(AfterCount(1))</code> fires a pane for every new record. Running totals for the nine scores: 5, 7, 10, 4, 18, 3, 14, 11, 12.", why: "Lowest latency, but very chatty, and it gives no hint about completeness. Fine for small data or low-volume keys.", demo: "beamSim" },
        { term: "Aligned vs unaligned delay triggers", def: "<strong>Aligned delay</strong> (<code>AlignedDelay(TWO_MINUTES)</code>) fires all windows at the same processing-time boundaries, like microbatch Spark Streaming. <strong>Unaligned delay</strong> (<code>UnalignedDelay(TWO_MINUTES)</code>) fires a fixed delay after the first unprocessed element <em>for that window</em>, which spreads load out.", why: "Aligned delays create periodic bursts across all keys. Unaligned delays smooth them out, at the cost of results that aren't synchronized.", demo: "beamSim" },
        { term: "Watermark", def: "A watermark is a function <strong>F(P) → E</strong>: at processing time P, it asserts that all events with event time &lt; E have been observed. It is a measure of input completeness with respect to event time.", why: "Without watermarks you can't express \"the window is done\" for event-time windows.", demo: "beamSim" },
        { term: "Perfect vs heuristic watermarks", def: "A <strong>perfect</strong> watermark has full knowledge of the input, so there is never late data, but it can be too slow: one straggler holds everything back. A <strong>heuristic</strong> watermark estimates progress from available information such as partitions and ordering. It can be <strong>too fast</strong>, causing late data, or <strong>too slow</strong>.", why: "In the running example, a perfect watermark makes window 1 wait for Frank's 9 until 12:08:19. The heuristic watermark fires window 1 at 12:05:39 with the value 5 and treats the 9 as late.", demo: "beamSim" },
        { term: "Early / on-time / late triggers", def: "A combined trigger: <code>AfterWatermark().withEarlyFirings(AlignedDelay(ONE_MINUTE)).withLateFirings(AfterCount(1))</code>. <strong>Early</strong> panes give speculative results before completeness, so watermarks that are too slow aren't a problem. A single <strong>on-time</strong> pane fires when the watermark passes. <strong>Late</strong> panes refine the result when late data arrives, so watermarks that are too fast aren't a problem either.", why: "This gives you the best of both worlds: low latency and eventual correctness.", ex: "Window [12:00, 12:02) emits 5 on time (the heuristic watermark ignores Frank's 9), then a late pane of 14 when the 9 shows up at 12:08:19.", demo: "beamSim" },
        { term: "Allowed lateness (garbage collection)", def: "<code>withAllowedLateness(ONE_MINUTE)</code> keeps a window's state around until the watermark passes <strong>end of window + allowed lateness</strong>. After that, the state is dropped and any further late data for that window is discarded.", why: "Without it, state for every window lives forever. Lateness is measured in <strong>event time</strong> (relative to the watermark), so a pipeline that falls behind doesn't drop data just because wall-clock time passed.", ex: "With 1 minute of allowed lateness, window [12:00, 12:02) closes as soon as the heuristic watermark jumps past 12:03, so Frank's 9 is dropped.", demo: "beamSim" },
        { term: "Accumulation (How)", def: "This is how multiple panes for the same window relate. <strong>Discarding</strong>: each pane holds only the new data since the last pane. <strong>Accumulating</strong>: each pane holds all the data so far, so later panes overwrite earlier ones. <strong>Accumulating &amp; retracting</strong>: each pane holds all the data so far, plus a retraction of the previous pane.", why: "The right mode depends on the downstream consumer. Overwrite stores want accumulating, additive consumers want discarding, and consumers that regroup by a different key want retractions.", ex: "Table 2-1: panes [3] then [8, 1]. Discarding emits 3, 9; accumulating emits 3, 12; retracting emits 3, then 12 together with −3.", demo: "accumulation" },
        { term: "Why retractions?", def: "Retractions are needed when consumers regroup data by a different dimension. If the old value isn't retracted, the consumer counts it twice. With dynamic windows such as sessions, merging means old windows must be retracted and replaced.", why: "Upsert-style stores are fine with accumulating mode, but downstream aggregations are not.", demo: "accumulation" }
      ],
      cheatsheet: [
        { title: "The four questions", type: "table", headers: ["Question", "Answered by", "Beam construct"], rows: [
          ["<span class='q q-what'>What</span> results?", "Transformations", "ParDo, GroupByKey, Combine, Sum"],
          ["<span class='q q-where'>Where</span> in event time?", "Windowing", "Window.into(FixedWindows / SlidingWindows / Sessions)"],
          ["<span class='q q-when'>When</span> in processing time?", "Triggers + watermarks", ".triggering(AfterWatermark()...)"],
          ["<span class='q q-how'>How</span> do refinements relate?", "Accumulation", ".discardingFiredPanes() / .accumulatingFiredPanes() / .accumulatingAndRetractingFiredPanes()"]
        ]},
        { title: "Running example: nine team scores", type: "table", headers: ["Score", "Event time", "Processing time", "Note"], rows: [
          ["Julie 5", "12:00:26", "12:05:19", ""],
          ["Frank 9", "12:01:26", "12:08:19", "Missed by the heuristic watermark, so it is late"],
          ["Ed 7", "12:02:26", "12:05:39", ""],
          ["Julie 8", "12:03:06", "12:07:06", ""],
          ["Amy 3", "12:03:39", "12:06:13", ""],
          ["Fred 4", "12:04:19", "12:06:39", ""],
          ["Naomi 3", "12:06:39", "12:07:19", ""],
          ["Becky 8", "12:07:26", "12:08:39", ""],
          ["Naomi 1", "12:07:46", "12:09:00", ""]
        ], note: "2-minute window totals: [12:00) = 14, [12:02) = 18, [12:04) = 4, [12:06) = 12. Grand total 48." },
        { title: "Early / on-time / late, with allowed lateness", type: "code", body: `PCollection<KV<Team, Integer>> totals = input
  .apply(Window.into(FixedWindows.of(TWO_MINUTES))
               .triggering(
                 AfterWatermark()
                   .withEarlyFirings(AlignedDelay(ONE_MINUTE))
                   .withLateFirings(AfterCount(1)))
               .withAllowedLateness(ONE_MINUTE)
               .accumulatingFiredPanes())
  .apply(Sum.integersPerKey());` },
        { title: "Table 2-1: accumulation modes (panes [3] then [8, 1])", type: "table", headers: ["Pane", "Discarding", "Accumulating", "Accumulating &amp; retracting"], rows: [
          ["Pane 1: inputs = [3]", "3", "3", "3"],
          ["Pane 2: inputs = [8, 1]", "9", "12", "12, −3"],
          ["Value of final normal pane", "9", "12", "12"],
          ["Sum of all panes", "12", "15 ✗", "12"]
        ], note: "Pick the mode by asking what the consumer does with each pane: overwrite (accumulating), add (discarding), or regroup (retracting)." },
        { title: "Watermark failure modes", type: "table", headers: ["Problem", "Cause", "Fix"], rows: [
          ["Too slow", "Perfect watermark held back by a straggler, or a heuristic that is too conservative", "Early firings"],
          ["Too fast", "Heuristic watermark advanced past data that hadn't arrived yet", "Late firings + allowed lateness"]
        ]}
      ],
      interview: [
        { q: "Name the four questions of the Beam Model and the construct that answers each.", a: "What results are calculated? Transformations. Where in event time? Windowing. When in processing time? Triggers and watermarks. How do refinements relate? Accumulation modes.", diff: "easy" },
        { q: "What is a pane?", a: "Each output produced for a window by a trigger firing. A window can have many panes: early, on-time and late. Each pane carries metadata such as timing and index.", diff: "easy" },
        { q: "Why do perfect watermarks still need early firings?", a: "Perfect watermarks can be <strong>too slow</strong>. A single straggler (in the example, Frank's 9 at 12:08:19) holds the watermark back for the whole window, which delays results. Early firings provide speculative partial results in the meantime.", diff: "med" },
        { q: "Why do heuristic watermarks need late firings?", a: "Heuristic watermarks can be <strong>too fast</strong>: they advance past events that haven't arrived yet, and those events become late. Late firings emit updated panes when they arrive. Allowed lateness bounds how long the window's state is kept for that purpose.", diff: "med" },
        { q: "Why is allowed lateness measured in event time, not processing time?", a: "If a pipeline falls behind (for example, it is reprocessing a backlog), processing time races ahead of event time. A processing-time horizon would drop perfectly valid data just because the pipeline was slow. Measuring relative to the watermark ties GC to input completeness.", diff: "hard" },
        { q: "Walk through Table 2-1 for each accumulation mode.", a: "Panes: [3], then [8, 1]. <strong>Discarding</strong>: 3, then 9; consumers sum the panes to get 12. <strong>Accumulating</strong>: 3, then 12; consumers overwrite, and summing would be wrong (15). <strong>Retracting</strong>: 3, then (12, −3); summing or overwriting both give 12, and regrouping consumers can subtract the old value.", diff: "med" },
        { q: "Give an example where accumulating mode silently corrupts results.", a: "A downstream stage regroups per-user totals into a per-team total by summing. In accumulating mode the user's first pane of 5 and second pane of 14 both get added, giving 19 instead of 14. You need either discarding mode (deltas) or retractions (−5, +14).", diff: "hard" },
        { q: "Compare aligned delay and unaligned delay triggers.", a: "Aligned delay fires every window at the same processing-time boundaries (microbatch style), which is predictable but bursty across keys. Unaligned delay fires a delay after the first unprocessed element per window, which spreads load more evenly, but results across keys are emitted at different times.", diff: "med" },
        { q: "With the book's heuristic watermark and an early/on-time/late trigger, what does window [12:00, 12:02) emit?", a: "On-time: 5, as soon as the heuristic watermark passes 12:02. It ignores Frank's 9, so once Julie's 5 has arrived the oldest outstanding event it knows about is Ed's 7 at 12:02:26. Late: 14 at 12:08:19, when Frank's 9 arrives, in accumulating mode. With allowed lateness of 1 minute, the window is garbage-collected once the watermark passes 12:03, so the 9 is dropped and 5 stays the final answer. That reproduces Figures 2-11 and 2-12.", diff: "hard" },
        { q: "What does \"streaming SQL needs no special per-record trigger syntax\" have to do with Chapter 2?", a: "A per-record trigger emits a new pane per record. In SQL terms that's a stream rendering with the default \"emit on every change\" behavior. Chapter 8 shows this is just the STREAM rendering of a time-varying relation.", diff: "med" }
      ],
      labs: ["beamSim", "accumulation"]
    },

    // =====================================================================
    // CHAPTER 3
    // =====================================================================
    {
      id: "ch3",
      part: 1,
      number: 3,
      title: "Watermarks",
      overview: `Watermarks are the tool for reasoning about completeness. A watermark is defined as the <strong>monotonically increasing timestamp of the oldest work not yet completed</strong>. The chapter covers how input watermarks are created (perfect vs heuristic), how they <strong>propagate</strong> through multi-stage pipelines, the choice of output timestamps, <strong>percentile</strong> and <strong>processing-time</strong> watermarks, and real implementations in Dataflow, Flink and Pub/Sub.`,
      concepts: [
        { term: "Watermark definition", def: "The watermark is a <strong>monotonically increasing timestamp of the oldest work not yet completed</strong>. Picture the distribution of event times of in-flight messages. The watermark is the left edge of that distribution.", why: "It has two properties. <strong>Completeness</strong>: if the watermark has advanced past T, no more data with time before T will arrive, so windows can close. <strong>Visibility</strong>: if a message is stuck, the watermark can't advance, so you can find the problem by looking at what holds it.", demo: "wmDistribution" },
        { term: "Why not processing time or rate?", def: "Processing time ignores delays, so windows get assigned incorrectly. A processing <em>rate</em> says nothing about completeness. A single stuck message can corrupt results without changing the rate.", demo: "wmDistribution" },
        { term: "Perfect watermark creation", def: "Possible when you have perfect knowledge of the input. Examples: <strong>ingress timestamping</strong> (event time = time of arrival, which is really processing time); a <strong>static set of time-ordered logs</strong> (Kafka partitions each with monotonic timestamps), where watermark = min over partitions of the oldest unprocessed event.", why: "Perfect watermarks mean no late data, which gives simpler semantics. They're rare in practice." },
        { term: "Heuristic watermark creation", def: "An estimate built from whatever is known: partitions, ordering within partitions, growth rates of files, network topology, historical lateness. Examples: <strong>dynamic sets of time-ordered logs</strong>, and <strong>Google Cloud Pub/Sub</strong> (no ordering guarantees, so watermarks are estimated from oldest-unacked statistics).", why: "Most real systems use heuristics, which means late data can happen. Pair them with late triggers and allowed lateness." },
        { term: "Input and output watermarks", def: "Each stage has an <strong>input watermark</strong>: the min of the output watermarks of its upstream stages. It also has an <strong>output watermark</strong>: the min of its input watermark and the event times of all <strong>non-late data still buffered</strong> in the stage (state, pending timers, in-flight messages).", why: "Event-time latency introduced by a stage = input watermark − output watermark. That gives a per-stage lag metric.", demo: "wmPropagation" },
        { term: "Watermark propagation", def: "Watermarks flow downstream through the pipeline graph. Each stage's input watermark is bounded by its upstream stages' output watermarks, so a slow stage holds back everything after it.", demo: "wmPropagation" },
        { term: "Output timestamp choices", def: "When a grouping stage emits a result, it must assign it an event-time timestamp. The options are <strong>end of the window</strong> (the only safe choice for overlapping windows), the <strong>earliest</strong> non-late element's timestamp (most conservative), or the <strong>latest</strong> element's timestamp. The stage must hold its output watermark at that timestamp while the data is buffered.", why: "Earliest holds the downstream watermark back much more, which causes delay, and it changes the semantics of downstream windowing. End of window lets watermarks advance quickly.", demo: "wmPropagation" },
        { term: "Overlapping windows gotcha", def: "With sliding windows and \"earliest element\" timestamps, an element in the first window holds back the watermark for all downstream windows. The window boundaries cascade, delaying everything. Beam therefore defaults to end-of-window when windows overlap.", demo: "wmPropagation" },
        { term: "Percentile watermarks", def: "Instead of the 100th percentile (the oldest in-flight message), use the event time at, for example, the 90th or 99th percentile of the distribution. This gives earlier window materialization, but lets a known fraction of data become late.", why: "It trades completeness for latency in a way you can quantify, and ignores outliers that would otherwise hold back everyone.", demo: "wmDistribution" },
        { term: "Processing-time watermarks", def: "The same \"oldest unfinished work\" idea, measured in <strong>processing time</strong>: the time the oldest pending operation was enqueued. It distinguishes <strong>system delay</strong> (a stuck pipeline) from <strong>data delay</strong> (old data, such as a backlog of yesterday's events, flowing through a healthy pipeline).", why: "An event-time watermark lagging 1 hour behind is ambiguous. The processing-time watermark tells you whether the system is broken. It's also used for GC of internal state such as dedup records (Chapter 5).", demo: "ptWatermark" },
        { term: "Dataflow implementation", def: "Workers own key ranges and report watermark updates to a <strong>centralized watermark aggregator</strong>, which computes the minimum across all ranges. Ownership leases and correctness checks make sure updates come from the current owner of the key range.", why: "Central aggregation makes it easy to reason about correctness, at the cost of an extra hop." },
        { term: "Flink implementation", def: "<strong>In-band watermarks</strong>: sources emit watermark checkpoints into the data stream, and each operator forwards min(input watermarks) downstream as records flow.", why: "Lower latency and no single point of failure, but watermark propagation is coupled with data flow (an idle partition can hold things back)." },
        { term: "Pub/Sub watermark estimation", def: "Pub/Sub has no ordering guarantees. Dataflow uses <strong>two subscriptions</strong>: a <strong>base subscription</strong> that the pipeline actually processes, and a <strong>tracking subscription</strong> that only inspects the backlog's event times. The watermark is the min of the oldest unacked event time and the tracking subscription's backlog estimate. If the tracking subscription is fully caught up and its timestamps are within a <strong>10-second</strong> band, an estimate is used. If there has been no data for <strong>2 minutes</strong>, the watermark advances to near real time.", why: "It shows how much engineering a heuristic watermark takes when the source gives no guarantees." }
      ],
      cheatsheet: [
        { title: "Watermark vocabulary", type: "table", headers: ["Term", "Definition"], rows: [
          ["Watermark", "Monotonic timestamp of the oldest work not yet completed"],
          ["Perfect", "Full knowledge of input; no late data; can be slow"],
          ["Heuristic", "Estimate of completeness; late data possible"],
          ["Input watermark (stage)", "min(upstream output watermarks)"],
          ["Output watermark (stage)", "min(input watermark, event times of buffered non-late data)"],
          ["Stage event-time latency", "input watermark − output watermark"],
          ["Percentile watermark", "Event time at a chosen percentile of in-flight data"],
          ["Processing-time watermark", "Enqueue time of the oldest pending operation (system vs data delay)"]
        ]},
        { title: "Output timestamp choices for grouped results", type: "table", headers: ["Choice", "Watermark delay", "Notes"], rows: [
          ["End of window", "Minimal", "Default; the only sensible choice for overlapping windows"],
          ["Earliest element", "Maximal", "Most conservative; holds the downstream watermark at the oldest buffered data"],
          ["Latest element", "Low", "Rare; timestamps can move non-intuitively"]
        ]},
        { title: "Diagnosing a lagging event-time watermark", type: "table", headers: ["Event-time WM", "Processing-time WM", "Diagnosis"], rows: [
          ["Lagging", "Fresh (small delay)", "<strong>Data delay</strong>: old data (a backlog) flowing through a healthy system"],
          ["Lagging", "Lagging too", "<strong>System delay</strong>: something is stuck (a hot key, a bad record, a crash loop)"],
          ["Fresh", "Fresh", "Healthy"]
        ]},
        { title: "Dataflow vs Flink watermarks", type: "table", headers: ["", "Dataflow", "Flink"], rows: [
          ["Mechanism", "Centralized aggregator", "In-band watermark records"],
          ["Latency", "Extra hop", "Lower; flows with the data"],
          ["Failure isolation", "Central component", "No single point of failure"],
          ["Watermark source of truth", "Aggregator holds the min per key range", "Each operator tracks min over its inputs"]
        ]}
      ],
      interview: [
        { q: "Define a watermark and state its two key properties.", a: "A monotonically increasing timestamp of the oldest work not yet completed. <strong>Completeness</strong>: once it passes T, no more data before T is expected, so windows ending at or before T can be closed. <strong>Visibility</strong>: a stuck message holds the watermark back, which makes the stall observable and debuggable.", diff: "easy" },
        { q: "Why doesn't the processing rate tell you anything about completeness?", a: "Rate varies with input volume, resources and so on, and it says nothing about whether every message for a time interval has been processed. A single stuck message barely affects rate but can make a window's result wrong.", diff: "easy" },
        { q: "Give two examples where perfect watermarks are possible.", a: "(1) Ingress timestamping: event time = arrival time, so the watermark is just the current time. (2) A static set of time-ordered logs: with a fixed set of Kafka partitions that each have monotonically increasing event times, the watermark is the min over partitions of the next unprocessed timestamp.", diff: "med" },
        { q: "How do input and output watermarks of a stage relate, and what metric does that give you?", a: "Input WM = min(output WMs of upstream stages). Output WM = min(input WM, timestamps of non-late data buffered in the stage). Input − output is the event-time latency introduced by the stage, which tells you where lag accumulates.", diff: "med" },
        { q: "Why is \"end of window\" the default output timestamp, especially for sliding windows?", a: "The stage must hold its output watermark at the output timestamp until it emits. With \"earliest element\", the watermark is held at the oldest buffered element, which delays downstream processing. For overlapping windows, an element belongs to multiple windows, so the earliest choice holds back later windows as well (cascading delays). End of window gives minimal watermark delay.", diff: "hard" },
        { q: "What's a percentile watermark and when would you use one?", a: "Instead of tracking the oldest in-flight message (100th percentile), you track the event time at the X-th percentile of the distribution. The watermark advances faster and ignores outliers, at the cost of a bounded fraction of data being late. Use it when latency matters more and a few late refinements are acceptable.", diff: "med" },
        { q: "Your event-time watermark lags by 1 hour. How do you know if the pipeline is broken?", a: "Look at the processing-time watermark. If it is fresh (seconds), the system is healthy and simply processing old data (data delay, such as a backfill). If it also lags, operations are stuck (system delay), and you should look for hot keys, crashing workers or poisoned records.", diff: "hard" },
        { q: "Compare Dataflow's and Flink's watermark propagation designs.", a: "Dataflow: workers report per-key-range watermarks to a centralized aggregator with lease checks; the aggregator computes mins and is easier to reason about. Flink: sources inject watermark records into the stream, and each operator emits min(input watermarks) downstream in-band. That gives lower latency and no central component, but idle sources can stall progress unless they are handled.", diff: "hard" },
        { q: "How does Dataflow estimate watermarks for Pub/Sub?", a: "Pub/Sub has no ordering guarantees, so Dataflow creates a separate <strong>tracking subscription</strong> that reads ahead only to observe event-time distributions, while the <strong>base subscription</strong> feeds the pipeline. The watermark is the min of the oldest unacked event time in the base subscription and an estimate from the tracking subscription's backlog. If the tracking backlog is caught up and timestamps are within a 10-second band, an estimate is used. After 2 minutes without data, the watermark advances to near real time.", diff: "hard" }
      ],
      labs: ["wmDistribution", "wmPropagation", "ptWatermark"]
    },

    // =====================================================================
    // CHAPTER 4
    // =====================================================================
    {
      id: "ch4",
      part: 1,
      number: 4,
      title: "Advanced Windowing",
      overview: `It goes deeper into the <span class="q q-where">Where</span> question. It covers <strong>processing-time windowing</strong>, done either with triggers or by using ingress time as event time, and <strong>session windows</strong>, which are dynamic and data-driven and work by merging proto-sessions. It also covers <strong>custom windowing</strong>, where window assignment and merging are user code: unaligned fixed windows, per-element fixed windows and bounded sessions.`,
      concepts: [
        { term: "When processing-time windowing is right", def: "Use processing-time windows for usage monitoring (QPS of a web service), or when the order of arrival really is what you're analyzing. It's wrong for anything about when events happened.", demo: "ptWindows" },
        { term: "Processing-time windows via triggers", def: "Use a <strong>global event-time window</strong> with a periodic processing-time trigger, such as <code>Repeatedly(AlignedDelay(TWO_MINUTES))</code>, in <strong>discarding</strong> mode. Each pane is effectively a processing-time window.", why: "This is how classic microbatch systems \"window\". Results depend on arrival order.", ex: "Figure 4-3: original order gives 12, 18, 18; a different order gives 7, 36, 5.", demo: "ptWindows" },
        { term: "Processing-time windows via ingress time", def: "Overwrite each record's event time with its <strong>arrival time</strong> at the pipeline, then use normal event-time windowing with the watermark trigger. The watermark is perfect (it's the ingress clock).", why: "This gives the same numbers as the trigger approach, but integrates cleanly with event-time machinery. Panes are naturally per window and complete.", demo: "ptWindows" },
        { term: "Event-time windows are order-independent", def: "With the same input in two different arrival orders, event-time windows always produce 14, 18, 4, 12. Processing-time windows change: 12, 18, 18 vs 7, 36, 5.", why: "This is the central argument for event time: correctness doesn't depend on network weather.", demo: "ptWindows" },
        { term: "Session windows", def: "A session is a period of activity terminated by a gap of inactivity longer than a timeout. Sessions are <strong>data-driven</strong> (you can't know window boundaries in advance) and <strong>unaligned</strong> (each key has its own).", why: "Sessions capture user engagement naturally, with no arbitrary cut points.", demo: "sessions" },
        { term: "Proto-sessions and merging", def: "Each record is first assigned to its own <strong>proto-session</strong> window: [event time, event time + gap). Overlapping proto-sessions are then <strong>merged</strong> into larger sessions. When a late record bridges two sessions, they merge into one.", why: "This is why sessions need <strong>retractions</strong>: earlier emitted sessions are replaced by a merged one.", ex: "With a 1-minute gap, sessions of 5 and of 7 + 8 + 3 + 4 merge into one session of 36 when Frank's 9 bridges them.", demo: "sessions" },
        { term: "Custom windowing = assignment + merging", def: "In Beam, a WindowFn has two parts: <strong>window assignment</strong> (which windows an element goes into) and optional <strong>window merging</strong> (how windows combine over time, as with sessions).", why: "This flexibility lets you express semantics that built-in windows can't." },
        { term: "Unaligned fixed windows", def: "Fixed windows where each key's windows are <strong>phase-shifted</strong> by a per-key offset (for example, a hash of the key). The window size is the same, but boundaries differ per key.", why: "Aligned windows complete simultaneously for all keys, which produces bursty output and load spikes. Unaligned windows spread output evenly over time while keeping the same semantics per key.", demo: "unaligned" },
        { term: "Per-element fixed windows", def: "The window size is chosen per element (for example, from customer-specific metadata), so different keys get different window sizes in the same pipeline.", ex: "A customer who pays for minute-level reports gets 1-minute windows; others get 1-hour windows." },
        { term: "Bounded sessions", def: "A custom merging policy that caps a session's total length (for example, 3 minutes). Sessions stop merging once they would exceed the bound.", why: "This protects against spam bots and other never-ending activity that would keep a session alive forever and grow state without bound.", demo: "sessions" }
      ],
      cheatsheet: [
        { title: "Two ways to build processing-time windows", type: "table", headers: ["Approach", "How", "Pros", "Cons"], rows: [
          ["Triggers", "Global window + Repeatedly(AlignedDelay) + discarding", "No event-time machinery needed", "Panes aren't real windows; results depend on order"],
          ["Ingress time", "Event time := arrival time, then normal windowing + watermark trigger", "Perfect watermark; integrates with event-time tooling", "Still order-dependent (by definition)"]
        ]},
        { title: "Results by arrival order (2-minute windows)", type: "table", headers: ["Strategy", "Original order", "Alternate order"], rows: [
          ["Event-time windows", "14, 18, 4, 12", "14, 18, 4, 12 ✓"],
          ["Processing-time via triggers", "12, 18, 18", "7, 36, 5 ✗"],
          ["Processing-time via ingress time", "12, 18, 18", "7, 36, 5 ✗"]
        ]},
        { title: "Sessions in Beam", type: "code", body: `PCollection<KV<Team, Integer>> totals = input
  .apply(Window.into(Sessions.withGapDuration(ONE_MINUTE))
               .triggering(
                 AfterWatermark()
                   .withEarlyFirings(AlignedDelay(ONE_MINUTE))
                   .withLateFirings(AfterCount(1))))
  .apply(Sum.integersPerKey());`, note: "Sessions merge, so a retraction-aware consumer (or accumulating and retracting mode) is needed to replace sessions that were already emitted." },
        { title: "Custom windowing examples", type: "list", items: [
          "<strong>Unaligned fixed windows</strong>: shift each key's windows by hash(key) mod size to smooth output bursts.",
          "<strong>Per-element window sizes</strong>: window size read from element metadata, such as customer tier.",
          "<strong>Bounded sessions</strong>: stop merging when the session length would exceed a maximum, to defend against bots."
        ]}
      ],
      interview: [
        { q: "How can you implement processing-time windows in the Beam Model?", a: "Two ways. (1) <strong>Triggers</strong>: use a global window with a repeated aligned processing-time delay trigger in discarding mode, so each pane is a processing-time window. (2) <strong>Ingress time</strong>: set each element's event time to its arrival time, then use regular fixed windows with a watermark trigger. The watermark is perfect.", diff: "med" },
        { q: "Why do processing-time windows give different results for the same data?", a: "Window membership depends on when each record arrived, which varies with network, retries and so on. In the book, the same nine scores in two orders give 12, 18, 18 and 7, 36, 5. Event-time windows give 14, 18, 4, 12 both times.", diff: "easy" },
        { q: "How do session windows work under the hood?", a: "Every element gets a proto-session [t, t + gap). After grouping by key, overlapping windows are merged transitively. Each merge may replace previously emitted sessions, so with early or late triggering the system emits retractions for the old sessions and a new pane for the merged one.", diff: "med" },
        { q: "Why do sessions require retractions?", a: "A late record may bridge two existing sessions. Downstream consumers have already seen those two sessions as separate results, so they must be retracted before the merged session is emitted. Otherwise the consumer would count data twice.", diff: "med" },
        { q: "What problem do unaligned fixed windows solve?", a: "With aligned windows, every key's window ends at the same instant, so the system produces a burst of output (and computation) at every boundary, with idle time in between. Shifting each key's windows by a per-key offset spreads completions evenly. Semantics per key are unchanged, but load is smooth.", diff: "med" },
        { q: "Why might you want bounded sessions?", a: "Bots or long-lived activity can keep a session alive indefinitely. That makes the state grow without bound, and the results are meaningless. A custom merge function that refuses to merge beyond a maximum length caps session size.", diff: "med" },
        { q: "What two parts make up a custom WindowFn?", a: "Window assignment (which windows each element belongs to), and optionally window merging (how windows combine over time). Fixed and sliding windows only need assignment; sessions need merging too.", diff: "easy" },
        { q: "Design a per-tenant reporting pipeline where tenants have different SLA window sizes.", a: "Use per-element custom windowing: the WindowFn reads the tenant's configured window size from the element (or a side input) and assigns it to a window of that size. Combine this with unaligned offsets, such as hash(tenant), to avoid synchronized bursts, and with a watermark trigger plus allowed lateness. Store results keyed by tenant + window start.", diff: "hard" }
      ],
      labs: ["ptWindows", "sessions", "unaligned"]
    },

    // =====================================================================
    // CHAPTER 5
    // =====================================================================
    {
      id: "ch5",
      part: 1,
      number: 5,
      title: "Exactly-Once and Side Effects",
      overview: `How Dataflow guarantees that every record is processed <strong>effectively exactly once</strong>, even though records are delivered at least once under the hood. The chapter covers <strong>shuffle deduplication</strong> with unique record IDs, <strong>checkpointing</strong> to deal with nondeterminism, the performance optimizations that make it practical (<strong>graph fusion</strong>, <strong>combiner lifting</strong>, <strong>Bloom filters</strong>, <strong>garbage collection</strong>), and exactly-once <strong>sources</strong> and <strong>sinks</strong>. It then compares the approaches in Spark Streaming and Flink.`,
      concepts: [
        { term: "Why exactly-once matters", def: "Without it, users must run a batch pipeline to correct streaming results (Lambda architecture). Accuracy matters for billing, ad attribution and similar use cases. Duplicates and drops both break trust.", why: "This is the \"correctness\" half of the thesis that streaming is a superset of batch." },
        { term: "At-least-once delivery underneath", def: "Dataflow sends records between workers via RPCs. If an RPC fails <strong>ambiguously</strong> (a timeout or a lost ack), the sender can't know whether the receiver processed it, so it <strong>retries until it gets a positive ack</strong>. That guarantees no data loss but creates duplicates.", demo: "exactlyOnce" },
        { term: "Shuffle deduplication", def: "Each record carries a <strong>unique ID</strong>. The receiver keeps a <strong>catalog</strong> of IDs already processed and committed in persistent state. Retries carrying an already-seen ID are dropped.", why: "Combined with at-least-once retries, this gives effectively exactly-once delivery between stages.", demo: "exactlyOnce" },
        { term: "Nondeterminism and checkpointing", def: "User code may be <strong>nondeterministic</strong>: it reads the current time, generates random IDs, queries external services, or iterates in a non-deterministic order. If a retry recomputes the output, it may differ from what was already sent. Dataflow therefore <strong>checkpoints the output</strong> (with the record IDs) to stable storage before sending it downstream. Retries replay the checkpointed output instead of recomputing.", why: "Exactly-once requires that every version of a record seen downstream is the same version.", demo: "sinks" },
        { term: "Graph optimization: fusion", def: "Consecutive steps are <strong>fused</strong> into a single stage so that records pass between them in memory, with no shuffle and therefore no dedup or checkpoint needed in between.", why: "This removes most of the cost of exactly-once from element-wise chains." },
        { term: "Combiner lifting", def: "Partial aggregation (a combiner) runs on the sending side <strong>before</strong> the shuffle, so far fewer records cross the network and need deduplicating.", why: "It is the same idea as MapReduce combiners. It cuts shuffle volume, and with it the exactly-once overhead.", demo: "stateCost" },
        { term: "Bloom filters for dedup", def: "Most records are not duplicates, so looking every ID up in the catalog is expensive. Each worker keeps a <strong>Bloom filter</strong> of IDs it has seen. If the filter says <em>definitely not seen</em>, the catalog lookup is skipped. If it says <em>maybe seen</em>, the worker checks the catalog (which handles false positives). Filters are bucketed by <strong>10-minute</strong> windows of the system timestamp, so old filters can be dropped.", demo: "exactlyOnce" },
        { term: "Garbage collecting dedup state", def: "The catalog can't grow forever. Each record is tagged with a <strong>sequence number</strong>, or Dataflow uses a <strong>processing-time watermark</strong> of the oldest in-flight RPC. Once the watermark passes a timestamp, records older than it can't be retried, so their IDs can be garbage collected. Duplicates of records older than the GC horizon, from <strong>network remnants</strong> (old RPCs stuck in the network), are detected by timestamp and ignored.", why: "This is the processing-time watermark from Chapter 3 at work." },
        { term: "Exactly-once sources", def: "The source must provide <strong>deterministic record IDs</strong>. Deterministic sources, such as files or Kafka partition + offset, are naturally replayable. For non-deterministic sources, Beam's <code>UnboundedSource</code> can implement <code>getCurrentRecordId</code> so Dataflow can deduplicate re-read records.", ex: "Pub/Sub supplies a unique message ID; Kafka uses partition + offset." },
        { term: "Exactly-once sinks", def: "Side effects (writes to external systems) happen outside the pipeline, so they can be repeated on retry. Two techniques help. Make the write <strong>idempotent</strong> (writing the same thing twice has the same effect). Feed it a <strong>deterministic input</strong> by putting a <code>Reshuffle</code> (GroupByKey) before it, which checkpoints the input so retries see exactly the same data.", why: "Idempotence alone isn't enough if a retry computes a different record, for example a new random insert ID or a pane that now includes more data.", demo: "sinks" },
        { term: "Example: files sink", def: "Each bundle is written to a <strong>temporary file</strong> with a unique name, then a final step <strong>renames</strong> the files to their final names. Renames are idempotent, and the set of temp files is checkpointed.", demo: "sinks" },
        { term: "Example: BigQuery sink", def: "Each row gets a <strong>unique insert ID</strong> (a random UUID) in a step whose output is <strong>checkpointed via Reshuffle</strong>. BigQuery deduplicates inserts with the same ID on a best-effort basis. Because the ID is checkpointed, retries reuse the same ID.", demo: "sinks" },
        { term: "Spark Streaming exactly-once", def: "<strong>Microbatches</strong> are deterministic RDD computations. A failed batch is recomputed from lineage and its output replaced. Exactly-once holds for the batch output; external sinks must still be idempotent." },
        { term: "Flink exactly-once", def: "Periodic <strong>distributed snapshots</strong> (a Chandy-Lamport variant). Barriers flow with the data; operators checkpoint state when they receive barriers. On failure, the job rolls back to the last snapshot and replays the sources. Sinks must cooperate, for example with a two-phase commit tied to snapshot completion.", why: "Flink's snapshots are cheaper per record than Dataflow's per-record dedup, but failures roll back the whole pipeline, and output must be held or made transactional until a snapshot completes." }
      ],
      cheatsheet: [
        { title: "Exactly-once building blocks in Dataflow", type: "table", headers: ["Problem", "Mechanism"], rows: [
          ["Lost RPCs", "Retry until acked (at-least-once)"],
          ["Duplicate RPCs from retries", "Unique record IDs + dedup catalog at the receiver"],
          ["Nondeterministic user code", "Checkpoint output before sending; replay on retry"],
          ["Catalog lookup cost", "Per-worker Bloom filters, bucketed by 10 min"],
          ["Catalog growth", "GC using sequence numbers or a processing-time watermark; ignore network remnants"],
          ["Shuffle volume", "Fusion + combiner lifting"],
          ["Replays from sources", "Deterministic IDs (offsets) or getCurrentRecordId"],
          ["Side effects in sinks", "Idempotent writes + deterministic input (Reshuffle)"]
        ]},
        { title: "Exactly-once sink recipe (BigQuery-style)", type: "code", body: `rows
  .apply(ParDo.of(new AttachUniqueInsertId()))   // random UUID per row: nondeterministic!
  .apply(Reshuffle.of())                         // checkpoint: retries see the SAME UUIDs
  .apply(ParDo.of(new StreamingInsertWithId())); // BigQuery dedups on insert ID` },
        { title: "Comparing exactly-once strategies", type: "table", headers: ["System", "Mechanism", "Failure recovery"], rows: [
          ["Dataflow", "Per-record IDs + dedup + checkpointing at shuffles", "Only the affected work is retried"],
          ["Spark Streaming", "Deterministic microbatches (RDD lineage)", "Recompute the failed batch"],
          ["Flink", "Chandy-Lamport style consistent snapshots", "Roll back the whole job to the last snapshot, replay sources"]
        ]},
        { title: "Gotchas", type: "list", items: [
          "Exactly-once covers <strong>state and shuffles</strong>. It does <em>not</em> make arbitrary external calls inside a DoFn happen once.",
          "An idempotent write with a <strong>non-deterministic key</strong> (a fresh random ID on retry) is not idempotent at all.",
          "After a crash, a window can fire again with <strong>more data</strong> (a late arrival). Only a checkpoint before the sink guarantees the same output."
        ]}
      ],
      interview: [
        { q: "How does Dataflow get exactly-once out of an at-least-once RPC layer?", a: "Senders retry RPCs until acked, so nothing is lost. Each record has a unique ID, and receivers check a persistent catalog of processed IDs and drop duplicates, with the dedup committed atomically with state updates. Output is checkpointed before sending, so retries are bit-identical.", diff: "med" },
        { q: "Why is checkpointing needed if you already deduplicate by record ID?", a: "Because of nondeterminism. If a retry re-executes user code that calls the clock, generates a UUID or reads an external service, it may produce a <em>different</em> record with a new ID, which dedup can't catch. Checkpointing the output before sending ensures the exact same record (and ID) is replayed.", diff: "hard" },
        { q: "How do Bloom filters reduce the cost of exactly-once?", a: "Most records aren't duplicates. A per-worker Bloom filter answers \"definitely not seen\" cheaply, so the catalog lookup is skipped. Only \"maybe seen\" results hit the catalog (false positives are possible, false negatives are not). Filters are bucketed by 10-minute time ranges so old ones can be discarded.", diff: "med" },
        { q: "How does Dataflow garbage-collect deduplication records safely?", a: "It tracks a processing-time watermark: the oldest in-flight RPC or record timestamp. IDs older than the watermark can't be retried anymore, so they're removed. Late network remnants older than the GC horizon are detected by timestamp and dropped.", diff: "hard" },
        { q: "What does it take for a sink to be exactly-once?", a: "Its writes must be idempotent, and its <em>input</em> must be deterministic across retries. Put a Reshuffle (checkpoint) before the side-effecting step so retries see identical elements. Examples: a files sink (write temp files, then idempotent rename); BigQuery (generate random insert IDs, Reshuffle, then insert with IDs that BigQuery deduplicates).", diff: "med" },
        { q: "What's wrong with generating a random insert ID right before writing to BigQuery, without a Reshuffle?", a: "On retry, the step re-runs and generates a <em>new</em> random ID. BigQuery sees two different IDs and keeps both rows, producing a duplicate. Checkpointing the ID-generation step via Reshuffle guarantees retries reuse the same ID.", diff: "hard" },
        { q: "How do Spark Streaming and Flink provide exactly-once?", a: "Spark Streaming: deterministic microbatches; a failed batch is recomputed from RDD lineage and its output replaces the partial output. Flink: periodic consistent snapshots via barriers (a Chandy-Lamport variant); on failure, it restores all operator state from the last snapshot and replays sources from the recorded offsets. Sinks need transactional or idempotent writes in both.", diff: "med" },
        { q: "How do graph fusion and combiner lifting help exactly-once performance?", a: "Fusion merges consecutive steps so records pass in memory, avoiding shuffles, and therefore avoiding dedup and checkpoints in between. Combiner lifting pre-aggregates before the shuffle, so far fewer records cross it and need deduplicating.", diff: "easy" },
        { q: "Design an exactly-once pipeline from Kafka to a payments ledger table.", a: "Source: Kafka partition + offset as a deterministic record ID. Processing: keyed aggregation with exactly-once state (Dataflow dedup or Flink snapshots). Sink: generate a deterministic transaction ID per window, such as <code>account#window#paneIndex</code>, or a random ID checkpointed via Reshuffle. Write to the ledger with an idempotent upsert or insert-if-not-exists on that ID, or use a transactional two-phase commit tied to Flink checkpoints. Verify with reconciliation counts.", diff: "hard" }
      ],
      labs: ["exactlyOnce", "sinks"]
    }
  ]
};
