// Deep dive: Chapter 2, Vector similarity search and hybrid search. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch2 = {
  hook: `<p>You load a paper about Einstein's patents into a RAG prototype and ask, "What did Einstein invent with Szilard?" Vector search comes back with three passages about Einstein's early job at the Swiss patent office. They are about Einstein and about patents, so their embeddings sit close to the question. The one passage that names Leo Szilard and their refrigerator design ranks fourth and never reaches the model.</p>
<p>Then you try a keyword engine on the same question. It finds the Szilard passage instantly, but it misses a different question entirely: "How did Einstein try to make home cooling safer?" never mentions the word "refrigerator", so no keyword matches. Each method fails where the other succeeds. This chapter builds the standard retrieval stack piece by piece, chunking, embeddings, a vector index, a full-text index, and then combines the last two into <strong>hybrid search</strong>.</p>`,
  sections: [
    {
      id: "retriever-and-generator",
      title: "Two components and two pipelines",
      kicker: "The shape of a RAG app",
      blocks: [
        {
          type: "text",
          html: `<p>Every RAG application has two components. The <strong>retriever</strong> finds information relevant to the question. The <strong>generator</strong>, almost always an LLM, writes the answer from what the retriever found. The split matters for two reasons.</p>
<p>First, answer quality is capped by retrieval. If the right passage is not retrieved, no amount of model quality can recover it. Second, because the facts arrive in the prompt, the generator only needs to read and write well. That often means a smaller, faster and cheaper model is good enough.</p>
<p>Behind those two components sit two pipelines that run at very different times. The <strong>data setup</strong> pipeline is a batch job: split documents into chunks, embed each chunk, and store chunks and vectors in a database with an index. The <strong>query-time</strong> pipeline runs on every question and must be fast: embed the question with the same model, search the index, and hand the top chunks to the LLM.</p>`,
        },
        {
          type: "diagram",
          title: "Data setup runs once; query time runs per question",
          caption: "The top row runs in batch when documents change. The bottom row runs on every question. Both rows must use the same embedding model, and query time searches the index the top row built.",
          svg: `<svg viewBox="0 0 640 220" role="img" aria-label="Data setup pipeline from corpus to Neo4j and query pipeline from question to LLM, sharing the same embedding model">
<defs><marker id="gr2-arr-pipe" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" style="fill: var(--dg-muted)"/></marker></defs>
<text x="20" y="28" font-size="13" font-weight="700">Data setup (batch)</text>
<rect x="20" y="40" width="120" height="50" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="80" y="70" text-anchor="middle" font-size="13">Corpus</text>
<rect x="176" y="40" width="120" height="50" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="236" y="70" text-anchor="middle" font-size="13">Chunker</text>
<rect x="332" y="40" width="120" height="50" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="392" y="70" text-anchor="middle" font-size="13">Embedding model</text>
<rect x="488" y="40" width="120" height="50" rx="8" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="2"/>
<text x="548" y="62" text-anchor="middle" font-size="13">Neo4j</text>
<text x="548" y="79" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">+ vector index</text>
<line x1="140" y1="65" x2="174" y2="65" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#gr2-arr-pipe)"/>
<line x1="296" y1="65" x2="330" y2="65" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#gr2-arr-pipe)"/>
<line x1="452" y1="65" x2="486" y2="65" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#gr2-arr-pipe)"/>
<text x="20" y="148" font-size="13" font-weight="700">Query time (fast)</text>
<rect x="20" y="160" width="120" height="50" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="80" y="190" text-anchor="middle" font-size="13">Question</text>
<rect x="176" y="160" width="120" height="50" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="236" y="190" text-anchor="middle" font-size="13">Embedding model</text>
<rect x="332" y="160" width="120" height="50" rx="8" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="2"/>
<text x="392" y="190" text-anchor="middle" font-size="13">Vector search</text>
<rect x="488" y="160" width="120" height="50" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="548" y="182" text-anchor="middle" font-size="13">LLM</text>
<text x="548" y="199" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">top-k chunks in</text>
<line x1="140" y1="185" x2="174" y2="185" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#gr2-arr-pipe)"/>
<line x1="296" y1="185" x2="330" y2="185" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#gr2-arr-pipe)"/>
<line x1="452" y1="185" x2="486" y2="185" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#gr2-arr-pipe)"/>
<path d="M392 92 V114 H236 V158" fill="none" stroke-width="2" stroke-dasharray="5 4" style="stroke: var(--dg-1)"/>
<text x="300" y="108" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">same model</text>
<path d="M548 92 V132 H420 V158" fill="none" stroke-width="2" stroke-dasharray="5 4" style="stroke: var(--dg-4)" marker-end="url(#gr2-arr-pipe)"/>
<text x="484" y="126" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">searches index</text>
</svg>`,
        },
        {
          type: "keypoints",
          items: [
            "Retriever finds, generator writes. Retrieval quality is the ceiling on answer quality.",
            "Setup is a batch job you can afford to make slow and careful. Query time must be fast.",
            "The question must be embedded with the same model that embedded the documents.",
          ],
        },
      ],
    },
    {
      id: "embeddings",
      title: "Embeddings: meaning as geometry",
      kicker: "How similarity works",
      blocks: [
        {
          type: "idea",
          html: `<p>An <strong>embedding</strong> is a list of numbers that represents what a piece of text means. An embedding model is trained so that texts with similar meaning get vectors pointing in similar directions. "Find relevant text" then becomes "find nearby vectors", which a computer can do quickly.</p>`,
        },
        {
          type: "text",
          html: `<p>The length of the vector is its <strong>dimension</strong>. OpenAI's <code>text-embedding-3-small</code>, which the book uses, returns 1,536 numbers per text. Open-source models such as <code>all-MiniLM-L12-v2</code> return 384 and run comfortably on a laptop CPU. More dimensions can hold more nuance, but every vector costs more to store and compare.</p>
<p>To compare two vectors the book uses <strong>cosine similarity</strong>: the cosine of the angle between them. Pointing the same way gives 1, perpendicular gives 0. Cosine ignores vector length and only looks at direction, which suits text: a long passage and a short question about the same topic should still match. Euclidean distance, in contrast, is affected by length as well as direction.</p>`,
        },
        {
          type: "diagram",
          title: "Cosine similarity compares directions",
          caption: "A toy two-dimensional picture. Real embeddings have hundreds or thousands of dimensions, but the rule is the same: a small angle means similar meaning.",
          svg: `<svg viewBox="0 0 640 320" role="img" aria-label="Three vectors from one origin: the query and the fridge chunk point in nearly the same direction, the football chunk points far away">
<defs><marker id="gr2-arr-vec" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" style="fill: var(--dg-muted)"/></marker></defs>
<line x1="60" y1="170" x2="222" y2="52" stroke-width="3" style="stroke: var(--dg-1)" marker-end="url(#gr2-arr-vec)"/>
<line x1="60" y1="170" x2="240" y2="82" stroke-width="3" style="stroke: var(--dg-ok)" marker-end="url(#gr2-arr-vec)"/>
<line x1="60" y1="170" x2="209" y2="304" stroke-width="3" style="stroke: var(--dg-bad)" marker-end="url(#gr2-arr-vec)"/>
<circle cx="60" cy="170" r="4" style="fill: var(--dg-ink)"/>
<path d="M92.4 146.5 A40 40 0 0 1 89.7 196.8" fill="none" stroke-width="1.5" style="stroke: var(--dg-muted)"/>
<text x="106" y="178" font-size="12" style="fill: var(--dg-muted)">78°</text>
<text x="230" y="48" font-size="13" font-weight="700">query</text>
<text x="248" y="88" font-size="13" font-weight="700">fridge chunk</text>
<text x="217" y="312" font-size="13" font-weight="700">football chunk</text>
<rect x="380" y="90" width="240" height="140" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="396" y="118" font-size="13" font-weight="700">Angle to the query</text>
<text x="396" y="146" font-size="12">fridge chunk: 10°</text>
<text x="396" y="164" font-size="12" style="fill: var(--dg-muted)">cosine ≈ 0.98, very similar</text>
<text x="396" y="192" font-size="12">football chunk: 78°</text>
<text x="396" y="210" font-size="12" style="fill: var(--dg-muted)">cosine ≈ 0.21, unrelated</text>
</svg>`,
        },
        {
          type: "code",
          lang: "python",
          title: "Cosine similarity in a few lines",
          code: `import math

def cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    return dot / (math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b)))

cosine([3, 1], [6, 2])   # 1.0  same direction, different length
cosine([1, 0], [0, 1])   # 0.0  perpendicular`,
          caption: "The first pair shows why cosine suits text: doubling the length (a longer passage) does not change the score.",
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p><strong>Use one embedding model everywhere.</strong> Vectors from different models live in unrelated spaces, so comparing them produces meaningless scores, and nothing will warn you. If you switch models, re-embed every document; if the dimension changes, recreate the vector index too, because its dimension is fixed when it is created.</p>`,
        },
        {
          type: "quiz",
          q: "You upgrade your app to a newer embedding model for queries but leave the stored document embeddings as they were. Both models output 1,536 dimensions. What happens?",
          options: [
            "Everything works, since the dimensions match",
            "Queries fail with a dimension error",
            "Searches run without errors but return poor, essentially arbitrary matches",
            "The vector index re-embeds documents automatically",
          ],
          answer: 2,
          explain: "Matching dimensions only means the arithmetic runs. The two models map meaning to different directions, so similarity between a new-model query and old-model documents is not meaningful. It is a silent failure, which is why model changes must trigger a full re-embedding.",
        },
      ],
    },
    {
      id: "chunking",
      title: "Chunking: deciding what one search hit is",
      kicker: "Data setup",
      blocks: [
        {
          type: "problem",
          html: `<p>Embed a whole 30-page paper as one vector and it becomes an average of everything in it: patents, biography, physics. A precise question matches that blur poorly. And even if it matched, you could not fit the whole paper in the prompt alongside other results.</p>`,
        },
        {
          type: "text",
          html: `<p>So documents are split into <strong>chunks</strong> before embedding. Narrower chunks produce more specific vectors, which match specific questions better. Chunks that are too small, though, lose context: a sentence like "It was patented in 1930" means little without the sentence before it.</p>
<p>The book uses a simple, transparent method: a sliding window of 500 characters with 40 characters of overlap, adjusted so it only cuts at whitespace. On the Einstein paper that produces 89 chunks. The <strong>overlap</strong> means a fact that straddles a boundary still appears whole in at least one chunk, at the cost of a slightly bigger index.</p>`,
        },
        {
          type: "code",
          lang: "python",
          title: "A whitespace-aware sliding window",
          code: `def chunk_text(text: str, size: int = 500, overlap: int = 40) -> list[str]:
    chunks, start = [], 0
    while start < len(text):
        end = min(start + size, len(text))
        if end < len(text):                      # extend to the next space: never cut a word
            space = text.find(" ", end)
            end = space if space != -1 else len(text)
        chunks.append(text[start:end].strip())
        if end >= len(text):
            break
        back = text.rfind(" ", end - overlap, end)   # restart at a space inside the overlap
        start = back + 1 if back > start else end
    return chunks`,
        },
        {
          type: "lab",
          id: "chunker",
          caption: "Change the chunk size, overlap and split strategy on a passage from the Einstein paper. Pick a question and check whether its answer survives intact in at least one chunk.",
        },
        {
          type: "table",
          title: "Common splitting strategies",
          headers: ["Strategy", "How it splits", "Good for", "Watch out for"],
          rows: [
            ["Fixed window", "Every N characters or tokens, with overlap", "Uniform text, quick baselines", "Cuts mid-thought"],
            ["Sentence / paragraph", "On sentence or blank-line boundaries, then packs to a size limit", "Prose, articles", "Very uneven chunk sizes"],
            ["Structure-first", "On headings or sections, then caps size", "Papers, manuals, contracts", "Needs reliable structure markers"],
            ["Semantic", "Where embedding similarity between neighboring sentences drops", "Mixed-topic documents", "Extra embedding cost at setup"],
          ],
        },
        {
          type: "realworld",
          items: [
            { org: "LangChain", title: "RecursiveCharacterTextSplitter", html: "Tries a list of separators in order (paragraphs, then lines, then spaces) and only falls back to finer cuts when a piece is still too big. It is a common default for prose." },
            { org: "LlamaIndex", title: "SentenceSplitter", html: "Packs whole sentences into chunks up to a size limit with configurable overlap, so chunks rarely end mid-sentence." },
          ],
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>There is no universal best chunk size. It depends on the documents and on the questions users ask. Pick two or three settings, build a small set of real questions with known answers, and measure which setting retrieves the right passage most often (chapter 8 shows how).</p>`,
        },
      ],
    },
    {
      id: "vector-index",
      title: "Vector indexes: fast, approximate nearest neighbors",
      kicker: "Search at scale",
      blocks: [
        {
          type: "text",
          html: `<p>With 89 chunks you could compare the question against every vector and sort. With ten million, that brute-force scan becomes too slow for interactive use. A <strong>vector index</strong> organizes vectors so a search touches only a small fraction of them. The price is that results are <strong>approximate nearest neighbors</strong> (ANN): usually the true top matches, occasionally missing one.</p>
<p>Neo4j's vector index is built on HNSW (hierarchical navigable small world graphs), the same family of index used by many vector databases. Conceptually, it links each vector to a few near neighbors in layered graphs and searches by greedily hopping toward the query.</p>`,
        },
        {
          type: "code",
          lang: "cypher",
          title: "Create the index, store chunks, search",
          code: `CREATE VECTOR INDEX chunk_embeddings IF NOT EXISTS
FOR (c:Chunk) ON c.embedding
OPTIONS {indexConfig: {
  \`vector.dimensions\`: 1536,
  \`vector.similarity_function\`: 'cosine'
}};

// one node per chunk; run with $rows = [{index, text, embedding}, ...]
UNWIND $rows AS row
MERGE (c:Chunk {index: row.index})
SET c.text = row.text, c.embedding = row.embedding;

// top 3 chunks for a question embedded with the same model
CALL db.index.vector.queryNodes('chunk_embeddings', 3, $question_embedding)
YIELD node, score
RETURN node.index AS chunk, score, node.text AS text;`,
        },
        {
          type: "tradeoffs",
          prosLabel: "Approximate index",
          consLabel: "What you give up",
          pros: [
            "Sub-linear search time, so it stays fast as the corpus grows",
            "Lives next to the rest of your data, so you can filter and traverse from the hits",
            "Tunable: index parameters trade recall against speed and memory",
          ],
          cons: [
            "May miss a true nearest neighbor; recall is high but not 100%",
            "Index build and memory cost grow with vector count and dimension",
            "Dimension and similarity function are fixed when the index is created",
          ],
        },
        {
          type: "text",
          html: `<p>Once the chunks are retrieved, the generator gets a strict prompt. The book's version gives the model a persona ("an Einstein expert") but forbids it from using anything except the provided documents. That instruction is what lets you trust that an answer came from your data.</p>`,
        },
      ],
    },
    {
      id: "hybrid-search",
      title: "Hybrid search: putting keywords back",
      kicker: "Combining retrievers",
      blocks: [
        {
          type: "problem",
          html: `<p>Embeddings capture meaning but blur exact tokens. Names, product codes, error numbers and rare words can be outweighed by the general topic of a passage. Keyword search has the opposite profile: precise on exact terms, blind to paraphrase.</p>`,
        },
        {
          type: "text",
          html: `<p><strong>Full-text search</strong> uses an inverted index: a map from each term to the documents that contain it. Neo4j's full-text indexes are powered by Apache Lucene, whose default ranking is BM25, a formula that rewards terms that are frequent in a chunk but rare across the corpus. "Szilard" appears in one chunk, so that chunk scores very high for any query containing it.</p>
<p><strong>Hybrid search</strong> runs both searches and merges the results. The catch is that the scores are on different scales: cosine scores sit between 0 and 1, while BM25 scores are unbounded and depend on the corpus. The book's approach is simple:</p>`,
        },
        {
          type: "steps",
          items: [
            "Run vector search and full-text search, each returning its top k.",
            "Normalize each list separately by dividing every score by that list's maximum, so each list's best hit scores 1.0.",
            "UNION the two lists.",
            "If a chunk appears in both, keep its higher normalized score.",
            "Sort and return the top k.",
          ],
        },
        {
          type: "diagram",
          title: "Max-normalize, union, keep the best score",
          caption: "Raw cosine and BM25 scores cannot be compared directly. Dividing each list by its own maximum puts both on a 0 to 1 scale. Chunk 7, found only by keywords, now competes with the best semantic hit.",
          svg: `<svg viewBox="0 0 640 290" role="img" aria-label="Vector results and full-text results are normalized by their maximum and merged into one top three list">
<defs><marker id="gr2-arr-hyb" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="20" y="20" width="260" height="118" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="36" y="44" font-size="13" font-weight="700">Vector search (cosine)</text>
<text x="36" y="70" font-size="13">chunk 3</text><text x="264" y="70" text-anchor="end" font-size="13">0.91 → 1.00</text>
<text x="36" y="94" font-size="13">chunk 5</text><text x="264" y="94" text-anchor="end" font-size="13">0.88 → 0.97</text>
<text x="36" y="118" font-size="13">chunk 1</text><text x="264" y="118" text-anchor="end" font-size="13">0.80 → 0.88</text>
<rect x="20" y="152" width="260" height="118" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="36" y="176" font-size="13" font-weight="700">Full-text search (BM25)</text>
<text x="36" y="202" font-size="13">chunk 7</text><text x="264" y="202" text-anchor="end" font-size="13">6.2 → 1.00</text>
<text x="36" y="226" font-size="13">chunk 3</text><text x="264" y="226" text-anchor="end" font-size="13">4.1 → 0.66</text>
<text x="36" y="250" font-size="13">chunk 2</text><text x="264" y="250" text-anchor="end" font-size="13">2.0 → 0.32</text>
<line x1="282" y1="80" x2="368" y2="130" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#gr2-arr-hyb)"/>
<line x1="282" y1="210" x2="368" y2="170" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#gr2-arr-hyb)"/>
<text x="325" y="152" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">union</text>
<rect x="372" y="80" width="250" height="130" rx="8" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="388" y="104" font-size="13" font-weight="700">Hybrid top 3 (max per chunk)</text>
<text x="388" y="132" font-size="13">chunk 3</text><text x="606" y="132" text-anchor="end" font-size="13">1.00 (both)</text>
<text x="388" y="158" font-size="13">chunk 7</text><text x="606" y="158" text-anchor="end" font-size="13">1.00 (keyword)</text>
<text x="388" y="184" font-size="13">chunk 5</text><text x="606" y="184" text-anchor="end" font-size="13">0.97 (vector)</text>
<text x="372" y="240" font-size="12" style="fill: var(--dg-muted)">Arrows show raw score → normalized score.</text>
</svg>`,
        },
        {
          type: "code",
          lang: "cypher",
          title: "Hybrid search in one Cypher query",
          code: `CREATE FULLTEXT INDEX chunk_text IF NOT EXISTS FOR (c:Chunk) ON EACH [c.text];

CALL {
  CALL db.index.vector.queryNodes('chunk_embeddings', $k, $embedding)
  YIELD node, score
  WITH collect({node: node, score: score}) AS hits, max(score) AS top
  UNWIND hits AS h
  RETURN h.node AS node, h.score / top AS score
  UNION
  CALL db.index.fulltext.queryNodes('chunk_text', $question, {limit: $k})
  YIELD node, score
  WITH collect({node: node, score: score}) AS hits, max(score) AS top
  UNWIND hits AS h
  RETURN h.node AS node, h.score / top AS score
}
WITH node, max(score) AS score
RETURN node.text AS text, score
ORDER BY score DESC LIMIT $k;`,
        },
        {
          type: "lab",
          id: "hybridSearch",
          caption: "Eight chunks of the Einstein paper scored by vector search and by BM25. Switch normalization off to see why raw scores cannot be mixed, and watch which relevant chunks hybrid search rescues.",
        },
        {
          type: "compare",
          title: "Ways to fuse two result lists",
          items: [
            { title: "Max normalization (book)", tone: "info", html: "Divide by each list's top score. Simple and explainable, but each list's best hit always becomes 1.0, even when it is a weak match." },
            { title: "Reciprocal rank fusion", tone: "ok", html: "Ignore scores and use ranks: each result gets the sum of <code>1 / (c + rank)</code> over the lists it appears in, with a constant c (60 is a common choice). Robust to scale differences; used by several search engines and vector databases." },
            { title: "Rerank the union", tone: "warn", html: "Take the union of both lists and let a cross-encoder or rerank model rescore every candidate against the question. Usually the most accurate, at the cost of an extra model call." },
          ],
        },
        {
          type: "realworld",
          items: [
            { org: "Neo4j GraphRAG for Python", title: "HybridRetriever", html: "Neo4j's <code>neo4j-graphrag</code> package wraps exactly this pattern: give it a vector index and a full-text index and it runs both and merges the results, so you do not hand-write the UNION query." },
            { org: "LangChain", title: "Neo4jVector", html: "LangChain's Neo4j vector store can run in a hybrid mode that queries a vector index and a keyword index together, which makes switching a prototype from pure vector search to hybrid a one-parameter change." },
          ],
        },
        {
          type: "quiz",
          q: "With max normalization, a full-text search returns only one weak match for a query, which shares a single common word with it. What score does that match get, and why is that a problem?",
          options: [
            "Close to 0, so it is safely ignored",
            "1.0, so it ties with the best semantic match even though it is a poor result",
            "The average of all full-text scores",
            "It is dropped because full-text results need at least two hits",
          ],
          answer: 1,
          explain: "Dividing by the list's own maximum always gives the top item 1.0, no matter how weak it is in absolute terms. That is the main weakness of max normalization; rank fusion or a reranker avoids rewarding a list just for having a top item.",
        },
      ],
    },
    {
      id: "limits",
      title: "Where unstructured retrieval stops",
      kicker: "Limits",
      blocks: [
        {
          type: "text",
          html: `<p>Hybrid search is a solid baseline, and many production systems never go further. But every technique in this chapter still returns isolated pieces of text, and that has limits that show up as data gets more complex.</p>
<ul>
<li><strong>Lost references.</strong> A chunk says "this design was later licensed"; what "this design" refers to is in a previous chunk that may not be retrieved.</li>
<li><strong>Missing context.</strong> The retrieved chunk answers half the question; the other half is a page away.</li>
<li><strong>No computation.</strong> Counting, filtering by date, sorting and aggregating are impossible when you only see k chunks.</li>
<li><strong>Query and document phrasing differ.</strong> A question may be worded so differently from its answer that neither embeddings nor keywords find it.</li>
</ul>
<p>The next chapters attack these one by one: smarter ways to embed and query text (chapter 3), generating database queries (chapter 4), routing between retrievers (chapter 5), and building knowledge graphs so structure is available at all (chapters 6 and 7).</p>`,
        },
      ],
    },
    {
      id: "interview",
      title: "Talking about retrieval in an interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "text",
          html: `<p>"Design a document Q&amp;A system" is now a common interview prompt. The retrieval layer is where you show depth: most candidates say "put it in a vector database"; strong ones explain chunking choices, embedding consistency, ANN trade-offs and why they would add keyword search.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>Walk through the two pipelines:</p>
<ol>
<li><strong>Setup:</strong> chunk by structure where possible, then by size with overlap; embed with one model; store text and vectors with a vector index (ANN, usually HNSW).</li>
<li><strong>Query:</strong> embed the question with the same model, retrieve top k, and prompt the LLM to answer only from those chunks.</li>
<li><strong>Hybrid:</strong> add a full-text index for exact names and codes; normalize or rank-fuse the two lists before merging.</li>
<li><strong>Measure:</strong> choose chunk size, k and fusion method with a labelled question set, not intuition.</li>
</ol>
<p>Close by naming the limits: no counting or filtering, lost cross-references, and that structured retrieval handles those.</p>`,
        },
        {
          type: "quiz",
          q: "Users of an internal search bot complain it cannot find documents when they paste an exact error code such as \"ERR-4471\", but it handles descriptive questions well. What is the most targeted fix?",
          options: [
            "Switch to an embedding model with more dimensions",
            "Make chunks larger so the code has more context",
            "Add a full-text index and merge its results with vector search (hybrid search)",
            "Increase k from 5 to 50",
          ],
          answer: 2,
          explain: "Exact identifiers are exactly what embeddings blur and keyword search nails. A full-text index finds the chunks containing \"ERR-4471\"; fusing it with vector results keeps the good behavior on descriptive questions. A bigger model or larger k might help occasionally but does not address the cause.",
        },
      ],
    },
  ],
  takeaways: [
    "A RAG app has a <strong>retriever</strong> and a <strong>generator</strong>; retrieval quality caps answer quality, and a grounded generator can often be a smaller model.",
    "Data setup (chunk, embed, index) is a batch job; query time (embed, search, generate) must be fast. Both must use the <strong>same embedding model</strong>.",
    "Cosine similarity compares directions, so it ignores length and suits text of different sizes.",
    "Chunking defines what a search hit is: smaller chunks match precisely but lose context; overlap protects answers at boundaries. Measure, don't guess.",
    "Vector indexes trade exactness for speed: <strong>approximate nearest neighbor</strong> search, typically with HNSW.",
    "<strong>Hybrid search</strong> adds full-text (BM25) for exact terms. Scores must be normalized or rank-fused before merging; max normalization always gives each list's top hit 1.0.",
    "Unstructured retrieval cannot count, filter or follow references, which motivates the rest of the book.",
  ],
  furtherReading: [
    { title: "Neo4j Cypher Manual", url: "https://neo4j.com/docs/cypher-manual/current/", note: "See the sections on vector and full-text indexes for creation options, similarity functions and query procedures." },
    { title: "Efficient and robust approximate nearest neighbor search using Hierarchical Navigable Small World graphs (Malkov and Yashunin)", note: "The HNSW paper behind most vector indexes." },
    { title: "Reciprocal Rank Fusion outperforms Condorcet and individual rank learning methods (Cormack, Clarke and Buettcher, 2009)", note: "The short paper that introduced reciprocal rank fusion." },
  ],
};
