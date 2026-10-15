// Deep dive: Chapter 18, Numbers to know and back-of-the-envelope estimation. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch18 = {
  hook: `<p>Two candidates get the same prompt: design a bookmarking service for 5 million daily users. The first draws a sharded database across 16 nodes, a Kafka cluster, three cache tiers and a multi-region setup, because "it needs to scale". The second spends two minutes on arithmetic: maybe 50 million requests a day, about 600 per second on average and a few thousand at peak; a couple of million new bookmarks a day at about 1 KB each is under a terabyte a year. Then she says: "One PostgreSQL primary with a replica and a small Redis cache handles this comfortably; here is what would make me shard later."</p>
<p>The second design is cheaper, simpler and more likely to work, and it took two minutes of numbers to get there. Estimation is how you decide whether you need a cache, shards, a queue or another region, and it only works if your sense of what one machine can do is current. Rules of thumb from a decade ago underestimate modern hardware by orders of magnitude and push designs toward needless complexity.</p>`,
  sections: [
    {
      id: "why-numbers-matter",
      title: "Why your hardware intuition needs updating",
      kicker: "The problem",
      blocks: [
        {
          type: "problem",
          html: `<p>Many system design habits were formed when a large server had a few dozen gigabytes of RAM and spinning disks. Advice like "shard once a table passes 100 GB" or "never keep the dataset in memory" made sense then. Applied today, it leads to distributing data that fits comfortably in one machine's memory, and to paying the permanent costs of sharding, routing and cross-shard queries for capacity nobody needed.</p>`,
        },
        {
          type: "text",
          html: `<p>Look at what a cloud provider will rent you by the hour. General-purpose instances with 128 vCPUs and 512 GiB of RAM are ordinary catalogue items. Memory-optimised instances reach several terabytes of RAM, and AWS's High Memory instances go up to 24 TiB. Storage-optimised instances carry tens of terabytes of local NVMe (an i3en.24xlarge has 60 TB), and dense-storage instances hold hundreds of terabytes of hard disk (a d3en.12xlarge has 336 TB). Object storage such as S3 is effectively unlimited for blobs.</p>
<p>Networks have grown too: 25 Gbps is a common figure for server networking inside a data centre, with high-end instances offering 100 Gbps or more. Within one availability zone a round trip is well under a millisecond.</p>
<p>The practical consequence: an entire product's hot dataset often fits in one machine's RAM, a single relational primary can hold many terabytes, and "do we need to distribute this?" deserves an actual calculation rather than a reflex.</p>`,
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
          html: `<p>Hardware numbers drift quickly, so memorise <em>orders of magnitude</em> rather than SKUs: hundreds of GB to a few TB of RAM, tens of TB of SSD, tens of Gbps of network per machine. That is enough to make every scaling decision in an interview.</p>`,
        },
      ],
    },
    {
      id: "latency-ladder",
      title: "The latency ladder",
      kicker: "Latencies",
      blocks: [
        {
          type: "idea",
          html: `<p>A few latencies, each roughly 10 to 1,000 times the one before, explain most design decisions: why caches live in memory, why SSDs replaced disks for databases, why you can chain several calls inside a data centre but not across continents.</p>`,
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
          type: "text",
          html: `<p>Read the ladder as a set of ratios. Memory (about 100 ns) is roughly 1,000 times faster than an SSD random read (about 100 &micro;s), which is why an in-memory cache beats even a well-indexed database read. An SSD read is about 100 times faster than an HDD seek (about 10 ms), which is why databases moved to SSDs. A round trip inside a zone (about half a millisecond) is cheap enough to make several per request; a cross-region round trip (around 100 ms) is not, so a design that calls another continent on every request has a latency floor nobody can optimise away.</p>
<p>That floor is physics. Light in optical fibre travels at about two thirds of its speed in vacuum, roughly 200 km per millisecond. New York to London is about 5,600 km, so a round trip cannot take less than about 56 ms even on a perfect straight cable, and real routes are longer.</p>`,
        },
        {
          type: "lab",
          id: "latencyLadder",
          caption: "Compare the latencies on a log scale, then switch to the human scale where 1 nanosecond becomes 1 second: a memory access becomes a couple of minutes, an SSD read more than a day, and a cross-region round trip a few years.",
        },
        {
          type: "keypoints",
          title: "Ratios worth remembering",
          items: [
            "Memory is ~1,000x faster than an SSD random read.",
            "An SSD random read is ~100x faster than an HDD seek.",
            "A same-zone round trip (~0.5 ms) is ~200x cheaper than a cross-region one (~100 ms).",
            "A Redis read (~0.5-1 ms including the network) is typically 5-50x faster than a database query that touches disk or does real work.",
          ],
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
          type: "text",
          html: `<p>To decide how many of something you need, compare your load with what one instance handles. These are rough single-node figures for typical workloads, good for deciding "one or many", not benchmarks.</p>
<p><strong>Application servers.</strong> Tens of cores and plenty of RAM; thousands to tens of thousands of requests per second for simple endpoints, depending heavily on what each request does. With asynchronous I/O, one server can hold on the order of 100,000 mostly idle connections (WebSockets, long polls), limited by memory per connection and file descriptors. They are stateless, so you scale them by adding more behind a load balancer and watch CPU, not connection counts.</p>
<p><strong>Caches (Redis, Memcached).</strong> Sub-millisecond operations and on the order of 100,000 or more operations per second per node, more with pipelining. Memory per node ranges from tens of GB to around a terabyte. One node covers most interview read loads; shard when data or throughput outgrows it.</p>
<p><strong>Relational databases (PostgreSQL, MySQL).</strong> Indexed point reads in about 1-5 ms when they touch disk, faster when cached. Thousands to tens of thousands of writes per second and tens of thousands of simple reads per second per node, with read replicas multiplying read capacity. Tens of terabytes per primary is manageable with good operations.</p>
<p><strong>Message queues (Kafka).</strong> Hundreds of thousands to around a million messages per second per broker for small messages, with single-digit-millisecond latency and retention measured in days or weeks. The queue is rarely the bottleneck; partition count sets consumer parallelism.</p>`,
        },
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
          type: "realworld",
          items: [
            { org: "WhatsApp", title: "Connections per server (2012)", html: "WhatsApp's engineering blog described tuning FreeBSD and Erlang servers to hold more than two million concurrent TCP connections on a single machine, far beyond what many designs assume." },
            { org: "Apache Kafka", title: "LinkedIn benchmark (2014)", html: "A LinkedIn engineering post titled \"Benchmarking Apache Kafka: 2 Million Writes Per Second (On Three Cheap Machines)\" showed how far sequential disk I/O and batching take a small cluster." },
            { org: "Amazon S3", title: "Per-prefix request rates", html: "AWS documents that S3 supports at least 3,500 write and 5,500 read requests per second per prefix, and that spreading objects over more prefixes scales further." },
          ],
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>Most consumer apps read 10 to 100 times more than they write. A high read:write ratio points to caches and read replicas. A write-heavy workload (metrics, events, chat messages) points to LSM-based stores, queues that absorb bursts, and eventually sharding, because replicas add no write capacity.</p>`,
        },
      ],
    },
    {
      id: "estimation-method",
      title: "Back-of-the-envelope estimation, step by step",
      kicker: "The method",
      blocks: [
        {
          type: "text",
          html: `<p>Estimation in an interview is not about precision. It is about getting within a factor of a few, fast, so you can tell whether a design needs one machine or a hundred. Round aggressively, say your assumptions out loud, and keep the arithmetic simple enough to do in your head.</p>`,
        },
        {
          type: "steps",
          title: "From users to machines",
          items: [
            "<strong>Requests per day</strong> = daily active users x actions per user per day.",
            "<strong>Average QPS</strong> = requests per day / 86,400. Round the day to 100,000 seconds: 1 million per day is about 12 per second, 100 million per day about 1,200.",
            "<strong>Peak QPS</strong> = average x 2-10, depending on how spiky traffic is (daily cycles, events, launches).",
            "<strong>Split reads and writes</strong> using the read:write ratio, since they scale differently.",
            "<strong>Storage per year</strong> = writes per day x bytes per write x 365, times the replication factor. Keep media separate from records.",
            "<strong>Bandwidth</strong> = QPS x response size, at peak.",
            "<strong>Compare</strong> each number with single-node limits and decide: one instance, replicas, a cache, a CDN, or shards.",
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
          type: "quiz",
          q: "A service has 50 million daily active users, each making 30 requests a day. What average request rate should you plan around, and roughly what peak?",
          options: [
            "About 1,700/s average, 5K/s peak",
            "About 17,000/s average, 50-80K/s peak",
            "About 170,000/s average, 1M/s peak",
            "About 1.5 billion/s",
          ],
          answer: 1,
          explain: "50M x 30 = 1.5 billion requests a day. Divided by about 86,400 (or 100,000 for easy maths) that is roughly 15-17K per second on average, and a 3-5x peak gives 50-80K per second: a fleet of stateless app servers, with the database's needs depending on the read:write split and caching.",
        },
      ],
    },
    {
      id: "worked-example",
      title: "A worked example: a photo-sharing app",
      kicker: "Putting it together",
      blocks: [
        {
          type: "text",
          html: `<p>Assume 20 million daily active users. Ten percent upload one photo a day, and every user views about 100 photos and loads their feed 10 times a day. Photos average 2 MB as uploaded and about 200 KB as served in the feed. Metadata (owner, caption, timestamps, counts) is about 1 KB per photo.</p>`,
        },
        {
          type: "table",
          title: "The numbers",
          headers: ["Quantity", "Calculation", "Result"],
          rows: [
            ["Uploads", "20M x 10% = 2M/day; / 86,400", "~23/s average, ~100/s peak"],
            ["Photo storage", "2M x 2 MB", "4 TB/day, ~1.5 PB/year (before replicas or resized copies)"],
            ["Metadata storage", "2M x 1 KB", "2 GB/day, ~730 GB/year"],
            ["Feed loads (metadata reads)", "20M x 10 = 200M/day", "~2,300/s average, ~10K/s peak"],
            ["Photo views", "20M x 100 = 2B/day", "~23K/s average, ~100K/s peak"],
            ["Image bandwidth at peak", "100K/s x 200 KB", "~20 GB/s, about 160 Gbps"],
          ],
        },
        {
          type: "text",
          html: `<p>Now let each number make a decision:</p>
<ul>
<li><strong>Photo bytes</strong> (petabytes, 160 Gbps at peak) cannot sensibly live in or flow through a database or app servers. They go to object storage, served through a CDN so the edge absorbs the bandwidth near users.</li>
<li><strong>Metadata</strong> at well under a terabyte a year fits on one relational primary for years. No sharding needed yet.</li>
<li><strong>Metadata reads</strong> at about 10K/s peak are within reach of a primary plus read replicas, and a Redis cache for hot feeds and profiles keeps database load and latency low.</li>
<li><strong>Uploads</strong> at about 100/s peak are trivial for the database; the heavy part, resizing images, belongs on a queue with background workers.</li>
</ul>
<p>Two minutes of arithmetic produced the architecture: CDN plus object storage for media, one database with replicas and a cache for metadata, and a queue for image processing. Just as important, it shows what is <em>not</em> needed, and what number would change that (metadata writes in the tens of thousands per second, or tens of terabytes of records).</p>`,
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>Separate the big bytes from the small records early. Media and blobs dominate storage and bandwidth and belong in object storage behind a CDN; the database holds only metadata and pointers. Most "do we need to shard?" questions disappear once you do.</p>`,
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
          type: "text",
          html: `<p>Do estimates where they change a decision, not as a ritual at the start. A good moment is right after the functional requirements: work out QPS, storage and the read:write ratio, then let them justify each component you add. Later, when you propose a cache or sharding, point back at the number that requires it.</p>
<p>Keep the arithmetic visible and rounded: "a day is about 100,000 seconds", "a KB times a billion is a TB". Interviewers care much more about whether you reach the right order of magnitude and draw the right conclusion than about exact figures.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>A strong estimation segment sounds like:</p>
<ol>
<li>"10M DAU, about 20 requests each: 200M a day, roughly 2,300 per second, maybe 10K at peak."</li>
<li>"Reads outnumber writes about 20 to 1, so reads are the pressure: a cache and replicas."</li>
<li>"Records are about 1 KB, a million new ones a day: around 1 TB a year with replication. One database is fine."</li>
<li>"Media goes to object storage behind a CDN; that's where the petabytes are."</li>
<li>"I'd revisit sharding if writes approach the tens of thousands per second."</li>
</ol>`,
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Over-engineering is a red flag, not a safety margin: sharding a database that fits on one machine, caching data that is already fast, or going multi-region for a single-country app. Each adds permanent cost and failure modes, and using outdated limits ("split at 100 GB") signals book knowledge rather than hands-on judgment.</p>`,
        },
        {
          type: "quiz",
          q: "A chat app expects 10 million concurrent users with mostly idle WebSocket connections. Roughly how many connection servers should you plan for, and what else does the number imply?",
          options: [
            "One server; connections are free",
            "On the order of 100 servers at ~100K connections each, plus a way to route each message to the server holding the recipient's connection",
            "About 10 million servers, one per user",
            "About 10,000 servers, because each can hold only 1,000 connections",
          ],
          answer: 1,
          explain: "With async I/O a modern server holds on the order of 100K mostly idle connections, limited by memory per connection and file descriptors, so 10M users needs roughly 100 or more servers with headroom. The design then needs a lookup or pub/sub layer that knows which server each user is connected to.",
        },
      ],
    },
  ],
  takeaways: [
    "Modern machines are big: hundreds of GB to TBs of RAM, tens of TB of SSD and tens of Gbps of network. Outdated limits lead to over-engineered designs.",
    "Know the latency ladder by ratios: memory ~1,000x faster than SSD, SSD ~100x faster than HDD seeks, a cross-region round trip ~200x a same-zone one.",
    "Rough single-node limits: app servers thousands of requests/s, Redis ~100K ops/s, a relational primary ~5-20K writes/s and tens of TB, a Kafka broker hundreds of thousands of messages/s.",
    "QPS = DAU x actions / ~100,000 seconds; peak is 2-10x average. Storage = writes/day x size x 365 x replication.",
    "Separate media from records: object storage and a CDN for bytes, the database for metadata.",
    "Estimate where it changes a decision, round aggressively, and point back to the number whenever you add a cache, replicas, shards or regions.",
  ],
  furtherReading: [
    { title: "Latency numbers every programmer should know", note: "The table popularised by Jeff Dean and Peter Norvig; useful for ratios, though the absolute figures date from older hardware." },
    { title: "Amazon S3 performance guidelines", url: "https://docs.aws.amazon.com/AmazonS3/latest/userguide/optimizing-performance.html", note: "Documented per-prefix request rates and how to scale beyond them." },
    { title: "Amazon EC2 instance types", url: "https://aws.amazon.com/ec2/instance-types/", note: "Current CPU, memory, storage and network sizes, for keeping your numbers fresh." },
  ],
};
