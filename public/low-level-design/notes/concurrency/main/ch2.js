// Main tab: Chapter 2, Correctness. Format: DeepSection[] in public/shared/notes.d.ts.
window.MAIN = window.MAIN || {};
MAIN.ch2 = [
  {
    id: "start-from-the-invariant",
    title: "Start from the invariant",
    kicker: "Mental model",
    blocks: [
      { type: "text", html: `<p>A correctness question always reduces to one thing: is there an interleaving of threads that breaks a rule the system must keep? So begin by naming the rule, the <strong>invariant</strong>, in plain words: "stock never goes below zero", "a seat has at most one owner", "every reserved unit belongs to exactly one order". Then find every code path that reads the state the rule depends on and writes based on what it read. Those paths are your critical sections.</p><p>Here is a flash sale with one unit left and two buyers. Each buyer's code reads the stock, checks it is at least one, and writes the stock minus one.</p>` },
      { type: "table", title: "One unit, two buyers, one unlucky interleaving", headers: ["Step", "Buyer A", "Buyer B", "Stock"], rows: [
        ["1", "Reads stock: 1", "", "1"],
        ["2", "", "Reads stock: 1", "1"],
        ["3", "1 is enough, writes 0", "", "0"],
        ["4", "", "1 is enough, writes 0", "0"],
        ["Result", "Gets the item", "Also gets the item", "Two sold, one existed"]
      ] },
      { type: "text", html: `<p>Both race shapes are in that table. The check ("is there enough?") goes stale before the act ("take it"): that is <strong>check-then-act</strong>. And the write is computed from an earlier read: that is <strong>read-modify-write</strong>. A fix has to make the read, the check and the write one indivisible step.</p>` }
    ]
  },
  {
    id: "the-fix-ladder",
    title: "Climb the ladder: simplest correct tool first",
    kicker: "Choosing a tool",
    blocks: [
      { type: "steps", items: [
        "<strong>Remove the sharing.</strong> If the state can be immutable, or owned by a single thread, there is nothing to protect.",
        "<strong>One variable, or one key at a time:</strong> use an atomic class or a <code>ConcurrentHashMap</code> compound method. No lock to manage.",
        "<strong>An invariant across several fields:</strong> one lock around every read and write of all of them, usually <code>synchronized</code>.",
        "<strong>Need to time out, be interrupted or wait on conditions:</strong> <code>ReentrantLock</code>, unlocked in <code>finally</code>.",
        "<strong>Conflicts are rare and holding a lock during the work is costly:</strong> optimistic concurrency, which reads a version and commits only if it hasn't changed."
      ] },
      { type: "text", html: `<p>The flash sale only needs step two. Each SKU's count is independent, so an atomic counter per SKU with a <strong>compare-and-set loop</strong> is enough: read the current value, check it, and swap in the new value only if nobody changed it in the meantime. If someone did, the swap fails and you retry with the fresh value.</p>` },
      { type: "code", lang: "java", title: "Flash-sale stock with a CAS loop per SKU", code: `final class Inventory {
    private final ConcurrentHashMap<String, AtomicInteger> stock = new ConcurrentHashMap<>();

    void restock(String sku, int qty) {
        if (qty <= 0) throw new IllegalArgumentException("qty must be positive");
        stock.computeIfAbsent(sku, k -> new AtomicInteger()).addAndGet(qty);
    }

    boolean reserve(String sku, int qty) {
        if (qty <= 0) throw new IllegalArgumentException("qty must be positive");
        AtomicInteger count = stock.get(sku);
        if (count == null) return false;
        while (true) {
            int have = count.get();
            if (have < qty) return false;                       // not enough: nothing changed
            if (count.compareAndSet(have, have - qty)) return true;
            // another buyer changed the count between get and CAS: retry with the new value
        }
    }
}` },
      { type: "text", html: `<p>Why it is safe: <code>computeIfAbsent</code> creates at most one counter per SKU even when two restocks race, and the compare-and-set only succeeds if the count still equals the value that was checked. In the interleaving above, buyer B's swap from 1 to 0 fails because the count is already 0; B re-reads, sees 0 and returns false. Buyers of different SKUs never touch the same counter, so they never wait on each other.</p>` }
    ]
  },
  {
    id: "guard-the-invariant",
    title: "When one atomic isn't enough",
    kicker: "Multi-field invariants",
    blocks: [
      { type: "text", html: `<p>Now the interviewer adds a rule: a reservation belongs to an order and can be released if checkout fails. Two things must change together, the available count and the record of who holds what. Two separately atomic operations leave a gap where the count has dropped but no hold is recorded, and a double release could add units back twice. When an invariant spans several fields, guard all of them with one lock.</p>` },
      { type: "code", lang: "java", title: "Holds and availability under one lock", code: `final class SkuStock {
    private int available;                                       // guarded by this
    private final Map<String, Integer> heldByOrder = new HashMap<>(); // guarded by this

    SkuStock(int available) { this.available = available; }

    synchronized boolean hold(String orderId, int qty) {
        if (qty <= 0 || qty > available || heldByOrder.containsKey(orderId)) return false;
        available -= qty;
        heldByOrder.put(orderId, qty);
        return true;
    }

    synchronized void release(String orderId) {
        Integer qty = heldByOrder.remove(orderId);
        if (qty != null) available += qty;                       // a second release does nothing
    }

    synchronized int available() { return available; }           // reads take the lock too
}` },
      { type: "keypoints", items: [
        "The invariant is <em>available plus everything held equals the units received</em>. Every method that touches either field holds the same lock, so no thread ever sees one updated without the other.",
        "The plain <code>HashMap</code> is safe here because it is only touched inside the lock. A concurrent map would add nothing.",
        "The lock is per SKU, which is the granularity choice: holds on different products run in parallel.",
        "Nothing slow happens inside the lock. Payment and email happen after <code>hold</code> returns."
      ] }
    ]
  },
  {
    id: "two-locks",
    title: "Two locks: the deadlock rule",
    kicker: "Hazard",
    blocks: [
      { type: "text", html: `<p>Per-SKU locks are fine until one operation needs two of them, for example swapping one product for another in an order as a single step. If one thread locks SKU A then waits for B while another locks B then waits for A, both wait forever. That is a <strong>deadlock</strong>, and it is the standard follow-up the moment your design has more than one lock.</p>` },
      { type: "steps", title: "How to handle an operation that spans two locks", items: [
        "<strong>Ask whether it really must be atomic across both.</strong> Often it doesn't: hold the new SKU first, then release the old one, each under its own lock. No thread ever holds two locks, so no deadlock is possible.",
        "<strong>If it must be atomic, acquire in one global order</strong>, such as by SKU id. Every thread takes the lower id first, so a cycle of waiting threads can't form.",
        "<strong>If no natural order exists,</strong> use <code>tryLock</code> with a timeout on the second lock, release everything on failure, back off for a random interval, and retry.",
        "<strong>Never call unknown code while holding a lock.</strong> A callback that takes another lock is how deadlocks sneak into otherwise ordered designs."
      ] },
      { type: "callout", tone: "warning", html: `<p>Back-off without randomness can produce <strong>livelock</strong>: two threads release, wait the same time, collide again, and repeat forever while technically running. Add jitter to the wait.</p>` }
    ]
  },
  {
    id: "the-answer",
    title: "What the interviewer wants to hear",
    kicker: "Interview",
    blocks: [
      { type: "callout", tone: "interview", title: "Two buyers, one item: a complete answer", html: `<p><em>"The invariant is that stock never goes negative. Reserve does a check and a decrement, so it must be atomic. Each SKU is independent, so I'll keep an AtomicInteger per SKU and decrement it with a compare-and-set loop; no lock, and different SKUs don't contend. If reservations also have to be tracked per order, the count and the holds change together, so I'd switch to a synchronized class per SKU. If an operation ever needs two SKUs at once, I'd lock them in id order."</em></p>` },
      { type: "list", title: "Mistakes that lose points", items: [
        "<strong>get, then put on a ConcurrentHashMap.</strong> Each call is safe; the pair isn't. Use <code>putIfAbsent</code>, <code>compute</code> or <code>merge</code>.",
        "<strong>Locking writes but not reads.</strong> The reader can see a stale or half-updated state.",
        "<strong>Locking on different objects.</strong> An instance <code>synchronized</code> method and a <code>static synchronized</code> one use different locks.",
        "<strong>Calling the payment provider inside the lock.</strong> Every other buyer waits for the network.",
        "<strong>Jumping to lock-free cleverness.</strong> Start with the simplest correct tool and go finer only when contention is shown."
      ] }
    ]
  }
];
