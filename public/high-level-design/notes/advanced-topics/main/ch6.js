// Main tab: Chapter 6, Embeddings and similarity search. Format: DeepSection[] in public/shared/notes.d.ts.
window.MAIN = window.MAIN || {};
MAIN.ch6 = [
  {
    id: `meaning-as-geometry`,
    title: `Embeddings turn "similar" into "nearby"`,
    kicker: `Mental model`,
    blocks: [
      { type: `text`, html: `<p>An <strong>embedding</strong> is a fixed-length list of numbers, typically a few hundred to a few thousand, that a model produces for a piece of text, an image, a product or a user. The model is trained so that things it considers similar end up with vectors that point in similar directions. No single number means anything on its own; what carries meaning is how close two vectors are.</p>
<p>That turns fuzzy questions into geometry. "Find support articles about getting my money back" becomes "embed the question and find the stored vectors nearest to it", and an article titled "Refund policy" is found even though it shares no words with the query. Ordinary indexes can't help with this: a B-tree answers exact matches and ranges on one key, and "near in 768 dimensions" is neither.</p>` },
      { type: `callout`, tone: `insight`, title: `The model defines similarity`, html: `<p>A general text model puts "diapers" near "nappies". A recommendation model trained on purchases puts diapers near baby wipes, which are not alike in meaning but are bought together. Choose the model for the kind of similarity the product needs, and remember that vectors from different models, or different versions of one model, can't be compared at all.</p>` },
    ],
  },
  {
    id: `metrics`,
    title: `Cosine, dot product or Euclidean distance`,
    kicker: `Measuring closeness`,
    blocks: [
      { type: `compare`, items: [
        { title: `Cosine similarity`, tone: `ok`, html: `<p>The angle between two vectors, ignoring their length. The usual default for text, where length carries little meaning.</p>` },
        { title: `Dot product`, tone: `info`, html: `<p>Direction and length together, so longer vectors score higher. Some recommenders deliberately encode popularity or confidence in length. Cheapest to compute.</p>` },
        { title: `Euclidean (L2)`, tone: `info`, html: `<p>Straight-line distance between the vector tips. Common for image embeddings and clustering.</p>` },
      ] },
      { type: `text`, html: `<p><strong>Worked example.</strong> Query q = (1, 0). Document A = (0.8, 0.6) has length 1; document B = (3, 3) is longer. Cosine scores A at 0.80 and B at 0.71, so A wins. Euclidean distance is 0.63 to A and 3.6 to B, so A wins again. Dot product scores A at 0.8 and B at 3, so B wins, purely because it is longer. Same data, different answer.</p>
<p>The rule that resolves this: <strong>use the metric the model was trained with</strong>. And if you normalize every vector to length 1 when you store it, all three metrics rank results identically, so systems often normalize at write time and use the dot product because it is fastest.</p>` },
    ],
  },
  {
    id: `exact-search-limits`,
    title: `Exact search, and where it stops being enough`,
    kicker: `Scale`,
    blocks: [
      { type: `text`, html: `<p>Exact k-nearest-neighbour search compares the query with every stored vector and keeps the best k. It has perfect recall and is simple, and it is a better answer than many candidates assume. A million 768-dimension float32 vectors is about 3 GB, and a vectorised scan of that takes tens of milliseconds. If a filter shrinks the search first, for example to one user's documents or one tenant's catalogue, brute force over the survivors is often the best plan.</p>
<p>At 100 million vectors the same scan reads about 300 GB per query, which is far too slow and expensive at any real query rate. Spatial trees don't rescue you either: in hundreds of dimensions a k-d tree has to explore almost every branch. This is why vector search moved to <strong>approximate nearest neighbour</strong> (ANN) indexes, which find most of the true neighbours while examining a small fraction of the data.</p>` },
      { type: `keypoints`, items: [
        `<strong>Sizing rule:</strong> raw memory is N &times; dimensions &times; 4 bytes for float32. Compute it before choosing anything.`,
        `<strong>Recall@k</strong> is the share of the true top k that an approximate search returns. 95 to 99% is typical, and it is the number you trade against latency and memory.`,
        `<strong>Rough threshold:</strong> brute force up to around a million vectors per query path; an ANN index beyond that or at high query rates.`,
      ] },
    ],
  },
  {
    id: `pipeline`,
    title: `The embedding pipeline in a design`,
    kicker: `Applying it`,
    blocks: [
      { type: `text`, html: `<p>Most interview prompts that involve embeddings (semantic search, retrieval for an LLM answer, "more like this", near-duplicate detection) care more about the pipeline around the index than about the index itself.</p>` },
      { type: `steps`, title: `Ingest and query`, items: [
        `<strong>Chunk:</strong> split long documents into passages of a few hundred tokens, with some overlap so ideas aren't cut in half.`,
        `<strong>Embed:</strong> run each chunk through the model, usually from a queue so slow model calls don't block writes.`,
        `<strong>Store:</strong> save the vector with metadata: document ID, tenant, permissions, timestamps. Filters at query time depend on this.`,
        `<strong>Query:</strong> embed the user's query with the same model, run a filtered top-k search, optionally merge with keyword results and rerank.`,
        `<strong>Keep fresh:</strong> re-embed chunks when documents change, driven by change events from the source database.`,
      ] },
      { type: `callout`, tone: `warning`, title: `Changing the model is a migration`, html: `<p>Upgrading the embedding model means re-embedding the entire corpus, because old and new vectors live in different spaces. Build a new index in parallel with a backfill job, write new items to both, compare quality, switch reads, then drop the old index. Budget the GPU time.</p>` },
      { type: `keypoints`, title: `Common mistakes`, items: [
        `Proposing a B-tree or full-text index for semantic similarity.`,
        `Jumping to a dedicated vector database for a few hundred thousand vectors that a brute-force scan or pgvector handles easily.`,
        `Forgetting metadata, so tenant and permission filters can't be applied.`,
        `Mixing vectors from two model versions in one index.`,
      ] },
    ],
  },
];
