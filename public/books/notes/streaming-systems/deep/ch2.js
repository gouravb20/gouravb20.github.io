// Deep dive: Chapter 2, The What, Where, When, and How of Data Processing. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch2 = {
  hook: `<p>Team Blue's players score points in a mobile game, and three different people want the team's total per two-minute window. The product manager wants the leaderboard to move <strong>every minute</strong>, even if the number is provisional. The finance team, which pays out prizes, wants <strong>one final number</strong> per window that will not change. And the on-call engineer wants to know what happens to the six points a player scored at 10:00:50 that did not reach the servers until 10:03:40.</p>
<p>These look like three pipelines. They are one pipeline with different answers to four questions: <em>what</em> to compute, <em>where</em> in event time to group it, <em>when</em> in processing time to emit it, and <em>how</em> successive answers for the same window relate. This chapter is the heart of the book, and every later chapter refines one of those four answers.</p>`,
  sections: [
    {
      id: "four-questions",
      title: "Four questions every pipeline answers",
      kicker: "The framework",
      blocks: [
        {
          type: "idea",
          html: `<p>Any pipeline over unbounded data makes four separate decisions. <strong>What</strong> results are calculated? <strong>Where</strong> in event time are they grouped? <strong>When</strong> in processing time are they emitted? <strong>How</strong> do refinements of the same result relate to each other? Keeping them separate is what lets one engine serve batch, streaming and everything in between.</p>`,
        },
        {
          type: "table",
          title: "The four questions and the constructs that answer them",
          headers: ["Question", "Answered by", "Beam construct"],
          rows: [
            ["<strong>What</strong> results?", "Transformations", "<code>ParDo</code>, <code>GroupByKey</code>, <code>Combine</code>, <code>Sum</code>"],
            ["<strong>Where</strong> in event time?", "Windowing", "<code>Window.into(FixedWindows / SlidingWindows / Sessions)</code>"],
            ["<strong>When</strong> in processing time?", "Triggers and watermarks", "<code>.triggering(AfterWatermark ...)</code>"],
            ["<strong>How</strong> do refinements relate?", "Accumulation mode", "<code>.discardingFiredPanes()</code> / <code>.accumulatingFiredPanes()</code>"],
          ],
        },
        {
          type: "text",
          html: `<p>To make each answer concrete, this deep dive follows six scores for Team Blue. Each has an <strong>event time</strong> (when the player scored) and a <strong>processing time</strong> (when the pipeline received it). Record B is the straggler: scored at 10:00:50, received almost three minutes later.</p>`,
        },
        {
          type: "table",
          title: "Running example: six scores for Team Blue",
          headers: ["Record", "Points", "Event time", "Processing time"],
          rows: [
            ["A", 4, "10:00:15", "10:00:30"],
            ["C", 2, "10:01:20", "10:01:30"],
            ["D", 5, "10:02:10", "10:02:20"],
            ["E", 3, "10:02:50", "10:03:05"],
            ["B", 6, "10:00:50", "10:03:40"],
            ["F", 1, "10:03:30", "10:03:50"],
          ],
          note: "Rows are in arrival (processing-time) order. Two-minute windows: [10:00, 10:02) holds A, B and C for 12 points; [10:02, 10:04) holds D, E and F for 9. Grand total 21.",
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>The book uses its own running example of nine team scores, and the labs in this chapter replay that one. The numbers differ from the six scores here, but every rule you learn applies identically.</p>`,
        },
      ],
    },
    {
      id: "what-and-where",
      title: "What and where: transformations and windows",
      kicker: "Transformations and windowing",
      blocks: [
        {
          type: "text",
          html: `<p><strong>What</strong> is answered by transformations, and they come in two kinds. <strong>Element-wise</strong> transformations (Beam's <code>ParDo</code>) look at one record at a time: parse it, filter it, enrich it. They never need to wait for anything, so time barely matters to them. <strong>Grouping</strong> transformations (<code>GroupByKey</code>, <code>Combine</code>, <code>Sum</code>) bring together every record with the same key, and that is where trouble starts: on an infinite stream, "every record" never finishes arriving.</p>
<p>In Beam a dataset is a <strong>PCollection</strong> (bounded or unbounded, processed in parallel) and an operation is a <strong>PTransform</strong> that turns PCollections into new ones. Summing points per team is a one-liner: <code>scores.apply(Sum.integersPerKey())</code>.</p>
<p>Run that in a classic batch engine and it waits for all six records, then emits <strong>21</strong>. Correct, but it only works because the input ends. On an unbounded stream you would wait forever.</p>
<p><strong>Where</strong> fixes that by chopping event time into windows. Adding <code>Window.into(FixedWindows.of(TWO_MINUTES))</code> makes the batch engine emit one sum per window: <strong>12</strong> for [10:00, 10:02) and <strong>9</strong> for [10:02, 10:04). Each window is finite, so each sum can, in principle, finish.</p>`,
        },
        {
          type: "diagram",
          title: "The six scores, two windows and a heuristic watermark",
          caption: "Each dot is a record at (event time, processing time). The shaded bands are the two event-time windows. The green line is a heuristic watermark: the pipeline's guess of how far event time is complete. Records above it arrived after the watermark had passed them, so they are late. Only B is.",
          svg: `<svg viewBox="0 0 640 350" role="img" aria-label="Plot of six team scores by event time and processing time with two fixed windows and a heuristic watermark; record B is late">
<rect x="90" y="50" width="200" height="250" style="fill: var(--dg-1-soft)" opacity="0.6"/>
<rect x="290" y="50" width="200" height="250" style="fill: var(--dg-2-soft)" opacity="0.6"/>
<text x="98" y="68" font-size="12" font-weight="700" style="fill: var(--dg-1)">W1 [10:00, 10:02)</text>
<text x="298" y="68" font-size="12" font-weight="700" style="fill: var(--dg-2)">W2</text>
<line x1="90" y1="300" x2="500" y2="300" stroke-width="1.5" style="stroke: var(--dg-ink)"/>
<line x1="90" y1="300" x2="90" y2="44" stroke-width="1.5" style="stroke: var(--dg-ink)"/>
<text x="90" y="318" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">10:00</text>
<text x="190" y="318" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">10:01</text>
<text x="290" y="318" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">10:02</text>
<text x="390" y="318" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">10:03</text>
<text x="490" y="318" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">10:04</text>
<text x="290" y="342" text-anchor="middle" font-size="12">Event time</text>
<text x="82" y="304" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">10:00</text>
<text x="82" y="254" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">10:01</text>
<text x="82" y="204" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">10:02</text>
<text x="82" y="154" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">10:03</text>
<text x="82" y="104" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">10:04</text>
<text x="82" y="54" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">10:05</text>
<text x="18" y="175" text-anchor="middle" font-size="12" transform="rotate(-90 18 175)">Processing time</text>
<polyline points="90,258 190,208 290,175 340,142 398,125 423,100 490,75" fill="none" stroke-width="3" style="stroke: var(--dg-ok)"/>
<circle cx="290" cy="175" r="5" style="fill: var(--dg-ok)"/>
<text x="284" y="160" text-anchor="end" font-size="12" font-weight="700">W1 on time: 6</text>
<circle cx="490" cy="75" r="5" style="fill: var(--dg-ok)"/>
<text x="484" y="62" text-anchor="end" font-size="12" font-weight="700">W2 on time: 9</text>
<circle cx="115" cy="275" r="6" style="fill: var(--dg-1)"/>
<text x="124" y="279" font-size="12">A 4</text>
<circle cx="223" cy="225" r="6" style="fill: var(--dg-1)"/>
<text x="232" y="229" font-size="12">C 2</text>
<circle cx="307" cy="183" r="6" style="fill: var(--dg-2)"/>
<text x="316" y="187" font-size="12">D 5</text>
<circle cx="373" cy="146" r="6" style="fill: var(--dg-2)"/>
<text x="382" y="150" font-size="12">E 3</text>
<circle cx="440" cy="108" r="6" style="fill: var(--dg-2)"/>
<text x="449" y="112" font-size="12">F 1</text>
<circle cx="173" cy="117" r="6" style="fill: var(--dg-bad)"/>
<text x="182" y="121" font-size="12" font-weight="700" style="fill: var(--dg-bad)">B 6 (late)</text>
<line x1="512" y1="140" x2="540" y2="140" stroke-width="3" style="stroke: var(--dg-ok)"/>
<text x="546" y="144" font-size="12">watermark</text>
<circle cx="526" cy="168" r="6" style="fill: var(--dg-1)"/>
<text x="546" y="172" font-size="12">on time</text>
<circle cx="526" cy="196" r="6" style="fill: var(--dg-bad)"/>
<text x="546" y="200" font-size="12">late</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>Windowing alone does not tell a streaming engine when to emit the 12 or the 9. In batch the answer is implicit: when the input ends. On a stream, something has to decide when a window's result comes out in processing time. That is the third question.</p>`,
        },
        {
          type: "code",
          lang: "java",
          title: "What and where in Beam",
          code: `PCollection<KV<String, Integer>> totals = scores
    .apply(Window.into(FixedWindows.of(Duration.standardMinutes(2))))  // where
    .apply(Sum.integersPerKey());                                      // what`,
        },
      ],
    },
    {
      id: "when-triggers",
      title: "When: triggers and panes",
      kicker: "Repeated updates",
      blocks: [
        {
          type: "text",
          html: `<p>A <strong>trigger</strong> says when, in processing time, a window's result should be materialized. Each output it produces is called a <strong>pane</strong> of that window, and a window can have many panes over its life. Triggers are what separate <em>which window data belongs to</em> (event time) from <em>when you get to see the answer</em> (processing time).</p>
<p>There are two families. <strong>Repeated update triggers</strong> fire again and again as data arrives or as the clock ticks, giving you a series of improving answers. <strong>Completeness triggers</strong> fire once the input for a window is believed to be complete; they are covered in the next section. Here are three repeated update triggers on the Team Blue data.</p>`,
        },
        {
          type: "table",
          title: "Three repeated update triggers on the same data (accumulating)",
          headers: ["Trigger", "W1 panes (time: value)", "W2 panes (time: value)"],
          rows: [
            ["Every record", "10:00:30: 4, 10:01:30: 6, 10:03:40: 12", "10:02:20: 5, 10:03:05: 8, 10:03:50: 9"],
            ["Aligned delay, 2 min", "10:02:00: 6, 10:04:00: 12", "10:04:00: 9"],
            ["Unaligned delay, 2 min", "10:02:30: 6, 10:05:40: 12", "10:04:20: 9"],
          ],
          note: "Processing times are when each pane fires. Each pane holds everything seen so far for its window.",
        },
        {
          type: "text",
          html: `<p><strong>Per-record</strong> triggering (<code>Repeatedly(AfterCount(1))</code> in the book's shorthand) fires a new pane for every record. Latency is as low as it gets, but every record becomes a write to the downstream store, which is fine for a few teams and painful for millions of keys. It also says nothing about whether a pane is complete.</p>
<p>An <strong>aligned delay</strong> trigger fires all windows at the same processing-time boundaries, every two minutes on the clock. At 10:04:00 both W1 and W2 fire together. This is the behaviour of a micro-batch engine: predictable, but every key's output lands in the same instant, so load comes in bursts.</p>
<p>An <strong>unaligned delay</strong> trigger starts a two-minute timer when the first unprocessed record for a given window arrives. W1's timer starts with A at 10:00:30 and fires at 10:02:30; W2's starts with D at 10:02:20 and fires at 10:04:20. The work is spread out over time, and the price is that different windows report at different moments.</p>`,
        },
        {
          type: "callout",
          tone: "modern",
          html: `<p>The book's trigger names are a readable shorthand. In the actual Beam SDK, a per-record trigger is <code>AfterPane.elementCountAtLeast(1)</code>, and an unaligned delay is <code>AfterProcessingTime.pastFirstElementInPane().plusDelayOf(...)</code>, wrapped in <code>Repeatedly.forever(...)</code> when you want it to keep firing.</p>`,
        },
        {
          type: "quiz",
          q: "A pipeline has a million keys and uses an aligned two-minute delay trigger. What operational pattern should you expect?",
          options: [
            "A smooth, constant write rate to the sink",
            "Bursts of writes every two minutes with quiet periods in between",
            "No output until the watermark passes the end of each window",
            "One write per input record",
          ],
          answer: 1,
          explain: "Aligned delays fire every window on the same clock boundaries, so all million keys emit at once every two minutes. An unaligned delay starts each window's timer from its own first record and spreads those writes over time.",
        },
      ],
    },
    {
      id: "when-watermarks",
      title: "When: watermarks and completeness",
      kicker: "Completeness triggers",
      blocks: [
        {
          type: "problem",
          html: `<p>Repeated update triggers give fresh numbers, but none of them can tell finance "this is the final total for W1". For that the pipeline needs some idea of how complete each window is, and as Chapter 1 showed, completeness of an unbounded, out-of-order stream can never be known for sure.</p>`,
        },
        {
          type: "text",
          html: `<p>A <strong>watermark</strong> is the pipeline's statement about input completeness in event time. Formally it is a function from processing time to event time: at processing time P the watermark is E, meaning "I believe every record with event time before E has now arrived". In the diagram above, the green line is that function: at 10:02:30 on the clock, the watermark reaches 10:02:00, so W1 is believed complete.</p>
<p>A <strong>completeness trigger</strong> such as <code>AfterWatermark()</code> fires once, when the watermark passes the end of the window. There are two kinds of watermark behind it.</p>
<ul>
<li>A <strong>perfect watermark</strong> has full knowledge of the input, so no record is ever late. But it can be <strong>too slow</strong>: it cannot pass 10:00:50 until B arrives at 10:03:40. W1's result waits over a minute and a half past the point where everything else in it had arrived, and W2 is blocked behind it too.</li>
<li>A <strong>heuristic watermark</strong> estimates progress from what it can observe (partition offsets, arrival patterns, history). It is faster, but it can be <strong>too fast</strong>: in the diagram it passes 10:02 at 10:02:30, fires W1 with <strong>6</strong>, and B's 6 points arrive afterwards as late data.</li>
</ul>`,
        },
        {
          type: "lab",
          id: "beamSim",
          caption: "Pick a figure preset (batch, windowed batch, per-record, aligned and unaligned delays, perfect and heuristic watermarks, early/on-time/late) and scrub processing time to watch panes fire. Compare where the perfect and heuristic watermarks make the first window wait or miss data.",
        },
        {
          type: "table",
          title: "Watermark failure modes",
          headers: ["Problem", "Cause", "Fix"],
          rows: [
            ["Too slow", "A perfect watermark held back by one straggler, or an overly cautious heuristic", "Early firings: speculative panes before the watermark"],
            ["Too fast", "A heuristic watermark passed data that had not arrived yet", "Late firings, plus allowed lateness to bound how long you wait"],
          ],
        },
        {
          type: "quiz",
          q: "With a perfect watermark on the Team Blue data, when can W1 [10:00, 10:02) fire its on-time pane, and with what value?",
          options: [
            "At about 10:02:30 with 6",
            "At 10:03:40 or just after, with 12",
            "At 10:02:00 exactly, with 6",
            "Never, because B is late",
          ],
          answer: 1,
          explain: "A perfect watermark never declares a window complete while any of its records is outstanding, so it cannot pass 10:00:50 until B arrives at 10:03:40. W1 then fires with all three records, 12. Nothing is late, but the answer is slow, which is why perfect watermarks still benefit from early firings.",
        },
      ],
    },
    {
      id: "early-on-time-late",
      title: "Early, on-time and late panes, and allowed lateness",
      kicker: "Best of both",
      blocks: [
        {
          type: "idea",
          html: `<p>Combine the two families. Use repeated triggers <strong>before</strong> the watermark for speculative early answers, a single <strong>on-time</strong> pane when the watermark passes, and repeated triggers <strong>after</strong> it to correct the answer when late data shows up. Early firings cover watermarks that are too slow; late firings cover watermarks that are too fast.</p>`,
        },
        {
          type: "code",
          lang: "java",
          title: "Early, on-time and late, in the book's trigger shorthand",
          code: `PCollection<KV<String, Integer>> totals = scores
    .apply(Window.into(FixedWindows.of(TWO_MINUTES))
                 .triggering(
                     AfterWatermark()
                         .withEarlyFirings(AlignedDelay(ONE_MINUTE))
                         .withLateFirings(AfterCount(1)))
                 .withAllowedLateness(FIVE_MINUTES)
                 .accumulatingFiredPanes())
    .apply(Sum.integersPerKey());`,
          caption: "In the Beam SDK, AfterWatermark() is AfterWatermark.pastEndOfWindow() and AfterCount(1) is AfterPane.elementCountAtLeast(1).",
        },
        {
          type: "diagram",
          title: "The panes each window emits, over processing time",
          caption: "With one-minute aligned early firings, the heuristic watermark and five minutes of allowed lateness. W1 shows provisional 4 and 6, an on-time 6, then a late 12 when B arrives. W2 shows 5 and 9 early, then an on-time 9.",
          svg: `<svg viewBox="0 0 600 245" role="img" aria-label="Timeline of early, on-time and late panes for two windows across processing time">
<text x="10" y="74" font-size="13" font-weight="700">W1</text>
<text x="10" y="90" font-size="12" style="fill: var(--dg-muted)">10:00-10:02</text>
<line x1="100" y1="78" x2="580" y2="78" stroke-width="1" stroke-dasharray="3 4" style="stroke: var(--dg-line)"/>
<circle cx="180" cy="78" r="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="180" y="60" text-anchor="middle" font-size="12" font-weight="700">4</text>
<circle cx="260" cy="78" r="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="260" y="60" text-anchor="middle" font-size="12" font-weight="700">6</text>
<circle cx="300" cy="78" r="8" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="300" y="60" text-anchor="middle" font-size="12" font-weight="700">6</text>
<circle cx="393" cy="78" r="8" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)" stroke-width="2"/>
<text x="393" y="60" text-anchor="middle" font-size="12" font-weight="700">12</text>
<text x="10" y="144" font-size="13" font-weight="700">W2</text>
<text x="10" y="160" font-size="12" style="fill: var(--dg-muted)">10:02-10:04</text>
<line x1="100" y1="148" x2="580" y2="148" stroke-width="1" stroke-dasharray="3 4" style="stroke: var(--dg-line)"/>
<circle cx="340" cy="148" r="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="340" y="130" text-anchor="middle" font-size="12" font-weight="700">5</text>
<circle cx="420" cy="148" r="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="420" y="130" text-anchor="middle" font-size="12" font-weight="700">9</text>
<circle cx="460" cy="148" r="8" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="460" y="130" text-anchor="middle" font-size="12" font-weight="700">9</text>
<line x1="100" y1="180" x2="580" y2="180" stroke-width="1.5" style="stroke: var(--dg-ink)"/>
<text x="100" y="198" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">10:00</text>
<text x="180" y="198" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">10:01</text>
<text x="260" y="198" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">10:02</text>
<text x="340" y="198" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">10:03</text>
<text x="420" y="198" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">10:04</text>
<text x="500" y="198" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">10:05</text>
<text x="580" y="172" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">processing time</text>
<circle cx="110" cy="226" r="7" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="124" y="230" font-size="12">early</text>
<circle cx="200" cy="226" r="7" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="214" y="230" font-size="12">on time</text>
<circle cx="300" cy="226" r="7" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)" stroke-width="2"/>
<text x="314" y="230" font-size="12">late</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>Walk through W1. At 10:01:00 the first early firing emits <strong>4</strong> (only A has arrived). At 10:02:00 the next emits <strong>6</strong> (A and C). At 10:02:30 the heuristic watermark passes 10:02 and the on-time pane fires; no new records came in, so it carries 6 again, but now labelled as the pipeline's best complete answer. At 10:03:40 B arrives, behind the watermark, and the late-firing rule emits <strong>12</strong>. Product got a moving number every minute, finance got an on-time number, and the straggler still ended up counted.</p>
<h3>Allowed lateness: when to stop waiting</h3>
<p>If the pipeline keeps every window's state forever just in case a late record shows up, memory grows without bound. <code>withAllowedLateness</code> sets a horizon: once the watermark passes <strong>end of window plus allowed lateness</strong>, the window's state is garbage-collected and any later record for it is dropped.</p>
<p>With five minutes of allowed lateness, B is accepted. With only one minute, W1's state is dropped as soon as the watermark passes 10:03, which happens at about 10:03:27 on the clock. B arrives at 10:03:40, finds no window to update, and is discarded; W1's final answer stays 6.</p>
<p>Notice that the horizon is measured against the <strong>watermark</strong>, in event time, not against the wall clock. If the pipeline falls behind (a backlog after an outage, say), processing time races ahead while the watermark crawls. A wall-clock horizon would throw away perfectly good data simply because the pipeline was slow; an event-time horizon waits for the input to actually progress.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Apache Flink", title: "Allowed lateness and side outputs", html: "Event-time windows fire when the watermark passes their end. <code>allowedLateness(...)</code> keeps window state longer so late records re-fire the window, and <code>sideOutputLateData(tag)</code> routes records that arrive after that to a separate stream instead of silently dropping them." },
            { org: "Spark Structured Streaming", title: "One knob for both", html: "<code>withWatermark(\"eventTime\", \"10 minutes\")</code> sets a watermark that trails the largest event time seen by the delay. It decides when aggregation state can be dropped, and in <code>append</code> output mode it is also when each window's single final row is emitted; <code>update</code> mode emits changed rows on every micro-batch instead." },
            { org: "Kafka Streams", title: "Grace periods", html: "Windowed aggregations accept late records until stream time (the largest timestamp seen) passes the window end plus a <em>grace period</em>. By default they emit updates as results change; <code>suppress(Suppressed.untilWindowCloses(...))</code> emits only the final result per window." },
          ],
        },
        {
          type: "quiz",
          q: "A pipeline replaying a three-hour backlog uses one hour of allowed lateness. Why is it important that the lateness is measured against the watermark rather than the wall clock?",
          options: [
            "Because wall clocks on different machines disagree",
            "Because a wall-clock horizon would expire windows that the backlog has not even reached yet, dropping valid data",
            "Because the watermark is always ahead of the wall clock",
            "It makes no difference during a backlog",
          ],
          answer: 1,
          explain: "During a backlog, processing time is hours ahead of the event times being processed. A wall-clock rule of one hour would declare windows dead before their data is read. Measuring against the watermark ties cleanup to how far the input has actually progressed.",
        },
      ],
    },
    {
      id: "how-accumulation",
      title: "How: accumulation modes",
      kicker: "Refinements",
      blocks: [
        {
          type: "problem",
          html: `<p>Once a window can emit several panes, the consumer has to know how they relate. Is the second pane a replacement for the first, or something to add to it? Get this wrong and a downstream total silently doubles.</p>`,
        },
        {
          type: "text",
          html: `<p>Take W1 with a simpler trigger: an on-time pane and late firings, no early panes. The on-time pane sees A and C (inputs 4 and 2); the late pane sees B (input 6). The three accumulation modes emit:</p>`,
        },
        {
          type: "table",
          title: "W1's two panes under each mode",
          headers: ["", "Discarding", "Accumulating", "Accumulating and retracting"],
          rows: [
            ["On-time pane (inputs 4, 2)", "6", "6", "6"],
            ["Late pane (input 6)", "6", "12", "12, plus a retraction of 6"],
            ["Value of the last pane", "6", "12", "12"],
            ["Sum of all panes", "12", "18 (wrong)", "12"],
          ],
          note: "Choose by what the consumer does with each pane: add it (discarding), overwrite with it (accumulating), or regroup it under another key (retracting).",
        },
        {
          type: "text",
          html: `<ul>
<li><strong>Discarding</strong>: each pane contains only what arrived since the previous pane. A consumer that <em>adds</em> panes (a counter, a running sum in another system) gets 12.</li>
<li><strong>Accumulating</strong>: each pane contains everything so far, so the latest pane replaces the earlier ones. A consumer that <em>overwrites</em> a row keyed by window, like the Bigtable layout from Chapter 1, gets 12. A consumer that adds panes gets 18.</li>
<li><strong>Accumulating and retracting</strong>: each pane contains everything so far <em>and</em> an explicit "take back the 6 I told you earlier". Overwriting and adding both give 12.</li>
</ul>`,
        },
        {
          type: "lab",
          id: "accumulation",
          caption: "Type the inputs of each pane (separate panes with |), then compare what each accumulation mode emits and what an overwrite-by-key store and a summing consumer end up holding.",
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Accumulating mode feeding a stage that regroups by a different key. Say per-player totals are summed into a per-team total downstream. A player's first pane says 5, a later pane says 14. Added together, the team gains 19 instead of 14. Fix it with discarding mode (send the delta, +9) or with retractions (send &minus;5 and +14).</p>`,
        },
        {
          type: "text",
          html: `<h3>Why retractions exist</h3>
<p>Retractions matter in two situations. The first is the regrouping case above: a downstream stage that re-aggregates by another dimension needs to subtract the old value. The second is <strong>merging windows</strong> such as sessions (Chapter 4): when a late record joins two sessions into one, the two sessions already emitted must be withdrawn before the merged one is sent, or consumers would count their data twice.</p>
<p>Beam's SDKs expose discarding and accumulating modes. The retracting mode is part of the model described in the book and the Dataflow paper, but you will not find it as a ready-made option in Beam; systems that need it often model it with changelog streams, as in Flink SQL's update and delete rows or Kafka Streams' table changelogs.</p>`,
        },
        {
          type: "quiz",
          q: "A pipeline emits per-window totals with early and late firings and writes them to a table where each row is keyed by (team, window start) and overwritten on every write. Which accumulation mode should it use?",
          options: ["Discarding", "Accumulating", "Either; it makes no difference", "Neither; the table must be append-only"],
          answer: 1,
          explain: "An overwrite store keeps only the last value written for each row, so each pane must carry the full result so far. Discarding panes would overwrite the full total with just the latest delta.",
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
          html: `<p>Whenever a design aggregates events over time (ad clicks per campaign per minute, rides per zone, fraud signals per card), you are answering the four questions whether you say so or not. Saying so out loud is one of the clearest signals of streaming fluency an interviewer can get.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>Structure the aggregation part of your answer as four short decisions:</p>
<ol>
<li><strong>What</strong>: the aggregation, for example a count of clicks per campaign.</li>
<li><strong>Where</strong>: the window, for example one-minute fixed windows in event time.</li>
<li><strong>When</strong>: early firings every few seconds for dashboards, an on-time pane when the watermark passes, late firings for stragglers, and an allowed lateness (say one hour) after which state is dropped.</li>
<li><strong>How</strong>: accumulating panes written as upserts keyed by (campaign, window), or discarding panes if the sink adds.</li>
</ol>
<p>Then name the trade-off: a more aggressive watermark lowers latency but creates more late data; a longer allowed lateness catches more stragglers but holds more state.</p>`,
        },
        {
          type: "quiz",
          q: "An interviewer asks: billing needs exact totals, the dashboard needs updates every 10 seconds, and some events arrive up to 30 minutes late. Which configuration fits?",
          options: [
            "Processing-time windows with a 10-second aligned trigger",
            "Event-time windows; early firings every 10 seconds, an on-time pane at the watermark, late firings, and allowed lateness of at least 30 minutes",
            "Event-time windows with a perfect watermark and no early firings",
            "A global window with a per-record trigger in discarding mode",
          ],
          answer: 1,
          explain: "Event-time windows keep billing correct; early firings feed the dashboard; late firings plus allowed lateness of at least 30 minutes let stragglers correct the totals. Processing-time windows would bill events to the wrong windows, and a perfect watermark is rarely available and would stall the dashboard.",
        },
      ],
    },
  ],
  takeaways: [
    "Every pipeline answers four questions: <strong>what</strong> is computed (transformations), <strong>where</strong> in event time (windows), <strong>when</strong> in processing time (triggers and watermarks) and <strong>how</strong> refinements relate (accumulation).",
    "A trigger decides when a window emits; each output is a pane. Repeated update triggers (per record, aligned or unaligned delay) give fresh answers; completeness triggers fire when the watermark passes the window.",
    "A watermark maps processing time to event time: \"I believe I have seen everything before E\". Perfect watermarks can be too slow; heuristic ones can be too fast.",
    "Early firings fix slow watermarks, late firings fix fast ones, and allowed lateness bounds how long window state is kept.",
    "Allowed lateness is measured against the watermark, so a pipeline that falls behind does not drop valid data.",
    "Pick the accumulation mode from the consumer: overwrite stores want accumulating, adders want discarding, regrouping stages and merging windows want retractions.",
  ],
  furtherReading: [
    { title: "The Dataflow Model (Akidau et al., VLDB 2015)", url: "https://www.vldb.org/pvldb/vol8/p1792-Akidau.pdf", note: "Introduces windowing, triggers and the accumulation modes, including retractions." },
    { title: "The world beyond batch: Streaming 102 (Tyler Akidau, O'Reilly, 2016)", note: "The essay that first presented the what, where, when and how framing." },
    { title: "Apache Beam programming guide", url: "https://beam.apache.org/documentation/programming-guide/", note: "Sections on windowing, watermarks and late data, and triggers show the real SDK names." },
  ],
};
