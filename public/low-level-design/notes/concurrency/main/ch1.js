// Main tab: Chapter 1, Concurrency introduction. Format: DeepSection[] in public/shared/notes.d.ts.
window.MAIN = window.MAIN || {};
MAIN.ch1 = [
  {
    id: "two-questions",
    title: "Two questions for every field",
    kicker: "Mental model",
    blocks: [
      { type: "text", html: `<p>Picture each thread as an independent worker that can be paused at any instruction and resumed later, while other workers run in between. All of them can reach every object that is reachable from a shared reference: a service registered at startup, a cache, a static field. Their local variables are private, but the objects those variables point to may not be.</p><p>That picture leads to the single most useful habit in concurrency questions. For every field in your design, ask two things. <strong>Can more than one thread reach it?</strong> <strong>Does it change after the object is constructed?</strong> Only a yes to both creates risk.</p>` },
      { type: "table", headers: ["", "Never changes after construction", "Changes after construction"], rows: [
        ["Reached by one thread only", "Safe", "Safe: the state is confined"],
        ["Reached by many threads", "Safe, if published through a final field or before the threads start", "<strong>Needs a tool:</strong> an atomic, a concurrent collection or a lock"]
      ] },
      { type: "text", html: `<p>Only the bottom-right cell needs work. The cheapest fixes don't add locks at all: they move state out of that cell, either by making it immutable or by keeping it on one thread. Whatever is left in the cell is what you protect, and in most LLD designs that is a short list: a seat map, a stock count, a request queue.</p>` },
      { type: "callout", tone: "insight", html: `<p>You don't need multiple cores to have these bugs. Concurrency means tasks overlap in time; parallelism means they run at the same instant. A single core switching between threads can pause one halfway through an update and let another run, which is all a race needs.</p>` }
    ]
  },
  {
    id: "audit-a-class",
    title: "Auditing a class, field by field",
    kicker: "Worked example",
    blocks: [
      { type: "text", html: `<p>A URL shortener is used by every request thread. Its first draft has a domain string, a <code>HashMap</code> from short code to URL, and an <code>int nextId</code> that is incremented to make each code. Users can also claim a custom alias. Audit it with the two questions.</p>` },
      { type: "steps", items: [
        "<strong>domain:</strong> shared, but set in the constructor and never changed. Make it <code>final</code> and it is safe.",
        "<strong>nextId:</strong> shared and mutable. <code>nextId++</code> is a read, an add and a write, so two threads can read the same value and hand out the same code to two URLs.",
        "<strong>the code map:</strong> shared and mutable. Concurrent writes to a <code>HashMap</code> can corrupt its internals, and 'claim the alias if nobody has it' is a check followed by an act, so two users could both claim one alias.",
        "<strong>locals inside each method:</strong> each thread has its own copies, so they are safe."
      ] },
      { type: "code", lang: "java", title: "URL shortener made thread-safe", code: `final class UrlShortener {
    private final String domain;                                          // immutable
    private final AtomicLong nextId = new AtomicLong();                   // atomic counter
    private final ConcurrentHashMap<String, String> codeToUrl = new ConcurrentHashMap<>();

    UrlShortener(String domain) { this.domain = domain; }

    String shorten(String url) {
        while (true) {
            String code = Long.toString(nextId.incrementAndGet(), 36);   // unique per call
            if (codeToUrl.putIfAbsent(code, url) == null) return domain + "/" + code;
            // otherwise a custom alias already took this code: try the next id
        }
    }

    boolean claimAlias(String alias, String url) {
        return codeToUrl.putIfAbsent(alias, url) == null;                // atomic check-and-put
    }

    Optional<String> resolve(String code) {
        return Optional.ofNullable(codeToUrl.get(code));
    }
}` },
      { type: "text", html: `<p>It is thread-safe because every field is final, the two mutable ones are thread-safe types, and every compound step is a single atomic call. <code>incrementAndGet</code> hands each caller a distinct number, and <code>putIfAbsent</code> checks and inserts in one step, so exactly one caller wins any given code or alias. No method reads a value and then writes based on it outside one of those calls.</p>` }
    ]
  },
  {
    id: "atomicity-and-visibility",
    title: "The two guarantees: atomicity and visibility",
    kicker: "Core concepts",
    blocks: [
      { type: "text", html: `<p>Every fix in this course provides one or both of two guarantees. <strong>Atomicity</strong> means other threads see a multi-step operation either not started or finished, never halfway. <strong>Visibility</strong> means a value written by one thread is actually seen by another. Without some form of synchronisation, CPU caches and compiler reordering allow a thread to keep reading an old value indefinitely, so visibility is a real problem on its own, not a side note.</p>` },
      { type: "table", headers: ["Tool", "Atomic compound steps?", "Visibility?", "Typical use"], rows: [
        ["<code>final</code> field", "Not needed: it never changes", "Yes, once the constructor finishes", "Configuration, immutable values"],
        ["<code>volatile</code>", "No", "Yes", "A stop flag, publishing an immutable object"],
        ["<code>AtomicLong</code>, <code>AtomicReference</code>", "Yes, for one variable", "Yes", "Counters, swapping one reference"],
        ["<code>ConcurrentHashMap</code> methods", "Yes, per call on one key", "Yes", "Shared maps via putIfAbsent, compute, merge"],
        ["<code>synchronized</code> or a lock", "Yes, for any block", "Yes", "Invariants that span several fields"],
        ["<code>BlockingQueue</code> or an executor", "Yes, per hand-off", "Yes: the sender's writes are visible to the receiver", "Passing work between threads"]
      ] },
      { type: "callout", tone: "tip", html: `<p>The sentence to have ready: <em>"A lock gives me atomicity and visibility; volatile gives only visibility, so I use it for flags, never for counters."</em></p>` }
    ]
  },
  {
    id: "one-system-three-families",
    title: "One system, all three problem families",
    kicker: "Classifying",
    blocks: [
      { type: "text", html: `<p>Concurrency questions fall into three families, and naming the family tells you which toolbox to open. Real designs often contain all three. Take a movie booking system:</p>` },
      { type: "list", items: [
        "<strong>Correctness:</strong> two users try to hold seat A7 at the same moment. Holding a seat must be atomic, with a compare-and-set on the seat's status or a lock per show, so exactly one user wins.",
        "<strong>Coordination:</strong> after payment, the e-ticket email should go out without making the user wait. The request thread puts a job on a bounded queue, a small worker pool sends emails, and shutdown drains the queue before exiting.",
        "<strong>Scarcity:</strong> the payment provider accepts only 20 concurrent calls from us. A semaphore with 20 permits and a short acquire timeout caps them, and a user who can't get a permit is asked to retry rather than left hanging."
      ] },
      { type: "text", html: `<p>Tackle correctness first, because it decides whether the system is right at all. Coordination and scarcity decide whether it stays responsive and survives load.</p>` }
    ]
  },
  {
    id: "what-interviewers-expect",
    title: "What interviewers expect, and common mistakes",
    kicker: "Interview",
    blocks: [
      { type: "callout", tone: "interview", title: "A short answer that covers the essentials", html: `<p><em>"The shared mutable state is the code map and the id counter. Generating an id is a read-modify-write and claiming an alias is check-then-act, so both must be atomic. I'll use an AtomicLong and ConcurrentHashMap.putIfAbsent, which needs no locks I manage myself. To test it, I'd start fifty threads together with a latch and assert that no two URLs got the same code."</em></p>` },
      { type: "list", title: "Mistakes that lose points", items: [
        "<strong>Synchronizing everything.</strong> Correct, but it serialises the whole object and hides which invariant you are protecting.",
        "<strong>A volatile counter.</strong> <code>count++</code> on a volatile field still loses updates.",
        "<strong>Guarding writes but not reads.</strong> An unsynchronised read can see stale or half-updated state.",
        "<strong>A new thread per request.</strong> Unbounded threads exhaust memory; use an executor.",
        "<strong>Assuming virtual threads remove races.</strong> They make blocking cheap; shared state needs exactly the same protection.",
        "<strong>Slow work inside a lock.</strong> A network call while holding a lock makes every other thread wait for it."
      ] }
    ]
  }
];
