// Concurrency for low-level design interviews - interactive notes data.
// Original study notes with Java examples. Topic outline follows Hello Interview's low-level design concurrency series:
// https://www.hellointerview.com/learn/low-level-design/concurrency/intro
window.DATA = {
  book: {
    title: `Concurrency for Low-Level Design`,
    subtitle: `What to do when more than one thread touches your objects, in the four steps an interviewer probes: the <strong>foundations</strong> (threads, shared state, visibility), <strong>correctness</strong> (race conditions, locks, atomics, deadlock), <strong>coordination</strong> (threads waiting on each other: queues, conditions, futures, pools) and <strong>scarcity</strong> (limited resources: semaphores, pools, backpressure, rate limits). Every example is Java 21. Topics follow Hello Interview's <a href="https://www.hellointerview.com/learn/low-level-design/concurrency/intro" target="_blank" rel="noopener" style="color:var(--accent)">Concurrency</a> section; the notes and labs are written independently.`,
    storageKey: `lld_concurrency_notes_v1`,
    appId: `lld-concurrency-notes`,
    exportPrefix: `lld-concurrency-progress`,
    pillarsTitle: `Four questions for any concurrent design`,
    takeawaysTitle: `Twenty things to remember`,
    labsIntro: `Each lab simulates threads with a seeded random scheduler, so a run is repeatable and "New random run" gives another interleaving. Real JVM timing differs; read the results as the shape of the problem, not as benchmarks. Labs reset when you leave the tab.`,
    mono: `CX`,
    shortTitle: `Concurrency`,
    tagline: `LLD interview prep`
  },
  parts: {
    1: `Part I &middot; Foundations`,
    2: `Part II &middot; Correctness`,
    3: `Part III &middot; Coordination`,
    4: `Part IV &middot; Scarcity`
  },
  fourQuestions: [
    { cls: `what`, q: `What state is shared and mutable?`, text: `List every field that more than one thread can reach and that changes after construction: a seat map, an inventory count, a cache, a queue. If nothing is shared, or nothing shared ever changes, there is no concurrency problem to solve.`, answer: `Ch 1 (shared state), Ch 2 (immutability and confinement).` },
    { cls: `where`, q: `Which operations must be atomic?`, text: `Find the read-modify-write and check-then-act sequences on that state, then make each one indivisible with the narrowest tool that works: an atomic method, a concurrent collection, or a lock around exactly that sequence.`, answer: `Ch 2: race conditions, locks, atomics, deadlock.` },
    { cls: `when`, q: `Who waits for whom?`, text: `When one thread produces work another consumes, or one step needs the results of several others, the threads must hand off and wait without spinning or losing signals. Reach for a blocking queue, a future or a latch before raw wait and notify.`, answer: `Ch 3: producer-consumer, conditions, futures, pools.` },
    { cls: `how`, q: `What is limited, and what happens at the limit?`, text: `Connections, threads, memory, API quota. Bound each one, then choose what a caller experiences when it runs out: wait, wait with a timeout, get rejected, or slow down. An unbounded queue just moves the failure somewhere harder to see.`, answer: `Ch 4: semaphores, pools, backpressure, rate limiting.` }
  ],
  takeaways: [
    `Concurrency bugs need two ingredients: <strong>shared</strong> state and <strong>mutable</strong> state. Remove either one (confine it to one thread, or make it immutable) and the bug cannot happen.`,
    `<code>count++</code> is three steps: read, add, write. Two threads interleaving those steps lose updates. This <strong>read-modify-write</strong> race is the first thing to look for.`,
    `<strong>Check-then-act</strong> ("if the seat is free, book it") is the other classic race. The check is stale the moment another thread can act between it and your write.`,
    `A <strong>critical section</strong> is the smallest block that must run without interference. Guard every access to the same state with the <strong>same</strong> lock, reads included.`,
    `<code>synchronized</code> is the simple default. Use <code>ReentrantLock</code> when you need <code>tryLock</code> with a timeout, interruptible waits, fairness or several conditions.`,
    `<code>volatile</code> fixes <strong>visibility</strong> (other threads see the latest write) but not <strong>atomicity</strong>. It suits flags and published references, not counters.`,
    `Atomic classes (<code>AtomicInteger</code>, <code>AtomicReference</code>) use <strong>compare-and-set</strong>: try to swap, retry on conflict, never block. Great for single variables, awkward for multi-field invariants.`,
    `<code>ConcurrentHashMap</code> is safe per call, but <code>get</code> then <code>put</code> is still a race. Use its atomic compound methods: <code>putIfAbsent</code>, <code>computeIfAbsent</code>, <code>compute</code>, <code>merge</code>.`,
    `Lock granularity is a trade-off: one coarse lock is easy to get right but serializes everything; per-entity locks (per seat, per account) scale but invite deadlock.`,
    `Deadlock needs four conditions at once; the practical cure is breaking <strong>circular wait</strong> by always acquiring locks in one global order (for example by account id).`,
    `<strong>Optimistic</strong> concurrency (read a version, write only if unchanged, retry otherwise) beats locking when conflicts are rare; <strong>pessimistic</strong> locking wins when they are common.`,
    `Coordination problems are about waiting. The standard shape is <strong>producer-consumer</strong> with a <code>BlockingQueue</code> in the middle: producers <code>put</code>, consumers <code>take</code>, and the queue does the waiting.`,
    `If you write <code>wait</code>/<code>await</code> yourself, always wait <strong>in a while loop</strong> that rechecks the condition, holding the lock, because of spurious wakeups and competing threads.`,
    `<code>CountDownLatch</code> waits for N events once; <code>CyclicBarrier</code> lines N threads up repeatedly; <code>CompletableFuture</code> composes async results without blocking threads.`,
    `Prefer an <code>ExecutorService</code> to raw threads. Size CPU-bound pools near the core count; size I/O-bound pools larger, or use <strong>virtual threads</strong> (Java 21) for many blocking tasks.`,
    `Keep ordering per entity by routing all of one key's work to the same single-threaded lane (hash the key to a lane), instead of locking globally.`,
    `Scarcity problems are about limits. A <code>Semaphore</code> with N permits caps concurrent use of anything: connections, GPU slots, downstream calls.`,
    `Every bounded resource needs a policy at the limit: <strong>block</strong>, <strong>block with timeout</strong>, <strong>reject</strong> (fail fast), or <strong>shed/degrade</strong>. Say which one and why.`,
    `Unbounded queues and pools are hidden memory leaks under load. Bound them, and choose a rejection policy (<code>AbortPolicy</code>, <code>CallerRunsPolicy</code>) deliberately.`,
    `In the interview: name the shared state, pick the simplest correct tool, explain the trade-off, and mention how you would test it. Correct and simple beats clever and lock-free.`
  ],
  chapters: [
    // ------------------------------------------------------------------
    {
      id: `ch1`, part: 1, number: 1,
      source: { title: `Hello Interview: Concurrency Introduction`, url: `https://www.hellointerview.com/learn/low-level-design/concurrency/intro` },
      title: `Introduction: threads, shared state and the three problem families`,
      overview: `Most low-level design problems quietly assume many users at once: two people booking the last seat, several elevators taking requests, a logger called from every request thread. Concurrency questions test whether you notice that and keep the design correct. This chapter sets up the vocabulary: <strong>threads</strong> and what they share, why <strong>shared mutable state</strong> is the root of every bug here, what <strong>visibility</strong> means in the Java memory model, and the three families every concurrency question falls into: <strong>correctness</strong>, <strong>coordination</strong> and <strong>scarcity</strong>.`,
      concepts: [
        { term: `Process vs thread`, def: `A <strong>process</strong> has its own memory space. A <strong>thread</strong> is a path of execution inside a process; all threads of a process share its heap (objects, static fields) but each has its own stack (local variables, call frames).`, why: `Sharing the heap is what makes threads cheap to communicate with, and exactly what makes them dangerous.`, ex: `Two request-handling threads in one JVM can both see the same <code>ParkingLot</code> object.` },
        { term: `Concurrency vs parallelism`, def: `<strong>Concurrency</strong> is structuring a program as tasks whose lifetimes overlap. <strong>Parallelism</strong> is tasks actually running at the same instant on different cores. A single core can be concurrent (by switching) but not parallel.`, why: `Race conditions happen with concurrency alone: a thread can be paused between any two instructions, even on one core.` },
        { term: `Shared mutable state`, def: `Data that more than one thread can reach <em>and</em> that changes after it is created. It is the precondition for every race condition, visibility bug and lost update.`, why: `The first move in any concurrency answer is to list the shared mutable state. If the list is empty, you are done.`, ex: `Seat availability in a booking system, the token count in a rate limiter, an elevator's request queue.` },
        { term: `Thread safety`, def: `A class is thread-safe if it behaves correctly when used from many threads at once, with no extra synchronization by the callers.`, why: `In interviews, say which classes you make thread-safe and which you assume are used by one thread only. Both are valid choices when stated.` },
        { term: `Race condition`, def: `The result depends on the timing of threads. The two common shapes are <strong>read-modify-write</strong> (<code>count++</code>) and <strong>check-then-act</strong> (<code>if (free) book()</code>).`, why: `Races pass every single-threaded test and fail rarely in production, which is why interviewers ask about them.`, demo: `raceInterleaving` },
        { term: `Interleaving`, def: `The order in which the scheduler happens to run the steps of different threads. Any interleaving that the language allows can happen, including the unlucky ones.`, why: `Reason about correctness over all interleavings, not the likely one.`, demo: `raceInterleaving` },
        { term: `Atomicity`, def: `An operation is atomic if other threads see it either not started or fully done, never half-way.`, why: `Most fixes are about making a multi-step operation atomic: with a lock, an atomic class or an atomic collection method.` },
        { term: `Visibility`, def: `Without synchronization, one thread's write may not be seen by another thread for an arbitrarily long time, because of CPU caches, registers and compiler reordering.`, why: `A loop waiting on a plain <code>boolean running</code> flag can spin forever. <code>volatile</code>, locks and atomics all fix visibility.` },
        { term: `Happens-before (Java memory model)`, def: `The rule set that says when one thread's writes are guaranteed visible to another: releasing a lock happens-before the next acquire of that lock; a <code>volatile</code> write happens-before later reads of it; <code>Thread.start()</code> and <code>join()</code> also create edges.`, why: `You don't need to recite it, but "the lock gives both atomicity and visibility" is the sentence to have ready.` },
        { term: `Thread lifecycle`, def: `NEW, RUNNABLE, BLOCKED (waiting for a monitor), WAITING / TIMED_WAITING (in <code>wait</code>, <code>join</code>, <code>park</code>, <code>sleep</code>), TERMINATED.`, why: `Thread dumps report these states; "everything is BLOCKED on the same lock" is how contention and deadlock show up.` },
        { term: `ExecutorService`, def: `A pool of worker threads that runs submitted <code>Runnable</code> or <code>Callable</code> tasks and returns <code>Future</code>s. You manage tasks, not threads.`, why: `Interviewers expect an executor rather than <code>new Thread()</code> per request: it bounds thread count and reuses threads.` },
        { term: `Virtual threads (Java 21)`, def: `Lightweight threads scheduled by the JVM onto a few carrier OS threads. Blocking a virtual thread is cheap, so one thread per task is practical even for millions of tasks.`, why: `They change how you size pools for blocking I/O, but not the rules for shared state: races and deadlocks are exactly the same.` },
        { term: `The three problem families`, def: `<strong>Correctness</strong>: shared state must not be corrupted. <strong>Coordination</strong>: threads must hand off work and wait for each other. <strong>Scarcity</strong>: a limited resource must be shared without overload.`, why: `Classifying the question tells you the toolbox: locks and atomics, queues and futures, or semaphores and bounded pools.` }
      ],
      cheatsheet: [
        { title: `Which family is this question in?`, type: `table`, headers: [`Prompt says`, `Family`, `First tools to reach for`], rows: [
          [`"Two users book the same seat", "balance goes negative", "counter is wrong"`, `Correctness`, `synchronized / ReentrantLock, AtomicInteger, ConcurrentHashMap atomic methods`],
          [`"Process requests in the background", "notify subscribers", "wait for all results"`, `Coordination`, `BlockingQueue, ExecutorService, CompletableFuture, CountDownLatch`],
          [`"Only 10 DB connections", "limit calls to the API", "don't overload the printer"`, `Scarcity`, `Semaphore, bounded pool, bounded queue + rejection policy, token bucket`]
        ] },
        { title: `Shared or not?`, type: `table`, headers: [`Where the data lives`, `Shared between threads?`], rows: [
          [`Local variable, method parameter (primitive)`, `No (each thread has its own stack)`],
          [`Object created and used inside one method, never stored`, `No (confined)`],
          [`Instance field of an object reachable by several threads`, `Yes`],
          [`Static field`, `Yes`],
          [`Final field of an immutable object`, `Shared but safe (never changes)`]
        ] },
        { title: `A concurrency answer in five sentences`, type: `list`, items: [
          `"The shared mutable state is X (and Y)."`,
          `"The operations that must be atomic are A and B."`,
          `"I'll protect them with [tool], because [reason: simplest / contention / need timeout]."`,
          `"The trade-off is [throughput / deadlock risk / retries], which is fine here because ..."`,
          `"To test it I'd run N threads hammering the method and assert the invariant (no double booking, count matches)."`
        ] }
      ],
      interview: [
        { q: `How do you decide whether a class in your design needs to be thread-safe?`, a: `Ask whether an instance is reachable from more than one thread and whether any of its state changes after construction. A singleton service, a shared cache or an aggregate like a parking lot that many request threads use needs to be thread-safe. A value object, a request DTO or an object created and used inside one request does not. State the assumption explicitly either way.`, diff: `easy` },
        { q: `Why is count++ not thread-safe even though it is one line?`, a: `It compiles to read the field, add one, write the field. Two threads can both read 5, both compute 6 and both write 6, so one increment is lost. Fix it with synchronized around the increment, an AtomicInteger.incrementAndGet() or a LongAdder for heavily contended counters.`, diff: `easy` },
        { q: `What is the difference between atomicity and visibility?`, a: `Atomicity means a compound operation can't be observed half-done or interleaved with another thread's. Visibility means a write made by one thread is guaranteed to be seen by another. volatile gives visibility only; locks and atomic classes give both. A volatile counter still loses increments.`, diff: `medium` },
        { q: `Concurrency and parallelism: which one causes race conditions?`, a: `Concurrency is enough. Even on a single core the scheduler can pause a thread between the read and the write of count++, run another thread, then resume. Parallelism makes races more frequent and adds memory-visibility effects from per-core caches, but it isn't required.`, diff: `medium` },
        { q: `When would you use virtual threads, and do they remove the need for locks?`, a: `Use them when you have many tasks that spend most of their time blocked on I/O, such as one task per request calling databases and services; they make thread-per-task cheap. They don't change the memory model: shared mutable state still needs locks, atomics or confinement, and deadlocks still happen.`, diff: `medium` },
        { q: `Give an example of each concurrency problem family in a classic LLD problem.`, a: `Correctness: in a movie ticket system, two users must not book the same seat. Coordination: in a logging service, request threads hand log entries to a background writer through a queue. Scarcity: in a rate limiter or connection pool, at most N calls may proceed at once and the rest wait or are rejected.`, diff: `easy` }
      ],
      labs: [`raceInterleaving`]
    },
    // ------------------------------------------------------------------
    {
      id: `ch2`, part: 2, number: 2,
      source: { title: `Hello Interview: Correctness`, url: `https://www.hellointerview.com/learn/low-level-design/concurrency/correctness` },
      title: `Correctness: race conditions, locks, atomics and deadlock`,
      overview: `Correctness problems ask one thing: can concurrent callers corrupt shared state or break an invariant? The bugs come in two shapes, <strong>read-modify-write</strong> and <strong>check-then-act</strong>, and the fixes form a ladder from simplest to most scalable: <strong>avoid sharing</strong> (immutability, confinement), <strong>atomic primitives</strong> and concurrent collections, <strong>locks</strong> of the right granularity, and <strong>optimistic</strong> version checks. Finer locks bring the main hazard of this chapter, <strong>deadlock</strong>, which you prevent by acquiring locks in a fixed order.`,
      concepts: [
        { term: `Read-modify-write race`, def: `A thread reads a value, computes a new one and writes it back. If another thread writes in between, one of the updates is lost.`, why: `Counters, balances, stock levels and token counts all have this shape.`, ex: `<code>balance = balance - amount</code> run by two withdrawals at once.`, demo: `raceInterleaving` },
        { term: `Check-then-act race`, def: `A thread checks a condition and then acts on it, but the condition can change between the check and the act.`, why: `It causes double bookings, overselling and duplicate entries in "create if missing" code.`, ex: `<code>if (!seats.containsKey(id)) seats.put(id, user);</code>`, demo: `checkThenAct` },
        { term: `Critical section`, def: `The code that reads and writes shared state and must therefore run by one thread at a time. Keep it as small as possible, and never call slow or unknown code (I/O, callbacks) inside it.`, why: `A tight critical section is both safer (less to reason about) and faster (less waiting).` },
        { term: `synchronized`, def: `Java's built-in lock. A <code>synchronized</code> method or block acquires the object's intrinsic monitor, gives mutual exclusion and visibility, is <strong>reentrant</strong>, and releases automatically, even on exceptions.`, why: `The simplest correct option and the right default in an interview.`, ex: `<code>public synchronized boolean book(String seat, String user)</code>` },
        { term: `ReentrantLock`, def: `An explicit lock from <code>java.util.concurrent.locks</code>. Adds <code>tryLock()</code> and <code>tryLock(timeout)</code>, <code>lockInterruptibly()</code>, an optional fairness policy and multiple <code>Condition</code>s. You must <code>unlock()</code> in a <code>finally</code> block.`, why: `Use it when you need to give up instead of waiting forever (deadlock avoidance, latency budgets) or need separate wait conditions.` },
        { term: `ReadWriteLock`, def: `<code>ReentrantReadWriteLock</code> lets many readers hold the read lock together while a writer needs exclusive access. A read lock can't be upgraded to a write lock (that deadlocks); a write lock can be downgraded.`, why: `It pays off when reads vastly outnumber writes and reads take long enough to matter, such as a config or catalog lookup.` },
        { term: `volatile`, def: `Marks a field so every read sees the latest write by any thread and writes aren't reordered around it. It does not make compound operations atomic.`, why: `Right for a stop flag, a status field or publishing a fully-built immutable object; wrong for counters.` },
        { term: `Atomic variables and CAS`, def: `<code>AtomicInteger</code>, <code>AtomicLong</code> and <code>AtomicReference</code> use hardware <strong>compare-and-set</strong>: "set to new if it still equals expected". Methods such as <code>incrementAndGet</code>, <code>updateAndGet</code> and <code>compareAndSet</code> retry on conflict instead of blocking.`, why: `Lock-free and fast for one variable. When an invariant spans several fields, wrap them in one immutable object behind an <code>AtomicReference</code> or use a lock.`, demo: `raceInterleaving` },
        { term: `LongAdder`, def: `A counter that spreads increments over several internal cells and sums them on read.`, why: `Much faster than <code>AtomicLong</code> under heavy contention (metrics, hit counts) when you rarely need an exact read at a precise instant.` },
        { term: `Concurrent collections`, def: `<code>ConcurrentHashMap</code>, <code>ConcurrentLinkedQueue</code>, <code>CopyOnWriteArrayList</code>, <code>ConcurrentSkipListMap</code>. Each call is thread-safe, and <code>ConcurrentHashMap</code> offers atomic compound methods: <code>putIfAbsent</code>, <code>computeIfAbsent</code>, <code>compute</code>, <code>merge</code>.`, why: `"Each call is safe" is not "my sequence of calls is safe". <code>get</code> then <code>put</code> is still check-then-act; use the atomic method instead.`, demo: `checkThenAct` },
        { term: `Immutability`, def: `An object whose state can't change after construction: final fields, no setters, defensive copies of mutable inputs. Java <code>record</code>s are a concise way to write one.`, why: `Immutable objects can be shared freely with no locks. Model updates as "build a new value and swap the reference".` },
        { term: `Thread confinement`, def: `Only one thread ever touches some state: locals, a <code>ThreadLocal</code>, or a single-threaded executor that owns an object.`, why: `No sharing means no races. An actor-like "one thread owns the elevator controller" design is a legitimate answer.` },
        { term: `Lock granularity`, def: `<strong>Coarse</strong>: one lock for the whole object (simple, serializes everything). <strong>Fine</strong>: one lock per entity, such as per seat, per account or per parking spot (more parallelism, more deadlock risk). <strong>Lock striping</strong>: a fixed array of locks indexed by hash, in between.`, why: `Start coarse and say when you'd go finer: when profiling shows contention on that lock.` },
        { term: `Deadlock`, def: `Two or more threads each hold a lock the other needs, so all wait forever. It needs four conditions together: mutual exclusion, hold and wait, no preemption, circular wait.`, why: `It is the standard follow-up whenever you introduce more than one lock.`, demo: `deadlockSim` },
        { term: `Lock ordering`, def: `Always acquire multiple locks in one global order (by id, by memory address via a tie-breaker). Circular wait becomes impossible.`, why: `The textbook fix for transfers between two accounts or moves between two cells.`, demo: `deadlockSim` },
        { term: `tryLock with timeout`, def: `Try to take a lock for a bounded time; if it fails, release what you hold, back off (ideally with random jitter) and retry or report failure.`, why: `Breaks hold-and-wait. Useful when a global order is impossible, at the cost of retries and possible livelock.`, demo: `deadlockSim` },
        { term: `Livelock and starvation`, def: `<strong>Livelock</strong>: threads keep reacting to each other (release, retry, collide again) and make no progress. <strong>Starvation</strong>: one thread never gets the lock because others keep winning.`, why: `Random backoff fixes livelock; fair locks or queues fix starvation, at some throughput cost.` },
        { term: `Optimistic vs pessimistic concurrency`, def: `<strong>Pessimistic</strong>: lock first, then read and write. <strong>Optimistic</strong>: read with a version number, compute, then write only if the version is unchanged (CAS or <code>UPDATE ... WHERE version = ?</code>), else retry.`, why: `Optimistic wins when conflicts are rare; under heavy contention retries pile up and a lock is better.` }
      ],
      cheatsheet: [
        { title: `Pick the narrowest tool`, type: `table`, headers: [`Situation`, `Tool`, `Watch out for`], rows: [
          [`State never changes after construction`, `Immutable class / record`, `Defensive-copy mutable inputs`],
          [`One thread owns the state`, `Confinement, single-thread executor`, `Don't leak references out`],
          [`Single counter or flag`, `AtomicInteger / AtomicBoolean / LongAdder`, `volatile alone isn't atomic`],
          [`Map with "create if missing" or "update value"`, `ConcurrentHashMap.computeIfAbsent / merge / compute`, `Keep the lambda short and side-effect free`],
          [`Invariant across several fields of one object`, `synchronized on the object`, `Guard reads too`],
          [`Need timeout, interruptibility or several conditions`, `ReentrantLock`, `unlock() in finally`],
          [`Many readers, rare writers, slow reads`, `ReentrantReadWriteLock`, `No read-to-write upgrade`],
          [`Operation spans two entities`, `Per-entity locks in a fixed order`, `Deadlock if order isn't global`],
          [`Conflicts rare, retry is cheap`, `Optimistic version check / CAS loop`, `Retry storms under contention`]
        ] },
        { title: `Deadlock: the four conditions and how to break each`, type: `table`, headers: [`Condition`, `Meaning`, `Break it by`], rows: [
          [`Mutual exclusion`, `A resource is held by one thread at a time`, `Lock-free structures, immutable data`],
          [`Hold and wait`, `Hold one lock while waiting for another`, `Acquire all at once, or tryLock and release on failure`],
          [`No preemption`, `Locks can't be taken away`, `Timeouts (tryLock) so a thread gives up`],
          [`Circular wait`, `A cycle of threads each waiting on the next`, `Global lock ordering (the usual answer)`]
        ] },
        { title: `Safe transfer between two accounts`, type: `code`, body: `void transfer(Account from, Account to, long amount) {
    Account first  = from.id() < to.id() ? from : to;   // global order
    Account second = first == from ? to : from;
    synchronized (first) {
        synchronized (second) {
            if (from.balance() < amount) throw new InsufficientFunds();
            from.debit(amount);
            to.credit(amount);
        }
    }
}` },
        { title: `Atomic "book if free" with ConcurrentHashMap`, type: `code`, body: `private final ConcurrentHashMap<String, String> seatOwner = new ConcurrentHashMap<>();

boolean book(String seatId, String userId) {
    // putIfAbsent is atomic: exactly one caller sees null
    return seatOwner.putIfAbsent(seatId, userId) == null;
}` }
      ],
      interview: [
        { q: `In a movie ticket booking system, how do you stop two users booking the same seat?`, a: `The shared state is each seat's status. "If free then mark booked" must be atomic. In memory, the simplest options are a synchronized book method on the show (coarse), a per-seat lock or AtomicReference status with compareAndSet(FREE, HELD) (fine-grained), or ConcurrentHashMap.putIfAbsent(seatId, userId). For multi-seat bookings, lock seats in sorted order or reserve all-or-nothing. With a database, use a unique constraint or a conditional UPDATE ... WHERE status = 'FREE' and check the row count.`, diff: `medium` },
        { q: `synchronized vs ReentrantLock: when would you pick each?`, a: `synchronized is the default: less code, can't forget to unlock, reentrant, and well optimized. Pick ReentrantLock when you need tryLock (with a timeout) to avoid deadlock or meet a latency budget, lockInterruptibly so a waiting thread can be cancelled, a fair ordering, or several Condition objects on one lock (for example notFull and notEmpty in a bounded buffer). Always unlock in finally.`, diff: `medium` },
        { q: `Why is a ConcurrentHashMap not enough to make "get, then put if missing" safe?`, a: `Each method call is atomic, but two calls aren't atomic together. Two threads can both get null and both put, and the second overwrites the first. Use putIfAbsent, computeIfAbsent, compute or merge, which do the check and the write as one atomic step for that key.`, diff: `easy` },
        { q: `How does lock ordering prevent deadlock in a bank transfer?`, a: `Deadlock needs a cycle: thread 1 holds A and waits for B while thread 2 holds B and waits for A. If every thread locks the account with the lower id first, both transfers try A first; one wins, the other waits without holding anything, and no cycle can form. Break ties (equal ids or hash collisions) with a deterministic tie-breaker lock.`, diff: `medium` },
        { q: `When would you choose optimistic concurrency over locking?`, a: `When conflicts are rare and a retry is cheap, such as editing different documents or occasional inventory updates on a large catalog. You read a version, do the work without holding a lock, and commit only if the version hasn't changed. Under heavy contention on one item (a flash sale on one product) most attempts fail and retry, so a lock or a queue that serializes updates is better.`, diff: `medium` },
        { q: `What does volatile guarantee, and give one correct and one incorrect use.`, a: `It guarantees that a read sees the most recent write by any thread and prevents reordering around the access. Correct: a volatile boolean shutdownRequested checked by a worker loop, or a volatile reference to an immutable config object that is swapped wholesale. Incorrect: volatile int count with count++, because the increment is still three separate steps.`, diff: `medium` },
        { q: `Your design uses one lock around the whole ParkingLot. The interviewer says it is a bottleneck. What do you do?`, a: `First confirm the critical section is minimal (no I/O, no payment calls inside). Then go finer: one lock or atomic status per floor or per spot, so parking on different floors doesn't contend; or keep available spots per type in concurrent queues and poll from them (an atomic take). If an operation spans two spots or floors, acquire in a fixed order. Mention the cost: more code and new deadlock risks.`, diff: `hard` },
        { q: `What is the difference between deadlock, livelock and starvation?`, a: `Deadlock: threads are blocked forever waiting on each other; nothing runs. Livelock: threads keep running and reacting to each other (for example releasing and retrying in lockstep) but no one makes progress; random backoff fixes it. Starvation: the system makes progress but one thread never gets the resource because others keep winning; fair locks or FIFO queues fix it.`, diff: `easy` }
      ],
      labs: [`checkThenAct`, `deadlockSim`]
    },
    // ------------------------------------------------------------------
    {
      id: `ch3`, part: 3, number: 3,
      source: { title: `Hello Interview: Coordination`, url: `https://www.hellointerview.com/learn/low-level-design/concurrency/coordination` },
      title: `Coordination: handing off work and waiting for each other`,
      overview: `Coordination problems are about threads that depend on each other: one produces work another consumes, one step needs several results first, or a background worker must stop cleanly. The core pattern is <strong>producer-consumer</strong> with a <strong>blocking queue</strong> between them, which decouples rates and does the waiting for you. Underneath sit <strong>wait/notify</strong> and <strong>condition variables</strong> (worth knowing, rarely worth hand-writing), and on top sit <strong>thread pools</strong>, <strong>futures</strong>, <strong>latches</strong> and <strong>barriers</strong>. The last piece is keeping <strong>per-key ordering</strong> while still running in parallel.`,
      concepts: [
        { term: `Producer-consumer`, def: `Producers create work items and put them on a shared buffer; consumers take items off and process them. The buffer decouples the two sides so each can run at its own pace.`, why: `It is the backbone of logging services, notification fan-out, order processing and task schedulers in LLD problems.`, demo: `boundedBuffer` },
        { term: `BlockingQueue`, def: `A thread-safe queue whose <code>put</code> blocks while full and <code>take</code> blocks while empty. <code>offer</code> and <code>poll</code> return immediately or after a timeout instead. Implementations: <code>ArrayBlockingQueue</code> (bounded array), <code>LinkedBlockingQueue</code> (optionally bounded), <code>PriorityBlockingQueue</code>, <code>DelayQueue</code>, <code>SynchronousQueue</code> (no capacity: a direct hand-off).`, why: `It packages the locking, waiting and signalling of producer-consumer into two method calls. Reach for it first.`, demo: `boundedBuffer` },
        { term: `Bounded vs unbounded buffer`, def: `A bounded queue blocks or rejects producers when full, which pushes back on them. An unbounded queue accepts everything and grows until memory runs out if consumers fall behind.`, why: `Say "bounded, with capacity N and this policy when full". It shows you've thought about overload.`, demo: `boundedBuffer` },
        { term: `Guarded wait (wait / notifyAll)`, def: `Inside <code>synchronized</code>, a thread calls <code>wait()</code> to release the monitor and sleep until another thread calls <code>notify()</code>/<code>notifyAll()</code>. The waiting thread reacquires the monitor before returning.`, why: `It is the primitive under every blocking structure. Know its rules even if you'd use a BlockingQueue in practice.` },
        { term: `Always wait in a loop`, def: `<code>while (!condition) wait();</code>, never <code>if</code>. A thread can wake up spuriously, or wake up after another thread has already consumed the condition.`, why: `The single most common hand-written coordination bug; interviewers look for the while.` },
        { term: `notify vs notifyAll`, def: `<code>notify</code> wakes one arbitrary waiter; <code>notifyAll</code> wakes all of them to recheck. With different kinds of waiters on one monitor (producers and consumers), <code>notify</code> can wake the wrong kind and stall the system.`, why: `Default to <code>notifyAll</code> with intrinsic locks, or use separate <code>Condition</code>s so <code>signal</code> wakes the right kind.` },
        { term: `Condition variables`, def: `<code>lock.newCondition()</code> gives a <code>Condition</code> with <code>await()</code>, <code>signal()</code> and <code>signalAll()</code>. One lock can have several conditions, such as <code>notFull</code> and <code>notEmpty</code>.`, why: `They are how you'd write a bounded buffer by hand with precise wake-ups.` },
        { term: `ExecutorService and thread pools`, def: `<code>Executors.newFixedThreadPool(n)</code>, <code>newSingleThreadExecutor()</code>, <code>newScheduledThreadPool(n)</code>, <code>newVirtualThreadPerTaskExecutor()</code>, or a hand-configured <code>ThreadPoolExecutor</code> with core size, max size, a bounded queue and a rejection policy.`, why: `A pool is producer-consumer already built: <code>submit</code> enqueues, workers dequeue. Prefer it to managing threads.` },
        { term: `Future and Callable`, def: `<code>submit(Callable)</code> returns a <code>Future</code>; <code>get()</code> blocks until the result is ready (or with a timeout), <code>cancel(true)</code> interrupts the task.`, why: `The simplest way to run work in parallel and collect results.` },
        { term: `CompletableFuture`, def: `A future you can compose without blocking: <code>supplyAsync</code>, <code>thenApply</code>, <code>thenCompose</code>, <code>thenCombine</code>, <code>allOf</code>, <code>anyOf</code>, <code>exceptionally</code>, <code>orTimeout</code>. Without an executor argument, async stages run on <code>ForkJoinPool.commonPool()</code>.`, why: `Fan out to several services and combine the results. Pass your own executor for blocking I/O so you don't starve the common pool.` },
        { term: `CountDownLatch`, def: `Initialized with a count; threads call <code>countDown()</code>, and <code>await()</code> blocks until the count reaches zero. It can't be reset.`, why: `"Start serving once all N caches are warm", or a test that releases N threads at the same instant.` },
        { term: `CyclicBarrier and Phaser`, def: `A <code>CyclicBarrier</code> makes N threads wait for each other at a point, then releases them all and resets for the next round. A <code>Phaser</code> is a flexible version where parties can register and leave.`, why: `Fits round-based simulations (every player moves, then the next turn starts).` },
        { term: `Per-key ordering (lanes)`, def: `To run work in parallel but keep each entity's events in order, hash the key (user, account, elevator) to one of N single-threaded executors or queues. Same key, same lane, same order.`, why: `It is how you'd keep one order's state transitions in sequence without a global lock. Kafka partitions apply the same idea.` },
        { term: `Graceful shutdown`, def: `<code>shutdown()</code> stops accepting tasks and lets queued ones finish; <code>awaitTermination</code> waits with a timeout; <code>shutdownNow()</code> interrupts workers. For hand-written consumers, send a <strong>poison pill</strong> item that tells each consumer to exit.`, why: `"What happens to queued log lines when the service stops?" is a common follow-up.` },
        { term: `Interruption`, def: `<code>thread.interrupt()</code> sets a flag and makes blocking calls such as <code>sleep</code>, <code>wait</code>, <code>take</code> and <code>await</code> throw <code>InterruptedException</code>. It is Java's cooperative cancellation.`, why: `Never swallow it: either propagate it or restore the flag with <code>Thread.currentThread().interrupt()</code>.` },
        { term: `Scheduled work`, def: `<code>ScheduledExecutorService.schedule</code>, <code>scheduleAtFixedRate</code> and <code>scheduleWithFixedDelay</code> run tasks later or periodically; <code>DelayQueue</code> releases items when their delay expires.`, why: `Seat holds that expire after 10 minutes, token refills, retries with backoff and heartbeats all need it.` }
      ],
      cheatsheet: [
        { title: `Which coordination tool?`, type: `table`, headers: [`Need`, `Use`, `Note`], rows: [
          [`Hand work from many threads to background workers`, `BlockingQueue (bounded) or ExecutorService`, `Choose a policy for when it's full`],
          [`Run N independent tasks, collect results`, `invokeAll / CompletableFuture.allOf`, `Set timeouts`],
          [`Chain async steps without blocking`, `CompletableFuture.thenCompose / thenCombine`, `Pass an executor for blocking I/O`],
          [`Wait until N things have happened once`, `CountDownLatch`, `Not reusable`],
          [`N threads meet at a point every round`, `CyclicBarrier / Phaser`, `Barrier breaks if a party fails`],
          [`Run something later or periodically`, `ScheduledExecutorService, DelayQueue`, `Catch exceptions or the schedule stops`],
          [`Keep each key's events ordered`, `Hash key to one of N single-thread executors`, `Hot keys load one lane`],
          [`Custom wait condition on your own state`, `ReentrantLock + Condition (await in a while loop)`, `signal the right condition`]
        ] },
        { title: `BlockingQueue methods`, type: `table`, headers: [`Action`, `Throws`, `Returns special value`, `Blocks`, `Times out`], rows: [
          [`Insert`, `add(e)`, `offer(e) -> false`, `put(e)`, `offer(e, t, unit)`],
          [`Remove`, `remove()`, `poll() -> null`, `take()`, `poll(t, unit)`],
          [`Examine`, `element()`, `peek() -> null`, `-`, `-`]
        ] },
        { title: `Bounded buffer by hand (ReentrantLock + two conditions)`, type: `code`, body: `class BoundedBuffer<T> {
    private final Deque<T> items = new ArrayDeque<>();
    private final int capacity;
    private final ReentrantLock lock = new ReentrantLock();
    private final Condition notFull = lock.newCondition();
    private final Condition notEmpty = lock.newCondition();

    BoundedBuffer(int capacity) { this.capacity = capacity; }

    void put(T item) throws InterruptedException {
        lock.lock();
        try {
            while (items.size() == capacity) notFull.await();
            items.addLast(item);
            notEmpty.signal();
        } finally { lock.unlock(); }
    }

    T take() throws InterruptedException {
        lock.lock();
        try {
            while (items.isEmpty()) notEmpty.await();
            T item = items.removeFirst();
            notFull.signal();
            return item;
        } finally { lock.unlock(); }
    }
}` },
        { title: `Fan out, combine, time out`, type: `code`, body: `ExecutorService io = Executors.newVirtualThreadPerTaskExecutor();

CompletableFuture<Price> price = CompletableFuture.supplyAsync(() -> pricing.quote(item), io);
CompletableFuture<Stock> stock = CompletableFuture.supplyAsync(() -> inventory.check(item), io);

Offer offer = price.thenCombine(stock, Offer::new)
                   .orTimeout(300, TimeUnit.MILLISECONDS)
                   .exceptionally(ex -> Offer.unavailable(item))
                   .join();` }
      ],
      interview: [
        { q: `Design the core of an asynchronous logging service. How do request threads hand off log lines?`, a: `Request threads call log(), which offers an entry to a bounded BlockingQueue and returns immediately. One (or a few) background writer threads take entries, batch them and write to the sink. Decide the full-queue policy: drop debug lines and count them, block briefly, or write synchronously as a fallback. On shutdown, stop accepting, drain the queue (or send a poison pill) and flush.`, diff: `medium` },
        { q: `Why must wait() be called in a while loop?`, a: `Because returning from wait() doesn't mean the condition is true. The thread may wake spuriously, or be notified and then lose the race to another thread that consumed the item first. Rechecking in a while loop with the lock held makes the code correct for every interleaving.`, diff: `easy` },
        { q: `When would notify() cause a hang where notifyAll() would not?`, a: `When different kinds of waiters share one monitor. In a bounded buffer, producers wait for "not full" and consumers for "not empty". If a consumer takes an item and calls notify(), it might wake another consumer instead of a producer; that consumer sees an empty buffer and waits again, and the producers are never woken. notifyAll() or separate Condition objects avoid this.`, diff: `hard` },
        { q: `How do you process events for many users in parallel while keeping each user's events in order?`, a: `Partition by key: create N single-threaded executors (or queues with one consumer each) and send every event for user u to lane hash(u) mod N. Events of one user run sequentially on one lane, different users run in parallel across lanes. Mention the downside: a very hot user loads one lane, and resizing N changes the mapping.`, diff: `medium` },
        { q: `CountDownLatch vs CyclicBarrier?`, a: `A CountDownLatch waits for a count of events to reach zero; the threads that count down don't wait, and it can't be reused. A CyclicBarrier makes a fixed number of threads wait for each other at a barrier point, then releases them together and resets for the next round. Latch: "wait until all services are ready". Barrier: "every simulation worker finishes step k before anyone starts k+1".`, diff: `medium` },
        { q: `Why is Executors.newFixedThreadPool risky under load, and what would you use instead?`, a: `It uses an unbounded LinkedBlockingQueue, so when tasks arrive faster than they finish the queue grows without limit, latency climbs and memory eventually runs out. Build a ThreadPoolExecutor with a bounded ArrayBlockingQueue and an explicit rejection policy (AbortPolicy to fail fast, CallerRunsPolicy to slow producers down), and monitor queue depth.`, diff: `medium` },
        { q: `How do you implement seat holds that expire after 10 minutes?`, a: `When a hold is created, record its expiry and schedule a release with a ScheduledExecutorService (or put it on a DelayQueue that a worker drains). The release must be conditional: only free the seat if it is still held by that hold id, using compareAndSet or the same lock as booking, so it can't undo a completed purchase. A periodic sweep is a fine fallback after restarts.`, diff: `hard` }
      ],
      labs: [`boundedBuffer`]
    },
    // ------------------------------------------------------------------
    {
      id: `ch4`, part: 4, number: 4,
      source: { title: `Hello Interview: Scarcity`, url: `https://www.hellointerview.com/learn/low-level-design/concurrency/scarcity` },
      title: `Scarcity: sharing limited resources without overload`,
      overview: `Scarcity problems start from a limit: ten database connections, four GPU slots, 100 API calls per second, one printer. The design must let callers share the resource, never exceed the limit, and behave sensibly when demand is higher. The tools are <strong>semaphores</strong> (cap concurrent use), <strong>resource pools</strong> (hand out and take back actual objects), <strong>bounded executors</strong> with <strong>rejection policies</strong>, <strong>rate limiters</strong> (cap use per unit of time) and <strong>bulkheads</strong> (separate limits per tenant or dependency). Every one needs an explicit answer to "what happens at the limit?"`,
      concepts: [
        { term: `Semaphore`, def: `A counter of <strong>permits</strong>. <code>acquire()</code> takes one (blocking while none are left), <code>release()</code> returns one. <code>tryAcquire()</code> and <code>tryAcquire(timeout, unit)</code> give up instead of waiting. A fair semaphore hands permits out in arrival order.`, why: `The direct way to say "at most N at a time" for anything: calls to a slow service, parallel downloads, model inference slots.`, demo: `semaphorePool` },
        { term: `Release in finally`, def: `<code>sem.acquire(); try { use(); } finally { sem.release(); }</code>. Unlike a lock, a semaphore has no owner, so any thread can release, and an extra release silently adds a permit.`, why: `A leaked permit shrinks capacity forever; an extra release raises the limit. Both are silent bugs.` },
        { term: `Resource pool`, def: `Keep N real objects (connections, buffers, workers) in a <code>BlockingQueue</code>. Borrow with <code>take()</code> or <code>poll(timeout)</code>, return with <code>offer()</code>. The queue size is the limit and the queue does the waiting.`, why: `When the scarce thing is an object, not just a count, a pool is clearer than a semaphore plus a list.`, demo: `semaphorePool` },
        { term: `Policies at the limit`, def: `<strong>Block</strong> until available; <strong>block with a timeout</strong> then fail; <strong>reject immediately</strong> (fail fast, HTTP 429/503); <strong>degrade</strong> (serve a cached or partial answer); or <strong>queue</strong> with a bound.`, why: `The policy is a product decision. Interactive requests usually want a short timeout; background jobs can wait.`, demo: `semaphorePool` },
        { term: `Little's law`, def: `Average items in a system = arrival rate &times; average time in the system (L = &lambda;W). If a pool of 10 connections holds each one 50 ms, it serves at most 10 / 0.05 = 200 requests per second.`, why: `Quick sizing: it tells you whether a limit will be hit and how long queues will get.`, demo: `semaphorePool` },
        { term: `Bounded ThreadPoolExecutor`, def: `<code>new ThreadPoolExecutor(core, max, keepAlive, unit, new ArrayBlockingQueue&lt;&gt;(n), policy)</code>. New tasks go to core threads, then the queue, then extra threads up to max, then the rejection policy.`, why: `It bounds both threads and queued work: the two things that run out under load.` },
        { term: `Rejection policies`, def: `<code>AbortPolicy</code> (default): throw <code>RejectedExecutionException</code>. <code>CallerRunsPolicy</code>: the submitting thread runs the task itself, which naturally slows producers. <code>DiscardPolicy</code>: drop silently. <code>DiscardOldestPolicy</code>: drop the oldest queued task.`, why: `Choosing one out loud shows you know what overload looks like. Silent discard is rarely right for important work.` },
        { term: `Backpressure`, def: `Signalling upstream to slow down when downstream is saturated: blocking puts, rejections, CallerRuns, or reactive "request(n)" demand.`, why: `Without it, a fast producer fills memory or overloads the consumer's dependencies.`, demo: `boundedBuffer` },
        { term: `Rate limiting`, def: `Limits use per unit of time rather than concurrent use. <strong>Token bucket</strong>: tokens refill at rate r up to capacity b; each request spends one, so bursts up to b are allowed. <strong>Fixed window</strong>, <strong>sliding window log</strong> and <strong>sliding window counter</strong> are alternatives.`, why: `"Design a rate limiter" is a classic LLD problem; its thread-safety is part of the question.`, demo: `tokenBucket` },
        { term: `Thread-safe token bucket`, def: `Refill lazily on each call from the elapsed time, then spend a token, all inside one critical section (synchronized) or via a CAS loop on an immutable state object.`, why: `Refill-then-spend is a read-modify-write on two fields; doing it outside a lock lets bursts exceed the limit.`, demo: `tokenBucket` },
        { term: `Per-key limits`, def: `One limiter per user, API key or tenant, created on demand with <code>ConcurrentHashMap.computeIfAbsent(key, k -&gt; new TokenBucket(...))</code>, plus eviction of idle entries.`, why: `computeIfAbsent avoids creating two buckets for the same key under a race.` },
        { term: `Bulkhead`, def: `Separate pools or semaphores per dependency or tenant, so one slow dependency can't exhaust every thread or connection.`, why: `"Payment API is slow, now search is down too" is the failure bulkheads prevent.` },
        { term: `Timeouts everywhere`, def: `Every wait on a scarce resource (acquire, borrow, call) should have a bound. An unbounded wait turns a slow dependency into a stuck service.`, why: `Timeouts convert hangs into errors you can handle, retry or report.` },
        { term: `Fairness vs throughput`, def: `Fair semaphores and locks serve waiters in order, preventing starvation, but cost throughput because the lock can't go to whichever thread is already running.`, why: `Use fairness when a starving caller is a real problem (long-running jobs vs short ones), not by default.` },
        { term: `Priority and reservation`, def: `Reserve part of a limit for important work (for example 2 of 10 connections for admin or health checks), or use a <code>PriorityBlockingQueue</code> so urgent tasks go first.`, why: `It keeps critical paths alive when routine traffic saturates the resource.` }
      ],
      cheatsheet: [
        { title: `Limit concurrent use or limit rate?`, type: `table`, headers: [`Requirement`, `Tool`, `At the limit`], rows: [
          [`At most N calls in flight to a service`, `Semaphore(N)`, `tryAcquire(timeout) then fail or fallback`],
          [`N real objects to share (connections, buffers)`, `Pool backed by BlockingQueue`, `poll(timeout) then error`],
          [`At most N worker threads and M queued tasks`, `ThreadPoolExecutor + ArrayBlockingQueue(M)`, `AbortPolicy or CallerRunsPolicy`],
          [`At most R requests per second (bursts OK)`, `Token bucket`, `Reject (429) or wait for a token`],
          [`Exactly R per window, simple`, `Fixed window counter`, `Burst at window edges`],
          [`Isolate tenants / dependencies`, `One semaphore or pool each (bulkheads)`, `Only that tenant is limited`]
        ] },
        { title: `Sizing with Little's law`, type: `table`, headers: [`Pool size`, `Hold time`, `Max throughput`], rows: [
          [`10 connections`, `50 ms`, `200 / s`],
          [`10 connections`, `200 ms`, `50 / s`],
          [`50 threads`, `100 ms`, `500 / s`],
          [`8 GPU slots`, `2 s`, `4 / s`]
        ], note: `Throughput = permits / hold time. If arrivals exceed it, queues grow without bound unless you reject.` },
        { title: `Semaphore with timeout`, type: `code`, body: `private final Semaphore slots = new Semaphore(10, true);

Result callModel(Request r) throws InterruptedException {
    if (!slots.tryAcquire(200, TimeUnit.MILLISECONDS)) {
        throw new OverloadedException("model busy, retry later");
    }
    try {
        return model.infer(r);
    } finally {
        slots.release();
    }
}` },
        { title: `Thread-safe token bucket`, type: `code`, body: `final class TokenBucket {
    private final long capacity;
    private final double refillPerNano;
    private double tokens;
    private long last = System.nanoTime();

    TokenBucket(long capacity, double perSecond) {
        this.capacity = capacity;
        this.refillPerNano = perSecond / 1_000_000_000.0;
        this.tokens = capacity;
    }

    synchronized boolean tryAcquire() {
        long now = System.nanoTime();
        tokens = Math.min(capacity, tokens + (now - last) * refillPerNano);
        last = now;
        if (tokens < 1) return false;
        tokens -= 1;
        return true;
    }
}` }
      ],
      interview: [
        { q: `Implement a connection pool with at most 10 connections. What happens when all are in use?`, a: `Create 10 connections up front and put them in an ArrayBlockingQueue. borrow() calls poll(timeout); if it returns null, throw a "pool exhausted" exception so the caller fails fast instead of hanging. release(c) validates the connection (replacing broken ones) and offers it back. Callers use try/finally so connections are always returned. Optionally reserve a connection for health checks.`, diff: `medium` },
        { q: `Semaphore vs lock: what's the difference?`, a: `A lock allows one holder and has an owner: only the thread that locked may unlock, and it is usually reentrant. A semaphore holds N permits, has no owner (any thread may release) and isn't reentrant. Use a lock to protect state consistency, a semaphore to cap how many threads use a resource at once. A Semaphore(1) behaves like a non-reentrant mutex without ownership checks.`, diff: `easy` },
        { q: `Your service calls a slow payments API. How do you stop it taking down the whole service?`, a: `Bulkhead it: a dedicated semaphore or small bounded pool just for payment calls, with tryAcquire and a short timeout, plus a timeout on the call itself. When permits run out, fail fast or queue the payment for async processing instead of tying up request threads. Add a circuit breaker so repeated failures stop calls entirely for a while. Other endpoints keep their own threads and stay healthy.`, diff: `hard` },
        { q: `Design a thread-safe rate limiter allowing 100 requests per second per user.`, a: `Keep a ConcurrentHashMap from user id to TokenBucket, created with computeIfAbsent so two threads never create two buckets for one user. Each bucket has capacity 100 and refills at 100 per second, refilled lazily from elapsed time inside a synchronized tryAcquire (refill and spend must be one atomic step). Return false so the caller sends 429. Evict idle buckets periodically. Per-user locks mean different users don't contend.`, diff: `medium` },
        { q: `Which rejection policy would you pick for a thread pool handling incoming API requests, and for one processing analytics events?`, a: `For API requests, AbortPolicy (or a custom one) that turns into a fast 503, because making a user wait behind a full queue is worse than a quick error. For analytics, CallerRunsPolicy slows the producer down instead of losing data, or DiscardOldestPolicy if fresh data matters more and loss is acceptable. Either way, bound the queue and alert on rejections.`, diff: `medium` },
        { q: `A pool has 20 connections and each query holds one for 40 ms. Peak load is 800 queries per second. What happens?`, a: `By Little's law the pool can serve 20 / 0.04 = 500 queries per second. At 800 per second, 300 per second can't be served: waiters queue up, wait times grow without bound, and with timeouts they start failing. Options: make queries faster, raise the pool size if the database can take it, cache reads, or shed load explicitly instead of letting timeouts do it randomly.`, diff: `hard` }
      ],
      labs: [`semaphorePool`, `tokenBucket`]
    }
  ]
};
