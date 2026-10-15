// Deep dive: Chapter 16, Consistent hashing. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch16 = {
  hook: `<p>Your cache tier has four servers and a simple rule: a key lives on server <code>hash(key) % 4</code>. Traffic grows, so on a busy Monday you add a fifth. The rule becomes <code>hash(key) % 5</code>, and in that instant roughly <strong>four out of every five keys</strong> now map to a different server. Almost every lookup misses, every miss falls through to the database, and the database that the cache was protecting falls over.</p>
<p>Nothing was broken. The cache did exactly what it was told. The problem is the rule: it ties every key's home to the total number of servers, so changing the count reshuffles nearly everything. Consistent hashing is the fix, and the reason it shows up in almost every distributed cache, key-value store and load balancer you will be asked to design.</p>`,
  sections: [
    {
      id: "why-modulo-breaks",
      title: "Why hash mod N falls apart when the cluster changes",
      kicker: "The problem",
      blocks: [
        {
          type: "problem",
          html: `<p>Hashing a key and taking it modulo the number of servers spreads keys evenly, which is why it is the first thing everyone reaches for. But servers are not fixed: they crash, get replaced, and get added when load grows. Each change alters <code>N</code>, and with it the answer for almost every key.</p>`,
        },
        {
          type: "text",
          html: `<p>A key stays put only if <code>h % N</code> happens to equal <code>h % (N+1)</code>. For random hashes that is true for only about <strong>1 in N+1</strong> keys. Going from 4 to 5 servers moves about 80% of the keys; going from 99 to 100 moves about 99%. The bigger your cluster, the worse a single change gets.</p>
<p>For a cache, every moved key is a miss. For a database or a storage system, every moved key is data that must be copied across the network before the new layout is usable. Either way, the cost of a routine operation (add one machine) scales with the <em>whole dataset</em> instead of with the one machine you touched.</p>`,
        },
        {
          type: "lab",
          id: "modVsRing",
          caption: "Change the cluster by one node and compare how many of the 10,000 keys move under modulo hashing, a plain ring and a ring with virtual nodes.",
        },
        {
          type: "keypoints",
          items: [
            "Modulo placement is even, but it makes each key's home depend on the total server count.",
            "Changing N by one moves about N/(N+1) of all keys: nearly everything.",
            "What we want instead: a change to one server should only move the keys that server owned or will own, about 1/N of the data.",
          ],
        },
      ],
    },
    {
      id: "the-ring",
      title: "The ring: placing servers and keys in the same space",
      kicker: "The key idea",
      blocks: [
        {
          type: "idea",
          html: `<p>Hash <strong>servers and keys onto the same circle</strong> of hash values. A key belongs to the first server you meet walking clockwise from the key's position. Adding or removing a server only changes ownership of the arc next to it.</p>`,
        },
        {
          type: "text",
          html: `<p>Take the output range of a hash function, say 0 to 2<sup>32</sup>&minus;1, and bend it into a circle so the largest value wraps back to 0. Hash each server's name (or IP) to get its position on the circle. Hash each key the same way. To find a key's server, start at the key's position and walk clockwise until you hit a server.</p>
<p>Notice what is <em>not</em> in that rule: the number of servers. A key's owner depends only on where the nearest server sits, so the rest of the ring does not care how many servers exist.</p>`,
        },
        {
          type: "diagram",
          title: "Keys belong to the next server clockwise",
          caption: "Four servers (A to D) and six keys on the ring. Each key is owned by the first server clockwise from it, so the arc just before a server is that server's range.",
          svg: `<svg viewBox="0 0 520 300" role="img" aria-label="A hash ring with four servers and six keys">
<circle cx="160" cy="150" r="110" fill="none" stroke-width="3" style="stroke: var(--dg-line)"/>
<path d="M160 40 A110 110 0 0 1 270 150" fill="none" stroke-width="8" style="stroke: var(--dg-1)" opacity="0.55"/>
<path d="M270 150 A110 110 0 0 1 160 260" fill="none" stroke-width="8" style="stroke: var(--dg-2)" opacity="0.55"/>
<path d="M160 260 A110 110 0 0 1 50 150" fill="none" stroke-width="8" style="stroke: var(--dg-3)" opacity="0.55"/>
<path d="M50 150 A110 110 0 0 1 160 40" fill="none" stroke-width="8" style="stroke: var(--dg-4)" opacity="0.55"/>
<circle cx="270" cy="150" r="14" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="270" y="155" text-anchor="middle" font-size="13" font-weight="700">A</text>
<circle cx="160" cy="260" r="14" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="160" y="265" text-anchor="middle" font-size="13" font-weight="700">B</text>
<circle cx="50" cy="150" r="14" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="50" y="155" text-anchor="middle" font-size="13" font-weight="700">C</text>
<circle cx="160" cy="40" r="14" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="2"/>
<text x="160" y="45" text-anchor="middle" font-size="13" font-weight="700">D</text>
<circle cx="238" cy="72" r="5" style="fill: var(--dg-1)"/>
<circle cx="261" cy="108" r="5" style="fill: var(--dg-1)"/>
<circle cx="238" cy="228" r="5" style="fill: var(--dg-2)"/>
<circle cx="82" cy="228" r="5" style="fill: var(--dg-3)"/>
<circle cx="59" cy="108" r="5" style="fill: var(--dg-4)"/>
<circle cx="110" cy="52" r="5" style="fill: var(--dg-4)"/>
<text x="340" y="70" font-size="13" font-weight="700">How to read it</text>
<text x="340" y="96" font-size="12" style="fill: var(--dg-muted)">Big circles: servers,</text>
<text x="340" y="114" font-size="12" style="fill: var(--dg-muted)">placed at hash(name).</text>
<text x="340" y="140" font-size="12" style="fill: var(--dg-muted)">Dots: keys, at hash(key).</text>
<text x="340" y="166" font-size="12" style="fill: var(--dg-muted)">Each coloured arc is the</text>
<text x="340" y="184" font-size="12" style="fill: var(--dg-muted)">range a server owns: the</text>
<text x="340" y="202" font-size="12" style="fill: var(--dg-muted)">keys just before it.</text>
</svg>`,
        },
        {
          type: "steps",
          title: "Adding a server, step by step",
          items: [
            "The new server E hashes to a point between C and D.",
            "Keys between C and E used to walk on to D. Now they reach E first, so they move to E.",
            "Every other key still meets the same server it met before. Nothing else moves.",
            "On average E takes over about 1/(N+1) of the keys, all of them from a single neighbour.",
          ],
        },
        {
          type: "text",
          html: `<p>Removing a server is the mirror image: its keys walk on to the next server clockwise, and no other key changes owner. That is the whole trick, and it is why the change in cost goes from "the whole dataset" to "one server's share".</p>`,
        },
        {
          type: "quiz",
          q: "A ring has 10 servers and 1 million keys spread evenly. One server fails. Roughly how many keys change owner?",
          options: ["About 1 million", "About 900,000", "About 100,000", "Exactly 0"],
          answer: 2,
          explain: "Only the failed server's keys move (to its clockwise neighbour). With 10 servers that is about a tenth of the keys. Under hash mod N, going from 10 to 9 servers would move about 90% of them.",
        },
      ],
    },
    {
      id: "virtual-nodes",
      title: "Virtual nodes: fixing the uneven arcs",
      kicker: "Making it balanced",
      blocks: [
        {
          type: "problem",
          html: `<p>With one position per server, the arcs are whatever the hash function happens to produce. With four servers, one can easily own twice the ring of another. And when a server dies, its <em>entire</em> load lands on one neighbour, which may then be overloaded too.</p>`,
        },
        {
          type: "text",
          html: `<p>The fix is to give every physical server many positions on the ring, called <strong>virtual nodes</strong> (vnodes) or tokens. Hash <code>"A#0"</code>, <code>"A#1"</code>, ... <code>"A#99"</code> and place all of them. Each physical server now owns many small arcs scattered around the circle instead of one big one.</p>
<p>Two good things happen. First, the law of large numbers evens out the load: the more arcs each server owns, the closer its total share gets to the average. Second, when a server leaves, its many small arcs are inherited by many different neighbours, so the extra load is spread across the whole cluster instead of dumped on one machine. Joining works the same way in reverse: a new server takes small slices from everyone.</p>
<p>Vnodes also let you handle mixed hardware. Give a machine with twice the memory twice as many virtual nodes and it will own about twice the keys.</p>`,
        },
        {
          type: "lab",
          id: "hashRing",
          caption: "Raise the number of virtual nodes and watch the coloured arcs interleave and the per-node load even out. Remove a node to see where its keys go.",
        },
        {
          type: "tradeoffs",
          pros: [
            "Much more even load per server",
            "A failed server's load spreads over all survivors",
            "Weighting is easy: more vnodes for bigger machines",
          ],
          cons: [
            "The routing table is bigger (servers &times; vnodes entries) and lookups binary-search it",
            "Rebalancing streams small pieces from many servers, so there are more transfers to coordinate",
            "Placing replicas gets fiddlier: the next few positions may belong to the same physical server and must be skipped",
          ],
        },
        {
          type: "realworld",
          items: [
            { org: "Amazon Dynamo", title: "The 2007 paper", html: "Dynamo placed nodes on a ring with multiple virtual nodes each, and replicated every key to the next distinct nodes clockwise. It became the template for later leaderless stores." },
            { org: "Apache Cassandra", title: "Tokens per node", html: "Each node owns <code>num_tokens</code> positions on the ring. Cassandra 4.0 lowered the default from 256 to 16 and added a token-allocation algorithm that keeps the load balanced with fewer tokens." },
            { org: "Memcached clients", title: "Ketama", html: "Memcached servers don't talk to each other, so the client library picks the server. The ketama algorithm (from Last.fm) made consistent hashing the standard way to do that, so adding a cache box doesn't wipe the whole cache." },
          ],
        },
      ],
    },
    {
      id: "hot-keys",
      title: "What consistent hashing does not fix: hot keys",
      kicker: "Limits",
      blocks: [
        {
          type: "text",
          html: `<p>Consistent hashing balances <strong>keys</strong>, not <strong>requests</strong>. If one celebrity's profile or one viral video gets a million reads a second, every one of those reads goes to the single server that owns that key, no matter how evenly the other keys are spread. Adding servers does not help, because the hot key still has exactly one home.</p>
<p>Hot keys need a different tool: replicate the key to several servers and read from any of them, add a small in-process cache in front of the shared cache, or split the key (for example <code>video:42#0</code> to <code>video:42#7</code>) and have readers pick a suffix at random.</p>`,
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>"We'll use consistent hashing so no server gets overloaded." It spreads <em>data</em> evenly; it does nothing about a skewed <em>access pattern</em>. Say that distinction out loud in an interview and then name the hot-key mitigation you would use.</p>`,
        },
        {
          type: "text",
          html: `<h3>Replication on the ring</h3>
<p>To keep data when a server dies, store each key on its owner <em>and</em> on the next <code>R&minus;1</code> distinct physical servers clockwise. When the owner fails, the next server already has a copy and simply takes over its range. With virtual nodes you skip positions that belong to a physical server you have already picked, otherwise two "replicas" could end up on the same machine.</p>`,
        },
      ],
    },
    {
      id: "fixed-slots",
      title: "The alternative: a fixed number of hash slots",
      kicker: "Design choice",
      blocks: [
        {
          type: "text",
          html: `<p>Many systems skip the ring and use a simpler indirection. Hash every key into a <strong>fixed number of slots</strong> (far more than you will ever have servers), then keep a small table that maps each slot to a server. The slot of a key never changes; only the slot-to-server table does.</p>
<p>Adding a server means moving some whole slots to it and updating the table. Because the number of slots is fixed, the key-to-slot mapping is stable forever, and you get to choose exactly which slots move, which makes rebalancing explicit and easy to reason about.</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "Hash ring with vnodes", tone: "info", html: "Placement emerges from hash positions. Any node can compute ownership from the member list. Common in leaderless, peer-to-peer stores (Dynamo, Cassandra)." },
            { title: "Fixed hash slots", tone: "ok", html: "Placement is an explicit table, often managed by a coordinator or gossiped by the nodes. Moving a slot is a deliberate operation. Used by Redis Cluster (16,384 slots), Couchbase (1,024 vBuckets) and Elasticsearch (shards fixed at index creation)." },
          ],
        },
        {
          type: "realworld",
          items: [
            { org: "Redis Cluster", title: "16,384 slots and hash tags", html: "Every key maps to slot <code>CRC16(key) mod 16384</code>. If a key contains <code>{...}</code>, only the part inside the braces is hashed, so <code>{user:42}:cart</code> and <code>{user:42}:profile</code> land in the same slot and can be used together in one multi-key command." },
          ],
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>Pick the slot count once, generously: it caps how many servers you can ever spread over, because a slot cannot be split later without re-hashing. Hundreds to tens of thousands of slots is typical.</p>`,
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
          html: `<p>Consistent hashing belongs in any design with a sharded cache or storage layer that grows over time: a distributed cache, a key-value store, a URL shortener's storage, chat servers that own user connections. Bring it up when you discuss how keys are assigned to machines and what happens when a machine is added or lost.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>A strong answer covers four points in about a minute:</p>
<ol>
<li>Why not <code>mod N</code>: one membership change remaps almost every key.</li>
<li>The ring: servers and keys share one hash space; keys go to the next server clockwise, so a change moves about 1/N of the keys.</li>
<li>Virtual nodes for even load and for spreading a failed node's keys across everyone.</li>
<li>The limit: it balances keys, not traffic, so hot keys need replication or key splitting.</li>
</ol>
<p>If you have time, mention replication to the next distinct nodes clockwise, and that fixed hash slots (Redis Cluster) are a common, simpler alternative.</p>`,
        },
        {
          type: "quiz",
          q: "Your interviewer says one cache server in a consistent-hashing cluster is at 95% CPU while the rest idle at 20%. What is the most likely cause, and fix?",
          options: [
            "Too few virtual nodes; add more vnodes",
            "A hot key; replicate it or split it across several keys",
            "The hash function is broken; switch to MD5",
            "Too many servers; remove some",
          ],
          answer: 1,
          explain: "Too few vnodes skews how much of the keyspace each server owns, but a 95% vs 20% CPU split with the rest of the cluster idle points to a skewed access pattern: one or a few very hot keys owned by that server. More vnodes or a different hash would not move that key's traffic anywhere else.",
        },
      ],
    },
  ],
  takeaways: [
    "<code>hash(key) % N</code> remaps about N/(N+1) of all keys whenever N changes, which is a cache wipe or a full data reshuffle.",
    "Consistent hashing puts servers and keys on one ring; each key goes to the next server clockwise, so a membership change moves only about 1/N of the keys.",
    "Virtual nodes give each server many small arcs: the load evens out, a failed server's keys spread over all survivors, and bigger machines can take more vnodes.",
    "It balances keys, not requests. Hot keys still need replication, local caching or key splitting.",
    "Replicate each key to the next R&minus;1 distinct physical servers clockwise.",
    "Fixed hash slots with an explicit slot-to-server table (Redis Cluster's 16,384) are a simpler, widely used alternative.",
  ],
  furtherReading: [
    { title: "Dynamo: Amazon's Highly Available Key-value Store (2007)", url: "https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf", note: "Section 4.2 covers the ring, virtual nodes and replication." },
    { title: "Redis Cluster specification", url: "https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/", note: "Hash slots, hash tags and how slots migrate between nodes." },
    { title: "Consistent Hashing and Random Trees (Karger et al., 1997)", note: "The original paper, written to spread web caching load; the idea behind Akamai." },
  ],
};
