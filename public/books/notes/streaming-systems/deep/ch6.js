// Deep dive: Chapter 6, Streams and tables. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch6 = {
  hook: `<p>A news site counts page views per article. An upstream job reads click events, counts them per article every minute, and publishes the running totals. A second team consumes those totals and adds them up per section (Sports, Politics, Tech) for an editors' dashboard. On launch day the Sports number reads 4.1 million views. The site only served 900,000.</p>
<p>Nobody's code has a bug in the usual sense. The upstream job emitted <em>running totals</em> (3, then 5, then 9) and the downstream job treated each one as <em>new views</em> and added them all. The two teams disagreed about what kind of thing was flowing between them: a stream of changes, or a sequence of snapshots of a table.</p>
<p>This chapter gives you the vocabulary to make that disagreement impossible. Every pipeline, batch or streaming, is made of just two kinds of data, <strong>streams</strong> and <strong>tables</strong>, and a handful of operations that turn one into the other. Once you can label each edge of a pipeline, you know exactly where data comes to rest, what puts it back in motion, and what a consumer must do to rebuild the right answer.</p>`,
  sections: [
    {
      id: "two-views",
      title: "Two views of the same data",
      kicker: "The key idea",
      blocks: [
        {
          type: "problem",
          html: `<p>Batch people talk about tables and files. Streaming people talk about events and topics. They describe the same data in different words, so when a batch job and a streaming job meet, it is easy to hand over the wrong shape and get silently wrong numbers.</p>`,
        },
        {
          type: "idea",
          html: `<p>A <strong>table is data at rest</strong>: a container where values accumulate and can be looked at. A <strong>stream is data in motion</strong>: the changes to a table, one after another, over time. Aggregate a stream and you get a table; record a table's changes and you get a stream. They are two sides of one coin.</p>`,
        },
        {
          type: "text",
          html: `<p>Take the page-view example. The click events are a stream: <code>(article A, +1)</code>, <code>(article B, +1)</code>, <code>(article A, +1)</code>. Fold them up by article and you get a table with one row per article and a running count. That table is what you would query to answer "how many views does A have right now?"</p>
<p>Now go the other way. Watch the table and write down every time a row changes: "A is now 1", "B is now 1", "A is now 2". That list of changes is a stream again. Given the stream, anyone can replay it from the start and rebuild the table, row for row.</p>
<p>Databases have worked like this for decades. The <strong>write-ahead log</strong> (or binlog, or redo log) is a stream of changes; the tables are what you get by applying that log. Replication ships the log, not the tables, and change data capture tools publish the log as a stream for other systems to consume.</p>`,
        },
        {
          type: "diagram",
          title: "Grouping brings a stream to rest; triggering puts a table back in motion",
          caption: "The same page-view data seen both ways. Grouping by article folds the stream of events into a table of totals. Observing the table's changes (triggering) turns it back into a stream.",
          svg: `<svg viewBox="0 0 600 220" role="img" aria-label="A stream of view events is grouped into a table of totals, and the table's changes flow back out as a stream">
<defs><marker id="ss6-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-ink)"/></marker></defs>
<rect x="20" y="40" width="200" height="140" rx="10" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="120" y="64" text-anchor="middle" font-size="14" font-weight="700">STREAM</text>
<text x="44" y="98" font-size="12">12:01  article A  +1</text>
<text x="44" y="122" font-size="12">12:01  article B  +1</text>
<text x="44" y="146" font-size="12">12:02  article A  +1</text>
<text x="120" y="204" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">data in motion</text>
<rect x="380" y="40" width="200" height="140" rx="10" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="480" y="64" text-anchor="middle" font-size="14" font-weight="700">TABLE</text>
<text x="410" y="96" font-size="12" font-weight="700">article</text>
<text x="510" y="96" font-size="12" font-weight="700">views</text>
<line x1="400" y1="104" x2="560" y2="104" style="stroke: var(--dg-1)" stroke-width="1"/>
<text x="410" y="124" font-size="12">A</text>
<text x="510" y="124" font-size="12">2</text>
<text x="410" y="148" font-size="12">B</text>
<text x="510" y="148" font-size="12">1</text>
<text x="480" y="204" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">data at rest</text>
<text x="300" y="58" text-anchor="middle" font-size="13" font-weight="700">grouping</text>
<text x="300" y="76" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">stream → table</text>
<line x1="226" y1="90" x2="372" y2="90" style="stroke: var(--dg-ink)" stroke-width="2" marker-end="url(#ss6-arrow)"/>
<line x1="374" y1="138" x2="228" y2="138" style="stroke: var(--dg-ink)" stroke-width="2" marker-end="url(#ss6-arrow)"/>
<text x="300" y="160" text-anchor="middle" font-size="13" font-weight="700">triggering</text>
<text x="300" y="178" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">table → stream</text>
</svg>`,
        },
        {
          type: "analogy",
          title: "A bank statement",
          html: `<p>Your account balance is a table: one number, at rest, that you can look up. Your statement is a stream: every deposit and withdrawal in order. The bank can rebuild your balance from the statement, and it can produce a statement by recording every change to the balance. Neither is more "real" than the other.</p>`,
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>Notice what the definitions leave out: whether the data is <strong>bounded or unbounded</strong>. A stream is not "infinite data"; it is data in motion. Batch jobs over a finite file are full of streams, and streaming jobs are full of tables. Bounded versus unbounded is about how much data there is; stream versus table is about whether it is moving or resting.</p>`,
        },
      ],
    },
    {
      id: "mapreduce-lens",
      title: "MapReduce, relabelled as streams and tables",
      kicker: "Batch is streams too",
      blocks: [
        {
          type: "text",
          html: `<p>The quickest way to see that batch processing is full of streams is to take the most famous batch engine apart. MapReduce is usually described as two user functions, map and reduce. Underneath, a job runs six phases, and each one either moves data, rests it, or transforms it while it moves.</p>`,
        },
        {
          type: "steps",
          title: "The six phases of a MapReduce job",
          items: [
            "<strong>MapRead</strong> (table → stream): iterate over the input files, which are data at rest, and turn them into a sequence of records.",
            "<strong>Map</strong> (stream → stream): call the user's map function on each record. Records go in, zero or more key/value pairs come out, still moving.",
            "<strong>MapWrite</strong> (stream → table): group the pairs by key and write them out. This is where data comes to rest, keyed and ready for the shuffle.",
            "<strong>ReduceRead</strong> (table → stream): iterate over each key and its list of values, putting the grouped data back in motion.",
            "<strong>Reduce</strong> (stream → stream): call the user's reduce function on each key and its values. Despite the name, it is just another element-wise function over (key, list) pairs.",
            "<strong>ReduceWrite</strong> (stream → table): write the results to the output files, bringing them to rest one last time.",
          ],
        },
        {
          type: "diagram",
          title: "A MapReduce job reads TABLE → STREAM → STREAM → TABLE → STREAM → STREAM → TABLE",
          caption: "Follow the arrows from the input files at top left to the output files at bottom left. Every table-to-stream edge is a read, every stream-to-stream edge is a user function, and every stream-to-table edge is a grouping write.",
          svg: `<svg viewBox="0 0 640 250" role="img" aria-label="The six MapReduce phases drawn as transitions between tables and streams">
<defs><marker id="ss6-arrow2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-ink)"/></marker></defs>
<rect x="10" y="40" width="92" height="48" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="56" y="60" text-anchor="middle" font-size="13" font-weight="700">TABLE</text>
<text x="56" y="78" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">input data</text>
<rect x="186" y="40" width="92" height="48" rx="20" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="232" y="60" text-anchor="middle" font-size="13" font-weight="700">STREAM</text>
<text x="232" y="78" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">records</text>
<rect x="362" y="40" width="92" height="48" rx="20" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="408" y="60" text-anchor="middle" font-size="13" font-weight="700">STREAM</text>
<text x="408" y="78" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">key, value</text>
<rect x="538" y="40" width="92" height="48" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="584" y="60" text-anchor="middle" font-size="13" font-weight="700">TABLE</text>
<text x="584" y="78" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">keyed groups</text>
<line x1="104" y1="64" x2="182" y2="64" style="stroke: var(--dg-ink)" stroke-width="2" marker-end="url(#ss6-arrow2)"/>
<text x="144" y="56" text-anchor="middle" font-size="12">MapRead</text>
<line x1="280" y1="64" x2="358" y2="64" style="stroke: var(--dg-ink)" stroke-width="2" marker-end="url(#ss6-arrow2)"/>
<text x="320" y="56" text-anchor="middle" font-size="12">Map</text>
<line x1="456" y1="64" x2="534" y2="64" style="stroke: var(--dg-ink)" stroke-width="2" marker-end="url(#ss6-arrow2)"/>
<text x="496" y="56" text-anchor="middle" font-size="12">MapWrite</text>
<line x1="584" y1="90" x2="584" y2="158" style="stroke: var(--dg-ink)" stroke-width="2" marker-end="url(#ss6-arrow2)"/>
<text x="574" y="128" text-anchor="end" font-size="12">ReduceRead</text>
<rect x="538" y="162" width="92" height="48" rx="20" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="584" y="182" text-anchor="middle" font-size="13" font-weight="700">STREAM</text>
<text x="584" y="200" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">key + list</text>
<rect x="362" y="162" width="92" height="48" rx="20" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="408" y="182" text-anchor="middle" font-size="13" font-weight="700">STREAM</text>
<text x="408" y="200" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">results</text>
<rect x="186" y="162" width="92" height="48" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="232" y="182" text-anchor="middle" font-size="13" font-weight="700">TABLE</text>
<text x="232" y="200" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">output data</text>
<line x1="536" y1="186" x2="458" y2="186" style="stroke: var(--dg-ink)" stroke-width="2" marker-end="url(#ss6-arrow2)"/>
<text x="496" y="178" text-anchor="middle" font-size="12">Reduce</text>
<line x1="360" y1="186" x2="282" y2="186" style="stroke: var(--dg-ink)" stroke-width="2" marker-end="url(#ss6-arrow2)"/>
<text x="320" y="178" text-anchor="middle" font-size="12">ReduceWrite</text>
<text x="14" y="176" font-size="12" style="fill: var(--dg-muted)">Square: TABLE</text>
<text x="14" y="196" font-size="12" style="fill: var(--dg-muted)">Rounded: STREAM</text>
</svg>`,
        },
        {
          type: "text",
          html: `<h3>What if Reduce outputs have no key?</h3>
<p>Many reduce functions emit plain records, not key/value pairs. ReduceWrite still brings them to rest, so it is still a grouping. The trick is to treat each record as having its own brand-new unique key, the way a SQL table with an auto-increment primary key gives every inserted row a fresh id. Each record is grouped with nothing but itself and lands in the output table as its own row.</p>
<p>Put together, every batch pipeline follows the same four-beat rhythm: read a table in full to make a stream; transform the stream element by element until you hit a grouping; group it into a new table; repeat until there are no stages left.</p>`,
        },
        {
          type: "lab",
          id: "mapreduceST",
          caption: "Click each phase and dataset of a word-count job to see which ones are tables and which are streams, and where the data comes to rest.",
        },
        {
          type: "quiz",
          q: "In MapReduce, which phase is the first point where data comes to rest after the job starts reading?",
          options: ["MapRead", "Map", "MapWrite", "ReduceRead"],
          answer: 2,
          explain: "MapRead turns the input table into a stream and Map transforms that stream, so data is still moving after both. MapWrite groups the pairs by key, which is a stream-to-table operation: the first time data comes to rest after the input is read.",
        },
      ],
    },
    {
      id: "what-and-where",
      title: "What and where: grouping is the only thing that rests data",
      kicker: "Transformations and windows",
      blocks: [
        {
          type: "text",
          html: `<p>The four questions from Part I (what, where, when, how) map neatly onto streams and tables. Start with <strong>what</strong> results are computed. Every transformation in a pipeline falls into one of two buckets.</p>
<ul>
<li><strong>Nongrouping</strong> (element-wise) operations take a stream and produce a stream. Parsing, filtering, mapping, flat-mapping: each element is looked at on its own and the result keeps moving. The number of elements can change (a filter drops some, a flatMap can produce several), but nothing waits for anything else.</li>
<li><strong>Grouping</strong> operations take a stream and produce a table. Group-by-key, sum, count, any aggregation and any join: they must collect related elements together, so data has to come to rest.</li>
</ul>
<p>That split explains why grouping is always the hard part of stream processing. An element-wise step can handle each element and forget it. A grouping step has to hold state, decide how long to hold it, and decide when to tell anyone what it holds.</p>`,
        },
        {
          type: "code",
          lang: "text",
          title: "Labelling a page-view pipeline",
          code: `clicks  = read("click-log")                 // TABLE  -> STREAM  (read)
views   = clicks.map(parseClick)            // STREAM -> STREAM  (nongrouping)
                .filter(v -> !v.isBot)      // STREAM -> STREAM  (nongrouping)
counts  = views.window(fixed(1 minute))
               .groupBy(v -> v.articleId)   // STREAM -> TABLE   (grouping)
               .count()
updates = counts.trigger(atWatermark())     // TABLE  -> STREAM  (triggering)
updates.write(dashboardStore)               // STREAM -> TABLE   (in the sink)`,
          caption: "Pseudo-code for the opening example. Only one line brings data to rest inside the pipeline: the grouping. The sink is a second table.",
        },
        {
          type: "text",
          html: `<h3>Where: windowing is just a finer grouping key</h3>
<p>Windowing answers <strong>where</strong> in event time results are computed. In streams-and-tables terms it is not a new kind of operation at all. Grouping by article and by one-minute window is grouping by the composite key <code>(article, window)</code>. Each window becomes its own group, its own little slice of the table.</p>
<p>Merging windows such as sessions need one refinement. A new click can bridge two existing sessions for the same user, so those sessions must merge into one. To make that safe, the system groups by the real key first and treats windows as children inside each key's group. The <strong>key stays the unit of atomicity and parallelism</strong>: all of one user's sessions live on one worker, and a merge deletes the old windows and inserts the combined one in a single atomic step within that key.</p>`,
        },
        {
          type: "keypoints",
          items: [
            "Nongrouping: stream in, stream out. Grouping: stream in, table out.",
            "Grouping is the only operation inside a pipeline that brings data to rest, which is why it needs state, windows and triggers.",
            "A window is part of the grouping key. For merging windows, the key comes first and windows merge atomically inside it.",
          ],
        },
      ],
    },
    {
      id: "when-and-how",
      title: "When and how: triggers ungroup, accumulation shapes the stream",
      kicker: "Putting data back in motion",
      blocks: [
        {
          type: "problem",
          html: `<p>Once a grouping has brought the page views to rest in a per-article table, they sit there. In a batch job, the table is complete when the input ends, so you just read it. An unbounded input never ends. Something has to decide when to look at the table and send its contents onward, or the pipeline never produces anything.</p>`,
        },
        {
          type: "idea",
          html: `<p><strong>Triggers are ungrouping</strong>: the inverse of grouping. A trigger decides <em>when</em> the current state of a table (or one window's slice of it) is observed and emitted as a stream. The <strong>accumulation mode</strong> decides <em>how</em> each emitted element relates to the ones before it.</p>`,
        },
        {
          type: "text",
          html: `<p>A per-record trigger emits a row every time the table changes. A watermark trigger waits until the watermark says a window's input is probably complete, then emits once. Early and late firings sit in between. Seen this way, the <strong>watermark</strong> is simply a reference point the trigger can use: a statement about event-time completeness that tells it a group is ready to be put back in motion.</p>
<p>The accumulation mode then fixes what kind of stream comes out. Say article A's count goes 3, then 5.</p>
<ul>
<li><strong>Discarding</strong> emits <em>deltas</em>: 3, then 2. Each element is "this much more since last time".</li>
<li><strong>Accumulating</strong> emits <em>values</em>: 3, then 5. Each element is "the total is now this".</li>
<li><strong>Accumulating and retracting</strong> emits values plus <em>retractions</em>: 3, then &minus;3 and +5. The stream says exactly what to undo and what to add.</li>
</ul>
<p>None of these is right in general. What matters is whether the consumer can rebuild the correct table from the stream it receives, and that depends on how the consumer applies each element.</p>`,
        },
        {
          type: "table",
          title: "Can the consumer rebuild the right table?",
          headers: ["Consumer", "Deltas (discarding)", "Values (accumulating)", "Retractions"],
          rows: [
            ["Overwrites by key (a key-value store)", "<span class=\"hl-bad\">No</span>: keeps only the last delta, 2", "<span class=\"hl-good\">Yes</span>: keeps 5", "<span class=\"hl-good\">Yes</span>"],
            ["Adds what it receives (regroup and sum)", "<span class=\"hl-good\">Yes</span>: 3 + 2 = 5", "<span class=\"hl-bad\">No</span>: 3 + 5 = 8", "<span class=\"hl-good\">Yes</span>: 3 &minus; 3 + 5 = 5"],
            ["Regroups under a different, non-additive key", "<span class=\"hl-bad\">No</span>", "<span class=\"hl-bad\">No</span>", "<span class=\"hl-good\">Yes</span>"],
          ],
          note: "The opening story is the middle row, middle column: an accumulating stream fed into a consumer that adds.",
        },
        {
          type: "lab",
          id: "streamTable",
          caption: "Scores are parsed, grouped into a per-user sum table, and triggered back into a stream that a downstream consumer turns into its own table. Switch the accumulation mode and the consumer type and see when the two tables agree.",
        },
        {
          type: "realworld",
          items: [
            { org: "Kafka Streams", title: "KStream and KTable", html: "A <code>KStream</code> is a record stream and a <code>KTable</code> is a changelog where each record upserts its key. Aggregating a stream (<code>groupByKey().count()</code>) returns a KTable, and <code>toStream()</code> turns a table's updates back into a stream. Record caches decide how many intermediate updates get forwarded, and <code>suppress(untilWindowCloses(...))</code> emits only final windowed results: both are triggers under another name." },
            { org: "Apache Flink", title: "Dynamic tables", html: "Flink SQL treats query results as dynamic tables that change over time. Converting one to a stream produces an append-only stream, a retract stream (add and retract messages) or an upsert stream (upserts and deletes by key), which line up with the accumulation modes above." },
            { org: "Change data capture", title: "Database logs as streams", html: "Tools such as Debezium read a database's transaction log (the MySQL binlog, the PostgreSQL write-ahead log) and publish each row change as an event. That is a table being turned into a stream by observing its changes." },
          ],
        },
        {
          type: "quiz",
          q: "An upstream job emits per-user running totals (accumulating). A downstream job sums them into per-team totals and the numbers are far too high. Which change fixes it without touching the downstream sum?",
          options: [
            "Switch the upstream trigger from per-record to watermark",
            "Have the upstream emit retractions along with each new value",
            "Increase the upstream window size",
            "Make the downstream job read the stream faster",
          ],
          answer: 1,
          explain: "The downstream adds whatever it receives, so it needs elements that sum to the right answer. Retractions (subtract the old total, add the new one) do that. A watermark trigger would reduce the number of updates, but any late or repeated firing would still be double-counted, so it narrows the bug without removing it.",
        },
      ],
    },
    {
      id: "relativity",
      title: "The general theory of stream and table relativity",
      kicker: "Putting it together",
      blocks: [
        {
          type: "text",
          html: `<p>Collect the pieces and you get a complete map of what any pipeline can do. There are four possible pairings of input and output, and every operation you will ever write lands in one of the first three.</p>`,
        },
        {
          type: "table",
          headers: ["Operation", "Kind", "Examples"],
          rows: [
            ["stream → stream", "Nongrouping (element-wise)", "map, filter, flatMap, parse, ParDo"],
            ["stream → table", "Grouping", "group-by-key, count, sum, windowed aggregation, join"],
            ["table → stream", "Ungrouping (triggering)", "triggers, watermark firing, per-record changelog, a full table scan"],
            ["table → table", "None", "Not possible: data must move to change"],
          ],
        },
        {
          type: "text",
          html: `<h3>Why there is no table → table</h3>
<p>Data at rest cannot become data at rest somewhere else without moving. Any change to a table is really a stream of changes applied to it. Even a plain SQL <code>UPDATE</code> follows this rule: the database writes the change to its log (a stream) and applies it to the table. Copying a table, reshaping a table, or computing a materialized view from a table all mean scanning it (or its changelog) into a stream, processing that stream, and grouping it into a new table.</p>
<p>This is more than tidy vocabulary. It tells you where to look when a pipeline misbehaves. Wrong numbers almost always come from a <strong>stream → table</strong> edge (grouping with the wrong key or window) or a <strong>table → stream</strong> edge (triggering at the wrong time, or with an accumulation mode the consumer misreads). Element-wise steps rarely cause cross-record bugs, because they never look at more than one record.</p>`,
        },
        {
          type: "compare",
          title: "Batch and streaming, seen through the theory",
          items: [
            { title: "Batch", tone: "info", html: "Tables are read in full to make streams; groupings run once, when their input is complete; the implicit trigger is \"fire when the input ends\". Accumulation never comes up because each group emits exactly once." },
            { title: "Streaming", tone: "ok", html: "The same operations, but the input never ends. Groupings hold state indefinitely, so you must choose an explicit trigger (when to emit) and an accumulation mode (what each emission means to the consumer)." },
          ],
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>When you review a pipeline design, annotate every edge with S or T. Then ask two questions at each T → S edge: what triggers it, and what accumulation mode does the consumer expect? Most correctness bugs between teams surface right there.</p>`,
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
          html: `<p>Stream and table duality comes up whenever a design has a log feeding a store: an event bus feeding a cache, change data capture feeding a search index, a stream processor maintaining a leaderboard or a dashboard. Bring it up when you explain how the read side is kept up to date and what each message on the wire means.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>A strong answer covers four points:</p>
<ol>
<li>The duality: aggregating a stream gives a table; observing a table's changes gives a stream. A database log and its tables are the classic example.</li>
<li>Grouping (stream → table) is where state lives; triggering (table → stream) decides when results leave. Element-wise steps keep data moving.</li>
<li>Batch is the same picture: MapReduce reads TABLE → STREAM → STREAM → TABLE → STREAM → STREAM → TABLE.</li>
<li>The message format is a contract. Say whether the stream carries deltas, full values, or values with retractions, and check that the consumer applies them correctly.</li>
</ol>
<p>If there is time, name the real-world versions: Kafka Streams' KStream and KTable, and Flink's append, retract and upsert streams.</p>`,
        },
        {
          type: "quiz",
          q: "An interviewer asks why you can't write a pipeline step that turns one table directly into another. Which answer is best?",
          options: [
            "Because tables are bounded and streams are unbounded",
            "Because every change to a table is a stream of changes; transforming a table means scanning it into a stream, processing it, and grouping it again",
            "Because most stream processors don't support tables",
            "Because table-to-table operations would need exactly-once delivery",
          ],
          answer: 1,
          explain: "Data at rest has to be put in motion to change. A materialized view, a copy, or an UPDATE all work by turning the table (or its log) into a stream and grouping the result into a new table. Bounded versus unbounded is a separate axis from stream versus table.",
        },
      ],
    },
  ],
  takeaways: [
    "A table is data at rest and a stream is data in motion. Aggregating a stream gives a table; observing a table's changes gives a stream.",
    "Stream versus table is independent of bounded versus unbounded: batch jobs are full of streams.",
    "MapReduce is TABLE → STREAM → STREAM → TABLE → STREAM → STREAM → TABLE: reads, user functions and grouping writes.",
    "Nongrouping operations keep data moving; grouping (including windowing and joins) is the only thing that brings it to rest.",
    "Triggers are ungrouping: they decide when a table is put back in motion, often using the watermark as a reference point.",
    "The accumulation mode decides whether the stream carries deltas, values or retractions. Match it to how the consumer applies updates, or totals go wrong.",
    "There is no table → table operation. Every change to a table goes through a stream.",
  ],
  furtherReading: [
    { title: "Streaming Systems, Chapter 6 (Akidau, Chernyak, Lax, 2018)", note: "The full streams-and-tables treatment, including how Beam's model maps onto it." },
    { title: "The Log: What every software engineer should know about real-time data's unifying abstraction (Jay Kreps, 2013)", note: "An essay on logs as the bridge between databases and stream processing." },
    { title: "Kafka Streams core concepts", url: "https://kafka.apache.org/documentation/streams/core-concepts", note: "How KStream and KTable relate, in the official Kafka Streams documentation." },
  ],
};
