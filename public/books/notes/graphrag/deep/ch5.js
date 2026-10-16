// Deep dive: Chapter 5, Agentic RAG. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch5 = {
  hook: `<p>Your movie assistant now has two retrievers: vector search over reviews and text2cypher over the graph. A user types, "Who directed Apollo 13, and what other movies did that person direct?" Vector search returns reviews that mention Apollo 13. text2cypher tries to answer both halves in one query, guesses a pattern, and returns an empty list. The user gets half an answer, wrapped in confident prose.</p>
<p>The question is really two questions, and the second depends on the answer to the first. Each half is easy for the right tool: a lookup by title, then a lookup by director. What is missing is something that splits the question, picks a tool for each part, carries the first answer into the second, and checks at the end that everything was answered. That is <strong>agentic RAG</strong>.</p>`,
  sections: [
    {
      id: "why-agentic",
      title: "One retriever cannot fit every question",
      kicker: "The problem",
      blocks: [
        {
          type: "problem",
          html: `<p>Real users ask many kinds of questions: lookups about one entity, rankings over many, questions about text, small talk, and multi-part questions whose parts depend on each other. A single generic retriever handles some of these well and the rest badly.</p>`,
        },
        {
          type: "text",
          html: `<p>Generic retrievers such as vector search and text2cypher are flexible, but flexibility has a price: text2cypher on a complex graph will sometimes write the wrong query, and vector search cannot compute anything. For questions that come up all the time, a narrow, hand-written retriever is far more reliable: a parameterized Cypher template that takes a title and returns cast and directors will be right every time.</p>
<p><strong>Agentic RAG</strong> is a system that has several such retrievers available and decides, per question, which to use. The book defines three parts: the <strong>retriever agents</strong> themselves, a <strong>retriever router</strong> that chooses among them, and an <strong>answer critic</strong> that checks the result. Its implementation adds a fourth helper, the <strong>query updater</strong>.</p>`,
        },
        {
          type: "table",
          headers: ["Question", "Best retriever", "Why"],
          rows: [
            ["\"Who acted in Top Gun?\"", "Specialized: <code>movie_info_by_title</code>", "Frequent, fixed shape; a template is exact and needs no extra LLM call"],
            ["\"Which actor has the most movies?\"", "Generic: <code>text2cypher</code>", "Aggregation with no matching template"],
            ["\"What's Dave Smith's last name?\"", "<code>answer_given</code>", "The answer is already in the question"],
            ["\"Who directed Apollo 13, and what else did they direct?\"", "Two tools in sequence", "The second lookup needs the first answer"],
          ],
        },
      ],
    },
    {
      id: "architecture",
      title: "Router, retriever agents and answer critic",
      kicker: "The key idea",
      blocks: [
        {
          type: "idea",
          html: `<p>Put an LLM in charge of <em>choosing</em> retrievers, not of answering. For each (sub-)question, a <strong>router</strong> picks the best retriever and its arguments; your code runs it; a <strong>critic</strong> checks whether the original question is fully covered; and only then does a final, grounded LLM call write the answer.</p>`,
        },
        {
          type: "diagram",
          title: "The agentic RAG loop",
          caption: "Each question is first completed by the query updater, then routed to one or more retriever agents. Results accumulate as answers. The critic either approves or sends back new sub-questions, at most once, before the final answer is written.",
          svg: `<svg viewBox="0 0 640 260" role="img" aria-label="Question flows to query updater, router and retriever agents; answers go to an answer critic, which loops back once or passes to the final answer">
<defs><marker id="gr5-arr-loop" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="10" y="30" width="100" height="50" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="60" y="60" text-anchor="middle" font-size="13" font-weight="700">Question</text>
<rect x="135" y="30" width="110" height="50" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="190" y="60" text-anchor="middle" font-size="13" font-weight="700">Query updater</text>
<rect x="270" y="30" width="110" height="50" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="325" y="52" text-anchor="middle" font-size="13" font-weight="700">Router</text>
<text x="325" y="69" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">LLM tool calling</text>
<rect x="410" y="12" width="220" height="125" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="422" y="33" font-size="13" font-weight="700">Retriever agents</text>
<text x="422" y="56" font-size="12">movie_info_by_title</text>
<text x="422" y="78" font-size="12">movies_info_by_actor</text>
<text x="422" y="100" font-size="12">text2cypher (catch-all)</text>
<text x="422" y="122" font-size="12">answer_given</text>
<line x1="110" y1="55" x2="133" y2="55" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#gr5-arr-loop)"/>
<line x1="245" y1="55" x2="268" y2="55" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#gr5-arr-loop)"/>
<line x1="380" y1="55" x2="408" y2="55" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#gr5-arr-loop)"/>
<rect x="430" y="190" width="180" height="50" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="520" y="212" text-anchor="middle" font-size="13" font-weight="700">Answers so far</text>
<text x="520" y="229" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">question → result</text>
<line x1="520" y1="137" x2="520" y2="188" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#gr5-arr-loop)"/>
<rect x="250" y="190" width="130" height="50" rx="8" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="2"/>
<text x="315" y="220" text-anchor="middle" font-size="13" font-weight="700">Answer critic</text>
<line x1="430" y1="215" x2="382" y2="215" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#gr5-arr-loop)"/>
<rect x="10" y="190" width="130" height="50" rx="8" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="75" y="212" text-anchor="middle" font-size="13" font-weight="700">Final answer</text>
<text x="75" y="229" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">grounded LLM</text>
<line x1="250" y1="215" x2="142" y2="215" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#gr5-arr-loop)"/>
<text x="196" y="207" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">complete</text>
<path d="M300 190 V140 H190 V82" fill="none" stroke-width="2" stroke-dasharray="5 4" style="stroke: var(--dg-4)" marker-end="url(#gr5-arr-loop)"/>
<text x="180" y="120" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">missing parts:</text>
<text x="180" y="136" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">new sub-questions, once</text>
</svg>`,
        },
        {
          type: "lab",
          id: "agenticRouter",
          caption: "Step through traces of the chapter's system over the Movies graph. Turn the query updater and the answer critic off to see what each one buys you, and what it costs in LLM calls.",
        },
        {
          type: "keypoints",
          items: [
            "The router is the system's main interface: every question passes through it.",
            "Retriever agents are ordinary functions. Generic ones give coverage; specialized ones give reliability.",
            "The critic is a blocking check with a hard exit: it may request more retrieval once, then the system answers with what it has.",
            "The final prompt allows only the retrieved information and requires saying what is missing.",
          ],
        },
      ],
    },
    {
      id: "tools-and-routing",
      title: "Retriever agents as tools, and how the router picks",
      kicker: "How routing works",
      blocks: [
        {
          type: "text",
          html: `<p>The router is built on <strong>tool calling</strong> (also called function calling), a feature of modern LLM APIs. You describe each retriever as a tool: a name, a description, and its parameters as JSON Schema. You send the question together with the tool list. The model replies not with prose but with one or more <em>tool calls</em>: which tool, and which argument values.</p>
<p>The crucial detail: <strong>the LLM does not execute anything</strong>. It only returns a name and a JSON string of arguments. Your code looks up the function, parses the arguments, runs it, and stores the result. That keeps the model away from your database and lets you validate arguments before running anything.</p>`,
        },
        {
          type: "code",
          lang: "python",
          title: "Describing retrievers as tools",
          code: `TOOLS = [
  {"type": "function", "function": {
    "name": "movie_info_by_title",
    "description": "Cast, directors and release year for one movie. Use when the question names a specific movie.",
    "parameters": {"type": "object",
      "properties": {"title": {"type": "string", "description": "Movie title as the user wrote it"}},
      "required": ["title"]}}},
  {"type": "function", "function": {
    "name": "text2cypher",
    "description": "Generates and runs a Cypher query. Use for counts, rankings and filters, or when no other tool fits.",
    "parameters": {"type": "object",
      "properties": {"question": {"type": "string", "description": "A single, self-contained question"}},
      "required": ["question"]}}},
]`,
          caption: "Descriptions are written for the model, not for colleagues: when to use the tool, and what a good argument looks like.",
        },
        {
          type: "text",
          html: `<p>Tool descriptions are prompt engineering in disguise. The router sees nothing else about your retrievers, so a vague description ("movie tool") leads to vague choices. Say when to use the tool and when not to, describe each parameter with an example, and make overlapping tools clearly distinct: if two tools could both answer "movies with Tom Hanks", the router will pick between them inconsistently. When routing goes wrong in testing, the description is usually the first thing to fix.</p>`,
        },
        {
          type: "code",
          lang: "python",
          title: "Routing and executing tool calls",
          code: `IMPLEMENTATIONS = {"movie_info_by_title": movie_info_by_title,
                   "movies_info_by_actor": movies_info_by_actor,
                   "text2cypher": text2cypher, "answer_given": lambda answer: answer}

def route(question: str, answers: list[dict]) -> list:
    reply = client.chat.completions.create(
        model=MODEL, tools=TOOLS,
        messages=[{"role": "system", "content": ROUTER_PROMPT}, *answers,
                  {"role": "user", "content": question}]).choices[0].message
    results = []
    for call in reply.tool_calls or []:                 # the model may ask for several
        fn = IMPLEMENTATIONS[call.function.name]
        results.append(fn(**json.loads(call.function.arguments)))
    return results`,
        },
        {
          type: "code",
          lang: "cypher",
          title: "A specialized retriever is just a parameterized query",
          code: `// movie_info_by_title($title)
MATCH (m:Movie) WHERE toLower(m.title) CONTAINS toLower($title)
OPTIONAL MATCH (m)<-[:ACTED_IN]-(a:Person)
OPTIONAL MATCH (m)<-[:DIRECTED]-(d:Person)
RETURN m.title AS title, m.released AS released,
       collect(DISTINCT a.name) AS cast, collect(DISTINCT d.name) AS directors;`,
          caption: "Case-insensitive CONTAINS forgives \"top gun\" for \"Top Gun\". No LLM call is needed to build this query, which makes it fast and predictable.",
        },
        {
          type: "compare",
          items: [
            { title: "Specialized retrievers", tone: "ok", html: "Correct by construction, fast (no query-generation call), easy to test. Each covers one question shape, so you add them over time where traffic and errors justify it." },
            { title: "Catch-all: text2cypher", tone: "warn", html: "Covers anything the schema can answer, but costs an extra LLM call and is wrong more often. Its description tells the router to use it when other tools do not fit." },
          ],
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>Include an <code>answer_given</code> tool. Some questions already contain the answer ("What's Dave Smith's last name?"), or the answer is in the conversation. Without a way to say so, the router will force a database call, and a pointless lookup can return misleading rows.</p>`,
        },
        {
          type: "quiz",
          q: "The router returns a tool call for movie_info_by_title with arguments {\"title\": \"Top Gun\"}. What has happened to the database at this point?",
          options: [
            "The LLM has queried it and the rows are in the reply",
            "Nothing: the LLM only chose a tool and arguments; your code must run the query",
            "The query ran, but only in read-only mode",
            "The database cached the title for later",
          ],
          answer: 1,
          explain: "Tool calling returns a structured request, not a result. Your application maps the tool name to a function, parses the JSON arguments (and can validate them), executes the function and feeds the result back. The model never has database access.",
        },
      ],
    },
    {
      id: "query-updater",
      title: "The query updater: questions that depend on earlier answers",
      kicker: "Multi-step questions",
      blocks: [
        {
          type: "text",
          html: `<p>"Who directed Apollo 13, and what other movies did that person direct?" contains a dependency. The second part cannot be routed sensibly until the first is answered, because "that person" is not something any retriever can look up.</p>
<p>The book handles this by processing sub-questions <strong>one at a time</strong> and, before routing each one, asking an LLM to rewrite it using the answers gathered so far. The rewrite must make the question atomic and specific, and must not ask for more than the original did. After the first lookup returns Ron Howard as director, the second sub-question becomes "What other movies did Ron Howard direct?", which text2cypher can turn into a simple DIRECTED query.</p>`,
        },
        {
          type: "steps",
          title: "Trace for the hook's question",
          items: [
            "Updater: no prior answers, so the first sub-question is \"Who directed Apollo 13?\".",
            "Router: picks <code>movie_info_by_title(\"Apollo 13\")</code>; the result lists Ron Howard as director. It is stored as an answer.",
            "Updater: rewrites the remaining part to \"What other movies did Ron Howard direct?\".",
            "Router: no template takes a director, so it picks <code>text2cypher</code>, which generates a DIRECTED query.",
            "Critic: both parts covered, returns an empty list. The final LLM writes the answer from the two stored results.",
          ],
        },
        {
          type: "code",
          lang: "python",
          title: "Updater with JSON output",
          code: `UPDATE_PROMPT = """Rewrite the next question so it can be answered on its own,
filling in names or values from the previous answers. Do not add new requests.
Return JSON: {"question": "..."}"""

def update_question(question: str, answers: list[dict]) -> str:
    reply = client.chat.completions.create(
        model=MODEL, response_format={"type": "json_object"},
        messages=[{"role": "system", "content": UPDATE_PROMPT}, *answers,
                  {"role": "user", "content": question}])
    return json.loads(reply.choices[0].message.content)["question"]`,
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>Sequential processing is a deliberate simplification. Routing several independent sub-questions in parallel is faster, but dependent questions then need extra machinery. Answering one at a time lets every step see everything learned before it.</p>`,
        },
      ],
    },
    {
      id: "answer-critic",
      title: "The answer critic and the exit criterion",
      kicker: "Checking the work",
      blocks: [
        {
          type: "text",
          html: `<p>LLMs make mistakes when splitting, rewriting and routing. A sub-question can be dropped, or a retriever can return nothing useful. The <strong>answer critic</strong> compares the original question with every stored answer. If something is missing, it returns new atomic questions to retrieve; if not, it returns an empty list.</p>
<p>The critic needs an <strong>exit criterion</strong>, or a system that keeps finding gaps will loop forever, spending money on each turn. The book's rule is simple: critique once. If the critic asks for more, run those questions through the updater and router, then go straight to the final answer, whatever happened. The final prompt tells the model to use only the provided information and to say plainly what could not be found.</p>`,
        },
        {
          type: "code",
          lang: "python",
          title: "Main loop with a single critique",
          code: `def answer(question: str) -> str:
    answers = handle(question, [])                    # update -> route -> execute
    missing = critique(question, answers)             # [] or ["new question", ...]
    if missing:                                       # at most one extra round
        answers = handle(" ".join(missing), answers)
    return chat([{"role": "system", "content": FINAL_PROMPT}, *answers,
                 {"role": "user", "content": f"Question to answer: {question}"}])`,
        },
        {
          type: "quiz",
          q: "A critic loop has no iteration cap. For a question whose answer simply is not in the database, what happens?",
          options: [
            "The critic eventually invents the answer",
            "The loop keeps generating new sub-questions and spending LLM calls without converging",
            "The router switches to vector search automatically",
            "The database raises an error that stops the loop",
          ],
          answer: 1,
          explain: "Each round still finds the answer missing, so the critic keeps asking. Bound the loop (the book critiques once), stop when a round retrieves nothing new, and treat \"not available\" as a valid final answer.",
        },
      ],
    },
    {
      id: "costs",
      title: "What agentic RAG costs",
      kicker: "Trade-offs",
      blocks: [
        {
          type: "text",
          html: `<p>Every box in the loop is an LLM call. Plain RAG needs one call per question. The agentic loop needs at least four for a single sub-question (updater, router, critic, final answer), five if the router falls back to text2cypher, and more for every extra sub-question or critique round. Latency and cost scale accordingly, and every call is another chance for non-deterministic behavior.</p>`,
        },
        {
          type: "diagram",
          title: "LLM calls per question",
          caption: "Counts for one sub-question in the book's design. Specialized templates save a call; a critique round roughly doubles the work.",
          svg: `<svg viewBox="0 0 640 200" role="img" aria-label="Bar chart of LLM calls: plain RAG 1, agentic with template 4, agentic with text2cypher 5, agentic with text2cypher and a critique round 8">
<text x="10" y="44" font-size="12">Plain RAG</text>
<rect x="250" y="30" width="40" height="22" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)"/>
<text x="298" y="46" font-size="12" font-weight="700">1</text>
<text x="10" y="84" font-size="12">Agentic, template tool</text>
<rect x="250" y="70" width="160" height="22" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="418" y="86" font-size="12" font-weight="700">4</text>
<text x="10" y="124" font-size="12">Agentic, text2cypher</text>
<rect x="250" y="110" width="200" height="22" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/>
<text x="458" y="126" font-size="12" font-weight="700">5</text>
<text x="10" y="164" font-size="12">+ one critique round</text>
<rect x="250" y="150" width="320" height="22" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)"/>
<text x="578" y="166" font-size="12" font-weight="700">8</text>
<text x="250" y="192" font-size="12" style="fill: var(--dg-muted)">bar length = number of LLM calls</text>
</svg>`,
        },
        {
          type: "tradeoffs",
          pros: [
            "Each question goes to the retriever best suited to it",
            "Multi-part and dependent questions become answerable",
            "Specialized tools can be added incrementally without touching the rest",
            "The critic and grounded final prompt make gaps explicit instead of hidden",
          ],
          cons: [
            "Several LLM calls per question: higher latency and cost",
            "More non-determinism: routing can differ between runs",
            "More components to test; tool selection itself needs evaluation (chapter 8)",
            "Tool descriptions become critical prompt engineering",
          ],
        },
        {
          type: "realworld",
          items: [
            { org: "LangGraph", title: "Graphs of LLM steps", html: "LangChain's LangGraph library models agent workflows as explicit state machines with nodes and edges, which suits loops like updater, router and critic with a hard iteration limit." },
            { org: "LlamaIndex", title: "Routers and agents", html: "LlamaIndex offers router query engines that choose among several query engines by their descriptions, and agent abstractions that call retrievers as tools." },
            { org: "Research", title: "ReAct, Self-RAG, Corrective RAG", html: "ReAct (2022) interleaves reasoning and tool calls; Self-RAG (2023) and Corrective RAG (2024) add self-critique of retrieval. The book's critic is a deliberately simple, bounded version of the same idea." },
          ],
        },
      ],
    },
    {
      id: "interview",
      title: "Designing agentic RAG in an interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "text",
          html: `<p>"Our assistant must answer questions over documents and a database" is a natural lead-in to agentic RAG. The trap is to over-engineer: a candidate who proposes autonomous agents everywhere, with no cost or exit criteria, sounds less experienced than one who adds routing only where a single retriever falls short.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<ol>
<li><strong>Retrievers as tools:</strong> generic (vector search, text2cypher as catch-all) plus specialized templates for frequent question types, plus <code>answer_given</code>.</li>
<li><strong>Router:</strong> LLM tool calling over clear descriptions and JSON-schema parameters; your code executes the calls.</li>
<li><strong>Query updater:</strong> process sub-questions sequentially, filling in earlier answers.</li>
<li><strong>Critic with an exit:</strong> one extra round at most, then answer and state what is missing.</li>
<li><strong>Cost and evaluation:</strong> count LLM calls, add templates where text2cypher is slow or wrong, and benchmark tool selection.</li>
</ol>`,
        },
        {
          type: "quiz",
          q: "Monitoring shows 40% of questions are \"what movies has actor X been in?\", all routed to text2cypher, with p95 latency well above your target. What is the best change?",
          options: [
            "Remove the answer critic",
            "Add a specialized movies_info_by_actor template tool with a clear description",
            "Switch the router to a larger model",
            "Raise text2cypher's timeout",
          ],
          answer: 1,
          explain: "A frequent, fixed-shape question is exactly what specialized retrievers are for. A template removes the query-generation LLM call (lower latency) and is correct by construction. Then confirm with the benchmark that the router actually picks it.",
        },
      ],
    },
  ],
  takeaways: [
    "<strong>Agentic RAG</strong> offers several retrievers and decides per question which to use, because no single retriever fits every question type.",
    "Three parts: <strong>retriever agents</strong>, a <strong>retriever router</strong> (LLM tool calling) and an <strong>answer critic</strong>; the book adds a <strong>query updater</strong>.",
    "The LLM only selects tools and arguments; your code executes them, which keeps the model away from the database.",
    "Specialized parameterized templates are fast and reliable for frequent questions; text2cypher is the catch-all; <code>answer_given</code> avoids pointless lookups.",
    "Process dependent sub-questions sequentially and rewrite each with earlier answers.",
    "Critics need a hard exit criterion. The book critiques once, then answers with what it has and says what is missing.",
    "Every step is an LLM call: count them, and evaluate tool selection, not only final answers.",
  ],
  furtherReading: [
    { title: "ReAct: Synergizing Reasoning and Acting in Language Models (Yao et al., 2022)", url: "https://arxiv.org/abs/2210.03629", note: "The pattern of alternating reasoning steps with tool calls." },
    { title: "Self-RAG: Learning to Retrieve, Generate, and Critique through Self-Reflection (Asai et al., 2023)", note: "A model that decides when to retrieve and critiques its own outputs." },
    { title: "OpenAI API documentation: function calling", note: "How tools are described with JSON Schema and how tool calls are returned." },
  ],
};
