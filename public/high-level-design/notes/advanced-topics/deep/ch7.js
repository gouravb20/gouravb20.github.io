// Deep dive: Chapter 7, ANN indexes and vector databases in practice. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch7 = {
  hook: `<p>This chapter covers the approximate nearest neighbour indexes (IVF, HNSW, product quantization) that let vector databases answer in milliseconds by examining only a few thousand candidates, plus the practical issues that decide a design: memory, filters, freshness and where vectors live.</p>`,
  sections: [
    {
      id: "ivf",
      title: "The ANN families, and IVF",
      kicker: "Partitioning",
      blocks: [
        {
          type: "text",
          html: `<p>An <strong>ANN index</strong> gives up exact top k for touching a tiny fraction of vectors, measured by <code>recall@k</code> against brute force on sample queries (usually 95-99%). It either partitions (IVF), navigates a graph (HNSW) or compresses (quantization), often in combination.</p>`,
        },
        {
          type: "table",
          title: "The index families at a glance",
          headers: ["Index", "Core idea", "Recall and speed", "Memory", "Typical role"],
          rows: [
            ["Flat (brute force)", "Compare with everything", "100% recall, slow at scale", "Raw vectors only", "Small sets, filtered subsets, ground truth"],
            ["IVF", "Cluster, then probe the nearest clusters", "Tunable with nprobe", "Raw vectors plus small centroid table", "Large sets, often with PQ"],
            ["HNSW", "Greedy walk on a layered neighbour graph", "High recall, very fast", "Raw vectors plus graph links", "The default for in-memory search"],
            ["PQ", "Replace sub-vectors with 1-byte codes", "Lower; rerank to recover", "10-60x smaller", "Billion-scale, memory-bound"],
            ["LSH", "Similar vectors share hash buckets", "Moderate", "Many hash tables", "Mostly historical (poor recall per byte)"],
          ],
        },
        {
          type: "steps",
          title: "How an inverted file (IVF) index works",
          items: [
            "<strong>Train:</strong> k-means on a sample finds <code>nlist</code> centroids.",
            "<strong>Assign:</strong> each vector joins its nearest centroid's inverted list.",
            "<strong>Query:</strong> compare with all centroids (cheap), then scan the <code>nprobe</code> nearest lists and keep the best k.",
          ],
        },
        {
          type: "diagram",
          title: "Why nprobe = 1 can miss the true neighbour",
          caption: "Six clusters with their centroids (X). The query's nearest centroid is in the middle-top cell, so with nprobe = 1 only that cell is scanned. The true nearest neighbour sits just across the boundary in the next cell and is only found with nprobe = 2.",
          svg: `<svg viewBox="0 0 600 300" role="img" aria-label="IVF clusters with a query near a cluster boundary">
<rect x="147" y="20" width="126" height="130" style="fill: var(--dg-2-soft)"/>
<rect x="273" y="20" width="127" height="130" style="fill: var(--dg-4-soft)"/>
<rect x="20" y="20" width="380" height="260" rx="6" fill="none" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<line x1="147" y1="20" x2="147" y2="280" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<line x1="273" y1="20" x2="273" y2="280" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<line x1="20" y1="150" x2="400" y2="150" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<g stroke-width="2.5" style="stroke: var(--dg-ink)">
<path d="M77 79 L89 91 M89 79 L77 91"/><path d="M204 79 L216 91 M216 79 L204 91"/><path d="M331 79 L343 91 M343 79 L331 91"/>
<path d="M77 209 L89 221 M89 209 L77 221"/><path d="M204 209 L216 221 M216 209 L204 221"/><path d="M331 209 L343 221 M343 209 L331 221"/>
</g>
<g style="fill: var(--dg-muted)">
<circle cx="50" cy="50" r="4"/><circle cx="110" cy="120" r="4"/><circle cx="60" cy="130" r="4"/>
<circle cx="180" cy="60" r="4"/><circle cx="230" cy="48" r="4"/><circle cx="200" cy="122" r="4"/><circle cx="168" cy="100" r="4"/>
<circle cx="320" cy="50" r="4"/><circle cx="370" cy="120" r="4"/><circle cx="350" cy="40" r="4"/>
<circle cx="60" cy="250" r="4"/><circle cx="120" cy="190" r="4"/>
<circle cx="180" cy="250" r="4"/><circle cx="245" cy="185" r="4"/>
<circle cx="310" cy="250" r="4"/><circle cx="380" cy="190" r="4"/>
</g>
<circle cx="282" cy="104" r="6" style="fill: var(--dg-ok); stroke: var(--dg-ink)" stroke-width="1"/>
<rect x="256" y="104" width="12" height="12" transform="rotate(45 262 110)" style="fill: var(--dg-bad); stroke: var(--dg-ink)" stroke-width="1"/>
<text x="425" y="44" font-size="13" font-weight="700">Legend</text>
<rect x="425" y="58" width="16" height="16" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="450" y="71" font-size="12">scanned, nprobe = 1</text>
<rect x="425" y="86" width="16" height="16" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/>
<text x="450" y="99" font-size="12">added at nprobe = 2</text>
<path d="M427 120 L439 132 M439 120 L427 132" stroke-width="2.5" style="stroke: var(--dg-ink)"/>
<text x="450" y="131" font-size="12">centroid</text>
<rect x="427" y="148" width="12" height="12" transform="rotate(45 433 154)" style="fill: var(--dg-bad); stroke: var(--dg-ink)" stroke-width="1"/>
<text x="450" y="159" font-size="12">query</text>
<circle cx="433" cy="182" r="6" style="fill: var(--dg-ok); stroke: var(--dg-ink)" stroke-width="1"/>
<text x="450" y="186" font-size="12">true nearest</text>
<text x="450" y="202" font-size="12">neighbour</text>
<text x="425" y="240" font-size="12" style="fill: var(--dg-muted)">Boundary cases are</text>
<text x="425" y="257" font-size="12" style="fill: var(--dg-muted)">where IVF loses recall.</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>Work per query is about <code>nlist + nprobe &times; N / nlist</code>. pgvector suggests <code>lists = rows / 1000</code> up to a million rows (<code>&radic;rows</code> beyond) and <code>probes = &radic;lists</code>. For 1 million vectors: 1,000 lists, 32 probes, about 33,000 comparisons, 3% of brute force.</p>`,
        },
        {
          type: "lab",
          id: "ivfRecall",
          caption: "Cluster 3,000 vectors into nlist lists, then raise nprobe and watch recall climb as the query scans neighbouring lists. Note how the misses are always near a boundary.",
        },
        {
          type: "tradeoffs",
          pros: [
            "Little memory beyond the vectors: a centroid table and list IDs",
            "Pairs naturally with compression (IVF-PQ) for billion-scale collections",
            "Lists are easy to put on disk or spread across machines",
          ],
          cons: [
            "Needs training, and clusters drift as data changes",
            "Boundary neighbours are lost first; recall depends on probing enough lists",
            "Usually slower than HNSW in memory at the same recall",
          ],
        },
      ],
    },
    {
      id: "hnsw",
      title: "HNSW: a navigable graph with express lanes",
      kicker: "Graph search",
      blocks: [
        {
          type: "idea",
          html: `<p>Link each vector to a few near neighbours and greedily hop toward the query. Sparse upper layers with long links, like a skip list, cross the space in a few hops (Malkov and Yashunin, 2016). Each node gets a random top layer, so each layer up holds about 1/M as many nodes.</p>`,
        },
        {
          type: "diagram",
          title: "Searching three layers of an HNSW graph",
          caption: "The search enters at the top layer, hops toward the query along long links, drops a layer whenever it cannot get closer, and finishes with a short local walk on the bottom layer, which contains every vector.",
          svg: `<svg viewBox="0 0 620 310" role="img" aria-label="Three-layer HNSW graph with a highlighted greedy search path">
<rect x="10" y="25" width="600" height="75" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<rect x="10" y="110" width="600" height="75" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<rect x="10" y="195" width="600" height="105" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="22" y="58" font-size="13" font-weight="700">Layer 2</text>
<text x="22" y="76" font-size="12" style="fill: var(--dg-muted)">few nodes</text>
<text x="22" y="143" font-size="13" font-weight="700">Layer 1</text>
<text x="22" y="161" font-size="12" style="fill: var(--dg-muted)">more nodes</text>
<text x="22" y="236" font-size="13" font-weight="700">Layer 0</text>
<text x="22" y="254" font-size="12" style="fill: var(--dg-muted)">every vector</text>
<g stroke-width="1" stroke-dasharray="3 4" style="stroke: var(--dg-line)">
<line x1="150" y1="62" x2="150" y2="245"/><line x1="450" y1="62" x2="450" y2="245"/>
<line x1="300" y1="150" x2="300" y2="245"/><line x1="540" y1="150" x2="540" y2="245"/>
</g>
<g stroke-width="1.5" style="stroke: var(--dg-muted)">
<line x1="150" y1="150" x2="300" y2="150"/><line x1="300" y1="150" x2="450" y2="150"/>
<line x1="150" y1="245" x2="200" y2="245"/><line x1="200" y1="245" x2="250" y2="245"/><line x1="250" y1="245" x2="300" y2="245"/>
<line x1="300" y1="245" x2="350" y2="245"/><line x1="350" y1="245" x2="400" y2="245"/><line x1="400" y1="245" x2="450" y2="245"/>
<line x1="540" y1="245" x2="580" y2="245"/>
<path d="M200 245 Q250 215 300 245" fill="none"/><path d="M400 245 Q470 215 540 245" fill="none"/>
</g>
<g stroke-width="4" style="stroke: var(--dg-bad)">
<line x1="150" y1="62" x2="450" y2="62"/>
<line x1="450" y1="62" x2="450" y2="150"/>
<line x1="450" y1="150" x2="540" y2="150"/>
<line x1="540" y1="150" x2="540" y2="245"/>
<line x1="540" y1="245" x2="490" y2="245"/>
</g>
<line x1="450" y1="245" x2="490" y2="245" stroke-width="1.5" style="stroke: var(--dg-muted)"/>
<g style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2">
<circle cx="150" cy="62" r="9"/><circle cx="450" cy="62" r="9"/>
<circle cx="150" cy="150" r="8"/><circle cx="300" cy="150" r="8"/><circle cx="450" cy="150" r="8"/><circle cx="540" cy="150" r="8"/>
<circle cx="150" cy="245" r="7"/><circle cx="200" cy="245" r="7"/><circle cx="250" cy="245" r="7"/><circle cx="300" cy="245" r="7"/>
<circle cx="350" cy="245" r="7"/><circle cx="400" cy="245" r="7"/><circle cx="450" cy="245" r="7"/><circle cx="540" cy="245" r="7"/><circle cx="580" cy="245" r="7"/>
</g>
<circle cx="490" cy="245" r="8" style="fill: var(--dg-ok); stroke: var(--dg-ink)" stroke-width="1.5"/>
<text x="150" y="44" text-anchor="middle" font-size="12" font-weight="700">entry</text>
<rect x="499" y="268" width="12" height="12" transform="rotate(45 505 274)" style="fill: var(--dg-bad); stroke: var(--dg-ink)" stroke-width="1"/>
<text x="522" y="279" font-size="12" font-weight="700">query</text>
<text x="482" y="279" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">nearest found</text>
</svg>`,
        },
        {
          type: "keypoints",
          items: [
            "<strong>Search:</strong> greedy walk on each layer until no neighbour is closer, drop a layer, and on layer 0 keep a candidate list of size <code>efSearch</code> before returning the top k.",
            "<code>M</code> (links per node; pgvector default 16): more recall and memory, slower inserts. <code>efConstruction</code> (pgvector 64): graph quality at build time. <code>efSearch</code> (<code>hnsw.ef_search</code>, default 40): the per-query recall-latency dial.",
            "<strong>Costs are memory and build time:</strong> about 2 &times; M 4-byte links on layer 0 adds roughly 128 bytes per vector at M = 16; it wants to be fully in RAM, and deletes are tombstones until a rebuild.",
            "Used by pgvector (since 0.5.0), Lucene per segment (Elasticsearch, OpenSearch), Qdrant, Weaviate, Milvus, FAISS and hnswlib.",
          ],
        },
        {
          type: "lab",
          id: "hnswSearch",
          caption: "Build the bottom layer of an HNSW-style graph point by point, then run greedy searches from a fixed entry point. Raise M and ef and watch recall@5 rise along with the number of distance computations.",
        },
        {
          type: "quiz",
          q: "Your HNSW index meets latency targets but recall@10 is only 88%. Which change most directly raises recall without rebuilding the index?",
          options: [
            "Lower M",
            "Raise efSearch",
            "Lower efConstruction",
            "Switch the metric from cosine to L2",
          ],
          answer: 1,
          explain: "efSearch is a query-time parameter: a bigger candidate list explores more of the bottom layer and finds more true neighbours, at some latency cost. M and efConstruction shape the graph and require a rebuild to change, and changing the metric changes what 'nearest' means rather than improving recall.",
        },
      ],
    },
    {
      id: "quantization-and-memory",
      title: "Memory sizing and quantization",
      kicker: "Fitting it in RAM",
      blocks: [
        {
          type: "keypoints",
          title: "Sizing 100 million 768-d float32 vectors",
          items: [
            "Raw vectors: 10<sup>8</sup> &times; 768 &times; 4 B = <strong>307 GB</strong>; HNSW links at M = 16 about 13 GB; IDs and metadata about 6 GB.",
            "With 30% headroom, about <strong>424 GB</strong>: three 192 GB nodes before replication. The vectors dominate, so store fewer bytes per vector.",
          ],
        },
        {
          type: "text",
          html: `<p><strong>Product quantization</strong> (J&eacute;gou, Douze and Schmid, 2011) splits a vector into <code>m</code> sub-vectors and replaces each with the 1-byte ID of its nearest centroid in a 256-entry codebook. With d = 768 and m = 96, 3,072 bytes become 96 (<strong>32x</strong>), so 307 GB becomes about 10 GB. Distances become 96 lookups in a per-query table of sub-vector-to-centroid distances.</p>`,
        },
        {
          type: "diagram",
          title: "Product quantization: 3,072 bytes become 96",
          caption: "A 768-dimension vector is cut into 96 sub-vectors of 8 floats. Each is replaced by the index of its nearest centroid in that position's 256-entry codebook, one byte per sub-vector.",
          svg: `<svg viewBox="0 0 600 230" role="img" aria-label="A vector split into sub-vectors, each replaced by a one-byte codebook index">
<defs><marker id="at7-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<text x="40" y="30" font-size="13" font-weight="700">Original vector: 768 float32 values</text>
<g style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5">
<rect x="40" y="42" width="80" height="40"/><rect x="120" y="42" width="80" height="40"/><rect x="200" y="42" width="80" height="40"/>
<rect x="360" y="42" width="80" height="40"/><rect x="440" y="42" width="80" height="40"/>
</g>
<text x="80" y="67" text-anchor="middle" font-size="12">8 floats</text>
<text x="160" y="67" text-anchor="middle" font-size="12">8 floats</text>
<text x="240" y="67" text-anchor="middle" font-size="12">8 floats</text>
<text x="320" y="67" text-anchor="middle" font-size="14" font-weight="700">...</text>
<text x="400" y="67" text-anchor="middle" font-size="12">8 floats</text>
<text x="480" y="67" text-anchor="middle" font-size="12">8 floats</text>
<text x="530" y="67" font-size="12" style="fill: var(--dg-muted)">3,072 B</text>
<g stroke-width="1.5" style="stroke: var(--dg-muted)">
<line x1="80" y1="84" x2="80" y2="136" marker-end="url(#at7-arrow)"/><line x1="160" y1="84" x2="160" y2="136" marker-end="url(#at7-arrow)"/>
<line x1="240" y1="84" x2="240" y2="136" marker-end="url(#at7-arrow)"/><line x1="400" y1="84" x2="400" y2="136" marker-end="url(#at7-arrow)"/>
<line x1="480" y1="84" x2="480" y2="136" marker-end="url(#at7-arrow)"/>
</g>
<rect x="168" y="96" width="264" height="22" rx="4" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="300" y="111" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">nearest of 256 centroids per sub-space</text>
<g style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5">
<rect x="55" y="140" width="50" height="34" rx="4"/><rect x="135" y="140" width="50" height="34" rx="4"/><rect x="215" y="140" width="50" height="34" rx="4"/>
<rect x="375" y="140" width="50" height="34" rx="4"/><rect x="455" y="140" width="50" height="34" rx="4"/>
</g>
<text x="80" y="162" text-anchor="middle" font-size="12" font-weight="700">17</text>
<text x="160" y="162" text-anchor="middle" font-size="12" font-weight="700">203</text>
<text x="240" y="162" text-anchor="middle" font-size="12" font-weight="700">4</text>
<text x="320" y="162" text-anchor="middle" font-size="14" font-weight="700">...</text>
<text x="400" y="162" text-anchor="middle" font-size="12" font-weight="700">88</text>
<text x="480" y="162" text-anchor="middle" font-size="12" font-weight="700">141</text>
<text x="530" y="162" font-size="12" style="fill: var(--dg-muted)">96 B</text>
<text x="40" y="205" font-size="12" style="fill: var(--dg-muted)">Codes: sub-vectors 1, 2, 3 ... 95, 96, one byte each. 32x smaller.</text>
</svg>`,
        },
        {
          type: "keypoints",
          items: [
            "<strong>Rerank:</strong> retrieve a few hundred candidates with codes, then recompute exact distances from full vectors on SSD or a cheaper tier.",
            "<strong>Scalar</strong> (int8, 4x, small loss) and <strong>binary</strong> (1 bit per dimension, 32x, coarse, needs reranking) quantization are simpler options.",
            "<strong>DiskANN</strong> (Microsoft, 2019) keeps compressed vectors in RAM for navigation and full vectors plus graph on SSD.",
          ],
        },
        {
          type: "lab",
          id: "vectorMemory",
          caption: "Set vector count, dimensions, precision and index type, and see the memory footprint and node count. Find the point where pgvector on one server stops being enough, and how much quantization buys back.",
        },
        {
          type: "table",
          title: "Bytes per 768-dimension vector",
          headers: ["Representation", "Bytes", "100M vectors", "Recall impact"],
          rows: [
            ["float32", "3,072", "307 GB", "None (baseline)"],
            ["float16 (half precision)", "1,536", "154 GB", "Usually negligible"],
            ["int8 scalar quantization", "768", "77 GB", "Small"],
            ["PQ, 96 sub-vectors", "96", "9.6 GB", "Noticeable; rerank recovers most"],
            ["Binary, 1 bit per dimension", "96", "9.6 GB", "Large; needs reranking"],
          ],
          note: "Index overhead (graph links, centroids) and metadata come on top of these figures.",
        },
      ],
    },
    {
      id: "filters-and-placement",
      title: "Filters, hybrid search, freshness and placement",
      kicker: "Where designs break",
      blocks: [
        {
          type: "compare",
          title: "Combining a filter (tenant, permissions, price) with ANN search",
          items: [
            { title: "Post-filter", tone: "bad", html: "Search top k, then drop non-matches. Broken for selective filters: if 1% of vectors match, a top-10 may return nothing. (pgvector behaves like this by default; 0.8.0+ adds iterative index scans.)" },
            { title: "Pre-filter", tone: "warn", html: "Find matching vectors first, then search only them. Correct; brute force over a small matching set is fast and exact, but a large unindexed set is slow." },
            { title: "Filter during traversal", tone: "ok", html: "The index checks the filter while exploring, still walking non-matching nodes to navigate (Qdrant, Weaviate). Or <strong>partition by tenant</strong> when every query names one." },
          ],
        },
        {
          type: "keypoints",
          items: [
            "<strong>Hybrid search</strong> runs BM25 (exact tokens, SKUs, names) and vectors (paraphrase), merged with <strong>reciprocal rank fusion</strong>: <code>score(d) = &Sigma; 1 / (k + rank<sub>i</sub>(d))</code>, k = 60. Appearing in both lists beats topping one; a cross-encoder can rerank the merged top 50.",
            "<strong>Freshness:</strong> HNSW inserts rewire links and slow under bursts; IVF clusters age. Buffer new vectors in a small brute-force segment searched alongside the main index and merge later (Milvus growing vs sealed segments, Lucene per-segment graphs); tombstone deletes.",
            "<strong>Sharding:</strong> by tenant keeps queries on one shard; random sharding means scatter-gather where each shard returns a full top k and the slowest shard sets latency.",
          ],
        },
        {
          type: "code",
          lang: "sql",
          title: "Vectors next to relational data in pgvector (<=> is cosine distance)",
          code: `CREATE EXTENSION vector;

CREATE TABLE doc_chunks (
  id         bigserial PRIMARY KEY,
  tenant_id  bigint NOT NULL,
  doc_id     bigint NOT NULL REFERENCES documents(id),
  content    text,
  embedding  vector(768)
);

CREATE INDEX ON doc_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

SET hnsw.ef_search = 80;          -- per session: more recall, more latency
SELECT id, doc_id, content
FROM doc_chunks
WHERE tenant_id = $1
ORDER BY embedding <=> $2         -- <=> is cosine distance
LIMIT 10;`,
        },
        {
          type: "compare",
          title: "Where vectors live",
          items: [
            { title: "pgvector", tone: "ok", html: "One system with transactions, joins, backups and row-level security. Good for millions to low tens of millions at moderate QPS; indexed vectors up to 2,000 dimensions. Limited by one node's memory and competition with OLTP." },
            { title: "Dedicated vector database", tone: "info", html: "Pinecone, Milvus, Qdrant, Weaviate add sharding, replication, quantization, filtered and hybrid search. Worth it at hundreds of millions, high QPS or strict tenant isolation; another system to sync (via CDC from the source of truth)." },
            { title: "Search engine kNN", tone: "info", html: "Elasticsearch and OpenSearch add HNSW kNN beside keyword search, making hybrid natural if documents are already indexed there." },
          ],
        },
        {
          type: "quiz",
          q: "A multi-tenant index holds 20 million vectors across 2,000 tenants of roughly equal size. Queries always specify a tenant. Which design gives correct top-10 results most cheaply?",
          options: [
            "One global HNSW index with post-filtering by tenant",
            "Partition by tenant: each query searches only that tenant's ~10,000 vectors, by brute force or a small index",
            "One global IVF index with nprobe = 1",
            "Store tenant ID inside the vector as an extra dimension",
          ],
          answer: 1,
          explain: "Each tenant is about 0.05% of the data, so a global top-10 with post-filtering almost always returns nothing useful. Partitioning by tenant makes every search small and exact. Encoding the tenant as a dimension only nudges distances and does not guarantee isolation.",
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
          html: `<p>Lead with numbers, not HNSW internals. A strong answer:</p>
<ol>
<li><strong>Size:</strong> N &times; d &times; 4 bytes. 100M &times; 768 is about 307 GB raw, so not one ordinary node.</li>
<li><strong>Index:</strong> HNSW for in-memory, high-recall search (tune <code>efSearch</code>); IVF-PQ with reranking when memory binds at billions (2 billion 512-d vectors at 64 bytes of PQ is about 128 GB in RAM).</li>
<li><strong>Filters:</strong> metadata inside the search or per-tenant partitions, never post-filtering a global top k.</li>
<li><strong>Freshness:</strong> a small fresh segment beside the main index, tombstoned deletes, periodic rebuilds.</li>
<li><strong>Placement:</strong> pgvector while it fits beside relational data; a dedicated system for scale, QPS or features.</li>
</ol>
<p>IVF versus HNSW in one breath: IVF is memory-light and pairs with compression but needs enough probes; HNSW gives better recall per latency and easy inserts at the cost of memory and build time.</p>`,
        },
      ],
    },
  ],
  takeaways: [
    "ANN indexes trade a few percent of recall@k for orders of magnitude less work; measure recall against brute force on sample queries.",
    "IVF scans the nprobe nearest k-means lists: memory-light, pairs with PQ, loses neighbours near boundaries. HNSW walks a layered graph: high recall at low latency (M, efConstruction, efSearch) but wants RAM.",
    "Size first (100M &times; 768 float32 is about 307 GB); product quantization cuts that 10-60x, with reranking to recover recall.",
    "Filter inside the search or partition by tenant; post-filtering a global top k fails for selective filters. Hybrid search with reciprocal rank fusion covers what each method misses.",
    "Start with pgvector when vectors sit beside relational data in the millions; move to a dedicated vector database for scale, QPS or isolation.",
  ],
  furtherReading: [
    { title: "Efficient and robust approximate nearest neighbor search using Hierarchical Navigable Small World graphs (Malkov and Yashunin)", url: "https://arxiv.org/abs/1603.09320", note: "The HNSW paper: layers, greedy search and the heuristics for choosing neighbours." },
    { title: "Product Quantization for Nearest Neighbor Search (J&eacute;gou, Douze, Schmid, 2011)", note: "The original PQ paper, including asymmetric distance computation and IVF-ADC." },
    { title: "pgvector", url: "https://github.com/pgvector/pgvector", note: "README covers HNSW and IVFFlat parameters, distance operators and filtering behaviour." },
    { title: "FAISS", url: "https://github.com/facebookresearch/faiss", note: "Meta's library of ANN indexes; its wiki explains how to choose and combine them." },
  ],
};
