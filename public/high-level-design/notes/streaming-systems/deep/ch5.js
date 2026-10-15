// Deep dive: Chapter 5, Exactly-Once and Side Effects. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch5 = {
  hook: `<p>An ad platform bills advertisers per click. A worker that parses clicks sends a record, "one click for campaign 7", to the worker that keeps campaign 7's running count, currently 1,000. The receiver applies it (1,001) and sends an acknowledgement, but the acknowledgement is lost in a network blip. From the sender's side, the request simply timed out. Did the click get counted?</p>
<p>The sender cannot know. If it gives up, a click might be lost and the advertiser underbilled. If it retries, the count might become 1,002 and the advertiser overbilled. Neither is acceptable for money, which is why so many teams historically ran a batch job overnight to fix whatever the streaming job got wrong. This chapter shows how an engine can make every record count <strong>effectively once</strong> on top of a network that only promises "at least once", and why the hardest part is not the engine at all but the moment results leave it.</p>`,
  sections: [
    {
      id: "what-exactly-once-means",
      title: "What exactly-once really promises",
      kicker: "The goal",
      blocks: [
        {
          type: "problem",
          html: `<p>Distributed systems fail ambiguously. A timeout means "the request was lost, or it was processed and the reply was lost, or it is still being processed". A crashed worker may have finished some of its work. Any pipeline that runs on many machines must decide what to do about work whose outcome is unknown.</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "At most once", tone: "bad", html: "<p>Never retry. No duplicates, but anything caught in a failure is lost. Fine for sampling-based metrics; wrong for billing.</p>" },
            { title: "At least once", tone: "warn", html: "<p>Retry until acknowledged. Nothing is lost, but retries can be applied twice. Fine for idempotent effects; wrong for counters.</p>" },
            { title: "Effectively once", tone: "ok", html: "<p>Retry until acknowledged <em>and</em> make the duplicate harmless, so each record changes state exactly once. This is what streaming systems mean by \"exactly once\".</p>" },
          ],
        },
        {
          type: "idea",
          html: `<p>Exactly-once is a promise about <strong>effects</strong>, not about <strong>executions</strong>. Your code may run several times for the same record, on different machines, after crashes. What the engine guarantees is that the pipeline's state and output reflect each record once, as if nothing had failed.</p>`,
        },
        {
          type: "text",
          html: `<p>This distinction is the source of most confusion. If a processing function sends an email, calls a payment API or increments a counter in an external database directly, the engine cannot take that back when it retries the function. Exactly-once covers the engine's own state and the data passed between its stages. Getting the same guarantee at the edges, where records enter from sources and leave through sinks, takes extra design, covered later in this chapter.</p>
<p>Why does it matter so much? Because it is the <strong>correctness</strong> half of the book's thesis. Without it, every streaming result needs a batch job to check it, and you are back to the Lambda architecture from Chapter 1.</p>`,
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>"The engine is exactly-once, so my HTTP call to the billing service inside the map function happens once." It does not. The function can be retried after a failure, and the external call goes with it. Side effects need idempotent design or a sink built for exactly-once.</p>`,
        },
      ],
    },
    {
      id: "shuffle-dedup",
      title: "Deduplicating at the shuffle",
      kicker: "Retries plus record IDs",
      blocks: [
        {
          type: "text",
          html: `<p>Inside Google Cloud Dataflow, records move between workers through a <strong>shuffle</strong>: the sending worker makes RPCs to the worker that owns each key. The approach the book describes has two halves.</p>
<ol>
<li><strong>Never lose anything.</strong> The sender retries each RPC until it receives a positive acknowledgement. An ambiguous failure always leads to a retry. On its own, this is at-least-once.</li>
<li><strong>Make duplicates harmless.</strong> Every record carries a <strong>unique ID</strong>. The receiver keeps a <strong>catalog</strong> of the IDs it has already processed. When it processes a record, it commits the state change and the record's ID to the catalog <em>in the same atomic write</em>. A retry carrying an ID that is already in the catalog is acknowledged and dropped.</li>
</ol>
<p>The atomic commit is what makes this safe. If the receiver crashed after updating the count but before recording the ID, a retry would be applied again. Because both are written together, either both happened or neither did.</p>`,
        },
        {
          type: "diagram",
          title: "A lost acknowledgement, handled",
          caption: "The receiver applies record #42 and records its ID atomically. The acknowledgement is lost, so the sender retries. The receiver finds #42 in its catalog, drops the duplicate and acknowledges again. The count rises by exactly one.",
          svg: `<svg viewBox="0 0 620 300" role="img" aria-label="Sequence diagram: a record is processed, its acknowledgement is lost, the sender retries and the receiver drops the duplicate using its ID catalog">
<defs><marker id="ss5-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-ink)"/></marker></defs>
<rect x="60" y="16" width="140" height="36" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="130" y="39" text-anchor="middle" font-size="12" font-weight="700">Sender (stage 1)</text>
<rect x="400" y="16" width="160" height="36" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="480" y="39" text-anchor="middle" font-size="12" font-weight="700">Receiver (stage 2)</text>
<line x1="130" y1="52" x2="130" y2="292" stroke-width="1" stroke-dasharray="4 4" style="stroke: var(--dg-line)"/>
<line x1="480" y1="52" x2="480" y2="292" stroke-width="1" stroke-dasharray="4 4" style="stroke: var(--dg-line)"/>
<line x1="130" y1="90" x2="478" y2="90" stroke-width="1.5" style="stroke: var(--dg-ink)" marker-end="url(#ss5-arrow)"/>
<text x="305" y="83" text-anchor="middle" font-size="12">record #42 (+1 click)</text>
<rect x="488" y="98" width="128" height="40" rx="4" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)"/>
<text x="552" y="114" text-anchor="middle" font-size="12">count 1,001 and</text>
<text x="552" y="130" text-anchor="middle" font-size="12">#42 into catalog</text>
<line x1="480" y1="155" x2="322" y2="155" stroke-width="1.5" stroke-dasharray="5 4" style="stroke: var(--dg-muted)"/>
<text x="305" y="160" text-anchor="middle" font-size="16" font-weight="700" style="fill: var(--dg-bad)">X</text>
<text x="400" y="148" text-anchor="middle" font-size="12" style="fill: var(--dg-bad)">ack lost</text>
<rect x="10" y="172" width="112" height="28" rx="4" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="66" y="191" text-anchor="middle" font-size="12">timeout: retry</text>
<line x1="130" y1="220" x2="478" y2="220" stroke-width="1.5" style="stroke: var(--dg-ink)" marker-end="url(#ss5-arrow)"/>
<text x="305" y="213" text-anchor="middle" font-size="12">record #42 again</text>
<rect x="488" y="228" width="128" height="40" rx="4" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)"/>
<text x="552" y="244" text-anchor="middle" font-size="12">#42 already seen:</text>
<text x="552" y="260" text-anchor="middle" font-size="12">drop, ack again</text>
<line x1="480" y1="282" x2="132" y2="282" stroke-width="1.5" style="stroke: var(--dg-ink)" marker-end="url(#ss5-arrow)"/>
<text x="305" y="276" text-anchor="middle" font-size="12">ack</text>
</svg>`,
        },
        {
          type: "lab",
          id: "exactlyOnce",
          caption: "Send records over an unreliable link. Compare a receiver with no deduplication, one that checks a catalog of record IDs, and one that puts a Bloom filter in front of the catalog. Watch duplicates, catalog lookups and the final count.",
        },
        {
          type: "quiz",
          q: "A receiver updates its state first and writes the record ID to its catalog in a separate, later write. It crashes between the two. What happens when the sender retries?",
          options: [
            "Nothing; the catalog catches the retry",
            "The record is applied twice, because its ID never reached the catalog",
            "The record is lost",
            "The sender detects the crash and does not retry",
          ],
          answer: 1,
          explain: "Deduplication only works if the state change and the ID are committed atomically. Here the state changed but the ID was never recorded, so the retry looks new and is applied again.",
        },
      ],
    },
    {
      id: "nondeterminism",
      title: "Nondeterminism and checkpointing",
      kicker: "Why IDs are not enough",
      blocks: [
        {
          type: "problem",
          html: `<p>Deduplication assumes a retry sends <em>the same record with the same ID</em>. But a retry often means re-running the code that produced the record, and that code may not produce the same thing twice.</p>`,
        },
        {
          type: "text",
          html: `<p>User code is nondeterministic more often than people expect:</p>
<ul>
<li>It reads the <strong>current time</strong> ("stamp each order with when we processed it").</li>
<li>It generates <strong>random values</strong>, such as UUIDs for new records.</li>
<li>It <strong>calls an external service</strong> whose answer changes, such as a currency rate or a user profile.</li>
<li>It depends on <strong>iteration order</strong> over a hash map or over records that arrived in a different order.</li>
<li>It emits a window pane whose contents depend on <strong>what has arrived so far</strong>; a retry a few seconds later may include a late record and produce a different total.</li>
</ul>
<p>Suppose a stage converts each order to US dollars using a live exchange rate and gives the output a fresh ID. The first attempt produces "$10.42, ID a1" and sends it; the receiver processes it, but the acknowledgement is lost. The retry recomputes "$10.45, ID b7". The receiver has never seen b7, so it applies it too. Two different versions of one order are now in the downstream state, and no ID catalog could have caught it.</p>`,
        },
        {
          type: "idea",
          html: `<p><strong>Checkpoint the output before sending it.</strong> Dataflow writes each stage's output records, with their IDs, to durable storage as part of committing the processing step. Retries resend that saved output instead of re-running user code. Whatever the code computed the first time becomes the one true version.</p>`,
        },
        {
          type: "steps",
          title: "One processing step at a receiving stage",
          items: [
            "Receive a batch of input records; skip any whose IDs are already in the catalog.",
            "Run the user code, producing new state and output records with fresh IDs.",
            "Commit atomically: the state changes, the input IDs into the catalog, and the output records into a durable checkpoint.",
            "Acknowledge the inputs. Send the checkpointed outputs downstream, retrying until acknowledged; every retry resends the same saved bytes.",
          ],
        },
        {
          type: "quiz",
          q: "A stage enriches each event with a random UUID and sends it on. Shuffle deduplication by record ID is enabled, but output is not checkpointed. What can go wrong on a retry?",
          options: [
            "Nothing; deduplication handles it",
            "The retry regenerates a different UUID, so the duplicate looks new and gets through",
            "The stage will refuse to retry",
            "The UUID collides with an existing one",
          ],
          answer: 1,
          explain: "Without a checkpoint, the retry re-runs the code and gets a new random UUID, so downstream sees two different records. Checkpointing the first output makes the retry resend the same record and ID.",
        },
      ],
    },
    {
      id: "making-it-fast",
      title: "Making exactly-once cheap enough",
      kicker: "Performance",
      blocks: [
        {
          type: "text",
          html: `<p>Read naively, the scheme above is expensive: a catalog lookup for every record, a durable write of every output, and a catalog that grows forever. Four optimizations make it practical.</p>
<h3>1. Graph fusion</h3>
<p>Consecutive steps that need no shuffle between them, such as parse, filter and enrich, are <strong>fused</strong> into one stage running in one process. Records pass between the steps as in-memory function calls. There is no RPC between them, so no retries, no catalog and no checkpoint. Exactly-once costs are paid only at real shuffle boundaries.</p>
<h3>2. Combiner lifting</h3>
<p>For aggregations such as sums and counts, partial aggregation runs on the <strong>sending side</strong> before the shuffle, the same idea as MapReduce combiners. A worker that saw 10,000 clicks for campaign 7 sends one partial sum instead of 10,000 records. Fewer records crossing the shuffle means fewer IDs to deduplicate and less output to checkpoint.</p>
<h3>3. Bloom filters in front of the catalog</h3>
<p>Almost every record is not a duplicate, yet a plain catalog check reads storage to prove it. Each worker keeps a <strong>Bloom filter</strong> of IDs it has seen. A Bloom filter can answer "definitely not seen" with certainty and only ever errs in the other direction ("maybe seen"). So the worker skips the catalog lookup for the vast majority of records, and pays the lookup only for the few that might be duplicates. The book describes these filters as bucketed by ten-minute ranges of system time, so old buckets can simply be thrown away instead of growing forever.</p>`,
        },
        {
          type: "diagram",
          title: "The Bloom filter short-circuit",
          caption: "Most record IDs are new, and the in-memory Bloom filter says so with certainty, so no storage read is needed. Only a \"maybe\" answer pays for a catalog lookup, which then decides whether the record is a true duplicate or a false alarm.",
          svg: `<svg viewBox="0 0 620 250" role="img" aria-label="Decision flow: a Bloom filter either says definitely new, skipping the catalog, or maybe seen, which triggers a catalog lookup">
<defs><marker id="ss5-flow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="10" y="100" width="120" height="44" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="70" y="118" text-anchor="middle" font-size="12">Record ID</text>
<text x="70" y="134" text-anchor="middle" font-size="12">arrives</text>
<rect x="170" y="96" width="140" height="52" rx="6" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/>
<text x="240" y="118" text-anchor="middle" font-size="12" font-weight="700">Bloom filter</text>
<text x="240" y="136" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">in memory</text>
<rect x="380" y="20" width="230" height="44" rx="6" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)"/>
<text x="495" y="38" text-anchor="middle" font-size="12" font-weight="700">Definitely new</text>
<text x="495" y="55" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">process; no storage read</text>
<rect x="380" y="120" width="230" height="44" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<text x="495" y="138" text-anchor="middle" font-size="12" font-weight="700">Maybe seen</text>
<text x="495" y="155" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">look up the catalog</text>
<rect x="330" y="196" width="135" height="44" rx="6" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)"/>
<text x="397" y="214" text-anchor="middle" font-size="12" font-weight="700">In catalog</text>
<text x="397" y="231" text-anchor="middle" font-size="12">drop duplicate</text>
<rect x="475" y="196" width="140" height="44" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="545" y="214" text-anchor="middle" font-size="12" font-weight="700">Not in catalog</text>
<text x="545" y="231" text-anchor="middle" font-size="12">false alarm: process</text>
<line x1="130" y1="122" x2="168" y2="122" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ss5-flow)"/>
<line x1="310" y1="110" x2="378" y2="46" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ss5-flow)"/>
<text x="334" y="74" text-anchor="end" font-size="12" style="fill: var(--dg-ok)">most IDs</text>
<line x1="310" y1="134" x2="378" y2="142" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ss5-flow)"/>
<text x="344" y="158" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">few</text>
<line x1="440" y1="164" x2="410" y2="194" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ss5-flow)"/>
<line x1="545" y1="164" x2="545" y2="194" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ss5-flow)"/>
</svg>`,
        },
        {
          type: "text",
          html: `<h3>4. Garbage-collecting the catalog</h3>
<p>The catalog cannot keep every ID forever. The trick is knowing when a record can no longer be retried. Dataflow tracks this with the <strong>processing-time watermark</strong> from Chapter 3, here the age of the oldest RPC still in flight (alternatively, records carry sequence numbers). Once that watermark passes time T, no sender is still retrying anything sent before T, so catalog entries older than T can be deleted.</p>
<p>One corner case remains: <strong>network remnants</strong>, an old copy of an RPC that was stuck somewhere in the network and shows up long after its ID was garbage-collected. Because each record also carries its send timestamp, the receiver recognizes anything older than the collection horizon and drops it instead of treating it as new.</p>`,
        },
        {
          type: "table",
          title: "Exactly-once building blocks and what each solves",
          headers: ["Problem", "Mechanism"],
          rows: [
            ["Lost RPCs", "Retry until acknowledged"],
            ["Duplicates from retries", "Unique record IDs and a catalog, committed atomically with state"],
            ["Nondeterministic user code", "Checkpoint output before sending; retries resend the saved output"],
            ["Catalog lookup cost", "Per-worker Bloom filters, bucketed by time"],
            ["Catalog growth", "Garbage collection driven by a processing-time watermark; drop network remnants"],
            ["Shuffle volume", "Graph fusion and combiner lifting"],
          ],
        },
      ],
    },
    {
      id: "sources-and-sinks",
      title: "Exactly-once at the edges: sources and sinks",
      kicker: "Side effects",
      blocks: [
        {
          type: "text",
          html: `<h3>Sources: deterministic record IDs</h3>
<p>Deduplication inside the pipeline needs the source to give every record a stable identity, so a record read twice (after a worker restart, say) is recognized. Some sources provide this naturally: a file and byte offset, or a Kafka <strong>topic, partition and offset</strong>, identify a record forever and can be re-read at will. Others need help. Google Cloud Pub/Sub attaches a unique message ID to every message. In Beam, a custom unbounded source that cannot replay deterministically can report a record ID (<code>getCurrentRecordId</code>) and ask the runner to deduplicate by it.</p>
<h3>Sinks: idempotence plus stable input</h3>
<p>A sink writes to a system the engine does not control, such as a database, a warehouse or a file system. The write itself is a side effect, and a retry repeats it. Two properties together make it exactly-once:</p>
<ol>
<li>The write is <strong>idempotent</strong>: doing it twice has the same effect as doing it once. Upserts by key, renames to a fixed name, and inserts with a unique ID that the destination deduplicates all qualify.</li>
<li>The write's <strong>input is deterministic</strong> across retries. Idempotence only helps if the retry writes the same thing. If the retry recomputes a different key, a different random insert ID, or a pane that now includes one more late record, the "idempotent" write creates a second row.</li>
</ol>
<p>The standard way to get stable input is to put a <strong>shuffle</strong> immediately before the side-effecting step. In Beam that is a <code>Reshuffle</code> (or the <code>@RequiresStableInput</code> annotation on the writing function); in Dataflow a shuffle checkpoints its data, so every retry of the next step sees exactly the same elements.</p>`,
        },
        {
          type: "code",
          lang: "java",
          title: "An exactly-once insert into a deduplicating table",
          code: `rows
    .apply("AssignInsertId", ParDo.of(new AttachRandomInsertId())) // nondeterministic: a random UUID
    .apply(Reshuffle.of())                                          // checkpoint: retries reuse the same UUIDs
    .apply("Write", ParDo.of(new InsertWithId()));                  // destination dedups by insert ID`,
          caption: "Without the Reshuffle, a retry of the combined step would mint new UUIDs and the destination would keep both copies.",
        },
        {
          type: "lab",
          id: "sinks",
          caption: "The worker crashes after writing three rows but before committing the step, so the runner retries. Compare four sink designs and see that only an idempotent write fed by checkpointed, deterministic input avoids duplicates.",
        },
        {
          type: "realworld",
          items: [
            { org: "Files sinks (Beam)", title: "Write temporary, then rename", html: "Each bundle is written to a temporary file with a unique name. A final step renames the temporary files to their final names. Rewriting a temporary file on retry is harmless, the list of files to rename is checkpointed, and renaming to a fixed name is idempotent." },
            { org: "BigQuery", title: "Insert IDs and the Storage Write API", html: "The legacy streaming insert API deduplicates rows that share an <code>insertId</code> on a best-effort basis, so the ID must be checkpointed as above. The newer Storage Write API supports exactly-once writes using stream offsets." },
            { org: "Kafka sinks", title: "Transactions", html: "Since Kafka 0.11, producers can be idempotent and can write to several partitions in a transaction. Beam's <code>KafkaIO</code> offers an exactly-once mode built on this, and Flink's Kafka sink commits its transaction when a checkpoint completes." },
          ],
        },
        {
          type: "quiz",
          q: "A sink upserts rows keyed by a UUID generated in the same step, with no shuffle before it. The worker crashes after the write and the step is retried. What is the outcome?",
          options: [
            "One row, because upserts are idempotent",
            "Two rows, because the retry generates a new UUID, so the upsert key differs",
            "Zero rows, because the crash rolls back the write",
            "An error, because the key already exists",
          ],
          answer: 1,
          explain: "An upsert is idempotent only for the same key. Regenerating the UUID on retry produces a different key, so the destination stores both. A shuffle (or stable-input guarantee) between ID generation and the write fixes it.",
        },
      ],
    },
    {
      id: "other-systems",
      title: "How Spark and Flink get exactly-once",
      kicker: "Other approaches",
      blocks: [
        {
          type: "text",
          html: `<p>Dataflow's approach works per record: every shuffled record is deduplicated and every output checkpointed. Other engines reach the same guarantee with coarser units of work.</p>
<p><strong>Spark Streaming</strong> (the original micro-batch DStream API) treats the stream as a series of small batches, each a deterministic computation over a known slice of input. If a batch fails, Spark recomputes it from its lineage and replaces any partial output. Exactly-once holds for the batch results; sinks still have to tolerate a batch being written twice. Structured Streaming keeps the same spirit: it records the offsets of each micro-batch in a checkpoint log so a restarted query reprocesses exactly the same input, and recommends idempotent or transactional sinks (<code>foreachBatch</code> hands you a batch ID you can use to make writes idempotent).</p>
<p><strong>Apache Flink</strong> takes periodic <strong>consistent snapshots</strong> of the whole job, a variant of the Chandy-Lamport distributed snapshot algorithm. Sources inject <strong>barriers</strong> into the stream. When an operator has received barrier <em>n</em> on its inputs, it saves its state for snapshot <em>n</em> and forwards the barrier. A snapshot is complete when every operator has saved its state. On failure, every operator restores the last complete snapshot and the sources rewind to the offsets recorded in it.</p>`,
        },
        {
          type: "diagram",
          title: "Checkpoint barriers flowing with the data",
          caption: "The source records its offsets and sends a barrier along with the records. When the barrier reaches the operator, the operator saves its state. Everything before barrier n is in snapshot n; everything after it belongs to the next one.",
          svg: `<svg viewBox="0 0 620 205" role="img" aria-label="Records and checkpoint barriers flow from a source to an operator, which saves its state to durable storage when a barrier arrives">
<defs><marker id="ss5-bar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="10" y="60" width="100" height="50" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="60" y="82" text-anchor="middle" font-size="12" font-weight="700">Source</text>
<text x="60" y="100" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">offsets</text>
<line x1="110" y1="85" x2="426" y2="85" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ss5-bar)"/>
<circle cx="140" cy="85" r="6" style="fill: var(--dg-1)"/>
<circle cx="170" cy="85" r="6" style="fill: var(--dg-1)"/>
<circle cx="230" cy="85" r="6" style="fill: var(--dg-1)"/>
<circle cx="260" cy="85" r="6" style="fill: var(--dg-1)"/>
<circle cx="290" cy="85" r="6" style="fill: var(--dg-1)"/>
<circle cx="350" cy="85" r="6" style="fill: var(--dg-1)"/>
<circle cx="380" cy="85" r="6" style="fill: var(--dg-1)"/>
<rect x="197" y="66" width="6" height="38" style="fill: var(--dg-4)"/>
<text x="200" y="58" text-anchor="middle" font-size="12" style="fill: var(--dg-4)">barrier n+1</text>
<rect x="317" y="66" width="6" height="38" style="fill: var(--dg-4)"/>
<text x="320" y="58" text-anchor="middle" font-size="12" style="fill: var(--dg-4)">barrier n</text>
<text x="270" y="128" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">data flows this way</text>
<rect x="430" y="55" width="130" height="60" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="495" y="80" text-anchor="middle" font-size="12" font-weight="700">Operator</text>
<text x="495" y="98" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">keyed state</text>
<line x1="495" y1="115" x2="495" y2="150" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ss5-bar)"/>
<text x="488" y="140" text-anchor="end" font-size="12">on barrier: save state</text>
<rect x="400" y="152" width="190" height="40" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="495" y="177" text-anchor="middle" font-size="12">Durable snapshot storage</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>Snapshots make normal processing cheap: there is no per-record ID, catalog or output checkpoint, just a periodic state save (taken asynchronously, so processing continues). The costs show up elsewhere. A failure rolls the <em>whole job</em> back to the last snapshot, so work since then is redone everywhere, not just where the failure happened. And sinks must not expose output until the snapshot that produced it is complete, otherwise a rollback would leave already-published results that are then produced again. Flink handles this with <strong>two-phase commit</strong> sinks (supported since Flink 1.4): output is written into a transaction that is pre-committed with the snapshot and committed only once the snapshot completes. The visible latency of such a sink is therefore tied to the checkpoint interval.</p>`,
        },
        {
          type: "table",
          title: "Three routes to exactly-once",
          headers: ["System", "Mechanism", "Recovery", "Main cost"],
          rows: [
            ["Dataflow", "Per-record IDs, dedup catalog, output checkpoints at shuffles", "Retry only the affected work", "Per-record overhead, reduced by fusion, combiners and Bloom filters"],
            ["Spark (micro-batch)", "Deterministic batches with recorded input offsets", "Recompute the failed batch", "Latency tied to batch interval"],
            ["Flink", "Consistent snapshots via barriers", "Roll back the whole job and replay sources", "Transactional sinks commit only per checkpoint"],
          ],
        },
        {
          type: "callout",
          tone: "modern",
          html: `<p>Kafka Streams gets exactly-once from Kafka itself: with <code>processing.guarantee=exactly_once_v2</code>, consuming input offsets, updating state changelogs and producing output all happen in one Kafka transaction, so they commit or abort together. It only covers data that stays in Kafka; writes to other systems still need idempotence.</p>`,
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
          html: `<p>Exactly-once comes up in any design involving money or counts that people are paid by: payments, billing, ad clicks, usage metering, payouts. Interviewers often ask "what if this worker crashes halfway?" and listen for whether you separate the engine's guarantee from the sink's.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>Walk the record from source to sink:</p>
<ol>
<li><strong>Source</strong>: a replayable log with stable record identity (Kafka partition and offset, or a producer-assigned event ID).</li>
<li><strong>Processing</strong>: an engine with exactly-once state (Dataflow's dedup and checkpoints, Flink snapshots, Kafka Streams transactions). Say explicitly that code may run more than once.</li>
<li><strong>Determinism</strong>: anything random, time-based or externally looked up is computed once and checkpointed before it drives a side effect.</li>
<li><strong>Sink</strong>: an idempotent write keyed by a deterministic ID (for example <code>account#window#pane</code>), or a transactional sink committed with the checkpoint.</li>
<li><strong>Verification</strong>: reconcile counts end to end, because guarantees are only as good as the weakest edge.</li>
</ol>`,
        },
        {
          type: "quiz",
          q: "Your Flink job aggregates payments per account per minute and writes results to a ledger database with plain INSERTs. Flink checkpoints are exactly-once. After a failure and restore, what risk remains?",
          options: [
            "None; Flink's checkpoints make the whole pipeline exactly-once",
            "Results produced after the last checkpoint are recomputed and inserted again, creating duplicate ledger rows",
            "Payments since the last checkpoint are lost forever",
            "The ledger rows are rolled back automatically",
          ],
          answer: 1,
          explain: "On restore, Flink rewinds to the last snapshot and replays the input since then, so the rows it wrote in that interval are written a second time. Fix it with an idempotent upsert keyed by a deterministic ID such as account and window, or with a two-phase-commit sink tied to checkpoints.",
        },
      ],
    },
  ],
  takeaways: [
    "Exactly-once is about effects, not executions: code may run several times, but state and output reflect each record once.",
    "Dataflow builds it from at-least-once RPCs plus unique record IDs and a catalog of seen IDs, committed atomically with the state change.",
    "Deduplication fails if a retry recomputes a different record, so outputs are checkpointed before sending and retries resend the saved version.",
    "Fusion and combiner lifting shrink what crosses a shuffle; Bloom filters skip most catalog lookups; a processing-time watermark tells when catalog entries can be deleted.",
    "Sources need stable record identity (offsets or message IDs). Sinks need idempotent writes <em>and</em> deterministic input, usually by putting a shuffle before the write.",
    "Spark relies on deterministic micro-batches and Flink on barrier-based snapshots with two-phase-commit sinks; snapshots are cheaper per record but roll back the whole job.",
  ],
  furtherReading: [
    { title: "MillWheel: Fault-Tolerant Stream Processing at Internet Scale (Akidau et al., VLDB 2013)", note: "Per-record IDs, deduplication and strong productions: the ancestor of Dataflow's approach." },
    { title: "Lightweight Asynchronous Snapshots for Distributed Dataflows (Carbone et al., 2015)", note: "The barrier-based snapshot algorithm behind Flink's checkpoints." },
    { title: "Distributed Snapshots: Determining Global States of Distributed Systems (Chandy and Lamport, 1985)", note: "The classic algorithm that Flink's snapshots adapt." },
    { title: "Apache Beam programming guide", url: "https://beam.apache.org/documentation/programming-guide/", note: "Transforms, Reshuffle and stable-input considerations for side effects." },
  ],
};
