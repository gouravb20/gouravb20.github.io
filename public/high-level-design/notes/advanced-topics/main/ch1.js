// Main tab: Chapter 1, Why a B-tree can't find nearby points, and spatial trees. Format: DeepSection[] in public/shared/notes.d.ts.
window.MAIN = window.MAIN || {};
MAIN.ch1 = [
  {
    id: `why-sorting-fails`,
    title: `Nearby is a two-dimensional question`,
    kicker: `Mental model`,
    blocks: [
      { type: `text`, html: `<p>A proximity query asks for everything within some distance of a point, or the k closest things to it: drivers near a rider, restaurants near a user, stores near a postcode. It looks like a range query, so the first instinct is to put an index on the location columns. That instinct is wrong, and explaining why is usually the first thing an interviewer wants to hear.</p>
<p>A B-tree keeps its keys in a single sorted line. Location has two coordinates, and no single ordering of the plane keeps every pair of neighbours next to each other. Index latitude and a 1 km radius query becomes "every row whose latitude is within about 0.009 degrees", which is a thin band that runs across the entire map. Every row in that band still needs a distance check, and on a national or global table the band holds thousands of times more rows than the circle you wanted.</p>` },
      { type: `keypoints`, items: [
        `<strong>A composite (lat, lng) index</strong> doesn't rescue you. It is sorted by latitude first, so the latitude range still decides how much of the index is walked; longitude only throws away entries during that walk.`,
        `<strong>Two separate indexes</strong> are no better. The planner either uses one band or reads both bands and intersects them.`,
        `<strong>The real fix</strong> is an index that understands two dimensions (a spatial tree) or a key that flattens a location while keeping neighbours mostly close (an encoded cell, covered in the next chapter).`,
      ] },
    ],
  },
  {
    id: `candidates-then-exact`,
    title: `Every spatial index produces candidates, not answers`,
    kicker: `The core pattern`,
    blocks: [
      { type: `text`, html: `<p>No spatial index stores circles. It stores cells or rectangles, and a query picks the few cells or rectangles that cover the search circle. The corners of that cover stick out past the radius, so some of what comes back is too far away. The index's job is to make the candidate set small; an exact distance calculation then makes the result correct. Say both halves of this out loud in an interview.</p>` },
      { type: `steps`, title: `The shape of every proximity query`, items: [
        `<strong>Cover:</strong> find the index regions (quadtree leaves, R-tree rectangles, cells) that intersect the search circle.`,
        `<strong>Gather:</strong> collect the points or shapes stored in those regions. This is the candidate set, usually tens to a few thousand rows.`,
        `<strong>Filter:</strong> compute real great-circle distance (haversine, or <code>ST_DWithin</code> on a PostGIS geography column) and drop anything outside the radius.`,
        `<strong>Rank:</strong> sort by distance, apply business filters such as "available" or "open now", and limit to k.`,
      ] },
      { type: `callout`, tone: `mistake`, title: `Degrees are not kilometres`, html: `<p>A degree of latitude is about 111 km everywhere, but a degree of longitude shrinks with the cosine of the latitude: roughly 85 km in New York and 56 km in Oslo. Comparing raw degree differences gives the wrong answer away from the equator. The final filter has to use real distance.</p>` },
    ],
  },
  {
    id: `four-trees`,
    title: `The four spatial trees in one breath each`,
    kicker: `Structures`,
    blocks: [
      { type: `text`, html: `<p>You rarely need to implement these, but you should be able to say how each one splits space and what that choice costs. The differences come down to two questions: where does it split, and does it suit disk or only memory?</p>` },
      { type: `compare`, items: [
        { title: `Quadtree`, tone: `info`, html: `<p>Start with the whole map. When a square holds more than a set number of points, split it into four equal quadrants, and repeat. Dense downtowns become deep stacks of tiny squares; empty countryside stays one big square. Easy to explain and good in memory, but depth varies with density and each level is a pointer hop, which is slow on disk.</p>` },
        { title: `k-d tree`, tone: `info`, html: `<p>A binary tree that splits on x, then y, then x again, always at the median point rather than the midpoint. Each split halves the number of points, so depth stays near log<sub>2</sub> n however clustered the data is. Strong for in-memory nearest-neighbour search on fixed data; still pointer-based.</p>` },
        { title: `BKD tree`, tone: `ok`, html: `<p>A k-d tree packed into page-sized blocks and built once per batch. Lucene and Elasticsearch use it for geo points. Reads are fast and compact on disk, but the structure is write-once: updates land in new segments that are merged later and only become visible after a refresh.</p>` },
        { title: `R-tree`, tone: `ok`, html: `<p>Wrap every object in its smallest bounding rectangle, group nearby rectangles under larger ones, and keep the tree balanced with page-sized nodes like a B-tree. The only structure here that indexes shapes as well as points. Overlapping rectangles force a query down several branches, so implementations (the R*-tree family) work hard to limit overlap. PostGIS's GiST index is the common home.</p>` },
      ] },
    ],
  },
  {
    id: `choosing`,
    title: `Choosing an index in a design interview`,
    kicker: `Decision rule`,
    blocks: [
      { type: `text`, html: `<p>Two properties of the data decide the answer: its <strong>shape</strong> (points or polygons) and its <strong>write rate</strong> (static places or locations that change every few seconds). Spatial trees win on shapes and mostly static data; encoded cells win on constantly moving points.</p>` },
      { type: `table`, title: `Three common prompts`, headers: [`Prompt`, `Data`, `Good fit`, `Why`], rows: [
        [`Which delivery zone contains this address?`, `A few thousand polygons, rarely edited`, `PostGIS with a GiST (R-tree) index`, `Containment needs shapes; the index finds zones whose rectangles hold the point, an exact point-in-polygon test picks the one`],
        [`Restaurants near me, open now, rated 4+`, `Millions of static points with many attributes`, `Elasticsearch geo_point (BKD) or PostGIS`, `Geo filter combines with text and attribute filters in one query; points rarely move`],
        [`Drivers within 2 km of a rider`, `Millions of points updated every few seconds`, `Encoded cells in Redis or a key-value store`, `Each update must be one cheap write; tree rebalancing or segment merges would churn constantly`],
        [`Collision checks in a game or a map tile cache`, `A bounded set in application memory`, `Quadtree or k-d tree`, `No disk involved, so pointer hops are cheap`],
      ] },
      { type: `callout`, tone: `interview`, title: `What to say`, html: `<p>"A B-tree on latitude, or even on (lat, lng), returns a band of the map, not a circle, so I need a spatial index. Because these are polygons that rarely change, I'd use PostGIS with a GiST index. The index gives me candidates from rectangles that cover the area, then I filter by exact distance and sort." Then name the write-rate caveat: if the points moved constantly you would switch to encoded cells.</p>` },
      { type: `keypoints`, title: `Common mistakes`, items: [
        `Proposing a composite (lat, lng) B-tree as if it were a spatial index.`,
        `Forgetting the exact-distance filter and returning everything in the covering cells.`,
        `Putting live driver locations in Elasticsearch: write-once segments and refresh delay make constant updates expensive and stale.`,
        `Reaching for a quadtree as the on-disk index of a large database, where pointer chasing turns into random reads.`,
      ] },
    ],
  },
];
