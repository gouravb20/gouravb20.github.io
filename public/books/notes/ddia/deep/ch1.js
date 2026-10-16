// Deep dive: Chapter 1, Reliable, scalable, and maintainable applications. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch1 = {
  hook: `<p>Your team ships a photo-sharing app. The first version is one web server and one PostgreSQL database, and it is fast. A year later you have added Redis in front of the database, Elasticsearch for search, a queue that resizes uploads, and a nightly job that copies everything into a warehouse. Then the complaints start: a user changes their name and search still shows the old one; the dashboard says the average page loads in 90 ms but support is flooded with "the app is slow"; and a one-line config change takes the whole site down for an hour.</p>
<p>None of these is a bug in PostgreSQL, Redis or Elasticsearch. Each one is a property of the <em>system you built out of them</em>: whether it keeps working when parts fail, whether it holds up as load grows, and whether people can keep changing it safely. Chapter 1 gives you the vocabulary for those three properties, <strong>reliability, scalability and maintainability</strong>, and a few tools (load parameters, percentiles) to reason about them with numbers instead of adjectives.</p>`,
  sections: [
    {
      id: "data-systems",
      title: "You are building a data system, not using a database",
      kicker: "The framing",
      blocks: [
        {
          type: "problem",
          html: `<p>Most applications today are limited by data, not CPU: how much there is, how complex it is, and how fast it changes. No single product handles every access pattern well, so real applications stitch several together. The moment you do that, the guarantees users care about (fresh search results, no lost uploads) are no longer provided by any one product. They are provided, or not, by your glue code.</p>`,
        },
        {
          type: "text",
          html: `<p>A typical stack has a few standard building blocks. A <strong>database</strong> stores the source of truth. A <strong>cache</strong> remembers the result of expensive reads. A <strong>search index</strong> answers keyword and filter queries. A <strong>message queue</strong> or stream hands work to other processes asynchronously. A <strong>batch job</strong> periodically crunches large amounts of accumulated data.</p>
<p>The boundaries between these categories are blurry. Redis is a cache that can also act as a message broker; Kafka is a message log with database-like durability; PostgreSQL can do full-text search. What matters is that once your application code sits in front of several of them, <em>you</em> are the database designer. If the cache must be invalidated when a row changes, your code does it, and if your code crashes halfway, the two disagree.</p>`,
        },
        {
          type: "diagram",
          title: "One application, many data tools",
          caption: "The client sees one API. Behind it, application code keeps a cache, a database, a search index and a queue consistent with each other, and that responsibility is the reason this book exists.",
          svg: `<svg viewBox="0 0 600 300" role="img" aria-label="A client calls application code, which talks to a cache, a primary database, a search index and a message queue">
<defs><marker id="ddia1-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="20" y="125" width="90" height="50" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="65" y="155" text-anchor="middle" font-size="13" font-weight="700">Client</text>
<rect x="170" y="110" width="130" height="80" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="235" y="145" text-anchor="middle" font-size="13" font-weight="700">Application</text>
<text x="235" y="164" text-anchor="middle" font-size="13" font-weight="700">code</text>
<rect x="380" y="20" width="200" height="42" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="480" y="46" text-anchor="middle" font-size="12">Cache (Redis)</text>
<rect x="380" y="85" width="200" height="42" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="480" y="111" text-anchor="middle" font-size="12">Primary database (PostgreSQL)</text>
<rect x="380" y="150" width="200" height="42" rx="8" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="2"/>
<text x="480" y="176" text-anchor="middle" font-size="12">Search index (Elasticsearch)</text>
<rect x="380" y="215" width="200" height="42" rx="8" style="fill: var(--dg-5-soft); stroke: var(--dg-5)" stroke-width="2"/>
<text x="480" y="241" text-anchor="middle" font-size="12">Message queue</text>
<line x1="110" y1="150" x2="166" y2="150" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia1-arrow)"/>
<line x1="300" y1="150" x2="376" y2="41" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia1-arrow)"/>
<line x1="300" y1="150" x2="376" y2="106" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia1-arrow)"/>
<line x1="300" y1="150" x2="376" y2="171" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia1-arrow)"/>
<line x1="300" y1="150" x2="376" y2="236" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia1-arrow)"/>
<text x="300" y="288" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">Keeping these four in agreement is now your job.</text>
</svg>`,
        },
        {
          type: "keypoints",
          items: [
            "Real applications combine several specialized data tools behind one API.",
            "The system's guarantees come from how you combine them, not from any one product.",
            "Three questions recur for the rest of the book: does it stay correct when things fail (reliability), does it cope with growth (scalability), and can people keep changing it (maintainability)?",
          ],
        },
      ],
    },
    {
      id: "reliability",
      title: "Reliability: faults will happen, failures do not have to",
      kicker: "Reliability",
      blocks: [
        {
          type: "idea",
          html: `<p>A <strong>fault</strong> is one component misbehaving: a disk dies, a process crashes, a packet is dropped. A <strong>failure</strong> is the system as a whole stopping serving users. You cannot drive faults to zero, so a reliable system is designed so that expected faults do not turn into failures.</p>`,
        },
        {
          type: "text",
          html: `<p>Reliability in everyday terms means the system does what users expect, tolerates their mistakes, performs well enough under the expected load, and does not let unauthorized people in. Notice that this is a property of behavior under adversity. Anything works on a good day.</p>
<p>Because faults are inevitable, some teams deliberately inject them. Netflix's Chaos Monkey randomly terminates production instances so that engineers are forced to build services that survive losing a machine. The logic is that a fault-handling path that never runs is a path that is probably broken when you finally need it.</p>
<h3>Three kinds of faults</h3>
<p><strong>Hardware faults</strong> are random and mostly independent. A hard disk's mean time to failure is often quoted at 10 to 50 years, which sounds safe until you run 10,000 of them: then you should expect about one disk to die every day. The classic defense is redundancy (RAID, dual power supplies, spare servers). In the cloud the picture shifts: individual virtual machines can vanish with little warning, so systems are built to tolerate losing whole machines, which also enables rolling upgrades without downtime.</p>
<p><strong>Software faults</strong> are worse because they are correlated. The same bug is deployed on every node, so the same unusual input can take them all down at once. On June 30, 2012, a leap second triggered a Linux kernel bug that made many applications on many servers hang at the same moment. Other examples are a runaway process exhausting shared memory, or a cascading failure where one slow service makes its callers time out and retry until they fall over too. There is no single fix; careful testing, process isolation, letting processes crash and restart, and monitoring for anomalies all help.</p>
<p><strong>Human faults</strong> are the largest category in practice. A 2003 study of large internet services found that operator configuration errors were the leading cause of outages, while hardware faults played a part in only 10 to 25 percent of them. On February 28, 2017, a mistyped command during routine debugging removed far more Amazon S3 servers than intended in the us-east-1 region, causing a multi-hour outage that affected a large slice of the web.</p>`,
        },
        {
          type: "table",
          title: "Fault classes and what defends against them",
          headers: ["Fault class", "Character", "Typical defenses"],
          rows: [
            ["Hardware", "Random, mostly independent", "Redundant disks, power and machines; multi-zone deployment; software that tolerates losing a node"],
            ["Software", "Correlated: one bug hits every node", "Testing, isolation, crash-and-restart, measuring and alerting on invariants, gradual rollout"],
            ["Human", "Most common cause of outages", "Safe-by-default tools and APIs, sandboxes and staging, canary deploys, fast rollback, clear monitoring, blameless post-mortems"],
          ],
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>Correlation is the theme. Redundancy works against hardware faults precisely because two disks rarely die in the same minute. It does nothing against a bug or a bad config that is pushed to every replica at once. That is why gradual rollouts (one zone, then one region, then everywhere) matter as much as replicas do.</p>`,
        },
        {
          type: "quiz",
          q: "You run three replicas of a service in three availability zones. A config change with a typo is pushed to all of them simultaneously and the service goes down. What does this outage illustrate?",
          options: [
            "Three replicas are not enough; you need five",
            "Redundancy protects against independent faults, not against a correlated human or software fault applied everywhere at once",
            "Availability zones are not truly independent",
            "Configuration should be stored in the database",
          ],
          answer: 1,
          explain: "The replicas were healthy and independent as hardware; the fault was the same bad input given to all of them. Staged rollouts, validation of configs before they apply, and fast rollback are the defenses against this class of fault. More replicas would just mean more identical copies of the typo.",
        },
      ],
    },
    {
      id: "describing-load",
      title: "Describing load: the Twitter home timeline",
      kicker: "Scalability, part 1",
      blocks: [
        {
          type: "problem",
          html: `<p>"Is it scalable?" has no answer. Scalability is always a question about a specific kind of growth: if requests per second double, or the dataset grows tenfold, or one user gains ten million followers, what breaks first and what are our options? Before you can answer, you need numbers that describe the load, called <strong>load parameters</strong>.</p>`,
        },
        {
          type: "text",
          html: `<p>Which numbers matter depends on the architecture: requests per second for a web server, the ratio of reads to writes for a database, the number of simultaneously active users in a chat system, or the cache hit rate. The art is picking the parameter that dominates cost. Sometimes it is the average case; sometimes a few extreme cases are the bottleneck.</p>
<p>The book's case study is Twitter around 2012. Users posted about <strong>4,600 tweets per second</strong> on average (over 12,000 at peak), while home timelines were read about <strong>300,000 times per second</strong>. Raw tweet volume is easy to store. The hard part is <em>fan-out</em>: each user follows many people and is followed by many people, and the home timeline must combine tweets from everyone you follow.</p>`,
        },
        {
          type: "diagram",
          title: "Two ways to build a home timeline",
          caption: "Left: do the work when someone reads, by fetching and merging tweets from everyone they follow. Right: do the work when someone posts, by inserting the tweet into a precomputed timeline cache for each follower.",
          svg: `<svg viewBox="0 0 620 300" role="img" aria-label="Fan-out on read merges followees' tweets at read time; fan-out on write pushes each new tweet into every follower's timeline cache">
<defs><marker id="ddia1-arrow2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<text x="150" y="24" text-anchor="middle" font-size="14" font-weight="700">Fan-out on read</text>
<text x="150" y="44" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">tweets of people you follow</text>
<rect x="15" y="54" width="85" height="40" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="57" y="79" text-anchor="middle" font-size="12">Alice</text>
<rect x="108" y="54" width="85" height="40" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="150" y="79" text-anchor="middle" font-size="12">Bob</text>
<rect x="201" y="54" width="85" height="40" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="243" y="79" text-anchor="middle" font-size="12">Carol</text>
<rect x="75" y="140" width="150" height="40" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="150" y="165" text-anchor="middle" font-size="12">Merge and sort</text>
<rect x="75" y="225" width="150" height="40" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="150" y="250" text-anchor="middle" font-size="12">Viewer opens timeline</text>
<line x1="57" y1="94" x2="135" y2="137" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia1-arrow2)"/>
<line x1="150" y1="94" x2="150" y2="136" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia1-arrow2)"/>
<line x1="243" y1="94" x2="165" y2="137" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia1-arrow2)"/>
<line x1="150" y1="180" x2="150" y2="221" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia1-arrow2)"/>
<text x="150" y="290" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">Cheap writes, expensive reads</text>
<line x1="310" y1="10" x2="310" y2="292" stroke-width="1.5" stroke-dasharray="4 4" style="stroke: var(--dg-line)"/>
<text x="460" y="24" text-anchor="middle" font-size="14" font-weight="700">Fan-out on write</text>
<rect x="385" y="54" width="150" height="40" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="460" y="79" text-anchor="middle" font-size="12">Alice posts a tweet</text>
<rect x="322" y="140" width="88" height="40" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="366" y="165" text-anchor="middle" font-size="12">Bob's cache</text>
<rect x="416" y="140" width="88" height="40" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="460" y="165" text-anchor="middle" font-size="12">Carol's cache</text>
<rect x="510" y="140" width="88" height="40" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="554" y="165" text-anchor="middle" font-size="12">Dan's cache</text>
<rect x="322" y="225" width="140" height="40" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="392" y="250" text-anchor="middle" font-size="12">Bob reads one list</text>
<line x1="460" y1="94" x2="372" y2="137" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia1-arrow2)"/>
<line x1="460" y1="94" x2="460" y2="136" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia1-arrow2)"/>
<line x1="460" y1="94" x2="548" y2="137" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia1-arrow2)"/>
<line x1="366" y1="180" x2="366" y2="221" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia1-arrow2)"/>
<text x="460" y="290" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">Expensive writes, cheap reads</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>Twitter's first design was fan-out on read: a relational query joining tweets with the follows table. It struggled to keep up with 300,000 reads per second, so they switched to fan-out on write, keeping a cached timeline per user. Since timelines are read about 65 times as often as tweets are written, it is sensible to do more work at write time.</p>
<p>The catch is the arithmetic. With an average of about 75 followers per user, 4,600 tweets per second become roughly <span class="formula">4,600 &times; 75 &asymp; 345,000</span> cache inserts per second. That is fine on average, but the distribution is extremely skewed: some accounts have tens of millions of followers, and one tweet from them means tens of millions of inserts that must finish quickly. So the key load parameter is not tweets per second; it is <strong>the distribution of followers per user</strong>, weighted by how often those users post.</p>
<p>The eventual answer was a hybrid. Most users' tweets are fanned out on write; tweets from a small number of very-high-follower accounts are fetched at read time and merged in. Different parts of the distribution get different strategies.</p>`,
        },
        {
          type: "table",
          title: "Choosing a fan-out strategy",
          headers: ["Approach", "Cost on post", "Cost on read", "Breaks down when"],
          rows: [
            ["Fan-out on read", "One insert", "Query and merge every followee", "Reads vastly outnumber writes, or users follow thousands of accounts"],
            ["Fan-out on write", "One insert per follower", "Read one precomputed list", "A single author has millions of followers"],
            ["Hybrid", "Per follower, except for huge accounts", "One list plus a few merged celebrity feeds", "Rarely; costs extra complexity"],
          ],
        },
        {
          type: "quiz",
          q: "A social app has 10,000 posts per second and an average of 200 followers per user, but 50 accounts have over 20 million followers each. Which statement about load parameters is most accurate?",
          options: [
            "The key parameter is 10,000 posts per second",
            "The key parameter is the average of 200 followers",
            "The key parameter is the follower distribution, especially the heavy tail of huge accounts",
            "The key parameter is the number of accounts",
          ],
          answer: 2,
          explain: "The average gives 2 million timeline inserts per second, which is large but uniform. A single post from a 20-million-follower account produces a burst ten times that size on its own. The shape of the distribution, not its mean, decides whether pure fan-out on write is viable.",
        },
      ],
    },
    {
      id: "describing-performance",
      title: "Describing performance: percentiles, not averages",
      kicker: "Scalability, part 2",
      blocks: [
        {
          type: "problem",
          html: `<p>Once you can describe load, you need to describe what happens to performance as it grows. A batch system cares about throughput (records processed per second). An online system cares about <strong>response time</strong>, and response time is not a number: the same request takes different times on every run because of garbage collection pauses, cache misses, network retransmissions, and queueing behind other requests.</p>`,
        },
        {
          type: "text",
          html: `<p>Two terms are easy to blur. <strong>Response time</strong> is what the client experiences: the actual processing time plus network delays plus time spent waiting in queues. <strong>Latency</strong> is strictly the time a request spends waiting to be handled, latent and not yet served. In casual speech people use them interchangeably, but when queueing dominates the distinction matters.</p>
<p>Since response time varies, treat it as a distribution. The <strong>mean</strong> is a poor summary because a few slow requests drag it far above what a typical user sees. Sort all response times from fastest to slowest instead. The middle one is the <strong>median</strong> or p50: half of requests are faster. The value that 95% of requests beat is the p95; then p99 and p99.9. The high percentiles are called <strong>tail latencies</strong>.</p>`,
        },
        {
          type: "diagram",
          title: "Twenty requests, sorted",
          caption: "The mean (82 ms) is pulled up by two slow requests and is slower than 16 of the 20 requests. The median (about 48 ms) describes the typical user; p95 and p99 describe the unlucky ones.",
          svg: `<svg viewBox="0 0 600 260" role="img" aria-label="Bar chart of twenty response times sorted ascending, with the median marked and the slow tail highlighted">
<line x1="40" y1="210" x2="580" y2="210" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<rect x="50" y="199" width="22" height="11" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="76" y="199" width="22" height="11" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="102" y="198" width="22" height="12" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="128" y="197" width="22" height="13" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="154" y="197" width="22" height="13" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="180" y="196" width="22" height="14" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="206" y="195" width="22" height="15" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="232" y="195" width="22" height="15" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="258" y="194" width="22" height="16" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="284" y="193" width="22" height="17" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="310" y="192" width="22" height="18" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="336" y="192" width="22" height="18" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="362" y="191" width="22" height="19" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="388" y="189" width="22" height="21" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="414" y="187" width="22" height="23" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="440" y="183" width="22" height="27" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="466" y="178" width="22" height="32" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="492" y="168" width="22" height="42" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="518" y="136" width="22" height="74" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)"/>
<rect x="544" y="40" width="22" height="170" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)"/>
<line x1="308" y1="40" x2="308" y2="210" stroke-width="2" stroke-dasharray="5 4" style="stroke: var(--dg-ok)"/>
<text x="316" y="60" font-size="12" font-weight="700">p50 &#8776; 48 ms</text>
<text x="60" y="60" font-size="12" style="fill: var(--dg-muted)">mean = 82 ms, slower</text>
<text x="60" y="78" font-size="12" style="fill: var(--dg-muted)">than 16 of 20 requests</text>
<text x="510" y="128" text-anchor="end" font-size="12" font-weight="700">p95 = 210 ms</text>
<text x="538" y="52" text-anchor="end" font-size="12" font-weight="700">p99 = 480 ms</text>
<text x="310" y="236" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">20 requests, sorted from fastest to slowest</text>
</svg>`,
        },
        {
          type: "text",
          html: `<h3>Why the tail matters</h3>
<p>The slowest requests often belong to your most valuable users: the customer with the largest order history has the most data to load. Amazon describes internal service targets at the 99.9th percentile for this reason, and the book cites an Amazon observation that 100 ms of extra response time cost about 1% in sales. Going past p99.9 usually is not worth it, because those outliers are dominated by random events you cannot control.</p>
<p>Percentiles also appear in contracts. A service-level objective (SLO) might say "p50 under 200 ms and p99 under 1 s, with 99.9% of requests succeeding"; a service-level agreement (SLA) attaches consequences to missing it.</p>
<h3>Queueing and tail amplification</h3>
<p>A server can process only a few requests in parallel. A handful of slow requests at the front of a queue delay every fast request behind them, called <strong>head-of-line blocking</strong>. That is why you must measure on the client side, and why a load-testing tool must keep sending at a fixed rate instead of waiting for each response; otherwise the test hides the queue it is supposed to reveal.</p>
<p>Worse, a single page often calls many backend services, and it is only as fast as the slowest call. If each call has a 1% chance of being slow, the chance that at least one of <em>n</em> calls is slow is <span class="formula">1 &minus; 0.99<sup>n</sup></span>.</p>`,
        },
        {
          type: "table",
          title: "Tail latency amplification: each backend call is slow 1% of the time",
          headers: ["Backend calls per page", "Pages hitting at least one slow call"],
          rows: [
            ["1", "1%"],
            ["10", "about 10%"],
            ["50", "about 39%"],
            ["100", "about 63%"],
          ],
          note: "A backend's p99 becomes the page's typical experience once the fan-out is large. Hedged requests (send a duplicate to another replica if the first is slow) are one standard mitigation.",
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Averaging percentiles across servers or time windows is mathematically meaningless: the average of ten servers' p99 values is not the fleet's p99. Keep histograms (or mergeable sketches such as HdrHistogram or t-digest) and compute percentiles from the combined distribution.</p>`,
        },
        {
          type: "quiz",
          q: "A product page makes 40 parallel calls to backend services, each with p99 = 800 ms and median = 20 ms. Roughly what fraction of page loads include at least one 800 ms-or-slower call?",
          options: ["About 1%", "About 4%", "About 33%", "About 99%"],
          answer: 2,
          explain: "The probability that all 40 calls are fast is 0.99 to the power 40, about 0.67, so about 33% of pages include at least one slow call. The page's response time is set by the slowest call, so the backend's p99 shows up in roughly a third of page loads.",
        },
      ],
    },
    {
      id: "coping-with-load",
      title: "Coping with load: up, out, and elastic",
      kicker: "Scalability, part 3",
      blocks: [
        {
          type: "text",
          html: `<p>An architecture that fits one level of load rarely survives a tenfold increase. Expect to rethink the design at every order of magnitude of growth, and treat "this will scale forever" as a red flag.</p>
<p>The two basic moves are <strong>scaling up</strong> (vertical: a more powerful machine) and <strong>scaling out</strong> (horizontal: spreading load across more machines, also called a shared-nothing architecture). Scaling up keeps everything on one node, so you get simple transactions and no network between your data. But the biggest machines are disproportionately expensive and there is always a ceiling. Scaling out has no hard ceiling but drags in every problem in Part II of the book: partitioning, replication, consistency, and partial failure.</p>
<p>Stateless services (web servers, API gateways) scale out easily: put a load balancer in front and add instances. Stateful systems such as databases are much harder, which is why the common advice for years was to keep the database on a single node until scale or availability forced you off it.</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "Scale up", tone: "info", html: "One bigger machine. Simple programming model, single-node transactions, no network partitions between your data. Limited by the largest machine available and by cost growing faster than capacity near the top. Still a single point of failure unless replicated." },
            { title: "Scale out", tone: "ok", html: "Many commodity machines. No hard ceiling and better fault tolerance. Requires partitioning and replication, introduces network failures and consistency questions, and makes operations more complex." },
            { title: "Elastic", tone: "warn", html: "Automatically add and remove capacity as load changes. Ideal for unpredictable traffic, but the autoscaler itself can misbehave, and stateful components scale far more slowly than stateless ones because data must move." },
          ],
        },
        {
          type: "text",
          html: `<p>There is no generic scalable architecture. A system that handles 100,000 requests per second of 1 KB each looks nothing like one that handles 3 requests per minute of 2 GB each, even though both move about the same number of bytes. Good scalable designs start from assumptions about which operations are common and which are rare, which is exactly the load-parameter thinking from the Twitter example. If those assumptions are wrong, the scaling effort is wasted or harmful, so early-stage products are usually better off optimizing for speed of iteration.</p>`,
        },
        {
          type: "callout",
          tone: "modern",
          html: `<p>Two shifts since 2017 change the "scale up until you can't" calculation. Cloud providers now rent single machines with hundreds of cores and multiple terabytes of RAM, so the ceiling for vertical scaling is far higher than it used to be. At the same time, distributed SQL databases (for example Google Spanner, CockroachDB, YugabyteDB and TiDB) have made it more common to start on a horizontally scalable database whose sharding is handled for you, trading some latency and cost for not having to re-architect later.</p>`,
        },
        {
          type: "quiz",
          q: "A startup's single PostgreSQL server is at 40% CPU with 10x growth expected over two years. Their team is three engineers. What is the most defensible plan?",
          options: [
            "Immediately shard the database across ten nodes",
            "Move everything to a leaderless NoSQL database to be safe",
            "Keep one primary (adding a replica for failover), measure the dominant load parameters, and plan the next architecture before the current one runs out",
            "Do nothing; databases scale automatically",
          ],
          answer: 2,
          explain: "Scaling up and adding a replica for availability buys a lot of runway with little complexity, which matters for a three-person team. Sharding now pays the full cost of a distributed system for load that does not exist yet. The important part is knowing which parameter will hit a limit first, so the redesign is planned rather than forced.",
        },
      ],
    },
    {
      id: "maintainability",
      title: "Maintainability: operability, simplicity, evolvability",
      kicker: "Maintainability",
      blocks: [
        {
          type: "problem",
          html: `<p>Most of the cost of software comes after the first release: fixing bugs, keeping it running, investigating incidents, moving to new platforms, adding features, and paying down past shortcuts. Engineers dislike working on legacy systems, but every system becomes legacy. The question is whether it stays pleasant to change, and that is decided by early design choices.</p>`,
        },
        {
          type: "text",
          html: `<p>The book splits maintainability into three design principles.</p>
<p><strong>Operability</strong> means making life easy for the people who keep the system running. Good operability looks like: visibility into runtime behavior through metrics and logs, support for automation, no dependency on a single machine (so one can be taken down for maintenance), good documentation and runbooks, sensible defaults, and predictable behavior with few surprises. Some routine work can be automated, but humans are still needed to set up the automation and to handle what it gets wrong.</p>
<p><strong>Simplicity</strong> means managing complexity. Complexity shows up as tangled dependencies, inconsistent naming, special cases and hacks, and an explosion of possible states. A useful distinction, borrowed from Moseley and Marks's essay "Out of the Tar Pit", separates <em>essential</em> complexity (inherent in the problem the user wants solved) from <em>accidental</em> complexity (introduced only by the implementation). The main tool against accidental complexity is <strong>abstraction</strong>: SQL hides on-disk data structures, concurrency control and crash recovery behind a declarative query language. A good abstraction hides detail without lying about its guarantees.</p>
<p><strong>Evolvability</strong> means the system can adapt to new requirements: new features, new regulations, new scale. It depends heavily on simplicity, because a system you understand is a system you can change. Later chapters return to this repeatedly, through schema evolution (Chapter 4) and through rebuilding derived data (Part III).</p>`,
        },
        {
          type: "table",
          title: "What each principle looks like in practice",
          headers: ["Principle", "Good signs", "Warning signs"],
          rows: [
            ["Operability", "Dashboards for key SLOs, runbooks, one-click rollback, nodes can be drained safely", "Only one person knows how to restart it; alerts nobody understands"],
            ["Simplicity", "Clear module boundaries, one way to do each thing, abstractions with honest guarantees", "Hidden coupling, special cases, a change in one place breaks another"],
            ["Evolvability", "Backward-compatible schemas, feature flags, tests that make refactoring safe", "Every new field requires a coordinated deploy of five services"],
          ],
        },
        {
          type: "realworld",
          items: [
            { org: "Google SRE", title: "Error budgets", html: "Google's Site Reliability Engineering practice turns an SLO into an error budget: if a service targets 99.9% success, the 0.1% is a budget that can be spent on risky launches. When it runs out, releases slow down. It is a way of making reliability and velocity trade off explicitly." },
            { org: "Netflix", title: "Chaos engineering", html: "Chaos Monkey randomly terminates production instances so that surviving instance loss is a tested, everyday behavior rather than a theory. It is an operability practice as much as a reliability one: it keeps the recovery paths exercised." },
            { org: "PostgreSQL", title: "Abstraction that holds up", html: "Applications written against PostgreSQL's SQL interface decades ago still run while the planner, storage and replication underneath have changed enormously. That is the payoff of an abstraction that hides implementation without hiding its guarantees." },
          ],
        },
        {
          type: "callout",
          tone: "modern",
          html: `<p>Observability tooling has standardized since the book was written. OpenTelemetry, formed in 2019 by merging the OpenTracing and OpenCensus projects, provides a vendor-neutral way to emit traces, metrics and logs. Distributed tracing in particular makes tail-latency amplification visible: you can see which of the forty backend calls made a page slow.</p>`,
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
          html: `<p>Chapter 1 is the opening move of nearly every system design interview. Before drawing boxes, establish the load parameters and the performance targets, because every later decision (cache or not, shard or not, push or pull) depends on them. Interviewers notice candidates who ask "what is the read-to-write ratio?" and "what is the p99 target?" before choosing a database.</p>`,
        },
        {
          type: "steps",
          title: "A requirements checklist drawn from this chapter",
          items: [
            "Name the load parameters: requests per second (average and peak), read/write ratio, data size and growth, and any fan-out or skew (followers, hot products).",
            "State performance targets as percentiles: for example p99 under 300 ms for reads, p99 under 1 s for writes.",
            "State reliability targets: availability (99.9% allows about 43 minutes of downtime a month), and which data must never be lost.",
            "Identify which faults you must tolerate: a node, a zone, a region, a bad deploy.",
            "Say how the design changes at 10x, which shows you know architectures are tied to a load range.",
          ],
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>When asked to design a news feed or timeline, walk through the trade-off explicitly:</p>
<ol>
<li>Fan-out on read is cheap to write but expensive to read; fan-out on write is the reverse.</li>
<li>Reads usually dominate, so precompute timelines on write.</li>
<li>The follower distribution is heavily skewed, so a single celebrity post can mean tens of millions of writes.</li>
<li>Use a hybrid: fan out on write for normal accounts, merge celebrity posts at read time.</li>
</ol>
<p>Then mention tail latency: if the feed calls ranking, ads and media services in parallel, the page is as slow as the slowest call, so you budget each service's p99, not its average.</p>`,
        },
        {
          type: "quiz",
          q: "An interviewer says: 'Our average API response time is 120 ms, so performance is fine.' What is the best response?",
          options: [
            "Agree; 120 ms is well under the usual 200 ms target",
            "Ask for the median and the p99/p99.9, because the average hides the slow tail that the most active users hit",
            "Suggest adding more servers",
            "Suggest switching from REST to gRPC",
          ],
          answer: 1,
          explain: "An average can look healthy while 1% of requests take several seconds, and those requests are disproportionately from heavy users or from pages that fan out to many services. Percentiles are the right way to state and check performance targets.",
        },
      ],
    },
  ],
  takeaways: [
    "Applications combine databases, caches, indexes and queues; the guarantees users see come from how you compose them, so you are the data system designer.",
    "A fault is one component deviating; a failure is the system stopping. Hardware faults are independent, software and human faults are correlated, and human configuration mistakes cause a large share of outages.",
    "Scalability is a question about a named load parameter. In the Twitter example the decisive parameter was the skewed distribution of followers per user, not tweets per second.",
    "Describe performance with percentiles. The median is the typical experience; p99 and p99.9 are the tail, which often belongs to your heaviest users.",
    "Fan-out turns a backend's tail into the page's common case: with 100 calls at 1% slow each, about 63% of pages are slow.",
    "Scaling up is simple but capped; scaling out removes the cap at the cost of distributed-systems complexity. Architectures fit a load range, so expect to redesign around each 10x.",
    "Maintainability means operability (easy to run), simplicity (little accidental complexity, honest abstractions) and evolvability (easy to change).",
  ],
  furtherReading: [
    { title: "The Tail at Scale (Jeffrey Dean and Luiz Andr&eacute; Barroso, Communications of the ACM, 2013)", note: "Why fan-out makes tail latency dominate, and techniques such as hedged requests to tame it." },
    { title: "Site Reliability Engineering (Google, O'Reilly 2016)", url: "https://sre.google/sre-book/table-of-contents/", note: "Free online. The chapters on service level objectives and error budgets turn this chapter's ideas into practice." },
    { title: "Out of the Tar Pit (Ben Moseley and Peter Marks, 2006)", note: "The essential versus accidental complexity distinction used in the simplicity discussion." },
    { title: "Summary of the Amazon S3 Service Disruption in the Northern Virginia (US-EAST-1) Region", url: "https://aws.amazon.com/message/41926/", note: "AWS's own account of the February 2017 outage caused by a mistyped command." },
  ],
};
