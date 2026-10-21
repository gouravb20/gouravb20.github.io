// LLD problem breakdown: LRU Cache. Format: Chapter in public/shared/notes.d.ts; shared helpers in data-part2.js.
// Imports are omitted in the code.
(function () {
const { levels, PRACTICE_TIP } = LLD_PROBLEMS_KIT;

window.DATA.chapters.push({
    id: `lru-cache`, part: 2, number: 0, difficulty: `medium`,
    title: `LRU Cache: O(1) get and put with a map and a linked list`,
    references: [{ title: `awesome-low-level-design: LRU Cache`, url: `https://github.com/ashishps1/awesome-low-level-design/blob/main/problems/lru-cache.md` }],
    overview: `A cache with a fixed number of slots: <code>get</code> returns a value, <code>put</code> stores one, and when the cache is full the entry nobody has touched for longest is thrown out. Both operations must run in O(1), from many threads at once. This page works the problem in interview order: clarify the requirements, find the entities, design the classes top down, implement them (comparing a simple, a better and a strong option at each decision), verify with a trace, then handle follow-ups. The design lands on a <strong>hash map</strong> from key to node for O(1) lookup, a <strong>doubly linked list</strong> with sentinel nodes that keeps entries in recency order, nodes that remember their own key so eviction can clean up the map, and <strong>one lock</strong> for every method, because even <code>get</code> changes the order.`,
    problem: [
      { id: `understanding`, title: `What an LRU cache does`, kicker: `The problem`, blocks: [
        { type: `problem`, html: `<p>A cache keeps recently used results close at hand so the slow source behind it (a database, a remote service, a disk) is asked less often. Memory is limited, so the cache holds at most a fixed number of entries. When a new entry arrives and the cache is full, something has to go. <strong>Least recently used</strong> (LRU) is the rule: throw out the entry that was read or written longest ago, on the bet that what was used recently will be used again soon.</p>` },
        { type: `text`, html: `<p>The prompt is usually one line: <em>"Design an LRU cache with get and put in constant time."</em> It sounds like a LeetCode exercise, but in an LLD round the interviewer also watches how you pin down the behaviour (what counts as a use, what a miss returns, what happens with many threads) before writing code. The first few minutes go into turning it into a spec.</p>` }
      ] },
      { id: `clarifying`, title: `Clarifying questions`, kicker: `Step 1: requirements`, blocks: [
        { type: `text`, html: `<p>Work through four kinds of question: <strong>what the cache must do</strong>, <strong>what happens with bad input</strong>, <strong>what is deliberately left out</strong>, and <strong>what might be added later</strong>. Spend one to three minutes here; each answer settles a detail you would otherwise have to guess in the code.</p>` },
        { type: `table`, headers: [`You ask`, `A typical answer`, `What it decides`], rows: [
          [`Does a read count as a use, or only a write?`, `Both: a get hit makes the key most recently used`, `get reorders entries, so get is a write as far as locking goes`],
          [`Does put on an existing key count as a use?`, `Yes: update the value and make it most recent`, `put has an update path that must never evict`],
          [`What does get return on a miss?`, `null`, `No exception and no Optional; null must then mean only "miss"`],
          [`Can keys or values be null?`, `No; reject them`, `A null from get is unambiguous`],
          [`Is the capacity fixed? What if it is zero or negative?`, `Fixed at construction; reject anything below 1`, `Validation in the constructor, no resizing`],
          [`Generic, or specific key and value types?`, `Generic`, `<code>LRUCache&lt;K, V&gt;</code>; keys rely on equals and hashCode`],
          [`Will many threads use it at once?`, `Yes`, `Every method that touches shared state must be thread-safe`],
          [`Can I use LinkedHashMap? Do you need remove, expiry, statistics?`, `Build it yourself, then mention the shortcut. Remove yes; expiry and stats later`, `A hand-written list; <code>remove(key)</code> in scope; TTL as a follow-up`]
        ] },
        { type: `callout`, tone: `insight`, title: `Does a read count as a use?`, html: `<p>This one answer shapes the whole design. If only writes counted, <code>get</code> would be a pure lookup, readers could share a read lock, and recency would change only on <code>put</code>. In a real LRU cache a hit <em>is</em> a use: <code>get</code> moves the entry to the most recent position, so every <code>get</code> modifies the structure. That is why the order must be cheap to change on every call, and why reads need the same exclusive lock as writes. Saying this out loud early shows you understand what the problem is really testing.</p>` }
      ] },
      { id: `final-requirements`, title: `Final requirements`, kicker: `Step 1: requirements`, blocks: [
        { type: `code`, lang: `text`, title: `Final requirements`, code: `Requirements
  1. The cache holds at most a fixed number of entries, set when it is
     created. A capacity below 1 is rejected.
  2. get(key) returns the value, or null if the key is absent. A hit makes
     the key the most recently used.
  3. put(key, value) inserts a new key or updates an existing one. Either
     way the key becomes the most recently used.
  4. Inserting a new key into a full cache first evicts the least recently
     used key. Updating an existing key never evicts.
  5. remove(key) deletes the key if present and reports whether it did.
  6. get, put and remove run in O(1) average time.
  7. Keys and values are generic. Null keys and null values are rejected.
  8. Any number of threads may call the cache at the same time.

Out of scope
  - Expiry (time-to-live) and loading values on a miss
  - Eviction policies other than LRU (LFU, FIFO)
  - Hit and miss statistics, eviction callbacks
  - Sizing by bytes instead of entry count
  - Persistence and sharing the cache across servers` },
        { type: `callout`, tone: `tip`, html: PRACTICE_TIP }
      ] }
    ],
    solution: [
      { id: `entities`, title: `Core entities`, kicker: `Step 2: entities`, blocks: [
        { type: `text`, html: `<p>Scan the requirements for nouns that hold state or enforce rules: cache, key, value, entry, capacity, recency order, eviction policy. This problem is mostly a data structure, so most of the nouns turn out <em>not</em> to be classes. Test each one before committing.</p>` },
        { type: `table`, headers: [`Candidate`, `Verdict`, `Why`], rows: [
          [`Cache`, `A class`, `The entry point. Holds the entries and enforces capacity, recency and eviction`],
          [`Key and value`, `Type parameters, not classes`, `The caller chooses them; the cache only needs keys to have equals and hashCode`],
          [`Capacity`, `An <code>int</code> field`, `A number checked once at construction; it enforces nothing on its own`],
          [`Entry`, `A small class (a node)`, `Each entry has state beyond key and value: its place in the recency order`],
          [`Recency order`, `Undecided for now`, `Something must answer "which key is least recent?" and move keys cheaply. Whether it is a class depends on the data structure; decide during class design`],
          [`Eviction policy`, `Not a class (yet)`, `Only LRU is required. An interface with one implementation adds a layer and no flexibility anyone asked for; it becomes a Strategy if a second policy appears (Deep Dives)`],
          [`Clock or timestamp`, `Not needed`, `Recency is an order, not a time. A clock arrives only with expiry`]
        ] },
        { type: `table`, title: `The entities we keep`, headers: [`Entity`, `Responsibility`], rows: [
          [`LRUCache&lt;K, V&gt;`, `The entry point. Validates input, finds entries by key, keeps the size within capacity by evicting the least recently used entry, and owns the lock. Knows nothing about pointer surgery.`],
          [`DoublyLinkedList&lt;K, V&gt;`, `The recency order: most recent at the front, least recent at the back. Adds, removes and moves nodes in O(1). Knows nothing about keys being unique or about capacity.`],
          [`Node&lt;K, V&gt;`, `One entry: its key, its value, and its two neighbours in the list.`]
        ] },
        { type: `callout`, tone: `tip`, html: `<p>It is fine to start with only <code>LRUCache</code> and say "the recency order is either a field or its own class; I'll decide once I've picked the structure." Interviewers care more that you test each noun than that you guess the final list immediately.</p>` }
      ] },
      { id: `cache-design`, title: `Class design: LRUCache`, kicker: `Step 3: class design, top down`, blocks: [
        { type: `text`, html: `<p>Start from the class callers talk to, and derive its state and methods from the requirements. For each requirement ask: what must this class remember, and what must it let callers do?</p>` },
        { type: `table`, headers: [`Requirement`, `What LRUCache remembers`], rows: [
          [`"At most a fixed number of entries"`, `<code>capacity</code>, a final <code>int</code> checked once`],
          [`"get and put in O(1)"`, `A hash map from key to that key's entry, so lookup never scans`],
          [`"Evict the least recently used"`, `A recency order it can read from the least recent end in O(1)`],
          [`"Many threads at the same time"`, `One lock covering the map and the order together`]
        ] },
        { type: `table`, headers: [`Need`, `Method`], rows: [
          [`Read a value`, `<code>V get(K key)</code>: null on a miss`],
          [`Insert or update`, `<code>void put(K key, V value)</code>`],
          [`Invalidate a key`, `<code>boolean remove(K key)</code>: false if it was absent`],
          [`Tests and monitoring`, `<code>int size()</code>`]
        ] },
        { type: `keypoints`, items: [
          `<strong>null on a miss, not Optional.</strong> Because null values are rejected, null from <code>get</code> can only mean "absent". <code>Optional&lt;V&gt;</code> is a fine alternative; the Go version returns <code>(V, bool)</code>.`,
          `<strong>put returns nothing.</strong> Returning the evicted value is tempting, but no requirement needs it; an eviction callback is the usual follow-up when someone does.`,
          `<strong>Nodes never leave the class.</strong> Callers see keys and values only. Handing out a node would let outside code rewire the list and break the cache.`,
          `<strong>Capacity counts entries, not bytes.</strong> Weighing entries by size is a follow-up that changes only the "is it full?" check.`
        ] }
      ] },
      { id: `recency-design`, title: `Class design: tracking recency`, kicker: `Step 3: class design`, blocks: [
        { type: `text`, html: `<p>The deferred question comes back here, and it is the heart of the problem: <strong>how does the cache know which entry is least recently used, and how does it update that on every get and put?</strong> A hash map alone finds entries fast but has no order. Something else has to hold the order.</p>` },
        { type: `compare`, items: [
          { title: `Good: a map plus a list of keys`, tone: `warn`, html: `<p>A <code>HashMap&lt;K, V&gt;</code> for values and an <code>ArrayList</code> or <code>ArrayDeque</code> of keys in recency order. Eviction takes the key at the old end in O(1). But a hit must find the key inside the list to move it, which is a scan: O(n) per <code>get</code>. Correct, easy to explain, and a reasonable first answer before improving it.</p>` },
          { title: `Better: LinkedHashMap in access order`, tone: `info`, html: `<p><code>new LinkedHashMap&lt;&gt;(16, 0.75f, true)</code> keeps entries in access order, and overriding <code>removeEldestEntry</code> evicts past capacity. O(1), a dozen lines, and the right choice in production. In an interview it usually skips the very thing being tested, so build the structure yourself and mention this as the shortcut.</p>` },
          { title: `Great: a HashMap plus a hand-written doubly linked list`, tone: `ok`, html: `<p>The map goes from key to a <em>node</em>, and the nodes form a doubly linked list in recency order. The map finds the node in O(1); because each node knows both neighbours, unlinking it and re-inserting it at the front is also O(1), with no search. This is what LinkedHashMap does inside.</p>` }
        ] },
        { type: `table`, title: `Cost of each way to track recency`, headers: [`Approach`, `get hit`, `put new key, cache full`, `Note`], rows: [
          [`Map plus list of keys`, `O(n)`, `O(1) evict, O(1) insert`, `Moving a key means finding it first`],
          [`Map plus a last-used time per key`, `O(1)`, `O(n) to find the oldest`, `Moves the scan from get to eviction`],
          [`Map plus a TreeMap ordered by last use`, `O(log n)`, `O(log n)`, `Correct, but not constant time`],
          [`LinkedHashMap in access order`, `O(1)`, `O(1)`, `The library does the work`],
          [`HashMap plus our own doubly linked list`, `O(1)`, `O(1)`, `The interview answer`]
        ] },
        { type: `text`, html: `<p>We build the last one, and the recency order earns a class of its own: <code>DoublyLinkedList</code>. Keeping the pointer surgery there means <code>LRUCache</code> reads as plain cache logic ("move to front", "remove last"), and the list can be tested on its own.</p>` },
        { type: `diagram`, title: `Map for lookup, list for recency`, caption: `The map points straight at list nodes. A hit unlinks the node and re-adds it right after head; eviction removes the node right before tail.`, svg: `<svg viewBox="0 0 640 210" role="img" aria-label="Hash map pointing into a doubly linked list between head and tail sentinels">
<defs><marker id="lp-lru-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="20" y="20" width="120" height="120" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="80" y="42" text-anchor="middle" font-size="13" font-weight="700" style="fill: var(--dg-ink)">HashMap</text>
<text x="40" y="70" font-size="12" style="fill: var(--dg-ink)">"a" &#8594;</text>
<text x="40" y="95" font-size="12" style="fill: var(--dg-ink)">"b" &#8594;</text>
<text x="40" y="120" font-size="12" style="fill: var(--dg-ink)">"c" &#8594;</text>
<rect x="190" y="150" width="70" height="40" rx="6" style="fill: var(--dg-6-soft); stroke: var(--dg-6)" stroke-dasharray="4 3"/><text x="225" y="175" text-anchor="middle" font-size="12" style="fill: var(--dg-ink)">head</text>
<rect x="290" y="150" width="60" height="40" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/><text x="320" y="175" text-anchor="middle" font-size="13" style="fill: var(--dg-ink)">b</text>
<rect x="380" y="150" width="60" height="40" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/><text x="410" y="175" text-anchor="middle" font-size="13" style="fill: var(--dg-ink)">a</text>
<rect x="470" y="150" width="60" height="40" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/><text x="500" y="175" text-anchor="middle" font-size="13" style="fill: var(--dg-ink)">c</text>
<rect x="560" y="150" width="60" height="40" rx="6" style="fill: var(--dg-6-soft); stroke: var(--dg-6)" stroke-dasharray="4 3"/><text x="590" y="175" text-anchor="middle" font-size="12" style="fill: var(--dg-ink)">tail</text>
<line x1="260" y1="170" x2="287" y2="170" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#lp-lru-arrow)"/>
<line x1="350" y1="170" x2="377" y2="170" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#lp-lru-arrow)"/>
<line x1="440" y1="170" x2="467" y2="170" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#lp-lru-arrow)"/>
<line x1="530" y1="170" x2="557" y2="170" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#lp-lru-arrow)"/>
<path d="M85 66 C 250 60, 400 90, 410 147" fill="none" stroke-width="1.5" style="stroke: var(--dg-1)" marker-end="url(#lp-lru-arrow)"/>
<path d="M85 91 C 220 95, 310 110, 318 147" fill="none" stroke-width="1.5" style="stroke: var(--dg-1)" marker-end="url(#lp-lru-arrow)"/>
<path d="M85 116 C 300 125, 480 110, 498 147" fill="none" stroke-width="1.5" style="stroke: var(--dg-3)" marker-end="url(#lp-lru-arrow)"/>
<text x="320" y="140" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">most recent</text>
<text x="500" y="140" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">evicted next</text>
</svg>` },
        { type: `table`, headers: [`Requirement`, `What a node remembers`], rows: [
          [`"get returns the value"`, `<code>value</code>, updated in place by <code>put</code>`],
          [`"Move or remove an entry in O(1)"`, `<code>prev</code> and <code>next</code>. With only <code>next</code>, unlinking would need the predecessor, which means a scan`],
          [`"Evict the least recent entry"`, `Its <code>key</code>. Eviction finds the victim through the list and must then delete it from the map, which needs the key`]
        ] },
        { type: `table`, headers: [`Need`, `Method on DoublyLinkedList`], rows: [
          [`A new key becomes the most recent`, `<code>void addFirst(Node n)</code>`],
          [`A hit or an update`, `<code>void moveToFront(Node n)</code>`],
          [`An explicit remove`, `<code>void remove(Node n)</code>`],
          [`Eviction`, `<code>Node removeLast()</code>: null if empty`]
        ] },
        { type: `keypoints`, items: [
          `<strong>Sentinel head and tail.</strong> Two dummy nodes that are always present mean every real node has a real neighbour on both sides. Inserting into an empty list, or removing the only node, needs no null checks.`,
          `<strong>The list has no lock of its own.</strong> It is only ever called from inside <code>LRUCache</code>'s lock, and no reference to it escapes. A lock inside the list would not help anyway: the map and the list must change together.`,
          `<strong>Mention the shortcut.</strong> Once the hand-written version works, show that you know the library answer too.`
        ] },
        { type: `code`, lang: `java`, title: `LinkedHashMap shortcut`, code: `/** The production shortcut: an access-ordered LinkedHashMap that drops its eldest entry past capacity. */
final class LinkedLru<K, V> {
    private final Map<K, V> map;

    LinkedLru(int capacity) {
        if (capacity <= 0) throw new IllegalArgumentException("capacity must be positive");
        LinkedHashMap<K, V> ordered = new LinkedHashMap<>(16, 0.75f, true) {   // true: get moves the entry to the end
            @Override protected boolean removeEldestEntry(Map.Entry<K, V> eldest) { return size() > capacity; }
        };
        this.map = Collections.synchronizedMap(ordered);   // get reorders entries, so reads must be synchronized too
    }

    V get(K key)             { return map.get(key); }
    void put(K key, V value) { map.put(key, value); }
    V remove(K key)          { return map.remove(key); }
}` }
      ] },
      { id: `class-diagram`, title: `Final class design`, kicker: `Step 3: class design`, blocks: [
        { type: `code`, lang: `java`, title: `Final class design`, code: `final class LRUCache<K, V> {
    private final int capacity;                         // fixed, at least 1
    private final Map<K, Node<K, V>> map;               // key to node: O(1) lookup
    private final DoublyLinkedList<K, V> list;          // recency order: most recent first

    LRUCache(int capacity);                             // throws if capacity < 1
    synchronized V get(K key);                          // null on a miss; a hit becomes most recent
    synchronized void put(K key, V value);              // insert or update; evicts the LRU entry when full
    synchronized boolean remove(K key);                 // false if absent
    synchronized int size();
}

final class DoublyLinkedList<K, V> {                    // no lock: used only under LRUCache's lock
    private final Node<K, V> head, tail;                // sentinels, always present

    void addFirst(Node<K, V> n);
    void remove(Node<K, V> n);
    void moveToFront(Node<K, V> n);
    Node<K, V> removeLast();                            // null if empty
}

final class Node<K, V> {
    final K key;                                        // eviction needs it to delete from the map
    V value;
    Node<K, V> prev, next;
}` },
        { type: `text`, html: `<p>The cache decides <em>what</em> happens (look up, update, evict); the list decides <em>how</em> nodes are relinked. Neither knows the other's rules: the list never checks capacity, and the cache never touches a <code>prev</code> or <code>next</code> pointer. There is no design pattern here beyond composition and encapsulation, and that is the point: this problem tests data-structure choice and locking, not patterns.</p>` }
      ] },
      { id: `list-impl`, title: `Implementation: the recency list`, kicker: `Step 4: implementation`, blocks: [
        { type: `text`, html: `<p>Check what the interviewer wants: working code, pseudocode or a walkthrough. Start bottom up here, because the cache is short once the list exists. The normal path is pure pointer work: <code>addFirst</code> sets four pointers, <code>remove</code> sets two, <code>moveToFront</code> is one then the other, and <code>removeLast</code> is <code>remove(tail.prev)</code>.</p>` },
        { type: `list`, title: `Edge cases the list must handle`, items: [
          `Empty list: <code>removeLast</code> returns null instead of unlinking the head sentinel.`,
          `A single node: both its neighbours are sentinels, so the same code works.`,
          `Moving the node that is already first: remove then addFirst puts it back where it was; no special case.`,
          `Removing a node twice: clearing its pointers on removal makes a second removal fail fast instead of silently corrupting its old neighbours.`
        ] },
        { type: `code`, lang: `java`, title: `Node and DoublyLinkedList`, code: `final class Node<K, V> {
    final K key;                       // eviction finds the node through the list, then needs the key to delete it from the map
    V value;
    Node<K, V> prev, next;

    Node(K key, V value) { this.key = key; this.value = value; }
}

/** Recency order: most recent right after head, least recent right before tail. Not thread-safe on purpose. */
final class DoublyLinkedList<K, V> {
    private final Node<K, V> head = new Node<>(null, null);   // sentinel
    private final Node<K, V> tail = new Node<>(null, null);   // sentinel

    DoublyLinkedList() {
        head.next = tail;
        tail.prev = head;
    }

    void addFirst(Node<K, V> n) {
        n.prev = head;
        n.next = head.next;
        head.next.prev = n;
        head.next = n;
    }

    void remove(Node<K, V> n) {
        n.prev.next = n.next;
        n.next.prev = n.prev;
        n.prev = null;
        n.next = null;
    }

    void moveToFront(Node<K, V> n) {
        remove(n);
        addFirst(n);
    }

    /** Unlinks and returns the least recently used node, or null if the list is empty. */
    Node<K, V> removeLast() {
        if (tail.prev == head) return null;
        Node<K, V> last = tail.prev;
        remove(last);
        return last;
    }
}` },
        { type: `keypoints`, items: [
          `<strong>Order matters in addFirst.</strong> Point the new node at its neighbours first, then update <code>head.next.prev</code> before <code>head.next</code>. Swap the last two lines and the old first node is lost.`,
          `<strong>Sentinels carry null keys.</strong> They are never put in the map, so the null key never reaches a lookup.`,
          `<strong>"Not thread-safe on purpose."</strong> The list is confined: only <code>LRUCache</code> creates it, and only while holding its lock does it call it.`
        ] }
      ] },
      { id: `cache-impl`, title: `Implementation: get, put and remove`, kicker: `Step 4: implementation`, blocks: [
        { type: `text`, html: `<p>With the list in place, each cache method is a few lines. <code>get</code>: look up the node; on a hit move it to the front and return its value. <code>remove</code>: take the node out of the map and the list. <code>put</code> is the one with a real decision: in what order should it check "does the key exist?" and "is the cache full?". Compare the options on a small example: capacity 2, after <code>put(a, 1)</code> and <code>put(b, 2)</code>, so the list is <code>[b, a]</code> (most recent first).</p>` },
        { type: `table`, headers: [`Order of checks in put`, `put(b, 20)`, `put(c, 3)`, `Verdict`], rows: [
          [`Evict if full, then insert or update`, `Evicts a, then updates b: <code>[b=20]</code>`, `Evicts a, inserts c: <code>[c, b]</code>`, `Wrong: an update never needs room, yet a is lost`],
          [`Insert or update, then evict while size &gt; capacity`, `<code>[b=20, a]</code>`, `Holds three entries for a moment, then evicts a: <code>[c, b]</code>`, `Correct; LinkedHashMap works this way, but goes one entry over capacity`],
          [`Update if present; otherwise evict if full, then insert`, `<code>[b=20, a]</code>`, `Evicts a, then inserts c: <code>[c, b]</code>`, `Correct and never over capacity`]
        ] },
        { type: `text`, html: `<p>We take the third: check for the key first. An update only changes a value and the order, so it returns before the capacity check is reached, and a new key makes room before it is inserted. The first ordering is a common bug because it reads naturally ("if full, evict") and passes every test that only inserts new keys.</p>` },
        { type: `list`, title: `Edge cases the code must handle`, items: [
          `A miss: return null and leave the order untouched.`,
          `Updating an existing key while the cache is full: no eviction.`,
          `Capacity 1: every new key evicts the previous one; the sentinels make this need no special case.`,
          `Removing an absent key: return false.`,
          `Null key or value: rejected, so null from <code>get</code> can only mean a miss.`,
          `Capacity zero or negative: rejected in the constructor, before any state exists.`
        ] },
        { type: `code`, lang: `java`, title: `LRUCache`, code: `final class LRUCache<K, V> {
    private final int capacity;
    // Guarded by this. Every key in the map has exactly one node in the list and vice versa,
    // so the two must always change together under the same lock.
    private final Map<K, Node<K, V>> map = new HashMap<>();
    private final DoublyLinkedList<K, V> list = new DoublyLinkedList<>();

    LRUCache(int capacity) {
        if (capacity <= 0) throw new IllegalArgumentException("capacity must be positive");
        this.capacity = capacity;
    }

    /** The value, or null on a miss. A hit becomes the most recently used, so this changes the list. */
    synchronized V get(K key) {
        Node<K, V> n = map.get(Objects.requireNonNull(key));
        if (n == null) return null;
        list.moveToFront(n);
        return n.value;
    }

    synchronized void put(K key, V value) {
        Objects.requireNonNull(key);
        Objects.requireNonNull(value);                // null is reserved for "miss"
        Node<K, V> n = map.get(key);
        if (n != null) {                              // existing key: update and move, never evict
            n.value = value;
            list.moveToFront(n);
            return;
        }
        if (map.size() == capacity) {                 // full: make room first, so size never exceeds capacity
            Node<K, V> lru = list.removeLast();
            map.remove(lru.key);
        }
        n = new Node<>(key, value);
        list.addFirst(n);
        map.put(key, n);
    }

    synchronized boolean remove(K key) {
        Node<K, V> n = map.remove(Objects.requireNonNull(key));
        if (n == null) return false;
        list.remove(n);
        return true;
    }

    synchronized int size() { return map.size(); }
}` },
        { type: `callout`, tone: `warning`, html: `<p>Thread safety: every public method is <code>synchronized</code> on the cache, <code>get</code> included, because a hit moves a node. The map and the list form one invariant (each key has exactly one node, each node exactly one key), so they must change under one lock. Swapping the <code>HashMap</code> for a <code>ConcurrentHashMap</code> and locking the list separately breaks that: a thread could find a node in the map that another thread has just unlinked as the eviction victim. A <code>ReadWriteLock</code> gains nothing, since <code>get</code> needs the write side. <code>DoublyLinkedList</code> and <code>Node</code> have no lock of their own; they are safe only because no reference to them ever leaves <code>LRUCache</code>. <code>capacity</code> is final, so reading it needs no lock.</p>` },
        { type: `text`, html: `<p>The split into <code>LRUCache</code>, a separate <code>DoublyLinkedList</code> (with <code>addFirst</code>, <code>remove</code>, <code>moveToFront</code> and <code>removeLast</code>) and <code>Node</code>, the synchronized methods and <code>remove(key)</code> follow the <a href="https://github.com/ashishps1/awesome-low-level-design/tree/main/solutions/java/src/lrucache" target="_blank" rel="noopener">awesome-low-level-design LRU cache solution</a>; the code here is written independently. It adds a capacity check (without one, a capacity of 0 or less never evicts and grows without bound), looks each key up once instead of <code>containsKey</code> then <code>get</code>, rejects null keys and values so null only means a miss, and states that the list relies on the cache's lock.</p>` }
      ] },
      { id: `verification`, title: `Verifying with a trace`, kicker: `Step 5: verification`, blocks: [
        { type: `text`, html: `<p>Walk a concrete sequence through the code before the interviewer does, writing the list after each call. Capacity 3, list shown most recent first.</p>` },
        { type: `code`, lang: `text`, title: `Call by call`, code: `call         returns  list after    what happened
put(a, 1)    -        [a]
put(b, 2)    -        [b, a]
put(c, 3)    -        [c, b, a]     the cache is now full
get(a)       1        [a, c, b]     hit: a moves to the front
put(d, 4)    -        [d, a, c]     new key, full: evict b (the node before tail), then insert d
get(b)       null     [d, a, c]     miss: the order does not change
put(c, 30)   -        [c, d, a]     existing key: update and move to the front, no eviction
put(e, 5)    -        [e, c, d]     new key, full: evict a
remove(d)    true     [e, c]
put(f, 6)    -        [f, e, c]     room after the remove: no eviction
get(c)       30       [c, f, e]     the update from put(c, 30) is what get returns` },
        { type: `keypoints`, items: [
          `<code>get(a)</code> saved a from eviction: without that read, <code>put(d, 4)</code> would have evicted a instead of b. Reads count as uses.`,
          `<code>put(c, 30)</code> on a full cache evicted nothing, which is exactly what the "check for the key first" ordering guarantees.`,
          `A miss leaves the order alone, and a remove frees a slot so the next insert does not evict.`,
          `Every eviction took the node just before the tail sentinel, and the map lost the same key, because the node carried it.`
        ] }
      ] }
    ],
    levels: levels(
      [`Gets to a hash map plus a doubly linked list, perhaps after starting with a list of keys and seeing the O(n) move, and explains why neither structure alone is enough.`, `Correct get, put and eviction: a hit moves the entry to the front, an update moves it too, and a new key in a full cache evicts the entry at the back.`, `Explains why each node stores its key (a hint is fine) and can trace a short sequence of calls by hand.`],
      [`Asks whether a read counts as a use and draws the consequence: get changes the list, so every method takes the same lock and a ReadWriteLock does not help.`, `Sentinels, generics, capacity validation and the update path that never evicts, all without prompting.`, `Separates the list into its own class and states that it is safe only because it is confined behind the cache's lock.`, `Names LinkedHashMap with access order and removeEldestEntry as the production answer and explains why the interview builds it by hand.`],
      [`Discusses contention under load: striping by key hash, read buffering as Caffeine does, and what approximate recency costs in hit rate.`, `Handles TTL, a pluggable eviction policy and loading on a miss by naming the one class each touches, keeping slow loads outside the lock and collapsing duplicate loads for the same key.`, `Connects the class to the system around it: cache-aside versus write-through versus write-back, invalidation across servers, and when a local LRU should become a shared cache such as Redis.`]
    ),
    concepts: [
      { term: `HashMap plus doubly linked list`, def: `The map goes from key to node; the nodes form a list in recency order.`, why: `The map gives O(1) lookup, the list O(1) reordering and eviction. Neither does both alone.` },
      { term: `Sentinel nodes`, def: `A dummy head and tail that are always in the list.`, why: `Every real node has two real neighbours, so empty and single-node lists need no special cases.` },
      { term: `Move to front`, def: `On every hit and every update, unlink the node and insert it after head.`, why: `Keeps the least recently used entry at the back, right before tail.` },
      { term: `The node stores its key`, def: `Each node carries the key it belongs to, not just the value.`, why: `Eviction finds the victim through the list and needs its key to delete it from the map.` },
      { term: `Check for the key before evicting`, def: `put updates an existing key first; only a new key in a full cache triggers eviction.`, why: `Evicting first loses an entry for no reason when the call was only an update.` },
      { term: `A read is a write`, def: `get moves the hit to the front, so it modifies the list.`, why: `Every method needs the same exclusive lock; a ReadWriteLock buys nothing.` },
      { term: `One lock for two structures`, def: `The map and the list change together under the cache's lock; the list has no lock of its own.`, why: `Separately thread-safe pieces do not make the pair consistent; confinement keeps the list safe.` },
      { term: `LinkedHashMap shortcut`, def: `<code>new LinkedHashMap&lt;&gt;(16, 0.75f, true)</code> with <code>removeEldestEntry</code> returning <code>size() &gt; capacity</code>.`, why: `The production answer on the JVM; mention it after building the real thing.` }
    ],
    interview: [
      { q: `Why do you need both a hash map and a linked list?`, a: `The map gives O(1) lookup by key but has no notion of order. A list keeps recency order, but finding a key in it is a scan. Pointing the map at list nodes gets both: the map finds the node in O(1), and because the node is doubly linked it can be unlinked and re-inserted at the front without searching.`, diff: `easy` },
      { q: `Why must the list be doubly linked?`, a: `Unlinking a node means updating its predecessor's next pointer. In a singly linked list the only way to find the predecessor is to walk from the head, which is O(n). With prev pointers, both neighbours are one step away, so removing any node, including the one before the tail on eviction, is O(1).`, diff: `medium` },
      { q: `Why does each node store its key?`, a: `Eviction starts from the list: the victim is the node before the tail sentinel. To finish the eviction the entry must also leave the map, and the map is keyed by key, so the node has to carry it. Without the key you would have to search the map for the node.`, diff: `easy` },
      { q: `Your put checks whether the cache is full before checking whether the key exists. What goes wrong?`, a: `An update to an existing key in a full cache evicts the least recently used entry even though no room is needed, so the cache ends up one entry short and loses a key it should have kept. The test that catches it: fill the cache, update one key, then read the others. Checking for the key first fixes it.`, diff: `medium` },
      { q: `Why doesn't a ReadWriteLock help, and why not just use a ConcurrentHashMap?`, a: `get moves the hit to the front of the list, so it writes; every operation would take the write lock and the read side would never be used. A ConcurrentHashMap makes the map safe on its own, but the invariant spans the map and the list. Two thread-safe structures updated separately can still disagree, for example a thread finding a node that another thread has just evicted. One lock around both is the simple correct answer.`, diff: `medium` },
      { q: `The cache becomes a hot spot under heavy load. How do you reduce contention?`, a: `Split it into N independent caches (stripes), each with its own lock, and route each key by its hash. Threads touching different stripes never wait for each other; recency becomes per stripe, which is approximate overall but rarely matters. Beyond that, libraries like Caffeine record reads in buffers and replay them in batches, so a get rarely takes a lock. Measure first: a single lock held for a few pointer updates is often fast enough.`, diff: `hard` },
      { q: `When would you use LinkedHashMap instead?`, a: `In production on the JVM when nothing fancier is needed: construct it with accessOrder true so gets reorder entries, override removeEldestEntry to return size() greater than capacity, and wrap it in a lock, because get changes the order. In an interview, build the map and list by hand first, then mention it.`, diff: `easy` },
      { q: `How would you build an LFU cache with O(1) operations?`, a: `Keep each key's access count, a map from count to the keys with that count in insertion order (a LinkedHashSet, so ties break by recency), and the current minimum count. An access moves the key from count f to f plus 1 and raises the minimum if f's set was the minimum and is now empty. Eviction removes the first key of the minimum count's set; a new key starts at count 1, which becomes the minimum.`, diff: `hard` }
    ],
    cheatsheet: [
      { title: `LRU cache in one screen`, type: `code`, lang: `java`, body: `// map: key -> node (O(1) lookup); list: head <-> most recent ... least recent <-> tail
final class LRUCache<K, V> {
    private final int capacity;                                            // at least 1, checked in the constructor
    private final Map<K, Node<K, V>> map = new HashMap<>();                // guarded by this
    private final DoublyLinkedList<K, V> list = new DoublyLinkedList<>();  // guarded by this, no lock of its own

    synchronized V get(K key) {
        Node<K, V> n = map.get(key);
        if (n == null) return null;
        list.moveToFront(n);                                               // a read is a write
        return n.value;
    }

    synchronized void put(K key, V value) {
        Node<K, V> n = map.get(key);
        if (n != null) { n.value = value; list.moveToFront(n); return; }   // update: never evict
        if (map.size() == capacity) map.remove(list.removeLast().key);     // evict before insert
        n = new Node<>(key, value);
        list.addFirst(n);
        map.put(key, n);
    }
}
// Node keeps its key for eviction. Sentinel head and tail remove every null check.` },
      { title: `Follow-ups and where they land`, type: `table`, headers: [`Follow-up`, `Change`], rows: [
        [`Time-to-live per entry`, `Node gains an expiry time; get checks an injected clock (Deep Dives)`],
        [`LFU or another eviction policy`, `An EvictionPolicy strategy; the cache keeps values only (Deep Dives)`],
        [`Lock contention under load`, `Striping by key hash, or a library like Caffeine (Deep Dives)`],
        [`Load values on a miss`, `A loading wrapper that loads outside the lock and shares one load per key (Deep Dives)`],
        [`Writes and many servers`, `Cache-aside, write-through or write-back; invalidation or a shared cache (Deep Dives)`],
        [`Eviction callback`, `put collects the evicted entry and calls the listener after releasing the lock`],
        [`Capacity in bytes`, `A weigher per entry; evict while total weight is over the limit`]
      ] }
    ],
    labs: []
  });
})();
