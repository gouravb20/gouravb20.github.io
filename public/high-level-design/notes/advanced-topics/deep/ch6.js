// Deep dive: Chapter 6, Embeddings and similarity search. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch6 = {
  hook: `<p>This chapter covers how embeddings turn "find things that mean the same" into "find nearby points", how to measure closeness, and why exact search stops scaling. It underpins semantic search, RAG and recommendations.</p>`,
  sections: [
    {
      id: "what-an-embedding-is",
      title: "Embeddings: meaning as geometry",
      kicker: "The key idea",
      blocks: [
        {
          type: "text",
          html: `<p>Keyword search misses paraphrases ("money back" versus "refund") and can't handle images or audio; B-trees and inverted indexes only answer exact values and ranges. An <strong>embedding</strong> is a fixed-length vector a model produces, trained so similar inputs land close together. Search becomes "return the stored points nearest the query's point".</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "Keyword search", tone: "warn", html: "Matches tokens and ranks with term statistics such as BM25. Excellent for exact identifiers, codes and names. Blind to paraphrase; useless for images or audio." },
            { title: "Similarity search", tone: "info", html: "Returns stored vectors nearest the query vector. Handles paraphrase, cross-language and non-text inputs. Can miss exact terms typed on purpose. Production systems often combine both (hybrid search)." },
          ],
        },
        {
          type: "diagram",
          title: "Similar texts land near each other",
          caption: "A two-dimensional cartoon of an embedding space. Help-center articles about the same topic cluster together, and the customer's question lands inside the refunds cluster even though it shares no keywords with those titles.",
          svg: `<svg viewBox="0 0 600 300" role="img" aria-label="Three clusters of documents in an embedding space with a query point inside the refunds cluster">
<rect x="20" y="20" width="400" height="260" rx="10" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<ellipse cx="120" cy="90" rx="70" ry="48" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<ellipse cx="320" cy="90" rx="70" ry="48" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<ellipse cx="200" cy="215" rx="80" ry="45" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="1.5"/>
<circle cx="95" cy="80" r="6" style="fill: var(--dg-1)"/>
<circle cx="140" cy="70" r="6" style="fill: var(--dg-1)"/>
<circle cx="150" cy="110" r="6" style="fill: var(--dg-1)"/>
<circle cx="300" cy="75" r="6" style="fill: var(--dg-2)"/>
<circle cx="345" cy="95" r="6" style="fill: var(--dg-2)"/>
<circle cx="310" cy="112" r="6" style="fill: var(--dg-2)"/>
<circle cx="170" cy="205" r="6" style="fill: var(--dg-3)"/>
<circle cx="225" cy="200" r="6" style="fill: var(--dg-3)"/>
<circle cx="205" cy="235" r="6" style="fill: var(--dg-3)"/>
<rect x="107" y="91" width="12" height="12" transform="rotate(45 113 97)" style="fill: var(--dg-bad); stroke: var(--dg-ink)" stroke-width="1"/>
<text x="120" y="32" text-anchor="middle" font-size="12" font-weight="700">Refunds and returns</text>
<text x="320" y="32" text-anchor="middle" font-size="12" font-weight="700">Shipping and delivery</text>
<text x="200" y="274" text-anchor="middle" font-size="12" font-weight="700">Account and login</text>
<text x="440" y="60" font-size="13" font-weight="700">How to read it</text>
<circle cx="448" cy="86" r="6" style="fill: var(--dg-muted)"/>
<text x="462" y="90" font-size="12" style="fill: var(--dg-muted)">an article</text>
<rect x="442" y="110" width="12" height="12" transform="rotate(45 448 116)" style="fill: var(--dg-bad); stroke: var(--dg-ink)" stroke-width="1"/>
<text x="462" y="120" font-size="12" style="fill: var(--dg-muted)">the question "get my</text>
<text x="462" y="137" font-size="12" style="fill: var(--dg-muted)">money back"</text>
<text x="440" y="170" font-size="12" style="fill: var(--dg-muted)">Search = return the</text>
<text x="440" y="187" font-size="12" style="fill: var(--dg-muted)">articles nearest the</text>
<text x="440" y="204" font-size="12" style="fill: var(--dg-muted)">question's point.</text>
</svg>`,
        },
        {
          type: "keypoints",
          items: [
            "Real embeddings have hundreds to thousands of dimensions: <code>all-MiniLM-L6-v2</code> 384, OpenAI <code>text-embedding-3-small</code> 1,536, <code>-large</code> 3,072. Individual dimensions mean nothing; the arrangement carries meaning (word2vec, 2013: king &minus; man + woman &asymp; queen).",
            "<strong>Similarity is whatever the model learned:</strong> general text models learn meaning; CLIP (2021) puts photos near their captions; a recommender's two-tower model puts users near items they engage with, so a co-purchase model shows sleeping bags for \"tent\". Pick the model whose \"similar\" matches the product question.",
          ],
        },
      ],
    },
    {
      id: "similarity-metrics",
      title: "Cosine, dot product and Euclidean distance",
      kicker: "How it works",
      blocks: [
        {
          type: "list",
          items: [
            "<strong>Dot product</strong> <code>a &middot; b = &Sigma; a<sub>i</sub> b<sub>i</sub></code>: higher is closer; grows with a smaller angle <em>and</em> longer vectors.",
            "<strong>Cosine</strong> <code>a &middot; b / (|a| |b|)</code>: direction only, from &minus;1 to 1.",
            "<strong>Euclidean (L2)</strong> <code>|a &minus; b|</code>: lower is closer; tip-to-tip distance.",
          ],
        },
        {
          type: "diagram",
          title: "Same vectors, three different winners",
          caption: "Query q = (3, 4). Document a = (6, 8) points the same way but is twice as long; document b = (4, 3) is slightly off in direction but the same length as q. Cosine and dot product prefer a; Euclidean distance prefers b.",
          svg: `<svg viewBox="0 0 600 290" role="img" aria-label="Three vectors from the origin compared under cosine, dot product and Euclidean distance">
<defs><marker id="at6-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-ink)"/></marker></defs>
<line x1="50" y1="260" x2="290" y2="260" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<line x1="50" y1="260" x2="50" y2="30" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<line x1="50" y1="260" x2="122" y2="164" stroke-width="3" style="stroke: var(--dg-bad)" marker-end="url(#at6-arrow)"/>
<line x1="50" y1="260" x2="194" y2="68" stroke-width="3" style="stroke: var(--dg-1)" marker-end="url(#at6-arrow)"/>
<line x1="50" y1="260" x2="146" y2="188" stroke-width="3" style="stroke: var(--dg-2)" marker-end="url(#at6-arrow)"/>
<line x1="122" y1="164" x2="146" y2="188" stroke-width="2" stroke-dasharray="5 4" style="stroke: var(--dg-muted)"/>
<text x="106" y="150" font-size="13" font-weight="700" style="fill: var(--dg-bad)">q</text>
<text x="200" y="64" font-size="13" font-weight="700" style="fill: var(--dg-1)">a</text>
<text x="154" y="194" font-size="13" font-weight="700" style="fill: var(--dg-2)">b</text>
<text x="160" y="160" font-size="12" style="fill: var(--dg-muted)">L2(q, b) = 1.41</text>
<text x="60" y="280" font-size="12" style="fill: var(--dg-muted)">origin</text>
<rect x="320" y="40" width="260" height="200" rx="10" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="336" y="66" font-size="13" font-weight="700">Metric</text>
<text x="450" y="66" font-size="13" font-weight="700" style="fill: var(--dg-1)">q vs a</text>
<text x="520" y="66" font-size="13" font-weight="700" style="fill: var(--dg-2)">q vs b</text>
<line x1="330" y1="78" x2="570" y2="78" style="stroke: var(--dg-line)"/>
<text x="336" y="104" font-size="12">Cosine</text>
<text x="450" y="104" font-size="12" font-weight="700">1.00</text>
<text x="520" y="104" font-size="12">0.96</text>
<text x="336" y="134" font-size="12">Dot product</text>
<text x="450" y="134" font-size="12" font-weight="700">50</text>
<text x="520" y="134" font-size="12">24</text>
<text x="336" y="164" font-size="12">L2 distance</text>
<text x="450" y="164" font-size="12">5.00</text>
<text x="520" y="164" font-size="12" font-weight="700">1.41</text>
<text x="336" y="200" font-size="12" style="fill: var(--dg-muted)">Bold = the winner under that</text>
<text x="336" y="218" font-size="12" style="fill: var(--dg-muted)">metric (higher cosine and dot,</text>
<text x="336" y="236" font-size="12" style="fill: var(--dg-muted)">lower L2)</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>Whether length should count depends on your vectors: usually noise for text, sometimes a deliberate popularity signal in recommenders. <strong>Normalize to unit length</strong> and the rankings agree: cosine equals the dot product and <code>|a &minus; b|<sup>2</sup> = 2 &minus; 2 cos(a, b)</code>. Many systems normalize at write time and use the cheapest metric, the dot product.</p>`,
        },
        {
          type: "lab",
          id: "knnMetrics",
          caption: "Move the query among twelve 2-D article vectors and switch between cosine, dot product and Euclidean distance. Watch long vectors win under dot product, and all three agree once vectors are normalized.",
        },
        {
          type: "table",
          title: "Choosing a metric",
          headers: ["Metric", "Length matters?", "Typical use"],
          rows: [
            ["Cosine", "No", "Text embeddings; the usual default"],
            ["Dot product", "Yes", "Recommenders that encode popularity in length; normalized vectors (fastest)"],
            ["Euclidean (L2)", "Yes", "Image and other models trained with distance-based losses; clustering"],
          ],
          note: "The rule that trumps the table: use the metric the embedding model was trained with. Its documentation says which.",
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Indexing with one metric and querying with another. With unnormalized vectors, an L2 index and cosine-scored queries return different neighbours, silently. Decide the metric once and build the index with it.</p>`,
        },
      ],
    },
    {
      id: "exact-search",
      title: "Exact k-NN and where it stops scaling",
      kicker: "The cost",
      blocks: [
        {
          type: "text",
          html: `<p><strong>Exact k-NN</strong> compares the query with every vector: <code>N &times; d</code> multiply-adds, and it's memory-bandwidth bound. A million 768-d float32 vectors is about 3 GB and scans in tens of milliseconds on a multi-core server. After a selective filter (one tenant, one user), brute force is often the right answer.</p>`,
        },
        {
          type: "code",
          lang: "python",
          title: "Exact top-k with NumPy (argpartition finds top k without a full sort)",
          code: `import numpy as np

vectors = np.load("chunks.npy").astype(np.float32)          # shape (N, d)
vectors /= np.linalg.norm(vectors, axis=1, keepdims=True)    # unit length, once

def search(query, k=10):
    q = query / np.linalg.norm(query)
    scores = vectors @ q                 # cosine == dot product for unit vectors
    best = np.argpartition(-scores, k)[:k]
    return best[np.argsort(-scores[best])]`,
        },
        {
          type: "table",
          title: "Raw float32 size: what a full scan has to read",
          headers: ["Dimensions", "Per vector", "1M vectors", "100M vectors", "1B vectors"],
          rows: [
            ["384", "1.5 KB", "1.5 GB", "154 GB", "1.5 TB"],
            ["768", "3 KB", "3.1 GB", "307 GB", "3.1 TB"],
            ["1,536", "6 KB", "6.1 GB", "614 GB", "6.1 TB"],
            ["3,072", "12 KB", "12.3 GB", "1.2 TB", "12.3 TB"],
          ],
          note: "Size = N &times; d &times; 4 bytes, before any index overhead or metadata.",
        },
        {
          type: "keypoints",
          items: [
            "At hundreds of millions of vectors and hundreds of queries per second, brute force is uneconomical.",
            "<strong>Curse of dimensionality:</strong> k-d trees and R-trees can't prune in hundreds of dimensions; a rule of thumb says k-d trees beat brute force only when N &gt;&gt; 2<sup>d</sup>, never for d = 768.",
            "<strong>The ANN bargain:</strong> an approximate index returns most true neighbours while touching a small fraction of the data. Quality is <code>recall@k = |returned &cap; true top k| / k</code>, typically tuned to 95-99%.",
          ],
        },
        {
          type: "quiz",
          q: "A B2B app stores 50 million document chunks, but every query is restricted to one customer's data, and the largest customer has 200,000 chunks. Do you need an ANN index?",
          options: [
            "Yes, 50 million vectors is far too many to scan",
            "Probably not: filter by customer first, then brute-force at most 200,000 vectors",
            "Yes, because brute force has lower recall than ANN",
            "No, but only if you switch to Euclidean distance",
          ],
          answer: 1,
          explain: "What matters is how many vectors one query must compare, not the total. 200,000 vectors of 768 dimensions is about 600 MB and scans quickly, with perfect recall. Partition or index by customer so the filter is cheap.",
        },
      ],
    },
    {
      id: "embedding-pipeline",
      title: "The embedding pipeline and model versions",
      kicker: "In practice",
      blocks: [
        {
          type: "diagram",
          title: "Ingestion and query paths",
          caption: "Documents are split into chunks, embedded and stored with their metadata. A query is embedded by the same model, searched with filters, and the best chunks are reranked or handed to an LLM.",
          svg: `<svg viewBox="0 0 620 250" role="img" aria-label="Embedding pipeline with an ingestion path and a query path sharing one model and one vector index">
<defs><marker id="at6-flow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<text x="20" y="28" font-size="13" font-weight="700">Ingestion</text>
<rect x="20" y="40" width="100" height="44" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="70" y="67" text-anchor="middle" font-size="12">Documents</text>
<rect x="150" y="40" width="100" height="44" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="200" y="60" text-anchor="middle" font-size="12">Split into</text>
<text x="200" y="76" text-anchor="middle" font-size="12">chunks</text>
<rect x="280" y="90" width="110" height="70" rx="8" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="2"/>
<text x="335" y="120" text-anchor="middle" font-size="12" font-weight="700">Embedding</text>
<text x="335" y="138" text-anchor="middle" font-size="12" font-weight="700">model v1</text>
<rect x="430" y="90" width="170" height="70" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="515" y="115" text-anchor="middle" font-size="12" font-weight="700">Vector index</text>
<text x="515" y="133" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">vector + doc ID, tenant,</text>
<text x="515" y="149" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">ACL, updated_at</text>
<line x1="120" y1="62" x2="148" y2="62" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#at6-flow)"/>
<path d="M250 62 L335 62 L335 88" fill="none" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#at6-flow)"/>
<line x1="390" y1="112" x2="428" y2="112" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#at6-flow)"/>
<text x="20" y="176" font-size="13" font-weight="700">Query</text>
<rect x="20" y="186" width="100" height="44" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<text x="70" y="213" text-anchor="middle" font-size="12">Question</text>
<path d="M120 208 L335 208 L335 162" fill="none" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#at6-flow)"/>
<text x="190" y="200" font-size="12" style="fill: var(--dg-muted)">same model</text>
<line x1="390" y1="140" x2="428" y2="140" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#at6-flow)"/>
<rect x="430" y="186" width="170" height="44" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<text x="515" y="205" text-anchor="middle" font-size="12">Filtered top-k, rerank,</text>
<text x="515" y="221" text-anchor="middle" font-size="12">then answer or LLM</text>
<line x1="515" y1="162" x2="515" y2="184" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#at6-flow)"/>
</svg>`,
        },
        {
          type: "steps",
          title: "Ingestion",
          items: [
            "<strong>Chunk</strong> into a few hundred tokens with some overlap; one vector can't summarize a 40-page manual.",
            "<strong>Embed</strong> in batches (GPU or API) as a queue-driven job, not in the user's request.",
            "<strong>Store with metadata:</strong> document ID, chunk position, tenant, access-control fields, timestamps. Query-time filters need them.",
            "<strong>Keep fresh:</strong> re-chunk and re-embed changed documents and delete old chunks, triggered by CDC from the source database.",
          ],
        },
        {
          type: "text",
          html: `<p>At query time, embed with the <strong>same model</strong>, search top-k within tenant and permission filters, optionally rerank, then show results or hand them to an LLM: <strong>retrieval-augmented generation</strong> (RAG). Vectors from different models or versions live in unrelated spaces with no conversion, so upgrading the model means <strong>re-embedding the entire corpus</strong>.</p>`,
        },
        {
          type: "steps",
          title: "Migrating to a new embedding model",
          items: [
            "Create a v2 index beside the live v1 index.",
            "Dual-write: embed new or changed documents with both models.",
            "Backfill the corpus into v2, budgeting GPU hours or API cost.",
            "Evaluate on a labelled query set before switching traffic.",
            "Flip queries to v2, keep v1 for rollback, then drop it.",
          ],
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p>Store the model name and version with every vector or index. If someone embeds queries with a newer model, quality drops silently and the only clue is a metric trending down.</p>`,
        },
      ],
    },
    {
      id: "interview",
      title: "Using it in a design interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "callout",
          tone: "interview",
          html: `<p>Embeddings come up with "similar", "semantic", "recommend" or "answer questions from our documents". A strong answer covers:</p>
<ol>
<li><strong>Why not a normal index:</strong> similarity is neither an exact match nor a range.</li>
<li><strong>The model:</strong> one whose notion of similarity fits the product (semantic text, CLIP for images, two-tower for recommendations).</li>
<li><strong>The metric:</strong> whatever the model was trained with; normalize and all three rank the same.</li>
<li><strong>Size first:</strong> N &times; d &times; 4 bytes. 10 million 1,536-d chunks is about 61 GB: fits one large machine's RAM, not a shared transactional database. Hundreds of millions need an ANN index.</li>
<li><strong>The pipeline:</strong> chunking, metadata for filters, async re-embedding, and a re-embed-everything plan for upgrades.</li>
</ol>`,
        },
        {
          type: "quiz",
          q: "After upgrading the embedding model, the team re-embeds all new documents with v2 but leaves old documents as v1 vectors in the same index. What will users see?",
          options: [
            "Slightly better results, since new documents use the better model",
            "Old documents will rarely, and meaninglessly, match queries, because v1 and v2 vectors are not comparable",
            "No change, because cosine similarity normalizes away model differences",
            "Queries will fail with a dimension error in every case",
          ],
          answer: 1,
          explain: "Two models define two unrelated coordinate systems. A v2 query compared with v1 vectors produces scores with no meaning, so old content effectively disappears from or pollutes results. If the dimensions differ you might get an error, but if they match you get silent garbage, which is worse. Re-embed everything into a new index and switch over.",
        },
      ],
    },
  ],
  takeaways: [
    "An embedding is a model-produced vector where similarity becomes closeness, and \"similar\" means whatever the model was trained for.",
    "Cosine ignores length, dot product rewards it, L2 measures tip-to-tip distance; normalize and all three agree, with dot product cheapest.",
    "Exact k-NN costs N &times; d per query: fine to about a million vectors or after a selective filter; tree indexes fail in high dimensions.",
    "Approximate indexes trade a few percent of recall@k for orders of magnitude less work.",
    "Chunking, metadata for filtering and the re-embed-everything cost of a model upgrade matter as much as the index.",
  ],
  furtherReading: [
    { title: "Efficient Estimation of Word Representations in Vector Space (Mikolov et al., 2013)", url: "https://arxiv.org/abs/1301.3781", note: "The word2vec paper that popularized dense embeddings." },
    { title: "Learning Transferable Visual Models From Natural Language Supervision (Radford et al., 2021)", url: "https://arxiv.org/abs/2103.00020", note: "The CLIP paper: one embedding space for images and text." },
    { title: "Deep Neural Networks for YouTube Recommendations (Covington, Adams, Sargin, 2016)", note: "Embedding-based candidate generation served by nearest-neighbour search." },
    { title: "Sentence Transformers documentation", url: "https://www.sbert.net/", note: "Practical guide to computing and comparing sentence embeddings." },
  ],
};
