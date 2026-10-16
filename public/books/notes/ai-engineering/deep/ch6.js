// Deep dive: Chapter 6, RAG and agents. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch6 = {
  hook: `<p>You ship an internal help assistant. On day one an employee asks, "What is our parental leave policy in Germany?" The model answers fluently, confidently, and wrongly: it has never seen your HR handbook, so it blends what it learned about German law with what other companies publish. A week later someone asks it to "reset my VPN token and email me the new one." It can describe how VPN tokens work in general, but it cannot actually do anything.</p>
<p>These are two different gaps. The first is a <strong>knowledge</strong> gap: the right information exists, just not inside the model. The second is an <strong>action</strong> gap: the model can only produce text, while the task needs lookups, calculations and changes in other systems. Retrieval-augmented generation (RAG) closes the first gap by fetching the right context for each query. Agents close the second by letting the model call tools in a loop. Both are really about the same question: how do you give a model exactly what it needs for <em>this</em> request?</p>`,
  sections: [
    {
      id: "why-retrieval",
      title: "Why models need retrieval",
      kicker: "The problem",
      blocks: [
        {
          type: "problem",
          html: `<p>A model only knows what was in its training data, frozen at a cutoff date, and none of your private documents. Pasting everything into the prompt does not scale: context windows are finite, long prompts cost money and latency on every call, and models tend to use information in the middle of a long context less reliably than information near the start or end.</p>`,
        },
        {
          type: "idea",
          html: `<p>Split the system in two. A <strong>retriever</strong> finds the few pieces of external information that matter for the current query, and a <strong>generator</strong> (the model) answers using them. Each query gets its own small, relevant context instead of one giant shared one.</p>`,
        },
        {
          type: "text",
          html: `<p>Retrieval has two phases. <strong>Indexing</strong> happens ahead of time: you split documents into chunks and process them into a structure that is fast to search, such as an inverted index of terms or a vector index of embeddings. <strong>Querying</strong> happens per request: the query goes to the retriever, the top-k chunks come back, and they are inserted into the prompt next to the user's question.</p>
<p>The payoff is threefold. Answers can cite private and recent information. Hallucinations drop because the model can ground its answer in text in front of it. And updating knowledge becomes a data operation (re-index a document) rather than a training run. The price is a new component that can fail on its own: if the retriever misses the relevant chunk, even a perfect model will answer from memory or give up.</p>`,
        },
        {
          type: "diagram",
          title: "The two phases of RAG",
          caption: "Indexing runs offline over your documents. At query time the retriever looks up the index and the top chunks are placed into the prompt with the question.",
          svg: `<svg viewBox="0 0 640 260" role="img" aria-label="RAG pipeline: an offline indexing row and an online querying row connected through the index">
<defs><marker id="ai6-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<text x="20" y="28" font-size="12" style="fill: var(--dg-muted)">Indexing (offline, once per document change)</text>
<rect x="20" y="42" width="120" height="50" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="80" y="72" text-anchor="middle" font-size="13">Documents</text>
<rect x="175" y="42" width="110" height="50" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="230" y="72" text-anchor="middle" font-size="13">Chunk</text>
<rect x="320" y="42" width="120" height="50" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="380" y="72" text-anchor="middle" font-size="12">Embed / tokenize</text>
<rect x="475" y="42" width="145" height="50" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="547" y="64" text-anchor="middle" font-size="13" font-weight="700">Index</text>
<text x="547" y="82" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">vectors + terms</text>
<line x1="140" y1="67" x2="173" y2="67" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ai6-arrow)"/>
<line x1="285" y1="67" x2="318" y2="67" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ai6-arrow)"/>
<line x1="440" y1="67" x2="473" y2="67" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ai6-arrow)"/>
<text x="20" y="160" font-size="12" style="fill: var(--dg-muted)">Querying (every request)</text>
<rect x="20" y="175" width="100" height="50" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="70" y="205" text-anchor="middle" font-size="13">Query</text>
<rect x="150" y="175" width="110" height="50" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="205" y="205" text-anchor="middle" font-size="13">Retriever</text>
<rect x="290" y="175" width="150" height="50" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="365" y="197" text-anchor="middle" font-size="13">Prompt</text>
<text x="365" y="214" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">query + top-k chunks</text>
<rect x="470" y="175" width="70" height="50" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="505" y="205" text-anchor="middle" font-size="13">Model</text>
<rect x="565" y="175" width="65" height="50" rx="8" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="597" y="205" text-anchor="middle" font-size="13">Answer</text>
<line x1="120" y1="200" x2="148" y2="200" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ai6-arrow)"/>
<line x1="260" y1="200" x2="288" y2="200" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ai6-arrow)"/>
<line x1="440" y1="200" x2="468" y2="200" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ai6-arrow)"/>
<line x1="540" y1="200" x2="563" y2="200" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ai6-arrow)"/>
<line x1="520" y1="92" x2="235" y2="173" stroke-width="2" stroke-dasharray="5 4" style="stroke: var(--dg-muted)" marker-end="url(#ai6-arrow)"/>
<text x="330" y="128" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">top-k lookup</text>
</svg>`,
        },
        {
          type: "keypoints",
          items: [
            "RAG = retriever + generator. The retriever's job is to put the right few chunks in front of the model.",
            "Indexing is offline and repeated only when documents change; querying runs on every request and must be fast.",
            "A retrieval miss cannot be fixed by the model, so retrieval quality is usually the first thing to measure.",
          ],
        },
      ],
    },
    {
      id: "term-vs-embedding",
      title: "Term-based, embedding-based and hybrid retrieval",
      kicker: "How retrieval works",
      blocks: [
        {
          type: "text",
          html: `<h3>Term-based retrieval: matching words</h3>
<p>The oldest approach scores a chunk by how many query words it contains, weighted by how informative each word is. A word that appears in almost every chunk ("the", "policy") tells you little; a rare word ("Germany", "ERR_4012") tells you a lot. That weighting is called <strong>inverse document frequency</strong> (IDF). <strong>BM25</strong>, the standard modern formula, adds two refinements on top of TF-IDF.</p>
<p><span class="formula">BM25(q, d) = &Sigma;<sub>t in q</sub> IDF(t) &middot; f(t,d)(k1 + 1) / ( f(t,d) + k1(1 &minus; b + b&middot;|d|/avgdl) )</span></p>
<p>First, <strong>saturation</strong>: <code>k1</code> caps how much repeating a term helps, so a chunk that says "leave" twenty times does not crush one that says it twice. Second, <strong>length normalization</strong>: <code>b</code> discounts long chunks, which match more words simply by being long. Common defaults are <code>k1 = 1.2</code> and <code>b = 0.75</code>. BM25 is served from an inverted index (term to list of chunks), which makes it very fast and cheap.</p>`,
        },
        {
          type: "text",
          html: `<h3>Embedding-based retrieval: matching meaning</h3>
<p>An embedding model maps text to a vector so that texts with similar meaning land close together. You embed every chunk at indexing time, embed the query at request time, and return the chunks with the highest cosine similarity. "How much time off do new parents get?" can now match a chunk titled "Parental leave entitlements" even though they share no keywords.</p>
<p>Comparing the query with every vector is too slow at millions of chunks, so vector databases use <strong>approximate nearest neighbor</strong> (ANN) indexes. HNSW builds a layered proximity graph and walks it greedily toward the query. IVF clusters vectors and only searches the clusters nearest the query. Product quantization compresses vectors so more fit in memory. All of them trade a little recall for a large speedup.</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "BM25 is strong when", tone: "info", html: "Queries contain exact identifiers: product codes, error messages, names, ticket numbers. It needs no model, no GPU, and works on day one." },
            { title: "Embeddings are strong when", tone: "ok", html: "Users paraphrase or use different vocabulary from the documents. Quality depends on the embedding model, the domain, and the chunking." },
          ],
        },
        {
          type: "text",
          html: `<h3>Hybrid search and reciprocal rank fusion</h3>
<p>Because the two retrievers fail in different places, combining them usually beats either alone. You can run them <em>sequentially</em> (a cheap retriever fetches 100 candidates, then a more expensive model reranks them) or in <em>parallel</em>, merging the two ranked lists. The catch with merging is that BM25 scores and cosine similarities live on unrelated scales. <strong>Reciprocal rank fusion</strong> (RRF) sidesteps that by ignoring scores and using only ranks:</p>
<p><span class="formula">RRF(d) = &Sigma;<sub>retrievers r</sub> 1 / (k + rank<sub>r</sub>(d)),&nbsp;&nbsp; k &asymp; 60</span></p>
<p>A worked example. Chunk A is 1st in BM25 and 3rd in embeddings: 1/61 + 1/63 &asymp; 0.0323. Chunk C is 5th in BM25 and 1st in embeddings: 1/65 + 1/61 &asymp; 0.0318. Chunk B is 2nd in BM25 but missing from the embedding list: 1/62 &asymp; 0.0161. A wins, C is close behind, and B, which only one retriever liked, drops to third. Agreement across retrievers is rewarded; the constant <code>k</code> keeps a single first place from dominating.</p>`,
        },
        {
          type: "lab",
          id: "retrieval",
          caption: "Run the same help-center queries through BM25, the embedding retriever and the RRF hybrid. Find a query where each single retriever misses a relevant chunk that the hybrid recovers.",
        },
        {
          type: "realworld",
          items: [
            { org: "Elasticsearch / OpenSearch", title: "BM25 by default", html: "Both use BM25 as their default text similarity, with <code>k1</code> and <code>b</code> exposed as settings. Both also support vector fields, so hybrid search can live in one engine." },
            { org: "FAISS and pgvector", title: "ANN indexes", html: "Meta's FAISS library implements IVF, product quantization and HNSW. The pgvector extension adds HNSW and IVFFlat indexes to PostgreSQL, so vectors can sit next to relational data." },
          ],
        },
        {
          type: "quiz",
          q: "Chunk X is ranked 1st by BM25 and not returned at all by the embedding retriever. Chunk Y is ranked 4th by both. With RRF and k = 60, which ranks higher?",
          options: ["X, because a first place always wins", "Y, because two moderate ranks beat one top rank", "They tie", "It depends on the raw BM25 score"],
          answer: 1,
          explain: "X scores 1/61 &asymp; 0.0164. Y scores 1/64 + 1/64 &asymp; 0.0313, nearly double. RRF rewards documents that several retrievers agree on, and raw scores play no part.",
        },
      ],
    },
    {
      id: "retrieval-quality",
      title: "Making retrieval good: chunking, reranking, rewriting and evaluation",
      kicker: "Tuning the retriever",
      blocks: [
        {
          type: "text",
          html: `<h3>Measure retrieval separately from answers</h3>
<p>Two numbers describe a retriever on a labeled query. <strong>Context precision</strong> is the fraction of retrieved chunks that are relevant. <strong>Context recall</strong> is the fraction of all relevant chunks that were retrieved. If you return 5 chunks, 3 are relevant, and 4 relevant chunks exist in the corpus, precision is 3/5 = 0.6 and recall is 3/4 = 0.75. Ranking metrics such as NDCG, MAP and MRR additionally reward putting the relevant chunks near the top.</p>
<p>Recall is the expensive one, because you must annotate every relevant chunk for each query. Many teams therefore track precision with an AI judge on live traffic and measure recall on a smaller hand-labeled set. Always measure the final answer too: better retrieval only matters if it produces better responses.</p>`,
        },
        {
          type: "text",
          html: `<h3>Chunking</h3>
<p>How you split documents decides what can ever be retrieved. You can split by characters, words, sentences, paragraphs, tokens, or semantic boundaries such as headings, usually with some overlap so a fact that straddles a boundary survives in at least one chunk.</p>
<p>Small chunks make matches precise and let you fit more distinct items into the prompt, but they strip context: a chunk saying "this limit is 30 days" is useless if the subject was two paragraphs earlier. Large chunks keep context but blur the embedding (one vector now averages several topics) and spend tokens on irrelevant text. The chunk must also fit within the embedding model's input limit. There is no universal size; pick candidates and compare them on your retrieval metrics.</p>`,
        },
        {
          type: "steps",
          title: "Cheap fixes for the most common misses",
          items: [
            "<strong>Query rewriting.</strong> In a conversation, \"How about Emily Doe?\" means nothing on its own. Have a model rewrite it into a self-contained query (\"What is Emily Doe's parental leave balance?\") before retrieval.",
            "<strong>Reranking.</strong> Retrieve a generous candidate set (say 50), then reorder it with a stronger model. A cross-encoder reads the query and each chunk together, which is more accurate than comparing two independent embeddings but too slow to run over the whole corpus. Recency can also be a reranking signal.",
            "<strong>Contextual retrieval.</strong> Augment each chunk before indexing with information about where it came from: document title, section heading, tags, or a short model-written summary of how the chunk fits into the document. The orphaned \"this limit is 30 days\" becomes findable.",
            "<strong>Hybrid search.</strong> Add BM25 next to embeddings (or the reverse) so exact terms and paraphrases are both covered.",
          ],
        },
        {
          type: "callout",
          tone: "modern",
          html: `<p>Anthropic published a technique it calls "contextual retrieval" in 2024: a model writes a short, chunk-specific context that is prepended to each chunk before both embedding and BM25 indexing. It is a concrete instance of the general idea above, and it is cheap when combined with prompt caching, because the whole document is the shared prefix for every chunk.</p>`,
        },
        {
          type: "quiz",
          q: "Your RAG assistant gives wrong answers. On a labeled set you find the relevant chunk is in the retrieved top 5 for 95% of queries. Where should you look first?",
          options: ["Chunk size and overlap", "Adding a reranker", "The generation side: prompt, context placement, model choice", "Switching to a better embedding model"],
          answer: 2,
          explain: "Recall is already high, so retrieval is mostly doing its job. The model is receiving the right context and still answering wrongly, which points at the prompt instructions, where the key chunk sits in the context, how much distracting context surrounds it, or the model itself.",
        },
      ],
    },
    {
      id: "agents-and-tools",
      title: "Agents: a model, tools and a plan",
      kicker: "From answering to acting",
      blocks: [
        {
          type: "idea",
          html: `<p>An agent is anything that perceives an <strong>environment</strong> and acts on it. An AI agent is a model that can choose <strong>tools</strong> (actions) and <strong>plan</strong> a sequence of them toward a goal. The environment and the tool inventory together define what the agent can possibly do.</p>`,
        },
        {
          type: "text",
          html: `<p>Tools fall into three groups. <strong>Knowledge augmentation</strong> tools fetch information: a retriever, web search, a SQL query, an internal API. <strong>Capability extension</strong> tools cover things models do badly on their own: a calculator, a code interpreter, a unit converter, a translator. <strong>Write actions</strong> change the world: send an email, update a record, place an order. The first two make an agent smarter; the third makes it genuinely useful and genuinely dangerous.</p>
<p>Mechanically, tool use runs through <strong>function calling</strong>. You describe each tool with a name, a purpose and a parameter schema. The model responds with a structured call (a tool name and arguments) instead of prose; your code executes it and returns the result to the model as new context. The model never runs anything itself, which is exactly why your code is the place to validate and gate calls.</p>`,
        },
        {
          type: "text",
          html: `<h3>Planning, ReAct and reflection</h3>
<p>A plan is a sequence of tool calls. A model can write the whole plan upfront, or decide one step at a time. <strong>ReAct</strong> interleaves the two: the model writes a <em>Thought</em> about what to do next, emits an <em>Action</em> (a tool call), reads the <em>Observation</em> (the result), and repeats until it can answer. Because each step sees the previous result, the plan adapts, and the transcript is an inspectable record of why the agent did what it did.</p>
<p><strong>Reflection</strong> adds a check: after a step or before finishing, the model (or a second model) evaluates whether the result is correct and the goal is met, and corrects course if not. Reflexion is a well-known version that keeps written lessons from failed attempts for the next try. Reflection costs extra calls and tokens, so it is a quality-for-cost trade.</p>`,
        },
        {
          type: "diagram",
          title: "The ReAct loop",
          caption: "The model alternates between reasoning and acting. Tool results come back as observations that feed the next thought, until the model decides it is done.",
          svg: `<svg viewBox="0 0 600 260" role="img" aria-label="ReAct loop: task to thought, thought to action, action to tools, tools to observation, observation back to thought, thought to final answer">
<defs><marker id="ai6-loop" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="20" y="108" width="100" height="48" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="70" y="128" text-anchor="middle" font-size="13" font-weight="700">Task</text>
<text x="70" y="146" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">user goal</text>
<rect x="170" y="30" width="150" height="50" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="245" y="51" text-anchor="middle" font-size="13" font-weight="700">Thought</text>
<text x="245" y="69" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">decide next step</text>
<rect x="380" y="108" width="150" height="50" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="455" y="129" text-anchor="middle" font-size="13" font-weight="700">Action</text>
<text x="455" y="147" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">tool name + args</text>
<rect x="380" y="198" width="150" height="46" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="455" y="226" text-anchor="middle" font-size="13">Tools / environment</text>
<rect x="170" y="190" width="150" height="50" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="245" y="211" text-anchor="middle" font-size="13" font-weight="700">Observation</text>
<text x="245" y="229" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">tool output</text>
<rect x="420" y="10" width="150" height="44" rx="8" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="495" y="37" text-anchor="middle" font-size="13">Final answer</text>
<line x1="120" y1="122" x2="190" y2="82" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ai6-loop)"/>
<line x1="320" y1="40" x2="418" y2="32" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ai6-loop)"/>
<text x="362" y="28" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">done</text>
<line x1="320" y1="72" x2="430" y2="106" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ai6-loop)"/>
<line x1="455" y1="158" x2="455" y2="196" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ai6-loop)"/>
<text x="462" y="182" font-size="12" style="fill: var(--dg-muted)">execute</text>
<line x1="380" y1="219" x2="322" y2="216" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ai6-loop)"/>
<line x1="245" y1="190" x2="245" y2="82" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ai6-loop)"/>
<text x="252" y="140" font-size="12" style="fill: var(--dg-muted)">next step</text>
</svg>`,
        },
        {
          type: "lab",
          id: "react",
          caption: "Step through the agent's Thought, Action, Observation trace for the package-weight task. Inject a planning failure, then switch on plan validation and reflection to see which one catches it.",
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>Errors compound. If each step succeeds 95% of the time and steps fail independently, a 10-step task succeeds about 0.95<sup>10</sup> &asymp; 60% of the time, and a 20-step task about 36%. Long agent chains need either very reliable steps or checkpoints that catch and fix mistakes along the way.</p>`,
        },
      ],
    },
    {
      id: "agent-failures",
      title: "How agents fail and how to evaluate them",
      kicker: "Failure modes",
      blocks: [
        {
          type: "text",
          html: `<p>When an agent gets a task wrong, it helps to know <em>which kind</em> of wrong, because each kind has a different fix. The failures group into planning failures, tool failures and efficiency failures.</p>`,
        },
        {
          type: "table",
          title: "A taxonomy of agent failures",
          headers: ["Failure", "Example (package-weight task)", "Typical fix"],
          rows: [
            ["Invalid tool", "Calls <code>kg_converter</code>, which does not exist", "Validate tool names against the inventory before execution"],
            ["Valid tool, invalid parameters", "<code>lbs_to_kg()</code> with no argument, or with a string", "Schema-check arguments; return a clear error so the model can retry"],
            ["Valid tool, incorrect values", "<code>lbs_to_kg(12)</code> instead of 120", "Harder: reflection, or check values against the task text"],
            ["Goal failure", "Converts the weight but forgets the 5 kg of packing", "Reflection against the original goal and its constraints"],
            ["Reflection error", "Declares success when the task is not finished", "An independent checker, or a verifiable success test"],
            ["Tool failure", "The converter returns a wrong number, or a needed tool is missing", "Test tools on their own; add the missing tool"],
            ["Inefficiency", "Twelve steps and many calls for a two-step task", "Step and budget limits; compare against a baseline"],
          ],
        },
        {
          type: "text",
          html: `<p>To evaluate planning, build a dataset of tasks with known good outcomes and run the agent many times. Track the percentage of valid plans and how many attempts a valid plan takes, the percentage of valid tool calls, how often valid tools get invalid or incorrect parameters, goal success including constraints such as budget or deadline, and steps, cost and time per task compared with a baseline (another agent, or a human doing the same task).</p>
<p>A useful design choice is to <strong>decouple plan generation, validation and execution</strong>. The model proposes a plan; cheap code (or a second model) checks it: are the tools real, are the arguments well-formed, does the plan touch anything irreversible? Only then does it run. A bad plan caught before execution costs one model call; caught after, it may cost a sent email.</p>`,
        },
        {
          type: "tradeoffs",
          title: "Containing write actions",
          prosLabel: "Controls that help",
          consLabel: "What they cost",
          pros: [
            "Least privilege: each tool can touch only what the task needs",
            "Human approval for impactful or irreversible writes",
            "Sandboxed code execution, step limits and spend limits",
            "Logging every tool call and result for audit and evaluation",
          ],
          cons: [
            "Approvals add latency and reduce automation",
            "Narrow permissions mean more tools to build and maintain",
            "Limits can cut off legitimately long tasks",
            "Logs of tool calls may contain sensitive data and need their own protection",
          ],
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p>Agents read untrusted text: web pages, emails, retrieved documents, tool outputs. Any of these can contain instructions aimed at the model (indirect prompt injection). An agent with write tools that obeys such an instruction can leak data or take actions its user never asked for. Treat tool outputs as data, not commands, and keep humans in the loop for consequential actions.</p>`,
        },
        {
          type: "quiz",
          q: "An agent's traces show it frequently calls a real tool with arguments that pass the schema check, but the values are wrong (for example, a date from the wrong year). Which control is most likely to catch this?",
          options: ["Validating tool names against the inventory", "JSON schema validation of arguments", "A reflection step that checks values against the task and the observations", "Raising the step limit"],
          answer: 2,
          explain: "Name and schema checks only catch invalid tools and malformed arguments. Well-formed but incorrect values need something that understands the task, such as a reflection step or a domain-specific check.",
        },
      ],
    },
    {
      id: "memory",
      title: "Memory: what the agent remembers and where",
      kicker: "State across steps",
      blocks: [
        {
          type: "text",
          html: `<p>An agent working through a long task, or a chat assistant used for months, accumulates more information than fits in one context window. Memory design decides what is kept, where, and how it comes back.</p>`,
        },
        {
          type: "table",
          headers: ["Memory", "Where it lives", "Lasts", "Analogy"],
          rows: [
            ["Internal knowledge", "Model weights", "Until the model is retrained or replaced", "What you learned at school"],
            ["Short-term", "The context window", "The current session or task", "What you are holding in mind right now"],
            ["Long-term", "External store (vector database, key-value store, files)", "Across sessions; editable and deletable", "Your notebook"],
          ],
        },
        {
          type: "text",
          html: `<p>Long-term memory uses the same machinery as RAG: the agent writes facts, summaries or past interactions to an external store and retrieves the relevant ones when needed. The difference is who writes the data. In RAG it is your document corpus; in agent memory it is the agent itself, which means it can store mistakes, duplicates and facts that later turn out to be false.</p>
<p>Managing short-term memory means deciding what leaves the context when it fills up. <strong>FIFO</strong> drops the oldest messages, which is simple but may discard the user's original instructions. <strong>Summarization</strong> compresses older turns into a short recap. <strong>Reflection</strong> has the model decide which facts are worth keeping and writes them to long-term memory. Long-term memory also needs a policy for contradictions: if the user said "I'm vegetarian" in March and "I eat fish now" in June, the newer fact should usually win, and the store should not return both.</p>`,
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>Long-term memory about users is personal data. Give users a way to see and delete what is stored, set retention limits, and keep one user's memories out of another user's context.</p>`,
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
          html: `<p>RAG comes up in almost every LLM application design: support bots, internal search, coding assistants, document Q&amp;A. Agents come up whenever the system must take actions or do multi-step work. Interviewers want to see that you treat retrieval as its own measurable component and that you respect the risks of tools.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>A strong answer for a RAG design covers:</p>
<ol>
<li>The pipeline: chunking and indexing offline, retrieval and prompt assembly online.</li>
<li>Retriever choice: start with BM25 as a baseline, add embeddings, merge with RRF or a reranker.</li>
<li>Quality levers: chunk size and overlap, query rewriting, contextual retrieval, reranking.</li>
<li>Evaluation: context precision and recall on labeled queries, plus end-to-end answer quality, debugged by separating retrieval misses from generation errors.</li>
</ol>
<p>For agents add: the three tool types, ReAct-style loops, the planning failure taxonomy, compounding error, and containment of write actions (validation before execution, least privilege, human approval).</p>`,
        },
        {
          type: "quiz",
          q: "An interviewer asks why you would start a RAG project with BM25 rather than a vector database. Which is the best reason?",
          options: [
            "BM25 always gives better answers than embeddings",
            "It is a fast, cheap, strong baseline that handles exact terms well, and it tells you how much embeddings actually add",
            "Vector databases cannot scale beyond a million chunks",
            "Embeddings cannot be combined with keyword search",
          ],
          answer: 1,
          explain: "BM25 is not always better, but it needs no model, runs on an inverted index, and handles identifiers that embeddings often miss. Having it as a baseline lets you measure whether embeddings (or hybrid search) earn their extra cost.",
        },
      ],
    },
  ],
  takeaways: [
    "RAG splits the job into a retriever that finds the right context and a generator that uses it; if retrieval misses, the model cannot recover.",
    "BM25 matches exact terms cheaply; embeddings match meaning. Hybrid search with reciprocal rank fusion, <code>&Sigma; 1/(60 + rank)</code>, usually beats either alone without needing comparable scores.",
    "Measure retrieval on its own (context precision and recall) and debug wrong answers by first asking whether the right chunk was retrieved.",
    "Chunking, query rewriting, reranking and contextual retrieval fix most retrieval misses cheaply.",
    "An agent is a model plus tools plus planning. Errors compound across steps (0.95<sup>10</sup> &asymp; 0.6), so validate plans before execution and reflect before finishing.",
    "Write actions make agents useful and dangerous: least privilege, human approval and defenses against injected instructions are part of the design.",
    "Agent memory has three layers: weights, the context window, and an external store retrieved like RAG, with policies for eviction and contradictions.",
  ],
  furtherReading: [
    { title: "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks (Lewis et al., 2020)", url: "https://arxiv.org/abs/2005.11401", note: "The paper that named RAG, pairing a dense retriever with a sequence-to-sequence generator." },
    { title: "ReAct: Synergizing Reasoning and Acting in Language Models (Yao et al., 2022)", url: "https://arxiv.org/abs/2210.03629", note: "Interleaving thoughts, tool actions and observations." },
    { title: "Reciprocal Rank Fusion outperforms Condorcet and individual Rank Learning Methods (Cormack, Clarke and Buettcher, 2009)", note: "The short paper behind RRF and the k = 60 constant." },
    { title: "Reflexion: Language Agents with Verbal Reinforcement Learning (Shinn et al., 2023)", note: "Agents that write down lessons from failed attempts and retry." },
  ],
};
