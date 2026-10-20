// Main tab: Chapter 9, Data modeling: database choice and schema design. Format: DeepSection[] in public/shared/notes.d.ts.
window.MAIN = window.MAIN || {};
MAIN.ch9 = [
  {
    id: "where-it-fits",
    title: "Where data modeling fits in an interview",
    kicker: "Mental model",
    blocks: [
      {
        type: "text",
        html: `<p>Data modeling decides which entities exist, how each is identified and how they relate. In an interview it happens twice. First, during requirements, you list the <strong>core entities</strong> in a sentence or two. Later, in the high-level design, you sketch a schema next to the database box: the main tables, their keys, the relationships, the indexes that serve your endpoints and, if the data is large, the shard key. The bar is "clear and good enough to support the design", not a complete production schema.</p><p>Three forces drive every modeling choice, and naming them is how you justify decisions:</p>`,
      },
      {
        type: "keypoints",
        items: [
          "<strong>Access patterns</strong>, the most important: which queries run, how often, and how fast they must be.",
          "<strong>Data volume</strong>: whether the data fits on one machine, and how fast it grows.",
          "<strong>Consistency needs</strong>: which facts must change together atomically (a seat and its booking) and which can lag (a like count).",
        ],
      },
    ],
  },
  {
    id: "choosing-a-database",
    title: "Choosing a database",
    kicker: "Decision rule",
    blocks: [
      {
        type: "text",
        html: `<p>Default to a <strong>relational database</strong> such as PostgreSQL or MySQL. Most interview domains are entities with clear relationships, SQL handles queries you didn't anticipate, and ACID transactions are what prevent double charges and overselling. Relational systems also scale much further than candidates tend to assume, through read replicas, caching and sharding. Switch only when a requirement gives you a concrete reason.</p>`,
      },
      {
        type: "table",
        headers: ["Requirement you hear", "Reasonable choice", "Why"],
        rows: [
          ["Users, orders, bookings, payments", "Relational", "Relationships, transactions, flexible queries"],
          ["Records with very different, changing shapes, always read whole", "Document store", "Embedding avoids joins; flexible schema"],
          ["Lookups by one key, sessions, counters, cache", "Key-value store", "Extremely fast, usually alongside SQL"],
          ["Huge append-only streams read by key and time range", "Wide-column store", "Built for write volume; one table per query"],
          ["Social graph traversal", "Still usually relational", "Graph databases add operations cost for little gain at interview scope"],
        ],
      },
    ],
  },
  {
    id: "worked-example",
    title: "A worked example: a Q&amp;A forum",
    kicker: "From endpoints to schema",
    blocks: [
      {
        type: "text",
        html: `<p>Requirements: users post questions and answers, vote on answers, and view a question with its answers sorted by score. Users also view their own activity. Start from the endpoints and let each one tell you what the schema needs.</p>`,
      },
      {
        type: "table",
        headers: ["Table", "Key and relationships", "Index", "Serves"],
        rows: [
          ["users", "id primary key; email unique", "Unique index on email", "Login, profile"],
          ["questions", "id primary key; author_id references users", "(author_id, created_at)", "A user's questions, newest first"],
          ["answers", "id primary key; question_id and author_id foreign keys; score column", "(question_id, score)", "A question's answers sorted by score"],
          ["votes", "Primary key (user_id, answer_id); value of +1 or -1", "The primary key itself", `One vote per user per answer; "did I vote?"`],
        ],
      },
      {
        type: "steps",
        title: "The reasoning behind it",
        items: [
          "<strong>Surrogate keys, not business data.</strong> Users are keyed by a generated ID; email is unique but can change, so it isn't the key.",
          "<strong>Many-to-many becomes a join table.</strong> Votes link users to answers, and the composite primary key enforces one vote each.",
          `<strong>Indexes come from endpoints.</strong> "Answers for a question by score" needs an index starting with question_id.`,
          "<strong>One deliberate denormalization.</strong> Summing votes on every page view is wasteful, so answers carry a score column updated when votes change. It may lag slightly, which is fine for a ranking.",
          "<strong>Shard key if it outgrows one machine:</strong> question_id for questions, answers and votes, so a question page reads from a single shard.",
        ],
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
        html: `<p><strong>Normalization</strong> stores each fact in exactly one place: a username lives only in the users table and everything else refers to it by ID. That prevents the classic bug where one copy is updated and another isn't. <strong>Denormalization</strong> copies data to where it is read (an author name on each answer, a counter on a parent row, a precomputed feed) so hot reads avoid joins or aggregation.</p>`,
      },
      {
        type: "tradeoffs",
        prosLabel: "Denormalizing buys",
        consLabel: "Denormalizing costs",
        pros: [
          "Faster hot reads with no joins or counting",
          "Simpler queries on the read path",
          "Data shaped for one screen or one shard",
        ],
        cons: [
          "Every write must update every copy",
          "A missed update leaves silently stale data",
          "More storage and more complicated writes",
        ],
      },
      {
        type: "callout",
        tone: "tip",
        html: `<p>Often the best compromise is to keep the database normalized as the source of truth and put the denormalized view in a cache or a separate read model that is rebuilt from changes.</p>`,
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
        html: `<p>Name the database and why in one sentence, sketch three to five tables with their keys, and connect at least one index and one denormalization to a specific endpoint. If the data is large, propose a shard key taken from the dominant access pattern and point out which query would have to cross shards. Tie each choice to access patterns, volume or consistency.</p>`,
      },
      {
        type: "callout",
        tone: "mistake",
        title: "Common mistakes",
        html: `<ul><li>Picking a NoSQL database "for scale" without a requirement that needs it.</li><li>Using emails or usernames as primary keys.</li><li>Denormalizing everything up front, then having no plan for keeping copies in sync.</li><li>Sharding by time for write-heavy data, which sends every new write to the newest shard.</li><li>Listing tables with no indexes, so the design can't answer its own endpoints quickly.</li></ul>`,
      },
    ],
  },
];
