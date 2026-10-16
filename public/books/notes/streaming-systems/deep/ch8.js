// Deep dive: Chapter 8, Streaming SQL. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch8 = {
  hook: `<p>An analyst writes the query she has written a thousand times: orders per region, <code>SELECT Region, COUNT(*) FROM Orders GROUP BY Region</code>. Against the warehouse it returns a table and finishes. Now the platform team points the same query at the live order stream. What should come back? A table that is never finished? A row every time a count changes? And when an order arrives late for last hour's window, should the old answer be corrected, and how would she know?</p>
<p>Every streaming SQL engine has had to answer those questions, and early ones answered them differently, often by bolting stream-only keywords onto SQL that broke the way queries compose. This chapter builds the answer from first principles: keep relational algebra exactly as it is, let relations change over time, and treat "table" and "stream" as two ways of looking at the same result.</p>`,
  sections: [
    {
      id: "sql-meets-streams",
      title: "What should SQL mean over a stream?",
      kicker: "The problem",
      blocks: [
        {
          type: "problem",
          html: `<p>Classic SQL assumes a relation is a fixed set of rows at query time. A stream never stops changing. If streaming SQL invents operators that consume relations but produce something else (a "stream object" that cannot be joined or grouped again), queries stop composing, and the decades of tooling and intuition built on SQL stop applying.</p>`,
        },
        {
          type: "text",
          html: `<p>Relational algebra works because of <strong>closure</strong>: every operator takes relations and returns a relation. Filter a relation and you get a relation; join two and you get a relation; group one and you get a relation. That is why you can nest subqueries and stack views without thinking about it. Any proposal for streaming SQL has to keep closure, or it is not really SQL.</p>
<p>The chapter's proposal (developed further in the 2019 paper "One SQL to Rule Them All" by Begoli, Akidau, Hueske, Hyde, Knight and Knowles) is deliberately conservative. Don't change the operators at all. Change only what a relation <em>is</em>: let it vary over time. Then add a small number of extensions for the parts of the four questions that classic SQL never needed: windows, triggers and retractions.</p>`,
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p>The syntax in this chapter (<code>SELECT STREAM</code>, <code>EMIT</code>, the <code>Sys.*</code> columns) is a proposal, not a standard that every engine implements. Real engines such as Flink SQL, ksqlDB and Materialize implement the same ideas with their own keywords. Learn the concepts; expect the spelling to differ.</p>`,
        },
      ],
    },
    {
      id: "tvr",
      title: "Time-varying relations",
      kicker: "The key idea",
      blocks: [
        {
          type: "idea",
          html: `<p>A <strong>time-varying relation (TVR)</strong> is a relation whose contents change over time: in effect, a sequence of ordinary relations, one for every moment. Applying a relational operator to a TVR applies it to each moment's snapshot independently, and the result is another TVR.</p>`,
        },
        {
          type: "text",
          html: `<p>Picture the <code>Orders</code> input as a TVR. At 12:00 it holds one row; at 12:01, two; at 12:02, three. Run <code>GROUP BY Region, COUNT(*)</code> and you do not need a new definition of grouping. At each moment you group that moment's snapshot the classic way. The result is a TVR too: at 12:00, East has 1; at 12:02, East has 2 and West has 1.</p>
<p>Because every operator is applied point-wise, every law of relational algebra still holds, closure included. A query over TVRs is just a classic query asked over and over, once per instant. Nothing about joins, filters, projections or aggregates has to be redefined. That is the whole trick, and it is why this approach can reuse SQL unchanged.</p>`,
        },
        {
          type: "diagram",
          title: "One TVR, seen as snapshots and as a changelog",
          caption: "The result of counting orders per region. The top row shows the TABLE rendering at three moments. The bottom row shows the STREAM rendering: the changes that turn each snapshot into the next. Both describe the same TVR.",
          svg: `<svg viewBox="0 0 620 250" role="img" aria-label="Three table snapshots of order counts per region, with the corresponding changelog entries below each">
<text x="20" y="22" font-size="13" font-weight="700">TABLE rendering: a snapshot at each moment</text>
<text x="110" y="48" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">at 12:00</text>
<text x="310" y="48" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">at 12:01</text>
<text x="510" y="48" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">at 12:02</text>
<rect x="20" y="56" width="180" height="84" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="40" y="78" font-size="12" font-weight="700">Region</text>
<text x="130" y="78" font-size="12" font-weight="700">Orders</text>
<line x1="32" y1="86" x2="188" y2="86" style="stroke: var(--dg-1)"/>
<text x="40" y="106" font-size="12">East</text>
<text x="130" y="106" font-size="12">1</text>
<rect x="220" y="56" width="180" height="84" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="240" y="78" font-size="12" font-weight="700">Region</text>
<text x="330" y="78" font-size="12" font-weight="700">Orders</text>
<line x1="232" y1="86" x2="388" y2="86" style="stroke: var(--dg-1)"/>
<text x="240" y="106" font-size="12">East</text>
<text x="330" y="106" font-size="12">1</text>
<text x="240" y="128" font-size="12">West</text>
<text x="330" y="128" font-size="12">1</text>
<rect x="420" y="56" width="180" height="84" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="440" y="78" font-size="12" font-weight="700">Region</text>
<text x="530" y="78" font-size="12" font-weight="700">Orders</text>
<line x1="432" y1="86" x2="588" y2="86" style="stroke: var(--dg-1)"/>
<text x="440" y="106" font-size="12" style="fill: var(--dg-ok)">East</text>
<text x="530" y="106" font-size="12" style="fill: var(--dg-ok)">2</text>
<text x="440" y="128" font-size="12">West</text>
<text x="530" y="128" font-size="12">1</text>
<text x="20" y="172" font-size="13" font-weight="700">STREAM rendering: the changes between snapshots</text>
<rect x="20" y="182" width="180" height="56" rx="20" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="110" y="214" text-anchor="middle" font-size="12">+ (East, 1)</text>
<rect x="220" y="182" width="180" height="56" rx="20" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="310" y="214" text-anchor="middle" font-size="12">+ (West, 1)</text>
<rect x="420" y="182" width="180" height="56" rx="20" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="510" y="204" text-anchor="middle" font-size="12" style="fill: var(--dg-bad)">undo (East, 1)</text>
<text x="510" y="224" text-anchor="middle" font-size="12" style="fill: var(--dg-ok)">+ (East, 2)</text>
</svg>`,
        },
        {
          type: "lab",
          id: "tvr",
          caption: "Drag the clock and switch queries. The TABLE view shows the snapshot at the chosen time, the TVR view shows every snapshot, and the STREAM view shows the changelog. The query logic never changes, only the rendering.",
        },
        {
          type: "quiz",
          q: "Why does defining streaming SQL over time-varying relations preserve closure?",
          options: [
            "Because TVRs are always bounded",
            "Because each operator is applied to every snapshot independently, and a snapshot is an ordinary relation, so the output at every moment is a relation",
            "Because streams are converted to tables before every operator",
            "Because the engine forbids joins over streams",
          ],
          answer: 1,
          explain: "A TVR is a sequence of classic relations. Applying an operator point-wise produces a classic relation at each moment, so the output is again a TVR. Nothing is converted or forbidden; the algebra simply runs once per instant.",
        },
      ],
    },
    {
      id: "renderings-and-bias",
      title: "Tables and streams are renderings of a TVR",
      kicker: "Two ways to look",
      blocks: [
        {
          type: "text",
          html: `<p>A TVR is a conceptual object: the full history of a relation. You can never print all of it at once, so you have to choose a <strong>rendering</strong>. A <strong>TABLE rendering</strong> shows the TVR at one moment, a snapshot, which is what classic SQL has always shown you (implicitly "now"). A <strong>STREAM rendering</strong> shows the sequence of changes to the TVR over time: a changelog.</p>
<p>Both encode the same information; Chapter 6's duality says you can rebuild either from the other. So in the proposed syntax, <code>SELECT TABLE ...</code> and <code>SELECT STREAM ...</code> are not different queries. The <code>WHERE</code>, <code>GROUP BY</code> and <code>JOIN</code> logic is identical; only the presentation of the result changes.</p>`,
        },
        {
          type: "code",
          lang: "sql",
          title: "Same query, two renderings",
          code: `-- Snapshot (the classic default): the current counts
SELECT TABLE Region, COUNT(*) AS Orders
FROM Orders GROUP BY Region;

-- Changelog: every change to those counts, with metadata
SELECT STREAM Region, COUNT(*) AS Orders, Sys.EmitTime, Sys.Undo
FROM Orders GROUP BY Region;

-- Region | Orders | EmitTime | Undo
-- East   | 1      | 12:00    |
-- West   | 1      | 12:01    |
-- East   | 1      | 12:02    | undo
-- East   | 2      | 12:02    |`,
        },
        {
          type: "text",
          html: `<h3>System columns</h3>
<p>Renderings need a little metadata that the data itself does not carry. The proposal adds system columns: <code>Sys.MTime</code> (when a row was last modified, for table renderings), <code>Sys.EmitTime</code> (when a row was emitted, for stream renderings), <code>Sys.EmitTiming</code> (whether the row was early, on time or late relative to the watermark), <code>Sys.EmitIndex</code> (which pane, or revision, of the window this is: 0, 1, 2...) and <code>Sys.Undo</code> (this row retracts an earlier one).</p>
<h3>Stream-biased and table-biased systems</h3>
<p>Every system makes one of the two first-class and leaves the other implicit. <strong>Beam is stream-biased</strong>: its <code>PCollection</code>s are streams, tables exist only inside grouping operations, and triggers turn those hidden tables back into streams. <strong>Classic SQL is table-biased</strong>: tables are what you name and query, and streams are hidden inside the engine. A materialized view is the clearest example: the database effectively scans and streams changes from the base tables and applies them to keep the view's table current.</p>`,
        },
        {
          type: "diagram",
          title: "What each style makes explicit",
          caption: "Solid boxes are objects you name in the API. Dashed boxes exist only inside the system. Beam hides the table inside a grouping; SQL hides the stream inside the engine.",
          svg: `<svg viewBox="0 0 620 230" role="img" aria-label="Beam makes streams explicit and tables implicit; SQL makes tables explicit and streams implicit">
<defs><marker id="ss8-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-ink)"/></marker></defs>
<text x="20" y="30" font-size="13" font-weight="700">Beam: stream-biased</text>
<rect x="20" y="42" width="160" height="48" rx="20" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="100" y="62" text-anchor="middle" font-size="13" font-weight="700">PCollection</text>
<text x="100" y="80" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">explicit stream</text>
<rect x="230" y="42" width="160" height="48" rx="6" stroke-dasharray="6 4" style="fill: var(--dg-panel); stroke: var(--dg-1)" stroke-width="2"/>
<text x="310" y="62" text-anchor="middle" font-size="13" font-weight="700">implicit table</text>
<text x="310" y="80" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">inside the grouping</text>
<rect x="440" y="42" width="160" height="48" rx="20" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="520" y="62" text-anchor="middle" font-size="13" font-weight="700">PCollection</text>
<text x="520" y="80" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">explicit stream</text>
<line x1="182" y1="66" x2="226" y2="66" style="stroke: var(--dg-ink)" stroke-width="2" marker-end="url(#ss8-arrow)"/>
<text x="204" y="110" text-anchor="middle" font-size="12">group</text>
<line x1="392" y1="66" x2="436" y2="66" style="stroke: var(--dg-ink)" stroke-width="2" marker-end="url(#ss8-arrow)"/>
<text x="414" y="110" text-anchor="middle" font-size="12">trigger</text>
<text x="20" y="144" font-size="13" font-weight="700">SQL: table-biased</text>
<rect x="20" y="156" width="160" height="48" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="100" y="176" text-anchor="middle" font-size="13" font-weight="700">Table</text>
<text x="100" y="194" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">explicit</text>
<rect x="230" y="156" width="160" height="48" rx="20" stroke-dasharray="6 4" style="fill: var(--dg-panel); stroke: var(--dg-2)" stroke-width="2"/>
<text x="310" y="176" text-anchor="middle" font-size="13" font-weight="700">implicit stream</text>
<text x="310" y="194" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">scan-and-stream</text>
<rect x="440" y="156" width="160" height="48" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="520" y="176" text-anchor="middle" font-size="13" font-weight="700">Table or view</text>
<text x="520" y="194" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">explicit</text>
<line x1="182" y1="180" x2="226" y2="180" style="stroke: var(--dg-ink)" stroke-width="2" marker-end="url(#ss8-arrow)"/>
<text x="204" y="222" text-anchor="middle" font-size="12">scan</text>
<line x1="392" y1="180" x2="436" y2="180" style="stroke: var(--dg-ink)" stroke-width="2" marker-end="url(#ss8-arrow)"/>
<text x="414" y="222" text-anchor="middle" font-size="12">group</text>
</svg>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Apache Flink SQL", title: "Changelog row kinds", html: "Flink represents a dynamic table's changes as rows tagged insert (<code>+I</code>), update-before (<code>-U</code>), update-after (<code>+U</code>) and delete (<code>-D</code>). An update-before row plays the role of <code>Sys.Undo</code>: it retracts the old version of a row." },
            { org: "ksqlDB", title: "Streams and tables as first-class", html: "ksqlDB lets you declare both <code>STREAM</code>s and <code>TABLE</code>s over Kafka topics. A push query with <code>EMIT CHANGES</code> keeps running and returns each change to the result as it happens: a stream rendering." },
            { org: "Materialize", title: "Incrementally maintained views", html: "Materialize keeps SQL materialized views up to date as inputs change, and <code>SUBSCRIBE</code> returns the changes to a view with a timestamp and a diff (+1 for an insert, &minus;1 for a retraction)." },
          ],
        },
      ],
    },
    {
      id: "where-windows",
      title: "Where: windows in GROUP BY",
      kicker: "Event-time windowing",
      blocks: [
        {
          type: "text",
          html: `<p>In Chapter 6 a window turned out to be part of the grouping key. SQL already has a place for grouping keys, so windows go there too: a windowing function in the <code>GROUP BY</code> clause assigns each row to one or more windows, and the row is grouped by window along with any other keys. The proposal uses <code>TUMBLE</code> for fixed windows, <code>HOP</code> for sliding windows and <code>SESSION</code> for session windows.</p>`,
        },
        {
          type: "code",
          lang: "sql",
          title: "Hourly orders per region",
          code: `SELECT STREAM
  Region,
  COUNT(*) AS Orders,
  TUMBLE(OrderTime, INTERVAL '1' HOUR) AS Window
FROM Orders
GROUP BY Region, TUMBLE(OrderTime, INTERVAL '1' HOUR);`,
        },
        {
          type: "text",
          html: `<h3>Why not just round the timestamp?</h3>
<p>For fixed windows you could fake it: <code>GROUP BY Region, FLOOR(OrderTime TO HOUR)</code> puts each row in its hour. That breaks down quickly.</p>
<ul>
<li><strong>Sliding windows</strong> put one row in several windows at once. A plain <code>GROUP BY</code> expression produces exactly one group per row.</li>
<li><strong>Session windows</strong> are not a function of one row at all. Whether a click belongs to a session depends on its neighbors, and a late click can merge two sessions into one.</li>
<li><strong>Watermarks</strong> need to know where each window ends, so the engine can tell when the window is complete. A rounded timestamp is just a number; a window function tells the engine "this group closes at the end of the hour".</li>
</ul>
<p>Dedicated window constructs give the engine the semantics it needs for merging and for completeness, which is what makes the <strong>when</strong> question answerable in the next section.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Apache Calcite", title: "Group window functions", html: "Calcite's streaming SQL supports <code>TUMBLE</code>, <code>HOP</code> and <code>SESSION</code> in the <code>GROUP BY</code> clause. Calcite is the SQL parser and planner used by Flink SQL and several other engines." },
            { org: "Apache Flink SQL", title: "Windowing table-valued functions", html: "Newer Flink versions express windows as table functions: <code>FROM TABLE(TUMBLE(TABLE Orders, DESCRIPTOR(order_time), INTERVAL '1' HOUR))</code> adds <code>window_start</code> and <code>window_end</code> columns that you then group by." },
          ],
        },
      ],
    },
    {
      id: "when-and-how",
      title: "When and how: EMIT and retractions",
      kicker: "Triggers and accumulation in SQL",
      blocks: [
        {
          type: "problem",
          html: `<p>A windowed query over a stream can produce its result many times: after every order, once the hour is complete, or again when a late order corrects it. Classic SQL never had to choose, because the input was finished before the query ran. Streaming SQL needs a way to say when rows come out and how corrections look.</p>`,
        },
        {
          type: "text",
          html: `<p>The proposal expresses triggers as an <code>EMIT</code> clause at the end of the query. Without one, a <code>STREAM</code> rendering is effectively per-record: every change to the result TVR is emitted. <code>EMIT WHEN WATERMARK PAST WINDOW_END(Window)</code> gives one on-time row per window, once the watermark says the window is complete. Adding <code>AND THEN AFTER &lt;duration&gt;</code> allows late corrections, emitted at most once per duration after the first late change.</p>
<p>Data-driven triggers ("emit once the count passes 100") need no new syntax: <code>HAVING</code> already filters which result rows are emitted. That keeps the extension small.</p>`,
        },
        {
          type: "code",
          lang: "sql",
          title: "On-time results with late corrections",
          code: `SELECT STREAM
  Region,
  COUNT(*) AS Orders,
  TUMBLE(OrderTime, INTERVAL '1' HOUR) AS Window,
  Sys.EmitTiming, Sys.EmitIndex, Sys.Undo
FROM Orders
GROUP BY Region, TUMBLE(OrderTime, INTERVAL '1' HOUR)
EMIT WHEN WATERMARK PAST WINDOW_END(Window)
  AND THEN AFTER 1 MINUTE;

-- Region | Orders | Window        | EmitTiming | EmitIndex | Undo
-- East   | 412    | [12:00, 13:00) | on-time    | 0         |
-- East   | 412    | [12:00, 13:00) | late       | 1         | undo
-- East   | 415    | [12:00, 13:00) | late       | 1         |`,
          caption: "An illustrative output: three late orders arrive after the watermark, so the on-time row is retracted and replaced.",
        },
        {
          type: "text",
          html: `<h3>How: values plus retractions</h3>
<p>Streaming SQL settles the accumulation question in one direction: rows carry <strong>full values</strong>, and when a value changes, the stream carries an <strong>undo row</strong> for the old value followed by the new row. This is accumulating-and-retracting mode from Part I. It is the natural fit for a relational changelog, because it is exactly the information needed to keep any downstream table correct: a consumer that overwrites by key can ignore the undo rows, and a consumer that regroups and sums can subtract them.</p>`,
        },
        {
          type: "lab",
          id: "sqlEmit",
          caption: "The windowed team-score sum written as streaming SQL. Pick an EMIT clause and the system columns to show, and compare per-record output with watermark output, including the late row.",
        },
        {
          type: "table",
          title: "Choosing an EMIT strategy",
          headers: ["Clause", "Rows per window", "Good for"],
          rows: [
            ["(none: per-record)", "One per change, with undo rows", "Live dashboards that want every update"],
            ["EMIT WHEN WATERMARK PAST WINDOW_END(...)", "One on-time row; later changes are not emitted", "Reports and alerts that want one final answer"],
            ["... AND THEN AFTER &lt;duration&gt;", "One on-time row, then batched late corrections", "Final answers that must still be corrected by stragglers"],
          ],
        },
        {
          type: "quiz",
          q: "A downstream job reads a streaming SQL query's STREAM rendering and sums the Orders column by region across all windows. What must it do with rows where Sys.Undo is set?",
          options: [
            "Ignore them; they are duplicates",
            "Subtract their value, because they retract a value it already added",
            "Add them like any other row",
            "Stop and wait for the watermark",
          ],
          answer: 1,
          explain: "An undo row says \"the value I sent before is no longer true\". A consumer that adds values must subtract the retracted one, or every correction is double counted. A consumer that overwrites by key could safely ignore undo rows, but this one sums.",
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
          html: `<p>Streaming SQL comes up when a design needs real-time analytics that analysts, not just engineers, can change: live dashboards, metrics over event streams, continuously maintained aggregates. It is also a clean way to explain the semantics of any stream processor, because the vocabulary (snapshot versus changelog, windows, emit policy, retractions) is engine-neutral.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>A strong answer covers:</p>
<ol>
<li>Time-varying relations: relational operators apply to each snapshot, so closure and all of SQL carry over unchanged.</li>
<li>Table and stream are renderings of one TVR: a snapshot versus a changelog. The query logic is the same.</li>
<li>The extensions map to the four questions: windows in <code>GROUP BY</code> (where), an <code>EMIT</code> clause (when), undo rows (how).</li>
<li>A real engine that does this, for example Flink SQL with its <code>+I/-U/+U/-D</code> changelog, or ksqlDB's <code>EMIT CHANGES</code>.</li>
</ol>`,
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>"Streaming SQL is just SQL over a sliding time range of recent rows." That describes one query, not the model. The point is that every SQL operator still works, the result is a relation that changes, and you choose how to render and emit it.</p>`,
        },
        {
          type: "quiz",
          q: "Why do streaming SQL proposals add dedicated window functions such as SESSION instead of letting users group by a computed timestamp?",
          options: [
            "Computed expressions are not allowed in GROUP BY",
            "Sessions depend on neighboring rows and can merge, and the engine must know each window's end to apply watermarks",
            "Window functions are faster to type",
            "Computed timestamps cannot be indexed",
          ],
          answer: 1,
          explain: "A computed expression assigns each row to one group on its own. Session membership depends on other rows and changes when sessions merge, and sliding windows put a row in several groups. The engine also needs window ends to decide completeness for EMIT WHEN WATERMARK PAST WINDOW_END.",
        },
      ],
    },
  ],
  takeaways: [
    "Streaming SQL must keep closure: operators take relations and return relations, so queries still compose.",
    "A time-varying relation is a sequence of snapshots. Operators apply to each snapshot, so all of relational algebra carries over unchanged.",
    "TABLE and STREAM are two renderings of one TVR: a snapshot at a moment versus the changelog over time.",
    "Beam is stream-biased (tables hide inside groupings); classic SQL is table-biased (streams hide inside the engine, as in materialized views).",
    "Windows belong in GROUP BY as dedicated functions (TUMBLE, HOP, SESSION), because merging and watermarks need window semantics.",
    "An EMIT clause expresses triggers; HAVING covers data-driven conditions. Retractions appear as undo rows, which Flink calls update-before.",
  ],
  furtherReading: [
    { title: "One SQL to Rule Them All (Begoli, Akidau, Hueske, Hyde, Knight, Knowles, SIGMOD 2019)", note: "The time-varying relation model and proposed SQL extensions, developed further after the book." },
    { title: "Apache Flink: Dynamic Tables", url: "https://nightlies.apache.org/flink/flink-docs-stable/docs/dev/table/concepts/dynamic_tables/", note: "How Flink SQL defines continuous queries and converts tables to changelog streams." },
    { title: "Apache Calcite: Streaming", url: "https://calcite.apache.org/docs/stream.html", note: "Calcite's streaming SQL reference, including TUMBLE, HOP and SESSION." },
  ],
};
