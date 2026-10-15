// Deep dive: Chapter 1, Scoping Top K. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch1 = {
  hook: `<p>A product manager files a one-line ticket: "Add a shelf of the most viewed videos." One engineer ships a query over all-time view counts, and the shelf shows the same decade-old music videos forever. Another builds a "last hour" list that is recomputed on every page load, and the database falls over at lunchtime. Both of them did exactly what the ticket said.</p>
<p>The ticket hides at least six decisions: most viewed <em>over what period</em>, counted <em>how precisely</em>, updated <em>how often</em>, returning <em>how many</em> videos, answered <em>how fast</em>, at <em>what scale</em>. In this problem those answers move the architecture more than usual, so the first few minutes of the interview go into turning vague words into numbers. This chapter does that, and every later chapter builds on the numbers we settle here.</p>`,
  sections: [
    {
      id: "what-is-being-asked",
      title: "What \"most viewed\" is really asking for",
      kicker: "The problem",
      blocks: [
        {
          type: "problem",
          html: `<p>"Return the most viewed videos" reads like a single <code>ORDER BY</code>. But the phrase leaves the time period, the precision, the freshness and the result size open, and each one changes what you must store and when you must compute. If you start drawing boxes before pinning them down, you will design for a problem the interviewer did not ask.</p>`,
        },
        {
          type: "idea",
          html: `<p>A <strong>top-K query</strong> has three parts: the <em>items</em> (videos), the <em>score</em> (view count) and the <em>scope</em> (a time window). The answer is tiny, at most K rows, and there are only a handful of scopes. The hard part is never returning the answer; it is keeping the scores correct for billions of items over windows that keep moving.</p>`,
        },
        {
          type: "text",
          html: `<p>That observation is worth saying out loud early, because it sets up the whole design. If there are four windows and K is capped, there are only four answers in the entire system at any moment. Each one can be computed ahead of time and handed out to every reader. All the real engineering goes into the other direction: absorbing a firehose of view events and maintaining counts that are fit to rank.</p>
<p>The second scoping move is to decide where our system begins. Deciding whether a playback counts as a view (watch time, bot filtering, replays) is a hard problem of its own, owned by another team. Assume it is solved and that every counted view is published as an event, carrying at least a video ID and an event time, to a durable log such as a Kafka topic. Our system <em>consumes</em> that log instead of exposing a "record a view" API.</p>
<p>Consuming a log is not just a shortcut. A log keeps events for a configurable retention period, and each consumer tracks its own position (offset) in it. If a consumer crashes, it resumes from its last committed offset. If a bug corrupts the counts, you can fix the code, rewind the offset and recompute. That replay property comes up again in Chapters 3 and 4.</p>`,
        },
        {
          type: "diagram",
          title: "Where our system starts and stops",
          caption: "Upstream, the playback service decides what counts as a view and publishes it to a Kafka topic. We design the box in the middle: it consumes the stream, keeps counts per window and serves a small, precomputed answer through one read API.",
          svg: `<svg viewBox="0 0 640 210" role="img" aria-label="System context: playback service publishes view events to Kafka; the top-K system consumes them and serves a read API">
<defs><marker id="pb1-ctx-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<text x="145" y="45" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">upstream (given)</text>
<text x="395" y="45" text-anchor="middle" font-size="12" font-weight="700">what we design</text>
<text x="570" y="45" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">clients read</text>
<rect x="10" y="85" width="120" height="50" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="70" y="106" text-anchor="middle" font-size="13" font-weight="700">Playback</text>
<text x="70" y="123" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">decides a view</text>
<rect x="160" y="85" width="120" height="50" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<text x="220" y="106" text-anchor="middle" font-size="13" font-weight="700">Kafka topic</text>
<text x="220" y="123" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">view-events</text>
<rect x="310" y="60" width="170" height="100" rx="10" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2" stroke-dasharray="6 4"/>
<text x="395" y="100" text-anchor="middle" font-size="13" font-weight="700">Top-K system</text>
<text x="395" y="118" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">count and rank</text>
<text x="395" y="134" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">per time window</text>
<rect x="510" y="85" width="120" height="50" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="1.5"/>
<text x="570" y="106" text-anchor="middle" font-size="13" font-weight="700">Read API</text>
<text x="570" y="123" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">K ≤ 1,000</text>
<line x1="130" y1="110" x2="158" y2="110" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#pb1-ctx-arrow)"/>
<line x1="280" y1="110" x2="308" y2="110" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#pb1-ctx-arrow)"/>
<line x1="480" y1="110" x2="508" y2="110" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#pb1-ctx-arrow)"/>
<text x="220" y="185" text-anchor="middle" font-size="12">~800K views/s</text>
<text x="395" y="185" text-anchor="middle" font-size="12">4 windows</text>
<text x="570" y="185" text-anchor="middle" font-size="12">tens of ms</text>
</svg>`,
        },
        {
          type: "code",
          title: "The one read endpoint",
          lang: "http",
          code: `GET /v1/top-videos?window=hour|day|month|all&k=100

200 OK
{ "window": "day",
  "asOf":   "2026-10-13T10:00:00Z",
  "videos": [ { "videoId": "v_8f2c", "views": 48213377 }, ... ] }`,
          caption: "The asOf field tells the client which window the answer describes, which matters once windows are precomputed and slightly behind real time.",
        },
        {
          type: "keypoints",
          items: [
            "A top-K query is items, a score and a scope. The answer is at most K rows; the scope is what makes it hard.",
            "Assume view events already arrive in a durable log; consuming it gives you replay for free.",
            "Few distinct questions with tiny answers means the read side can be precomputed. The write side is where the design effort goes.",
          ],
        },
      ],
    },
    {
      id: "tumbling-vs-sliding",
      title: "Tumbling and sliding windows",
      kicker: "Choosing the scope",
      blocks: [
        {
          type: "problem",
          html: `<p>It is 10:06. A user opens "most viewed in the last hour". Should that mean 09:00 to 10:00, the last complete clock hour, or 09:06 to 10:06, the sixty minutes that just ended? Both are defensible, and they lead to very different amounts of state and work.</p>`,
        },
        {
          type: "text",
          html: `<p>A <strong>tumbling window</strong> is a fixed-size, non-overlapping interval aligned to clock boundaries: 09:00-10:00, 10:00-11:00, and so on. Every view belongs to exactly one window, so a window is just a running total per video that stops changing once the window closes. The answer for "last hour" only changes once an hour, when the next window completes.</p>
<p>A <strong>sliding window</strong> is a trailing interval that ends now. In practice it advances in small steps, say every minute: at 10:06 it covers 09:06-10:06, at 10:07 it covers 09:07-10:07. It is fresher and closer to what users mean by "trending right now". The cost is that every view must be <em>added</em> when it arrives and <em>removed</em> when it ages out sixty minutes later, so the system has to remember when views happened, not just how many there were.</p>`,
        },
        {
          type: "diagram",
          title: "What \"last hour\" means at 10:06",
          caption: "Tumbling serves the last complete clock hour and ignores the six minutes since 10:00 until that window closes. Sliding covers the trailing sixty minutes and moves every minute.",
          svg: `<svg viewBox="0 0 640 210" role="img" aria-label="Timeline comparing a tumbling last hour from 09:00 to 10:00 with a sliding last hour from 09:06 to 10:06">
<text x="60" y="40" font-size="13" font-weight="700">Tumbling "last hour"</text>
<rect x="60" y="50" width="216" height="30" rx="4" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="168" y="70" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">08:00-09:00</text>
<rect x="276" y="50" width="216" height="30" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="384" y="70" text-anchor="middle" font-size="12" font-weight="700">09:00-10:00 (complete)</text>
<rect x="492" y="50" width="108" height="30" rx="4" style="fill: none; stroke: var(--dg-line)" stroke-width="1.5" stroke-dasharray="5 4"/>
<text x="556" y="70" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">still open</text>
<text x="60" y="110" font-size="13" font-weight="700">Sliding "last hour"</text>
<text x="178" y="140" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">moves every minute</text>
<rect x="297.6" y="120" width="216" height="30" rx="4" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="405.6" y="140" text-anchor="middle" font-size="12" font-weight="700">09:06-10:06</text>
<line x1="60" y1="175" x2="600" y2="175" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<line x1="60" y1="170" x2="60" y2="180" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<line x1="276" y1="170" x2="276" y2="180" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<line x1="492" y1="170" x2="492" y2="180" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<text x="60" y="196" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">08:00</text>
<text x="276" y="196" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">09:00</text>
<text x="492" y="196" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">10:00</text>
<line x1="513.6" y1="28" x2="513.6" y2="180" stroke-width="2" stroke-dasharray="4 3" style="stroke: var(--dg-bad)"/>
<text x="513.6" y="20" text-anchor="middle" font-size="12" font-weight="700">now 10:06</text>
</svg>`,
        },
        {
          type: "compare",
          items: [
            { title: "Tumbling", tone: "ok", html: "Each view lands in one window. State is one running total per video per window, final once the window closes. The answer changes once per window. Ideal for daily and monthly charts." },
            { title: "Sliding", tone: "warn", html: "Each view counts in many overlapping windows and must later be subtracted. State must remember recent history (for example, per-minute counts). The answer changes every step. Ideal for \"trending now\"." },
          ],
        },
        {
          type: "text",
          html: `<h3>Which windows, and which to propose first</h3>
<p>Propose four scopes: the last hour, day and month, plus all time. All time is a degenerate window that never closes and never subtracts, so it is the easiest of the four. That gives four sets of counters to maintain, which is a number you will multiply by later.</p>
<p>Propose <strong>tumbling first</strong>. It is simpler to aggregate and precompute, it gets a complete design on the board quickly, and it leaves sliding windows as a deliberate deep dive (Chapter 4) instead of a complication that bogs down the first draft. If the interviewer insists on sliding from the start, you will at least know exactly what extra state it costs.</p>`,
        },
        {
          type: "quiz",
          q: "At 10:40 a tumbling \"last hour\" answer and a sliding \"last hour\" answer disagree about the number-one video. Which explanation is most likely?",
          options: [
            "One of the two counters has a bug",
            "A video took off after 10:00: the sliding window (09:40-10:40) includes those 40 minutes, the tumbling one (09:00-10:00) does not",
            "Tumbling windows count each view twice",
            "Sliding windows drop late events",
          ],
          answer: 1,
          explain: "The two windows cover different intervals. Tumbling still serves the last complete hour, so anything that happened since 10:00 is invisible to it until 11:00. A fast-rising video can lead the sliding window while barely registering in the tumbling one.",
        },
      ],
    },
    {
      id: "event-time-and-lateness",
      title: "Event time, late views and the lateness budget",
      kicker: "Time is messy",
      blocks: [
        {
          type: "problem",
          html: `<p>A view at 09:59:58 does not reach the pipeline at 09:59:58. Network hops add seconds; a phone on a train may buffer events and upload them minutes later. If the 09:00-10:00 window closes the instant the wall clock says 10:00, it silently misses views that belong to it. If it waits forever, it is never final.</p>`,
        },
        {
          type: "idea",
          html: `<p>Count each view by its <strong>event time</strong> (when it happened), not its arrival time, and give every window a <strong>lateness budget</strong>: how long it waits for stragglers before its result is treated as final. The budget is the knob between freshness and completeness.</p>`,
        },
        {
          type: "text",
          html: `<p>Stream processors implement the budget with a <strong>watermark</strong>: a running estimate of "no events older than time T are still coming". A common policy is bounded out-of-orderness: the watermark trails the newest event time seen by a fixed delay. With a 30-second delay, once the processor has seen events stamped 10:00:30, the watermark reaches 10:00:00, and the 09:00-10:00 window can close.</p>
<p>The freshness requirement caps the budget. If results must appear within one minute of a view, the watermark delay plus processing and publishing time has to fit in that minute, so something like 30 seconds is a reasonable choice. Waiting longer catches more stragglers, but beyond the freshness target it breaks a requirement rather than improving accuracy.</p>`,
        },
        {
          type: "steps",
          title: "How one tumbling window closes",
          items: [
            "Views stamped 09:00:00-09:59:59 are added to the 09:00 window as they arrive, in any order.",
            "The newest event seen reaches 10:00:30; with a 30-second delay the watermark passes 10:00:00.",
            "The processor emits the window's final counts and frees its state.",
            "A view stamped 09:59:50 that arrives after this is late. Policy decides: drop it and count drops, send it to a side output, or emit a correction.",
          ],
        },
        {
          type: "text",
          html: `<p>For a "most viewed" shelf, dropping a small tail of very late views (and monitoring how many) is usually fine: a few views from offline devices will not change a top-1,000 list. For billing, you would send them to a side output and reconcile later. Say which one you choose and why; the interviewer is checking that you know late data exists.</p>`,
        },
        {
          type: "lab",
          id: "windowTypes",
          caption: "Move \"now\" and switch between tumbling and sliding to see the ranking change. Then drag the watermark delay: a few seconds catches most network delay, but no delay within the one-minute budget catches devices that were offline for minutes.",
        },
        {
          type: "realworld",
          items: [
            { org: "Apache Flink", title: "Watermark strategies", html: "Flink's <code>WatermarkStrategy.forBoundedOutOfOrderness</code> generates exactly this kind of trailing watermark. Windows can also set <code>allowedLateness</code> and route anything later to a side output." },
            { org: "Kafka Streams", title: "Grace periods", html: "Windowed aggregations take a grace period: records that arrive within it still update their window; records after it are dropped." },
            { org: "Spark Structured Streaming", title: "withWatermark", html: "<code>withWatermark(\"eventTime\", \"30 seconds\")</code> tells Spark how long to keep window state open for late rows before finalising and discarding it." },
          ],
        },
        {
          type: "quiz",
          q: "Freshness must be within 1 minute. A teammate proposes a 5-minute watermark delay \"to be safe\". What is the main problem?",
          options: [
            "Watermarks cannot be longer than 60 seconds",
            "Windows would not close until 5 minutes after they end, so results would always be later than the freshness requirement allows",
            "It would double-count views",
            "Late events would be counted in the wrong window",
          ],
          answer: 1,
          explain: "The watermark delay is a direct lower bound on how late a window's final result can appear. A 5-minute delay guarantees every answer is at least 5 minutes stale, breaking the 1-minute requirement, to catch a tail of stragglers that rarely changes a top-K list.",
        },
      ],
    },
    {
      id: "exactness-freshness-latency",
      title: "Exact, fresh and fast: the requirements that shape everything",
      kicker: "Non-functional requirements",
      blocks: [
        {
          type: "text",
          html: `<h3>Exact or approximate?</h3>
<p>Exact means every view is counted and ties are broken correctly. Approximate allows small, bounded errors in counts or in the order near position K, in exchange for far less memory and work. A trending shelf does not care whether a video has 4,812,331 or 4,812,900 views; a creator payout does.</p>
<p>Propose <strong>exact first</strong>. It is the harder constraint, so a design that meets it also meets the relaxed one, and it forces you to deal with counting at scale instead of reaching for a sketch to dodge the problem. Approximation becomes an optimisation you offer later (Chapter 5), with a clear statement of what errors it introduces.</p>
<h3>How fresh?</h3>
<p>"At most a minute behind" is a good default. It sets the watermark delay (about 30 seconds), the refresh interval for precomputed answers (about once a minute) and how often counts must be flushed. Ask for "real time" without a number and you get a design that tries to update a ranking on every event, which is both expensive and pointless for a shelf humans glance at.</p>
<h3>How fast, and how many?</h3>
<p>A read budget of tens of milliseconds rules out aggregating anything at query time. Summing even one window over billions of videos takes seconds to minutes, so the answer must already exist when the request arrives. That one requirement fixes the shape of the read path: <span class="hl">precomputed answers in a cache, refreshed in the background</span>.</p>
<p>Cap K, at 1,000 say. A bounded answer is a small value that can be computed once, stored under one key and returned without pagination. A request for the top million is really a request for the dataset and belongs to an analytics export, not a low-latency API.</p>
<h3>What we leave out</h3>
<p>Arbitrary historical ranges ("top videos for 3-17 June 2024") need a general analytical store, because no system can precompute every possible range. Marking them out of scope keeps the problem tractable and shows you know where the cliff is; fixed windows ending now are what the product needs.</p>`,
        },
        {
          type: "table",
          title: "Requirement decisions and what each one changes",
          headers: ["Question", "Default to propose", "What it changes"],
          rows: [
            ["Which windows?", "Last hour, day, month, all time", "How many sets of counters you maintain"],
            ["Tumbling or sliding?", "Tumbling; sliding as a deep dive", "Whether old views must be subtracted"],
            ["Exact or approximate?", "Exact first", "Whether sketches are allowed"],
            ["How fresh?", "Within 1 minute of the view", "Watermark delay and refresh interval"],
            ["How large can K be?", "1,000 at most", "Size of each precomputed answer"],
            ["Read latency?", "Tens of milliseconds", "Precompute and cache; no query-time aggregation"],
            ["Arbitrary ranges?", "Out of scope", "Avoids a general OLAP store"],
          ],
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>Do not just ask questions; <strong>propose defaults and confirm them</strong>. "I'll assume tumbling hour, day and month plus all time, exact counts, at most a minute of lag, K up to 1,000 and reads in tens of milliseconds. Does that match what you had in mind?" takes fifteen seconds and shows judgement, where a list of open questions hands the work back to the interviewer.</p>`,
        },
      ],
    },
    {
      id: "the-numbers",
      title: "Back-of-the-envelope: the numbers that pick the architecture",
      kicker: "Estimation",
      blocks: [
        {
          type: "problem",
          html: `<p>Without numbers, every component looks plausible: one Postgres table, a Redis counter per video, a nightly batch job. The estimates exist to rule designs out. Two questions matter most: can one machine absorb the writes, and can one set of counters fit in memory?</p>`,
        },
        {
          type: "text",
          html: `<p>Take the headline as given by the problem: about <strong>70 billion views a day</strong> (an assumption for the exercise, not a published YouTube figure). Use the shortcut of 10<sup>5</sup> seconds per day; the real 86,400 changes the answer by about 15%, which never changes a decision.</p>
<p><span class="formula">70 × 10<sup>9</sup> views/day ÷ 10<sup>5</sup> s/day ≈ 700K views/s</span> on average, about 800K with the exact day length. Traffic is not flat, so assume a peak of roughly twice the average: <span class="formula">≈ 1.4-1.6M views/s</span>.</p>
<p>Now the catalogue. Assume about one hour of video is uploaded every second and videos average six minutes: <span class="formula">3,600 s ÷ 360 s ≈ 10 new videos/s ≈ 1M/day</span>. Over ten years that is <span class="formula">1M × 365 × 10 ≈ 3.6B videos</span>.</p>
<p>Finally, one set of counters. A video ID (8 bytes) plus a count (8 bytes) is 16 bytes: <span class="formula">3.6B × 16 B ≈ 58 GB</span>. Stored as Postgres rows with an index on the count, each counter costs more like 60 bytes, about 220 GB.</p>`,
        },
        {
          type: "table",
          title: "The estimates at a glance",
          headers: ["Quantity", "Estimate", "What it rules out or in"],
          rows: [
            ["Views per second", "~700-800K average, ~1.5M peak", "Rules out one write per view on one database node"],
            ["New videos", "~1M per day", "The catalogue keeps growing; IDs are not a small fixed set"],
            ["Catalogue after 10 years", "~3.6B videos", "Counting every video in every window is large"],
            ["One set of counters", "~58 GB raw, ~220 GB as indexed rows", "Fits in memory on a large machine, but there are 4 windows"],
            ["Indexed writes one node sustains", "~10K/s (assumption)", "Per-view writes need about 80 nodes on average, 150 at peak"],
          ],
          note: "Every figure here is an assumption chosen for the exercise; the point is the order of magnitude.",
        },
        {
          type: "lab",
          id: "topkEstimator",
          caption: "Change the daily views, upload rate and video length, and watch how many database nodes per-view writes would need. Switch to 86,400 seconds per day to see that the shortcut barely matters.",
        },
        {
          type: "text",
          html: `<p>Read the results as two verdicts. First, the write rate is roughly two orders of magnitude beyond what one relational node can apply as indexed updates, so <span class="hl-bad">one write per view into a database is out</span>. Something must aggregate views before they reach storage, which is the subject of Chapter 3.</p>
<p>Second, the state is not enormous. Tens of gigabytes per set of counters fits in RAM on one large machine, and the shorter windows are much smaller than that, because an hour or a day only includes videos that were actually watched in it, a small fraction of the 3.6 billion. <span class="hl-good">The problem is throughput, not storage</span>, and that tells you where to spend the interview.</p>`,
        },
        {
          type: "quiz",
          q: "Your estimate says one set of all-time counters is about 58 GB. Which conclusion follows?",
          options: [
            "We need a distributed database just to store the counts",
            "The counts could live in memory on one large machine; the hard part is the write rate, not the size",
            "We should use approximation because 58 GB is too large",
            "Each window needs 58 GB, so the total is too large for any design",
          ],
          answer: 1,
          explain: "58 GB fits in the RAM of a single large server, so storage size does not force distribution. What does is roughly 800K updates per second. Shorter windows also need far less than 58 GB, because they only contain videos watched during the window.",
        },
      ],
    },
    {
      id: "interview",
      title: "Running the first minutes of the interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "text",
          html: `<p>Scoping is where a top-K interview is most often won or lost. Candidates who rush past it tend to design a sliding, approximate, real-time system when the interviewer wanted tumbling and exact, or the reverse, and then spend the rest of the hour defending the wrong thing. Spend about five minutes here and leave with numbers on the board.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>A strong opening covers, in order:</p>
<ol>
<li><strong>Functional:</strong> top K videos for the last hour, day and month plus all time; K capped at 1,000; arbitrary historical ranges out of scope.</li>
<li><strong>Window semantics:</strong> tumbling by default, sliding as a later deep dive, and why.</li>
<li><strong>Non-functional:</strong> exact counts, at most a minute of lag, reads in tens of milliseconds.</li>
<li><strong>Input:</strong> view events already arrive in Kafka with a video ID and event time.</li>
<li><strong>Numbers:</strong> ~800K views/s average (more at peak), ~3.6B videos, ~58 GB per set of counters. Conclusion: aggregate before writing, precompute before reading.</li>
</ol>`,
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Saying "real time" or "approximate is fine" without being asked. Both remove the hardest constraints, and an interviewer will often push back with "assume it must be exact" anyway. Start with the stricter requirement; it is easier to relax a design than to rescue one.</p>`,
        },
        {
          type: "quiz",
          q: "An interviewer asks: \"Why not just let clients request any K they like?\" Which answer is best?",
          options: [
            "Because Redis cannot store more than 1,000 items",
            "A capped K means each window's answer is a small, fixed-size value that can be precomputed and cached under one key; a request for millions of rows is a data export, not a low-latency query",
            "Because sorting more than 1,000 items is slow",
            "Because users never scroll past 10 results",
          ],
          answer: 1,
          explain: "The cap is what makes the read path trivial: compute the top 1,000 per window once, store it, and slice it for smaller K. An unbounded K turns the API into a way of downloading the dataset, which belongs in a warehouse export.",
        },
      ],
    },
  ],
  takeaways: [
    "A top-K query is items, a score and a scope. The answer is tiny; maintaining scores over moving windows is the hard part.",
    "Propose defaults and confirm them: tumbling hour, day and month plus all time, exact counts, at most a minute of lag, K up to 1,000, reads in tens of milliseconds.",
    "Tumbling windows put each view in exactly one window; sliding windows must subtract every view later, which means remembering when it happened.",
    "Count by event time and give each window a lateness budget, implemented as a watermark that trails the newest events (about 30 seconds against a one-minute freshness target).",
    "~70B views a day is ~800K writes per second on average, two orders of magnitude beyond one database node, but a set of counters is only tens of gigabytes. The problem is throughput, not storage.",
    "A read budget of tens of milliseconds forces precomputed answers; arbitrary historical ranges are explicitly out of scope.",
  ],
  furtherReading: [
    { title: "Streaming Systems (Akidau, Chernyak and Lax, O'Reilly, 2018)", note: "Chapters 2 and 3 explain event time, windows and watermarks in depth." },
    { title: "The Dataflow Model (Akidau et al., VLDB 2015)", note: "The paper behind the modern vocabulary of windows, watermarks and triggers." },
    { title: "Apache Flink documentation: Windows", url: "https://nightlies.apache.org/flink/flink-docs-stable/docs/dev/datastream/operators/windows/", note: "Tumbling, sliding and session window assigners, allowed lateness and side outputs." },
  ],
};
