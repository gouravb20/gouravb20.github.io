// Deep dive: Chapter 11, Specialized indexes and index tuning. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch11 = {
  hook: `<p>This chapter covers queries a single-column B-tree can't serve (proximity, word search, filter-plus-sort) and the index that fits each shape: geospatial, inverted, composite and covering. The skill is reading a query's shape and naming the right index.</p>`,
  sections: [
    {
      id: "geohash",
      title: "Geospatial search with geohash",
      kicker: "Geospatial index 1",
      blocks: [
        {
          type: "text",
          html: `<p>Two B-trees on latitude and longitude return a band around the planet and a band from pole to pole; the database must intersect two huge sets to find the few rows nearby. Proximity is two-dimensional, so we need keys where <strong>points close in 2-D get keys close in 1-D</strong>.</p>`,
        },
        {
          type: "steps",
          title: "Encoding a geohash",
          items: [
            "Halve the longitude range (-180 to 180): east half writes 1, west 0. Narrow to that half.",
            "Do the same for latitude (-90 to 90), north or south.",
            "Keep alternating; each bit halves the cell in one dimension (a Z-order curve; Google's S2 uses a Hilbert curve).",
            "Encode the bits five at a time in base 32. Points in the same cell share a <strong>prefix</strong>, so \"nearby\" becomes a B-tree prefix scan: <code>WHERE geohash LIKE 'dr5ru%'</code>.",
          ],
        },
        {
          type: "keypoints",
          items: [
            "Each character shrinks the cell about 32 times: 6 characters is roughly 1.2 km by 0.6 km (restaurants), 7 about 150 m (drivers).",
            "<strong>Edge problem:</strong> a place a few metres away can sit in a neighbouring cell sharing little or no prefix. Query the user's cell <strong>plus its eight neighbours</strong>, then filter by exact distance.",
            "Redis <code>GEOADD</code> stores a 52-bit geohash as a sorted-set score and <code>GEOSEARCH</code> scans the centre and neighbour ranges; DynamoDB designs put a geohash prefix in the key.",
          ],
        },
        {
          type: "diagram",
          title: "Searching the user's cell plus its eight neighbours",
          caption: "The user is near the east edge of their own cell. The dot inside the radius in cell E would be missed by a single-cell search. Points in the nine cells but outside the radius are removed by an exact distance check.",
          svg: `<svg viewBox="0 0 600 300" role="img" aria-label="A three by three geohash grid with a search radius crossing into neighbouring cells">
<rect x="30" y="20" width="270" height="270" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<rect x="120" y="110" width="90" height="90" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<line x1="120" y1="20" x2="120" y2="290" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<line x1="210" y1="20" x2="210" y2="290" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<line x1="30" y1="110" x2="300" y2="110" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<line x1="30" y1="200" x2="300" y2="200" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<text x="36" y="38" font-size="12" style="fill: var(--dg-muted)">NW</text>
<text x="126" y="38" font-size="12" style="fill: var(--dg-muted)">N</text>
<text x="216" y="38" font-size="12" style="fill: var(--dg-muted)">NE</text>
<text x="36" y="128" font-size="12" style="fill: var(--dg-muted)">W</text>
<text x="126" y="128" font-size="12" font-weight="700">own cell</text>
<text x="216" y="128" font-size="12" style="fill: var(--dg-muted)">E</text>
<text x="36" y="218" font-size="12" style="fill: var(--dg-muted)">SW</text>
<text x="126" y="218" font-size="12" style="fill: var(--dg-muted)">S</text>
<text x="216" y="218" font-size="12" style="fill: var(--dg-muted)">SE</text>
<circle cx="195" cy="155" r="60" fill="none" stroke-width="2" stroke-dasharray="5 4" style="stroke: var(--dg-2)"/>
<circle cx="195" cy="155" r="6" style="fill: var(--dg-2)"/>
<text x="185" y="180" text-anchor="end" font-size="12" font-weight="700">you</text>
<circle cx="238" cy="165" r="5" style="fill: var(--dg-ok)"/>
<circle cx="168" cy="140" r="5" style="fill: var(--dg-ok)"/>
<circle cx="135" cy="192" r="5" style="fill: var(--dg-bad)"/>
<circle cx="280" cy="60" r="5" style="fill: var(--dg-bad)"/>
<circle cx="70" cy="250" r="5" style="fill: var(--dg-bad)"/>
<text x="330" y="50" font-size="13" font-weight="700">Query = 9 cells</text>
<text x="330" y="76" font-size="12" style="fill: var(--dg-muted)">Fetch the user's cell and its</text>
<text x="330" y="94" font-size="12" style="fill: var(--dg-muted)">8 neighbours by prefix, then</text>
<text x="330" y="112" font-size="12" style="fill: var(--dg-muted)">filter by exact distance.</text>
<circle cx="338" cy="146" r="5" style="fill: var(--dg-ok)"/>
<text x="352" y="150" font-size="12">inside the radius: kept</text>
<circle cx="338" cy="174" r="5" style="fill: var(--dg-bad)"/>
<text x="352" y="178" font-size="12">in a cell, too far: dropped</text>
<line x1="330" y1="202" x2="346" y2="202" stroke-width="2" stroke-dasharray="5 4" style="stroke: var(--dg-2)"/>
<text x="352" y="206" font-size="12">search radius</text>
<text x="330" y="244" font-size="12" style="fill: var(--dg-muted)">The kept dot in cell E is a few</text>
<text x="330" y="262" font-size="12" style="fill: var(--dg-muted)">metres away, but a single-cell</text>
<text x="330" y="280" font-size="12" style="fill: var(--dg-muted)">search would never see it.</text>
</svg>`,
        },
        {
          type: "lab",
          id: "geohash",
          caption: "Move the user and change the precision. Watch which places fall in the user's cell, which are only found through the eight neighbours, and which the exact distance filter removes.",
        },
        {
          type: "quiz",
          q: "Your nearby-drivers query uses 6-character geohash cells (about 1.2 km by 0.6 km) and searches only the rider's own cell. Riders complain that the closest driver is sometimes not shown. Why?",
          options: [
            "Geohashes are inaccurate below 1 km",
            "The closest driver is just across a cell boundary, in a neighbouring cell with a different hash",
            "The B-tree cannot handle prefix queries",
            "Six characters is too long; shorter hashes always fix it",
          ],
          answer: 1,
          explain: "Nearby points can fall in different cells and even share almost no prefix. Searching the rider's cell plus its eight neighbours and then filtering by exact distance covers any radius up to a cell's size. Shortening the hash only enlarges the cells; the boundary problem remains.",
        },
      ],
    },
    {
      id: "quadtrees-and-rtrees",
      title: "Quadtrees and R-trees",
      kicker: "Geospatial index 2",
      blocks: [
        {
          type: "text",
          html: `<p>A fixed grid puts thousands of places in a downtown cell and none in farmland. A <strong>quadtree</strong> splits any cell over a limit (say 100 points) into four, so dense areas get tiny cells. An <strong>R-tree</strong> is a balanced, disk-friendly tree of bounding rectangles, so it indexes shapes as well as points.</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "Geohash", tone: "ok", html: "A fixed grid encoded as strings. Drops into any B-tree, Redis or key-value store; easy to shard by prefix. Uneven cell populations." },
            { title: "Quadtree", tone: "info", html: "Adaptive cells, balanced result sizes. Usually an in-memory structure inside a location service you build and replicate, because points move." },
            { title: "R-tree", tone: "info", html: "Balanced tree of bounding boxes on disk; handles points and polygons (\"which zone contains this point\"). PostGIS builds it on GiST. The default when data lives in PostgreSQL." },
          ],
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>Pick by where the data lives and how often it moves. Static places in a relational database: PostGIS. Points updated every few seconds, such as drivers: geohash cells in Redis, or an in-memory quadtree. (MongoDB's <code>2dsphere</code> uses S2 cells; Uber's H3 uses hexagons, whose six neighbours are equidistant.)</p>`,
        },
      ],
    },
    {
      id: "inverted-indexes",
      title: "Inverted indexes: searching inside text",
      kicker: "Full-text search",
      blocks: [
        {
          type: "text",
          html: `<p><code>LIKE '%noodles%'</code> defeats a B-tree (the word can be anywhere) and can't stem or rank. An <strong>inverted index</strong> flips the relationship: for each term, a sorted <strong>posting list</strong> of the documents containing it.</p>`,
        },
        {
          type: "steps",
          title: "Building and querying the index",
          items: [
            "<strong>Tokenize</strong> and lowercase; usually drop stop words such as \"the\".",
            "<strong>Stem</strong> so \"booking\", \"booked\" and \"books\" become \"book\".",
            "Append the document id (often with frequency and positions) to each term's sorted posting list.",
            "At query time analyse the query the same way, then <strong>intersect</strong> lists for AND or <strong>union</strong> them for OR.",
            "Rank: <strong>TF-IDF</strong> rewards frequent terms that are rare across the collection; <strong>BM25</strong> (Lucene's default) damps repeats and normalizes for length.",
          ],
        },
        {
          type: "diagram",
          title: "From documents to posting lists",
          caption: "Three listings are tokenized and stemmed into terms. A query for \"beach hotel\" reads two posting lists and intersects them.",
          svg: `<svg viewBox="0 0 620 270" role="img" aria-label="Three documents indexed into posting lists for five terms">
<defs><marker id="cc11-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="15" y="30" width="230" height="44" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="25" y="57" font-size="12"><tspan font-weight="700">D1</tspan>  Cheap hotel near the beach</text>
<rect x="15" y="95" width="230" height="44" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="25" y="122" font-size="12"><tspan font-weight="700">D2</tspan>  Beach house for a family</text>
<rect x="15" y="160" width="230" height="44" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="25" y="187" font-size="12"><tspan font-weight="700">D3</tspan>  Hotel booking, free breakfast</text>
<line x1="252" y1="117" x2="308" y2="117" stroke-width="2" marker-end="url(#cc11-arr)" style="stroke: var(--dg-muted)"/>
<text x="280" y="105" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">index</text>
<rect x="320" y="30" width="90" height="28" rx="5" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="365" y="49" text-anchor="middle" font-size="12" font-weight="700">beach</text>
<rect x="425" y="30" width="40" height="28" rx="5" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="445" y="49" text-anchor="middle" font-size="12">D1</text>
<rect x="472" y="30" width="40" height="28" rx="5" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="492" y="49" text-anchor="middle" font-size="12">D2</text>
<rect x="320" y="68" width="90" height="28" rx="5" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="365" y="87" text-anchor="middle" font-size="12" font-weight="700">hotel</text>
<rect x="425" y="68" width="40" height="28" rx="5" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="445" y="87" text-anchor="middle" font-size="12">D1</text>
<rect x="472" y="68" width="40" height="28" rx="5" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="492" y="87" text-anchor="middle" font-size="12">D3</text>
<rect x="320" y="106" width="90" height="28" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="365" y="125" text-anchor="middle" font-size="12">book</text>
<rect x="425" y="106" width="40" height="28" rx="5" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="445" y="125" text-anchor="middle" font-size="12">D3</text>
<rect x="320" y="144" width="90" height="28" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="365" y="163" text-anchor="middle" font-size="12">cheap</text>
<rect x="425" y="144" width="40" height="28" rx="5" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="445" y="163" text-anchor="middle" font-size="12">D1</text>
<rect x="320" y="182" width="90" height="28" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="365" y="201" text-anchor="middle" font-size="12">family</text>
<rect x="425" y="182" width="40" height="28" rx="5" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="445" y="201" text-anchor="middle" font-size="12">D2</text>
<text x="530" y="125" font-size="12" style="fill: var(--dg-muted)">"booking"</text>
<text x="530" y="143" font-size="12" style="fill: var(--dg-muted)">stemmed</text>
<text x="310" y="250" text-anchor="middle" font-size="12">Query "beach hotel" (AND): [D1, D2] intersect [D1, D3] = D1</text>
</svg>`,
        },
        {
          type: "lab",
          id: "invertedIndex",
          caption: "Type a query and watch which posting lists are read, how they are combined, and how TF-IDF ranks the matching documents. Toggle stemming to see \"booking\" start matching \"book\".",
        },
        {
          type: "keypoints",
          items: [
            "Keep the primary database as truth and feed the search engine with change data capture (e.g. through Kafka). Search is <strong>eventually consistent</strong>; Elasticsearch also refreshes every second by default.",
            "Elasticsearch and OpenSearch sit on Lucene's immutable, merged segments. PostgreSQL's <code>tsvector</code> plus a GIN index covers moderate needs without a separate cluster.",
          ],
        },
      ],
    },
    {
      id: "composite-and-covering",
      title: "Composite and covering indexes",
      kicker: "Index tuning",
      blocks: [
        {
          type: "text",
          html: `<p>For <code>WHERE customer_id = ? AND status = 'shipped' ORDER BY created_at DESC LIMIT 20</code>, separate single-column indexes fetch all of a customer's orders (200,000 for a big one), filter and sort. A <strong>composite index</strong> on <code>(customer_id, status, created_at)</code> stores those rows as one sorted run: seek, read 20, stop.</p>`,
        },
        {
          type: "keypoints",
          items: [
            "<strong>Leftmost prefix:</strong> <code>(a, b, c)</code> seeks on <code>a</code>, <code>a,b</code> or <code>a,b,c</code>, never on <code>b</code> or <code>c</code> alone, like a phone book sorted by last then first name.",
            "After a <strong>range</strong> on a column, later columns no longer narrow the seek. Rule: <strong>equality columns first, then the range or sort column</strong>.",
          ],
        },
        {
          type: "lab",
          id: "compositeIndex",
          caption: "Reorder the columns of one composite index and see which of six queries it can seek on, which come back already sorted, and how many entries each examines. Turn on covering to remove the table lookups.",
        },
        {
          type: "table",
          title: "What an index on (customer_id, status, created_at) can do",
          headers: ["Query filter / order", "Seeks on", "Sorted for free?"],
          rows: [
            ["customer_id = ?", "customer_id", "No (unless ordering by status, created_at)"],
            ["customer_id = ? AND status = ?", "customer_id, status", "-"],
            ["customer_id = ? AND status = ? ORDER BY created_at", "customer_id, status", "Yes"],
            ["customer_id = ? ORDER BY created_at", "customer_id", "No: status sits in between"],
            ["status = ?", "Nothing (not a prefix)", "No"],
            ["created_at > ?", "Nothing (not a prefix)", "No"],
          ],
          note: "Some planners (Oracle, and MySQL since 8.0) can sometimes \"skip scan\" a leading column with very few distinct values, but do not design around it.",
        },
        {
          type: "tradeoffs",
          prosLabel: "Tuned indexes buy",
          consLabel: "What they cost",
          pros: [
            "<strong>Covering</strong> (all needed columns, via <code>INCLUDE</code> in PostgreSQL 11+ and SQL Server): an index-only scan with no per-row table read",
            "<strong>Partial</strong> (<code>WHERE status = 'pending'</code>): tiny, and writes to other rows skip it",
            "<strong>Expression</strong> (<code>lower(email)</code>): case-insensitive lookups seek instead of scan",
          ],
          cons: [
            "Column order is a commitment: the wrong order serves nothing",
            "Wide covering indexes duplicate data and slow writes",
            "Overlapping composites waste space; prefer one that serves several queries by prefix",
          ],
        },
        {
          type: "quiz",
          q: "Which single index best serves: WHERE tenant_id = ? AND created_at > now() - interval '7 days' ORDER BY created_at?",
          options: ["(created_at, tenant_id)", "(tenant_id, created_at)", "(created_at)", "Two separate indexes, one per column"],
          answer: 1,
          explain: "Equality first, then the range and sort column. With (tenant_id, created_at), the tenant's rows are one run sorted by time, so the database seeks to seven days ago and reads forward in order. With created_at first, the last week of every tenant is mixed together and must be filtered.",
        },
      ],
    },
    {
      id: "interview",
      title: "Choosing the right index in an interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "table",
          headers: ["Requirement sounds like", "Index"],
          rows: [
            ["\"Near me\", \"within X km\"", "Geospatial: geohash, quadtree or R-tree"],
            ["\"Search for\", \"contains these words\"", "Inverted index in a search engine or full-text index"],
            ["\"Their recent X, sorted by Y\"", "Composite, equality columns first"],
            ["Very hot read returning many rows", "Covering index"],
          ],
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>For "find drivers within 2 km of a rider", a strong answer:</p>
<ol>
<li>Explains why lat/long B-trees fail: proximity is two-dimensional.</li>
<li>Uses geohash cells near the search radius in Redis (or Redis GEO), because positions update every few seconds.</li>
<li>Queries the rider's cell plus eight neighbours, then filters by exact distance.</li>
<li>Names alternatives: a quadtree when density varies hugely, PostGIS with an R-tree for relational, slow-moving data.</li>
</ol>
<p>For "why is this query slow?", start with <code>EXPLAIN ANALYZE</code>: a sequential scan where you expected an index, estimates far from actual rows, or a sort step a better column order would remove.</p>`,
        },
      ],
    },
  ],
  takeaways: [
    "Two one-dimensional B-trees can't answer proximity; geohash maps 2-D closeness to prefixes. Search the user's cell plus its 8 neighbours, then filter by exact distance.",
    "Quadtrees adapt cell size to density and usually live in memory; R-trees index rectangles and shapes on disk and power PostGIS.",
    "An inverted index maps terms to posting lists, ranked with TF-IDF or BM25; search fed by CDC is eventually consistent.",
    "Composite indexes follow the leftmost-prefix rule: equality columns first, range or sort column last.",
    "Covering, partial and expression indexes make hot queries index-only and keep indexes small.",
  ],
  furtherReading: [
    { title: "PostGIS documentation: spatial indexing", url: "https://postgis.net/docs/using_postgis_dbmanagement.html", note: "How GiST-based R-tree indexes are built and used." },
    { title: "Redis documentation: GEOSEARCH", url: "https://redis.io/docs/latest/commands/geosearch/", note: "Radius and box queries over geohash-scored sorted sets." },
    { title: "R-trees: A Dynamic Index Structure for Spatial Searching (Guttman, 1984)", note: "The paper that introduced the R-tree." },
    { title: "PostgreSQL documentation: Index-Only Scans and Covering Indexes", url: "https://www.postgresql.org/docs/current/indexes-index-only-scans.html", note: "INCLUDE columns and when an index-only scan is possible." },
  ],
};
