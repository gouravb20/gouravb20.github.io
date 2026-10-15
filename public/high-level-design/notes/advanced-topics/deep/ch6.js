// Deep dive: Chapter 6, Embeddings and similarity search. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch6 = {
  hook: `<p>A customer types <em>"how do I get my money back for a broken blender"</em> into your help center. Your search engine dutifully looks for those words and returns nothing useful, because the article that answers the question is titled <em>"Refund and return policy for damaged items"</em>. Not one important word overlaps. The answer exists; the search just cannot see that the two phrasings mean the same thing.</p>
<p>The fix is to stop comparing words and start comparing <strong>meaning</strong>. A model turns every article, and the customer's question, into a list of a few hundred numbers arranged so that texts about the same thing land near each other. Search becomes geometry: find the stored points closest to the question's point. This chapter is about that geometry, how to measure "close", and why doing it naively stops working long before you reach a billion documents.</p>`,
  sections: [
    {
      id: "why-keywords-fail",
      title: "When matching words is not enough",
      kicker: "The problem",
      blocks: [
        {
          type: "problem",
          html: `<p>Classic search and classic database indexes answer questions of the form "which rows contain this exact value" or "which rows fall in this range". Users increasingly ask a different question: "which items are <em>like</em> this one?" Similar meaning, similar look, similar taste. Nothing in a B-tree or an inverted index knows what "like" means.</p>`,
        },
        {
          type: "text",
          html: `<p>Keyword search fails in two directions. It misses <strong>paraphrases</strong>: "money back" versus "refund", "laptop won't turn on" versus "notebook fails to boot". And it cannot handle inputs that are not words at all: a photo of a shoe, a song, a user's purchase history. You can tune synonyms lists forever and still lose to the long tail of ways people express the same idea.</p>
<p>A database index does not help either. A B-tree orders rows by one key so it can find an exact value or a contiguous range quickly. Similarity is neither. Two sentences can be close in meaning while every individual feature you might sort by is different, and there is no single ordering of documents in which "near in meaning" means "next to each other in the index".</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "Keyword search", tone: "warn", html: "Matches tokens (after stemming and synonyms) and ranks with term statistics such as BM25. Excellent for exact identifiers, product codes and names. Blind to paraphrase and useless for images or audio." },
            { title: "Similarity search", tone: "info", html: "Turns every item into a vector and returns the stored vectors nearest the query's vector. Handles paraphrase, cross-language matches and non-text inputs. Can miss exact terms a user typed on purpose." },
          ],
        },
        {
          type: "text",
          html: `<p>Neither wins outright, which is why production systems often run both and merge the results (hybrid search, covered next chapter). But the new capability, finding things by meaning, depends entirely on getting good vectors and comparing them sensibly. That is what the rest of this chapter builds.</p>`,
        },
      ],
    },
    {
      id: "what-an-embedding-is",
      title: "Embeddings: meaning as geometry",
      kicker: "The key idea",
      blocks: [
        {
          type: "idea",
          html: `<p>An <strong>embedding</strong> is a fixed-length vector of floats that a model produces for an input, trained so that inputs that are similar (in whatever sense the model learned) get vectors that are close together. Once everything is a point in the same space, "find similar items" becomes "find nearby points".</p>`,
        },
        {
          type: "text",
          html: `<p>Real embeddings have hundreds to a few thousand dimensions. The popular Sentence Transformers model <code>all-MiniLM-L6-v2</code> produces 384 numbers per sentence; OpenAI's <code>text-embedding-3-small</code> produces 1,536 and <code>text-embedding-3-large</code> produces 3,072. Individual dimensions do not mean anything a human can name. What carries meaning is the <em>arrangement</em>: which points sit near which.</p>
<p>The idea became famous with word2vec (Mikolov and colleagues at Google, 2013), whose word vectors showed that directions can encode relationships: the vector for <em>king</em> minus <em>man</em> plus <em>woman</em> lands near <em>queen</em>. Modern models embed whole sentences, paragraphs, images and audio, but the principle is the same.</p>`,
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
          type: "text",
          html: `<h3>Similarity is whatever the model learned</h3>
<p>"Close" only means what the training objective made it mean. General-purpose text models learn <em>semantic</em> similarity from huge corpora. CLIP (OpenAI, 2021) was trained on image and caption pairs so that a photo and a sentence describing it land near each other, which is what makes text-to-image search work. A recommender's <strong>two-tower model</strong> trains one network for users and one for items so that a user's vector is near the items that user engages with.</p>
<p>That last kind of similarity can look strange. Diapers and baby bottles are not semantically alike, yet a purchase-trained model will put them side by side because the same shoppers buy both. Neither notion is wrong. Pick the model whose idea of "similar" matches the product question you are answering.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "YouTube", title: "Candidate generation (2016 paper)", html: "The paper <em>Deep Neural Networks for YouTube Recommendations</em> describes learning user and video embeddings, then serving candidates with a nearest-neighbour search over video vectors, narrowing millions of videos to hundreds before a heavier ranking model runs." },
            { org: "Sentence Transformers", title: "Open-source text embeddings", html: "A Python library and model hub for sentence and paragraph embeddings. Small models such as <code>all-MiniLM-L6-v2</code> (384 dimensions) run on a CPU and are a common starting point for semantic search prototypes." },
            { org: "OpenAI CLIP", title: "One space for images and text", html: "Image and text encoders trained jointly, so you can search a photo library by typing a description, or find captions for an image, with a single nearest-neighbour query." },
          ],
        },
        {
          type: "quiz",
          q: "Your team swaps a general text-embedding model for a model trained on 'customers who bought X also bought Y'. A query for 'tent' now returns sleeping bags and camping stoves instead of other tents. What happened?",
          options: [
            "The index is corrupted and must be rebuilt",
            "The new model learned a different notion of similarity: co-purchase rather than meaning",
            "Cosine similarity stops working above 1,000 dimensions",
            "The query was embedded with too few dimensions",
          ],
          answer: 1,
          explain: "Embeddings encode whatever relationship the model was trained on. A co-purchase model places complementary products together, which is great for 'frequently bought together' and wrong for 'show me other tents'. Choose the model to match the question.",
        },
      ],
    },
    {
      id: "similarity-metrics",
      title: "Cosine, dot product and Euclidean distance",
      kicker: "How it works",
      blocks: [
        {
          type: "text",
          html: `<p>Once you have vectors you need a number that says how close two of them are. Three metrics cover almost every system, and they differ in one important way: whether a vector's <strong>length</strong> counts.</p>
<ul>
<li><strong>Dot product</strong>: <span class="formula">a &middot; b = &Sigma; a<sub>i</sub> b<sub>i</sub></span>. Higher means more similar. It grows with the angle getting smaller <em>and</em> with either vector getting longer.</li>
<li><strong>Cosine similarity</strong>: <span class="formula">cos(a, b) = a &middot; b / (|a| |b|)</span>. The dot product with lengths divided out, so it depends only on direction. Ranges from &minus;1 to 1.</li>
<li><strong>Euclidean (L2) distance</strong>: <span class="formula">|a &minus; b| = &radic;&Sigma;(a<sub>i</sub> &minus; b<sub>i</sub>)<sup>2</sup></span>. Lower means more similar. The straight-line distance between the two tips.</li>
</ul>`,
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
          html: `<h3>Working the example</h3>
<p>For <code>q = (3, 4)</code> and <code>a = (6, 8)</code>: the dot product is 18 + 32 = 50, the lengths are 5 and 10, so cosine is 50 / 50 = 1. They point in exactly the same direction. For <code>b = (4, 3)</code>: the dot product is 12 + 12 = 24, both lengths are 5, so cosine is 24 / 25 = 0.96. By direction, <code>a</code> wins.</p>
<p>Euclidean distance disagrees. The tip of <code>a</code> is 5 units from the tip of <code>q</code>, while <code>b</code> is only &radic;2 &asymp; 1.41 away. L2 punishes <code>a</code> for being longer. Which answer is right depends on what length means for your vectors: for text embeddings it is usually noise, for some recommenders it is deliberately a popularity or confidence signal.</p>`,
        },
        {
          type: "text",
          html: `<h3>Normalize, and the disagreement disappears</h3>
<p>Scale every vector to length 1 and the three metrics collapse into one ranking. For unit vectors, cosine equals the dot product, and the squared distance is <span class="formula">|a &minus; b|<sup>2</sup> = 2 &minus; 2 cos(a, b)</span>, so a smaller distance always means a larger cosine. Check it with the example: normalized, <code>q</code> and <code>b</code> become (0.6, 0.8) and (0.8, 0.6), the distance is &radic;0.08 &asymp; 0.283, and 2 &minus; 2 &times; 0.96 = 0.08. That is why many systems normalize once at write time and then use the plain dot product, the cheapest of the three, internally.</p>`,
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
          html: `<p>Indexing with one metric and querying with another. If your vectors are not normalized, an index built for L2 and a query scored with cosine return different neighbours, and nothing errors out; results are just quietly worse. Decide the metric once, normalize if the model expects it, and build the index with that metric.</p>`,
        },
      ],
    },
    {
      id: "exact-search",
      title: "Exact k-NN: brute force, and where it stops scaling",
      kicker: "The cost",
      blocks: [
        {
          type: "text",
          html: `<p>The simplest similarity search is also the only perfectly accurate one: compare the query with <em>every</em> stored vector and keep the best k. This is <strong>exact k-nearest neighbours</strong> (k-NN), and its cost is easy to state: <span class="formula">work per query = N &times; d</span> multiply-adds, for N vectors of d dimensions, plus reading all N &times; d values from memory.</p>
<p>Do not dismiss it. A million 768-dimension float32 vectors take 1,000,000 &times; 768 &times; 4 bytes &asymp; 3 GB. A scan is about 768 million multiply-adds, which modern CPUs do with SIMD instructions; in practice the limit is memory bandwidth, and a scan of a few gigabytes lands in the tens of milliseconds on a multi-core server. With a filter that narrows the candidates first (one user's documents, one tenant), brute force is often the right answer.</p>`,
        },
        {
          type: "code",
          lang: "python",
          title: "Exact top-k with NumPy",
          code: `import numpy as np

vectors = np.load("chunks.npy").astype(np.float32)          # shape (N, d)
vectors /= np.linalg.norm(vectors, axis=1, keepdims=True)    # unit length, once

def search(query, k=10):
    q = query / np.linalg.norm(query)
    scores = vectors @ q                 # cosine == dot product for unit vectors
    best = np.argpartition(-scores, k)[:k]
    return best[np.argsort(-scores[best])]`,
          caption: "One matrix-vector product per query. argpartition finds the top k in linear time without sorting all N scores.",
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
          type: "text",
          html: `<p>Now scale it. At 100 million vectors every query reads hundreds of gigabytes; at a billion, terabytes. Multiply by hundreds of queries per second and no amount of hardware makes brute force economical. You need an index that looks at a small fraction of the vectors.</p>
<h3>Why the usual spatial indexes do not save you</h3>
<p>For two-dimensional data (latitude and longitude) we already have good tools: k-d trees, quadtrees, R-trees. They split space into regions and prune regions that cannot contain a closer point. In hundreds of dimensions that pruning collapses, a problem known as the <strong>curse of dimensionality</strong>. A query's ball of "possibly closer" points intersects almost every region, so the tree ends up visiting nearly everything. A common rule of thumb is that k-d trees only beat brute force when N is far larger than 2<sup>d</sup>, which for d = 768 is never.</p>
<p>High dimensions also make distances themselves less informative: for random data, the nearest and farthest points end up at nearly the same distance from the query. Real embeddings are not random (they live on lower-dimensional structure, which is why search works at all), but exact pruning still fails.</p>`,
        },
        {
          type: "idea",
          title: "The bargain every vector database makes",
          html: `<p>Give up guaranteed exactness. An <strong>approximate nearest neighbour</strong> (ANN) index returns <em>most</em> of the true nearest neighbours while examining a small fraction of the data. Quality is measured as <span class="formula">recall@k = |returned &cap; true top k| / k</span>. If the true top 10 are known and the index returns 9 of them, recall@10 is 0.9. Systems typically tune for 95-99% recall in exchange for orders of magnitude less work.</p>`,
        },
        {
          type: "tradeoffs",
          prosLabel: "Exact (brute-force) search",
          consLabel: "Its limits",
          pros: [
            "100% recall, so it is the ground truth you measure ANN indexes against",
            "No index to build, tune or keep fresh; inserts and deletes are instant",
            "Ideal after a selective filter shrinks the candidates to thousands or a few million",
          ],
          cons: [
            "Cost grows linearly with N: every query reads every vector",
            "Hundreds of millions of vectors at high QPS needs absurd memory bandwidth or many GPUs",
            "Tree indexes do not rescue it in high dimensions",
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
      title: "The embedding pipeline: chunks, metadata and model versions",
      kicker: "In practice",
      blocks: [
        {
          type: "text",
          html: `<p>In a real design the index is one box in a pipeline, and most quality problems come from the boxes around it. The pipeline has two paths that must agree on one thing: the <strong>same model</strong> embeds both the stored items and the query.</p>`,
        },
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
          title: "Ingestion, step by step",
          items: [
            "<strong>Chunk.</strong> Split long documents into pieces of a few hundred tokens, often with some overlap so a sentence cut at a boundary still appears whole in one chunk. One vector cannot faithfully summarize a 40-page manual.",
            "<strong>Embed.</strong> Run each chunk through the model, in batches, on GPUs or through an embedding API. This is the expensive step, so it is usually a queue-driven job rather than part of the user's request.",
            "<strong>Store with metadata.</strong> Save the vector alongside the document ID, chunk position, tenant, access-control fields and timestamps. Filters at query time depend on these fields existing.",
            "<strong>Keep it fresh.</strong> When a document changes, re-chunk and re-embed it, and delete the old chunks. A change-data-capture feed from the source database (Chapter 10) is a natural trigger.",
          ],
        },
        {
          type: "text",
          html: `<p>At query time, embed the question with the same model, run a top-k search restricted by tenant and permissions, and optionally rerank the candidates with a slower, more accurate model before showing them or passing them to an LLM. That last arrangement, retrieving chunks to ground a language model's answer, is <strong>retrieval-augmented generation</strong> (RAG), and it is the most common reason vector search shows up in interviews today.</p>
<h3>Model versions are separate universes</h3>
<p>Vectors from two different models, or two versions of the same model, live in unrelated spaces. A query embedded with v2 compared against documents embedded with v1 returns noise, and there is no conversion formula. Even the dimension counts may differ. Upgrading the model therefore means <strong>re-embedding the entire corpus</strong>.</p>`,
        },
        {
          type: "steps",
          title: "Migrating to a new embedding model",
          items: [
            "Create a second index for v2 vectors next to the live v1 index.",
            "Dual-write: every new or changed document is embedded with both models.",
            "Backfill: a batch job re-embeds the existing corpus into the v2 index. Budget the GPU hours or API cost up front.",
            "Evaluate on a labelled query set (recall, click-through) before switching any traffic.",
            "Flip queries to v2, keep v1 for a rollback window, then drop it.",
          ],
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p>Store the model name and version with every vector, or at least with every index. The day someone embeds queries with a newer model "because it is better", search quality drops silently and the only clue is a metric trending down.</p>`,
        },
        {
          type: "realworld",
          title: "Where embeddings get used",
          items: [
            { org: "Semantic search and RAG", html: "Help centers, internal wikis and code search retrieve chunks by meaning, often combined with keyword search, and feed them to an LLM to answer questions with citations." },
            { org: "Recommendations", html: "Two-tower models embed users and items; a nearest-neighbour search pulls a few hundred candidates out of millions for a ranking model to order." },
            { org: "Deduplication and safety", html: "Near-duplicate images, reposted content and plagiarized text sit very close to the original in embedding space, so a similarity threshold flags them for review." },
          ],
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
          html: `<p>Embeddings come up whenever the requirement contains "similar", "related", "semantic", "recommend" or "answer questions from our documents". Interviewers care much more about where vectors come from and how the pipeline behaves than about index internals, which you can defer to the next layer of the discussion.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>A strong answer covers these points without being asked:</p>
<ol>
<li><strong>Why not a normal index:</strong> similarity is not an exact match or a range, so B-trees and inverted indexes cannot answer it.</li>
<li><strong>The model:</strong> pick one whose notion of similarity fits the product (semantic text model, CLIP for images, a two-tower model for recommendations).</li>
<li><strong>The metric:</strong> whatever the model was trained with; normalize and all three rank the same.</li>
<li><strong>Size first:</strong> N &times; d &times; 4 bytes. A million 768-d vectors is about 3 GB and brute force may be fine; hundreds of millions need an ANN index.</li>
<li><strong>The pipeline:</strong> chunking, metadata for filters, async re-embedding on change, and a re-embed-everything plan for model upgrades.</li>
</ol>`,
        },
        {
          type: "text",
          html: `<p>Back-of-envelope sizing is where many candidates stumble. Practice the multiplication: 10 million chunks of 1,536 dimensions is 10<sup>7</sup> &times; 1,536 &times; 4 &asymp; 61 GB of raw vectors. That fits in RAM on one large machine, but not on the database server you were planning to share with the transactional workload. Saying that out loud leads naturally to the index and quantization choices of the next chapter.</p>`,
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
    "An embedding is a model-produced vector where similarity becomes closeness; dimensions are meaningless individually, the arrangement carries the meaning.",
    "Similarity means whatever the model was trained for: semantic text models, CLIP for image and text, two-tower models for co-engagement.",
    "Cosine ignores length, dot product rewards it, L2 measures tip-to-tip distance. Normalize to unit length and all three give the same ranking, with dot product the cheapest.",
    "Exact k-NN costs N &times; d per query and is fine up to around a million vectors, or after a selective filter; tree indexes do not help in hundreds of dimensions.",
    "Approximate indexes trade a few percent of recall@k for orders of magnitude less work; that bargain is the foundation of every vector database.",
    "Chunking, metadata for filtering and the re-embed-everything cost of a model upgrade matter as much as the index.",
  ],
  furtherReading: [
    { title: "Efficient Estimation of Word Representations in Vector Space (Mikolov et al., 2013)", url: "https://arxiv.org/abs/1301.3781", note: "The word2vec paper that popularized dense embeddings." },
    { title: "Learning Transferable Visual Models From Natural Language Supervision (Radford et al., 2021)", url: "https://arxiv.org/abs/2103.00020", note: "The CLIP paper: one embedding space for images and text." },
    { title: "Deep Neural Networks for YouTube Recommendations (Covington, Adams, Sargin, 2016)", note: "Embedding-based candidate generation served by nearest-neighbour search." },
    { title: "Sentence Transformers documentation", url: "https://www.sbert.net/", note: "Practical guide to computing and comparing sentence embeddings." },
  ],
};
