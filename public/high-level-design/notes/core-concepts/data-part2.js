// System design core concepts - part 2 data: API design, data modeling, database indexing (chapters 7-11)
window.DATA.chapters.push(
  // ------------------------------------------------------------------
  {
    id: `ch7`, part: 2, number: 7,
    source: { title: `Hello Interview: API Design`, url: `https://www.hellointerview.com/learn/system-design/core-concepts/api-design` },
    title: `API styles and REST resource design`,
    overview: `The API step of an interview takes about five minutes: pick a protocol, name your resources, and say how data goes in and comes out. <strong>REST</strong> is the default and covers most products. <strong>GraphQL</strong> earns its place when many different clients need different slices of the same data. <strong>RPC</strong> (gRPC) fits internal service-to-service calls where speed and typed contracts matter. Interviewers want a reasonable, consistent API, not a perfect one, so get it right quickly and move on.`,
    concepts: [
      { term: `The API step`, def: `Turn the functional requirements into the handful of user-facing endpoints that satisfy them. Internal service APIs usually don't need listing; mention that services talk over RPC during the high-level design.`, why: `Spending more than about five minutes here is the common mistake. A clean, small API leaves time for the hard parts of the design.` },
      { term: `Choosing a protocol`, def: `<strong>REST</strong> for CRUD-style web and mobile products. <strong>GraphQL</strong> when diverse clients need flexible data fetching. <strong>RPC</strong> for high-performance internal calls. Real-time features (chat, live updates) use persistent connections such as WebSockets or SSE instead.`, why: `If unsure, say "I'll use REST" and keep going. Name a specific requirement if you pick anything else.` },
      { term: `Resources are your core entities`, def: `REST resources are the <strong>things</strong> in the system (events, venues, tickets, bookings), named as <strong>plural nouns</strong>. Actions are expressed with HTTP methods on those resources, not with verbs in the path.`, why: `<code>POST /events/{id}/bookings</code> is REST; <code>POST /bookEvent</code> is not. Interviewers check this first.`, ex: `GET /events, GET /events/{id}, GET /events/{id}/tickets, POST /events/{id}/bookings, GET /bookings/{id}` },
      { term: `Nested vs flat resources`, def: `Nest when a parent is always required (<code>/events/{id}/tickets</code>). Keep resources flat and filter with query parameters when the relationship is optional (<code>/tickets?event_id=123&amp;section=VIP</code>).`, why: `The rule of thumb: required identifier goes in the path, optional filter goes in the query string.` },
      { term: `GET, POST, PUT, PATCH, DELETE`, def: `<strong>GET</strong> reads and never changes state. <strong>POST</strong> creates (server assigns the ID). <strong>PUT</strong> replaces a whole resource or creates it at a known ID. <strong>PATCH</strong> changes some fields. <strong>DELETE</strong> removes.`, why: `Using methods the way everyone else does is the "least surprise" principle in action.`, demo: `methodSemantics` },
      { term: `Idempotency of methods`, def: `An operation is <strong>idempotent</strong> if repeating it leaves the server in the same state as doing it once. GET, PUT and DELETE are idempotent. POST is not. PATCH depends on the change: "set email to X" is, "append to list" is not. Response codes may differ on repeats (DELETE: 204 then 404); the state is what counts.`, why: `Networks fail and clients retry. Non-idempotent operations need extra protection (idempotency keys) or retries create duplicates.`, demo: `methodSemantics` },
      { term: `Path, query and body`, def: `<strong>Path parameters</strong> identify the resource and are required. <strong>Query parameters</strong> are optional modifiers: filters, sorting, pagination, flags. The <strong>request body</strong> carries the payload for creates and updates, including anything large or sensitive.`, why: `Path is structural, query modifies, body is payload. Getting this split right makes an API read naturally.`, ex: `POST /events/123/bookings?notify=true with body {"tickets":[{"section":"VIP","quantity":2}],"payment_method":"card"}` },
      { term: `Status codes`, def: `Know a handful: <strong>200</strong> OK, <strong>201</strong> Created, <strong>400</strong> bad request, <strong>401</strong> not authenticated, <strong>403</strong> not allowed, <strong>404</strong> not found, <strong>429</strong> rate limited, <strong>500</strong> server error. 4xx means the client must change something; 5xx means the server failed and a retry may work.`, why: `Interviewers care that you know 4xx vs 5xx, not that you memorize every code.` },
      { term: `GraphQL`, def: `One endpoint and a typed <strong>schema</strong>; each query names exactly the fields and nested relationships it wants, and the server returns that shape. Created at Facebook so mobile and web could fetch different data without new endpoints.`, why: `Solves over-fetching and under-fetching, and lets front-end teams add fields without backend releases. Signals: "mobile needs different data than web", "flexible data fetching".`, demo: `apiFetch` },
      { term: `GraphQL costs: N+1 and authorization`, def: `Naive resolvers run one query for a list and then one per item (the <strong>N+1 problem</strong>); fix it with batching (DataLoader). Authorization moves to the <strong>field</strong> level, and caching and query-cost limits take more work than with REST.`, why: `Mentioning N+1 and batching shows you know GraphQL beyond the pitch. Don't default to it.` },
      { term: `RPC and gRPC`, def: `Action-oriented calls that look like local functions: <code>getEvent(id)</code>, <code>createBooking(...)</code>. <strong>gRPC</strong> uses Protocol Buffers over HTTP/2: a <code>.proto</code> file defines services and messages, and client and server code is generated for many languages.`, why: `Binary encoding, multiplexed connections, compile-time type safety and streaming make it ideal between your own services, especially in polyglot microservices.`, demo: `protobufSize` },
      { term: `Public REST, internal RPC`, def: `A common split: REST (or GraphQL) at the edge for browsers, mobile apps and third parties; gRPC between internal services such as booking, payment and inventory.`, why: `Each side gets what it needs: broad compatibility outside, speed and typed contracts inside.` }
    ],
    cheatsheet: [
      { title: `Pick a protocol`, type: `table`, headers: [`Protocol`, `Use when`, `Watch out for`], rows: [
        [`REST`, `Default. CRUD on clear entities, public APIs, web and mobile`, `Under/over-fetching for very varied clients`],
        [`GraphQL`, `Many clients need different fields; fast-moving front ends`, `N+1 resolvers, field-level auth, harder caching`],
        [`gRPC`, `Internal service calls, performance, polyglot services, streaming`, `Not browser-native; needs a gateway for web`],
        [`WebSocket / SSE`, `Real-time push: chat, live updates, notifications`, `Persistent connections, stateful load balancing`]
      ] },
      { title: `HTTP methods`, type: `table`, headers: [`Method`, `Meaning`, `Safe`, `Idempotent`], rows: [
        [`GET`, `Read`, `Yes`, `Yes`],
        [`POST`, `Create / trigger`, `No`, `No`],
        [`PUT`, `Replace whole resource`, `No`, `Yes`],
        [`PATCH`, `Partial update`, `No`, `Depends on the change`],
        [`DELETE`, `Remove`, `No`, `Yes`]
      ] },
      { title: `A five-minute REST API (Ticketmaster)`, type: `code`, body: `GET    /events?city=NYC&date=2026-05-01&limit=20&cursor=...
GET    /events/{eventId}
GET    /venues/{venueId}
GET    /events/{eventId}/tickets?section=VIP
POST   /events/{eventId}/bookings      Idempotency-Key: <uuid>
       { "tickets": [{ "section": "VIP", "quantity": 2 }], "payment_method": "card" }
       -> 201 { "booking_id": "...", "status": "pending" }
GET    /bookings/{bookingId}
DELETE /bookings/{bookingId}` }
    ],
    interview: [
      { q: `Design the REST endpoints for a ticket booking system.`, a: `Resources from the core entities: events, venues, tickets, bookings. <code>GET /events</code> with optional query filters and pagination, <code>GET /events/{id}</code>, <code>GET /events/{id}/tickets</code> for availability, <code>POST /events/{id}/bookings</code> with seats and payment in the body (plus an idempotency key), <code>GET /bookings/{id}</code> and <code>DELETE /bookings/{id}</code> to cancel. The user comes from the auth token, never from the body.`, diff: `easy` },
      { q: `Is PATCH idempotent?`, a: `Not necessarily. It depends on what the patch does. Setting a field to a value ("email = x") gives the same state however often it runs, so it is idempotent. Relative changes ("append this item", "increment by one") are not. PUT is always idempotent because it replaces the whole resource with the same representation.`, diff: `medium` },
      { q: `When do you use a path parameter vs a query parameter?`, a: `Path parameters identify the resource and are required for the request to make sense, like the event ID in <code>/events/123/tickets</code>. Query parameters are optional modifiers: filters, sorting, pagination and flags, like <code>?section=VIP&amp;limit=20</code>. Required identity in the path, optional behaviour in the query string, payload in the body.`, diff: `easy` },
      { q: `Why is DELETE considered idempotent if the second call returns 404?`, a: `Idempotency is about server state, not the response. After the first DELETE the booking is gone; every repeat leaves it gone. The status code can differ (204 then 404) without breaking idempotency, so clients can safely retry a DELETE after a timeout.`, diff: `medium` },
      { q: `Your interviewer says the mobile app and the web dashboard need very different data. What do you propose?`, a: `That's the classic signal for GraphQL: one schema, and each client queries exactly the fields it needs in one request, avoiding both a sprawl of client-specific endpoints and oversized responses. I'd mention the costs: resolver batching to avoid N+1 queries, field-level authorization, and query cost limits. A simpler alternative is a backend-for-frontend layer per client over REST.`, diff: `medium` },
      { q: `Where would you use gRPC in a design?`, a: `Between internal services: for example booking calling inventory and payment. Generated, typed clients catch contract mismatches at build time, Protocol Buffers are compact, HTTP/2 multiplexes calls over long-lived connections, and streaming is built in. I'd keep REST at the public edge because browsers and third parties expect it.`, diff: `easy` }
    ],
    labs: [`methodSemantics`]
  },
  // ------------------------------------------------------------------
  {
    id: `ch8`, part: 2, number: 8,
    source: { title: `Hello Interview: API Design`, url: `https://www.hellointerview.com/learn/system-design/core-concepts/api-design` },
    title: `API principles and patterns: pagination, idempotency, versioning, security`,
    overview: `Interviewers judge an API against a few principles even if they never name them: resources not actions, consistency, least surprise, statelessness, safe retries, pagination, secure by default, evolution without breaking clients, and actionable errors. Those principles show up as concrete patterns: <strong>offset or cursor pagination</strong>, filtering and sorting conventions, <strong>idempotency keys</strong>, a consistent error envelope, <strong>versioning</strong>, authentication with <strong>JWTs or API keys</strong>, role-based access control and <strong>rate limiting</strong>.`,
    concepts: [
      { term: `Nine principles`, def: `Design around resources; be consistent everywhere; follow least surprise (GET never mutates, 200 means success); keep the API stateless; make retries safe; paginate anything that can grow; secure every endpoint by default; evolve without breaking clients; make errors actionable.`, why: `Use them as justifications out loud: "an idempotency key here so a retry can't double-book" beats reciting the list.` },
      { term: `Statelessness`, def: `Every request carries what the server needs: auth token, parameters and payload. No server remembers previous requests.`, why: `Any server can handle any request, so horizontal scaling is just a load balancer. A big reason JWTs are popular in distributed systems.` },
      { term: `Offset pagination`, def: `<code>?offset=20&amp;limit=10</code> skips rows and returns the next page. Simple, supports "jump to page 5".`, why: `On live data, inserts and deletes shift the offsets so pages repeat or skip items, and large offsets get slow because the database still walks past the skipped rows.`, demo: `paginationDrift` },
      { term: `Cursor pagination`, def: `The response includes a <code>next_cursor</code> that encodes the position of the last item (an ID or timestamp). The next request asks for items after it: <code>WHERE (created_at, id) &lt; (cursor) ORDER BY ... LIMIT 10</code>.`, why: `Stable under inserts and fast at any depth with an index, at the cost of random page access. Use it for feeds and real-time data; offset is fine elsewhere. Always cap the page size.`, demo: `paginationDrift` },
      { term: `Filtering and sorting`, def: `Query parameters by convention: <code>?status=upcoming&amp;city=NYC</code>, <code>?sort=-date</code> for descending.`, why: `The real work is consistency: if events filter by <code>status</code>, bookings shouldn't use <code>state</code>.` },
      { term: `Idempotency keys`, def: `The client generates a unique key per logical operation and sends it (e.g. an <code>Idempotency-Key</code> header). The server stores the key with the result of the first request; a retry with the same key gets the stored result instead of being processed again.`, why: `Turns a non-idempotent POST (bookings, payments, orders) into one that's safe to retry after a timeout. This is how Stripe handles payment retries.`, demo: `idempotencyKey` },
      { term: `Implementing idempotency keys`, def: `Store the key with a unique constraint, ideally in the same transaction as the business write; mark it in progress while processing so concurrent duplicates wait or get 409; keep keys for a retention window (e.g. 24 hours); scope keys per user.`, why: `Checking and then writing in two separate steps reintroduces the race that creates duplicates.`, demo: `idempotencyKey` },
      { term: `Consistent error envelope`, def: `Every error uses the same body shape: a stable machine-readable <code>code</code> (e.g. <code>SEAT_UNAVAILABLE</code>) and a human-readable <code>message</code>, with the right 4xx/5xx status.`, why: `Clients write error handling once and branch on codes; messages can change without breaking anyone.` },
      { term: `Versioning`, def: `<strong>URL versioning</strong> (<code>/v1/events</code>) is explicit and easy to route. <strong>Header versioning</strong> (<code>API-Version: 2</code>) keeps URLs clean but is less visible. Adding fields is safe; renaming, removing or changing meaning is a breaking change.`, why: `Old mobile app versions live for years. URL versioning is the safe interview answer.` },
      { term: `Authentication vs authorization`, def: `<strong>Authentication</strong>: who is calling? <strong>Authorization</strong>: may they do this to this specific resource (John can cancel his own booking, not everyone's)?`, why: `Checking only authentication is how users end up reading each other's data.` },
      { term: `API keys`, def: `Long random secrets identifying an application, looked up server-side with their permissions and limits.`, why: `Good for server-to-server calls and third-party developers. Wrong for end users: they don't expire or carry user context.` },
      { term: `JWT`, def: `A signed token holding claims such as user ID, role and expiry. Any service with the verification key can validate it without a database lookup.`, why: `Stateless user sessions that work across many services. Trade-off: revoking a token before it expires needs short lifetimes or a deny list.` },
      { term: `Role-based access control`, def: `Users get roles (customer, venue_manager, admin); roles get permissions. Each request checks authentication, then the role and resource ownership.`, why: `In interviews, just say which roles can call which endpoints when it matters.` },
      { term: `Rate limiting`, def: `Cap requests per client per period: per user, per IP for anonymous traffic, or per endpoint (e.g. 10 booking attempts a minute). Enforced at the API gateway or middleware; excess gets <strong>429 Too Many Requests</strong>. Common algorithms: fixed window, sliding window, token bucket.`, why: `Protects against abuse, scraping and runaway clients. One sentence is usually enough unless asked for the algorithm.`, demo: `rateLimiter` }
    ],
    cheatsheet: [
      { title: `Offset vs cursor pagination`, type: `table`, headers: [``, `Offset`, `Cursor`], rows: [
        [`Request`, `?offset=40&limit=20`, `?cursor=abc&limit=20`],
        [`Jump to page N`, `Yes`, `No`],
        [`New items while paging`, `Duplicates or gaps`, `Stable`],
        [`Deep pages`, `Slow (skips rows)`, `Fast (index seek)`],
        [`Use for`, `Admin tables, search results`, `Feeds, timelines, live data`]
      ] },
      { title: `Patterns to name`, type: `list`, items: [
        `Paginate every list, with a maximum page size.`,
        `Idempotency key on POSTs that create bookings, orders or payments.`,
        `Errors: right status class plus <code>{ "error": { "code", "message" } }</code>.`,
        `URL versioning (<code>/v1/</code>); additive changes only within a version.`,
        `JWT for user sessions, API keys for services and third parties.`,
        `Authorization checks ownership of the specific resource, not just login.`,
        `Rate limit at the gateway; respond 429 with a Retry-After header.`
      ] },
      { title: `Idempotent booking endpoint`, type: `code`, body: `POST /events/123/bookings
Idempotency-Key: 8e03978e-740c-4c2e-abd1-52f427d5c177

BEGIN;
  INSERT INTO idempotency_keys (user_id, key, status) VALUES (...)   -- unique (user_id, key)
    ON CONFLICT DO NOTHING;
  -- 0 rows inserted?  -> return the stored response (or 409 if still in progress)
  INSERT INTO bookings (...) VALUES (...);
  UPDATE idempotency_keys SET status = 'done', response = ... WHERE ...;
COMMIT;` }
    ],
    interview: [
      { q: `A booking request times out and the client retries. How do you avoid double-booking?`, a: `Make the operation idempotent with an idempotency key. The client generates a UUID per booking attempt and sends it with every retry. The server records the key (unique per user) in the same transaction as the booking; a retry finds the key and returns the stored result instead of booking again. Concurrent duplicates see the key in progress and wait or get 409.`, diff: `medium` },
      { q: `Offset or cursor pagination for a news feed?`, a: `Cursor. New posts arrive constantly, so offsets shift and users see duplicates or miss items; deep offsets also get slow because the database walks past skipped rows. A cursor encoding the last item's (timestamp, id) gives a stable, index-backed "items older than this" query. Offset is fine for admin tables where jumping to a page matters.`, diff: `easy` },
      { q: `JWT or server-side sessions?`, a: `JWTs are self-contained and signed, so any service can verify them without a lookup, which suits stateless, distributed services. The downside is revocation: a stolen token is valid until it expires, so use short-lived access tokens with refresh tokens or a deny list. Server-side sessions are easy to revoke but need a shared session store on every request. Either is fine in an interview if you say which and why.`, diff: `medium` },
      { q: `How would you version a public API?`, a: `Version in the URL (<code>/v1/</code>) because it's explicit and easy to route. Within a version, only make additive, backward-compatible changes: new optional fields and endpoints. Renames, removals and semantic changes go into a new version, with the old one supported and deprecated over a published timeline.`, diff: `easy` },
      { q: `What's the difference between authentication and authorization, with an example?`, a: `Authentication proves who the caller is, e.g. by validating a JWT. Authorization decides whether that caller may act on this resource, e.g. that the booking being cancelled belongs to them or that they are an admin. A common bug is authenticating the user but trusting a resource ID without checking ownership.`, diff: `easy` },
      { q: `Explain token bucket rate limiting.`, a: `Each client has a bucket holding up to B tokens, refilled at R tokens per second. Each request spends a token; with an empty bucket the request gets 429. It allows short bursts up to B while enforcing an average rate R, and needs only a count and a timestamp per client, often kept in Redis. Fixed windows are simpler but allow double bursts at window boundaries.`, diff: `medium` },
      { q: `What makes an error response "actionable"?`, a: `The status class tells the client whose fault it is (4xx: fix the request; 5xx: retry later), a stable machine-readable code lets client code branch (show a seat picker on SEAT_UNAVAILABLE), and a human-readable message explains it. Same envelope on every endpoint, plus Retry-After for 429 and 503.`, diff: `easy` }
    ],
    labs: [`paginationDrift`, `idempotencyKey`, `rateLimiter`]
  },
  // ------------------------------------------------------------------
  {
    id: `ch9`, part: 3, number: 9,
    source: { title: `Hello Interview: Data Modeling`, url: `https://www.hellointerview.com/learn/system-design/core-concepts/data-modeling` },
    title: `Data modeling: database choice and schema design`,
    overview: `Data modeling decides what entities exist, how they're identified and how they relate. In an interview it happens twice: listing <strong>core entities</strong> during requirements, then sketching a schema next to the database in the high-level design, with keys, relationships, indexes and the shard key. The bar is "clear and good enough". Default to a <strong>relational database</strong>; let <strong>access patterns</strong>, data volume and consistency needs drive every schema choice; normalize first and denormalize only for a reason.`,
    concepts: [
      { term: `Relational databases (default)`, def: `Tables with fixed schemas, rows as entities, foreign keys for relationships, SQL with joins, ACID transactions. PostgreSQL, MySQL.`, why: `Most interview problems (users, posts, orders, payments) map naturally onto tables, and ACID is what you want for no double charges or overselling. They scale further than people think with replicas, caching and sharding.` },
      { term: `Document databases`, def: `JSON-like documents with flexible schemas; related data is embedded inside a document instead of joined. MongoDB, Firestore.`, why: `Consider them for rapidly changing or very heterogeneous structures. Interview requirements are usually fixed, which removes the main reason to pick one.`, demo: `denormalize` },
      { term: `Key-value stores`, def: `Get and put by exact key, extremely fast, little else. Redis, DynamoDB, Memcached.`, why: `Caches, sessions, feature flags, single-key lookups. Usually alongside SQL, not instead of it.` },
      { term: `Wide-column stores`, def: `Rows grouped by a partition key and sorted by a clustering key (e.g. user_id, timestamp), optimized for huge write volumes. Cassandra, HBase.`, why: `Telemetry, event logs, time series: append-heavy data read by key and time range. Model tables per query and duplicate data freely.` },
      { term: `Graph databases`, def: `Nodes and edges, optimized for traversals. Neo4j, Neptune.`, why: `Almost never the right interview answer: Facebook stores its social graph in MySQL. They add operational complexity without a requirement that needs them.` },
      { term: `Three drivers of schema design`, def: `<strong>Data volume</strong> (where data can live), <strong>access patterns</strong> (how it's queried; the most important) and <strong>consistency requirements</strong> (what must change atomically together).`, why: `Tie every choice back to one of these: "likes can be eventually consistent and feeds must load fast, so I'll keep a like count on posts."` },
      { term: `Primary keys`, def: `Use system-generated IDs (<code>user_id</code>, <code>post_id</code>, UUIDs or snowflake IDs), not business data like email addresses.`, why: `Business values change; surrogate keys stay stable and are safe to reference everywhere.` },
      { term: `Relationships`, def: `<strong>One-to-many</strong>: a user has many posts (posts.user_id). <strong>Many-to-many</strong>: a join table such as likes(user_id, post_id). <strong>One-to-one</strong>: rare, often a sign the tables should merge.`, why: `Foreign keys enforce referential integrity (no orphaned posts) at some write cost; very large systems sometimes enforce it in the application instead.` },
      { term: `Constraints`, def: `NOT NULL, UNIQUE, CHECK (e.g. price &gt; 0) and foreign keys push correctness into the database.`, why: `They catch bugs the application misses, at a small cost per write.` },
      { term: `Indexes from endpoints`, def: `For each endpoint, ask what query it runs and index for it: <code>GET /users/{id}/posts</code> needs an index on posts(user_id, created_at).`, why: `Connecting indexes to endpoints shows you're thinking about real query cost.` },
      { term: `Normalization`, def: `Store each fact in exactly one place: the username lives only in users; posts reference users by ID.`, why: `Prevents update anomalies where one copy changes and another doesn't. Start here.`, demo: `denormalize` },
      { term: `Denormalization`, def: `Copy data where it's read (username on every post, a like count on posts, a precomputed feed) to avoid joins or aggregation at read time.`, why: `Faster reads, but every change must update every copy. Reasonable for analytics, audit snapshots, search indexes, counters. Often better: keep the source normalized and put denormalized views in a cache.`, demo: `denormalize` },
      { term: `Shard by the main access pattern`, def: `When one database isn't enough, choose the shard key from the dominant query (posts by user, so shard by user_id) so related data stays together.`, why: `Avoid time-based shard keys for write-heavy data (all writes hit the newest shard) and designs where common queries span shards. The shard key is hard to change later.` }
    ],
    cheatsheet: [
      { title: `Which database model?`, type: `table`, headers: [`Model`, `Pick when`, `Examples`], rows: [
        [`Relational`, `Default. Clear entities, relationships, transactions`, `PostgreSQL, MySQL`],
        [`Document`, `Schema changes often, heterogeneous or deeply nested records`, `MongoDB, Firestore`],
        [`Key-value`, `Lookup by one key: cache, sessions, flags`, `Redis, DynamoDB`],
        [`Wide-column`, `Massive appends, time series, read by key + time range`, `Cassandra, HBase`],
        [`Graph`, `Almost never in interviews`, `Neo4j, Neptune`]
      ] },
      { title: `Schema in six steps`, type: `list`, items: [
        `Pick the database type (usually relational) and say why.`,
        `List columns each entity needs for the functional requirements.`,
        `Mark primary keys and foreign keys for relationships.`,
        `Add indexes that serve each endpoint's query.`,
        `Denormalize only where a read path demands it (or cache instead).`,
        `If the data outgrows one machine, pick a shard key from the main access pattern.`
      ] },
      { title: `Social app schema sketch`, type: `code`, body: `users    (id PK, username UNIQUE, email UNIQUE, created_at)
posts    (id PK, user_id FK -> users.id, content, like_count, created_at)
         INDEX (user_id, created_at DESC)
comments (id PK, post_id FK -> posts.id, user_id FK -> users.id, content, created_at)
         INDEX (post_id, created_at)
likes    (user_id FK, post_id FK, created_at, PRIMARY KEY (user_id, post_id))
follows  (follower_id FK, followee_id FK, PRIMARY KEY (follower_id, followee_id))
         INDEX (followee_id)
-- shard key if needed: user_id (posts, likes and follows by follower live with their user)` }
    ],
    interview: [
      { q: `Why default to a relational database?`, a: `Most interview domains are entities with clear relationships, which map directly to tables, and SQL handles ad-hoc queries and joins. ACID transactions give the consistency you need for money, inventory and bookings. Scale concerns are usually overstated: replicas, caching, partitioning and sharding take relational systems very far. I'd switch only for a concrete need, like append-heavy time series.`, diff: `easy` },
      { q: `When would you denormalize, and what does it cost?`, a: `When a hot read path would otherwise need expensive joins or aggregations: a like count on posts, the author's name on a feed item, a precomputed timeline. The cost is write amplification and consistency risk: every change must update every copy, and a missed update leaves stale data. I'd keep the source of truth normalized and denormalize into a cache or read model fed by events where possible.`, diff: `medium` },
      { q: `Model likes on posts.`, a: `A join table <code>likes(user_id, post_id, created_at)</code> with primary key (user_id, post_id), which prevents duplicate likes and answers "did I like this?". An index on post_id supports listing likers. Showing counts on every post view shouldn't COUNT(*) each time, so keep a denormalized <code>like_count</code> on posts, updated asynchronously or in batches since it can be eventually consistent; very hot posts may need sharded counters.`, diff: `medium` },
      { q: `Why not use email as the primary key for users?`, a: `Emails change, and a primary key is referenced from many tables, so changing it means cascading updates everywhere. Emails are also personal data you may need to delete or mask. Use a surrogate ID as the key and a UNIQUE constraint on email.`, diff: `easy` },
      { q: `Your schema needs "recent posts from everyone I follow". What changes?`, a: `With normalized tables that's a join of follows and posts, sorted by time across many users, which is expensive at scale and spans shards if posts are sharded by author. Options: an index on posts(user_id, created_at) and merging per-followee results for small fan-in; or a precomputed timeline per user (fan-out on write) in a cache or wide-column table, with celebrities handled at read time. The access pattern drives the data model.`, diff: `hard` },
      { q: `When is a document database a better fit than SQL?`, a: `When records are heterogeneous or change shape often, or when you always read a whole aggregate together (a product with variable attributes, a user profile with optional nested sections), so embedding avoids joins. The trade-off is weaker joins and harder updates of embedded copies. With a fixed interview scope, I'd still default to SQL unless the interviewer emphasizes flexible schemas.`, diff: `medium` }
    ],
    labs: [`denormalize`]
  },
  // ------------------------------------------------------------------
  {
    id: `ch10`, part: 4, number: 10,
    source: { title: `Hello Interview: Database Indexing`, url: `https://www.hellointerview.com/learn/system-design/core-concepts/db-indexing` },
    title: `How indexes work: B-trees, LSM trees and hash indexes`,
    overview: `Without an index, finding one row means scanning every page of the table. An <strong>index</strong> is a separate structure that leads straight to the right pages, at the cost of extra storage and extra work on every write. <strong>B-trees</strong> are the default: shallow, sorted, good for both equality and range queries. <strong>LSM trees</strong> turn random writes into sequential ones for write-heavy systems, paying with compaction and read amplification. <strong>Hash indexes</strong> answer exact-match lookups in one step but can't do ranges.`,
    concepts: [
      { term: `Heap files and full scans`, def: `Table rows are stored in pages (typically 8 KB) on disk in no particular order. Without an index, a query loads every page into memory to check it.`, why: `Millions of page reads to find one row. Even on SSDs, reading everything is far slower than reading a few pages.`, demo: `indexScan` },
      { term: `What an index buys`, def: `A separate structure keyed by column values that points to the rows' locations, so a lookup reads a handful of pages instead of all of them.`, why: `The difference between O(N) and O(log N) page reads: seconds versus milliseconds on big tables.`, demo: `indexScan` },
      { term: `What an index costs`, def: `Extra disk space (sometimes close to the table's size) and extra writes: every insert, update or delete must also update every index on the table.`, why: `Write-heavy, rarely-read tables (logs) and tiny tables may be better without them. Index for real queries, not "just in case".`, demo: `indexScan` },
      { term: `B-tree structure`, def: `A balanced tree of page-sized nodes, each holding hundreds of sorted keys and child pointers. All leaves sit at the same depth; nodes split and merge to stay balanced. <strong>B+ trees</strong> keep all values in the leaves and link leaves for range scans.`, why: `A fan-out of hundreds means a billion rows fit in a tree 3-4 levels deep, and the top levels stay cached in memory.`, demo: `indexScan` },
      { term: `Why B-trees are the default`, def: `Sorted order serves equality (<code>email = ?</code>), ranges (<code>age &gt; 25</code>), prefix matches and ORDER BY; performance stays predictable as data grows; node size matches disk pages.`, why: `PostgreSQL creates B-trees for primary keys and UNIQUE constraints automatically; MongoDB indexes are B-trees too. In doubt, say B-tree.` },
      { term: `LSM trees`, def: `Writes go to a write-ahead log and an in-memory sorted <strong>memtable</strong>. When full, it's flushed as an immutable sorted file (<strong>SSTable</strong>). Background <strong>compaction</strong> merges files and drops overwritten or deleted values.`, why: `Every disk write is sequential and batched, so write throughput is very high: metrics, logs, time series. Cassandra, RocksDB, LevelDB and (reportedly) DynamoDB's storage use this idea.`, demo: `indexScan` },
      { term: `LSM reads`, def: `A read checks the memtable, then SSTables from newest to oldest. <strong>Bloom filters</strong> skip files that can't contain the key; sparse indexes locate blocks inside files.`, why: `Reads touch more structures than a B-tree (read amplification), and compaction uses disk bandwidth in the background.` },
      { term: `Hash indexes`, def: `A hash table from key to row location: one step for exact matches.`, why: `No ordering, so no ranges or sorting. Used for in-memory stores (Redis) and some engines' equality indexes; B-trees are usually close enough that hash indexes are rarely chosen explicitly.`, demo: `indexScan` },
      { term: `Primary vs secondary indexes`, def: `The primary (clustered) index determines how rows are stored; secondary indexes point to rows by location or primary key.`, why: `In InnoDB, a secondary index lookup then searches the primary key index, so covering indexes (next chapter) save real work.` },
      { term: `Selectivity`, def: `How much an index narrows the result. An index on a column with few distinct values (a boolean) rarely helps; the planner scans instead.`, why: `High-cardinality columns (user_id, email) make the best indexes.` },
      { term: `Index choice in interviews`, def: `Mid-level: know when to add an index and on which columns. Senior and staff: know the index types and trade-offs.`, why: `Infrastructure interviews go deep; product interviews mostly want "index on X because endpoint Y filters by it".` }
    ],
    cheatsheet: [
      { title: `Index types`, type: `table`, headers: [`Index`, `Good at`, `Bad at`, `Seen in`], rows: [
        [`B-tree / B+ tree`, `Equality, ranges, sorting, prefixes`, `Very high write rates`, `PostgreSQL, MySQL, MongoDB`],
        [`LSM tree`, `Write-heavy ingest, sequential I/O`, `Read amplification, compaction cost`, `Cassandra, RocksDB, HBase`],
        [`Hash`, `Exact-match lookups`, `Ranges, sorting`, `Redis, in-memory maps`],
        [`Geospatial`, `Nearby / bounding-box queries`, `Generic queries`, `PostGIS, Redis GEO, Elasticsearch`],
        [`Inverted`, `Full-text search`, `Frequent updates`, `Elasticsearch, Lucene`]
      ] },
      { title: `Rules of thumb`, type: `list`, items: [
        `Index columns your endpoints filter, join or sort by.`,
        `Prefer high-cardinality columns; skip booleans and tiny tables.`,
        `Each index slows every write to the table and uses disk.`,
        `B-tree by default; LSM-based stores for write-heavy ingest.`,
        `A B-tree over a billion rows is only 3-4 levels deep.`
      ] },
      { title: `B-tree depth math`, type: `code`, body: `page 8 KB, key + pointer ~ 16-32 bytes  ->  fan-out ~ 250-500
depth 1: 500 keys
depth 2: 500^2 = 250,000
depth 3: 500^3 = 125,000,000
depth 4: 500^4 = 62,500,000,000
-> a lookup reads ~3-4 pages (top levels are cached), vs scanning millions` }
    ],
    interview: [
      { q: `Why are B-trees the default index structure?`, a: `They keep keys sorted, so one structure serves equality, range, prefix and ORDER BY queries. Nodes are sized to disk pages with hundreds of keys each, so the tree is only 3-4 levels deep even for billions of rows, and the upper levels stay in memory. They stay balanced under random inserts and deletes, giving predictable performance.`, diff: `easy` },
      { q: `When would you prefer an LSM-tree-based store?`, a: `For write-heavy workloads such as metrics, logs, events and time series. LSM trees buffer writes in memory and flush sorted immutable files sequentially, so writes are cheap and batched. The trade-offs are reads that may check several files (mitigated by Bloom filters), background compaction competing for I/O, and space used by obsolete versions until compaction.`, diff: `medium` },
      { q: `Why not index every column?`, a: `Each index costs storage and must be updated on every insert, update and delete, so write throughput falls as indexes are added. Many would never be used, or have low selectivity (booleans) so the planner ignores them. Index for the queries the endpoints actually run and check usage over time.`, diff: `easy` },
      { q: `What's the difference between a hash index and a B-tree index?`, a: `A hash index maps a key straight to a location: very fast exact matches, but no ordering, so no ranges, prefix searches or sorting. A B-tree is slightly slower for point lookups (a few page reads) but supports all of those. That flexibility is why B-trees are the general default and hash indexes are niche.`, diff: `easy` },
      { q: `How many disk reads does a primary key lookup take on a 1-billion-row table?`, a: `With 8 KB pages and a fan-out of a few hundred, a B-tree over a billion keys is about 4 levels deep. The root and upper levels are almost always in the buffer pool, so a lookup usually costs one or two actual disk reads (the leaf and the row's page), compared with millions for a full scan.`, diff: `medium` },
      { q: `Explain read amplification and write amplification in index structures.`, a: `Write amplification is how many bytes are written to disk per byte of user data: a B-tree rewrites whole pages for small changes; an LSM tree rewrites data during each compaction. Read amplification is how much is read per lookup: B-trees read one path; LSM trees may check the memtable and several SSTables. B-trees favour reads, LSM trees favour writes.`, diff: `hard` }
    ],
    labs: [`indexScan`]
  },
  // ------------------------------------------------------------------
  {
    id: `ch11`, part: 4, number: 11,
    source: { title: `Hello Interview: Database Indexing`, url: `https://www.hellointerview.com/learn/system-design/core-concepts/db-indexing` },
    title: `Specialized indexes and index tuning: geospatial, inverted, composite, covering`,
    overview: `Some queries don't fit a plain one-column B-tree. "Restaurants within 2 km" needs a <strong>geospatial index</strong>: geohashes, quadtrees or R-trees. "Posts containing these words" needs an <strong>inverted index</strong>. Multi-column filters need <strong>composite indexes</strong> with the right column order, and the fastest queries are answered from a <strong>covering index</strong> without touching the table. Knowing which to name, and why, is what interviewers listen for.`,
    concepts: [
      { term: `Why geo needs its own index`, def: `A B-tree on latitude and one on longitude each return a huge band of the planet; intersecting them is slow. Proximity is two-dimensional.`, why: `"Find nearby drivers / restaurants / friends" is one of the most common interview requirements.`, demo: `geohash` },
      { term: `Geohash`, def: `Interleaves bits of latitude and longitude and encodes them in base 32, giving a string where each extra character narrows the cell (6 characters is about 1.2 km x 0.6 km). Nearby points usually share a prefix.`, why: `Turns 2-D proximity into a 1-D prefix lookup that a normal B-tree or Redis can handle. Query the cell and its 8 neighbours, because points just across a cell edge can have very different hashes.`, demo: `geohash` },
      { term: `Quadtree`, def: `Recursively splits space into four quadrants, subdividing only where a cell holds too many points.`, why: `Adapts to density (deep in Manhattan, shallow over the ocean). Good as an in-memory index for things like nearby-driver search.` },
      { term: `R-tree`, def: `A balanced tree of nested, possibly overlapping bounding rectangles, used by PostGIS and other spatial databases.`, why: `Handles shapes (polygons, routes) as well as points, and works well on disk. Often the "real database" answer: PostGIS on PostgreSQL.` },
      { term: `Inverted index`, def: `A map from each term to the list of documents containing it (a posting list), built by tokenizing, lowercasing and stemming text. Queries intersect or union posting lists, then rank results (e.g. TF-IDF, BM25).`, why: `<code>LIKE '%word%'</code> scans every row; an inverted index answers it from a few lists. The basis of Elasticsearch and Lucene.`, demo: `invertedIndex` },
      { term: `Search in a design`, def: `Keep the source of truth in the primary database and stream changes (CDC) into a search engine such as Elasticsearch.`, why: `The search index is eventually consistent, so say so, and expect indexing lag after writes.` },
      { term: `Composite indexes`, def: `One B-tree over several columns, sorted by the first column, then the second within it, and so on, like a phone book sorted by last name then first name.`, why: `One index can serve a whole multi-column filter plus its sort order.`, demo: `compositeIndex` },
      { term: `Leftmost-prefix rule`, def: `An index on (a, b, c) helps queries that constrain a, or a and b, or a, b and c. It can't seek on b or c alone. A range on a column stops seeking on later columns.`, why: `Order columns <strong>equality filters first, then the range or sort column</strong>: (user_id, created_at) serves "this user's posts, newest first".`, demo: `compositeIndex` },
      { term: `Covering indexes`, def: `An index containing every column a query needs (in the key or as included columns), so the database answers from the index alone (an index-only scan).`, why: `Skips the extra lookup into the table for each row, which is often the dominant cost for hot queries. Costs more index space.`, demo: `compositeIndex` },
      { term: `Partial and functional indexes`, def: `Index only rows matching a condition (<code>WHERE status = 'active'</code>) or an expression (<code>lower(email)</code>).`, why: `Smaller, cheaper indexes targeted at the queries that matter.` },
      { term: `Reading a query plan`, def: `<code>EXPLAIN</code> shows whether the planner uses an index seek, an index-only scan or a sequential scan, and the estimated rows.`, why: `Saying "I'd check the plan for a sequential scan" is a practical, credible answer to "this query is slow".` }
    ],
    cheatsheet: [
      { title: `Geospatial options`, type: `table`, headers: [`Approach`, `How`, `Strength`, `Where`], rows: [
        [`Geohash`, `Interleaved lat/lon bits as a base-32 prefix`, `Works on any B-tree or key-value store`, `Redis GEO, DynamoDB designs`],
        [`Quadtree`, `Split space in 4 where dense`, `Adapts to density, simple in memory`, `Custom services`],
        [`R-tree`, `Nested bounding rectangles`, `Shapes, disk-friendly`, `PostGIS, SQLite R*Tree`]
      ] },
      { title: `Composite index (user_id, status, created_at)`, type: `table`, headers: [`Query`, `Uses the index?`], rows: [
        [`WHERE user_id = ?`, `Yes (prefix)`],
        [`WHERE user_id = ? AND status = ?`, `Yes`],
        [`WHERE user_id = ? AND status = ? ORDER BY created_at DESC`, `Yes, including the sort`],
        [`WHERE user_id = ? ORDER BY created_at`, `Seeks user_id; sort needs extra work (status in between)`],
        [`WHERE status = ?`, `No seek (not a prefix)`],
        [`WHERE created_at > ?`, `No seek`]
      ] },
      { title: `Geohash precision`, type: `table`, headers: [`Length`, `Cell size (approx.)`, `Good for`], rows: [
        [`4`, `39 km x 20 km`, `City-level`],
        [`5`, `4.9 km x 4.9 km`, `Neighbourhood`],
        [`6`, `1.2 km x 0.6 km`, `Nearby restaurants`],
        [`7`, `153 m x 153 m`, `Street / nearby drivers`],
        [`8`, `38 m x 19 m`, `Building`]
      ] }
    ],
    interview: [
      { q: `How would you find all drivers within 2 km of a rider?`, a: `Store driver locations with a geospatial index. A simple version: compute a geohash for each driver's position (precision 6, cells about 1 km) and keep drivers per cell in Redis (or use Redis GEO). For a query, compute the rider's cell, fetch drivers in that cell and its 8 neighbours, then filter by exact distance. Driver positions update every few seconds, so an in-memory structure suits better than a disk database. PostGIS with an R-tree is the database alternative.`, diff: `medium` },
      { q: `Why do you query neighbouring geohash cells?`, a: `Two points a metre apart can sit on opposite sides of a cell boundary and share a short prefix or none at all. Searching only the user's own cell misses them. Including the 8 surrounding cells covers the radius, and a final exact-distance filter removes points outside it.`, diff: `medium` },
      { q: `How does full-text search work under the hood?`, a: `Documents are tokenized (split, lowercased, stemmed, stop words dropped) and each term maps to a posting list of document IDs, often with positions and frequencies. A query looks up each term's list, intersects or unions them, and ranks the matches with a scoring function like BM25. It's kept in a search engine like Elasticsearch, fed from the primary database by change data capture.`, diff: `medium` },
      { q: `Which index serves: SELECT * FROM orders WHERE customer_id = ? AND status = 'shipped' ORDER BY created_at DESC LIMIT 20?`, a: `A composite index on (customer_id, status, created_at). The two equality filters come first so the database seeks straight to that customer's shipped orders, which are already sorted by created_at, so it reads the first 20 entries without sorting. Putting created_at first would make the equality filters unusable for seeking.`, diff: `medium` },
      { q: `What is a covering index and when is it worth it?`, a: `An index that contains every column a query reads, so the database answers from the index without fetching table rows. It's worth it for very hot queries where the per-row table lookup dominates, such as listing IDs and titles for a feed. The cost is a bigger index and more write work, so use it selectively.`, diff: `medium` },
      { q: `Quadtree or geohash?`, a: `Geohash is a fixed grid encoded as strings, so it drops into any key-value store or B-tree and is easy to shard, but cells hold very different numbers of points in dense and sparse areas. A quadtree subdivides only where points are dense, giving balanced cells, but it's an in-memory tree you must build and maintain. Geohash for simplicity and storage; quadtree when density varies a lot and an in-memory index is acceptable.`, diff: `hard` }
    ],
    labs: [`compositeIndex`, `geohash`, `invertedIndex`]
  }
);
