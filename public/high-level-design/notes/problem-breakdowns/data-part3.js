// Problem breakdowns, part 3: Uber (ride-sharing), as one problem page (Problem, Solution, Deep Dives, Core Concepts, Q&A, By Level, Cheatsheet).
// Original study notes. The problem follows Hello Interview's Uber breakdown:
// https://www.hellointerview.com/learn/system-design/problem-breakdowns/uber
window.DATA.chapters.push({
  id: `uber`, part: 3, number: 3, difficulty: `hard`,
  title: `Uber: matching riders with nearby drivers in seconds`,
  overview: `A ride-sharing service connects a rider who wants to go somewhere with a driver who is close by, within seconds. The running example is a large network: up to about 10 million active drivers whose phones report a position every few seconds, and bursts of 100,000 requests from one neighbourhood when a stadium empties. The product flow is short (estimate a fare, request, get matched, the driver accepts), so the interview is about three qualities: <strong>absorbing millions of location writes a second while answering "who is near here?" in milliseconds</strong>, <strong>never offering one driver two rides at once</strong>, and <strong>never losing a request</strong> while drivers ignore, decline or time out. The key moves are an in-memory geospatial index, a short-lived lock per driver, and a durable matching workflow fed by a queue.`,
  source: { title: `Hello Interview: Design a Ride-Sharing Service Like Uber`, url: `https://www.hellointerview.com/learn/system-design/problem-breakdowns/uber` },

  // ------------------------------------------------------------------ Problem
  problem: [
    {
      id: `functional`,
      title: `What we are building`,
      kicker: `Functional requirements`,
      blocks: [
        {
          type: `text`,
          html: `<p>Two apps share one backend. A <strong>rider</strong> opens the app, types a destination and sees a price. If they like it they tap "Request", and within a few seconds a <strong>driver</strong> a couple of minutes away gets an offer on their phone, accepts it and drives to the pickup point. Everything else in the product (ratings, receipts, surge maps) hangs off that loop, and the loop is what we design.</p>`,
        },
        {
          type: `keypoints`,
          title: `Core requirements (above the line)`,
          items: [
            `<strong>Fare estimate:</strong> a rider enters a pickup point and a destination and gets an estimated price and arrival time.`,
            `<strong>Request a ride</strong> at the estimated fare.`,
            `<strong>Matching:</strong> once requested, the rider is paired with a driver who is nearby and available.`,
            `<strong>Accept or decline, then navigate:</strong> the driver answers the offer and, if they accept, is guided to the pickup and then the destination.`,
          ],
        },
        {
          type: `list`,
          title: `Below the line (mention, then park)`,
          items: [
            `Riders rate drivers and drivers rate riders after the trip.`,
            `Scheduling a ride for later.`,
            `Ride categories (standard, larger cars, premium) and shared rides.`,
            `Payment capture, tips, receipts and refunds.`,
            `Surge pricing models and live trip sharing with friends.`,
          ],
        },
        {
          type: `compare`,
          title: `Why matching is its own requirement`,
          items: [
            { title: `"Find any driver"`, tone: `bad`, html: `<p>Treating matching as a lookup hides the hard parts: where drivers are right now, who is free, and what happens when the chosen driver says no or says nothing.</p>` },
            { title: `"Find a nearby, available driver, one offer at a time"`, tone: `ok`, html: `<p>Spelling it out names the three problems the deep dives solve: fresh locations, a fast proximity search, and a consistent offer process with timeouts.</p>` },
          ],
        },
        {
          type: `callout`,
          tone: `interview`,
          html: `<p>Say the scope in one breath: "Fare estimate, request, match with a nearby available driver, driver accepts and navigates. Ratings, scheduling and ride types are below the line unless you want them." Then check with the interviewer before drawing anything.</p>`,
        },
      ],
    },
    {
      id: `non-functional`,
      title: `Non-functional requirements`,
      kicker: `Where the difficulty lives`,
      blocks: [
        {
          type: `table`,
          title: `Core (what the design must achieve)`,
          headers: [`Requirement`, `Target`, `Why it matters`],
          rows: [
            [`<strong>Low-latency matching</strong>`, `A driver within a minute, or a clear "no drivers" answer`, `Riders abandon the app if they stare at a spinner; a fast "no" beats a slow one`],
            [`<strong>Consistent matching</strong>`, `One outstanding offer per driver; one driver per ride`, `Two offers to one driver strand a rider; two drivers for one ride waste a trip and pay`],
            [`<strong>Peak throughput</strong>`, `~100K requests from one area within minutes`, `Stadiums, festivals and New Year's Eve concentrate demand on a few square kilometres`],
            [`<strong>Fresh locations</strong>`, `Positions a few seconds old`, `Matching on stale positions sends far-away drivers and makes ETAs lie`],
          ],
        },
        {
          type: `table`,
          title: `Below the line (acknowledge, don't design)`,
          headers: [`Requirement`, `Target`, `Why it matters`],
          rows: [
            [`Privacy and security`, `Location and identity data protected, GDPR-style rules`, `Live locations of people are highly sensitive`],
            [`Resilience`, `Redundancy and failover in every tier`, `An outage in one city must not take down others`],
            [`Observability`, `Metrics, logs and alerts on matching health`, `Time-to-match and queue lag show trouble before riders do`],
            [`Safe deploys`, `CI/CD with no downtime`, `A ride in progress should never notice a release`],
          ],
        },
        {
          type: `idea`,
          html: `<p>Split the data by how much it matters. <strong>Driver positions are soft state</strong>: they are replaced every few seconds, so losing a few is harmless. <strong>Assignments are hard state</strong>: who drives whom must be exact and durable. The design spends its consistency budget on the second and its speed budget on the first.</p>`,
        },
        {
          type: `callout`,
          tone: `tip`,
          html: `<p>Put numbers on the qualities. "Low latency" invites endless debate; "a match or a clear failure within 60 seconds, with a 10-second window per driver" sets the timeout, the retry count and the queue design in one sentence.</p>`,
        },
      ],
    },
    {
      id: `estimates`,
      title: `Back-of-the-envelope numbers`,
      kicker: `Let the numbers pick the design`,
      blocks: [
        {
          type: `steps`,
          items: [
            `<strong>Location writes:</strong> assume up to ~10M active drivers, each reporting every ~5 s: <span class="formula">10,000,000 ÷ 5 s = 2,000,000 updates/s</span>.`,
            `<strong>Ingress bandwidth:</strong> at ~100 bytes per update (driver id, latitude, longitude, heading, speed, overhead), <span class="formula">2M/s × 100 B = 200 MB/s ≈ 1.6 Gbit/s</span> into the location service.`,
            `<strong>Latest-position state:</strong> <span class="formula">10M drivers × ~100 B ≈ 1 GB</span>. It fits in memory on one machine; size is not the problem, the write rate is.`,
            `<strong>History, if kept:</strong> <span class="formula">2M/s × ~10<sup>5</sup> s/day ≈ 2 × 10<sup>11</sup> points/day</span>, and at 100 B each about <span class="formula">2 × 10<sup>13</sup> B = 20 TB/day</span>. Keep it out of the hot store.`,
            `<strong>Rides:</strong> say ~20M rides/day: <span class="formula">20,000,000 ÷ 10<sup>5</sup> s ≈ 200 rides/s</span> on average, ~1,000/s at a 5× peak. With ~5 estimates per ride, fare requests run ~1,000/s on average and ~5,000/s at peak. Small numbers.`,
            `<strong>Stadium burst:</strong> 100,000 requests over ~5 minutes is <span class="formula">100,000 ÷ 300 s ≈ 333 requests/s</span>, all aimed at a few square kilometres. If 5,000 drivers are nearby, <span class="formula">5,000 ÷ 100,000 = 5%</span> of riders can be matched straight away; the rest must wait without being lost.`,
            `<strong>Matching budget:</strong> a 60-second limit with a 10-second window per driver allows <span class="formula">60 ÷ 10 = 6</span> drivers to be tried one after another.`,
            `<strong>Storage engines:</strong> at ~10K-20K row updates/s per Postgres node, 2M/s needs <span class="formula">2M ÷ 20K = 100</span> to <span class="formula">2M ÷ 10K = 200</span> nodes. At ~100K simple operations/s per Redis node it needs about <span class="formula">2M ÷ 100K = 20</span>.`,
          ],
        },
        {
          type: `keypoints`,
          title: `Three verdicts`,
          items: [
            `<span class="hl-bad">Writing every position to the main database is out</span>: two orders of magnitude beyond one node, for data that is stale in five seconds anyway.`,
            `<span class="hl-good">The live state is small</span>: about a gigabyte of latest positions, so an in-memory index split by region is realistic.`,
            `<span class="hl-good">Rides and fares are ordinary traffic</span>: hundreds to a few thousand per second, which a normal sharded database handles. The hard part at peak is <em>supply</em>, so requests need a place to wait.`,
          ],
        },
        {
          type: `quiz`,
          q: `10 million drivers each send a location every 5 seconds. Which conclusion follows?`,
          options: [
            `About 200,000 writes per second, easily handled by one database`,
            `About 2 million writes per second against roughly a gigabyte of latest positions: the write rate, not the size, is the challenge`,
            `About 20 TB of latest positions, so the data must be sharded for storage reasons`,
            `Location updates are rare enough to write synchronously into the rides table`,
          ],
          answer: 1,
          explain: `10M ÷ 5 s = 2M updates per second. Each driver has only one latest position (~100 B), so the live state is ~1 GB. The 20 TB figure is a day of history, which the matching path never needs.`,
        },
      ],
    },
    {
      id: `out-of-scope`,
      title: `Out of scope, and questions to ask`,
      kicker: `Drawing the line`,
      blocks: [
        {
          type: `list`,
          title: `Not designing today`,
          items: [
            `The pricing model itself (we call it a function of distance and time) and surge pricing.`,
            `Routing and map data: a third-party maps API provides distance, duration and turn-by-turn directions.`,
            `Payments, receipts, ratings, driver onboarding and background checks.`,
            `Fraud detection beyond basic sanity checks on locations.`,
          ],
        },
        {
          type: `list`,
          title: `Ask before designing`,
          items: [
            `How many drivers are active at peak, and how often must their position be fresh?`,
            `How long may matching take before we tell the rider no driver is available?`,
            `How long does a driver get to answer an offer? Do we offer one driver at a time or several at once?`,
            `Is the service global? Can one region's outage affect another?`,
            `Do riders need to watch the driver approach live? (It changes how often positions must be pushed out.)`,
          ],
        },
      ],
    },
  ],

  // ------------------------------------------------------------------ Solution
  solution: [
    {
      id: `core-entities`,
      title: `Core entities`,
      kicker: `Five nouns`,
      blocks: [
        {
          type: `table`,
          headers: [`Entity`, `Key fields`, `Why it exists`],
          rows: [
            [`<strong>Rider</strong>`, `id, name, phone, payment method`, `Who asks for rides; identity comes from their session`],
            [`<strong>Driver</strong>`, `id, vehicle, rating, status (offline, available, on trip)`, `Who supplies rides; status decides whether they can be matched`],
            [`<strong>Fare</strong>`, `id, rider_id, pickup, destination, price, eta, expires_at`, `A server-side quote, so the price a rider accepts can't be edited by the client`],
            [`<strong>Ride</strong>`, `id, rider_id, driver_id, fare_id, status, offered_driver_id, timestamps`, `One trip from request to drop-off; the record of who drives whom`],
            [`<strong>Location</strong>`, `driver_id, lat, long, updated_at`, `The latest position of each driver, replaced every few seconds`],
          ],
        },
        {
          type: `text`,
          html: `<p>Fare and Ride are separate because a rider may ask for several estimates and request none of them; a Fare that becomes a Ride is referenced by id. Location is the odd one out: it changes thousands of times more often than anything else and is worthless after a few seconds, which is why it ends up in a different store from the rest.</p>`,
        },
        {
          type: `diagram`,
          title: `How the entities relate`,
          caption: `A rider asks for a Fare; an accepted Fare becomes a Ride; a driver drives the Ride. Each driver has exactly one current Location, overwritten on every update.`,
          svg: `<svg viewBox="0 0 640 240" role="img" aria-label="Entity diagram: Rider asks for Fare, Fare is accepted as Ride, Rider takes Ride, Driver drives Ride, Driver reports its latest Location">
<defs><marker id="ub-arrow-ent" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="20" y="20" width="160" height="78" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<text x="100" y="45" text-anchor="middle" font-size="14" font-weight="700">Rider</text>
<text x="100" y="66" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">id, name, phone</text>
<text x="100" y="82" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">payment method</text>
<rect x="240" y="20" width="160" height="78" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="1.5"/>
<text x="320" y="45" text-anchor="middle" font-size="14" font-weight="700">Fare</text>
<text x="320" y="66" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">pickup, destination</text>
<text x="320" y="82" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">price, ETA, expiry</text>
<rect x="460" y="20" width="160" height="78" rx="8" style="fill: var(--dg-5-soft); stroke: var(--dg-5)" stroke-width="1.5"/>
<text x="540" y="45" text-anchor="middle" font-size="14" font-weight="700">Location</text>
<text x="540" y="66" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">driverId, lat, long</text>
<text x="540" y="82" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">updated at</text>
<rect x="240" y="150" width="160" height="78" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<text x="320" y="175" text-anchor="middle" font-size="14" font-weight="700">Ride</text>
<text x="320" y="196" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">rider, driver, fare</text>
<text x="320" y="212" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">status, timestamps</text>
<rect x="460" y="150" width="160" height="78" rx="8" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="1.5"/>
<text x="540" y="175" text-anchor="middle" font-size="14" font-weight="700">Driver</text>
<text x="540" y="196" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">vehicle, rating, status</text>
<text x="540" y="212" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">available / on trip</text>
<line x1="180" y1="59" x2="238" y2="59" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ub-arrow-ent)"/>
<text x="209" y="51" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">asks for</text>
<line x1="320" y1="98" x2="320" y2="148" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ub-arrow-ent)"/>
<text x="328" y="128" font-size="11" style="fill: var(--dg-muted)">accepted as</text>
<line x1="180" y1="84" x2="238" y2="172" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ub-arrow-ent)"/>
<text x="196" y="152" text-anchor="end" font-size="11" style="fill: var(--dg-muted)">takes</text>
<line x1="460" y1="189" x2="402" y2="189" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ub-arrow-ent)"/>
<text x="431" y="181" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">drives</text>
<line x1="540" y1="150" x2="540" y2="100" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ub-arrow-ent)"/>
<text x="548" y="128" font-size="11" style="fill: var(--dg-muted)">reports latest</text>
</svg>`,
        },
      ],
    },
    {
      id: `api`,
      title: `API`,
      kicker: `Four calls, and what they must not trust`,
      blocks: [
        {
          type: `table`,
          headers: [`Call`, `Who calls it`, `Purpose`],
          rows: [
            [`<code>POST /fare</code>`, `Rider app`, `Create a Fare (a stored quote) for a pickup and destination`],
            [`<code>POST /rides</code>`, `Rider app`, `Turn a Fare into a Ride and start matching`],
            [`<code>POST /drivers/location</code>`, `Driver app, every few seconds`, `Report the driver's current position`],
            [`<code>PATCH /rides/:rideId</code>`, `Driver app`, `Accept or decline the offer for this ride`],
          ],
        },
        {
          type: `code`,
          title: `Fare estimate`,
          lang: `text`,
          code: `POST /fare
Authorization: Bearer <rider JWT>            riderId comes from the token
{ "pickup":      { "lat": 37.7793, "lng": -122.4193 },
  "destination": { "lat": 37.6213, "lng": -122.3790 } }

201 Created
{ "fareId": "f_71c2",
  "price": { "amount": 4250, "currency": "USD" },      integer minor units (cents)
  "etaMinutes": 6,
  "expiresAt": "2026-10-21T17:05:00Z" }               set by the server`,
        },
        {
          type: `code`,
          title: `Request a ride`,
          lang: `text`,
          code: `POST /rides
Authorization: Bearer <rider JWT>
Idempotency-Key: 3b9e0c...                   same key on every retry of this tap
{ "fareId": "f_71c2" }                       no price, no riderId in the body

201 Created   { "rideId": "r_9f04", "status": "REQUESTED" }
404 Not Found       fare does not exist or belongs to someone else
410 Gone            fare has expired: ask for a new estimate`,
        },
        {
          type: `code`,
          title: `Driver location update`,
          lang: `text`,
          code: `POST /drivers/location
Authorization: Bearer <driver JWT>           driverId comes from the token
{ "lat": 37.7790, "lng": -122.4170, "heading": 270, "speedKmh": 32 }

204 No Content                               the server stamps the time on arrival`,
        },
        {
          type: `code`,
          title: `Accept or decline an offer`,
          lang: `text`,
          code: `PATCH /rides/r_9f04
Authorization: Bearer <driver JWT>
{ "action": "accept" }                       or "decline"

200 OK
{ "rideId": "r_9f04", "status": "ACCEPTED",
  "pickup": { "lat": 37.7793, "lng": -122.4193 },
  "destination": { "lat": 37.6213, "lng": -122.3790 } }
409 Conflict   { "error": "OFFER_EXPIRED" }  the window closed or the ride moved on`,
        },
        {
          type: `keypoints`,
          title: `Security: the client is not a source of truth`,
          items: [
            `<strong>User ids come from the session or JWT</strong>, never from the body, path or query. A rider id in the body lets anyone request rides on someone else's account; a driver id in the location body lets anyone move another driver on the map.`,
            `<strong>Timestamps come from the server.</strong> A client clock can be wrong or forged; the server stamps when an update arrived and when a ride changed state.`,
            `<strong>The fare comes from the database.</strong> <code>POST /rides</code> carries only a <code>fareId</code>; the server loads that Fare, checks it belongs to the caller and has not expired, and uses its stored price. A price field in the request would be an invitation to edit it.`,
            `<strong>Ownership checks on every id:</strong> a fare must belong to the rider using it, and only the driver who currently holds the offer may accept a ride.`,
            `<strong>Idempotency key on POST /rides</strong>, so a double tap or a retry after a lost response returns the same ride instead of starting two searches.`,
          ],
        },
        {
          type: `callout`,
          tone: `insight`,
          html: `<p>There is no "match" endpoint and no "get my offer" endpoint. Matching happens in the backend after <code>POST /rides</code>, and offers reach drivers as push notifications. The API is the edge of the system, not a map of every internal step.</p>`,
        },
      ],
    },
    {
      id: `hld-fare`,
      title: `1. Riders get a fare estimate`,
      kicker: `High-level design, step 1`,
      blocks: [
        {
          type: `text`,
          html: `<p>Start with the first thing a rider does. Four components are enough:</p>
<ul>
<li><strong>Rider app</strong> (iOS, Android): collects the pickup and destination and shows the quote.</li>
<li><strong>API gateway</strong>: the single entry point; authenticates the token, applies rate limits and routes to services.</li>
<li><strong>Ride service</strong>: owns fares and rides. It asks the maps API for distance and duration and applies the pricing model.</li>
<li><strong>Maps API</strong> (third party) and a <strong>database</strong> that stores the Fare.</li>
</ul>`,
        },
        {
          type: `diagram`,
          title: `Step 1: fare estimate`,
          caption: `The rider's request passes the gateway to the ride service, which gets distance and time from the maps API, prices the trip and stores a Fare with an expiry.`,
          svg: `<svg viewBox="0 0 640 220" role="img" aria-label="Rider app to API gateway to ride service; ride service calls a third-party maps API and writes a Fare to the database">
<defs><marker id="ub-arrow-s1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="10" y="85" width="100" height="50" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="60" y="107" text-anchor="middle" font-size="13" font-weight="700">Rider app</text>
<text x="60" y="124" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">iOS, Android</text>
<rect x="150" y="85" width="110" height="50" rx="8" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="1.5"/>
<text x="205" y="107" text-anchor="middle" font-size="13" font-weight="700">API gateway</text>
<text x="205" y="124" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">auth, rate limits</text>
<rect x="300" y="85" width="130" height="50" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="1.5"/>
<text x="365" y="107" text-anchor="middle" font-size="13" font-weight="700">Ride service</text>
<text x="365" y="124" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">pricing model</text>
<rect x="480" y="20" width="150" height="50" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5" stroke-dasharray="5 4"/>
<text x="555" y="42" text-anchor="middle" font-size="13" font-weight="700">Maps API</text>
<text x="555" y="59" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">third party</text>
<rect x="480" y="150" width="150" height="56" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<text x="555" y="173" text-anchor="middle" font-size="13" font-weight="700">Database</text>
<text x="555" y="191" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">Fare</text>
<line x1="110" y1="110" x2="148" y2="110" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ub-arrow-s1)"/>
<line x1="260" y1="110" x2="298" y2="110" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ub-arrow-s1)"/>
<line x1="430" y1="100" x2="478" y2="52" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ub-arrow-s1)"/>
<line x1="430" y1="120" x2="478" y2="170" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ub-arrow-s1)"/>
<circle cx="129" cy="96" r="9" style="fill: var(--dg-panel); stroke: var(--dg-muted)" stroke-width="1"/>
<text x="129" y="100" text-anchor="middle" font-size="11" font-weight="700">1</text>
<circle cx="279" cy="96" r="9" style="fill: var(--dg-panel); stroke: var(--dg-muted)" stroke-width="1"/>
<text x="279" y="100" text-anchor="middle" font-size="11" font-weight="700">2</text>
<circle cx="444" cy="66" r="9" style="fill: var(--dg-panel); stroke: var(--dg-muted)" stroke-width="1"/>
<text x="444" y="70" text-anchor="middle" font-size="11" font-weight="700">3</text>
<circle cx="446" cy="156" r="9" style="fill: var(--dg-panel); stroke: var(--dg-muted)" stroke-width="1"/>
<text x="446" y="160" text-anchor="middle" font-size="11" font-weight="700">4</text>
</svg>`,
        },
        {
          type: `steps`,
          title: `Request flow`,
          items: [
            `The rider enters a pickup and a destination; the app sends <code>POST /fare</code> with the two points.`,
            `The API gateway verifies the rider's token, applies rate limits and forwards the call to the ride service.`,
            `The ride service asks the maps API for driving distance and duration, then applies the pricing model (for example a base fee plus a rate per kilometre and per minute) in integer cents.`,
            `It stores a Fare with the rider id, both points, the price, the ETA and an <code>expires_at</code> a few minutes ahead.`,
            `The Fare goes back through the gateway to the app, which shows the price and lets the rider request a ride or walk away.`,
          ],
        },
        {
          type: `callout`,
          tone: `tip`,
          html: `<p><strong>Why store an estimate nobody may use?</strong> Because the next call refers to it. Storing the quote with an expiry means the price the rider saw is exactly the price they request, and it can't be replayed tomorrow or edited on the way.</p>`,
        },
      ],
    },
    {
      id: `hld-request`,
      title: `2. Riders request a ride`,
      kicker: `High-level design, step 2`,
      blocks: [
        {
          type: `text`,
          html: `<p>No new services are needed: the ride service gains a <strong>Ride</strong> table and a status field. The request carries only the fare id; everything else (who is asking, the price, the points) is loaded on the server.</p>`,
        },
        {
          type: `diagram`,
          title: `Step 2: request a ride`,
          caption: `The ride service loads the Fare, checks it belongs to the caller and is still valid, and inserts a Ride in REQUESTED. Matching, added in the next step, starts from there.`,
          svg: `<svg viewBox="0 0 640 250" role="img" aria-label="Rider app to API gateway to ride service; ride service reads the Fare and inserts a Ride with status REQUESTED, then triggers matching, which is the next step">
<defs><marker id="ub-arrow-s2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="10" y="85" width="100" height="50" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="60" y="107" text-anchor="middle" font-size="13" font-weight="700">Rider app</text>
<text x="60" y="124" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">taps Request</text>
<rect x="150" y="85" width="110" height="50" rx="8" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="1.5"/>
<text x="205" y="107" text-anchor="middle" font-size="13" font-weight="700">API gateway</text>
<text x="205" y="124" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">auth, rate limits</text>
<rect x="300" y="85" width="130" height="50" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="1.5"/>
<text x="365" y="107" text-anchor="middle" font-size="13" font-weight="700">Ride service</text>
<text x="365" y="124" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">fares, rides</text>
<rect x="480" y="20" width="150" height="50" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5" stroke-dasharray="5 4"/>
<text x="555" y="42" text-anchor="middle" font-size="13" font-weight="700">Maps API</text>
<text x="555" y="59" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">third party</text>
<rect x="480" y="110" width="150" height="120" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<text x="555" y="130" text-anchor="middle" font-size="13" font-weight="700">Database</text>
<rect x="492" y="142" width="126" height="30" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-1)" stroke-width="1"/>
<text x="555" y="162" text-anchor="middle" font-size="12">Fare</text>
<rect x="492" y="184" width="126" height="34" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="555" y="199" text-anchor="middle" font-size="12" font-weight="700">Ride (new)</text>
<text x="555" y="213" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">status REQUESTED</text>
<rect x="300" y="185" width="130" height="44" rx="8" style="fill: none; stroke: var(--dg-line)" stroke-width="1.5" stroke-dasharray="5 4"/>
<text x="365" y="205" text-anchor="middle" font-size="12" font-weight="700" style="fill: var(--dg-muted)">Matching</text>
<text x="365" y="221" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">next step</text>
<line x1="110" y1="110" x2="148" y2="110" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ub-arrow-s2)"/>
<line x1="260" y1="110" x2="298" y2="110" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ub-arrow-s2)"/>
<line x1="430" y1="95" x2="478" y2="50" stroke-width="1.5" style="stroke: var(--dg-line)" stroke-dasharray="4 4" marker-end="url(#ub-arrow-s2)"/>
<line x1="430" y1="118" x2="489" y2="198" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ub-arrow-s2)"/>
<line x1="365" y1="135" x2="365" y2="183" stroke-width="1.5" style="stroke: var(--dg-muted)" stroke-dasharray="5 4" marker-end="url(#ub-arrow-s2)"/>
<circle cx="129" cy="96" r="9" style="fill: var(--dg-panel); stroke: var(--dg-muted)" stroke-width="1"/>
<text x="129" y="100" text-anchor="middle" font-size="11" font-weight="700">1</text>
<circle cx="279" cy="96" r="9" style="fill: var(--dg-panel); stroke: var(--dg-muted)" stroke-width="1"/>
<text x="279" y="100" text-anchor="middle" font-size="11" font-weight="700">2</text>
<circle cx="462" cy="140" r="9" style="fill: var(--dg-panel); stroke: var(--dg-muted)" stroke-width="1"/>
<text x="462" y="144" text-anchor="middle" font-size="11" font-weight="700">3</text>
<circle cx="381" cy="160" r="9" style="fill: var(--dg-panel); stroke: var(--dg-muted)" stroke-width="1"/>
<text x="381" y="164" text-anchor="middle" font-size="11" font-weight="700">4</text>
</svg>`,
        },
        {
          type: `steps`,
          title: `Request flow`,
          items: [
            `The rider taps "Request"; the app sends <code>POST /rides</code> with the fare id and an Idempotency-Key.`,
            `The gateway authenticates the rider and rate-limits, then forwards to the ride service.`,
            `The ride service loads the Fare <em>where the id matches and the rider is the caller</em>, rejects it if expired, and inserts a Ride (rider, fare, status REQUESTED, created_at from the server clock). A unique constraint on fare_id turns a retry into "return the existing ride".`,
            `It hands the ride to matching (built in step 3) and returns <code>201</code> with the ride id, so the app can show "Finding your driver".`,
          ],
        },
        {
          type: `code`,
          title: `Creating a ride (pseudo-code)`,
          lang: `text`,
          code: `on POST /rides { fareId }        rider = session.riderId
  fare = SELECT * FROM fares WHERE id = :fareId AND rider_id = :rider
  if no row:                  return 404
  if fare.expires_at < now(): return 410  (ask for a new estimate)
  INSERT INTO rides (id, rider_id, fare_id, status, created_at)
       VALUES (:id, :rider, :fareId, 'REQUESTED', now())
       ON CONFLICT (fare_id) DO NOTHING      -- retry: load and return the existing ride
  start matching for the ride
  return 201 { rideId, status: 'REQUESTED' }`,
        },
        {
          type: `table`,
          title: `Ride status`,
          headers: [`Status`, `Meaning`, `Set by`],
          rows: [
            [`REQUESTED`, `Created; matching is looking for a driver`, `Ride service on POST /rides`],
            [`ACCEPTED`, `A driver accepted; driver_id is set`, `Ride service on the driver's PATCH`],
            [`IN_PROGRESS`, `Rider picked up`, `Driver app at pickup`],
            [`COMPLETED`, `Dropped off; final fare charged`, `Driver app at the destination`],
            [`CANCELLED / NO_DRIVER`, `Rider cancelled, or matching gave up within its time limit`, `Rider app, or matching`],
          ],
        },
      ],
    },
    {
      id: `hld-matching`,
      title: `3. Riders are matched with a nearby driver`,
      kicker: `High-level design, step 3`,
      blocks: [
        {
          type: `text`,
          html: `<p>Matching needs to know where drivers are, so this step adds three components:</p>
<ul>
<li><strong>Driver app</strong>: reports its position every few seconds and, later, receives offers.</li>
<li><strong>Location service</strong>: accepts position updates and keeps each driver's latest location where matching can query it. For now that is a Locations table in the database.</li>
<li><strong>Matching service</strong>: takes a new ride, finds available drivers near the pickup, and ranks them (distance or ETA first; rating and acceptance rate as tie-breakers).</li>
</ul>`,
        },
        {
          type: `diagram`,
          title: `Step 3: matching`,
          caption: `Driver apps stream positions through the gateway to the location service, which updates the Locations table. When the ride service creates a ride, the matching service queries that table for the nearest available drivers.`,
          svg: `<svg viewBox="0 0 640 310" role="img" aria-label="Rider and driver apps both go through the API gateway. Ride service creates rides and hands them to the matching service. Location service writes driver positions to a Locations table, which the matching service queries for nearby drivers">
<defs><marker id="ub-arrow-s3" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="10" y="30" width="90" height="50" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="55" y="60" text-anchor="middle" font-size="13" font-weight="700">Rider app</text>
<rect x="10" y="240" width="90" height="50" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="55" y="270" text-anchor="middle" font-size="13" font-weight="700">Driver app</text>
<rect x="125" y="30" width="80" height="260" rx="8" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="1.5"/>
<text x="165" y="155" text-anchor="middle" font-size="13" font-weight="700">API</text>
<text x="165" y="172" text-anchor="middle" font-size="13" font-weight="700">gateway</text>
<rect x="235" y="30" width="130" height="50" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="1.5"/>
<text x="300" y="52" text-anchor="middle" font-size="13" font-weight="700">Ride service</text>
<text x="300" y="69" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">fares, rides</text>
<rect x="235" y="135" width="130" height="50" rx="8" style="fill: var(--dg-5-soft); stroke: var(--dg-5)" stroke-width="1.5"/>
<text x="300" y="157" text-anchor="middle" font-size="13" font-weight="700">Matching svc</text>
<text x="300" y="174" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">rank nearby drivers</text>
<rect x="235" y="240" width="130" height="50" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<text x="300" y="262" text-anchor="middle" font-size="13" font-weight="700">Location svc</text>
<text x="300" y="279" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">update every ~5 s</text>
<rect x="395" y="8" width="110" height="44" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5" stroke-dasharray="5 4"/>
<text x="450" y="27" text-anchor="middle" font-size="12" font-weight="700">Maps API</text>
<text x="450" y="43" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">third party</text>
<rect x="395" y="70" width="110" height="60" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<text x="450" y="95" text-anchor="middle" font-size="13" font-weight="700">Database</text>
<text x="450" y="113" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">Fare, Ride</text>
<rect x="395" y="240" width="110" height="50" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<text x="450" y="262" text-anchor="middle" font-size="13" font-weight="700">Locations</text>
<text x="450" y="279" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">lat, long, time</text>
<line x1="100" y1="55" x2="123" y2="55" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ub-arrow-s3)"/>
<line x1="100" y1="265" x2="123" y2="265" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ub-arrow-s3)"/>
<line x1="205" y1="55" x2="233" y2="55" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ub-arrow-s3)"/>
<line x1="205" y1="265" x2="233" y2="265" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ub-arrow-s3)"/>
<line x1="365" y1="45" x2="393" y2="32" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ub-arrow-s3)"/>
<line x1="365" y1="65" x2="393" y2="95" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ub-arrow-s3)"/>
<line x1="300" y1="80" x2="300" y2="133" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ub-arrow-s3)"/>
<line x1="365" y1="265" x2="393" y2="265" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ub-arrow-s3)"/>
<line x1="365" y1="178" x2="415" y2="238" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ub-arrow-s3)"/>
<text x="425" y="205" font-size="11" style="fill: var(--dg-muted)">nearest drivers</text>
<circle cx="112" cy="40" r="9" style="fill: var(--dg-panel); stroke: var(--dg-muted)" stroke-width="1"/>
<text x="112" y="44" text-anchor="middle" font-size="11" font-weight="700">1</text>
<circle cx="219" cy="40" r="9" style="fill: var(--dg-panel); stroke: var(--dg-muted)" stroke-width="1"/>
<text x="219" y="44" text-anchor="middle" font-size="11" font-weight="700">2</text>
<circle cx="316" cy="107" r="9" style="fill: var(--dg-panel); stroke: var(--dg-muted)" stroke-width="1"/>
<text x="316" y="111" text-anchor="middle" font-size="11" font-weight="700">3</text>
<circle cx="379" cy="250" r="9" style="fill: var(--dg-panel); stroke: var(--dg-muted)" stroke-width="1"/>
<text x="379" y="254" text-anchor="middle" font-size="11" font-weight="700">4</text>
<circle cx="408" cy="196" r="9" style="fill: var(--dg-panel); stroke: var(--dg-muted)" stroke-width="1"/>
<text x="408" y="200" text-anchor="middle" font-size="11" font-weight="700">5</text>
</svg>`,
        },
        {
          type: `steps`,
          title: `Request flow`,
          items: [
            `The rider requests a ride (<code>POST /rides</code> with the fare id).`,
            `The gateway authenticates and forwards to the ride service, which creates the Ride in REQUESTED.`,
            `The ride service hands the ride to the matching service. (A direct call for now; deep dives 4 and 5 make this hand-off durable.)`,
            `Independently and all the time, every driver app sends <code>POST /drivers/location</code> every few seconds; the location service overwrites that driver's row in the Locations table.`,
            `The matching service queries for available drivers near the pickup, ranks them, and moves on to offering the ride (step 4).`,
          ],
        },
        {
          type: `callout`,
          tone: `warning`,
          title: `Where this step breaks`,
          html: `<ul>
<li><strong>The write rate:</strong> ~2M location updates/s into a relational table is far beyond one node.</li>
<li><strong>The query shape:</strong> "drivers within 2 km" on plain latitude and longitude columns scans a whole strip of the map.</li>
<li><strong>Offers and failures:</strong> nothing yet stops two matchers offering the same driver, or loses track of a request when a matcher crashes.</li>
</ul><p>Name these now; they are deep dives 1 to 5.</p>`,
        },
      ],
    },
    {
      id: `hld-accept`,
      title: `4. Drivers accept, decline and navigate`,
      kicker: `High-level design, step 4`,
      blocks: [
        {
          type: `text`,
          html: `<p>The matching service has a ranked list of drivers; now it must reach the first one. Drivers' phones are often in the background, so the reliable channel is the operating system's push service. This step adds a <strong>notification service</strong> that sends offers through <strong>APNs</strong> (Apple Push Notification service) for iOS and <strong>FCM</strong> (Firebase Cloud Messaging) for Android.</p>`,
        },
        {
          type: `diagram`,
          title: `Step 4: offer, accept, navigate`,
          caption: `Matching asks the notification service to push an offer to the top-ranked driver through APNs or FCM. The driver accepts with a PATCH that goes through the gateway to the ride service, which assigns the ride and returns the pickup point.`,
          svg: `<svg viewBox="0 0 640 360" role="img" aria-label="Matching service sends an offer through the notification service and APNs or FCM to the driver app; the driver app accepts through the API gateway; the ride service updates the ride in the database">
<defs><marker id="ub-arrow-s4" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="10" y="30" width="90" height="50" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="55" y="60" text-anchor="middle" font-size="13" font-weight="700">Rider app</text>
<rect x="10" y="240" width="90" height="50" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="55" y="270" text-anchor="middle" font-size="13" font-weight="700">Driver app</text>
<rect x="125" y="30" width="80" height="260" rx="8" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="1.5"/>
<text x="165" y="155" text-anchor="middle" font-size="13" font-weight="700">API</text>
<text x="165" y="172" text-anchor="middle" font-size="13" font-weight="700">gateway</text>
<rect x="235" y="30" width="130" height="50" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="1.5"/>
<text x="300" y="52" text-anchor="middle" font-size="13" font-weight="700">Ride service</text>
<text x="300" y="69" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">fares, rides, accept</text>
<rect x="235" y="135" width="130" height="50" rx="8" style="fill: var(--dg-5-soft); stroke: var(--dg-5)" stroke-width="1.5"/>
<text x="300" y="157" text-anchor="middle" font-size="13" font-weight="700">Matching svc</text>
<text x="300" y="174" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">rank nearby drivers</text>
<rect x="235" y="240" width="130" height="50" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<text x="300" y="262" text-anchor="middle" font-size="13" font-weight="700">Location svc</text>
<text x="300" y="279" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">update every ~5 s</text>
<rect x="395" y="8" width="110" height="44" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5" stroke-dasharray="5 4"/>
<text x="450" y="27" text-anchor="middle" font-size="12" font-weight="700">Maps API</text>
<text x="450" y="43" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">third party</text>
<rect x="395" y="70" width="110" height="60" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<text x="450" y="95" text-anchor="middle" font-size="13" font-weight="700">Database</text>
<text x="450" y="113" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">Fare, Ride</text>
<rect x="395" y="240" width="110" height="50" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<text x="450" y="262" text-anchor="middle" font-size="13" font-weight="700">Locations</text>
<text x="450" y="279" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">lat, long, time</text>
<rect x="525" y="135" width="105" height="50" rx="8" style="fill: var(--dg-6-soft); stroke: var(--dg-6)" stroke-width="1.5"/>
<text x="577" y="157" text-anchor="middle" font-size="13" font-weight="700">Notification</text>
<text x="577" y="174" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">service</text>
<rect x="525" y="240" width="105" height="50" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5" stroke-dasharray="5 4"/>
<text x="577" y="262" text-anchor="middle" font-size="12" font-weight="700">APNs / FCM</text>
<text x="577" y="279" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">push gateways</text>
<line x1="100" y1="55" x2="123" y2="55" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ub-arrow-s4)"/>
<line x1="100" y1="265" x2="123" y2="265" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ub-arrow-s4)"/>
<line x1="205" y1="55" x2="233" y2="55" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ub-arrow-s4)"/>
<line x1="205" y1="265" x2="233" y2="265" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ub-arrow-s4)"/>
<line x1="365" y1="45" x2="393" y2="32" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ub-arrow-s4)"/>
<line x1="365" y1="65" x2="393" y2="95" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ub-arrow-s4)"/>
<line x1="300" y1="80" x2="300" y2="133" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ub-arrow-s4)"/>
<line x1="365" y1="265" x2="393" y2="265" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ub-arrow-s4)"/>
<line x1="365" y1="178" x2="415" y2="238" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ub-arrow-s4)"/>
<line x1="365" y1="160" x2="523" y2="160" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ub-arrow-s4)"/>
<line x1="577" y1="185" x2="577" y2="238" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ub-arrow-s4)"/>
<path d="M577 290 V332 H55 V292" style="fill: none; stroke: var(--dg-6)" stroke-width="1.5" stroke-dasharray="5 4" marker-end="url(#ub-arrow-s4)"/>
<text x="316" y="352" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">offer pushed to the driver's phone</text>
<circle cx="450" cy="148" r="9" style="fill: var(--dg-panel); stroke: var(--dg-muted)" stroke-width="1"/>
<text x="450" y="152" text-anchor="middle" font-size="11" font-weight="700">1</text>
<circle cx="592" cy="212" r="9" style="fill: var(--dg-panel); stroke: var(--dg-muted)" stroke-width="1"/>
<text x="592" y="216" text-anchor="middle" font-size="11" font-weight="700">2</text>
<circle cx="300" cy="332" r="9" style="fill: var(--dg-panel); stroke: var(--dg-muted)" stroke-width="1"/>
<text x="300" y="336" text-anchor="middle" font-size="11" font-weight="700">3</text>
<circle cx="112" cy="250" r="9" style="fill: var(--dg-panel); stroke: var(--dg-muted)" stroke-width="1"/>
<text x="112" y="254" text-anchor="middle" font-size="11" font-weight="700">4</text>
<circle cx="219" cy="40" r="9" style="fill: var(--dg-panel); stroke: var(--dg-muted)" stroke-width="1"/>
<text x="219" y="44" text-anchor="middle" font-size="11" font-weight="700">5</text>
<circle cx="380" cy="112" r="9" style="fill: var(--dg-panel); stroke: var(--dg-muted)" stroke-width="1"/>
<text x="380" y="116" text-anchor="middle" font-size="11" font-weight="700">6</text>
</svg>`,
        },
        {
          type: `steps`,
          title: `Request flow`,
          items: [
            `The matching service picks the top driver on its ranked list, records the offer on the ride (<code>offered_driver_id</code>) and asks the notification service to send it.`,
            `The notification service sends a push through APNs or FCM, carrying the ride id, the pickup area and the fare.`,
            `The offer appears on the driver's phone with a countdown (say 10 seconds).`,
            `The driver taps Accept; the app sends <code>PATCH /rides/:rideId</code> with <code>accept</code>. (On Decline, matching offers the ride to the next driver on the list.)`,
            `The gateway authenticates the driver and routes the call to the ride service.`,
            `The ride service assigns the driver with a <strong>conditional update</strong>: only if the ride is still REQUESTED and this driver holds the offer. It returns the pickup and destination.`,
            `The driver app navigates with the phone's GPS and the maps SDK; location updates continue, now marked "on trip".`,
          ],
        },
        {
          type: `code`,
          title: `Accepting an offer (pseudo-code)`,
          lang: `text`,
          code: `on PATCH /rides/:rideId { action: 'accept' }        driver = session.driverId
  UPDATE rides
     SET status = 'ACCEPTED', driver_id = :driver, accepted_at = now()
   WHERE id = :rideId
     AND status = 'REQUESTED'
     AND offered_driver_id = :driver          -- only the driver holding the offer
  1 row:  mark the driver on trip; return 200 with pickup and destination
  0 rows: return 409 OFFER_EXPIRED (window closed, or the ride moved on)`,
        },
        {
          type: `compare`,
          title: `How does the offer reach the driver?`,
          items: [
            { title: `Driver app polls for offers`, tone: `bad`, html: `<p>Polling every second from millions of phones is a huge, mostly empty load; polling every 10 seconds wastes the whole acceptance window.</p>` },
            { title: `Push through APNs / FCM`, tone: `ok`, html: `<p>Works when the app is in the background, which drivers' apps often are. Delivery is usually fast but not guaranteed, which is why the offer has a timeout.</p>` },
            { title: `Persistent connection while the app is open`, tone: `info`, html: `<p>A WebSocket or similar long-lived connection gives lower latency and confirmed delivery while the driver app is in the foreground. Many designs use it as the fast path and push as the fallback.</p>` },
          ],
        },
        {
          type: `quiz`,
          q: `Two drivers somehow both have the app showing an offer for ride r_9f04 and both tap Accept. What makes sure only one is assigned?`,
          options: [
            `The API gateway serialises PATCH requests`,
            `The conditional UPDATE: it only succeeds while the ride is REQUESTED and the caller holds the offer, so the second one changes zero rows and gets 409`,
            `The notification service cancels the second push`,
            `Nothing; the rider gets two drivers`,
          ],
          answer: 1,
          explain: `The database checks the condition and writes in one statement under the row lock. Whoever commits first moves the ride to ACCEPTED; the other update no longer matches and is told the offer expired.`,
        },
      ],
    },
    {
      id: `final-design`,
      title: `The final design`,
      kicker: `Every deep dive applied`,
      blocks: [
        {
          type: `text`,
          html: `<p>Keep the four-step design's flow and correctness rules, and replace each weak part with the deep dives' strong answers:</p>
<ul>
<li><strong>Location service + Redis geo index</strong> (deep dive 1): positions go into an in-memory geospatial index keyed by region (<code>GEOADD</code>), searched with <code>GEOSEARCH</code>; a sweeper drops drivers who stop reporting.</li>
<li><strong>Adaptive updates in the driver app</strong> (deep dive 2): the phone reports more often when it matters and less when parked.</li>
<li><strong>Per-driver locks in Redis</strong> (deep dive 3): <code>SET ... NX PX 10000</code> gives each driver at most one outstanding offer; the conditional accept is the final guarantee.</li>
<li><strong>A ride-request queue partitioned by region</strong> (deep dive 4): <code>POST /rides</code> enqueues; consumers commit only once the request is safely owned.</li>
<li><strong>A durable matching workflow</strong> (deep dive 5): offer, wait up to 10 s, move to the next driver, all surviving crashes, within a 60-second limit.</li>
<li><strong>Geo-sharding</strong> (deep dive 6): services, queue partitions, Redis and the database are deployed per region; searches near a boundary ask both neighbours.</li>
</ul>`,
        },
        {
          type: `diagram`,
          title: `Uber: final design`,
          caption: `Requests enter through the gateway. The ride service stores fares and rides in Postgres and enqueues new rides on a regional queue. A durable matching workflow searches the Redis geo index, locks a driver, and offers the ride through the notification service and APNs/FCM. Driver apps report positions to the location service, which keeps the geo index fresh. Everything right of the gateway is deployed per region.`,
          svg: `<svg viewBox="0 0 640 420" role="img" aria-label="Final design: rider and driver apps through an API gateway; ride service with Postgres and a maps API; a regional ride queue feeding a Temporal matching workflow; Redis with driver locks and a geo index fed by the location service; notification service and APNs or FCM pushing offers to the driver app">
<defs><marker id="ub-arrow-fin" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="10" y="30" width="90" height="50" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="55" y="60" text-anchor="middle" font-size="13" font-weight="700">Rider app</text>
<rect x="10" y="300" width="90" height="50" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="55" y="322" text-anchor="middle" font-size="13" font-weight="700">Driver app</text>
<text x="55" y="339" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">adaptive GPS</text>
<rect x="120" y="30" width="80" height="320" rx="8" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="1.5"/>
<text x="160" y="182" text-anchor="middle" font-size="13" font-weight="700">API</text>
<text x="160" y="199" text-anchor="middle" font-size="13" font-weight="700">gateway</text>
<rect x="225" y="30" width="130" height="50" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="1.5"/>
<text x="290" y="52" text-anchor="middle" font-size="13" font-weight="700">Ride service</text>
<text x="290" y="69" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">fares, rides, accept</text>
<rect x="225" y="110" width="130" height="50" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<text x="290" y="132" text-anchor="middle" font-size="13" font-weight="700">Ride queue</text>
<text x="290" y="149" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">Kafka, by region</text>
<rect x="225" y="190" width="130" height="56" rx="8" style="fill: var(--dg-5-soft); stroke: var(--dg-5)" stroke-width="1.5"/>
<text x="290" y="212" text-anchor="middle" font-size="13" font-weight="700">Matching</text>
<text x="290" y="230" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">Temporal workflow</text>
<rect x="225" y="300" width="130" height="50" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<text x="290" y="322" text-anchor="middle" font-size="13" font-weight="700">Location svc</text>
<text x="290" y="339" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">validate, index</text>
<rect x="385" y="8" width="115" height="44" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5" stroke-dasharray="5 4"/>
<text x="442" y="27" text-anchor="middle" font-size="12" font-weight="700">Maps API</text>
<text x="442" y="43" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">third party</text>
<rect x="385" y="70" width="115" height="56" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<text x="442" y="93" text-anchor="middle" font-size="13" font-weight="700">Postgres</text>
<text x="442" y="111" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">Fare, Ride, Driver</text>
<rect x="385" y="185" width="115" height="170" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<text x="442" y="204" text-anchor="middle" font-size="13" font-weight="700">Redis</text>
<rect x="395" y="214" width="95" height="54" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-5)" stroke-width="1"/>
<text x="442" y="236" text-anchor="middle" font-size="12" font-weight="700">driver locks</text>
<text x="442" y="254" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">SET NX PX</text>
<rect x="395" y="284" width="95" height="60" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-2)" stroke-width="1"/>
<text x="442" y="306" text-anchor="middle" font-size="12" font-weight="700">geo index</text>
<text x="442" y="324" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">GEOSEARCH</text>
<rect x="520" y="14" width="112" height="92" rx="8" style="fill: none; stroke: var(--dg-line)" stroke-width="1" stroke-dasharray="4 4"/>
<text x="576" y="40" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">services, queue,</text>
<text x="576" y="56" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">Redis and DB</text>
<text x="576" y="72" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">are geo-sharded</text>
<text x="576" y="88" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">by region</text>
<rect x="525" y="140" width="105" height="50" rx="8" style="fill: var(--dg-6-soft); stroke: var(--dg-6)" stroke-width="1.5"/>
<text x="577" y="162" text-anchor="middle" font-size="13" font-weight="700">Notification</text>
<text x="577" y="179" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">service</text>
<rect x="525" y="250" width="105" height="50" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5" stroke-dasharray="5 4"/>
<text x="577" y="272" text-anchor="middle" font-size="12" font-weight="700">APNs / FCM</text>
<text x="577" y="289" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">push</text>
<line x1="100" y1="55" x2="118" y2="55" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ub-arrow-fin)"/>
<line x1="100" y1="325" x2="118" y2="325" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ub-arrow-fin)"/>
<line x1="200" y1="55" x2="223" y2="55" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ub-arrow-fin)"/>
<line x1="200" y1="325" x2="223" y2="325" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ub-arrow-fin)"/>
<line x1="355" y1="42" x2="383" y2="30" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ub-arrow-fin)"/>
<line x1="355" y1="66" x2="383" y2="95" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ub-arrow-fin)"/>
<line x1="290" y1="80" x2="290" y2="108" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ub-arrow-fin)"/>
<line x1="290" y1="160" x2="290" y2="188" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ub-arrow-fin)"/>
<line x1="355" y1="226" x2="393" y2="226" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ub-arrow-fin)"/>
<line x1="355" y1="242" x2="393" y2="296" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ub-arrow-fin)"/>
<line x1="355" y1="325" x2="393" y2="325" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ub-arrow-fin)"/>
<path d="M355 198 H370 V165 H523" style="fill: none; stroke: var(--dg-muted)" stroke-width="1.5" marker-end="url(#ub-arrow-fin)"/>
<line x1="577" y1="190" x2="577" y2="248" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ub-arrow-fin)"/>
<path d="M577 300 V385 H55 V352" style="fill: none; stroke: var(--dg-6)" stroke-width="1.5" stroke-dasharray="5 4" marker-end="url(#ub-arrow-fin)"/>
<text x="316" y="403" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">ride offer (push); the accept returns through the gateway</text>
</svg>`,
        },
        {
          type: `table`,
          title: `Requirement to component`,
          headers: [`Requirement`, `Component`],
          rows: [
            [`Fare estimate`, `Ride service, maps API, Fare stored with an expiry in Postgres`],
            [`Request a ride`, `Ride service (idempotent POST /rides), Ride in REQUESTED, regional ride queue`],
            [`Match with a nearby available driver`, `Location service, Redis geo index of available drivers per region, matching workflow`],
            [`Accept or decline, navigate`, `Notification service, APNs/FCM, conditional accept in the ride service, maps SDK on the phone`],
            [`Low-latency matching (≤ 1 min)`, `In-memory geo search in milliseconds; 10 s per offer; workflow deadline of 60 s`],
            [`One offer per driver, one driver per ride`, `Redis lock per driver with a 10 s TTL; conditional UPDATE on accept`],
            [`Peak bursts without losing requests`, `Durable queue partitioned by region, autoscaled consumers, durable workflows`],
            [`2M location updates/s`, `Adaptive client updates, Redis sharded by region, no per-update database write`],
          ],
        },
      ],
    },
    {
      id: `walkthrough`,
      title: `One ride, end to end`,
      kicker: `Request walk-through`,
      blocks: [
        {
          type: `steps`,
          items: [
            `<strong>All the time:</strong> each available driver's app sends its position when it has moved enough or its interval has passed. The location service checks the token and the plausibility of the jump, then runs <code>GEOADD drivers:sf:available</code> and records the server timestamp in <code>drivers:sf:seen</code>.`,
            `<strong>Estimate:</strong> the rider asks for a fare; the ride service gets distance and duration from the maps API, prices the trip in cents and stores Fare f_71c2 with a five-minute expiry.`,
            `<strong>Request:</strong> the rider sends <code>POST /rides</code> with f_71c2 and an Idempotency-Key. The ride service checks the fare is theirs and valid, inserts Ride r_9f04 in REQUESTED and publishes it to the San Francisco partition of the ride queue. The app shows "Finding your driver".`,
            `<strong>Hand-off:</strong> a matching consumer starts a workflow for r_9f04 (workflow id = ride id, so a redelivered message cannot start a second one) and commits the queue offset.`,
            `<strong>Search:</strong> the workflow runs <code>GEOSEARCH</code> within 2 km of the pickup, drops drivers whose last update is too old, and ranks the rest by ETA.`,
            `<strong>Offer:</strong> for the top driver d42 it runs <code>SET lock:driver:d42 r_9f04 NX PX 10000</code>. On OK it records <code>offered_driver_id = d42</code> on the ride and the notification service pushes the offer. On nil, d42 is busy, so it tries the next driver.`,
            `<strong>Wait:</strong> the workflow waits up to 10 s for d42's answer. Decline or silence: release the lock if still held, try the next driver. After 60 s with no taker: mark the ride NO_DRIVER and tell the rider.`,
            `<strong>Accept:</strong> d42 sends <code>PATCH /rides/r_9f04</code>. The conditional UPDATE succeeds (REQUESTED and offered to d42), the ride service signals the workflow, the driver leaves the available geo set, and the rider sees the car and ETA.`,
            `<strong>Trip:</strong> the driver navigates with the phone's GPS; the ride moves to IN_PROGRESS at pickup and COMPLETED at drop-off, and the driver goes back into the available set.`,
          ],
        },
        {
          type: `callout`,
          tone: `interview`,
          title: `The one-minute summary`,
          html: `<p>Rider and driver apps through a gateway. The ride service stores server-side fares and rides, takes requests idempotently and enqueues them on a queue partitioned by region. A durable workflow per ride searches a Redis geo index of available drivers, locks one driver at a time with a 10-second TTL, pushes the offer through APNs/FCM and moves on after a decline or timeout, within 60 seconds. Accepts are conditional updates, so one driver per ride is guaranteed in the database. Driver apps send adaptive location updates into Redis, sharded by region like everything else.</p>`,
        },
        {
          type: `quiz`,
          q: `A rider in San Francisco requests a ride. Which store is on the path of the proximity search?`,
          options: [
            `Postgres, with an index on latitude and longitude`,
            `The Redis geo index for the San Francisco region`,
            `The ride-request queue`,
            `The maps API`,
          ],
          answer: 1,
          explain: `Positions live in the in-memory geo index sharded by region; GEOSEARCH answers in milliseconds. Postgres holds fares and rides, the queue carries requests, and the maps API computes routes and ETAs.`,
        },
      ],
    },
  ],

  // ------------------------------------------------------------------ By level
  levels: [
    {
      id: `mid`,
      title: `Mid-level`,
      kicker: `A working, correct design`,
      blocks: [
        {
          type: `keypoints`,
          title: `What the interviewer expects`,
          items: [
            `Clear requirements, entities and an API in which <strong>user ids, timestamps and prices come from the server</strong>, not the request.`,
            `A high-level design that delivers all four functional requirements: gateway, ride service, maps API, database, location service, matching, notifications.`,
            `Recognising that latitude and longitude columns can't answer "who is near" efficiently and that some <strong>spatial index</strong> is needed, even without naming Redis GEO.`,
            `At least the database-flag approach to locking drivers (status plus a timeout), and a conditional update when a driver accepts.`,
          ],
        },
        {
          type: `list`,
          title: `Who drives`,
          items: [
            `You drive requirements, entities, API and the four-step design.`,
            `The interviewer usually leads the deep dives: "how do you store 2M updates a second?", "what if two matchers pick the same driver?".`,
            `Needing hints on geohash internals, queues or durable execution is acceptable.`,
          ],
        },
        {
          type: `callout`,
          tone: `mistake`,
          title: `Common pitfalls`,
          html: `<ul>
<li>Taking the rider id, the price or a timestamp from the request body.</li>
<li>Writing every location update to the main database without noticing it is ~2M writes a second.</li>
<li>Broadcasting one ride to ten drivers at once with no plan for two accepts.</li>
<li>No timeout on offers, so a silent driver stalls the rider forever.</li>
</ul>`,
        },
      ],
    },
    {
      id: `senior`,
      title: `Senior`,
      kicker: `Numbers, depth, failure cases`,
      blocks: [
        {
          type: `keypoints`,
          title: `What the interviewer expects`,
          items: [
            `A quick pass through the high-level design so most of the time goes to depth.`,
            `Numbers that drive choices: 2M updates/s, ~1 GB of live state, 60 s ÷ 10 s = 6 offers.`,
            `Detailed treatment of <strong>at least two</strong> of: the geo index (geohash scores, neighbour cells, stale cleanup, durability), driver locking (TTL lock plus conditional accept), and request queueing (commit after hand-off, partitions by region).`,
            `Sharding and replication by region, and why hashing by driver id would make every search a scatter-gather.`,
            `Clear pros and cons for each choice, including what fails and how it recovers.`,
          ],
        },
        {
          type: `list`,
          title: `Who drives`,
          items: [
            `You lead most deep dives; the interviewer probes failures: a Redis failover, a matcher crashing mid-offer, an accept that arrives after the window.`,
            `Some hints on scaling details are fine, but the main mechanisms should come from you.`,
          ],
        },
        {
          type: `callout`,
          tone: `mistake`,
          title: `Common pitfalls`,
          html: `<ul>
<li>Treating the Redis lock as the only guarantee, with no conditional update behind it.</li>
<li>One global Redis key for every driver on Earth (one key lives on one node).</li>
<li>No plan for drivers who go silent and stay in the index.</li>
<li>"Autoscaling" as the whole answer to a stadium burst.</li>
</ul>`,
        },
      ],
    },
    {
      id: `staff`,
      title: `Staff`,
      kicker: `Judgement and trade-offs`,
      blocks: [
        {
          type: `keypoints`,
          title: `What the interviewer expects`,
          items: [
            `Depth in <strong>three or more</strong> areas, chosen deliberately, with the reason for the choice.`,
            `Framing the data as <strong>soft state</strong> (positions: fast, lossy, rebuilt in seconds) and <strong>hard state</strong> (assignments: durable, exact), and spending consistency only where it is needed.`,
            `Designing the <strong>client</strong> too: adaptive updates, sanity checks against GPS spoofing, behaviour when the phone loses signal.`,
            `Seeing that at a stadium the bottleneck is <strong>supply</strong>: the queue keeps requests safe, but product levers (pricing, pickup zones, batching requests for a second or two to solve a better assignment) actually clear demand.`,
            `Operations: per-region failure isolation, degraded modes (widen the radius, longer waits), and metrics such as time to match, offer acceptance rate and queue lag.`,
          ],
        },
        {
          type: `list`,
          title: `Who drives`,
          items: [
            `You run the interview; the interviewer intervenes only to focus it.`,
            `A strong sign is the interviewer learning something: for example why consistent hashing of fine cells scatters neighbours, or how durable workflows turn the offer loop into ordinary code.`,
          ],
        },
        {
          type: `callout`,
          tone: `mistake`,
          title: `Common pitfalls`,
          html: `<ul>
<li>Listing every option without committing to one.</li>
<li>Global consensus or multi-region transactions for a 10-second lock.</li>
<li>Ignoring cost, such as keeping 20 TB a day of raw positions in a hot store.</li>
</ul>`,
        },
      ],
    },
  ],

  // ------------------------------------------------------------------ Core concepts
  concepts: [
    { term: `Fare estimate (stored quote)`, def: `A Fare record with the rider, both points, the price in minor units and an expiry, created by <code>POST /fare</code>.`, why: `The ride request refers to it by id, so the price the rider saw is the price they get and the client never sends a price.` },
    { term: `Ride state machine`, def: `REQUESTED, ACCEPTED, IN_PROGRESS, COMPLETED, with CANCELLED and NO_DRIVER as exits. Each transition is a conditional update from the expected previous state.`, why: `Concurrent actors (two accepts, a timeout and an accept, a cancel) race on the same ride; conditional transitions let exactly one win.` },
    { term: `Soft state vs hard state`, def: `Soft state is replaced constantly and can be rebuilt (driver positions); hard state must be durable and exact (rides, assignments, fares).`, why: `It tells you where to spend consistency and where to spend speed: positions go to memory, assignments go to the database.` },
    { term: `Proximity search`, def: `"Which points lie within r of here?", answered by an index over two dimensions rather than a scan.`, why: `A B-tree on latitude narrows only one dimension, so it returns a long strip of the map that must then be filtered by longitude.` },
    { term: `Geohash`, def: `Interleaves the bits of longitude and latitude into one number or string; points that share a longer prefix are usually close. Length 5 is ~4.9 km × 4.9 km, length 6 ~1.2 km × 0.6 km.`, why: `It turns a 2D search into range lookups on a 1D sorted key. Neighbours across a cell edge have different prefixes, so searches also check adjacent cells.` },
    { term: `Quadtree and PostGIS`, def: `A quadtree splits a square into four whenever it holds too many points, so dense areas get small cells; PostGIS adds geospatial types and GiST indexes to Postgres.`, why: `Both make proximity queries fast in a database, but neither fixes the cost of millions of position writes per second.` },
    { term: `Redis GEO commands`, def: `<code>GEOADD</code> stores a member with a 52-bit geohash score in a sorted set; <code>GEOSEARCH</code> returns members within a radius or box, sorted by distance.`, why: `Updates overwrite in place and searches touch only nearby cells, both in memory. Shard keys by region because one key lives on one node.` },
    { term: `Stale driver cleanup`, def: `A companion sorted set scored by last-update time; a sweeper removes members older than a threshold (say 30 s) from both sets.`, why: `A phone that dies or loses signal never says goodbye; without cleanup, matching offers rides to ghosts.` },
    { term: `Adaptive location updates`, def: `The driver app decides when to send: rarely when parked, more often when moving, turning, near a pending request or heading to a pickup.`, why: `Cuts update traffic by about half in a typical mix without losing accuracy where it matters, and saves battery and data.` },
    { term: `Distributed lock with a TTL (lease)`, def: `<code>SET lock:driver:d42 r1 NX PX 10000</code>: succeeds only if no lock exists, and expires on its own after the acceptance window.`, why: `Gives each driver at most one outstanding offer across all matchers, and a crashed matcher cannot leave a driver locked forever.` },
    { term: `Conditional assignment (fencing)`, def: `Accept with <code>UPDATE ... WHERE status = 'REQUESTED' AND offered_driver_id = :driver</code>; zero rows means the offer is no longer valid.`, why: `Locks can be lost in a failover or outlived by a slow process; the database condition is the guarantee that one ride gets one driver.` },
    { term: `Durable queue, commit after hand-off`, def: `Ride requests are written to a replicated queue; a consumer commits its offset (or deletes the message) only after the request is matched or owned by a durable workflow.`, why: `A crashed consumer's requests are redelivered instead of lost, at the price of at-least-once delivery and idempotent handling.` },
    { term: `Head-of-line blocking`, def: `In an ordered partition processed one at a time, a slow request (no drivers nearby) holds up the requests behind it.`, why: `Process many requests per partition concurrently, or hand each to a workflow and commit at once; use priority lanes for long waits.` },
    { term: `Delay queue`, def: `A message that becomes visible only after a delay, such as "check offer attempt 3 of ride r1 in 10 s".`, why: `Moves the timeout out of process memory, but the check must be conditional on the attempt to avoid racing with a late accept.` },
    { term: `Durable execution`, def: `Workflow engines such as Temporal or AWS Step Functions persist each step, timer and signal, so a workflow resumes after crashes exactly where it was.`, why: `The offer loop (offer, wait 10 s, next driver, give up at 60 s) becomes ordinary code with timeouts, instead of a web of queues and sweepers.` },
    { term: `Geo-sharding`, def: `Partition services, queues, indexes and databases by geographic region, so a city's traffic is served by nearby infrastructure.`, why: `Rides are local: nearly every query stays inside one shard, latency drops, and an outage is contained to one region.` },
    { term: `Scatter-gather at boundaries`, def: `When a search circle crosses into a neighbouring shard, query both shards and merge the results by distance.`, why: `Only a small share of searches sit near a boundary, so the common case stays single-shard.` },
    { term: `Consistent hashing`, def: `Map keys (regions or cells) and nodes onto a ring; each key belongs to the next node clockwise, so adding a node moves only about 1/N of the keys.`, why: `Rebalances shards without a reshuffle. Hash coarse regions, not tiny cells, or neighbouring cells scatter across nodes.` },
  ],

  labs: [],

  // ------------------------------------------------------------------ Cheatsheet
  cheatsheet: [
    { title: `Requirements`, type: `table`, headers: [`Kind`, `Requirement`, `Design consequence`], rows: [
      [`Functional`, `Fare estimate`, `Ride service + maps API; Fare stored with an expiry`],
      [`Functional`, `Request a ride`, `POST /rides with fareId only; idempotent; Ride in REQUESTED`],
      [`Functional`, `Match with a nearby available driver`, `Location service, geo index, matching workflow`],
      [`Functional`, `Accept or decline, navigate`, `Push via APNs/FCM; conditional accept; GPS on the phone`],
      [`Non-functional`, `Match within ~1 minute`, `In-memory geo search; 10 s per offer; 60 s deadline`],
      [`Non-functional`, `One offer per driver, one driver per ride`, `TTL lock per driver + conditional UPDATE`],
      [`Non-functional`, `~100K requests from one area`, `Regional queue, autoscaled consumers, durable workflows`],
    ] },
    { title: `Numbers for a large network`, type: `code`, body: `drivers:        ~10M active, 1 update every ~5 s
location load:  10M / 5 s                  = 2M updates/s
ingress:        2M/s x 100 B               = 200 MB/s (~1.6 Gbit/s)
live state:     10M x 100 B                ~ 1 GB (fits in memory)
history:        2M/s x 10^5 s x 100 B      ~ 20 TB/day (keep out of hot store)
rides:          20M/day / 10^5 s           ~ 200/s avg, ~1,000/s peak
stadium burst:  100K requests / 300 s      ~ 333/s on a few km^2
match budget:   60 s / 10 s per offer      = 6 drivers in sequence
postgres:       2M / 10-20K per node       = 100-200 nodes (no)
redis:          2M / 100K per node         ~ 20 nodes (yes, by region)` },
    { title: `Final design`, type: `code`, body: `rider app ---> API gateway ---> ride service ---> Postgres (Fare, Ride)
                     |               +---> maps API (distance, time)
                     |               v
                     |        ride queue (Kafka, partition = region)
                     |               v
                     |        matching workflow (Temporal, per ride)
                     |          | GEOSEARCH            | SET NX PX 10000
                     |          v                      v
                     |        Redis geo index        Redis driver locks
                     |          ^
driver app ----------+--> location service (GEOADD + last-seen set)
    ^
    +---- APNs / FCM <--- notification service <--- matching workflow` },
    { title: `Deep-dive decisions`, type: `table`, headers: [`Question`, `Weak`, `Better`, `Best`], rows: [
      [`Location writes and proximity`, `Every update to the DB; scan lat/long`, `Batched writes + PostGIS or quadtree`, `Redis GEO by region + last-seen sweeper`],
      [`Update volume`, `Fixed 5 s for everyone`, `Server-side throttling`, `Adaptive client intervals + server hints`],
      [`One offer per driver`, `In-process lock and timer`, `DB status flag + expiry (+ sweeper)`, `Redis SET NX PX 10000 + conditional accept`],
      [`Peak demand`, `Direct call, no queue`, `In-memory queue in the matcher`, `Durable queue by region, commit after hand-off`],
      [`Silent driver`, `In-memory timer`, `Delay queue with conditional check`, `Durable workflow: offer, wait 10 s, next`],
      [`Scale further`, `Bigger machines`, `Shard by driver id (scatter-gather)`, `Geo-shard by region + replicas + boundary queries`],
    ] },
    { title: `Failure modes and fixes`, type: `table`, headers: [`Failure`, `Fix`], rows: [
      [`Redis geo node fails over`, `Replica takes over; positions refill within one update interval`],
      [`Driver's phone goes silent`, `Last-seen sweeper removes it after ~30 s`],
      [`Redis lock lost in failover`, `Conditional accept in Postgres still allows only one driver per ride`],
      [`Matcher crashes mid-offer`, `Queue redelivers or the workflow resumes; workflow id = ride id prevents duplicates`],
      [`Driver accepts after the window`, `Conditional UPDATE matches 0 rows: 409 OFFER_EXPIRED`],
      [`Rider double-taps Request`, `Idempotency-Key and unique fare_id return the same ride`],
      [`No driver within 60 s`, `Workflow marks NO_DRIVER and tells the rider promptly`],
    ] },
  ],

  // ------------------------------------------------------------------ Interview Q&A
  interview: [
    { q: `What are the core functional requirements, and what would you leave below the line?`, a: `Above the line: a rider gets a fare estimate for a pickup and destination, requests a ride at that fare, is matched with a nearby available driver, and the driver accepts or declines and navigates. Below the line: ratings in both directions, scheduled rides, ride categories, payments and receipts, surge pricing. Name them, then confirm with the interviewer.`, diff: `easy` },
    { q: `Why store the fare estimate, and why does POST /rides take only a fareId?`, a: `The estimate is a quote the rider will act on. Storing it with the rider id and an expiry means the request can refer to it by id, and the server uses the stored price. If the request carried a price, a modified client could request any ride for one cent. The server also checks that the fare belongs to the caller and has not expired.`, diff: `easy` },
    { q: `Which values in your API must never come from the client?`, a: `User identity (rider or driver id) comes from the authenticated session or JWT; timestamps come from the server clock; prices come from the stored Fare. The client supplies only what it alone knows: chosen points, the fare id it accepts, its GPS reading, accept or decline. Every id it sends is checked for ownership.`, diff: `easy` },
    { q: `Estimate the location update load and the size of the live state.`, a: `10M active drivers updating every 5 seconds is 2M updates a second. At ~100 bytes each that is ~200 MB/s of ingress. Each driver has one latest position, so the live state is ~10M × 100 B ≈ 1 GB, which fits in memory. A day of history would be ~20 TB, so history goes elsewhere if kept at all. The challenge is the write rate, not the size.`, diff: `medium` },
    { q: `Why not keep driver locations in Postgres with indexes on latitude and longitude?`, a: `Two reasons. Writes: 2M row updates a second needs on the order of 100-200 nodes, and every update creates a new row version to vacuum, for data that is stale in seconds. Queries: a B-tree on latitude narrows to a band across the whole map, which must then be filtered by longitude, so a radius search reads far more rows than it returns. PostGIS fixes the query side, not the write side.`, diff: `medium` },
    { q: `How does Redis answer "available drivers within 2 km of this point"?`, a: `Each region has a sorted set such as drivers:sf:available. GEOADD stores each driver with a 52-bit geohash of its longitude and latitude as the score, overwriting the previous position. GEOSEARCH FROMLONLAT ... BYRADIUS 2 km ASC computes the geohash cells that cover the circle (including neighbours across cell edges), range-scans those score ranges, then filters by exact distance and sorts. It touches only nearby members, in memory, in milliseconds.`, diff: `hard` },
    { q: `What happens to matching if the Redis geo index loses its data?`, a: `Positions are soft state. A replica takes over, perhaps a second behind, or an empty node starts filling immediately because every active driver reports again within one update interval. For a few seconds matching may see fewer drivers, which is acceptable. Persistence (AOF) and replicas narrow the gap, but you don't need disk-grade durability for data that expires in seconds.`, diff: `medium` },
    { q: `How do you remove drivers who stop sending updates?`, a: `Alongside the geo set, keep a sorted set of driver ids scored by the server time of their last update. A sweeper every few seconds finds members older than ~30 s and removes them from both sets. Matching can also discard results whose last-seen time is too old. Drivers who go off duty send an explicit "offline" that removes them at once.`, diff: `medium` },
    { q: `How would you reduce location traffic without hurting match quality?`, a: `Make the client adaptive: a parked driver sends a heartbeat every ~30 s, a moving driver every ~10 s or when it has moved a set distance, any sharp turn triggers an update, and a driver with a pending offer or heading to a pickup reports every 2-3 s. With a plausible mix (40% parked, 45% moving, 15% near a pickup) the load drops from 2M/s to about 1.1M/s. The server can raise the rate in busy cells through remote configuration.`, diff: `medium` },
    { q: `How do you stop two matchers offering the same driver two rides at once?`, a: `Before sending an offer, the matcher takes a per-driver lock: SET lock:driver:d42 <rideId> NX PX 10000. Only one matcher gets OK; the others skip d42 and try their next candidate. The TTL equals the acceptance window, so a crashed matcher's lock simply expires. On a reply, release with a compare-and-delete so you never delete a lock that now belongs to another ride. It mirrors holding a seat at checkout in a ticketing system.`, diff: `hard` },
    { q: `Isn't a Redis lock unsafe if Redis fails over? How do you still guarantee one driver per ride?`, a: `It can be lost: replication is asynchronous, so a lock written just before a failover may vanish and a second matcher could offer the same driver. That is tolerable because the lock only prevents duplicate offers. The guarantee lives in the database: accepting is UPDATE ... WHERE status = 'REQUESTED' AND offered_driver_id = :driver, so a ride gets exactly one driver, and a driver who is already on a trip can be rejected by the same kind of conditional update on the driver row.`, diff: `hard` },
    { q: `A stadium empties and 100,000 people request rides within five minutes. What happens?`, a: `That is ~333 requests a second on a few square kilometres, with perhaps a few thousand drivers nearby, so most riders must wait. POST /rides writes the ride and publishes it to the region's queue, returning at once. Matching consumers scale out on queue lag; hot regions use several partitions keyed by region and cell. No request is lost while it waits, and riders who exceed the 60-second limit get a clear "no drivers" answer. Pricing and pickup zones are the product levers that actually balance supply and demand.`, diff: `medium` },
    { q: `A matching server crashes halfway through offering a ride. Is the request lost?`, a: `No. The queue offset was not committed (or the message not deleted), so the request is redelivered to another consumer. Handling must be idempotent: check the ride's status and current offer first, and start the workflow with the ride id as its id so a duplicate cannot start a second search. With durable execution the workflow itself resumes from its last recorded step.`, diff: `medium` },
    { q: `A driver neither accepts nor declines. How does the system move on, and why use durable execution?`, a: `An in-memory timer is lost on a crash. A delay queue works: schedule "check attempt n of ride r in 10 s" and move on only if a conditional update shows the ride is still waiting on that attempt. Durable execution is cleaner: a workflow sends the offer, waits for a reply signal with a 10-second timeout, tries the next driver, and gives up at 60 s. The engine persists every step and timer, so the loop survives crashes and deploys without extra sweepers.`, diff: `hard` },
    { q: `How do you scale beyond one region, and what about a rider near a boundary?`, a: `Geo-shard: each region runs its own services, queue partitions, Redis geo index and ride database, with read replicas for read-heavy data. Almost every ride stays in one shard, latency is lower, and failures stay local. A search circle that crosses a boundary queries the neighbouring shard too and merges by distance. Placing regions on nodes with consistent hashing makes adding capacity move only a fraction of regions; very busy cities can be split into finer shards.`, diff: `hard` },
    { q: `Push notifications or WebSockets for driver offers?`, a: `Push through APNs and FCM reaches a phone even when the app is in the background, so it is the baseline. A WebSocket kept open while the driver app is in the foreground gives lower latency and confirmed delivery. Either way delivery can fail, which is why every offer has a timeout and the matching loop moves on.`, diff: `medium` },
    { q: `Summarise your final design in a minute.`, a: `Apps talk to a gateway. The ride service stores fares and rides in Postgres, takes requests idempotently and enqueues them on a queue partitioned by region. A durable workflow per ride searches a Redis geo index of available drivers, takes a 10-second TTL lock on one driver, pushes the offer through APNs/FCM, and moves on after a decline or timeout, within 60 seconds. Accepts are conditional updates. Drivers send adaptive location updates to a location service that maintains the geo index and drops silent drivers. Everything is geo-sharded by region.`, diff: `medium` },
  ],
});
