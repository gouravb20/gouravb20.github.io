// Deep dive: Chapter 8, RAG application evaluation. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch8 = {
  hook: `<p>Your movie agent from chapter 5 gets a complaint: it cannot answer "Who has the longest name among all actors?" You add a few-shot example to the text2cypher prompt, try the question, and it works. Two weeks later someone notices that "List people born before 1940" now returns movie titles. Nobody connected the two, because nobody re-checked the old questions after the fix.</p>
<p>Every change to an LLM system, a prompt tweak, a new tool, a model upgrade, can improve one behavior and quietly break another. The only defense is a <strong>benchmark</strong>: a fixed set of questions with known correct answers, run after every change, scored stage by stage. This chapter designs one for the movies agent and scores it with <strong>RAGAS</strong>.</p>`,
  sections: [
    {
      id: "why-evaluate",
      title: "Why a growing RAG system needs a benchmark",
      kicker: "The problem",
      blocks: [
        {
          type: "problem",
          html: `<p>LLM systems fail softly. A broken query returns an error you notice; a slightly wrong tool choice returns a fluent, plausible, incorrect answer that nobody notices. Trying a few questions by hand after each change catches the failure you were fixing, not the ones you just introduced.</p>`,
        },
        {
          type: "text",
          html: `<p>An end-to-end score ("72% correct") tells you <em>that</em> something is wrong but not <em>where</em>. An agentic RAG system has several stages, and each fails differently and needs a different fix. So the book evaluates each stage separately as well as the whole:</p>`,
        },
        {
          type: "diagram",
          title: "What to check at each stage",
          caption: "Stage-level checks point to the fix: a wrong tool means better descriptions or a new tool; missing context means better retrieval; an unfaithful answer means a stricter prompt or a different model.",
          svg: `<svg viewBox="0 0 640 200" role="img" aria-label="Four pipeline stages, tool selection, retrieval, generation and answer, each with its evaluation question, plus an end-to-end bracket">
<defs><marker id="gr8-arr-stage" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="10" y="20" width="130" height="50" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="75" y="50" text-anchor="middle" font-size="13" font-weight="700">Tool selection</text>
<rect x="170" y="20" width="130" height="50" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="235" y="50" text-anchor="middle" font-size="13" font-weight="700">Retrieval</text>
<rect x="330" y="20" width="130" height="50" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="395" y="50" text-anchor="middle" font-size="13" font-weight="700">Generation</text>
<rect x="490" y="20" width="130" height="50" rx="8" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="555" y="50" text-anchor="middle" font-size="13" font-weight="700">Answer</text>
<line x1="140" y1="45" x2="168" y2="45" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#gr8-arr-stage)"/>
<line x1="300" y1="45" x2="328" y2="45" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#gr8-arr-stage)"/>
<line x1="460" y1="45" x2="488" y2="45" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#gr8-arr-stage)"/>
<text x="75" y="96" text-anchor="middle" font-size="12">right tool and</text>
<text x="75" y="113" text-anchor="middle" font-size="12">arguments?</text>
<text x="235" y="96" text-anchor="middle" font-size="12">context complete</text>
<text x="235" y="113" text-anchor="middle" font-size="12">and relevant?</text>
<text x="395" y="96" text-anchor="middle" font-size="12">faithful to</text>
<text x="395" y="113" text-anchor="middle" font-size="12">the context?</text>
<text x="555" y="96" text-anchor="middle" font-size="12">correct vs</text>
<text x="555" y="113" text-anchor="middle" font-size="12">ground truth?</text>
<path d="M10 145 V155 H620 V145" fill="none" stroke-width="2" style="stroke: var(--dg-muted)"/>
<text x="315" y="180" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">End to end: overall correctness and latency per question</text>
</svg>`,
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>One especially useful check: give the generator the <em>correct</em> context by hand and see whether it answers correctly. If it does, your problem is retrieval. If it still fails, your problem is the model or the prompt. That single experiment separates the two biggest failure sources.</p>`,
        },
      ],
    },
    {
      id: "benchmark-design",
      title: "Designing the benchmark dataset",
      kicker: "What to test",
      blocks: [
        {
          type: "text",
          html: `<p>The benchmark is more than a test set; it is a specification. Whatever is in it is what the system is expected to do, and whatever is missing is untested. So cover every behavior you care about, including the boring ones. The book's benchmark for the movies agent has 17 examples across these categories:</p>`,
        },
        {
          type: "table",
          headers: ["Category", "Example question", "What it tests"],
          rows: [
            ["Conversational", "\"Hello\", \"What can you do?\"", "Polite, scoped replies without database calls"],
            ["Irrelevant", "\"What is the weather like in Spain?\"", "Declining out-of-scope questions"],
            ["Tool + value mapping", "\"Who acted in top gun?\"", "Right specialized tool, and \"top gun\" mapped to \"Top Gun\""],
            ["Aggregation", "\"Who acted in the most movies?\"", "Fallback to text2cypher; correct grouping and sorting"],
            ["Filtering", "\"List people born before 1940.\"", "Correct WHERE clause on the right property"],
            ["Missing data", "\"Which movie has the most Oscars?\"", "Saying the data is not available instead of inventing it"],
          ],
        },
        {
          type: "text",
          html: `<p><strong>Value mapping</strong> deserves its own questions. Users type "tom hanks" or "top gun"; the database stores "Tom Hanks" and "Top Gun". For famous entities a model fixes casing from pretraining knowledge. For private data (your product names, your customers) it cannot, and you need a dedicated mapping step such as a full-text lookup of candidate values. Include casing and spelling variants in the benchmark so you know which case you are in.</p>
<p>Start small and grow. Every bug report and every surprising production question is a candidate benchmark row, and once added it stays as a regression test.</p>`,
        },
        {
          type: "keypoints",
          items: [
            "Cover tool selection, value mapping, multi-step questions, aggregations, filters, missing data, out-of-scope and conversational inputs.",
            "Prefer real user questions over invented ones once you have traffic.",
            "Keep every fixed bug as a permanent row.",
          ],
        },
      ],
    },
    {
      id: "cypher-ground-truth",
      title: "Cypher queries as ground truth",
      kicker: "Keeping the benchmark honest",
      blocks: [
        {
          type: "problem",
          html: `<p>Write "Tom Hanks appeared in 12 movies" as the expected answer and the benchmark is correct until someone adds a movie. Then the agent answers 13, correctly, and the benchmark marks it wrong. Static answers go stale as data changes, and a benchmark that cries wolf gets ignored.</p>`,
        },
        {
          type: "idea",
          html: `<p>Store a <strong>query</strong> as the ground truth instead of an answer. At evaluation time, run it against the current database to get the expected answer. The benchmark stays correct as the data evolves.</p>`,
        },
        {
          type: "code",
          lang: "python",
          title: "Benchmark rows with executable ground truth",
          code: `BENCHMARK = [
  {"question": "How many movies did Tom Hanks appear in?",
   "cypher": 'MATCH (:Person {name: "Tom Hanks"})-[:ACTED_IN]->(m:Movie) RETURN count(m) AS movies'},
  {"question": "Who acted in top gun?",
   "cypher": 'MATCH (p:Person)-[:ACTED_IN]->(:Movie {title: "Top Gun"}) RETURN p.name AS actor'},
  {"question": "What is the weather like in Spain?",
   "cypher": 'RETURN "Out of scope: the assistant only answers questions about movies." AS answer'},
  {"question": "Which movie has the most Oscars?",
   "cypher": 'RETURN "This information is not available in the database." AS answer'},
]`,
          caption: "Fixed answers for conversational, out-of-scope and missing-data questions are just a RETURN of a string, so every row has the same shape.",
        },
        {
          type: "lab",
          id: "benchmark",
          caption: "Store each row's ground truth as a static answer or a Cypher query, then change the data (Tom Hanks gets a new movie) and see which benchmark keeps telling the truth. The latency view shows why text2cypher questions are slower.",
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p>The ground-truth query must itself be right, and it should be written by a person who knows the schema, not generated by the system under test. Otherwise you are grading the agent against its own mistakes.</p>`,
        },
        {
          type: "quiz",
          q: "Why does storing a Cypher query as ground truth make a benchmark more robust than storing the answer text?",
          options: [
            "Queries are shorter than answers",
            "The expected answer is recomputed from current data at evaluation time, so it stays correct when the data changes",
            "RAGAS can only read Cypher",
            "It removes the need for an LLM judge",
          ],
          answer: 1,
          explain: "A stored answer is a snapshot that goes stale as soon as the data changes. A stored query computes the current truth on every run, so a correct agent is not penalized for new data.",
        },
      ],
    },
    {
      id: "ragas-metrics",
      title: "RAGAS metrics: context recall, faithfulness, answer correctness",
      kicker: "How scoring works",
      blocks: [
        {
          type: "text",
          html: `<p><strong>RAGAS</strong> is an open-source framework for evaluating RAG pipelines, introduced in a 2023 paper by Es and colleagues. Its metrics use an LLM as a judge, but in a structured way: the judge breaks text into small statements and classifies each one, and the score is a ratio of counts. The book uses three metrics, and each compares a different pair of texts.</p>`,
        },
        {
          type: "diagram",
          title: "Which texts each metric compares",
          caption: "Context recall compares the reference answer with the retrieved context. Faithfulness compares the generated answer with the context. Answer correctness compares the generated answer with the reference.",
          svg: `<svg viewBox="0 0 640 265" role="img" aria-label="Question feeds retrieved context and answer; faithfulness links answer and context, context recall links context and ground truth, answer correctness links answer and ground truth">
<defs><marker id="gr8-arr-metric" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="240" y="10" width="160" height="40" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="320" y="35" text-anchor="middle" font-size="13" font-weight="700">Question</text>
<rect x="60" y="100" width="160" height="50" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="140" y="130" text-anchor="middle" font-size="13" font-weight="700">Retrieved context</text>
<rect x="420" y="100" width="160" height="50" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="500" y="130" text-anchor="middle" font-size="13" font-weight="700">Generated answer</text>
<rect x="240" y="205" width="160" height="50" rx="8" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="320" y="228" text-anchor="middle" font-size="13" font-weight="700">Ground truth</text>
<text x="320" y="245" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">from Cypher</text>
<line x1="290" y1="50" x2="172" y2="98" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#gr8-arr-metric)"/>
<text x="228" y="70" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">retriever</text>
<line x1="350" y1="50" x2="468" y2="98" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#gr8-arr-metric)"/>
<text x="412" y="70" font-size="12" style="fill: var(--dg-muted)">generator</text>
<line x1="220" y1="125" x2="420" y2="125" stroke-width="3" stroke-dasharray="6 4" style="stroke: var(--dg-2)"/>
<text x="320" y="117" text-anchor="middle" font-size="12" font-weight="700">faithfulness</text>
<line x1="160" y1="150" x2="260" y2="205" stroke-width="3" stroke-dasharray="6 4" style="stroke: var(--dg-1)"/>
<text x="190" y="196" text-anchor="end" font-size="12" font-weight="700">context recall</text>
<line x1="480" y1="150" x2="380" y2="205" stroke-width="3" stroke-dasharray="6 4" style="stroke: var(--dg-ok)"/>
<text x="450" y="196" font-size="12" font-weight="700">answer correctness</text>
</svg>`,
        },
        {
          type: "list",
          items: [
            "<strong>Context recall:</strong> split the reference answer into sentences; for each, judge whether it can be attributed to the retrieved context (1) or not (0). Score = attributable / total. Low recall means the retriever missed information.",
            "<strong>Faithfulness:</strong> split the generated answer into atomic statements with pronouns resolved; judge each as inferable from the context or not. Score = supported / total. Low faithfulness means the model added claims the context does not support.",
            "<strong>Answer correctness:</strong> classify answer statements against the reference as true positives (in both), false positives (answer only) and false negatives (reference only), and compute a factual F1 = TP / (TP + &frac12;(FP + FN)). By default RAGAS blends this with a semantic-similarity score.",
          ],
        },
        {
          type: "text",
          html: `<h3>A worked example</h3>
<p>Suppose the ground-truth query for "Who acted in Top Gun?" returns four actors: A, B, C and D. The retriever's context contains A, B and C. The answer names A and B, drops C, and adds E, who is in neither.</p>
<ul>
<li>Context recall: 3 of the 4 reference facts are in the context, so <strong>0.75</strong>.</li>
<li>Faithfulness: the answer makes 3 claims (A, B, E); 2 are supported by the context, so <strong>0.67</strong>.</li>
<li>Answer correctness (factual part): TP = 2 (A, B), FP = 1 (E), FN = 2 (C, D), so 2 / (2 + &frac12; &times; 3) = <strong>0.57</strong>.</li>
</ul>
<p>Each number points somewhere different: the retriever missed D, the generator dropped C, and the generator also invented E.</p>`,
        },
        {
          type: "lab",
          id: "ragas",
          caption: "For \"Who acted in Top Gun?\", tick which atomic statements appear in the retrieved context and in the answer, or load a preset, and watch the three metrics react. RAGAS has an LLM judge do this classification; here you do it by hand.",
        },
        {
          type: "quiz",
          q: "An answer scores faithfulness 1.0 but answer correctness 0.4. What is the most likely explanation?",
          options: [
            "The model hallucinated",
            "The answer only contains claims supported by the context, but the context was incomplete or the model left facts out",
            "The judge model is broken",
            "The ground truth query failed",
          ],
          answer: 1,
          explain: "Faithfulness only checks the answer against what was retrieved. If retrieval missed facts (check context recall) or the model omitted some, the answer can be perfectly grounded and still incomplete or wrong relative to the ground truth.",
        },
      ],
    },
    {
      id: "running-and-reading",
      title: "Running the evaluation and reading the results",
      kicker: "From scores to fixes",
      blocks: [
        {
          type: "code",
          lang: "python",
          title: "An evaluation loop",
          code: `import time
from datasets import Dataset
from ragas import evaluate
from ragas.metrics import answer_correctness, context_recall, faithfulness

rows = []
for item in BENCHMARK:
    truth, _, _ = driver.execute_query(item["cypher"])          # live ground truth
    started = time.perf_counter()
    try:
        answer, contexts = agent.answer_with_context(item["question"])
    except Exception:
        answer, contexts = "I don't know", []                   # metrics need values
    rows.append({"question": item["question"], "answer": answer,
                 "contexts": [str(c) for c in contexts],
                 "ground_truth": str([r.data() for r in truth]),
                 "latency_s": time.perf_counter() - started})

scores = evaluate(Dataset.from_list(rows),
                  metrics=[answer_correctness, context_recall, faithfulness])`,
          caption: "Column names and imports differ between RAGAS versions; check the version you install. Latency is recorded alongside quality.",
        },
        {
          type: "table",
          title: "The book's summary scores",
          headers: ["answer_correctness", "context_recall", "faithfulness"],
          rows: [["0.7774", "0.7941", "0.9657"]],
          note: "High faithfulness with lower recall: the generator is grounded, retrieval is the bottleneck.",
        },
        {
          type: "text",
          html: `<p>Read the three numbers together. Faithfulness near 0.97 says the model rarely makes things up relative to what it was given. Context recall near 0.79 says that roughly one reference fact in five never reached the model. Answer correctness can hardly exceed what retrieval supplies, so it sits near recall. The fix is on the retrieval side: better tool selection and descriptions, value mapping, few-shot examples for text2cypher, or new specialized tools.</p>
<p>The per-example view is where the actionable detail lives. The book observes that questions not needing text2cypher are much faster, since they skip a query-generation LLM call; that the judge's scores can be odd on edge cases such as "Hello"; and that "Who has the longest name among all actors?" failed because text2cypher could not write the query. That last one becomes a few-shot example (using <code>size(p.name)</code>) or a dedicated tool, and stays in the benchmark as a regression test.</p>`,
        },
        {
          type: "compare",
          title: "Reading a weak score",
          items: [
            { title: "Low context recall", tone: "bad", html: "The retriever or tool selection missed information. Improve routing, add tools, fix value mapping, try query rewriting or better chunking." },
            { title: "Low faithfulness", tone: "warn", html: "The model added unsupported claims. Tighten the grounding prompt, show less irrelevant context, or try a different model." },
            { title: "Low correctness, high recall and faithfulness", tone: "info", html: "The facts were there but the answer left some out or phrased them unlike the reference. Check the answer prompt, and check the ground truth itself." },
          ],
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p><strong>LLM judges are instruments, not oracles.</strong> Scores depend on the judge model and its prompts, can be inconsistent on edge cases, and cost LLM calls. Pin the judge model version, look at per-example results rather than only averages, and keep a small human-reviewed sample to check that the judge agrees with people.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "RAGAS", title: "Open-source metrics", html: "The library used in the book. Besides the three metrics here it offers others, such as answer relevancy and context precision, and helpers for generating synthetic test sets." },
            { org: "TruLens", title: "The RAG triad", html: "TruLens frames RAG evaluation as three checks: context relevance, groundedness and answer relevance. Groundedness corresponds closely to faithfulness." },
            { org: "LangSmith", title: "Datasets and experiments", html: "LangChain's LangSmith platform stores benchmark datasets, runs an application over them as experiments, and compares evaluator scores across versions, which turns this chapter's loop into a routine step." },
          ],
        },
        {
          type: "quiz",
          q: "Your benchmark shows context recall 0.95 and faithfulness 0.60. Where should you focus first?",
          options: [
            "Retrieval: add more tools",
            "Generation: the model is adding claims not supported by good context, so tighten the prompt or change the model",
            "The ground-truth queries",
            "Latency",
          ],
          answer: 1,
          explain: "Retrieval is supplying nearly everything needed (high recall), but four in ten answer statements are not supported by it. That is a generation problem: grounding instructions, context formatting or the model itself.",
        },
      ],
    },
    {
      id: "interview",
      title: "Talking about evaluation in an interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "text",
          html: `<p>"How would you know your RAG system works?" is the question that separates prototypes from production designs. A good answer is concrete about the dataset, the metrics, what each metric diagnoses, and how evaluation fits into the development loop.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<ol>
<li><strong>Benchmark:</strong> questions covering every behavior, including conversational, out-of-scope and missing-data cases; grows with every bug.</li>
<li><strong>Ground truth as queries:</strong> recomputed from live data so the benchmark does not go stale.</li>
<li><strong>Stage-level metrics:</strong> tool selection, context recall (retrieval), faithfulness (generation), answer correctness (end to end), plus latency.</li>
<li><strong>Diagnosis:</strong> high faithfulness with low recall means fix retrieval; the reverse means fix generation.</li>
<li><strong>Process:</strong> run on every change; pin the judge model; review per-example results and a human sample.</li>
</ol>`,
        },
        {
          type: "quiz",
          q: "An interviewer asks how you would prevent a prompt fix for one question from silently breaking others. What is the best answer?",
          options: [
            "Test the fixed question several times",
            "Use a lower temperature",
            "Run the full benchmark after every change and treat score drops on existing rows as regressions",
            "Only change prompts on weekends",
          ],
          answer: 2,
          explain: "Regressions appear on questions you were not looking at. Re-running the whole benchmark (with per-example comparison) after each change is what catches them, which is exactly the scenario in this chapter's opening.",
        },
      ],
    },
  ],
  takeaways: [
    "Every change to an LLM system can break something else; a <strong>benchmark</strong> run after each change is the defense.",
    "Evaluate each stage: <strong>tool selection</strong>, <strong>retrieved context</strong>, <strong>answer generation</strong>, and the end-to-end result, plus latency.",
    "Cover every behavior in the benchmark, including greetings, out-of-scope and missing-data questions, and value-mapping variants.",
    "Store <strong>Cypher queries as ground truth</strong> so expected answers are recomputed from current data.",
    "<strong>Context recall</strong> checks retrieval, <strong>faithfulness</strong> checks grounding, <strong>answer correctness</strong> checks the final answer against the reference.",
    "The book scored faithfulness 0.97 but recall 0.79: the generator is grounded, retrieval is the bottleneck.",
    "LLM judges are useful but imperfect: pin versions, read per-example scores, keep a human sample.",
  ],
  furtherReading: [
    { title: "RAGAS: Automated Evaluation of Retrieval Augmented Generation (Es et al., 2023)", url: "https://arxiv.org/abs/2309.15217", note: "The paper defining faithfulness, context and answer metrics with LLM judges." },
    { title: "RAGAS documentation", note: "Current metric definitions, dataset formats and version changes." },
    { title: "Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena (Zheng et al., 2023)", note: "A study of when LLM judges agree with humans, and their biases." },
  ],
};
