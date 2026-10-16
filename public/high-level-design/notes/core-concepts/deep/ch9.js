// Deep dive: Chapter 9, Data modeling: database choice and schema design. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch9 = {
  hook: `<p>This chapter covers the handful of modeling decisions that separate a schema that supports the design from one that fights it: database choice, keys, relationships, indexes, denormalization and the shard key. Each is cheap on day one and painful to change once data is large.</p>`,
  sections: [
    {
      id: "choosing-a-database",
      title: "What drives the model, and which database",
      kicker: "Database choice",
      blocks: [
        {
          type: "text",
          html: `<p>Three forces drive every schema choice: <strong>data volume</strong> (does it fit one server?), <strong>access patterns</strong> (which queries, how often, how fast; the most important) and <strong>consistency</strong> (which data must change together). Default to a <strong>relational database</strong>: joins, constraints and ACID transactions cover most products, and new queries usually just need a new index.</p>`,
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
          type: "keypoints",
          items: [
            "<strong>Document stores</strong> fit self-contained aggregates read and written as a unit; they fit badly once you need many-to-many relationships and cross-document consistency. PostgreSQL's <code>JSONB</code> gives flexible fields inside a relational model.",
            "<strong>Match the store to the dominant query:</strong> Discord moved messages to Cassandra (and later ScyllaDB), partitioned by channel and time bucket, so \"recent messages in this channel\" reads one sorted partition.",
            "Relational scales further than its reputation: Instagram ran on PostgreSQL split into many logical shards.",
          ],
        },
      ],
    },
    {
      id: "keys-and-relationships",
      title: "Keys, relationships and indexes",
      kicker: "Schema basics",
      blocks: [
        {
          type: "keypoints",
          items: [
            "<strong>System-generated primary keys</strong>, never business data. Emails change, get reused and are personal data you don't want in every table; keep them as <code>UNIQUE</code> columns.",
            "<strong>ID type at scale:</strong> auto-increment is compact but central and reveals counts; random UUIDv4 scatters B-tree inserts; time-ordered IDs (Twitter's Snowflake in 64 bits, UUIDv7 in RFC 9562) append to the index and sort by creation.",
            "<strong>One-to-many:</strong> foreign key on the many side (<code>posts.user_id</code>). <strong>Many-to-many:</strong> a join table such as <code>likes(user_id, post_id)</code> with the pair as primary key.",
            "<strong>Constraints</strong> (<code>NOT NULL</code>, <code>UNIQUE</code>, <code>CHECK</code>, foreign keys) are the one guarantee that sees every write: the likes key makes a double-tap duplicate impossible without locking.",
          ],
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
          html: `<p><strong>Indexes come from your endpoints.</strong> Write down the query each endpoint runs and make sure an index serves it. In a composite index, put equality columns first and the sort or range column last: <code>(user_id, created_at)</code> serves "user 42's newest posts" with a seek and no sort, and also serves <code>user_id</code> alone, but not <code>created_at</code> alone.</p>`,
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
            "Extra work on every write to indexed columns",
            "Disk and memory that compete with data for cache",
            "Something to maintain and migrate when queries change",
          ],
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
      id: "normalize-or-denormalize",
      title: "Normalize first, denormalize for a reason",
      kicker: "Reads versus writes",
      blocks: [
        {
          type: "text",
          html: `<p><strong>Normalization</strong> stores each fact once, so a rename changes one row and copies can't disagree. <strong>Denormalization</strong> copies data to where it is read (username on posts, <code>like_count</code>, a precomputed feed): cheaper reads, costlier writes, and copies that can drift.</p>`,
        },
        {
          type: "lab",
          id: "denormalize",
          caption: "Render a 20-post feed with a normalized schema, a denormalized one and a normalized schema behind a cache. Change the read-to-write ratio and the rename rate to see where each design pays its cost.",
        },
        {
          type: "compare",
          items: [
            { title: "Good reasons to denormalize", tone: "ok", html: "A hot read path that would otherwise join or aggregate on every request; reads outnumber writes by orders of magnitude; the copied data rarely changes; brief staleness is acceptable." },
            { title: "Poor reasons", tone: "bad", html: "\"Joins are slow\" without numbers; data that changes often; data that must be exactly consistent (balances, inventory); a cache would solve the read cost without touching the schema." },
          ],
        },
        {
          type: "list",
          title: "Keeping a copy such as like_count correct",
          items: [
            "<strong>Same transaction</strong> as the insert: exact, but a hot post's row becomes a contention point.",
            "<strong>Asynchronously</strong> from a queue or change data capture: no contention, but the count lags.",
            "<strong>Periodic recompute</strong>, or keep the normalized tables as truth and <strong>cache</strong> the hot reads.",
          ],
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
      title: "Shard keys and feeds",
      kicker: "Scale",
      blocks: [
        {
          type: "text",
          html: `<p>When one machine isn't enough, shard by a key taken from the <strong>dominant access pattern</strong>. If most queries are "this user's posts", shard by <code>user_id</code> so a profile touches one shard; shard by <code>post_id</code> and it touches all of them. Celebrity users remain a hot-key problem, and queries without the shard key (global search) usually move to a separate system.</p>`,
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
          type: "compare",
          title: "\"Recent posts from everyone I follow\" spans shards",
          items: [
            { title: "Fan-out on read", tone: "info", html: "Store only posts; at read time fetch each followee's recent posts (index on <code>user_id, created_at</code>) and merge. Cheap writes, expensive reads; fine for small follow counts." },
            { title: "Fan-out on write", tone: "ok", html: "Precompute <code>feed(user_id, created_at, post_id)</code> per user and append each new post to every follower's feed. Reads are one key lookup; writes multiply by follower count." },
            { title: "Hybrid", tone: "warn", html: "Fan out on write for ordinary accounts; merge accounts with millions of followers in at read time." },
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
          type: "callout",
          tone: "interview",
          html: `<p>Sketch five or six key fields per entity next to the database box. A strong data-model answer covers:</p>
<ol>
<li>The database choice with its reason: relational for related entities and transactions, unless an access pattern clearly calls for something else.</li>
<li>System-generated primary keys; business values as unique columns.</li>
<li>Foreign keys for one-to-many, join tables for many-to-many.</li>
<li>One index per endpoint query, with column order explained.</li>
<li>Any denormalization, why it is worth it and how copies stay in sync.</li>
<li>For large data, the shard key chosen from the dominant query.</li>
</ol>`,
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Choosing a NoSQL store "because it scales" before stating any access pattern. Name the dominant query, then pick the database and key that make it cheap.</p>`,
        },
      ],
    },
  ],
  takeaways: [
    "Access patterns drive the model; default to relational and pick specialized stores when a dominant pattern clearly matches them.",
    "Use system-generated (time-ordered at scale) primary keys, foreign keys for one-to-many, join tables for many-to-many, and constraints for rules.",
    "Derive indexes from endpoint queries, with equality columns first and the sort column last; every index speeds reads and slows writes.",
    "Normalize first; denormalize hot read paths for a stated reason and explain how copies stay correct.",
    "When sharding, choose the key from the dominant query, and plan for cross-shard queries such as feeds.",
  ],
  furtherReading: [
    { title: "Sharding & IDs at Instagram (Instagram Engineering, 2012)", note: "How Instagram split PostgreSQL into logical shards and designed shard-aware, time-sortable IDs." },
    { title: "How Discord Stores Billions of Messages (Discord blog, 2017)", note: "Choosing a partition key from the dominant query, with Cassandra." },
    { title: "PostgreSQL documentation: Indexes", url: "https://www.postgresql.org/docs/current/indexes.html", note: "Multicolumn indexes, index-only scans and how ORDER BY uses indexes." },
  ],
};
