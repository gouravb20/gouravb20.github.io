// Deep dive: Chapter 3, Watermarks. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch3 = {
  hook: `<p>A food-delivery company counts orders per city in five-minute windows, reading from a Kafka topic with twelve partitions. At 18:06 the worker reading partition 7 hits a malformed record and starts retrying it in a loop. Throughput drops by about a twelfth, which is lost in the noise of the dinner rush. Nobody notices.</p>
<p>What happens next depends on how the pipeline decides that a window is done. If it simply closes each window on a timer, the 18:05 window for every city served by partition 7 is published short by however many orders sit behind the bad record, and nothing ever flags it. If it tracks a <strong>watermark</strong>, partition 7's stuck record holds the watermark at 18:06, the 18:05 windows refuse to close, and an alert on watermark age fires within minutes. Same bug, but the second pipeline is <em>visibly</em> late instead of <em>silently</em> wrong. This chapter is about how that watermark is built, how it flows through a pipeline, and how real systems implement it.</p>`,
  sections: [
    {
      id: "definition",
      title: "What a watermark measures",
      kicker: "Definition",
      blocks: [
        {
          type: "problem",
          html: `<p>A stage holding an event-time window must eventually decide that no more data for it is coming. The obvious signals fail. Processing time ignores delays, so "close the window five minutes after it ends" mis-assigns anything slower than five minutes. Processing <em>rate</em> says nothing about completeness at all: one stuck message barely changes the rate, yet it can make a window's answer wrong.</p>`,
        },
        {
          type: "idea",
          html: `<p>A watermark is the <strong>monotonically increasing timestamp of the oldest work not yet completed</strong>. Picture every message currently in flight in the pipeline, and plot their event times. The watermark is the left edge of that distribution: the earliest event time that is still being worked on.</p>`,
        },
        {
          type: "diagram",
          title: "The watermark is the left edge of in-flight work",
          caption: "Event times of completed messages (blue) and messages still in flight (orange). One message from about 18:02 is stuck, so the watermark sits at its timestamp. Without it, the watermark would already be at 18:04.",
          svg: `<svg viewBox="0 0 600 285" role="img" aria-label="Histogram of message event times, completed and in flight, with the watermark at the oldest in-flight message">
<rect x="65" y="150" width="40" height="80" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="115" y="120" width="40" height="110" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="165" y="110" width="40" height="120" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="165" y="100" width="40" height="10" style="fill: var(--dg-bad); stroke: var(--dg-bad)"/>
<rect x="215" y="130" width="40" height="100" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="265" y="190" width="40" height="40" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="265" y="140" width="40" height="50" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<rect x="315" y="120" width="40" height="110" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<rect x="365" y="100" width="40" height="130" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<rect x="415" y="130" width="40" height="100" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<rect x="465" y="160" width="40" height="70" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<rect x="515" y="200" width="40" height="30" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<line x1="165" y1="46" x2="165" y2="230" stroke-width="3" style="stroke: var(--dg-ok)"/>
<text x="171" y="56" font-size="12" font-weight="700" style="fill: var(--dg-ok)">watermark</text>
<text x="171" y="72" font-size="12" style="fill: var(--dg-muted)">held back by one stuck message</text>
<line x1="265" y1="86" x2="265" y2="230" stroke-width="2" stroke-dasharray="5 4" style="stroke: var(--dg-ok)"/>
<text x="271" y="98" font-size="12" style="fill: var(--dg-muted)">without it</text>
<rect x="440" y="30" width="14" height="14" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="460" y="42" font-size="12">completed</text>
<rect x="440" y="52" width="14" height="14" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<text x="460" y="64" font-size="12">in flight</text>
<rect x="440" y="74" width="14" height="14" style="fill: var(--dg-bad); stroke: var(--dg-bad)"/>
<text x="460" y="86" font-size="12">stuck</text>
<line x1="60" y1="230" x2="565" y2="230" stroke-width="1.5" style="stroke: var(--dg-ink)"/>
<text x="65" y="248" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">18:00</text>
<text x="165" y="248" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">18:02</text>
<text x="265" y="248" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">18:04</text>
<text x="365" y="248" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">18:06</text>
<text x="465" y="248" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">18:08</text>
<text x="565" y="248" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">18:10</text>
<text x="310" y="274" text-anchor="middle" font-size="12">Event time of each message</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>That definition buys two properties, and both matter in production.</p>
<ul>
<li><strong>Completeness.</strong> Once the watermark passes time T, the pipeline believes no more data with event time before T will arrive. A window ending at or before T can be closed and its final answer emitted.</li>
<li><strong>Visibility.</strong> If a message is stuck anywhere (a poison record, a hung worker, an overloaded key), the watermark cannot move past it. The stall shows up as a watermark that stops advancing, which you can alert on and trace back to the stage holding it.</li>
</ul>
<p>"Monotonically increasing" means the watermark never moves backward. Once a stage has told everyone downstream "18:04 is complete", taking that back would invalidate results they have already emitted.</p>`,
        },
        {
          type: "lab",
          id: "wmDistribution",
          caption: "Messages enter with random delays and complete at random. Watch the watermark track the left edge of the in-flight distribution, inject a stuck message to see it freeze, then lower the percentile to see the trade-off between completeness and latency.",
        },
        {
          type: "quiz",
          q: "A pipeline's throughput is steady at 50,000 messages per second, but its watermark has not moved for 20 minutes. What is the most likely explanation?",
          options: [
            "Nothing is wrong; throughput is healthy",
            "At least one message (or partition) is stuck, holding the oldest unfinished work in place",
            "The watermark only advances once per hour",
            "The input has stopped arriving",
          ],
          answer: 1,
          explain: "Rate and completeness are independent. The watermark is the oldest unfinished work, so one stuck message freezes it while everything else flows normally. That is the visibility property doing its job.",
        },
      ],
    },
    {
      id: "creating-watermarks",
      title: "Creating watermarks at the source",
      kicker: "Perfect and heuristic",
      blocks: [
        {
          type: "text",
          html: `<p>Watermarks are born at the sources, where data enters the pipeline. How good they can be depends entirely on what the source knows about its own data.</p>
<h3>Perfect watermarks</h3>
<p>A perfect watermark is possible when the source has complete knowledge of the event times still to come. Two common cases:</p>
<ul>
<li><strong>Ingress timestamping.</strong> Stamp each record with the time it enters the pipeline and call that its event time. The watermark is simply the current time at the source. It is perfect because you defined event time to make it so; really you are doing processing-time analysis (Chapter 4 uses exactly this trick).</li>
<li><strong>A static set of time-ordered logs.</strong> Suppose a topic has a fixed set of partitions and, within each partition, event times only increase (for example, each partition is appended by one producer in timestamp order). The watermark is the minimum, across partitions, of the next unread event time. If partitions 0, 1 and 2 are next going to deliver 18:04:10, 18:03:55 and 18:05:02, nothing earlier than 18:03:55 can ever appear, so that is the watermark.</li>
</ul>
<h3>Heuristic watermarks</h3>
<p>Most sources do not offer that knowledge. Partitions come and go, events within a partition are out of order, or the source (such as Google Cloud Pub/Sub) makes no ordering promises at all. The source then estimates: from partition progress, observed lateness, the growth rate of files, network topology, or history. A good heuristic is right almost all the time; when it is wrong, the records it missed become <strong>late data</strong>, which is why heuristic watermarks always travel with late firings and allowed lateness (Chapter 2).</p>`,
        },
        {
          type: "code",
          lang: "java",
          title: "A heuristic watermark in Flink",
          code: `WatermarkStrategy<Order> strategy = WatermarkStrategy
    .<Order>forBoundedOutOfOrderness(Duration.ofSeconds(30)) // assume at most 30 s of disorder
    .withTimestampAssigner((order, ts) -> order.createdAtMillis())
    .withIdleness(Duration.ofMinutes(1));  // a silent partition stops holding the watermark back

DataStream<Order> orders = env.fromSource(kafkaSource, strategy, "orders");`,
          caption: "Bounded out-of-orderness sets the watermark to the largest timestamp seen minus 30 seconds. Anything more than 30 seconds out of order becomes late.",
        },
        {
          type: "compare",
          items: [
            { title: "Perfect watermark", tone: "ok", html: "<p>No late data ever, so semantics are simple. Requires real knowledge of the input. Can be slow: one straggler holds back every window behind it.</p>" },
            { title: "Heuristic watermark", tone: "warn", html: "<p>Works with any source and advances promptly. Can be wrong in both directions: too fast creates late data, too slow adds latency. Must be paired with a late-data policy.</p>" },
          ],
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p>Even the "perfect" time-ordered-logs case has a weak spot: an <strong>idle partition</strong>. If partition 1 simply stops receiving data, there is no "next event time" to read, and the minimum cannot advance. Systems either wait (correct but stalled) or declare the partition idle after a timeout, which turns the watermark back into a heuristic.</p>`,
        },
        {
          type: "quiz",
          q: "A topic has three partitions, each with strictly increasing event times. The next unread records are at 09:15:20, 09:14:05 and 09:16:40. What can the watermark safely be?",
          options: ["09:16:40", "09:15:20", "09:14:05", "The average, 09:15:22"],
          answer: 2,
          explain: "Each partition is in order, so the earliest event still to come is the smallest of the three next timestamps. Any later value would risk declaring 09:14:05 complete before its record is read.",
        },
      ],
    },
    {
      id: "propagation",
      title: "How watermarks flow through a pipeline",
      kicker: "Propagation",
      blocks: [
        {
          type: "text",
          html: `<p>A real pipeline is a graph of stages: parse, join, window, aggregate, write. Each stage needs to know how complete <em>its</em> input is, and each stage can add delay of its own by buffering data. So every stage tracks two watermarks.</p>
<ul>
<li>The <strong>input watermark</strong> is the minimum of the output watermarks of all the stages feeding it. A stage cannot be more complete than its slowest upstream.</li>
<li>The <strong>output watermark</strong> is the minimum of the stage's input watermark and the event times of all <strong>non-late data it is still holding</strong>: records in window state, pending timers, records waiting for a join partner, output not yet sent.</li>
</ul>
<p>The difference between the two, <strong>input watermark minus output watermark</strong>, is the event-time delay that stage adds. Plot it per stage and you can see exactly where in the graph lag accumulates.</p>`,
        },
        {
          type: "diagram",
          title: "Input and output watermarks of one stage",
          caption: "The join stage's input watermark is the slower of its two sources. It is still holding a record from 18:03:20, so its output watermark cannot pass that. The next stage inherits 18:03:20, and the join stage adds 35 seconds of event-time delay.",
          svg: `<svg viewBox="0 0 620 225" role="img" aria-label="Two sources feed a join stage whose output watermark is the minimum of its input watermark and its oldest buffered record">
<defs><marker id="ss3-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="10" y="30" width="130" height="50" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="75" y="51" text-anchor="middle" font-size="12" font-weight="700">Source P1</text>
<text x="75" y="69" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">out 18:04:10</text>
<rect x="10" y="130" width="130" height="50" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="75" y="151" text-anchor="middle" font-size="12" font-weight="700">Source P2</text>
<text x="75" y="169" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">out 18:03:55</text>
<rect x="205" y="60" width="215" height="92" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="312" y="82" text-anchor="middle" font-size="12" font-weight="700">Join stage</text>
<text x="312" y="100" text-anchor="middle" font-size="12">in = min(inputs) = 18:03:55</text>
<text x="312" y="118" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">holding a record at 18:03:20</text>
<text x="312" y="138" text-anchor="middle" font-size="12" font-weight="700">out = 18:03:20</text>
<rect x="490" y="80" width="120" height="50" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="550" y="101" text-anchor="middle" font-size="12" font-weight="700">Next stage</text>
<text x="550" y="119" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">in 18:03:20</text>
<line x1="140" y1="58" x2="203" y2="88" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ss3-arrow)"/>
<line x1="140" y1="152" x2="203" y2="124" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ss3-arrow)"/>
<line x1="420" y1="105" x2="488" y2="105" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ss3-arrow)"/>
<text x="312" y="205" text-anchor="middle" font-size="12">Stage delay = in &#8722; out = 18:03:55 &#8722; 18:03:20 = 35 s</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>Propagation explains a frustrating production pattern: one slow stage, or one slow partition feeding it, holds back <strong>everything downstream</strong>, because every later input watermark is a minimum that includes it. It also explains why per-stage watermark lag is one of the most useful dashboards a streaming team can have. When the end-to-end watermark falls behind, the stage with the largest input-minus-output gap is where to look first.</p>`,
        },
        {
          type: "keypoints",
          items: [
            "Input watermark = min over upstream output watermarks.",
            "Output watermark = min(input watermark, event times of buffered non-late data).",
            "Stage delay = input &minus; output; a slow stage delays every stage after it.",
          ],
        },
      ],
    },
    {
      id: "output-timestamps",
      title: "Choosing timestamps for grouped results",
      kicker: "Output timestamps",
      blocks: [
        {
          type: "problem",
          html: `<p>When a windowed sum emits its result, that result is itself a record and needs an event time, because the next stage may window it again. Whatever timestamp you choose, the stage must hold its output watermark at or before that timestamp until the result is sent; otherwise the result would arrive downstream as late data.</p>`,
        },
        {
          type: "text",
          html: `<p>Take a one-minute window [18:03, 18:04) holding records stamped 18:03:02 and 18:03:40. There are three reasonable choices for the result's timestamp:</p>
<ul>
<li><strong>End of the window</strong> (just before 18:04:00). The hold sits at the window's end, which is at or ahead of the input watermark while the window is open, so in practice the hold costs nothing and the output watermark tracks the input watermark.</li>
<li><strong>Earliest element</strong> (18:03:02). The most conservative choice. The stage must hold its output watermark at 18:03:02 until the window fires, so downstream stages are held back by nearly a whole window.</li>
<li><strong>Latest element</strong> (18:03:40). Holds less, but the timestamp of a result can jump around as records arrive, which is rarely what anyone wants.</li>
</ul>
<p>Choosing earliest does not just add delay; it changes meaning downstream. A two-minute window in the next stage assigns the result by its timestamp, so the policy you pick decides which downstream window it lands in.</p>`,
        },
        {
          type: "lab",
          id: "wmPropagation",
          caption: "Stage 1 sums per one-minute window and Stage 2 sums Stage 1's results per two-minute window. Switch between the end-of-window and earliest-element policies and watch how far Stage 1's output watermark, and with it Stage 2, falls behind.",
        },
        {
          type: "text",
          html: `<h3>The overlapping-window trap</h3>
<p>Sliding windows make the earliest policy much worse. With two-minute windows every minute, a record at 18:00:10 belongs to both [17:59, 18:01) and [18:00, 18:02). Under the earliest policy, the later window's result is stamped 18:00:10, so the stage holds its watermark at 18:00:10 until that window closes at 18:02. By then the next window, [18:01, 18:03), is holding at its own earliest record. Each window's hold overlaps the next one, so the downstream watermark lags by a full window length instead of by the slide period. End-of-window timestamps avoid this, which is why they are the natural default for overlapping windows.</p>`,
        },
        {
          type: "code",
          lang: "java",
          title: "Choosing the output timestamp in Beam",
          code: `scores.apply(Window.<KV<String, Integer>>into(FixedWindows.of(Duration.standardMinutes(1)))
                    .withTimestampCombiner(TimestampCombiner.END_OF_WINDOW)) // or EARLIEST, LATEST
      .apply(Sum.integersPerKey());`,
        },
        {
          type: "table",
          title: "Output timestamp policies",
          headers: ["Policy", "Watermark delay", "Notes"],
          rows: [
            ["End of window", "Minimal", "The safe choice for overlapping windows"],
            ["Earliest element", "Up to a full window", "Most conservative; changes downstream window assignment"],
            ["Latest element", "Low", "Rare; the timestamp shifts as data arrives"],
          ],
        },
        {
          type: "quiz",
          q: "Stage 1 computes one-minute sums and stamps each result with its earliest input. Stage 2 windows those results into two-minute windows. What is the main effect compared with end-of-window timestamps?",
          options: [
            "Stage 2 produces the same results sooner",
            "Stage 2's input watermark lags further behind, delaying its output, and results may land in different Stage 2 windows",
            "Stage 1 starts dropping late data",
            "No effect, because timestamps only matter at the source",
          ],
          answer: 1,
          explain: "Stage 1 must hold its output watermark at the earliest buffered timestamp until each window fires, so Stage 2's input watermark trails by up to a window. The timestamps also decide which Stage 2 window each result belongs to.",
        },
      ],
    },
    {
      id: "percentile-and-processing-time",
      title: "Percentile and processing-time watermarks",
      kicker: "Variations",
      blocks: [
        {
          type: "text",
          html: `<h3>Percentile watermarks</h3>
<p>The standard watermark is the 100th percentile of in-flight work: the single oldest message. One straggler controls it. A <strong>percentile watermark</strong> instead uses the event time at, say, the 99th percentile of the in-flight distribution. Suppose 1,000 messages are in flight: 990 of them are after 18:04:30, and ten stragglers are spread back to 18:01:10. The 100th-percentile watermark is 18:01:10; the 99th-percentile watermark is about 18:04:30. Windows ending before 18:04:30 can close more than three minutes sooner, at the cost of treating those ten records as late.</p>
<p>This is a trade you can quantify. Instead of a heuristic that is "occasionally wrong" in ways no one can measure, you choose the fraction of data you are willing to handle through late firings in exchange for lower latency.</p>
<h3>Processing-time watermarks</h3>
<p>The same "oldest unfinished work" idea can be measured on the processing-time axis: the <strong>time at which the oldest pending operation was enqueued</strong>. An event-time watermark one hour behind is ambiguous on its own. It might mean the pipeline is stuck, or it might mean the pipeline is healthily chewing through a backlog of yesterday's data. The processing-time watermark separates the two.</p>`,
        },
        {
          type: "table",
          title: "Diagnosing a lagging event-time watermark",
          headers: ["Event-time watermark", "Processing-time watermark", "Diagnosis"],
          rows: [
            ["An hour behind", "A few seconds behind", "<strong>Data delay</strong>: old data flowing through a healthy pipeline (a backfill or a replay)"],
            ["An hour behind", "Also far behind", "<strong>System delay</strong>: work is stuck (hot key, poison record, crash loop)"],
            ["Current", "Current", "Healthy"],
          ],
        },
        {
          type: "lab",
          id: "ptWatermark",
          caption: "Compare a pipeline that is stuck with one processing an old backlog. Both show an event-time watermark an hour behind; only the processing-time watermark tells them apart.",
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>Processing-time watermarks are not only a debugging aid. Chapter 5 uses one to decide when deduplication records can be safely deleted: once no in-flight operation is older than T, nothing sent before T can still be retried.</p>`,
        },
        {
          type: "quiz",
          q: "After a 6-hour outage, a pipeline is replaying the backlog. Its event-time watermark is 5 hours behind, and its processing-time watermark is 3 seconds behind. Should the on-call engineer intervene?",
          options: [
            "Yes, the pipeline is stuck",
            "No, it is a data delay: the system is healthy and working through old data",
            "Yes, the watermark must be reset to the current time",
            "It cannot be determined without the processing rate",
          ],
          answer: 1,
          explain: "A fresh processing-time watermark means no operation has been waiting long, so the system is moving. The event-time watermark is behind only because the data being processed is old.",
        },
      ],
    },
    {
      id: "implementations",
      title: "How Dataflow, Flink and others implement watermarks",
      kicker: "Real systems",
      blocks: [
        {
          type: "text",
          html: `<p>The definition is the same everywhere; the plumbing differs, and the differences show up in latency and in failure behaviour.</p>
<p><strong>Google Cloud Dataflow</strong> computes watermarks centrally. Each worker owns ranges of keys and reports the watermark of each range it owns to a <strong>centralized watermark aggregator</strong>, which takes the minimum. Because key ranges move between workers, the aggregator checks that each update comes from the current owner of the range (ownership is managed with leases), so a worker that lost a range cannot advance its watermark by mistake. Central aggregation is easy to reason about, at the cost of an extra hop.</p>
<p><strong>Apache Flink</strong> propagates watermarks <strong>in band</strong>. Sources insert special watermark records into the data stream. Each operator tracks the latest watermark from each input channel, and when the minimum across channels advances, it forwards a new watermark downstream. There is no central component and no extra hop; the cost is that an input that stops sending anything also stops sending watermarks, so idle inputs must be detected and excluded (the <code>withIdleness</code> setting shown earlier).</p>
<p><strong>Pub/Sub sources in Dataflow</strong> show how much effort a heuristic can take. Pub/Sub gives no ordering guarantee, so Dataflow reads with two subscriptions: a base subscription that feeds the pipeline, and a tracking subscription that reads ahead only to observe the event times in the backlog. The watermark is derived from the oldest unacknowledged event time together with the tracking subscription's view of what is coming, with special handling for when the backlog is caught up or the topic goes quiet.</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "Centralized (Dataflow)", tone: "info", html: "<p>Workers report per-key-range watermarks to an aggregator that computes the minimum and validates ownership. Simple to reason about and audit; adds a hop and a central service.</p>" },
            { title: "In-band (Flink)", tone: "info", html: "<p>Watermark records flow with the data; each operator forwards the minimum of its inputs. Lower latency and no central point; idle inputs need explicit handling.</p>" },
          ],
        },
        {
          type: "realworld",
          items: [
            { org: "Spark Structured Streaming", title: "A global watermark per query", html: "Each <code>withWatermark</code> call defines a watermark as the largest event time seen minus a delay. When a query has several inputs, Spark combines them into one global watermark, using the minimum by default (configurable with <code>spark.sql.streaming.multipleWatermarkPolicy</code>)." },
            { org: "Kafka Streams", title: "Stream time instead of watermarks", html: "Kafka Streams does not propagate watermarks between stages. Each task tracks <em>stream time</em>, the largest record timestamp it has seen, and windows close when stream time passes the window end plus the grace period." },
            { org: "MillWheel", title: "Where the idea was formalized", html: "Google's MillWheel paper (VLDB 2013) described a <em>low watermark</em> computed per stage from the oldest pending work, the ancestor of the watermarks in Dataflow and Beam." },
          ],
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
          html: `<p>Watermarks come up as soon as you say "event-time windows". The follow-up is almost always "how do you know when a window is done?" and then "what about late data?" and, for senior roles, "how would you know if the pipeline is stuck?"</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>A crisp answer covers:</p>
<ol>
<li><strong>Definition</strong>: the watermark is the oldest unfinished event time; once it passes a window's end, the window can close.</li>
<li><strong>Source</strong>: perfect if the source is ordered per partition (minimum over partitions), otherwise heuristic, such as bounded out-of-orderness, so late data is possible.</li>
<li><strong>Late data policy</strong>: late firings and an allowed lateness, or a side output for records past it.</li>
<li><strong>Propagation</strong>: each stage's input is the min of its upstreams, so one slow partition or stage delays everything after it; handle idle partitions.</li>
<li><strong>Operations</strong>: alert on watermark age per stage, and use a processing-time watermark to separate system delay from data delay.</li>
</ol>`,
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>"We'll close each window 30 seconds after it ends by the wall clock." That is a processing-time timeout, not a watermark. It drops data whenever the pipeline falls behind (a backlog makes every window look late) and it gives no signal when a partition stalls.</p>`,
        },
        {
          type: "quiz",
          q: "A Flink job reads 12 Kafka partitions. Overnight, one partition receives no data at all, and every event-time window stops emitting. What is the cause and the fix?",
          options: [
            "The job lost its checkpoint; restore from a savepoint",
            "The idle partition stopped advancing its watermark, holding back the minimum; configure idleness detection (withIdleness)",
            "Event-time windows do not work at night; switch to processing time",
            "Too many partitions; reduce to one",
          ],
          answer: 1,
          explain: "Watermarks are minimums across inputs. A partition that sends nothing also sends no watermark progress, so the minimum stays put. Marking inputs idle after a timeout lets the others drive the watermark, at the risk that the idle partition's next records arrive late.",
        },
      ],
    },
  ],
  takeaways: [
    "A watermark is the monotonically increasing event time of the oldest work not yet completed: the left edge of the in-flight distribution.",
    "It gives <strong>completeness</strong> (windows before it can close) and <strong>visibility</strong> (stuck work freezes it, so stalls are observable). Processing time and throughput give neither.",
    "Perfect watermarks need real knowledge of the input, such as ordered partitions; most sources need heuristics, so late data must be handled.",
    "Each stage's input watermark is the min of its upstream outputs; its output watermark is the min of its input and its buffered data. Input minus output is the stage's delay.",
    "Output timestamps create watermark holds: end of window is cheap and safe for overlapping windows; earliest element delays downstream by up to a window.",
    "Percentile watermarks trade a known fraction of late data for latency; processing-time watermarks distinguish a stuck system from old data.",
    "Dataflow aggregates watermarks centrally with ownership checks; Flink sends them in band with the data and must handle idle inputs.",
  ],
  furtherReading: [
    { title: "MillWheel: Fault-Tolerant Stream Processing at Internet Scale (Akidau et al., VLDB 2013)", note: "Introduces low watermarks computed from pending work, along with exactly-once state." },
    { title: "The Dataflow Model (Akidau et al., VLDB 2015)", url: "https://www.vldb.org/pvldb/vol8/p1792-Akidau.pdf", note: "How watermarks interact with windowing and triggers." },
    { title: "Apache Flink documentation: timely stream processing and generating watermarks", note: "Watermark strategies, in-band propagation and idleness." },
  ],
};
