// Deep dive: Chapter 3, Advanced vector retrieval strategies. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch3 = {
  hook: `<p>Your HR assistant indexes employee bios. Someone asks, "Which company did Priya work for between 2015 and 2017?" The bio that answers it says, "Priya began her career at a logistics startup, Fleetline, before moving into consulting." It never mentions 2015 or 2017. The question, meanwhile, is mostly years and a date range, so its embedding lands near chunks about fiscal calendars and annual reviews. The bio ranks ninth.</p>
<p>Nothing is wrong with the embedding model. The question and the answer are simply written in different ways: one is a precise query, the other is a narrative. This chapter covers two families of fixes. You can <strong>rewrite the query</strong> so it looks more like the documents, or you can <strong>change what you embed</strong> so the documents look more like the queries, or so that small, precise pieces are matched while larger pieces are returned.</p>`,
  sections: [
    {
      id: "the-mismatch",
      title: "Why the right document can still rank low",
      kicker: "The problem",
      blocks: [
        {
          type: "problem",
          html: `<p>Vector search finds text whose embedding is close to the question's embedding. But a question and the passage that answers it are different kinds of text. When the question is dominated by details (dates, numbers, qualifiers) that the answer passage does not repeat, the two vectors can end up far apart.</p>`,
        },
        {
          type: "diagram",
          title: "The question lands in the wrong neighborhood",
          caption: "A toy embedding space. The specific question sits among chunks about dates and seasons. A broader rewrite of the same question lands among the biography chunks that actually hold the answer.",
          svg: `<svg viewBox="0 0 640 260" role="img" aria-label="Embedding space with a cluster of date chunks and a cluster of biography chunks; the original question sits in the date cluster and the step-back question in the biography cluster">
<defs><marker id="gr3-arr-space" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" style="fill: var(--dg-muted)"/></marker></defs>
<ellipse cx="150" cy="140" rx="95" ry="70" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<ellipse cx="480" cy="140" rx="95" ry="70" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<circle cx="100" cy="110" r="5" style="fill: var(--dg-2)"/>
<circle cx="130" cy="165" r="5" style="fill: var(--dg-2)"/>
<circle cx="160" cy="100" r="5" style="fill: var(--dg-2)"/>
<circle cx="80" cy="140" r="5" style="fill: var(--dg-2)"/>
<circle cx="115" cy="135" r="5" style="fill: var(--dg-2)"/>
<circle cx="450" cy="105" r="5" style="fill: var(--dg-1)"/>
<circle cx="505" cy="100" r="5" style="fill: var(--dg-1)"/>
<circle cx="535" cy="140" r="5" style="fill: var(--dg-1)"/>
<circle cx="490" cy="170" r="5" style="fill: var(--dg-1)"/>
<circle cx="550" cy="115" r="5" style="fill: var(--dg-1)"/>
<rect x="198" y="134" width="14" height="14" style="fill: var(--dg-bad)"/>
<text x="205" y="172" text-anchor="middle" font-size="12">original question</text>
<rect x="413" y="133" width="14" height="14" style="fill: var(--dg-ok)"/>
<text x="430" y="194" text-anchor="middle" font-size="12">step-back question</text>
<path d="M216 136 Q 310 70 408 134" fill="none" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#gr3-arr-space)"/>
<text x="312" y="92" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">LLM rewrite</text>
<text x="150" y="238" text-anchor="middle" font-size="13" font-weight="700">seasons and dates</text>
<text x="480" y="238" text-anchor="middle" font-size="13" font-weight="700">career biography</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>There are two places to intervene. On the <strong>query side</strong>, an LLM rewrites the question before it is embedded. On the <strong>index side</strong>, you change what gets embedded when you load the data. Each family has a cost: query-side fixes add work to every request, index-side fixes add work and storage to data setup.</p>`,
        },
        {
          type: "table",
          title: "Four strategies at a glance",
          headers: ["Strategy", "Side", "What is embedded and searched", "What is returned"],
          rows: [
            ["Step-back prompting", "Query", "A broader rewrite of the question", "Matching chunks; the original question is answered"],
            ["HyDE", "Query", "A hypothetical answer the LLM writes", "Real documents near that answer"],
            ["Hypothetical questions", "Index", "Questions each document can answer", "The document behind the matched question"],
            ["Parent document", "Index", "Small child chunks", "The larger parent the child belongs to"],
          ],
        },
      ],
    },
    {
      id: "step-back",
      title: "Step-back prompting: ask a broader question first",
      kicker: "Query rewriting",
      blocks: [
        {
          type: "idea",
          html: `<p>Ask an LLM to turn the specific question into a more general one, search with the general one, and then answer the <strong>original</strong> question from what you found. Broad questions match the overview passages where specific facts usually live.</p>`,
        },
        {
          type: "text",
          html: `<p>The technique comes from Zheng and colleagues at Google DeepMind (2023), who used abstraction to help models reason. For retrieval, the effect is simple: "Which company did Priya work for between 2015 and 2017?" becomes "What is Priya's career history?" The rewrite drops the dates that pulled the embedding off course and keeps the subject and the kind of information wanted.</p>
<p>Two details make it work reliably. First, the rewrite prompt is <strong>few-shot</strong>: it includes a handful of example pairs (typically two to five) so the model learns the pattern of "specific in, general out" instead of improvising. A <strong>zero-shot</strong> prompt, with instructions only, gives less consistent rewrites. Second, the rewrite is used only for retrieval. The final answer prompt receives the original question, because that is what the user asked.</p>`,
        },
        {
          type: "code",
          lang: "python",
          title: "A few-shot step-back rewrite",
          code: `STEP_BACK_SYSTEM = """Rewrite the user's question as a more general question
that would retrieve useful background. Return only the rewritten question.

Examples:
Q: Did the 1998 model of the Vantage bike have disc brakes?
A: What are the specifications of the Vantage bike across model years?
Q: Which conference did Dr. Okafor present at in March 2019?
A: What is Dr. Okafor's speaking and publication history?"""

def step_back(question: str) -> str:
    return chat([{"role": "system", "content": STEP_BACK_SYSTEM},
                 {"role": "user", "content": question}])

def rag(question: str) -> str:
    docs = retrieve(step_back(question), k=4)   # search with the broad rewrite
    return generate_answer(question, docs)      # answer the original question`,
        },
        {
          type: "diagram",
          title: "Two questions, two jobs",
          caption: "The rewrite drives retrieval only. The answer prompt pairs the retrieved documents with the user's original, specific question.",
          svg: `<svg viewBox="0 0 640 200" role="img" aria-label="Step-back pipeline: question to LLM rewrite to retriever to answer LLM, with the original question also sent to the answer LLM">
<defs><marker id="gr3-arr-sb" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="12" y="70" width="110" height="56" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="67" y="94" text-anchor="middle" font-size="13" font-weight="700">Question</text>
<text x="67" y="112" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">specific</text>
<rect x="152" y="70" width="110" height="56" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="207" y="94" text-anchor="middle" font-size="13" font-weight="700">LLM rewrite</text>
<text x="207" y="112" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">few-shot prompt</text>
<rect x="292" y="70" width="110" height="56" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="347" y="94" text-anchor="middle" font-size="13" font-weight="700">Retriever</text>
<text x="347" y="112" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">broad query</text>
<rect x="432" y="70" width="110" height="56" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="487" y="94" text-anchor="middle" font-size="13" font-weight="700">LLM answer</text>
<text x="487" y="112" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">docs + original</text>
<line x1="122" y1="98" x2="150" y2="98" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#gr3-arr-sb)"/>
<line x1="262" y1="98" x2="290" y2="98" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#gr3-arr-sb)"/>
<line x1="402" y1="98" x2="430" y2="98" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#gr3-arr-sb)"/>
<line x1="542" y1="98" x2="570" y2="98" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#gr3-arr-sb)"/>
<text x="576" y="103" font-size="13" font-weight="700">Answer</text>
<path d="M67 70 V36 H487 V68" fill="none" stroke-width="2" stroke-dasharray="5 4" style="stroke: var(--dg-3)" marker-end="url(#gr3-arr-sb)"/>
<text x="277" y="28" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">original question goes straight to the answer step</text>
<text x="277" y="160" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">"What is Priya's career history?" is only used to search.</text>
</svg>`,
        },
        {
          type: "lab",
          id: "stepBack",
          caption: "Compare where the specific question and its step-back rewrite land among toy concept vectors, and which documents each retrieves. The original question is still the one that gets answered.",
        },
        {
          type: "tradeoffs",
          pros: [
            "Large recall gains when questions are full of specifics that documents do not repeat",
            "No change to the index: works on top of any existing retriever",
            "Few-shot examples make rewrites predictable and easy to inspect",
          ],
          cons: [
            "An extra LLM call on every request: more latency and cost",
            "A rewrite can drift from the user's intent or become too vague to be useful",
            "Helps little when questions are already broad",
          ],
        },
        {
          type: "quiz",
          q: "In a step-back pipeline, why is the original question, not the rewrite, sent to the final answer prompt?",
          options: [
            "The rewrite is too long for the prompt",
            "The rewrite is deliberately broader, so answering it would not answer what the user actually asked",
            "LLMs cannot read rewritten questions",
            "It saves one embedding call",
          ],
          answer: 1,
          explain: "The rewrite exists to cast a wider net during search. \"What is Priya's career history?\" would produce a summary of her whole career; the user wanted one company for one period. The retrieved documents give the context, and the original question tells the model which detail to extract.",
        },
      ],
    },
    {
      id: "hyde-and-questions",
      title: "HyDE and hypothetical questions: make both sides look alike",
      kicker: "Matching like with like",
      blocks: [
        {
          type: "text",
          html: `<p>Step-back prompting makes the question broader. Two other techniques attack the mismatch more directly: make the query look like a document, or make the documents look like queries.</p>
<h3>HyDE: embed an imagined answer</h3>
<p>The <strong>hypothetical document embeddings</strong> method (Gao and colleagues, 2022) asks an LLM to write a short passage that would answer the question, then embeds that passage instead of the question. The passage may contain wrong details; that is fine, because it is never shown to the user. What matters is that it is written like an answer, so its vector lands among real answers.</p>
<h3>Hypothetical questions: embed what a document answers</h3>
<p>The index-side mirror image: when loading each document, ask an LLM to list the questions it can answer (or collect real questions from chat logs), embed those questions, and link them to the document. At query time, the user's question is matched against stored questions, question to question, and the linked document is returned.</p>`,
        },
        {
          type: "code",
          lang: "cypher",
          title: "Hypothetical questions as a graph",
          code: `// index time: one Question node per generated question
MERGE (d:Document {id: $doc_id})
SET d.text = $text
WITH d
UNWIND $questions AS q
MERGE (d)-[:HAS_QUESTION]->(:Question {text: q.text, embedding: q.embedding});

// query time: match questions, return their documents
CALL db.index.vector.queryNodes('question_embeddings', $k * 3, $embedding)
YIELD node, score
MATCH (node)<-[:HAS_QUESTION]-(d:Document)
WITH d, max(score) AS score
RETURN d.text AS text, score ORDER BY score DESC LIMIT $k;`,
        },
        {
          type: "compare",
          items: [
            { title: "HyDE (query time)", tone: "info", html: "No change to the index. Adds an LLM call per question. The fake answer can mislead search if the model's guess points to the wrong topic." },
            { title: "Hypothetical questions (index time)", tone: "info", html: "No extra LLM call at query time. Adds LLM calls and several vectors per document at setup, and only helps for questions similar to the ones generated." },
          ],
        },
        {
          type: "realworld",
          items: [
            { org: "LangChain", title: "HyDE and multi-query", html: "LangChain ships a <code>HypotheticalDocumentEmbedder</code> and a <code>MultiQueryRetriever</code>, which asks an LLM for several rewrites of a question and merges what each retrieves." },
            { org: "LlamaIndex", title: "Query transforms", html: "LlamaIndex has a HyDE query transform that can be placed in front of any query engine, so the technique can be tried without changing the index." },
          ],
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>Hypothetical questions get better with real traffic. Once the system is live, log the questions users actually ask and the documents that answered them well, and add those as extra <code>Question</code> nodes. Your index then learns your users' vocabulary instead of the LLM's guesses about it.</p>`,
        },
        {
          type: "quiz",
          q: "Your latency budget is tight, but data setup can run overnight. Which strategy fits best for closing the question-document phrasing gap?",
          options: ["HyDE", "Step-back prompting", "Hypothetical question embedding", "Raising k"],
          answer: 2,
          explain: "Hypothetical questions move the LLM work to index time: questions are generated and embedded during the overnight load, and each query is a plain vector search. HyDE and step-back both add an LLM call to every request.",
        },
      ],
    },
    {
      id: "parent-document",
      title: "Parent document retriever: match small, return big",
      kicker: "Changing what you embed",
      blocks: [
        {
          type: "problem",
          html: `<p>Chunk size is a tug of war. Small chunks give sharp embeddings that match specific questions well, but they hand the LLM a fragment with no surroundings. Large chunks give the LLM context, but their embeddings average several ideas into one blurry vector that matches nothing precisely.</p>`,
        },
        {
          type: "analogy",
          html: `<p>Think of a book index. You look up a precise term, and the index points you to a page number, but you then read the whole page, not just the line containing the term. Children play the role of index entries: small and precise. Parents are the pages you actually read.</p>`,
        },
        {
          type: "idea",
          html: `<p>Stop forcing one chunk size to do both jobs. Split documents into <strong>parents</strong>, split each parent into small <strong>children</strong>, embed only the children, match the question against children, and return the <strong>parent</strong> of each match.</p>`,
        },
        {
          type: "diagram",
          title: "Search the children, return the parents",
          caption: "Children A1, A2 and B1 are the best matches. A1 and A2 share parent A, so the retriever returns two distinct parents, each scored by its best child.",
          svg: `<svg viewBox="0 0 640 290" role="img" aria-label="A PDF node with two parents, each with three child chunks; three matched children map to two returned parents">
<defs><marker id="gr3-arr-pd" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" style="fill: var(--dg-muted)"/></marker></defs>
<text x="60" y="24" text-anchor="middle" font-size="12" font-weight="700">PDF</text>
<text x="220" y="24" text-anchor="middle" font-size="12" font-weight="700">Parents ≤ 2,000 chars</text>
<text x="380" y="24" text-anchor="middle" font-size="12" font-weight="700">Children, embedded</text>
<rect x="20" y="140" width="80" height="40" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="60" y="165" text-anchor="middle" font-size="13">paper</text>
<rect x="170" y="75" width="100" height="40" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="220" y="100" text-anchor="middle" font-size="13" font-weight="700">Parent A</text>
<rect x="170" y="205" width="100" height="40" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="220" y="230" text-anchor="middle" font-size="13" font-weight="700">Parent B</text>
<line x1="100" y1="155" x2="168" y2="100" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#gr3-arr-pd)"/>
<line x1="100" y1="165" x2="168" y2="220" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#gr3-arr-pd)"/>
<rect x="335" y="40" width="90" height="30" rx="6" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="380" y="60" text-anchor="middle" font-size="12">A1</text>
<rect x="335" y="80" width="90" height="30" rx="6" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="380" y="100" text-anchor="middle" font-size="12">A2</text>
<rect x="335" y="120" width="90" height="30" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<text x="380" y="140" text-anchor="middle" font-size="12">A3</text>
<rect x="335" y="170" width="90" height="30" rx="6" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="380" y="190" text-anchor="middle" font-size="12">B1</text>
<rect x="335" y="210" width="90" height="30" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<text x="380" y="230" text-anchor="middle" font-size="12">B2</text>
<rect x="335" y="250" width="90" height="30" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<text x="380" y="270" text-anchor="middle" font-size="12">B3</text>
<line x1="270" y1="90" x2="333" y2="55" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#gr3-arr-pd)"/>
<line x1="270" y1="95" x2="333" y2="95" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#gr3-arr-pd)"/>
<line x1="270" y1="100" x2="333" y2="135" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#gr3-arr-pd)"/>
<line x1="270" y1="220" x2="333" y2="185" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#gr3-arr-pd)"/>
<line x1="270" y1="225" x2="333" y2="225" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#gr3-arr-pd)"/>
<line x1="270" y1="230" x2="333" y2="265" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#gr3-arr-pd)"/>
<text x="434" y="60" font-size="12">0.91</text>
<text x="434" y="100" font-size="12">0.88</text>
<text x="434" y="190" font-size="12">0.84</text>
<rect x="490" y="90" width="140" height="120" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="502" y="114" font-size="12" font-weight="700">Top children</text>
<text x="502" y="132" font-size="12" style="fill: var(--dg-muted)">A1, A2, B1</text>
<text x="502" y="160" font-size="12" font-weight="700">Returned parents</text>
<text x="502" y="178" font-size="12" style="fill: var(--dg-muted)">A (best child 0.91)</text>
<text x="502" y="196" font-size="12" style="fill: var(--dg-muted)">B (best child 0.84)</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>In Neo4j the hierarchy is a natural graph: <code>(:PDF)-[:HAS_PARENT]-&gt;(:Parent)-[:HAS_CHILD]-&gt;(:Child)</code>, with the vector index on the child embeddings. Retrieval is a vector search followed by one hop back to the parent.</p>
<p>The subtle part is deduplication. The best-matching children often come from the same parent, because a relevant section tends to have several relevant paragraphs. If you ask for exactly <code>k</code> children, you may end up with fewer than <code>k</code> distinct parents. The book's fix is to over-fetch: retrieve <code>k &times; 4</code> children, group by parent keeping each parent's best score, and only then cut to <code>k</code>.</p>`,
        },
        {
          type: "code",
          lang: "cypher",
          title: "Over-fetch children, dedupe parents",
          code: `CALL db.index.vector.queryNodes('child_embeddings', $k * 4, $embedding)
YIELD node AS child, score
MATCH (child)<-[:HAS_CHILD]-(parent:Parent)
WITH parent, max(score) AS score          // one row per parent, best child wins
RETURN parent.text AS text, score
ORDER BY score DESC
LIMIT toInteger($k);`,
        },
        {
          type: "lab",
          id: "parentDoc",
          caption: "Match a question against child embeddings, traverse to parents and dedupe. Change the over-fetch factor and watch how often fetching only k children leaves you with fewer than k unique parents.",
        },
        {
          type: "realworld",
          items: [
            { org: "LangChain", title: "ParentDocumentRetriever", html: "Stores small chunks in a vector store and the larger parents in a separate document store, returning parents for matched children. The book builds the same idea directly in Neo4j." },
            { org: "LlamaIndex", title: "Auto-merging retrieval", html: "Builds a hierarchy of chunk sizes and, when enough sibling chunks are retrieved, replaces them with their shared parent. It is a close cousin of the parent document pattern." },
          ],
        },
        {
          type: "quiz",
          q: "You want k = 3 parents. You fetch exactly 3 children, and all three belong to the same parent. What do you return?",
          options: ["Three parents", "One parent", "Three children", "An error"],
          answer: 1,
          explain: "After grouping by parent, the three matches collapse into one row. That is exactly why the book over-fetches k × 4 children: it leaves enough candidates that grouping still yields k distinct parents in most cases.",
        },
      ],
    },
    {
      id: "splitting-real-documents",
      title: "Splitting a real document: structure first, then size",
      kicker: "Data setup in practice",
      blocks: [
        {
          type: "text",
          html: `<p>Parents work best when each one holds a complete idea, and authors have already marked complete ideas for you: sections and paragraphs. So split on <strong>structure first</strong>, and only then enforce a size limit.</p>
<p>For the Einstein paper, the book finds numbered section titles with a regular expression and gets nine sections. Counting tokens (with OpenAI's <code>tiktoken</code> library) shows they vary wildly: one section is over 4,000 tokens, too long to be a useful parent, while a few fragments are tiny. So parents are capped at 2,000 characters, children are cut at 500 characters, and fragments of 20 tokens or fewer are dropped because they carry no useful information.</p>`,
        },
        {
          type: "code",
          lang: "python",
          title: "Structure-first splitting with a size cap",
          code: `import re, tiktoken

enc = tiktoken.get_encoding("cl100k_base")
SECTION_TITLE = re.compile(r"\\n(?=\\d+\\.\\s+[A-Z])")    # e.g. "\\n3. Refrigeration"

def parents_from(text: str, max_chars: int = 2000) -> list[str]:
    parents = []
    for section in SECTION_TITLE.split(text):
        if len(enc.encode(section)) <= 20:              # headings, page furniture
            continue
        parents += chunk_text(section, size=max_chars, overlap=0)
    return parents

def children_from(parent: str) -> list[str]:
    return chunk_text(parent, size=500, overlap=40)`,
          caption: "<code>chunk_text</code> is the whitespace-aware sliding window from chapter 2. The regex is specific to this document's numbering; every corpus needs its own.",
        },
        {
          type: "keypoints",
          items: [
            "Sections encapsulate complete ideas, so they make better parents than arbitrary windows.",
            "Count tokens, not characters, when checking against model limits; characters are fine for rough chunk sizing.",
            "Drop near-empty fragments so they cannot win searches with meaningless matches.",
            "Give children stable ids derived from document, parent and position so re-imports are idempotent.",
          ],
        },
      ],
    },
    {
      id: "other-levers",
      title: "Other levers, and how to combine them",
      kicker: "Beyond this chapter",
      blocks: [
        {
          type: "list",
          items: [
            "<strong>Reranking:</strong> retrieve a generous candidate set cheaply, then let a stronger cross-encoder or rerank model reorder it against the question. Often the single biggest precision gain.",
            "<strong>Metadata filtering:</strong> narrow candidates by date, author, product or source before semantic matching, so similarity only has to choose among plausible documents.",
            "<strong>Finetuning the embedding model</strong> on your domain's question-passage pairs. Effective, but every document must be re-embedded afterwards.",
            "<strong>Hybrid retrieval:</strong> combine with keyword search, as in chapter 2.",
          ],
        },
        {
          type: "text",
          html: `<p>These strategies compose. The book's final pipeline chains a step-back rewrite with the parent document retriever: search the children with the broad question, return deduplicated parents, and answer the original question. Each piece fixes a different failure, which is why combining them works.</p>
<p>A sensible order for trying them: start with a clean baseline (good chunking, hybrid search), measure, then add the cheapest fix that targets the failure you actually see. If the right passages appear at rank 8 to 20, add a reranker. If they never appear, look at query rewriting or what you embed. If they appear but are too thin, return parents.</p>`,
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p>Every strategy here costs something: an LLM call per query, LLM calls per document, extra vectors, or longer prompts. Adopt one only after a benchmark shows it helps on <em>your</em> questions. A rewrite that improves recall on one dataset can make answers vaguer on another.</p>`,
        },
      ],
    },
    {
      id: "interview",
      title: "Discussing retrieval quality in an interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "text",
          html: `<p>A common follow-up after you sketch a basic RAG design is "users say it can't find documents that are obviously there; what do you do?" This chapter is the toolbox for that question, and the best answers diagnose before prescribing.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>Structure the answer around where the mismatch is:</p>
<ol>
<li><strong>Query looks unlike documents</strong> (specific, date-heavy, short): rewrite the query. Step-back for over-specific questions, HyDE to make the query answer-shaped. Both add a call per request.</li>
<li><strong>Documents look unlike queries:</strong> embed hypothetical questions per document. Cost moves to indexing.</li>
<li><strong>Chunk-size tension</strong> (precise matches but thin context): parent document retriever, with over-fetching to get k distinct parents.</li>
<li><strong>Ranking is the issue,</strong> not recall: rerank a bigger candidate set, or filter by metadata first.</li>
</ol>
<p>Finish with measurement: retrieval recall on a labelled question set, before and after.</p>`,
        },
        {
          type: "quiz",
          q: "Retrieved passages for a contracts assistant are on topic but too short: the clause is found, yet the definitions it depends on (two paragraphs earlier) are missing. Which change targets this best?",
          options: [
            "Step-back prompting",
            "HyDE",
            "Parent document retrieval with section-level parents",
            "Switching to a larger embedding model",
          ],
          answer: 2,
          explain: "Matching already works; the problem is context. Keeping small children for matching but returning the whole section as the parent gives the model the clause together with its definitions. Query rewriting would not change what each hit contains.",
        },
      ],
    },
  ],
  takeaways: [
    "Questions and the passages that answer them are phrased differently, so the right document can rank low even with a good embedding model.",
    "<strong>Step-back prompting</strong> rewrites a specific question into a broader one for retrieval; the original question is still the one answered. Use few-shot examples for consistent rewrites.",
    "<strong>HyDE</strong> embeds an LLM-written hypothetical answer (query-time cost); <strong>hypothetical questions</strong> embed the questions each document answers (index-time cost).",
    "The <strong>parent document retriever</strong> matches small children for precision and returns their parents for context.",
    "Over-fetch children (the book uses <strong>k &times; 4</strong>) and group by parent so you still get k distinct parents.",
    "Split on structure first, then cap size; count tokens and drop near-empty fragments.",
    "Every strategy adds latency, cost or storage. Benchmark before adopting, and combine strategies that fix different failures.",
  ],
  furtherReading: [
    { title: "Take a Step Back: Evoking Reasoning via Abstraction in Large Language Models (Zheng et al., 2023)", note: "The step-back prompting paper from Google DeepMind." },
    { title: "Precise Zero-Shot Dense Retrieval without Relevance Labels (Gao et al., 2022)", note: "Introduces HyDE, hypothetical document embeddings." },
    { title: "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks (Lewis et al., 2020)", url: "https://arxiv.org/abs/2005.11401", note: "The baseline these strategies improve on." },
  ],
};
