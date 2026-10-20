// Main tab: Chapter 18, Numbers to know and estimation. Format: DeepSection[] in public/shared/notes.d.ts.
window.MAIN = window.MAIN || {};
MAIN.ch18 = [
  {
    id: "why-numbers",
    title: "Why the numbers decide the design",
    kicker: "Mental model",
    blocks: [
      {
        type: "text",
        html: `<p>Almost every scaling decision in an interview is a comparison: is the load bigger than what one machine can handle? Should we cache, shard, add a queue, or go multi-region? You cannot answer without two things: a rough estimate of the load, and a rough sense of what a single component can do. Neither has to be precise. Being within a factor of two or three is plenty, because the decisions change at orders of magnitude.</p><p>The trap is using outdated limits. Rules of thumb from a decade ago ("shard past 100 GB", "memory is scarce") undersell modern hardware badly and lead to designs that are far more complicated than they need to be. Interviewers notice. Current numbers, used confidently, signal that you have actually run systems.</p>`,
      },
    ],
  },
  {
    id: "numbers",
    title: "The numbers worth memorising",
    kicker: "Reference",
    blocks: [
      {
        type: "table",
        title: "Latencies (orders of magnitude)",
        headers: ["Operation", "Roughly", "What it tells you"],
        rows: [
          ["Read from main memory", "100 ns", "In-process caches are effectively free"],
          ["SSD random read", "100 µs", "About a thousand times slower than memory"],
          ["Network round trip in one zone", "0.5 ms", "Calling Redis or another service nearby is cheap"],
          ["Round trip across zones in a region", "1 to 2 ms", "Multi-zone replication is affordable"],
          ["Indexed database query", "1 to 10 ms", "Fine per request, painful at very high rates"],
          ["Round trip across regions", "50 to 150 ms", "Synchronous cross-region calls dominate latency"],
        ],
      },
      {
        type: "table",
        title: "What one node can do (rough, modern hardware)",
        headers: ["Component", "Throughput", "Capacity", "Scale out when"],
        rows: [
          ["App server", "1K to 10K+ simple requests/s", "Tens of cores, 64 to 512 GB RAM", "CPU is the limit; servers are stateless, so add more"],
          ["Redis", "100K+ operations/s", "Up to roughly 1 TB RAM", "Data or throughput exceeds one node"],
          ["PostgreSQL / MySQL primary", "Thousands to low tens of thousands of writes/s", "Tens of TB", "Sustained writes or data outgrow one primary"],
          ["Kafka broker", "Hundreds of thousands of messages/s", "Tens of TB", "Throughput per partition, rarely the bottleneck"],
          ["Object storage (S3)", "Very high", "Effectively unlimited", "Never, for capacity; it is where blobs belong"],
        ],
      },
      {
        type: "keypoints",
        title: "Handy conversions",
        items: [
          "A day has 86,400 seconds; round to 100,000 for mental maths.",
          "1 million requests a day is about 12 per second; 100 million a day is about 1,200 per second.",
          "Peak traffic is typically 2 to 10 times the daily average.",
          "1 KB times 1 billion is 1 TB; 1 MB times 1 million is also 1 TB.",
          "Consumer apps usually read 10 to 100 times more than they write.",
        ],
      },
    ],
  },
  {
    id: "method",
    title: "A four-step estimation method",
    kicker: "The method",
    blocks: [
      {
        type: "steps",
        items: [
          "<strong>Requests per second.</strong> Daily active users times actions per user per day, divided by 100,000. Multiply by a peak factor.",
          "<strong>Storage.</strong> New records per day times bytes per record times 365, times the number of years kept and the replication factor. Keep media separate from metadata.",
          "<strong>Bandwidth.</strong> Requests per second times response size, mainly to decide whether a CDN is needed.",
          "<strong>Compare with one node.</strong> Hold each result against the table above and decide: one database, replicas, a cache, or sharding.",
        ],
      },
      {
        type: "callout",
        tone: "tip",
        html: `<p>Only estimate what changes a decision. If the question is whether the database needs sharding, you need write rate and data size, not bandwidth to the nearest gigabit. Say why you are estimating before you start.</p>`,
      },
    ],
  },
  {
    id: "worked-example",
    title: "Worked example: a messaging app",
    kicker: "Putting it together",
    blocks: [
      {
        type: "text",
        html: `<p>Suppose a chat app has 50 million daily active users, each sending 40 messages a day. Messages average 1 KB including metadata, and each message is read about five times (several devices, scrolling back).</p>`,
      },
      {
        type: "table",
        headers: ["Quantity", "Calculation", "Result", "What it means"],
        rows: [
          ["Writes per day", "50M x 40", "2 billion", "A large but ordinary write volume"],
          ["Average writes/s", "2B / 100K", "About 20,000", "Already at one relational primary's ceiling"],
          ["Peak writes/s", "20K x 3", "About 60,000", "More than one primary: shard, or use a store built for writes"],
          ["Reads/s at peak", "60K x 5", "About 300,000", "Recent conversations belong in a cache"],
          ["Storage per day", "2B x 1 KB", "About 2 TB", "Grows quickly"],
          ["Storage per year", "2 TB x 365", "About 730 TB, before replication", "Far beyond one machine: a horizontally scaled store"],
        ],
      },
      {
        type: "text",
        html: `<p>The numbers make the design argument for you: a write-optimised, horizontally partitioned store such as Cassandra, partitioned by conversation ID so a conversation's messages sit together, with a cache for recent messages and a fleet of stateless servers in front. Contrast that with an app of 5 million users posting once a day: about 50 writes per second and a few gigabytes a year, which a single PostgreSQL primary handles without breaking a sweat.</p>`,
      },
    ],
  },
  {
    id: "interview-angle",
    title: "Using numbers well in the interview",
    kicker: "Interview angle",
    blocks: [
      {
        type: "list",
        title: "Habits that come across well",
        items: [
          `Round aggressively and say so: "call it 100,000 seconds in a day".`,
          `Tie every estimate to a decision: "20,000 writes a second, so one primary won't do."`,
          `Use the estimate to argue <em>against</em> complexity as often as for it: "2 TB fits on one machine, so no sharding yet."`,
          "Revisit estimates when the interviewer changes the scale, and say which parts of the design change.",
        ],
      },
      {
        type: "compare",
        title: "Common mistakes",
        items: [
          { title: "Spending ten minutes on arithmetic", tone: "bad", html: "Estimation supports the design; it is not the design. Two or three numbers are usually enough." },
          { title: "Outdated limits", tone: "bad", html: "Sharding at a few hundred gigabytes or avoiding in-memory datasets that easily fit in RAM." },
          { title: "Forgetting the peak", tone: "warn", html: "Systems fail at peak, not at the daily average. Apply a peak factor before comparing with capacity." },
          { title: "Mixing media with metadata", tone: "warn", html: "Photos and video go to object storage behind a CDN; only their metadata belongs in the database." },
        ],
      },
    ],
  },
];
