// Main tab: Chapter 8, API principles and patterns: pagination, idempotency, versioning, security. Format: DeepSection[] in public/shared/notes.d.ts.
window.MAIN = window.MAIN || {};
MAIN.ch8 = [
  {
    id: "principles",
    title: "The principles interviewers check silently",
    kicker: "Mental model",
    blocks: [
      {
        type: "text",
        html: `<p>Interviewers rarely ask "what are your API design principles?", but they judge your endpoints against a short list of them. Each principle turns into a concrete pattern, and the strongest way to show you know them is to apply them out loud with a reason attached: "this list is paginated with a cursor because new posts arrive constantly" is worth more than reciting a list.</p>`,
      },
      {
        type: "table",
        headers: ["Principle", "The pattern it becomes"],
        rows: [
          ["Model resources, not actions", "Plural nouns, HTTP methods as verbs"],
          ["Be consistent and unsurprising", "Same parameter names, error shape and conventions on every endpoint"],
          ["Stay stateless", "Every request carries its own credentials and inputs"],
          ["Make retries safe", "Idempotent methods, idempotency keys on important creates"],
          ["Bound every list", "Pagination with a maximum page size"],
          ["Secure by default", "Authentication on every endpoint, ownership checks on every resource, rate limits"],
          ["Evolve without breaking clients", "Additive changes within a version, a new version for breaking ones"],
          ["Make errors actionable", "Correct status class plus a stable machine-readable error code"],
        ],
      },
    ],
  },
  {
    id: "pagination",
    title: "Pagination: offset or cursor",
    kicker: "Lists that grow",
    blocks: [
      {
        type: "compare",
        items: [
          { title: "Offset", tone: "warn", html: "<p><code>?offset=40&amp;limit=20</code> skips 40 rows and returns the next 20. Easy to build and supports jumping to page 7. On live data, new rows shift every page, so readers see duplicates or miss items, and deep pages are slow because the database still walks past every skipped row.</p>" },
          { title: "Cursor", tone: "ok", html: "<p>The response returns a <code>next_cursor</code> that encodes where the page ended, typically the last item's timestamp and ID. The next request asks for items after that point, which an index answers directly at any depth. Stable under inserts; the cost is no random access to page N.</p>" },
        ],
      },
      {
        type: "text",
        html: `<p>Decision rule: <strong>cursor for feeds, timelines, chat history and anything that changes while people scroll; offset for admin tables and search results where jumping to a page matters.</strong> In both cases cap the page size on the server so one client can't request a million rows.</p>`,
      },
    ],
  },
  {
    id: "idempotency",
    title: "Idempotency keys",
    kicker: "Safe retries",
    blocks: [
      {
        type: "text",
        html: `<p>A client that times out on <code>POST /bookings</code> doesn't know whether the booking happened. Retrying blindly might book twice; not retrying might lose the booking. An idempotency key resolves this: the client generates a unique key once per logical operation (one per checkout attempt, not one per network try) and sends it on every retry, usually in an <code>Idempotency-Key</code> header.</p>`,
      },
      {
        type: "steps",
        title: "What the server does with the key",
        items: [
          "Try to insert the key, scoped to the user, into a table with a unique constraint, marked as in progress.",
          "If the insert succeeds, this is the first attempt: do the work, ideally in the same transaction, then store the response with the key.",
          "If the key already exists and is complete, return the stored response without doing anything.",
          "If the key exists and is still in progress, a duplicate is racing the original: make it wait or return 409.",
          "Expire keys after a retention window such as 24 hours.",
        ],
      },
      {
        type: "callout",
        tone: "mistake",
        html: `<p>Checking whether the key exists and then inserting it as two separate steps reintroduces the race you were trying to remove. Let the database's unique constraint make the claim atomic.</p>`,
      },
    ],
  },
  {
    id: "errors-and-versions",
    title: "Errors and versioning",
    kicker: "Contracts over time",
    blocks: [
      {
        type: "keypoints",
        items: [
          "<strong>One error shape everywhere:</strong> the right status code plus a body with a stable <code>code</code> (such as <code>SLOT_TAKEN</code>) that client code can branch on, and a human-readable <code>message</code> that can change freely.",
          "<strong>Retry hints:</strong> 429 and 503 responses include a <code>Retry-After</code> header so clients know when to try again.",
          "<strong>Version in the URL</strong> (<code>/v1/...</code>) as the safe default: explicit, easy to route and easy to see in logs. Header versioning keeps URLs clean but is less visible.",
          "<strong>Additive changes are safe</strong> within a version: new optional fields and new endpoints. Renaming, removing or changing the meaning of a field is breaking and needs a new version, with the old one deprecated on a published timeline. Mobile apps stay installed for years.",
        ],
      },
    ],
  },
  {
    id: "security",
    title: "Who is calling, what may they do, and how often",
    kicker: "Secure by default",
    blocks: [
      {
        type: "text",
        html: `<p><strong>Authentication</strong> establishes who the caller is. <strong>Authorization</strong> decides whether that caller may perform this action on this specific resource. The most common API security hole is doing the first and skipping the second: the user is logged in, so the server returns whatever booking ID they ask for. Every request that touches a resource must check ownership or role.</p>`,
      },
      {
        type: "table",
        headers: ["Credential", "Best for", "Trade-off"],
        rows: [
          ["JWT", "End-user sessions across many stateless services", "Verified without a lookup, but hard to revoke early; keep lifetimes short and use refresh tokens"],
          ["Server-side session", "Simple apps where instant logout matters", "Easy to revoke, but every request needs a shared session store"],
          ["API key", "Server-to-server calls and third-party developers", "Simple, but long-lived and carries no user context"],
        ],
      },
      {
        type: "callout",
        tone: "interview",
        html: `<p>Finish the API discussion with one sentence on limits: "rate limiting at the gateway, per user for signed-in traffic and per IP for anonymous traffic, returning 429 with Retry-After". Go into token bucket or sliding window only if asked.</p>`,
      },
    ],
  },
];
