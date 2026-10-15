// Deep dive: Chapter 10, The evolution of large-scale data processing. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch10 = {
  hook: `<p>Open the documentation of any modern stream processor and you will find words like watermark, trigger, combiner, checkpoint, exactly-once and changelog. None of them came from nowhere. Each is the answer some team gave to a problem that hurt badly enough, at a specific company, in a specific year: too much data for one machine, pipelines too slow to hand-tune, results too late, results that were fast but wrong, data that arrived out of order.</p>
<p>This chapter is a guided tour of ten systems, from MapReduce to Apache Beam, told as a chain of problems and answers. The point is not to memorize dates. It is to see why today's tools look the way they do, so that when an interviewer asks "why not just use Storm and a nightly batch job?" or "what does Flink do that Spark Streaming originally didn't?", you can answer from the problem, not from a feature list.</p>`,
  sections: [
    {
      id: "ten-systems",
      title: "Ten systems, ten contributions",
      kicker: "The map",
      blocks: [
        {
          type: "text",
          html: `<p>The history reads best as a relay race. Each system solved one problem well and left another unsolved, and the next system picked up from there. Summarizing each by a single contribution is a simplification, but a useful one: it tells you what idea to associate with the name.</p>`,
        },
        {
          type: "table",
          title: "A timeline of the ten systems",
          headers: ["When", "System", "Origin", "Key contribution"],
          rows: [
            ["2003–2004", "MapReduce", "Google", "Scalability with a simple programming model"],
            ["2005–2006", "Hadoop", "Nutch project, then Yahoo and Apache", "An open-source ecosystem around MapReduce and HDFS"],
            ["2007 (paper 2010)", "Flume / FlumeJava", "Google", "High-level pipelines with an optimizer"],
            ["2011", "Storm", "BackType, then Twitter", "Low-latency stream processing"],
            ["2011", "Kafka", "LinkedIn", "Durable, replayable logs as the streaming transport"],
            ["2012–2013", "Spark (and Spark Streaming)", "UC Berkeley AMPLab", "Strong consistency, in memory and in microbatches"],
            ["2013", "MillWheel", "Google", "Exactly-once processing of out-of-order data: watermarks and timers"],
            ["2014–2015", "Cloud Dataflow", "Google", "Unified batch and streaming: the Dataflow Model"],
            ["2014–2015", "Flink", "Stratosphere research project, then Apache", "Open-source out-of-order streaming, snapshots and savepoints"],
            ["2016", "Beam", "Apache (from the Dataflow SDKs)", "Portability across execution engines"],
          ],
          note: "Dates mark when each system appeared or was published; internal use often started earlier.",
        },
        {
          type: "lab",
          id: "timeline",
          caption: "Click each system to see its key contribution, what it got wrong or left unsolved, and what it passed on to its successors.",
        },
        {
          type: "keypoints",
          title: "Four threads to follow through the tour",
          items: [
            "<strong>Correctness</strong>: from weak (Storm) to strong but in order (Spark Streaming) to strong and out of order (MillWheel, Dataflow, Flink).",
            "<strong>Reasoning about time</strong>: watermarks and timers (MillWheel) became windowing and triggers (Dataflow) and later the SQL EMIT ideas of Chapter 8.",
            "<strong>Optimization</strong>: Flume's fusion and combiner lifting are what make exactly-once affordable (Chapter 5).",
            "<strong>Replayability</strong>: Kafka's durable logs made reprocessing a stream practical.",
          ],
        },
      ],
    },
    {
      id: "mapreduce-hadoop",
      title: "MapReduce and Hadoop: making scale ordinary",
      kicker: "Scalability and ecosystem",
      blocks: [
        {
          type: "problem",
          html: `<p>In the early 2000s, Google had web-scale data (crawled pages, logs, link graphs) and many teams that needed to process it. Each team writing its own distributed program meant each team re-solving partitioning, scheduling, stragglers and machine failure on cheap commodity hardware. Most of their code was plumbing, and most of the plumbing had bugs.</p>`,
        },
        {
          type: "text",
          html: `<p><strong>MapReduce</strong> (described by Jeffrey Dean and Sanjay Ghemawat at OSDI 2004) drew a line between the business logic and the hard parts. The user writes two functions: <em>map</em>, which turns each input record into key/value pairs, and <em>reduce</em>, which turns all values for a key into output. The framework does everything else: splits the input, runs map tasks near the data, shuffles pairs by key, reruns tasks on failed machines, and launches backup copies of slow tasks.</p>
<p>The contribution was <strong>scalability with simplicity</strong>. An engineer who had never written a distributed system could process terabytes reliably. The cost was rigidity: every job had exactly one map, one shuffle and one reduce. Real pipelines became chains of jobs, each writing its full output to the distributed file system for the next to read, and tuning those chains was manual work.</p>
<h3>Hadoop: the same idea, for everyone</h3>
<p>Google published papers, not code. <strong>Hadoop</strong> grew out of the Apache Nutch web-crawler project, where Doug Cutting and Mike Cafarella implemented MapReduce and a file system modeled on Google's GFS; it became its own Apache project in 2006, with heavy investment from Yahoo. Its lasting contribution was the <strong>open-source ecosystem</strong>: HDFS as a shared storage layer, and a wave of tools built on top, such as Pig (from Yahoo), Hive (from Facebook) and HBase (modeled on Google's Bigtable). Hadoop inherited MapReduce's rigidity, but it made large-scale processing available to any company with a rack of servers.</p>`,
        },
        {
          type: "callout",
          tone: "history",
          html: `<p>Chapter 6 showed that even this "pure batch" engine is full of streams: a MapReduce job reads TABLE → STREAM → STREAM → TABLE → STREAM → STREAM → TABLE. The history that follows is, in a sense, the story of making those internal streams visible, longer-lived and faster.</p>`,
        },
      ],
    },
    {
      id: "flume-optimization",
      title: "Flume: pipelines and an optimizer",
      kicker: "Escaping the rigid shape",
      blocks: [
        {
          type: "problem",
          html: `<p>A realistic pipeline (parse, filter, join, aggregate, format) needs several MapReduce jobs glued together. Engineers had to decide by hand which steps to squeeze into which job, and every job boundary meant writing and re-reading the full intermediate data. The logical shape of the computation and its efficient physical shape had nothing to do with each other.</p>`,
        },
        {
          type: "text",
          html: `<p><strong>Flume</strong> (published as FlumeJava at PLDI 2010, used inside Google from around 2007) let engineers write the pipeline they meant, as a graph of operations over parallel collections, and left the physical plan to an optimizer. Evaluation was deferred: calling an operation only recorded it in a graph; the graph was optimized and executed when results were needed.</p>
<p>Two optimizations matter most for this book.</p>
<ul>
<li><strong>Fusion</strong> merges consecutive element-wise steps into one stage, so records flow from parse to filter to the next step in memory, without being written out in between. Sibling steps that read the same input can be fused too.</li>
<li><strong>Combiner lifting</strong> runs the associative part of an aggregation before the shuffle, so each worker sends one partial result per key instead of every record (Chapter 7 covers why this tames hot keys).</li>
</ul>`,
        },
        {
          type: "diagram",
          title: "From the pipeline you write to the plan that runs",
          caption: "Four logical steps become two physical stages. Parse and filter are fused with the partial count; only partial counts cross the shuffle; the final count is fused with formatting.",
          svg: `<svg viewBox="0 0 620 230" role="img" aria-label="A four-step logical pipeline optimized into two fused physical stages separated by a shuffle">
<defs><marker id="ss10-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-ink)"/></marker></defs>
<text x="20" y="30" font-size="13" font-weight="700">Logical pipeline (what you write)</text>
<rect x="20" y="44" width="120" height="40" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="80" y="69" text-anchor="middle" font-size="12">parse</text>
<rect x="170" y="44" width="120" height="40" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="230" y="69" text-anchor="middle" font-size="12">filter</text>
<rect x="320" y="44" width="120" height="40" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="380" y="69" text-anchor="middle" font-size="12">count per key</text>
<rect x="470" y="44" width="120" height="40" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="530" y="69" text-anchor="middle" font-size="12">format</text>
<line x1="142" y1="64" x2="166" y2="64" style="stroke: var(--dg-ink)" stroke-width="2" marker-end="url(#ss10-arrow)"/>
<line x1="292" y1="64" x2="316" y2="64" style="stroke: var(--dg-ink)" stroke-width="2" marker-end="url(#ss10-arrow)"/>
<line x1="442" y1="64" x2="466" y2="64" style="stroke: var(--dg-ink)" stroke-width="2" marker-end="url(#ss10-arrow)"/>
<text x="20" y="130" font-size="13" font-weight="700">Physical plan (after fusion and combiner lifting)</text>
<rect x="20" y="144" width="260" height="50" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="150" y="164" text-anchor="middle" font-size="12" font-weight="700">Stage 1</text>
<text x="150" y="183" text-anchor="middle" font-size="12">parse, filter, partial count</text>
<rect x="340" y="144" width="250" height="50" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="465" y="164" text-anchor="middle" font-size="12" font-weight="700">Stage 2</text>
<text x="465" y="183" text-anchor="middle" font-size="12">final count, format</text>
<line x1="282" y1="169" x2="336" y2="169" style="stroke: var(--dg-ink)" stroke-width="2" marker-end="url(#ss10-arrow)"/>
<text x="310" y="212" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">shuffle</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>Flume's contribution was <strong>pipelines plus optimization</strong>: write the logical graph, get an efficient plan for free. The same idea now appears almost everywhere. Spark plans a graph of transformations lazily and pipelines narrow steps within a stage; Apache Crunch was modeled on FlumeJava; and Flume itself became the batch half of Cloud Dataflow. Flume stayed internal to Google, so its influence spread through papers and successors rather than through its own code.</p>`,
        },
        {
          type: "quiz",
          q: "A pipeline does map, filter, then a sum per key. Which optimization removes the need to shuffle every individual record for the sum?",
          options: ["Fusion", "Combiner lifting", "Deferred evaluation", "Speculative execution"],
          answer: 1,
          explain: "Combiner lifting computes partial sums per key on each worker before the shuffle, so only one partial result per key per worker crosses the network. Fusion removes the materialization between map and filter, but by itself still shuffles every record into the sum.",
        },
      ],
    },
    {
      id: "storm-spark",
      title: "Storm and Spark: latency versus consistency",
      kicker: "Going fast, then going fast and right",
      blocks: [
        {
          type: "problem",
          html: `<p>Batch pipelines answer in hours. Products increasingly needed answers in seconds: trending topics, live counters, alerts. Batch engines were never designed to run continuously over data that keeps arriving.</p>`,
        },
        {
          type: "text",
          html: `<h3>Storm: low latency, weak consistency</h3>
<p><strong>Storm</strong>, created by Nathan Marz at BackType and open-sourced by Twitter in 2011 after it acquired BackType, brought stream processing to the mainstream. A topology of spouts (sources) and bolts (processing steps) handled each record as it arrived, with latencies far below anything batch could offer. Its reliability model tracked whether each input's tree of derived records was fully processed and replayed the input if not, giving at-least-once delivery; state was the user's problem, and there was no built-in exactly-once.</p>
<p>That trade-off, speed now and approximate answers, led to the <strong>Lambda Architecture</strong>, a term Marz popularized. Run Storm for fast, possibly wrong results, run a batch system over the same data for slow, correct results, and merge the two at query time. It worked, but it meant building and maintaining the same logic twice, in two systems, and reconciling them forever.</p>`,
        },
        {
          type: "text",
          html: `<h3>Spark: strong consistency, in batches</h3>
<p><strong>Spark</strong> came out of UC Berkeley's AMPLab. Its core abstraction, the resilient distributed dataset (RDD, NSDI 2012), keeps data in memory and recovers lost partitions by recomputing them from their lineage, which made iterative and interactive batch work much faster than chains of MapReduce jobs.</p>
<p><strong>Spark Streaming</strong> (the Discretized Streams paper, SOSP 2013) turned that batch engine into a streaming one by running a small deterministic batch every second or so. Each microbatch inherits the batch engine's guarantees, so results are <strong>strongly consistent</strong>: the first widely used system to show that streaming could be both low-ish latency and correct. Its limits were the flip side of the design. Latency could not go below the batch interval, and windows were defined by when data arrived, so out-of-order data in event time had no first-class tools. Spark's later Structured Streaming API added event-time windows and watermarks.</p>`,
        },
        {
          type: "compare",
          title: "The two answers to \"we need it fast\"",
          items: [
            { title: "Storm + Lambda", tone: "warn", html: "Per-record, very low latency. At-least-once at best, so a parallel batch layer supplies the correct answer later. Two codebases, two systems, a merge step." },
            { title: "Spark Streaming", tone: "info", html: "Microbatches on a consistent batch engine: one codebase, strong consistency. Latency bounded by the batch interval, and no native event-time handling for out-of-order data at the time." },
          ],
        },
        {
          type: "quiz",
          q: "What did Spark Streaming demonstrate that Storm, as originally designed, did not?",
          options: [
            "That per-record processing could beat batch latency",
            "That a streaming system could give strongly consistent results, by running repeated deterministic microbatches",
            "That event-time watermarks were necessary",
            "That replayable logs were needed for streaming",
          ],
          answer: 1,
          explain: "Storm proved low latency but offered at-least-once processing at best, which is why Lambda paired it with batch. Spark Streaming reused a consistent batch engine in small batches, showing correctness and streaming could coexist (for data processed in arrival order).",
        },
      ],
    },
    {
      id: "millwheel-kafka",
      title: "MillWheel and Kafka: out-of-order data and durable streams",
      kicker: "Time and replay",
      blocks: [
        {
          type: "problem",
          html: `<p>Real event streams are out of order: mobile clients go offline, servers buffer, regions lag. A system that windows by arrival time gets the wrong answer whenever data is late, and a system that cannot replay its input cannot recover, reprocess or fix a bug in its logic.</p>`,
        },
        {
          type: "text",
          html: `<h3>MillWheel: robust out-of-order processing</h3>
<p><strong>MillWheel</strong> (Google, VLDB 2013, with several of this book's authors among its designers) combined three things no earlier system had together. It offered <strong>exactly-once processing</strong> with persistent per-key state: each record carried an id that was checked to drop duplicates, and state changes and outputs were committed atomically. It tracked <strong>low watermarks</strong>, a per-stage estimate of the oldest event time still in flight, so computations knew how complete their input was. And it gave users <strong>timers</strong> that fire at a point in event time or wall-clock time.</p>
<p>Watermarks plus timers are the tools for <strong>reasoning about time</strong>: "compute this window once the watermark says it's complete." That is the direct ancestor of the event-time windows, triggers and watermarks of Part I, and of the event-time timers in Chapter 7's attribution example.</p>
<h3>Kafka: durable, replayable streams</h3>
<p><strong>Kafka</strong> was built at LinkedIn (by Jay Kreps, Neha Narkhede and Jun Rao, among others) and open-sourced in 2011. Messaging systems of the time, and plain TCP connections, treated a message as gone once delivered. Kafka instead stores each topic as a partitioned, replicated, append-only <strong>log</strong> that consumers read at their own offset and can rewind. That restored the property batch processing always had and streaming had lost: <strong>replayability</strong>. A failed consumer resumes from its last committed offset; a new consumer can read history from the start.</p>
<p>Kafka also spread the <strong>stream and table</strong> way of thinking (Chapter 6). Kreps' 2013 essay "The Log" argued that a log of changes is the unifying abstraction between databases and data pipelines, and his 2014 post "Questioning the Lambda Architecture" proposed what became known as the <strong>Kappa Architecture</strong>: keep one streaming codebase and, to reprocess, replay the log through a new version of the job.</p>`,
        },
        {
          type: "compare",
          title: "Lambda versus Kappa",
          items: [
            { title: "Lambda", tone: "warn", html: "A fast streaming layer plus a slow, correct batch layer over the same data, merged at query time. Correctness comes from batch; the cost is two implementations of the same logic." },
            { title: "Kappa", tone: "ok", html: "One streaming pipeline over a replayable log. To fix or change logic, run a new version over the retained log and switch over. Requires a streaming engine that is itself correct, which MillWheel-style systems made realistic." },
          ],
        },
        {
          type: "quiz",
          q: "Which pair of MillWheel features gave stream processors their tools for reasoning about event time?",
          options: [
            "Record ids and atomic commits",
            "Low watermarks and timers",
            "Microbatches and lineage",
            "Spouts and bolts",
          ],
          answer: 1,
          explain: "Record ids and atomic commits gave MillWheel exactly-once processing, which is about correctness under failure. Watermarks say how complete the input is in event time, and timers let code run when that point is reached. Together they handle out-of-order data.",
        },
      ],
    },
    {
      id: "dataflow-flink-beam",
      title: "Dataflow, Flink and Beam: unification, open source and portability",
      kicker: "Bringing it together",
      blocks: [
        {
          type: "text",
          html: `<h3>Cloud Dataflow: one model for batch and streaming</h3>
<p><strong>Cloud Dataflow</strong>, announced by Google in 2014 and generally available in 2015, merged two lineages: Flume's optimizable pipelines for batch and MillWheel's out-of-order, exactly-once engine for streaming. The model behind it, described in "The Dataflow Model" (VLDB 2015), is the What, Where, When and How framework this book is built on: what is computed, where in event time (windows), when in processing time (triggers and watermarks), and how refinements relate (accumulation). Its contribution was <strong>unified batch and streaming</strong>: one programming model in which a bounded input is just a special case, and an explicit way to trade off correctness, latency and cost.</p>
<h3>Flink: the open-source streaming innovator</h3>
<p><strong>Flink</strong> grew out of the Stratosphere research project in Berlin and became a top-level Apache project at the end of 2014. It adopted the Dataflow Model's event-time windows and watermarks quickly, which brought robust out-of-order streaming to open source. It also added ideas of its own. Its <strong>distributed snapshots</strong> (asynchronous barrier snapshotting, inspired by the Chandy-Lamport algorithm) give exactly-once state with low overhead, and <strong>savepoints</strong> are user-triggered snapshots that let you stop a job, change or upgrade it, and resume from the same state.</p>
<h3>Beam: portability</h3>
<p><strong>Apache Beam</strong> began in 2016, when Google contributed the Dataflow SDKs to the Apache Software Foundation, together with runners from other contributors. Beam is a programming model and set of SDKs; separate <strong>runners</strong> execute Beam pipelines on engines such as Flink, Spark and Cloud Dataflow. Its goal is <strong>portability</strong>: to be for programmatic pipelines what SQL is for declarative queries, a common language that runs anywhere. The aim is to include the best ideas from across the field, not the lowest common denominator, and its portability framework lets SDKs in one language run on runners written in another. In practice, feature support still varies by runner.</p>`,
        },
        {
          type: "diagram",
          title: "Selected ideas carried forward",
          caption: "Systems grouped by when they appeared. Arrows show some of the main lines of influence described in this chapter; Storm, Spark and Kafka shaped everything to their right through the problems they solved and exposed.",
          svg: `<svg viewBox="0 0 640 290" role="img" aria-label="Ten data processing systems arranged by period, with arrows from MapReduce to Hadoop and Flume, from Flume and MillWheel to Dataflow, and from Dataflow to Flink and Beam">
<defs><marker id="ss10-arrow2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-ink)"/></marker></defs>
<rect x="15" y="110" width="110" height="34" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="70" y="132" text-anchor="middle" font-size="12" font-weight="700">MapReduce</text>
<rect x="175" y="50" width="110" height="34" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="230" y="72" text-anchor="middle" font-size="12" font-weight="700">Hadoop</text>
<rect x="175" y="160" width="110" height="34" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="230" y="182" text-anchor="middle" font-size="12" font-weight="700">Flume</text>
<rect x="345" y="20" width="110" height="34" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="400" y="42" text-anchor="middle" font-size="12" font-weight="700">Storm</text>
<rect x="345" y="70" width="110" height="34" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="400" y="92" text-anchor="middle" font-size="12" font-weight="700">Spark</text>
<rect x="345" y="120" width="110" height="34" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="400" y="142" text-anchor="middle" font-size="12" font-weight="700">MillWheel</text>
<rect x="345" y="210" width="110" height="34" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="400" y="232" text-anchor="middle" font-size="12" font-weight="700">Kafka</text>
<rect x="505" y="50" width="110" height="34" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="560" y="72" text-anchor="middle" font-size="12" font-weight="700">Flink</text>
<rect x="505" y="145" width="110" height="34" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="560" y="167" text-anchor="middle" font-size="12" font-weight="700">Dataflow</text>
<rect x="505" y="210" width="110" height="34" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="560" y="232" text-anchor="middle" font-size="12" font-weight="700">Beam</text>
<line x1="125" y1="120" x2="171" y2="76" style="stroke: var(--dg-ink)" stroke-width="2" marker-end="url(#ss10-arrow2)"/>
<line x1="125" y1="134" x2="171" y2="170" style="stroke: var(--dg-ink)" stroke-width="2" marker-end="url(#ss10-arrow2)"/>
<line x1="287" y1="177" x2="501" y2="163" style="stroke: var(--dg-ink)" stroke-width="2" marker-end="url(#ss10-arrow2)"/>
<line x1="457" y1="140" x2="501" y2="155" style="stroke: var(--dg-ink)" stroke-width="2" marker-end="url(#ss10-arrow2)"/>
<line x1="560" y1="143" x2="560" y2="88" style="stroke: var(--dg-ink)" stroke-width="2" marker-end="url(#ss10-arrow2)"/>
<line x1="560" y1="181" x2="560" y2="206" style="stroke: var(--dg-ink)" stroke-width="2" marker-end="url(#ss10-arrow2)"/>
<text x="70" y="276" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">2003–04</text>
<text x="230" y="276" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">2005–10</text>
<text x="400" y="276" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">2011–13</text>
<text x="560" y="276" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">2014–16</text>
</svg>`,
        },
        {
          type: "realworld",
          title: "Where the ideas live today",
          items: [
            { org: "Kafka Streams and ksqlDB", title: "Streams and tables on the log", html: "Libraries and SQL built directly on Kafka topics, with KStream and KTable as first-class concepts: Kafka's log-centric view turned into a processing model." },
            { org: "Apache Flink", title: "Event time plus snapshots", html: "Watermarks, event-time timers and windows from the Dataflow lineage, combined with Flink's own checkpoints and savepoints, and a SQL layer with changelog semantics." },
            { org: "Apache Beam on Dataflow, Flink or Spark", title: "Write once, choose a runner", html: "The What/Where/When/How model as an API, executed by whichever engine a team already operates." },
          ],
        },
        {
          type: "tradeoffs",
          prosLabel: "Portability (Beam) gives",
          consLabel: "It costs",
          pros: [
            "One pipeline definition across engines and clouds",
            "A single, well-defined model for batch and streaming",
            "Freedom to change engines without rewriting business logic",
          ],
          cons: [
            "Feature support and performance depend on the runner",
            "An extra layer between your code and the engine when debugging",
            "Engine-specific features may not be exposed through the common model",
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
          html: `<p>History questions rarely appear on their own, but they shape follow-ups: "why not Lambda?", "why Flink over Spark Streaming here?", "what does a watermark buy you?" Answer by naming the problem each system solved and the one it left open. That shows you understand the trade-off rather than a brand.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>A strong answer can trace one idea through several systems. For exactly-once correctness:</p>
<ol>
<li>Storm offered at-least-once at best, so teams added a batch layer: the Lambda Architecture.</li>
<li>Spark Streaming got strong consistency by running deterministic microbatches, for data processed in arrival order.</li>
<li>MillWheel achieved it per record with ids for deduplication and atomic state commits, and added watermarks and timers for out-of-order data.</li>
<li>Dataflow inherited that design and made it affordable with Flume's fusion and combiner lifting; Flink achieved it with distributed snapshots.</li>
<li>Kafka's replayable logs made recovery and Kappa-style reprocessing practical on the input side.</li>
</ol>`,
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>"Streaming is approximate; batch is correct." That was true of early Storm-style systems, which is why Lambda existed. Since MillWheel, Dataflow and Flink, a well-built streaming pipeline can be exactly as correct as batch, and batch is just a stream with a bounded input.</p>`,
        },
        {
          type: "quiz",
          q: "An interviewer asks why the Kappa Architecture became practical after the Lambda Architecture. Which answer is best?",
          options: [
            "Batch systems stopped being able to scale",
            "Replayable logs such as Kafka plus streaming engines with exactly-once, event-time processing made one streaming pipeline both correct and reprocessable",
            "Microbatching removed the need for watermarks",
            "Portability layers such as Beam made batch unnecessary",
          ],
          answer: 1,
          explain: "Lambda existed because the fast layer was not trustworthy. Kappa needs two things: a log you can replay to reprocess, and a streaming engine whose results are correct on their own. Kafka supplied the first; MillWheel-style engines (Dataflow, Flink) supplied the second.",
        },
      ],
    },
  ],
  takeaways: [
    "MapReduce made scale ordinary with a tiny API on a fault-tolerant engine; its rigid map-shuffle-reduce shape was the next problem.",
    "Hadoop turned the idea into an open-source ecosystem (HDFS, Pig, Hive, HBase) that spread large-scale processing far beyond Google.",
    "Flume showed that you should write the logical pipeline and let an optimizer fuse steps and lift combiners.",
    "Storm proved low latency but with weak consistency, which led to the Lambda Architecture; Spark Streaming proved consistency was possible in microbatches.",
    "MillWheel added exactly-once processing of out-of-order data with watermarks and timers; Kafka made streams durable and replayable.",
    "Dataflow unified batch and streaming under What/Where/When/How; Flink brought it to open source with snapshots and savepoints; Beam aims for portability across runners.",
  ],
  furtherReading: [
    { title: "MapReduce: Simplified Data Processing on Large Clusters (Dean and Ghemawat, OSDI 2004)", note: "The paper that started the modern era of large-scale data processing." },
    { title: "FlumeJava: Easy, Efficient Data-Parallel Pipelines (Chambers et al., PLDI 2010)", note: "Deferred evaluation, fusion and the MapShuffleCombineReduce optimizer." },
    { title: "MillWheel: Fault-Tolerant Stream Processing at Internet Scale (Akidau et al., VLDB 2013)", note: "Exactly-once per-key state, low watermarks and timers." },
    { title: "The Dataflow Model (Akidau et al., VLDB 2015)", note: "The What/Where/When/How framework for balancing correctness, latency and cost." },
  ],
};
