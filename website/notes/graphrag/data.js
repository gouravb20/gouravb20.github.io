// Essential GraphRAG (Tomaž Bratanič & Oskar Hane, Manning 2025) - interactive notes data, part 1 (book info + chapters 1-4)
window.DATA = {
  book: {
    title: `Essential GraphRAG`,
    subtitle: `Chapter-wise interactive notes on Bratanič &amp; Hane's <em>Essential GraphRAG: Knowledge Graph-Enhanced RAG</em>. Every chapter has core concepts, hands-on labs (chunking, hybrid search, parent-document retrieval, text2cypher, agentic routing, entity resolution, community detection, RAGAS...), a cheatsheet, interview Q&amp;A and flashcards.`,
    storageKey: `graphrag_notes_v1`,
    appId: `graphrag-notes`,
    exportPrefix: `graphrag-progress`,
    pillarsTitle: `Four ideas that run through the whole book`,
    takeawaysTitle: `Twelve takeaways to remember`,
    labsIntro: `Each lab is a small, self-contained simulator of an idea from the chapter, built on the book's own examples (the Einstein patents paper, the Movies graph, the CUAD contract, The Odyssey). Vectors and LLM outputs are toy-sized and scripted, but the algorithms and trade-offs are the book's. Labs reset when you leave the tab.`
  },
  parts: {
    1: `Foundations`,
    2: `Better retrieval`,
    3: `Building graphs`,
    4: `Evaluation and reference`
  },
  fourQuestions: [
    { cls: `what`, q: `Ground the LLM`, text: `LLMs have a knowledge cutoff, go stale, hallucinate and never saw your private data. RAG puts the facts in the prompt at query time instead of baking them into the weights.`, answer: `Ch 1-2: retriever + generator, vector search, prompt templates.` },
    { cls: `where`, q: `Pick the right retriever`, text: `Vector search for fuzzy meaning, full-text for exact terms, Cypher for counting, filtering and aggregation. A router picks the right one per question.`, answer: `Ch 2-5: hybrid search, step-back, parent documents, text2cypher, agentic RAG.` },
    { cls: `when`, q: `Structure before you retrieve`, text: `Use LLMs to extract entities and relationships into a knowledge graph, resolve duplicates, and keep the source chunks linked so you get both precision and context.`, answer: `Ch 6-7: structured outputs, entity resolution, MS GraphRAG communities.` },
    { cls: `how`, q: `Measure every stage`, text: `Tool selection, retrieved context, and the generated answer can each fail. Benchmark them separately with context recall, faithfulness and answer correctness.`, answer: `Ch 8: benchmark design, Cypher ground truth, RAGAS.` }
  ],
  takeaways: [
    `LLM limitations that RAG targets: <strong>knowledge cutoff</strong>, <strong>outdated information</strong>, <strong>hallucinations</strong> (especially IDs, URLs, citations) and <strong>no access to private data</strong>.`,
    `Continuous finetuning to add facts is impractical: it is costly, and research is mixed on whether models reliably learn new facts that way. RAG supplies facts in the prompt instead.`,
    `A RAG app = <strong>retriever</strong> + <strong>generator</strong>. Because facts come from retrieval, the generator can be a smaller, cheaper model.`,
    `Use the <strong>same embedding model</strong> for documents and queries. Changing it (or its dimension) means re-embedding and recreating the vector index.`,
    `Chunking is a tuning knob with no universal answer. The book starts with 500-character chunks, 40-character overlap, splitting only at whitespace.`,
    `<strong>Hybrid search</strong>: run vector and full-text search, normalize each by its max score, UNION, deduplicate by max score, keep top k.`,
    `<strong>Step-back prompting</strong> rewrites a narrow question into a broader one so it matches more documents. <strong>Parent-document retrieval</strong> matches small child chunks but returns the full parent for context (fetch k×4 children, dedupe to k parents).`,
    `Vectors cannot count, filter, sort or aggregate. <strong>text2cypher</strong> generates a graph query; give the LLM the <strong>schema</strong>, <strong>terminology mapping</strong>, <strong>few-shot examples</strong> and <strong>format instructions</strong>.`,
    `<strong>Agentic RAG</strong> = retriever router + retriever agents + answer critic. Add specialized retrievers over time and keep text2cypher as the catch-all.`,
    `LLMs with <strong>Structured Outputs</strong> turn documents into schema-conforming JSON. Mark fields optional when they may be absent, or the model may hallucinate them. Then <strong>resolve entities</strong>.`,
    `<strong>MS GraphRAG</strong>: extract + summarize entities and relationships, detect communities (Louvain/Leiden), summarize communities. <strong>Global search</strong> map-reduces over community reports; <strong>local search</strong> starts from vector-matched entities and expands.`,
    `Evaluate tool selection, retrieval and generation. Use <strong>Cypher queries as ground truth</strong> so the benchmark survives data changes. RAGAS: context recall, faithfulness, answer correctness.`
  ],
  chapters: [
    // ------------------------------------------------------------------
    {
      id: `ch1`, part: 1, number: 1,
      title: `Improving LLM accuracy`,
      overview: `Why plain LLMs are not enough for accurate, current answers: the <strong>knowledge cutoff</strong>, <strong>outdated information</strong>, <strong>hallucinations</strong> and the <strong>lack of private information</strong>. Supervised finetuning is a poor way to add facts, so the book adopts <strong>retrieval-augmented generation</strong>. It then argues that <strong>knowledge graphs</strong> make the best RAG store because they hold structured and unstructured data together and can answer every kind of question.`,
      concepts: [
        { term: `Large language model (LLM)`, def: `A transformer-based model trained on huge amounts of text to predict the next token. It is excellent at understanding and generating language and following instructions.`, why: `RAG uses the LLM for its language skills, not as a source of facts.` },
        { term: `Knowledge cutoff`, def: `The most recent date covered by the model's training data. Anything after it is unknown to the model.`, why: `Questions about recent events need data supplied at query time.`, ex: `At the time of writing, ChatGPT knew about events up to October 2023 and gave a cutoff disclaimer for 2024 questions.`, demo: `ragToggle` },
        { term: `Outdated information`, def: `Facts that were true in the training data but have since changed.`, why: `The model answers confidently with the old fact, which is worse than saying "I don't know".`, ex: `ChatGPT described Mark Cuban as the Dallas Mavericks owner after he had sold his majority stake to the Adelson and Dumont families in late 2023.`, demo: `ragToggle` },
        { term: `Hallucination`, def: `Confident output that sounds plausible but is wrong or made up. LLMs predict likely continuations; they do not look facts up.`, why: `External identifiers (URLs, citations, WikiData IDs) are especially prone to it.`, ex: `Asked for the Dallas Mavericks' WikiData ID, ChatGPT returned Q152232, which is actually the movie "Womanlight". US lawyers also filed fake ChatGPT-generated case citations.`, demo: `ragToggle` },
        { term: `Lack of private information`, def: `Internal or proprietary data was never in the training set, regardless of the cutoff date.`, why: `Publishing private data so it ends up in training data is neither practical nor secure. Retrieval keeps the data under your control.`, demo: `ragToggle` },
        { term: `Other LLM limitations`, def: `Bias, lack of true understanding, vulnerability to prompt injection, and inconsistent answers across runs.`, why: `The book acknowledges them but focuses on factual accuracy and freshness.` },
        { term: `LLM training stages`, def: `As described by Andrej Karpathy: <strong>pretraining</strong> (trillions of tokens, thousands of GPUs, months), <strong>supervised finetuning</strong> (high-quality conversations), <strong>reward modeling</strong>, and <strong>reinforcement learning</strong>.`, why: `Pretraining is far too costly to repeat for every fact update, so finetuning was tried instead.` },
        { term: `Supervised finetuning for facts`, def: `Supply (prompt, desired output) pairs, such as "Which team won the NBA championship in 2023?" → "Denver Nuggets".`, why: `Some studies show improved factuality; others show LLMs struggle to learn new facts via finetuning. It is hard to make reliable in production.` },
        { term: `Retrieval-augmented generation (RAG)`, def: `Two stages: <strong>retrieval</strong> finds relevant information in an external knowledge base, and <strong>augmented generation</strong> combines it with the question in the prompt so the LLM answers from it.`, why: `It reduces (but does not fully eliminate) hallucinations and gives access to fresh and private data. The user only asks a question; retrieval happens behind the scenes.`, ex: `Prompt template: "Based on the provided context: {context}. Answer the following question: {question}".`, demo: `ragToggle` },
        { term: `Knowledge graph`, def: `A data structure that represents entities and concepts as <strong>nodes</strong> connected by <strong>relationships</strong>, both of which can carry properties.`, why: `It can store structured facts (who reports to whom, task status) and unstructured text (article content, embeddings) in one database, with explicit links between them.`, demo: `questionTypes` },
        { term: `Structured vs unstructured questions`, def: `Unstructured text handles open-ended and fuzzy questions. Structured data is needed for precise operations: <strong>filtering, counting, aggregating</strong>.`, why: `"How many tasks are completed within a company?" cannot be answered reliably by retrieving the top few text chunks.`, ex: `"Who is the CEO of OpenAI?" and "Which tasks have been completed?" are graph lookups; "What does the article say about the new model?" is a text lookup.`, demo: `questionTypes` }
      ],
      cheatsheet: [
        { title: `LLM limitations and how RAG helps`, type: `table`, headers: [`Limitation`, `Example from the book`, `Fix with RAG`], rows: [
          [`Knowledge cutoff`, `No knowledge of 2024 events`, `Retrieve recent documents or search results`],
          [`Outdated information`, `Mark Cuban still listed as Mavericks owner`, `Retrieve the current source of truth`],
          [`Hallucination`, `Fake WikiData ID Q152232`, `Answer only from retrieved context; cite it`],
          [`No private data`, `Company-internal questions`, `Retrieve from your own knowledge base`]
        ] },
        { title: `Finetuning vs RAG for facts`, type: `table`, headers: [`Aspect`, `Supervised finetuning`, `RAG`], rows: [
          [`Freshness`, `Needs retraining for every update`, `Update the knowledge base`],
          [`Reliability of new facts`, `Mixed research results`, `Facts are in the prompt`],
          [`Explainability`, `Facts hidden in weights`, `Retrieved sources can be shown`],
          [`Private data control`, `Data baked into the model`, `Data stays in your database`]
        ] },
        { title: `The RAG workflow`, type: `list`, items: [
          `The user asks a question.`,
          `The system turns it into a search query and retrieves relevant information (documents, articles, databases).`,
          `Retrieved context + question fill a prompt template.`,
          `The LLM generates an answer grounded in that context.`
        ] },
        { title: `Why knowledge graphs for RAG`, type: `list`, items: [
          `Store structured data (employees, tasks, hierarchies) and unstructured data (article text, embeddings) together.`,
          `Structured part answers exact questions: counting, filtering, aggregation, multi-hop.`,
          `Unstructured part adds nuance and context.`,
          `Explicit links between text and entities enable advanced retrieval (entity linking, adding source passages to structured results).`
        ] }
      ],
      interview: [
        { q: `What are the main limitations of LLMs that RAG addresses?`, a: `Knowledge cutoff (no data after training), outdated information (facts that changed), hallucinations (plausible but false output, especially identifiers and citations), and lack of private or domain-specific knowledge. RAG addresses all four by injecting relevant facts into the prompt at query time.`, diff: `easy` },
        { q: `Why not keep the model current by continuously finetuning it?`, a: `Pretraining is far too expensive to repeat, and supervised finetuning is an unreliable way to add facts: some studies show factuality gains, others show models struggle to learn new knowledge. It also requires an ongoing training pipeline and hides facts in weights. RAG is simpler: update the data store.`, diff: `med` },
        { q: `Why do LLMs hallucinate?`, a: `They are probabilistic language models trained to predict a plausible next token, not reasoning engines that look facts up. They generate the most likely continuation whether or not it is true, so outputs like IDs and citations that "look right" are often fabricated.`, diff: `easy` },
        { q: `Does RAG eliminate hallucinations?`, a: `No. It significantly reduces them by grounding the answer in retrieved context, but the model can still misread context or fill gaps, and the retriever can return wrong or incomplete context. You still need evaluation (faithfulness) and good retrieval.`, diff: `med` },
        { q: `Walk through how a RAG request works end to end.`, a: `The user asks a question. The system converts it into a search (e.g. embeds it), retrieves relevant documents from a knowledge base, fills a prompt template with the context and question, and sends it to the LLM, which generates an answer based on the provided documents. The user only supplies the question.`, diff: `easy` },
        { q: `What is a knowledge graph and why is it a good RAG store?`, a: `Nodes for entities/concepts and relationships between them, both with properties. It stores structured and unstructured information together, so it can answer precise questions (counts, filters, aggregations, multi-hop) and fuzzy ones (text similarity), and it links text passages to the entities they mention.`, diff: `med` },
        { q: `Give an example of a question that unstructured RAG handles poorly.`, a: `"How many tasks are completed within the company?" Top-k chunk retrieval only sees k chunks, so the LLM counts what it was shown, not the true total. A structured query (MATCH tasks WHERE status = 'Completed' RETURN count) gives the exact answer.`, diff: `med` },
        { q: `Name LLM limitations that are outside the book's scope.`, a: `Bias inherited from training data, lack of true understanding and context, vulnerability to prompt injection, and inconsistent responses across runs due to their probabilistic nature.`, diff: `easy` }
      ],
      labs: [`ragToggle`, `questionTypes`]
    },
    // ------------------------------------------------------------------
    {
      id: `ch2`, part: 1, number: 2,
      title: `Vector similarity search and hybrid search`,
      overview: `The two components of a RAG application, the <strong>retriever</strong> and the <strong>generator</strong>, and the data setup behind vector search: a text corpus (the paper "Einstein's Patents and Inventions"), a <strong>chunking</strong> function, an <strong>embedding model</strong> and a database with a <strong>vector index</strong> (Neo4j). The chapter then adds a <strong>full-text index</strong> and combines both into <strong>hybrid search</strong>, while noting that unstructured retrieval stays limited as data complexity grows.`,
      concepts: [
        { term: `Retriever`, def: `The component that finds relevant information and passes it to the generator. Most commonly it uses vector similarity search.`, why: `Answer quality is capped by what the retriever finds.` },
        { term: `Generator`, def: `Usually an LLM that writes the answer from the retrieved information.`, why: `Because the facts come from retrieval, the generator only needs language skills, so a smaller, faster, cheaper model can work.` },
        { term: `Embedding`, def: `A list of numbers (a vector) representing the meaning of a piece of data. Its length is the <strong>embedding dimension</strong>.`, why: `Similar texts get nearby vectors, enabling semantic search. Higher dimension can hold more information but costs more to compute and search.`, ex: `OpenAI's text-embedding-3-small outputs 1,536 dimensions; all-MiniLM-L12-v2 is a local CPU alternative.` },
        { term: `Same embedding model everywhere`, def: `Documents and queries must be embedded by the same model.`, why: `Changing the model (or its dimension) means repopulating and possibly recreating the vector index.` },
        { term: `Vector index & ANN`, def: `A data structure that stores vectors for fast similarity lookup. Searching with it is <strong>approximate nearest neighbor</strong> (ANN) search.`, why: `Much faster than brute force, at the cost of not always returning the exact nearest neighbors.` },
        { term: `Cosine similarity`, def: `The angle between two vectors: near 1 means the same meaning. The book prefers it over Euclidean distance, which also reflects intensity.`, why: `It is considered the best fit for text chatbots.` },
        { term: `Text chunking`, def: `Splitting text into smaller pieces before embedding. Narrower chunks give more specific embeddings and more relevant matches.`, why: `There is no universal answer for size, overlap or split strategy (sentences, paragraphs, semantic). Experiment for your data.`, ex: `The book uses a 500-character sliding window with 40 characters of overlap, splitting only at whitespace: 89 chunks for the Einstein paper.`, demo: `chunker` },
        { term: `Chunk overlap`, def: `Consecutive chunks share some text at their boundary.`, why: `Answers that straddle a boundary can still be found; the index gets a bit bigger.`, demo: `chunker` },
        { term: `Data setup vs query time`, def: `Setup: corpus → chunks → embeddings → database with vector index. Query time: embed the question with the same model → vector search → pass chunks to the LLM.`, why: `Setup is a batch pipeline; query time must be fast.` },
        { term: `Full-text search`, def: `Keyword search over an inverted index: a term must match a word in the data exactly (after analysis).`, why: `It catches exact names, codes and rare terms that embeddings blur.`, demo: `hybridSearch` },
        { term: `Hybrid search`, def: `Run vector search and full-text search, <strong>normalize</strong> each result list by dividing by its maximum score, UNION them, deduplicate each node by its max score, and return the top k.`, why: `Combines semantic matching with exact keyword matching. In the book, the top hit stays the same (score 1.0) but full-text brings in a better second result.`, demo: `hybridSearch` },
        { term: `Limits of unstructured retrieval`, def: `Even hybrid search struggles as data complexity grows: references in text are not captured and surrounding context may be missing.`, why: `This motivates the advanced strategies and knowledge graphs in later chapters.` }
      ],
      cheatsheet: [
        { title: `Neo4j vector and full-text setup`, type: `code`, body: `// vector index on Chunk.embedding (cosine)
CREATE VECTOR INDEX pdf IF NOT EXISTS
FOR (c:Chunk) ON c.embedding

// store chunks + embeddings
WITH $chunks AS chunks, range(0, size($chunks)) AS index
UNWIND index AS i
WITH i, chunks[i] AS chunk, $embeddings[i] AS embedding
MERGE (c:Chunk {index: i})
SET c.text = chunk, c.embedding = embedding

// vector search, top 2
CALL db.index.vector.queryNodes('pdf', 2, $question_embedding)
YIELD node AS hits, score
RETURN hits.text AS text, score, hits.index AS index

// full-text index
CREATE FULLTEXT INDEX PdfChunkFulltext FOR (c:Chunk) ON EACH [c.text]` },
        { title: `Hybrid search query (max-normalize, UNION, dedupe)`, type: `code`, body: `CALL {
  CALL db.index.vector.queryNodes('pdf', $k, $question_embedding)
  YIELD node, score
  WITH collect({node:node, score:score}) AS nodes, max(score) AS max
  UNWIND nodes AS n
  RETURN n.node AS node, (n.score / max) AS score
  UNION
  CALL db.index.fulltext.queryNodes('ftPdfChunk', $question, {limit: $k})
  YIELD node, score
  WITH collect({node:node, score:score}) AS nodes, max(score) AS max
  UNWIND nodes AS n
  RETURN n.node AS node, (n.score / max) AS score
}
WITH node, max(score) AS score ORDER BY score DESC LIMIT $k
RETURN node, score` },
        { title: `Pipeline pieces`, type: `table`, headers: [`Piece`, `Book's choice`, `Watch out for`], rows: [
          [`Corpus`, `"Einstein's Patents and Inventions" (Chaudhuri, 2017)`, `Ask specific questions to see RAG beat the LLM's own knowledge`],
          [`Chunker`, `500 chars, 40 overlap, whitespace only → 89 chunks`, `Size/overlap depend on data and use case`],
          [`Embedding model`, `text-embedding-3-small, 1,536 dims`, `Same model for docs and queries`],
          [`Store`, `Neo4j :Chunk {index, text, embedding} + vector index`, `Index dimensions fixed at creation`],
          [`Generator`, `GPT-4 with "only use the provided documents"`, `Instruct it to stay within the context`]
        ] },
        { title: `Generation prompt`, type: `code`, body: `system: You're an Einstein expert, but can only use the provided
        documents to respond to the questions.
user:   Use the following documents to answer the question that will follow:
        {documents}
        ---
        The question to answer using information only from the above documents:
        {question}` }
      ],
      interview: [
        { q: `What are the two components of a RAG application?`, a: `The retriever, which finds relevant information (commonly with vector similarity search), and the generator, usually an LLM, which writes the answer from that information. Since the generator does not need to know the facts, it can be a smaller model.`, diff: `easy` },
        { q: `Why must documents and queries use the same embedding model?`, a: `Vectors from different models live in different spaces, so similarities are meaningless across them. If you switch models you must re-embed all documents and, if the dimension changes, recreate the vector index.`, diff: `easy` },
        { q: `What does a vector index trade off?`, a: `Speed for exactness. It performs approximate nearest neighbor search: much faster than brute-force comparison against every vector, but it may miss some true nearest neighbors.`, diff: `med` },
        { q: `How do you choose chunk size and overlap?`, a: `There is no universal answer; it depends on data, domain and question types. Smaller chunks give narrower, more specific embeddings; overlap keeps boundary-spanning answers findable at the cost of a bigger index. Split on whitespace or structure so words are not broken, then evaluate a few settings.`, diff: `med` },
        { q: `Why add full-text search to vector search?`, a: `Vector search matches meaning but can miss exact terms such as names, codes and rare words. Full-text search requires exact keyword matches. Combining them (hybrid search) retrieves results that either method alone would rank poorly.`, diff: `easy` },
        { q: `How does the book combine vector and full-text scores?`, a: `The scores are on different scales, so each result list is normalized by dividing by its own maximum score (top hit = 1.0). The two lists are UNIONed, each node keeps its max normalized score, and the top k are returned.`, diff: `med` },
        { q: `What is a weakness of max-normalization?`, a: `The top hit of each list always gets 1.0 even if it is a poor match, so a weak full-text hit can tie a strong vector hit. Alternatives include reciprocal rank fusion, score calibration, or a reranker.`, diff: `hard` },
        { q: `Why is hybrid search still not enough for complex data?`, a: `It still retrieves isolated unstructured chunks: cross-references in text are lost, context around a chunk may be missing, and it cannot do counting, filtering or aggregation. That motivates advanced retrieval strategies and knowledge graphs.`, diff: `med` }
      ],
      labs: [`chunker`, `hybridSearch`]
    },
    // ------------------------------------------------------------------
    {
      id: `ch3`, part: 2, number: 3,
      title: `Advanced vector retrieval strategies`,
      overview: `Basic vector search can miss relevant documents because the query and the document are phrased differently. Two families of fixes: <strong>query rewriting</strong> (hypothetical document retriever, <strong>step-back prompting</strong>) and <strong>changing what you embed</strong> (hypothetical questions, <strong>parent document retriever</strong>). The chapter implements step-back prompting plus a parent document retriever over the Einstein paper in Neo4j.`,
      concepts: [
        { term: `Query rewriting`, def: `Reformulating the user's query so it better matches the language and context of the target documents.`, why: `Embeddings of a question may not sit close to the embeddings of the documents that answer it.`, demo: `stepBack` },
        { term: `Step-back prompting`, def: `An LLM rewrites a specific question into a broader, more generic "step-back" question, which is used for retrieval (Zheng et al., 2023). The original question is still used for the final answer.`, why: `Broader queries match a wider range of relevant documents without getting bogged down in specifics.`, ex: `"Which team did Thierry Audel play for from 2007 to 2008?" → "What is the career history of Thierry Audel?"`, demo: `stepBack` },
        { term: `Zero-shot vs few-shot prompting`, def: `Zero-shot gives only instructions. Few-shot adds a small number of examples (typically two to five) of the desired behavior.`, why: `The step-back prompt includes examples like "Could the members of The Police perform lawful arrests?" → "what can the members of The Police do?" to make outputs consistent.` },
        { term: `Hypothetical document retriever (HyDE)`, def: `Generate a hypothetical answer document for the query and embed that instead of the question (Gao et al., 2022).`, why: `An answer-shaped text lies closer to real answer documents in embedding space.` },
        { term: `Hypothetical question embedding`, def: `For each document, generate (or collect from chat history) the questions it can answer and embed those questions instead of the document. Linked via HAS_QUESTION.`, why: `User questions are matched question-to-question, which tends to align better.` },
        { term: `Parent document retriever`, def: `Split documents into parents, split parents into small child chunks, embed only the children, match the query against children, but return the <strong>parent</strong>.`, why: `Embedding a long document blurs distinct ideas through averaging. Small children match precisely; parents give the LLM full context.`, demo: `parentDoc` },
        { term: `Structure-first splitting`, def: `Start by splitting on structural elements (sections, paragraphs), then size-limit.`, why: `Sections encapsulate complete ideas. The Einstein paper split into 9 sections by a title regex; one had over 4,000 tokens, so parents were capped at 2,000 characters.` },
        { term: `k × 4 over-fetch`, def: `Retrieve k × 4 child chunks, traverse to their parents, deduplicate parents keeping the max score, then limit to k.`, why: `Several top children often belong to the same parent; the buffer helps guarantee k unique parents.`, demo: `parentDoc` },
        { term: `Other retrieval improvements`, def: `Finetuning the embedding model, reranking, metadata-based filtering, and hybrid retrieval.`, why: `Finetuning the embedder means recomputing all embeddings. Reranking reorders an initial candidate set with a stronger model. Metadata filters narrow candidates before semantic matching.` },
        { term: `Token counting`, def: `Measure section sizes in tokens (tiktoken) before deciding further splits.`, why: `Very long sections can blow token limits; very short ones (20 tokens or fewer) may carry no useful information and can be dropped.` }
      ],
      cheatsheet: [
        { title: `Parent document graph + retrieval`, type: `code`, body: `// import: PDF -> Parent (<= 2,000 chars) -> Child (500 chars, embedded)
MERGE (pdf:PDF {id:$pdf_id})
MERGE (p:Parent {id:$pdf_id + '-' + $id})
SET p.text = $parent
MERGE (pdf)-[:HAS_PARENT]->(p)
WITH p, $children AS children, $embeddings AS embeddings
UNWIND range(0, size(children) - 1) AS child_index
MERGE (c:Child {id: $pdf_id + '-' + $id + '-' + toString(child_index)})
SET c.text = children[child_index], c.embedding = embeddings[child_index]
MERGE (p)-[:HAS_CHILD]->(c);

// retrieval: over-fetch children, dedupe parents
CALL db.index.vector.queryNodes($index_name, $k * 4, $question_embedding)
YIELD node, score
MATCH (node)<-[:HAS_CHILD]-(parent)
WITH parent, max(score) AS score
RETURN parent.text AS text, score
ORDER BY score DESC
LIMIT toInteger($k)` },
        { title: `Strategies at a glance`, type: `table`, headers: [`Strategy`, `What gets embedded / searched`, `What is returned`], rows: [
          [`Basic`, `The chunk`, `The same chunk`],
          [`Step-back prompting`, `A broader rewrite of the question`, `Chunks; the original question is used to answer`],
          [`HyDE`, `A hypothetical answer document`, `Real documents near it`],
          [`Hypothetical questions`, `Questions each document can answer`, `The document behind the matched question`],
          [`Parent document`, `Small child chunks`, `The full parent document`]
        ] },
        { title: `Complete pipeline`, type: `code`, body: `def rag_pipeline(question: str) -> str:
    stepback_prompt = generate_stepback(question)
    documents = parent_retrieval(stepback_prompt)   # search with the rewrite
    answer = generate_answer(question, documents)   # answer the original
    return answer` },
        { title: `Practical notes`, type: `list`, items: [
          `Split on structure first (sections, paragraphs), then cap size.`,
          `Check token counts; drop fragments of 20 tokens or fewer.`,
          `Step-back adds an LLM call (latency, cost) per query: measure whether it helps.`,
          `Use few-shot examples in rewrite prompts for consistent outputs.`
        ] }
      ],
      interview: [
        { q: `What problem does query rewriting solve?`, a: `A mismatch between how users phrase questions and how documents phrase answers, so the query embedding lands far from the relevant documents. Rewriting reformulates the query to align with the documents' language and context, improving recall.`, diff: `easy` },
        { q: `Explain step-back prompting with an example.`, a: `An LLM turns a specific question into a more generic one for retrieval: "Which team did Thierry Audel play for from 2007 to 2008?" becomes "What is the career history of Thierry Audel?". The broader query matches more relevant documents; the original question is then answered from them.`, diff: `easy` },
        { q: `Why does the parent document retriever embed children but return parents?`, a: `Embedding a long document averages many ideas into one vector, so specific queries match poorly. Small children give precise matches. But a small chunk lacks context, so returning the parent gives the LLM the full surrounding text.`, diff: `med` },
        { q: `Why retrieve k × 4 children in the parent retriever?`, a: `Several top child matches often share a parent. After deduplicating parents, fetching only k children could leave fewer than k unique parents. The over-fetch buffer helps guarantee k unique parents before the final LIMIT k.`, diff: `med` },
        { q: `Compare HyDE and hypothetical question embedding.`, a: `HyDE works at query time: the LLM writes a hypothetical answer, which is embedded and matched against documents. Hypothetical question embedding works at indexing time: for each document you generate questions it answers and embed those, so user questions are matched question-to-question.`, diff: `hard` },
        { q: `What are the costs of these advanced strategies?`, a: `Step-back and HyDE add an LLM call per query (latency, cost, possible drift from intent). Hypothetical questions add LLM calls at indexing time and more vectors. Parent retrieval returns longer context (more prompt tokens). Measure the gain with evals before adopting.`, diff: `med` },
        { q: `How would you split a long PDF for parent document retrieval?`, a: `Split by structural elements first (the book used a regex on numbered section titles, giving 9 sections), count tokens, cap parents (2,000 characters), split each parent into children (500 characters, small overlap), embed children, and link PDF → Parent → Child in the graph.`, diff: `med` },
        { q: `Name other ways to improve retrieval accuracy.`, a: `Finetuning the embedding model on domain data (then re-embed everything), reranking an initial candidate set, metadata filtering (date, author, source) before semantic matching, and hybrid keyword + dense retrieval.`, diff: `easy` }
      ],
      labs: [`stepBack`, `parentDoc`]
    },
    // ------------------------------------------------------------------
    {
      id: `ch4`, part: 2, number: 4,
      title: `Generating Cypher queries from natural language questions`,
      overview: `Vector search cannot answer "List the top three highest-rated movies directed by Steven Spielberg and their average score". That needs a database query. <strong>text2cypher</strong> asks an LLM to write Cypher from the question. The chapter covers where it fits in the RAG pipeline (aggregations, specific lookups, catch-all retriever), the prompt practices that make it work (<strong>few-shot examples</strong>, <strong>schema</strong>, <strong>terminology mapping</strong>, <strong>format instructions</strong>), a base-model implementation, and Neo4j's finetuned text2cypher models.`,
      concepts: [
        { term: `Query language generation`, def: `Converting a natural-language question into a query (here Cypher) that can be executed against a database.`, why: `Most LLMs know Cypher syntax; the challenge is generating a query that is correct for <em>your</em> schema and question.`, demo: `text2cypher` },
        { term: `Where text2cypher fits`, def: `Use it when you need aggregation, filtering, sorting or specific facts rather than the most similar text. It also serves as a catch-all retriever when no specialized retriever fits.`, why: `Similarity search cannot compute averages or rankings over structured data.`, ex: `MATCH (:Reviewer)-[r:REVIEWED]->(m:Movie)&lt;-[:DIRECTED]-(:Director {name:'Steven Spielberg'}) RETURN m.title, AVG(r.score) AS avg_rating ORDER BY avg_rating DESC LIMIT 3` },
        { term: `Workflow`, def: `Get the question → get the graph schema → add terminology, format instructions and few-shot examples → build the prompt → the LLM generates Cypher → execute it.`, why: `Each piece removes a class of errors.` },
        { term: `Few-shot examples`, def: `Question → Cypher pairs specific to your graph, included in the prompt.`, why: `They fix recurring mistakes and teach patterns. If the LLM reads m.country but country is a node, add an example using -[:PRODUCED_IN]->(c:Country).`, demo: `text2cypher` },
        { term: `Schema in the prompt`, def: `Node labels and properties, relationship types and properties, and which labels each relationship connects, plus "use only the provided relationship types and properties".`, why: `Without it the LLM guesses labels and properties. Neo4j's research found the exact schema format matters little.`, demo: `text2cypher` },
        { term: `Schema inference with APOC`, def: `apoc.meta.data() returns node properties, relationship properties and relationship patterns, which are formatted into the schema string.`, why: `Inferring from a large database can be expensive, so it is common to sample.` },
        { term: `Terminology mapping`, def: `Graph-specific instructions mapping user words to schema elements.`, why: `"Persons: when a user asks about a person by trade like actor, writer, director, producer, or reviewer, they are referring to a node with the label Person."`, demo: `text2cypher` },
        { term: `Format instructions`, def: `Tell the LLM to output only the Cypher statement: no explanations, apologies or code blocks.`, why: `Different LLMs wrap output differently; a consistent format can be executed directly.`, demo: `text2cypher` },
        { term: `Semantic schema naming`, def: `Labels and relationship types as nouns and verbs; properties as adjectives and nouns.`, why: `LLMs make more mistakes when schema elements are not semantically named.` },
        { term: `Finetuned text2cypher models`, def: `Neo4j publishes a text2cypher training dataset and finetuned open models (Gemma 2, Llama 3.1) on Hugging Face.`, why: `They lag the largest frontier models but are much more efficient, useful where big models are too slow.` },
        { term: `Iterative improvement`, def: `As you find question types it fails on, add few-shot examples and terminology mappings.`, why: `Quality improves over time; the prompt is a living artifact.` }
      ],
      cheatsheet: [
        { title: `text2cypher prompt template`, type: `code`, body: `Instructions:
Generate Cypher statement to query a graph database to get the data to answer
the following user question.

Graph database schema:
Use only the provided relationship types and properties in the schema.
Do not use any other relationship types or properties that are not provided in the schema.
{schema}

Terminology mapping:
This section is helpful to map terminology between the user question and the
graph database schema.
{terminology}

Examples:
The following examples provide useful patterns for querying the graph database.
{examples}

Format instructions:
Do not include any explanations or apologies in your responses.
Do not respond to any questions that might ask anything else than for you to
construct a Cypher statement.
Do not include any text except the generated Cypher statement.
ONLY RESPOND WITH CYPHER - NO CODE BLOCKS.

User question: {question}` },
        { title: `Movies graph schema (as given to the LLM)`, type: `code`, body: `Node properties:
Movie {tagline: STRING, title: STRING, released: INTEGER}
Person {born: INTEGER, name: STRING}
Relationship properties:
ACTED_IN {roles: LIST}
REVIEWED {summary: STRING, rating: INTEGER}
The relationships:
(:Person)-[:ACTED_IN]->(:Movie)
(:Person)-[:DIRECTED]->(:Movie)
(:Person)-[:PRODUCED]->(:Movie)
(:Person)-[:WROTE]->(:Movie)
(:Person)-[:FOLLOWS]->(:Person)
(:Person)-[:REVIEWED]->(:Movie)` },
        { title: `Prompt ingredients and the errors they prevent`, type: `table`, headers: [`Ingredient`, `Prevents`], rows: [
          [`Schema`, `Invented labels, properties and relationship types`],
          [`Terminology mapping`, `Using :Director / :Actor labels when the graph only has :Person`],
          [`Few-shot examples`, `Repeated pattern mistakes (property vs traversal, wrong aggregation)`],
          [`Format instructions`, `Prose or code fences around the query that break execution`]
        ] },
        { title: `Example generated query`, type: `code`, body: `// "Who directed the most movies?"
MATCH (p:Person)-[:DIRECTED]->(m:Movie)
RETURN p.name, COUNT(m) AS movieCount
ORDER BY movieCount DESC LIMIT 1` }
      ],
      interview: [
        { q: `When should a RAG system generate a database query instead of using vector search?`, a: `When the question needs aggregation, filtering, sorting or exact facts from structured data, e.g. "top three highest-rated Spielberg movies with average score". Vector search returns similar text; it cannot compute averages or rankings. text2cypher also works as a catch-all when no specialized retriever fits.`, diff: `easy` },
        { q: `What four practices improve text2cypher accuracy?`, a: `Include the graph schema (labels, properties, relationship patterns), terminology mappings from user language to schema elements, few-shot question → Cypher examples for your graph, and format instructions so the model outputs only Cypher.`, diff: `easy` },
        { q: `Why do few-shot examples work well for text2cypher, and what is their downside?`, a: `They show the model concrete patterns for your schema and fix recurring errors (e.g. reading a property when a traversal is needed). Downsides: they are graph-specific and hand-made, add prompt tokens, and too many can bias the model toward copying patterns.`, diff: `med` },
        { q: `How do you get the schema into the prompt for Neo4j?`, a: `Run apoc.meta.data() queries to collect node properties, relationship properties and (start)-[type]->(end) patterns, store them in a structured dict, and format them into a string. On large graphs, sample to keep inference cheap; consider exposing only the relevant part of the schema.`, diff: `med` },
        { q: `What is the risk of executing LLM-generated Cypher, and how do you mitigate it?`, a: `The query can be wrong (silently returning wrong data), slow, or even destructive (write clauses). Mitigate with read-only database users or transactions, validating/parsing the query (e.g. EXPLAIN), timeouts and row limits, and evaluation on a benchmark of known questions.`, diff: `hard` },
        { q: `Base model with prompt vs finetuned text2cypher model?`, a: `Large base models with good prompts are most accurate today. Neo4j's finetuned open models (Gemma 2, Llama 3.1) are behind them but faster and cheaper, suited to latency-sensitive production; the same prompt practices still improve them.`, diff: `med` },
        { q: `Why does semantic naming of the schema matter?`, a: `The LLM maps question words to schema elements by meaning. Labels as nouns, relationship types as verbs and properties as adjectives/nouns make that mapping natural; cryptic names cause wrong guesses.`, diff: `easy` }
      ],
      labs: [`text2cypher`]
    }
  ]
};
