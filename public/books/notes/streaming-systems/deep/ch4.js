// Deep dive: Chapter 4, Advanced Windowing. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch4 = {
  hook: `<p>A video service wants to know how long people watch in one sitting. The first version counts viewing minutes per user in fixed one-hour windows. A viewer who starts an episode at 21:40 and stops at 22:30 shows up as two separate twenty-minute and thirty-minute stints, because the hour boundary at 22:00 sliced the evening in half. The question was about <em>sittings</em>, and nothing in the data has a sitting boundary at 22:00.</p>
<p>The same pipeline has a second problem. Every user's 21:00 window closes at the same moment the watermark passes 22:00, so millions of results are computed and written in a single burst, followed by an hour of near silence. The sink team asks for the load to be spread out. Both problems are about the <em>where</em> question, and both are solved by windows smarter than "every hour on the hour": sessions, phase-shifted fixed windows, and windowing logic you write yourself.</p>`,
  sections: [
    {
      id: "processing-time-windows",
      title: "Processing-time windows, done two ways",
      kicker: "Processing-time windowing",
      blocks: [
        {
          type: "text",
          html: `<p>Chapter 1 made the case for event time, but processing-time windows are the right tool when the question is about the system as it observes data: requests per second for an outage alert, ingestion rate into a queue, or any analysis where arrival order really is the subject. The Beam model can express them in two ways.</p>
<h3>1. With triggers</h3>
<p>Put everything in a single <strong>global event-time window</strong> and attach a repeating processing-time trigger, such as an aligned two-minute delay, in <strong>discarding</strong> mode. Each firing emits whatever arrived since the last one, so each pane is effectively a two-minute processing-time window. This is how micro-batch systems "window": the batches are the windows.</p>
<h3>2. With ingress time</h3>
<p>Overwrite each record's event time with the time it <strong>arrived</strong> at the pipeline, then use ordinary event-time windows with a watermark trigger. Because arrival times are assigned in order at the source, the watermark is perfect: it is just the source's clock. The numbers come out identical to the trigger approach, but you get real windows, a single complete pane per window, and all the event-time machinery for free.</p>`,
        },
        {
          type: "code",
          lang: "java",
          title: "The two approaches, in the book's Beam shorthand",
          code: `// 1. Triggers: a global window cut into panes by the processing-time clock.
scores.apply(Window.into(new GlobalWindows())
                   .triggering(Repeatedly(AlignedDelay(TWO_MINUTES)))
                   .discardingFiredPanes())
      .apply(Sum.integersPerKey());

// 2. Ingress time: stamp each record with its arrival time, then window normally.
scores.apply(WithTimestamps.of(record -> Instant.now()))   // arrival time as event time
      .apply(Window.into(FixedWindows.of(TWO_MINUTES))
                   .triggering(AfterWatermark()))
      .apply(Sum.integersPerKey());`,
          caption: "In practice the source usually supplies arrival time, for example a Kafka topic configured with LogAppendTime.",
        },
        {
          type: "text",
          html: `<p>Either way, the answer depends on arrival order, and that is the point to internalize. Take four scores in two-minute windows: P (3 points at 10:00:30), Q (5 at 10:01:10), R (2 at 10:02:20) and S (4 at 10:03:40). On a calm day each arrives within twenty seconds, and every method reports <strong>8, 6</strong>. On a bad day Q is delayed until 10:02:30 and S until 10:04:10. Event-time windows still report <strong>8, 6</strong>. Processing-time windows now report <strong>3, 7, 4</strong>, because Q slid into the second window and S into a third.</p>`,
        },
        {
          type: "diagram",
          title: "Same records, two kinds of window",
          caption: "Both plots show the bad-day arrival order: event time across, processing time up. Event-time windows are vertical bands, so a delay moves a record up but never out of its window. Processing-time windows are horizontal bands, so delays move records between windows.",
          svg: `<svg viewBox="0 0 640 285" role="img" aria-label="Side-by-side plots of four records: event-time windows as vertical bands give 8 and 6; processing-time windows as horizontal bands give 3, 7 and 4">
<text x="170" y="30" text-anchor="middle" font-size="13" font-weight="700">Event-time windows</text>
<text x="480" y="30" text-anchor="middle" font-size="13" font-weight="700">Processing-time windows</text>
<rect x="50" y="50" width="120" height="180" style="fill: var(--dg-1-soft)" opacity="0.7"/>
<rect x="170" y="50" width="120" height="180" style="fill: var(--dg-2-soft)" opacity="0.7"/>
<text x="110" y="68" text-anchor="middle" font-size="13" font-weight="700" style="fill: var(--dg-1)">8</text>
<text x="230" y="68" text-anchor="middle" font-size="13" font-weight="700" style="fill: var(--dg-2)">6</text>
<rect x="360" y="170" width="240" height="60" style="fill: var(--dg-1-soft)" opacity="0.7"/>
<rect x="360" y="110" width="240" height="60" style="fill: var(--dg-2-soft)" opacity="0.7"/>
<rect x="360" y="50" width="240" height="60" style="fill: var(--dg-3-soft)" opacity="0.7"/>
<text x="596" y="200" text-anchor="end" font-size="13" font-weight="700" style="fill: var(--dg-1)">3</text>
<text x="596" y="140" text-anchor="end" font-size="13" font-weight="700" style="fill: var(--dg-2)">7</text>
<text x="596" y="80" text-anchor="end" font-size="13" font-weight="700" style="fill: var(--dg-3)">4</text>
<line x1="50" y1="230" x2="290" y2="230" stroke-width="1.5" style="stroke: var(--dg-ink)"/>
<line x1="50" y1="230" x2="50" y2="50" stroke-width="1.5" style="stroke: var(--dg-ink)"/>
<line x1="360" y1="230" x2="600" y2="230" stroke-width="1.5" style="stroke: var(--dg-ink)"/>
<line x1="360" y1="230" x2="360" y2="50" stroke-width="1.5" style="stroke: var(--dg-ink)"/>
<text x="44" y="234" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">10:00</text>
<text x="44" y="174" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">10:02</text>
<text x="44" y="114" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">10:04</text>
<text x="44" y="54" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">10:06</text>
<text x="50" y="248" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">10:00</text>
<text x="170" y="248" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">10:02</text>
<text x="290" y="248" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">10:04</text>
<text x="360" y="248" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">10:00</text>
<text x="480" y="248" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">10:02</text>
<text x="600" y="248" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">10:04</text>
<circle cx="80" cy="210" r="5" style="fill: var(--dg-ink)"/>
<text x="87" y="204" font-size="12">P</text>
<circle cx="120" cy="155" r="5" style="fill: var(--dg-ink)"/>
<text x="127" y="149" font-size="12">Q</text>
<circle cx="190" cy="158" r="5" style="fill: var(--dg-ink)"/>
<text x="197" y="152" font-size="12">R</text>
<circle cx="270" cy="105" r="5" style="fill: var(--dg-ink)"/>
<text x="277" y="99" font-size="12">S</text>
<circle cx="390" cy="210" r="5" style="fill: var(--dg-ink)"/>
<text x="397" y="204" font-size="12">P</text>
<circle cx="430" cy="155" r="5" style="fill: var(--dg-ink)"/>
<text x="437" y="149" font-size="12">Q</text>
<circle cx="500" cy="158" r="5" style="fill: var(--dg-ink)"/>
<text x="507" y="152" font-size="12">R</text>
<circle cx="580" cy="105" r="5" style="fill: var(--dg-ink)"/>
<text x="566" y="99" text-anchor="end" font-size="12">S</text>
<text x="170" y="274" text-anchor="middle" font-size="12">totals 8, 6 on any day</text>
<text x="480" y="274" text-anchor="middle" font-size="12">totals 3, 7, 4 today</text>
</svg>`,
        },
        {
          type: "lab",
          id: "ptWindows",
          caption: "Switch between event-time windows, processing-time windows via triggers and via ingress time, and between two arrival orders. Watch which totals stay fixed and which move.",
        },
        {
          type: "realworld",
          items: [
            { org: "Apache Kafka", title: "Ingress time at the broker", html: "A topic configured with <code>message.timestamp.type=LogAppendTime</code> stamps each record with the broker's clock when it is appended, so windowing downstream on that timestamp is ingress-time windowing." },
            { org: "Google Cloud Pub/Sub with Beam", title: "Publish time by default", html: "When <code>PubsubIO</code> is not told to read a timestamp attribute, element timestamps default to each message's publish time, which is again an ingress-style clock." },
            { org: "Apache Flink", title: "From ingestion time to explicit strategies", html: "Older Flink versions offered an <em>ingestion time</em> characteristic. It was deprecated in Flink 1.12 in favour of event time with explicit watermark strategies, plus dedicated processing-time window assigners." },
          ],
        },
        {
          type: "quiz",
          q: "Which of these is a good reason to choose ingress-time windowing over the global-window-plus-trigger approach?",
          options: [
            "It makes results independent of arrival order",
            "It produces real windows with a perfect watermark, so each window emits one complete pane and plugs into event-time tooling",
            "It reduces state compared with event-time windows on the original timestamps",
            "It allows late data to be corrected",
          ],
          answer: 1,
          explain: "Both approaches compute the same order-dependent numbers. Ingress time turns them into genuine event-time windows with a perfect watermark, so you get one complete on-time pane per window and can reuse watermark-based triggers, timers and downstream windowing.",
        },
      ],
    },
    {
      id: "session-windows",
      title: "Session windows: letting the data draw the boundaries",
      kicker: "Sessions",
      blocks: [
        {
          type: "problem",
          html: `<p>Fixed windows impose boundaries the data does not have. A sitting that crosses 22:00 is split in two, and two unrelated sittings inside one hour are merged into one. For engagement, attribution or any "visit" question, the boundaries need to come from the activity itself.</p>`,
        },
        {
          type: "idea",
          html: `<p>A <strong>session</strong> is a period of activity for one key, ended by a gap of inactivity longer than a chosen timeout. Sessions are <strong>data-driven</strong> (you cannot know a session's boundaries until its data arrives) and <strong>unaligned</strong> (each key has its own boundaries).</p>`,
        },
        {
          type: "text",
          html: `<p>Back to the viewer. With a 30-minute gap, player events at 21:40, 21:52, 22:05 and 22:20 form one session: no two consecutive events are 30 minutes apart. The session runs from 21:40 to 22:50 (the last event plus the gap, the point at which inactivity is confirmed). An event at 23:30 starts a new session, because 70 minutes passed since 22:20. Neither session cares where the hour boundaries fall.</p>
<p>Two parameters shape every session analysis. The <strong>gap</strong> is a product decision: too short and a bathroom break splits a sitting; too long and lunch and dinner become one sitting. And because sessions are keyed, the <strong>key</strong> matters as much as the gap: sessions per user, per device and per user-and-device answer different questions.</p>`,
        },
        {
          type: "code",
          lang: "java",
          title: "Sessions in Beam with early and late firings",
          code: `PCollection<KV<String, Integer>> minutesPerSitting = plays
    .apply(Window.into(Sessions.withGapDuration(Duration.standardMinutes(30)))
                 .triggering(AfterWatermark()
                     .withEarlyFirings(AlignedDelay(ONE_MINUTE))
                     .withLateFirings(AfterCount(1)))
                 .withAllowedLateness(Duration.standardHours(1))
                 .accumulatingFiredPanes())
    .apply(Sum.integersPerKey());`,
          caption: "Book-style trigger shorthand. Because sessions merge, panes that were already emitted can be superseded; see the next section.",
        },
        {
          type: "realworld",
          items: [
            { org: "Apache Flink", title: "Session window assigners", html: "<code>EventTimeSessionWindows.withGap(...)</code> and its processing-time twin, plus <code>withDynamicGap(...)</code> to compute the gap per element. Internally they are merging window assigners." },
            { org: "Spark Structured Streaming", title: "session_window", html: "Since Spark 3.2, <code>session_window(col, gapDuration)</code> groups rows into sessions, and the gap can be an expression evaluated per row." },
            { org: "Kafka Streams", title: "SessionWindows", html: "Session windows are defined by an inactivity gap; a record that falls between two existing sessions for the same key merges them into one." },
          ],
        },
      ],
    },
    {
      id: "merging-sessions",
      title: "Proto-sessions, merging and retractions",
      kicker: "How sessions work",
      blocks: [
        {
          type: "text",
          html: `<p>Sessions look magical but are built from two simple steps, which is what makes them work in a distributed engine where records arrive in any order.</p>`,
        },
        {
          type: "steps",
          title: "Building sessions incrementally",
          items: [
            "<strong>Assign</strong>: each record gets its own <strong>proto-session</strong>, the window [event time, event time + gap).",
            "<strong>Group</strong>: proto-sessions are grouped by key, like any other windows.",
            "<strong>Merge</strong>: any proto-sessions or sessions for the same key that overlap are merged, transitively, into one window spanning all of them, and their state is combined.",
            "<strong>Repeat</strong> as records arrive. A record that overlaps two existing sessions merges them into one.",
          ],
        },
        {
          type: "diagram",
          title: "A late record bridges two sessions",
          caption: "Gap of 10 minutes. Four records produce proto-sessions that merge into two sessions worth 6 and 8 points. A late record at 21:13 has a proto-session overlapping both, so they merge into a single session worth 15. The two sessions already emitted must be retracted.",
          svg: `<svg viewBox="0 0 620 270" role="img" aria-label="Proto-sessions merging into two sessions, then a late record bridging them into one merged session">
<text x="10" y="76" font-size="12" font-weight="700">proto-sessions</text>
<rect x="110" y="34" width="120" height="16" rx="3" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="116" y="46" font-size="12">e1: 4</text>
<rect x="182" y="56" width="120" height="16" rx="3" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="188" y="68" font-size="12">e2: 2</text>
<rect x="350" y="78" width="120" height="16" rx="3" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="356" y="90" font-size="12">e3: 5</text>
<rect x="410" y="100" width="120" height="16" rx="3" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="416" y="112" font-size="12">e4: 3</text>
<text x="10" y="150" font-size="12" font-weight="700">sessions</text>
<rect x="110" y="136" width="192" height="20" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="206" y="151" text-anchor="middle" font-size="12" font-weight="700">6</text>
<rect x="350" y="136" width="180" height="20" rx="4" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="440" y="151" text-anchor="middle" font-size="12" font-weight="700">8</text>
<text x="540" y="151" font-size="12" style="fill: var(--dg-bad)">retracted</text>
<text x="10" y="185" font-size="12" font-weight="700">late record</text>
<rect x="266" y="172" width="120" height="16" rx="3" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)"/>
<text x="272" y="184" font-size="12">e5: 1</text>
<text x="10" y="220" font-size="12" font-weight="700">merged</text>
<rect x="110" y="206" width="420" height="20" rx="4" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="320" y="221" text-anchor="middle" font-size="12" font-weight="700">15</text>
<text x="540" y="221" font-size="12" style="fill: var(--dg-ok)">emitted</text>
<line x1="110" y1="240" x2="590" y2="240" stroke-width="1.5" style="stroke: var(--dg-ink)"/>
<text x="110" y="258" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">21:00</text>
<text x="230" y="258" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">21:10</text>
<text x="350" y="258" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">21:20</text>
<text x="470" y="258" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">21:30</text>
<text x="590" y="258" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">21:40</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>Walk through it. Records e1 (21:00) and e2 (21:06) have proto-sessions [21:00, 21:10) and [21:06, 21:16), which overlap, so they merge into one session [21:00, 21:16) worth 6. Records e3 (21:20) and e4 (21:25) merge into [21:20, 21:35) worth 8. The two sessions do not overlap, because e2 and e3 are 14 minutes apart, more than the gap. With early firings, the pipeline has already told downstream "session one is 6, session two is 8".</p>
<p>Then e5 arrives late with event time 21:13. Its proto-session [21:13, 21:23) overlaps both, so all three merge into [21:00, 21:35) worth 15. The windows downstream heard about no longer exist. If the consumer is summing sessions per day, it now has 6 + 8 + 15 = 29 instead of 15. This is why merging windows need <strong>retractions</strong>: the pipeline must withdraw the 6 and the 8 before (or along with) emitting the 15.</p>`,
        },
        {
          type: "lab",
          id: "sessions",
          caption: "Step through the book's nine records in arrival order. Each one gets a proto-session, overlapping ones merge, and each merge retracts earlier sessions. Watch the late record join two sessions into one.",
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p>Beam does not offer a retracting accumulation mode. If a downstream stage re-aggregates sessions, either write sessions to a store keyed so that a merged session overwrites the ones it replaces (keyed by user and session start, deleting superseded keys), or emit only final panes and accept the latency. Flink SQL and Kafka Streams model this with changelog updates.</p>`,
        },
        {
          type: "quiz",
          q: "With a 10-minute gap, a key has sessions [14:00, 14:12) and [14:20, 14:31). Which late record would merge them into one session?",
          options: ["Event time 14:05", "Event time 14:11", "Event time 14:16", "Event time 14:32"],
          answer: 1,
          explain: "A record at 14:11 has the proto-session [14:11, 14:21), which overlaps the first session (it starts before 14:12) and the second (it ends after 14:20), so all three merge. 14:05 stays within reach of the first session only, while 14:16 and 14:32 only touch the second.",
        },
      ],
    },
    {
      id: "custom-windowing",
      title: "Custom windowing: assignment plus merging",
      kicker: "Your own windows",
      blocks: [
        {
          type: "idea",
          html: `<p>Every window type is two pieces of logic. <strong>Assignment</strong> puts each element into one or more windows. <strong>Merging</strong>, which is optional, combines windows as data arrives. Fixed and sliding windows need only assignment; sessions need both. In Beam, both are user code in a <code>WindowFn</code>, so you can define windows the built-ins do not cover.</p>`,
        },
        {
          type: "text",
          html: `<h3>Per-element window sizes</h3>
<p>Suppose a reporting product sells tiers: premium tenants get per-minute usage reports, standard tenants hourly ones. Instead of two pipelines, the assignment function reads the window size from each element (or from tenant configuration) and computes the window from it. One pipeline, different window sizes per key, and everything downstream (triggers, allowed lateness, sinks) is shared.</p>
<h3>Bounded sessions</h3>
<p>Plain sessions can grow forever. A bot that hits an endpoint every few seconds never leaves a 30-minute gap, so its session never closes, its state never gets cleaned up, and its "session length" is meaningless. A <strong>bounded session</strong> uses the normal proto-session assignment but a stricter merge: two windows merge only if the result would stay under a maximum length, such as three hours. Beyond that, a new session starts even without a gap.</p>`,
        },
        {
          type: "code",
          lang: "java",
          title: "Two custom WindowFns, sketched",
          code: `// Assignment only: window size chosen per element.
class PerTenantFixedWindows extends NonMergingWindowFn<Usage, IntervalWindow> {
  Collection<IntervalWindow> assignWindows(AssignContext c) {
    long size = c.element().tenantTier().windowMillis();     // 60_000 or 3_600_000
    long ts = c.timestamp().getMillis();
    long start = ts - Math.floorMod(ts, size);
    return List.of(new IntervalWindow(new Instant(start), new Instant(start + size)));
  }
}

// Assignment like Sessions, but merging refuses to exceed a maximum length.
class BoundedSessions extends WindowFn<Object, IntervalWindow> {
  void mergeWindows(MergeContext c) {
    // Sort windows by start; grow a run while the next window overlaps it
    // AND the merged span stays <= maxLength. Emit each run via c.merge(run, span).
  }
}`,
          caption: "Simplified sketches; a real WindowFn also defines a window coder and compatibility checks.",
        },
        {
          type: "tradeoffs",
          prosLabel: "Custom windows give you",
          consLabel: "They cost you",
          pros: [
            "Semantics matched to the business, such as tiers, bounded sessions or calendar quirks",
            "One pipeline instead of several near-copies",
            "Reuse of triggers, watermarks and late-data handling",
          ],
          cons: [
            "Window logic is now code you must test, including merge edge cases",
            "Merging windows imply retractions or overwrite-friendly sinks",
            "Not every engine exposes window assignment and merging as user code",
          ],
        },
      ],
    },
    {
      id: "unaligned-fixed-windows",
      title: "Unaligned fixed windows: smoothing the output burst",
      kicker: "Spreading load",
      blocks: [
        {
          type: "problem",
          html: `<p>Fixed windows are <strong>aligned</strong>: every key's 21:00 window ends at 22:00. When the watermark passes 22:00, every key's window fires at once. The pipeline and the sink go from idle to flat out and back, every hour, and you have to provision for the peak.</p>`,
        },
        {
          type: "idea",
          html: `<p>Shift each key's windows by a per-key <strong>phase offset</strong>, for example <code>hash(key) mod windowSize</code>. Every key still gets fixed windows of the same size, so per-key semantics do not change, but different keys' windows end at different moments, and the same total output is spread evenly over time.</p>`,
        },
        {
          type: "diagram",
          title: "Aligned versus per-key shifted windows",
          caption: "Four keys with two-minute windows. Aligned, all four close together, producing tall bursts of output. Shifted by a per-key offset, closings are staggered, and output arrives as a steady trickle of small bursts.",
          svg: `<svg viewBox="0 0 640 260" role="img" aria-label="Aligned windows close together causing output bursts; per-key shifted windows close at staggered times giving smooth output">
<text x="180" y="26" text-anchor="middle" font-size="13" font-weight="700">Aligned</text>
<text x="490" y="26" text-anchor="middle" font-size="13" font-weight="700">Unaligned (shifted per key)</text>
<text x="12" y="54" font-size="12">K1</text>
<text x="12" y="84" font-size="12">K2</text>
<text x="12" y="114" font-size="12">K3</text>
<text x="12" y="144" font-size="12">K4</text>
<rect x="40" y="41" width="140" height="18" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="180" y="41" width="140" height="18" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<rect x="40" y="71" width="140" height="18" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="180" y="71" width="140" height="18" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<rect x="40" y="101" width="140" height="18" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="180" y="101" width="140" height="18" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<rect x="40" y="131" width="140" height="18" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="180" y="131" width="140" height="18" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<rect x="350" y="41" width="140" height="18" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="490" y="41" width="140" height="18" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<rect x="350" y="71" width="35" height="18" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<rect x="385" y="71" width="140" height="18" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="525" y="71" width="105" height="18" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<rect x="350" y="101" width="70" height="18" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<rect x="420" y="101" width="140" height="18" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="560" y="101" width="70" height="18" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<rect x="350" y="131" width="105" height="18" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<rect x="455" y="131" width="140" height="18" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="595" y="131" width="35" height="18" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="12" y="214" font-size="12" style="fill: var(--dg-muted)">output</text>
<rect x="175" y="165" width="10" height="60" style="fill: var(--dg-bad)"/>
<rect x="315" y="165" width="10" height="60" style="fill: var(--dg-bad)"/>
<rect x="380" y="210" width="10" height="15" style="fill: var(--dg-ok)"/>
<rect x="415" y="210" width="10" height="15" style="fill: var(--dg-ok)"/>
<rect x="450" y="210" width="10" height="15" style="fill: var(--dg-ok)"/>
<rect x="485" y="210" width="10" height="15" style="fill: var(--dg-ok)"/>
<rect x="520" y="210" width="10" height="15" style="fill: var(--dg-ok)"/>
<rect x="555" y="210" width="10" height="15" style="fill: var(--dg-ok)"/>
<rect x="590" y="210" width="10" height="15" style="fill: var(--dg-ok)"/>
<rect x="625" y="210" width="10" height="15" style="fill: var(--dg-ok)"/>
<line x1="40" y1="225" x2="325" y2="225" stroke-width="1.5" style="stroke: var(--dg-ink)"/>
<line x1="350" y1="225" x2="635" y2="225" stroke-width="1.5" style="stroke: var(--dg-ink)"/>
<text x="40" y="243" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">0</text>
<text x="180" y="243" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">2 min</text>
<text x="320" y="243" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">4</text>
<text x="352" y="243" font-size="12" style="fill: var(--dg-muted)">0</text>
<text x="490" y="243" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">2 min</text>
<text x="630" y="243" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">4</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>A concrete version: with one-hour windows and a million keys, aligned windows produce a million results within seconds of each hour mark. With offsets spread uniformly over the hour, the same million results arrive at roughly 280 per second all hour long. Total work is identical; the peak drops by orders of magnitude.</p>
<p>The trade-off is that results for different keys are no longer comparable window-by-window. "Revenue for all stores between 21:00 and 22:00" cannot be read off unaligned per-store windows, because each store's window covers a different hour. Use unaligned windows when each key is consumed on its own (per-user alerts, per-device reports), and aligned windows when results are compared or summed across keys.</p>`,
        },
        {
          type: "lab",
          id: "unaligned",
          caption: "Twenty-four keys with two-minute fixed windows. Toggle between aligned and per-key shifted windows and compare the output histogram: same total, very different peak.",
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>Do not confuse per-key offsets with the single global offset many APIs offer. Beam's <code>FixedWindows.of(size).withOffset(...)</code> and Flink's tumbling assigners with an offset argument shift <em>every</em> key by the same amount, which is useful for time zones (daily windows starting at local midnight) but leaves the windows aligned across keys. Per-key phase shifting needs a custom window function.</p>`,
        },
        {
          type: "quiz",
          q: "A dashboard compares hourly revenue across 500 stores side by side. Should the pipeline use per-key unaligned windows to smooth sink load?",
          options: [
            "Yes, unaligned windows are always better",
            "No; each store's window would cover a different hour, so the side-by-side comparison would be meaningless",
            "Yes, because the total revenue is unchanged",
            "No, because unaligned windows cannot use watermarks",
          ],
          answer: 1,
          explain: "Unaligned windows keep per-key semantics but break cross-key alignment. A comparison across stores needs every store's window to cover the same interval. Smooth the sink load another way, for example by batching writes or rate-limiting the sink.",
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
          html: `<p>Advanced windowing shows up in designs about user engagement (sessions, watch time, ad attribution), multi-tenant analytics (per-tenant window sizes) and anything with a hot sink at window boundaries. The interviewer is checking whether you pick the window from the question being asked, and whether you know what each window costs.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>Points worth making:</p>
<ol>
<li><strong>Sessions</strong> for "visit" or "sitting" questions: per-key, data-driven, built from proto-sessions [t, t + gap) that merge.</li>
<li><strong>Merging means retractions</strong>: a late record can join two sessions, so downstream must replace, not add. Prefer sinks keyed so merged sessions overwrite, or emit final panes only.</li>
<li><strong>Bound sessions</strong> to defend against bots and unbounded state.</li>
<li><strong>Unaligned windows</strong> to flatten output bursts when keys are consumed independently; aligned windows when results are compared across keys.</li>
<li><strong>Processing-time windows</strong> only for monitoring the system itself; if you need them, ingress time gives real windows with a perfect watermark.</li>
</ol>`,
        },
        {
          type: "quiz",
          q: "You are designing watch-time analytics. A small number of automated clients send heartbeats every 10 seconds for weeks. What windowing choice prevents them from causing trouble?",
          options: [
            "Fixed one-minute windows",
            "Bounded sessions: sessions with a gap, whose merge step refuses to exceed a maximum length",
            "Sessions with a longer gap",
            "Processing-time windows",
          ],
          answer: 1,
          explain: "Plain sessions never close for a client that is never idle, so state grows and the session length is meaningless. A longer gap makes it worse. Bounded sessions cap the length during merging, so state is released and results stay meaningful, while ordinary users still get proper sessions.",
        },
      ],
    },
  ],
  takeaways: [
    "Processing-time windows are right for monitoring the system as observed. Build them with a global window plus a repeating processing-time trigger in discarding mode, or by using ingress time as event time, which gives a perfect watermark.",
    "Only event-time windows give the same answer regardless of arrival order.",
    "Sessions are data-driven, unaligned windows ended by a gap of inactivity; they suit visit and engagement questions.",
    "Sessions are built from proto-sessions [t, t + gap) that merge when they overlap. A late record can bridge two sessions, so already-emitted sessions must be retracted or overwritten.",
    "A custom window is assignment plus optional merging. That enables per-element window sizes and bounded sessions that defend against never-ending activity.",
    "Aligned windows close together and cause output bursts; per-key phase offsets spread the same work evenly, at the cost of cross-key comparability.",
  ],
  furtherReading: [
    { title: "The Dataflow Model (Akidau et al., VLDB 2015)", url: "https://www.vldb.org/pvldb/vol8/p1792-Akidau.pdf", note: "Describes windowing as assignment plus merging and works through session windows." },
    { title: "Apache Beam programming guide: windowing", url: "https://beam.apache.org/documentation/programming-guide/", note: "Fixed, sliding, session and global windows, and how WindowFns are applied." },
    { title: "Apache Flink documentation: windows", note: "Window assigners including sessions with dynamic gaps, and how merging windows interact with triggers." },
  ],
};
