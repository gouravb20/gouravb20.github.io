// Deep dives: LRU Cache (LLD practice set). Format: DeepDive in public/shared/notes.d.ts.
window.DEEP = window.DEEP || {};
DEEP["lru-cache"] = {
  hook: `<p>Once get and put work, interviewers push on the edges: entries that go stale, a different eviction rule, many threads fighting over one lock, a database behind the cache, several servers in front of it. You rarely implement these in full; you show which class changes and why the rest doesn't. Junior candidates may get none of these, mid-level one or two, senior candidates several, in more depth.</p>`,
  sections: [
    {
      id: "ttl",
      title: "\"How would you add a time-to-live per entry?\"",
      kicker: "Follow-up: expiry",
      blocks: [
        { type: "text", html: `<p>Each entry should disappear a fixed time after it was written, even if it is still being read. Only two things change: <code>Node</code> gains an expiry time, and <code>LRUCache</code> gains a clock and an expiry check in <code>get</code>. <code>DoublyLinkedList</code> is untouched, because expiry is about time, not about order.</p>` },
        { type: "code", lang: "java", title: "TTL: expire lazily on get", code: `// Node gains one field; DoublyLinkedList does not change.
final class Node<K, V> {
    final K key;
    V value;
    Instant expiresAt;
    Node<K, V> prev, next;
}

// In LRUCache:
private final Clock clock;                                 // injected, so tests can move time forward

synchronized V get(K key) {
    Node<K, V> n = map.get(key);
    if (n == null) return null;
    if (!clock.instant().isBefore(n.expiresAt)) {          // expired: drop it and report a miss
        list.remove(n);
        map.remove(key);
        return null;
    }
    list.moveToFront(n);
    return n.value;
}

synchronized void put(K key, V value, Duration ttl) {
    // the same as put(key, value), plus: n.expiresAt = clock.instant().plus(ttl);
}` },
        { type: "keypoints", items: [
          "Lazy expiry costs nothing extra, but an expired entry keeps its slot until someone reads it or it drifts to the back and is evicted.",
          "If that matters, add a sweep on a <code>ScheduledExecutorService</code> that takes the same lock and drops expired entries, or keep a priority queue ordered by expiry so the sweep only looks at entries that are due.",
          "Inject a <code>Clock</code> rather than calling <code>Instant.now()</code>; otherwise expiry tests have to sleep.",
          "A fixed TTL for the whole cache is simpler than one per entry: then entries expire in write order, and a second list ordered by write time replaces the priority queue."
        ] }
      ]
    },
    {
      id: "eviction-policy",
      title: "\"Can we switch to LFU, or make the eviction policy pluggable?\"",
      kicker: "Follow-up: a different policy",
      blocks: [
        { type: "text", html: `<p>Least frequently used (LFU) evicts the key with the fewest accesses, which suits workloads where a few keys stay popular for a long time. Rather than writing a second cache, pull the ordering out of the cache into a <strong>Strategy</strong>: the cache keeps a plain map of values and tells the policy about every add, access and remove; the policy decides who leaves. <code>LRUCache</code> becomes <code>PolicyCache</code> once, and after that new policies never touch it.</p>` },
        { type: "code", lang: "java", title: "Pluggable eviction policy", code: `/** Decides which key leaves when the cache is full. Not thread-safe: PolicyCache calls it only under its own lock. */
interface EvictionPolicy<K> {
    void keyAdded(K key);
    void keyAccessed(K key);        // a get hit or an update
    void keyRemoved(K key);         // an explicit remove
    K evict();                      // choose a victim, forget it and return it; null if empty
}

final class PolicyCache<K, V> {
    private final int capacity;
    private final EvictionPolicy<K> policy;              // one instance per cache, never shared
    private final Map<K, V> values = new HashMap<>();    // guarded by this, together with policy

    PolicyCache(int capacity, EvictionPolicy<K> policy) {
        if (capacity <= 0) throw new IllegalArgumentException("capacity must be positive");
        this.capacity = capacity;
        this.policy = policy;
    }

    synchronized V get(K key) {
        V v = values.get(key);
        if (v != null) policy.keyAccessed(key);
        return v;
    }

    synchronized void put(K key, V value) {
        Objects.requireNonNull(value);
        if (values.containsKey(key)) {
            values.put(key, value);
            policy.keyAccessed(key);
            return;
        }
        if (values.size() == capacity) values.remove(policy.evict());
        values.put(key, value);
        policy.keyAdded(key);
    }

    synchronized boolean remove(K key) {
        if (values.remove(key) == null) return false;
        policy.keyRemoved(key);
        return true;
    }
}

// LruPolicy is the solution's DoublyLinkedList plus a Map<K, Node>, holding keys instead of values.` },
        { type: "text", html: `<p>LFU in O(1) keeps each key's count, a map from count to the keys with that count in insertion order (so ties go to the least recently used), and the smallest count currently in use.</p>` },
        { type: "code", lang: "java", title: "LFU as an EvictionPolicy", code: `/** Least frequently used; ties go to the least recently used key with that count. Every method is O(1). */
final class LfuPolicy<K> implements EvictionPolicy<K> {
    private final Map<K, Integer> freq = new HashMap<>();
    private final Map<Integer, LinkedHashSet<K>> byFreq = new HashMap<>();   // insertion order = recency within a count
    // May be stale after keyRemoved or evict. Harmless: both leave the cache below capacity,
    // so keyAdded (which resets it to 1) always runs before the next evict.
    private int minFreq;

    public void keyAdded(K key) {
        freq.put(key, 1);
        byFreq.computeIfAbsent(1, f -> new LinkedHashSet<>()).add(key);
        minFreq = 1;
    }

    public void keyAccessed(K key) {
        int f = freq.get(key);
        freq.put(key, f + 1);
        unlink(f, key);
        if (f == minFreq && !byFreq.containsKey(f)) minFreq = f + 1;
        byFreq.computeIfAbsent(f + 1, x -> new LinkedHashSet<>()).add(key);
    }

    public void keyRemoved(K key) {
        Integer f = freq.remove(key);
        if (f != null) unlink(f, key);
    }

    public K evict() {
        LinkedHashSet<K> keys = byFreq.get(minFreq);
        if (keys == null) return null;
        K victim = keys.iterator().next();
        freq.remove(victim);
        unlink(minFreq, victim);
        return victim;
    }

    private void unlink(int f, K key) {
        LinkedHashSet<K> keys = byFreq.get(f);
        keys.remove(key);
        if (keys.isEmpty()) byFreq.remove(f);
    }
}` },
        { type: "keypoints", items: [
          "What changed: the cache once (values only, plus calls into the policy) and one new class per policy. What didn't: the locking rule. The policy has no lock because it is only called under the cache's lock, which is also why one policy instance must never serve two caches.",
          "The price is a second map: the cache maps keys to values and the policy maps keys to its own bookkeeping. For one fixed policy, the single-map LRU from the solution is leaner.",
          "Pure LFU has a known weakness: a key that was hot yesterday keeps a high count and never leaves. Real caches age counts or use an admission filter such as W-TinyLFU.",
          "Capacity 2, calls put(a), put(b), get(a), put(c): LFU evicts b (count 1). Then get(c), put(d): a and c both have count 2, and a reached it first, so a goes."
        ] },
        { type: "callout", tone: "interview", html: `<p>Say when the abstraction is worth it: "With one policy I'd keep the single class. The moment a second policy is real, I'd extract <code>EvictionPolicy</code>, and the cache's lookup and locking stop changing." Extracting an interface for a variant nobody asked for is the mistake the entity step warned about.</p>` }
      ]
    },
    {
      id: "contention",
      title: "\"The cache is a hot spot. How do you reduce lock contention?\"",
      kicker: "Follow-up: concurrency",
      blocks: [
        { type: "text", html: `<p>Every call takes the same lock, including reads. A lock held for a few pointer updates is cheap, so measure before changing anything. If it really is the bottleneck, the fix is to stop sharing one structure, not to make one structure cleverer.</p>` },
        { type: "compare", items: [
          { title: "Striped cache", tone: "ok", html: `<p>N independent <code>LRUCache</code>s, each with its own lock; a key always goes to stripe <code>hash(key) mod N</code>. Threads using different stripes never wait for each other. Recency becomes per stripe, so the evicted entry is the least recent <em>in its stripe</em>, which is close enough for almost every workload.</p>` },
          { title: "A library such as Caffeine", tone: "info", html: `<p>Records reads in small lock-free buffers and replays them into the recency structure in batches, so a <code>get</code> rarely takes a lock. Adds an admission policy (W-TinyLFU) for better hit rates. The production answer on the JVM.</p>` },
          { title: "ReadWriteLock", tone: "bad", html: `<p>Doesn't help: <code>get</code> moves the hit to the front, so it needs the write lock too and the read side is never used.</p>` }
        ] },
        { type: "code", lang: "java", title: "Striped cache", code: `/** N independent LRU caches, each behind its own lock. The list of stripes never changes after construction. */
final class StripedLruCache<K, V> {
    private final List<LRUCache<K, V>> stripes;

    StripedLruCache(int capacity, int stripeCount) {
        int perStripe = Math.max(1, capacity / stripeCount);
        this.stripes = IntStream.range(0, stripeCount).mapToObj(i -> new LRUCache<K, V>(perStripe)).toList();
    }

    private LRUCache<K, V> stripeFor(K key) {
        return stripes.get(Math.floorMod(key.hashCode(), stripes.size()));
    }

    V get(K key)             { return stripeFor(key).get(key); }
    void put(K key, V value) { stripeFor(key).put(key, value); }
    boolean remove(K key)    { return stripeFor(key).remove(key); }
}` },
        { type: "keypoints", items: [
          "<code>LRUCache</code> does not change at all; striping is a wrapper. That is the payoff of keeping the lock inside the cache.",
          "Capacity is split per stripe, so one busy stripe can evict while others have room. More stripes means less contention but coarser recency.",
          "A single very hot key still lands on one stripe. If one key dominates, the answer is a local copy per thread or per request, not more stripes."
        ] }
      ]
    },
    {
      id: "loading",
      title: "\"How would the cache load missing values from the database?\"",
      kicker: "Follow-up: loading on a miss",
      blocks: [
        { type: "text", html: `<p>Callers want <code>get</code> to fetch from the database on a miss and cache the result. Two naive versions both fail. Loading inside the synchronized <code>get</code> holds the lock for a whole database call, so every other thread, even those wanting cached keys, waits. Loading outside the lock with no coordination causes a <strong>stampede</strong>: a popular key expires and a hundred threads all query the database for it at once.</p>` },
        { type: "code", lang: "java", title: "Loading on a miss", code: `/** Loads missing keys through the cache. Concurrent misses for the same key share one load. */
final class LoadingCache<K, V> {
    private final LRUCache<K, V> cache;
    private final Function<K, V> loader;                                     // e.g. a database read; may be slow
    private final ConcurrentHashMap<K, CompletableFuture<V>> inFlight = new ConcurrentHashMap<>();

    LoadingCache(LRUCache<K, V> cache, Function<K, V> loader) {
        this.cache = cache;
        this.loader = loader;
    }

    V get(K key) {
        V cached = cache.get(key);
        if (cached != null) return cached;
        CompletableFuture<V> mine = new CompletableFuture<>();
        CompletableFuture<V> running = inFlight.putIfAbsent(key, mine);
        if (running != null) return running.join();                         // someone else is loading it: wait for theirs
        try {
            V loaded = loader.apply(key);                                    // outside the cache's lock
            if (loaded != null) cache.put(key, loaded);
            mine.complete(loaded);
            return loaded;
        } catch (RuntimeException e) {
            mine.completeExceptionally(e);                                   // waiters see the same failure
            throw e;
        } finally {
            inFlight.remove(key, mine);
        }
    }
}` },
        { type: "keypoints", items: [
          "<code>LRUCache</code> is unchanged; loading is a wrapper. The cache's lock is held only for its own short get and put, never for the database call.",
          "<code>putIfAbsent</code> on a <code>ConcurrentHashMap</code> is atomic, so exactly one thread per key becomes the loader; the rest wait on its future.",
          "A thread that missed just before the loader stored the value can still start a second load after the loader finishes. That rare duplicate is harmless; preventing it would mean holding a lock across the load.",
          "Failures are not cached, so the next call retries. Caching \"not found\" for a short time (negative caching) protects the database from repeated lookups of missing keys."
        ] }
      ]
    },
    {
      id: "writes-and-servers",
      title: "\"What happens on writes, and when there are many servers?\"",
      kicker: "Follow-up: caching in a system",
      blocks: [
        { type: "text", html: `<p>So far the cache only answers reads. Once the data behind it changes, you have to choose how writes reach the cache and the database. This changes no class in the design; it decides who calls <code>put</code> and <code>remove</code>, and when.</p>` },
        { type: "table", headers: ["Policy", "On a write", "Trade-off"], rows: [
          ["Cache-aside", "Write to the database, then remove the key from the cache; the next read reloads it", "Simple and common; a short window of staleness"],
          ["Write-through", "Write to the database and the cache together", "Reads are always fresh; every write pays both costs"],
          ["Write-back (write-behind)", "Write to the cache now; flush to the database later", "Fast writes; data is lost if the cache dies before flushing"]
        ] },
        { type: "text", html: `<p>With many application servers, each has its own in-process LRU, and a write on one server leaves stale copies on the others. The options are short TTLs (accept bounded staleness), invalidation messages on every write (a pub-sub channel each server listens to and calls <code>remove</code> from), or a shared cache such as Redis that every server reads. At that point the question has become a system design question, and saying so is a good way to end the follow-up.</p>` },
        { type: "quiz", q: "Capacity 2, LRU. Calls: put(a), put(b), get(a), put(c), put(b). Which keys are in the cache at the end?", options: [
          "a and b",
          "b and c",
          "a and c",
          "a, b and c"
        ], answer: 1, explain: `<p>After put(a), put(b) the list is [b, a]. get(a) makes it [a, b]. put(c) evicts b, the least recent: [c, a]. put(b) is a new key again, so it evicts a: [b, c].</p>` }
      ]
    }
  ],
  takeaways: [
    "Each follow-up touches one class: TTL changes Node and the get path, a new policy changes the cache once and then lives in its own class, striping and loading are wrappers that leave LRUCache alone.",
    "TTL: store an expiry per node, check an injected clock in get, and add a sweep only if expired entries holding slots matters.",
    "A pluggable EvictionPolicy is a Strategy called under the cache's lock; LFU in O(1) is counts, a count-to-keys map in insertion order, and the minimum count.",
    "For contention, stripe by key hash or use a library like Caffeine; a read-write lock doesn't help because get writes.",
    "Load on a miss outside the lock, and let one thread per key load while others wait on its future.",
    "Writes and many servers are a choice between cache-aside, write-through and write-back, plus TTLs, invalidation messages or a shared cache."
  ]
};
