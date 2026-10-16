// Deep dive: Chapter 7, API styles and REST resource design. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch7 = {
  hook: `<p>This chapter covers how to produce a clean REST API in the five-minute API step of an interview and defend every choice: resource names, where inputs go, what each method promises and which status codes to return.</p>`,
  sections: [
    {
      id: "the-api-step",
      title: "The API step: from requirements to endpoints",
      kicker: "What the interviewer wants",
      blocks: [
        {
          type: "text",
          html: `<p>The API step turns each functional requirement into a user-facing endpoint, so the design has a concrete contract. Interviewers want a protocol choice in one sentence, resources that match your entities and correct methods and status codes, not completeness. Internal APIs can wait: say services talk over RPC.</p>`,
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
      ],
    },
    {
      id: "resources-and-inputs",
      title: "Resources and where each input goes",
      kicker: "Naming and parameters",
      blocks: [
        {
          type: "text",
          html: `<p>Resources are your core entities, named as <strong>plural nouns</strong>; the HTTP method supplies the verb. Actions become a <strong>state change</strong> (<code>PATCH /bookings/88</code> with <code>{"status": "cancelled"}</code>) or a <strong>new sub-resource</strong> when they have their own data and lifecycle (<code>POST /bookings/88/refunds</code>).</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "Nested path", tone: "info", html: "<code>GET /events/42/tickets</code><br>Expresses ownership; the parent ID is mandatory. Best for one obvious parent and shallow depth. If a child has a globally unique ID, <code>/tickets/4</code> is enough." },
            { title: "Flat with filters", tone: "ok", html: "<code>GET /tickets?event_id=42&amp;status=available</code><br>Filters combine and are all optional. Best when items are sliced several ways or the parent is optional." },
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
          type: "keypoints",
          items: [
            "<strong>Path or query?</strong> If removing the value names a different resource, it's path; if it just broadens or reorders the result, it's query.",
            "<strong>Identity never travels in the body.</strong> The server learns the user from the verified token; a path naming a user (<code>/users/42/bookings</code>) still needs an access check, or offer <code>/users/me/bookings</code>.",
          ],
        },
      ],
    },
    {
      id: "methods-and-idempotency",
      title: "What each method promises",
      kicker: "Semantics",
      blocks: [
        {
          type: "text",
          html: `<p>RFC 9110 defines two properties. <strong>Safe</strong> (read-only): GET and HEAD, which is why they get prefetched, crawled and cached. <strong>Idempotent</strong> (repeating has the same effect on server state as sending once): GET, HEAD, PUT and DELETE. POST is not; PATCH is not guaranteed. After a timeout, clients can only blindly retry idempotent requests.</p>`,
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
          type: "keypoints",
          items: [
            "<strong>PUT</strong> sends the full representation; omitted fields are reset. <strong>PATCH</strong> sends changes: \"set status\" is idempotent in practice, \"append\" or \"increment\" is not (JSON Merge Patch, RFC 7396, sets values; JSON Patch, RFC 6902, lists operations).",
            "<strong>DELETE</strong> is idempotent even though a retry returns 404: idempotency is about state, not the response. Treat that 404 as success.",
            "<strong>POST</strong> creates each time, so retried bookings need an <strong>idempotency key</strong> (next chapter).",
          ],
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
      id: "status-codes-and-styles",
      title: "Status codes, and when to leave REST",
      kicker: "Responses and alternatives",
      blocks: [
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
          type: "callout",
          tone: "mistake",
          html: `<p>Returning <code>200 OK</code> with <code>{"success": false}</code> slips past retry policies, monitoring and client libraries. Also note 403 versus 404 is a security choice: GitHub returns 404 for some private resources so it doesn't reveal they exist.</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "REST", tone: "ok", html: "Resource-oriented, cacheable, universal tooling. <strong>Use for:</strong> public and client-facing APIs; the interview default." },
            { title: "GraphQL", tone: "info", html: "Client-shaped queries over one schema. <strong>Use for:</strong> many diverse, fast-changing clients sharing data. <strong>Watch:</strong> N+1, field-level auth, query cost limits, no HTTP caching by default." },
            { title: "gRPC", tone: "warn", html: "Typed, binary, action-oriented (<code>ReserveSeats</code>, <code>ChargeCard</code>). <strong>Use for:</strong> hot internal paths and streaming. <strong>Watch:</strong> not browser-native; harder to debug by hand." },
          ],
        },
      ],
    },
    {
      id: "interview",
      title: "Using it in a design interview",
      kicker: "Interview angle",
      blocks: [
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
          html: `<p>A strong API step covers:</p>
<ol>
<li>One-sentence protocol choice with the reason (REST for clients, RPC internally).</li>
<li>Plural noun resources that match the core entities; actions as state changes.</li>
<li>Path for identity, query for filters and pagination, body for data, headers for auth and idempotency.</li>
<li>Correct methods, and the dangerous POST made safe with an idempotency key.</li>
<li>Status codes that guide the client: 201 on create, 409 when a seat is taken, 429 when rate limited.</li>
</ol>`,
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>Aim for reasonable and consistent, not perfect. If you debate path versus body for more than a few seconds, pick one, say why and move on.</p>`,
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
    "Resources are plural nouns; express actions as state changes or sub-resources, nest only when a parent is always required, and filter flat collections with query parameters.",
    "Path identifies, query modifies, body carries data, headers carry auth and idempotency keys. Identity always comes from the token.",
    "GET is safe; GET, PUT and DELETE are idempotent; POST isn't and PATCH depends on the patch. Make retried POSTs safe with idempotency keys.",
    "Status codes instruct the client (201, 409, 429, 5xx). Pick GraphQL for diverse clients and gRPC for hot internal paths, and name their costs.",
  ],
  furtherReading: [
    { title: "RFC 9110: HTTP Semantics, sections on methods", url: "https://www.rfc-editor.org/rfc/rfc9110", note: "The precise definitions of safe and idempotent methods." },
    { title: "RFC 7396: JSON Merge Patch", url: "https://www.rfc-editor.org/rfc/rfc7396", note: "The simple \"set these values\" patch format." },
    { title: "Microsoft REST API Guidelines", url: "https://github.com/microsoft/api-guidelines", note: "A widely referenced, practical style guide for naming, errors and versioning." },
  ],
};
