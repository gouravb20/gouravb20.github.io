// Deep dive: Chapter 7, API styles and REST resource design. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch7 = {
  hook: `<p>Fifteen minutes into a ticket-booking interview, you have requirements and a list of entities. The interviewer says, "Let's define the API." One candidate writes <code>POST /bookTicket</code>, <code>GET /getEventSeats?eventId=</code>, <code>POST /cancel</code>, and then spends ten minutes debating whether to use GraphQL. Another writes five clean endpoints in three minutes, names the one that must be idempotent, mentions that the user comes from the auth token, and moves on to the high-level design with time to spare.</p>
<p>Both APIs would work. The second one tells the interviewer something: this person models the domain in resources, knows what each HTTP method promises, knows which requests are dangerous to retry, and doesn't overspend time. This chapter is about producing that second API quickly and being able to defend every choice in it.</p>`,
  sections: [
    {
      id: "the-api-step",
      title: "The API step: from requirements to endpoints",
      kicker: "What the interviewer wants",
      blocks: [
        {
          type: "text",
          html: `<p>In most interview frameworks the API comes right after requirements and core entities, and it should take about five minutes. Its job is to turn each functional requirement into the user-facing endpoints that satisfy it, so the rest of the design has a concrete contract to build against.</p>
<p>The interviewer is looking for three things: a sensible protocol choice stated in a sentence, resources that match the entities you already listed, and correct use of methods, parameters and status codes. They are not looking for completeness. Internal service-to-service APIs usually don't need listing at this stage; it is enough to say during the high-level design that services talk over RPC.</p>`,
        },
        {
          type: "diagram",
          title: "Each requirement becomes an operation on an entity",
          caption: "Functional requirements for a ticket-booking system, the core entity each one touches, and the REST endpoint that satisfies it. The entity list from the previous step does most of the work.",
          svg: `<svg viewBox="0 0 620 250" role="img" aria-label="Mapping from four booking requirements to the entities Event, Ticket and Booking and to REST endpoints">
<defs><marker id="cc7-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<text x="105" y="28" text-anchor="middle" font-size="13" font-weight="700">Requirement</text>
<text x="285" y="28" text-anchor="middle" font-size="13" font-weight="700">Entity</text>
<text x="490" y="28" text-anchor="middle" font-size="13" font-weight="700">Endpoint</text>
<rect x="10" y="45" width="190" height="34" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="105" y="67" text-anchor="middle" font-size="12">Browse events in a city</text>
<rect x="230" y="45" width="110" height="34" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="285" y="67" text-anchor="middle" font-size="12">Event</text>
<rect x="370" y="45" width="240" height="34" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="490" y="67" text-anchor="middle" font-size="12">GET /events?city=NYC</text>
<rect x="10" y="95" width="190" height="34" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="105" y="117" text-anchor="middle" font-size="12">See available seats</text>
<rect x="230" y="95" width="110" height="34" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="285" y="117" text-anchor="middle" font-size="12">Ticket</text>
<rect x="370" y="95" width="240" height="34" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="490" y="117" text-anchor="middle" font-size="12">GET /events/{id}/tickets</text>
<rect x="10" y="145" width="190" height="34" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="105" y="167" text-anchor="middle" font-size="12">Book tickets</text>
<rect x="230" y="145" width="110" height="34" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="285" y="167" text-anchor="middle" font-size="12">Booking</text>
<rect x="370" y="145" width="240" height="34" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="490" y="167" text-anchor="middle" font-size="12">POST /bookings</text>
<rect x="10" y="195" width="190" height="34" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="105" y="217" text-anchor="middle" font-size="12">Cancel my booking</text>
<rect x="230" y="195" width="110" height="34" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="285" y="217" text-anchor="middle" font-size="12">Booking</text>
<rect x="370" y="195" width="240" height="34" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="490" y="217" text-anchor="middle" font-size="12">PATCH /bookings/{id}</text>
<line x1="200" y1="62" x2="227" y2="62" stroke-width="2" marker-end="url(#cc7-arrow)" style="stroke: var(--dg-muted)"/>
<line x1="340" y1="62" x2="367" y2="62" stroke-width="2" marker-end="url(#cc7-arrow)" style="stroke: var(--dg-muted)"/>
<line x1="200" y1="112" x2="227" y2="112" stroke-width="2" marker-end="url(#cc7-arrow)" style="stroke: var(--dg-muted)"/>
<line x1="340" y1="112" x2="367" y2="112" stroke-width="2" marker-end="url(#cc7-arrow)" style="stroke: var(--dg-muted)"/>
<line x1="200" y1="162" x2="227" y2="162" stroke-width="2" marker-end="url(#cc7-arrow)" style="stroke: var(--dg-muted)"/>
<line x1="340" y1="162" x2="367" y2="162" stroke-width="2" marker-end="url(#cc7-arrow)" style="stroke: var(--dg-muted)"/>
<line x1="200" y1="212" x2="227" y2="212" stroke-width="2" marker-end="url(#cc7-arrow)" style="stroke: var(--dg-muted)"/>
<line x1="340" y1="212" x2="367" y2="212" stroke-width="2" marker-end="url(#cc7-arrow)" style="stroke: var(--dg-muted)"/>
</svg>`,
        },
        {
          type: "steps",
          title: "A repeatable five-minute routine",
          items: [
            "State the protocol in one sentence: \"REST over HTTPS for the clients; internal services can use gRPC.\"",
            "For each functional requirement, name the entity it reads or changes.",
            "Write one endpoint per requirement: method, path, the key inputs, and what comes back.",
            "Mark the endpoints where retries are dangerous (creating bookings, payments) and say how you make them safe.",
            "Note that the caller's identity comes from the auth token, then move on.",
          ],
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>Interviewers want a reasonable, consistent API, not a perfect one. If you catch yourself debating whether a field belongs in the path or the body for more than a few seconds, pick one, say why in a sentence, and keep going. You can always revise an endpoint later when the design reveals a need.</p>`,
        },
      ],
    },
    {
      id: "resources",
      title: "Resources are your core entities",
      kicker: "Naming",
      blocks: [
        {
          type: "idea",
          html: `<p>A REST resource is a <strong>thing</strong> in your system, usually one of the core entities: events, venues, tickets, bookings, users. Name collections with <strong>plural nouns</strong> and let the HTTP method supply the verb. <code>POST /bookings</code> creates a booking; there is no need for <code>/createBooking</code>.</p>`,
        },
        {
          type: "text",
          html: `<p>Some operations sound like verbs: cancel, check in, refund, transfer. There are two clean ways to express them without putting verbs in paths:</p>
<ul>
<li><strong>As a state change</strong> on the existing resource: <code>PATCH /bookings/88</code> with <code>{"status": "cancelled"}</code>. Good when the action just moves the resource to another state.</li>
<li><strong>As a new resource</strong> you create: <code>POST /bookings/88/refunds</code>. Good when the action has its own data, lifecycle or history: a refund has an amount, a status and an ID you may fetch later.</li>
</ul>
<h3>Nested or flat?</h3>
<p>Nest a resource under its parent when the parent is always required to make sense of it: tickets only exist within an event, so <code>/events/{id}/tickets</code> reads naturally. Keep resources flat and filter with query parameters when the relationship is optional or there are several ways to slice the collection: <code>/tickets?event_id=123&amp;section=A</code>, or <code>/bookings?status=confirmed</code>. Deep nesting such as <code>/venues/1/events/2/sections/3/tickets/4</code> is a smell: if a ticket has a globally unique ID, <code>/tickets/4</code> is enough.</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "Nested path", tone: "info", html: "<code>GET /events/42/tickets</code><br>Expresses ownership; the parent ID is mandatory. Best for one obvious parent and shallow depth (one level, occasionally two)." },
            { title: "Flat with filters", tone: "ok", html: "<code>GET /tickets?event_id=42&amp;status=available</code><br>Flexible: filters combine and are all optional. Best when items can be queried by several attributes or the parent is optional." },
          ],
        },
        {
          type: "code",
          lang: "text",
          title: "Common smells and their fixes",
          code: `POST /createBooking            ->  POST /bookings
GET  /getEvent?id=42           ->  GET  /events/42
POST /bookings/88/cancel       ->  PATCH /bookings/88  {"status": "cancelled"}
GET  /deleteBooking?id=88      ->  DELETE /bookings/88   (a GET must never change state)
GET  /user/42/booking          ->  GET  /users/42/bookings  (plural collections)`,
        },
        {
          type: "quiz",
          q: "Bookings can be listed per user, per event, or by status. Which design is most flexible?",
          options: [
            "/users/{id}/events/{id}/bookings/{status}",
            "/bookings?user_id=...&event_id=...&status=... with optional filters",
            "A separate endpoint per combination, such as /bookingsByUserAndStatus",
            "POST /searchBookings with all filters in the body",
          ],
          answer: 1,
          explain: "Bookings have several optional ways to be sliced, so a flat collection with combinable query filters handles all of them with one endpoint. Deep nesting forces a single hierarchy, and per-combination endpoints multiply. A POST search endpoint is sometimes justified for very complex queries, but loses GET's cacheability.",
        },
      ],
    },
    {
      id: "inputs",
      title: "Path, query, body and headers: where each input goes",
      kicker: "Parameters",
      blocks: [
        {
          type: "text",
          html: `<p>Each part of a request has a conventional job, and following the convention makes an API predictable without documentation.</p>`,
        },
        {
          type: "table",
          headers: ["Location", "Use it for", "Example"],
          rows: [
            ["Path", "Identifying the resource; required", "<code>/events/42</code>"],
            ["Query string", "Optional modifiers: filters, sorting, pagination, flags", "<code>?city=NYC&amp;sort=date&amp;limit=20</code>"],
            ["Body", "The data being created or changed (POST, PUT, PATCH)", "<code>{\"event_id\": 42, \"ticket_ids\": [7, 8]}</code>"],
            ["Headers", "Metadata about the request: auth, idempotency, content type, versions", "<code>Authorization</code>, <code>Idempotency-Key</code>"],
          ],
        },
        {
          type: "text",
          html: `<p>A quick test for path versus query: if removing the value makes the request mean a different resource, it belongs in the path; if removing it just broadens or reorders the result, it is a query parameter. <code>/events/42</code> without 42 is a different thing; <code>/events?city=NYC</code> without the city is still "events", just more of them.</p>
<h3>Identity never travels in the body</h3>
<p>Notice what is missing from the booking body above: a <code>user_id</code>. The server learns who is booking from the verified token in the <code>Authorization</code> header. If clients could pass a user ID, any user could book or cancel on someone else's behalf by editing a field. When a path names a user (<code>/users/42/bookings</code>), the server still checks that the authenticated caller is allowed to see user 42's bookings, or offers <code>/users/me/bookings</code> instead.</p>`,
        },
        {
          type: "code",
          lang: "http",
          title: "A complete booking request",
          code: `POST /bookings HTTP/1.1
Host: api.tickets.example
Authorization: Bearer eyJhbGciOi...        <- who: from the verified token
Idempotency-Key: 5f1c0a3e-8d2b-4c55-9e57   <- makes a retry safe
Content-Type: application/json

{"event_id": 42, "ticket_ids": [701, 702]}

HTTP/1.1 201 Created
Location: /bookings/88

{"id": 88, "status": "pending_payment", "expires_at": "2026-10-15T18:10:00Z"}`,
        },
        {
          type: "quiz",
          q: "Where does a sort order such as \"newest first\" belong for GET /events?",
          options: [
            "In the path: /events/newest",
            "In a query parameter: /events?sort=-date",
            "In the request body",
            "In the Authorization header",
          ],
          answer: 1,
          explain: "Sorting doesn't identify a different resource; it modifies how the same collection is returned, and it is optional. That is exactly what query parameters are for. GET requests generally shouldn't carry a body, because many caches and proxies ignore or reject it.",
        },
      ],
    },
    {
      id: "methods-and-idempotency",
      title: "What each method promises, and why idempotency matters",
      kicker: "Semantics",
      blocks: [
        {
          type: "text",
          html: `<p>The HTTP specification (RFC 9110) defines two properties that clients and infrastructure rely on.</p>
<p>A method is <strong>safe</strong> if it is read-only: the client doesn't request any change of state. GET and HEAD are safe, which is why browsers prefetch links, crawlers follow them and caches store their responses.</p>
<p>A method is <strong>idempotent</strong> if sending the same request several times has the same intended effect on the server as sending it once. GET, HEAD, PUT and DELETE are idempotent. POST is not, and PATCH is not guaranteed to be. Idempotency matters because networks lose responses: after a timeout the client cannot know whether its request was applied, and it can only blindly retry requests whose repetition is harmless.</p>`,
        },
        {
          type: "diagram",
          title: "The same request delivered twice",
          caption: "Comparing the state after one copy with the state after two is exactly the definition of idempotency. Note that DELETE's second response differs (404), but the server's state does not.",
          svg: `<svg viewBox="0 0 620 232" role="img" aria-label="Table-like diagram of four requests delivered twice, showing state after one and two copies and whether each is idempotent">
<text x="20" y="34" font-size="13" font-weight="700">Request, delivered twice</text>
<text x="330" y="34" text-anchor="middle" font-size="13" font-weight="700">After 1 copy</text>
<text x="455" y="34" text-anchor="middle" font-size="13" font-weight="700">After 2 copies</text>
<text x="570" y="34" text-anchor="middle" font-size="13" font-weight="700">Idempotent?</text>
<line x1="15" y1="46" x2="605" y2="46" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<text x="20" y="75" font-size="12">PUT /bookings/88/seat {A12}</text>
<rect x="275" y="58" width="110" height="26" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="330" y="76" text-anchor="middle" font-size="12">seat A12</text>
<rect x="395" y="58" width="120" height="26" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="455" y="76" text-anchor="middle" font-size="12">seat A12</text>
<rect x="535" y="58" width="70" height="26" rx="5" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)"/>
<text x="570" y="76" text-anchor="middle" font-size="12">Yes</text>
<text x="20" y="120" font-size="12">POST /bookings {event 42}</text>
<rect x="275" y="103" width="110" height="26" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="330" y="121" text-anchor="middle" font-size="12">1 booking</text>
<rect x="395" y="103" width="120" height="26" rx="5" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)"/>
<text x="455" y="121" text-anchor="middle" font-size="12">2 bookings</text>
<rect x="535" y="103" width="70" height="26" rx="5" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)"/>
<text x="570" y="121" text-anchor="middle" font-size="12">No</text>
<text x="20" y="165" font-size="12">DELETE /bookings/88</text>
<rect x="275" y="148" width="110" height="26" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="330" y="166" text-anchor="middle" font-size="12">deleted</text>
<rect x="395" y="148" width="120" height="26" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="455" y="166" text-anchor="middle" font-size="12">deleted (404)</text>
<rect x="535" y="148" width="70" height="26" rx="5" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)"/>
<text x="570" y="166" text-anchor="middle" font-size="12">Yes</text>
<text x="20" y="210" font-size="12">PATCH /events/42 (sold += 1)</text>
<rect x="275" y="193" width="110" height="26" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="330" y="211" text-anchor="middle" font-size="12">sold = 101</text>
<rect x="395" y="193" width="120" height="26" rx="5" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)"/>
<text x="455" y="211" text-anchor="middle" font-size="12">sold = 102</text>
<rect x="535" y="193" width="70" height="26" rx="5" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)"/>
<text x="570" y="211" text-anchor="middle" font-size="12">No</text>
</svg>`,
        },
        {
          type: "lab",
          id: "methodSemantics",
          caption: "Choose a request and how many copies reach the server, then compare the final state with what a single delivery would have produced.",
        },
        {
          type: "text",
          html: `<h3>PUT versus PATCH</h3>
<p><strong>PUT</strong> sends the complete new representation: "make the resource look exactly like this". Fields you omit are, by definition, removed or reset, which is why PUT is idempotent and also why clients rarely want it for large resources. <strong>PATCH</strong> sends only the changes. Whether it is idempotent depends on what the patch says. "Set status to cancelled" gives the same result however often it runs; "append this item" or "increment the counter" does not. The two standard patch formats differ here: JSON Merge Patch (RFC 7396) describes target values, while JSON Patch (RFC 6902) is a list of operations, including array appends that repeat on retry.</p>
<h3>Why DELETE counts as idempotent</h3>
<p>The second DELETE of the same booking usually returns <code>404</code>, which looks like a different outcome. Idempotency is about the <em>server's state</em>, not the response: after one DELETE or after five, the booking is gone. The client should treat a 404 on a retried DELETE as success.</p>
<h3>Making POST safe</h3>
<p>POST creates something new each time, so retrying a timed-out booking could reserve seats twice. The standard fix is an <strong>idempotency key</strong>: the client sends a unique key per logical operation, and the server stores it with the result and returns that result for repeats. The next chapter covers how to implement it without races.</p>`,
        },
        {
          type: "quiz",
          q: "Is PATCH /bookings/88 with {\"status\": \"cancelled\"} idempotent?",
          options: [
            "No, PATCH is never idempotent",
            "Yes, this particular patch sets a value, so repeating it leaves the same state",
            "Only if the server returns 200 both times",
            "Only if sent over HTTPS",
          ],
          answer: 1,
          explain: "The specification doesn't guarantee PATCH is idempotent, but a patch that sets fields to fixed values is idempotent in practice. A patch that appends to a list or increments a number is not. That is why it pays to design patches as \"set\" operations where you can.",
        },
      ],
    },
    {
      id: "status-codes",
      title: "Status codes that tell clients what to do next",
      kicker: "Responses",
      blocks: [
        {
          type: "text",
          html: `<p>A status code is an instruction to the client as much as a description. A handful covers nearly every interview API:</p>`,
        },
        {
          type: "table",
          headers: ["Code", "Meaning", "Booking example", "Client should"],
          rows: [
            ["200 OK", "Success, here is the result", "GET /bookings/88", "Use the body"],
            ["201 Created", "A new resource exists; Location header points to it", "POST /bookings", "Store the new ID"],
            ["202 Accepted", "Accepted for processing later", "Bulk refund queued", "Poll or wait for a callback"],
            ["204 No Content", "Success with no body", "DELETE /bookings/88", "Nothing more"],
            ["400 Bad Request", "Malformed or invalid input", "Missing event_id", "Fix the request; don't retry as is"],
            ["401 / 403", "Not authenticated / not allowed", "Cancelling someone else's booking", "Log in / give up"],
            ["404 Not Found", "No such resource (for this caller)", "Unknown booking ID", "Don't retry"],
            ["409 Conflict", "Clashes with current state", "Seat already taken", "Re-read state, choose again"],
            ["429 Too Many Requests", "Rate limited", "Bot hammering availability", "Back off; honor Retry-After"],
            ["500 / 503", "Server failed / temporarily unavailable", "Database down", "Retry with backoff if idempotent"],
          ],
        },
        {
          type: "realworld",
          items: [
            { org: "GitHub", title: "404 instead of 403", html: "GitHub's REST API documentation notes that some requests needing authentication return <code>404 Not Found</code> rather than <code>403 Forbidden</code>, so that the API doesn't reveal that a private repository exists. Choosing between 403 and 404 is a security decision, not just a style one." },
          ],
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Returning <code>200 OK</code> with <code>{"success": false}</code>. Retry policies, monitoring, load balancers and client libraries all read the status code; a failure dressed as a success slips past every one of them. Use the right 4xx or 5xx code and put the details in a consistent error body.</p>`,
        },
      ],
    },
    {
      id: "beyond-rest",
      title: "When GraphQL or RPC beats plain REST",
      kicker: "Other styles",
      blocks: [
        {
          type: "text",
          html: `<p>REST is the right default for user-facing CRUD-style products, and most interview prompts are exactly that. Two other styles earn their place under specific conditions, and naming the condition is what makes the choice convincing.</p>
<p><strong>GraphQL</strong> fits when many different clients need different slices of the same data and change often: a mobile app that wants a compact event card, a web dashboard that wants venue details, seating charts and sales figures. One typed schema, and each client asks for exactly the fields it needs in a single request. The costs are real: naive resolvers produce the <strong>N+1 problem</strong> (one query for a list, then one per item) unless you batch lookups with a DataLoader-style pattern; authorization must be enforced per field and per object rather than per endpoint; and HTTP caching no longer works out of the box because most queries are POSTs to one URL.</p>
<p><strong>RPC</strong>, usually gRPC, fits internal service-to-service calls where speed and strict contracts matter: the booking service calling inventory and payments thousands of times a second. Calls look like functions (<code>ReserveSeats</code>, <code>ChargeCard</code>), a <code>.proto</code> file defines the contract, and generated clients send compact Protocol Buffers over HTTP/2.</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "REST", tone: "ok", html: "Resource-oriented, cacheable, universal tooling. <strong>Use for:</strong> public and client-facing APIs; the interview default." },
            { title: "GraphQL", tone: "info", html: "Client-shaped queries over one schema. <strong>Use for:</strong> many diverse, fast-changing clients sharing data. <strong>Watch:</strong> N+1, field-level auth, query cost limits." },
            { title: "gRPC", tone: "warn", html: "Typed, binary, action-oriented. <strong>Use for:</strong> hot internal paths and streaming. <strong>Watch:</strong> not browser-native; harder to debug by hand." },
          ],
        },
        {
          type: "realworld",
          items: [
            { org: "Facebook", title: "Where GraphQL came from", html: "GraphQL was built at Facebook so its mobile apps could fetch nested data for feeds in one request, and was open-sourced in 2015. Its origin is a good summary of when it shines: many screens, deeply related data, constrained mobile networks." },
            { org: "Shopify", title: "GraphQL-first platform API", html: "Shopify has made GraphQL the primary interface for its Admin API, which suits a platform with thousands of third-party apps that each need different data." },
          ],
        },
        {
          type: "quiz",
          q: "The interviewer says the mobile app needs a tiny event summary while the web dashboard needs deep event, venue and sales data. What's a strong proposal?",
          options: [
            "Two completely separate backends",
            "Return every field to both clients from REST endpoints",
            "GraphQL (or a backend-for-frontend per client) so each client fetches exactly what it needs, with batching and field-level authorization",
            "gRPC directly from the browser",
          ],
          answer: 2,
          explain: "Diverse clients with different data needs is GraphQL's sweet spot; a backend-for-frontend per client is a lighter alternative. Mentioning batching (N+1) and field-level authorization shows you know the costs as well as the benefits.",
        },
      ],
    },
    {
      id: "interview",
      title: "Using it in a design interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "text",
          html: `<p>Here is what a finished API step for the ticket-booking prompt might look like on the whiteboard. Five endpoints, consistent naming, one idempotency note, identity from the token:</p>`,
        },
        {
          type: "code",
          lang: "text",
          title: "Ticket booking: the whole API step",
          code: `GET    /events?city=NYC&date=2026-11-01&cursor=...  -> Event[] (paginated)
GET    /events/{id}                                  -> Event (with venue)
GET    /events/{id}/tickets?section=A                -> Ticket[] with availability
POST   /bookings  {event_id, ticket_ids}             -> 201 Booking   (Idempotency-Key header)
PATCH  /bookings/{id}  {status: "cancelled"}         -> 200 Booking

The user comes from the Authorization token on every request.
Internal services (inventory, payments) talk gRPC.`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>What makes this answer land:</p>
<ol>
<li>One-sentence protocol choice, with the reason (REST for clients, RPC internally).</li>
<li>Plural noun resources that match the core entities; actions as state changes.</li>
<li>Path for identity, query for filters and pagination, body for data, headers for auth and idempotency.</li>
<li>Correct methods, and the dangerous POST made safe with an idempotency key.</li>
<li>Status codes that guide the client: 201 on create, 409 when a seat is taken, 429 when rate limited.</li>
</ol>`,
        },
        {
          type: "quiz",
          q: "A client retries DELETE /bookings/88 after a timeout and gets 404. How should it interpret that?",
          options: [
            "As a serious error: alert the user",
            "As success: the booking is gone, which is the state the client wanted",
            "It should retry until it gets 204",
            "It should switch to POST /bookings/88/delete",
          ],
          answer: 1,
          explain: "The first attempt most likely succeeded and only its response was lost. DELETE is idempotent in terms of server state, so a 404 on the retry confirms the intended outcome.",
        },
      ],
    },
  ],
  takeaways: [
    "The API step is about five minutes: state the protocol, map each requirement to an operation on a core entity, and move on.",
    "Resources are plural nouns that match your entities; express actions as state changes (PATCH) or as new sub-resources (POST /bookings/88/refunds).",
    "Nest only when a parent is always required; otherwise keep collections flat and filter with query parameters.",
    "Path identifies, query modifies, body carries data, headers carry metadata such as auth and idempotency keys. Identity always comes from the token.",
    "GET is safe; GET, PUT and DELETE are idempotent; POST isn't, and PATCH depends on the patch. Make retried POSTs safe with idempotency keys.",
    "Status codes instruct the client: 201 created, 409 conflict, 429 back off, 5xx maybe retry. Pick GraphQL for diverse clients and gRPC for hot internal paths, and name their costs.",
  ],
  furtherReading: [
    { title: "RFC 9110: HTTP Semantics, sections on methods", url: "https://www.rfc-editor.org/rfc/rfc9110", note: "The precise definitions of safe and idempotent methods." },
    { title: "RFC 7396: JSON Merge Patch", url: "https://www.rfc-editor.org/rfc/rfc7396", note: "The simple \"set these values\" patch format." },
    { title: "Microsoft REST API Guidelines", url: "https://github.com/microsoft/api-guidelines", note: "A widely referenced, practical style guide for naming, errors and versioning." },
  ],
};
