// System design problem breakdowns - interactive notes data.
// Original study notes. Problem list follows Hello Interview's "Question Breakdowns":
// https://www.hellointerview.com/learn/system-design/problem-breakdowns/top-k
window.DATA = {
  book: {
    title: `System Design Problem Breakdowns`,
    subtitle: `Classic system design interview problems, each worked through on one page: the problem, a solution from a simple design to a scalable one, the deep dives an interviewer pushes on, and what is expected at each level, with labs embedded where each decision comes up. Problems are grouped and ordered by difficulty, <strong style="color:var(--level-easy)">easy</strong>, <strong style="color:var(--level-medium)">medium</strong> and <strong style="color:var(--level-hard)">hard</strong>: <strong>Flash Sale</strong> (medium), 20,000 consoles for 10 million buyers without overselling; <strong>Uber</strong> (hard), matching riders with nearby drivers while millions of drivers report their location every few seconds; <strong>YouTube Top K</strong> (hard), the most-viewed videos for the last hour, day, month and all time at ~70 billion views a day. The problems follow Hello Interview's <a href="https://www.hellointerview.com/learn/system-design/problem-breakdowns/flash-sale" target="_blank" rel="noopener" style="color:var(--accent)">Flash Sale</a>, <a href="https://www.hellointerview.com/learn/system-design/problem-breakdowns/uber" target="_blank" rel="noopener" style="color:var(--accent)">Uber</a> and <a href="https://www.hellointerview.com/learn/system-design/problem-breakdowns/top-k" target="_blank" rel="noopener" style="color:var(--accent)">Top K</a> breakdowns; these notes and labs are written independently, so read the original walkthroughs there.`,
    storageKey: `problem_breakdowns_notes_v1`,
    appId: `problem-breakdowns-notes`,
    exportPrefix: `problem-breakdowns-progress`,
    pillarsTitle: `Four habits for any breakdown`,
    takeawaysTitle: `Ten things to remember`,
    labsIntro: `Each lab models one decision in the design and sits in the section where that decision comes up. The numbers come from simple, stated assumptions rather than production measurements, so read them as shapes and ratios, not benchmarks.`,
    mono: `PB`,
    shortTitle: `Problem Breakdowns`,
    tagline: `Interactive interview prep`
  },
  // Problems are grouped by difficulty; chapterOrder lists them easiest first, and the loader sorts and numbers them.
  parts: {
    1: `Easy`,
    2: `Medium`,
    3: `Hard`
  },
  chapterOrder: [`flash-sale`, `uber`, `top-k`],
  fourQuestions: [
    { cls: `what`, q: `Pin down the contract`, text: `Both problems hide their difficulty in the requirements. For Top K: which windows, sliding or tumbling, exact or approximate, how fresh, how large K can be. For a flash sale: never oversell, how long a hold lasts, and what "fair" means. Propose concrete defaults and let the interviewer push back.`, answer: `Top K: Problem tab &middot; Flash Sale: Problem tab.` },
    { cls: `where`, q: `Let the numbers choose`, text: `70 billion views a day is ~800K events per second, which rules out one database write per view. 10 million buyers for 20,000 consoles is ~1M requests per second aimed at a single stock row that takes ~1,000 locked updates a second. One number each, and the hard part is obvious.`, answer: `Top K: Problem tab (estimates) &middot; Flash Sale: Problem tab.` },
    { cls: `when`, q: `Start with something that works`, text: `A consumer incrementing counters in Postgres plus ORDER BY ... LIMIT is a complete Top K answer. A conditional decrement and a reservations table in one transaction is a complete flash sale answer. Draw the simple version, then name its bottlenecks before fixing them.`, answer: `Top K: Solution tab &middot; Flash Sale: Solution tab.` },
    { cls: `how`, q: `Take work off the hot path`, text: `Top K aggregates views in the stream and precomputes every answer, so a read never sums anything. A flash sale keeps the stock gate tiny and atomic, and puts a waiting room in front of it so only as many buyers arrive as the gate can serve.`, answer: `Top K: Deep Dives &middot; Flash Sale: Deep Dives.` }
  ],
  takeaways: [
    `Clarify the scope before drawing boxes. Top K: <strong>tumbling</strong> windows put each view in one bucket, <strong>sliding</strong> windows must subtract it later. Flash sale: a unit is either free, held until an expiry time, or sold.`,
    `Estimate with round numbers: ~10<sup>5</sup> seconds per day, so 70B views/day is ~800K writes/s; 10M buyers arriving in a minute is ~1M requests/s for 20,000 units.`,
    `Few distinct questions, asked constantly, should be <strong>precomputed</strong>: Top K publishes four answers to Redis every minute, and the flash sale page and sold-out flag come from a CDN.`,
    `<strong>Partition and shard by the key you rank or lock on.</strong> With counters sharded by video ID, merging each shard's top K is exact.`,
    `<strong>Aggregate before writing.</strong> Popularity is skewed, so summing views per video per minute cuts database writes by one to two orders of magnitude.`,
    `Keep <strong>running totals per window</strong> with an index on views, and update a sliding hour as "add the newest minute, subtract the one that left". Slide the hour; tumble the day and month.`,
    `<strong>Never oversell</strong>: decrement stock with one atomic conditional operation (a conditional UPDATE, or a Redis script) and record the hold in the same step. Read-then-write oversells.`,
    `A single <strong>hot row</strong> serialises every buyer. Move the gate to an in-memory atomic counter, or split stock into buckets, and keep the database as the record of who holds what.`,
    `<strong>Reservations expire</strong>: give holds a short TTL, release them lazily or with a sweeper, and make payment idempotent so webhooks, retries and late payments can't double-sell.`,
    `<strong>Admission control beats raw capacity</strong>: a virtual waiting room lets buyers in at the rate the backend can serve and is where fairness (arrival order, random draw or raffle) and bot limits are enforced.`
  ],
  chapters: [
    {
      id: `top-k`, part: 3, number: 2, difficulty: `hard`,
      title: `YouTube Top K: the most-viewed videos per time window`,
      overview: `Return the top K most-viewed videos for the last hour, day, month and all time, with exact counts, at most a minute of lag and reads in tens of milliseconds, while roughly 70 billion views a day stream in. The answer itself is tiny; the difficulty is keeping counts that are fit to rank over moving windows for billions of videos. The design that works partitions the view stream by video ID, aggregates in a stream processor before writing, keeps a running total per window, and publishes precomputed answers to a cache.`,
      source: { title: `Hello Interview: Top K (YouTube) problem breakdown`, url: `https://www.hellointerview.com/learn/system-design/problem-breakdowns/top-k` },
      problem: [
        {
          id: `requirements`,
          title: `What we are building`,
          kicker: `Functional requirements`,
          blocks: [
            { type: `problem`, html: `<p>Build the service behind a "most viewed" shelf: given a time window, return the K videos with the most views in it. It sounds like one <code>ORDER BY</code>, but the windows keep moving and the counts change roughly 800,000 times a second.</p>` },
            { type: `list`, title: `Functional requirements`, items: [
              `Return the <strong>top K videos by view count</strong> for the <strong>last hour, last day, last month and all time</strong>.`,
              `The client chooses K, <strong>up to 1,000</strong>. Each entry carries the video ID and its view count.`,
              `Each answer says which window it describes (an <code>asOf</code> time), because answers are computed slightly behind real time.`
            ] },
            { type: `text`, html: `<p>Decide where the system starts. Whether a playback counts as a view (watch time, bot filtering, replays) is someone else's hard problem. Assume every counted view is already published as an event with a video ID and an event time to a durable log such as a Kafka topic. We <em>consume</em> that log rather than exposing a "record a view" API, and we get replay for free: if a bug corrupts counts, fix it, rewind and recompute.</p>` },
            { type: `diagram`, title: `Where our system starts and stops`, caption: `Upstream decides what a view is and publishes it. We design the middle box: consume the stream, keep counts per window and serve a small, precomputed answer.`, svg: `<svg viewBox="0 0 640 210" role="img" aria-label="Playback service publishes view events to Kafka; the top-K system consumes them and serves a read API">
<defs><marker id="tk-arrow-ctx" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
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
<line x1="130" y1="110" x2="158" y2="110" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#tk-arrow-ctx)"/>
<line x1="280" y1="110" x2="308" y2="110" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#tk-arrow-ctx)"/>
<line x1="480" y1="110" x2="508" y2="110" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#tk-arrow-ctx)"/>
<text x="220" y="185" text-anchor="middle" font-size="12">~800K views/s</text>
<text x="395" y="185" text-anchor="middle" font-size="12">4 windows</text>
<text x="570" y="185" text-anchor="middle" font-size="12">tens of ms</text>
</svg>` },
            { type: `list`, title: `Out of scope (say it out loud)`, items: [
              `Deciding what counts as a view, and bot or fraud filtering.`,
              `<strong>Arbitrary historical ranges</strong> ("top videos for 3-17 June"): nothing can precompute every range, so they need a general analytics store.`,
              `Slices by country, category or device, and personalised ranking. Mention them as extensions.`,
              `Video metadata (titles, thumbnails): the client fetches it from the video service using the returned IDs.`
            ] }
          ]
        },
        {
          id: `non-functional`,
          title: `Non-functional requirements`,
          kicker: `The numbers that shape the design`,
          blocks: [
            { type: `table`, headers: [`Requirement`, `Default to propose`, `What it changes`], rows: [
              [`Precision`, `Exact counts first`, `Whether sketches are allowed; exact is the harder constraint`],
              [`Freshness`, `At most ~1 minute behind the view`, `Watermark delay (~30 s) and refresh interval (~1 min)`],
              [`Read latency`, `Tens of milliseconds`, `No aggregation at read time: precompute and cache`],
              [`Result size`, `K ≤ 1,000`, `Each answer is one small value under one key`],
              [`Scale`, `~70B views/day, billions of videos`, `Partitioning, sharding and stream aggregation`],
              [`Availability`, `Serve slightly stale rather than fail`, `Long cache TTLs; alert on answer age`]
            ] },
            { type: `text`, html: `<p><strong>Exact first.</strong> A design that counts exactly also meets a relaxed requirement, and it forces you to deal with counting at scale instead of reaching for a sketch to dodge it. Approximation is an optimisation you offer later, with its error stated.</p>
<p><strong>A number for freshness.</strong> "Real time" with no number invites a design that re-ranks on every event. "Within a minute" sets the lateness budget, the flush interval and the refresh interval in one go.</p>
<p><strong>Tens of milliseconds</strong> rules out summing anything when the request arrives: even one window over billions of videos takes seconds to minutes. The answer must exist before anyone asks.</p>` },
            { type: `callout`, tone: `tip`, html: `<p>Propose, don't interrogate: "I'll assume tumbling hour, day and month plus all time, exact counts, at most a minute of lag, K up to 1,000 and reads in tens of milliseconds. Does that match?" Fifteen seconds, and it shows judgement.</p>` },
            { type: `callout`, tone: `mistake`, html: `<p>Volunteering "approximate is fine" or "real time" unprompted. Both remove the hardest constraints, and interviewers often reply "assume it must be exact". Start strict; relaxing a design is easier than rescuing one.</p>` }
          ]
        },
        {
          id: `windows`,
          title: `Tumbling or sliding windows`,
          kicker: `Choosing the scope`,
          blocks: [
            { type: `problem`, html: `<p>It is 10:06 and a user opens "most viewed in the last hour". Is that 09:00-10:00 (the last complete hour) or 09:06-10:06 (the trailing sixty minutes)? Both are defensible, and they need very different amounts of state.</p>` },
            { type: `text`, html: `<p>A <strong>tumbling window</strong> is a fixed, non-overlapping interval aligned to the clock. Every view lands in exactly one window, so a window is a running total that stops changing once it closes. A <strong>sliding window</strong> trails "now" and advances in small steps, say every minute. It is fresher, but every view must be <em>added</em> when it arrives and <em>removed</em> when it ages out, so the system must remember when views happened.</p>` },
            { type: `diagram`, title: `What "last hour" means at 10:06`, caption: `Tumbling serves the last complete clock hour and ignores the six minutes since 10:00. Sliding covers the trailing sixty minutes and moves every minute.`, svg: `<svg viewBox="0 0 640 210" role="img" aria-label="Timeline comparing a tumbling last hour from 09:00 to 10:00 with a sliding last hour from 09:06 to 10:06">
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
</svg>` },
            { type: `compare`, items: [
              { title: `Tumbling`, tone: `ok`, html: `One running total per video per window, final once the window closes. The answer changes once per window. Ideal for daily and monthly charts, and the default to propose.` },
              { title: `Sliding`, tone: `warn`, html: `Each view counts in many overlapping windows and must later be subtracted, so you keep recent history (for example per-minute counts). Ideal for "trending now"; covered in the Deep Dives.` }
            ] },
            { type: `text`, html: `<h3>Event time and the lateness budget</h3>
<p>A view stamped 09:59:58 may arrive seconds or minutes later (network hops, phones offline). Count by <strong>event time</strong>, and give each window a <strong>lateness budget</strong>: how long it waits for stragglers before its result is final. Stream processors implement this with a <strong>watermark</strong> that trails the newest event time by a fixed delay. Against a one-minute freshness target, ~30 seconds is reasonable; very late views are dropped (and counted) or sent to a side output.</p>` },
            { type: `lab`, id: `windowTypes`, caption: `Move "now" and switch between tumbling and sliding to see the ranking change. Then drag the watermark delay: a few seconds catches network delay, but nothing inside a one-minute budget catches devices that were offline for minutes.` },
            { type: `callout`, tone: `interview`, html: `<p>Propose <strong>tumbling hour, day and month plus all time</strong> (all time never closes and never subtracts). It gets a complete design on the board fast. Keep sliding as a deliberate deep dive, and when you get there, offer a hybrid: slide the hour, tumble the rest.</p>` }
          ]
        },
        {
          id: `estimates`,
          title: `Back-of-the-envelope numbers`,
          kicker: `Estimation`,
          blocks: [
            { type: `text`, html: `<p>The estimates exist to rule designs out. Two questions matter: can one machine absorb the writes, and can one set of counters fit in memory? Use 10<sup>5</sup> seconds per day; the real 86,400 never changes a decision.</p>
<ul>
<li><strong>Writes:</strong> <span class="formula">70 × 10<sup>9</sup> views/day ÷ 10<sup>5</sup> s ≈ 700-800K views/s</span>, roughly double at peak.</li>
<li><strong>Catalogue:</strong> ~1 hour of video uploaded per second at ~6 minutes per video is <span class="formula">~10 videos/s ≈ 1M/day ≈ 3.6B over 10 years</span>.</li>
<li><strong>Counters:</strong> 8-byte ID plus 8-byte count: <span class="formula">3.6B × 16 B ≈ 58 GB</span> raw, ~220 GB as indexed database rows.</li>
<li><strong>One database node:</strong> assume ~10K indexed single-row updates/s, so per-view writes need <span class="formula">~80 nodes</span> on average, ~150 at peak.</li>
</ul>` },
            { type: `lab`, id: `topkEstimator`, caption: `Change daily views, upload rate and video length, and watch how many database nodes per-view writes would need. Switch to 86,400 seconds per day to see that the shortcut barely matters.` },
            { type: `keypoints`, title: `Two verdicts`, items: [
              `<span class="hl-bad">One write per view into a database is out</span>: the rate is about two orders of magnitude beyond one node. Views must be aggregated before they reach storage.`,
              `<span class="hl-good">The state is not enormous</span>: tens of GB per set of counters fits in RAM on a large machine, and hour or day windows only hold videos actually watched in them. The problem is throughput, not storage.`,
              `Few distinct questions (four windows, every K a prefix of the top 1,000) means the read side can be precomputed.`
            ] },
            { type: `quiz`, q: `Your estimate says one set of all-time counters is about 58 GB. Which conclusion follows?`, options: [
              `We need a distributed database just to store the counts`,
              `The counts could live in memory on one large machine; the hard part is the write rate`,
              `We must use approximation because 58 GB is too large`,
              `Four windows make the total too large for any design`
            ], answer: 1, explain: `58 GB fits in one large server's RAM, and shorter windows need far less. What forces distribution is ~800K updates per second.` }
          ]
        }
      ],
      solution: [
        {
          id: `entities`,
          title: `Core entities`,
          kicker: `Data model`,
          blocks: [
            { type: `text`, html: `<p>The model is small. Name the entities quickly and move on; the interesting decisions are in how counts are stored and refreshed.</p>` },
            { type: `table`, headers: [`Entity`, `Fields`, `Notes`], rows: [
              [`View event`, `videoId, eventTime (userId optional)`, `Immutable, arrives on the Kafka topic keyed by videoId`],
              [`Video`, `videoId`, `Only the ID matters here; metadata lives in the video service`],
              [`Window`, `type (hour, day, month, all), start`, `Tumbling windows are identified by their start`],
              [`View count`, `videoId, window, views`, `One per video per window; what we rank on`],
              [`Top-K list`, `window, asOf, [(videoId, views)] × ≤ 1,000`, `The precomputed answer the API serves`]
            ] }
          ]
        },
        {
          id: `api`,
          title: `API and the input stream`,
          kicker: `Interface`,
          blocks: [
            { type: `code`, title: `The one read endpoint`, lang: `http`, code: `GET /views/top?window=hour&k=100        window = hour | day | month | all, k <= 1000

200 OK
{ "window": "hour",
  "asOf":   "2026-10-13T10:00:00Z",
  "videos": [ { "videoId": "v_8f2c", "views": 48213377 }, ... ] }` },
            { type: `code`, title: `The input: one message per counted view`, lang: `text`, code: `topic: view-events      key: videoId      retention: >= 30 days
value: { "videoId": "v_8f2c", "eventTime": "2026-10-13T09:59:58.412Z", "userId": "u_77" }` },
            { type: `keypoints`, items: [
              `There is no write API: views arrive on the log, which gives buffering and replay.`,
              `Keying messages by <code>videoId</code> sends every view of a video to one partition; the whole design builds on that.`,
              `<code>asOf</code> tells clients which window the answer describes. Reject <code>k</code> above 1,000; slice the stored top 1,000 for smaller K.`
            ] }
          ]
        },
        {
          id: `simple-design`,
          title: `A simple design that works`,
          kicker: `Baseline`,
          blocks: [
            { type: `idea`, html: `<p>Start with something complete and obviously correct, however slow: one consumer, one database, one API. Its flaws become the agenda for the deep dives, and you get to name them before the interviewer does.</p>` },
            { type: `diagram`, title: `The baseline`, caption: `Every view becomes a database write and every request becomes a database query. The red notes are the two bottlenecks.`, svg: `<svg viewBox="0 0 640 230" role="img" aria-label="Baseline: Kafka to a consumer that updates Postgres; clients query Postgres through an API">
<defs><marker id="tk-arrow-base" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="20" y="40" width="110" height="50" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<text x="75" y="61" text-anchor="middle" font-size="13" font-weight="700">Kafka</text>
<text x="75" y="78" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">view-events</text>
<rect x="180" y="40" width="120" height="50" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="240" y="61" text-anchor="middle" font-size="13" font-weight="700">Consumer</text>
<text x="240" y="78" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">+1 per view</text>
<rect x="340" y="25" width="170" height="190" rx="10" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<text x="425" y="47" text-anchor="middle" font-size="13" font-weight="700">Postgres</text>
<rect x="352" y="60" width="146" height="44" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1"/>
<text x="425" y="78" text-anchor="middle" font-size="12" font-weight="700">video_views</text>
<text x="425" y="95" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">(id, views)</text>
<rect x="352" y="120" width="146" height="44" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1"/>
<text x="425" y="138" text-anchor="middle" font-size="12" font-weight="700">video_views_hourly</text>
<text x="425" y="155" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">(id, hour, views)</text>
<rect x="20" y="160" width="110" height="50" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="75" y="190" text-anchor="middle" font-size="13" font-weight="700">Clients</text>
<rect x="180" y="160" width="120" height="50" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="1.5"/>
<text x="240" y="181" text-anchor="middle" font-size="13" font-weight="700">Top-K API</text>
<text x="240" y="198" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">SQL per request</text>
<line x1="130" y1="65" x2="178" y2="65" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#tk-arrow-base)"/>
<line x1="300" y1="65" x2="338" y2="65" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#tk-arrow-base)"/>
<line x1="130" y1="185" x2="178" y2="185" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#tk-arrow-base)"/>
<line x1="300" y1="185" x2="338" y2="185" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#tk-arrow-base)"/>
<text x="525" y="70" font-size="12" font-weight="700" style="fill: var(--dg-bad)">~800K row</text>
<text x="525" y="86" font-size="12" font-weight="700" style="fill: var(--dg-bad)">updates/s</text>
<text x="525" y="180" font-size="12" font-weight="700" style="fill: var(--dg-bad)">scan and sum</text>
<text x="525" y="196" font-size="12" font-weight="700" style="fill: var(--dg-bad)">per request</text>
</svg>` },
            { type: `code`, title: `Schema and queries`, lang: `sql`, code: `CREATE TABLE video_views (video_id text PRIMARY KEY, views bigint NOT NULL);
CREATE INDEX ON video_views (views DESC);
-- all time: walk the first K index entries
SELECT video_id, views FROM video_views ORDER BY views DESC LIMIT 100;

CREATE TABLE video_views_hourly (video_id text, hour timestamptz, views bigint,
                                 PRIMARY KEY (video_id, hour));
-- last day: sum every video's 24 buckets, then sort (a scan)
SELECT video_id, SUM(views) AS views FROM video_views_hourly
WHERE hour >= :day_start AND hour < :day_end
GROUP BY video_id ORDER BY views DESC LIMIT 100;` },
            { type: `text`, html: `<p><strong>All time is cheap.</strong> A B-tree on <code>views</code> keeps videos sorted, so the top K is a walk of K index entries. The price is on writes: every increment moves the video's index entry (and in Postgres writes a new row version), and popular videos queue on their own row lock.</p>
<p><strong>Windows are expensive.</strong> No index can give you the order of a <em>sum</em>. To rank a day you must add up every video's 24 buckets first. With ~20M videos active per hour that is ~480M rows per day query (tens of seconds) and ~14B rows for a month (minutes).</p>` },
            { type: `table`, title: `A video can win the day without leading any hour`, headers: [`Video`, `Hour 1`, `Hour 2`, `Hour 3`, `Total`], rows: [
              [`A`, `<strong>900</strong>`, `100`, `100`, `1,100`],
              [`B`, `500`, `500`, `500`, `<strong>1,500</strong>`],
              [`C`, `100`, `<strong>950</strong>`, `50`, `1,100`],
              [`D`, `50`, `60`, `<strong>980</strong>`, `1,090`]
            ], note: `Merging each hour's leaders (A, C, D) misses B, the real winner. Ranking a sum needs every addend.` },
            { type: `list`, title: `Bottlenecks to name before fixing anything`, items: [
              `<strong>One database write per view</strong>: ~800K indexed updates/s, ~80× one node. (Deep Dives: the write path)`,
              `<strong>Every request hits the database</strong>: thousands of identical expensive queries per second. (Deep Dives: serving reads)`,
              `<strong>Window queries scan</strong>: each answer aggregates every video in the window before sorting. (Deep Dives: windowed counts)`,
              `<strong>The bucket table grows forever</strong>: one row per video per active hour.`
            ] }
          ]
        },
        {
          id: `high-level-design`,
          title: `The improved high-level design`,
          kicker: `Final design`,
          blocks: [
            { type: `text`, html: `<p>Four changes fix the baseline, each aimed at one bottleneck:</p>
<ol>
<li><strong>Partition the log and shard the counters by video ID</strong>, so each video has one owner and per-shard top-K lists merge exactly.</li>
<li><strong>Aggregate in a stream processor</strong> (Flink, Kafka Streams) into per-minute sums before writing; writes then scale with distinct videos, not views.</li>
<li><strong>Keep a running total per window</strong> (hour, day, month, all time), each indexed by views, so every window's top K is an index walk.</li>
<li><strong>Precompute the answers</strong>: a refresher writes each window's top 1,000 into Redis every minute, and a stateless query service reads only Redis.</li>
</ol>` },
            { type: `diagram`, title: `The complete Top K design`, caption: `Write path along the top: Kafka keyed by video, a stream job with a 30-second watermark aggregating into minute panes, and per-window totals sharded by video. Read path along the bottom: a refresher merges each shard's top 1,000 into Redis every minute; the query service reads only Redis.`, svg: `<svg viewBox="0 0 640 290" role="img" aria-label="View events to Kafka to stream job to sharded per-window totals; refresher to Redis; clients read through a stateless query service">
<defs><marker id="tk-arrow-final" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<text x="10" y="26" font-size="12" font-weight="700" style="fill: var(--dg-muted)">write path</text>
<text x="10" y="180" font-size="12" font-weight="700" style="fill: var(--dg-muted)">read path</text>
<rect x="10" y="40" width="100" height="56" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="60" y="64" text-anchor="middle" font-size="13" font-weight="700">View</text>
<text x="60" y="81" text-anchor="middle" font-size="13" font-weight="700">events</text>
<rect x="150" y="40" width="120" height="56" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<text x="210" y="64" text-anchor="middle" font-size="13" font-weight="700">Kafka</text>
<text x="210" y="81" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">key = videoId</text>
<rect x="310" y="40" width="140" height="56" rx="8" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="1.5"/>
<text x="380" y="64" text-anchor="middle" font-size="13" font-weight="700">Stream job</text>
<text x="380" y="81" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">watermark 30 s</text>
<rect x="490" y="40" width="140" height="56" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<text x="560" y="64" text-anchor="middle" font-size="13" font-weight="700">Per-window totals</text>
<text x="560" y="81" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">sharded, indexed</text>
<rect x="490" y="190" width="140" height="56" rx="8" style="fill: var(--dg-5-soft); stroke: var(--dg-5)" stroke-width="1.5"/>
<text x="560" y="214" text-anchor="middle" font-size="13" font-weight="700">Refresher</text>
<text x="560" y="231" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">every 60 s</text>
<rect x="310" y="190" width="140" height="56" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<text x="380" y="214" text-anchor="middle" font-size="13" font-weight="700">Redis</text>
<text x="380" y="231" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">topk:{window}</text>
<rect x="150" y="190" width="120" height="56" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="1.5"/>
<text x="210" y="214" text-anchor="middle" font-size="13" font-weight="700">Query service</text>
<text x="210" y="231" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">stateless</text>
<rect x="10" y="190" width="100" height="56" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="60" y="223" text-anchor="middle" font-size="13" font-weight="700">Clients</text>
<line x1="110" y1="68" x2="148" y2="68" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#tk-arrow-final)"/>
<line x1="270" y1="68" x2="308" y2="68" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#tk-arrow-final)"/>
<line x1="450" y1="68" x2="488" y2="68" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#tk-arrow-final)"/>
<line x1="560" y1="96" x2="560" y2="188" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#tk-arrow-final)"/>
<line x1="490" y1="218" x2="452" y2="218" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#tk-arrow-final)"/>
<line x1="270" y1="218" x2="308" y2="218" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#tk-arrow-final)"/>
<line x1="110" y1="218" x2="148" y2="218" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#tk-arrow-final)"/>
<text x="210" y="116" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">replay, 30+ days</text>
<text x="380" y="116" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">minute panes, checkpoints</text>
<text x="552" y="140" text-anchor="end" font-size="12">top 1,000 per shard,</text>
<text x="552" y="156" text-anchor="end" font-size="12">merged per window</text>
<text x="380" y="268" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">long TTL, serve stale</text>
<text x="210" y="268" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">reads cache only</text>
<text x="560" y="268" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">idempotent writes</text>
</svg>` },
            { type: `table`, title: `Every component traces back to a requirement`, headers: [`Component`, `Requirement it serves`], rows: [
              [`Kafka keyed by video, 30+ days retention`, `Absorb ~800K events/s; one owner per video; replay after bugs or crashes`],
              [`Stream job: watermark, minute panes, checkpoints`, `Lateness budget inside the 1-minute target; writes cut to distinct videos per interval`],
              [`Per-window totals sharded by video, indexed by views`, `Exact top K for every window without scanning; exact shard merge`],
              [`Refresher + Redis with a long TTL`, `Reads in tens of ms; stale rather than broken if the refresher lags`],
              [`Stateless query service behind a load balancer`, `Scales horizontally; never touches the counters`]
            ] },
            { type: `callout`, tone: `insight`, html: `<p>A leaner variant keeps the per-window counts in the stream processor's own state and has the job write each window's top K straight to Redis, removing the counter database and the refresher. It is elegant but leans on framework internals; present it after the primitives-based design.</p>` }
          ]
        },
        {
          id: `walkthrough`,
          title: `Walking a view and a request through it`,
          kicker: `Request flow`,
          blocks: [
            { type: `steps`, title: `Write path: one view`, items: [
              `Playback publishes <code>{ videoId: v_8f2c, eventTime: 09:59:58 }</code> to <code>view-events</code> with key <code>v_8f2c</code>; it lands in that video's partition.`,
              `The stream task that owns the partition adds 1 to v_8f2c's 09:59 minute pane in keyed state. The watermark (newest event time minus 30 s) decides when that pane is complete.`,
              `When the pane closes, the task bulk-upserts the minute's sums into the shard that owns v_8f2c: add to the hour, day, month and all-time totals (and, for a sliding hour, subtract the minute that just left).`,
              `State and Kafka offsets are checkpointed together every ~30 s. After a crash the job restores and replays; writes are idempotent, so nothing is counted twice.`
            ] },
            { type: `steps`, title: `Read path: one request`, items: [
              `Every minute the refresher asks each shard for the top 1,000 of each window (an index walk), merges the lists, and publishes each window to Redis with an atomic swap and a long TTL.`,
              `A client calls <code>GET /views/top?window=hour&amp;k=100</code>. The load balancer picks any query-service instance.`,
              `The service reads the first 100 entries of <code>topk:hour</code> (about a millisecond) and returns them with <code>asOf</code>. Nothing on this path sums or sorts.`
            ] },
            { type: `quiz`, q: `A user requests the top 50 for the last day. Which components does that request touch?`, options: [
              `Query service, Redis, the counter shards and the stream job`,
              `Only the query service and Redis`,
              `The query service and the counter shards`,
              `The query service and Kafka`
            ], answer: 1, explain: `The read path reads one precomputed list from Redis and slices it to 50. Counting, aggregation and merging all happen off the request path, which is how reads stay in the low milliseconds.` }
          ]
        }
      ],
      levels: [
        {
          id: `mid`,
          title: `Mid-level`,
          kicker: `What is expected`,
          blocks: [
            { type: `keypoints`, title: `You should drive`, items: [
              `Clear functional requirements (four windows, K ≤ 1,000) and a rough write-rate estimate.`,
              `A complete, correct baseline: Kafka consumer, counter tables, an API, and an explanation of the data flow end to end.`,
              `Spotting the obvious bottlenecks: per-view writes and expensive window queries.`,
              `Putting a cache in front of reads and explaining keys and TTLs.`
            ] },
            { type: `list`, title: `The interviewer will likely lead`, items: [
              `Pushing you from "add database shards" towards aggregating before writing.`,
              `Asking what happens when a cached answer expires, and nudging you to precompute.`,
              `Sliding windows and approximation are bonus territory at this level.`
            ] },
            { type: `callout`, tone: `mistake`, html: `<p>Jumping to Flink, sketches and five boxes you can't explain; or a design that silently re-sorts billions of rows per request. A working, honest baseline with named bottlenecks beats an impressive diagram.</p>` }
          ]
        },
        {
          id: `senior`,
          title: `Senior`,
          kicker: `What is expected`,
          blocks: [
            { type: `keypoints`, title: `You should drive`, items: [
              `Propose window semantics, exactness, freshness and latency defaults yourself, and use the numbers to rule out per-view writes.`,
              `Reach something close to the final design largely unprompted: partition by video, aggregate in the stream, per-window totals, precomputed answers in Redis.`,
              `Explain <em>why</em> the per-shard merge is exact, and why windowed top K can't use an index on raw buckets.`,
              `Argue tumbling vs sliding with product reasons and offer the hybrid.`
            ] },
            { type: `list`, title: `Deep dives you should reach`, items: [
              `Scaling the write path (sharding, pre-aggregation, hot keys).`,
              `Serving reads (precompute vs TTL cache, serve stale).`,
              `Windowed counts without scanning, and at least the shape of sliding windows.`,
              `Recovery basics: checkpoints, replay and idempotent upserts.`
            ] },
            { type: `callout`, tone: `mistake`, html: `<p>Treating "Redis" as the end of the read story (the refresher still has to compute each window), or naming a stream processor without being able to say what watermarks and checkpoints do.</p>` }
          ]
        },
        {
          id: `staff`,
          title: `Staff and above`,
          kicker: `What is expected`,
          blocks: [
            { type: `keypoints`, title: `You should drive`, items: [
              `The whole solution space, with a clear choice: database totals vs stream-processor state, exact vs sketch, build vs adopt an OLAP store, each tied to requirements and team context.`,
              `Failure and operations: late data policy, replay and backfill after a bad deploy, hot-key detection, consumer-lag and answer-age alerts.`,
              `Cost awareness: Kafka retention for a lagged subtractor, terabytes for a sliding month, what approximation saves.`,
              `Extensions without redesign: slices by country or category, larger K, per-creator counts.`
            ] },
            { type: `list`, title: `How the interview usually runs`, items: [
              `The interviewer gives little direction; you set the agenda and spend time where the risk is.`,
              `Expect probes beyond the standard deep dives: "how would you verify the counts are right?", "what does a schema change to the event cost?"`
            ] },
            { type: `callout`, tone: `mistake`, html: `<p>Listing options without committing, or over-engineering every window to slide by the minute. Staff signal is judgement: say what you would build first, what you would defer, and why.</p>` }
          ]
        }
      ],
      concepts: [
        { term: `Top-K query`, def: `Return the K items with the highest score in some scope, sorted. Here the items are videos, the score is views and the scope is a time window.`, why: `The answer is tiny and there are only four scopes, so it can be computed ahead of time. The hard part is keeping scores correct for billions of videos over moving windows.`, demo: `topkEstimator` },
        { term: `View event stream`, def: `Counted views arrive on a durable, partitioned log (Kafka) with a video ID and event time. The system consumes it instead of exposing a write API.`, why: `It decouples us from playback, buffers bursts and allows replay: rewind and recompute after a crash or bug.` },
        { term: `Tumbling window`, def: `Fixed, non-overlapping windows aligned to the clock (10:00-11:00, 11:00-12:00).`, why: `Each view lands in exactly one window and a window is final once it closes, so it is the simple default to propose.`, demo: `windowTypes` },
        { term: `Sliding window`, def: `A trailing interval ending now (at 10:06, "last hour" is 09:06-10:06), advancing in small steps.`, why: `Fresher, but every view must later be subtracted, so you keep history (per-minute counts or the log itself).`, demo: `windowTypes` },
        { term: `Event time and lateness budget`, def: `Count views by when they happened, and let each window wait a bounded time (e.g. 30 s via a watermark) for stragglers before it is final.`, why: `It is the knob between freshness and completeness, and it must fit inside the freshness target.`, demo: `windowTypes` },
        { term: `Exact vs approximate`, def: `Exact counts every view; approximate allows small, bounded errors in counts or in the order near position K.`, why: `Approximation unlocks fixed-memory structures, but only for trend features. Start exact; offer approximation with its error stated.`, demo: `cmsTopK` },
        { term: `Precomputed answers`, def: `A refresher computes each window's top 1,000 on a schedule (every minute) and writes it to a cache; the API only reads the cache.`, why: `Few distinct questions, asked constantly. Precomputing removes the slow query from the request path and avoids the TTL expiry cliff.`, demo: `servingStrategy` },
        { term: `Redis as the serving layer`, def: `Each window's answer lives in Redis (a sorted set or a serialised list), published with an atomic rename and a TTL much longer than the refresh interval.`, why: `Reads take about a millisecond, and a slow or dead refresher means slightly stale answers, not errors.`, demo: `servingStrategy` },
        { term: `Why windowed top K is expensive`, def: `Ranking by a window's total needs every video's buckets summed first; no index orders a sum, and merging per-bucket leaders misses steady performers.`, why: `It is the core difficulty: any design that aggregates at read time scans data proportional to the window.`, demo: `windowQueryCost` },
        { term: `Partitioning by video ID`, def: `Use the video ID as the Kafka key so all views of a video go to one partition and one consumer, and shard counters on the same key.`, why: `One owner per counter: no contention between consumers, no lost updates, and a clean seam for everything downstream.`, demo: `shardMerge` },
        { term: `Shard-and-merge`, def: `Ask each shard for its own top K and merge the lists.`, why: `Exact only because each video's full count lives on one shard. With round-robin placement, partial counts can keep the true winner off every local list.`, demo: `shardMerge` },
        { term: `Hot keys and two-stage aggregation`, def: `A viral video can overload its partition. Count locally wherever events land, then re-key the partial sums by video and add them up (or salt known hot keys).`, why: `Keeps load even without giving up exact, keyed final counts.`, demo: `shardMerge` },
        { term: `Stream aggregation (micro-batching)`, def: `A stream processor sums views per video per interval in memory and flushes the sums as bulk upserts.`, why: `Popularity is skewed, so distinct videos per minute are far fewer than views: writes drop 10-100×.`, demo: `batchingWrites` },
        { term: `Idempotent upserts and replay`, def: `Checkpoint state with Kafka offsets; after a crash, restore and replay. Sinks write the full value for a (video, window) key, never "+37".`, why: `Replay repeats writes; full-value upserts make repeats harmless, turning at-least-once processing into correct counts.` },
        { term: `Running window totals with an index`, def: `One table per window (last hour, day, month, all time) holding each video's current total, indexed by views.`, why: `Every window's top K becomes an index walk of K entries. The cost moves to writes, which are already batched.`, demo: `windowQueryCost` },
        { term: `Sliding window by bucket add/subtract`, def: `Every minute: total += the minute that just closed − the minute that just left the window.`, why: `Work is proportional to recent activity, but you must keep minute counts for the whole window (60 per video for an hour, 43,200 for a month).`, demo: `slidingCounter` },
        { term: `Count-Min Sketch + heap`, def: `A d × w grid of counters estimates any video's count (minimum over d hashed cells, never under); a min-heap a few times larger than K remembers which IDs look heavy.`, why: `Finds heavy hitters in megabytes regardless of catalogue size, if small errors near position K are acceptable.`, demo: `cmsTopK` },
        { term: `Why not a generic time series DB`, def: `InfluxDB or Prometheus store one series per tag combination; with video ID as a tag that is billions of series.`, why: `Great for one video's view graph, poor at ranking all of them. TimescaleDB continuous aggregates or Druid/Pinot/ClickHouse fit better, at an operational cost.` }
      ],
      interview: [
        { q: `What would you clarify before designing a top-K system?`, a: `Which windows and whether they tumble or slide; exact or approximate; the freshness budget; the maximum K; read latency and volume; event scale; and whether arbitrary historical ranges are needed. I'd propose defaults (tumbling hour/day/month plus all time, exact, ≤ 1 minute, K ≤ 1,000, tens of ms) and confirm them.`, diff: `easy` },
        { q: `Why propose tumbling windows first?`, a: `Each view lands in exactly one window, so a window is a running total that is final once it closes and the lateness budget passes. Sliding windows require subtracting every view later, which means keeping per-minute history. Tumbling gets a working design on the board; sliding becomes a deliberate deep dive.`, diff: `easy` },
        { q: `Estimate the write rate and storage.`, a: `70B views/day over ~10<sup>5</sup> s is ~700-800K writes/s, ~1.5M at peak. About 1M new videos a day gives ~3.6B over ten years; at 16 bytes per (ID, count) that is ~58 GB per set of counters. The counts fit in memory; the write rate is ~80× one database node.`, diff: `med` },
        { q: `Why cap K?`, a: `So each answer is a small, fixed-size value that can be precomputed and cached under one key: store the top 1,000 and slice it. A request for millions of rows is a data export, not a low-latency query.`, diff: `easy` },
        { q: `Why is all-time top K cheap but last-day top K expensive in the baseline?`, a: `All-time totals are one row per video with an index on views, so the top K is the first K index entries. A day's totals must be built by summing every active video's 24 hourly buckets before sorting; no index orders a sum, so it is a scan of hundreds of millions of rows.`, diff: `med` },
        { q: `Cache with a TTL, or precompute?`, a: `Precompute. With a TTL, every expiry and every new window causes a burst of misses that run the slow query; coalescing protects the database but the waiting requests still take seconds. A refresher that writes each answer every minute keeps reads flat, and a long TTL serves stale data if it falls behind.`, diff: `med` },
        { q: `What happens if the refresher dies?`, a: `Readers keep getting the last answers until their long TTL runs out, so the shelf goes slightly stale rather than failing. Alert on answer age, run the job under a scheduler or leader lock, and make each run idempotent so retries are harmless. Don't fall back to querying the database per request; that recreates the thundering herd.`, diff: `med` },
        { q: `Is merging per-shard top K lists exact?`, a: `Yes, if counters are sharded by video ID. Each video's full count is on one shard; a video in the global top K is beaten by fewer than K videos overall, so by fewer than K on its own shard, so it appears in that shard's top K. With round-robin placement a video's views are split, and partial counts can keep the true winner off every list.`, diff: `med` },
        { q: `How much does pre-aggregation save, and what does it cost?`, a: `Writes per flush equal distinct videos per interval. With skewed popularity a minute's ~48M views touch a few million videos, and longer intervals fold more repeats, so writes drop 10-100×. The cost is state in memory and up to one flush interval of delay, so keep minute panes for freshness and fold them into hour and day totals.`, diff: `med` },
        { q: `A video goes viral. What breaks and how do you fix it?`, a: `Its partition, consumer and shard take a disproportionate share of events, so that consumer lags and holds back the watermark. Pre-aggregate in an earlier stage (count anywhere, then re-key partial sums) or salt the hot key into sub-keys and recombine. Alert on per-partition consumer lag.`, diff: `hard` },
        { q: `How do you avoid double counting after a crash?`, a: `Checkpoint state together with consumed offsets, restore and replay from there, and make writes idempotent: upsert the full aggregate for (video, window) instead of incrementing. For running totals updated by deltas, record the last applied pane per shard in the same transaction and skip replays.`, diff: `med` },
        { q: `Rollups or per-window running totals?`, a: `Rollups (daily, monthly rows) reduce rows per video but the refresher still aggregates every active video each time. Per-window totals with an index on views make every window an index walk, at the cost of updating several tables per flush. With batched upserts from the stream job, per-window totals win.`, diff: `med` },
        { q: `How do you support a sliding last hour, and should the month slide too?`, a: `Aggregate per minute; every minute add the newest minute to the hour total and subtract the minute that left, keeping an hour of minute buckets (a few GB). A month sliding by the minute needs 43,200 buckets per video (terabytes) for a ranking that barely moves, so slide the hour and tumble or step hourly the day and month.`, diff: `med` },
        { q: `Explain the lagged-consumer trick.`, a: `A second consumer group reads the same topic but trails the live one by exactly the window length, subtracting each event as it ages out. The log is the history, so no bucket table is needed. It requires retention of at least the longest window (tens of TB for a month) and the same event-time and lateness rules as the adder.`, diff: `hard` },
        { q: `Why not keep all the state in Flink and skip the database?`, a: `You can: keyed per-window counts in RocksDB-backed state, a second stage merging local top-K lists, results written straight to Redis. It removes the database and refresher and recovers consistently from checkpoints. The cost is depth: state size, checkpoint duration, rescaling and harder debugging. Offer it after the primitives-based design.`, diff: `hard` },
        { q: `How does a Count-Min Sketch give you the top K, and what errors does it make?`, a: `It doesn't alone; it forgets IDs. Add each event to the sketch, read back the estimate and offer the video to a min-heap a few times larger than K. Estimates never undercount and overcount by at most εN with probability 1 − δ (w = e/ε, d = ln 1/δ). Items near position K can swap or drop out; a wider sketch and larger heap shrink that.`, diff: `hard` },
        { q: `Would you use InfluxDB or Druid for this?`, a: `Not InfluxDB: with video ID as a tag there are billions of series and ranking touches all of them. Druid, Pinot or ClickHouse can work, since they roll up on ingest and answer group-by-limit queries quickly, but they're heavy to operate and, e.g., Druid's TopN is approximate because segments are partitioned by time. Pick one if the organisation already runs it or needs many ad hoc slices.`, diff: `med` },
        { q: `Walk through the final design end to end.`, a: `Views go to Kafka keyed by video. A stream job with a 30 s watermark aggregates per video per minute, checkpoints with offsets and bulk-upserts idempotently into per-window totals sharded by video (sliding hour, tumbling day and month, all time). Every minute a refresher merges each shard's top 1,000 per window into Redis. A stateless query service reads only Redis.`, diff: `hard` }
      ],
      cheatsheet: [
        { title: `Requirements and defaults`, type: `table`, headers: [`Question`, `Default`, `What it changes`], rows: [
          [`Which windows?`, `Last hour, day, month, all time`, `How many sets of totals you maintain`],
          [`Tumbling or sliding?`, `Tumbling; slide the hour as a deep dive`, `Whether old views must be subtracted`],
          [`Exact or approximate?`, `Exact first`, `Whether sketches are allowed`],
          [`How fresh?`, `≤ 1 minute`, `Watermark ~30 s, refresh every minute`],
          [`How big is K?`, `≤ 1,000`, `Size of each precomputed answer`],
          [`Read latency?`, `Tens of ms`, `Precompute; no read-time aggregation`],
          [`Arbitrary ranges?`, `Out of scope`, `Avoids a general OLAP store`]
        ] },
        { title: `Numbers`, type: `code`, body: `writes:   70e9 views/day / 1e5 s/day      ~ 700-800K/s (peak ~2x)
videos:   3,600 s uploaded/s / 360 s avg  ~ 10/s ~ 1M/day
catalog:  1M/day * 365 * 10 years         ~ 3.6B videos
counters: 3.6B * (8 B id + 8 B count)     ~ 58 GB per set
one node: ~10K indexed updates/s          -> ~80 nodes for per-view writes
sliding:  minute buckets per video        60 (hour) / 1,440 (day) / 43,200 (month)
CMS:      w = e/eps, d = ln(1/delta)      eps=1e-5, delta=1e-3 -> ~15 MB` },
        { title: `Final design`, type: `code`, body: `view events --> Kafka "view-events" (key = videoId, retention >= 30 days)
                    |
      stream job: watermark 30 s, minute panes, checkpoints (state + offsets)
                    |  idempotent bulk upserts per flush
      per-window totals (hour, day, month, all time)
      sharded by videoId, index on views
                    |  every minute: top 1,000 per shard, merged per window
                Redis topk:{window}  (atomic swap, long TTL, serve stale)
                    ^
      clients --> LB --> query service (stateless, reads cache only)
      GET /views/top?window=hour&k=100` },
        { title: `Deep-dive decisions`, type: `table`, headers: [`Question`, `Weak`, `Better`, `Best`], rows: [
          [`Absorb ~800K writes/s`, `One DB write per view`, `Shard counters by video ID`, `Partition by video + aggregate in the stream + bulk upserts`],
          [`Serve in tens of ms`, `Query per request`, `Cache with a TTL (+ coalescing)`, `Scheduled precompute into Redis, long TTL`],
          [`Windowed top K`, `Sum hour buckets at read time`, `Hour + day + month rollups`, `Running total per window, indexed by views`],
          [`Sliding windows`, `Engine-native sliding window`, `Minute buckets, add/subtract`, `Hybrid: slide the hour, tumble day and month`],
          [`Hot videos`, `Ignore skew`, `Salt known hot keys`, `Two-stage aggregation + per-partition lag alerts`],
          [`Crash recovery`, `Increment deltas`, `Checkpoint + replay`, `Checkpoint + replay + idempotent full-value upserts`]
        ] },
        { title: `Exact vs approximate`, type: `table`, headers: [``, `Exact (per-window totals)`, `Approximate (Count-Min Sketch + heap)`], rows: [
          [`Memory`, `Grows with active videos (GB per window)`, `Fixed by error bound (MB per window)`],
          [`Errors`, `None`, `Overcounts ≤ εN w.p. 1 − δ; swaps near position K`],
          [`Lists IDs?`, `Yes`, `Only via the candidate heap (3-5× K)`],
          [`Combine windows`, `Sum totals`, `Add sketches cell by cell`],
          [`Fits`, `Payouts, official counters, default answer`, `Trending shelves, when the product agrees`]
        ] }
      ],
      labs: [`topkEstimator`, `windowTypes`, `shardMerge`, `batchingWrites`, `servingStrategy`, `windowQueryCost`, `slidingCounter`, `cmsTopK`]
    }
  ]
};
