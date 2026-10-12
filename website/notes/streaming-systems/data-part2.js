// Streaming Systems - chapter notes, Part II (appended to window.DATA.chapters)

window.DATA.chapters.push(
  // =====================================================================
  // CHAPTER 6
  // =====================================================================
  {
    id: "ch6",
    part: 2,
    number: 6,
    title: "Streams and Tables",
    overview: `Part II opens with the idea that ties everything together. <strong>Streams and tables are two sides of the same coin.</strong> A stream is <em>data in motion</em> and a table is <em>data at rest</em>. Aggregating a stream yields a table; observing a table's changes yields a stream. The chapter recasts MapReduce (TABLE → STREAM → STREAM → TABLE → STREAM → STREAM → TABLE) and the four questions in this light. It ends with a <strong>general theory of stream and table relativity</strong>: element-wise operations turn streams into streams, grouping turns streams into tables, triggering turns tables into streams, and nothing turns a table directly into a table.`,
    concepts: [
      { term: "Stream ↔ table duality", def: "<strong>Streams → tables</strong>: aggregating a stream of updates over time yields a table. <strong>Tables → streams</strong>: observing a table's changes over time yields a stream. This is the same idea as database transaction logs (the stream) and the tables they maintain.", why: "Every data pipeline, batch or streaming, is just streams and tables plus operations between them.", demo: "streamTable" },
      { term: "Data at rest vs data in motion", def: "<strong>Tables are data at rest</strong>: a container where data accumulate and can be observed. <strong>Streams are data in motion</strong>: a discretized view of a table evolving over time.", why: "This definition doesn't care whether the data is bounded or unbounded. Streams exist in batch too." },
      { term: "MapReduce as streams and tables", def: "The six phases are MapRead (table → stream), Map (stream → stream), MapWrite (stream → table, grouping by key), ReduceRead (table → stream), Reduce (stream → stream), and ReduceWrite (stream → table). The whole job reads TABLE → STREAM → STREAM → TABLE → STREAM → STREAM → TABLE.", why: "Batch processing is full of streams. Streaming and batch are conceptually the same thing.", demo: "mapreduceST" },
      { term: "ReduceWrite without keys", def: "If Reduce outputs have no keys, ReduceWrite still groups. It treats each record as having a new, unique key, like a SQL table with an implicit AUTO_INCREMENT primary key. Each record is grouped with itself and brought to rest.", demo: "mapreduceST" },
      { term: "Batch in four steps", def: "(a) Tables are read in their entirety to become streams. (b) Streams are processed into new streams until a grouping operation is hit. (c) Grouping turns the stream into a table. (d) Repeat until you run out of stages.", demo: "mapreduceST" },
      { term: "What: transformations", def: "<strong>Nongrouping</strong> (element-wise) operations take a stream and produce a stream. <strong>Grouping</strong> operations take a stream and produce a table.", why: "Grouping is the only thing that brings data to rest. That's why it's always the tricky part in streaming.", demo: "streamTable" },
      { term: "Where: windowing", def: "Windowing is just a modification of grouping: group by key <em>and</em> window. For merging windows such as sessions, the key remains the unit of atomicity and parallelism, and windows are a child component inside each key's group. Merges happen atomically within a key.", why: "This is why session windows need the system to group by key first, then merge windows inside the key." },
      { term: "When: triggers are ungrouping", def: "Triggers are the inverse of grouping. They take data at rest in a table and put it back into motion as a stream. A trigger decides when the table's current state is observed and emitted.", why: "Without triggers, a streaming grouping would hold the data at rest forever. The trigger is what gets it moving again.", demo: "streamTable" },
      { term: "Watermarks in the streams/tables view", def: "Watermarks give a notion of completeness relative to event time. They are a reference point that triggers use to decide when a table (a window's group) is ready to be ungrouped.", demo: "streamTable" },
      { term: "How: accumulation shapes the stream", def: "The accumulation mode determines the nature of the stream produced by triggering. A stream of <strong>deltas</strong> (discarding) or of <strong>values</strong> (accumulating), with or without <strong>retractions</strong> for previous deltas or values.", why: "Whether the consumer can rebuild the right table from the stream depends entirely on this choice.", demo: "streamTable" },
      { term: "Stream → stream: nongrouping", def: "Element-wise operations alter data in the stream but leave it in motion, possibly changing cardinality (filter, flatMap).", demo: "streamTable" },
      { term: "There is no table → table", def: "No operation consumes a table and produces a table. Data can't go from rest back to rest without being put into motion. All modifications to a table happen by converting it to a stream and back again.", why: "Even an UPDATE in a database works this way: the log (stream) is applied to the table.", demo: "mapreduceST" }
    ],
    cheatsheet: [
      { title: "General theory of stream and table relativity", type: "table", headers: ["Operation", "Kind", "Examples"], rows: [
        ["stream → stream", "Nongrouping (element-wise)", "ParDo, map, filter, flatMap, parse"],
        ["stream → table", "Grouping", "GroupByKey, Combine, Sum, windowed aggregation, join"],
        ["table → stream", "Ungrouping (triggering)", "Triggers, watermark trigger, per-record changelog, table scan"],
        ["table → table", "(none)", "Impossible: data must go into motion and back"]
      ]},
      { title: "MapReduce through the streams/tables lens", type: "table", headers: ["Phase", "Input → Output", "What happens"], rows: [
        ["MapRead", "table → stream", "Iterate over input data at rest"],
        ["Map", "stream → stream", "User's element-wise map function"],
        ["MapWrite", "stream → table", "Group by key into (key, list of values)"],
        ["ReduceRead", "table → stream", "Iterate over grouped data"],
        ["Reduce", "stream → stream", "User's reduce (a glorified map over value lists)"],
        ["ReduceWrite", "stream → table", "Group by key, or by an implicit unique key if output is unkeyed"]
      ]},
      { title: "The four questions in the streams/tables world", type: "table", headers: ["Question", "Streams &amp; tables meaning"], rows: [
        ["<span class='q q-what'>What</span>", "Nongrouping = stream→stream; grouping = stream→table"],
        ["<span class='q q-where'>Where</span>", "Windowing = grouping by key + window (windows are children of keys)"],
        ["<span class='q q-when'>When</span>", "Triggers ungroup tables into streams; watermarks tell them when a group is complete"],
        ["<span class='q q-how'>How</span>", "Accumulation determines whether the stream carries deltas or values, with or without retractions"]
      ]},
      { title: "Pick the stream shape by its consumer", type: "table", headers: ["Consumer", "Discarding (deltas)", "Accumulating (values)", "Retracting"], rows: [
        ["Overwrite by key (KV store, Bigtable)", "✗ stores last delta", "✓", "✓"],
        ["Adds what it receives (regroup + sum)", "✓", "✗ double counts", "✓"],
        ["Merging windows / non-additive regrouping", "✗", "✗", "✓"]
      ]}
    ],
    interview: [
      { q: "State the stream and table duality in two sentences.", a: "Aggregating a stream of updates over time yields a table, and observing the changes to a table over time yields a stream. Tables are data at rest; streams are data in motion.", diff: "easy" },
      { q: "Describe MapReduce in terms of streams and tables.", a: "MapRead: table → stream. Map: stream → stream. MapWrite: stream → table (grouping by key). ReduceRead: table → stream. Reduce: stream → stream. ReduceWrite: stream → table. Overall TABLE → STREAM → STREAM → TABLE → STREAM → STREAM → TABLE. Batch processing is full of streams.", diff: "med" },
      { q: "If grouping brings data to rest, what puts it back in motion?", a: "Ungrouping, which is triggering. A trigger observes a table (for example, a window's aggregate) at specific moments and emits its contents as a stream. That's why every streaming aggregation needs a trigger, even if it's implicit (per-record, or the watermark default).", diff: "med" },
      { q: "Why is there no table → table operation?", a: "Data at rest can't become data at rest somewhere else without moving. Every transformation of a table conceptually scans it (or its changelog) into a stream, processes the stream, and groups it into a new table. Databases work the same way with logs and materialized views.", diff: "med" },
      { q: "How do merging windows fit into grouping?", a: "Windowing is grouping by key + window. For merging windows (sessions), the system groups by key first, keeping the key as the unit of atomicity and parallelism, and then merges windows within that key. A new element can cause existing windows to merge, which atomically deletes the old windows and inserts the merged one.", diff: "hard" },
      { q: "How does accumulation mode relate to the stream that triggers produce?", a: "It determines whether the stream contains deltas (discarding) or full values (accumulating), and whether it carries retractions of previous outputs. Downstream consumers must interpret the stream correctly to rebuild the right table.", diff: "med" },
      { q: "A downstream job sums per-user totals into per-team totals, and the numbers are too high. What happened?", a: "The upstream produced an accumulating stream of values, and the downstream treated each value as a delta. Each update re-added the full total. Fix it by emitting deltas (discarding) or retractions (−old, +new), or by having the downstream upsert per user before summing.", diff: "hard" },
      { q: "How do streams relate to bounded vs unbounded data?", a: "They are orthogonal. A stream is just data in motion, and batch jobs over bounded data use streams internally (MapRead to MapWrite). Bounded vs unbounded is about cardinality; stream vs table is about constitution.", diff: "easy" }
    ],
    labs: ["streamTable", "mapreduceST"]
  },

  // =====================================================================
  // CHAPTER 7
  // =====================================================================
  {
    id: "ch7",
    part: 2,
    number: 7,
    title: "The Practicalities of Persistent State",
    overview: `Why pipelines need <strong>persistent state</strong>, and the trade-offs between forms of state. <strong>Raw grouping</strong> is simple but costly. <strong>Incremental combining</strong> with a CombineFn needs commutative, associative operations but is cheap and parallelizable. <strong>Generalized state + timers</strong> is the most flexible. A long <strong>conversion attribution</strong> case study shows why you need state and timers for real-world, out-of-order logic.`,
    concepts: [
      { term: "Why persistent state?", def: "Two reasons. <strong>Correctness despite failures</strong>: state survives machine failures, so a pipeline can resume without losing or duplicating work. <strong>Efficiency</strong>: keeping partial progress means you don't have to recompute from the start of an unbounded input.", why: "Unbounded inputs mean you can't \"just rerun the job\". You need checkpointed progress." },
      { term: "Durable inputs and checkpoints", def: "Recovery always relies on <strong>replayable inputs</strong> (files, Kafka offsets) plus <strong>checkpointed state</strong>, so only the work since the last checkpoint is redone.", why: "Checkpoint frequency trades recovery time against steady-state overhead." },
      { term: "Implicit state: raw grouping", def: "GroupByKey keeps <strong>a list of all inputs</strong> per key and window, and the aggregation runs over that list when it's triggered.", why: "It's simple and works for any operation, but storage grows with the number of inputs, every firing reprocesses everything, and merging windows means concatenating lists.", ex: "Summing 1,000 scores stores 1,000 integers; each early firing re-sums all of them.", demo: "stateCost" },
      { term: "Incremental combining (CombineFn)", def: "A CombineFn has four methods: <code>createAccumulator()</code>, <code>addInput(acc, in)</code>, <code>mergeAccumulators(accs)</code>, and <code>extractOutput(acc)</code>. The operation must be <strong>commutative and associative</strong>.", why: "That buys <strong>incrementalization</strong> (keep a compact accumulator, not the list) and <strong>parallelization</strong> (compute partial accumulators anywhere and merge them, as in combiner lifting).", ex: "Mean: the accumulator is (sum, count); merge adds pairwise; extract divides.", demo: "stateCost" },
      { term: "Combiner lifting and hot keys", def: "Because accumulators merge, partial combining happens <strong>before</strong> the shuffle on every worker, so each worker sends one accumulator per key instead of every element.", why: "It turns a hot key with millions of records into a handful of shuffled accumulators.", demo: "stateCost" },
      { term: "Limits of combining", def: "Combining doesn't work when you need the order of events, non-associative logic, or complex lookups across many kinds of input (like attribution trees). The trigger model (when to emit) can also be too rigid for custom business logic.", why: "This is the motivation for generalized state." },
      { term: "Generalized state: three flexibilities", def: "(1) <strong>Data structures</strong>: ValueState, BagState, SetState, MapState and so on, chosen to match the access patterns. (2) <strong>Write and read granularity</strong>: read or write only what you need (one map entry, not the whole state). (3) <strong>Scheduling of processing</strong>: <strong>timers</strong> bind a callback to a point in event time or processing time.", why: "Real business logic needs to choose its own storage layout and when to compute.", demo: "attribution" },
      { term: "Timers", def: "A timer is a special kind of state that binds a point in time to a method to call. <strong>Event-time timers</strong> fire when the watermark passes their timestamp (completeness-driven). <strong>Processing-time timers</strong> fire after wall-clock delays (latency-driven).", why: "Timers let you delay complex logic until all the relevant data has probably arrived, which is the key to handling out-of-order data correctly.", demo: "attribution" },
      { term: "Conversion attribution problem", def: "Given ad <strong>impressions</strong>, page <strong>visits</strong> (each with a referer), and <strong>goals</strong> (conversions), walk back from each goal through the chain of referring visits to the ad impression that started it. The pipeline must handle out-of-order data, high volumes, spam (dedup impressions), and performance.", demo: "attribution" },
      { term: "Attribution state layout", def: "Per user: <strong>MapState&lt;URL, Visit&gt;</strong> for visits, <strong>MapState&lt;URL, Impression&gt;</strong> for impressions, <strong>SetState&lt;Visit&gt;</strong> for pending goals, a <strong>ValueState&lt;Instant&gt;</strong> for the minimum pending goal timestamp, and one <strong>event-time Timer</strong> set to that minimum.", why: "Beam only allows statically declared timers, so a single timer is reset to the earliest pending goal each time one is processed.", demo: "attribution" },
      { term: "Why event-time timers make attribution correct", def: "If you try to attribute a goal the instant it arrives, its referring visits or impression may not have arrived yet (out-of-order data), and the walk-back fails. An event-time timer at the goal's timestamp fires only once the watermark says all earlier data has arrived.", demo: "attribution" }
    ],
    cheatsheet: [
      { title: "Forms of state: trade-offs", type: "table", headers: ["Approach", "Storage", "Compute per firing", "Flexibility"], rows: [
        ["Raw grouping (GroupByKey)", "All inputs (O(n))", "Reprocess everything", "Any operation, but rigid timing"],
        ["Incremental combining (CombineFn)", "One accumulator (O(1) usually)", "O(1) extract", "Only commutative + associative ops"],
        ["Generalized state + timers", "You choose (Value/Bag/Set/Map)", "You choose", "Maximal: custom layouts and scheduling"]
      ]},
      { title: "CombineFn interface", type: "code", body: `class CombineFn<InputT, AccumT, OutputT> {
    AccumT  createAccumulator();
    AccumT  addInput(AccumT accumulator, InputT input);
    AccumT  mergeAccumulators(Iterable<AccumT> accumulators);
    OutputT extractOutput(AccumT accumulator);
}
// Mean: AccumT = (sum, count); merge = pairwise add; extract = sum / count` },
      { title: "Attribution DoFn state (Beam)", type: "code", body: `@StateId("visits")      MapState<String, Visit>      visits;      // URL -> visit
@StateId("impressions") MapState<String, Impression> impressions; // URL -> impression (dedup)
@StateId("goals")       SetState<Visit>              goals;       // pending goals
@StateId("minGoal")     ValueState<Instant>          minGoal;     // earliest pending goal
@TimerId("attribution") Timer attributionTimer;  // TimeDomain.EVENT_TIME, set to minGoal

// processElement: store visit/impression/goal; if goal < minGoal => reset timer
// onTimer: for each goal <= watermark, walk visits back via referer until an impression is found` },
      { title: "Event-time vs processing-time timers", type: "table", headers: ["", "Event-time timer", "Processing-time timer"], rows: [
        ["Fires when", "The watermark passes the timestamp", "Wall clock reaches the deadline"],
        ["Use for", "Completeness-dependent logic (attribution, window close)", "Latency-bound actions, timeouts, periodic flushes"],
        ["Affected by backlog?", "Waits for data (correct)", "Fires anyway (may act on incomplete data)"]
      ]}
    ],
    interview: [
      { q: "Why does a streaming pipeline need persistent state?", a: "For correctness through failures (resume without loss or duplicates) and for efficiency (don't recompute from the beginning of an unbounded input). Combined with replayable inputs, checkpointed state limits how much work is redone after a failure.", diff: "easy" },
      { q: "Compare raw grouping and incremental combining.", a: "Raw grouping keeps every input and reprocesses the whole list each time it's triggered, so its storage and compute are O(n). It works for anything. Incremental combining keeps an accumulator, which needs commutative and associative operations. Storage is roughly constant, each input is folded in once, accumulators can be merged in parallel (combiner lifting), and merging windows is cheap.", diff: "med" },
      { q: "What are the four methods of a CombineFn, and how would you implement mean?", a: "createAccumulator → (0, 0); addInput → (sum + x, count + 1); mergeAccumulators → pairwise sum of sums and counts; extractOutput → sum / count. Because merge is associative and commutative, partial accumulators can be computed on any worker in any order.", diff: "med" },
      { q: "What three kinds of flexibility does generalized state provide?", a: "(1) Flexibility in data structures (value, bag, set, map) matched to access patterns. (2) Flexibility in write and read granularity, so you touch only the parts you need. (3) Flexibility in scheduling processing, through event-time and processing-time timers.", diff: "med" },
      { q: "In the conversion attribution case study, why use an event-time timer instead of processing each goal immediately?", a: "Data arrives out of order. When a goal arrives, the visits that led to it, or the ad impression, might not have arrived yet. Attributing immediately would fail or give wrong answers. Setting an event-time timer at the goal's timestamp delays attribution until the watermark says all data up to that time has arrived.", diff: "hard" },
      { q: "Why does the attribution example keep a minGoal ValueState?", a: "Beam requires timers to be declared statically, so you can't have a dynamic set of timers. The DoFn keeps one timer set to the earliest pending goal's timestamp, tracked in minGoal. When it fires, it attributes all goals up to the watermark, then resets the timer to the next earliest goal.", diff: "hard" },
      { q: "How does the attribution pipeline handle spam or duplicate impressions?", a: "Impressions are stored in a MapState keyed by the URL they lead to. A repeated impression for the same target can be detected and ignored, which protects against an ad being \"credited\" multiple times by spammy repeated impressions.", diff: "med" },
      { q: "When would you pick processing-time timers over event-time timers?", a: "When you care about latency or wall-clock behavior rather than completeness. Examples: flushing a buffer every 30 seconds, timing out a session after inactivity in real time, or sending heartbeats. With a backlog, event-time timers wait for the data, whereas processing-time timers fire regardless.", diff: "med" }
    ],
    labs: ["stateCost", "attribution"]
  },

  // =====================================================================
  // CHAPTER 8
  // =====================================================================
  {
    id: "ch8",
    part: 2,
    number: 8,
    title: "Streaming SQL",
    overview: `What should SQL look like over streams? The answer is <strong>time-varying relations (TVRs)</strong>: relations that evolve over time. Relational algebra applies to them point by point, so <strong>closure is preserved</strong>. <strong>Tables and streams are just two renderings of a TVR</strong>: a TABLE shows a snapshot at a point in time, and a STREAM shows the sequence of changes. The chapter compares stream-biased (Beam) and table-biased (classic SQL) approaches and maps the four questions onto SQL: GROUP BY windows for <span class="q q-where">Where</span>, an <code>EMIT</code> clause for <span class="q q-when">When</span>, and <code>Sys.Undo</code> retractions for <span class="q q-how">How</span>.`,
    concepts: [
      { term: "Relational algebra and closure", def: "Relational operators take relations and produce relations (the <strong>closure property</strong>), so they compose freely. Any streaming SQL must keep closure.", why: "If stream operators produced something other than relations, SQL composability would break." },
      { term: "Time-varying relation (TVR)", def: "A relation whose contents change over time: a sequence of classic relations, one per point in time. Applying a relational operator to a TVR applies it to each snapshot independently, yielding a new TVR.", why: "All of relational algebra carries over unchanged, and closure holds.", demo: "tvr" },
      { term: "Tables and streams are renderings of a TVR", def: "<strong>TABLE</strong> rendering: a snapshot of the TVR at one point in time (what classic SQL shows). <strong>STREAM</strong> rendering: the sequence of changes to the TVR over time (a changelog). Both encode the same TVR.", why: "So <code>SELECT TABLE</code> vs <code>SELECT STREAM</code> is just a choice of how to look at results, not a different query.", demo: "tvr" },
      { term: "System columns", def: "Proposed metadata columns: <strong>Sys.MTime</strong> (time a row was last modified, in table renderings), <strong>Sys.EmitTime</strong> (time the row was emitted, in streams), <strong>Sys.EmitTiming</strong> (early, on-time or late relative to the watermark), <strong>Sys.EmitIndex</strong> (pane index), and <strong>Sys.Undo</strong> (marks a retraction row).", demo: "sqlEmit" },
      { term: "Stream-biased vs table-biased", def: "<strong>Beam is stream-biased</strong>: PCollections are streams, tables are implicit (inside groupings), and triggers on groupings turn them back into streams. <strong>Classic SQL is table-biased</strong>: tables are explicit and streams are implicit. For example, a materialized view effectively does SCAN-AND-STREAM over its inputs and keeps a table updated.", why: "Understanding the bias tells you where to put triggers (Beam) or how views maintain themselves (SQL)." },
      { term: "Where: windowing in SQL", def: "Windows appear as grouping expressions: <code>GROUP BY TUMBLE(EventTime, INTERVAL '2' MINUTE)</code> for fixed windows, plus <code>HOP</code> (sliding) and <code>SESSION</code>. Windows can't simply be emulated with ordinary GROUP BY time arithmetic, because sessions merge and watermarks need to know window ends.", demo: "sqlEmit" },
      { term: "When: the EMIT clause", def: "Triggers become an <code>EMIT</code> clause on the query. The default for STREAM is effectively per-record (emit on every change). <code>EMIT WHEN WATERMARK PAST WINDOW_END(Window)</code> gives completeness-based output, and <code>AND THEN AFTER &lt;duration&gt;</code> adds repeated late updates.", why: "Data-driven triggers don't need special syntax. <code>HAVING</code> already filters which changes are emitted.", demo: "sqlEmit" },
      { term: "How: retractions via Sys.Undo", def: "Streaming SQL naturally uses accumulating values plus retractions. When a row changes, the stream contains an <strong>undo</strong> row for the old value and a new row for the new value.", why: "Retractions make downstream regrouping and merging windows correct.", demo: "tvr" },
      { term: "Materialized views", def: "A materialized view is a table kept up to date by continuously applying the stream of changes from its inputs. It is a concrete example of SQL's implicit table → stream → table conversion (SCAN-AND-STREAM).", why: "It shows that classic databases have been doing \"streaming\" internally all along." },
      { term: "Per-record vs watermark emission in SQL", def: "Per-record emission gives the most up-to-date result but many updates (with retractions). Watermark emission gives one on-time row per window (plus late rows if requested).", ex: "With the book's heuristic watermark, the [12:00, 12:02) window emits 5 on time, and then 14 as a late row when the 9 arrives.", demo: "sqlEmit" }
    ],
    cheatsheet: [
      { title: "TVR renderings", type: "table", headers: ["Rendering", "Shows", "Keyword"], rows: [
        ["Table", "Snapshot of the TVR at a point in time", "SELECT TABLE ... (classic default)"],
        ["Stream", "Changelog of the TVR over time", "SELECT STREAM ..."],
        ["TVR", "The full sequence of snapshots", "The conceptual object both encode"]
      ]},
      { title: "Four questions in streaming SQL", type: "table", headers: ["Question", "SQL construct"], rows: [
        ["<span class='q q-what'>What</span>", "SELECT / WHERE / GROUP BY / JOIN (ordinary relational algebra)"],
        ["<span class='q q-where'>Where</span>", "GROUP BY TUMBLE(...), HOP(...), SESSION(...)"],
        ["<span class='q q-when'>When</span>", "EMIT WHEN WATERMARK PAST ...; AND THEN AFTER &lt;duration&gt;; default per-record"],
        ["<span class='q q-how'>How</span>", "Accumulating values + Sys.Undo retractions"]
      ]},
      { title: "Watermark trigger with late updates", type: "code", body: `SELECT STREAM
  SUM(Score) AS Total,
  TUMBLE(EventTime, INTERVAL '2' MINUTE) AS Window,
  CURRENT_TIMESTAMP AS EmitTime,
  Sys.EmitTiming, Sys.EmitIndex
FROM UserScores
GROUP BY TUMBLE(EventTime, INTERVAL '2' MINUTE)
EMIT WHEN WATERMARK PAST WINDOW_END(Window)
  AND THEN AFTER 0 SECONDS;   -- 0 = per-record late updates` },
      { title: "System columns", type: "table", headers: ["Column", "Meaning"], rows: [
        ["Sys.MTime", "Time the row was last modified (table rendering)"],
        ["Sys.EmitTime", "Time the row was emitted (stream rendering)"],
        ["Sys.EmitTiming", "early / on-time / late relative to the watermark"],
        ["Sys.EmitIndex", "Pane index for this window (0, 1, 2...)"],
        ["Sys.Undo", "Marks a retraction of a previously emitted row"]
      ]}
    ],
    interview: [
      { q: "What is a time-varying relation and why is it the right foundation for streaming SQL?", a: "A relation that evolves over time: a sequence of snapshots. Relational operators apply to each snapshot independently, so the result is another TVR. Closure is preserved and all of relational algebra carries over unchanged to streams.", diff: "med" },
      { q: "Explain \"tables and streams are just renderings of a TVR\".", a: "A TABLE shows the TVR's state at a particular time; a STREAM shows its sequence of changes. They encode the same information. SELECT TABLE vs SELECT STREAM is a choice of view, and the query logic (WHERE, GROUP BY, JOIN) is identical.", diff: "med" },
      { q: "What does it mean that Beam is stream-biased and SQL is table-biased?", a: "In Beam, the first-class objects are PCollections (streams). Tables exist only implicitly inside grouping operations, and triggers turn them back into streams. In SQL, tables are first-class and streams are implicit; a materialized view internally scans and streams changes to maintain itself.", diff: "hard" },
      { q: "How are triggers expressed in the proposed streaming SQL?", a: "With an EMIT clause. The default STREAM behavior is per-record. EMIT WHEN WATERMARK PAST WINDOW_END(Window) emits on completeness. AND THEN AFTER &lt;duration&gt; adds repeated late or delayed updates. Data-driven triggers aren't needed, because HAVING already filters which changes get emitted.", diff: "med" },
      { q: "How does streaming SQL represent retractions?", a: "With a system column, Sys.Undo. When a row's value changes, the stream contains an undo row for the old value followed by the new row. Consumers that regroup, or rely on merging windows, can subtract the old value.", diff: "easy" },
      { q: "Why can't windowing be done with plain GROUP BY on rounded timestamps?", a: "Fixed windows sort of can (round down the event time), but sessions need merging and sliding windows assign one row to several windows. The engine also needs to know window ends to use watermarks (EMIT WHEN WATERMARK PAST WINDOW_END). Hence dedicated TUMBLE, HOP and SESSION constructs.", diff: "hard" },
      { q: "What are Sys.EmitTiming and Sys.EmitIndex useful for?", a: "EmitTiming tells you whether a row was produced early (speculative), on time (the watermark passed) or late (an update after the watermark). EmitIndex is the pane number for the window, so consumers can order or deduplicate updates and know which revision they hold.", diff: "med" }
    ],
    labs: ["tvr", "sqlEmit"]
  },

  // =====================================================================
  // CHAPTER 9
  // =====================================================================
  {
    id: "ch9",
    part: 2,
    number: 9,
    title: "Streaming Joins",
    overview: `Joins viewed through TVRs and streams. The central claims are that <strong>all joins are streaming joins</strong>, and that the <strong>FULL OUTER join is the foundation</strong> from which LEFT, RIGHT, INNER, ANTI and SEMI joins are derived by filtering. The chapter covers <strong>unwindowed</strong> joins (heavy on retractions in stream form), <strong>windowed</strong> joins (partition the join in time, and tie unmatched-row timeouts to the watermark), and <strong>temporal validity windows</strong>, which slice time into regions where a value (such as a currency rate) is valid.`,
    concepts: [
      { term: "All joins are streaming joins", def: "A join is a grouping operation: rows from both sides are grouped by join key, so the join consumes streams and produces a table. In a stream rendering, each new arriving row may produce new joined rows and retract previous ones.", why: "Batch joins are just streaming joins observed once, at the end of a bounded input.", demo: "joins" },
      { term: "FULL OUTER join: the foundation", def: "Keeps all rows from both sides, joined where keys match and padded with NULL where not. In stream form, an unmatched row is first emitted as (L, null). When the matching R arrives, it is retracted and replaced by (L, R).", demo: "joins" },
      { term: "LEFT / RIGHT OUTER", def: "A FULL OUTER join filtered to drop rows where the left (respectively right) side is null.", demo: "joins" },
      { term: "INNER join", def: "A FULL OUTER join filtered to rows where both sides are non-null. In stream form it has no retractions for unmatched rows (in the 1:1 case), because a joined row appears only once both sides are present.", demo: "joins" },
      { term: "ANTI join", def: "The obverse of INNER: only the <strong>unjoined</strong> rows. In stream form it is as heavy on retractions as FULL OUTER, because rows that eventually find a match must be retracted from the result.", demo: "joins" },
      { term: "SEMI join", def: "Left rows that have <em>at least one</em> match on the right, without duplicating the left row per match. It differs from a filtered INNER join when the cardinality is N:M with M &gt; 1.", demo: "joins" },
      { term: "Why window a join?", def: "(1) To <strong>partition the join in time</strong> for business reasons (for example, match only within the same day). (2) To give a <strong>reference point for timing out</strong> unmatched rows: once the watermark passes the end of the window, outer-join NULL rows can be finalized.", why: "Without windows, an outer join never knows whether the other side will still show up.", demo: "joins" },
      { term: "Fixed-window joins", def: "Add window equality to the join criteria: <code>L.Num = R.Num AND L.Window = R.Window</code>. Rows in different windows don't join.", ex: "With 5-minute TUMBLE windows, L2 (12:06) and R2 (12:01) no longer join.", demo: "joins" },
      { term: "Temporal validity windows", def: "Rows slice time into regions where a value is valid: a rate is valid from its event time until the next rate's event time. Each new row <strong>splits</strong> an existing window, so windows can <em>shrink</em>.", why: "No current system supports windows that split natively; Beam's merging windows only grow. The book sketches a partial implementation.", ex: "Euro→Yen: 114 is valid over [12:00:30, 12:03), 116 over [12:03, 12:06), 119 over [12:06, ∞).", demo: "temporalValidity" },
      { term: "Temporal validity joins", def: "Join each order to the rate valid at the order's event time: <code>WINDOW_START(Rate.Window) &lt;= Order.EventTime &lt; WINDOW_END(Rate.Window)</code>. With per-record triggering, out-of-order rates cause retractions. With <code>EMIT WHEN WATERMARK PAST WINDOW_END(...)</code>, each order emits exactly one correct result.", ex: "Orders of 2, 5 and 3 euros at 12:02, 12:05 and 12:08 convert to 228, 580 and 357 yen.", demo: "temporalValidity" }
    ],
    cheatsheet: [
      { title: "Join variants derived from FULL OUTER", type: "table", headers: ["Join", "Rows kept", "Stream retractions?"], rows: [
        ["FULL OUTER", "All, with NULL padding", "Yes: (L, null) → (L, R)"],
        ["LEFT OUTER", "Rows with a non-null left side", "Yes for unmatched lefts"],
        ["RIGHT OUTER", "Rows with a non-null right side", "Yes for unmatched rights"],
        ["INNER", "Rows where both sides are non-null", "Few (1:1)"],
        ["ANTI", "Only unmatched rows", "Heavy"],
        ["SEMI", "Left rows with ≥ 1 match (not duplicated)", "Depends on N:M"]
      ]},
      { title: "Example datasets", type: "table", headers: ["Left", "Time", "Right", "Time"], rows: [
        ["L1", "12:02", "R2", "12:01"],
        ["L2", "12:06", "R3", "12:04"],
        ["L3", "12:03", "R4", "12:05"]
      ], note: "Join on Num: L2 with R2 and L3 with R3. L1 and R4 never match." },
      { title: "Temporal validity join", type: "code", body: `WITH ValidRates AS
  (SELECT Curr, MAX(Rate) AS Rate, VALIDITY_WINDOW(EventTime) AS Window
   FROM YenRates
   GROUP BY Curr, VALIDITY_WINDOW(EventTime))
SELECT STREAM
  YenOrders.Amount AS "E", ValidRates.Rate AS "Y/E",
  YenOrders.Amount * ValidRates.Rate AS "Y",
  YenOrders.EventTime AS Order, Sys.EmitTime AS Time, Sys.Undo AS Undo
FROM YenOrders INNER JOIN ValidRates
  ON YenOrders.Curr = ValidRates.Curr
 AND WINDOW_START(ValidRates.Window) <= YenOrders.EventTime
 AND YenOrders.EventTime < WINDOW_END(ValidRates.Window)
HAVING Curr = "Euro"
EMIT WHEN WATERMARK PAST WINDOW_END(ValidRates.Window);` },
      { title: "Two reasons to window a join", type: "list", items: [
        "<strong>Partition in time</strong>: business semantics such as \"same day\" or \"same session\".",
        "<strong>Time out unmatched rows</strong>: the watermark passing the window end means the outer-join NULLs are final."
      ]}
    ],
    interview: [
      { q: "Why do the authors say \"all joins are streaming joins\"?", a: "A join groups rows from both inputs by join key, a stream-to-table operation. Whether the inputs are bounded or unbounded, the join's result evolves as rows arrive. A batch join is that same streaming join observed once after all input has arrived.", diff: "med" },
      { q: "How can every join type be derived from FULL OUTER?", a: "FULL OUTER keeps everything. LEFT OUTER keeps rows with a non-null left; RIGHT keeps rows with a non-null right; INNER keeps rows where both sides are non-null; ANTI keeps rows where one side is null (unjoined); SEMI keeps left rows that have a match, deduplicated. Each is a filter on FULL OUTER (conceptually; real implementations are more efficient).", diff: "med" },
      { q: "Why are FULL OUTER and ANTI joins heavy on retractions in stream form?", a: "An unmatched row is emitted immediately with a NULL partner (FULL OUTER), or as an unjoined row (ANTI). When the matching row later arrives, that earlier output becomes wrong and must be retracted, then replaced by the joined row (FULL OUTER) or removed (ANTI).", diff: "hard" },
      { q: "When does a SEMI join differ from a filtered INNER join?", a: "When the right side has multiple matches for a left row (N:M with M &gt; 1). INNER produces one output per match, duplicating the left row; SEMI outputs each matching left row once.", diff: "med" },
      { q: "What are the two benefits of windowing a join?", a: "(1) Partitioning the join in time for business semantics, so rows only join within the same window. (2) Giving the watermark a reference point: once it passes the window end, the input is considered complete, so unmatched outer-join rows can be safely finalized and their state dropped.", diff: "med" },
      { q: "What is a temporal validity window and why is it hard to implement?", a: "Each row defines the start of a region where its value is valid, ending where the next row's region begins. A late-arriving row splits an existing window in two, so windows can shrink. Existing windowing frameworks only support windows that grow by merging (sessions), so native support is missing. Beam can only partially emulate it.", diff: "hard" },
      { q: "Walk through converting euro orders to yen with out-of-order rates.", a: "Rates: 114 @12:00:30, 116 @12:03, 119 @12:06, arriving in processing time as 114, 119, 116. Orders: 2 @12:02, 5 @12:05, 3 @12:08. With per-record triggering, order 5 first joins 114 (no 116 yet), giving 570; when 116 arrives it is retracted and re-emitted as 580. With a watermark trigger, each order emits once when the watermark passes the end of its validity window: 228, 580, 357.", diff: "hard" }
    ],
    labs: ["joins", "temporalValidity"]
  },

  // =====================================================================
  // CHAPTER 10
  // =====================================================================
  {
    id: "ch10",
    part: 2,
    number: 10,
    title: "The Evolution of Large-Scale Data Processing",
    overview: `A guided history of the ten systems that shaped modern streaming, from <strong>MapReduce</strong> (2003) to <strong>Beam</strong> (2016). Each is summarized by its key contribution: scalability, open-source ecosystems, pipeline optimization, low latency, strong consistency, out-of-order processing, durable logs, unified batch and streaming, open-source innovation, and portability. Use the timeline lab to explore.`,
    concepts: [
      { term: "MapReduce: scalability and simplicity", def: "Google, 2003–2004. A simple Map → Shuffle → Reduce abstraction on a robust, scalable engine. Engineers could focus on business logic instead of fault tolerance on commodity hardware.", why: "It made large-scale data processing accessible.", demo: "timeline" },
      { term: "Hadoop: open-source ecosystem", def: "Yahoo and Apache, 2005–2006. An open-source MapReduce plus HDFS that spawned a huge ecosystem (Pig, Hive, HBase, and more), extending well beyond the original.", demo: "timeline" },
      { term: "Flume: pipelines and optimization", def: "Google, 2007 (FlumeJava). High-level logical pipelines with an optimizer that does <strong>fusion</strong> and <strong>combiner lifting</strong>, escaping the rigid Map → Shuffle → Reduce shape without hand-tuning.", why: "Those optimizations reappear in Chapter 5 as the reason exactly-once is affordable.", demo: "timeline" },
      { term: "Storm: low latency, weak consistency", def: "BackType and Twitter, 2011. Brought stream processing to the masses by trading correctness for latency. It led to the <strong>Lambda Architecture</strong>: Storm next to batch for eventual correctness.", demo: "timeline" },
      { term: "Spark: strong consistency", def: "UC Berkeley, 2012–2013. RDDs and in-memory batch processing; Spark Streaming ran repeated microbatches of a strongly consistent batch engine. It showed that correctness and low latency were possible together, at least for in-order data.", demo: "timeline" },
      { term: "MillWheel: out-of-order processing", def: "Google, 2013. Strong consistency and exactly-once processing combined with <strong>watermarks</strong> and <strong>timers</strong>. It solved robust stream processing over out-of-order data.", demo: "timeline" },
      { term: "Kafka: durable streams, streams and tables", def: "LinkedIn, 2011. A durable, replayable log as a streaming transport. It restored the replayability that ephemeral transports (RabbitMQ, TCP sockets) had lost, and popularized stream/table theory.", demo: "timeline" },
      { term: "Cloud Dataflow: unified batch + streaming", def: "Google, 2014–2015. Combined MillWheel's out-of-order processing with Flume's optimizable pipelines into the Dataflow Model: the What/Where/When/How framework for balancing correctness, latency and cost.", demo: "timeline" },
      { term: "Flink: open-source streaming innovator", def: "Apache, 2014–2015. Rapidly adopted the Dataflow Model's out-of-order processing in open source, and added its own innovations: <strong>distributed snapshots</strong> and <strong>savepoints</strong>.", demo: "timeline" },
      { term: "Beam: portability", def: "Apache, 2016. A portable programming model and SDKs that run on many runners (Flink, Spark, Dataflow, Apex). It aims to be the programmatic lingua franca, the way SQL is for declarative processing, and to incorporate the best ideas rather than the lowest common denominator.", demo: "timeline" }
    ],
    cheatsheet: [
      { title: "Ten systems, ten contributions", type: "table", headers: ["System", "Contribution", "Trade-off / note"], rows: [
        ["MapReduce", "Scalability + simplicity", "Rigid Map → Shuffle → Reduce"],
        ["Hadoop", "Open-source ecosystem", "Inherited MapReduce's rigidity"],
        ["Flume", "Pipelines + optimizer (fusion, combiner lifting)", "Internal to Google"],
        ["Storm", "Low latency", "Weak consistency, which led to Lambda"],
        ["Spark", "Strong consistency (microbatch)", "Assumed in-order data; latency tied to batch size"],
        ["MillWheel", "Out-of-order processing (watermarks, timers, exactly-once)", "Internal to Google"],
        ["Kafka", "Durable, replayable streams; stream/table theory", "A transport, not a processing model"],
        ["Cloud Dataflow", "Unified batch + streaming (the Dataflow Model)", "Managed service"],
        ["Flink", "Open-source out-of-order streaming, snapshots, savepoints", "Pushed the industry forward"],
        ["Beam", "Portability across runners", "Feature parity depends on the runner"]
      ]},
      { title: "Threads that run through the history", type: "list", items: [
        "<strong>Correctness</strong>: Storm (weak) → Spark (strong, in order) → MillWheel/Dataflow/Flink (strong, out of order).",
        "<strong>Reasoning about time</strong>: watermarks and timers (MillWheel) → windowing and triggers (Dataflow) → SQL EMIT (Chapter 8).",
        "<strong>Optimization</strong>: fusion and combiner lifting (Flume) make exactly-once practical (Chapter 5).",
        "<strong>Replayability</strong>: Kafka logs enable Kappa-style reprocessing (Chapter 1)."
      ]}
    ],
    interview: [
      { q: "What was MapReduce's main contribution, and its main limitation?", a: "Scalability and simplicity: a tiny API on a fault-tolerant engine over commodity hardware. Its limitation was the rigid Map → Shuffle → Reduce shape. Real pipelines needed chains of jobs and hand optimization, which Flume later addressed.", diff: "easy" },
      { q: "How did Storm lead to the Lambda Architecture?", a: "Storm offered low latency but weak consistency (at-most-once or at-least-once, no exactly-once state). To get correct results eventually, teams ran a batch system alongside Storm and merged the two outputs. That's Lambda.", diff: "med" },
      { q: "What did Spark Streaming prove, and what was its limitation?", a: "It proved strong consistency and low-ish latency could coexist by running repeated deterministic microbatches on a consistent batch engine. Its limitations: latency was bounded by batch intervals, and it implicitly processed by processing time (in-order assumptions), with no native out-of-order event-time tooling at the time.", diff: "med" },
      { q: "Why is MillWheel significant for this book?", a: "It introduced the combination of exactly-once, persistent state with tools for reasoning about time: <strong>watermarks</strong> and <strong>timers</strong>. That made robust out-of-order stream processing possible, and it is the direct ancestor of the Dataflow Model and the What/Where/When/How framework.", diff: "med" },
      { q: "What did Kafka contribute beyond being a message queue?", a: "Durable, replayable logs as the streaming transport, which enabled reprocessing and the Kappa architecture. It also popularized stream and table theory (logs and tables as duals), the foundation of Part II.", diff: "med" },
      { q: "What is Beam's goal relative to runners?", a: "Portability: write once, run on Flink, Spark, Dataflow and others. It aims to include the best ideas from across the industry (not the lowest common denominator or the kitchen sink), encourage runners to adopt them, and eventually support cross-language SDK and runner combinations.", diff: "easy" },
      { q: "Trace one idea through at least three systems in the history.", a: "Exactly-once correctness. Storm lacked it, which forced the Lambda Architecture. Spark achieved it via deterministic microbatches. MillWheel achieved it per record with dedup and checkpoints, and added watermarks. Dataflow inherited that design and made it affordable with Flume's fusion and combiner lifting. Flink achieved it with distributed snapshots.", diff: "hard" }
    ],
    labs: ["timeline"]
  }
);
