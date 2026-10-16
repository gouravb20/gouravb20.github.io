// Deep dive: Chapter 8, API principles and patterns: pagination, idempotency, versioning, security. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch8 = {
  hook: `<p>This chapter turns the principles interviewers quietly check into concrete patterns: cursor pagination, race-free idempotency keys, actionable errors and versioning, authentication versus authorization, and rate limiting. Each is cheap at design time and expensive to retrofit.</p>`,
  sections: [
    {
      id: "pagination",
      title: "Pagination: offset versus cursor",
      kicker: "Lists that grow",
      blocks: [
        {
          type: "text",
          html: `<p>Every growable list needs pages. <strong>Offset</strong> (<code>?offset=40&amp;limit=20</code>) supports page numbers and totals but scans skipped rows and drifts when items are inserted or deleted. <strong>Cursor</strong> returns an opaque <code>next_cursor</code> (sort key plus ID of the last item); the database seeks straight there, so page 1,000 costs the same as page 1.</p>`,
        },
        {
          type: "code",
          lang: "sql",
          title: "The two queries behind page N of a newest-first feed",
          code: `-- Offset: scans and discards 10,000 rows to return 20
SELECT * FROM posts ORDER BY created_at DESC, id DESC
LIMIT 20 OFFSET 10000;

-- Cursor: seeks via the (created_at, id) index, reads 20 rows
SELECT * FROM posts
WHERE (created_at, id) < ('2026-10-15 09:12:03', 88412)   -- from the cursor
ORDER BY created_at DESC, id DESC
LIMIT 20;`,
        },
        {
          type: "diagram",
          title: "Why offset pages drift on a live feed",
          caption: "The user reads page 1 (P10 to P6). Two new posts arrive before they scroll. Asking for offset 5 now returns P7 to P3, repeating P7 and P6. Asking for the posts after P6 returns P5 to P1 with nothing repeated or skipped.",
          svg: `<svg viewBox="0 0 620 316" role="img" aria-label="Offset pagination repeating items after new posts arrive, compared with cursor pagination continuing correctly">
<text x="105" y="36" text-anchor="middle" font-size="13" font-weight="700">Page 1 at t1</text>
<text x="310" y="36" text-anchor="middle" font-size="13" font-weight="700">Feed at t2, offset=5</text>
<text x="515" y="36" text-anchor="middle" font-size="13" font-weight="700">Cursor: after P6</text>
<rect x="30" y="56" width="150" height="20" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="105" y="71" text-anchor="middle" font-size="12">P10</text>
<rect x="30" y="78" width="150" height="20" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="105" y="93" text-anchor="middle" font-size="12">P9</text>
<rect x="30" y="100" width="150" height="20" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="105" y="115" text-anchor="middle" font-size="12">P8</text>
<rect x="30" y="122" width="150" height="20" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="105" y="137" text-anchor="middle" font-size="12">P7</text>
<rect x="30" y="144" width="150" height="20" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="105" y="159" text-anchor="middle" font-size="12">P6</text>
<rect x="235" y="56" width="150" height="20" rx="4" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/>
<text x="310" y="71" text-anchor="middle" font-size="12">N2 (new)</text>
<rect x="235" y="78" width="150" height="20" rx="4" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/>
<text x="310" y="93" text-anchor="middle" font-size="12">N1 (new)</text>
<rect x="235" y="100" width="150" height="20" rx="4" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="310" y="115" text-anchor="middle" font-size="12">P10</text>
<rect x="235" y="122" width="150" height="20" rx="4" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="310" y="137" text-anchor="middle" font-size="12">P9</text>
<rect x="235" y="144" width="150" height="20" rx="4" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="310" y="159" text-anchor="middle" font-size="12">P8</text>
<rect x="235" y="166" width="150" height="20" rx="4" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)"/>
<text x="310" y="181" text-anchor="middle" font-size="12">P7 (seen)</text>
<rect x="235" y="188" width="150" height="20" rx="4" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)"/>
<text x="310" y="203" text-anchor="middle" font-size="12">P6 (seen)</text>
<rect x="235" y="210" width="150" height="20" rx="4" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="310" y="225" text-anchor="middle" font-size="12">P5</text>
<rect x="235" y="232" width="150" height="20" rx="4" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="310" y="247" text-anchor="middle" font-size="12">P4</text>
<rect x="235" y="254" width="150" height="20" rx="4" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="310" y="269" text-anchor="middle" font-size="12">P3</text>
<rect x="229" y="162" width="162" height="116" rx="6" fill="none" stroke-width="2" stroke-dasharray="5 4" style="stroke: var(--dg-2)"/>
<rect x="440" y="56" width="150" height="20" rx="4" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)"/>
<text x="515" y="71" text-anchor="middle" font-size="12">P5</text>
<rect x="440" y="78" width="150" height="20" rx="4" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)"/>
<text x="515" y="93" text-anchor="middle" font-size="12">P4</text>
<rect x="440" y="100" width="150" height="20" rx="4" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)"/>
<text x="515" y="115" text-anchor="middle" font-size="12">P3</text>
<rect x="440" y="122" width="150" height="20" rx="4" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)"/>
<text x="515" y="137" text-anchor="middle" font-size="12">P2</text>
<rect x="440" y="144" width="150" height="20" rx="4" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)"/>
<text x="515" y="159" text-anchor="middle" font-size="12">P1</text>
<text x="105" y="294" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">Seen: P10 to P6</text>
<text x="310" y="294" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">Page 2 (dashed): P7 to P3</text>
<text x="310" y="310" text-anchor="middle" font-size="12" style="fill: var(--dg-bad)">P7 and P6 repeated</text>
<text x="515" y="294" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">Page 2: P5 to P1</text>
<text x="515" y="310" text-anchor="middle" font-size="12" style="fill: var(--dg-ok)">no repeats, no skips</text>
</svg>`,
        },
        {
          type: "lab",
          id: "paginationDrift",
          caption: "Read page 1, add new posts and delete some old ones, then fetch page 2 with offset and with cursor pagination. Watch for duplicates, silently skipped posts and the cost of deep pages.",
        },
        {
          type: "keypoints",
          items: [
            "Cursor gives up jumping to page N and cheap totals; offset suits small, stable lists and admin tables.",
            "Make cursors <strong>opaque</strong> (e.g. base64 of sort key and ID) so you can change the encoding later. Stripe uses <code>starting_after</code>; Slack returns <code>next_cursor</code>.",
            "Always include a unique tiebreaker such as the ID in the sort, or equal timestamps skip or repeat at page boundaries.",
          ],
        },
        {
          type: "quiz",
          q: "Which pagination suits an infinite-scroll news feed with constant new posts, and why?",
          options: [
            "Offset, because it supports jumping to page 50",
            "Cursor, because new posts don't shift the window and deep pages stay fast",
            "No pagination; send the whole feed",
            "Offset, because cursors can't be cached",
          ],
          answer: 1,
          explain: "Infinite scroll only ever needs \"the next page\", never page 50, so cursor pagination loses nothing and gains stable pages under concurrent inserts and constant-cost index seeks. Offset is fine for small, stable lists or admin tables that need page numbers.",
        },
      ],
    },
    {
      id: "idempotency-keys",
      title: "Idempotency keys done right",
      kicker: "Safe retries",
      blocks: [
        {
          type: "text",
          html: `<p>The client sends one key per logical operation (per checkout, not per HTTP attempt); the server guarantees one effect and the same response per key. The trap is <strong>check-then-act</strong>: a retry arriving while the first attempt is still charging finds no key and charges again. The claim must be atomic.</p>`,
        },
        {
          type: "steps",
          title: "A race-free implementation",
          items: [
            "Claim the key atomically before any work: insert with a unique constraint, status <code>in_progress</code> and a hash of the request body.",
            "If the key exists: return the stored response if done; <code>409</code> (or wait) if in progress; an error if the body hash differs.",
            "Do the work, recording the business change and final response in the same transaction as the key update where possible.",
            "On a retryable failure, release the key; otherwise store the error as its response.",
            "Delete keys after a window well beyond any client's retry horizon (24 hours to a few days).",
          ],
        },
        {
          type: "code",
          lang: "sql",
          title: "Claiming the key atomically",
          code: `CREATE TABLE idempotency_keys (
  client_id    BIGINT      NOT NULL,
  key          TEXT        NOT NULL,
  request_hash TEXT        NOT NULL,
  status       TEXT        NOT NULL,       -- in_progress | done
  response     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, key)             -- keys are scoped per client
);

INSERT INTO idempotency_keys (client_id, key, request_hash, status)
VALUES ($1, $2, $3, 'in_progress')
ON CONFLICT DO NOTHING
RETURNING key;            -- no row returned means someone already claimed it`,
        },
        {
          type: "lab",
          id: "idempotencyKey",
          caption: "Two hundred customers pay once while requests time out and get retried. Compare no key, a check-then-insert key (watch the race) and a key claimed atomically with a unique constraint.",
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p>Scope keys to the authenticated client. With global keys, two customers who generate the same key, or an attacker who guesses one, could receive each other's stored responses.</p>`,
        },
      ],
    },
    {
      id: "errors-and-versioning",
      title: "Actionable errors and versioning",
      kicker: "Contracts over time",
      blocks: [
        {
          type: "text",
          html: `<p>An actionable error has the right status class, a <strong>stable machine-readable code</strong> clients branch on, and a <strong>human message</strong> that can be reworded freely. Use one envelope everywhere (RFC 9457 Problem Details is a published alternative).</p>`,
        },
        {
          type: "code",
          lang: "json",
          title: "A consistent error body for 409 Conflict",
          code: `{
  "error": {
    "code": "SEAT_UNAVAILABLE",
    "message": "Seat A12 was booked by another customer. Choose a different seat.",
    "details": { "seat_id": "A12", "event_id": 42 },
    "request_id": "req_7Hf2kQ"
  }
}`,
        },
        {
          type: "keypoints",
          items: [
            "<strong>Safe changes:</strong> add an optional request field, a response field or an endpoint.",
            "<strong>Breaking changes</strong> need a new version: removing or renaming a field, changing a type or meaning, making a field required, tightening validation.",
            "Teach clients to <strong>ignore unknown fields</strong> from day one; that alone covers most change.",
          ],
        },
        {
          type: "compare",
          items: [
            { title: "URL versioning: /v1/events", tone: "ok", html: "Explicit, visible in logs, trivial to route at the gateway. The most common choice for public APIs and the safe interview answer." },
            { title: "Header versioning", tone: "info", html: "e.g. <code>API-Version: 2</code> or a dated version (Stripe's <code>Stripe-Version</code>, GitHub's <code>X-GitHub-Api-Version</code>). Stable URLs, fine-grained versions, but invisible in a link and easy to forget." },
          ],
        },
      ],
    },
    {
      id: "auth-and-rate-limiting",
      title: "Authentication, authorization and rate limiting",
      kicker: "Secure by default",
      blocks: [
        {
          type: "text",
          html: `<p><strong>Authentication</strong> asks who is calling; <strong>authorization</strong> asks whether this caller may do this to <em>this</em> resource. Both run on every request. Roles (RBAC) answer "can customers cancel bookings?"; only an ownership check (<code>WHERE id = ? AND user_id = ?</code>) answers "is this booking yours?". OWASP's API Top 10 (2023) lists broken object-level authorization first.</p>`,
        },
        {
          type: "diagram",
          title: "Where each check happens",
          caption: "The gateway authenticates (is the token valid and unexpired?) and rate limits per user. The service authorizes against the specific resource: does the caller's role allow the action, and do they own this booking?",
          svg: `<svg viewBox="0 0 620 175" role="img" aria-label="Client sends a token to an API gateway that authenticates and rate limits, then to a booking service that checks role and ownership">
<defs><marker id="cc8-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-ink)"/></marker></defs>
<rect x="10" y="40" width="100" height="44" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="60" y="67" text-anchor="middle" font-size="13">Client</text>
<rect x="160" y="40" width="170" height="44" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="245" y="67" text-anchor="middle" font-size="13" font-weight="700">API gateway</text>
<rect x="380" y="40" width="210" height="44" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="485" y="67" text-anchor="middle" font-size="13" font-weight="700">Booking service</text>
<line x1="110" y1="62" x2="157" y2="62" stroke-width="2" marker-end="url(#cc8-arrow)" style="stroke: var(--dg-ink)"/>
<line x1="330" y1="62" x2="377" y2="62" stroke-width="2" marker-end="url(#cc8-arrow)" style="stroke: var(--dg-ink)"/>
<text x="134" y="30" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">Bearer token</text>
<text x="354" y="30" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">user id, role</text>
<text x="160" y="110" font-size="12">Authenticate:</text>
<text x="160" y="128" font-size="12" style="fill: var(--dg-muted)">signature and expiry valid?</text>
<text x="160" y="152" font-size="12" style="fill: var(--dg-muted)">Rate limit per user</text>
<text x="380" y="110" font-size="12">Authorize:</text>
<text x="380" y="128" font-size="12" style="fill: var(--dg-muted)">role allows "cancel booking"?</text>
<text x="380" y="152" font-size="12" style="fill: var(--dg-muted)">booking.user_id = caller?</text>
</svg>`,
        },
        {
          type: "compare",
          items: [
            { title: "JWT (stateless tokens)", tone: "info", html: "No lookup per request; any service can verify. Hard to revoke before expiry, claims can go stale. Use short-lived access tokens plus revocable refresh tokens, RS256 or ES256, and validate issuer, audience and expiry." },
            { title: "Server-side sessions", tone: "ok", html: "Instant revocation and current permissions. Needs a fast shared store (often Redis) and a lookup per request." },
            { title: "API keys", tone: "warn", html: "Identify an application for server-to-server use. Never embed in browser or mobile code; store only a hash." },
          ],
        },
        {
          type: "text",
          html: `<p><strong>Rate limiting</strong> caps requests per user, API key, IP or endpoint (e.g. 5 login attempts) and answers <code>429</code> with <code>Retry-After</code>. Enforce it at the gateway with counters in a shared store such as Redis, updated atomically (Lua script or atomic increment), or instances see stale counts.</p>`,
        },
        {
          type: "table",
          headers: ["Algorithm", "How it counts", "Behaviour", "Cost"],
          rows: [
            ["Fixed window", "Counter per calendar window (e.g. per minute)", "Simple; allows up to 2x the limit across a window boundary", "One counter per client"],
            ["Sliding window log", "Timestamps of every request in the last window", "Exact", "Memory grows with the limit"],
            ["Sliding window counter", "Weighted mix of current and previous window counts", "Close to exact, smooth", "Two counters per client"],
            ["Token bucket", "Bucket holds up to B tokens, refilled at rate R; each request spends one", "Allows bursts up to B, average rate R", "A count and a timestamp per client"],
          ],
        },
        {
          type: "lab",
          id: "rateLimiter",
          caption: "Feed the same bursty traffic to a fixed window, a sliding log and a token bucket. Look for the double burst at the fixed window's boundary and how the bucket lets short bursts through.",
        },
        {
          type: "quiz",
          q: "A logged-in customer calls DELETE /bookings/91, which belongs to another customer. The token is valid and the customer role may cancel bookings. What should stop the request?",
          options: [
            "Authentication at the gateway",
            "The rate limiter",
            "An object-level authorization check that the booking's owner is the caller",
            "TLS",
          ],
          answer: 2,
          explain: "Authentication proved who they are and the role check passed, because customers can cancel bookings in general. Only an ownership check on this specific booking catches it. Many APIs return 404 here rather than 403, so they don't confirm that booking 91 exists.",
        },
      ],
    },
    {
      id: "interview",
      title: "Using it in a design interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "table",
          title: "Principles interviewers quietly check",
          headers: ["Principle", "What it means in practice"],
          rows: [
            ["Resources, not actions", "Plural nouns with HTTP methods: <code>POST /bookings</code>, not <code>/createBooking</code>"],
            ["Consistency", "Same naming, casing, pagination, error shape and date format on every endpoint"],
            ["Least surprise", "GET never changes state; 200 means it worked; DELETE deletes"],
            ["Statelessness", "Each request carries its token and parameters; any server can handle it"],
            ["Safe retries", "Idempotent methods, plus idempotency keys on creates and payments"],
            ["Paginate what can grow", "No endpoint returns an unbounded list"],
            ["Secure by default", "Authenticate every request, authorize every resource, rate limit every client"],
            ["Evolve without breaking", "Add fields freely; remove or rename only in a new version"],
            ["Actionable errors", "Correct status code plus a stable machine-readable code and a helpful message"],
          ],
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>Weave one sentence per pattern into the endpoint where it matters:</p>
<ol>
<li>"The feed uses cursor pagination, since posts arrive constantly and users only scroll forward."</li>
<li>"<code>POST /bookings</code> takes an <code>Idempotency-Key</code>, claimed with a unique constraint before charging."</li>
<li>"Errors share one envelope with a stable code, like <code>SEAT_UNAVAILABLE</code> with a 409."</li>
<li>"The public API is versioned in the URL; we only add fields within a version."</li>
<li>"The gateway validates the JWT and rate limits per user with a token bucket in Redis; each service checks resource ownership."</li>
</ol>`,
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Saying "we'll add authentication" and stopping. Without per-resource authorization, one user reads another's data. Name both.</p>`,
        },
      ],
    },
  ],
  takeaways: [
    "Cursor pagination is stable and constant-cost, ideal for feeds; offset suits small, stable lists that need page numbers.",
    "Claim idempotency keys atomically before doing the work, scope them per client, check the request body and expire them.",
    "Errors use the right status plus one envelope with a stable code; version breaking changes, add fields freely, and have clients ignore unknown fields.",
    "Authentication says who is calling; authorization checks this caller against this resource. JWTs avoid lookups but are hard to revoke; sessions revoke instantly.",
    "Rate limit at the edge, usually with a token bucket in a shared store, and return 429 with Retry-After.",
  ],
  furtherReading: [
    { title: "RFC 9457: Problem Details for HTTP APIs", url: "https://www.rfc-editor.org/rfc/rfc9457", note: "A standard JSON shape for machine-readable error responses." },
    { title: "OWASP API Security Top 10 (2023)", url: "https://owasp.org/API-Security/", note: "Broken object-level authorization and the other most common API flaws." },
    { title: "Scaling your API with rate limiters (Stripe engineering blog)", note: "How Stripe combines token buckets, concurrency limits and load shedding." },
  ],
};
