// Main tab: Chapter 13, Cache eviction and failure modes. Format: DeepSection[] in public/shared/notes.d.ts.
window.MAIN = window.MAIN || {};
MAIN.ch13 = [
  {
    id: "eviction",
    title: "Eviction: what to drop when the cache is full",
    kicker: "Eviction policies",
    blocks: [
      {
        type: "text",
        html: `<p>A cache is deliberately smaller than the data behind it, so sooner or later it must throw something out to make room. The eviction policy is its guess about which entry is least likely to be needed again. The good news for interviews is that one answer covers most cases: <strong>LRU</strong>, least recently used. It assumes that what was read recently will be read again soon, which is true of most user-facing traffic, and it runs in constant time with a hash map plus a linked list.</p><p><strong>LFU</strong>, least frequently used, keeps entries that are popular over a long stretch, such as the top playlists on a music service. It also shrugs off a one-time bulk read that would sweep an LRU cache clean. Its weakness is adapting slowly when popularity shifts. <strong>FIFO</strong> evicts the oldest entry regardless of how hot it is, which is rarely what you want. <strong>TTL</strong> is not a size policy at all: it caps how stale an entry can get, and you use it alongside LRU or LFU.</p>`,
      },
      {
        type: "table",
        headers: ["Policy", "Choose it when", "Watch out for"],
        rows: [
          ["LRU", "You have no strong reason to pick anything else", "A large one-off scan can flush hot entries"],
          ["LFU", "Popularity is stable over hours or days", "Slow to react when a new item suddenly trends"],
          ["FIFO", "You need the simplest possible cache", "Evicts hot entries just because they are old"],
          ["TTL (added to any policy)", "Data must refresh within a known window", "Many keys with the same TTL expire together"],
        ],
      },
    ],
  },
  {
    id: "failure-modes",
    title: "The four ways a cache hurts you",
    kicker: "Failure modes",
    blocks: [
      {
        type: "text",
        html: `<p>A cache makes the system faster on a good day and introduces new ways to fail on a bad one. Four come up again and again, and each has a standard response worth knowing by name.</p><p><strong>Stampede.</strong> A popular key expires, and every request that arrives before it is rebuilt misses at the same moment and queries the database. One query becomes thousands within a second. The main fix is <strong>request coalescing</strong>: the first request to miss takes a short lock and rebuilds the entry while the others wait for its result or briefly serve the old value. Add random jitter to TTLs so many keys do not expire together, and refresh the hottest keys before they expire.</p><p><strong>Stale data.</strong> The database has changed but the cache still holds the old value. After a write, <strong>delete the key rather than writing the new value into it</strong>: concurrent updates to the cache can land out of order and leave an older value behind, while a delete simply forces the next reader to load the current row. Keep a TTL as a backstop for the small races that remain.</p><p><strong>Hot key.</strong> One key (a celebrity's profile, a viral post) receives so much traffic that the single cache node holding it saturates, even with a perfect hit ratio. Adding nodes does not help, because one key lives on one node. Copy the value under several suffixed keys and pick one at random per read, or put a small in-process cache in front so most reads never leave the server.</p><p><strong>Cache outage.</strong> If Redis goes down, every request falls through to a database that was sized only for the miss traffic. Run the cache with replicas and automatic failover, protect the database with a circuit breaker or load shedding on the fallback path, and warm the cache gradually when it returns.</p>`,
      },
      {
        type: "table",
        title: "At a glance",
        headers: ["Failure", "What you see", "First fix to name"],
        rows: [
          ["Stampede", "Database spike the moment a hot key expires", "Request coalescing, plus jittered TTLs"],
          ["Stale data", "Users see an old value after an update", "Delete the key on write, keep a TTL"],
          ["Hot key", "One cache node pinned while others idle", "Replicate the key under suffixes, local cache"],
          ["Cache down", "Database flooded with every read", "Replicas and failover, circuit breaker on fallback"],
          ["Cold start", "Low hit ratio after a deploy or restart", "Warm popular keys, roll out gradually"],
        ],
      },
    ],
  },
  {
    id: "worked-example",
    title: "Worked example: a viral post expires",
    kicker: "Putting it together",
    blocks: [
      {
        type: "steps",
        items: [
          "A post goes viral and is read 50,000 times a second, almost entirely from cache. Its cache entry has a five-minute TTL.",
          "Without protection, when the TTL expires, every read in the next 30 ms (the time to rebuild) misses. That is about 1,500 identical database queries in a burst, repeated every five minutes.",
          "With request coalescing, one request rebuilds the entry and the other 1,499 wait a few milliseconds for it. The database sees one query.",
          "The post's single cache node is still serving 50,000 reads a second. Spreading the value over ten suffixed keys cuts that to about 5,000 per node, and a one-second in-process cache on each app server removes most of the remaining traffic.",
          "The author edits the post. The write path updates the database and deletes all ten keys; the next readers repopulate them through the same coalesced path.",
        ],
      },
    ],
  },
  {
    id: "interview-angle",
    title: "Talking about cache failures in an interview",
    kicker: "Interview angle",
    blocks: [
      {
        type: "text",
        html: `<p>You do not need to recite every failure mode. Interviewers want to see that you know a cache is not free and that you can handle the one or two failures that matter for this particular system. A social feed with celebrities should prompt hot keys. Anything with a short TTL on popular data should prompt stampedes. Anything where users edit their own data should prompt staleness and read-your-own-writes.</p>`,
      },
      {
        type: "callout",
        tone: "interview",
        title: "A strong closing line",
        html: `<p>"For eviction I'll use LRU with a TTL. The risks I'd design for are stampedes on hot keys, which I'd handle with request coalescing and jittered TTLs, and a cache outage, where the fallback path to the database goes through a circuit breaker so we degrade instead of falling over."</p>`,
      },
      {
        type: "list",
        title: "Common mistakes",
        items: [
          "Calling TTL an eviction policy. It bounds staleness; something else still decides what to evict when memory is full.",
          "Updating the cache on write instead of deleting the key, which invites out-of-order overwrites.",
          "Suggesting more cache nodes for a hot key. Sharding spreads keys, not the traffic on one key.",
          "Assuming the cache is always up and never saying what protects the database when it is not.",
        ],
      },
    ],
  },
];
