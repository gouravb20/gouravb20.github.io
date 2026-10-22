// Deep dives: Uber (ride-sharing). Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP["uber"] = {
  hook: `<p>The four-step design on the Solution tab works for a small town. Then the interviewer turns up the scale: ten million phones report a position every five seconds, a concert lets out and a hundred thousand people tap "Request" within minutes, a matching server restarts halfway through an offer, and a driver leaves the phone on the passenger seat and walks off for a coffee.</p><p>Each section below takes one of those pressures: what breaks, a progression of answers from weak to strong, and what the strong answer costs.</p>`,
  sections: [
    // ------------------------------------------------------------------
    {
      id: `location-updates`,
      title: `How do we absorb 2 million location updates a second and still find nearby drivers fast?`,
      kicker: `Writes and proximity search`,
      blocks: [
        {
          type: `problem`,
          html: `<p>The baseline writes every update into a Locations table and asks it for "drivers near here". That fails twice. <strong>Writes:</strong> 10M drivers every 5 s is 2M row updates a second, about a hundred times what one relational node sustains, for values that are stale five seconds later. <strong>Queries:</strong> a B-tree on latitude can only narrow one dimension. A 2 km search returns a 4 km-tall band stretching across the whole metro area, which must then be filtered by longitude row by row. Two indexes don't help much either: the database picks one and filters with the other.</p>`,
        },
        {
          type: `compare`,
          title: `From scanning to an in-memory geo index`,
          items: [
            { title: `Direct writes, lat/long scan`, tone: `bad`, html: `<p>One row update per ping and a range query on two plain columns. Simple, and it collapses under the write rate long before the queries become the problem.</p>` },
            { title: `Batched writes + a geospatial index`, tone: `warn`, html: `<p>The location service buffers a second or two of updates and writes them in bulk; Postgres with PostGIS (a GiST index) or a quadtree answers radius queries efficiently. Fewer commits and fast searches, but still one row version per driver per batch, and positions lag by the batch interval.</p>` },
            { title: `In-memory geo index (Redis GEO)`, tone: `ok`, html: `<p>Each update is a <code>GEOADD</code> that overwrites the driver's entry in a sorted set; searches use <code>GEOSEARCH</code>. Hundreds of thousands of operations per second per node, always the latest position, and keys sharded by region. The cost is weaker durability, which this data doesn't need.</p>` },
          ],
        },
        {
          type: `text`,
          html: `<h3>How a geohash makes 2D searchable</h3>
<p>A geohash repeatedly halves the world, alternating between longitude and latitude, and writes down one bit per halving. Interleaving the bits gives one number (Redis uses 52 bits) whose prefix identifies a cell; a longer shared prefix usually means closer points. A sorted set ordered by that number keeps each cell's drivers next to each other, so a radius search becomes a handful of range scans over the cells that cover the circle. Points on opposite sides of a cell edge can have very different prefixes, which is why the search always includes the neighbouring cells.</p>`,
        },
        {
          type: `table`,
          title: `Geohash cell sizes (approximate)`,
          headers: [`Length (characters)`, `Cell size`, `Useful for`],
          rows: [
            [`4`, `~39 km × 19.5 km`, `Choosing a region or shard`],
            [`5`, `~4.9 km × 4.9 km`, `Neighbourhood-level grouping`],
            [`6`, `~1.2 km × 0.6 km`, `A typical pickup search radius`],
            [`7`, `~153 m × 153 m`, `Street-level precision`],
          ],
        },
        {
          type: `diagram`,
          title: `GEOSEARCH within 2 km of a rider`,
          caption: `The search covers only the cells that overlap the circle, then filters by exact distance. Green drivers are returned; grey ones are outside the radius; the dashed red one stopped reporting and is removed by the sweeper.`,
          svg: `<svg viewBox="0 0 640 300" role="img" aria-label="Map divided into geohash cells with a 2 kilometre search circle around a rider; drivers inside the circle are returned, drivers outside are not, a stale driver is removed; side panel lists GEOADD, GEOSEARCH and the last-seen sweeper">
<text x="190" y="20" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">geohash cells</text>
<rect x="30" y="30" width="320" height="240" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<line x1="110" y1="30" x2="110" y2="270" stroke-width="1" stroke-dasharray="4 4" style="stroke: var(--dg-line)"/>
<line x1="190" y1="30" x2="190" y2="270" stroke-width="1" stroke-dasharray="4 4" style="stroke: var(--dg-line)"/>
<line x1="270" y1="30" x2="270" y2="270" stroke-width="1" stroke-dasharray="4 4" style="stroke: var(--dg-line)"/>
<line x1="30" y1="110" x2="350" y2="110" stroke-width="1" stroke-dasharray="4 4" style="stroke: var(--dg-line)"/>
<line x1="30" y1="190" x2="350" y2="190" stroke-width="1" stroke-dasharray="4 4" style="stroke: var(--dg-line)"/>
<circle cx="205" cy="150" r="78" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5" stroke-dasharray="6 4"/>
<line x1="205" y1="150" x2="283" y2="150" stroke-width="1" style="stroke: var(--dg-2)"/>
<text x="262" y="144" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">2 km</text>
<circle cx="160" cy="110" r="6" style="fill: var(--dg-ok)"/>
<circle cx="250" cy="120" r="6" style="fill: var(--dg-ok)"/>
<circle cx="180" cy="200" r="6" style="fill: var(--dg-ok)"/>
<circle cx="245" cy="195" r="6" style="fill: var(--dg-ok)"/>
<circle cx="140" cy="165" r="6" style="fill: var(--dg-ok)"/>
<circle cx="60" cy="60" r="6" style="fill: var(--dg-6)"/>
<circle cx="320" cy="60" r="6" style="fill: var(--dg-6)"/>
<circle cx="60" cy="240" r="6" style="fill: var(--dg-6)"/>
<circle cx="310" cy="240" r="6" style="fill: var(--dg-6)"/>
<circle cx="300" cy="170" r="6" style="fill: var(--dg-6)"/>
<circle cx="80" cy="140" r="6" style="fill: var(--dg-6)"/>
<circle cx="222" cy="98" r="6" style="fill: none; stroke: var(--dg-bad)" stroke-width="1.5" stroke-dasharray="3 2"/>
<text x="232" y="94" font-size="11" style="fill: var(--dg-bad)">stale</text>
<circle cx="205" cy="150" r="8" style="fill: var(--dg-3)"/>
<text x="205" y="176" text-anchor="middle" font-size="12" font-weight="700">rider</text>
<circle cx="40" cy="286" r="5" style="fill: var(--dg-ok)"/>
<text x="50" y="290" font-size="11">returned</text>
<circle cx="130" cy="286" r="5" style="fill: var(--dg-6)"/>
<text x="140" y="290" font-size="11">outside radius</text>
<circle cx="250" cy="286" r="5" style="fill: none; stroke: var(--dg-bad)" stroke-width="1.5" stroke-dasharray="3 2"/>
<text x="260" y="290" font-size="11">stale, removed</text>
<rect x="380" y="30" width="250" height="66" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<text x="395" y="54" font-size="12" font-weight="700">GEOADD drivers:sf lng lat d42</text>
<text x="395" y="74" font-size="11" style="fill: var(--dg-muted)">overwrites d42; score is a geohash</text>
<rect x="380" y="117" width="250" height="66" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<text x="395" y="141" font-size="12" font-weight="700">GEOSEARCH ... BYRADIUS 2 km</text>
<text x="395" y="161" font-size="11" style="fill: var(--dg-muted)">nearby cells only, sorted by distance</text>
<rect x="380" y="204" width="250" height="66" rx="8" style="fill: var(--dg-6-soft); stroke: var(--dg-6)" stroke-width="1.5"/>
<text x="395" y="228" font-size="12" font-weight="700">ZADD drivers:sf:seen ts d42</text>
<text x="395" y="248" font-size="11" style="fill: var(--dg-muted)">sweeper drops ids silent for 30 s</text>
</svg>`,
        },
        {
          type: `code`,
          title: `The location path in Redis commands`,
          lang: `text`,
          code: `# every location update (location service); longitude comes first
GEOADD    drivers:sf:available  -122.4170 37.7790  d42
ZADD      drivers:sf:seen       1792600000  d42          # server time, seconds

# every ride request (matching)
GEOSEARCH drivers:sf:available FROMLONLAT -122.4193 37.7793
          BYRADIUS 2 km ASC COUNT 20 WITHDIST

# every few seconds (sweeper): drop drivers silent for 30 s
cutoff = now - 30
stale  = ZRANGE drivers:sf:seen -inf cutoff BYSCORE
ZREM      drivers:sf:available  stale...
ZREM      drivers:sf:seen       stale...

# driver accepts a ride: no longer searchable
ZREM      drivers:sf:available  d42`,
        },
        {
          type: `keypoints`,
          title: `Making the in-memory index work`,
          items: [
            `<strong>One key per region:</strong> a Redis key lives on one node, so a single global key would put all 2M writes a second on one machine. Keys like <code>drivers:sf:available</code> spread regions across a cluster.`,
            `<strong>Only searchable drivers in the searchable key:</strong> remove a driver when they accept a ride and add them back when they finish. Positions of drivers on a trip (for the rider's map) go to a separate key.`,
            `<strong>Overwrite, don't append:</strong> <code>GEOADD</code> replaces the member's score, so the set always holds one latest position per driver and stays at ~1 GB in total.`,
            `<strong>Clean up silent phones:</strong> a dead battery never sends "offline". The last-seen sorted set lets a sweeper remove anyone not heard from in ~30 s.`,
            `<strong>Durability is optional:</strong> AOF persistence and replicas shrink the gap after a failure, but even an empty node refills within one update interval because every active driver reports again.`,
          ],
        },
        {
          type: `table`,
          title: `Comparing the options`,
          headers: [`Approach`, `Write cost`, `Search cost`, `Freshness`],
          rows: [
            [`Postgres, plain lat/long columns`, `One row version per update (~2M/s)`, `Scan a strip of the map`, `Current`],
            [`Batched writes + PostGIS or quadtree`, `Fewer commits, same row versions`, `Index lookup`, `Behind by the batch interval`],
            [`Redis GEO, keyed by region`, `In-memory overwrite`, `Nearby cells only`, `Current`],
          ],
        },
        {
          type: `callout`,
          tone: `insight`,
          html: `<p><strong>Positions are soft state.</strong> They expire on their own every few seconds, so treat the index like a cache that the driver fleet keeps refilling. Asking "what if Redis loses it?" has a reassuring answer: within about five seconds, nothing is lost that matters.</p>`,
        },
        {
          type: `realworld`,
          items: [
            { org: `Uber`, title: `H3 hexagonal grid`, html: `Uber built and open-sourced H3, a hierarchical grid of hexagons covering the Earth. Hexagons have neighbours at roughly equal distances, which makes them convenient for grouping supply and demand by area, for example in pricing and analysis.` },
            { org: `Redis`, title: `GEO commands`, html: `Redis has offered geospatial commands since version 3.2; <code>GEOSEARCH</code>, added in 6.2, replaced the older <code>GEORADIUS</code> family and supports both radius and box searches.` },
          ],
        },
        {
          type: `quiz`,
          q: `The Redis primary holding San Francisco's geo index fails, and the replica it promotes is about a second behind. What is the impact?`,
          options: [
            `Every driver must log in again before they can be matched`,
            `Minor: a few positions are a second or two old, and every active driver overwrites theirs within one update interval`,
            `All rides in progress are lost`,
            `Matching must switch to Postgres permanently`,
          ],
          answer: 1,
          explain: `Positions are replaced every few seconds, so the index heals itself. Rides and assignments live in the database, not in the geo index, so nothing durable is lost.`,
        },
      ],
    },
    // ------------------------------------------------------------------
    {
      id: `adaptive-updates`,
      title: `Can drivers send fewer updates without hurting accuracy?`,
      kicker: `Adaptive location updates`,
      blocks: [
        {
          type: `problem`,
          html: `<p>A fixed five-second schedule treats every driver alike. A driver parked outside a station sends the same coordinates twelve times a minute; a driver weaving through side streets towards a pickup sends too few. The fixed schedule costs 2M requests a second on the servers, and battery and mobile data on every phone, while still being too coarse exactly where precision matters.</p>`,
        },
        {
          type: `idea`,
          html: `<p>Let the <strong>phone decide when an update is worth sending</strong>. It already knows its speed, heading and status, and the server can tell it when precision matters (an offer is pending, a pickup is close). Send when something changed meaningfully, and send a cheap heartbeat otherwise.</p>`,
        },
        {
          type: `compare`,
          title: `Ways to reduce update volume`,
          items: [
            { title: `Fixed interval for everyone`, tone: `bad`, html: `<p>Every driver every 5 s, regardless of whether they moved. Wasteful when parked, too coarse when it matters.</p>` },
            { title: `Server-side throttling`, tone: `warn`, html: `<p>The location service drops updates that arrive too soon after the last one. Protects the index, but the phones still spend battery and data, and the gateway still pays for every request.</p>` },
            { title: `Adaptive intervals on the client`, tone: `ok`, html: `<p>The app sends based on movement, heading, status and proximity to a pending request, with intervals the server can tune per region. Less traffic, and better accuracy where it counts.</p>` },
          ],
        },
        {
          type: `table`,
          title: `An example policy`,
          headers: [`Driver situation`, `Send an update`, `Why`],
          rows: [
            [`Parked, available`, `Heartbeat every ~30 s`, `Position isn't changing; the heartbeat keeps the driver out of the stale sweep`],
            [`Moving at a steady speed`, `Every ~10 s, or after ~150 m`, `At 36 km/h (10 m/s) a car covers 100 m in 10 s: precise enough to rank by distance`],
            [`Sharp turn (heading changes by more than ~30°)`, `Immediately`, `Turns are where extrapolating from the last point goes wrong`],
            [`Offer pending, or heading to a pickup`, `Every 2-3 s`, `The rider is watching the car and the ETA depends on it`],
            [`On a trip`, `Every 5-10 s; route points batched`, `The latest point serves the rider's map; the full route is only needed for the receipt`],
            [`Going off duty`, `One final "offline" message, then stop`, `Removes the driver from the index at once`],
          ],
        },
        {
          type: `steps`,
          title: `What it saves, for 10M active drivers`,
          items: [
            `40% parked, heartbeat every 30 s: <span class="formula">4,000,000 ÷ 30 ≈ 133K/s</span>.`,
            `45% moving, every 10 s: <span class="formula">4,500,000 ÷ 10 = 450K/s</span>.`,
            `15% near a pending request or heading to a pickup, every 3 s: <span class="formula">1,500,000 ÷ 3 = 500K/s</span>.`,
            `Total <span class="formula">133K + 450K + 500K ≈ 1.08M/s</span>, against 2M/s for a flat 5 s: <strong>about 46% fewer updates</strong>, with the most precise data exactly where matching and riders need it.`,
          ],
        },
        {
          type: `code`,
          title: `The decision on the phone (pseudo-code)`,
          lang: `text`,
          code: `every second on the driver app:
  p = gps.read()
  moved  = distance(p, lastSent)
  turned = angleBetween(p.heading, lastSent.heading)
  interval = 30 s  if parked
             3 s   if an offer is pending or heading to a pickup
             10 s  otherwise                      (server can override per region)
  if moved > 150 m or turned > 30 degrees or now - lastSentAt >= interval:
    send(p)
    lastSent = p; lastSentAt = now`,
        },
        {
          type: `keypoints`,
          title: `Details that make it work`,
          items: [
            `<strong>Remote configuration:</strong> the server sends intervals and thresholds to apps, so a busy area can be made more precise without an app release.`,
            `<strong>Separate the two uses of location:</strong> the latest point (for matching and the rider's map) goes out promptly; the full route (for distance-based fares and receipts) can be batched every 30 s or uploaded at the end of the trip.`,
            `<strong>Sanity checks on the server:</strong> reject updates that imply impossible speeds; spoofed GPS is a real fraud vector.`,
            `<strong>Smooth on display:</strong> the rider app can interpolate between points using speed and heading, so fewer updates still look smooth.`,
          ],
        },
        {
          type: `callout`,
          tone: `tip`,
          html: `<p><strong>The client is part of the design.</strong> Many candidates draw the app as a box and move on. Here a few lines of client logic remove nearly half the server load; in other problems the client chunks uploads, caches, or backs off on retries. Say so out loud.</p>`,
        },
        {
          type: `quiz`,
          q: `Which signal should make the driver app send an update immediately, even if its interval has not passed?`,
          options: [
            `The phone's battery dropped by 1%`,
            `The car turned sharply, so extrapolating from the last point would be wrong`,
            `The driver has been parked for a minute`,
            `The app was opened`,
          ],
          answer: 1,
          explain: `A sharp change of heading is where the server's picture goes wrong fastest. A parked driver needs only a heartbeat, and battery level changes the policy rather than triggering a send.`,
        },
      ],
    },
    // ------------------------------------------------------------------
    {
      id: `driver-locking`,
      title: `How do we make sure a driver gets only one offer at a time?`,
      kicker: `Consistency in matching`,
      blocks: [
        {
          type: `problem`,
          html: `<p>Two matching workers handle riders a block apart. Both run the same search, both see driver d42 as the closest, and both push an offer. The driver sees two offers, accepts one, and the other rider stares at "Finding your driver" for ten seconds until a timeout. Under a burst this is not rare: the same few nearby drivers top everyone's list. We need three things: <strong>each driver has at most one outstanding offer</strong>, <strong>each ride is offered to one driver at a time</strong>, and <strong>each ride ends with exactly one driver</strong>.</p>`,
        },
        {
          type: `callout`,
          tone: `insight`,
          title: `You have seen this before`,
          html: `<p>It is the ticketing reservation pattern with the roles swapped. A ticket system holds a seat for one buyer for ten minutes while they pay; here we hold a driver for one ride for ten seconds while they decide. In both, the hold must be exclusive, must expire on its own, and must be converted into a permanent record with a conditional write.</p>`,
        },
        {
          type: `compare`,
          title: `From local locks to a lease`,
          items: [
            { title: `In-process lock and timer`, tone: `bad`, html: `<p>Each matcher instance keeps "d42 is offered" in memory and starts a timer. Other instances can't see it, so two of them can lock the same driver; a crash loses the lock and the timer; more instances make it worse.</p>` },
            { title: `Database status flag with a timeout`, tone: `warn`, html: `<p>Set the driver's status to OFFERED with a conditional update, so only one matcher wins. Correct coordination, but if the lock is released by an in-memory timer, a crash leaves the driver stuck; a sweeper or an expiry column fixes that at the cost of more moving parts and database writes.</p>` },
            { title: `Distributed lock with a TTL`, tone: `ok`, html: `<p><code>SET lock:driver:d42 r1 NX PX 10000</code> in Redis. Only one matcher gets the lock; it expires by itself when the acceptance window ends, so crashes can't strand a driver. Fast, and naturally short-lived.</p>` },
          ],
        },
        {
          type: `code`,
          title: `The "good" option done carefully: an expiry column instead of a timer`,
          lang: `sql`,
          code: `UPDATE drivers
   SET status = 'OFFERED', offer_ride_id = :ride,
       offer_expires_at = now() + interval '10 seconds'
 WHERE id = :driver
   AND (status = 'AVAILABLE'
        OR (status = 'OFFERED' AND offer_expires_at < now()));
-- 1 row: the offer is ours.  0 rows: the driver is busy, try the next one.`,
        },
        {
          type: `text`,
          html: `<p>Checking the expiry inside the condition means an abandoned offer simply stops counting after ten seconds, without any timer or sweeper. It still costs a database write per offer on a hot table, which is why the in-memory lease is the usual recommendation; but it is a correct answer and worth knowing.</p>`,
        },
        {
          type: `code`,
          title: `The lease in Redis commands`,
          lang: `text`,
          code: `# reserve d42 for ride r1 for the 10-second acceptance window
SET lock:driver:d42 r1 NX PX 10000
    -> OK   the lock is ours: record the offer and push it
    -> nil  another ride holds d42: skip to the next candidate

# the driver answered: release only if the lock still belongs to r1
EVAL "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end" 1 lock:driver:d42 r1

# no answer: do nothing, the key expires after 10 s`,
        },
        {
          type: `diagram`,
          title: `One driver lock over time`,
          caption: `Matcher A takes the lock for ride r1 at 0 s. Matcher B tries at 3 s, is refused and moves to another driver. The driver never answers, so the key expires at 10 s, and B's next attempt at 11 s succeeds for ride r7.`,
          svg: `<svg viewBox="0 0 640 250" role="img" aria-label="Timeline of a Redis lock on driver d42: held by ride r1 from 0 to 10 seconds, a second matcher is refused at 3 seconds, the lock expires at 10 seconds without a reply, and the second matcher acquires it for ride r7 at 11 seconds">
<text x="10" y="58" font-size="12" font-weight="700">lock</text>
<text x="10" y="109" font-size="12" font-weight="700">Matcher A</text>
<text x="10" y="159" font-size="12" font-weight="700">Matcher B</text>
<rect x="80" y="38" width="300" height="30" rx="6" style="fill: var(--dg-5-soft); stroke: var(--dg-5)" stroke-width="1.5"/>
<text x="230" y="58" text-anchor="middle" font-size="12">driver:d42 = r1 (PX 10000)</text>
<text x="395" y="58" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">free</text>
<rect x="410" y="38" width="210" height="30" rx="6" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="1.5"/>
<text x="515" y="58" text-anchor="middle" font-size="12">driver:d42 = r7</text>
<line x1="380" y1="30" x2="380" y2="170" stroke-width="1.5" stroke-dasharray="4 3" style="stroke: var(--dg-bad)"/>
<text x="380" y="22" text-anchor="middle" font-size="11" style="fill: var(--dg-bad)">TTL expires (no reply)</text>
<circle cx="80" cy="105" r="5" style="fill: var(--dg-5)"/>
<text x="90" y="109" font-size="12">SET NX → OK; offer r1 to d42</text>
<circle cx="170" cy="155" r="5" style="fill: var(--dg-6)"/>
<text x="180" y="159" font-size="12">SET NX → nil: skip d42</text>
<circle cx="410" cy="155" r="5" style="fill: var(--dg-4)"/>
<text x="420" y="159" font-size="12">SET NX → OK; offer r7</text>
<text x="80" y="196" font-size="11" style="fill: var(--dg-muted)">If d42 had answered, A would delete the key only if it still held r1.</text>
<line x1="80" y1="215" x2="620" y2="215" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<line x1="80" y1="210" x2="80" y2="220" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<line x1="230" y1="210" x2="230" y2="220" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<line x1="380" y1="210" x2="380" y2="220" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<line x1="530" y1="210" x2="530" y2="220" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<text x="80" y="236" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">0 s</text>
<text x="230" y="236" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">5 s</text>
<text x="380" y="236" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">10 s</text>
<text x="530" y="236" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">15 s</text>
</svg>`,
        },
        {
          type: `table`,
          title: `Which layer guarantees what`,
          headers: [`Layer`, `Guarantee`, `If it fails`],
          rows: [
            [`Matching workflow`, `A ride is offered to one driver at a time`, `Resumes from its last step (deep dive 5)`],
            [`Redis lock per driver`, `At most one outstanding offer per driver, in the normal case`, `A lost lock can mean a duplicate offer for a few seconds`],
            [`Conditional UPDATE on accept`, `A ride gets exactly one driver; only the offered driver can accept`, `Nothing gets past it: it is the source of truth`],
          ],
        },
        {
          type: `callout`,
          tone: `warning`,
          title: `A Redis lock is not a correctness proof`,
          html: `<p>Redis replicates asynchronously, so a lock written just before a failover can vanish, and a process paused for longer than the TTL can act after its lock expired. That is acceptable here because the lock only prevents <em>duplicate offers</em>. The final step is a conditional database write that checks the ride is still REQUESTED and offered to this driver, which plays the role of a fencing token: a stale actor's write simply matches zero rows.</p>`,
        },
        {
          type: `quiz`,
          q: `Driver d42 taps Accept for ride r1 at 10.5 s, after the lock expired and the workflow offered r1 to driver d77. What happens?`,
          options: [
            `d42 is assigned because they tapped first`,
            `The accept fails: the conditional UPDATE requires offered_driver_id = d42, which is no longer true, so d42 gets "offer expired"`,
            `Both d42 and d77 are assigned`,
            `The ride is cancelled`,
          ],
          answer: 1,
          explain: `When the workflow moved on, it recorded d77 as the offered driver. d42's update matches zero rows and the API returns 409 OFFER_EXPIRED; d77 can still accept.`,
        },
      ],
    },
    // ------------------------------------------------------------------
    {
      id: `peak-demand`,
      title: `How do we make sure no ride request is dropped at peak?`,
      kicker: `Queueing and backpressure`,
      blocks: [
        {
          type: `problem`,
          html: `<p>In the basic design the ride service calls the matching service directly. When a stadium empties, hundreds of requests a second land on the matchers for one area. Autoscaling reacts in minutes; requests time out in seconds, and riders retry, adding load. Worse, a matcher that crashes or is redeployed loses every request it was working on, and those riders wait for a match that will never come.</p>`,
        },
        {
          type: `compare`,
          title: `From fire-and-forget to durable`,
          items: [
            { title: `Direct call, no queue`, tone: `bad`, html: `<p>First come, first served with nothing in between. Surges turn into timeouts and retries, and a crashed matcher's in-flight requests vanish.</p>` },
            { title: `In-memory queue inside the matcher`, tone: `warn`, html: `<p>Smooths bursts on one instance, but a crash or deploy still loses everything queued, and instances can't share each other's backlog.</p>` },
            { title: `Durable queue partitioned by region`, tone: `ok`, html: `<p><code>POST /rides</code> writes the ride and publishes it to a replicated queue (Kafka, SQS). Matchers consume, commit only once the request is matched or safely handed off, and scale out on lag. A crash means redelivery, not loss.</p>` },
          ],
        },
        {
          type: `diagram`,
          title: `A ride-request topic partitioned by region`,
          caption: `Each region's requests go to its own partition, consumed by one matcher at a time. In the NYC partition two requests are matched and committed, one is in flight; if that matcher crashes, the in-flight request is delivered again to its replacement.`,
          svg: `<svg viewBox="0 0 640 270" role="img" aria-label="Ride service publishes to a ride-requests topic with four partitions keyed by region: San Francisco, New York, London and Mumbai; each partition is consumed by one matcher; offsets are committed after a match, matchers scale with lag, and a crash leads to redelivery">
<defs><marker id="ub-arrow-queue" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="10" y="105" width="100" height="56" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="1.5"/>
<text x="60" y="128" text-anchor="middle" font-size="13" font-weight="700">Ride</text>
<text x="60" y="145" text-anchor="middle" font-size="13" font-weight="700">service</text>
<text x="240" y="22" text-anchor="middle" font-size="12" font-weight="700">ride-requests (key = region)</text>
<rect x="140" y="30" width="200" height="200" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<rect x="150" y="42" width="180" height="36" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-1)" stroke-width="1"/>
<text x="160" y="65" font-size="12">p0 SF</text>
<rect x="240" y="51" width="16" height="18" rx="2" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1"/>
<rect x="262" y="51" width="16" height="18" rx="2" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1"/>
<rect x="284" y="51" width="16" height="18" rx="2" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1"/>
<rect x="306" y="51" width="16" height="18" rx="2" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1"/>
<rect x="150" y="88" width="180" height="36" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-1)" stroke-width="1"/>
<text x="160" y="111" font-size="12">p1 NYC</text>
<rect x="240" y="97" width="16" height="18" rx="2" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="1"/>
<rect x="262" y="97" width="16" height="18" rx="2" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="1"/>
<rect x="284" y="97" width="16" height="18" rx="2" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="1.5"/>
<rect x="306" y="97" width="16" height="18" rx="2" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1"/>
<rect x="150" y="134" width="180" height="36" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-1)" stroke-width="1"/>
<text x="160" y="157" font-size="12">p2 London</text>
<rect x="240" y="143" width="16" height="18" rx="2" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1"/>
<rect x="262" y="143" width="16" height="18" rx="2" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1"/>
<rect x="284" y="143" width="16" height="18" rx="2" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1"/>
<rect x="306" y="143" width="16" height="18" rx="2" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1"/>
<rect x="150" y="180" width="180" height="36" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-1)" stroke-width="1"/>
<text x="160" y="203" font-size="12">p3 Mumbai</text>
<rect x="240" y="189" width="16" height="18" rx="2" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1"/>
<rect x="262" y="189" width="16" height="18" rx="2" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1"/>
<rect x="284" y="189" width="16" height="18" rx="2" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1"/>
<rect x="306" y="189" width="16" height="18" rx="2" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1"/>
<rect x="370" y="42" width="120" height="36" rx="6" style="fill: var(--dg-5-soft); stroke: var(--dg-5)" stroke-width="1.5"/>
<text x="430" y="65" text-anchor="middle" font-size="12">matcher 1</text>
<rect x="370" y="88" width="120" height="36" rx="6" style="fill: var(--dg-5-soft); stroke: var(--dg-5)" stroke-width="1.5"/>
<text x="430" y="111" text-anchor="middle" font-size="12">matcher 2</text>
<rect x="370" y="134" width="120" height="36" rx="6" style="fill: var(--dg-5-soft); stroke: var(--dg-5)" stroke-width="1.5"/>
<text x="430" y="157" text-anchor="middle" font-size="12">matcher 3</text>
<rect x="370" y="180" width="120" height="36" rx="6" style="fill: var(--dg-5-soft); stroke: var(--dg-5)" stroke-width="1.5"/>
<text x="430" y="203" text-anchor="middle" font-size="12">matcher 4</text>
<line x1="110" y1="133" x2="138" y2="133" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ub-arrow-queue)"/>
<line x1="330" y1="60" x2="368" y2="60" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ub-arrow-queue)"/>
<line x1="330" y1="106" x2="368" y2="106" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ub-arrow-queue)"/>
<line x1="330" y1="152" x2="368" y2="152" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ub-arrow-queue)"/>
<line x1="330" y1="198" x2="368" y2="198" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ub-arrow-queue)"/>
<rect x="512" y="42" width="120" height="174" rx="8" style="fill: none; stroke: var(--dg-line)" stroke-width="1" stroke-dasharray="4 4"/>
<text x="572" y="70" text-anchor="middle" font-size="12" font-weight="700">commit offset</text>
<text x="572" y="86" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">after the match</text>
<text x="572" y="130" text-anchor="middle" font-size="12" font-weight="700">add matchers</text>
<text x="572" y="146" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">as lag grows</text>
<text x="572" y="190" text-anchor="middle" font-size="12" font-weight="700">crash: message</text>
<text x="572" y="206" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">is redelivered</text>
<rect x="150" y="243" width="12" height="12" rx="2" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="1"/>
<text x="168" y="253" font-size="11">matched, committed</text>
<rect x="300" y="243" width="12" height="12" rx="2" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="1.5"/>
<text x="318" y="253" font-size="11">in flight</text>
<rect x="390" y="243" width="12" height="12" rx="2" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1"/>
<text x="408" y="253" font-size="11">waiting</text>
</svg>`,
        },
        {
          type: `keypoints`,
          title: `How the queue keeps requests safe`,
          items: [
            `<strong>Accept fast, match later:</strong> <code>POST /rides</code> returns as soon as the ride row exists and the message is published, so the rider sees "Finding your driver" immediately even during a burst.`,
            `<strong>Commit after hand-off:</strong> a consumer commits its Kafka offset (or deletes its SQS message) only once the request is matched or owned by a durable workflow. A crash before that means the request is delivered again.`,
            `<strong>At-least-once means idempotent:</strong> a redelivered request must check the ride's status first and must not start a second search for the same ride.`,
            `<strong>Partition by region, and split hot regions:</strong> keying by region keeps requests near their matchers; a city that can flood one partition is keyed by region plus a coarse cell instead, spreading it over several partitions.`,
            `<strong>Scale on lag, within the partition count:</strong> a Kafka consumer group can't have more active consumers than partitions, so create enough partitions in advance for the peak you expect.`,
          ],
        },
        {
          type: `text`,
          html: `<h3>Head-of-line blocking</h3>
<p>Kafka commits offsets by position. If a consumer works through a partition one request at a time, a request that can't be matched for a full minute (a rural pickup with no drivers) holds back every request behind it, and the committed offset can't move past it. Three fixes, which combine well:</p>
<ul>
<li><strong>Work on many requests per partition at once</strong> and commit up to the oldest one still in progress.</li>
<li><strong>Hand each request to a durable workflow</strong> (deep dive 5) and commit as soon as the workflow has started. The workflow is now the durable owner, so the queue only has to survive the hand-off.</li>
<li><strong>Priority lanes:</strong> a separate topic for requests that have already waited a long time, or for accessibility rides, so they are not stuck behind a fresh flood.</li>
</ul>`,
        },
        {
          type: `table`,
          title: `Kafka or SQS?`,
          headers: [`Property`, `Kafka`, `SQS`],
          rows: [
            [`Acknowledgement`, `Offset per partition (by position)`, `Per message (delete after processing)`],
            [`Crash recovery`, `Uncommitted messages are re-read`, `Message reappears after its visibility timeout`],
            [`Head-of-line blocking`, `Possible within a partition`, `No ordering, so no blocking`],
            [`Parallelism`, `Capped by the partition count`, `Any number of consumers`],
            [`Replay`, `Yes, while retained`, `No`],
          ],
        },
        {
          type: `callout`,
          tone: `interview`,
          html: `<p>Say exactly what happens on a crash: "The request is still in the queue because we only commit after the workflow has taken ownership; another consumer picks it up, sees the workflow already exists for that ride id, and carries on." That one sentence answers durability, idempotency and duplicates together.</p>`,
        },
        {
          type: `quiz`,
          q: `A matcher crashes after pushing an offer to driver d42 but before committing the queue offset. What should its replacement do with the redelivered request?`,
          options: [
            `Start a fresh search and offer the ride to someone else immediately`,
            `Check the ride's state first: it is still REQUESTED with an offer to d42 outstanding, so continue that offer (or let it time out) rather than start a duplicate search`,
            `Drop the message, since it was already processed`,
            `Cancel the ride and ask the rider to try again`,
          ],
          answer: 1,
          explain: `Delivery is at least once, so handlers must be idempotent. Reading the ride's current state (or starting the workflow with the ride id as its id, which refuses duplicates) turns a redelivery into a no-op continuation.`,
        },
      ],
    },
    // ------------------------------------------------------------------
    {
      id: `driver-timeout`,
      title: `What happens if a driver never responds?`,
      kicker: `Timeouts and durable execution`,
      blocks: [
        {
          type: `problem`,
          html: `<p>Accept and decline are easy: both call the API. Silence is the hard case. The driver has dropped the phone in the door pocket, the push never arrived, or the app crashed. After ten seconds the system must offer the ride to the next driver, and keep doing so until someone accepts or the 60-second limit passes. Whatever is counting those ten seconds can itself crash, deploy or lose its network in the middle.</p>`,
        },
        {
          type: `compare`,
          title: `Who counts to ten?`,
          items: [
            { title: `A timer in the matcher's memory`, tone: `bad`, html: `<p>Simple, and gone the moment the process restarts. The ride sits in REQUESTED with nobody moving it on.</p>` },
            { title: `A delay queue`, tone: `warn`, html: `<p>When an offer goes out, schedule a message for 10 s later (an SQS delay, a sorted set scored by due time). Its handler moves on only if the ride is still waiting on that same offer. Survives crashes, but cancellation and races need care, and the logic is spread across handlers.</p>` },
            { title: `Durable execution`, tone: `ok`, html: `<p>Model matching as a workflow in Temporal or AWS Step Functions: offer, wait for a reply with a 10 s timeout, next driver, stop at 60 s. The engine records every step and timer, so the workflow resumes exactly where it was after any crash.</p>` },
          ],
        },
        {
          type: `code`,
          title: `Delay queue: the check must be conditional`,
          lang: `text`,
          code: `on offer(ride, driver, attempt):
  UPDATE rides SET offered_driver_id = :driver, offer_attempt = :attempt
   WHERE id = :ride AND status = 'REQUESTED'
  push the offer to the driver
  enqueue CheckOffer { ride, attempt }  with delay 10 s

on CheckOffer { ride, attempt }:
  UPDATE rides SET offered_driver_id = NULL
   WHERE id = :ride AND status = 'REQUESTED' AND offer_attempt = :attempt
  1 row:  nobody answered this attempt: offer the next candidate (attempt + 1)
  0 rows: accepted, declined or already moved on: do nothing`,
        },
        {
          type: `text`,
          html: `<p>The attempt number is what makes the race safe. If the driver accepts at 9.9 s and the check fires at 10.0 s, the accept has already moved the ride to ACCEPTED, so the check matches zero rows. If a decline already moved the ride to attempt 4, the stale check for attempt 3 also matches nothing. Every actor uses a conditional update, and the database decides who was first.</p>`,
        },
        {
          type: `diagram`,
          title: `The matching workflow`,
          caption: `Find ranked candidates, lock and offer one, wait up to 10 s. Accept ends the workflow; a decline or timeout loops to the next driver; an empty list or the 60-second limit ends with "no driver". The engine persists each step, so a crash resumes inside the loop.`,
          svg: `<svg viewBox="0 0 640 270" role="img" aria-label="Workflow: ride requested, find drivers, lock and offer the next driver, wait up to 10 seconds; accept leads to assigned; decline or timeout loops back to the next driver; when none are left the ride ends with no driver">
<defs><marker id="ub-arrow-flow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="255" y="85" width="265" height="150" rx="10" style="fill: none; stroke: var(--dg-line)" stroke-width="1.5" stroke-dasharray="6 4"/>
<rect x="10" y="100" width="95" height="50" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="57" y="122" text-anchor="middle" font-size="13" font-weight="700">Ride</text>
<text x="57" y="139" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">requested</text>
<rect x="130" y="100" width="110" height="50" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<text x="185" y="122" text-anchor="middle" font-size="13" font-weight="700">Find drivers</text>
<text x="185" y="139" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">ranked list</text>
<rect x="265" y="100" width="110" height="50" rx="8" style="fill: var(--dg-5-soft); stroke: var(--dg-5)" stroke-width="1.5"/>
<text x="320" y="122" text-anchor="middle" font-size="13" font-weight="700">Lock + offer</text>
<text x="320" y="139" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">next driver</text>
<rect x="400" y="100" width="110" height="50" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="1.5"/>
<text x="455" y="122" text-anchor="middle" font-size="13" font-weight="700">Wait ≤ 10 s</text>
<text x="455" y="139" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">durable timer</text>
<rect x="540" y="30" width="90" height="46" rx="8" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="1.5"/>
<text x="585" y="58" text-anchor="middle" font-size="13" font-weight="700">Assigned</text>
<rect x="540" y="170" width="90" height="56" rx="8" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)" stroke-width="1.5"/>
<text x="585" y="193" text-anchor="middle" font-size="13" font-weight="700">No driver</text>
<text x="585" y="211" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">widen or fail</text>
<line x1="105" y1="125" x2="128" y2="125" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ub-arrow-flow)"/>
<line x1="240" y1="125" x2="263" y2="125" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ub-arrow-flow)"/>
<line x1="375" y1="125" x2="398" y2="125" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ub-arrow-flow)"/>
<line x1="510" y1="110" x2="538" y2="62" stroke-width="1.5" style="stroke: var(--dg-ok)" marker-end="url(#ub-arrow-flow)"/>
<text x="522" y="80" text-anchor="end" font-size="11" style="fill: var(--dg-muted)">accept</text>
<line x1="510" y1="140" x2="538" y2="190" stroke-width="1.5" style="stroke: var(--dg-bad)" marker-end="url(#ub-arrow-flow)"/>
<text x="520" y="178" text-anchor="end" font-size="11" style="fill: var(--dg-muted)">none left</text>
<path d="M455 150 C455 205, 320 205, 320 152" style="fill: none; stroke: var(--dg-5)" stroke-width="1.5" marker-end="url(#ub-arrow-flow)"/>
<text x="388" y="222" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">decline or timeout: next driver</text>
<text x="185" y="175" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">overall limit 60 s</text>
<text x="387" y="256" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">state persisted after every step: a crash resumes here</text>
</svg>`,
        },
        {
          type: `code`,
          title: `The workflow (pseudo-code in the style of Temporal)`,
          lang: `text`,
          code: `workflow MatchRide(rideId):                      workflow id = rideId, so duplicates are refused
  deadline   = now() + 60 s
  candidates = activity FindNearbyDrivers(rideId, radius = 2 km)
  for driver in candidates:
    if now() > deadline: break
    if not activity LockDriver(driver, rideId, ttl = 10 s): continue     busy, try the next
    activity RecordOffer(rideId, driver)                                offered_driver_id = driver
    activity PushOffer(driver, rideId)
    reply = wait for signal "driverReply" from driver, timeout 10 s
    if reply == ACCEPT:
      return ASSIGNED                       the PATCH already ran the conditional UPDATE
    activity ReleaseLock(driver, rideId)    decline or timeout
  activity MarkNoDriver(rideId)
  return NO_DRIVER`,
        },
        {
          type: `tradeoffs`,
          prosLabel: `Durable execution buys`,
          consLabel: `It costs`,
          pros: [
            `Timers, retries and state that survive crashes and deploys without sweepers`,
            `The offer loop reads as ordinary sequential code, including the 60-second deadline`,
            `A visible history per ride: which drivers were offered, when, and what they answered`,
            `Signals (accept, decline, rider cancels) are delivered to the right running workflow`,
          ],
          cons: [
            `Another distributed system to run, monitor and pay for`,
            `Workflow code must be deterministic; side effects go in activities`,
            `Changing a running workflow's logic needs versioning`,
          ],
        },
        {
          type: `realworld`,
          items: [
            { org: `Uber`, title: `Cadence, and then Temporal`, html: `Uber built Cadence, an open-source engine for long-running, fault-tolerant workflows. Its creators later started Temporal, a fork that continues the same model. Human-in-the-loop steps with timeouts, like waiting for a driver's answer, are exactly what these engines are for.` },
            { org: `AWS`, title: `Step Functions`, html: `A managed workflow service where a state machine can wait for a callback token with a timeout, then branch on the result or the timeout.` },
          ],
        },
        {
          type: `quiz`,
          q: `With the delay-queue approach, the driver's accept is committed at 9.9 s and the delayed check for that offer runs at 10.0 s. What prevents the check from offering the ride to the next driver?`,
          options: [
            `The delay queue cancels messages automatically when the driver accepts`,
            `The check is a conditional update on status = 'REQUESTED' and the attempt number; the ride is already ACCEPTED, so it matches zero rows and does nothing`,
            `The 100 ms gap is too short for the race to happen`,
            `The Redis lock is still held`,
          ],
          answer: 1,
          explain: `Delayed messages are hard to cancel reliably, so the handler must be safe to run late. Conditioning on the ride's status and the attempt number makes the stale check a no-op.`,
        },
      ],
    },
    // ------------------------------------------------------------------
    {
      id: `scaling-out`,
      title: `How do we scale further and cut latency?`,
      kicker: `Geo-sharding`,
      blocks: [
        {
          type: `problem`,
          html: `<p>One cluster serving the whole world has hard limits: one Redis cluster, one ride database, one set of queues. It is also far from most users; a round trip between continents adds well over a hundred milliseconds to every call. And when it fails, every city fails at once. Rides, though, are intensely local: a rider in Mumbai never needs a driver in London.</p>`,
        },
        {
          type: `compare`,
          title: `Ways to grow`,
          items: [
            { title: `Vertical scaling`, tone: `bad`, html: `<p>Bigger machines. Quick, but there is a ceiling, upgrades need downtime, and it is still one place to fail. Barely worth discussing at this scale.</p>` },
            { title: `Shard by hash of driver or ride id`, tone: `warn`, html: `<p>Spreads load evenly, but drivers near one pickup land on every shard, so each proximity search becomes a scatter-gather across all of them.</p>` },
            { title: `Geo-shard by region, with read replicas`, tone: `ok`, html: `<p>Each region runs its own services, queue partitions, geo index and ride database, close to its users. Almost every query stays in one shard; replicas absorb read-heavy traffic; failures stay local.</p>` },
          ],
        },
        {
          type: `diagram`,
          title: `Searches near a shard boundary`,
          caption: `A search well inside a region touches one shard. A search circle that crosses the boundary queries both shards and merges the results by distance; this is the only common case of scatter-gather.`,
          svg: `<svg viewBox="0 0 640 230" role="img" aria-label="Two adjacent regional shards; a search inside one shard stays local, a search circle near the boundary overlaps both shards and queries both">
<text x="165" y="30" text-anchor="middle" font-size="12" font-weight="700">shard: SF Bay Area</text>
<text x="475" y="30" text-anchor="middle" font-size="12" font-weight="700">shard: Sacramento</text>
<rect x="20" y="40" width="290" height="150" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<rect x="330" y="40" width="290" height="150" rx="8" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="1.5"/>
<circle cx="100" cy="115" r="45" style="fill: none; stroke: var(--dg-2)" stroke-width="1.5" stroke-dasharray="6 4"/>
<circle cx="295" cy="115" r="55" style="fill: none; stroke: var(--dg-3)" stroke-width="1.5" stroke-dasharray="6 4"/>
<circle cx="75" cy="90" r="6" style="fill: var(--dg-ok)"/>
<circle cx="125" cy="145" r="6" style="fill: var(--dg-ok)"/>
<circle cx="250" cy="90" r="6" style="fill: var(--dg-ok)"/>
<circle cx="270" cy="150" r="6" style="fill: var(--dg-ok)"/>
<circle cx="345" cy="100" r="6" style="fill: var(--dg-ok)"/>
<circle cx="340" cy="140" r="6" style="fill: var(--dg-ok)"/>
<circle cx="200" cy="60" r="6" style="fill: var(--dg-6)"/>
<circle cx="450" cy="80" r="6" style="fill: var(--dg-6)"/>
<circle cx="560" cy="150" r="6" style="fill: var(--dg-6)"/>
<circle cx="500" cy="120" r="6" style="fill: var(--dg-6)"/>
<circle cx="100" cy="115" r="7" style="fill: var(--dg-3)"/>
<circle cx="295" cy="115" r="7" style="fill: var(--dg-3)"/>
<text x="100" y="180" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">1 shard</text>
<text x="320" y="214" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">near the edge: query both shards, merge by distance</text>
</svg>`,
        },
        {
          type: `table`,
          title: `What is sharded, and by what`,
          headers: [`Data or work`, `Shard key`, `Notes`],
          rows: [
            [`Driver geo index`, `Region (city or metro)`, `Hot cities split further by coarse cell`],
            [`Ride-request queue and matchers`, `Region`, `Consumers run in the same region as the index`],
            [`Fares and rides`, `Region where the ride starts`, `Read replicas for history and receipts`],
            [`Driver locks`, `Region of the driver`, `Short-lived; lost locks are tolerated (deep dive 3)`],
            [`Accounts, payment methods`, `Global, replicated`, `Small and read-mostly; needed wherever a user travels`],
          ],
        },
        {
          type: `keypoints`,
          title: `The hard edges of geo-sharding`,
          items: [
            `<strong>Boundaries:</strong> if the search circle crosses into a neighbour, query both and merge by distance. Most pickups are nowhere near a boundary.`,
            `<strong>Uneven regions:</strong> Manhattan at 6 pm is not rural Montana. Split hot regions into several shards along finer cells, and merge quiet ones.`,
            `<strong>Placing shards on nodes:</strong> consistent hashing maps regions onto a ring of nodes, so adding a node moves only about 1/N of them instead of reshuffling everything.`,
            `<strong>Hash coarse, not fine:</strong> hashing tiny cells would scatter neighbouring cells across nodes and turn every search into a multi-node query. Hash city-sized regions and keep each region's cells together.`,
            `<strong>Moving riders and drivers:</strong> a trip that crosses a boundary stays owned by the shard where it started; only new searches use the driver's new region.`,
          ],
        },
        {
          type: `realworld`,
          items: [
            { org: `Uber`, title: `Ringpop`, html: `Uber open-sourced Ringpop, a library that combines gossip-based membership with a consistent hash ring so that a cluster of service instances agrees on which instance owns each key. It was built for Uber's real-time dispatch services.` },
          ],
        },
        {
          type: `quiz`,
          q: `Why not shard the driver geo index by a hash of the driver id?`,
          options: [
            `Hashing driver ids produces uneven load`,
            `Drivers near any pickup would be spread over every shard, so every proximity search would have to query all shards and merge`,
            `Redis cannot hash keys`,
            `Driver ids change when they move`,
          ],
          answer: 1,
          explain: `Hash sharding balances load but ignores location. Proximity search wants nearby drivers together, which is exactly what sharding by region gives, at the cost of uneven regions that you split as needed.`,
        },
      ],
    },
  ],
  takeaways: [
    `Driver positions are <strong>soft state</strong>: keep them in an <strong>in-memory geo index</strong> (Redis <code>GEOADD</code>/<code>GEOSEARCH</code>, geohash scores) keyed by region, sweep out silent drivers, and don't pay for disk-grade durability.`,
    `<strong>2M updates a second</strong> rules out per-update database writes; <strong>adaptive client updates</strong> cut that by about half while making positions more precise where matching needs them.`,
    `Give each driver <strong>one offer at a time</strong> with a lease: <code>SET lock:driver:id rideId NX PX 10000</code>, released with compare-and-delete or by expiry.`,
    `The lock prevents duplicate offers; the <strong>conditional UPDATE on accept</strong> (REQUESTED and offered to this driver) is what guarantees one driver per ride.`,
    `Put a <strong>durable queue partitioned by region</strong> between requests and matching, commit only after hand-off, and make handlers idempotent.`,
    `Model the offer loop as a <strong>durable workflow</strong>: offer, wait 10 s, next driver, give up at 60 s, surviving crashes without timers in memory.`,
    `<strong>Geo-shard</strong> services, queues, indexes and databases by region; query neighbours only near boundaries; place regions on nodes with consistent hashing.`,
  ],
  furtherReading: [
    { title: `Hello Interview: Design a Ride-Sharing Service Like Uber`, url: `https://www.hellointerview.com/learn/system-design/problem-breakdowns/uber`, note: `The original walkthrough of this problem.` },
    { title: `Redis documentation: GEOSEARCH`, url: `https://redis.io/docs/latest/commands/geosearch/` },
    { title: `Redis documentation: SET (NX and PX options)`, url: `https://redis.io/docs/latest/commands/set/` },
    { title: `How to do distributed locking (Martin Kleppmann)`, url: `https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html`, note: `Why lock leases need fencing tokens, and where Redis locks fall short.` },
    { title: `H3: a hexagonal hierarchical geospatial indexing system`, url: `https://h3geo.org/` },
    { title: `PostGIS`, url: `https://postgis.net/` },
    { title: `Temporal documentation`, url: `https://docs.temporal.io/` },
    { title: `Amazon SQS delay queues`, url: `https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-delay-queues.html` },
  ],
};
