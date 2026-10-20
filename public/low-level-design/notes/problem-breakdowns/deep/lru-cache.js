// Deep dives: LRU Cache (LLD practice set). Format: DeepDive in public/shared/notes.d.ts.
window.DEEP = window.DEEP || {};
DEEP["lru-cache"] = {
  hook: `<p>The map plus linked list answers the core question. Interviewers then ask for expiry, a different eviction policy, less lock contention, and how caching behaves when there is a database (or a cluster) behind it.</p>`,
  sections: [
    {
      id: "ttl",
      title: "Time-to-live per entry",
      kicker: "Follow-up: expiry",
      blocks: [
        { type: "code", lang: "java", title: "Expire lazily on get", code: `private static class Node<K, V> {
    K key; V val; Instant expiresAt; Node<K, V> prev, next;
}

private final Clock clock;

synchronized V get(K key) {
    Node<K, V> n = map.get(key);
    if (n == null) return null;
    if (clock.instant().isAfter(n.expiresAt)) {            // expired: treat as a miss
        unlink(n);
        map.remove(key);
        return null;
    }
    unlink(n);
    addFront(n);
    return n.val;
}

synchronized void put(K key, V val, Duration ttl) {
    // as before, plus: n.expiresAt = clock.instant().plus(ttl);
}` },
        { type: "keypoints", items: [
          "Lazy expiry costs nothing extra but leaves expired entries in memory until touched or evicted.",
          "A background sweep (a <code>ScheduledExecutorService</code> every few seconds), or a priority queue by expiry, reclaims memory for keys nobody reads.",
          "Inject the clock so expiry is testable."
        ] }
      ]
    },
    {
      id: "lfu",
      title: "LFU in O(1)",
      kicker: "Follow-up: a different policy",
      blocks: [
        { type: "text", html: `<p>Least frequently used evicts the key with the fewest accesses, breaking ties by least recent. The O(1) design keeps a map from frequency to a linked set of keys, plus the current minimum frequency.</p>` },
        { type: "code", lang: "java", title: "LFU cache", code: `class LFUCache<K, V> {
    private final int capacity;
    private final Map<K, V> values = new HashMap<>();
    private final Map<K, Integer> freq = new HashMap<>();
    private final Map<Integer, LinkedHashSet<K>> byFreq = new HashMap<>();
    private int minFreq;

    LFUCache(int capacity) { this.capacity = capacity; }

    synchronized V get(K key) {
        if (!values.containsKey(key)) return null;
        touch(key);
        return values.get(key);
    }

    synchronized void put(K key, V val) {
        if (capacity <= 0) return;
        if (values.containsKey(key)) { values.put(key, val); touch(key); return; }
        if (values.size() == capacity) {
            K victim = byFreq.get(minFreq).iterator().next();   // least frequent, then least recent
            byFreq.get(minFreq).remove(victim);
            values.remove(victim);
            freq.remove(victim);
        }
        values.put(key, val);
        freq.put(key, 1);
        byFreq.computeIfAbsent(1, f -> new LinkedHashSet<>()).add(key);
        minFreq = 1;
    }

    private void touch(K key) {
        int f = freq.get(key);
        freq.put(key, f + 1);
        byFreq.get(f).remove(key);
        if (f == minFreq && byFreq.get(f).isEmpty()) minFreq++;
        byFreq.computeIfAbsent(f + 1, x -> new LinkedHashSet<>()).add(key);
    }
}` }
      ]
    },
    {
      id: "contention",
      title: "Less lock contention",
      kicker: "Follow-up: concurrency",
      blocks: [
        { type: "compare", items: [
          { title: "Striped (segmented) cache", tone: "ok", html: `<p>N independent LRU caches, each with its own lock; a key goes to segment <code>hash(key) mod N</code>. Recency becomes per segment (approximate globally), but threads rarely contend.</p>` },
          { title: "A library such as Caffeine", tone: "ok", html: `<p>Buffers reads and replays them asynchronously, using an admission policy (W-TinyLFU) for high hit rates with very little locking. The production answer on the JVM.</p>` },
          { title: "ReadWriteLock", tone: "bad", html: `<p>Doesn't help: <code>get</code> reorders the list, so it needs the write lock anyway.</p>` }
        ] },
        { type: "code", lang: "java", title: "Striping in a few lines", code: `class StripedLru<K, V> {
    private final LRUCache<K, V>[] segments;

    @SuppressWarnings("unchecked")
    StripedLru(int capacity, int stripes) {
        segments = new LRUCache[stripes];
        for (int i = 0; i < stripes; i++) segments[i] = new LRUCache<>(Math.max(1, capacity / stripes));
    }

    private LRUCache<K, V> seg(K key) { return segments[Math.floorMod(key.hashCode(), segments.length)]; }

    V get(K key)        { return seg(key).get(key); }
    void put(K key, V v) { seg(key).put(key, v); }
}` }
      ]
    },
    {
      id: "write-policies",
      title: "Write-through, write-back and distributed caches",
      kicker: "Follow-up: caching in a system",
      blocks: [
        { type: "table", headers: ["Policy", "On write", "Trade-off"], rows: [
          ["Write-through", "Write to the database and the cache together", "Cache always fresh; writes pay both latencies"],
          ["Write-back (write-behind)", "Write to the cache; flush to the database later", "Fast writes; data loss if the cache dies before flushing"],
          ["Cache-aside", "Write to the database, invalidate the cache entry", "Simple; next read reloads; brief staleness"]
        ] },
        { type: "text", html: `<p>Across many servers, each local LRU can hold a different version of a key. Options: short TTLs, invalidation messages on writes (pub-sub), or a shared cache such as Redis. That is the point where an LLD question becomes a system design one.</p>` },
        { type: "quiz", q: "Capacity 2. Operations: put(a), put(b), get(a), put(c). Which key is evicted?", options: ["a", "b", "c", "none"], answer: 1, explain: `<p>After put(a), put(b) the order is b, a (most recent first). get(a) makes it a, b. put(c) evicts the least recently used, b.</p>` }
      ]
    }
  ],
  takeaways: [
    "TTL: store an expiry per node, expire lazily on get, optionally sweep in the background.",
    "LFU in O(1): frequency map to linked sets of keys plus a minFreq counter.",
    "Reduce contention with striping or a library like Caffeine; a read-write lock doesn't help.",
    "Choose write-through, write-back or cache-aside deliberately; distributed caches add staleness."
  ]
};
