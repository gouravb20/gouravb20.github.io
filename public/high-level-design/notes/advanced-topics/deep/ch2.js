// Deep dive: Chapter 2, Encoded keys: geohash, S2 and H3. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch2 = {
  hook: `<p>Two million drivers are on the road, and each phone reports its position every four seconds. That is half a million location writes per second, around the clock, before a single rider has asked for anything. An R-tree would have to adjust bounding rectangles on every write; a search engine would be drowning in new segments.</p>
<p>What you want instead is boring: a driver moves, you overwrite one small value, done. The trick that makes this possible is to turn "latitude 40.7484, longitude -73.9857" into a <strong>single key</strong>, such as <code>dr5ru6</code>, that an ordinary index, a Redis sorted set or a key-value store already knows how to handle, and to make sure that nearby places get similar keys. This chapter is about the three popular ways to do that: geohash, S2 and H3.</p>`,
  sections: [
    {
      id: "encoded-keys",
      title: "Encoded keys: one sortable value for two coordinates",
      kicker: "The key idea",
      blocks: [
        {
          type: "idea",
          html: `<p>Divide the world into a hierarchy of cells and give every cell an ID. Store each point with the ID of the cell it falls in. A proximity query becomes "fetch the points in these few cell IDs", which is a range scan or a handful of exact lookups on infrastructure you already run.</p>`,
        },
        {
          type: "text",
          html: `<p>The previous chapter showed that sorting by latitude alone destroys locality. Encoded keys get around that with a <strong>space-filling curve</strong>: a single line that visits every cell of a grid exactly once. Number the cells in the order the curve visits them, and you have a one-dimensional order in which points that are close on the line are usually close on the map.</p>
<p>"Usually" is doing real work in that sentence. No curve can keep <em>every</em> pair of neighbours close in one dimension; somewhere it has to jump. Curves differ in how often and how far they jump, and that difference is the main technical gap between geohash and S2.</p>`,
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
          type: "tradeoffs",
          title: "Encoded keys compared with spatial trees",
          pros: [
            "No spatial extension needed: any B-tree, sorted set or key-value store will do",
            "A location update is one small overwrite, so write rates in the hundreds of thousands per second are routine",
            "Easy to shard: partition by cell or by a coarser parent cell",
          ],
          cons: [
            "Mostly suited to points; shapes must be approximated by sets of cells",
            "Cells have hard edges, so every query must also fetch neighbouring cells",
            "A fixed precision doesn't adapt to density the way a quadtree does",
          ],
        },
      ],
    },
    {
      id: "geohash",
      title: "Geohash: interleaved bits written in base 32",
      kicker: "How it works",
      blocks: [
        {
          type: "text",
          html: `<p>Geohash, published by Gustavo Niemeyer in 2008, is the simplest encoding to compute by hand. It halves the world over and over, alternating between longitude and latitude, and records one bit per halving: 1 if the point is in the upper half, 0 if it is in the lower half. Every five bits become one character from a 32-symbol alphabet (<code>0-9</code> and <code>b-z</code> without <code>a</code>, <code>i</code>, <code>l</code> and <code>o</code>).</p>`,
        },
        {
          type: "steps",
          title: "Encoding the Empire State Building (40.7484, -73.9857)",
          items: [
            "Longitude range [-180, 180], midpoint 0. -73.99 is below it: bit <strong>0</strong>, keep [-180, 0].",
            "Latitude range [-90, 90], midpoint 0. 40.75 is above it: bit <strong>1</strong>, keep [0, 90].",
            "Longitude [-180, 0], midpoint -90. -73.99 is above: bit <strong>1</strong>, keep [-90, 0].",
            "Latitude [0, 90], midpoint 45. 40.75 is below: bit <strong>0</strong>, keep [0, 45].",
            "Longitude [-90, 0], midpoint -45. -73.99 is below: bit <strong>0</strong>, keep [-90, -45].",
            "The five bits <code>01100</code> are 12 in decimal, which is the character <code>d</code>. The point lies in the cell latitude 0 to 45, longitude -90 to -45.",
            "Keep going: 30 bits give six characters, <code>dr5ru6</code>, a cell about 0.93 km wide and 0.61 km tall in New York.",
          ],
        },
        {
          type: "text",
          html: `<p>Each character adds five bits, which split the cell 32 ways: two or three halvings in each direction. That is why every extra character shrinks the cell area by about 32 times, and why consecutive precisions alternate between square-ish and 2:1 rectangular cells.</p>
<p>Because the bits are interleaved most-significant first, the encoding follows the Z-order curve, and a geohash prefix <em>is</em> a parent cell. Every point inside <code>dr5ru</code> has a geohash starting with <code>dr5ru</code>, so <code>WHERE geohash LIKE 'dr5ru%'</code> is an ordinary B-tree prefix scan over one cell. Stored as a 64-bit integer instead of text, the same cell is a contiguous numeric range.</p>`,
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
          type: "problem",
          html: `<p>Shared prefixes imply closeness, but closeness does not imply shared prefixes. Two points a few metres apart can sit on opposite sides of a cell edge, and if that edge is a high-level split, their geohashes may share almost nothing.</p>`,
        },
        {
          type: "text",
          html: `<p>The Empire State Building is in cell <code>dr5ru6</code>, but only about 12 m from its southern edge. A driver 20 m further south is in <code>dr5ru3</code>. A query that scans only the rider's own cell would miss the closest driver in the city.</p>
<p>It gets worse at big boundaries. Two points in Greenwich, 70 m apart on either side of the prime meridian, encode as <code>gcpuzgr</code> and <code>u10hb52</code>: not a single character in common, because the very first bit already split them. The same happens along the equator.</p>`,
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
          type: "text",
          html: `<h3>Choosing the precision</h3>
<p>The 3x3 block only covers the circle if a cell is at least as large as the search radius in both directions: then a circle centred anywhere in the middle cell cannot reach past the outer ring. For a 1 km radius, length 6 cells (about 1.2 km &times; 0.6 km at the equator) are too short in one direction, so use length 5 (about 4.9 km) and accept more candidates, or stay at length 6 and fetch two rings of neighbours (25 cells).</p>
<p>The cost runs the other way too. Length 5 cells are 25 km&sup2; each; nine of them cover 220 km&sup2; to answer a 3 km&sup2; question. In a dense city that is a lot of candidates. Systems often pick the precision per query from the radius, or start fine and widen when too few results come back.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Redis", title: "GEOADD and GEOSEARCH", html: "Redis stores each member's position as a 52-bit interleaved geohash used as its score in a sorted set. <code>GEOSEARCH</code> (Redis 6.2+) computes the cells covering the radius, scans their score ranges and filters by distance, so the 3x3 trick is built in." },
            { org: "Elasticsearch", title: "geohash_grid aggregation", html: "Buckets documents by geohash cell at a chosen precision, which is how map heat-maps and clustered markers are often drawn." },
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
      title: "Geohash's flat map, and how S2 models the sphere",
      kicker: "Going global",
      blocks: [
        {
          type: "text",
          html: `<p>Geohash treats latitude and longitude as a flat rectangle and cuts it into equal <em>degree</em> ranges. Degrees of latitude are always about 111 km, but a degree of longitude is 111.32 &times; cos(latitude) km. A geohash cell therefore narrows as you move away from the equator.</p>
<p>Worked example: Singapore sits at 1.3&deg; north, where cos(latitude) &asymp; 1.00. Oslo sits at 59.9&deg; north, where cos(latitude) &asymp; 0.50. The same five-character geohash cell is about 4.9 km wide in Singapore and about 2.4 km wide in Oslo, while both are 4.9 km tall. Near the poles cells become slivers. And the antimeridian at 180&deg; longitude is a hard edge where neighbours get completely different hashes.</p>`,
        },
        {
          type: "lab",
          id: "cellShape",
          caption: "Slide the latitude from the equator toward the pole and watch a geohash cell's width collapse while its height stays fixed. The comparable S2 cell stays roughly square.",
        },
        {
          type: "text",
          html: `<h3>S2: a cube around the Earth</h3>
<p>Google's S2 library avoids the flat-map distortion by projecting the sphere onto the six faces of a surrounding cube. Each face is then divided like a quadtree: level 0 is the face, and every level splits each cell into four, down to level 30, where cells are around a centimetre across. A non-linear projection keeps cells of the same level within roughly a factor of two of each other in area anywhere on Earth.</p>
<p>Within each face, cells are numbered along a <strong>Hilbert curve</strong>, which avoids the long jumps of Z-order. A cell ID is one 64-bit integer: three bits for the face, two bits per level of the path down the quadtree, then a marker bit. Clearing the low bits gives the parent, and all the leaf cells inside a cell form a single contiguous range of IDs. That last property is what makes S2 range-scannable.</p>`,
        },
        {
          type: "text",
          html: `<p>For a search area, S2's region coverer returns a small set of cells, possibly at mixed levels, that together cover a circle or polygon. Each cell is one ID range, so a query becomes a few range scans over a sorted integer column, followed by the usual exact filter. Because the library works on the sphere, poles, the antimeridian and polygons that cross them are handled correctly.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "MongoDB", title: "2dsphere indexes", html: "MongoDB's <code>2dsphere</code> index type computes S2 cell coverings for GeoJSON points and shapes and stores those cells in an ordinary B-tree index." },
            { org: "Google BigQuery", title: "S2 functions", html: "BigQuery exposes S2 directly, for example <code>S2_CELLIDFROMPOINT</code>, so points can be bucketed into S2 cells for joins and aggregation." },
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
          type: "problem",
          html: `<p>A ride-hailing marketplace constantly asks "how much supply and demand is near here?" and answers it by counting drivers and requests per cell, then smoothing over the cells around each one. On a square grid, "the cells around this one" have two different distances: four edge neighbours and four corner neighbours that are about 41% farther away. Rings of squares are squares, not circles.</p>`,
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
          type: "text",
          html: `<p>Uber built <strong>H3</strong> for exactly this and open-sourced it in 2018. It covers the globe with hexagons at 16 resolutions (0 to 15). Resolution 0 has 122 base cells; each finer resolution has about seven times as many cells as the one above. Resolution 9, a common choice for city-level work, has hexagons of roughly 0.1 km&sup2; with edges around 175 m.</p>
<p>A sphere cannot be tiled with hexagons alone, so every resolution also contains exactly 12 pentagons, placed over the oceans by the choice of projection. And because seven small hexagons cannot exactly fill one large one, H3's hierarchy is only approximate: a cell's children cover its parent closely but not perfectly, unlike S2's exact quadtree.</p>`,
        },
        {
          type: "text",
          html: `<h3>Rings instead of ranges</h3>
<p>H3's core query is <code>gridDisk(cell, k)</code>: every cell within k steps. A disk of k rings holds 1 + 3k(k+1) hexagons, so 7 cells for k = 1, 19 for k = 2 and 37 for k = 3. The equivalent square block holds (2k+1)&sup2;: 9, 25 and 49. The hexagon disk is both smaller and closer to a circle.</p>
<p>The price is that H3 IDs do <em>not</em> lie on a space-filling curve in a way that makes neighbours contiguous. You cannot sweep up a neighbourhood with one range scan; you compute the list of cell IDs and look each one up, with <code>WHERE h3_r9 = ANY(...)</code> or a batch of key-value gets. That is fine for a few dozen cells, and the cell-per-key model shards nicely.</p>`,
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
      title: "Moving points and choosing an approach",
      kicker: "Putting it together",
      blocks: [
        {
          type: "text",
          html: `<p>The reason encoded keys dominate live-location systems is the write path. When a driver moves, compute the new cell (a few microseconds of arithmetic) and overwrite one value: a sorted-set score in Redis, or one row keyed by driver ID with the cell as an indexed column. Nothing needs rebalancing.</p>
<p>Worked numbers: 2 million active drivers reporting every 4 seconds is 500,000 writes per second. A single Redis node handles on the order of a hundred thousand simple commands per second, so a handful of nodes sharded by city or by a coarse parent cell carries the load, with room for reads. Riders in one city only ever query their own shard.</p>`,
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p>Plan for drivers who go offline without saying so. Members of a Redis sorted set cannot expire individually, so a <code>GEOADD</code> set keeps dead drivers forever unless you clean it. Common fixes: keep a second sorted set of last-seen timestamps and periodically remove stale members from both, or write positions into short-lived per-cell keys with a TTL.</p>`,
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
          type: "compare",
          title: "The one-line decision",
          items: [
            { title: "Spatial tree", tone: "info", html: "Shapes, containment and intersection; data that changes slowly; geo combined with text search. PostGIS, Elasticsearch." },
            { title: "Encoded cells", tone: "ok", html: "Points that move constantly and very high write rates. Geohash in Redis for the simplest path, S2 for global correctness, H3 for ring-based aggregation." },
          ],
        },
      ],
    },
    {
      id: "interview",
      title: "Using encoded keys in a design interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "text",
          html: `<p>"Find drivers near a rider" is the canonical prompt, and the same shape appears in food delivery, scooter rental, dating apps and fleet tracking. Interviewers want to hear how the write path stays cheap, how the read path avoids the boundary bug, and how the system shards.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>A strong answer to "design nearby drivers for millions of drivers" covers:</p>
<ol>
<li><strong>Writes:</strong> each location update computes a cell and overwrites one value (Redis <code>GEOADD</code>, or a row keyed by driver ID), with a staleness mechanism for drivers who disappear.</li>
<li><strong>Reads:</strong> compute the rider's cell, fetch it plus its neighbours (<code>GEOSEARCH</code>, or <code>gridDisk</code> and an <code>IN</code> list), then filter by exact distance and availability and sort.</li>
<li><strong>Precision:</strong> choose cells at least as large as the radius, and widen the ring if too few results come back.</li>
<li><strong>Scale:</strong> shard by region or coarse parent cell so each query hits one shard.</li>
</ol>
<p>Then say why you did not choose a spatial tree: the points move every few seconds, and trees pay for every move.</p>`,
        },
        {
          type: "keypoints",
          items: [
            "Geohash: simplest, prefix-scannable, distorted away from the equator and broken at the meridian and equator lines.",
            "S2: sphere-correct, Hilbert-ordered 64-bit IDs, exact hierarchy, coverings for any shape.",
            "H3: hexagons with six equidistant neighbours, ideal for rings and per-cell aggregation, but lookups are by explicit cell list.",
          ],
        },
        {
          type: "quiz",
          q: "A global delivery app uses 5-character geohashes everywhere and notices that cells in northern Europe hold far fewer couriers than cells in Southeast Asia, even in equally busy cities. What is the most likely reason?",
          options: [
            "Geohash cells shrink in width with cos(latitude), so a northern cell covers less ground",
            "Geohash precision is lower in the northern hemisphere",
            "The base-32 alphabet favours some regions",
            "Redis stores fewer bits for high latitudes",
          ],
          answer: 0,
          explain: "Geohash cuts equal ranges of degrees. A degree of longitude at 60 degrees north is about half as long as at the equator, so the same precision covers roughly half the area there. S2 or H3 keep cell areas roughly equal worldwide.",
        },
      ],
    },
  ],
  takeaways: [
    "Encoded keys turn a location into one cell ID so an ordinary B-tree, sorted set or key-value store can index it, and a location update is a single cheap write.",
    "Space-filling curves give one-dimensional orders that mostly keep neighbours together: Z-order for geohash, the Hilbert curve (fewer jumps) for S2.",
    "Geohash interleaves longitude and latitude bits into base 32; each character shrinks the cell about 32 times, and a prefix is a parent cell.",
    "Cells have hard edges, so always fetch the cell plus its neighbours, pick cells at least as large as the radius, and post-filter by exact distance.",
    "S2 models the sphere with a cube and Hilbert-ordered 64-bit IDs; H3 uses hexagons with equidistant neighbours but needs explicit cell lists instead of range scans.",
    "Spatial trees for shapes and slow-changing data; encoded cells for points that move constantly.",
  ],
  furtherReading: [
    { title: "S2 Geometry library documentation", url: "https://s2geometry.io/", note: "Cell hierarchy, the cube projection, Hilbert ordering and region coverings." },
    { title: "H3: Uber's Hexagonal Hierarchical Spatial Index", url: "https://h3geo.org/", note: "Official docs, including resolution tables and the gridDisk API." },
    { title: "Redis GEOSEARCH command reference", url: "https://redis.io/docs/latest/commands/geosearch/", note: "How Redis stores positions as geohash scores and searches by radius or box." },
  ],
};
