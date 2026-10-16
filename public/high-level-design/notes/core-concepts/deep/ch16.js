// Deep dive: Chapter 16, Consistent hashing. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch16 = {
  hook: `<p>This chapter explains why <code>hash(key) % N</code> breaks when servers are added or lost, and how consistent hashing limits each change to about one server's share of keys. It underlies most distributed caches, key-value stores and sharded storage layers.</p>`,
  sections: [
    {
      id: "why-modulo-breaks",
      title: "Why hash mod N falls apart",
      kicker: "The problem",
      blocks: [
        {
          type: "text",
          html: `<p>Modulo placement is even, but every key's home depends on the server count. A key stays put only if <code>h % N</code> equals <code>h % (N+1)</code>, true for about <strong>1 in N+1</strong> keys. Going from 4 to 5 servers moves about 80% of keys; 99 to 100 moves about 99%. For a cache every moved key is a miss that hits the database; for storage it is data to copy.</p>`,
        },
        {
          type: "lab",
          id: "modVsRing",
          caption: "Change the cluster by one node and compare how many of the 10,000 keys move under modulo hashing, a plain ring and a ring with virtual nodes.",
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>The goal: changing one server should move only the keys that server owned or will own, about 1/N of the data.</p>`,
        },
      ],
    },
    {
      id: "the-ring",
      title: "The ring",
      kicker: "The key idea",
      blocks: [
        {
          type: "idea",
          html: `<p>Hash <strong>servers and keys onto the same circle</strong> (say 0 to 2<sup>32</sup>&minus;1, wrapped). A key belongs to the first server clockwise from it. The server count isn't in the rule, so a change only affects the arc next to it.</p>`,
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
          title: "Adding a server",
          items: [
            "New server E hashes to a point between C and D.",
            "Keys between C and E used to walk on to D; now they reach E first and move.",
            "Every other key meets the same server as before.",
            "E takes about 1/(N+1) of the keys, all from one neighbour. Removal is the mirror image: its keys walk on to the next server.",
          ],
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
      title: "Virtual nodes and replication",
      kicker: "Making it balanced",
      blocks: [
        {
          type: "text",
          html: `<p>With one position per server, arcs are uneven (one server can own twice another's share) and a failed server dumps its whole load on one neighbour. <strong>Virtual nodes</strong> give each server many positions (<code>"A#0"</code> ... <code>"A#99"</code>), so it owns many small arcs scattered around the ring.</p>`,
        },
        {
          type: "lab",
          id: "hashRing",
          caption: "Raise the number of virtual nodes and watch the coloured arcs interleave and the per-node load even out. Remove a node to see where its keys go.",
        },
        {
          type: "tradeoffs",
          pros: [
            "Much more even load per server (law of large numbers)",
            "A failed server's load spreads over all survivors; a new one takes small slices from everyone",
            "Weighting is easy: more vnodes for bigger machines",
          ],
          cons: [
            "A bigger routing table (servers &times; vnodes), binary-searched per lookup",
            "Rebalancing streams small pieces from many servers",
            "Replica placement must skip positions owned by a physical server already chosen",
          ],
        },
        {
          type: "keypoints",
          items: [
            "<strong>Replication:</strong> store each key on its owner and the next R&minus;1 <em>distinct physical</em> servers clockwise; when the owner fails, the next already has a copy.",
            "Amazon's Dynamo (2007) used a ring with virtual nodes and this replication. Cassandra 4.0 lowered default <code>num_tokens</code> from 256 to 16 with a balancing allocation algorithm. Memcached clients use ketama, since servers don't talk to each other.",
          ],
        },
      ],
    },
    {
      id: "limits-and-alternatives",
      title: "Hot keys, and fixed hash slots",
      kicker: "Limits and alternatives",
      blocks: [
        {
          type: "text",
          html: `<p>Consistent hashing balances <strong>keys, not requests</strong>. A viral video's million reads a second all hit the one server that owns it, and more servers don't help. Replicate the key to several servers, add an in-process cache, or split it (<code>video:42#0</code> to <code>#7</code>) and read a random suffix.</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "Hash ring with vnodes", tone: "info", html: "Placement emerges from hash positions; any node computes ownership from the member list. Common in leaderless, peer-to-peer stores (Dynamo, Cassandra)." },
            { title: "Fixed hash slots", tone: "ok", html: "Hash keys into a fixed number of slots and keep an explicit slot-to-server table; a key's slot never changes, and moving a slot is deliberate. Redis Cluster (16,384), Couchbase (1,024 vBuckets), Elasticsearch (shards fixed at index creation)." },
          ],
        },
        {
          type: "keypoints",
          items: [
            "Redis Cluster maps keys to <code>CRC16(key) mod 16384</code>. A <code>{...}</code> hash tag hashes only the braced part, so <code>{user:42}:cart</code> and <code>{user:42}:profile</code> share a slot for multi-key commands.",
            "Choose the slot count once, generously: it caps how many servers you can spread over. Hundreds to tens of thousands is typical.",
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
          html: `<p>Bring it up for any sharded cache or storage layer that grows. A strong answer covers, in about a minute:</p>
<ol>
<li>Why not <code>mod N</code>: one membership change remaps almost every key.</li>
<li>The ring: servers and keys share one hash space; keys go to the next server clockwise, so a change moves about 1/N of keys.</li>
<li>Virtual nodes for even load and to spread a failed node's keys across everyone.</li>
<li>The limit: it balances keys, not traffic, so hot keys need replication or splitting.</li>
<li>Replication to the next distinct nodes, and fixed hash slots as a simpler alternative.</li>
</ol>`,
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>"We'll use consistent hashing so no server gets overloaded." It spreads <em>data</em>, not a skewed <em>access pattern</em>; name your hot-key mitigation too.</p>`,
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
    "<code>hash(key) % N</code> remaps about N/(N+1) of all keys whenever N changes: a cache wipe or a full data reshuffle.",
    "Consistent hashing puts servers and keys on one ring; each key goes to the next server clockwise, so a membership change moves about 1/N of keys.",
    "Virtual nodes even out load, spread a failed server's keys over all survivors and allow weighting; replicate to the next R&minus;1 distinct servers.",
    "It balances keys, not requests: hot keys still need replication, local caching or key splitting.",
    "Fixed hash slots with an explicit slot-to-server table (Redis Cluster's 16,384) are a simpler, widely used alternative.",
  ],
  furtherReading: [
    { title: "Dynamo: Amazon's Highly Available Key-value Store (2007)", url: "https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf", note: "Section 4.2 covers the ring, virtual nodes and replication." },
    { title: "Redis Cluster specification", url: "https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/", note: "Hash slots, hash tags and how slots migrate between nodes." },
    { title: "Consistent Hashing and Random Trees (Karger et al., 1997)", note: "The original paper, written to spread web caching load; the idea behind Akamai." },
  ],
};
