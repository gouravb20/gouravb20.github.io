// Deep dive: Chapter 1, Why a B-tree can't find nearby points, and spatial trees. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch1 = {
  hook: `<p>This chapter explains why a B-tree can't answer "what is near this point" efficiently, and how spatial trees (quadtrees, k-d and BKD trees, R-trees) do it. Proximity search shows up in ride hailing, delivery, store locators and dating apps.</p>`,
  sections: [
    {
      id: "one-dimension",
      title: "Why one-dimensional order can't keep neighbours together",
      kicker: "The problem",
      blocks: [
        {
          type: "text",
          html: `<p>A B-tree keeps keys in one sorted line, but a location has two coordinates. An index on <code>latitude</code> can only return a band: for a 2 km radius, a 4 km tall strip (a degree of latitude is about 111 km). The circle is &pi; &times; 2<sup>2</sup> &asymp; <strong>12.6 km&sup2;</strong>; across a 100 km metro the band is <strong>400 km&sup2;</strong>, about 32 times more, and on a global table nearly <strong>10,000 times</strong>.</p>`,
        },
        {
          type: "diagram",
          title: "A latitude index returns a band, not a circle",
          caption: "The B-tree can only narrow by latitude, so it hands back every driver in the shaded band. The rider wanted the small circle.",
          svg: `<svg viewBox="0 0 640 300" role="img" aria-label="A city map with a horizontal band returned by a latitude index and a small search circle inside it">
<rect x="30" y="30" width="360" height="240" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<rect x="30" y="125" width="360" height="50" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="1.5"/>
<circle cx="200" cy="150" r="25" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2.5"/>
<circle cx="200" cy="150" r="4" style="fill: var(--dg-ink)"/>
<circle cx="60" cy="140" r="4" style="fill: var(--dg-4)"/>
<circle cx="95" cy="162" r="4" style="fill: var(--dg-4)"/>
<circle cx="140" cy="135" r="4" style="fill: var(--dg-4)"/>
<circle cx="255" cy="165" r="4" style="fill: var(--dg-4)"/>
<circle cx="300" cy="138" r="4" style="fill: var(--dg-4)"/>
<circle cx="345" cy="158" r="4" style="fill: var(--dg-4)"/>
<circle cx="372" cy="133" r="4" style="fill: var(--dg-4)"/>
<circle cx="190" cy="138" r="4" style="fill: var(--dg-ok)"/>
<circle cx="214" cy="160" r="4" style="fill: var(--dg-ok)"/>
<circle cx="80" cy="70" r="4" style="fill: var(--dg-muted)"/>
<circle cx="250" cy="90" r="4" style="fill: var(--dg-muted)"/>
<circle cx="330" cy="230" r="4" style="fill: var(--dg-muted)"/>
<circle cx="120" cy="225" r="4" style="fill: var(--dg-muted)"/>
<circle cx="200" cy="245" r="4" style="fill: var(--dg-muted)"/>
<text x="40" y="118" font-size="12" style="fill: var(--dg-muted)">lat between L - 0.018 and L + 0.018</text>
<text x="410" y="60" font-size="13" font-weight="700">What each path reads</text>
<rect x="410" y="78" width="16" height="16" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/>
<text x="434" y="91" font-size="12">Latitude band: 400 km&#178;</text>
<rect x="410" y="106" width="16" height="16" rx="8" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)"/>
<text x="434" y="119" font-size="12">2 km circle: 12.6 km&#178;</text>
<text x="410" y="152" font-size="12" style="fill: var(--dg-muted)">Every band driver gets a</text>
<text x="410" y="170" font-size="12" style="fill: var(--dg-muted)">distance check, and only</text>
<text x="410" y="188" font-size="12" style="fill: var(--dg-muted)">the two inside the circle</text>
<text x="410" y="206" font-size="12" style="fill: var(--dg-muted)">survive. On a world table</text>
<text x="410" y="224" font-size="12" style="fill: var(--dg-muted)">the band wraps the planet.</text>
</svg>`,
        },
        {
          type: "keypoints",
          items: [
            "<strong>A composite <code>(lat, lng)</code> index</strong> is the most common wrong answer: latitude defines the scan; longitude can filter entries inside the index but can't shrink the walk.",
            "<strong>Two separate indexes</strong> are no better: the planner picks one strip, or reads both strips in full to intersect them.",
          ],
        },
        {
          type: "lab",
          id: "latStrip",
          caption: "Six thousand drivers, clustered downtown. Switch between a full scan, a latitude index, a composite (lat, lng) index and a grid of cells, and compare how many entries each walks and how many rows it distance-checks for the same results.",
        },
        {
          type: "quiz",
          q: "A table of 50 million global points has a composite B-tree index on (lat, lng). Why is a 1 km radius query still slow?",
          options: [
            "B-trees cannot store floating-point numbers",
            "The index seeks a latitude range and must walk every entry in that band; longitude can only filter entries, not narrow the scan",
            "The query planner ignores composite indexes for range predicates on both columns",
            "Longitude must be the first column, after which the query is fast",
          ],
          answer: 1,
          explain: "The index is ordered by latitude first, so the latitude range defines the scan. Longitude can reject entries during the scan but cannot shrink it. Swapping the column order just turns the band into a vertical strip of the same kind.",
        },
      ],
    },
    {
      id: "candidates",
      title: "Indexes generate candidates; exact distance picks winners",
      kicker: "The key idea",
      blocks: [
        {
          type: "idea",
          html: `<p>A spatial index answers a cheaper question, "what is in these few cells or rectangles", chosen to <strong>cover</strong> the search circle. An exact distance check then drops candidates in the corners. The index keeps candidates few; the filter keeps results correct.</p>`,
        },
        {
          type: "text",
          html: `<p>Degrees aren't kilometres: a degree of longitude is 111.32 &times; cos(latitude) km (about 84 km in New York, 56 km in Oslo). Use great-circle distance, e.g. haversine with R &asymp; 6,371 km (PostGIS's <code>ST_DWithin</code> and <code>ST_Distance</code> on <code>geography</code> work in metres):</p>
<p><span class="formula">d = 2R &middot; asin( &radic;( sin&sup2;(&Delta;&phi;/2) + cos &phi;<sub>1</sub> &middot; cos &phi;<sub>2</sub> &middot; sin&sup2;(&Delta;&lambda;/2) ) )</span></p>
<p>A square just enclosing the circle yields &pi;/4 &asymp; <strong>79%</strong> real hits; real covers are coarser, so 30 to 60% is normal. A few hundred haversines take microseconds.</p>`,
        },
        {
          type: "compare",
          title: "Two families of spatial index",
          items: [
            { title: "Spatial trees", tone: "info", html: "Structures that understand two dimensions: <strong>quadtrees</strong>, <strong>k-d and BKD trees</strong>, <strong>R-trees</strong>. Index shapes as well as points; live in PostGIS, SQLite, Oracle Spatial and Lucene." },
            { title: "Encoded keys", tone: "ok", html: "Flatten a location into one sortable value or cell ID (<strong>geohash</strong>, <strong>S2</strong>, <strong>H3</strong>) for an ordinary B-tree, sorted set or key-value store. Cheap writes, mostly points. Next chapter." },
          ],
        },
      ],
    },
    {
      id: "quadtrees-and-kd",
      title: "Quadtrees, k-d trees and BKD trees",
      kicker: "Spatial trees",
      blocks: [
        {
          type: "text",
          html: `<p>A <strong>quadtree</strong> splits any square holding more than a leaf capacity (say 100 points) into four quadrants at the midpoint. Dense downtowns become deep stacks of tiny squares; farmland stays one square.</p>`,
        },
        {
          type: "steps",
          title: "Answering \"everything within r of point q\"",
          items: [
            "Start at the root; skip child squares that don't intersect the circle.",
            "Recurse into those that do, down to leaves, including leaves across boundaries.",
            "Exact-distance filter the collected points, sort and return.",
          ],
        },
        {
          type: "diagram",
          title: "A quadtree splits only where points pile up",
          caption: "Left: the map, split three levels deep where points cluster. Right: the same tree. Highlighted nodes are the only ones a query around the dashed circle visits.",
          svg: `<svg viewBox="0 0 640 300" role="img" aria-label="A quadtree over a map with a dense cluster, and the corresponding tree with visited nodes highlighted">
<rect x="30" y="30" width="240" height="240" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<line x1="150" y1="30" x2="150" y2="270" style="stroke: var(--dg-line)" stroke-width="2"/>
<line x1="30" y1="150" x2="270" y2="150" style="stroke: var(--dg-line)" stroke-width="2"/>
<line x1="90" y1="30" x2="90" y2="150" style="stroke: var(--dg-line)" stroke-width="1.5"/>
<line x1="30" y1="90" x2="150" y2="90" style="stroke: var(--dg-line)" stroke-width="1.5"/>
<rect x="90" y="90" width="60" height="60" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<line x1="120" y1="90" x2="120" y2="150" style="stroke: var(--dg-2)" stroke-width="1"/>
<line x1="90" y1="120" x2="150" y2="120" style="stroke: var(--dg-2)" stroke-width="1"/>
<circle cx="125" cy="125" r="22" fill="none" stroke-width="2" stroke-dasharray="5 4" style="stroke: var(--dg-ink)"/>
<circle cx="100" cy="98" r="3" style="fill: var(--dg-1)"/>
<circle cx="112" cy="110" r="3" style="fill: var(--dg-1)"/>
<circle cx="104" cy="114" r="3" style="fill: var(--dg-1)"/>
<circle cx="130" cy="98" r="3" style="fill: var(--dg-1)"/>
<circle cx="142" cy="112" r="3" style="fill: var(--dg-1)"/>
<circle cx="136" cy="106" r="3" style="fill: var(--dg-1)"/>
<circle cx="98" cy="132" r="3" style="fill: var(--dg-1)"/>
<circle cx="110" cy="142" r="3" style="fill: var(--dg-1)"/>
<circle cx="128" cy="136" r="3" style="fill: var(--dg-1)"/>
<circle cx="144" cy="128" r="3" style="fill: var(--dg-1)"/>
<circle cx="138" cy="144" r="3" style="fill: var(--dg-1)"/>
<circle cx="60" cy="60" r="3" style="fill: var(--dg-1)"/>
<circle cx="70" cy="120" r="3" style="fill: var(--dg-1)"/>
<circle cx="120" cy="55" r="3" style="fill: var(--dg-1)"/>
<circle cx="210" cy="80" r="3" style="fill: var(--dg-1)"/>
<circle cx="80" cy="215" r="3" style="fill: var(--dg-1)"/>
<circle cx="220" cy="230" r="3" style="fill: var(--dg-1)"/>
<line x1="470" y1="45" x2="380" y2="110" style="stroke: var(--dg-2)" stroke-width="2.5"/>
<line x1="470" y1="45" x2="440" y2="110" style="stroke: var(--dg-line)" stroke-width="1.5"/>
<line x1="470" y1="45" x2="500" y2="110" style="stroke: var(--dg-line)" stroke-width="1.5"/>
<line x1="470" y1="45" x2="560" y2="110" style="stroke: var(--dg-line)" stroke-width="1.5"/>
<line x1="380" y1="110" x2="335" y2="175" style="stroke: var(--dg-line)" stroke-width="1.5"/>
<line x1="380" y1="110" x2="365" y2="175" style="stroke: var(--dg-line)" stroke-width="1.5"/>
<line x1="380" y1="110" x2="395" y2="175" style="stroke: var(--dg-line)" stroke-width="1.5"/>
<line x1="380" y1="110" x2="425" y2="175" style="stroke: var(--dg-2)" stroke-width="2.5"/>
<line x1="425" y1="175" x2="395" y2="240" style="stroke: var(--dg-2)" stroke-width="2.5"/>
<line x1="425" y1="175" x2="425" y2="240" style="stroke: var(--dg-2)" stroke-width="2.5"/>
<line x1="425" y1="175" x2="455" y2="240" style="stroke: var(--dg-2)" stroke-width="2.5"/>
<line x1="425" y1="175" x2="485" y2="240" style="stroke: var(--dg-2)" stroke-width="2.5"/>
<circle cx="470" cy="45" r="16" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="470" y="49" text-anchor="middle" font-size="12">root</text>
<circle cx="380" cy="110" r="16" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="380" y="114" text-anchor="middle" font-size="12">NW</text>
<circle cx="440" cy="110" r="16" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="440" y="114" text-anchor="middle" font-size="12">NE</text>
<circle cx="500" cy="110" r="16" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="500" y="114" text-anchor="middle" font-size="12">SW</text>
<circle cx="560" cy="110" r="16" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="560" y="114" text-anchor="middle" font-size="12">SE</text>
<rect x="327" y="167" width="16" height="16" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<rect x="357" y="167" width="16" height="16" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<rect x="387" y="167" width="16" height="16" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<circle cx="425" cy="175" r="10" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<rect x="387" y="232" width="16" height="16" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<rect x="417" y="232" width="16" height="16" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<rect x="447" y="232" width="16" height="16" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<rect x="477" y="232" width="16" height="16" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<text x="510" y="180" font-size="12" style="fill: var(--dg-muted)">NE, SW, SE: one big</text>
<text x="510" y="196" font-size="12" style="fill: var(--dg-muted)">leaf each, never split</text>
<text x="330" y="280" font-size="12" style="fill: var(--dg-muted)">Squares are leaves; the dense corner is 3 levels deep</text>
</svg>`,
        },
        {
          type: "lab",
          id: "quadtree",
          caption: "Drop points and watch squares split once they exceed the leaf capacity. Run a radius query and count how few squares it descends into compared with the total.",
        },
        {
          type: "keypoints",
          items: [
            "<strong>Quadtree weaknesses:</strong> midpoint splits make depth depend on clustering (about 7 levels for a million even points at capacity 100, twice that in a dense core), and pointer hops become random disk reads. Great in memory (game engines; Bing Maps quadkeys address tiles).",
            "<strong>k-d tree:</strong> splits two ways at the <em>median</em>, alternating axes, so depth is about log<sub>2</sub>(n) (20 levels for a million) whatever the clustering, and nearest-neighbour search backtracks only across close split lines. Many inserts unbalance it, so it suits fixed in-memory data.",
            "<strong>BKD tree:</strong> a k-d tree whose leaves are page-sized blocks (around a thousand points) with a small in-memory inner tree. Built once per immutable segment, it backs Lucene point fields (since Lucene 6) and Elasticsearch <code>geo_point</code>.",
          ],
        },
        {
          type: "tradeoffs",
          title: "BKD trees for geo search",
          pros: [
            "Balanced depth with page-sized leaves that suit disk; compact, fast reads",
            "Composes with text and attribute filters in search engines",
          ],
          cons: [
            "Write-once: new points go into new segments, merged later; visible only after a refresh (about a second in Elasticsearch)",
            "A driver moving every 4 seconds becomes a delete plus an insert each time: constant merge work",
          ],
        },
      ],
    },
    {
      id: "r-trees",
      title: "R-trees: bounding rectangles for points and shapes",
      kicker: "Spatial trees",
      blocks: [
        {
          type: "text",
          html: `<p>"Which delivery zone contains this address?" needs an index whose entries are shapes. An <strong>R-tree</strong> (Guttman, 1984) wraps each object in its <strong>minimum bounding rectangle</strong>, groups nearby rectangles under parents, and keeps the tree balanced with one page per node, like a B-tree. Queries test cheap rectangles first and exact geometry only on survivors.</p>`,
        },
        {
          type: "diagram",
          title: "Nested bounding rectangles, and why overlap costs reads",
          caption: "Objects a to e are grouped into rectangles R1 and R2. A query point in the region where R1 and R2 overlap must search both branches.",
          svg: `<svg viewBox="0 0 640 290" role="img" aria-label="An R-tree with two overlapping bounding rectangles and the matching tree">
<rect x="30" y="30" width="300" height="225" rx="4" fill="none" stroke-width="1.5" stroke-dasharray="6 4" style="stroke: var(--dg-muted)"/>
<rect x="50" y="50" width="150" height="150" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2" opacity="0.8"/>
<rect x="170" y="90" width="140" height="145" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2" opacity="0.8"/>
<text x="56" y="68" font-size="13" font-weight="700">R1</text>
<text x="288" y="108" font-size="13" font-weight="700">R2</text>
<polygon points="62,80 108,76 100,112 70,108" style="fill: var(--dg-panel); stroke: var(--dg-ink)" stroke-width="1.5"/>
<text x="80" y="98" font-size="12">a</text>
<line x1="115" y1="160" x2="190" y2="118" style="stroke: var(--dg-ink)" stroke-width="2.5"/>
<text x="130" y="140" font-size="12">b</text>
<circle cx="78" cy="172" r="6" style="fill: var(--dg-ink)"/>
<text x="90" y="177" font-size="12">c</text>
<rect x="222" y="122" width="62" height="34" style="fill: var(--dg-panel); stroke: var(--dg-ink)" stroke-width="1.5"/>
<text x="248" y="144" font-size="12">d</text>
<polygon points="225,190 296,184 290,225 238,222" style="fill: var(--dg-panel); stroke: var(--dg-ink)" stroke-width="1.5"/>
<text x="258" y="210" font-size="12">e</text>
<circle cx="185" cy="175" r="6" style="fill: var(--dg-bad)"/>
<text x="150" y="275" font-size="12" style="fill: var(--dg-muted)">red dot = query</text>
<rect x="445" y="30" width="60" height="28" rx="4" style="fill: var(--dg-panel); stroke: var(--dg-muted)" stroke-width="1.5"/>
<text x="475" y="49" text-anchor="middle" font-size="12">root</text>
<line x1="465" y1="58" x2="415" y2="110" style="stroke: var(--dg-bad)" stroke-width="2.5"/>
<line x1="485" y1="58" x2="545" y2="110" style="stroke: var(--dg-bad)" stroke-width="2.5"/>
<rect x="385" y="110" width="60" height="28" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="415" y="129" text-anchor="middle" font-size="12">R1</text>
<rect x="515" y="110" width="60" height="28" rx="4" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="545" y="129" text-anchor="middle" font-size="12">R2</text>
<line x1="405" y1="138" x2="375" y2="190" style="stroke: var(--dg-line)" stroke-width="1.5"/>
<line x1="415" y1="138" x2="415" y2="190" style="stroke: var(--dg-line)" stroke-width="1.5"/>
<line x1="425" y1="138" x2="455" y2="190" style="stroke: var(--dg-line)" stroke-width="1.5"/>
<line x1="535" y1="138" x2="520" y2="190" style="stroke: var(--dg-line)" stroke-width="1.5"/>
<line x1="555" y1="138" x2="570" y2="190" style="stroke: var(--dg-line)" stroke-width="1.5"/>
<rect x="362" y="190" width="26" height="24" rx="3" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="375" y="207" text-anchor="middle" font-size="12">a</text>
<rect x="402" y="190" width="26" height="24" rx="3" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="415" y="207" text-anchor="middle" font-size="12">b</text>
<rect x="442" y="190" width="26" height="24" rx="3" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="455" y="207" text-anchor="middle" font-size="12">c</text>
<rect x="507" y="190" width="26" height="24" rx="3" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="520" y="207" text-anchor="middle" font-size="12">d</text>
<rect x="557" y="190" width="26" height="24" rx="3" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="570" y="207" text-anchor="middle" font-size="12">e</text>
<text x="360" y="250" font-size="12" style="fill: var(--dg-muted)">The query sits inside both R1 and R2,</text>
<text x="360" y="268" font-size="12" style="fill: var(--dg-muted)">so both branches are read.</text>
</svg>`,
        },
        {
          type: "keypoints",
          items: [
            "<strong>Overlap is the performance knob:</strong> a query in an overlap descends every overlapping branch.",
            "The <strong>R*-tree</strong> (1990) weighs overlap and perimeter when inserting and splitting, and reinserts entries to tidy; most production R-trees are variants. <strong>Bulk loading</strong> sorted data packs tighter rectangles.",
            "PostGIS builds it on GiST (<code>USING GIST (geom)</code>); SQLite has an R*Tree module for the candidate step.",
          ],
        },
        {
          type: "table",
          title: "Spatial trees compared",
          headers: ["Structure", "How it splits", "Strong at", "Weak at", "Typical home"],
          rows: [
            ["Quadtree", "Four ways at the midpoint", "Intuition; in-memory; adapts to density", "Deep in clusters; pointer chasing on disk", "Game engines, map tiles"],
            ["k-d tree", "Two ways at the median, alternating axes", "Depth about log<sub>2</sub> n; nearest neighbour", "Pointer-based; rebuilds after many inserts", "In-memory kNN"],
            ["BKD tree", "k-d splits, page-sized leaf blocks", "Fast compact reads on disk", "Write-once; churn means merges", "Lucene, Elasticsearch"],
            ["R-tree / R*-tree", "Groups of bounding rectangles", "Points, lines and polygons; balanced on disk", "Overlap; costlier writes", "PostGIS, SQLite, Oracle Spatial"],
          ],
          note: "All four produce candidates; the exact distance or geometry test comes last.",
        },
      ],
    },
    {
      id: "interview",
      title: "Choosing a spatial index in a design interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "list",
          title: "Pick by data shape and write rate",
          items: [
            "Polygons, routes, zones, containment: a spatial tree, usually PostGIS with GiST.",
            "Mostly static places plus text and attribute filters: Elasticsearch or OpenSearch <code>geo_point</code> (BKD).",
            "Points that move every few seconds: encoded cells (geohash, S2, H3) on an ordinary index or in Redis.",
            "A small static dataset in application memory: a quadtree or k-d tree.",
          ],
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>A strong answer to "how would you find nearby X?" covers:</p>
<ol>
<li>Why not a B-tree on latitude or <code>(lat, lng)</code>: one-dimensional order returns a band.</li>
<li>Data shape and write rate decide the family: spatial trees for shapes and fairly static data, encoded cells for moving points.</li>
<li>Candidates come from cells or rectangles covering the circle, including neighbours so boundaries don't hide results.</li>
<li>Exact haversine (or <code>ST_DWithin</code>) filters, then sort and limit.</li>
<li>Elasticsearch fits restaurants but not live drivers: write-once segments and refresh delay.</li>
</ol>`,
        },
        {
          type: "code",
          lang: "sql",
          title: "A PostGIS radius query, nearest first (ST_MakePoint takes longitude first)",
          code: `CREATE INDEX restaurants_geom ON restaurants USING GIST (geom);

SELECT id, name,
       ST_Distance(geom, ST_MakePoint(-73.9857, 40.7484)::geography) AS meters
FROM restaurants
WHERE ST_DWithin(geom, ST_MakePoint(-73.9857, 40.7484)::geography, 2000)
ORDER BY meters
LIMIT 20;`,
        },
        {
          type: "quiz",
          q: "You need to answer \"which of our 3,000 delivery zones (polygons) contains this customer address?\" thousands of times a second. Which index fits best?",
          options: [
            "A B-tree on the zone's centroid latitude",
            "An R-tree style index (PostGIS GiST) on the zone polygons, followed by an exact point-in-polygon test",
            "A Bloom filter of zone IDs",
            "A BKD tree on the address points, rebuilt every second",
          ],
          answer: 1,
          explain: "The indexed objects are shapes and the question is containment, which is what R-trees are for: the index finds the few zones whose bounding rectangles contain the point, and the exact test picks the one whose polygon really does. A centroid index ignores the zone's extent entirely.",
        },
      ],
    },
  ],
  takeaways: [
    "A B-tree sorts on one dimension, so an index on latitude or <code>(lat, lng)</code> turns a radius query into a band across the map.",
    "Spatial indexes only produce <strong>candidates</strong> from cells or rectangles covering the area; exact great-circle distance or geometry picks the answers.",
    "Quadtrees adapt to density but vary in depth and suit memory; k-d trees split at medians for log<sub>2</sub> n depth; BKD trees pack them into disk blocks for Lucene, at the cost of write-once segments.",
    "R-trees index bounding rectangles of any shape, stay balanced on disk and are the default for polygons (PostGIS, SQLite); overlap slows them.",
    "Choose by data shape and write rate: spatial trees for shapes and static data, encoded cells for constantly moving points.",
  ],
  furtherReading: [
    { title: "R-trees: A Dynamic Index Structure for Spatial Searching (Guttman, SIGMOD 1984)", note: "The original R-tree paper: bounding rectangles, insertion and node splitting." },
    { title: "The R*-tree: An Efficient and Robust Access Method for Points and Rectangles (Beckmann et al., SIGMOD 1990)", note: "The insertion and split heuristics most modern R-trees use." },
    { title: "Bkd-Tree: A Dynamic Scalable kd-Tree (Procopiuc et al., 2003)", note: "The block k-d tree design that Lucene's point indexing builds on." },
    { title: "PostGIS manual", url: "https://postgis.net/docs/", note: "See the chapter on spatial indexes for how GiST indexes are built and which functions use them." },
  ],
};
