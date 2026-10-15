// Deep dive: Chapter 9, Streaming joins. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch9 = {
  hook: `<p>A payments team wants to flag card authorizations that never settle. Authorizations arrive on one stream, settlements on another, and the rule is simple to say: show every authorization with no matching settlement. In a nightly batch job it is one <code>LEFT JOIN ... WHERE settlement IS NULL</code>. On live streams the same query raises awkward questions.</p>
<p>An authorization arrives at 10:00 and has no settlement yet. Is it unmatched, or just early? If the pipeline reports it now and the settlement shows up at 10:02, the report was wrong and must be taken back. If it waits, how long? Forever means unbounded state and no output; one minute means false alarms whenever settlement is slow.</p>
<p>This chapter shows that those questions are not special to streaming. A join is a grouping, so it produces a table that changes as rows arrive; batch just looks at that table once, at the end. Seen that way, every join type falls out of one (the full outer join), retractions explain the "taken back" problem, and windows plus watermarks answer "how long to wait".</p>`,
  sections: [
    {
      id: "all-joins-stream",
      title: "All joins are streaming joins",
      kicker: "The key idea",
      blocks: [
        {
          type: "idea",
          html: `<p>A join groups rows from both inputs by the join key, so it is a <strong>stream → table</strong> operation. Its result is a time-varying relation that evolves as rows arrive on either side. A batch join is that same streaming join observed once, after all of its bounded input has arrived.</p>`,
        },
        {
          type: "text",
          html: `<p>Think about what any join implementation must do. A hash join builds a table from one side keyed by the join column, then streams the other side past it. A sort-merge join sorts both sides by key and walks them together. Either way, rows are brought together by key: that is grouping, the operation from Chapter 6 that brings data to rest.</p>
<p>So the join holds a table of rows seen so far, keyed by join key. Every time a row arrives on either side, the table changes, and so does the set of joined results. In a TABLE rendering, you see the current set of results. In a STREAM rendering, you see each change: new joined rows, and <strong>retractions</strong> of results that are no longer true.</p>`,
        },
        {
          type: "diagram",
          title: "A join is a grouping of both inputs by key",
          caption: "Rows from both streams land in join state keyed by Num. The state is a table; a trigger turns its changes into the stream of joined rows. Keys 1 and 4 have only one side so far.",
          svg: `<svg viewBox="0 0 620 220" role="img" aria-label="Left and right streams feed a join state table keyed by Num, which emits a stream of joined rows">
<defs><marker id="ss9-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-ink)"/></marker></defs>
<rect x="20" y="20" width="150" height="70" rx="20" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="95" y="46" text-anchor="middle" font-size="13" font-weight="700">Left (stream)</text>
<text x="95" y="72" text-anchor="middle" font-size="12">L1   L2   L3</text>
<rect x="20" y="130" width="150" height="70" rx="20" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="95" y="156" text-anchor="middle" font-size="13" font-weight="700">Right (stream)</text>
<text x="95" y="182" text-anchor="middle" font-size="12">R2   R3   R4</text>
<rect x="230" y="40" width="180" height="140" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="250" y="62" font-size="12" font-weight="700">Num</text>
<text x="300" y="62" font-size="12" font-weight="700">Left</text>
<text x="360" y="62" font-size="12" font-weight="700">Right</text>
<line x1="242" y1="70" x2="398" y2="70" style="stroke: var(--dg-1)"/>
<text x="250" y="92" font-size="12">1</text>
<text x="300" y="92" font-size="12">L1</text>
<text x="360" y="92" font-size="12" style="fill: var(--dg-muted)">null</text>
<text x="250" y="114" font-size="12">2</text>
<text x="300" y="114" font-size="12">L2</text>
<text x="360" y="114" font-size="12">R2</text>
<text x="250" y="136" font-size="12">3</text>
<text x="300" y="136" font-size="12">L3</text>
<text x="360" y="136" font-size="12">R3</text>
<text x="250" y="158" font-size="12">4</text>
<text x="300" y="158" font-size="12" style="fill: var(--dg-muted)">null</text>
<text x="360" y="158" font-size="12">R4</text>
<text x="320" y="204" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">join state (a table)</text>
<line x1="172" y1="60" x2="226" y2="90" style="stroke: var(--dg-ink)" stroke-width="2" marker-end="url(#ss9-arrow)"/>
<line x1="172" y1="166" x2="226" y2="134" style="stroke: var(--dg-ink)" stroke-width="2" marker-end="url(#ss9-arrow)"/>
<line x1="412" y1="110" x2="466" y2="110" style="stroke: var(--dg-ink)" stroke-width="2" marker-end="url(#ss9-arrow)"/>
<text x="439" y="100" text-anchor="middle" font-size="12">trigger</text>
<rect x="470" y="75" width="130" height="70" rx="20" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="2"/>
<text x="535" y="104" text-anchor="middle" font-size="13" font-weight="700">Joined rows</text>
<text x="535" y="124" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">(stream)</text>
</svg>`,
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>This reframing is why "can my stream processor do joins?" is the wrong question. Every engine that can group can join. The real questions are how long the join state is kept, and what the output stream looks like while the result is still changing.</p>`,
        },
      ],
    },
    {
      id: "full-outer",
      title: "The full outer join, row by row",
      kicker: "The foundation",
      blocks: [
        {
          type: "text",
          html: `<p>Use a tiny dataset (the same one as the lab). The Left table has rows L1, L2 and L3 with event times 12:02, 12:06 and 12:03. The Right table has R2, R3 and R4 at 12:01, 12:04 and 12:05. Join on the number: L2 matches R2, L3 matches R3, and L1 and R4 never find a partner.</p>
<p>A <strong>FULL OUTER</strong> join keeps every row from both sides, paired where keys match and padded with <code>NULL</code> where not. Its final TABLE rendering is four rows: <code>(L1, null)</code>, <code>(L2, R2)</code>, <code>(L3, R3)</code> and <code>(null, R4)</code>. That is what a batch join would print.</p>
<p>Now watch the STREAM rendering as rows arrive in event-time order. Every row is emitted immediately with a <code>NULL</code> partner if it has none yet. When its partner shows up later, the padded row is <strong>retracted</strong> and replaced by the joined row.</p>`,
        },
        {
          type: "table",
          title: "FULL OUTER join as a stream",
          headers: ["Arrives", "Row", "Emitted"],
          rows: [
            ["12:01", "R2", "+ (null, R2)"],
            ["12:02", "L1", "+ (L1, null)"],
            ["12:03", "L3", "+ (L3, null)"],
            ["12:04", "R3", "<span class=\"hl-bad\">undo (L3, null)</span>, + (L3, R3)"],
            ["12:05", "R4", "+ (null, R4)"],
            ["12:06", "L2", "<span class=\"hl-bad\">undo (null, R2)</span>, + (L2, R2)"],
          ],
          note: "Apply every row in order, subtracting the undo rows, and you get exactly the four-row batch result.",
        },
        {
          type: "text",
          html: `<p>Two things stand out. First, the stream is heavy on retractions: two of the six arrivals took back an earlier answer. Second, nothing in this unwindowed join ever says that <code>(L1, null)</code> is final. As far as the join knows, a matching R1 could still arrive tomorrow, so it must keep L1 in state forever. Windowing, later in this chapter, is what fixes that.</p>`,
        },
        {
          type: "lab",
          id: "joins",
          caption: "Pick a join type and compare the TABLE snapshot with the STREAM changelog and its retractions. Then window the join into 5-minute tumbling windows and switch to a watermark trigger to see unmatched rows wait for completeness.",
        },
        {
          type: "quiz",
          q: "In the full outer join stream above, what happens when L2 arrives at 12:06?",
          options: [
            "+ (L2, null) is emitted and later retracted",
            "(null, R2) is retracted and (L2, R2) is emitted",
            "Nothing, because R2 arrived earlier and was already emitted",
            "(L2, R2) is emitted and (null, R2) stays in the result",
          ],
          answer: 1,
          explain: "R2 was emitted at 12:01 padded with null, because L2 had not arrived. When L2 arrives, that padded row is no longer part of the result, so it is retracted, and the joined row replaces it.",
        },
      ],
    },
    {
      id: "derived-joins",
      title: "Every other join is a filtered full outer join",
      kicker: "Join variants",
      blocks: [
        {
          type: "text",
          html: `<p>Because the full outer join keeps everything, every other join type can be described as a filter over its result. Real engines implement them more efficiently, but the definition is useful: it tells you exactly which rows each join keeps and how its stream behaves.</p>`,
        },
        {
          type: "code",
          lang: "sql",
          title: "Join types as filters (conceptual)",
          code: `-- F = Left FULL OUTER JOIN Right ON Left.Num = Right.Num
LEFT OUTER : SELECT * FROM F WHERE L IS NOT NULL
RIGHT OUTER: SELECT * FROM F WHERE R IS NOT NULL
INNER      : SELECT * FROM F WHERE L IS NOT NULL AND R IS NOT NULL
ANTI       : SELECT * FROM F WHERE L IS NULL OR R IS NULL
SEMI       : SELECT DISTINCT L FROM F WHERE L IS NOT NULL AND R IS NOT NULL`,
          caption: "SEMI keeps each matching left row once, however many right rows it matches.",
        },
        {
          type: "table",
          headers: ["Join", "Final rows for the example", "Retractions in stream form"],
          rows: [
            ["FULL OUTER", "(L1, null), (L2, R2), (L3, R3), (null, R4)", "Yes: every late match retracts a padded row"],
            ["LEFT OUTER", "(L1, null), (L2, R2), (L3, R3)", "Only for left rows that were emitted unmatched (L3)"],
            ["INNER", "(L2, R2), (L3, R3)", "None in this 1:1 example: a row appears only once both sides exist"],
            ["ANTI", "(L1, null), (null, R4)", "Heavy: every row that later matches must be retracted"],
            ["SEMI", "L2, L3", "Depends on cardinality"],
          ],
        },
        {
          type: "text",
          html: `<h3>INNER versus ANTI in a stream</h3>
<p>The inner join is the stream-friendly one: it only emits a result when both sides are present, so in a one-to-one join it never has to take anything back. The anti join is its opposite and the most retraction-heavy. It reports rows as unmatched the moment they arrive, then has to retract every one that eventually finds a partner. In the example, four rows are emitted and two of them (L3 and R2) are later taken back.</p>
<p>That is exactly the payments problem from the opening: "authorizations with no settlement" is an anti join. Emitting eagerly means emitting false alarms that get retracted. To avoid them, you need a point in time after which a missing partner is final, which is what windows provide.</p>
<h3>When SEMI differs from INNER</h3>
<p>With one-to-one data, a semi join and an inner join projected to the left columns give the same rows. They differ when a left row matches several right rows. If L2 matched three right rows, INNER would output L2 three times, once per pair; SEMI outputs L2 once, because it only asks "is there at least one match?"</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "Stream-friendly", tone: "ok", html: "INNER: output appears only once both sides exist, so a one-to-one inner join emits no retractions." },
            { title: "Retraction-heavy", tone: "warn", html: "FULL OUTER and ANTI: unmatched rows are emitted early and must be retracted when a match arrives. LEFT and RIGHT OUTER sit in between." },
          ],
        },
      ],
    },
    {
      id: "windowed-joins",
      title: "Windowed joins: partitioning in time and timing out",
      kicker: "Where and when",
      blocks: [
        {
          type: "problem",
          html: `<p>An unwindowed outer or anti join never knows that a partner will not arrive. It must keep every unmatched row in state forever, and its NULL-padded results are always provisional. For an unbounded input, that means unbounded state and answers that are never final.</p>`,
        },
        {
          type: "text",
          html: `<p>Windowing a join helps for two separate reasons.</p>
<ol>
<li><strong>Partitioning in time.</strong> Often the business rule only wants matches within a period: the same day, the same session, within 30 minutes. Windowing makes that part of the join condition.</li>
<li><strong>A reference point for timing out.</strong> Once the watermark passes the end of a window, the input for that window is (probably) complete. Any row still unmatched in that window is final: its NULL-padded result can be emitted with confidence and its state dropped.</li>
</ol>
<p>A fixed-window join simply adds window equality to the join condition: rows join only if their keys match <em>and</em> they fall in the same window.</p>`,
        },
        {
          type: "code",
          lang: "sql",
          title: "Five-minute fixed-window join",
          code: `SELECT STREAM L.Id, R.Id
FROM Left L FULL OUTER JOIN Right R
  ON  L.Num = R.Num
  AND TUMBLE(L.EventTime, INTERVAL '5' MINUTE)
    = TUMBLE(R.EventTime, INTERVAL '5' MINUTE)
EMIT WHEN WATERMARK PAST WINDOW_END(...);`,
          caption: "Proposal-style syntax from Chapter 8. With windows [12:00, 12:05) and [12:05, 12:10), L2 (12:06) and R2 (12:01) land in different windows and no longer join.",
        },
        {
          type: "text",
          html: `<p>Work through the example. L3 (12:03) and R3 (12:04) share the first window, so they still join. L2 (12:06) falls in the second window while R2 (12:01) is in the first, so they become two unmatched rows. With a per-record trigger, the stream still contains provisional NULL rows and retractions. With a watermark trigger, nothing for the first window is emitted until the watermark passes 12:05; then <code>(L1, null)</code>, <code>(null, R2)</code> and <code>(L3, R3)</code> come out once each, final, and the window's state can be discarded.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Kafka Streams", title: "Windowed stream-stream joins", html: "Joins between two <code>KStream</code>s are always windowed: you pass <code>JoinWindows</code> that say how far apart in time two records may be and still join. Joins of a stream against a <code>KTable</code> are lookups instead, with no window." },
            { org: "Apache Flink SQL", title: "Interval joins and state TTL", html: "An interval join bounds the time difference between the two sides (for example, a shipment within four hours of its order), so Flink can drop old rows as the watermark advances. A regular unbounded join keeps state indefinitely unless you configure a state time-to-live." },
            { org: "Spark Structured Streaming", title: "Watermarks required for outer joins", html: "Stream-stream outer joins require watermarks and an event-time constraint, because Spark must know when an unmatched row can be emitted with NULLs. Inner joins can run without them, but their state then grows without bound." },
          ],
        },
        {
          type: "tradeoffs",
          prosLabel: "Windowing a join gives",
          consLabel: "It costs",
          pros: [
            "Bounded state: a window's rows can be dropped once the watermark passes its end",
            "Final outer-join and anti-join results instead of provisional ones",
            "A way to encode business rules such as \"same day\"",
          ],
          cons: [
            "Matches across a window boundary are missed (L2 and R2), unless you use sliding or interval-style windows",
            "With a watermark trigger, unmatched results wait for the window to close",
            "Late data after the watermark needs an explicit policy: drop, or emit a correction",
          ],
        },
        {
          type: "quiz",
          q: "Why does windowing make an anti join (\"rows with no match\") practical on an unbounded stream?",
          options: [
            "Windows make the join faster to compute",
            "Once the watermark passes a window's end, an unmatched row in that window is final, so it can be emitted once and its state dropped",
            "Windows guarantee every row eventually finds a match",
            "Windows remove the need for a join key",
          ],
          answer: 1,
          explain: "Without a window, a match could always arrive later, so every unmatched row is provisional and kept forever. The window end plus the watermark gives a moment after which \"no match\" is a final answer.",
        },
      ],
    },
    {
      id: "temporal-validity",
      title: "Temporal validity windows and joins",
      kicker: "Joining against values that change",
      blocks: [
        {
          type: "problem",
          html: `<p>Orders in euros must be converted to yen at the rate that was valid <em>when the order was placed</em>. Rates change over time and arrive on their own stream, sometimes out of order. A fixed window does not fit: a rate is not valid for "five minutes", it is valid until the next rate replaces it.</p>`,
        },
        {
          type: "idea",
          html: `<p>A <strong>temporal validity window</strong> starts at a row's event time and ends where the next row (for the same key) begins. Together, the rows slice event time into regions, each with exactly one valid value. Join each order to the region that contains its event time.</p>`,
        },
        {
          type: "text",
          html: `<p>Use the example from the lab. Euro-to-yen rates of 114, 116 and 119 have event times 12:00:30, 12:03 and 12:06, so they are valid over <code>[12:00:30, 12:03)</code>, <code>[12:03, 12:06)</code> and <code>[12:06, ∞)</code>. Orders of 2, 5 and 3 euros at 12:02, 12:05 and 12:08 should convert to 2 &times; 114 = 228, 5 &times; 116 = 580 and 3 &times; 119 = 357 yen.</p>
<p>The twist is arrival order. Suppose the rates arrive 114, then 119, then 116. Before 116 arrives, 114 looks valid all the way to 12:06. When 116 finally arrives, it <strong>splits</strong> 114's window in two, and 114's window <strong>shrinks</strong>. That is unlike any window type in Part I: session windows only grow when they merge, and fixed windows never change.</p>`,
        },
        {
          type: "diagram",
          title: "A late rate splits an existing validity window",
          caption: "Each rate is valid until the next one starts. When rate 116 arrives late, it splits 114's window, and the 5 euro order at 12:05 moves from 114 to 116, so its result changes from 570 to 580.",
          svg: `<svg viewBox="0 0 620 250" role="img" aria-label="Validity windows for rates 114, 116 and 119 before and after 116 arrives, with three orders converted at the rate valid at their event times">
<text x="10" y="62" font-size="12" font-weight="700">Before 116</text>
<rect x="106" y="45" width="286" height="28" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="249" y="64" text-anchor="middle" font-size="12" font-weight="700">114</text>
<rect x="392" y="45" width="208" height="28" rx="4" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="450" y="64" text-anchor="middle" font-size="12" font-weight="700">119</text>
<text x="10" y="112" font-size="12" font-weight="700">After 116</text>
<rect x="106" y="95" width="130" height="28" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="171" y="114" text-anchor="middle" font-size="12" font-weight="700">114</text>
<rect x="236" y="95" width="156" height="28" rx="4" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="314" y="114" text-anchor="middle" font-size="12" font-weight="700">116</text>
<rect x="392" y="95" width="208" height="28" rx="4" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="450" y="114" text-anchor="middle" font-size="12" font-weight="700">119</text>
<line x1="184" y1="40" x2="184" y2="160" stroke-dasharray="4 4" style="stroke: var(--dg-muted)"/>
<line x1="340" y1="40" x2="340" y2="160" stroke-dasharray="4 4" style="stroke: var(--dg-muted)"/>
<line x1="496" y1="40" x2="496" y2="160" stroke-dasharray="4 4" style="stroke: var(--dg-muted)"/>
<text x="10" y="170" font-size="12" font-weight="700">Orders</text>
<circle cx="184" cy="166" r="6" style="fill: var(--dg-4)"/>
<circle cx="340" cy="166" r="6" style="fill: var(--dg-4)"/>
<circle cx="496" cy="166" r="6" style="fill: var(--dg-4)"/>
<text x="184" y="190" text-anchor="middle" font-size="12">2 € → 228</text>
<text x="340" y="190" text-anchor="middle" font-size="12">5 € → 580</text>
<text x="496" y="190" text-anchor="middle" font-size="12">3 € → 357</text>
<text x="340" y="207" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">(570 before 116 arrived)</text>
<line x1="80" y1="224" x2="600" y2="224" style="stroke: var(--dg-line)" stroke-width="2"/>
<text x="80" y="242" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">12:00</text>
<text x="184" y="242" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">12:02</text>
<text x="288" y="242" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">12:04</text>
<text x="392" y="242" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">12:06</text>
<text x="496" y="242" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">12:08</text>
<text x="600" y="242" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">12:10</text>
</svg>`,
        },
        {
          type: "code",
          lang: "sql",
          title: "A validity join, sketched",
          code: `WITH RateWindows AS (
  SELECT Currency, Rate, VALIDITY_WINDOW(RateTime) AS Valid   -- hypothetical
  FROM Rates
  GROUP BY Currency, Rate, VALIDITY_WINDOW(RateTime)
)
SELECT STREAM o.Amount, w.Rate, o.Amount * w.Rate AS Yen
FROM Orders o JOIN RateWindows w
  ON  o.Currency = w.Currency
  AND WINDOW_START(w.Valid) <= o.OrderTime
  AND o.OrderTime < WINDOW_END(w.Valid)
EMIT WHEN WATERMARK PAST WINDOW_END(w.Valid);`,
          caption: "VALIDITY_WINDOW is not a function any engine ships; it stands for a window that ends where the next row for the key begins.",
        },
        {
          type: "text",
          html: `<p>The trigger decides what the output looks like. With per-record triggering, the 5 euro order is first emitted as 570 (joined to 114) and then, when 116 arrives, retracted and re-emitted as 580. With a watermark trigger, each order is emitted once, after the watermark passes the end of the validity window it falls in, so you see 228, 580 and 357 and nothing else.</p>
<p>Native support is the hard part. Windowing frameworks know how to create windows and grow them by merging, but not how to split a window and shrink it, which means previously assigned rows may have to move. The book sketches a partial emulation in Beam rather than a complete built-in.</p>`,
        },
        {
          type: "lab",
          id: "temporalValidity",
          caption: "Rates arrive out of order and split each other's validity windows. Compare per-record output, with the 570 to 580 retraction, against a watermark trigger that emits one final row per order.",
        },
        {
          type: "realworld",
          items: [
            { org: "Apache Flink SQL", title: "Temporal joins", html: "Flink SQL's temporal join (<code>JOIN Rates FOR SYSTEM_TIME AS OF o.order_time</code>) joins each row to the version of a versioned table that was valid at that row's time: the same idea as a validity window, offered as a join type rather than a window." },
          ],
        },
        {
          type: "quiz",
          q: "Rates 114 (12:00:30) and 119 (12:06) have arrived; rate 116 (12:03) has not. With per-record triggering, what is first emitted for a 5 euro order at 12:05?",
          options: ["580 yen", "570 yen", "595 yen", "Nothing until 116 arrives"],
          answer: 1,
          explain: "Without 116, the 114 rate looks valid until 12:06, so the order joins 114: 5 × 114 = 570. When 116 arrives and splits the window, 570 is retracted and 580 emitted. A watermark trigger would wait and emit only 580.",
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
          html: `<p>Stream joins appear in enrichment (attach user profile data to clicks), correlation (match orders to payments, requests to responses), and detection (authorizations with no settlement, ads shown with no click). Interviewers probe two things: how much state the join holds and for how long, and what the output looks like while the answer is still changing.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>A strong answer covers:</p>
<ol>
<li>A join is a grouping by key, so it keeps state; batch joins are streaming joins observed once.</li>
<li>FULL OUTER is the foundation. Outer and anti joins emit early NULL rows and retract them when matches arrive; inner joins emit cleanly.</li>
<li>Windows (or time-bounded join conditions) plus the watermark decide when "no match" is final, which bounds state and makes outer results final.</li>
<li>For lookups against values that change over time (exchange rates, prices, profiles), join on the version valid at the event's time: a temporal validity window, or a temporal join in Flink SQL.</li>
</ol>`,
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>"We'll enrich each order with the current exchange rate." On replay or with late data, "current" is the wrong rate. Join on the rate valid at the order's event time, and say what happens when a rate arrives late.</p>`,
        },
        {
          type: "quiz",
          q: "You join an unbounded click stream to an unbounded impression stream with an unwindowed LEFT OUTER join. What is the main operational risk?",
          options: [
            "Results will be missing for matched rows",
            "Join state grows without bound, because unmatched rows can never be declared final and dropped",
            "The join will produce duplicate keys",
            "The join cannot use a watermark trigger with retractions",
          ],
          answer: 1,
          explain: "Without a window or a time-bounded condition, any row might still be matched later, so every row stays in state forever. Windowing or an interval constraint lets the watermark retire old rows.",
        },
      ],
    },
  ],
  takeaways: [
    "A join groups both inputs by key: it is a stream → table operation, and a batch join is a streaming join observed once at the end.",
    "FULL OUTER is the foundation; LEFT, RIGHT, INNER, ANTI and SEMI are filters over it.",
    "In stream form, outer and anti joins emit NULL-padded rows early and retract them when a match arrives; one-to-one inner joins emit no retractions.",
    "SEMI differs from INNER only when a left row has several matches: SEMI emits it once.",
    "Windowing a join partitions it in time and, with the watermark, decides when unmatched rows are final, which bounds state.",
    "Temporal validity windows end where the next value begins, so a late row splits and shrinks a window. Join each event to the value valid at its event time.",
  ],
  furtherReading: [
    { title: "Streaming Systems, Chapter 9 (Akidau, Chernyak, Lax, 2018)", note: "The full treatment of join types, windowed joins and the validity-window emulation in Beam." },
    { title: "Spark Structured Streaming programming guide: stream-stream joins", url: "https://spark.apache.org/docs/latest/structured-streaming-programming-guide.html", note: "When watermarks and time constraints are required, and how state is cleaned up." },
    { title: "Apache Flink: Joins in continuous queries", note: "Flink SQL documentation on regular, interval and temporal joins." },
  ],
};
