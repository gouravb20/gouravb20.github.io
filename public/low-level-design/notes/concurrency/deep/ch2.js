// Deep dive: Chapter 2, Correctness. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch2 = {
  hook: `<p>Correctness is the concurrency question you're most likely to get: "two users click Book at the same moment; what happens?" This chapter takes one running example, booking seats for a show, from a broken version to a correct one. It then climbs the ladder of tools (confinement, atomics, concurrent collections, locks, optimistic versions) and ends with the hazard that finer locking brings: deadlock.</p>`,
  sections: [
    {
      id: "two-shapes",
      title: "The two shapes of a race",
      kicker: "The problem",
      blocks: [
        { type: "problem", html: `<p>This class is fine with one caller and broken with two:</p>` },
        { type: "code", lang: "java", title: "Check-then-act and read-modify-write in one class", code: `class Show {
    private final Map<String, String> seatOwner = new HashMap<>();
    private int seatsSold = 0;

    boolean book(String seatId, String userId) {
        if (seatOwner.containsKey(seatId)) return false;   // check
        seatOwner.put(seatId, userId);                      // act
        seatsSold++;                                        // read-modify-write
        return true;
    }
}` },
        { type: "list", items: [
          "<strong>Check-then-act:</strong> two threads both see the seat missing, both put, and both users are told they booked it. The second put silently overwrites the first.",
          "<strong>Read-modify-write:</strong> <code>seatsSold++</code> can lose increments.",
          "<strong>Worse:</strong> <code>HashMap</code> itself isn't thread-safe. Concurrent puts can corrupt its internal structure, not just its contents."
        ] },
        { type: "lab", id: "checkThenAct", caption: "Raise the number of buyers and the time between check and write, and watch double bookings climb. Then compare the synchronized and putIfAbsent versions." }
      ]
    },
    {
      id: "critical-sections",
      title: "Critical sections and synchronized",
      kicker: "The first fix",
      blocks: [
        { type: "idea", html: `<p>Find the <strong>critical section</strong>, the code that reads and writes the shared state and must run without interference, and make sure only one thread runs it at a time. In Java the simplest tool is <code>synchronized</code>.</p>` },
        { type: "code", lang: "java", title: "Coarse-grained and correct", code: `class Show {
    private final Map<String, String> seatOwner = new HashMap<>();
    private int seatsSold = 0;

    synchronized boolean book(String seatId, String userId) {
        if (seatOwner.containsKey(seatId)) return false;
        seatOwner.put(seatId, userId);
        seatsSold++;
        return true;
    }

    synchronized int seatsSold() { return seatsSold; }   // reads need the lock too
}` },
        { type: "keypoints", items: [
          "<strong>Guard every access</strong> to the state with the same lock, including reads. An unsynchronized read can see stale or half-updated data.",
          "<code>synchronized</code> is <strong>reentrant</strong>: a thread holding the lock can call another synchronized method on the same object.",
          "The lock is released automatically when the block exits, even by exception.",
          "<strong>Keep the section small.</strong> Never call payment APIs, I/O or unknown callbacks while holding a lock: every other booking waits behind them."
        ] },
        { type: "callout", tone: "mistake", html: `<p>Synchronizing on the wrong object. Two methods that touch the same map must lock the same monitor. <code>synchronized</code> on an instance method locks <code>this</code>; a <code>static synchronized</code> method locks the <code>Class</code> object, a different lock entirely.</p>` }
      ]
    },
    {
      id: "atomics-and-collections",
      title: "Atomics and concurrent collections",
      kicker: "Lock-free options",
      blocks: [
        { type: "text", html: `<p>For a single variable, or a map where each key is independent, you often don't need a lock you manage yourself. <strong>Atomic classes</strong> use the CPU's compare-and-set (CAS) instruction: "set this to <em>new</em> only if it still equals <em>expected</em>". A failed CAS means another thread got there first, so you re-read and retry. Nothing blocks.</p>` },
        { type: "code", lang: "java", title: "One atomic step per seat", code: `enum SeatState { FREE, HELD, BOOKED }

class Seat {
    private final AtomicReference<SeatState> state = new AtomicReference<>(SeatState.FREE);

    boolean hold()    { return state.compareAndSet(SeatState.FREE, SeatState.HELD); }
    boolean confirm() { return state.compareAndSet(SeatState.HELD, SeatState.BOOKED); }
    void release()    { state.compareAndSet(SeatState.HELD, SeatState.FREE); }
}

class Show {
    private final ConcurrentHashMap<String, String> seatOwner = new ConcurrentHashMap<>();
    private final LongAdder seatsSold = new LongAdder();

    boolean book(String seatId, String userId) {
        if (seatOwner.putIfAbsent(seatId, userId) != null) return false;  // atomic check-and-put
        seatsSold.increment();
        return true;
    }
}` },
        { type: "table", title: "ConcurrentHashMap's atomic compound methods", headers: ["Method", "Does atomically", "Typical use"], rows: [
          ["<code>putIfAbsent(k, v)</code>", "Insert only if missing; returns the existing value or null", "Claim a seat, register a unique name"],
          ["<code>computeIfAbsent(k, fn)</code>", "Create the value only if missing, at most once per key", "Lazily create a per-user rate limiter or lock"],
          ["<code>compute(k, fn)</code>", "Replace the value with fn(k, old)", "Update a record based on its current state"],
          ["<code>merge(k, v, fn)</code>", "Insert v, or combine with the old value", "Word counts, stock adjustments"],
          ["<code>replace(k, old, new)</code>", "CAS on one entry", "Optimistic update of one key"]
        ] },
        { type: "callout", tone: "warning", html: `<p>"Each call is thread-safe" is not "my sequence of calls is thread-safe". <code>if (!map.containsKey(k)) map.put(k, v)</code> on a <code>ConcurrentHashMap</code> is still a check-then-act race. Use the single atomic method. Keep the lambdas passed to <code>compute</code> short and free of side effects: they run while that entry is locked.</p>` },
        { type: "compare", items: [
          { title: "volatile", tone: "warn", html: `<p>Visibility only. Right for a stop flag or a reference to an immutable object that is replaced wholesale. <code>volatile int count; count++</code> still loses updates.</p>` },
          { title: "AtomicInteger / AtomicReference", tone: "ok", html: `<p>Visibility plus atomic read-modify-write on one variable. For several fields that must change together, put them in one immutable object behind an <code>AtomicReference</code>, or use a lock.</p>` },
          { title: "LongAdder", tone: "ok", html: `<p>A counter split across cells to avoid contention. Faster than <code>AtomicLong</code> when many threads increment; reading the sum is slightly more expensive and not an atomic snapshot.</p>` }
        ] }
      ]
    },
    {
      id: "explicit-locks",
      title: "Explicit locks and lock granularity",
      kicker: "More control",
      blocks: [
        { type: "text", html: `<p><code>ReentrantLock</code> does what <code>synchronized</code> does, plus things it can't: give up after a timeout, be interrupted while waiting, hand the lock out fairly, and keep several wait conditions on one lock. The price is that you must unlock yourself, always in <code>finally</code>.</p>` },
        { type: "code", lang: "java", title: "Give up instead of waiting forever", code: `private final ReentrantLock lock = new ReentrantLock();

boolean bookWithin(String seatId, String userId, Duration budget) throws InterruptedException {
    if (!lock.tryLock(budget.toMillis(), TimeUnit.MILLISECONDS)) {
        return false;                       // busy: tell the user to retry
    }
    try {
        return doBook(seatId, userId);
    } finally {
        lock.unlock();
    }
}` },
        { type: "text", html: `<p><strong>Granularity</strong> is the main design decision once you have locks. One lock for the whole show is simple and obviously correct, but bookings for seats on opposite sides of the hall wait for each other. One lock per seat lets them run in parallel, but a booking for several seats now needs several locks.</p>` },
        { type: "tradeoffs", title: "Coarse vs fine-grained locking", prosLabel: "Coarse (one lock)", consLabel: "Fine (lock per entity)", pros: [
          "Easy to reason about: every invariant is protected by one lock",
          "No deadlock possible with a single lock",
          "Good enough unless measurements show contention"
        ], cons: [
          "More parallelism: unrelated entities don't contend",
          "More locks to create, store and get right",
          "Operations spanning entities need a lock order, or they deadlock"
        ] },
        { type: "code", lang: "java", title: "Booking several seats with per-seat locks", code: `boolean bookAll(List<Seat> seats, String userId) {
    List<Seat> ordered = seats.stream().sorted(Comparator.comparing(Seat::id)).toList();
    ordered.forEach(s -> s.lock().lock());              // always in id order
    try {
        if (ordered.stream().anyMatch(s -> !s.isFree())) return false;   // all or nothing
        ordered.forEach(s -> s.bookFor(userId));
        return true;
    } finally {
        ordered.reversed().forEach(s -> s.lock().unlock());
    }
}` },
        { type: "callout", tone: "tip", html: `<p><code>ReentrantReadWriteLock</code> lets many readers in at once and writers alone. It only pays off when reads are frequent, writes are rare <em>and</em> reads hold the lock long enough to matter. For a quick map lookup a plain lock or a <code>ConcurrentHashMap</code> is usually faster.</p>` }
      ]
    },
    {
      id: "avoid-sharing",
      title: "Avoid sharing: immutability and confinement",
      kicker: "Often the best fix",
      blocks: [
        { type: "text", html: `<p>The cheapest lock is the one you don't need. Two designs remove the problem rather than managing it.</p>` },
        { type: "code", lang: "java", title: "Immutable snapshot, swapped atomically", code: `record PriceTable(Map<String, Long> prices) {
    PriceTable { prices = Map.copyOf(prices); }          // defensive, unmodifiable copy
    PriceTable with(String sku, long cents) {
        var m = new HashMap<>(prices); m.put(sku, cents); return new PriceTable(m);
    }
}

class PriceService {
    private final AtomicReference<PriceTable> table = new AtomicReference<>(new PriceTable(Map.of()));
    long price(String sku) { return table.get().prices().getOrDefault(sku, 0L); }   // no lock
    void update(String sku, long cents) { table.updateAndGet(t -> t.with(sku, cents)); }
}` },
        { type: "code", lang: "java", title: "Confinement: one thread owns the elevator controller", code: `class ElevatorController {
    private final ExecutorService loop = Executors.newSingleThreadExecutor();
    private final Deque<Integer> stops = new ArrayDeque<>();   // touched only by 'loop'

    void request(int floor) { loop.execute(() -> addStop(floor)); }   // any thread may call
    private void addStop(int floor) { if (!stops.contains(floor)) stops.add(floor); }
}` },
        { type: "callout", tone: "insight", html: `<p>Confinement turns a correctness problem into a coordination problem: callers hand messages to the owning thread through a queue. It is the actor model in miniature and an excellent answer for stateful controllers like elevators or game engines, where everything happens in a sequence anyway.</p>` }
      ]
    },
    {
      id: "optimistic",
      title: "Optimistic vs pessimistic concurrency",
      kicker: "Two philosophies",
      blocks: [
        { type: "text", html: `<p><strong>Pessimistic</strong> concurrency assumes conflicts and locks before touching data. <strong>Optimistic</strong> concurrency assumes conflicts are rare: read the data with a version, do the work without a lock, and commit only if the version hasn't changed. If it has, re-read and retry.</p>` },
        { type: "code", lang: "java", title: "Optimistic update with a version (in memory and in SQL)", code: `record Stock(long version, int available) {}

boolean reserve(AtomicReference<Stock> ref, int qty) {
    while (true) {
        Stock cur = ref.get();
        if (cur.available() < qty) return false;
        Stock next = new Stock(cur.version() + 1, cur.available() - qty);
        if (ref.compareAndSet(cur, next)) return true;     // else someone else won: retry
    }
}

// Same idea against a database:
// UPDATE stock SET available = available - ?, version = version + 1
//  WHERE sku = ? AND version = ? AND available >= ?
// 0 rows updated means a conflict (or not enough stock): re-read and retry` },
        { type: "table", headers: ["", "Pessimistic (lock first)", "Optimistic (check on commit)"], rows: [
          ["Best when", "Conflicts are common (one hot item)", "Conflicts are rare (many independent items)"],
          ["Cost of a conflict", "Waiting", "Wasted work and a retry"],
          ["Failure mode", "Contention, deadlock", "Retry storms under heavy contention"],
          ["Examples", "synchronized, ReentrantLock, SELECT ... FOR UPDATE", "CAS loops, version columns, ETags"]
        ] }
      ]
    },
    {
      id: "deadlock",
      title: "Deadlock and how to prevent it",
      kicker: "The hazard",
      blocks: [
        { type: "problem", html: `<p>Thread 1 transfers from account A to B: it locks A, then waits for B. Thread 2 transfers from B to A: it locks B, then waits for A. Each holds what the other needs. Neither will ever proceed.</p>` },
        { type: "lab", id: "deadlockSim", caption: "Run the naive version until you see a cycle in the wait-for graph, then try lock ordering and tryLock with back-off." },
        { type: "table", title: "All four conditions must hold at once", headers: ["Condition", "Break it with"], rows: [
          ["Mutual exclusion: a lock has one holder", "Lock-free structures or immutable data (rarely practical for everything)"],
          ["Hold and wait: keep one lock while waiting for another", "Acquire all locks at once, or tryLock and release everything on failure"],
          ["No preemption: locks can't be taken away", "Timeouts, so a thread gives up its own locks"],
          ["Circular wait: a cycle of waiters", "<strong>A global lock order</strong>: the standard answer"]
        ] },
        { type: "code", lang: "java", title: "Lock ordering for transfers", code: `void transfer(Account from, Account to, long amount) {
    if (from.id() == to.id()) return;
    Account first  = from.id() < to.id() ? from : to;
    Account second = first == from ? to : from;
    first.lock().lock();
    try {
        second.lock().lock();
        try {
            if (from.balance() < amount) throw new InsufficientFundsException();
            from.debit(amount);
            to.credit(amount);
        } finally { second.lock().unlock(); }
    } finally { first.lock().unlock(); }
}` },
        { type: "callout", tone: "interview", html: `<p>Expect the deadlock question the moment you add a second lock. A complete answer names the cycle, gives the fix (sort by id), mentions <code>tryLock</code> with timeout and random back-off as the alternative when no natural order exists, and notes that back-off without randomness can <strong>livelock</strong>.</p>` },
        { type: "quiz", q: "An inventory service locks each warehouse when moving stock between two of them. Transfers sometimes hang forever under load. What is the most direct fix?", options: [
          "Make the warehouse lock fair",
          "Always lock the two warehouses in a fixed order, such as by warehouse id",
          "Mark the stock fields volatile",
          "Use a ReadWriteLock instead"
        ], answer: 1, explain: `<p>The hang is a deadlock from a circular wait: A-to-B and B-to-A transfers each hold one warehouse and wait for the other. Acquiring locks in a single global order makes the cycle impossible. Fairness, volatile and read-write locks don't remove the cycle.</p>` }
      ]
    }
  ],
  takeaways: [
    "Look for check-then-act and read-modify-write sequences on shared state; those are the critical sections.",
    "<code>synchronized</code> around the whole sequence, with reads guarded too, is the simple correct default.",
    "Atomics and <code>ConcurrentHashMap</code>'s compound methods replace locks for single variables and per-key updates.",
    "<code>ReentrantLock</code> adds timeouts, interruptibility, fairness and conditions; always unlock in <code>finally</code>.",
    "Start coarse; go finer only for measured contention, and then acquire multiple locks in a global order.",
    "Immutability and confinement remove the problem instead of managing it.",
    "Optimistic versions beat locks when conflicts are rare; locks beat retries when one item is hot."
  ],
  furtherReading: [
    { title: "Hello Interview: Correctness", url: "https://www.hellointerview.com/learn/low-level-design/concurrency/correctness", note: "The section these notes follow." },
    { title: "java.util.concurrent package summary (Java 21)", url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/package-summary.html" },
    { title: "Java Concurrency in Practice, chapters 2 to 5 and 10", note: "Thread safety, sharing objects, building blocks and avoiding liveness hazards." }
  ]
};
