// Deep dive: Chapter 11, Specialized indexes and index tuning. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch11 = {
  hook: `<p>A food-delivery app has three slow endpoints. "Restaurants within 2 km of me" takes four seconds. "Search menus for <em>spicy noodles</em>" takes six. "My last 20 orders, newest first" takes 800 ms for heavy users. Every column involved already has its own B-tree index, and none of it helps.</p>
<p>Each query has a shape a single-column B-tree was not built for. Proximity is two-dimensional, word search looks inside text, and the order history filters on one column while sorting on another. This chapter covers the index that fits each shape (geospatial, inverted, composite and covering) and how to tell from a query which one you need.</p>`,
  sections: [
    {
      id: "why-geo-is-hard",
      title: "Why two B-trees cannot find what is nearby",
      kicker: "The problem",
      blocks: [
        {
          type: "problem",
          html: `<p>Store latitude and longitude in two columns, index both, and ask for everything inside a small box around the user. The latitude index returns a thin band that circles the whole planet. The longitude index returns a band running from pole to pole. The database must fetch both huge sets and intersect them to find the few rows in the tiny square where they cross.</p>`,
        },
        {
          type: "text",
          html: `<p>Here is how bad that gets. A 2 km window of latitude is about 0.018 degrees, which on a global dataset still matches every point at that latitude across every continent. If you store 50 million restaurants, each band may hold hundreds of thousands of rows, and the answer is maybe 40. A B-tree is a one-dimensional sorted list: it can only make one of the two filters cheap, never both.</p>
<p>What we need is a way to number locations so that <strong>points close together in 2-D get keys close together in 1-D</strong>, or a tree that partitions space itself. Geohashes, quadtrees and R-trees are the three standard answers, and "find nearby X" (drivers, restaurants, friends, hotels) is one of the most common requirements in design interviews.</p>`,
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>The general trick behind geohashes is a <strong>space-filling curve</strong>: a path that visits every cell of a grid and keeps neighbouring cells mostly next to each other along the path. Geohash uses the Z-order (Morton) curve. Google's S2 library uses a Hilbert curve, which keeps locality slightly better.</p>`,
        },
      ],
    },
    {
      id: "geohash",
      title: "Geohash: turning a location into a searchable prefix",
      kicker: "Geospatial index 1",
      blocks: [
        {
          type: "idea",
          html: `<p>Repeatedly halve the world, alternating between longitude and latitude, and write down which half the point falls in as a bit. Interleave those bits and encode them five at a time in base 32. Points in the same small cell share a long <strong>prefix</strong>, so "nearby" becomes "same prefix", which any B-tree or key-value store can look up.</p>`,
        },
        {
          type: "steps",
          title: "Encoding a point",
          items: [
            "Longitude range is -180 to 180. Is the point in the east half? Write 1, else 0. Narrow the range to that half.",
            "Latitude range is -90 to 90. Same question for north or south. Write the bit and narrow.",
            "Keep alternating. Each bit halves the cell in one dimension.",
            "Group the bits into fives and map each group to a character from a 32-symbol alphabet (digits plus letters, leaving out a, i, l and o).",
          ],
        },
        {
          type: "text",
          html: `<p>Each extra character adds five bits, which shrinks the cell about 32 times in area. Six characters give a cell of roughly 1.2 km by 0.6 km, a good size for "restaurants near me"; seven give about 150 m, good for nearby drivers. Two cafes with hashes <code>dr5ru7</code> and <code>dr5rus</code> share five characters, so they sit in the same 5-character cell, about 5 km across.</p>
<p>To search, store each place with its geohash in an indexed column (or as a Redis key), compute the user's geohash at the right precision, and run a prefix lookup. That is an ordinary B-tree range scan: <code>WHERE geohash LIKE 'dr5ru%'</code>.</p>`,
        },
        {
          type: "text",
          html: `<h3>The edge problem and the 9-cell query</h3>
<p>Prefix closeness implies physical closeness, but not the other way round. A user standing near the edge of a cell can be a few metres from a restaurant in the next cell, and that restaurant's hash may share only a short prefix with the user's, or none at all where large cells meet (along the equator or the prime meridian, for instance). Searching only the user's own cell silently misses it.</p>
<p>The fix is standard: query the user's cell <strong>and its eight neighbours</strong>, which together cover any radius smaller than a cell, then compute the exact distance for each candidate and drop those outside the radius. Neighbour hashes are cheap to compute.</p>`,
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
          type: "realworld",
          items: [
            { org: "Redis", title: "GEO commands", html: "<code>GEOADD</code> stores each member in a sorted set whose score is a 52-bit interleaved geohash, and <code>GEOSEARCH</code> (Redis 6.2+) finds members within a radius or box by scanning the matching score ranges of the centre cell and its neighbours." },
            { org: "Key-value designs", title: "Geohash as a partition or sort key", html: "In stores without native geo support, such as DynamoDB, a common pattern is to store a geohash prefix in the key so that a nearby search becomes a handful of key or prefix queries." },
          ],
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
      title: "Quadtrees and R-trees: letting the data shape the cells",
      kicker: "Geospatial index 2",
      blocks: [
        {
          type: "problem",
          html: `<p>A geohash grid is fixed. A 6-character cell in central Tokyo might hold thousands of restaurants while the same-sized cell over farmland holds none. Queries in dense areas return far too many candidates, and every one of them has to be distance-checked.</p>`,
        },
        {
          type: "text",
          html: `<p>A <strong>quadtree</strong> starts with one cell covering the whole map and splits any cell holding more than some limit (say 100 points) into four equal quadrants, recursively. Dense downtowns end up many levels deep with tiny cells; oceans stay as one big cell. A nearby search walks down to the user's leaf and checks it plus adjacent leaves. Because points move (drivers update every few seconds), quadtrees usually live in memory inside a dedicated location service rather than in a database.</p>
<p>An <strong>R-tree</strong> is a balanced, disk-friendly tree, in the B-tree family, whose nodes hold <em>bounding rectangles</em>. Each parent's rectangle encloses its children's; siblings may overlap. A search descends only into rectangles that intersect the query area. Because entries are rectangles, an R-tree indexes shapes (delivery zones, roads, building outlines) as naturally as points, and supports "which polygon contains this point" as well as "what is near here".</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "Geohash", tone: "ok", html: "A fixed grid encoded as strings. Drops into any B-tree, Redis or key-value store, easy to shard by prefix. Uneven cell populations in dense versus sparse areas." },
            { title: "Quadtree", tone: "info", html: "Adaptive cells that split where points are dense. Balanced result sizes. Usually an in-memory structure you build, update and replicate yourself." },
            { title: "R-tree", tone: "info", html: "Balanced tree of bounding boxes, stored on disk inside a database. Handles points and shapes. The default answer when the data already lives in PostgreSQL." },
          ],
        },
        {
          type: "realworld",
          items: [
            { org: "PostGIS", title: "R-tree over GiST", html: "PostGIS spatial indexes are R-trees built on PostgreSQL's GiST framework. A query such as <code>ST_DWithin(location, :point, 2000)</code> uses the index to find candidate boxes, then checks exact geometry." },
            { org: "MongoDB", title: "2dsphere indexes", html: "MongoDB's <code>2dsphere</code> index maps locations onto cells from Google's S2 library, which projects the sphere onto a cube and orders cells along a Hilbert curve." },
            { org: "Uber H3", title: "Hexagonal grid", html: "Uber open-sourced H3, a hierarchical grid of hexagons. Hexagons have six neighbours all at the same distance from the centre, which makes radius and smoothing calculations simpler than with square cells." },
          ],
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>For interviews, pick by where the data lives and how often it moves. Static places in a relational database: PostGIS. Fast-moving points such as drivers updated every few seconds: geohash cells in Redis, or an in-memory quadtree in a location service.</p>`,
        },
      ],
    },
    {
      id: "inverted-indexes",
      title: "Inverted indexes: searching inside text",
      kicker: "Full-text search",
      blocks: [
        {
          type: "problem",
          html: `<p><code>WHERE description LIKE '%noodles%'</code> cannot use a B-tree, because the word can appear anywhere in the string and the tree is sorted by the string's start. The database scans every row. It also cannot match "noodle", cannot rank results, and cannot tell that a menu mentioning noodles five times is more relevant than one mentioning them once.</p>`,
        },
        {
          type: "idea",
          html: `<p>Flip the relationship. Instead of storing which words each document contains, store, for every word, the list of documents that contain it. That list is a <strong>posting list</strong>, and the map from words to posting lists is an <strong>inverted index</strong>.</p>`,
        },
        {
          type: "steps",
          title: "Building and querying the index",
          items: [
            "<strong>Tokenize</strong> each document into words, lowercase them, and usually drop very common stop words such as \"the\" and \"for\".",
            "<strong>Stem</strong> or lemmatize so that \"booking\", \"booked\" and \"books\" all become \"book\".",
            "Append the document's id (often with term frequency and positions) to each term's posting list. Lists are kept sorted by id so they can be merged quickly.",
            "At query time, analyse the query the same way, fetch each term's posting list, <strong>intersect</strong> them for AND or <strong>union</strong> them for OR.",
            "Score the matches, for example with BM25, and return the top results.",
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
          type: "text",
          html: `<h3>Ranking: why rare words matter more</h3>
<p>Matching is only half of search; ordering is the other half. <strong>TF-IDF</strong> scores a document higher when a query term appears often in it (term frequency) and when the term is rare across the collection (inverse document frequency): "noodles" tells you much more than "food". <strong>BM25</strong>, the default in Elasticsearch and Lucene, refines this by letting repeated occurrences count for less and less and by normalising for document length, so a long menu does not win just by being long.</p>`,
        },
        {
          type: "lab",
          id: "invertedIndex",
          caption: "Type a query and watch which posting lists are read, how they are combined, and how TF-IDF ranks the matching documents. Toggle stemming to see \"booking\" start matching \"book\".",
        },
        {
          type: "text",
          html: `<h3>Where search lives in a design</h3>
<p>Keep the primary database as the source of truth and feed a search engine from it, typically with change data capture: the database's change log is streamed (for example through Kafka) into an indexer that updates Elasticsearch. The search index is therefore <strong>eventually consistent</strong>. Elasticsearch itself makes new documents searchable after a periodic refresh, one second by default, so even a direct write is not instantly visible. Say this out loud, and say what the product does about it (usually nothing, because seconds of lag are fine for search).</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Elasticsearch and OpenSearch", title: "Lucene underneath", html: "Both are distributed layers over Apache Lucene, which stores the inverted index in immutable segments that are merged in the background, much like SSTables in an LSM tree." },
            { org: "PostgreSQL", title: "Built-in full-text search", html: "<code>tsvector</code> columns hold processed terms, and a GIN index (an inverted index) makes <code>@@</code> text queries fast. For moderate search needs this avoids running a separate search cluster." },
          ],
        },
        {
          type: "quiz",
          q: "Users search 40 million product descriptions with LIKE '%wireless%'. Each search takes about 10 seconds. What is the best fix?",
          options: [
            "Add a B-tree index on the description column",
            "Build an inverted index (a search engine or a full-text index) over the descriptions",
            "Add a hash index on description",
            "Cache every possible search string",
          ],
          answer: 1,
          explain: "A leading wildcard defeats both B-tree and hash indexes, since neither can find a word in the middle of a string. An inverted index maps each word to the documents containing it, so the search reads one posting list instead of 40 million rows, and it can rank and stem too.",
        },
      ],
    },
    {
      id: "composite-and-covering",
      title: "Composite and covering indexes: matching the query's exact shape",
      kicker: "Index tuning",
      blocks: [
        {
          type: "problem",
          html: `<p><code>SELECT id, total FROM orders WHERE customer_id = ? AND status = 'shipped' ORDER BY created_at DESC LIMIT 20</code>. With separate single-column indexes, the planner picks one (say <code>customer_id</code>), fetches all of that customer's orders from the table, filters by status, sorts, and keeps 20. For a business customer with 200,000 orders, that is 200,000 row fetches for 20 rows of output.</p>`,
        },
        {
          type: "text",
          html: `<p>A <strong>composite index</strong> is one B-tree keyed by several columns in a fixed order: sorted by the first column, then by the second within equal first values, and so on, exactly like a phone book sorted by last name and then first name. An index on <code>(customer_id, status, created_at)</code> stores this customer's shipped orders as one contiguous run, already sorted by date. The query seeks to the start of the run, reads the last 20 entries, and stops.</p>
<h3>The leftmost-prefix rule</h3>
<p>The phone book can find "all Garcias" and "Ana Garcia", but not "everyone named Ana", because first names are scattered across the book. Likewise an index on <code>(a, b, c)</code> can seek on <code>a</code>, on <code>a</code> and <code>b</code>, or on all three, but not on <code>b</code> or <code>c</code> alone. And once a column is filtered by a <em>range</em>, columns after it no longer narrow the seek, because within a range of <code>a</code> the <code>b</code> values are not in one sorted run.</p>
<p>That gives the ordering rule: <strong>equality columns first, then the range or sort column</strong>. <code>(user_id, created_at)</code> serves "this user's posts, newest first"; <code>(created_at, user_id)</code> does not.</p>`,
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
          type: "text",
          html: `<h3>Covering indexes: never touching the table</h3>
<p>Even with the perfect composite index, each matching entry still points to a row that must be fetched to read <code>total</code>. A <strong>covering index</strong> contains every column the query needs, so the database answers from the index alone: an <em>index-only scan</em>. In PostgreSQL (11+) and SQL Server you add non-key columns with <code>INCLUDE (total)</code>; in MySQL you append them to the key. For a hot query that returns many rows, removing a random table read per row is often the single biggest win. The cost is a larger index that must be updated whenever those columns change.</p>
<h3>Partial and expression indexes</h3>
<p>A <strong>partial index</strong> covers only rows matching a condition, such as <code>WHERE status = 'pending'</code>: if 1% of orders are pending, the index is 1% of the size and every write to a completed order skips it. An <strong>expression index</strong> indexes a computed value such as <code>lower(email)</code>, so case-insensitive lookups can seek instead of scan.</p>`,
        },
        {
          type: "tradeoffs",
          prosLabel: "Composite and covering indexes",
          consLabel: "What they cost",
          pros: [
            "One seek serves a multi-column filter and its sort order",
            "Covering indexes skip the per-row table lookup entirely",
            "Partial indexes keep size and write cost tiny for targeted queries",
          ],
          cons: [
            "Column order is a commitment: the wrong order serves nothing",
            "Wide covering indexes duplicate data and slow writes",
            "Many overlapping composites waste space; prefer one that serves several queries by prefix",
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
          type: "text",
          html: `<p>Listen for the shape of each query in the requirements and map it to an index type. "Near me" or "within X km" means a geospatial index. "Search for" or "contains these words" means an inverted index in a search engine. "Their recent X, sorted by Y" means a composite index with equality columns first. A very hot read that returns many rows is a candidate for a covering index.</p>
<p>When an interviewer asks why a query is slow, the practical answer starts with <code>EXPLAIN</code> (or <code>EXPLAIN ANALYZE</code>): look for a sequential scan where you expected an index, a large gap between estimated and actual rows, or an explicit sort step that a better column order would remove.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>For "find drivers within 2 km of a rider", a strong answer:</p>
<ol>
<li>Explains why lat/long B-trees fail: proximity is two-dimensional.</li>
<li>Uses geohash cells at a precision near the search radius, stored in Redis (or Redis GEO) because positions update every few seconds.</li>
<li>Queries the rider's cell plus eight neighbours, then filters by exact distance.</li>
<li>Mentions the alternatives: a quadtree when density varies hugely, PostGIS with an R-tree when the data is relational and slow-moving.</li>
</ol>`,
        },
        {
          type: "keypoints",
          title: "Phrases that land well",
          items: [
            "\"Equality columns first, then the range or sort column.\"",
            "\"Search is fed by CDC from the primary database, so results can lag writes by a second or so.\"",
            "\"I'd confirm with EXPLAIN that it's an index-only scan, not a sequential scan.\"",
          ],
        },
        {
          type: "quiz",
          q: "A product has a restaurant table in PostgreSQL that changes a few times a day, and needs \"restaurants within 3 km that deliver to my address polygon\". What is the most natural choice?",
          options: [
            "A geohash column with a B-tree, ignoring the polygon",
            "PostGIS with a GiST (R-tree) index",
            "An in-memory quadtree rebuilt every second",
            "An inverted index on the address text",
          ],
          answer: 1,
          explain: "The data is relational and slow-moving, and the query involves shapes (delivery polygons) as well as distance. R-trees index rectangles and polygons natively, and PostGIS provides the distance and containment functions. Quadtrees in memory suit fast-moving points like drivers.",
        },
      ],
    },
  ],
  takeaways: [
    "Two one-dimensional B-trees cannot answer a two-dimensional proximity query efficiently; geospatial indexes map 2-D closeness into something searchable.",
    "Geohash interleaves latitude and longitude bits into a base-32 prefix; search the user's cell plus its 8 neighbours, then filter by exact distance.",
    "Quadtrees adapt cell size to density and usually live in memory; R-trees index rectangles and shapes on disk and power PostGIS.",
    "An inverted index maps each term to a posting list; queries intersect or union lists and rank with TF-IDF or BM25. Search engines fed by CDC are eventually consistent.",
    "Composite indexes follow the leftmost-prefix rule: put equality columns first and the range or sort column last.",
    "Covering indexes answer a query from the index alone; partial and expression indexes keep indexes small and targeted.",
  ],
  furtherReading: [
    { title: "PostGIS documentation: spatial indexing", url: "https://postgis.net/docs/using_postgis_dbmanagement.html", note: "How GiST-based R-tree indexes are built and used." },
    { title: "Redis documentation: GEOSEARCH", url: "https://redis.io/docs/latest/commands/geosearch/", note: "Radius and box queries over geohash-scored sorted sets." },
    { title: "R-trees: A Dynamic Index Structure for Spatial Searching (Guttman, 1984)", note: "The paper that introduced the R-tree." },
    { title: "PostgreSQL documentation: Index-Only Scans and Covering Indexes", url: "https://www.postgresql.org/docs/current/indexes-index-only-scans.html", note: "INCLUDE columns and when an index-only scan is possible." },
  ],
};
