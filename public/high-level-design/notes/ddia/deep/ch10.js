// Deep dive: DDIA Chapter 10, Batch Processing. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch10 = {
  hook: `<p>Your product manager asks a simple question: "Which five pages did people visit most last month?" The web server logs hold the answer, but they are 40 TB spread over thousands of files. A script that reads them line by line on one machine at a brisk 200 MB/s would take more than two days, and a hash map of every URL might not fit in its memory anyway. Next week the question will change to "most visited pages per country, for users who signed up this year", which needs a join against the user database too.</p>
<p>Batch processing is the discipline of answering questions like this over large, <strong>bounded</strong> datasets: take a fixed input, run a job, produce an output, and if the job was wrong, fix it and run it again. The ideas run from Unix pipes through MapReduce to Spark and Flink, and they still shape how data warehouses, search indexes and machine learning pipelines are built today.</p>`,
  sections: [
    {
      id: "unix-philosophy",
      title: "Batch processing with Unix tools",
      kicker: "Where the ideas start",
      blocks: [
        {
          type: "text",
          html: `<p>Before reaching for a cluster, look at what a single machine can do. To find the five most requested URLs in an nginx access log, where the request path is the seventh whitespace-separated field, a chain of standard tools is enough:</p>`,
        },
        {
          type: "code",
          lang: "bash",
          title: "Top five URLs from an access log",
          code: `cat /var/log/nginx/access.log |
  awk '{print $7}' |   # extract the URL
  sort             |   # bring identical URLs together
  uniq -c          |   # count each run of identical lines
  sort -rn         |   # order by count, largest first
  head -n 5`,
        },
        {
          type: "text",
          html: `<p>A custom program would probably keep a hash map from URL to count. That works while the set of distinct URLs fits in memory. The Unix version never needs that: <code>sort</code> handles inputs larger than memory by sorting chunks, spilling them to disk and merging the sorted files, and GNU sort can use several CPU cores. Sorting turns "group identical items" into "read sequentially", and sequential disk access is fast. The same trick reappears at the heart of MapReduce.</p>
<p>The deeper lesson is about design. Doug McIlroy, who invented Unix pipes, proposed in a 1964 memo that programs should connect like segments of garden hose. The Unix philosophy that grew from it says each program should do one thing well, the output of every program should be usable as input to another, and you should be able to try things quickly and throw them away.</p>`,
        },
        {
          type: "keypoints",
          title: "What makes the Unix approach work",
          items: [
            "<strong>A uniform interface.</strong> Every tool reads and writes a stream of bytes, by convention lines of text, so any tool can feed any other.",
            "<strong>Logic separated from wiring.</strong> A program reads stdin and writes stdout without knowing where they lead; the shell user decides how to connect them.",
            "<strong>Immutable inputs.</strong> Running a pipeline does not modify its input, so you can rerun it as many times as you like while experimenting.",
            "<strong>Inspectable intermediate results.</strong> Cut the pipeline at any stage and pipe into <code>less</code> to see what is flowing through.",
          ],
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>The big limitation is that Unix tools run on one machine. MapReduce can be seen as taking exactly these properties (immutable inputs, composable stages, sort-based grouping) and spreading them across thousands of machines, with a distributed filesystem playing the role of files and pipes.</p>`,
        },
        {
          type: "quiz",
          q: "Why can the <code>sort | uniq -c</code> pipeline count URLs in a log that is far larger than RAM, when an in-memory hash map might fail?",
          options: [
            "uniq compresses the data",
            "sort spills sorted chunks to disk and merges them, after which identical lines are adjacent and can be counted with constant memory",
            "The shell automatically distributes the work across machines",
            "awk discards duplicate URLs before they reach sort",
          ],
          answer: 1,
          explain: "External merge sort uses disk for anything that does not fit in memory, and once identical keys are adjacent, counting them needs only the current line and a counter. The hash map needs one entry per distinct URL in memory at once.",
        },
      ],
    },
    {
      id: "mapreduce-and-hdfs",
      title: "MapReduce and distributed filesystems",
      kicker: "Scaling out",
      blocks: [
        {
          type: "problem",
          html: `<p>One machine cannot read 40 TB quickly, no matter how clever the program. You need hundreds of machines reading in parallel, each working on a slice of the data, plus a way to bring related records together and to survive the machines that will inevitably fail during a multi-hour job.</p>`,
        },
        {
          type: "text",
          html: `<p>Google described its answer in two papers: the Google File System (2003) and MapReduce (Dean and Ghemawat, 2004). Hadoop reimplemented both as open source, as <strong>HDFS</strong> and Hadoop MapReduce, starting around 2006.</p>
<h3>The distributed filesystem</h3>
<p>HDFS splits each file into large blocks (128 MB by default) and stores each block on several machines, three by default. A central <strong>NameNode</strong> keeps the metadata, meaning which blocks make up which file and where each block lives, while <strong>DataNodes</strong> on every machine store the blocks themselves. It is shared-nothing: commodity machines with local disks, connected by an ordinary network, with replication handling disk and machine failures. Large blocks and sequential reads favour throughput over low-latency random access.</p>
<h3>The programming model</h3>
<p>You write two functions, and the framework does everything else:</p>
<ul>
<li>The <strong>mapper</strong> is called once per input record and emits any number of key-value pairs. For the URL count: emit <code>(url, 1)</code> for each log line.</li>
<li>The <strong>reducer</strong> is called once per distinct key, with an iterator over all values for that key. For the URL count: sum the ones.</li>
</ul>
<p>Mappers are like the <code>awk</code> step; the framework's sort between them is like <code>sort</code>; reducers are like <code>uniq -c</code>. A second MapReduce job would do the "sort by count, take five" step, just as a second <code>sort</code> did in the shell.</p>`,
        },
        {
          type: "diagram",
          title: "One MapReduce job",
          caption: "Each mapper reads one block of input, ideally on the machine that stores it. The shuffle sends every key to one reducer, sorted, so each reducer sees all values for its keys together and writes one output file.",
          svg: `<svg viewBox="0 0 640 275" role="img" aria-label="MapReduce: input blocks feed mappers, the shuffle routes keys to reducers, and reducers write output files">
<defs><marker id="ddia10-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<text x="65" y="24" text-anchor="middle" font-size="13" font-weight="700">Input blocks</text>
<text x="205" y="24" text-anchor="middle" font-size="13" font-weight="700">Map</text>
<text x="325" y="24" text-anchor="middle" font-size="13" font-weight="700">Shuffle</text>
<text x="445" y="24" text-anchor="middle" font-size="13" font-weight="700">Reduce</text>
<text x="580" y="24" text-anchor="middle" font-size="13" font-weight="700">Output</text>
<rect x="20" y="40" width="90" height="44" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="65" y="67" text-anchor="middle" font-size="12">block 1</text>
<rect x="20" y="110" width="90" height="44" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="65" y="137" text-anchor="middle" font-size="12">block 2</text>
<rect x="20" y="180" width="90" height="44" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="65" y="207" text-anchor="middle" font-size="12">block 3</text>
<rect x="160" y="40" width="90" height="44" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="205" y="67" text-anchor="middle" font-size="12">mapper 1</text>
<rect x="160" y="110" width="90" height="44" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="205" y="137" text-anchor="middle" font-size="12">mapper 2</text>
<rect x="160" y="180" width="90" height="44" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="205" y="207" text-anchor="middle" font-size="12">mapper 3</text>
<rect x="400" y="70" width="90" height="44" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="445" y="97" text-anchor="middle" font-size="12">reducer A</text>
<rect x="400" y="150" width="90" height="44" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="445" y="177" text-anchor="middle" font-size="12">reducer B</text>
<rect x="535" y="70" width="90" height="44" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="580" y="97" text-anchor="middle" font-size="12">part-0</text>
<rect x="535" y="150" width="90" height="44" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="580" y="177" text-anchor="middle" font-size="12">part-1</text>
<line x1="112" y1="62" x2="156" y2="62" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia10-arrow)"/>
<line x1="112" y1="132" x2="156" y2="132" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia10-arrow)"/>
<line x1="112" y1="202" x2="156" y2="202" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia10-arrow)"/>
<line x1="252" y1="62" x2="396" y2="88" stroke-width="1.5" style="stroke: var(--dg-1)" marker-end="url(#ddia10-arrow)"/>
<line x1="252" y1="62" x2="396" y2="164" stroke-width="1.5" style="stroke: var(--dg-1)" marker-end="url(#ddia10-arrow)"/>
<line x1="252" y1="132" x2="396" y2="96" stroke-width="1.5" style="stroke: var(--dg-1)" marker-end="url(#ddia10-arrow)"/>
<line x1="252" y1="132" x2="396" y2="170" stroke-width="1.5" style="stroke: var(--dg-1)" marker-end="url(#ddia10-arrow)"/>
<line x1="252" y1="202" x2="396" y2="104" stroke-width="1.5" style="stroke: var(--dg-1)" marker-end="url(#ddia10-arrow)"/>
<line x1="252" y1="202" x2="396" y2="178" stroke-width="1.5" style="stroke: var(--dg-1)" marker-end="url(#ddia10-arrow)"/>
<line x1="492" y1="92" x2="531" y2="92" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia10-arrow)"/>
<line x1="492" y1="172" x2="531" y2="172" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia10-arrow)"/>
<text x="325" y="250" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">every key goes to reducer hash(key) mod 2, sorted by key</text>
</svg>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Google", title: "The original", html: "The 2004 MapReduce paper described jobs for building the web search index, among many others, and showed how a simple model could hide parallelism, data distribution and fault handling." },
            { org: "Apache Hadoop", title: "The open-source ecosystem", html: "HDFS and Hadoop MapReduce became the foundation for an ecosystem (Hive, Pig, HBase, Oozie) that many companies ran on their own clusters through the 2010s." },
            { org: "Cloud object stores", title: "S3, GCS, Azure Blob", html: "Today most batch jobs read from and write to object storage instead of HDFS, so storage and compute scale independently and clusters can be created per job." },
          ],
        },
      ],
    },
    {
      id: "the-shuffle",
      title: "The shuffle, fault tolerance and stragglers",
      kicker: "How a job really runs",
      blocks: [
        {
          type: "steps",
          title: "What happens between map and reduce",
          items: [
            "The scheduler starts one map task per input block, preferring a machine that holds a replica of the block (<strong>data locality</strong>), so input is read from local disk instead of over the network.",
            "Each mapper divides its output into one partition per reducer, using <code>hash(key) mod R</code>, and sorts each partition by key, spilling sorted files to local disk as memory fills.",
            "When a mapper finishes, each reducer fetches its partition from that mapper. This all-to-all copy is the <strong>shuffle</strong>.",
            "Each reducer merges the sorted files it fetched, so all values for a key arrive together, calls the reducer function once per key, and writes its output to the distributed filesystem, replicated.",
          ],
        },
        {
          type: "text",
          html: `<p>The shuffle is usually the most expensive part of a job: every byte of map output is written to local disk, sent over the network, and merged. Two standard tricks reduce it. A <strong>combiner</strong> runs a mini-reduce on each mapper's output before the shuffle, so the URL count sends <code>(url, 4817)</code> once per mapper instead of 4,817 copies of <code>(url, 1)</code>. It only works for associative operations like sums, counts and maxima. And choosing compact serialization formats cuts the bytes moved.</p>
<h3>Fault tolerance by rerunning</h3>
<p>A job may run thousands of tasks over hours, so some will fail. MapReduce handles this simply: because inputs are immutable and tasks are expected to be deterministic, a failed task is just run again on another machine, and its partial output is discarded. A task's output is only made visible when it completes successfully. This is why MapReduce writes so eagerly to disk: it trades speed for the ability to retry at a fine grain. Google designed it for shared clusters where lower-priority batch tasks could be preempted at any time to make room for online services, so frequent task restarts were expected.</p>
<h3>Stragglers and skew</h3>
<p>A job finishes when its slowest task does. A machine with a failing disk can make one task run ten times slower than its peers; MapReduce counters this with <strong>speculative execution</strong>, launching a duplicate of a slow task elsewhere and taking whichever finishes first. Skew is a harder cause: if one key has vastly more values than others (a celebrity's user ID, a bot hammering one URL), its single reducer gets far more work than every other reducer, and no number of extra machines helps.</p>`,
        },
        {
          type: "tradeoffs",
          prosLabel: "Why materialize to disk",
          consLabel: "What it costs",
          pros: [
            "Any failed task can be rerun alone, from durable inputs",
            "Works on shared clusters where tasks are preempted often",
            "Each job's output is a clean, inspectable dataset",
          ],
          cons: [
            "Every stage writes everything to disk, and job outputs are replicated three times",
            "A downstream job cannot start until every task of the upstream job has finished",
            "Mappers in the next job often just reread what the previous reducers wrote",
          ],
        },
        {
          type: "quiz",
          q: "A word-count job spends most of its time in the shuffle. Which change helps most without changing the result?",
          options: [
            "Add more reducers",
            "Add a combiner that sums counts on each mapper before the shuffle",
            "Increase the HDFS replication factor",
            "Turn off speculative execution",
          ],
          answer: 1,
          explain: "Summing is associative and commutative, so partial sums on each mapper give the same final answer while shrinking map output from one record per word occurrence to one per distinct word per mapper. More reducers spread the same shuffle volume; replication and speculation do not reduce it.",
        },
      ],
    },
    {
      id: "joins",
      title: "Joins in batch jobs",
      kicker: "Bringing related records together",
      blocks: [
        {
          type: "problem",
          html: `<p>Raw events rarely contain everything you need. A clickstream row says "user 42 viewed /pricing", but the analysis wants "viewed by users born in the 1990s". You need to join billions of events with a user table. Querying the user database once per event would overwhelm it, be slow because of network round trips, and give nondeterministic results if the database changes mid-job.</p>`,
        },
        {
          type: "idea",
          html: `<p>Take a copy of the user table (for example an export or snapshot) into the distributed filesystem alongside the events, and let the framework bring matching records together, either in the shuffle (a reduce-side join) or by arranging the inputs so each mapper can join locally (a map-side join).</p>`,
        },
        {
          type: "text",
          html: `<h3>Reduce-side sort-merge join</h3>
<p>One set of mappers reads events and emits <code>(userId, event)</code>; another reads user records and emits <code>(userId, profile)</code>. The shuffle sends both to the same reducer, keyed by user ID. With a <strong>secondary sort</strong>, the framework arranges that the reducer sees the profile record first and then that user's events, so it holds only one profile in memory at a time and streams the events past it. This works for any input sizes and needs no assumptions, but it shuffles both inputs in full.</p>`,
        },
        {
          type: "diagram",
          title: "A reduce-side join on user ID",
          caption: "Events and profiles are both keyed by user ID, so the shuffle delivers each user's profile and events to one reducer. Sorting puts the profile first; the reducer then emits each event with the profile attached.",
          svg: `<svg viewBox="0 0 640 260" role="img" aria-label="Reduce-side join: events and user profiles shuffled by user ID to reducers that output enriched events">
<defs><marker id="ddia10-arrow2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="15" y="30" width="185" height="100" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="107" y="52" text-anchor="middle" font-size="13" font-weight="700">Activity events</text>
<text x="30" y="76" font-size="12">user 42: view /a</text>
<text x="30" y="96" font-size="12">user 7: click /b</text>
<text x="30" y="116" font-size="12">user 42: click /c</text>
<rect x="15" y="160" width="185" height="80" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="107" y="182" text-anchor="middle" font-size="13" font-weight="700">User table copy</text>
<text x="30" y="206" font-size="12">user 42: born 1994</text>
<text x="30" y="226" font-size="12">user 7: born 1987</text>
<rect x="265" y="20" width="185" height="110" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="357" y="42" text-anchor="middle" font-size="13" font-weight="700">reducer: user 42</text>
<text x="280" y="66" font-size="12">1. profile: born 1994</text>
<text x="280" y="88" font-size="12">2. view /a</text>
<text x="280" y="110" font-size="12">3. click /c</text>
<rect x="265" y="160" width="185" height="80" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="357" y="182" text-anchor="middle" font-size="13" font-weight="700">reducer: user 7</text>
<text x="280" y="206" font-size="12">1. profile: born 1987</text>
<text x="280" y="226" font-size="12">2. click /b</text>
<rect x="490" y="45" width="140" height="60" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="560" y="70" text-anchor="middle" font-size="12">/a, born 1994</text>
<text x="560" y="90" text-anchor="middle" font-size="12">/c, born 1994</text>
<rect x="490" y="175" width="140" height="50" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="560" y="205" text-anchor="middle" font-size="12">/b, born 1987</text>
<line x1="202" y1="75" x2="261" y2="75" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia10-arrow2)"/>
<line x1="202" y1="95" x2="261" y2="185" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia10-arrow2)"/>
<line x1="202" y1="200" x2="261" y2="110" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia10-arrow2)"/>
<line x1="202" y1="222" x2="261" y2="222" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia10-arrow2)"/>
<line x1="452" y1="75" x2="486" y2="75" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia10-arrow2)"/>
<line x1="452" y1="200" x2="486" y2="200" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia10-arrow2)"/>
</svg>`,
        },
        {
          type: "text",
          html: `<h3>Map-side joins</h3>
<p>If you know something about the inputs, you can skip the shuffle and its cost:</p>
<ul>
<li><strong>Broadcast hash join.</strong> If one side is small enough to fit in memory (a table of 200 countries, or even a few million products), every mapper loads all of it into a hash table and streams its share of the large input past it.</li>
<li><strong>Partitioned hash join.</strong> If both inputs were already partitioned the same way on the join key (say, both into 64 partitions by <code>hash(userId) mod 64</code>), mapper <em>i</em> only needs partition <em>i</em> of each, and can build a hash table from the smaller one.</li>
<li><strong>Map-side merge join.</strong> If both are partitioned the same way <em>and</em> sorted by the join key, a mapper merges them in one sequential pass, like the merge step of merge sort, without holding either in memory.</li>
</ul>
<p>Map-side joins depend on how earlier jobs laid out their output, so the layout (partition count, partition key, sort order) becomes part of the dataset's contract. Hive records this in its metastore as bucketed and sorted tables.</p>`,
        },
        {
          type: "table",
          title: "Join strategies",
          headers: ["Strategy", "Precondition", "Shuffle?", "Typical use"],
          rows: [
            ["Reduce-side sort-merge", "None", "Both inputs", "Two large tables, arbitrary layout"],
            ["Broadcast hash", "One side fits in memory", "None", "Fact table joined with small dimension tables"],
            ["Partitioned hash", "Both partitioned identically on the key", "None", "Large tables produced by earlier jobs with matching layout"],
            ["Map-side merge", "Partitioned identically and sorted on the key", "None", "Pre-sorted datasets such as bucketed, sorted Hive tables"],
          ],
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>For skewed joins, where one key such as a celebrity's ID has millions of rows, frameworks split the hot key across several reducers and replicate the other side's matching records to each of them. Pig's skewed join and Hive's skew join hints did this explicitly. Since Spark 3.0, adaptive query execution can detect skewed partitions at run time and split them automatically.</p>`,
        },
        {
          type: "quiz",
          q: "You join a 5 TB table of orders with a 30 MB table of currency exchange rates. Which join is the best fit?",
          options: ["Reduce-side sort-merge join", "Broadcast hash join", "Map-side merge join", "A nested loop over both tables"],
          answer: 1,
          explain: "30 MB easily fits in each task's memory, so broadcasting it avoids shuffling 5 TB of orders. A sort-merge join would work but moves far more data, and a merge join needs both inputs pre-sorted on the same key.",
        },
      ],
    },
    {
      id: "batch-outputs",
      title: "What batch jobs produce, and why it is safe",
      kicker: "Outputs and workflows",
      blocks: [
        {
          type: "text",
          html: `<p>Batch jobs are not usually the same thing as analytics queries in a warehouse. Their output is often a <strong>derived dataset</strong> that another system serves:</p>
<ul>
<li><strong>Search indexes.</strong> Google originally used MapReduce to build its web search index. Building a full-text index in a batch job, partitioned by document, then swapping the new index files in atomically is still a common pattern.</li>
<li><strong>Key-value stores for serving.</strong> Recommendation results, model features or "people you may know" lists are computed in bulk, written as database files (for example HBase bulk-loading HFiles), and loaded into read-only servers.</li>
<li><strong>Machine learning models, reports and summary tables</strong> for downstream consumers.</li>
</ul>`,
        },
        {
          type: "compare",
          items: [
            { title: "Write to the live database from tasks", tone: "bad", html: "Each record becomes a network request, far slower than writing files. Thousands of tasks can overload the database and hurt online users. If the job fails halfway, partial results are already visible, and a rerun may duplicate them." },
            { title: "Build new files, then swap", tone: "ok", html: "The job writes a fresh, complete dataset to the distributed filesystem. When it succeeds, servers switch to the new files atomically. A bad job is undone by switching back to the previous files." },
          ],
        },
        {
          type: "text",
          html: `<h3>Human fault tolerance</h3>
<p>Because inputs are never modified and outputs replace previous outputs wholesale, a buggy job is cheap to fix: correct the code, rerun, swap the output. Compare that with a database where a bug wrote bad values in place, and the previous state is simply gone. This property, being able to recover from <em>human</em> mistakes rather than just machine failures, is one of the strongest arguments for batch-style derived data, and it returns in the next two chapters.</p>
<h3>Workflows</h3>
<p>Real pipelines are dozens or hundreds of jobs: clean the raw logs, join with users, aggregate by day, build features, train a model. A <strong>workflow scheduler</strong> runs them as a directed acyclic graph, starting each job when its inputs are ready, retrying failures, alerting when a deadline is missed, and backfilling a date range after a bug fix. Oozie served the Hadoop era, Luigi came from Spotify, and Apache Airflow, created at Airbnb in 2014, is now the most widely used, alongside newer tools such as Dagster and Prefect.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Apache Airflow", title: "DAGs as code", html: "Pipelines are Python files that declare tasks and dependencies; the scheduler runs each task for each date partition and records success, so a backfill reruns exactly the affected dates." },
            { org: "Hadoop vs MPP databases", title: "Different philosophies", html: "Massively parallel warehouses (Teradata, later Redshift and others) required data to be modelled up front and queried in SQL. Hadoop let teams dump raw files of any format first and decide how to interpret them later, which made it a cheap landing zone for everything." },
          ],
        },
      ],
    },
    {
      id: "dataflow-engines",
      title: "Beyond MapReduce: dataflow engines",
      kicker: "Spark, Flink, Tez",
      blocks: [
        {
          type: "problem",
          html: `<p>A realistic pipeline in raw MapReduce is a chain of 10 or 50 jobs. Each job writes its full output to HDFS, replicated three times, only for the next job's mappers to read it straight back. Reducers of one job must all finish before the next job's mappers can begin. Mappers often do nothing except reread data that is already partitioned and sorted. Most of the time and I/O goes into moving intermediate state that nobody wants to keep.</p>`,
        },
        {
          type: "idea",
          html: `<p>Treat the whole workflow as one job: a directed acyclic graph of operators (map, filter, join, group, sort) that the engine plans and schedules together. Intermediate data flows between operators in memory or on local disk, and sorting or shuffling happens only where an operator actually needs it.</p>`,
        },
        {
          type: "diagram",
          title: "Materialized stages versus one dataflow",
          caption: "MapReduce writes every job's output to replicated distributed storage before the next job can read it. A dataflow engine pipelines operators and only writes the final result durably.",
          svg: `<svg viewBox="0 0 640 230" role="img" aria-label="MapReduce chains jobs through replicated storage while a dataflow engine pipelines operators in memory">
<defs><marker id="ddia10-arrow3" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<text x="16" y="74" font-size="13" font-weight="700">MapReduce</text>
<rect x="110" y="52" width="80" height="40" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="150" y="77" text-anchor="middle" font-size="12">job 1</text>
<rect x="215" y="52" width="100" height="40" rx="6" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)" stroke-width="2"/>
<text x="265" y="77" text-anchor="middle" font-size="12">HDFS, 3x</text>
<rect x="340" y="52" width="80" height="40" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="380" y="77" text-anchor="middle" font-size="12">job 2</text>
<rect x="445" y="52" width="80" height="40" rx="6" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)" stroke-width="2"/>
<text x="485" y="77" text-anchor="middle" font-size="12">HDFS</text>
<rect x="550" y="52" width="75" height="40" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="587" y="77" text-anchor="middle" font-size="12">job 3</text>
<line x1="192" y1="72" x2="211" y2="72" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia10-arrow3)"/>
<line x1="317" y1="72" x2="336" y2="72" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia10-arrow3)"/>
<line x1="422" y1="72" x2="441" y2="72" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia10-arrow3)"/>
<line x1="527" y1="72" x2="546" y2="72" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia10-arrow3)"/>
<text x="16" y="164" font-size="13" font-weight="700">Dataflow</text>
<rect x="110" y="142" width="80" height="40" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="150" y="167" text-anchor="middle" font-size="12">scan</text>
<rect x="215" y="142" width="80" height="40" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="255" y="167" text-anchor="middle" font-size="12">filter</text>
<rect x="320" y="142" width="80" height="40" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="360" y="167" text-anchor="middle" font-size="12">join</text>
<rect x="425" y="142" width="90" height="40" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="470" y="167" text-anchor="middle" font-size="12">aggregate</text>
<rect x="540" y="142" width="85" height="40" rx="6" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="582" y="167" text-anchor="middle" font-size="12">write once</text>
<line x1="192" y1="162" x2="211" y2="162" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia10-arrow3)"/>
<line x1="297" y1="162" x2="316" y2="162" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia10-arrow3)"/>
<line x1="402" y1="162" x2="421" y2="162" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia10-arrow3)"/>
<line x1="517" y1="162" x2="536" y2="162" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia10-arrow3)"/>
<text x="360" y="212" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">intermediate data stays in memory or on local disk</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>The gains come from several places at once: no replicated writes between stages, no mandatory sort where an operator only needs partitioning, a downstream operator can start as soon as its input begins arriving, a worker process (and the JVM's warmed-up code) is reused across stages, and the planner can see the whole graph and choose join strategies globally. Spark, introduced in the Resilient Distributed Datasets paper (Zaharia et al., 2012), can also <strong>cache</strong> a dataset in memory across iterations, which is a big win for iterative machine learning. In 2014 Databricks reported that Spark sorted 100 TB in 23 minutes on 206 machines, against a previous Hadoop MapReduce record of 72 minutes on about 2,100.</p>
<h3>Fault tolerance without materializing everything</h3>
<p>If intermediate data is not written durably, what happens when a machine dies? Spark records each dataset's <strong>lineage</strong>, meaning the operators and inputs that produced it, and recomputes only the lost partitions from the nearest durable ancestor. Flink checkpoints operator state periodically. Recomputation is only safe if operators are <strong>deterministic</strong>: a task that uses random numbers, the current time or unordered hash iteration may produce different output when rerun, which can make downstream results inconsistent, so engines have to handle those cases conservatively. When recomputing would be very expensive, it is cheaper to materialize a checkpoint.</p>`,
        },
        {
          type: "table",
          title: "MapReduce versus dataflow engines",
          headers: ["", "MapReduce", "Dataflow (Spark, Flink, Tez)"],
          rows: [
            ["Shape of a job", "One map stage, one reduce stage", "Arbitrary DAG of operators"],
            ["Intermediate data", "Written to replicated distributed storage", "Memory or local disk, spilled as needed"],
            ["Sorting", "Always, between map and reduce", "Only where an operator needs it"],
            ["Recovery", "Rerun failed tasks from durable inputs", "Recompute from lineage or restore a checkpoint"],
            ["Iterative workloads", "Reread from disk every iteration", "Cache working set in memory"],
          ],
        },
        {
          type: "callout",
          tone: "modern",
          html: `<p>Since 2017 the batch landscape has shifted further from the Hadoop era. Hand-written MapReduce is rare; Spark is the dominant general-purpose engine, and Flink treats batch as a special case of streaming. Object storage (S3, GCS, Azure Blob) has largely replaced HDFS, separating storage from compute. Open table formats such as Apache Iceberg, Delta Lake and Apache Hudi add transactional commits, schema evolution and time travel on top of Parquet files in object storage, the "lakehouse" approach. And cloud warehouses such as BigQuery and Snowflake run many batch transformations directly in SQL.</p>`,
        },
      ],
    },
    {
      id: "graphs-and-declarative-apis",
      title: "Graph processing and high-level APIs",
      kicker: "Iteration and declarative queries",
      blocks: [
        {
          type: "text",
          html: `<h3>Iterative graph algorithms</h3>
<p>PageRank, shortest paths and connected components repeat a step until results converge: each vertex looks at its neighbours, updates its value, and the process repeats. In MapReduce each iteration is a full job that rereads the entire graph, even when only a few vertices changed.</p>
<p>Google's Pregel paper (2010) introduced the <strong>bulk synchronous parallel</strong> (BSP) model for graphs. Each vertex has state and can send messages along its edges. Computation proceeds in <strong>supersteps</strong>: in each one, every vertex processes the messages sent to it in the previous superstep, updates its state, and sends new messages. The framework partitions the graph across machines, delivers the messages, and checkpoints vertex state between supersteps for fault tolerance. Apache Giraph and Spark's GraphX follow the same model.</p>
<p>The weakness is communication. Graphs are hard to partition so that neighbours share a machine, so most messages cross the network. If a graph fits in the memory of one large machine, a single-machine algorithm can easily beat a distributed one.</p>`,
        },
        {
          type: "text",
          html: `<h3>Declarative query languages</h3>
<p>Writing joins by hand in MapReduce took hundreds of lines and required you to choose the join algorithm yourself. Hive (from Facebook) and Pig (from Yahoo) added higher-level languages that compiled to MapReduce, and today Spark SQL, Trino (formerly PrestoSQL) and Flink SQL do the same on dataflow engines. Being declarative brings the benefits relational databases have long enjoyed:</p>
<ul>
<li>The optimizer chooses join algorithms and join order using statistics, picking a broadcast join when a table is small.</li>
<li>Filters are pushed down to the scan, and columnar formats like Parquet let the engine read only the columns the query mentions.</li>
<li>Code generation and vectorized execution process data in tight loops over batches of values, instead of calling a user function per record.</li>
</ul>
<p>Batch engines still keep their escape hatch: you can call arbitrary code (a user-defined function, a machine learning library) where SQL does not fit. That flexibility is what distinguishes them from classic MPP databases.</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "Imperative API (RDDs, raw MapReduce)", tone: "warn", html: "You decide the physical plan: which side to broadcast, where to shuffle. The engine treats your functions as black boxes and cannot reorder or skip work." },
            { title: "Declarative API (SQL, DataFrames)", tone: "ok", html: "You say what result you want; the optimizer chooses joins, pushes down filters and prunes columns. The same query often runs faster with a fraction of the code." },
          ],
        },
        {
          type: "quiz",
          q: "Why is PageRank much slower in classic MapReduce than in Pregel-style systems or Spark with caching?",
          options: [
            "MapReduce cannot express multiplication",
            "Each iteration is a separate job that rereads the whole graph from distributed storage and writes the whole result back",
            "MapReduce only supports one reducer",
            "Pregel uses GPUs",
          ],
          answer: 1,
          explain: "Iterative algorithms need dozens of passes. In MapReduce every pass pays full disk and replication costs for the entire graph. Pregel keeps vertex state in memory across supersteps and Spark caches the dataset, so each iteration only does the computation and message passing.",
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
          html: `<p>Batch processing comes up in designs with offline computation: daily analytics, recommendation or "people you may know" lists, search index builds, billing reports, feature generation for ML, and the batch half of a Lambda architecture. It also comes up whenever you need to backfill or reprocess history after a bug.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>Points that make a batch design convincing:</p>
<ol>
<li><strong>Inputs are immutable</strong> and stored in object storage or a distributed filesystem; jobs are deterministic, so you can rerun them after a bug.</li>
<li><strong>Join strategy:</strong> broadcast the small side; otherwise a shuffle (sort-merge) join; mention handling skewed keys.</li>
<li><strong>Outputs are built as new files and swapped in atomically</strong>, not written row by row into the live database.</li>
<li><strong>Use a dataflow engine (Spark) with SQL or DataFrames</strong>, and a scheduler (Airflow) for dependencies, retries and backfills.</li>
<li><strong>State the latency honestly:</strong> results are as fresh as the last run (hourly, daily); if that is too stale, that part moves to streaming.</li>
</ol>`,
        },
        {
          type: "table",
          title: "Batch, stream or online?",
          headers: ["", "Online service", "Batch job", "Stream processor"],
          rows: [
            ["Input", "One request at a time", "Bounded dataset", "Unbounded event stream"],
            ["Latency", "Milliseconds", "Minutes to hours", "Milliseconds to seconds"],
            ["Main metric", "Response time", "Throughput", "Lag behind input"],
            ["Recovery from bugs", "Hard: state changed in place", "Easy: rerun on same input", "Replay from the log, if retained"],
          ],
        },
        {
          type: "quiz",
          q: "A nightly job computes product recommendations for 50 million users and must make them available to the website. What is the best way to publish the results?",
          options: [
            "Have each task INSERT rows directly into the production MySQL database",
            "Write a complete new dataset to object storage, build serving files from it, and switch the read-only serving tier to the new version atomically",
            "Email the results to the web team",
            "Store the results in the mappers' local disks and query them from the website",
          ],
          answer: 1,
          explain: "Writing a fresh, complete output and swapping it in avoids overloading the live database, never exposes half-finished results, and allows instant rollback to yesterday's version if the job was buggy.",
        },
      ],
    },
  ],
  takeaways: [
    "Batch jobs turn a <strong>bounded, immutable input</strong> into a derived output; because inputs are never modified, a buggy job is fixed by rerunning it.",
    "MapReduce is the Unix pipeline idea scaled out: mappers extract keys, the <strong>shuffle</strong> partitions and sorts by key, reducers process each key's values together.",
    "The shuffle dominates cost; combiners, compact formats and avoiding unnecessary shuffles matter most. Skewed keys need special handling.",
    "Use a broadcast join when one side fits in memory, partitioned or merge joins when inputs share a layout, and a sort-merge join otherwise.",
    "Publish outputs by building new files and swapping atomically, not by writing into live databases from tasks.",
    "Dataflow engines (Spark, Flink, Tez) run whole DAGs, keep intermediate data off replicated storage and recover by lineage or checkpoints, which requires deterministic operators.",
    "Declarative APIs (Spark SQL, Hive, Trino) let an optimizer choose joins and prune data, and are nearly always the better interface.",
  ],
  furtherReading: [
    { title: "MapReduce: Simplified Data Processing on Large Clusters (Dean and Ghemawat, OSDI 2004)", note: "The original paper; short and readable." },
    { title: "Resilient Distributed Datasets (Zaharia et al., NSDI 2012)", note: "The paper behind Spark: lineage-based fault tolerance and in-memory caching." },
    { title: "Pregel: A System for Large-Scale Graph Processing (Malewicz et al., SIGMOD 2010)", note: "The bulk synchronous parallel model for graphs." },
    { title: "Apache Spark documentation: SQL performance tuning", url: "https://spark.apache.org/docs/latest/sql-performance-tuning.html", note: "Broadcast joins, adaptive query execution and skew handling in practice." },
  ],
};
