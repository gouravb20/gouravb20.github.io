// Main tab: Chapter 7, ANN indexes and vector databases in practice. Format: DeepSection[] in public/shared/notes.d.ts.
window.MAIN = window.MAIN || {};
MAIN.ch7 = [
  {
    id: `the-bargain`,
    title: `Trade a little recall for a lot of speed`,
    kicker: `Mental model`,
    blocks: [
      { type: `text`, html: `<p>An approximate nearest-neighbour index avoids comparing the query with every vector. It organises vectors so that a search can jump to the right neighbourhood and examine only a small slice of the data. The price is that it occasionally misses one of the true nearest neighbours. Giving up a few percent of recall for a hundredfold reduction in work is the central bargain of every vector database, and you tune it with a handful of parameters.</p>
<p>In an interview, the index internals matter less than three practical questions: <strong>how much memory</strong> will this take, <strong>how will filters work</strong>, and <strong>where should the vectors live</strong>. Know two index families well enough to explain them, then spend your time on those.</p>` },
    ],
  },
  {
    id: `ivf-and-hnsw`,
    title: `IVF and HNSW, the two families to know`,
    kicker: `Indexes`,
    blocks: [
      { type: `compare`, items: [
        { title: `IVF: cluster, then probe`, tone: `info`, html: `<p>Run k-means to split the vectors into nlist clusters and file each vector under its nearest centroid. A query finds the nprobe closest centroids and scans only those clusters. Memory overhead is small and it pairs well with compression. Its weakness: a true neighbour sitting just across a cluster boundary is missed unless you probe more clusters, and cost rises roughly linearly with nprobe.</p>` },
        { title: `HNSW: walk a graph`, tone: `ok`, html: `<p>Every vector is a node linked to about M of its nearest neighbours. A few nodes are also promoted into sparse upper layers with long links, like express lanes. A search enters at the top, greedily hops toward the query, drops a layer when it can't get closer, and at the bottom keeps a candidate list of size efSearch. High recall at low latency; the default in pgvector, Elasticsearch, Qdrant and others. The costs are memory for the links and slow builds.</p>` },
      ] },
      { type: `table`, title: `The knobs you tune`, headers: [`Parameter`, `Index`, `Raising it`], rows: [
        [`nprobe`, `IVF`, `Searches more clusters: higher recall, proportionally slower`],
        [`nlist`, `IVF`, `More, smaller clusters; often set near the square root of N`],
        [`M`, `HNSW`, `More links per node: better recall, more memory`],
        [`efSearch`, `HNSW`, `Larger candidate list per query: higher recall, slower queries`],
        [`efConstruction`, `HNSW`, `Better graph quality, slower index builds`],
      ] },
      { type: `text`, html: `<p><strong>Product quantization</strong> is the third tool, usually combined with IVF. It cuts each vector into sub-vectors and replaces each one with a 1-byte code from a small codebook, shrinking vectors 10 to 60 times so billions fit in memory. Recall drops, so systems often re-rank the top few hundred candidates using the full vectors.</p>` },
    ],
  },
  {
    id: `memory-first`,
    title: `Estimate memory before anything else`,
    kicker: `Worked example`,
    blocks: [
      { type: `text`, html: `<p>HNSW works best entirely in RAM, so memory usually decides the design: one Postgres server, a sharded cluster, or compressed vectors. Do the arithmetic out loud.</p>` },
      { type: `steps`, title: `Sizing 50 million 1,536-dimension embeddings`, items: [
        `Raw vectors: 50M &times; 1,536 &times; 4 bytes &asymp; <strong>307 GB</strong>.`,
        `HNSW links with M = 16: roughly 50M &times; 128 bytes &asymp; <strong>6 GB</strong> more, plus IDs and metadata.`,
        `Add headroom for growth and rebuilds: call it about 400 GB, which is several nodes or one very large machine.`,
        `Alternative: product quantization to 96 bytes per vector brings the vectors to about <strong>5 GB</strong>, with full vectors on disk for re-ranking.`,
        `Decision: at this scale, a sharded vector database or IVF-PQ; at 2 million vectors (about 12 GB raw), pgvector on one server is plenty.`,
      ] },
    ],
  },
  {
    id: `filters-and-placement`,
    title: `Filters, hybrid search and where vectors live`,
    kicker: `Production concerns`,
    blocks: [
      { type: `text`, html: `<p>Almost every real query carries a filter: this tenant, documents this user may see, products in stock under a price. How the filter combines with the ANN search is where naive designs break.</p>` },
      { type: `compare`, items: [
        { title: `Post-filter`, tone: `bad`, html: `<p>Run ANN for the top k, then drop results that fail the filter. With a selective filter most of the k disappear and the user gets two results, or none.</p>` },
        { title: `Pre-filter`, tone: `warn`, html: `<p>Apply the filter first, then search only matching vectors. Correct, but if the matching set is large and has no index of its own, it degrades into brute force.</p>` },
        { title: `Filter during the search`, tone: `ok`, html: `<p>The engine skips non-matching nodes while walking the graph or scanning clusters. Or partition the index by tenant so every query stays inside one partition. This is what good engines do.</p>` },
      ] },
      { type: `keypoints`, items: [
        `<strong>Hybrid search:</strong> vectors miss exact terms like product codes and names; keyword search misses paraphrases. Run both, merge the rankings (reciprocal rank fusion is the usual method), and optionally rerank.`,
        `<strong>Freshness:</strong> HNSW accepts inserts incrementally, but deletes are tombstoned until a rebuild. If a just-uploaded document must be searchable immediately, design for it.`,
        `<strong>Sharding:</strong> a query fans out to every shard and merges the per-shard top k, with fan-out tail latency. Sharding by tenant keeps most queries on one shard.`,
      ] },
      { type: `callout`, tone: `interview`, title: `Decision rule`, html: `<p>"Start with <strong>pgvector</strong> when vectors number in the millions, sit next to relational data I filter and join on, and query rates are moderate: one database, transactions, backups. Move to a <strong>dedicated vector database</strong> when memory outgrows a node, or I need sharding, quantization, high query rates or built-in hybrid search. If the product is already document search on Elasticsearch, use its kNN support." Always lead with the memory estimate.</p>` },
    ],
  },
];
