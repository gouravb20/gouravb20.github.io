// Main tab: Chapter 10, How indexes work. Format: DeepSection[] in public/shared/notes.d.ts.
window.MAIN = window.MAIN || {};
MAIN.ch10 = [
  {
    id: "mental-model",
    title: "An index is a second, sorted copy that points home",
    kicker: "Mental model",
    blocks: [
      {
        type: "text",
        html: `<p>A database table is a pile of fixed-size pages on disk, and rows land in whatever page has room. Ask for <code>WHERE email = 'a@b.com'</code> with nothing else to go on and the engine has to open every page and look. The work grows with the size of the table, not with the size of the answer: one matching row in a 50-million-row table still costs a full scan.</p><p>An <strong>index</strong> fixes that by keeping a separate structure, organised by the indexed column, that says where each value lives. Think of the index at the back of a textbook: you look up a word, get a page number, and go straight there. The lookup now touches a handful of pages instead of hundreds of thousands, which is the difference between milliseconds and seconds.</p>`,
      },
      {
        type: "keypoints",
        title: "The bargain you are striking",
        items: [
          "<strong>Reads get faster</strong> for queries that filter, join or sort on the indexed columns.",
          "<strong>Writes get slower</strong>: every insert, update and delete must also update every index on the table.",
          "<strong>Storage grows</strong>: each index holds a copy of its columns plus a pointer per row.",
          "<strong>Only selective indexes help</strong>: on a column with two values, the planner usually ignores the index and scans anyway.",
        ],
      },
    ],
  },
  {
    id: "three-structures",
    title: "The three structures and what each is for",
    kicker: "B-tree, LSM tree, hash",
    blocks: [
      {
        type: "text",
        html: `<p><strong>B-trees</strong> are the default in almost every relational database and in MongoDB. Keys are kept in sorted order inside a balanced tree whose nodes are each one disk page. Because a page holds hundreds of keys, each node has hundreds of children, so even a billion rows sit only three or four levels below the root. The upper levels are small enough to stay in memory, which means a point lookup usually costs one or two real disk reads. Sorted order is the superpower: the same tree answers equality, ranges, prefix matches and <code>ORDER BY</code>.</p><p><strong>LSM trees</strong> (log-structured merge trees) are built for write-heavy workloads. New writes go to an append-only log for durability and to a sorted in-memory table. When that table fills, it is written out in one sequential pass as an immutable sorted file. Background compaction later merges files and throws away overwritten and deleted values. Writes are cheap because nothing is updated in place. Reads pay for it: a lookup may check the memory table and several files, so engines add Bloom filters to skip files that cannot contain the key. Cassandra, RocksDB and HBase work this way.</p><p><strong>Hash indexes</strong> map a key straight to its location. Exact-match lookups are a single step, but there is no ordering at all, so ranges and sorting are impossible. You see them in in-memory stores like Redis more than as an explicit database choice.</p>`,
      },
      {
        type: "table",
        title: "Pick by workload",
        headers: ["Structure", "Strong at", "Weak at", "Reach for it when"],
        rows: [
          ["B-tree", "Point lookups, ranges, sorting, prefixes", "Very high sustained write rates", "You have a normal OLTP workload, which is most of the time"],
          ["LSM tree", "Sequential, batched writes at very high rates", "Reads touch several files; compaction uses I/O", "You ingest metrics, logs, events or time series"],
          ["Hash", "Exact-match lookups in one step", "Anything ordered: ranges, sorting, prefixes", "Keys are only ever fetched by exact value, usually in memory"],
        ],
      },
      {
        type: "callout",
        tone: "insight",
        title: "Read cost versus write cost",
        html: `<p>The cleanest way to compare B-trees and LSM trees is amplification. A B-tree reads one root-to-leaf path per lookup but rewrites a whole page for a tiny change. An LSM tree writes sequentially and cheaply up front but may read several files per lookup and rewrites data again during compaction. B-trees lean toward reads; LSM trees lean toward writes.</p>`,
      },
    ],
  },
  {
    id: "worked-example",
    title: "Worked example: how deep is the tree?",
    kicker: "Back of the envelope",
    blocks: [
      {
        type: "text",
        html: `<p>Interviewers like it when you can show why an index is fast instead of just asserting it. The arithmetic is short enough to do out loud.</p>`,
      },
      {
        type: "steps",
        items: [
          "Assume 8 KB pages and roughly 20 to 30 bytes per key-plus-pointer entry. That gives a fan-out of about 300 to 400 children per node; call it 300 to be safe.",
          "One level covers 300 keys. Two levels cover 300 x 300 = 90,000. Three cover 27 million. Four cover about 8 billion.",
          "So a table of one billion rows needs a tree four levels deep.",
          "The root and the second level together are only a few hundred pages, so they stay cached in memory. A lookup reads the third level, the leaf, and then the row's page: two or three disk reads.",
          "Compare that with a full scan of the same table: with around 100 rows per page, that is ten million page reads.",
        ],
      },
      {
        type: "callout",
        tone: "tip",
        html: `<p>The same reasoning explains why indexes on primary keys and unique columns are essentially free to read through, and why the real cost of an index is on the write path, not the read path.</p>`,
      },
    ],
  },
  {
    id: "interview-use",
    title: "Using indexes in a design interview",
    kicker: "What to say",
    blocks: [
      {
        type: "text",
        html: `<p>In a product design (a feed, a booking system, a URL shortener) the interviewer mostly wants to hear that you have matched indexes to access patterns. The natural moment is right after you sketch the data model and API: walk through each endpoint, say which column it filters or sorts by, and name the index that serves it. In an infrastructure design (build a key-value store, a time-series database) expect to go one level deeper and justify the storage engine itself.</p>`,
      },
      {
        type: "list",
        title: "Phrases that land well",
        items: [
          `"The feed endpoint filters by user_id and sorts by created_at, so I'd add an index on those two columns."`,
          `"Email lookups at login are exact matches on a unique column; the unique constraint already gives us a B-tree."`,
          `"This store ingests a million events a second and reads are rare, so I'd use an LSM-based store like Cassandra."`,
          `"I wouldn't index is_active: two values means the planner will scan anyway."`,
        ],
      },
      {
        type: "compare",
        title: "Common mistakes",
        items: [
          { title: "Indexing everything", tone: "bad", html: "Every extra index slows every write and costs disk. Index for queries the system actually runs." },
          { title: `Saying "add an index" with no column`, tone: "bad", html: "Name the columns and the query they serve, or the statement carries no signal." },
          { title: "Choosing a hash index for ranges", tone: "bad", html: "Hash indexes have no order. Anything with <code>&gt;</code>, <code>&lt;</code>, BETWEEN or ORDER BY needs a B-tree." },
          { title: "Defaulting to B-tree and moving on", tone: "ok", html: "This is correct for most product designs. Switch to LSM only when you can point to a write-heavy workload." },
        ],
      },
    ],
  },
];
