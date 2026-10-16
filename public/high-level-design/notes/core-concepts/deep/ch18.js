// Deep dive: Chapter 18, Numbers to know and back-of-the-envelope estimation. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch18 = {
  hook: `<p>This chapter gives the hardware numbers, latency ratios and single-node limits you need, plus a fast estimation method. Two minutes of arithmetic decides whether a design needs a cache, shards, a queue or another region, and stops you over-engineering.</p>`,
  sections: [
    {
      id: "hardware",
      title: "What one machine can do today",
      kicker: "Update your intuition",
      blocks: [
        {
          type: "text",
          html: `<p>Rules like "shard once a table passes 100 GB" date from servers with tens of GB of RAM and spinning disks. Today an entire product's hot dataset often fits in one machine's RAM and a single relational primary holds many terabytes, so "do we need to distribute this?" deserves a calculation, not a reflex.</p>`,
        },
        {
          type: "table",
          title: "What one machine can hold (rough, 2020s cloud hardware)",
          headers: ["Resource", "Typical large instance", "Extreme end"],
          rows: [
            ["vCPUs", "64-192", "Several hundred"],
            ["RAM", "256 GiB - 1.5 TiB", "Up to 24 TiB (specialised high-memory)"],
            ["Local NVMe SSD", "Several TB", "~60 TB"],
            ["Local HDD", "Tens of TB", "~336 TB"],
            ["Network", "25 Gbps", "100-200 Gbps"],
          ],
          note: "Exact figures change every year; what matters is the order of magnitude.",
        },
        {
          type: "callout",
          tone: "modern",
          html: `<p>Memorise <em>orders of magnitude</em>, not SKUs: hundreds of GB to a few TB of RAM, tens of TB of SSD, tens of Gbps per machine, sub-millisecond round trips within a zone, and effectively unlimited object storage.</p>`,
        },
      ],
    },
    {
      id: "latency-ladder",
      title: "The latency ladder",
      kicker: "Latencies",
      blocks: [
        {
          type: "text",
          html: `<p>A few latencies, each roughly 10 to 1,000 times the last, explain why caches live in memory, why databases moved to SSD and why you can chain calls inside a data centre but not across continents.</p>`,
        },
        {
          type: "diagram",
          title: "Approximate latencies on a log scale",
          caption: "Each tick on the axis is a factor of 1,000. Main memory is about a thousand times faster than an SSD read, and a cross-region round trip is about a thousand times slower than an SSD read.",
          svg: `<svg viewBox="0 0 640 300" role="img" aria-label="Horizontal log-scale bar chart of latencies from L1 cache to cross-region round trips">
<text x="190" y="45" text-anchor="end" font-size="12">L1 cache</text>
<rect x="200" y="30" width="4" height="20" style="fill: var(--dg-1)"/>
<text x="210" y="45" font-size="12" style="fill: var(--dg-muted)">~1 ns</text>
<text x="190" y="79" text-anchor="end" font-size="12">Main memory</text>
<rect x="200" y="64" width="92" height="20" rx="3" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="298" y="79" font-size="12" style="fill: var(--dg-muted)">~100 ns</text>
<text x="190" y="113" text-anchor="end" font-size="12">SSD random read</text>
<rect x="200" y="98" width="230" height="20" rx="3" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<text x="436" y="113" font-size="12" style="fill: var(--dg-muted)">~100 &#181;s</text>
<text x="190" y="147" text-anchor="end" font-size="12">Round trip, same zone</text>
<rect x="200" y="132" width="262" height="20" rx="3" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="468" y="147" font-size="12" style="fill: var(--dg-muted)">~0.5 ms</text>
<text x="190" y="181" text-anchor="end" font-size="12">Round trip, across zones</text>
<rect x="200" y="166" width="284" height="20" rx="3" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="490" y="181" font-size="12" style="fill: var(--dg-muted)">~1-2 ms</text>
<text x="190" y="215" text-anchor="end" font-size="12">HDD seek</text>
<rect x="200" y="200" width="322" height="20" rx="3" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/>
<text x="528" y="215" font-size="12" style="fill: var(--dg-muted)">~10 ms</text>
<text x="190" y="249" text-anchor="end" font-size="12">Round trip, cross-region</text>
<rect x="200" y="234" width="368" height="20" rx="3" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)"/>
<text x="574" y="249" font-size="12" style="fill: var(--dg-muted)">~100 ms</text>
<line x1="200" y1="266" x2="568" y2="266" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<line x1="200" y1="262" x2="200" y2="270" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<line x1="338" y1="262" x2="338" y2="270" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<line x1="476" y1="262" x2="476" y2="270" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<text x="200" y="286" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">1 ns</text>
<text x="338" y="286" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">1 &#181;s</text>
<text x="476" y="286" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">1 ms</text>
</svg>`,
        },
        {
          type: "keypoints",
          title: "Ratios worth remembering",
          items: [
            "Memory (~100 ns) is ~1,000x faster than an SSD random read (~100 &micro;s).",
            "An SSD random read is ~100x faster than an HDD seek (~10 ms).",
            "A same-zone round trip (~0.5 ms) is ~200x cheaper than a cross-region one (~100 ms). Light in fibre covers about 200 km/ms, so New York to London can't beat ~56 ms.",
            "A Redis read (~0.5-1 ms with the network) is typically 5-50x faster than a database query that touches disk or does real work.",
          ],
        },
        {
          type: "lab",
          id: "latencyLadder",
          caption: "Compare the latencies on a log scale, then switch to the human scale where 1 nanosecond becomes 1 second: a memory access becomes a couple of minutes, an SSD read more than a day, and a cross-region round trip a few years.",
        },
        {
          type: "quiz",
          q: "An API in Virginia calls a service in Singapore three times, one after another, for every user request. Roughly what latency does that add, even if both services are infinitely fast?",
          options: ["About 3 ms", "About 30 ms", "Several hundred milliseconds", "It depends only on server CPU"],
          answer: 2,
          explain: "A Virginia to Singapore round trip is on the order of 200 ms because of distance alone, so three sequential calls add several hundred milliseconds. The fixes are architectural: co-locate the services, call in parallel, cache, or batch, not faster servers.",
        },
      ],
    },
    {
      id: "component-limits",
      title: "What one app server, cache, database and queue can do",
      kicker: "Throughput",
      blocks: [
        {
          type: "table",
          title: "Rough single-node limits",
          headers: ["Component", "Throughput", "Capacity", "Scale out when"],
          rows: [
            ["App server", "1K-10K+ requests/s", "64-512 GB RAM", "CPU-bound"],
            ["Redis", "~100K+ ops/s", "Up to ~1 TB RAM", "Data or ops exceed one node"],
            ["PostgreSQL / MySQL", "~5-20K writes/s, more reads", "Tens of TB", "Writes or data exceed one primary"],
            ["Kafka broker", "~100K-1M messages/s", "Tens of TB", "Throughput or partitions per broker"],
            ["Object storage (S3)", "Thousands of requests/s per prefix", "Effectively unlimited", "Spread keys across prefixes"],
          ],
        },
        {
          type: "keypoints",
          items: [
            "<strong>App servers</strong> are stateless, so add more; with async I/O one holds on the order of 100,000 mostly idle connections (WhatsApp described over two million on one tuned machine in 2012).",
            "<strong>Databases:</strong> indexed point reads take about 1-5 ms when they touch disk; read replicas multiply read capacity, not write capacity.",
            "<strong>Kafka</strong> is rarely the bottleneck (LinkedIn showed 2 million writes/s on three cheap machines in 2014); partition count sets consumer parallelism. S3 documents at least 3,500 writes and 5,500 reads per second per prefix.",
          ],
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>Most consumer apps read 10 to 100 times more than they write. Read-heavy points to caches and replicas; write-heavy (metrics, events, chat) points to LSM stores, queues that absorb bursts and eventually sharding.</p>`,
        },
      ],
    },
    {
      id: "estimation-method",
      title: "Back-of-the-envelope estimation",
      kicker: "The method",
      blocks: [
        {
          type: "text",
          html: `<p>Aim for the right order of magnitude, fast. Round aggressively, say assumptions out loud and keep the arithmetic in your head.</p>`,
        },
        {
          type: "steps",
          title: "From users to machines",
          items: [
            "<strong>Requests per day</strong> = daily active users × actions per user.",
            "<strong>Average QPS</strong> = per day / 86,400 (round to 100,000): 1M/day ≈ 12/s, 100M/day ≈ 1,200/s.",
            "<strong>Peak QPS</strong> = average × 2-10, depending on spikiness.",
            "<strong>Split reads and writes</strong>, since they scale differently.",
            "<strong>Storage per year</strong> = writes/day × bytes × 365 × replication; keep media separate from records.",
            "<strong>Bandwidth</strong> = peak QPS × response size. Then <strong>compare</strong> with single-node limits.",
          ],
        },
        {
          type: "diagram",
          title: "Two estimates for a 10M-DAU app",
          caption: "Top: traffic from daily users to peak requests per second. Bottom: storage from daily writes to a year of replicated data. Both land comfortably within one database plus a cache.",
          svg: `<svg viewBox="0 0 640 210" role="img" aria-label="Two estimation pipelines, one for traffic and one for storage">
<defs><marker id="cc18-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<text x="10" y="28" font-size="13" font-weight="700">Traffic</text>
<rect x="10" y="38" width="104" height="52" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<text x="62" y="60" text-anchor="middle" font-size="12" font-weight="700">10M DAU</text>
<text x="62" y="78" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">daily users</text>
<rect x="135" y="38" width="104" height="52" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="187" y="60" text-anchor="middle" font-size="12">x 20 requests</text>
<text x="187" y="78" text-anchor="middle" font-size="12" font-weight="700">= 200M/day</text>
<rect x="260" y="38" width="104" height="52" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="312" y="60" text-anchor="middle" font-size="12">/ 86,400 s</text>
<text x="312" y="78" text-anchor="middle" font-size="12" font-weight="700">= ~2,300 QPS</text>
<rect x="385" y="38" width="104" height="52" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="437" y="60" text-anchor="middle" font-size="12">x 4 at peak</text>
<text x="437" y="78" text-anchor="middle" font-size="12" font-weight="700">= ~10K QPS</text>
<rect x="510" y="38" width="120" height="52" rx="6" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="570" y="60" text-anchor="middle" font-size="12">vs limits:</text>
<text x="570" y="78" text-anchor="middle" font-size="12" font-weight="700">DB + cache OK</text>
<line x1="114" y1="64" x2="133" y2="64" stroke-width="1.5" marker-end="url(#cc18-arr)" style="stroke: var(--dg-muted)"/>
<line x1="239" y1="64" x2="258" y2="64" stroke-width="1.5" marker-end="url(#cc18-arr)" style="stroke: var(--dg-muted)"/>
<line x1="364" y1="64" x2="383" y2="64" stroke-width="1.5" marker-end="url(#cc18-arr)" style="stroke: var(--dg-muted)"/>
<line x1="489" y1="64" x2="508" y2="64" stroke-width="1.5" marker-end="url(#cc18-arr)" style="stroke: var(--dg-muted)"/>
<text x="10" y="128" font-size="13" font-weight="700">Storage</text>
<rect x="10" y="138" width="104" height="52" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<text x="62" y="160" text-anchor="middle" font-size="12" font-weight="700">1M posts</text>
<text x="62" y="178" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">per day</text>
<rect x="135" y="138" width="104" height="52" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="187" y="160" text-anchor="middle" font-size="12">x 1 KB each</text>
<text x="187" y="178" text-anchor="middle" font-size="12" font-weight="700">= 1 GB/day</text>
<rect x="260" y="138" width="104" height="52" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="312" y="160" text-anchor="middle" font-size="12">x 365 days</text>
<text x="312" y="178" text-anchor="middle" font-size="12" font-weight="700">= 365 GB/yr</text>
<rect x="385" y="138" width="104" height="52" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="437" y="160" text-anchor="middle" font-size="12">x 3 replicas</text>
<text x="437" y="178" text-anchor="middle" font-size="12" font-weight="700">= ~1.1 TB/yr</text>
<rect x="510" y="138" width="120" height="52" rx="6" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="570" y="160" text-anchor="middle" font-size="12">vs limits:</text>
<text x="570" y="178" text-anchor="middle" font-size="12" font-weight="700">one DB for years</text>
<line x1="114" y1="164" x2="133" y2="164" stroke-width="1.5" marker-end="url(#cc18-arr)" style="stroke: var(--dg-muted)"/>
<line x1="239" y1="164" x2="258" y2="164" stroke-width="1.5" marker-end="url(#cc18-arr)" style="stroke: var(--dg-muted)"/>
<line x1="364" y1="164" x2="383" y2="164" stroke-width="1.5" marker-end="url(#cc18-arr)" style="stroke: var(--dg-muted)"/>
<line x1="489" y1="164" x2="508" y2="164" stroke-width="1.5" marker-end="url(#cc18-arr)" style="stroke: var(--dg-muted)"/>
</svg>`,
        },
        {
          type: "code",
          lang: "text",
          title: "Estimation cheat sheet",
          code: `QPS (avg)    = DAU x actions/user/day / 86,400      (~1e5 seconds per day)
QPS (peak)   = avg x 2-10
storage/yr   = writes/day x bytes/write x 365 x replication
bandwidth    = peak QPS x response size
cache size   = hot fraction (e.g. 20%) x working set

1M/day   ~ 12/s          100M/day ~ 1,200/s        1B/day ~ 12,000/s
1 KB x 1M = 1 GB         1 KB x 1B = 1 TB          1 MB x 1M = 1 TB`,
        },
        {
          type: "lab",
          id: "estimator",
          caption: "Enter daily users, actions per user, read:write ratio and record sizes, and see requests per second, storage and bandwidth compared with rough single-node limits, along with whether the numbers call for a cache, replicas or shards.",
        },
        {
          type: "table",
          title: "Worked example: photo sharing, 20M DAU (10% upload one 2 MB photo a day; 100 views and 10 feed loads per user)",
          headers: ["Quantity", "Calculation", "Result", "Decision"],
          rows: [
            ["Photo storage", "2M × 2 MB", "4 TB/day, ~1.5 PB/year", "Object storage"],
            ["Image bandwidth at peak", "100K views/s × 200 KB", "~20 GB/s, about 160 Gbps", "CDN"],
            ["Metadata storage", "2M × 1 KB", "2 GB/day, ~730 GB/year", "One relational primary for years"],
            ["Feed loads", "20M × 10 = 200M/day", "~2,300/s avg, ~10K/s peak", "Replicas plus a Redis cache"],
            ["Uploads", "2M/day", "~23/s avg, ~100/s peak", "Trivial; resize images via a queue"],
          ],
        },
        {
          type: "quiz",
          q: "A schema stores 500 million users at 5 KB each, with about 2,000 writes per second. Do you need to shard for this?",
          options: [
            "Yes, 500 million rows is too many for one database",
            "No: about 2.5 TB and 2K writes/s fit one modern primary with replicas; plan a shard key in case of 10x growth",
            "Yes, anything over 100 GB must be sharded",
            "No, but only if the data is stored in Redis",
          ],
          answer: 1,
          explain: "500M x 5 KB is about 2.5 TB, comfortable for one primary on fast SSDs, and 2K writes per second is well within a single node. Sharding would add permanent complexity for no present gain. It is worth choosing a shard key now so a later split is straightforward.",
        },
      ],
    },
    {
      id: "interview",
      title: "Using numbers in a design interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "callout",
          tone: "interview",
          html: `<p>Estimate right after functional requirements, where it changes decisions, and point back at the number whenever you add a component. A strong segment sounds like:</p>
<ol>
<li>"10M DAU, about 20 requests each: 200M a day, roughly 2,300 per second, maybe 10K at peak."</li>
<li>"Reads outnumber writes about 20 to 1, so reads are the pressure: a cache and replicas."</li>
<li>"Records are about 1 KB, a million a day: around 1 TB a year with replication. One database is fine."</li>
<li>"Media goes to object storage behind a CDN; that's where the petabytes are."</li>
<li>"I'd revisit sharding if writes approach the tens of thousands per second."</li>
</ol>`,
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Over-engineering is a red flag, not a safety margin: sharding a database that fits on one machine, caching what is already fast, or going multi-region for a single-country app. Outdated limits ("split at 100 GB") signal book knowledge rather than judgment.</p>`,
        },
      ],
    },
  ],
  takeaways: [
    "Modern machines are big (hundreds of GB to TBs of RAM, tens of TB of SSD, tens of Gbps); outdated limits lead to over-engineering.",
    "Know latency by ratios: memory ~1,000x faster than SSD, SSD ~100x faster than HDD seeks, cross-region ~200x a same-zone round trip.",
    "Rough single-node limits: app servers thousands of requests/s, Redis ~100K ops/s, a relational primary ~5-20K writes/s and tens of TB, a Kafka broker hundreds of thousands of messages/s.",
    "QPS = DAU × actions / ~100,000 s, peak 2-10x; storage = writes/day × size × 365 × replication. Separate media (object storage plus CDN) from records.",
    "Estimate where it changes a decision, round aggressively, and point back to the number when you add caches, replicas, shards or regions.",
  ],
  furtherReading: [
    { title: "Latency numbers every programmer should know", note: "The table popularised by Jeff Dean and Peter Norvig; useful for ratios, though the absolute figures date from older hardware." },
    { title: "Amazon S3 performance guidelines", url: "https://docs.aws.amazon.com/AmazonS3/latest/userguide/optimizing-performance.html", note: "Documented per-prefix request rates and how to scale beyond them." },
    { title: "Amazon EC2 instance types", url: "https://aws.amazon.com/ec2/instance-types/", note: "Current CPU, memory, storage and network sizes, for keeping your numbers fresh." },
  ],
};
