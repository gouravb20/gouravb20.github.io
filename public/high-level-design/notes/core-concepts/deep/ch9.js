// Deep dive: Chapter 9, Data modeling: database choice and schema design. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch9 = {
  hook: `<p>A small social app launches with a schema someone sketched in an afternoon: users are keyed by email address, each post stores the author's username, likes are a JSON array inside the post row, and there are no indexes beyond the primary keys. For three months everything is fine.</p>
<p>Then a user changes their email, and every table that referenced them by email has to be rewritten. A popular post collects 40,000 likes and every new like rewrites a huge row while two concurrent likes overwrite each other. The profile page, which lists a user's posts newest first, starts scanning the whole posts table. Someone renames themselves, and their old username lingers on half their posts.</p>
<p>Each of these was a modeling decision, and each one is cheap to get right on day one and painful to change once the data is large and in production. In an interview the bar is lower than in production, "clear and good enough", but the same handful of decisions separates a schema that obviously supports the design from one that quietly fights it.</p>`,
  sections: [
    {
      id: "why-model",
      title: "What data modeling decides, and what drives it",
      kicker: "The job",
      blocks: [
        {
          type: "text",
          html: `<p>Data modeling decides which <strong>entities</strong> exist, how each one is <strong>identified</strong>, and how they <strong>relate</strong> to each other. In an interview it happens twice. First, while gathering requirements, you list the core entities (User, Post, Like, Follow) as nouns, with no columns yet. Later, in the high-level design, you sketch a schema next to the database box: the important fields, primary keys, relationships, the indexes the endpoints need and, if the data is big, the shard key.</p>
<p>Three forces drive every choice in that schema:</p>
<ul>
<li><strong>Data volume.</strong> How much data, and how fast it grows. A few gigabytes fits comfortably on one database server with room to spare; many terabytes forces partitioning, which constrains everything else.</li>
<li><strong>Access patterns.</strong> Which queries run, how often, and how fast they must be. This is the most important force: a schema is good or bad only relative to the queries it has to serve.</li>
<li><strong>Consistency requirements.</strong> Which pieces of data must change together atomically. A booking and the seat it reserves must never disagree; a like count can lag by a few seconds.</li>
</ul>`,
        },
        {
          type: "keypoints",
          title: "A working default",
          items: [
            "Start with a relational database.",
            "Normalize first: each fact in one place.",
            "Derive indexes from the endpoints' queries.",
            "Denormalize, cache or shard only for a measured or clearly predicted reason, and say what it costs.",
          ],
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>Keep the interview schema small. Five or six key fields per entity, plus keys and indexes, is plenty. A whiteboard full of columns burns time and hides the decisions the interviewer actually cares about: identity, relationships, indexes and partitioning.</p>`,
        },
      ],
    },
    {
      id: "choosing-a-database",
      title: "Choosing a database: relational by default",
      kicker: "Database choice",
      blocks: [
        {
          type: "text",
          html: `<p>A <strong>relational database</strong> such as PostgreSQL or MySQL stores entities as rows in tables with fixed schemas, links them with foreign keys, answers ad hoc questions with SQL joins, and wraps related changes in ACID transactions. That combination handles the vast majority of product workloads, and it scales further than its reputation suggests: a single well-provisioned server with read replicas serves a very large application, and sharding extends it further when needed.</p>
<p>The default matters because relational databases are the most forgiving choice when requirements change. New queries can usually be served by adding an index; new relationships by adding a table. Specialized databases are optimized for particular access patterns and are excellent when your workload matches them, but they make other queries awkward or impossible.</p>`,
        },
        {
          type: "table",
          headers: ["Type", "Data shape", "Strong at", "Examples"],
          rows: [
            ["Relational", "Tables, rows, foreign keys", "Joins, transactions, flexible queries, constraints", "PostgreSQL, MySQL"],
            ["Document", "JSON-like documents with nested data", "Reading a whole aggregate at once; varied, evolving fields", "MongoDB, Firestore"],
            ["Key-value", "Opaque value per key", "Extremely fast get and put by exact key", "Redis, DynamoDB, Memcached"],
            ["Wide-column", "Rows grouped by partition key, sorted by clustering key", "Huge write volumes, time-ordered data per key", "Cassandra, HBase, ScyllaDB"],
            ["Graph", "Nodes and edges", "Multi-hop traversals (friends of friends, fraud rings)", "Neo4j, Amazon Neptune"],
          ],
        },
        {
          type: "text",
          html: `<p>A <strong>document database</strong> fits when your data naturally forms self-contained aggregates that are read and written as a unit (a product listing with its variants and attributes, a user's settings blob), when the fields vary a lot between records, and when you rarely need to join across aggregates. It fits badly when entities are heavily shared and related: once you need many-to-many relationships and cross-document consistency, you end up rebuilding joins in application code. Note too that the line has blurred: PostgreSQL's <code>JSONB</code> columns give a relational database flexible document fields where you need them.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Discord", title: "Matching the store to the access pattern", html: "Discord has written about moving message storage from MongoDB to Cassandra in 2017 and later to ScyllaDB, partitioning messages by channel and a time bucket. The dominant query, \"recent messages in this channel\", reads one partition in sorted order, which wide-column stores do very well at enormous write volumes." },
            { org: "Instagram", title: "Sharded relational", html: "Instagram's engineering blog described running on PostgreSQL split into many logical shards, with IDs that embed the shard number, rather than abandoning the relational model as it grew." },
          ],
        },
        {
          type: "quiz",
          q: "An interviewer asks why you picked PostgreSQL for a ticket booking system. Which reason is strongest?",
          options: [
            "It is the newest database",
            "Bookings, seats and payments are related entities that must change together atomically, and SQL handles ad hoc queries and constraints well",
            "Document databases can't store tickets",
            "Relational databases never need indexes",
          ],
          answer: 1,
          explain: "Reserving a seat and creating a booking must succeed or fail together, and constraints like \"one booking per seat\" belong in the database. Transactions, foreign keys and unique constraints make that straightforward. Naming the requirement that drives the choice is what makes it convincing.",
        },
      ],
    },
    {
      id: "keys-and-relationships",
      title: "Keys, relationships and constraints",
      kicker: "Schema basics",
      blocks: [
        {
          type: "text",
          html: `<h3>Primary keys: system-generated, never business data</h3>
<p>Identify rows with IDs the system generates (<code>user_id</code>, <code>post_id</code>), not with real-world values like email addresses, usernames or phone numbers. Business values change (people change emails), can be reused, may be personal data you don't want spread across every table and log, and make poor join keys. Keep them as ordinary columns with a <code>UNIQUE</code> constraint.</p>
<p>The kind of ID matters at scale. Auto-incrementing integers are compact and ordered but need a central counter and reveal how many rows you have. Random UUIDs (version 4) can be generated anywhere without coordination, but random values scatter inserts across a B-tree index, hurting cache locality. Time-ordered IDs combine the benefits: Twitter's Snowflake format packs a millisecond timestamp, a machine ID and a sequence number into 64 bits, and UUID version 7 (standardized in RFC 9562) does something similar in 128 bits, so new IDs land at the end of the index and sort roughly by creation time.</p>
<h3>Relationships</h3>
<ul>
<li><strong>One-to-many:</strong> a user has many posts. Put the foreign key on the "many" side: <code>posts.user_id</code>.</li>
<li><strong>Many-to-many:</strong> users like many posts, posts are liked by many users. Use a join table, <code>likes(user_id, post_id)</code>, with the pair as its primary key.</li>
<li><strong>One-to-one:</strong> rare in practice and often a sign the two tables should be one, unless you are separating rarely used or sensitive columns.</li>
</ul>`,
        },
        {
          type: "diagram",
          title: "A small social schema",
          caption: "Users write posts (one-to-many). Likes and follows are many-to-many relationships stored as join tables whose primary key is the pair of IDs, which also prevents duplicates. The like count on posts is a deliberate denormalization.",
          svg: `<svg viewBox="0 0 620 300" role="img" aria-label="Entity relationship diagram with users, posts, likes and follows tables and their keys">
<rect x="20" y="40" width="170" height="110" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-1)" stroke-width="2"/>
<rect x="20" y="40" width="170" height="26" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="105" y="58" text-anchor="middle" font-size="13" font-weight="700">users</text>
<text x="30" y="84" font-size="12">user_id   PK</text>
<text x="30" y="104" font-size="12">username   UNIQUE</text>
<text x="30" y="124" font-size="12">email   UNIQUE</text>
<text x="30" y="144" font-size="12" style="fill: var(--dg-muted)">created_at</text>
<rect x="400" y="40" width="200" height="130" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-2)" stroke-width="2"/>
<rect x="400" y="40" width="200" height="26" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="500" y="58" text-anchor="middle" font-size="13" font-weight="700">posts</text>
<text x="410" y="84" font-size="12">post_id   PK</text>
<text x="410" y="104" font-size="12">user_id   FK</text>
<text x="410" y="124" font-size="12" style="fill: var(--dg-muted)">body</text>
<text x="410" y="144" font-size="12" style="fill: var(--dg-muted)">created_at</text>
<text x="410" y="164" font-size="12" style="fill: var(--dg-muted)">like_count (copy)</text>
<rect x="400" y="200" width="200" height="90" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-3)" stroke-width="2"/>
<rect x="400" y="200" width="200" height="26" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="500" y="218" text-anchor="middle" font-size="13" font-weight="700">likes</text>
<text x="410" y="244" font-size="12">user_id   FK</text>
<text x="410" y="264" font-size="12">post_id   FK</text>
<text x="410" y="284" font-size="12" style="fill: var(--dg-muted)">PK (user_id, post_id)</text>
<rect x="20" y="200" width="170" height="90" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-4)" stroke-width="2"/>
<rect x="20" y="200" width="170" height="26" rx="6" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="2"/>
<text x="105" y="218" text-anchor="middle" font-size="13" font-weight="700">follows</text>
<text x="30" y="244" font-size="12">follower_id   FK</text>
<text x="30" y="264" font-size="12">followee_id   FK</text>
<text x="30" y="284" font-size="12" style="fill: var(--dg-muted)">PK (both columns)</text>
<line x1="190" y1="90" x2="400" y2="90" stroke-width="2" style="stroke: var(--dg-line)"/>
<text x="295" y="82" text-anchor="middle" font-size="12">1 : many</text>
<line x1="190" y1="130" x2="400" y2="230" stroke-width="2" style="stroke: var(--dg-line)"/>
<text x="280" y="142" text-anchor="middle" font-size="12">1 : many</text>
<line x1="500" y1="170" x2="500" y2="200" stroke-width="2" style="stroke: var(--dg-line)"/>
<text x="508" y="190" font-size="12">1 : many</text>
<line x1="70" y1="150" x2="70" y2="200" stroke-width="2" style="stroke: var(--dg-line)"/>
<line x1="140" y1="150" x2="140" y2="200" stroke-width="2" style="stroke: var(--dg-line)"/>
<text x="76" y="180" font-size="12" style="fill: var(--dg-muted)">follower</text>
<text x="146" y="180" font-size="12" style="fill: var(--dg-muted)">followee</text>
</svg>`,
        },
        {
          type: "text",
          html: `<h3>Constraints push correctness into the database</h3>
<p><code>NOT NULL</code>, <code>UNIQUE</code>, <code>CHECK (price_cents &gt; 0)</code> and foreign keys turn rules into guarantees. Application code has bugs and runs in many concurrent copies; the database is the one place that sees every write. The likes table shows the value: its composite primary key makes a duplicate like impossible, even when a user double-taps and two requests race, without any locking in your code.</p>`,
        },
        {
          type: "quiz",
          q: "How should likes on posts be modeled in a relational schema?",
          options: [
            "A JSON array of user IDs inside each post row",
            "A likes table with (user_id, post_id) as the primary key, plus an index on post_id, and optionally a cached like_count on posts",
            "A column like_1, like_2, ... on posts",
            "A separate database per post",
          ],
          answer: 1,
          explain: "A join table models the many-to-many relationship, the composite key blocks duplicate likes, and indexes answer both \"who liked this post\" and \"what did this user like\". A JSON array means rewriting a huge row on every like and lost updates under concurrency. A denormalized count avoids counting rows on every read.",
        },
      ],
    },
    {
      id: "indexes",
      title: "Indexes come from your endpoints",
      kicker: "Access patterns",
      blocks: [
        {
          type: "problem",
          html: `<p>Without a suitable index, a query like "this user's 20 newest posts" scans every row in the posts table, sorts the matches and throws most of them away. At ten thousand posts nobody notices. At a billion, the profile page times out.</p>`,
        },
        {
          type: "text",
          html: `<p>The reliable way to choose indexes is to walk through your API endpoints, write down the query each one runs, and make sure an index serves it. Primary keys are indexed automatically; almost everything else needs a decision.</p>
<p>For multi-column queries, order matters. A composite index on <code>(user_id, created_at)</code> stores entries sorted by user, then by time within each user, so "posts by user 42, newest first" jumps straight to user 42's section and reads 20 entries in order: no scan, no sort. The same index also serves queries on <code>user_id</code> alone (the leftmost prefix) but not queries on <code>created_at</code> alone. Put equality filters first and the sort or range column last.</p>`,
        },
        {
          type: "code",
          lang: "sql",
          title: "From endpoints to indexes",
          code: `-- GET /users/{id}/posts?cursor=...      (profile, newest first)
CREATE INDEX posts_by_user_time ON posts (user_id, created_at DESC);

-- GET /posts/{id}/likes                  (who liked this post)
-- likes' primary key is (user_id, post_id), which serves "did user X like post Y"
-- and "posts user X liked", but not lookups by post alone:
CREATE INDEX likes_by_post ON likes (post_id);

-- GET /users/{id}/followers
CREATE INDEX follows_by_followee ON follows (followee_id);

-- POST /users  (sign-up must reject duplicate emails)
CREATE UNIQUE INDEX users_email ON users (email);`,
        },
        {
          type: "tradeoffs",
          prosLabel: "Each index buys",
          consLabel: "Each index costs",
          pros: [
            "Reads that seek instead of scanning",
            "Pre-sorted results for ORDER BY and cursor pagination",
            "Uniqueness enforcement when declared UNIQUE",
          ],
          cons: [
            "Extra work on every insert, update and delete of indexed columns",
            "Disk and memory; indexes compete with data for cache",
            "Something to maintain and to migrate when queries change",
          ],
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>Indexes are the reason "access patterns" is the most important driver. The same tables can be fast or hopeless depending on whether their indexes match the queries. When an interviewer asks "how does this endpoint perform at scale?", the answer usually starts with "it's served by an index on ...".</p>`,
        },
      ],
    },
    {
      id: "normalize-or-denormalize",
      title: "Normalize first, denormalize for a reason",
      kicker: "Reads versus writes",
      blocks: [
        {
          type: "text",
          html: `<p><strong>Normalization</strong> stores each fact in exactly one place. The username lives only in <code>users</code>; posts refer to their author by <code>user_id</code>. When someone renames themselves, one row changes and every screen shows the new name immediately. There is no way for two copies to disagree, because there is only one copy.</p>
<p><strong>Denormalization</strong> copies data to where it is read, so reads skip joins or aggregation: the author's username stored on each post, a <code>like_count</code> column on posts instead of counting the likes table, or a precomputed feed per user. Reads get cheaper and simpler. Writes get more expensive, because every copy must be updated, and correctness gets harder, because copies can drift apart when an update fails halfway or races with another.</p>`,
        },
        {
          type: "lab",
          id: "denormalize",
          caption: "Render a 20-post feed with a normalized schema, a denormalized one and a normalized schema behind a cache. Change the read-to-write ratio and the rename rate to see where each design pays its cost.",
        },
        {
          type: "compare",
          items: [
            { title: "Good reasons to denormalize", tone: "ok", html: "A hot read path that would otherwise join or aggregate on every request (like counts, feed pages); reads outnumber writes by orders of magnitude; the copied data rarely changes; brief staleness is acceptable." },
            { title: "Poor reasons", tone: "bad", html: "\"Joins are slow\" without numbers; data that changes often (copies go stale); data that must be exactly consistent, such as balances or inventory; a cache would solve the read cost without touching the schema." },
          ],
        },
        {
          type: "text",
          html: `<p>When you do denormalize, say how the copies stay correct. A <code>like_count</code> can be incremented in the same transaction that inserts the like, which keeps it exact but makes a hot post's row a point of contention. It can be updated asynchronously from a queue or change data capture, which removes contention but lets the count lag. Or it can be recomputed periodically. Often the cleanest option is to keep the normalized tables as the source of truth and put a cache in front for the hot reads, so the schema stays simple and only the cache needs invalidating.</p>`,
        },
        {
          type: "quiz",
          q: "A feed page shows each post's author username. Usernames change rarely; the feed is read millions of times a minute. What is the most reasonable choice?",
          options: [
            "Never denormalize; always join users on every read",
            "Copy the username onto posts (or serve it from a cache) and accept updating copies on the rare rename",
            "Store the username only on posts and drop it from users",
            "Shard the users table by username",
          ],
          answer: 1,
          explain: "Reads vastly outnumber renames, so paying a little extra on a rare write to save a join on every read is a good trade. The users table stays the source of truth; posts or a cache hold a copy that a rename updates, possibly asynchronously.",
        },
      ],
    },
    {
      id: "scaling-the-model",
      title: "When one database isn't enough: shard keys and feeds",
      kicker: "Scale",
      blocks: [
        {
          type: "text",
          html: `<p>Once data or write volume outgrows one machine, you <strong>shard</strong>: split rows across several databases by a <strong>shard key</strong>. The choice of key is permanent in practice and should come from the dominant access pattern. If most queries are "this user's posts", shard posts by <code>user_id</code>, so one user's posts live together and a profile page touches one shard. Shard by <code>post_id</code> instead and the same page has to ask every shard.</p>
<p>A good shard key keeps related data together, spreads load evenly, and avoids hot spots. User ID is a common choice for social products; a celebrity user can still overload one shard, which is a hot-key problem to handle separately (caching, or splitting that user's data). Queries that don't include the shard key, such as global search, become expensive scatter-gather operations and usually move to a separate system built for them.</p>`,
        },
        {
          type: "diagram",
          title: "Sharding by the main access pattern",
          caption: "The application routes every query by hashing user_id. Each shard holds a set of users together with their posts and likes, so \"this user's posts\" is a single-shard query.",
          svg: `<svg viewBox="0 0 620 220" role="img" aria-label="An application routes queries by hashing user_id to one of three shards, each holding users with their posts">
<defs><marker id="cc9-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-ink)"/></marker></defs>
<rect x="20" y="88" width="110" height="44" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="75" y="115" text-anchor="middle" font-size="13">App server</text>
<rect x="180" y="80" width="140" height="60" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="250" y="105" text-anchor="middle" font-size="13" font-weight="700">Shard router</text>
<text x="250" y="124" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">hash(user_id)</text>
<line x1="130" y1="110" x2="177" y2="110" stroke-width="2" marker-end="url(#cc9-arrow)" style="stroke: var(--dg-ink)"/>
<rect x="390" y="18" width="210" height="50" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="495" y="39" text-anchor="middle" font-size="13">Shard 1</text>
<text x="495" y="57" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">users A + their posts, likes</text>
<rect x="390" y="85" width="210" height="50" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="495" y="106" text-anchor="middle" font-size="13">Shard 2</text>
<text x="495" y="124" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">users B + their posts, likes</text>
<rect x="390" y="152" width="210" height="50" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="495" y="173" text-anchor="middle" font-size="13">Shard 3</text>
<text x="495" y="191" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">users C + their posts, likes</text>
<line x1="320" y1="98" x2="387" y2="46" stroke-width="2" marker-end="url(#cc9-arrow)" style="stroke: var(--dg-ink)"/>
<line x1="320" y1="110" x2="387" y2="110" stroke-width="2" marker-end="url(#cc9-arrow)" style="stroke: var(--dg-ink)"/>
<line x1="320" y1="122" x2="387" y2="174" stroke-width="2" marker-end="url(#cc9-arrow)" style="stroke: var(--dg-ink)"/>
</svg>`,
        },
        {
          type: "text",
          html: `<h3>"Recent posts from everyone I follow"</h3>
<p>This query breaks the clean per-user sharding: the people you follow live on many shards, so assembling a feed means querying many shards, merging and sorting, on every page load. Two standard schema responses:</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "Fan-out on read", tone: "info", html: "Store only posts. At read time, look up who the user follows, fetch each followee's recent posts (index on <code>user_id, created_at</code>) and merge. Cheap writes, expensive reads; fine for small follow counts." },
            { title: "Fan-out on write", tone: "ok", html: "Keep a precomputed feed table or cache per user, <code>feed(user_id, created_at, post_id)</code>. When someone posts, append the post ID to each follower's feed. Reads become a single-key lookup; writes multiply by follower count." },
            { title: "Hybrid", tone: "warn", html: "Fan out on write for ordinary accounts, but not for accounts with millions of followers; merge their recent posts in at read time. Avoids writing one post into ten million feeds." },
          ],
        },
        {
          type: "realworld",
          items: [
            { org: "Instagram", title: "IDs that carry the shard", html: "Instagram's 2012 post on sharding described 64-bit IDs made of a millisecond timestamp, a logical shard ID and a per-shard sequence. Any ID tells you which shard holds the row, and IDs sort by creation time." },
            { org: "Twitter", title: "Snowflake IDs", html: "Twitter created Snowflake to generate unique, roughly time-ordered 64-bit IDs across many machines without a central counter, after outgrowing database auto-increment IDs." },
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
          type: "text",
          html: `<p>Sketch the schema next to the database box in your high-level design, and keep it to what supports your endpoints. Then let the interviewer push: they will usually probe one of identity, relationships, indexes, denormalization or the shard key, and the point is to show your reasoning from access patterns.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>A strong data-model answer covers:</p>
<ol>
<li>The database choice with its reason: relational for related entities and transactions, unless an access pattern clearly calls for something else.</li>
<li>System-generated primary keys; business values as unique columns.</li>
<li>Relationships: foreign keys for one-to-many, join tables for many-to-many.</li>
<li>One index per endpoint query, with column order explained.</li>
<li>Any denormalization, why it is worth it, and how copies stay in sync.</li>
<li>If data is large, the shard key, chosen from the dominant query.</li>
</ol>`,
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Choosing a NoSQL store "because it scales" before stating any access pattern. Interviewers hear that as a guess. Name the query that dominates, then pick the database and key that make that query cheap.</p>`,
        },
        {
          type: "quiz",
          q: "Why not use email as the primary key of users?",
          options: [
            "Emails are too long to index at all",
            "Emails change, may be reused, are personal data that would spread into every referencing table, and make poor join keys; use a generated ID and a UNIQUE email column",
            "Primary keys must be numbers",
            "Emails can't be unique",
          ],
          answer: 1,
          explain: "A primary key should be stable and meaningless. If users are keyed by email, an email change cascades through every table that references them, and personal data leaks into indexes, logs and caches. A generated ID with a unique constraint on email gives the same lookup with none of the cost.",
        },
      ],
    },
  ],
  takeaways: [
    "Data modeling decides entities, identity and relationships, driven by data volume, access patterns (most important) and consistency needs.",
    "Default to a relational database; pick document, key-value, wide-column or graph stores when a dominant access pattern clearly matches them.",
    "Use system-generated primary keys (time-ordered IDs like Snowflake or UUIDv7 at scale) and keep business values such as email as UNIQUE columns.",
    "Model one-to-many with a foreign key and many-to-many with a join table; let constraints enforce rules like \"one like per user per post\".",
    "Derive indexes from endpoint queries, with equality columns first and the sort column last; every index speeds reads and slows writes.",
    "Normalize first; denormalize hot read paths for a stated reason and explain how copies stay correct. When sharding, choose the key from the dominant query.",
  ],
  furtherReading: [
    { title: "Sharding & IDs at Instagram (Instagram Engineering, 2012)", note: "How Instagram split PostgreSQL into logical shards and designed shard-aware, time-sortable IDs." },
    { title: "How Discord Stores Billions of Messages (Discord blog, 2017)", note: "Choosing a partition key from the dominant query, with Cassandra." },
    { title: "PostgreSQL documentation: Indexes", url: "https://www.postgresql.org/docs/current/indexes.html", note: "Multicolumn indexes, index-only scans and how ORDER BY uses indexes." },
  ],
};
