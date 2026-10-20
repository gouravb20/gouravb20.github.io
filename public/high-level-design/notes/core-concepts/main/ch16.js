// Main tab: Chapter 16, Consistent hashing. Format: DeepSection[] in public/shared/notes.d.ts.
window.MAIN = window.MAIN || {};
MAIN.ch16 = [
  {
    id: "the-problem",
    title: "The problem: hash mod N reshuffles everything",
    kicker: "Why it exists",
    blocks: [
      {
        type: "text",
        html: `<p>The obvious way to spread keys over N servers is <code>server = hash(key) mod N</code>. It balances well as long as N never changes. The moment you add or lose a server, N changes and almost every key computes to a different server. Going from 4 to 5 servers moves about 80% of keys; in general, adding one server to N moves about N/(N+1) of them.</p><p>For a cache, that means a near-total miss storm: almost every lookup suddenly goes to a server that does not have the value, and the database behind it takes the full load. For a database, it means copying most of the data across the network while trying to serve traffic. Consistent hashing exists to make membership changes cheap.</p>`,
      },
    ],
  },
  {
    id: "the-ring",
    title: "The ring and virtual nodes",
    kicker: "The key idea",
    blocks: [
      {
        type: "text",
        html: `<p>Picture the whole range of hash values bent into a circle. Hash each server's ID to place it at a point on the circle. To find a key's owner, hash the key and walk clockwise until you reach the first server. Each server therefore owns the arc between its predecessor and itself.</p><p>Now a membership change is local. A new server lands at one point and takes over part of one neighbour's arc; no other key moves. A removed server's arc passes to the next server clockwise; again, nothing else moves. On average only about 1/N of the keys change owner.</p><p>With one point per server, though, the arcs come out uneven by chance, so some servers own far more than their share. Worse, when a server fails, its entire arc lands on a single neighbour, doubling that neighbour's load. <strong>Virtual nodes</strong> fix both: give each physical server many points on the ring (say 100 to 200). The arcs average out so each server's share is close to 1/N, a failed server's keys are spread over all survivors, and a new server takes a small slice from everyone. A more powerful machine can simply be given more points.</p>`,
      },
      {
        type: "table",
        headers: ["", "hash mod N", "Ring, one point per server", "Ring with virtual nodes"],
        rows: [
          ["Keys moved when one server joins", "Most of them", "About 1/N, all from one neighbour", "About 1/N, a little from each server"],
          ["When a server fails", "Almost everything remaps", "One neighbour takes its whole share", "Its share spreads across all survivors"],
          ["Balance", "Even", "Uneven by chance", "Close to even"],
        ],
      },
    ],
  },
  {
    id: "limits-and-alternatives",
    title: "What it does not solve, and the main alternative",
    kicker: "Limits",
    blocks: [
      {
        type: "callout",
        tone: "warning",
        title: "It balances keys, not traffic",
        html: `<p>Consistent hashing gives each server a fair share of <em>keys</em>. It does nothing about one key that gets a huge share of <em>requests</em>. A viral post still lives on one server. Hot keys need their own fixes: replicate that key to several servers, split it into suffixed sub-keys, or cache it locally on the app servers.</p>`,
      },
      {
        type: "text",
        html: `<p><strong>Replication on the ring</strong> is how Dynamo-style stores such as Cassandra survive failures: each key is stored on its owner and the next few distinct servers clockwise. When one server dies, its replicas already hold the data, so nothing has to be copied urgently.</p><p>The main alternative is <strong>fixed hash slots</strong>. Choose a large slot count up front (Redis Cluster uses 16,384), compute <code>slot = hash(key) mod slots</code>, and keep a small table saying which server owns each slot. Because the slot count never changes, a key never changes slot; adding a server just reassigns some slots to it. You get the same "only about 1/N moves" property as a ring, with ownership written down explicitly, which makes rebalancing easy to inspect, pause and throttle. The price is picking a slot count you can live with forever.</p>`,
      },
      {
        type: "compare",
        items: [
          { title: "Hash ring with virtual nodes", tone: "info", html: "Ownership falls out of hash positions, so any node can compute it from the member list. Common in leaderless stores like Cassandra." },
          { title: "Fixed hash slots", tone: "ok", html: "Ownership is an explicit slot-to-server table, rebalanced one slot at a time. Used by Redis Cluster, Couchbase and Elasticsearch." },
        ],
      },
    ],
  },
  {
    id: "interview-angle",
    title: "Using it in an interview",
    kicker: "When to go deep",
    blocks: [
      {
        type: "text",
        html: `<p>First recognise which kind of interview you are in. In a <strong>product design</strong> (a chat app, a feed) one sentence is enough: "the database, say Cassandra or DynamoDB, partitions data with consistent hashing, so adding nodes moves only a fraction of the data." In an <strong>infrastructure design</strong> (a distributed cache, a key-value store, a message broker) partitioning is the heart of the problem, and you should walk through it properly.</p>`,
      },
      {
        type: "steps",
        title: "Walking through a distributed cache",
        items: [
          "Explain why <code>hash mod N</code> fails: adding one cache node would turn nearly every request into a miss.",
          "Place nodes on a hash ring with around a hundred virtual nodes each; a key belongs to the next point clockwise, found with a binary search over sorted positions.",
          "Adding a node moves about 1/N of keys, spread across all existing nodes, so the extra misses are small and brief.",
          "For availability, replicate each key to the next distinct node, or accept misses on failure since the cache can refill from the database.",
          "Handle hot keys separately with replication or local caching, and get cluster membership from a coordination service or gossip.",
          "Mention fixed hash slots as the alternative, and why you might prefer its explicit ownership table.",
        ],
      },
      {
        type: "list",
        title: "Common mistakes",
        items: [
          "Claiming consistent hashing removes hot spots. It removes structural imbalance, not traffic skew.",
          "Forgetting virtual nodes, which leaves the cluster unbalanced and makes a single failure double one neighbour's load.",
          "Spending ten minutes on ring mechanics in a product interview where one sentence would do.",
        ],
      },
    ],
  },
];
