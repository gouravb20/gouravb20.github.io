// System design advanced topics - interactive notes data.
// Original study notes. Topic outline follows Hello Interview's "Advanced Topics" series:
// https://www.hellointerview.com/learn/system-design/deep-dives/proximity-search
// Chapters live in data-part2.js.
window.DATA = {
  book: {
    title: `System Design Advanced Topics`,
    subtitle: `The deep dives that come up once the core concepts are solid, read as one book: <strong>proximity search</strong>, <strong>data structures for big data</strong> (Bloom filters, Count-Min Sketch, HyperLogLog and the Morris counter), <strong>vector databases</strong>, <strong>time series databases</strong> and <strong>change data capture</strong>. Every chapter has concepts, labs, a cheatsheet, interview Q&amp;A and flashcards. Topics follow Hello Interview's <a href="https://www.hellointerview.com/learn/system-design/deep-dives/proximity-search" target="_blank" rel="noopener" style="color:var(--accent)">Advanced Topics</a> series, and the Morris counter chapter follows Arpit Bhayani's essay <a href="https://arpitbhayani.me/blogs/morris-counter/" target="_blank" rel="noopener" style="color:var(--accent)">Space-Efficient Counting: Exploring Morris' Algorithm</a>; the notes and labs are written independently.`,
    storageKey: `advanced_topics_notes_v1`,
    appId: `advanced-topics-notes`,
    exportPrefix: `advanced-topics-progress`,
    pillarsTitle: `Four instincts for the deep dives`,
    takeawaysTitle: `Ten things to remember`,
    labsIntro: `Each lab is a small model of one idea. The numbers come from simple, stated assumptions rather than real measurements, so read them as shapes and ratios, not benchmarks. Labs reset when you leave the tab.`
  },
  parts: {
    1: `Part I &middot; Proximity Search`,
    2: `Part II &middot; Data Structures for Big Data`,
    3: `Part III &middot; Vector Databases`,
    4: `Part IV &middot; Time Series Databases`,
    5: `Part V &middot; Change Data Capture`
  },
  fourQuestions: [
    { cls: `what`, q: `Indexes produce candidates, not answers`, text: `Spatial trees, geohash cells and ANN indexes all narrow billions of rows to a small candidate set cheaply. An exact check (real distance, true similarity) then picks the winners. Say both steps out loud.`, answer: `Ch 1-2 (spatial), Ch 6-7 (vectors).` },
    { cls: `where`, q: `Approximate only with a number`, text: `Bloom filters, sketches, HyperLogLog and Morris counters trade a bounded error for orders of magnitude less memory. Reach for them when an exact structure doesn't fit, and state the error you're accepting.`, answer: `Ch 3-5: membership, frequency, cardinality and counting.` },
    { cls: `when`, q: `Know the workload's assumptions`, text: `Time series databases assume append-only, regular, low-cardinality data; vector indexes assume the data fits in memory; BKD trees assume few updates. Designs break exactly where those assumptions do.`, answer: `Ch 1, 7, 8-9: what each specialised store assumes.` },
    { cls: `how`, q: `Keep stores in sync from one log`, text: `When search indexes, caches and warehouses copy the database, stream its change log instead of writing to each one. Partition by key for ordering and make consumers idempotent.`, answer: `Ch 10: CDC, the outbox and ordering.` }
  ],
  takeaways: [
    `A B-tree sorts one dimension, so it can't find nearby points. Use a <strong>spatial tree</strong> (R-tree in PostGIS) for shapes, <strong>encoded cells</strong> (geohash, S2, H3) for moving points, and always post-filter by exact distance.`,
    `Encoded cells need the <strong>3x3 neighbour trick</strong>: two points a metre apart can sit in different cells, so query the cell and its neighbours.`,
    `<strong>Bloom filters</strong> answer "definitely not" or "maybe" in ~10 bits per key, with no false negatives and no deletes. Size them from the expected item count and the false positive rate.`,
    `<strong>Count-Min Sketch</strong> estimates frequencies and never underestimates; <strong>HyperLogLog</strong> counts distinct items in 12 KB at ~1% error. Both merge across shards and time windows.`,
    `A <strong>Morris counter</strong> stores roughly log n and increments with probability 2<sup>&minus;v</sup>, so it counts to n in O(log log n) bits with a constant relative error. Tune it with a larger base parameter or by averaging counters.`,
    `Use sketches only when exact structures don't fit, and never for billing, quotas or anything audited.`,
    `Vector search finds nearest embeddings under <strong>cosine, dot product or L2</strong> distance. Exact search is a full scan; <strong>HNSW</strong> and <strong>IVF</strong> trade a little recall for big speedups, and memory is usually the binding constraint. Start with pgvector.`,
    `Time series databases win by assuming regular, append-only data: <strong>LSM writes, delta-of-delta and XOR compression, time partitions, rollups</strong>.`,
    `A high-cardinality tag like user_id breaks every time series assumption; keep tags bounded and put per-entity data elsewhere.`,
    `Never dual-write to keep stores in sync. <strong>Change data capture</strong> streams the database's own log to search, caches and warehouses; use a <strong>transactional outbox</strong> when consumers need to know why something changed, not just the new row.`
  ],
  chapters: []
};
