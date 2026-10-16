// Deep dive: Chapter 2, Encoded keys: geohash, S2 and H3. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch2 = {
  hook: `<p>This chapter covers how geohash, S2 and H3 turn a location into a single key that ordinary indexes and key-value stores can handle, so a moving point costs one small overwrite. That is what makes live-location systems with hundreds of thousands of writes per second practical.</p>`,
  sections: [
    {
      id: "geohash",
      title: "Encoded keys and geohash",
      kicker: "The key idea",
      blocks: [
        {
          type: "idea",
          html: `<p>Divide the world into a hierarchy of cells with IDs, store each point with its cell ID, and a proximity query becomes "fetch these few cell IDs". A <strong>space-filling curve</strong> orders cells so points close on the line are <em>usually</em> close on the map; curves differ in how often they jump.</p>`,
        },
        {
          type: "diagram",
          title: "Two ways to thread a line through a grid",
          caption: "Numbers show the order in which each curve visits the cells. Z-order (used by geohash) makes long jumps, such as from 7 to 8. The Hilbert curve (used by S2) only ever steps to an adjacent cell.",
          svg: `<svg viewBox="0 0 640 300" role="img" aria-label="A Z-order curve and a Hilbert curve drawn over 4 by 4 grids">
<text x="140" y="34" text-anchor="middle" font-size="13" font-weight="700">Z-order (geohash)</text>
<text x="460" y="34" text-anchor="middle" font-size="13" font-weight="700">Hilbert curve (S2)</text>
<g style="stroke: var(--dg-line)" stroke-width="1.5" fill="none">
<rect x="40" y="50" width="200" height="200"/>
<line x1="90" y1="50" x2="90" y2="250"/><line x1="140" y1="50" x2="140" y2="250"/><line x1="190" y1="50" x2="190" y2="250"/>
<line x1="40" y1="100" x2="240" y2="100"/><line x1="40" y1="150" x2="240" y2="150"/><line x1="40" y1="200" x2="240" y2="200"/>
<rect x="360" y="50" width="200" height="200"/>
<line x1="410" y1="50" x2="410" y2="250"/><line x1="460" y1="50" x2="460" y2="250"/><line x1="510" y1="50" x2="510" y2="250"/>
<line x1="360" y1="100" x2="560" y2="100"/><line x1="360" y1="150" x2="560" y2="150"/><line x1="360" y1="200" x2="560" y2="200"/>
</g>
<polyline points="65,75 115,75 65,125 115,125 165,75 215,75 165,125 215,125" fill="none" stroke-width="2.5" style="stroke: var(--dg-1)"/>
<line x1="215" y1="125" x2="65" y2="175" stroke-width="2.5" stroke-dasharray="6 4" style="stroke: var(--dg-bad)"/>
<polyline points="65,175 115,175 65,225 115,225 165,175 215,175 165,225 215,225" fill="none" stroke-width="2.5" style="stroke: var(--dg-1)"/>
<polyline points="385,75 435,75 435,125 385,125 385,175 385,225 435,225 435,175 485,175 485,225 535,225 535,175 535,125 485,125 485,75 535,75" fill="none" stroke-width="2.5" style="stroke: var(--dg-3)"/>
<g font-size="12" style="fill: var(--dg-muted)">
<text x="44" y="64">0</text><text x="94" y="64">1</text><text x="144" y="64">4</text><text x="194" y="64">5</text>
<text x="44" y="114">2</text><text x="94" y="114">3</text><text x="144" y="114">6</text><text x="194" y="114">7</text>
<text x="44" y="164">8</text><text x="94" y="164">9</text><text x="144" y="164">12</text><text x="194" y="164">13</text>
<text x="44" y="214">10</text><text x="94" y="214">11</text><text x="144" y="214">14</text><text x="194" y="214">15</text>
<text x="364" y="64">0</text><text x="414" y="64">1</text><text x="464" y="64">14</text><text x="514" y="64">15</text>
<text x="364" y="114">3</text><text x="414" y="114">2</text><text x="464" y="114">13</text><text x="514" y="114">12</text>
<text x="364" y="164">4</text><text x="414" y="164">7</text><text x="464" y="164">8</text><text x="514" y="164">11</text>
<text x="364" y="214">5</text><text x="414" y="214">6</text><text x="464" y="214">9</text><text x="514" y="214">10</text>
</g>
<text x="140" y="276" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">7 and 13 touch, yet sit 6 apart</text>
<text x="460" y="276" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">every step lands on a neighbour</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p><strong>Geohash</strong> (Niemeyer, 2008) halves the world repeatedly, alternating longitude and latitude, writing 1 for the upper half and 0 for the lower, then encodes every five bits as a base-32 character (<code>0-9</code>, <code>b-z</code> without a, i, l, o). The Empire State Building (40.7484, -73.9857) starts with bits <code>01100</code> = <code>d</code>, and 30 bits give <code>dr5ru6</code>, about 0.93 km by 0.61 km in New York.</p>`,
        },
        {
          type: "keypoints",
          items: [
            "Each character splits a cell 32 ways, so consecutive precisions alternate between square-ish and 2:1 cells.",
            "Bits are interleaved most-significant first (Z-order), so <strong>a prefix is a parent cell</strong>: <code>WHERE geohash LIKE 'dr5ru%'</code> is a B-tree prefix scan; as a 64-bit integer, a numeric range.",
          ],
        },
        {
          type: "table",
          title: "Geohash precision",
          headers: ["Length", "Cell size at the equator", "Typical use"],
          rows: [
            ["4", "~39 km &times; 20 km", "Region"],
            ["5", "~4.9 km &times; 4.9 km", "City district"],
            ["6", "~1.2 km &times; 0.6 km", "Neighbourhood; nearby search"],
            ["7", "~153 m &times; 153 m", "Street block"],
            ["8", "~38 m &times; 19 m", "Building"],
            ["9", "~4.8 m &times; 4.8 m", "Exact spot"],
          ],
          note: "Widths shrink with cos(latitude) away from the equator; heights don't.",
        },
        {
          type: "lab",
          id: "geohash",
          caption: "Change the geohash length and the search radius. Watch how many of the 90 places the 3x3 block fetches, how many the distance filter keeps, and when a radius larger than a cell starts to miss places.",
        },
      ],
    },
    {
      id: "boundaries",
      title: "The boundary problem and the 3x3 query",
      kicker: "The classic bug",
      blocks: [
        {
          type: "text",
          html: `<p>Shared prefixes imply closeness, but not the reverse. The Empire State Building is about 12 m inside <code>dr5ru6</code>; a driver 20 m south is in <code>dr5ru3</code>. At big boundaries it's worse: two Greenwich points 70 m apart across the prime meridian are <code>gcpuzgr</code> and <code>u10hb52</code>, with nothing in common.</p>`,
        },
        {
          type: "diagram",
          title: "Query the cell and its eight neighbours",
          caption: "The real six-character geohashes around the Empire State Building (red dot). The search circle spills into the cell below, so the query fetches all nine and then filters by exact distance.",
          svg: `<svg viewBox="0 0 600 300" role="img" aria-label="A 3 by 3 block of geohash cells around a point near the bottom edge of the centre cell">
<g style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5">
<rect x="40" y="30" width="110" height="80"/><rect x="150" y="30" width="110" height="80"/><rect x="260" y="30" width="110" height="80"/>
<rect x="40" y="110" width="110" height="80"/><rect x="260" y="110" width="110" height="80"/>
<rect x="40" y="190" width="110" height="80"/><rect x="150" y="190" width="110" height="80"/><rect x="260" y="190" width="110" height="80"/>
</g>
<rect x="150" y="110" width="110" height="80" stroke-width="2.5" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<g font-size="13" text-anchor="middle">
<text x="95" y="56">dr5ru5</text><text x="205" y="56">dr5ru7</text><text x="315" y="56">dr5rue</text>
<text x="95" y="136">dr5ru4</text><text x="205" y="136" font-weight="700">dr5ru6</text><text x="315" y="136">dr5rud</text>
<text x="95" y="256">dr5ru1</text><text x="205" y="256">dr5ru3</text><text x="315" y="256">dr5ru9</text>
</g>
<circle cx="215" cy="186" r="42" fill="none" stroke-width="2" stroke-dasharray="5 4" style="stroke: var(--dg-ink)"/>
<circle cx="215" cy="186" r="5" style="fill: var(--dg-bad)"/>
<circle cx="228" cy="206" r="4" style="fill: var(--dg-ok)"/>
<circle cx="190" cy="170" r="4" style="fill: var(--dg-ok)"/>
<circle cx="120" cy="220" r="4" style="fill: var(--dg-muted)"/>
<circle cx="330" cy="80" r="4" style="fill: var(--dg-muted)"/>
<text x="392" y="60" font-size="13" font-weight="700">Reading it</text>
<text x="392" y="86" font-size="12" style="fill: var(--dg-muted)">Red: the rider, about</text>
<text x="392" y="104" font-size="12" style="fill: var(--dg-muted)">12 m inside dr5ru6.</text>
<text x="392" y="130" font-size="12" style="fill: var(--dg-muted)">Green: drivers in range;</text>
<text x="392" y="148" font-size="12" style="fill: var(--dg-muted)">one is in dr5ru3, which a</text>
<text x="392" y="166" font-size="12" style="fill: var(--dg-muted)">single-cell scan would miss.</text>
<text x="392" y="192" font-size="12" style="fill: var(--dg-muted)">Grey: fetched with the 9</text>
<text x="392" y="210" font-size="12" style="fill: var(--dg-muted)">cells, removed by the</text>
<text x="392" y="228" font-size="12" style="fill: var(--dg-muted)">exact distance check.</text>
</svg>`,
        },
        {
          type: "keypoints",
          items: [
            "<strong>Precision:</strong> the 3x3 block covers the circle only if a cell is at least the radius in both directions. For 1 km, use length 5 (more candidates) or length 6 with two rings (25 cells).",
            "Coarse cells cost candidates: nine length-5 cells cover 220 km&sup2; to answer a 3 km&sup2; question. Pick precision per query, or start fine and widen when results are few.",
            "Redis stores a 52-bit geohash as each sorted-set score, and <code>GEOSEARCH</code> (6.2+) scans the covering cells and filters by distance: the 3x3 trick built in.",
          ],
        },
        {
          type: "quiz",
          q: "You index places by 6-character geohash and search with a 3 km radius by fetching the rider's cell plus its 8 neighbours. What goes wrong?",
          options: [
            "Nothing; 9 cells always cover any radius",
            "Some places within 3 km are missed, because a length-6 cell (about 1.2 km by 0.6 km) is smaller than the radius",
            "Too many candidates are returned and the query is slow",
            "Geohash cannot be used for radii larger than 1 km",
          ],
          answer: 1,
          explain: "The 3x3 block extends only one cell beyond the rider's cell in each direction. With cells smaller than the radius, the circle reaches past the block. Use a shorter geohash (bigger cells) or fetch more rings.",
        },
      ],
    },
    {
      id: "sphere-and-s2",
      title: "Geohash's flat map, and S2 on the sphere",
      kicker: "Going global",
      blocks: [
        {
          type: "text",
          html: `<p>Geohash cuts equal <em>degree</em> ranges, and a degree of longitude is 111.32 &times; cos(latitude) km. A length-5 cell is about 4.9 km wide in Singapore (1.3&deg;N) but 2.4 km in Oslo (59.9&deg;N), both 4.9 km tall; near the poles cells are slivers, and the antimeridian is a hard edge.</p>`,
        },
        {
          type: "lab",
          id: "cellShape",
          caption: "Slide the latitude from the equator toward the pole and watch a geohash cell's width collapse while its height stays fixed. The comparable S2 cell stays roughly square.",
        },
        {
          type: "keypoints",
          items: [
            "<strong>S2</strong> (Google) projects the sphere onto a cube's six faces, each split like a quadtree down to level 30 (about a centimetre); same-level cells stay within about 2x in area anywhere.",
            "Cells are numbered along a <strong>Hilbert curve</strong>. A 64-bit ID holds 3 face bits, 2 bits per level and a marker bit; clearing low bits gives the parent, and a cell's descendants are one contiguous ID range.",
            "The region coverer returns a few mixed-level cells covering any circle or polygon, so a query is a few range scans then the exact filter, correct at poles and the antimeridian.",
            "MongoDB <code>2dsphere</code> stores S2 coverings in a B-tree; BigQuery exposes functions such as <code>S2_CELLIDFROMPOINT</code>.",
          ],
        },
      ],
    },
    {
      id: "h3-hexagons",
      title: "H3: hexagons with equidistant neighbours",
      kicker: "Uber's grid",
      blocks: [
        {
          type: "text",
          html: `<p>Marketplaces smooth supply and demand over "the cells around this one", but square grids have two neighbour distances: corner neighbours are about 41% farther than edge neighbours. <strong>H3</strong> (Uber, open-sourced 2018) uses hexagons, whose six neighbours are equidistant.</p>`,
        },
        {
          type: "diagram",
          title: "Squares have two neighbour distances; hexagons have one",
          caption: "Left: a square cell's corner neighbours are &radic;2 &asymp; 1.41 times farther away than its edge neighbours. Right: all six neighbours of a hexagon are the same distance from its centre.",
          svg: `<svg viewBox="0 0 620 290" role="img" aria-label="A square grid cell with eight neighbours at two distances next to a hexagon with six equidistant neighbours">
<g style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5">
<rect x="76" y="66" width="56" height="56"/><rect x="132" y="66" width="56" height="56"/><rect x="188" y="66" width="56" height="56"/>
<rect x="76" y="122" width="56" height="56"/><rect x="188" y="122" width="56" height="56"/>
<rect x="76" y="178" width="56" height="56"/><rect x="132" y="178" width="56" height="56"/><rect x="188" y="178" width="56" height="56"/>
</g>
<rect x="132" y="122" width="56" height="56" stroke-width="2" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<line x1="160" y1="150" x2="216" y2="150" stroke-width="2.5" style="stroke: var(--dg-ok)"/>
<line x1="160" y1="150" x2="216" y2="94" stroke-width="2.5" style="stroke: var(--dg-bad)"/>
<circle cx="160" cy="150" r="4" style="fill: var(--dg-ink)"/>
<text x="230" y="166" font-size="12" style="fill: var(--dg-ok)">1.0</text>
<text x="222" y="90" font-size="12" style="fill: var(--dg-bad)">1.41</text>
<text x="160" y="40" text-anchor="middle" font-size="13" font-weight="700">Square grid: 8 neighbours</text>
<text x="160" y="262" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">4 edge + 4 corner</text>
<g style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5">
<polygon points="540,174.2 526,198.5 498,198.5 484,174.2 498,150 526,150"/>
<polygon points="498,198.5 484,222.7 456,222.7 442,198.5 456,174.2 484,174.2"/>
<polygon points="456,174.2 442,198.5 414,198.5 400,174.2 414,150 442,150"/>
<polygon points="456,125.8 442,150 414,150 400,125.8 414,101.5 442,101.5"/>
<polygon points="498,101.5 484,125.8 456,125.8 442,101.5 456,77.3 484,77.3"/>
<polygon points="540,125.8 526,150 498,150 484,125.8 498,101.5 526,101.5"/>
</g>
<polygon points="498,150 484,174.2 456,174.2 442,150 456,125.8 484,125.8" stroke-width="2" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<g stroke-width="2.5" style="stroke: var(--dg-ok)">
<line x1="470" y1="150" x2="512" y2="174.2"/><line x1="470" y1="150" x2="470" y2="198.5"/><line x1="470" y1="150" x2="428" y2="174.2"/>
<line x1="470" y1="150" x2="428" y2="125.8"/><line x1="470" y1="150" x2="470" y2="101.5"/><line x1="470" y1="150" x2="512" y2="125.8"/>
</g>
<circle cx="470" cy="150" r="4" style="fill: var(--dg-ink)"/>
<text x="470" y="40" text-anchor="middle" font-size="13" font-weight="700">Hexagons (H3): 6 neighbours</text>
<text x="470" y="262" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">all at distance 1.0</text>
</svg>`,
        },
        {
          type: "keypoints",
          items: [
            "16 resolutions (0-15): 122 base cells, about 7x more per level. Resolution 9 hexagons are roughly 0.1 km&sup2; with edges around 175 m.",
            "Every resolution has exactly 12 pentagons (placed over oceans), and the hierarchy is approximate: children don't exactly fill a parent.",
            "<code>gridDisk(cell, k)</code> returns 1 + 3k(k+1) cells (7, 19, 37 for k = 1-3) versus (2k+1)&sup2; squares (9, 25, 49): smaller and rounder.",
            "IDs aren't range-contiguous for neighbours, so you compute the cell list and look each up (<code>= ANY(...)</code> or batched gets). Fine for dozens of cells, and it shards nicely.",
          ],
        },
        {
          type: "lab",
          id: "hexRings",
          caption: "Switch between squares and hexagons and increase k. Compare how many cells each grid searches and, in the outer ring, how much farther the farthest cell is than the nearest.",
        },
        {
          type: "quiz",
          q: "Why can't you answer an H3 ring query with a single range scan the way you can with S2?",
          options: [
            "H3 IDs are strings, not integers",
            "H3 IDs are not ordered so that neighbouring cells form a contiguous range; you look up an explicit list of cell IDs instead",
            "H3 cells are too small for range scans",
            "H3 only supports exact-match lookups in Redis",
          ],
          answer: 1,
          explain: "S2 numbers cells along a Hilbert curve so a cell and its descendants are one ID range. H3 IDs are 64-bit integers too, but adjacent hexagons are not adjacent in ID order, so you compute the disk of cells with gridDisk and fetch each one.",
        },
      ],
    },
    {
      id: "moving-points",
      title: "Moving points, choosing, and the interview",
      kicker: "Putting it together",
      blocks: [
        {
          type: "text",
          html: `<p>A driver move is one cell computation and one overwrite (a sorted-set score, or a row keyed by driver ID); nothing rebalances. 2 million drivers every 4 seconds is 500,000 writes per second; with a Redis node handling on the order of a hundred thousand commands per second, a handful of nodes sharded by city or coarse cell carries it.</p>`,
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p>Sorted-set members can't expire individually, so a <code>GEOADD</code> set keeps vanished drivers forever. Keep a second set of last-seen timestamps and prune both, or write positions into short-lived per-cell keys with a TTL.</p>`,
        },
        {
          type: "table",
          title: "Geohash vs S2 vs H3",
          headers: ["", "Geohash", "S2", "H3"],
          rows: [
            ["Cell shape", "Rectangles in degrees", "Quadrilaterals on a cube", "Hexagons (plus 12 pentagons)"],
            ["Equal area?", "No: narrows toward the poles", "Roughly, within about 2x", "Roughly"],
            ["ID", "Base-32 string or integer", "64-bit integer", "64-bit integer"],
            ["Neighbourhood by range scan?", "Yes, Z-order prefixes", "Yes, Hilbert ranges", "No: list cells with gridDisk"],
            ["Neighbours per cell", "8 (4 edge, 4 corner)", "8", "6, all equidistant"],
            ["Hierarchy", "Exact (prefix)", "Exact (quadtree)", "Approximate (aperture 7)"],
            ["Seen in", "Redis GEO, Elasticsearch grids", "MongoDB 2dsphere, BigQuery", "Uber dispatch and pricing"],
          ],
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>A strong answer to "nearby drivers for millions of drivers" covers:</p>
<ol>
<li><strong>Writes:</strong> compute a cell and overwrite one value (Redis <code>GEOADD</code> or a row per driver), plus a staleness mechanism.</li>
<li><strong>Reads:</strong> fetch the rider's cell and neighbours (<code>GEOSEARCH</code>, or <code>gridDisk</code> and an <code>IN</code> list), then filter by exact distance and availability, and sort.</li>
<li><strong>Precision:</strong> cells at least as large as the radius; widen the ring if results are few.</li>
<li><strong>Scale:</strong> shard by region or coarse parent cell so each query hits one shard.</li>
<li><strong>Why not a spatial tree:</strong> points move every few seconds and trees pay for every move. Geohash is simplest, S2 is globally correct, H3 suits ring aggregation.</li>
</ol>`,
        },
      ],
    },
  ],
  takeaways: [
    "Encoded keys turn a location into one cell ID for an ordinary index or key-value store, so a location update is a single cheap write.",
    "Space-filling curves mostly keep neighbours together: Z-order for geohash, the Hilbert curve (fewer jumps) for S2.",
    "Cells have hard edges: fetch the cell plus neighbours, pick cells at least as large as the radius, and post-filter by exact distance.",
    "Geohash distorts away from the equator; S2 models the sphere with Hilbert-ordered 64-bit IDs; H3 hexagons have equidistant neighbours but need explicit cell lists.",
    "Spatial trees for shapes and slow-changing data; encoded cells for points that move constantly.",
  ],
  furtherReading: [
    { title: "S2 Geometry library documentation", url: "https://s2geometry.io/", note: "Cell hierarchy, the cube projection, Hilbert ordering and region coverings." },
    { title: "H3: Uber's Hexagonal Hierarchical Spatial Index", url: "https://h3geo.org/", note: "Official docs, including resolution tables and the gridDisk API." },
    { title: "Redis GEOSEARCH command reference", url: "https://redis.io/docs/latest/commands/geosearch/", note: "How Redis stores positions as geohash scores and searches by radius or box." },
  ],
};
