// Main tab: Chapter 2, Encoded keys: geohash, S2 and H3. Format: DeepSection[] in public/shared/notes.d.ts.
window.MAIN = window.MAIN || {};
MAIN.ch2 = [
  {
    id: `flatten-the-location`,
    title: `Turn a location into a key an ordinary index understands`,
    kicker: `Mental model`,
    blocks: [
      { type: `text`, html: `<p>Instead of building a special tree, you can divide the world into a grid of cells and give each cell an ID. A point's cell ID is just a value, so a plain B-tree, a Redis sorted set or a key-value store can index it. "What is near this point?" becomes "what is stored under these few cell IDs?", which every database already answers well.</p>
<p>The trick that makes this work is a <strong>space-filling curve</strong>: a single line that threads through every cell so that cells close together on the line are usually close together on the map. Sort by position on the curve and a range scan sweeps up a neighbourhood. Geohash follows a Z-shaped curve; S2 follows a Hilbert curve, which keeps neighbours together a little better.</p>` },
      { type: `steps`, title: `How a geohash is built`, items: [
        `Split the world's longitude range in half. Write 1 if the point is in the eastern half, 0 if western.`,
        `Split the latitude range in half the same way and write another bit.`,
        `Keep alternating, halving whichever range you are on. Each bit halves the cell.`,
        `Group the bits five at a time and write each group as one base-32 character.`,
        `Result: each extra character shrinks the cell about 32-fold. Five characters is roughly a 5 km square, six is about 1.2 km by 0.6 km, nine is a few metres.`,
      ] },
      { type: `text`, html: `<p>Because every character refines the previous one, points that share a prefix share a cell. <code>WHERE geohash LIKE 'dr5ru%'</code> is an ordinary prefix scan that returns everything in one neighbourhood-sized cell.</p>` },
    ],
  },
  {
    id: `boundaries`,
    title: `The boundary problem and the 3x3 query`,
    kicker: `The essential fix`,
    blocks: [
      { type: `text`, html: `<p>Cells have hard edges. A rider standing just inside the eastern edge of one cell and a driver ten metres away across that edge can share almost no prefix at all. Scan only the rider's cell and you miss the closest driver. This is the most common bug in geohash designs, and interviewers listen for it.</p>
<p>The fix is to always query the point's cell <strong>and its eight neighbours</strong>, then filter by exact distance. For that block of nine cells to cover the search circle, each cell must be at least as large as the radius.</p>` },
      { type: `steps`, title: `Worked example: a 1 km radius search`, items: [
        `Pick the precision. A six-character cell is about 1.2 km by 0.6 km; its short side is smaller than the radius, so a 3x3 block could miss points. Five characters (about 4.9 km square) is safe.`,
        `Compute the rider's five-character geohash and its eight neighbours. Libraries do this with a lookup table; it is not just "change the last character".`,
        `Run nine prefix scans, or one scan per contiguous range, and gather candidates.`,
        `Compute haversine distance for each candidate, keep those within 1 km, sort and limit.`,
        `If the area is dense and nine big cells return too many rows, use the finer precision with two rings of neighbours instead.`,
      ] },
    ],
  },
  {
    id: `geohash-s2-h3`,
    title: `Geohash, S2 and H3`,
    kicker: `The three grids`,
    blocks: [
      { type: `compare`, items: [
        { title: `Geohash`, tone: `info`, html: `<p>Treats latitude and longitude as a flat rectangle. Simple, human-readable and range-scannable. Its weakness is distortion: a degree of longitude shrinks toward the poles, so cells in Oslo are about half as wide as cells in Singapore, and the antimeridian splits neighbours. Fine for one country; awkward for consistent sizes worldwide. Redis GEO stores a 52-bit geohash as a sorted-set score.</p>` },
        { title: `S2`, tone: `ok`, html: `<p>Google's library projects the sphere onto the six faces of a cube and subdivides each face as a quadtree along a Hilbert curve. Cells are roughly equal in area everywhere, IDs are 64-bit integers whose prefixes are parent cells, and polygons can be covered with a handful of cells. Behind MongoDB's 2dsphere index.</p>` },
        { title: `H3`, tone: `ok`, html: `<p>Uber's hexagonal grid with 16 resolutions. A hexagon's six neighbours are all the same distance from its centre, so "everything within k rings" approximates a circle well and per-cell aggregates (supply, demand, surge) look smooth. The cost: IDs don't sit on a space-filling curve, so you compute the list of ring cells and look each one up instead of scanning a range.</p>` },
      ] },
      { type: `callout`, tone: `tip`, title: `Which one to name`, html: `<p>Geohash when you want something you can explain end to end in two minutes or you are using Redis GEO. S2 when the problem is global or involves polygons. H3 when the design aggregates by area, as dispatch and pricing do. The reasoning matters more than the library.</p>` },
    ],
  },
  {
    id: `moving-points`,
    title: `Why encoded cells win for moving points`,
    kicker: `Applying it`,
    blocks: [
      { type: `text`, html: `<p>The classic prompt is "find drivers near a rider" with millions of active drivers, each sending a location every few seconds. That is hundreds of thousands of writes per second. A spatial tree would rebalance or merge segments on every update. With encoded cells, an update is one overwrite of a key or a sorted-set score.</p>` },
      { type: `list`, title: `A design you can sketch in an interview`, items: [
        `<strong>Update path:</strong> each location ping overwrites the driver's entry, for example <code>GEOADD drivers lng lat driver:42</code> in Redis, or a row keyed by driver ID holding its H3 cell and exact coordinates.`,
        `<strong>Expiry:</strong> attach a TTL or last-seen timestamp so drivers who go offline drop out without a cleanup job.`,
        `<strong>Query path:</strong> compute the rider's cell, look up that cell and its neighbours, filter candidates by exact distance and availability, sort and return the closest few.`,
        `<strong>Scale:</strong> shard by region or by coarse cell so each shard holds one metro area; the query touches one shard, or two near a border.`,
      ] },
      { type: `tradeoffs`, prosLabel: `Encoded cells`, consLabel: `Watch out for`, pros: [
        `Writes are single key-value updates, so high update rates are easy`,
        `Works on any store that can sort or look up keys`,
        `Shards naturally by cell or region`,
      ], cons: [
        `Mostly for points; containment in arbitrary polygons wants a spatial tree`,
        `Always needs the neighbour ring and an exact-distance filter`,
        `Fixed cell sizes: very dense areas return large candidate sets unless you go finer`,
      ] },
      { type: `callout`, tone: `interview`, title: `The one-line summary`, html: `<p>"Spatial tree for shapes, encoded cells for moving points, and always query the neighbouring cells and post-filter by real distance." If you can justify each clause, you have covered what most interviewers want from proximity search.</p>` },
    ],
  },
];
