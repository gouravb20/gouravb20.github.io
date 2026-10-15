// Deep dive: Chapter 7, ANN indexes and vector databases in practice. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch7 = {
  hook: `<p>Your shopping app lets people photograph a pair of sneakers and find similar products. The catalog has 100 million product images, each embedded as 768 floats. A brute-force search would read about 300 GB of vectors for <em>every</em> photo a user takes, and on a busy evening there are hundreds of searches a second. No cluster you can afford scans that much memory that often.</p>
<p>Yet vector databases answer this kind of query in milliseconds. They do it by refusing to look at most of the data: they jump to the right neighbourhood and examine only a few thousand candidates, accepting that once in a while they miss a true nearest neighbour. This chapter opens up the indexes that make that possible (IVF, HNSW and product quantization) and the practical problems that decide whether a design works: memory, filters, freshness, and where the vectors should live.</p>`,
  sections: [
    {
      id: "the-ann-bargain",
      title: "The ANN bargain: a little recall for a lot of speed",
      kicker: "The problem",
      blocks: [
        {
          type: "problem",
          html: `<p>Exact nearest-neighbour search compares the query with every vector, so its cost grows linearly with the collection. Spatial trees stop pruning in hundreds of dimensions. At hundreds of millions of vectors, exact search is simply too slow and too expensive per query.</p>`,
        },
        {
          type: "text",
          html: `<p>An <strong>approximate nearest neighbour</strong> (ANN) index gives up the guarantee of finding the exact top k in exchange for examining a tiny fraction of the vectors. The quality metric is <span class="formula">recall@k</span>: of the true k nearest neighbours, what fraction did the index return? Production systems usually aim for 95-99%, and measure it against a brute-force run on a sample of queries.</p>
<p>Every ANN index is built on one of a few ideas. <strong>Partition</strong> the space into regions and search only the regions near the query (IVF). <strong>Navigate</strong> a graph of neighbours, hopping ever closer to the query (HNSW). <strong>Compress</strong> the vectors so far more of them fit in memory and each comparison is cheaper (quantization). And historically, <strong>hash</strong> so similar vectors collide (LSH). Real systems combine them, for example IVF partitions holding compressed vectors.</p>`,
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
            ["LSH", "Similar vectors share hash buckets", "Moderate", "Many hash tables", "Mostly historical"],
          ],
        },
        {
          type: "text",
          html: `<h3>A short note on LSH</h3>
<p>Locality-sensitive hashing was the first widely studied approach. For cosine similarity, pick random hyperplanes and record which side of each one a vector falls on; vectors with a small angle between them tend to land on the same side of most hyperplanes, so their bit patterns collide. It is simple and shards easily, but to reach high recall you need many hash tables, which costs a lot of memory. Graph and cluster indexes give much better recall per byte, which is why modern vector databases rarely use LSH as their primary index.</p>`,
        },
      ],
    },
    {
      id: "ivf",
      title: "IVF: search only the nearest clusters",
      kicker: "Partitioning",
      blocks: [
        {
          type: "idea",
          html: `<p>Group the vectors into clusters ahead of time. At query time, find the few cluster centres closest to the query and scan only the vectors in those clusters. If the clusters are good, the true neighbours are almost always inside them.</p>`,
        },
        {
          type: "steps",
          title: "How an inverted file index works",
          items: [
            "<strong>Train:</strong> run k-means on a sample of the vectors to find <code>nlist</code> centroids.",
            "<strong>Assign:</strong> put each vector in the list of its nearest centroid. Each list is an \"inverted list\", like a posting list in a search engine, which is where the name comes from.",
            "<strong>Query, coarse step:</strong> compare the query with all <code>nlist</code> centroids (cheap; there are only thousands).",
            "<strong>Query, fine step:</strong> scan the vectors in the <code>nprobe</code> nearest lists and keep the best k.",
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
          html: `<h3>Picking nlist and nprobe</h3>
<p>More lists make each list smaller (faster scans) but put more true neighbours just across a boundary, so you need a larger <code>nprobe</code> to keep recall. The work per query is roughly <span class="formula">nlist + nprobe &times; N / nlist</span> distance computations: the coarse step plus the lists you scan. pgvector's documentation suggests starting with <code>lists = rows / 1000</code> up to a million rows and <code>&radic;rows</code> beyond that, with <code>probes = &radic;lists</code>.</p>
<p>Worked example: 1 million vectors gives 1,000 lists of about 1,000 vectors each. With 32 probes the query does 1,000 centroid comparisons plus 32,000 vector comparisons, about 3% of a brute-force scan. Raising probes improves recall and costs roughly linearly; you tune the dial until you hit your recall target at acceptable latency.</p>`,
        },
        {
          type: "lab",
          id: "ivfRecall",
          caption: "Cluster 3,000 vectors into nlist lists, then raise nprobe and watch recall climb as the query scans neighbouring lists. Note how the misses are always near a boundary.",
        },
        {
          type: "tradeoffs",
          pros: [
            "Very little memory beyond the vectors: just the centroid table and list IDs",
            "Combines naturally with compression (IVF-PQ) for billion-scale collections",
            "Lists are easy to place on disk or spread across machines",
          ],
          cons: [
            "Needs a training step; clusters drift as the data distribution changes, so it may need retraining",
            "Recall depends on probing enough lists, and boundary neighbours are the first to be lost",
            "At the same recall, usually slower than HNSW for in-memory search",
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
          html: `<p>Connect every vector to a handful of its nearest neighbours. To search, start anywhere and keep hopping to whichever neighbour is closer to the query; you quickly home in on the right neighbourhood. Add a few sparse upper layers with long links, like a skip list, so the first hops cross the whole space in a few steps.</p>`,
        },
        {
          type: "text",
          html: `<p><strong>Hierarchical Navigable Small World</strong> graphs were described by Yury Malkov and Dmitry Yashunin in 2016. The bottom layer contains every vector, each linked to up to <code>M</code> close neighbours (commonly twice that on layer 0). When a vector is inserted it is also given a random top layer, with the probability of reaching each higher layer shrinking geometrically, so each layer up holds roughly 1/M as many nodes as the one below. Upper layers are sparse, and their links span long distances.</p>`,
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
          type: "steps",
          title: "One search, step by step",
          items: [
            "Start at the fixed entry point on the top layer.",
            "Greedy step: look at the current node's neighbours on this layer; move to the one closest to the query. Repeat until no neighbour is closer.",
            "Drop to the next layer at the same node and repeat the greedy walk with that layer's shorter links.",
            "On layer 0, switch from a single current node to a candidate list of size <code>efSearch</code>: keep exploring neighbours of the best unexplored candidates until none can improve the list, then return the top k.",
          ],
        },
        {
          type: "text",
          html: `<h3>The three knobs</h3>
<ul>
<li><code>M</code>: links per node. More links mean better recall and robustness but more memory and slower inserts. 16 is a common default (pgvector's default is 16).</li>
<li><code>efConstruction</code>: the candidate list size used while inserting. Larger builds a better graph, slower. pgvector defaults to 64.</li>
<li><code>efSearch</code>: the candidate list size at query time, and the main recall-versus-latency dial. It can be changed per query; pgvector exposes it as <code>hnsw.ef_search</code> (default 40).</li>
</ul>
<p>The costs are memory and build time, not query speed. Each node stores its neighbour IDs; at 4 bytes per ID and about <span class="formula">2 &times; M</span> links on layer 0, M = 16 adds roughly 128 bytes per vector before the small upper-layer overhead. The graph performs best fully in RAM, because each hop is a random memory access. Deletes are usually tombstones: the node stays in the graph for navigation but is skipped in results until a rebuild or repair removes it.</p>`,
        },
        {
          type: "lab",
          id: "hnswSearch",
          caption: "Build the bottom layer of an HNSW-style graph point by point, then run greedy searches from a fixed entry point. Raise M and ef and watch recall@5 rise along with the number of distance computations.",
        },
        {
          type: "realworld",
          items: [
            { org: "pgvector", title: "HNSW in Postgres", html: "Since version 0.5.0, pgvector offers <code>USING hnsw</code> indexes alongside IVFFlat, with operator classes for L2, inner product and cosine distance." },
            { org: "Lucene, Elasticsearch, OpenSearch", title: "HNSW per segment", html: "Lucene builds an HNSW graph for each immutable index segment. A kNN query searches every segment's graph and merges the results; graphs are rebuilt as segments merge." },
            { org: "Qdrant, Weaviate, Milvus", title: "HNSW as the default", html: "Dedicated vector databases ship HNSW as their main in-memory index, and add their own approaches for filtering, quantization and on-disk storage around it." },
            { org: "FAISS and hnswlib", title: "Libraries", html: "Meta's FAISS library implements flat, IVF, PQ and HNSW indexes (and combinations, on CPU and GPU). hnswlib is a small library from the HNSW paper's first author." },
          ],
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
          type: "problem",
          html: `<p>Fast ANN indexes are fast because they live in memory. The first question in any vector search design is therefore arithmetic: how many bytes do the vectors and the index take, and how many machines does that mean?</p>`,
        },
        {
          type: "text",
          html: `<p>The estimate has three parts: <span class="formula">raw = N &times; d &times; bytes per value</span>, plus index overhead (graph links for HNSW), plus IDs, metadata and headroom.</p>
<p>Worked example, 100 million 768-dimension float32 vectors:</p>
<ul>
<li>Raw vectors: 10<sup>8</sup> &times; 768 &times; 4 B = <strong>307 GB</strong>.</li>
<li>HNSW links at M = 16: 10<sup>8</sup> &times; 128 B &asymp; <strong>13 GB</strong>.</li>
<li>IDs and metadata at 64 B each: about <strong>6 GB</strong>.</li>
<li>Add 30% headroom: about <strong>424 GB</strong>. With 192 GB usable per node, that is three nodes before replication.</li>
</ul>
<p>The vectors dominate. The way to change the answer is to store fewer bytes per vector.</p>`,
        },
        {
          type: "text",
          html: `<h3>Product quantization</h3>
<p><strong>Product quantization</strong> (PQ, J&eacute;gou, Douze and Schmid, 2011) splits each vector into <code>m</code> sub-vectors and learns a separate codebook of 256 centroids for each sub-space with k-means. Each sub-vector is replaced by the one-byte ID of its nearest centroid. With d = 768 and m = 96, each sub-vector is 8 floats, and the whole vector becomes 96 bytes instead of 3,072: a <strong>32x</strong> reduction. The 100M-vector collection shrinks from 307 GB to about 10 GB.</p>
<p>Searching compressed vectors is fast too. For a query, precompute a table of distances from each query sub-vector to all 256 centroids of its sub-space (96 &times; 256 entries). The approximate distance to any stored vector is then the sum of 96 table lookups, no floating-point vector math at all.</p>`,
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
          type: "text",
          html: `<p>Compression loses information, so PQ distances are approximate and recall drops. The standard fix is <strong>reranking</strong>: retrieve a few hundred candidates using the compressed codes, then recompute exact distances for just those candidates using full-precision vectors kept on SSD or in a cheaper tier. Simpler schemes exist too. <strong>Scalar quantization</strong> stores each float as an 8-bit integer (4x smaller, usually a small recall loss), and <strong>binary quantization</strong> keeps one bit per dimension (32x smaller, much coarser, nearly always paired with reranking).</p>
<p>Disk-based graph indexes push further. Microsoft's DiskANN (2019) keeps compressed vectors in RAM for navigation and the full vectors and graph on SSD, so a single machine can serve far more vectors than fit in its memory.</p>`,
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
      id: "filters-hybrid-freshness",
      title: "Filters, hybrid search and freshness",
      kicker: "Where designs break",
      blocks: [
        {
          type: "problem",
          html: `<p>Almost no real query is "the 10 nearest vectors in the whole collection". It is "the 10 nearest that belong to tenant 42 and that this user may see", "products under $50 that are in stock", or "documents updated this year". The ANN index knows nothing about those conditions.</p>`,
        },
        {
          type: "compare",
          title: "Three ways to combine a filter with an ANN search",
          items: [
            { title: "Post-filter", tone: "bad", html: "Run the ANN search for the top k, then drop results that fail the filter. Simple, and broken for selective filters: if only 1% of vectors belong to the tenant, a top-10 search may return zero matches." },
            { title: "Pre-filter", tone: "warn", html: "Find all vectors that pass the filter first, then search only them. Correct, but if the filtered set is large and not separately indexed, you are back to brute force over it." },
            { title: "Filter during traversal", tone: "ok", html: "The index checks the filter as it explores, keeping only matching candidates while still walking through non-matching nodes to navigate. Engines such as Qdrant and Weaviate build their HNSW support around this." },
          ],
        },
        {
          type: "text",
          html: `<p>Two more tools are worth naming. If a filter is very selective (a few thousand matching vectors), a brute-force scan of just those is fast and exact; good engines choose that plan automatically. If one dimension, usually <strong>tenant</strong>, appears in every query, partition the index by it, so each search stays inside one small index. In pgvector, an ordinary <code>WHERE</code> clause next to an HNSW <code>ORDER BY</code> behaves like a post-filter by default; releases from 0.8.0 add iterative index scans that keep fetching candidates until enough rows pass the filter.</p>
<h3>Hybrid search</h3>
<p>Vectors are bad at exact tokens: an error code, a SKU, a person's name. Keyword search (BM25) is bad at paraphrase. <strong>Hybrid search</strong> runs both and merges the two ranked lists. A common, tuning-free merge is <strong>reciprocal rank fusion</strong> (Cormack, Clarke and B&uuml;ttcher, 2009): <span class="formula">score(d) = &Sigma; 1 / (k + rank<sub>i</sub>(d))</span> over the lists, with k = 60 as the usual constant.</p>
<p>Worked example: document X ranks 1st in BM25 and 5th by vector, scoring 1/61 + 1/65 &asymp; 0.0318. Document Y ranks 3rd in both, scoring 2/63 &asymp; 0.0317. Document Z appears only in the vector list, at rank 2, scoring 1/62 &asymp; 0.0161. Showing up in both lists matters more than being near the top of one. A cross-encoder reranker can then reorder the merged top 50 or so.</p>`,
        },
        {
          type: "text",
          html: `<h3>Freshness</h3>
<p>Users expect a document to be searchable soon after upload. HNSW supports incremental inserts, but each insert does a search and rewires links, so heavy write bursts slow down. IVF assigns new vectors to existing lists, but the clusters were trained on old data. Many systems therefore buffer new vectors in a small segment that is searched by brute force (or with a quickly built index) alongside the big index, and merge it in the background. Milvus, for instance, distinguishes growing segments of fresh data from sealed segments that get a full index, and Lucene's per-segment graphs work in a similar spirit. Deletes are tombstoned and cleaned up on compaction or rebuild.</p>`,
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Proposing "top-k vector search, then filter by permissions in the application". For a user who can see a small slice of the corpus, most or all of the top k are filtered out, and the answer is empty or poor. Put permission and tenant fields in the index as metadata and filter inside the search, or partition by tenant.</p>`,
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
      id: "where-vectors-live",
      title: "pgvector or a dedicated vector database",
      kicker: "Choosing a store",
      blocks: [
        {
          type: "text",
          html: `<p>Once you know the size and the query shape, the storage decision is usually clear. The question is not "which vector database is best" but "can the database I already run handle this, and what would make it stop being enough?"</p>`,
        },
        {
          type: "code",
          lang: "sql",
          title: "Vectors next to relational data in pgvector",
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
          caption: "The vectors live in the same transaction, backup and access-control model as the rest of the data.",
        },
        {
          type: "compare",
          items: [
            { title: "pgvector (vectors in Postgres)", tone: "ok", html: "One system to run, with transactions, joins, backups and row-level security. Good for millions to low tens of millions of vectors at moderate QPS. Indexes on the <code>vector</code> type support up to 2,000 dimensions. Limits: one node's memory, and vector builds and queries compete with OLTP traffic." },
            { title: "Dedicated vector database", tone: "info", html: "Pinecone (managed), Milvus, Qdrant and Weaviate add sharding, replication, quantization, filtered search, hybrid search and independent scaling. Worth it at hundreds of millions of vectors, high QPS, or strict multi-tenant isolation. Cost: another system to keep in sync." },
            { title: "Search engine kNN", tone: "info", html: "Elasticsearch and OpenSearch add HNSW-based kNN next to their keyword search, which makes hybrid search natural if you already index documents there." },
          ],
        },
        {
          type: "text",
          html: `<h3>Sharding a vector index</h3>
<p>When one machine cannot hold the index, split it. Sharding <strong>by tenant</strong> keeps most queries on one shard. Sharding <strong>randomly</strong> balances load but makes every query a scatter-gather: send the query to all shards, take each shard's top k, and merge them at a coordinator. As with any fan-out, latency is set by the slowest shard, so replicas and hedged requests help the tail. Each shard must return a full top k (not k divided by the number of shards), because all of the true neighbours could sit on one shard.</p>`,
        },
        {
          type: "keypoints",
          title: "A decision checklist",
          items: [
            "Estimate memory first: N &times; d &times; bytes per value, plus index overhead and headroom.",
            "Already on Postgres, millions of vectors, need joins and transactions: pgvector with HNSW.",
            "Keyword plus vector over documents: Elasticsearch or OpenSearch, or a vector database with hybrid search.",
            "Hundreds of millions to billions, high QPS, quantization, tenant isolation: a dedicated vector database.",
            "Whatever you pick, the source of truth usually stays in the primary database and the index is derived from it (a CDC feed keeps it in sync).",
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
          html: `<p>Vector search in an interview is rarely about re-deriving HNSW. It is about sizing the problem, picking an index for that size, and handling the realistic parts: filters, updates and where the data lives. Lead with numbers.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>A strong answer moves through these points:</p>
<ol>
<li><strong>Size:</strong> N &times; d &times; 4 bytes. 100M &times; 768 is about 307 GB raw, so not one ordinary node.</li>
<li><strong>Index:</strong> HNSW for in-memory, high-recall search (tune <code>efSearch</code>); IVF-PQ when memory is the constraint at billions, with reranking.</li>
<li><strong>Filters:</strong> metadata inside the search or partitions by tenant, never post-filtering a global top k.</li>
<li><strong>Freshness:</strong> a small fresh segment searched alongside the main index, tombstones for deletes, periodic rebuilds.</li>
<li><strong>Placement:</strong> pgvector while it fits next to your relational data; a dedicated system for scale, QPS or features.</li>
</ol>`,
        },
        {
          type: "text",
          html: `<p>If asked to compare IVF and HNSW in one breath: IVF partitions and scans a few clusters, so it is memory-light and pairs with compression, but recall depends on probing enough lists. HNSW walks a graph, giving better recall at a given latency and easy inserts, at the cost of more memory and slower builds.</p>`,
        },
        {
          type: "quiz",
          q: "You must serve 2 billion 512-dimension image embeddings with modest hardware. Raw float32 would be about 4 TB. Which approach is most realistic?",
          options: [
            "A single HNSW index with float32 vectors in RAM",
            "IVF with product quantization in RAM, reranking the top candidates with full vectors from SSD",
            "Brute force on a large CPU server",
            "LSH with one hash table",
          ],
          answer: 1,
          explain: "At 2 billion vectors the binding constraint is memory. PQ at, say, 64 bytes per vector brings the in-memory part to about 128 GB, IVF limits how many codes each query scans, and reranking against full vectors on SSD recovers most of the recall lost to compression. Disk-based graph indexes such as DiskANN are another valid answer.",
        },
      ],
    },
  ],
  takeaways: [
    "ANN indexes trade a few percent of recall@k for orders of magnitude less work; measure recall against brute force on sample queries.",
    "IVF clusters vectors with k-means and scans the nprobe nearest lists: memory-light, pairs with PQ, loses neighbours near cluster boundaries.",
    "HNSW greedily walks a layered neighbour graph: high recall at low latency, tuned with M, efConstruction and efSearch, but it wants the whole graph in RAM.",
    "Size first: 100M &times; 768 float32 is about 307 GB raw. Product quantization (one byte per sub-vector) cuts that 10-60x, with reranking to recover recall.",
    "Filters belong inside the search (or in per-tenant partitions); post-filtering a global top k returns empty results for selective filters.",
    "Hybrid search with reciprocal rank fusion covers exact terms that vectors miss and paraphrases that keywords miss.",
    "Start with pgvector when vectors sit next to relational data in the millions; move to a dedicated vector database for scale, QPS or isolation.",
  ],
  furtherReading: [
    { title: "Efficient and robust approximate nearest neighbor search using Hierarchical Navigable Small World graphs (Malkov and Yashunin)", url: "https://arxiv.org/abs/1603.09320", note: "The HNSW paper: layers, greedy search and the heuristics for choosing neighbours." },
    { title: "Product Quantization for Nearest Neighbor Search (J&eacute;gou, Douze, Schmid, 2011)", note: "The original PQ paper, including asymmetric distance computation and IVF-ADC." },
    { title: "pgvector", url: "https://github.com/pgvector/pgvector", note: "README covers HNSW and IVFFlat parameters, distance operators and filtering behaviour." },
    { title: "FAISS", url: "https://github.com/facebookresearch/faiss", note: "Meta's library of ANN indexes; its wiki explains how to choose and combine them." },
  ],
};
