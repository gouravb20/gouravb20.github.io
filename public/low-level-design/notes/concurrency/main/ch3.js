// Main tab: Chapter 3, Coordination. Format: DeepSection[] in public/shared/notes.d.ts.
window.MAIN = window.MAIN || {};
MAIN.ch3 = [
  {
    id: "waiting-well",
    title: "Coordination is about waiting well",
    kicker: "Mental model",
    blocks: [
      { type: "text", html: `<p>Correctness stops threads from corrupting each other's state. Coordination starts when one thread can't continue until another has done something: a worker needs a job to process, a checkout needs three lookups to finish, a shutdown needs the queue drained. The question is always <em>who waits for whom, and how</em>.</p><p>A good wait has two properties. The waiting thread uses no CPU and wakes up as soon as the condition becomes true, never before and never much later. And whatever the other thread produced arrives safely, with all its writes visible. Blocking queues, futures, latches and executors give you both; that is why you reach for them first.</p>` },
      { type: "compare", items: [
        { title: "Busy spinning", tone: "bad", html: `<p><code>while (queue.isEmpty()) {}</code> burns a full core doing nothing, and without a volatile or synchronised read it may never even see the change.</p>` },
        { title: "Sleep and poll", tone: "warn", html: `<p>Check, sleep 100 ms, check again. It wastes less CPU but adds up to 100 ms of latency to every hand-off, and still needs safe publication of the data.</p>` },
        { title: "Block on a structure", tone: "ok", html: `<p><code>queue.take()</code>, <code>future.get()</code>, <code>latch.await()</code>. The thread sleeps until signalled, wakes promptly, and the hand-off guarantees visibility of the producer's writes.</p>` }
      ] }
    ]
  },
  {
    id: "producer-consumer",
    title: "Producer-consumer, worked through",
    kicker: "Worked example",
    blocks: [
      { type: "text", html: `<p>A notification service: request threads create notifications, and a few worker threads send them so no request waits on an email provider. Between them sits a bounded queue. Three decisions make the design complete: how big the queue is, what a producer does when it is full, and how the service shuts down without losing queued work.</p>` },
      { type: "code", lang: "java", title: "Notification dispatcher with a bounded queue", code: `final class Dispatcher {
    private static final Notification STOP = new Notification("", "");     // poison pill
    private final BlockingQueue<Notification> queue = new ArrayBlockingQueue<>(1_000);
    private final AtomicLong rejected = new AtomicLong();
    private final List<Thread> workers;

    Dispatcher(int n, Sender sender) {
        workers = IntStream.range(0, n)
                .mapToObj(i -> Thread.ofPlatform().start(() -> work(sender)))
                .toList();
    }

    boolean submit(Notification note) throws InterruptedException {
        if (queue.offer(note, 50, TimeUnit.MILLISECONDS)) return true;
        rejected.incrementAndGet();                                       // caller retries or drops
        return false;
    }

    private void work(Sender sender) {
        try {
            for (Notification n = queue.take(); n != STOP; n = queue.take()) sender.send(n);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();                           // never swallow it
        }
    }

    void shutdown() throws InterruptedException {
        for (int i = 0; i < workers.size(); i++) queue.put(STOP);        // one pill per worker
        for (Thread w : workers) w.join();
    }
}` },
      { type: "text", html: `<p>It is thread-safe because the queue is the only shared mutable structure and it is built for concurrent use. Putting an item on a <code>BlockingQueue</code> happens-before taking it off, so every field the request thread set on a <code>Notification</code> (an immutable record here) is visible to the worker. The rejection counter is atomic, and the workers keep no shared state of their own.</p>` },
      { type: "keypoints", title: "The decisions, stated out loud", items: [
        "<strong>Bounded at 1,000:</strong> if senders fall behind, memory stays flat instead of growing until the process dies.",
        "<strong>When full, wait 50 ms, then reject and count:</strong> a request thread never hangs on a slow provider, and the counter shows when capacity is too low.",
        "<strong>Shutdown with poison pills:</strong> pills go in behind the queued work, so everything already accepted is sent before the workers exit. A real version would also refuse new submits once shutdown starts.",
        "<strong>Per-item failure:</strong> in production, catch exceptions around <code>sender.send</code>, so one bad message doesn't kill a worker thread."
      ] }
    ]
  },
  {
    id: "choose-the-tool",
    title: "Choosing a coordination tool",
    kicker: "Decision checklist",
    blocks: [
      { type: "text", html: `<p>Work down these questions and stop at the first yes. Each points to a library tool that already handles the waiting and the visibility for you.</p>` },
      { type: "steps", items: [
        "<strong>Handing items from some threads to others?</strong> A bounded <code>BlockingQueue</code>; or an <code>ExecutorService</code> if the items are tasks to run.",
        "<strong>Need a result back from a task?</strong> The <code>Future</code> from <code>submit</code>; or <code>CompletableFuture</code> to chain and combine results without blocking a thread per step.",
        "<strong>Wait until N things have happened, once?</strong> <code>CountDownLatch</code>, or <code>invokeAll</code> and <code>CompletableFuture.allOf</code> when the things are tasks.",
        "<strong>N threads must move in rounds together?</strong> <code>CyclicBarrier</code>, or <code>Phaser</code> if participants come and go.",
        "<strong>Run something later or periodically?</strong> <code>ScheduledExecutorService</code>. If the delayed action changes shared state, such as releasing a seat hold, make it conditional so it can't undo newer work.",
        "<strong>Parallel across entities but ordered within each?</strong> Hash the entity id to one of N single-threaded lanes.",
        "<strong>None of these fit your condition?</strong> Write a guarded wait yourself with a lock and a condition, following the rules below."
      ] }
    ]
  },
  {
    id: "hand-rolled-waits",
    title: "If you must write the wait yourself",
    kicker: "Primitives",
    blocks: [
      { type: "text", html: `<p>Occasionally the interviewer asks you to build a primitive rather than use one. The smallest useful example is a one-shot gate: threads wait until someone opens it, and once open it stays open.</p>` },
      { type: "code", lang: "java", title: "A one-shot gate with wait and notifyAll", code: `final class Gate {
    private boolean open;                                  // guarded by this

    synchronized void open() {
        open = true;                                       // change the state first
        notifyAll();                                       // then wake every waiter
    }

    synchronized void await() throws InterruptedException {
        while (!open) wait();                              // a loop, never an if
    }

    synchronized boolean await(long timeoutMillis) throws InterruptedException {
        long deadline = System.currentTimeMillis() + timeoutMillis;
        while (!open) {
            long left = deadline - System.currentTimeMillis();
            if (left <= 0) return false;                   // timed out, still closed
            wait(left);
        }
        return true;
    }
}` },
      { type: "keypoints", title: "The rules this code follows", items: [
        "Call <code>wait</code> and <code>notifyAll</code> only while holding the same object's lock; that lock also guards <code>open</code>, which gives visibility.",
        "Wait in a <strong>while loop</strong> that rechecks the condition. Threads can wake without a signal, or after another thread has already changed things back.",
        "Change the state <em>before</em> signalling, while still holding the lock, so a woken thread sees the new value.",
        "Use <code>notifyAll</code> unless every waiter is interchangeable; <code>notify</code> can wake the wrong kind of waiter and leave the right one asleep.",
        "Offer a timed version for request paths, and let <code>InterruptedException</code> propagate."
      ] }
    ]
  },
  {
    id: "follow-ups",
    title: "Follow-ups to expect",
    kicker: "Interview",
    blocks: [
      { type: "table", headers: ["Follow-up", "What a strong answer covers"], rows: [
        ["What happens when the queue is full?", "The named policy (block, time out, or reject and count) and why it suits this caller"],
        ["How do you shut down without losing work?", "Stop accepting, drain with poison pills or shutdown() plus awaitTermination, then shutdownNow() after a deadline"],
        ["How do you keep each user's events in order?", "Hash the user id to a single-threaded lane; mention hot keys and resizing"],
        ["A send throws an exception. Now what?", "Catch per item, log and count; an uncaught exception kills a plain thread, and with submit() it hides inside the Future"],
        ["Why not Executors.newFixedThreadPool?", "Its queue is unbounded; build a ThreadPoolExecutor with a bounded queue and a rejection policy"]
      ] },
      { type: "callout", tone: "mistake", title: "Common mistakes", html: `<ul><li>An unbounded queue "so nothing is rejected", which turns overload into an out-of-memory crash.</li><li><code>if</code> instead of <code>while</code> around a wait.</li><li>An empty catch block for <code>InterruptedException</code>.</li><li>Blocking I/O inside <code>CompletableFuture</code> stages with no executor, which starves the shared common pool.</li><li>A timed release that frees a seat unconditionally, undoing a purchase that completed in the meantime.</li></ul>` }
    ]
  }
];
