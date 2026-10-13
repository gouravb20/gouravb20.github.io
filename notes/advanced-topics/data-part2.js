// System design advanced topics - part 2 data (chapters 1-10)
// Proximity search, data structures for big data, vector databases, time series databases, change data capture.
// Topic outline follows Hello Interview's "Advanced Topics" series; notes written independently.
// Chapter 5 (Morris counter) follows Arpit Bhayani's essay https://arpitbhayani.me/blogs/morris-counter/
window.DATA.chapters.push(
  // ------------------------------------------------------------------
  {
    id: `ch1`, part: 1, number: 1,
    title: `Why a B-tree can't find nearby points, and spatial trees: quadtrees, k-d trees and R-trees`,
    overview: `"Drivers within 2 km of this rider" looks like a range query, but it isn't one. A B-tree sorts on one dimension, and a one-dimensional order can't keep two-dimensional neighbours together, so an index on latitude, or even on (latitude, longitude), returns a huge strip of the map. Production systems recover locality in one of two ways: a <strong>spatial tree</strong> that understands space (quadtree, k-d and BKD trees, R-trees) or an <strong>encoded key</strong> that flattens a location into one sortable value (next chapter). Either way the index only produces <strong>candidates</strong>; exact distance math picks the winners.`,
    concepts: [
      { term: `The proximity query`, def: `Find everything within some distance of a point, or the k nearest: drivers near a rider, restaurants near a user, friends near a location.`, why: `It appears whenever the lookup key is a location rather than an ID or a value, which is why it shows up in Uber, Yelp, Tinder and delivery designs.`, demo: `latStrip` },
      { term: `Why one-dimensional sorting fails`, def: `A B-tree keeps keys in one sorted order. Index latitude and a radius query becomes a horizontal strip around the earth; index longitude and it's a vertical strip. Neither is ordered by distance.`, why: `Flattening a map onto one axis puts true neighbours far apart in the index. That's the root problem every spatial index solves.`, demo: `latStrip` },
      { term: `Composite (lat, lng) indexes don't help much`, def: `A composite B-tree sorts by latitude and only breaks ties with longitude. Once it seeks on a latitude range, longitude can filter entries inside the index but can't narrow the scan.`, why: `It saves table lookups, not index work: you still walk every entry in the latitude strip. A common wrong answer in interviews.`, demo: `latStrip` },
      { term: `Candidates, then exact filtering`, def: `A spatial index turns "check every row" into "check a small candidate set". Exact distance (haversine) or geometry tests then remove the false candidates.`, why: `Every structure in this part is just a cheaper way to generate candidates. Always say you'll post-filter.`, demo: `latStrip` },
      { term: `Two families`, def: `Spatial trees (quadtree, k-d/BKD, R-tree) are custom index structures that understand space. Encoded keys (geohash, S2, H3) turn a location into a value an ordinary index can handle.`, why: `The shape of the data decides: geometry such as polygons and roads wants a spatial tree; constantly moving points want encoded cells.` },
      { term: `Quadtree`, def: `The map is the root. Split it into four quadrants; split any quadrant holding too many points into four again, recursively. Points live in the leaves.`, why: `Adapts to density: dense downtowns become deep trees, empty areas stay one coarse cell. The cleanest way to build intuition for spatial indexing.`, demo: `quadtree` },
      { term: `Quadtree weaknesses`, def: `Splits fall at the geometric midpoint, not where the data is, so dense clusters need many levels while rural queries finish in two. It's also a pointer structure, so each hop can be a random disk read.`, why: `Latency depends on where you search, and it performs poorly once the tree doesn't fit in memory. Great in RAM (map tiles, game collision detection), weak as an on-disk database index.`, demo: `quadtree` },
      { term: `k-d tree`, def: `A binary tree that alternates the splitting dimension at each level (x, then y, then x...) and splits at the median point rather than the midpoint.`, why: `Median splits halve the number of points, not the area, so depth stays about log2(n) regardless of clustering. Still pointer-based, so still awkward on disk.`, demo: `quadtree` },
      { term: `BKD tree`, def: `A block k-d tree: points packed into page-sized leaf blocks, built once from a batch of data. Lucene and Elasticsearch index geo points this way, per immutable segment.`, why: `Disk-friendly and fast for reads, but essentially write-once: new data goes into new segments that get merged later, so heavy update churn costs merging work.` },
      { term: `R-tree`, def: `Wrap every object (point, line, polygon) in its minimum bounding rectangle, group nearby rectangles into larger rectangles, and nest up to a root. Balanced like a B-tree with page-sized nodes.`, why: `The first spatial index designed for disk, and the only one here that handles shapes: "which delivery zone contains this address", "does this road cross this county".` },
      { term: `Overlap and the R*-tree`, def: `R-tree rectangles can overlap, so a query may descend several branches. The R*-tree uses smarter insertion and splitting heuristics to keep overlap low.`, why: `Overlap is the R-tree's performance knob. Almost every modern implementation is an R*-tree variant.` },
      { term: `Where these live`, def: `PostGIS (R-tree-like GiST indexes), SQLite R*Tree and Oracle Spatial use R-trees; Elasticsearch and Lucene use BKD trees; quadtrees mostly live in memory.`, why: `Name the boring default for the data shape: PostGIS for geometry, Elasticsearch when geo filters combine with text search.` },
      { term: `Exact distance`, def: `Great-circle (haversine) distance on a sphere, or a database function such as <code>ST_DWithin</code> / <code>ST_Distance</code> on geography types.`, why: `Degrees aren't kilometres: a degree of longitude shrinks with latitude. The final filter must use real distance.` }
    ],
    cheatsheet: [
      { title: `Spatial trees compared`, type: `table`, headers: [`Structure`, `Splits`, `Good at`, `Weak at`, `Used in`], rows: [
        [`Quadtree`, `4 ways at midpoints`, `Intuition, in-memory, adapts to density`, `Deep in clusters; pointer chasing on disk`, `Map tiles, game engines`],
        [`k-d tree`, `2 ways at medians, alternating axes`, `Balanced depth log n; nearest neighbour`, `Pointer-based; poor on disk`, `In-memory kNN`],
        [`BKD tree`, `k-d with page-sized blocks`, `Fast reads, compact on disk`, `Write-once; churn means merging`, `Lucene, Elasticsearch`],
        [`R-tree / R*-tree`, `Nested bounding rectangles`, `Points, lines, polygons; balanced on disk`, `Overlap; costlier writes`, `PostGIS, SQLite, Oracle`]
      ], note: `Every one of these produces candidates; finish with exact distance or geometry.` },
      { title: `Pick by data shape`, type: `list`, items: [
        `Polygons, routes, zones, containment or intersection: a spatial tree, usually PostGIS with a GiST index.`,
        `Geo filter combined with full-text search: Elasticsearch geo_point / geo_shape (BKD).`,
        `Points that move constantly (drivers, devices): encoded cells such as geohash, S2 or H3 on an ordinary index or Redis (next chapter).`,
        `Small, static, in-memory datasets: a quadtree or k-d tree in application memory is fine.`
      ] },
      { title: `PostGIS radius query`, type: `code`, body: `CREATE EXTENSION postgis;
CREATE TABLE restaurants (
  id   bigserial PRIMARY KEY,
  name text,
  geom geography(Point, 4326)
);
CREATE INDEX restaurants_geom ON restaurants USING GIST (geom);

-- Within 2 km of a point, nearest first
SELECT id, name,
       ST_Distance(geom, ST_MakePoint(-73.9857, 40.7484)::geography) AS meters
FROM restaurants
WHERE ST_DWithin(geom, ST_MakePoint(-73.9857, 40.7484)::geography, 2000)
ORDER BY meters
LIMIT 20;` }
    ],
    interview: [
      { q: `Why can't we just put a B-tree index on latitude and longitude?`, a: `A B-tree sorts on one key. With an index on latitude, a 2 km radius query becomes a band 4 km tall that wraps the whole map, and you still compute distance for every row in it. A composite index on (lat, lng) sorts by latitude first, so it seeks the same band and can only use longitude to filter entries inside it. One-dimensional order can't preserve two-dimensional closeness; you need a spatial tree or an encoded cell key.`, diff: `medium` },
      { q: `How does a quadtree answer "restaurants within 1 km"?`, a: `Walk from the root, choosing the quadrant that contains the query point, until reaching a leaf. Collect points from that leaf and from neighbouring leaves that intersect the search circle (so points just across a boundary aren't missed), then compute exact distance on that small set. Dense areas have small leaves, so the candidate set stays small everywhere.`, diff: `medium` },
      { q: `Quadtree vs k-d tree?`, a: `A quadtree splits each cell into four at its geometric midpoint, so clusters force many levels and depth varies with density. A k-d tree splits in two at the median, alternating dimensions, so each split halves the points and depth stays about log2(n). Both are pointer structures best kept in memory; the BKD tree packs a k-d tree into disk blocks.`, diff: `medium` },
      { q: `When would you choose an R-tree (PostGIS)?`, a: `When the data has shape: delivery zones, neighbourhoods, roads, geofences. R-trees index bounding rectangles of arbitrary geometries, stay balanced on disk like a B-tree, and support containment and intersection queries. For millions of constantly moving points, their rebalancing makes writes relatively expensive and encoded cells fit better.`, diff: `medium` },
      { q: `What does Elasticsearch use for geo queries, and what's the catch?`, a: `BKD trees: k-d trees packed into page-sized blocks, built per immutable Lucene segment. Reads are fast and compact. The catch is that segments are write-once, so updating a driver's location every few seconds means constant new segments and merges, and changes only become searchable after a refresh. It suits relatively static places combined with text search (Yelp), not live driver locations.`, diff: `hard` },
      { q: `Why is post-filtering always required?`, a: `Every spatial index approximates the search circle with cells or rectangles. Corners of those cells lie outside the radius, so some candidates are too far away. The final step computes real great-circle distance (or exact geometry) on the small candidate set and sorts or limits by it.`, diff: `easy` }
    ],
    labs: [`latStrip`, `quadtree`]
  },
  // ------------------------------------------------------------------
  {
    id: `ch2`, part: 1, number: 2,
    title: `Encoded keys: geohash, S2 and H3, and choosing an approach`,
    overview: `Instead of a custom tree, encode each latitude and longitude as a <strong>cell ID</strong> that an ordinary B-tree, a Redis sorted set or a key-value store can index. <strong>Geohash</strong> interleaves bits into a base-32 string where shared prefixes mean nearby cells; <strong>S2</strong> projects the sphere onto a cube for roughly equal-area cells with 64-bit IDs; <strong>H3</strong> uses hexagons whose six neighbours are all equally far away. Cell boundaries mean you always query a ring of cells and post-filter. Updating a moving point is a single integer write, which is why this family wins for drivers and devices.`,
    concepts: [
      { term: `Encoded keys`, def: `Turn a location into a single sortable value or cell ID, then use infrastructure you already have: a B-tree prefix or range scan, a sorted set, or an exact-match lookup.`, why: `No spatial extension, cheap writes, easy sharding by cell. The trade-off is that you mostly index points, not shapes.` },
      { term: `Space-filling curves`, def: `A single line threaded through 2D space so points close on the line are usually close on the map. Geohash follows a Z-order curve; S2 uses a Hilbert curve, which preserves locality better.`, why: `This is what lets a one-dimensional range scan sweep up a neighbourhood.` },
      { term: `Geohash`, def: `Recursively split the world, alternating longitude and latitude bits, and write every 5 bits as one base-32 character. Each extra character zooms in by about 32x: 5 characters is ~5 km, 6 is ~1 km, 9 is ~5 m.`, why: `Simple enough to compute in a few lines, readable, and storable as text or as an integer with the same ordering.`, demo: `geohash` },
      { term: `Prefix locality`, def: `Points sharing a geohash prefix fell into the same cell at every level of that prefix, so <code>WHERE geohash LIKE 'dr5ru%'</code> is an ordinary B-tree prefix scan over one cell.`, why: `Proximity search on any database that can sort strings.`, demo: `geohash` },
      { term: `Boundary problem and the 3x3 trick`, def: `Two points a metre apart can straddle a cell boundary and share no prefix. Query the point's cell plus its 8 neighbours, then post-filter by exact distance.`, why: `The most common geohash bug. Almost every encoded-key system queries a ring of cells, never just one.`, demo: `geohash` },
      { term: `Redis GEO`, def: `<code>GEOADD</code> stores a 52-bit interleaved geohash as the score of a sorted set member; <code>GEOSEARCH</code> scans the score ranges of the covering cells and filters by distance.`, why: `The fastest path to "drivers near me": in-memory, ~100K+ updates per second per node, a location update is one command.` },
      { term: `Geohash distortion`, def: `Geohash treats lat/lng as a flat rectangle. A degree of longitude is ~111 km at the equator and shrinks with cos(latitude), so cells become thin slivers toward the poles and wrap awkwardly at the antimeridian.`, why: `Fine for one city; a problem for consistent cell sizes across the globe.`, demo: `cellShape` },
      { term: `S2`, def: `Google's library projects the sphere onto the six faces of a cube and subdivides each face into a quadtree of cells along a Hilbert curve. Each cell has a 64-bit hierarchical ID (30 levels); truncating bits gives the parent.`, why: `Roughly equal-area cells everywhere, correct handling of the poles and the antimeridian, and good polygon coverings. It underlies MongoDB's 2dsphere index.`, demo: `cellShape` },
      { term: `H3`, def: `Uber's hexagonal grid with 16 resolutions and 64-bit cell IDs. Resolution 9 hexagons have ~175 m edges. <code>gridDisk(cell, k)</code> returns all cells within k rings.`, why: `Built for dispatch, surge pricing and heat maps, where "everything within N rings" is the core operation.`, demo: `hexRings` },
      { term: `Why hexagons`, def: `A square has 4 edge neighbours and 4 corner neighbours about 1.41x farther away. A hexagon's 6 neighbours are all the same distance from its centre, and rings of hexagons approximate circles better.`, why: `Cleaner ring queries and smoother aggregation. The cost: H3 IDs don't follow a space-filling curve, so nearby IDs aren't contiguous; you look up an explicit list of cells instead of a range.`, demo: `hexRings` },
      { term: `Moving points`, def: `Store each driver's current cell (and exact coordinates) keyed by driver ID; on every update rewrite one row or one sorted-set score, often with a TTL so stale drivers expire.`, why: `Millions of location updates per minute are just key-value writes, which shard easily by cell or region.` },
      { term: `Choosing an approach`, def: `Spatial tree for shapes and containment; encoded cells for moving points and high write rates. Name a library if you know it, but the reasoning matters more.`, why: `"Spatial tree for shapes, encoded cells for moving points, and always post-filter" is the one-line answer interviewers want.` }
    ],
    cheatsheet: [
      { title: `Geohash precision`, type: `table`, headers: [`Length`, `Cell size (at equator)`, `Typical use`], rows: [
        [`4`, `~39 km x 20 km`, `Region`],
        [`5`, `~4.9 km x 4.9 km`, `City district`],
        [`6`, `~1.2 km x 0.6 km`, `Neighbourhood: nearby search`],
        [`7`, `~153 m x 153 m`, `Street block`],
        [`8`, `~38 m x 19 m`, `Building`],
        [`9`, `~4.8 m x 4.8 m`, `Exact spot`]
      ], note: `Pick the length whose cell is at least as large as the search radius, then query the 3x3 block.` },
      { title: `Geohash vs S2 vs H3`, type: `table`, headers: [``, `Geohash`, `S2`, `H3`], rows: [
        [`Cell shape`, `Rectangles`, `Quadrilaterals on a cube`, `Hexagons`],
        [`Equal area?`, `No (shrinks toward poles)`, `Roughly (within ~2x)`, `Roughly`],
        [`ID`, `Base-32 string / integer`, `64-bit integer`, `64-bit integer`],
        [`Range scan finds neighbours?`, `Yes (Z-order prefix)`, `Yes (Hilbert ranges)`, `No: list cells with gridDisk`],
        [`Neighbours`, `8 (4 edge, 4 corner)`, `8`, `6, equidistant`],
        [`Seen in`, `Redis GEO, Elasticsearch geohash grid`, `MongoDB 2dsphere, Google`, `Uber dispatch and pricing`]
      ] },
      { title: `Redis GEO and H3 dispatch`, type: `code`, body: `# Redis: drivers in a sorted set scored by a 52-bit geohash
GEOADD drivers -73.9857 40.7484 driver:42
GEOSEARCH drivers FROMLONLAT -73.9857 40.7484 BYRADIUS 2 km ASC COUNT 20 WITHDIST

# H3: snap to a cell, take a ring, look up exact IDs, post-filter
import h3
cell  = h3.latlng_to_cell(lat, lng, 9)       # ~0.1 km^2 hexagons
cells = h3.grid_disk(cell, 1)                # the cell plus its 6 neighbours
rows  = db.query("SELECT id, lat, lng FROM drivers WHERE h3_r9 = ANY(%s)", list(cells))
near  = [r for r in rows if haversine(lat, lng, r.lat, r.lng) <= radius_m]` }
    ],
    interview: [
      { q: `Design "find drivers near a rider" for millions of active drivers.`, a: `Drivers send locations every few seconds. Store current positions in Redis with GEOADD (or in a key-value store keyed by an H3 or geohash cell), with a TTL so offline drivers expire, and shard by region or cell. A rider's request computes their cell, queries that cell and its neighbours (GEOSEARCH, or an IN list of H3 cells), then sorts candidates by exact distance and filters by availability. Each location update is a single cheap write, which is what makes this scale.`, diff: `hard` },
      { q: `What is the geohash boundary problem?`, a: `Geohash cells have hard edges. A rider just inside the edge of cell dr5ru and a driver ten metres away in dr5rg share a short prefix, so a prefix scan over dr5ru alone misses the closest driver. The fix is to query the cell plus its 8 neighbours and post-filter by distance; pick a precision whose cells are at least as large as the radius.`, diff: `medium` },
      { q: `Why did Uber build H3 with hexagons?`, a: `Dispatch and pricing constantly ask "everything within k rings of this cell" and aggregate supply and demand per cell. Square grids have two neighbour distances (edge and corner), which makes rings lumpy; hexagons have six equidistant neighbours, so rings approximate circles and aggregations are smoother. The trade-off is that H3 IDs aren't range-scannable, so you compute the ring's cell IDs and look them up directly.`, diff: `medium` },
      { q: `When does geohash's flat-map assumption hurt?`, a: `At global scale. Longitude degrees shrink with cos(latitude), so a geohash cell in Oslo is about half as wide as one in Singapore, and near the poles cells become slivers; the antimeridian splits neighbours too. If you need consistent cell sizes worldwide or polygons crossing those lines, use S2 (or H3), which model the sphere.`, diff: `medium` },
      { q: `How would you implement Yelp's "restaurants near me" with filters?`, a: `Restaurants are mostly static points with lots of attribute and text filters, so Elasticsearch with a geo_point field (or PostGIS) is a good fit: a geo_distance filter plus category, rating and text queries in one request, sorted by distance or relevance. Caching popular areas helps. Encoded cells in Redis would be overkill since restaurants don't move.`, diff: `medium` },
      { q: `How do you pick a geohash precision for a radius search?`, a: `Choose the longest geohash whose cell dimensions are still at least the search radius, so the 3x3 block around the user covers the whole circle. For 1 km, length 5 (~5 km) is safe; length 6 (~1.2 x 0.6 km) can miss points unless you widen to more rings. If results are too few, step down one precision and search again.`, diff: `easy` }
    ],
    labs: [`geohash`, `cellShape`, `hexRings`]
  },
  // ------------------------------------------------------------------
  {
    id: `ch3`, part: 2, number: 3,
    title: `Bloom filters: probabilistic set membership`,
    overview: `Some problems are too big for exact data structures: trillions of IDs won't fit in a hash set. Probabilistic structures trade a small, tunable error for orders of magnitude less memory. The <strong>Bloom filter</strong> is the best known: a bit array plus k hash functions that answers "definitely not in the set" or "probably in the set". About 10 bits per key gives a 1% false positive rate whatever the key size. These structures change the shape of a design, but using one where a hash table would do is a red flag, so justify it with a number.`,
    concepts: [
      { term: `Why probabilistic structures`, def: `Exact sets and counters need memory proportional to the number of distinct items. Probabilistic structures use fixed or much smaller memory in exchange for bounded, one-sided errors.`, why: `They matter when the data is enormous or the check sits on a hot path where a disk or network lookup is too expensive.` },
      { term: `Bloom filter`, def: `A bit array of m bits, initially zero, and k independent hash functions. Adding an item sets the k bits it hashes to; checking an item tests whether all k bits are set.`, why: `Fixed memory per item, regardless of how big the keys are, with O(k) inserts and lookups.`, demo: `bloomFilter` },
      { term: `"Definitely not" or "maybe"`, def: `If any of an item's bits is zero, it was never added: a guaranteed negative. If all are set, the item was probably added, but other items may have set those bits: a false positive.`, why: `No false negatives ever. That one-sided error is what makes Bloom filters safe as a pre-check in front of an exact lookup.`, demo: `bloomFilter` },
      { term: `False positive rate`, def: `With n items, m bits and k hashes, p &asymp; (1 - e<sup>-kn/m</sup>)<sup>k</sup>. The best k is (m/n) &middot; ln 2. About 9.6 bits per item gives 1%; each extra 4.8 bits per item cuts the rate tenfold.`, why: `You size a Bloom filter from two numbers: expected items and acceptable false positive rate.`, demo: `bloomFilter` },
      { term: `Saturation`, def: `Insert more items than the filter was sized for and more bits become 1, until almost everything reports "maybe" and the filter is useless.`, why: `Bloom filters can't be resized. Size for growth, rebuild periodically, or use a scalable Bloom filter that adds new layers.`, demo: `bloomFilter` },
      { term: `No deletion`, def: `Clearing an item's bits could clear bits shared with other items and create false negatives. A counting Bloom filter keeps small counters instead of bits; a cuckoo filter stores fingerprints and supports deletes.`, why: `If items must be removed (expired sessions, unfollowed accounts), pick a variant that supports it or rebuild.` },
      { term: `LSM trees and databases`, def: `Cassandra, RocksDB, HBase and time series databases keep a Bloom filter per SSTable, so a read skips files that definitely don't contain the key.`, why: `The most common production use: it turns many possible disk reads into one or two.` },
      { term: `Web crawlers`, def: `Track billions of already-seen URLs in memory so the crawler doesn't fetch them again. A false positive means skipping one new page, which is acceptable.`, why: `A classic interview fit: the set is enormous, approximate is fine, and the cost of an error is small.` },
      { term: `Cache admission`, def: `CDNs and caches can admit an object only on its second request, using a Bloom filter to remember first requests; most one-hit wonders never take cache space.`, why: `Shows Bloom filters improving hit ratios, not just saving lookups.` },
      { term: `Pre-checks before expensive lookups`, def: `Check a Bloom filter of known-bad URLs, taken usernames or existing keys first; only a "maybe" goes on to the authoritative store.`, why: `Most lookups are for things that don't exist, and those return immediately without touching the database.` },
      { term: `Redis Bloom`, def: `Redis Stack's Bloom module provides <code>BF.RESERVE</code>, <code>BF.ADD</code> and <code>BF.EXISTS</code> with configured capacity and error rate, shared by every server.`, why: `In an interview you rarely build one; you name where it lives and how it's sized.` },
      { term: `When not to use one`, def: `If the set fits comfortably in a hash set or a Redis set, or if a false positive is unacceptable without a follow-up check, don't.`, why: `Ten million 16-byte IDs is a few hundred MB: a hash set or Redis set handles it. Reach for Bloom filters at billions.` }
    ],
    cheatsheet: [
      { title: `Sizing a Bloom filter (optimal k)`, type: `table`, headers: [`Bits per item`, `Best k`, `False positive rate`, `Memory for 1B items`], rows: [
        [`4.8`, `3`, `~10%`, `600 MB`],
        [`9.6`, `7`, `~1%`, `1.2 GB`],
        [`14.4`, `10`, `~0.1%`, `1.8 GB`],
        [`19.2`, `13`, `~0.01%`, `2.4 GB`]
      ], note: `A hash set of 1B 16-byte IDs needs tens of GB once you count overhead.` },
      { title: `Set-membership structures`, type: `table`, headers: [`Structure`, `False negatives`, `False positives`, `Delete`, `Memory`], rows: [
        [`Hash set`, `No`, `No`, `Yes`, `Key size plus overhead per item`],
        [`Bloom filter`, `No`, `Yes, tunable`, `No`, `~10 bits per item for 1%`],
        [`Counting Bloom`, `No`, `Yes`, `Yes`, `~4x a Bloom filter`],
        [`Cuckoo filter`, `No`, `Yes`, `Yes`, `Similar to Bloom at low error rates`]
      ] },
      { title: `A Bloom filter in a few lines`, type: `code`, body: `import math, mmh3

class Bloom:
    def __init__(self, n, p):
        self.m = math.ceil(-n * math.log(p) / math.log(2) ** 2)   # bits
        self.k = max(1, round(self.m / n * math.log(2)))          # hashes
        self.bits = bytearray((self.m + 7) // 8)

    def _idx(self, item):
        h1, h2 = mmh3.hash(item, 0), mmh3.hash(item, 1)
        return [(h1 + i * h2) % self.m for i in range(self.k)]     # double hashing

    def add(self, item):
        for i in self._idx(item): self.bits[i // 8] |= 1 << (i % 8)

    def maybe_contains(self, item):
        return all(self.bits[i // 8] >> (i % 8) & 1 for i in self._idx(item))` }
    ],
    interview: [
      { q: `How does a Bloom filter work, and what can it tell you?`, a: `It's a bit array with k hash functions. Adding an item sets the k bits it hashes to; checking an item looks at those k bits. If any is 0 the item was definitely never added. If all are 1 it was probably added, but other items might have set them, so it's a "maybe". No false negatives, tunable false positives, about 10 bits per item for 1%, and no deletes.`, diff: `easy` },
      { q: `How would a web crawler avoid recrawling URLs at billions scale?`, a: `Keep a Bloom filter of seen URLs (normalized) in memory: 10 billion URLs at 1% false positives is roughly 12 GB, which fits across a few machines or a sharded Redis Bloom. Before fetching, check the filter; a "definitely not" means crawl and add. A false positive just skips one new page, which is acceptable. An exact store of seen URLs can still sit behind it for auditing.`, diff: `medium` },
      { q: `How do LSM-tree databases use Bloom filters?`, a: `Each immutable SSTable carries a Bloom filter of its keys. A point read checks the filters first and only reads the files that answer "maybe", usually one. Without them a read might touch every SSTable level. It's why LSM databases get acceptable read latency despite many files.`, diff: `medium` },
      { q: `Your Bloom filter's false positive rate has climbed to 30%. Why, and what do you do?`, a: `It's saturated: far more items were inserted than it was sized for, so most bits are 1. Bloom filters can't grow in place. Rebuild a larger one from the source of truth, switch to a scalable Bloom filter that adds layers as it fills, or partition by time (one filter per day) so old ones can be dropped.`, diff: `medium` },
      { q: `When is a Bloom filter the wrong choice?`, a: `When the set is small enough for a hash set (millions of items is usually fine in memory or Redis), when you need to delete items, when you need to list or count members, or when a false positive would cause harm and there's no exact store to confirm against. Using one for a few million IDs signals over-engineering.`, diff: `easy` }
    ],
    labs: [`bloomFilter`]
  },
  // ------------------------------------------------------------------
  {
    id: `ch4`, part: 2, number: 4,
    title: `Count-Min Sketch and HyperLogLog: counting at scale`,
    overview: `Two more questions get expensive at scale. "How often has this item appeared?" over a stream of billions of events: a <strong>Count-Min Sketch</strong> answers in fixed memory and never underestimates, which makes it a natural fit for heavy hitters and Top-K. "How many distinct items have we seen?": <strong>HyperLogLog</strong> estimates it from the longest run of leading zeros in hashed values, about 0.8% error in 12 KB no matter whether the answer is a thousand or a billion. Both merge cleanly across machines and time windows.`,
    concepts: [
      { term: `Frequency estimation`, def: `Count occurrences per item in an unbounded stream: views per video, searches per query, requests per IP.`, why: `An exact hash map grows with the number of distinct items; at billions of keys that's too much memory per window.`, demo: `countMin` },
      { term: `Count-Min Sketch`, def: `A table of d rows by w counters, each row with its own hash function. Adding an item increments one counter per row; the estimate is the minimum of its d counters.`, why: `Fixed memory (d x w counters) independent of how many distinct items appear, with O(d) updates.`, demo: `countMin` },
      { term: `Never underestimates`, def: `Collisions only add other items' counts to a counter, so every counter is at least the true count, and so is the minimum.`, why: `One-sided error: a heavy hitter can't hide. Rare items are the ones that look inflated.`, demo: `countMin` },
      { term: `Error bounds`, def: `With w = e/&epsilon; and d = ln(1/&delta;), the estimate exceeds the true count by at most &epsilon;N (N = total events) with probability 1 - &delta;. Width controls error size; depth controls confidence.`, why: `Errors are relative to total volume, so estimates are accurate for frequent items and noisy for rare ones.`, demo: `countMin` },
      { term: `Heavy hitters and Top-K`, def: `Pair a Count-Min Sketch with a small min-heap of the current top K: after each update, compare the item's estimate with the heap's minimum.`, why: `The standard approximate answer to "top 100 videos in the last hour" at very high event rates.`, demo: `countMin` },
      { term: `Mergeable sketches`, def: `Two Count-Min Sketches with the same dimensions and hashes merge by adding counters; HyperLogLogs merge by taking the maximum per register.`, why: `Count per shard or per minute, then combine for any window or the whole cluster without rescanning raw events.` },
      { term: `Cardinality estimation`, def: `Count distinct items: unique visitors per day, distinct search queries, unique devices seen by an ad campaign.`, why: `An exact set stores every distinct item; across many windows and dimensions that's prohibitive.`, demo: `hyperLogLog` },
      { term: `HyperLogLog`, def: `Hash each item; use the first p bits to pick one of m = 2<sup>p</sup> registers and keep the longest run of leading zeros seen in the remaining bits. Combine the registers with a harmonic mean into an estimate.`, why: `Seeing a hash starting with 20 zeros is roughly a one-in-a-million event, so it suggests about a million distinct items. Many registers average out the luck.`, demo: `hyperLogLog` },
      { term: `HyperLogLog accuracy`, def: `Standard error is about 1.04 / &radic;m. Redis uses 16,384 registers in 12 KB for about 0.81% error.`, why: `Four times the registers halves the error; memory doesn't depend on the count.`, demo: `hyperLogLog` },
      { term: `Unions yes, intersections no`, def: `Merging HLLs gives the distinct count of the union. Intersections estimated by inclusion-exclusion inherit the union's absolute error, which can swamp a small overlap.`, why: `"Unique users across all pages" is easy; "users who visited both A and B" needs another approach.` },
      { term: `Redis support`, def: `<code>PFADD</code>, <code>PFCOUNT</code> and <code>PFMERGE</code> implement HyperLogLog; Redis Stack adds <code>CMS.INCRBY</code>, <code>CMS.QUERY</code> and a <code>TOPK</code> structure.`, why: `Production-ready implementations you can name.` },
      { term: `When exact matters`, def: `Billing, payouts, quotas and anything audited need exact counts, usually computed in batch from raw events.`, why: `A common pattern: approximate counts for real-time dashboards, exact counts from a nightly batch job.` }
    ],
    cheatsheet: [
      { title: `Which structure answers which question`, type: `table`, headers: [`Question`, `Exact`, `Approximate`, `Memory`, `Error`], rows: [
        [`Is X in the set?`, `Hash set`, `Bloom filter`, `~10 bits/item`, `False positives`],
        [`How many times has X appeared?`, `Hash map of counters`, `Count-Min Sketch`, `d x w counters`, `Overestimates by &le; &epsilon;N`],
        [`How many distinct items?`, `Hash set`, `HyperLogLog`, `12 KB`, `~0.81% std error`],
        [`What are the top K?`, `Count everything, sort`, `CMS + min-heap`, `Sketch + K entries`, `Inherits CMS error`]
      ] },
      { title: `HyperLogLog registers vs error`, type: `table`, headers: [`Registers m`, `Memory (6-bit registers)`, `Standard error`], rows: [
        [`256`, `192 B`, `6.5%`],
        [`1,024`, `768 B`, `3.25%`],
        [`4,096`, `3 KB`, `1.6%`],
        [`16,384 (Redis)`, `12 KB`, `0.81%`]
      ] },
      { title: `Redis commands`, type: `code`, body: `# Unique visitors per day, merged into a weekly count
PFADD visitors:2026-10-13 user:42 user:77 user:42
PFCOUNT visitors:2026-10-13               # ~2
PFMERGE visitors:week41 visitors:2026-10-07 visitors:2026-10-08 ...
PFCOUNT visitors:week41

# Count-Min Sketch and Top-K (Redis Stack)
CMS.INITBYPROB views 0.001 0.01          # error 0.1% of N, 99% confidence
CMS.INCRBY views video:9 1
CMS.QUERY  views video:9
TOPK.RESERVE trending 100
TOPK.ADD trending video:9
TOPK.LIST trending` }
    ],
    interview: [
      { q: `How does a Count-Min Sketch work, and why does it overestimate?`, a: `It's d rows of w counters, each row with its own hash. To count an item, increment its counter in every row; to query, take the minimum of those d counters. Other items that hash to the same counter add to it, so counters can only be too high; taking the minimum across rows picks the least polluted one. Error is bounded by a fraction of total volume, so heavy items are accurate and rare ones look inflated.`, diff: `medium` },
      { q: `Design a real-time Top-K trending videos service for the last hour.`, a: `Stream view events through Kafka, partitioned by video ID. Each worker keeps a Count-Min Sketch plus a min-heap of its top K per minute bucket. Every few seconds workers publish their top candidates; an aggregator merges per-minute sketches for the trailing 60 minutes (sketches add) and recomputes the global top K. Serve the result from a cache. If exact counts are needed for payouts, compute them separately in batch.`, diff: `hard` },
      { q: `How does HyperLogLog estimate distinct counts?`, a: `It hashes each item to a uniform bit string. Long runs of leading zeros are rare: a run of k zeros happens with probability 2^-k, so the longest run seen hints at how many distinct values were hashed. To reduce variance it splits items across m registers by the first few hash bits, keeps the max run per register, and combines them with a harmonic mean plus corrections. Duplicates don't change anything because the same item always hashes the same way.`, diff: `medium` },
      { q: `How would you count unique daily visitors across 100 pages and any date range?`, a: `Keep one HyperLogLog per page per day (12 KB each in Redis). Unique visitors for a page and a date range is PFMERGE over those days; across all pages, merge the pages too. Memory is tiny and fixed, and results are within about 1%. Exact counts, if needed for reporting, come from a batch job over raw logs.`, diff: `medium` },
      { q: `When would you not use these sketches?`, a: `When the counts drive money or quotas (billing, payouts, rate limits that must be exact), when the number of distinct items is small enough for a hash map, or when you need intersections or per-item lists. Approximate counts are for monitoring, trending and analytics where a small error is invisible.`, diff: `easy` }
    ],
    labs: [`countMin`, `hyperLogLog`]
  },
  // ------------------------------------------------------------------
  {
    id: `ch5`, part: 2, number: 5,
    title: `Morris counter: approximate counting in log log n bits`,
    overview: `Counting events is the easiest job in computing until the counter has to be tiny. Robert Morris at Bell Labs had to count far more events than an 8-bit register can hold (it stops at 255). His answer was to store roughly the <strong>logarithm</strong> of the count and to increment it <strong>probabilistically</strong>, with a probability that halves every time the register goes up. The estimate 2<sup>v</sup> &minus; 1 is right on average, the relative error stays about the same whether you've seen ten events or ten billion, and counting to n takes only <strong>O(log log n)</strong> bits. Unlike HyperLogLog, which counts distinct items, a Morris counter counts every event, repeats included. This chapter follows Arpit Bhayani's essay <a href="https://arpitbhayani.me/blogs/morris-counter/" target="_blank" rel="noopener" style="color:var(--accent)">Space-Efficient Counting: Exploring Morris' Algorithm</a>; read the original for the full derivation and plots.`,
    concepts: [
      { term: `The small-register problem`, def: `An exact counter needs log<sub>2</sub> n bits to count to n: 8 bits stop at 255, 32 bits at about 4.3 billion. With millions of counters (one per key, per flow, per n-gram) or a counter that lives in a tiny hardware register, those bits add up.`, why: `Approximate counting trades a bounded relative error for exponentially less memory per counter.`, ex: `Morris needed to count events in 8-bit registers, where 255 was nowhere near enough.` },
      { term: `Coin-flip (sampling) counter`, def: `On each event, increment with a fixed probability p (p = 1/2 is a coin flip) and estimate n as v / p. The register value follows a binomial distribution with parameters n and p.`, why: `The simplest approximate counter. With p = 1/2 an 8-bit register counts to about 510 instead of 255.`, ex: `The register reads 200 with p = 1/2, so the estimate is 400. The register's standard deviation is &radic;(np(1 &minus; p)) = 10, so 95% of the time it lands between 180 and 220: a true count of roughly 360 to 440.`, demo: `coinFlipCounter` },
      { term: `Why a fixed probability isn't enough`, def: `A coin-flip counter's relative error is &radic;((1 &minus; p) / (np)): huge for small counts, tiny for large ones, and its range only grows linearly with 1/p. Counting to a billion in 8 bits would need p &asymp; 1/4,000,000, and then every count below a few million is noise.`, why: `You want a relative error that doesn't depend on n. That needs an increment probability that shrinks as the count grows.`, demo: `coinFlipCounter` },
      { term: `Store the logarithm`, def: `Morris keeps v &asymp; log<sub>2</sub>(1 + n) instead of n. The logarithm moves quickly for small n and slowly for large n, so small counts are resolved finely and large counts coarsely: the same relative resolution everywhere.`, why: `A register that holds the exponent of the count needs only about log<sub>2</sub> log<sub>2</sub> n bits.`, demo: `morrisCounter` },
      { term: `Probabilistic increment`, def: `The counter only knows v, not n. On each event, draw a uniform random r in [0, 1) and increment v if r &lt; 2<sup>&minus;v</sup>: always at v = 0, half the time at v = 1, a quarter of the time at v = 2, and so on.`, why: `In general the probability is 1 / (n(v + 1) &minus; n(v)): the reciprocal of how many events one step of the register stands for. Bigger steps get rarer increments, which keeps the estimate on track.`, demo: `morrisCounter` },
      { term: `An unbiased estimate`, def: `Estimate n&#770; = 2<sup>v</sup> &minus; 1. Each event raises the expected value of 2<sup>v</sup> by exactly 1 (it goes from 2<sup>v</sup> to 2<sup>v+1</sup> with probability 2<sup>&minus;v</sup>), so after n events E[n&#770;] = n.`, why: `The estimate is right on average; the only question is how far a single run strays from it.`, demo: `morrisCounter` },
      { term: `Constant relative error`, def: `For the base-2 counter, Var(n&#770;) = n(n &minus; 1) / 2, so the standard deviation is about 0.71n. The absolute error grows with n, but it stays the same fraction of n.`, why: `That's the property Morris wanted. But 71% is too loose for most uses, so the counter gets tuned.`, demo: `morrisCounter` },
      { term: `Tuning the base with a`, def: `Morris generalized the counter to v = log(1 + n/a) / log(1 + 1/a): increment with probability (1 + 1/a)<sup>&minus;v</sup> and estimate n&#770; = a((1 + 1/a)<sup>v</sup> &minus; 1). a = 1 is the base-2 counter; a larger a means a base closer to 1.`, why: `The relative standard error is about 1/&radic;(2a), but the register climbs faster and needs more values. With a = 30 an 8-bit register reaches about 128,000 at roughly 13% error.`, demo: `morrisCounter` },
      { term: `Averaging independent counters`, def: `Run k independent counters on the same events and average their estimates: the variance drops by a factor of k. Taking the median of several such averages gives high-probability error bounds.`, why: `A second accuracy knob. Compare "smaller base" against "more counters" by measuring memory against error.`, demo: `morrisCounter` },
      { term: `O(log log n) space`, def: `To count to n the register only needs to reach about log<sub>2</sub> n, and a number up to log<sub>2</sub> n takes log<sub>2</sub> log<sub>2</sub> n bits. Counting to 4 billion (2<sup>32</sup>) needs v &le; 32, which fits in 6 bits instead of 32.`, why: `Doubly logarithmic: going from a billion to a quintillion adds about one bit.` },
      { term: `Few writes`, def: `A Morris counter changes state only about log n times over n events; every other event is a random draw that changes nothing.`, why: `Useful where writes are expensive: counters in flash or non-volatile memory, or shared counters where each update costs a cache-line transfer or a network round trip.`, demo: `morrisCounter` },
      { term: `Morris counter vs HyperLogLog`, def: `A Morris counter estimates the total number of events, repeats included. HyperLogLog estimates the number of distinct items and ignores repeats. Both keep an exponent-sized value instead of the count: the log of the count in Morris, the longest run of leading zeros in each HLL register.`, why: `Name the right tool: "how many page views" is a Morris-style question, "how many unique visitors" is a HyperLogLog question.` },
      { term: `Where it's used`, def: `Redis's LFU eviction keeps an 8-bit, Morris-style logarithmic access counter per key with a probabilistic increment; with the default <code>lfu-log-factor</code> of 10 it reaches 255 at about a million hits. Approximate counters also appear in streaming algorithms, per-flow network statistics and very large n-gram count tables for language models.`, why: `The pattern: millions of counters, orders of magnitude matter more than exact values, and 4 or 8 bytes per counter is too much.` },
      { term: `When not to use one`, def: `Billing, quotas, rate limits that must be exact, inventory and anything audited need exact counts. So does any design with only a few counters, where a 64-bit integer costs nothing.`, why: `The saving only matters across enormous numbers of counters. A single counter in a database row should just be an integer.` }
    ],
    cheatsheet: [
      { title: `Approximate counters compared`, type: `table`, headers: [`Counter`, `Increment rule`, `Estimate`, `Relative std error`, `Max with 8 bits`], rows: [
        [`Exact`, `Always`, `v`, `0`, `255`],
        [`Coin flip, probability p`, `With probability p`, `v / p`, `&radic;((1 &minus; p) / (np)): large for small n`, `255 / p (510 for p = 1/2)`],
        [`Morris, base 2 (a = 1)`, `With probability 2<sup>&minus;v</sup>`, `2<sup>v</sup> &minus; 1`, `&asymp; 71%`, `2<sup>255</sup>, far beyond any need`],
        [`Morris, parameter a`, `With probability (1 + 1/a)<sup>&minus;v</sup>`, `a((1 + 1/a)<sup>v</sup> &minus; 1)`, `&asymp; 1/&radic;(2a)`, `a((1 + 1/a)<sup>255</sup> &minus; 1)`],
        [`k averaged Morris counters`, `Each independently`, `Mean of the k estimates`, `&asymp; 1/&radic;(2ak)`, `Same per counter, k times the memory`]
      ], note: `Morris error is a fixed fraction of n. Coin-flip error is roughly a fixed number of events (about &radic;(n(1 &minus; p)/p)), so its relative error falls as n grows, until the register overflows.` },
      { title: `Choosing a for an 8-bit register`, type: `table`, headers: [`a`, `Relative std error 1/&radic;(2a)`, `Largest count (v = 255)`], rows: [
        [`1`, `70.7%`, `5.8 &times; 10<sup>76</sup>`],
        [`2`, `50%`, `1.6 &times; 10<sup>45</sup>`],
        [`8`, `25%`, `8.9 &times; 10<sup>13</sup>`],
        [`30`, `12.9%`, `~128,000`],
        [`50`, `10%`, `~7,700`],
        [`128`, `6.3%`, `~800`]
      ], note: `Pick the largest a whose range still covers the biggest count you expect, or add bits: 10 bits with a = 30 reach past a billion.` },
      { title: `A Morris counter in a few lines`, type: `code`, body: `import random

class MorrisCounter:
    def __init__(self, a=1.0):
        self.a = a      # larger a: smaller error, but the register climbs faster
        self.v = 0      # the only state, roughly log(n)

    def increment(self):
        b = 1 + 1 / self.a
        if random.random() < b ** -self.v:
            self.v += 1

    def estimate(self):
        b = 1 + 1 / self.a
        return self.a * (b ** self.v - 1)

# Average k counters to cut the variance by k
counters = [MorrisCounter(a=30) for _ in range(8)]
for _ in range(100_000):
    for c in counters:
        c.increment()
print(sum(c.estimate() for c in counters) / len(counters))   # ~100,000` },
      { title: `References`, type: `list`, items: [
        `Arpit Bhayani, <a href="https://arpitbhayani.me/blogs/morris-counter/" target="_blank" rel="noopener">Space-Efficient Counting: Exploring Morris' Algorithm</a>, the essay this chapter is based on.`,
        `Arpit Bhayani's <a href="https://github.com/arpitbbhayani/morris-counter" target="_blank" rel="noopener">Python implementation of Morris' algorithm</a>.`,
        `Robert Morris, <em>Counting large numbers of events in small registers</em>, Communications of the ACM, 1978.`,
        `Philippe Flajolet, <em>Approximate counting: a detailed analysis</em>, BIT, 1985.`
      ] }
    ],
    interview: [
      { q: `What is a Morris counter, and what problem does it solve?`, a: `It's a probabilistic counter that stores roughly the logarithm of the count instead of the count. On each event it increments its register v with probability 2^-v and estimates the count as 2^v - 1. It solves counting very large numbers of events in very little memory: O(log log n) bits, so 6 bits can count into the billions, at the cost of a relative error that stays roughly constant as n grows.`, diff: `easy` },
      { q: `Walk through the increment rule and show why the estimate is unbiased.`, a: `The register only knows v. On an event, increment with probability 2^-v. Look at X = 2^v: with probability 2^-v it doubles from 2^v to 2^(v+1), otherwise it stays, so its expected increase is 2^-v &middot; 2^v = 1. Starting from X = 1 at n = 0, after n events E[X] = n + 1, so E[2^v - 1] = n. The general form increments with probability 1 / (n(v + 1) - n(v)), the reciprocal of the gap the next step represents.`, diff: `medium` },
      { q: `Why not just increment with probability 1/1000 and multiply by 1000?`, a: `That's a coin-flip (sampling) counter. Its range only grows linearly with 1/p, and its relative error is sqrt((1 - p) / (np)): with p = 1/1000, a true count of 1,000 is usually estimated as 0, 1,000 or 2,000, which is useless for small counts. Morris makes the probability shrink as the count grows, which keeps the relative error constant across every scale while the range grows exponentially.`, diff: `medium` },
      { q: `A base-2 Morris counter has about 71% standard error. How do you make it more accurate?`, a: `Two knobs. Use a base closer to 1: increment with probability (1 + 1/a)^-v and estimate a((1 + 1/a)^v - 1); the relative error is about 1/sqrt(2a), but the register climbs faster, so it needs more bits for the same range (a = 30 in 8 bits reaches about 128,000). Or run k independent counters and average, which divides the variance by k; take a median of several averages for high-probability bounds. Choose by comparing memory against error for your largest expected count.`, diff: `medium` },
      { q: `You need access-frequency counters for 500 million cache keys to drive LFU eviction. How would you store them?`, a: `Exact 32-bit counters cost about 2 GB on their own; eviction only needs the rough order of popularity, so use an 8-bit logarithmic (Morris-style) counter per key, about 500 MB, which is what Redis does for its LFU policy. Increment probabilistically so the byte can represent around a million hits. Frequency also has to age, or keys that were hot last week never leave: store a coarse last-access time next to the counter and decay the counter by elapsed time when the key is touched. Evict by sampling a few keys and dropping the one with the lowest counter.`, diff: `hard` },
      { q: `Morris counter, HyperLogLog or Count-Min Sketch: which answers which question?`, a: `Morris counts total events in one counter (page views, packets on a link) in log log n bits. HyperLogLog counts distinct items (unique visitors) and ignores repeats. Count-Min Sketch estimates the count for each of many items (views per video) in a shared table and never underestimates. They combine: a Count-Min Sketch can use small Morris-style counters in its cells to save even more memory.`, diff: `medium` }
    ],
    labs: [`coinFlipCounter`, `morrisCounter`]
  },
  // ------------------------------------------------------------------
  {
    id: `ch6`, part: 3, number: 6,
    title: `Embeddings and similarity search`,
    overview: `An <strong>embedding</strong> is a list of numbers produced by a model so that similar things get nearby vectors: two sentences with the same meaning, two products often bought together. Similarity search means finding the stored vectors closest to a query vector under a metric such as <strong>cosine similarity</strong>, <strong>dot product</strong> or <strong>Euclidean distance</strong>. Exact k-nearest-neighbour search compares the query with every vector, which is fine for thousands and slow for billions; that's why vector databases use approximate indexes (next chapter). Traditional indexes can't help, because "similar" isn't a range or an exact match.`,
    concepts: [
      { term: `Embedding`, def: `A fixed-length vector of floats (typically 128 to 3,072 dimensions) that a model produces from text, an image, a user or a product. Individual dimensions aren't human-interpretable; geometric closeness is what carries meaning.`, why: `It turns fuzzy questions ("documents about refunds", "shoes like these") into geometry.` },
      { term: `Similarity depends on the model`, def: `Pretrained models (OpenAI embeddings, Sentence Transformers, CLIP) capture general semantic similarity. Custom models, such as two-tower recommenders, learn task-specific similarity like "bought together".`, why: `Diapers and baby bottles aren't semantically alike, but a purchase model puts them close. Pick the model for the notion of similarity you need.` },
      { term: `Cosine similarity`, def: `The cosine of the angle between two vectors: dot(a, b) / (|a| |b|). It ignores length and measures direction only.`, why: `The default for text embeddings, where vector length carries little meaning.`, demo: `knnMetrics` },
      { term: `Dot product`, def: `Sum of element-wise products. Equivalent to cosine for unit-length vectors; otherwise longer vectors score higher.`, why: `Used by recommendation models that deliberately encode popularity or confidence in vector length, and cheaper to compute.`, demo: `knnMetrics` },
      { term: `Euclidean (L2) distance`, def: `Straight-line distance between the vector tips. For unit-length vectors, ranking by L2 gives the same order as cosine.`, why: `Common for image and other embeddings trained with L2 objectives. Use the metric the model was trained with.`, demo: `knnMetrics` },
      { term: `Normalization`, def: `Scale every vector to length 1. Then cosine, dot product and L2 produce the same ranking, and dot product is the fastest to compute.`, why: `Many systems normalize at write time and use inner product internally.`, demo: `knnMetrics` },
      { term: `Exact k-nearest neighbours`, def: `Compare the query with every stored vector and keep the k best: O(N &middot; d) work per query.`, why: `Perfect recall and fine for up to roughly a million vectors with SIMD or a GPU; too slow and costly at hundreds of millions per query.`, demo: `knnMetrics` },
      { term: `The curse of dimensionality`, def: `In hundreds of dimensions, tree indexes such as k-d trees must explore almost every branch, and distances between random points become similar.`, why: `Why spatial trees that work for latitude and longitude don't work for embeddings, and approximate methods took over.` },
      { term: `Approximate nearest neighbour (ANN)`, def: `Find most of the true nearest neighbours while examining a small fraction of the data.`, why: `Trading a few percent of recall for 100x less work is the central bargain of every vector database.` },
      { term: `Recall@k`, def: `The fraction of the true k nearest neighbours that the approximate search returned.`, why: `The quality metric you tune against latency and memory; 95-99% is typical.` },
      { term: `The embedding pipeline`, def: `Split documents into chunks, embed each chunk with the model, store vector plus metadata (document ID, tenant, timestamps). At query time embed the query with the same model and search.`, why: `In RAG and semantic search designs, chunking and metadata matter as much as the index.` },
      { term: `Model versions`, def: `Vectors from different models (or versions) live in different spaces and can't be compared. Changing the model means re-embedding the whole corpus, usually into a new index, then switching over.`, why: `Plan for backfills: they cost GPU time and need dual indexes during migration.` },
      { term: `Applications`, def: `Semantic search, retrieval for LLM answers (RAG), recommendations, near-duplicate and plagiarism detection, image and audio search, anomaly detection.`, why: `In interviews the "how and where" matters more than index internals.` }
    ],
    cheatsheet: [
      { title: `Similarity metrics`, type: `table`, headers: [`Metric`, `Formula`, `Sensitive to length?`, `Typical use`], rows: [
        [`Cosine`, `a&middot;b / (|a||b|)`, `No`, `Text embeddings (default)`],
        [`Dot product`, `&Sigma; a<sub>i</sub>b<sub>i</sub>`, `Yes`, `Recommenders; normalized vectors`],
        [`Euclidean (L2)`, `&radic;&Sigma;(a<sub>i</sub>-b<sub>i</sub>)<sup>2</sup>`, `Yes`, `Image embeddings, clustering`]
      ], note: `Normalize vectors and all three rank identically.` },
      { title: `Embedding sizes`, type: `table`, headers: [`Dimensions`, `float32 per vector`, `10M vectors`, `1B vectors`], rows: [
        [`384`, `1.5 KB`, `15 GB`, `1.5 TB`],
        [`768`, `3 KB`, `31 GB`, `3.1 TB`],
        [`1,536`, `6 KB`, `61 GB`, `6.1 TB`],
        [`3,072`, `12 KB`, `123 GB`, `12.3 TB`]
      ] },
      { title: `Exact search with NumPy`, type: `code`, body: `import numpy as np

docs  = np.load("embeddings.npy")                    # (N, d) float32
docs /= np.linalg.norm(docs, axis=1, keepdims=True)  # normalize once

def top_k(query, k=10):
    q = query / np.linalg.norm(query)
    scores = docs @ q                                # cosine = dot on unit vectors
    idx = np.argpartition(-scores, k)[:k]
    return idx[np.argsort(-scores[idx])]` }
    ],
    interview: [
      { q: `What's an embedding and why can't a B-tree search them?`, a: `An embedding is a model-produced vector where semantic similarity becomes geometric closeness. Similarity search asks for the nearest vectors in hundreds of dimensions; a B-tree orders one key and supports exact and range lookups, which say nothing about distance in 768-dimensional space. You need either a full scan or an approximate nearest-neighbour index.`, diff: `easy` },
      { q: `Cosine, dot product or Euclidean?`, a: `Use whatever the embedding model was trained for. Cosine compares direction only and is the usual choice for text. Dot product also rewards longer vectors, which some recommenders use to encode popularity. L2 is common for image models. If you normalize vectors to unit length, all three give the same ranking, and dot product is cheapest.`, diff: `medium` },
      { q: `When is brute-force search good enough?`, a: `Up to around a million vectors per query path, especially with filters that shrink the candidate set first (one user's documents, one tenant). A million 768-dimension vectors is ~3 GB and a SIMD scan takes tens of milliseconds. Beyond that, or at high QPS, use an ANN index.`, diff: `medium` },
      { q: `Walk through a RAG retrieval design.`, a: `Ingestion: split documents into chunks of a few hundred tokens with overlap, embed each chunk, store vector plus metadata (doc ID, tenant, ACLs, updated_at) in a vector index, often pgvector or a vector database. Query: embed the question with the same model, run a filtered top-k search (tenant and permissions as filters), optionally combine with keyword search and rerank, then pass the top chunks to the LLM. Re-embed on document changes via a queue, and re-embed everything when the model changes.`, diff: `hard` },
      { q: `What happens when you upgrade the embedding model?`, a: `Old and new vectors aren't comparable, so you must re-embed every item with the new model. Build a new index in parallel (backfill job, plus dual-writing new items to both), compare quality, then switch queries over and drop the old index. Budget the GPU cost and time; it's a migration, not a config change.`, diff: `medium` }
    ],
    labs: [`knnMetrics`]
  },
  // ------------------------------------------------------------------
  {
    id: `ch7`, part: 3, number: 7,
    title: `ANN indexes and vector databases in practice`,
    overview: `Approximate nearest-neighbour indexes avoid scanning every vector. <strong>IVF</strong> clusters vectors and searches only the few clusters nearest the query. <strong>HNSW</strong> builds a layered proximity graph and greedily walks it toward the query: the most popular index today, fast with high recall but memory-hungry. <strong>Product quantization</strong> compresses vectors 10-60x so billions fit in memory. In practice the hard parts are memory sizing, <strong>metadata filters</strong>, freshness and choosing between <strong>pgvector</strong> in your existing database and a dedicated vector database.`,
    concepts: [
      { term: `IVF (inverted file index)`, def: `Run k-means to split vectors into nlist clusters. Each vector is stored in its nearest cluster's list. A query finds the nprobe nearest centroids and scans only those lists.`, why: `Simple, memory-light and good with compression. Its weakness: true neighbours just across a cluster boundary are missed unless you probe more lists.`, demo: `ivfRecall` },
      { term: `nprobe trade-off`, def: `Probing more clusters raises recall and cost roughly linearly. nlist is often around &radic;N; nprobe a few percent of nlist.`, why: `The dial you tune for a recall target such as 95%.`, demo: `ivfRecall` },
      { term: `HNSW`, def: `Hierarchical Navigable Small World: each vector is a node linked to about M near neighbours. Upper layers hold few nodes with long links; search starts at the top, greedily moves to closer neighbours, and descends, keeping a candidate list of size efSearch at the bottom layer.`, why: `Logarithmic-ish search with 95-99% recall at low latency. The default in pgvector, Qdrant, Weaviate, Elasticsearch and others.`, demo: `hnswSearch` },
      { term: `HNSW costs`, def: `The graph adds roughly 2 &middot; M &middot; 4 bytes or more per vector, lives best entirely in RAM, builds slowly (efConstruction), and handles deletes with tombstones and repairs.`, why: `Memory and build time, not query speed, are usually what limit HNSW.`, demo: `hnswSearch` },
      { term: `Product quantization (PQ)`, def: `Split each vector into m sub-vectors and replace each with the ID of its nearest centroid in a 256-entry codebook, so each sub-vector costs 1 byte. A 1,536-dimension float32 vector (6 KB) becomes 96 bytes.`, why: `Makes billion-scale search fit in memory, at some recall cost; often re-rank the top candidates with full vectors.`, demo: `vectorMemory` },
      { term: `LSH`, def: `Locality-sensitive hashing: hash functions designed so similar vectors collide in the same bucket with high probability; query the matching buckets.`, why: `Historically important and simple to shard, but graph and cluster indexes give better recall per byte today.` },
      { term: `Memory sizing`, def: `Raw size = N x dimensions x bytes per value; add the index overhead (HNSW links) and headroom. Compare with RAM per node to get node count.`, why: `The first number to estimate in a vector search design; it decides between one Postgres box, a sharded cluster or quantization.`, demo: `vectorMemory` },
      { term: `Metadata filtering`, def: `Restricting results by tenant, permissions, date or category. Post-filtering the ANN results can return fewer than k matches; pre-filtering by metadata first may fall back to brute force on a large subset. Good engines filter during graph traversal.`, why: `Almost every real query has a filter, and it's where naive designs return empty or wrong results.` },
      { term: `Hybrid search`, def: `Combine keyword relevance (BM25) with vector similarity and merge the rankings, for example with reciprocal rank fusion, then optionally rerank with a cross-encoder.`, why: `Vectors miss exact terms such as product codes and names; keywords miss paraphrases. Together they beat either alone.` },
      { term: `pgvector vs a dedicated vector database`, def: `pgvector adds a vector type plus HNSW and IVFFlat indexes to Postgres. Dedicated systems (Pinecone, Milvus, Qdrant, Weaviate) and search engines (Elasticsearch, OpenSearch) add sharding, quantization, hybrid search and managed scaling.`, why: `Start with pgvector when vectors sit next to relational data and number in the millions to low tens of millions; move to a dedicated system when scale, QPS or features demand it.` },
      { term: `Sharding a vector index`, def: `Split vectors across shards (by tenant, or randomly); a query fans out, each shard returns its top k, and a coordinator merges.`, why: `Scatter-gather with tail latency like any fan-out. Sharding by tenant keeps most queries on one shard.` },
      { term: `Freshness and updates`, def: `HNSW supports incremental inserts; deletes are tombstoned until compaction or rebuild. Some systems buffer new vectors in a small brute-force segment that is searched alongside the main index.`, why: `If users expect a just-uploaded document to be searchable, design the write path for it.` }
    ],
    cheatsheet: [
      { title: `ANN index families`, type: `table`, headers: [`Index`, `Idea`, `Recall / speed`, `Memory`, `Notes`], rows: [
        [`Flat (brute force)`, `Compare with everything`, `100% / slow`, `Raw vectors`, `Fine up to ~1M or after filters`],
        [`IVF`, `Cluster; probe nearest lists`, `Tunable via nprobe`, `Low overhead`, `Pairs well with PQ (IVF-PQ)`],
        [`HNSW`, `Layered neighbour graph`, `High / very fast`, `Raw + graph links`, `Default choice; RAM-hungry`],
        [`PQ`, `Compress sub-vectors to codes`, `Lower; re-rank helps`, `10-60x smaller`, `Billion scale`],
        [`LSH`, `Similar items collide`, `Moderate`, `Many tables`, `Mostly historical`]
      ] },
      { title: `Choosing where vectors live`, type: `list`, items: [
        `Millions of vectors, already on Postgres, need joins and transactions: <strong>pgvector</strong> with HNSW.`,
        `Need keyword plus vector search over documents: <strong>Elasticsearch / OpenSearch</strong> kNN, or a vector DB with hybrid search.`,
        `Hundreds of millions to billions, high QPS, quantization, multi-tenant isolation: a <strong>dedicated vector database</strong> (managed Pinecone, or Milvus, Qdrant, Weaviate).`,
        `Always estimate memory first: N x d x 4 bytes plus index overhead.`
      ] },
      { title: `pgvector`, type: `code`, body: `CREATE EXTENSION vector;
CREATE TABLE chunks (
  id        bigserial PRIMARY KEY,
  tenant_id bigint NOT NULL,
  body      text,
  embedding vector(1536)
);
CREATE INDEX ON chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

SET hnsw.ef_search = 100;                        -- higher = better recall, slower
SELECT id, body
FROM chunks
WHERE tenant_id = $2
ORDER BY embedding <=> $1                        -- cosine distance
LIMIT 10;` }
    ],
    interview: [
      { q: `Explain HNSW in a minute.`, a: `Every vector is a node connected to its closest neighbours, forming a navigable graph. A few nodes are promoted to sparse upper layers with long-range links, like express lanes in a skip list. A search starts at the top layer, greedily hops to whichever neighbour is closer to the query, drops a layer when it can't improve, and at the bottom keeps a candidate list of size efSearch to find the k nearest. It touches a tiny fraction of nodes with high recall; the costs are memory for the links and slow builds.`, diff: `medium` },
      { q: `IVF vs HNSW?`, a: `IVF partitions vectors into clusters and scans only the nearest few: low memory overhead, combines well with product quantization for huge datasets, but recall depends on probing enough clusters. HNSW navigates a graph: better recall at a given latency and easy incremental inserts, but several times more memory and slower builds. HNSW for most in-memory workloads; IVF-PQ when memory is the constraint at billions of vectors.`, diff: `medium` },
      { q: `How much memory do 100M 768-dimensional embeddings need?`, a: `Raw float32: 100M x 768 x 4 bytes = ~307 GB. HNSW links with M = 16 add roughly 100M x 128 bytes = ~13 GB, plus metadata and headroom, so ~350-400 GB: several nodes, or one very large one. Product quantization to 96 bytes per vector brings the vectors to ~10 GB, at some recall cost, usually with re-ranking from full vectors on disk.`, diff: `hard` },
      { q: `Users must only retrieve documents they're allowed to see. How do you filter?`, a: `Store tenant and ACL fields as metadata and filter inside the search, not after it. Post-filtering ANN results can drop most of the top k and return too few; filtered HNSW traversal or per-tenant partitions avoid that. If tenants are large and isolated, shard or partition the index by tenant so every query stays within one partition; for very selective filters, brute-force over the filtered subset may be faster than the ANN index.`, diff: `hard` },
      { q: `When is pgvector enough?`, a: `When vectors number in the millions to low tens of millions, sit alongside relational data you join or filter with, and QPS is moderate. You keep one database, transactions and backups. Move to a dedicated system when memory outgrows a node, you need sharding, quantization, high QPS or built-in hybrid search, or the vector workload starts hurting your OLTP database.`, diff: `medium` }
    ],
    labs: [`ivfRecall`, `hnswSearch`, `vectorMemory`]
  },
  // ------------------------------------------------------------------
  {
    id: `ch8`, part: 4, number: 8,
    title: `Time series databases: the write path`,
    overview: `Metrics, sensor readings and events arrive as timestamped values, mostly appended, mostly queried by recent time range. A monitoring system with 100,000 servers emitting 5 metrics every 10 seconds writes 50,000 points per second, 4.3 billion a day. Row-per-point in Postgres burns 50-100 bytes per point and buckles under index maintenance. Time series databases combine <strong>append-only writes</strong>, <strong>LSM trees</strong>, <strong>delta-of-delta</strong> and <strong>XOR compression</strong> (down to 1-2 bytes per point) and <strong>time partitioning</strong> that makes retention a file delete. But having time series data doesn't mean you need one: stretch Postgres or DynamoDB first.`,
    concepts: [
      { term: `Time series workload`, def: `Writes are high volume, append-only and in time order; reads ask for recent ranges of a few series, usually aggregated; old data is rarely touched and eventually deleted.`, why: `Every TSDB technique exploits one of these assumptions. When they don't hold, a TSDB loses its edge.` },
      { term: `Why not one row per point`, def: `Each row repeats the host and metric names and carries a tuple header, so a 16-byte point (timestamp + float) costs 50-100 bytes, and every insert updates indexes with random I/O.`, why: `At billions of rows per day, storage and write throughput both break before queries do.`, demo: `tsCompression` },
      { term: `Don't reach for a TSDB too early`, def: `Time series data alone isn't a reason. Workloads that sort or aggregate across huge numbers of series (Top-K) or need joins and updates can be worse in a TSDB.`, why: `Interviewers reward stretching a general-purpose database until a real bottleneck appears, then naming the specialized tool.` },
      { term: `Append-only storage`, def: `Never update in place; always write to the end of a file. Sequential writes avoid seek-read-modify-write cycles.`, why: `Disks and SSDs are far faster sequentially than randomly, often by 10-100x on throughput.` },
      { term: `LSM trees`, def: `Writes go to a WAL and a sorted in-memory memtable, which is flushed as an immutable sorted file (SSTable); background compaction merges files and drops deleted data.`, why: `High sustained write throughput. Costs: reads may check several files, and compaction rewrites data (write amplification).` },
      { term: `Delta encoding and varints`, def: `Store the first value, then differences between consecutive values. Small differences fit in one or two bytes with variable-length integers instead of eight.`, why: `Adjacent points are similar, so differences are small numbers.`, demo: `tsCompression` },
      { term: `Delta-of-delta timestamps`, def: `Timestamps at regular intervals have constant deltas, so their deltas-of-deltas are zero. Gorilla encodes a zero in a single bit.`, why: `Regular timestamps compress to about 1 bit each; jitter costs more bits.`, demo: `tsCompression` },
      { term: `XOR float compression`, def: `XOR each value with the previous one. Identical values give 0 (1 bit); similar values share sign, exponent and leading mantissa bits, so only the short block of meaningful bits is stored.`, why: `Facebook's Gorilla reported about 1.37 bytes per point on real metrics versus 16 raw. Noisy values compress less.`, demo: `tsCompression` },
      { term: `Time-based partitioning`, def: `Group data into partitions (chunks) per time window, such as one per day. Writes go to the current partition; queries touch only partitions overlapping their range.`, why: `Localized writes, pruned reads, and the foundation for retention. TimescaleDB calls them chunks; Prometheus uses 2-hour blocks.`, demo: `timePartition` },
      { term: `Retention by dropping partitions`, def: `To keep 7 days, delete partitions older than 7 days: a metadata operation and a file delete, instead of a DELETE that scans billions of rows and leaves dead tuples.`, why: `Retention is nearly free, which changes what's affordable.`, demo: `timePartition` },
      { term: `Data model`, def: `A point has a measurement (cpu_usage), tags (host=web-1, region=us-west), fields (value=45.2) and a timestamp. A series is a measurement plus one specific set of tag values.`, why: `Tags are indexed and define series; fields are the measured values. Getting this split wrong causes slow queries or a cardinality explosion.` },
      { term: `The storage engine`, def: `WAL for durability, an in-memory buffer organized by series, flushes to immutable compressed files of per-series blocks with an index at the end, and background compaction.`, why: `Each block holds one series' timestamps and values together, so reading a series is a seek to the index and a seek to its blocks.` }
    ],
    cheatsheet: [
      { title: `Bytes per point`, type: `table`, headers: [`Storage`, `Bytes / point`, `Why`], rows: [
        [`Postgres row (ts, host, metric, value)`, `50-100`, `Tuple header, repeated strings, index entries`],
        [`Raw pair (int64 ts, float64 value)`, `16`, `No metadata, no compression`],
        [`Delta + varint`, `~3-6`, `Small differences in fewer bytes`],
        [`Gorilla (delta-of-delta + XOR)`, `~1.4-3`, `1-bit timestamps, short XOR blocks`]
      ] },
      { title: `Data model`, type: `table`, headers: [`Part`, `Example`, `Indexed?`, `Rule`], rows: [
        [`Measurement`, `cpu_usage`, `Yes`, `Like a table name`],
        [`Tags`, `host=web-1, region=us-west`, `Yes`, `Low-cardinality metadata you filter by`],
        [`Fields`, `value=45.2`, `No`, `The measured values`],
        [`Timestamp`, `1700000000`, `By time partition`, `Usually seconds or ms precision`]
      ] },
      { title: `Line protocol and a Timescale hypertable`, type: `code`, body: `# InfluxDB line protocol: measurement,tags fields timestamp
cpu_usage,host=web-1,region=us-west value=45.2 1700000000000000000

-- TimescaleDB: Postgres table partitioned into daily chunks
CREATE TABLE metrics (
  time   timestamptz NOT NULL,
  host   text,
  metric text,
  value  double precision
);
SELECT create_hypertable('metrics', 'time', chunk_time_interval => INTERVAL '1 day');
SELECT add_retention_policy('metrics', INTERVAL '7 days');      -- drops whole chunks
ALTER TABLE metrics SET (timescaledb.compress, timescaledb.compress_segmentby = 'host');` }
    ],
    interview: [
      { q: `Why does vanilla Postgres struggle with 50,000 metric points per second?`, a: `Each point becomes a row with a ~23-byte tuple header, repeated host and metric strings and index entries, so 16 bytes of information costs 50-100 bytes, around 30 billion rows a week. Every insert updates B-tree indexes with random I/O, and deleting old data means huge DELETEs and vacuuming. Postgres with partitioning and Timescale-style compression can go a long way; a vanilla table can't.`, diff: `medium` },
      { q: `How do TSDBs compress timestamps and values so well?`, a: `Timestamps arrive at regular intervals, so the delta between consecutive deltas is usually zero and encodes in one bit. Values change slowly, so XORing each float with the previous one leaves mostly zero bits; storing only the short run of meaningful bits (or a single bit when unchanged) gets values to around a byte or two. That's the Facebook Gorilla scheme: roughly 16 bytes per point down to ~1.4.`, diff: `medium` },
      { q: `Why partition time series data by time?`, a: `Writes always go to the current partition, so the write path is simple and hot data stays in memory. Queries over the last hour touch one partition and skip the rest. And retention becomes dropping old partitions, a metadata operation, instead of deleting billions of rows. Partitions can also be spread across machines or moved to cheaper storage as they age.`, diff: `easy` },
      { q: `Your interviewer suggests a TSDB for a Top-K trending problem. Thoughts?`, a: `Be careful. TSDBs are optimized for reading a few series over time, using an in-memory series index and per-series blocks. Top-K needs to aggregate and rank across millions of items, which means scanning a huge number of series; with item IDs as tags it also explodes cardinality. A streaming aggregation (Flink or Kafka Streams with count-min sketches) or an OLAP store fits better.`, diff: `hard` },
      { q: `What does the LSM tree buy a TSDB, and what does it cost?`, a: `It turns every write into an append to a WAL plus an in-memory insert, flushing sorted immutable files sequentially, so writes never wait on random I/O. The costs: a read may check several files (mitigated by Bloom filters and time-range metadata), and background compaction rewrites data, using disk bandwidth and CPU.`, diff: `medium` }
    ],
    labs: [`tsCompression`, `timePartition`]
  },
  // ------------------------------------------------------------------
  {
    id: `ch9`, part: 4, number: 9,
    title: `Time series databases: the read path, rollups and where they break`,
    overview: `Reads stay fast because a TSDB never searches raw rows: an in-memory <strong>tag index</strong> (an inverted index from tag values to series) finds the matching series, the file index finds their blocks, <strong>Bloom filters</strong> and <strong>block metadata</strong> skip files that can't match, and aggregation streams over compressed blocks. For long ranges, <strong>downsampling</strong> stores rollups such as 1-minute and 1-hour min, max, sum and count. All of this rests on one assumption, <strong>low cardinality</strong>: tag a metric with user_id and the series index explodes.`,
    concepts: [
      { term: `Tag index`, def: `An in-memory inverted index mapping each tag value to the series that have it: region=us-west &rarr; [series 1, series 2]. Multi-tag queries intersect the lists.`, why: `The same structure as a search engine's term index, applied to series instead of documents.`, demo: `cardinality` },
      { term: `Query execution`, def: `Select partitions by time range, resolve series through the tag index, read their blocks from the memory buffer and disk files, and aggregate while streaming.`, why: `Time locality and series locality together mean a query reads only the bytes it needs.` },
      { term: `Bloom filters on files`, def: `Each immutable file keeps a Bloom filter of the series it contains, so a lookup for one host over a long range skips files that definitely don't hold it.`, why: `Turns dozens of possible disk reads into one or two for point lookups across many files.` },
      { term: `Block metadata`, def: `Each block records its min and max timestamp (and sometimes min and max value), so queries skip blocks entirely outside their range or value filter.`, why: `Cheap pruning layered on top of time partitions.` },
      { term: `Downsampling`, def: `Background jobs compute coarser rollups of older data: for example raw 10 s points for 24 hours, 1-minute rollups for 7 days, 5-minute for 30 days, 1-hour for a year.`, why: `Long-range dashboards read hundreds of times fewer points, and storage stops growing with retention.`, demo: `downsampling` },
      { term: `Store min, max, sum and count`, def: `A rollup should keep min, max, sum and count, not just the average. Averages of averages are wrong when counts differ, and an average hides spikes.`, why: `Sum and count give correct averages at any coarser level; max keeps the spike your alert cares about.`, demo: `downsampling` },
      { term: `Percentiles don't roll up`, def: `You can't compute a p99 from p99s of smaller windows. Keep histogram buckets or a mergeable sketch (t-digest, DDSketch) per window instead.`, why: `Latency SLOs live on percentiles, so the rollup format must support merging them.` },
      { term: `Rollups as a requirements negotiation`, def: `"10-second data for a year" is enormous. Propose full resolution for a week and coarser rollups after that, and confirm it meets the use case.`, why: `Anticipating the problem and offering an alternative reads as senior judgement even if the interviewer declines.`, demo: `downsampling` },
      { term: `Cardinality`, def: `The number of unique series: the product of distinct values across tags actually seen together. 1,000 hosts x 50 metrics = 50,000 series.`, why: `Memory for the series index and active buffers grows with series count, not with points.`, demo: `cardinality` },
      { term: `Cardinality explosion`, def: `Adding a tag like user_id, request_id or a container ID that changes on every deploy multiplies the series count into the millions or billions; the index runs out of memory and queries slow down.`, why: `The classic way to take down Prometheus or InfluxDB. High-cardinality values belong in fields or logs, not tags.`, demo: `cardinality` },
      { term: `Where TSDBs don't fit`, def: `Ranking across millions of entities, joins with relational data, frequent updates to old points, and per-user analytics.`, why: `Break the assumptions (low cardinality, append-only, regular data) and a TSDB is worse than a general-purpose database.` },
      { term: `The landscape`, def: `Prometheus (pull-based monitoring, local TSDB, 2-hour blocks), InfluxDB, TimescaleDB (Postgres extension), and column stores such as ClickHouse and Druid for high-cardinality event analytics.`, why: `Name the boring fit: Prometheus for service metrics, TimescaleDB if you're already on Postgres, ClickHouse for event analytics.` }
    ],
    cheatsheet: [
      { title: `A typical retention policy`, type: `table`, headers: [`Age`, `Resolution`, `Points per series per day`, `Answers`], rows: [
        [`0-24 h`, `10 s raw`, `8,640`, `Debugging, alerting`],
        [`1-7 days`, `1 min`, `1,440`, `Recent trends`],
        [`7-30 days`, `5 min`, `288`, `Weekly dashboards`],
        [`30-365 days`, `1 h`, `24`, `Capacity planning`]
      ], note: `Store min, max, sum and count per rollup bucket so averages and peaks stay correct.` },
      { title: `Tags vs fields`, type: `table`, headers: [`Value`, `Cardinality`, `Make it a...`], rows: [
        [`region, env, service`, `Tens`, `Tag`],
        [`host, pod (stable)`, `Thousands`, `Tag, carefully`],
        [`container ID per deploy`, `Grows forever`, `Avoid as tag; aggregate by service`],
        [`user_id, request_id, trace ID`, `Millions+`, `Field or logs/traces, never a tag`]
      ] },
      { title: `Queries`, type: `code`, body: `# PromQL: per-region p99 latency over 5-minute windows (histogram buckets roll up)
histogram_quantile(0.99,
  sum by (region, le) (rate(http_request_duration_seconds_bucket[5m])))

-- TimescaleDB continuous aggregate: 1-minute rollups kept with min/max/sum/count
CREATE MATERIALIZED VIEW metrics_1m WITH (timescaledb.continuous) AS
SELECT time_bucket('1 minute', time) AS bucket, host, metric,
       min(value), max(value), sum(value), count(*)
FROM metrics GROUP BY bucket, host, metric;` }
    ],
    interview: [
      { q: `How does a TSDB answer "average CPU for prod servers in us-west over the last hour"?`, a: `It picks the partitions overlapping the last hour, looks up region=us-west and env=prod in the in-memory tag index and intersects the two series lists, finds those series' blocks via the file index (skipping files their Bloom filters rule out), decompresses just those blocks plus recent in-memory data, filters by time and computes the mean as it streams. It never touches the us-east series.`, diff: `medium` },
      { q: `What is the cardinality problem?`, a: `Every unique combination of tag values is a separate series, and the TSDB keeps an in-memory index entry and buffer per active series. A tag with millions of values (user_id, request_id) multiplies series into the millions or billions: memory blows up, queries slow and ingestion can fall over. Keep tags low-cardinality and put identifiers in fields, logs or traces.`, diff: `medium` },
      { q: `How would you store metrics for a year without storing everything at 10-second resolution?`, a: `Downsample: keep raw 10-second data for a day or a week, then 1-minute, 5-minute and 1-hour rollups for progressively longer periods, computed by background jobs or continuous aggregates. Each rollup stores min, max, sum and count so averages and peaks remain correct, plus histograms or sketches for percentiles. Storage drops by 100x or more and long-range queries read far fewer points.`, diff: `medium` },
      { q: `Why not just store the average in rollups?`, a: `Averages can't be combined correctly when buckets have different counts, and an average flattens spikes: a 20-second CPU spike to 100% disappears in a 5-minute average of 30%. Store min, max, sum and count; derive averages from sum/count and keep max for alerting. For latency percentiles, store histogram buckets or a mergeable sketch.`, diff: `medium` },
      { q: `Prometheus or ClickHouse for per-user request analytics?`, a: `ClickHouse (or Druid). Per-user analytics means user_id must be queryable, which is fatal as a Prometheus label because every user creates new series. A column store handles high-cardinality columns well, compresses them, and aggregates billions of rows. Keep Prometheus for service-level metrics with low-cardinality labels.`, diff: `hard` }
    ],
    labs: [`cardinality`, `downsampling`]
  },
  // ------------------------------------------------------------------
  {
    id: `ch10`, part: 5, number: 10,
    title: `Change data capture: keeping stores in sync without dual writes`,
    overview: `A product catalog lives in Postgres but search runs on Elasticsearch, the cache needs invalidating and the warehouse wants a copy. Having the application write to every store (<strong>dual writes</strong>) eventually diverges: one write fails, the process crashes between them, or two writers race. <strong>Change data capture</strong> reads the database's own replication log (Postgres WAL, MySQL binlog) and streams every committed change, in order, to consumers. Use the test: CDC is right when consumers need a <strong>copy of the data</strong>; when they need to know <strong>why</strong> it changed, publish domain events with a <strong>transactional outbox</strong>.`,
    concepts: [
      { term: `The sync problem`, def: `One source of truth feeding derived stores: search indexes, caches, read models, warehouses, other services.`, why: `Shows up in almost every design that has both a database and a search or analytics system.` },
      { term: `Dual writes`, def: `The application writes the database and then the second system in the same request.`, why: `Partial failure leaves them inconsistent; a crash between the writes loses one silently; two concurrent writers can apply in different orders to each store. Retries fix only the first.`, demo: `dualWrite` },
      { term: `Change data capture (CDC)`, def: `Read committed changes from the database's replication log and publish them as change events: Postgres logical decoding of the WAL, MySQL binlog, MongoDB change streams, DynamoDB Streams.`, why: `The log already exists, contains only committed changes, and is ordered. The application doesn't change.`, demo: `dualWrite` },
      { term: `Debezium and Kafka Connect`, def: `Debezium connectors tail the log and write one Kafka topic per table, keyed by primary key; sink connectors or consumers update Elasticsearch, caches and warehouses.`, why: `The standard open-source pipeline you can name in an interview.` },
      { term: `Change events`, def: `Each event carries the operation (create, update, delete), the row before and after, the source position (LSN or binlog offset), the transaction ID and a timestamp.`, why: `Consumers can apply upserts and deletes, detect replays by position, and audit history.` },
      { term: `Snapshot, then stream`, def: `A new consumer first takes a consistent snapshot of existing rows, records the log position, then streams changes from that position.`, why: `Bootstraps a new index without downtime or gaps; also how you rebuild after a bug.` },
      { term: `Ordering by key`, def: `Partition change events by primary key so all changes to a row land in one partition and are consumed in order. Events for different rows can be processed in parallel.`, why: `If updates to the same row are spread across partitions, an older version can overwrite a newer one downstream.`, demo: `cdcOrdering` },
      { term: `At-least-once and idempotent consumers`, def: `Connectors and consumers retry, so events can be delivered more than once. Consumers should upsert by key and ignore events whose source position is older than what they've already applied.`, why: `Version checks make duplicates and reordering harmless.`, demo: `cdcOrdering` },
      { term: `Copy vs intent`, def: `CDC tells consumers the new state of a row. It doesn't say why: "order status = cancelled" doesn't distinguish customer cancellation from fraud, and the event shape leaks the table schema.`, why: `The decision test: if consumers just mirror data (search, cache, warehouse), use CDC. If they react to business events (send email, refund, notify partner), publish explicit events.` },
      { term: `Transactional outbox`, def: `In the same database transaction as the business change, insert an event row into an outbox table. A relay (CDC on the outbox table, or a poller) publishes it to the broker.`, why: `Atomic with the business write, no dual write, and the event carries intent in a stable contract. Consumers still need idempotency.`, demo: `dualWrite` },
      { term: `Schema changes`, def: `Renaming or dropping a column changes every downstream event. Use a schema registry with compatibility rules, and prefer additive changes.`, why: `CDC couples consumers to your table layout; the outbox decouples them.` },
      { term: `Operational gotchas`, def: `A Postgres replication slot retains WAL until the consumer reads it, so a stalled connector can fill the disk. Monitor lag; plan for replays; large transactions arrive as bursts.`, why: `The failure mode interviewers like to probe after you propose CDC.` },
      { term: `Common uses`, def: `Search indexing, cache invalidation, feeding a data warehouse or lake, building read models (CQRS), sharing data between microservices, audit trails, zero-downtime migrations.`, why: `Any time a second store must follow the first.` }
    ],
    cheatsheet: [
      { title: `Keeping a second store in sync`, type: `table`, headers: [`Approach`, `Consistency`, `Carries intent?`, `Complexity`, `Use when`], rows: [
        [`Dual write`, `Diverges on failure, crash, race`, `Yes (app decides)`, `Low, until it breaks`, `Avoid`],
        [`CDC from the log`, `Eventually consistent, ordered per key`, `No: row changes`, `Connector + broker`, `Consumers need a copy`],
        [`Transactional outbox`, `Atomic with the write; eventually delivered`, `Yes: domain events`, `Outbox table + relay`, `Consumers react to events`],
        [`Batch export (ETL)`, `Hours stale`, `No`, `Low`, `Nightly analytics`]
      ] },
      { title: `Change sources`, type: `table`, headers: [`Database`, `Log`, `Mechanism`], rows: [
        [`PostgreSQL`, `WAL`, `Logical decoding via a replication slot (pgoutput)`],
        [`MySQL`, `Binlog`, `Row-based binlog replication`],
        [`MongoDB`, `Oplog`, `Change streams`],
        [`DynamoDB`, `-`, `DynamoDB Streams / Kinesis`]
      ] },
      { title: `A change event and an outbox`, type: `code`, body: `// Debezium-style change event on topic dbserver.public.products, key = {"id": 42}
{ "op": "u",
  "before": { "id": 42, "name": "Desk", "price": 199 },
  "after":  { "id": 42, "name": "Desk", "price": 179 },
  "source": { "lsn": 2894561, "txId": 7731, "table": "products" },
  "ts_ms": 1760362800000 }

-- Transactional outbox: business write and event in one transaction
BEGIN;
UPDATE orders SET status = 'cancelled' WHERE id = 991;
INSERT INTO outbox (aggregate_id, type, payload)
VALUES (991, 'OrderCancelledByCustomer', '{"orderId":991,"refund":true}');
COMMIT;
-- A relay (CDC on the outbox table, or a poller) publishes rows to Kafka` }
    ],
    interview: [
      { q: `Why not just write to Postgres and Elasticsearch from the application?`, a: `Because the two writes aren't atomic. If the Elasticsearch write fails you need retries; if the process crashes between them, the change is silently lost; and two concurrent updates to the same product can reach the two stores in different orders, leaving search with the older value. Over time the stores diverge with no record of why. CDC or an outbox makes the database the single place a change is committed.`, diff: `medium` },
      { q: `How does CDC work with Postgres?`, a: `Postgres writes every change to its WAL. A logical replication slot decodes committed changes; Debezium reads the slot and publishes one event per row change to Kafka, keyed by primary key, with before and after images and the LSN. Consumers (an Elasticsearch sink, a cache invalidator) apply them in order per key. A new consumer starts with a consistent snapshot, then streams from the recorded LSN.`, diff: `medium` },
      { q: `How do you keep updates to the same row in order?`, a: `Key change events by primary key so all changes to a row go to one partition, which a single consumer reads in order. Make the consumer idempotent and version-aware: store the source LSN or a version with each document and skip events older than what's stored, so retries and replays can't regress data.`, diff: `medium` },
      { q: `When is CDC the wrong tool?`, a: `When consumers need business meaning rather than a copy. A row update to status = 'cancelled' doesn't say whether the customer cancelled or fraud detection did, and it exposes your table schema to every consumer. For "react to this business event" (send an email, issue a refund), publish explicit domain events, atomically, with a transactional outbox.`, diff: `hard` },
      { q: `What can go wrong operating a CDC pipeline?`, a: `A stalled connector keeps the replication slot from advancing, so Postgres retains WAL until the disk fills; monitor slot lag and alert. Schema changes can break consumers; use a schema registry and additive changes. Delivery is at least once, so consumers must be idempotent. Large backfills or bulk updates arrive as huge bursts and lag spikes. And deletes need tombstone handling downstream.`, diff: `hard` },
      { q: `Explain the transactional outbox pattern.`, a: `Instead of publishing to a broker inside the request, the service inserts an event row into an outbox table in the same transaction as the business change, so both commit or neither does. A separate relay (CDC tailing the outbox table, or a poller) publishes outbox rows to Kafka and marks or deletes them. Consumers get reliable, intent-carrying events and handle the occasional duplicate idempotently.`, diff: `medium` }
    ],
    labs: [`dualWrite`, `cdcOrdering`]
  }
);
