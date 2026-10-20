// Main tab: Chapter 7, API styles and REST resource design. Format: DeepSection[] in public/shared/notes.d.ts.
window.MAIN = window.MAIN || {};
MAIN.ch7 = [
  {
    id: "the-api-step",
    title: "What the API step is for",
    kicker: "Mental model",
    blocks: [
      {
        type: "text",
        html: `<p>In a design interview the API step comes right after requirements and core entities, and it should take about five minutes. Its job is to turn each functional requirement into one or two user-facing endpoints so that the rest of the design has something concrete to serve. Interviewers are looking for an API that is <strong>reasonable and consistent</strong>, not exhaustive. Internal service-to-service APIs usually don't need listing; mention during the high-level design that services talk over RPC.</p>`,
      },
      {
        type: "steps",
        title: "A five-minute routine",
        items: [
          `<strong>Pick the protocol in one sentence.</strong> "REST over HTTPS" unless a requirement points elsewhere: GraphQL for many clients with different data needs, WebSockets or SSE for real-time push.`,
          "<strong>Turn each core entity into a resource,</strong> named as a plural noun.",
          "<strong>Map each requirement to a method on a resource.</strong> Reading is GET, creating is POST, changing is PATCH or PUT, removing is DELETE.",
          "<strong>Place every input:</strong> identifier in the path, optional modifiers in the query string, payload in the body, identity in the auth header.",
          "<strong>Flag the risky endpoints:</strong> paginate lists, put an idempotency key on creates that move money or inventory, then move on.",
        ],
      },
    ],
  },
  {
    id: "naming",
    title: "Resources, not actions",
    kicker: "Naming",
    blocks: [
      {
        type: "text",
        html: `<p>REST's central rule is that paths name <strong>things</strong> and HTTP methods supply the verb. This makes an API guessable: once a reader sees <code>/reservations</code>, they can predict how to list, fetch, create and cancel reservations. Actions that don't look like CRUD still fit, in one of two ways. A simple state change becomes a PATCH on the resource (<code>PATCH /reservations/{id}</code> with a new status). An action with its own data and lifecycle becomes a sub-resource (<code>POST /orders/{id}/refunds</code>).</p>`,
      },
      {
        type: "table",
        title: "Smells and their fixes",
        headers: ["Smell", "Better", "Why"],
        rows: [
          ["POST /createReservation", "POST /reservations", "The method already says create"],
          ["GET /cancelReservation?id=9", "PATCH /reservations/9 or DELETE /reservations/9", "A GET must never change state"],
          ["GET /restaurant/5/getReviews", "GET /restaurants/5/reviews", "Plural nouns, no verbs"],
          ["POST /reservations with a userId in the body", "POST /reservations, user taken from the token", "Identity comes from authentication"],
          ["GET /reservations/byRestaurant/5", "GET /reservations?restaurant_id=5", "Optional filters belong in the query string"],
        ],
      },
      {
        type: "callout",
        tone: "tip",
        title: "Nest or filter?",
        html: `<p>Nest when the parent is always required and the child makes no sense without it: <code>/restaurants/{id}/reviews</code>. Keep the resource flat and filter with a query parameter when the relationship is optional: <code>/reservations?restaurant_id=5&amp;date=2026-11-02</code>. Avoid nesting more than one level deep.</p>`,
      },
    ],
  },
  {
    id: "worked-example",
    title: "A worked example: restaurant reservations",
    kicker: "From requirements to endpoints",
    blocks: [
      {
        type: "text",
        html: `<p>Requirements: users search restaurants by city and date, view a restaurant and its open time slots, book a slot, view and cancel their bookings, and leave reviews. The core entities are restaurants, slots, reservations and reviews.</p>`,
      },
      {
        type: "table",
        headers: ["Requirement", "Endpoint", "Notes"],
        rows: [
          ["Search restaurants", "GET /restaurants?city=Pune&amp;date=2026-11-02&amp;cursor=...", "Filters and pagination in the query string"],
          ["View a restaurant", "GET /restaurants/{id}", "Cacheable"],
          ["See open slots", "GET /restaurants/{id}/slots?date=2026-11-02&amp;party_size=4", "Slots only exist within a restaurant, so nest"],
          ["Book a slot", "POST /reservations", "Body: slot ID and party size; Idempotency-Key header; returns 201"],
          ["My bookings", "GET /reservations?cursor=...", "Scoped to the caller from the token"],
          ["Cancel a booking", "DELETE /reservations/{id}", "Server checks the caller owns it"],
          ["Leave a review", "POST /restaurants/{id}/reviews", "Body: rating and text"],
        ],
      },
      {
        type: "text",
        html: `<p>Seven endpoints, each tied to a requirement, consistent naming throughout, and the two risky spots (booking retries and ownership on cancel) called out. That is a complete answer for this step.</p>`,
      },
    ],
  },
  {
    id: "semantics",
    title: "Method guarantees and status codes",
    kicker: "Semantics",
    blocks: [
      {
        type: "keypoints",
        items: [
          "<strong>GET</strong> reads and is safe: no side effects, so caches and prefetchers can call it freely.",
          `<strong>PUT</strong> replaces the whole resource and is idempotent. <strong>PATCH</strong> changes some fields and is idempotent only if the change is absolute ("set status to cancelled") rather than relative ("add one guest").`,
          "<strong>DELETE</strong> is idempotent even though a repeat returns 404 instead of 204: idempotency is about server state, not the response.",
          "<strong>POST</strong> is not idempotent; a retried POST can create a duplicate, which is why creates that matter carry an idempotency key.",
          "<strong>Status codes:</strong> know 200, 201, 400, 401, 403, 404, 409, 429 and 500. The distinction interviewers care about is 4xx (the caller must change something) versus 5xx (the server failed and a retry may work).",
        ],
      },
    ],
  },
  {
    id: "interview",
    title: "Using this in an interview",
    kicker: "What to say",
    blocks: [
      {
        type: "callout",
        tone: "interview",
        html: `<p>Write the endpoints on the board as a short list, say "REST, with the user taken from the auth token" once, and point at the one or two endpoints that need special care. If the interviewer pushes on alternatives, explain when you would switch: GraphQL when different clients need very different data, gRPC between internal services, WebSockets or SSE for push.</p>`,
      },
      {
        type: "callout",
        tone: "mistake",
        title: "Common mistakes",
        html: `<ul><li>Spending fifteen minutes polishing request and response schemas while the interesting parts of the design wait.</li><li>Verbs in paths and singular-plural inconsistency across resources.</li><li>Required identifiers hidden in query strings, or optional filters forced into the path.</li><li>Forgetting pagination on list endpoints that can grow without bound.</li></ul>`,
      },
    ],
  },
];
