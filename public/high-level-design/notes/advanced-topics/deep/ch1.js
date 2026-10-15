// Deep dive: Chapter 1, Why a B-tree can't find nearby points, and spatial trees. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch1 = {
  hook: `<p>A rider in Manhattan taps "Request". Somewhere in your database sit the live positions of every driver in the city, and you need the ten closest ones inside 2 km, in under a hundred milliseconds. The table already has an index on <code>latitude</code>, so the query looks easy: <code>WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?</code>.</p>
<p>It returns the right answer and it is slow. The plan shows the database reading every driver in a 4 km tall band that runs from New Jersey to Long Island, and, on a real planet-wide table, all the way around the Earth. The index did exactly what B-trees do: it sorted by one number. Nearness on a map needs two numbers at once, and that mismatch is what this chapter is about.</p>`,
  sections: [
    {
      id: "one-dimension",
      title: "Why one-dimensional order can't keep neighbours together",
      kicker: "The problem",
      blocks: [
        {
          type: "problem",
          html: `<p>A proximity query asks for everything within some distance of a point, or the k nearest things to it. The key you search by is a <em>location</em>, not an ID or a value, and a location has two coordinates. A B-tree, the index behind almost every database, keeps its keys in a single sorted line.</p>`,
        },
        {
          type: "text",
          html: `<p>Index the <code>latitude</code> column and ask for drivers within 2 km. The best the B-tree can do is seek to <code>lat - 0.018</code> and scan to <code>lat + 0.018</code> (a degree of latitude is about 111 km). That range is a horizontal band 4 km tall, and it says nothing about longitude: a driver 50 km to the east sits right next to your rider in the index.</p>
<p>The waste is easy to put a number on. The circle you want has area &pi; &times; 2<sup>2</sup> &asymp; <strong>12.6 km&sup2;</strong>. Across a 100 km wide metro area the band covers 4 &times; 100 = <strong>400 km&sup2;</strong>, about 32 times more. On a global table the band wraps the planet: at 40&deg; latitude that is roughly 4 &times; 30,700 = 123,000 km&sup2;, nearly <strong>10,000 times</strong> the circle.</p>`,
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
          type: "text",
          html: `<h3>"Just add longitude to the index"</h3>
<p>A composite index on <code>(lat, lng)</code> feels like the fix, and it is the most common wrong answer in interviews. A composite B-tree sorts by latitude first and uses longitude only to break ties. Latitudes are almost never equal, so within the band the entries are effectively in latitude order with longitudes scattered. The database still seeks to the start of the band and walks to its end; it can check longitude <em>inside the index</em> to skip table lookups, but it cannot skip the entries themselves.</p>
<p>Two separate indexes do no better. The planner either picks one strip, or builds bitmaps of both strips (a band and a column) and intersects them, which means reading both strips in full to produce a small square.</p>`,
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
      title: "Every spatial index generates candidates; exact distance picks winners",
      kicker: "The key idea",
      blocks: [
        {
          type: "idea",
          html: `<p>A spatial index does not answer "what is within 2 km". It answers a cheaper question, "what is in these few cells or rectangles", and the cells are chosen so that they <strong>cover</strong> the search circle. A final exact distance check removes the candidates that sit in a cell's corners outside the radius.</p>`,
        },
        {
          type: "text",
          html: `<p>Thinking in candidates makes every structure in this part of the book look like the same machine with different gears. The index's job is to keep the candidate set small and to fetch it with few reads. The filter's job is to be correct.</p>
<p>The correct filter is great-circle distance, because degrees are not kilometres. A degree of latitude is always about 111 km, but a degree of longitude is 111.32 &times; cos(latitude) km: about 111 km at the equator, 84 km in New York and only 56 km in Oslo. The haversine formula handles this on a sphere of radius R &asymp; 6,371 km:</p>
<p><span class="formula">d = 2R &middot; asin( &radic;( sin&sup2;(&Delta;&phi;/2) + cos &phi;<sub>1</sub> &middot; cos &phi;<sub>2</sub> &middot; sin&sup2;(&Delta;&lambda;/2) ) )</span></p>
<p>where &phi; is latitude and &lambda; is longitude, in radians. Databases wrap the same maths: PostGIS's <code>ST_DWithin</code> and <code>ST_Distance</code> on the <code>geography</code> type work in metres on the spheroid.</p>`,
        },
        {
          type: "text",
          html: `<h3>How many candidates are false?</h3>
<p>If the cells around the query form a square that just encloses a circle of radius r, the square's area is 4r&sup2; and the circle's is &pi;r&sup2;. With evenly spread points, about &pi;/4 &asymp; <strong>79%</strong> of the candidates are real hits and 21% are corners to discard. Real covers are coarser (a few cells, not one perfect square), so ratios of 30 to 60% hits are normal. That is fine: computing a few hundred haversines takes microseconds. What matters is that the index did not hand you 400 km&sup2; of drivers.</p>`,
        },
        {
          type: "compare",
          title: "Two families of spatial index",
          items: [
            { title: "Spatial trees", tone: "info", html: "Custom index structures that understand two dimensions: <strong>quadtrees</strong>, <strong>k-d and BKD trees</strong>, <strong>R-trees</strong>. They index shapes as well as points and live in PostGIS, SQLite, Oracle Spatial and Lucene." },
            { title: "Encoded keys", tone: "ok", html: "Flatten a location into one sortable value or cell ID (<strong>geohash</strong>, <strong>S2</strong>, <strong>H3</strong>) so an ordinary B-tree, sorted set or key-value store can index it. Cheap writes; mostly points. Covered in the next chapter." },
          ],
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>Whatever index you name in a design, finish the sentence with "...and then I post-filter by exact distance and sort." It shows you know the index is an approximation, and it is the step people forget when they draw the query path.</p>`,
        },
      ],
    },
    {
      id: "quadtrees",
      title: "Quadtrees: cells that split where the data is dense",
      kicker: "Spatial trees",
      blocks: [
        {
          type: "text",
          html: `<p>A quadtree starts with the whole map as one square. When a square holds more points than a chosen <strong>leaf capacity</strong>, say 100, it splits into four equal quadrants (north-west, north-east, south-west, south-east) and its points move down into them. Any quadrant that overflows splits again. Points live only in the leaves.</p>
<p>The result adapts to density on its own. A downtown with thousands of drivers turns into a deep stack of tiny squares; farmland stays one large square near the root. Every leaf ends up holding at most 100 points regardless of how much area it covers.</p>`,
        },
        {
          type: "steps",
          title: "Answering \"everything within r of point q\"",
          items: [
            "Start at the root square.",
            "For each child square, test whether it intersects the circle of radius r around q. Skip any that don't.",
            "Recurse into the children that do intersect, until you reach leaves.",
            "Collect the points in every intersecting leaf. This includes leaves on the far side of a boundary, so a driver just across a cell edge is not missed.",
            "Compute exact distance for each candidate, drop those beyond r, sort and return.",
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
          type: "text",
          html: `<h3>Where quadtrees struggle</h3>
<p>Splits always fall at the geometric midpoint, not where the data is. A cluster sitting near a split line drags the tree many levels deep before its points separate, while a rural query finishes after two levels. Query cost therefore depends on <em>where</em> you search. With a leaf capacity of 100, a million evenly spread points need about log<sub>4</sub>(10,000) &asymp; 7 levels, but a dense city core can need twice that.</p>
<p>The bigger problem is storage. A quadtree is a pointer structure: each step from parent to child is a jump to an arbitrary memory address. In RAM that costs nanoseconds. On disk each hop can be a random page read, and a tree that is deep in exactly the places people search is a poor fit for a database page cache.</p>`,
        },
        {
          type: "lab",
          id: "quadtree",
          caption: "Drop points and watch squares split once they exceed the leaf capacity. Run a radius query and count how few squares it descends into compared with the total.",
        },
        {
          type: "realworld",
          items: [
            { org: "Game engines", title: "Collision detection", html: "Physics and rendering code rebuilds quadtrees (or 3D octrees) in memory every frame or so, so each object only tests collisions against objects in nearby cells instead of every other object." },
            { org: "Bing Maps", title: "Quadkeys", html: "Map tiles are addressed with quadkeys: each digit (0 to 3) picks one quadrant of the parent tile, so a tile's key is its path down a quadtree and shares a prefix with its parent." },
          ],
        },
      ],
    },
    {
      id: "kd-and-bkd",
      title: "k-d trees and BKD trees: split the points, not the area",
      kicker: "Spatial trees",
      blocks: [
        {
          type: "text",
          html: `<p>A <strong>k-d tree</strong> fixes the quadtree's lopsided depth by splitting at the <em>median point</em> instead of the midpoint, and by splitting in two rather than four. The root divides all points by x at the median x value; each child divides its half by y at its own median y; the next level goes back to x, and so on.</p>
<p>Because every split halves the number of points, the depth is about log<sub>2</sub>(n) no matter how clustered the data is: 20 levels for a million points, 30 for a billion. That predictability also makes k-d trees good at <strong>nearest-neighbour</strong> search. You descend to the leaf containing the query, then back up and only explore the other side of a split if the split line is closer than the best match found so far.</p>`,
        },
        {
          type: "text",
          html: `<p>The weakness is the same as the quadtree's: a k-d tree is a chain of pointers, and the medians are computed from the data you have. Inserting many new points unbalances it, and the usual fix is to rebuild. That makes a classic k-d tree great for in-memory nearest-neighbour search over a fixed dataset and awkward as a database index.</p>
<h3>The BKD tree: a k-d tree packed into disk blocks</h3>
<p>A <strong>block k-d tree</strong> (BKD) keeps the median-splitting idea but stops splitting once a cell holds a page's worth of points, often around a thousand. Leaves are dense, contiguous blocks; the inner nodes are small enough to keep in memory. A query walks the in-memory inner tree, then reads only the few leaf blocks whose bounding boxes touch the search area.</p>
<p>It is built once, from a batch, and never modified. That suits engines whose storage is already immutable, which is exactly the Lucene model.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Apache Lucene", title: "Point fields", html: "Since Lucene 6, numeric and geo point fields are indexed with BKD trees, one per immutable segment. Range and bounding-box queries read only the leaf blocks that intersect the query." },
            { org: "Elasticsearch / OpenSearch", title: "geo_point", html: "Both inherit Lucene's BKD trees for <code>geo_point</code> fields, which is why a <code>geo_distance</code> filter combines cheaply with full-text and attribute filters in one query." },
          ],
        },
        {
          type: "tradeoffs",
          title: "BKD trees for geo search",
          pros: [
            "Balanced depth regardless of clustering, with page-sized leaves that suit disk",
            "Compact and very fast for reads",
            "Composes with text and attribute filters in search engines",
          ],
          cons: [
            "Write-once: new points go into new segments, which are merged later",
            "Updates only become searchable after a refresh, typically about a second in Elasticsearch",
            "A driver moving every 4 seconds becomes a delete plus an insert each time, creating constant merge work",
          ],
        },
        {
          type: "quiz",
          q: "Why does a k-d tree have predictable depth when a quadtree doesn't?",
          options: [
            "It splits four ways instead of two",
            "It splits at the median point, so each level halves the number of points regardless of where they cluster",
            "It only stores points in its inner nodes",
            "It uses a hash of the coordinates to choose a child",
          ],
          answer: 1,
          explain: "Median splits divide the points, not the area, so depth is about log2(n). Quadtrees split at the geometric midpoint, so a tight cluster can force many levels before its points separate.",
        },
      ],
    },
    {
      id: "r-trees",
      title: "R-trees: bounding rectangles for points and shapes",
      kicker: "Spatial trees",
      blocks: [
        {
          type: "problem",
          html: `<p>Points are the easy case. "Which delivery zone contains this address?", "Does this new road cross a flood plain?" and "Which geofences does this phone sit inside?" all involve <em>shapes</em> with area and extent. A quadtree or k-d tree splits space through the middle of such shapes; you need an index whose entries can be shapes themselves.</p>`,
        },
        {
          type: "text",
          html: `<p>An <strong>R-tree</strong>, introduced by Antonin Guttman in 1984, wraps every object in its <strong>minimum bounding rectangle</strong> (MBR): the smallest axis-aligned box that contains it. Nearby MBRs are grouped under a parent rectangle that encloses all of them, those parents are grouped again, and so on up to a root. Like a B-tree, every node is one disk page holding many entries, and the tree stays balanced: all leaves are at the same depth.</p>
<p>A query walks down every branch whose rectangle intersects the search area. At the leaves it tests the cheap rectangle first and runs the expensive exact geometry test (point-in-polygon, line intersection) only on the survivors. The same candidates-then-filter pattern again, now with shapes.</p>`,
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
          type: "text",
          html: `<h3>Overlap is the performance knob</h3>
<p>Unlike quadtree cells, sibling rectangles in an R-tree may overlap. A query that lands in an overlap must descend into every overlapping branch, so heavy overlap turns a single root-to-leaf walk into several. How the tree chooses where to insert a new object and how it splits a full node decide how much overlap builds up.</p>
<p>The <strong>R*-tree</strong> (Beckmann, Kriegel, Schneider and Seeger, 1990) improved those choices: it considers overlap and rectangle perimeter when inserting and splitting, and occasionally removes and reinserts entries to tidy the tree. Most production R-trees are R*-tree variants or close relatives. For static data, <em>bulk loading</em> (sorting the objects first and packing pages full) gives tighter rectangles than inserting one at a time.</p>`,
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
        {
          type: "realworld",
          items: [
            { org: "PostGIS", title: "GiST indexes", html: "<code>CREATE INDEX ... USING GIST (geom)</code> builds an R-tree-style index on top of PostgreSQL's Generalized Search Tree framework. <code>ST_DWithin</code> and <code>ST_Intersects</code> use it to find candidates before running exact geometry." },
            { org: "SQLite", title: "R*Tree module", html: "A built-in virtual table type that stores bounding boxes in an R*-tree. Applications store the exact geometry elsewhere and use the module for the candidate step." },
          ],
        },
      ],
    },
    {
      id: "interview",
      title: "Choosing a spatial index in a design interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "text",
          html: `<p>Proximity search shows up in ride hailing, food delivery, "restaurants near me", dating apps and store locators. The interviewer is usually checking three things: that you know a plain B-tree will not do, that you can match the index to the <strong>shape of the data and the write rate</strong>, and that you remember the exact filter at the end.</p>`,
        },
        {
          type: "list",
          title: "Pick by data shape",
          items: [
            "Polygons, routes, zones, containment or intersection: a spatial tree, usually PostGIS with a GiST index.",
            "Mostly static places plus text and attribute filters (Yelp-style search): Elasticsearch or OpenSearch with a <code>geo_point</code> field, backed by BKD trees.",
            "Points that move every few seconds (drivers, couriers, devices): encoded cells such as geohash, S2 or H3 on an ordinary index or in Redis, covered next chapter.",
            "A small, static dataset that fits in application memory: a quadtree or k-d tree is perfectly fine.",
          ],
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>A strong answer to "how would you find nearby X?" covers four points:</p>
<ol>
<li>Why not a B-tree on latitude or on <code>(lat, lng)</code>: one-dimensional order returns a band, not a neighbourhood.</li>
<li>The data shape and write rate decide the family: spatial trees for shapes and fairly static data, encoded cells for fast-moving points.</li>
<li>The index returns candidates from cells or rectangles that cover the circle, including neighbouring cells so boundaries don't hide results.</li>
<li>Exact haversine distance (or <code>ST_DWithin</code>) removes false candidates, then sort and limit.</li>
</ol>
<p>If time allows, explain why Elasticsearch is a good fit for restaurants and a poor fit for live driver positions: segments are write-once and changes appear only after a refresh.</p>`,
        },
        {
          type: "code",
          lang: "sql",
          title: "A PostGIS radius query, nearest first",
          code: `CREATE INDEX restaurants_geom ON restaurants USING GIST (geom);

SELECT id, name,
       ST_Distance(geom, ST_MakePoint(-73.9857, 40.7484)::geography) AS meters
FROM restaurants
WHERE ST_DWithin(geom, ST_MakePoint(-73.9857, 40.7484)::geography, 2000)
ORDER BY meters
LIMIT 20;`,
          caption: "ST_DWithin uses the GiST index to fetch candidates; ST_Distance and the ORDER BY are the exact filter and sort. Note ST_MakePoint takes longitude first.",
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
    "A B-tree sorts on one dimension, so an index on latitude, or on <code>(lat, lng)</code>, turns a radius query into a band across the whole map.",
    "Every spatial index only produces <strong>candidates</strong> from cells or rectangles that cover the search area; exact great-circle distance or geometry picks the real answers.",
    "Quadtrees split at midpoints and adapt to density, but depth varies with clustering and pointer chasing hurts on disk; they shine in memory.",
    "k-d trees split at medians for depth of about log<sub>2</sub> n; BKD trees pack them into disk blocks and power Lucene and Elasticsearch geo search, at the cost of write-once segments.",
    "R-trees index bounding rectangles of any shape, stay balanced on disk, and are the default for polygons and containment (PostGIS, SQLite); overlap between rectangles is what slows them.",
    "Choose by data shape and write rate: spatial trees for shapes and fairly static data, encoded cells for points that move constantly.",
  ],
  furtherReading: [
    { title: "R-trees: A Dynamic Index Structure for Spatial Searching (Guttman, SIGMOD 1984)", note: "The original R-tree paper: bounding rectangles, insertion and node splitting." },
    { title: "The R*-tree: An Efficient and Robust Access Method for Points and Rectangles (Beckmann et al., SIGMOD 1990)", note: "The insertion and split heuristics most modern R-trees use." },
    { title: "Bkd-Tree: A Dynamic Scalable kd-Tree (Procopiuc et al., 2003)", note: "The block k-d tree design that Lucene's point indexing builds on." },
    { title: "PostGIS manual", url: "https://postgis.net/docs/", note: "See the chapter on spatial indexes for how GiST indexes are built and which functions use them." },
  ],
};
