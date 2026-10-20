// Main tab: Chapter 11, Specialized indexes and index tuning. Format: DeepSection[] in public/shared/notes.d.ts.
window.MAIN = window.MAIN || {};
MAIN.ch11 = [
  {
    id: "query-shapes",
    title: "Match the index to the shape of the query",
    kicker: "Mental model",
    blocks: [
      {
        type: "text",
        html: `<p>A plain B-tree on one column is great at one thing: finding values of that column, or ranges of them. Many real queries have a different shape. "Restaurants within two kilometres" is a question about two dimensions at once. "Posts that mention <em>outage</em>" is a question about words buried inside text. "This customer's shipped orders, newest first" filters on two columns and sorts on a third. Each shape has a matching index, and picking the right one is mostly a matter of recognising which shape you are looking at.</p>`,
      },
      {
        type: "table",
        title: "Recognise the shape, name the index",
        headers: ["The query sounds like", "Index to name", "Typical home"],
        rows: [
          ["Nearby, within a radius, inside this map area", "Geospatial: geohash, quadtree or R-tree", "Redis GEO, PostGIS, Elasticsearch"],
          ["Contains these words, search box, autocomplete over text", "Inverted index", "Elasticsearch or OpenSearch fed by CDC"],
          ["Filter on several columns, then sort", "Composite B-tree in the right column order", "The primary relational database"],
          ["A very hot query that reads a few columns", "Covering index (index-only scan)", "The primary relational database"],
        ],
      },
    ],
  },
  {
    id: "geo-and-text",
    title: "Geospatial and full-text search",
    kicker: "Specialized indexes",
    blocks: [
      {
        type: "text",
        html: `<p><strong>Why geo needs its own index.</strong> Separate B-trees on latitude and longitude each return a thin stripe that wraps around the planet. Intersecting two huge stripes to find a small square is slow. What you want is a structure where points that are close in space are also close in the index.</p><p>A <strong>geohash</strong> does that by interleaving the bits of latitude and longitude and writing the result as a short base-32 string. Each extra character shrinks the cell; six characters is roughly a kilometre across. Nearby points usually share a prefix, so a 2-D proximity search becomes a 1-D prefix lookup that any B-tree or key-value store can serve. The catch is cell edges: two points a metre apart can fall in different cells with unrelated strings. The standard fix is to search the target cell plus its eight neighbours, then filter by exact distance.</p><p>A <strong>quadtree</strong> splits space into four quadrants and keeps splitting only where a cell holds too many points, so it stays balanced when density varies wildly between a city centre and open ocean. It is usually built in memory. An <strong>R-tree</strong> groups shapes into nested bounding rectangles and handles polygons and routes as well as points; it is what PostGIS uses, and it is the safe answer when the data lives in a real database.</p><p><strong>Full-text search</strong> uses an <strong>inverted index</strong>: each document is split into normalised terms (lowercased, stemmed, stop words removed), and each term points to the list of documents containing it. A query fetches the lists for its terms, intersects or merges them, and ranks the results with a relevance score. That replaces a <code>LIKE '%word%'</code> scan over every row with a few list lookups.</p>`,
      },
      {
        type: "callout",
        tone: "interview",
        title: "Say where search lives",
        html: `<p>Keep the primary database as the source of truth and stream changes into the search engine with change data capture. Then say the consequence out loud: search results are eventually consistent and may lag a write by a second or two.</p>`,
      },
    ],
  },
  {
    id: "composite-covering",
    title: "Composite and covering indexes",
    kicker: "Index tuning",
    blocks: [
      {
        type: "text",
        html: `<p>A <strong>composite index</strong> is one B-tree sorted by several columns in a fixed order, like a phone book sorted by surname and then by first name. It can jump straight to a surname, or to a surname and first name together, but it cannot jump to a first name alone. That is the <strong>leftmost-prefix rule</strong>: an index on (a, b, c) can seek on a, on a and b, or on all three, but not on b or c by themselves. A range condition on a column also ends the seek there, because entries after it are no longer in a useful order for the next column.</p><p>The resulting rule of thumb is short: <strong>put equality columns first, then the one column you range over or sort by</strong>. A <strong>covering index</strong> goes a step further and includes every column the query reads, so the database answers from the index without visiting the table at all. That saves one random read per returned row, which is often the dominant cost of a hot list query.</p>`,
      },
      {
        type: "steps",
        title: "Worked example: designing one index for one query",
        items: [
          "Query: <code>SELECT id, total FROM orders WHERE customer_id = ? AND status = 'shipped' ORDER BY created_at DESC LIMIT 20</code>.",
          "Equality filters are customer_id and status, so they lead the index.",
          "created_at comes next. Within one customer and status, entries are already in date order, so the database reads the first 20 entries and stops, with no sort step.",
          "Index: (customer_id, status, created_at). Putting created_at first would make it impossible to seek on the two equality filters.",
          "If this query is extremely hot, add total as an included column so the index covers it and the table is never touched.",
        ],
      },
      {
        type: "keypoints",
        title: "Two more tools worth naming",
        items: [
          "<strong>Partial index</strong>: index only rows that match a condition, such as active orders, so the index stays small and cheap to maintain.",
          "<strong>Expression index</strong>: index a computed value such as <code>lower(email)</code> so case-insensitive lookups can still seek.",
          "<strong>Check the plan</strong>: when a query is slow, the first move is to look at the query plan for a sequential scan where you expected an index seek.",
        ],
      },
    ],
  },
  {
    id: "interview-pitfalls",
    title: "Choosing well under interview pressure",
    kicker: "Interview angle",
    blocks: [
      {
        type: "compare",
        items: [
          { title: "Good: named and justified", tone: "ok", html: `"Riders query by location every few seconds, so I'll keep driver positions in Redis keyed by geohash and search the cell plus its eight neighbours."` },
          { title: "Weak: vague", tone: "bad", html: `"We'll index the location column." A single-column index on coordinates does not answer proximity questions.` },
          { title: "Good: right column order", tone: "ok", html: `"Equality on user_id, then sort by created_at, so the index is (user_id, created_at)."` },
          { title: "Weak: wrong order", tone: "bad", html: `"An index on (created_at, user_id)." It cannot seek on user_id, so it reads far more of the index than needed.` },
        ],
      },
      {
        type: "list",
        title: "Mistakes to avoid",
        items: [
          "Searching only the user's own geohash cell and missing everything just over the border.",
          "Using SQL <code>LIKE</code> with a leading wildcard for search at scale instead of an inverted index.",
          "Treating the search index as the source of truth, or forgetting to mention its indexing lag.",
          "Adding a covering index to every query. Wider indexes cost disk and write time; save them for the hottest paths.",
        ],
      },
    ],
  },
];
