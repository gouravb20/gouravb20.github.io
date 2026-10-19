// Deep dive: Chapter 1, Concurrency introduction. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch1 = {
  hook: `<p>Most low-level design prompts describe one user: "a user parks a car", "a user books a seat". Real systems serve thousands at once, and interviewers often add "now make it thread-safe" halfway through. This chapter covers what changes when several threads share your objects, how to spot where the risk is, and how to sort any concurrency question into one of three families so you know which tools to use.</p>`,
  sections: [
    {
      id: "why-it-comes-up",
      title: "Why concurrency shows up in LLD interviews",
      kicker: "Motivation",
      blocks: [
        { type: "text", html: `<p>An LLD answer is a set of classes with state and methods. As soon as two requests can call those methods at the same time, the state can be read and written by two threads at once. A design that is perfect for one caller can double-book seats, oversell stock or lose log lines with two.</p><p>Interviewers bring concurrency up for three reasons: it tests whether you notice hidden shared state, whether you know the standard tools, and whether you can keep a design simple while making it safe.</p>` },
        { type: "table", title: "Where it hides in classic problems", headers: ["Problem", "Shared mutable state", "What goes wrong"], rows: [
          ["Movie ticket booking", "Seat status per show", "Two users book the same seat"],
          ["Parking lot", "Free spots per floor and type", "Two cars assigned one spot"],
          ["Inventory management", "Stock count per item", "Stock goes negative, overselling"],
          ["Rate limiter", "Tokens or counters per client", "More requests let through than the limit"],
          ["Logging service", "Buffer of pending log lines", "Lines lost or interleaved, callers blocked on I/O"],
          ["Elevator system", "Request queue, car positions", "Two cars sent to one call, requests dropped"]
        ] },
        { type: "callout", tone: "interview", html: `<p>Bring it up yourself before you're asked. One sentence is enough: "Several users can book at once, so seat booking has to be atomic; I'll come back to how once the classes are in place."</p>` }
      ]
    },
    {
      id: "threads-and-memory",
      title: "Threads share the heap, not the stack",
      kicker: "The model",
      blocks: [
        { type: "text", html: `<p>A Java process runs many threads. Each thread has its own <strong>stack</strong>: local variables and method parameters live there and no other thread can see them. All threads share the <strong>heap</strong>: every object, every instance field, every static field.</p>` },
        { type: "diagram", title: "What each thread can see", caption: "Locals are private to a thread. Anything reachable from a shared reference, such as a singleton service or a static field, can be read and written by every thread.", svg: `<svg viewBox="0 0 600 250" role="img" aria-label="Two thread stacks pointing into a shared heap">
<rect x="20" y="20" width="160" height="210" rx="10" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="100" y="44" text-anchor="middle" font-size="14" font-weight="700" style="fill: var(--dg-ink)">Thread 1 stack</text>
<rect x="40" y="62" width="120" height="30" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="100" y="82" text-anchor="middle" font-size="12" style="fill: var(--dg-ink)">int seatNo = 7</text>
<rect x="40" y="102" width="120" height="30" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="100" y="122" text-anchor="middle" font-size="12" style="fill: var(--dg-ink)">ref show</text>
<rect x="420" y="20" width="160" height="210" rx="10" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="500" y="44" text-anchor="middle" font-size="14" font-weight="700" style="fill: var(--dg-ink)">Thread 2 stack</text>
<rect x="440" y="62" width="120" height="30" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="500" y="82" text-anchor="middle" font-size="12" style="fill: var(--dg-ink)">int seatNo = 7</text>
<rect x="440" y="102" width="120" height="30" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="500" y="122" text-anchor="middle" font-size="12" style="fill: var(--dg-ink)">ref show</text>
<rect x="215" y="60" width="170" height="150" rx="10" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="300" y="84" text-anchor="middle" font-size="14" font-weight="700" style="fill: var(--dg-ink)">Heap (shared)</text>
<rect x="235" y="100" width="130" height="90" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="300" y="122" text-anchor="middle" font-size="12" font-weight="700" style="fill: var(--dg-ink)">Show object</text>
<text x="300" y="144" text-anchor="middle" font-size="12" style="fill: var(--dg-ink)">seats[7] = FREE</text>
<text x="300" y="166" text-anchor="middle" font-size="12" style="fill: var(--dg-bad)">both threads write here</text>
<line x1="160" y1="117" x2="232" y2="130" stroke-width="2" style="stroke: var(--dg-1)"/>
<line x1="440" y1="117" x2="368" y2="130" stroke-width="2" style="stroke: var(--dg-2)"/>
</svg>` },
        { type: "keypoints", items: [
          "Each thread has its own copy of a local variable. Two threads calling <code>book(7)</code> have two separate <code>seatNo</code>s.",
          "An object reachable through a shared reference is shared, even if every reference to it is a local variable.",
          "<code>static</code> fields, singletons, caches and registries are the usual suspects."
        ] }
      ]
    },
    {
      id: "shared-mutable-state",
      title: "The root cause: shared mutable state",
      kicker: "The key idea",
      blocks: [
        { type: "idea", html: `<p>A concurrency bug needs data that is <strong>shared</strong> (reachable by more than one thread) <strong>and</strong> <strong>mutable</strong> (changed after creation). Remove either property and the bug can't happen. Every tool in this course either removes one of the two or controls access when both are present.</p>` },
        { type: "compare", title: "Three ways to make state safe", items: [
          { title: "Don't share it", tone: "ok", html: `<p>Keep the data on one thread: locals, a per-request object, a <code>ThreadLocal</code>, or a single-thread executor that owns it. Nothing to synchronize.</p>` },
          { title: "Don't mutate it", tone: "ok", html: `<p>Make the object immutable (final fields, a <code>record</code>). Share it freely; to "change" it, build a new one and swap a reference.</p>` },
          { title: "Synchronize access", tone: "info", html: `<p>When state must be shared and mutable, control access with locks, atomic variables or concurrent collections. This is where the rest of the course lives.</p>` }
        ] },
        { type: "code", lang: "java", title: "The same counter, three ways", code: `// 1. Not shared: each request counts its own items
int countItems(List<Item> items) { int n = 0; for (Item i : items) n++; return n; }

// 2. Not mutated: an immutable value, replaced instead of changed
record Stats(long hits, long misses) {
    Stats withHit() { return new Stats(hits + 1, misses); }
}

// 3. Shared and mutated, so access is synchronized
final class HitCounter {
    private final AtomicLong hits = new AtomicLong();
    void hit() { hits.incrementAndGet(); }
    long hits() { return hits.get(); }
}` }
      ]
    },
    {
      id: "race-conditions",
      title: "Race conditions and interleavings",
      kicker: "What breaks",
      blocks: [
        { type: "text", html: `<p>The scheduler can pause a thread between any two machine-level steps and run another thread. An <strong>interleaving</strong> is one possible ordering of the steps of all threads. A <strong>race condition</strong> exists when some interleavings give a wrong result.</p><p><code>count++</code> looks like one step but is three: read <code>count</code> into a register, add one, write it back. If two threads both read 5 before either writes, both write 6, and one increment disappears.</p>` },
        { type: "lab", id: "raceInterleaving", caption: "Start with the plain int and step through a run where the final value is wrong. Then switch to synchronized and AtomicInteger and check that no schedule loses an update." },
        { type: "steps", title: "The two shapes to look for", items: [
          "<strong>Read-modify-write</strong>: read a value, compute from it, write the result. Counters, balances, stock levels.",
          "<strong>Check-then-act</strong>: test a condition, then act on it assuming it still holds. \"If the seat is free, book it.\" \"If the key is missing, create it.\""
        ] },
        { type: "callout", tone: "warning", html: `<p>Race conditions survive testing because the bad interleaving is rare. A booking method can pass a million single-threaded tests and still double-book on launch day. Reason about all interleavings, not the likely one.</p>` }
      ]
    },
    {
      id: "visibility",
      title: "Visibility and the Java memory model",
      kicker: "The subtle part",
      blocks: [
        { type: "text", html: `<p>There is a second, less obvious problem. CPUs cache values per core and compilers reorder instructions, so a write by one thread may not be seen by another thread for a long time, or ever, unless something forces it. That is a <strong>visibility</strong> problem, and it is separate from atomicity.</p>` },
        { type: "code", lang: "java", title: "A worker that may never stop", code: `class Worker implements Runnable {
    private boolean running = true;          // BUG: not volatile

    public void run() {
        while (running) { doWork(); }        // may read a cached 'true' forever
    }
    public void stop() { running = false; }  // called from another thread
}

// Fix: private volatile boolean running = true;` },
        { type: "text", html: `<p>The Java memory model defines <strong>happens-before</strong> edges that guarantee visibility. The ones you need:</p>` },
        { type: "list", items: [
          "Releasing a lock happens-before any later acquisition of the same lock. Everything written inside a <code>synchronized</code> block is visible to the next thread that enters a block on the same lock.",
          "A write to a <code>volatile</code> field happens-before every later read of that field.",
          "<code>Thread.start()</code> happens-before anything the started thread does; everything a thread does happens-before another thread returns from <code>join()</code> on it.",
          "Completing a task submitted to an executor, or putting an item on a <code>BlockingQueue</code>, happens-before the code that retrieves the result or item."
        ] },
        { type: "callout", tone: "tip", html: `<p>The sentence to say in an interview: "Locks give me both atomicity and visibility; <code>volatile</code> gives visibility only, so I use it for flags, not counters."</p>` }
      ]
    },
    {
      id: "running-work",
      title: "Running work: threads, executors and virtual threads",
      kicker: "The tools",
      blocks: [
        { type: "text", html: `<p>Creating a <code>new Thread</code> per task is fine for a demo and wrong for a service: threads are expensive, and an unbounded number of them will exhaust memory. Submit tasks to an <code>ExecutorService</code> instead.</p>` },
        { type: "code", lang: "java", title: "Executors in Java 21", code: `// A fixed pool for CPU-bound work
ExecutorService cpu = Executors.newFixedThreadPool(Runtime.getRuntime().availableProcessors());
Future<Report> f = cpu.submit(() -> buildReport(data));
Report report = f.get(2, TimeUnit.SECONDS);

// One virtual thread per task for blocking I/O (Java 21+)
try (ExecutorService io = Executors.newVirtualThreadPerTaskExecutor()) {
    for (Order o : orders) io.submit(() -> notifyCustomer(o));
}   // close() waits for submitted tasks to finish` },
        { type: "tradeoffs", title: "Platform threads vs virtual threads", prosLabel: "Virtual threads give you", consLabel: "They don't change", pros: [
          "Cheap blocking: millions of threads that mostly wait on I/O",
          "Simple thread-per-request code instead of callback chains",
          "No pool-sizing guesswork for I/O-bound work"
        ], cons: [
          "The need to protect shared mutable state",
          "Deadlocks, races and visibility rules",
          "Limits on scarce downstream resources: you still need a semaphore or pool in front of a database"
        ] },
        { type: "callout", tone: "modern", html: `<p>Virtual threads became a final feature in Java 21 (JEP 444). In Java 21 to 23, blocking while holding a <code>synchronized</code> monitor pins the virtual thread to its carrier thread; JDK 24 (JEP 491) removed most of that pinning. If asked, mention <code>ReentrantLock</code> as the workaround on older versions.</p>` }
      ]
    },
    {
      id: "three-families",
      title: "Three problem families",
      kicker: "The map",
      blocks: [
        { type: "text", html: `<p>Nearly every concurrency question in an LLD interview falls into one of three families. Naming the family tells you which toolbox to open and what follow-up questions to expect.</p>` },
        { type: "compare", items: [
          { title: "Correctness", tone: "bad", html: `<p><strong>Question:</strong> can concurrent callers corrupt state or break an invariant?</p><p><strong>Tools:</strong> immutability, confinement, atomics, concurrent collections, locks, lock ordering, optimistic versions.</p><p><strong>Follow-ups:</strong> granularity, deadlock, contention.</p>` },
          { title: "Coordination", tone: "info", html: `<p><strong>Question:</strong> how do threads hand off work and wait for each other?</p><p><strong>Tools:</strong> blocking queues, executors, futures, latches, barriers, conditions.</p><p><strong>Follow-ups:</strong> ordering, shutdown, lost signals.</p>` },
          { title: "Scarcity", tone: "warn", html: `<p><strong>Question:</strong> how do many callers share a limited resource?</p><p><strong>Tools:</strong> semaphores, pools, bounded executors, rate limiters, bulkheads.</p><p><strong>Follow-ups:</strong> what happens at the limit, fairness, sizing.</p>` }
        ] },
        { type: "steps", title: "A repeatable approach for any concurrency question", items: [
          "<strong>List the shared mutable state.</strong> Name the fields and which threads touch them.",
          "<strong>Classify the problem:</strong> correctness, coordination or scarcity (often more than one).",
          "<strong>Pick the simplest tool that is correct</strong>, and say why it's enough.",
          "<strong>Name the trade-off</strong>: throughput, deadlock risk, retries, fairness, memory.",
          "<strong>Say how you'd test it</strong>: many threads hammering the method, then assert the invariant."
        ] },
        { type: "quiz", q: "A <code>NotificationService</code> singleton keeps a <code>List&lt;Subscriber&gt;</code> that is filled once at startup and never changed afterwards; many threads iterate it to send messages. Does the list need synchronization?", options: [
          "Yes: every shared collection needs a lock",
          "No, as long as it is safely published (for example a final field holding an unmodifiable list) and never modified",
          "Yes, iteration from several threads at once always throws ConcurrentModificationException",
          "Only if more than two threads read it"
        ], answer: 1, explain: `<p>Shared but not mutable is safe. Build the list before the service is shared, store it in a <code>final</code> field (final fields are safely published by the memory model) and wrap it with <code>List.copyOf</code> so nobody can change it. Concurrent reads of an unchanging collection are fine; <code>ConcurrentModificationException</code> comes from modification during iteration.</p>` }
      ]
    }
  ],
  takeaways: [
    "Threads share the heap (objects, fields, statics) and keep locals on their own stacks.",
    "Bugs need shared <em>and</em> mutable state; removing either one removes the bug.",
    "The two race shapes are read-modify-write and check-then-act.",
    "Visibility is a separate problem from atomicity: locks fix both, <code>volatile</code> fixes only visibility.",
    "Use executors rather than raw threads; virtual threads make blocking cheap but don't make shared state safe.",
    "Classify every question as correctness, coordination or scarcity, then pick the simplest correct tool."
  ],
  furtherReading: [
    { title: "Hello Interview: Concurrency introduction", url: "https://www.hellointerview.com/learn/low-level-design/concurrency/intro", note: "The section these notes follow." },
    { title: "Java Language Specification, Chapter 17: Threads and Locks", url: "https://docs.oracle.com/javase/specs/jls/se21/html/jls-17.html", note: "The memory model and happens-before, formally." },
    { title: "JEP 444: Virtual Threads", url: "https://openjdk.org/jeps/444" },
    { title: "Java Concurrency in Practice (Goetz et al.)", note: "Still the best book on the topic; the vocabulary in this chapter comes from it." }
  ]
};
