// Deep dive: Chapter 8, API principles and patterns: pagination, idempotency, versioning, security. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch8 = {
  hook: `<p>Three bug reports land on the same Monday. A user scrolling the news feed sees the same two posts twice and swears a third one vanished. A customer was charged twice for one concert ticket after the app showed a spinner and they tapped "Pay" again. And a partner's integration broke overnight because a field they relied on was renamed in "a small cleanup".</p>
<p>None of these is a crash. Each endpoint did what it was coded to do. They are failures of API <em>design</em>: offset pagination on a feed that changes underneath the reader, a payment endpoint that isn't safe to retry, and a contract changed without versioning. Interviewers judge APIs against a handful of principles like these even when they never name them, and each principle turns into a concrete pattern you can sketch in a sentence.</p>`,
  sections: [
    {
      id: "principles",
      title: "Nine principles interviewers quietly check",
      kicker: "The standard",
      blocks: [
        {
          type: "text",
          html: `<p>A good API is one a new client developer can use correctly without reading the source code, and that keeps working as the system grows and changes. That goal breaks down into a short list of principles:</p>`,
        },
        {
          type: "table",
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
          type: "text",
          html: `<p>Most of these are cheap to get right at design time and expensive to retrofit. Switching a public feed from offset to cursor pagination, or adding idempotency to a payment API that partners already call, means coordinating every client. That is why interviewers look for them in a five-minute API sketch: they reveal whether you think about the clients who will live with the API for years.</p>`,
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>Statelessness and consistency reinforce each other. If every request carries its own authentication and every endpoint follows the same conventions, gateways, caches, SDK generators and monitoring can treat the whole API uniformly. Special cases are where bugs, security holes and support tickets accumulate.</p>`,
        },
      ],
    },
    {
      id: "pagination",
      title: "Pagination: offset versus cursor",
      kicker: "Lists that grow",
      blocks: [
        {
          type: "problem",
          html: `<p>A user's booking history might have 5 entries; a popular feed has millions. Any list endpoint without a limit eventually returns a response too large to build, send or render, and a single heavy client can exhaust the database. Every growable collection needs pages. The question is how the client asks for the next one.</p>`,
        },
        {
          type: "text",
          html: `<p><strong>Offset pagination</strong> asks for "skip N, take L": <code>GET /posts?offset=40&amp;limit=20</code>. It is easy to implement, and supports "jump to page 7" and total page counts, which suits admin tables and search results. It has two weaknesses. The database still has to walk past all the skipped rows, so deep pages get slower and slower. And if items are inserted or deleted while the user is paging, the window shifts: new posts at the top push items the user already saw onto the next page (duplicates), and deletions pull unseen items back onto a page already read (skips).</p>
<p><strong>Cursor pagination</strong> asks for "the next L items after this one": the response includes an opaque <code>next_cursor</code> encoding the position of the last item returned (often its sort key plus ID), and the next request sends it back. The database seeks straight to that position using an index, so page 1,000 costs the same as page 1, and inserts or deletes elsewhere don't shift the window. The price: no jumping to arbitrary pages and no cheap total count.</p>`,
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
          type: "realworld",
          items: [
            { org: "Stripe", title: "Cursor by object ID", html: "Stripe's list endpoints take a <code>limit</code> plus <code>starting_after</code> or <code>ending_before</code>, each set to the ID of an object from the previous page." },
            { org: "Slack", title: "Opaque cursors", html: "Slack's Web API returns a <code>next_cursor</code> in <code>response_metadata</code> for paginated methods; clients pass it back unchanged and stop when it comes back empty." },
          ],
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>Make cursors <strong>opaque</strong> (for example, base64 of the sort key and ID) rather than letting clients build them. You can then change the encoding, add a version byte or switch sort keys without breaking anyone. And always include a unique tiebreaker such as the ID in the sort, or items with equal timestamps can be skipped or repeated at page boundaries.</p>`,
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
          html: `<p>When a payment or booking request times out, the client has no idea whether it was applied. Retrying blindly risks charging twice; not retrying risks losing the payment. An <strong>idempotency key</strong> resolves this: the client generates a unique key per logical operation (one per checkout attempt, not one per HTTP attempt), sends it with every retry, and the server guarantees that one key produces at most one effect and always the same response.</p>
<p>The idea is simple. The implementation has a trap. The obvious version, "look up the key; if absent, process the payment and then save the key", has a window between the lookup and the save. A retry that arrives while the first attempt is still talking to the card network finds no key, processes the payment again, and the customer is charged twice despite the key.</p>`,
        },
        {
          type: "steps",
          title: "A race-free implementation",
          items: [
            "Claim the key atomically before doing any work: insert it into a table with a unique constraint, with status <code>in_progress</code> and a hash of the request body.",
            "If the insert fails because the key exists: return the stored response if it is complete; return <code>409 Conflict</code> (or wait briefly) if it is still in progress; reject with an error if the body hash differs.",
            "Do the work. Where possible, record the business change and the final response in the same database transaction as the key's status update.",
            "If the work fails in a way that is safe to retry, release or mark the key so a later attempt can try again; otherwise store the error as the key's response.",
            "Delete keys after a retention window that comfortably exceeds any client's retry horizon, such as 24 hours to a few days.",
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
          html: `<p>Scope keys to the authenticated client. If keys are global, two different customers who happen to generate the same key, or an attacker who guesses one, could receive each other's stored responses. The primary key above includes <code>client_id</code> for exactly that reason.</p>`,
        },
        {
          type: "quiz",
          q: "A server checks whether an idempotency key exists and, if not, processes the payment and then inserts the key. Customers are still occasionally charged twice. Why?",
          options: [
            "The keys are too short",
            "A retry arriving while the first attempt is in progress also sees no key, because the check and the claim are separate steps",
            "Idempotency keys only work with PUT",
            "The client is generating a new key per retry, which is required",
          ],
          answer: 1,
          explain: "Check-then-act is a race. The fix is to claim the key atomically before processing (an insert against a unique constraint) so exactly one attempt wins. A client generating a new key per retry would also cause duplicates, but that is a client bug, not a requirement.",
        },
      ],
    },
    {
      id: "errors-and-versioning",
      title: "Actionable errors and evolving without breaking clients",
      kicker: "Contracts over time",
      blocks: [
        {
          type: "text",
          html: `<p>An error is actionable when a program can decide what to do from it and a human can understand why it happened. That takes three things: the right status code class (so generic clients and retry logic behave), a <strong>stable machine-readable code</strong> the client can branch on, and a <strong>human-readable message</strong> with enough context to fix the problem. Use one envelope shape for every error on every endpoint.</p>`,
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
          type: "text",
          html: `<p>Clients branch on <code>code</code>, never on the message text, so messages can be reworded or translated freely. A <code>request_id</code> lets support find the exact request in logs. RFC 9457, "Problem Details for HTTP APIs", standardizes a similar shape (<code>type</code>, <code>title</code>, <code>status</code>, <code>detail</code>) if you prefer a published format.</p>
<h3>Versioning</h3>
<p>Some changes are safe for existing clients: adding an optional request field, adding a response field, adding an endpoint. Others break them: removing or renaming a field, changing a type or meaning, making an optional field required, tightening validation. Breaking changes need a new version that old clients don't get unless they opt in.</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "URL versioning: /v1/events", tone: "ok", html: "Explicit, visible in logs, trivial to route at the gateway, easy to test in a browser. The most common choice for public APIs and the safe interview answer." },
            { title: "Header versioning", tone: "info", html: "e.g. <code>API-Version: 2</code> or a dated version header. Keeps URLs stable and allows fine-grained versions, but is invisible in a plain link and easy for clients to forget." },
          ],
        },
        {
          type: "realworld",
          items: [
            { org: "Stripe", title: "Dated versions", html: "Stripe pins each account to the API version current when it started, and clients can override it per request with a <code>Stripe-Version</code> header naming a dated release. Old integrations keep their behaviour while new ones get the latest." },
            { org: "GitHub", title: "Version header", html: "GitHub's REST API accepts an <code>X-GitHub-Api-Version</code> header with a date-based version, so the URL structure stays the same across versions." },
          ],
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>Teach clients to <strong>ignore unknown fields</strong> from day one. That single rule lets you add response fields forever without a new version, which is most of the change any API ever needs.</p>`,
        },
      ],
    },
    {
      id: "authentication-authorization",
      title: "Authentication, authorization and tokens",
      kicker: "Secure by default",
      blocks: [
        {
          type: "text",
          html: `<p>Two different questions, often confused. <strong>Authentication</strong>: who is calling? <strong>Authorization</strong>: is this caller allowed to do this to this specific resource? John is authenticated as John; he is authorized to cancel his own booking, not someone else's. Both run on every request.</p>
<p><strong>API keys</strong> identify an application rather than a person. They are long random secrets, sent in a header, looked up server-side along with the application's permissions and rate limits. Good for server-to-server integrations; never embed them in browser or mobile code, where anyone can extract them. Store only a hash of each key, as you would a password.</p>
<p><strong>Sessions</strong> store login state on the server; the client holds an opaque session ID, usually in a cookie. Every request needs a lookup, but logging out or revoking is instant: delete the session.</p>
<p><strong>JWTs</strong> (JSON Web Tokens, RFC 7519) put claims such as user ID, role and expiry into a token signed by the issuer. Any service with the verification key can check it without a database call, which suits many services behind a gateway. The flip side is revocation: a stolen token stays valid until it expires. The usual compromise is short-lived access tokens (minutes) plus longer-lived refresh tokens that the server can revoke.</p>`,
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
          type: "text",
          html: `<p><strong>Role-based access control</strong> (RBAC) assigns users roles (customer, venue_manager, admin) and roles permissions. Roles answer "can this kind of user cancel bookings at all?" They don't answer "is this booking yours?", which needs an ownership check against the data: <code>WHERE id = ? AND user_id = ?</code>. Forgetting the second check is the single most common API vulnerability: OWASP's API Security Top 10 (2023) lists broken object-level authorization first.</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "JWT (stateless tokens)", tone: "info", html: "No lookup per request; any service can verify. Hard to revoke before expiry, and claims (like role) can go stale. Use short expiries, strong signing algorithms (RS256 or ES256), and validate issuer, audience and expiry." },
            { title: "Server-side sessions", tone: "ok", html: "Instant revocation and always-current permissions; tokens reveal nothing. Needs a fast shared session store (often Redis) and a lookup on every request." },
          ],
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
      id: "rate-limiting",
      title: "Rate limiting: protecting the API from its clients",
      kicker: "Fair use",
      blocks: [
        {
          type: "text",
          html: `<p>Without limits, one buggy script, scraper or abusive user can consume capacity meant for everyone, and a sudden spike can push the whole service over. <strong>Rate limiting</strong> caps how many requests a client may make in a period: per user or API key for authenticated traffic, per IP for anonymous traffic, and often per endpoint for expensive or sensitive operations (for example, 10 booking attempts a minute, or 5 login attempts). Excess requests get <code>429 Too Many Requests</code>, ideally with a <code>Retry-After</code> header saying when to try again.</p>`,
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
          type: "text",
          html: `<p>Token bucket is the most common general-purpose choice because it matches how real clients behave: idle for a while, then a burst of activity. A bucket of 20 tokens refilled at 2 per second lets a client open an app and fire 15 requests at once, while capping its sustained rate at 2 per second. Amazon API Gateway, for example, documents its throttling in token-bucket terms (a rate and a burst).</p>
<h3>Where and how to enforce</h3>
<p>Enforce at the edge, in the API gateway or middleware, before requests consume expensive resources. With many gateway instances, counters must be shared, usually in Redis, and the read-modify-write must be atomic (a Lua script or atomic increment with expiry), or concurrent requests on different instances will all see the old count. Tell clients where they stand: many APIs return headers such as <code>X-RateLimit-Limit</code>, <code>X-RateLimit-Remaining</code> and <code>X-RateLimit-Reset</code>, and an IETF draft is standardizing <code>RateLimit</code> header fields.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "GitHub", title: "Published limits", html: "GitHub's REST API documents per-hour request limits for authenticated and unauthenticated callers and reports the remaining allowance on every response in <code>x-ratelimit-*</code> headers." },
            { org: "Stripe", title: "Several limiters at once", html: "Stripe's engineering blog post on rate limiters describes layering a request rate limiter (token bucket), a concurrency limiter and load shedders that drop lower-priority traffic first when the system is under strain." },
          ],
        },
        {
          type: "quiz",
          q: "A client's token bucket holds 10 tokens and refills at 1 token per second. It has been idle for a minute, then sends 15 requests at once. What happens?",
          options: [
            "All 15 succeed",
            "10 succeed immediately and 5 are rejected (or must wait for refills)",
            "Only 1 succeeds",
            "All 15 are rejected because it exceeded the rate",
          ],
          answer: 1,
          explain: "The bucket filled to its capacity of 10 while idle, and tokens beyond capacity are discarded. The burst spends all 10; the remaining 5 get 429 until tokens refill at one per second. That is the burst-then-average behaviour token buckets are chosen for.",
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
          html: `<p>You don't need to recite these patterns as a list. Weave them into the API step with one sentence each, at the endpoint where they matter: cursor pagination on the feed, an idempotency key on the booking, rate limits on the endpoint bots will hammer, and identity from the token everywhere.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>Sentences that score well:</p>
<ol>
<li>"The feed uses cursor pagination, since posts arrive constantly and users only scroll forward."</li>
<li>"<code>POST /bookings</code> takes an <code>Idempotency-Key</code>; the server claims it with a unique constraint before charging, so retries can't double-book."</li>
<li>"Errors share one envelope with a stable code, like <code>SEAT_UNAVAILABLE</code> with a 409."</li>
<li>"Public API is versioned in the URL; we only add fields within a version."</li>
<li>"The gateway validates the JWT and rate limits per user with a token bucket in Redis; each service checks ownership of the resource."</li>
</ol>`,
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Saying "we'll add authentication" and stopping there. Authentication without per-resource authorization is how one user reads another's data. Name both, and give the ownership check as an example.</p>`,
        },
        {
          type: "quiz",
          q: "Which single sentence best covers safe retries for a ticket purchase endpoint?",
          options: [
            "We'll use HTTPS so requests aren't lost",
            "Clients send an idempotency key per purchase attempt, and the server atomically claims it and returns the stored result for repeats",
            "We'll make the endpoint a GET",
            "We'll rate limit retries to one per second",
          ],
          answer: 1,
          explain: "HTTPS doesn't prevent lost responses, GET must not change state, and rate limiting doesn't stop a single retry from double-charging. A per-operation idempotency key, claimed atomically, makes repeats return the original outcome.",
        },
      ],
    },
  ],
  takeaways: [
    "Nine principles (resources, consistency, least surprise, statelessness, safe retries, pagination, security, evolvability, actionable errors) are cheap at design time and expensive to retrofit.",
    "Offset pagination is simple and supports page numbers but drifts on changing data and slows on deep pages; cursor pagination is stable and constant-cost, ideal for feeds.",
    "Idempotency keys must be claimed atomically (unique constraint) before doing the work, scoped per client, checked against the request body and expired after a retention window.",
    "Errors use the right status plus one envelope with a stable code and a helpful message; version breaking changes, add fields freely, and have clients ignore unknown fields.",
    "Authentication says who is calling; authorization checks this caller against this resource. JWTs avoid lookups but are hard to revoke; sessions revoke instantly but need a shared store.",
    "Rate limit at the edge per user, IP or endpoint, usually with a token bucket in a shared store, and return 429 with Retry-After.",
  ],
  furtherReading: [
    { title: "RFC 9457: Problem Details for HTTP APIs", url: "https://www.rfc-editor.org/rfc/rfc9457", note: "A standard JSON shape for machine-readable error responses." },
    { title: "OWASP API Security Top 10 (2023)", url: "https://owasp.org/API-Security/", note: "Broken object-level authorization and the other most common API flaws." },
    { title: "Scaling your API with rate limiters (Stripe engineering blog)", note: "How Stripe combines token buckets, concurrency limits and load shedding." },
  ],
};
