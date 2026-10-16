// Deep dive: Chapter 1, Improving LLM accuracy. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch1 = {
  hook: `<p>Your company rolls out an internal assistant built on a popular chat model. On day one, a project manager asks it, "How many of our onboarding tasks are completed?" It answers "about 12" with total confidence. The real number is 37, and the model has never seen your task tracker. A sales rep asks who owns a sports team that changed hands last year and gets the previous owner. An engineer asks for a reference ID and receives one that looks perfect and points to something else entirely.</p>
<p>None of these failures is a bug in the model. A language model is a machine for producing plausible text, and plausible is not the same as true, current or private. This chapter explains why plain LLMs fail on facts, why retraining them is the wrong fix, and why the book's answer is <strong>retrieval-augmented generation</strong> backed by a <strong>knowledge graph</strong>.</p>`,
  sections: [
    {
      id: "four-failure-modes",
      title: "Four ways a plain LLM gets facts wrong",
      kicker: "The problem",
      blocks: [
        {
          type: "problem",
          html: `<p>An LLM learns from a huge, fixed snapshot of text and then answers by predicting likely next tokens. Everything it "knows" is frozen into its weights at training time, and it has no built-in way to check a fact before stating it.</p>`,
        },
        {
          type: "text",
          html: `<p>That design produces four distinct failure modes, and it helps to keep them separate because they have different symptoms.</p>
<p><strong>Knowledge cutoff.</strong> The training data ends on some date. Ask about anything after it and the model either refuses with a disclaimer or, worse, guesses. The cutoff is a property of the snapshot, not something you can configure.</p>
<p><strong>Outdated information.</strong> A fact was true in the training data but has since changed. This is sneakier than the cutoff because the model does not know the fact changed, so it answers confidently. The book's example: a chat model still described Mark Cuban as the owner of the Dallas Mavericks after he had sold his majority stake to the Adelson and Dumont families in late 2023.</p>
<p><strong>Hallucination.</strong> The model produces something that sounds right but is invented. Identifiers are the classic case: URLs, citation numbers, database IDs. They have a recognizable shape, so the model can generate the shape without the substance.</p>
<p><strong>No private information.</strong> Your HR policies, contracts, tickets and customer records were never in the training set, whatever the cutoff date. Publishing them so that a future model might learn them is neither practical nor safe.</p>`,
        },
        {
          type: "table",
          headers: ["Failure mode", "What the user sees", "Root cause"],
          rows: [
            ["Knowledge cutoff", "\"I don't have information after my training date\" or a guess", "Training snapshot ends on a date"],
            ["Outdated information", "A confident answer that used to be right", "Facts changed after the snapshot"],
            ["Hallucination", "A plausible ID, citation or detail that is made up", "Generating likely text, not looking things up"],
            ["No private data", "Generic answers about your own company", "Your data was never in the training set"],
          ],
        },
        {
          type: "callout",
          tone: "history",
          html: `<p>Hallucinated citations have already had real consequences. In the 2023 case <em>Mata v. Avianca</em>, a federal judge in New York sanctioned lawyers who had filed a brief citing court decisions that ChatGPT had invented. The citations had the right format and plausible names; the cases did not exist.</p>`,
        },
        {
          type: "text",
          html: `<p>The book also lists limitations it does not try to solve: bias inherited from training data, the lack of real understanding, vulnerability to prompt injection, and answers that vary between runs. Keep those in mind, but the rest of the book is about accuracy and freshness of facts.</p>`,
        },
        {
          type: "quiz",
          q: "A model released this year confidently tells a user that a company's CEO is someone who stepped down six months before the model's training data ends. Which failure mode is this?",
          options: ["Knowledge cutoff", "Outdated information", "Lack of private information", "None: the model is correct for its cutoff"],
          answer: 1,
          explain: "The change happened before the cutoff, so the snapshot should have covered it, but older text about the previous CEO likely dominates the training data. The model states a fact that used to be true. It is outdated information, not a cutoff problem, and it is wrong whatever the cutoff.",
        },
      ],
    },
    {
      id: "why-not-finetune",
      title: "Why retraining is a poor way to add facts",
      kicker: "The tempting fix",
      blocks: [
        {
          type: "text",
          html: `<p>If the model's knowledge is in its weights, the obvious fix is to update the weights. To see why that is harder than it sounds, look at how a chat model is built. Andrej Karpathy's widely shared description (his 2023 "State of GPT" talk) splits it into four stages.</p>`,
        },
        {
          type: "diagram",
          title: "How a chat model is trained",
          caption: "Pretraining is where most knowledge comes from and is far too expensive to repeat for each new fact. Supervised finetuning is cheaper, so it is where people try to inject facts.",
          svg: `<svg viewBox="0 0 640 200" role="img" aria-label="Four LLM training stages from pretraining to reinforcement learning, with supervised finetuning highlighted as where people try to add facts">
<defs><marker id="gr1-arr-train" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="10" y="40" width="140" height="64" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="80" y="68" text-anchor="middle" font-size="13" font-weight="700">Pretraining</text>
<text x="80" y="88" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">raw web-scale text</text>
<rect x="170" y="40" width="140" height="64" rx="8" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="3"/>
<text x="240" y="64" text-anchor="middle" font-size="13" font-weight="700">Supervised</text>
<text x="240" y="80" text-anchor="middle" font-size="13" font-weight="700">finetuning</text>
<text x="240" y="96" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">prompt, answer pairs</text>
<rect x="330" y="40" width="140" height="64" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="400" y="68" text-anchor="middle" font-size="13" font-weight="700">Reward model</text>
<text x="400" y="88" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">learns preferences</text>
<rect x="490" y="40" width="140" height="64" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="560" y="64" text-anchor="middle" font-size="13" font-weight="700">Reinforcement</text>
<text x="560" y="80" text-anchor="middle" font-size="13" font-weight="700">learning</text>
<text x="560" y="96" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">optimize vs reward</text>
<line x1="150" y1="72" x2="168" y2="72" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#gr1-arr-train)"/>
<line x1="310" y1="72" x2="328" y2="72" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#gr1-arr-train)"/>
<line x1="470" y1="72" x2="488" y2="72" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#gr1-arr-train)"/>
<text x="80" y="134" text-anchor="middle" font-size="12">months, thousands</text>
<text x="80" y="150" text-anchor="middle" font-size="12">of GPUs</text>
<text x="240" y="134" text-anchor="middle" font-size="12">where people try</text>
<text x="240" y="150" text-anchor="middle" font-size="12">to add new facts</text>
<text x="480" y="142" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">shape tone and helpfulness, not facts</text>
<text x="320" y="185" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">Most factual knowledge is absorbed in the first, most expensive stage.</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>Repeating pretraining every time a fact changes is out of the question. So the tempting move is supervised finetuning: feed the model pairs like <code>("Which team won the 2023 NBA championship?", "Denver Nuggets")</code> and hope it absorbs the fact.</p>
<p>The research on this is mixed. Some studies report better factual accuracy after finetuning; others find that models struggle to pick up genuinely new knowledge this way, and that training on unfamiliar facts can even make them more prone to inventing things. The model may learn to answer the exact phrasing it saw without being able to use the fact in a differently worded question.</p>
<p>There are also operational problems. You need a training pipeline that runs every time your data changes. The facts end up hidden in weights, so you cannot show a user where an answer came from. And you cannot "delete" a fact from a model the way you delete a row, which matters for private or regulated data.</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "Supervised finetuning", tone: "bad", html: "Facts live in weights. Every update means another training run. Results on new facts are inconsistent, sources cannot be shown, and private data becomes part of the model." },
            { title: "Retrieval-augmented generation", tone: "ok", html: "Facts live in a database you control. Updating means writing a row. The facts sit in the prompt, so the model reads them instead of recalling them, and you can show the sources." },
          ],
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>Finetuning is still useful, just for a different job: teaching a model a <em>style</em>, a format or a skill (such as writing Cypher, as you will see in chapter 4). Use it to change how a model behaves, and use retrieval to change what it knows.</p>`,
        },
      ],
    },
    {
      id: "rag",
      title: "Retrieval-augmented generation: look it up, then answer",
      kicker: "The key idea",
      blocks: [
        {
          type: "idea",
          html: `<p>Do not ask the model to remember facts. At question time, <strong>retrieve</strong> the relevant facts from an external knowledge base and put them in the prompt, then ask the model to answer <strong>from that context</strong>. The model supplies language skills; your data supplies the facts.</p>`,
        },
        {
          type: "text",
          html: `<p>The term comes from a 2020 paper by Lewis and colleagues at Facebook AI Research, which paired a neural retriever with a generator. Today the word covers any system with the same two stages: <strong>retrieval</strong> and <strong>augmented generation</strong>. The user only types a question; the retrieval happens behind the scenes.</p>`,
        },
        {
          type: "diagram",
          title: "A RAG request end to end",
          caption: "The question goes to the retriever, which pulls the most relevant context from your knowledge base. The original question and that context fill a prompt template, and the LLM answers from it.",
          svg: `<svg viewBox="0 0 640 235" role="img" aria-label="RAG pipeline: question, retriever with knowledge base, prompt template, LLM, answer">
<defs><marker id="gr1-arr-rag" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="12" y="44" width="104" height="56" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="64" y="68" text-anchor="middle" font-size="13" font-weight="700">Question</text>
<text x="64" y="86" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">from the user</text>
<rect x="140" y="44" width="104" height="56" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="192" y="68" text-anchor="middle" font-size="13" font-weight="700">Retriever</text>
<text x="192" y="86" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">embed + search</text>
<rect x="268" y="44" width="104" height="56" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="320" y="68" text-anchor="middle" font-size="13" font-weight="700">Prompt</text>
<text x="320" y="86" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">fills template</text>
<rect x="396" y="44" width="104" height="56" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="448" y="68" text-anchor="middle" font-size="13" font-weight="700">LLM</text>
<text x="448" y="86" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">writes answer</text>
<rect x="524" y="44" width="104" height="56" rx="8" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="576" y="68" text-anchor="middle" font-size="13" font-weight="700">Answer</text>
<text x="576" y="86" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">from context</text>
<line x1="116" y1="72" x2="138" y2="72" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#gr1-arr-rag)"/>
<line x1="244" y1="72" x2="266" y2="72" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#gr1-arr-rag)"/>
<line x1="372" y1="72" x2="394" y2="72" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#gr1-arr-rag)"/>
<line x1="500" y1="72" x2="522" y2="72" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#gr1-arr-rag)"/>
<path d="M64 44 V22 H320 V42" fill="none" stroke-width="2" stroke-dasharray="5 4" style="stroke: var(--dg-muted)" marker-end="url(#gr1-arr-rag)"/>
<text x="192" y="16" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">original question</text>
<rect x="120" y="150" width="144" height="52" rx="8" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="2"/>
<text x="192" y="173" text-anchor="middle" font-size="13" font-weight="700">Knowledge base</text>
<text x="192" y="191" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">docs, tables, graph</text>
<line x1="192" y1="150" x2="192" y2="102" stroke-width="2" style="stroke: var(--dg-4)" marker-end="url(#gr1-arr-rag)"/>
<text x="200" y="130" font-size="12" style="fill: var(--dg-muted)">relevant context</text>
<text x="300" y="173" font-size="12" style="fill: var(--dg-muted)">Updating knowledge = writing to this store.</text>
<text x="300" y="191" font-size="12" style="fill: var(--dg-muted)">No retraining, and the data stays yours.</text>
</svg>`,
        },
        {
          type: "code",
          lang: "python",
          title: "The smallest useful RAG loop",
          code: `PROMPT = """Answer the question using only the context below.
If the context does not contain the answer, say you don't know.

Context:
{context}

Question: {question}"""

def answer(question: str) -> str:
    docs = retriever.search(question, k=4)        # retrieval
    context = "\\n---\\n".join(d.text for d in docs)
    return llm.complete(PROMPT.format(context=context, question=question))  # generation`,
          caption: "Two calls: one to your knowledge base, one to the model. The instruction to admit ignorance matters as much as the retrieval.",
        },
        {
          type: "text",
          html: `<p>Read the prompt carefully. The first line restricts the model to the supplied context, and the second gives it a way out. Without that escape hatch, a retrieval miss turns straight back into a hallucination, because the model will still try to be helpful. With it, a miss becomes an honest "I don't know", which is a much better failure.</p>`,
        },
        {
          type: "lab",
          id: "ragToggle",
          caption: "Pick a question that hits one of the four failure modes, then switch retrieval on. Also try a retrieval miss to see the \"only use the provided documents\" instruction turn a guess into \"I don't know\".",
        },
        {
          type: "keypoints",
          items: [
            "RAG fixes the cutoff and outdated facts by retrieving current data at query time.",
            "It reduces hallucination because the answer is grounded in text the model can read, but it does not eliminate it.",
            "Private data stays in your database, behind your access controls, and only the retrieved snippets reach the model.",
            "Because facts come from retrieval, a smaller and cheaper generator is often good enough.",
          ],
        },
        {
          type: "quiz",
          q: "A RAG system's retriever returns three passages, none of which mention the answer. The prompt does not tell the model to stay within the context. What is the most likely outcome?",
          options: [
            "The model refuses to answer",
            "The model answers from its training data or invents an answer, with no sign that retrieval failed",
            "The retriever automatically searches again",
            "The model returns the three passages verbatim",
          ],
          answer: 1,
          explain: "Nothing in the pipeline detects the miss. The model sees irrelevant context and a question, and without an instruction to admit ignorance it does what it always does: produce a plausible answer. That is why grounding instructions (and later, answer critics and evaluation) matter.",
        },
      ],
    },
    {
      id: "limits-of-chunks",
      title: "Where retrieving text chunks falls short",
      kicker: "Why structure matters",
      blocks: [
        {
          type: "problem",
          html: `<p>The most common RAG setup splits documents into chunks, embeds them, and retrieves the few chunks most similar to the question. That works for "what does the article say about X?" It breaks down for questions that need <em>every</em> matching record, or that need to follow a chain of facts.</p>`,
        },
        {
          type: "text",
          html: `<p>Take the project manager's question from the hook: "How many onboarding tasks are completed?" Suppose each task has a short status note in your document store, 37 of them say "completed", and the retriever returns the top 4 chunks. The model sees 4 completed tasks. It cannot count what it was never shown, so its answer is somewhere between "4" and a guess.</p>
<p>Raising <code>k</code> to 50 does not really fix it either. You pay for a huge prompt, you still cannot be sure every relevant chunk made the cut, and you are asking a language model to do arithmetic over a long, messy context, which is not its strength.</p>
<p>Multi-hop questions fail in a similar way. "Who does the person assigned to task T-17 report to?" needs two facts that probably live in different chunks: the assignment and the reporting line. Similarity search on the question may find one and miss the other.</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "Fuzzy, open-ended", tone: "ok", html: "\"What does the launch article say about pricing?\" The answer is in a passage; similarity search finds it well." },
            { title: "Exact and exhaustive", tone: "bad", html: "\"How many tasks are completed?\" \"Which employees joined after March?\" These need filtering, counting or aggregation over all records." },
            { title: "Multi-hop", tone: "warn", html: "\"Who does the assignee of T-17 report to?\" Needs two linked facts, often stored apart." },
          ],
        },
        {
          type: "text",
          html: `<p>A database answers these exactly. The question is where the structured data comes from and how to keep the free text alongside it. That is the case the book makes for knowledge graphs.</p>`,
        },
      ],
    },
    {
      id: "knowledge-graphs",
      title: "Knowledge graphs: structured facts and text in one store",
      kicker: "The book's thesis",
      blocks: [
        {
          type: "idea",
          html: `<p>A <strong>knowledge graph</strong> stores entities as <strong>nodes</strong> and the connections between them as <strong>relationships</strong>, and both can carry properties. Because a node can hold a long text property and an embedding as easily as a status field, one graph can serve exact structured questions and fuzzy text questions, with explicit links between the two.</p>`,
        },
        {
          type: "diagram",
          title: "One graph, two kinds of data",
          caption: "People, reporting lines and task status are structured facts. The article chunk holds free text and an embedding, and its MENTIONS link connects it to the company it talks about.",
          svg: `<svg viewBox="0 0 640 295" role="img" aria-label="A small knowledge graph with a company, people who report to each other, tasks with status, and an article chunk that mentions the company">
<defs><marker id="gr1-arr-kg" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="100" y="38" width="100" height="44" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="150" y="57" text-anchor="middle" font-size="13" font-weight="700">Dana</text>
<text x="150" y="73" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">:Person</text>
<rect x="270" y="38" width="100" height="44" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="320" y="57" text-anchor="middle" font-size="13" font-weight="700">Northwind</text>
<text x="320" y="73" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">:Company</text>
<rect x="470" y="38" width="110" height="44" rx="8" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="2"/>
<text x="525" y="57" text-anchor="middle" font-size="13" font-weight="700">Launch article</text>
<text x="525" y="73" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">:Chunk</text>
<rect x="100" y="138" width="100" height="44" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="150" y="157" text-anchor="middle" font-size="13" font-weight="700">Eli</text>
<text x="150" y="173" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">:Person</text>
<rect x="100" y="233" width="100" height="44" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="150" y="252" text-anchor="middle" font-size="13" font-weight="700">Mia</text>
<text x="150" y="268" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">:Person</text>
<rect x="330" y="138" width="100" height="44" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="380" y="157" text-anchor="middle" font-size="13" font-weight="700">Task T-1</text>
<text x="380" y="173" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">Completed</text>
<rect x="330" y="233" width="100" height="44" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="380" y="252" text-anchor="middle" font-size="13" font-weight="700">Task T-2</text>
<text x="380" y="268" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">Open</text>
<line x1="202" y1="60" x2="268" y2="60" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#gr1-arr-kg)"/>
<text x="235" y="52" text-anchor="middle" font-size="12">CEO_OF</text>
<line x1="468" y1="60" x2="372" y2="60" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#gr1-arr-kg)"/>
<text x="420" y="52" text-anchor="middle" font-size="12">MENTIONS</text>
<line x1="150" y1="138" x2="150" y2="84" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#gr1-arr-kg)"/>
<text x="158" y="115" font-size="12">REPORTS_TO</text>
<line x1="150" y1="233" x2="150" y2="184" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#gr1-arr-kg)"/>
<text x="158" y="212" font-size="12">REPORTS_TO</text>
<line x1="200" y1="160" x2="328" y2="160" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#gr1-arr-kg)"/>
<text x="264" y="152" text-anchor="middle" font-size="12">ASSIGNED</text>
<line x1="200" y1="255" x2="328" y2="255" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#gr1-arr-kg)"/>
<text x="264" y="247" text-anchor="middle" font-size="12">ASSIGNED</text>
<text x="455" y="150" font-size="12" font-weight="700">Structured facts</text>
<text x="455" y="168" font-size="12" style="fill: var(--dg-muted)">reporting lines,</text>
<text x="455" y="184" font-size="12" style="fill: var(--dg-muted)">assignments, status</text>
<text x="455" y="222" font-size="12" font-weight="700">Unstructured text</text>
<text x="455" y="240" font-size="12" style="fill: var(--dg-muted)">chunk.text and</text>
<text x="455" y="256" font-size="12" style="fill: var(--dg-muted)">chunk.embedding</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>With this graph, the counting question is a one-line query instead of a hope, and the multi-hop question is a path. The text question still goes through similarity search over chunk embeddings, and because the chunk is linked to <code>Northwind</code>, you can also pull in structured facts about the company the article mentions.</p>`,
        },
        {
          type: "code",
          lang: "cypher",
          title: "Exact answers by traversal",
          code: `// How many tasks are completed? Exact, whatever k would have been.
MATCH (t:Task {status: "Completed"})
RETURN count(t) AS completed;

// Who does the assignee of T-1 report to? Two hops, one query.
MATCH (:Task {id: "T-1"})<-[:ASSIGNED]-(p:Person)-[:REPORTS_TO]->(boss:Person)
RETURN p.name AS assignee, boss.name AS manager;`,
        },
        {
          type: "lab",
          id: "questionTypes",
          caption: "Ask each question with vector top-k over chunks, with a structured-only graph query, and with a knowledge graph that has both. Raise k and see what it takes for chunks to answer counting and multi-hop questions.",
        },
        {
          type: "realworld",
          items: [
            { org: "Neo4j", title: "Graph plus vectors in one database", html: "Neo4j stores nodes and relationships with properties and supports vector and full-text indexes, which is why the book uses it for every retrieval pattern, from plain chunk search to graph traversal." },
            { org: "Microsoft Research", title: "GraphRAG (2024)", html: "Microsoft's GraphRAG builds a knowledge graph from raw text with an LLM, then summarizes communities of related entities so it can answer questions about a whole dataset. Chapter 7 implements its core ideas." },
            { org: "LangChain and LlamaIndex", title: "Graph retrievers", html: "Both frameworks ship integrations that turn a question into a graph query and that extract graphs from documents, so graph-backed RAG is available without writing every piece by hand." },
          ],
        },
        {
          type: "tradeoffs",
          pros: [
            "Exact answers for counting, filtering, aggregation and multi-hop questions",
            "Text and structure in one store, with explicit links between passages and entities",
            "Answers are traceable to specific nodes, relationships and source chunks",
          ],
          cons: [
            "Someone has to design a schema and populate it, from existing databases or by LLM extraction (chapters 6 and 7)",
            "Turning a natural-language question into a graph query is its own problem (chapter 4)",
            "More moving parts than \"embed chunks, search, answer\"",
          ],
        },
        {
          type: "quiz",
          q: "Which question gains the most from storing structured data in the graph rather than only text chunks?",
          options: [
            "\"Summarize what the launch article says about pricing.\"",
            "\"Which employees in Eli's reporting line have open tasks?\"",
            "\"What tone does the CEO use in the article?\"",
            "\"Explain our refund policy in simple words.\"",
          ],
          answer: 1,
          explain: "It needs to follow reporting relationships, then filter tasks by status: a traversal plus a filter over every matching record. The other questions are about the content of a passage, which similarity search over text handles well.",
        },
      ],
    },
    {
      id: "interview",
      title: "Explaining it in an interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "text",
          html: `<p>This chapter is the "why" behind every LLM application question: "Design a chatbot over our internal docs", "Why does our assistant make things up?", "Should we finetune or use RAG?". Interviewers want to hear that you know what the model is good at (language) and what it is not (being a database).</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>A strong answer to "how would you make an LLM answer accurately about our data?" covers:</p>
<ol>
<li><strong>Diagnose:</strong> name the failure modes: cutoff, outdated facts, hallucination, missing private data.</li>
<li><strong>Reject the naive fix:</strong> finetuning is costly to repeat, unreliable for new facts, and hides sources. Use it for style or skills, not knowledge.</li>
<li><strong>Propose RAG:</strong> retrieve relevant context at query time, ground the answer with an instruction to stay within it and to say "I don't know".</li>
<li><strong>Know the limit:</strong> top-k text retrieval cannot count or follow chains reliably; structured data, ideally a knowledge graph that also holds the text, answers those.</li>
</ol>
<p>Then add that RAG reduces hallucination but does not remove it, so you would evaluate faithfulness and retrieval quality (chapter 8).</p>`,
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>"RAG solves hallucinations." It reduces them by putting facts in front of the model. The model can still misread context, and the retriever can return the wrong passages. Saying "reduces, and we measure it" sounds far more senior than "solves".</p>`,
        },
        {
          type: "quiz",
          q: "Your team's RAG assistant answers \"How many open support tickets do we have?\" with a different number each day, always below the true count. What is the best fix?",
          options: [
            "Finetune the model on yesterday's ticket counts",
            "Increase k so more ticket chunks fit in the prompt",
            "Answer this kind of question with a structured query over the ticket data and give the result to the LLM",
            "Switch to a model with a later knowledge cutoff",
          ],
          answer: 2,
          explain: "Counting needs every record, and top-k retrieval only ever shows the model a sample, which is why the answer is low and unstable. A structured query computes the exact count; the LLM then only has to phrase it. A bigger k is expensive and still not guaranteed to be complete, and finetuning or a newer model cannot know today's count.",
        },
      ],
    },
  ],
  takeaways: [
    "Plain LLMs fail on facts in four distinct ways: <strong>knowledge cutoff</strong>, <strong>outdated information</strong>, <strong>hallucination</strong> and <strong>no private data</strong>.",
    "Pretraining is too expensive to repeat, and supervised finetuning is an unreliable, opaque way to add facts. Use finetuning for behavior, not knowledge.",
    "<strong>RAG</strong> retrieves relevant context at query time and asks the model to answer from it. The model brings language skills; your store brings the facts.",
    "Tell the model to stay within the context and to say \"I don't know\": that turns retrieval misses into honest answers instead of hallucinations.",
    "Top-k text retrieval cannot reliably count, filter, aggregate or follow multi-hop chains, because the model only sees a sample.",
    "A <strong>knowledge graph</strong> holds structured facts and unstructured text together, with explicit links, so it can answer both exact and fuzzy questions.",
  ],
  furtherReading: [
    { title: "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks (Lewis et al., 2020)", url: "https://arxiv.org/abs/2005.11401", note: "The paper that named RAG, pairing a dense retriever with a generator." },
    { title: "From Local to Global: A Graph RAG Approach to Query-Focused Summarization (Edge et al., 2024)", url: "https://arxiv.org/abs/2404.16130", note: "Microsoft's GraphRAG paper, the basis of chapter 7." },
    { title: "Andrej Karpathy, \"State of GPT\" (Microsoft Build, 2023)", note: "The talk describing the pretraining, finetuning, reward modeling and RL stages." },
  ],
};
