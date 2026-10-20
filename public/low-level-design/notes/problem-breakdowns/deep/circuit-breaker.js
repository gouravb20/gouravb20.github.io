// Deep dives: Circuit Breaker (LLD). Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP["circuit-breaker"] = {
  hook: `<p>A circuit breaker is three states and four arrows, so the first version takes ten minutes. The rest of the interview is about the details that decide whether it works in production: which window measures "too many failures", which errors are allowed to count, how a slow dependency becomes a failure, and above all what happens when hundreds of threads reach the same decision in the same microsecond. Each section below takes one of those questions.</p>`,
  sections: [
    {
      id: "sliding-windows",
      title: "Count-based vs time-based windows, and minimum calls",
      kicker: "Trip conditions",
      blocks: [
        { type: "text", html: `<p>The simplest trip condition is <strong>N consecutive failures</strong>: one <code>AtomicInteger</code>, reset on success. It is easy to explain but brittle: a dependency failing 80% of the time will rarely produce 5 failures in a row, so it never trips, while a short burst of 5 errors from a healthy one trips it at once. A <strong>failure rate over a sliding window</strong> measures what you actually care about.</p>` },
        { type: "compare", title: `Two ways to define "recent"`, items: [
          { title: "Count-based: the last N calls", tone: "info", html: `<p>A ring buffer of N outcomes plus running totals. Fixed memory, a fixed sample size, O(1) per update. But the time it covers depends on traffic: at 2 calls a minute, a window of 100 reaches back almost an hour, so the breaker reacts slowly and remembers old failures.</p>` },
          { title: "Time-based: the last N seconds", tone: "info", html: `<p>One bucket per second, reused round-robin; the rate is the sum over buckets still inside the window. It always reflects the last N seconds, whatever the traffic. But the sample size varies: at night a 10-second window may hold three calls.</p>` }
        ] },
        { type: "table", title: "Why minimumCalls matters", headers: ["Window holds", "Failures", "Rate", "minimumCalls = 20"], rows: [
          ["2 calls (just started)", "1", "50%", "Ignored: too small a sample"],
          ["8 calls (quiet night)", "4", "50%", "Ignored"],
          ["40 calls", "21", "52%", "Trips at a 50% threshold"],
          ["100 calls", "12", "12%", "Stays closed"]
        ] },
        { type: "text", html: `<p>A count-based window is the default choice for most dependencies, and the <code>synchronized</code> ring buffer from the Solution is fine for it. For a very hot breaker (tens of thousands of calls a second through one instance) a time-based window can be made lock-free on the record path: each bucket's counters are <code>LongAdder</code>s, which spread increments across internal cells so threads rarely contend, and a stale bucket is replaced with a CAS.</p>` },
        { type: "code", lang: "java", title: "Time-based window with atomic buckets", code: `/** Outcomes over the last N seconds: one bucket per second, reused round-robin. Lock-free when recording. */
final class TimeWindow {
    private static final class Bucket {
        final long second;
        final LongAdder calls = new LongAdder(), failures = new LongAdder(), slow = new LongAdder();
        Bucket(long second) { this.second = second; }
    }

    private final AtomicReferenceArray<Bucket> buckets;
    private final Clock clock;

    TimeWindow(int seconds, Clock clock) { this.buckets = new AtomicReferenceArray<>(seconds); this.clock = clock; }

    void record(boolean isFailure, boolean isSlow) {
        long now = clock.millis() / 1000;
        int i = (int) (now % buckets.length());
        Bucket b = buckets.get(i);
        while (b == null || b.second < now) {              // stale slot: one thread installs this second's bucket
            Bucket fresh = new Bucket(now);
            if (buckets.compareAndSet(i, b, fresh)) { b = fresh; break; }
            b = buckets.get(i);
        }
        b.calls.increment();
        if (isFailure) b.failures.increment();
        if (isSlow) b.slow.increment();
    }

    Snapshot snapshot() {
        long now = clock.millis() / 1000;
        long calls = 0, failures = 0, slow = 0;
        for (int i = 0; i < buckets.length(); i++) {
            Bucket b = buckets.get(i);
            if (b != null && now - b.second < buckets.length()) {
                calls += b.calls.sum();
                failures += b.failures.sum();
                slow += b.slow.sum();
            }
        }
        return new Snapshot((int) calls, (int) failures, (int) slow);
    }
}` },
        { type: "callout", tone: "insight", title: "What lock-free costs you", html: `<p>Each piece is thread-safe: the slot array is an <code>AtomicReferenceArray</code>, replacement is a CAS so only one fresh bucket wins, and <code>LongAdder</code> never loses an increment. What you give up is a perfectly consistent snapshot. A thread that read a bucket just before it was replaced may add one outcome to the retired bucket, and the sum over buckets is not taken at one instant. For a threshold like "50% of recent calls" an error of one or two calls is irrelevant, which is why this trade is acceptable here and would not be for, say, an account balance.</p>` },
        { type: "callout", tone: "tip", html: `<p>Only a failure or a slow call can push a rate up. With a time-based window you can skip the O(buckets) snapshot after a fast success and evaluate the trip condition only after bad outcomes.</p>` }
      ]
    },
    {
      id: "what-counts",
      title: "What counts as a failure, and slow calls",
      kicker: "Classifying outcomes",
      blocks: [
        { type: "text", html: `<p>The breaker should open when the <em>dependency</em> is unhealthy, not when callers send it bad requests. If every 404 counted, one client looking up missing records could open the breaker for all users of a perfectly healthy service.</p>` },
        { type: "table", title: "A sensible default classification", headers: ["Outcome", "Counts as", "Why"], rows: [
          ["Success within the slow threshold", "Success", "Healthy"],
          ["Success slower than the threshold", "Success, and slow", "Answering, but too slowly to be useful"],
          ["Timeout, connection refused or reset", "Failure", "The dependency is unreachable or overloaded"],
          ["HTTP 5xx", "Failure", "The dependency itself is failing"],
          ["HTTP 429 Too Many Requests", "Failure (usually)", "It is overloaded; backing off helps it"],
          ["HTTP 400, 404, validation or business errors", "Success", "It answered correctly; the request was the problem"]
        ] },
        { type: "code", lang: "java", title: "Per-dependency failure rules", code: `// HTTP client errors: the dependency answered, so they say nothing about its health.
Predicate<Throwable> serverTrouble = e -> switch (e) {
    case HttpStatusException h -> h.status() >= 500 || h.status() == 429;
    case CallTimeoutException t -> true;              // our timeout fired
    case UncheckedIOException io -> true;             // connection refused or reset
    default -> false;                                 // validation and business errors
};

CircuitBreakerConfig payments = CircuitBreakerConfig.builder()
        .recordAsFailure(serverTrouble)
        .slowCallThreshold(Duration.ofMillis(800))    // p99 is 300 ms; 800 ms means something is wrong
        .failureRatePercent(50).windowSize(50).minimumCalls(20)
        .build();` },
        { type: "compare", title: "Slow-call threshold vs timeout", items: [
          { title: "Timeout", tone: "info", html: `<p>Cuts a call off after a limit and turns it into an exception, which the predicate counts as a failure. It is what bounds thread usage, and the only way a <em>hung</em> call ever reports an outcome at all.</p>` },
          { title: "Slow-call threshold", tone: "info", html: `<p>Lets the call finish but marks it slow if it took longer than the threshold. It catches degradation before calls start timing out: a service whose latency climbs from 200 ms to 1.5 s is sick even if every call succeeds.</p>` }
        ] },
        { type: "callout", tone: "mistake", html: `<p>Relying on the slow-call threshold instead of a timeout. A call that hangs for ten minutes reports nothing for ten minutes, so the breaker learns nothing while threads pile up. Set the timeout in the client (connect and read timeouts) and the slow threshold well below it.</p>` },
        { type: "callout", tone: "tip", html: `<p>Unwrap before classifying: async code wraps errors in <code>CompletionException</code> or <code>ExecutionException</code>, and a predicate that only looks at the outer type would treat every async failure the same.</p>` }
      ]
    },
    {
      id: "atomic-transitions",
      title: "Atomic state transitions with CAS",
      kicker: "Concurrency",
      blocks: [
        { type: "problem", html: `<p>The obvious implementation keeps an enum and a few fields next to it. Each field is <code>volatile</code>, so every individual write is visible, yet the design is still broken: a transition has to change several fields <em>together</em>, and nothing makes the group atomic.</p>` },
        { type: "code", lang: "java", title: "Racy transitions with separate fields", code: `// Broken: fields that must change together, updated one at a time.
private volatile State state = State.CLOSED;
private volatile Instant openedAt;
private volatile int halfOpenCalls;
private final CountWindow window = new CountWindow(100);

boolean allow() {
    if (state == State.OPEN && clock.instant().isAfter(openedAt.plus(openWait))) {
        state = State.HALF_OPEN;          // 40 threads can all get here and each think it made the switch
        halfOpenCalls = 0;                // ...and each resets the trial counter, admitting far too many trials
    }
    return state != State.OPEN;
}

void onFailure() {
    Snapshot s = window.record(true, false);
    if (s.failureRateAtLeast(threshold)) {
        state = State.OPEN;               // two threads trip together: two "opened" events
        openedAt = clock.instant();       // a reader can see OPEN with a null or previous openedAt
    }
}` },
        { type: "steps", title: "The same interleavings with one immutable state object", items: [
          "Forty threads see the wait has elapsed. They all read the <em>same</em> <code>Open</code> object and call <code>compareAndSet(open, new HalfOpen(n))</code>. The first succeeds; the other 39 fail because the reference is no longer that object, loop, and read the new <code>HalfOpen</code>. One transition, one listener event, one trial counter.",
          "Two threads record failures that both cross the threshold. Both try <code>compareAndSet(closed, newOpen())</code> against the same <code>Closed</code> object; one wins. The loser's <code>Open</code> is garbage, never published.",
          "No reader can see OPEN with a stale reopen time, because the time is a field of the <code>Open</code> object itself: whoever sees the object sees its fields (they are final, and the reference was published by a volatile write).",
          "A call admitted in an earlier <code>Closed</code> finishes late. Its outcome goes into that object's window, which nobody reads any more, and any CAS it attempts names an object that is no longer current, so it fails."
        ] },
        { type: "table", title: "Where locks are, and why they are fine", headers: ["Shared state", "Mechanism", "Cost on the hot path"], rows: [
          ["Current state", "AtomicReference, CAS on transitions", "One volatile read per call; CAS only on the rare transition"],
          ["Count window", "synchronized, per window", "A few array writes under an uncontended or briefly contended lock"],
          ["Time window (alternative)", "AtomicReferenceArray + LongAdder", "Lock-free; slightly approximate snapshots"],
          ["Half-open counters", "AtomicInteger", "Only in HALF_OPEN, at most N calls"],
          ["Listeners", "CopyOnWriteArrayList", "Iteration without locking; only on transitions"]
        ] },
        { type: "callout", tone: "mistake", html: `<p>Making <code>execute</code> or <code>tryAcquirePermission</code> <code>synchronized</code>. It is correct, but every call to that dependency now queues behind one monitor, including the call itself if the lock is held across it, which turns the breaker into a bottleneck exactly when the dependency is slow. Lock nothing on admission; hold the window lock only for the bookkeeping, never while the call runs.</p>` },
        { type: "callout", tone: "interview", html: `<p>One way to say it: "I keep the state and everything that belongs to it in one immutable object, and change state only with <code>compareAndSet</code> from the object I based my decision on. That gives exactly one transition per trip, and late outcomes can't interfere because they refer to an object that is no longer current."</p>` }
      ]
    },
    {
      id: "half-open-permits",
      title: "Half-open: exactly N trial calls",
      kicker: "Concurrency",
      blocks: [
        { type: "text", html: `<p>HALF_OPEN exists to probe a recovering dependency gently. If 500 waiting threads all rush in the moment the wait expires, the probe becomes a stampede that knocks the dependency straight back over. So the breaker hands out exactly <code>halfOpenPermits</code> admissions, and the hand-out must be atomic.</p>` },
        { type: "code", lang: "java", title: "Half-open gate: racy vs atomic", code: `// Racy: check-then-act. Ten threads read 1, all pass the check, all decrement: ten trial calls.
if (permitsLeft.get() > 0) {
    permitsLeft.decrementAndGet();
    return true;
}
return false;

// Atomic: the read and the decrement are one step, and the count never goes below zero.
return permitsLeft.getAndUpdate(n -> n > 0 ? n - 1 : 0) > 0;` },
        { type: "table", title: "Decisions to state out loud", headers: ["Question", "Choice here", "Alternative"], rows: [
          ["When does it close?", "When all N trial calls succeed", "When the failure rate over the N trials is below the threshold"],
          ["When does it reopen?", "On the first failed or slow trial", "Only after all N trials report"],
          ["Who counts the last success?", "The thread whose incrementAndGet returns N", "A lock around a plain counter"],
          ["Extra callers in HALF_OPEN?", "Rejected like OPEN, or sent to the fallback", "Queued until the trials finish (rarely worth it)"]
        ] },
        { type: "callout", tone: "warning", title: "A breaker stuck in HALF_OPEN", html: `<p>All N permits are taken, so new calls are rejected, and the state only changes when a trial reports. If a trial call hangs, or an async caller drops its permit without reporting, the breaker waits forever. Guard both: every call has a timeout, so every trial eventually reports; and optionally store the time HALF_OPEN began in the <code>HalfOpen</code> record and, if it exceeds a maximum, CAS to a fresh <code>Open</code> so the cycle restarts.</p>` },
        { type: "quiz", q: "halfOpenPermits is 3. Three trial calls are admitted; the first fails while the other two are still running, and both of those later succeed. What happens?", options: ["The breaker closes, because 2 of the 3 trials succeeded", "The breaker reopens on the first failure; the two later successes are recorded against the discarded HalfOpen object and change nothing", "The breaker waits for all three, then decides by majority", "The failure is ignored because other trials are still in flight"], answer: 1, explain: `<p>The failing trial's thread does <code>compareAndSet(halfOpen, newOpen())</code> and wins. The two successes were admitted by that <code>HalfOpen</code> object, so they increment its counter, which no one reads any more; if one reached N its CAS would fail, because the current state is now the new <code>Open</code>.</p>` }
      ]
    },
    {
      id: "retries-and-timeouts",
      title: "Retries, timeouts, fallbacks and bulkheads",
      kicker: "Where the breaker sits",
      blocks: [
        { type: "text", html: `<p>A breaker is one layer of a resilience policy. The order of the layers changes what each one sees, so be ready to draw it: <strong>retry &rarr; circuit breaker &rarr; timeout &rarr; call</strong>, read from the outside in.</p>` },
        { type: "compare", title: "Retry outside or inside the breaker?", items: [
          { title: "Retry outside (usual)", tone: "ok", html: `<p>Every attempt passes through the breaker and is recorded, so the breaker sees the real failure rate and trips quickly. Once it is open, the next attempt gets <code>CallNotPermittedException</code>, which the retry must treat as final, so callers fail fast instead of sleeping through backoff.</p>` },
          { title: "Retry inside", tone: "warn", html: `<p>The breaker sees one outcome per logical call, after all attempts. Transient blips that a retry fixes never count, but a real outage takes several times longer to trip, and in HALF_OPEN one trial permit covers several attempts against a fragile dependency.</p>` }
        ] },
        { type: "code", lang: "java", title: "Retry outside the breaker", code: `final class Retry {
    private final int maxAttempts;
    private final Duration firstBackoff;
    private final Predicate<Throwable> retryable;

    Retry(int maxAttempts, Duration firstBackoff, Predicate<Throwable> retryable) {
        this.maxAttempts = maxAttempts;
        this.firstBackoff = firstBackoff;
        this.retryable = retryable;
    }

    <T> T execute(Supplier<T> call) {
        for (int attempt = 1; ; attempt++) {
            try {
                return call.get();
            } catch (CallNotPermittedException e) {
                throw e;                                           // the breaker is open: retrying only adds load
            } catch (RuntimeException e) {
                if (attempt == maxAttempts || !retryable.test(e)) throw e;
                sleep(firstBackoff.multipliedBy(1L << (attempt - 1)));   // 100 ms, 200 ms, 400 ms...
            }
        }
    }

    private static void sleep(Duration d) {
        long jitter = ThreadLocalRandom.current().nextLong(d.toMillis() / 2 + 1);   // spreads retries out
        try { Thread.sleep(d.toMillis() + jitter); }
        catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new IllegalStateException("interrupted", e); }
    }
}

// Each attempt goes through the breaker, so it sees every failure; the timeout is innermost.
int available(String sku) {
    return retry.execute(() -> inventory.execute(() -> stockClient.available(sku, Duration.ofSeconds(2))));
}` },
        { type: "text", html: `<p><code>Retry</code> holds only final, immutable configuration and keeps each attempt's state in local variables, so one instance can serve every thread; <code>ThreadLocalRandom</code> gives each thread its own generator, so jitter needs no shared lock.</p>` },
        { type: "table", title: "What each layer is for", headers: ["Layer", "Protects against", "Note"], rows: [
          ["Timeout (innermost)", "One call hanging", "Turns a hang into a failure the breaker can count"],
          ["Circuit breaker", "Repeatedly calling a dependency that is down", "Fails fast; probes for recovery"],
          ["Retry (outermost)", "Transient, one-off errors", "Never retry CallNotPermittedException; only idempotent calls"],
          ["Fallback (at the edge)", "Having nothing to return", "Cached value, default, degraded response, or a clear error"],
          ["Bulkhead (alongside)", "One dependency using every thread", "Caps concurrent calls per dependency"]
        ] },
        { type: "callout", tone: "warning", html: `<p>Retry only idempotent operations. Retrying a stock lookup is harmless; retrying a payment charge after a timeout can charge twice unless the request carries an idempotency key the server deduplicates on.</p>` },
        { type: "callout", tone: "insight", title: "Bulkhead: the related pattern", html: `<p>A breaker reacts <em>after</em> failures accumulate. A bulkhead limits exposure <em>up front</em>: a <code>Semaphore</code> per dependency (or a dedicated thread pool) caps how many calls can be in flight at once, so even before the breaker trips, a slow dependency can tie up at most its share of threads. The two complement each other: the bulkhead bounds the damage while the breaker gathers evidence.</p>` }
      ]
    },
    {
      id: "testing",
      title: "Testing with a controllable clock",
      kicker: "Verification",
      blocks: [
        { type: "text", html: `<p>Every timing rule in the breaker (the open wait, slow calls, time-based buckets) reads time from the injected <code>Clock</code>. Tests pass a clock they can move, so a 30-second wait takes no time and a "slow" call is simulated by advancing the clock inside the call. No <code>Thread.sleep</code>, no flaky timing.</p>` },
        { type: "code", lang: "java", title: "A clock tests can move", code: `final class MutableClock extends Clock {
    private final AtomicReference<Instant> now;

    MutableClock(Instant start) { now = new AtomicReference<>(start); }

    void advance(Duration d) { now.updateAndGet(t -> t.plus(d)); }     // atomic, so test threads may share it
    @Override public Instant instant() { return now.get(); }
    @Override public ZoneId getZone() { return ZoneOffset.UTC; }
    @Override public Clock withZone(ZoneId zone) { return this; }
}` },
        { type: "code", lang: "java", title: "State machine tests", code: `class CircuitBreakerTest {
    private final MutableClock clock = new MutableClock(Instant.parse("2026-01-01T00:00:00Z"));
    private final CircuitBreakerConfig config = CircuitBreakerConfig.builder()
            .windowSize(4).minimumCalls(4).failureRatePercent(50)
            .slowCallThreshold(Duration.ofSeconds(1)).slowRatePercent(50)
            .openWait(Duration.ofSeconds(10)).halfOpenPermits(2)
            .build();
    private final CircuitBreaker cb = new CircuitBreaker("pricing", config, clock);

    @Test void staysClosedBelowMinimumCalls() {
        fail(); fail(); fail();                                // 100% failed, but only 3 of the 4 calls needed
        assertEquals(State.CLOSED, cb.state());
    }

    @Test void opensAtThresholdThenRecoversThroughHalfOpen() {
        succeed(); succeed(); fail(); fail();                  // 2 of 4 = 50%
        assertEquals(State.OPEN, cb.state());
        assertThrows(CallNotPermittedException.class, this::succeed);

        clock.advance(Duration.ofSeconds(10));
        succeed();                                             // the first call after the wait moves to HALF_OPEN
        assertEquals(State.HALF_OPEN, cb.state());
        succeed();                                             // both trial calls succeeded
        assertEquals(State.CLOSED, cb.state());
    }

    @Test void aFailedTrialCallReopens() {
        succeed(); succeed(); fail(); fail();
        clock.advance(Duration.ofSeconds(10));
        fail();
        assertEquals(State.OPEN, cb.state());
    }

    @Test void slowSuccessesTripIt() {
        for (int i = 0; i < 4; i++) cb.execute(() -> { clock.advance(Duration.ofSeconds(2)); return "late"; });
        assertEquals(State.OPEN, cb.state());
    }

    private void succeed() { cb.execute(() -> "ok"); }

    private void fail() {
        assertThrows(IllegalStateException.class, () -> cb.execute(() -> { throw new IllegalStateException("down"); }));
    }
}` },
        { type: "code", lang: "java", title: "Exactly N trial calls under contention", code: `@Test void halfOpenAdmitsExactlyThePermittedTrialCalls() throws Exception {
    AtomicInteger toHalfOpen = new AtomicInteger();
    cb.addListener((name, from, to) -> { if (to == State.HALF_OPEN) toHalfOpen.incrementAndGet(); });
    succeed(); succeed(); fail(); fail();                      // OPEN
    clock.advance(Duration.ofSeconds(10));

    int threads = 64;
    ExecutorService pool = Executors.newFixedThreadPool(threads);
    CountDownLatch go = new CountDownLatch(1);
    List<Future<Boolean>> results = new ArrayList<>();
    for (int i = 0; i < threads; i++) {
        results.add(pool.submit(() -> { go.await(); return cb.tryAcquirePermission().isPresent(); }));
    }
    go.countDown();                                            // release every thread at once
    int admitted = 0;
    for (Future<Boolean> f : results) if (f.get()) admitted++;
    pool.shutdown();

    assertEquals(config.halfOpenPermits(), admitted);          // exactly 2, however the threads interleave
    assertEquals(1, toHalfOpen.get());                         // and exactly one OPEN to HALF_OPEN transition
}` },
        { type: "callout", tone: "tip", html: `<p>A concurrency test that passes once proves little. Run it in a loop (hundreds of repetitions) so many interleavings are exercised, and for the CAS logic itself a stress harness such as jcstress explores reorderings a plain unit test never hits. A version with the racy check-then-decrement should fail this test quickly, which is a good way to show the test has teeth.</p>` }
      ]
    }
  ],
  takeaways: [
    "Trip on a failure rate over a sliding window, not consecutive failures, and ignore the rate until minimumCalls outcomes are recorded.",
    "Count-based windows have a fixed sample size; time-based windows always cover recent time. LongAdder buckets make the time-based one lock-free at the cost of slightly approximate snapshots.",
    "Only errors that mean the dependency is unhealthy count as failures; slow successes count through a slow-call threshold, and timeouts make hung calls report at all.",
    "Keep the state and its data in one immutable object in an AtomicReference and change it only with compareAndSet from the object the decision was based on: one transition per trip, stale outcomes harmless.",
    "Hand out half-open permits with one atomic step (getAndUpdate), never check-then-decrement, and guard against permits that never report.",
    "Layer it as retry, then breaker, then timeout; never retry CallNotPermittedException; a bulkhead caps concurrency before the breaker trips.",
    "Inject a Clock and test every transition without sleeping; test concurrency by releasing many threads at once and asserting exact counts."
  ]
};
