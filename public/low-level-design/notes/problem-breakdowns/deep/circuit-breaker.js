// Deep dives: Circuit Breaker (LLD practice set). Format: DeepDive in public/shared/notes.d.ts.
window.DEEP = window.DEEP || {};
DEEP["circuit-breaker"] = {
  hook: `<p>Once the breaker works, interviewers add twists to see whether the design bends without breaking. You rarely implement them in full; you show which class changes and why the rest doesn't. The immutable state object and the window behind one method are what make most of these one-class changes. Mid-level candidates may get one of these, senior candidates several, in more depth.</p>`,
  sections: [
    {
      id: "time-window",
      title: "\"Traffic to this dependency is bursty. Can the window cover the last N seconds instead?\"",
      kicker: "Follow-up: a different window",
      blocks: [
        { type: "text", html: `<p>At two calls a minute, a count window of 100 remembers failures from almost an hour ago and reacts slowly to a fresh outage. A time-based window always covers the last N seconds. Only two things change: the window becomes an interface that <code>CountWindow</code> already satisfies, and <code>Closed</code> holds that interface. The breaker's logic doesn't change, because it only ever asked the window for a <code>Snapshot</code>.</p>` },
        { type: "code", lang: "java", title: "Time-based window with atomic buckets", code: `// The window becomes an interface; CountWindow implements it unchanged.
interface OutcomeWindow { Snapshot record(boolean isFailure, boolean isSlow); }

record Closed(OutcomeWindow window) implements BreakerState {      // was: CountWindow
    public State kind() { return State.CLOSED; }
}

// In CircuitBreaker, the one other line that changes. The config gains windowSeconds; 0 keeps the count window.
private Closed newClosed() {
    return new Closed(config.windowSeconds() > 0
            ? new TimeWindow(config.windowSeconds(), clock)
            : new CountWindow(config.windowSize()));
}

/** Outcomes over the last N seconds: one bucket per second, reused round-robin. Lock-free when recording. */
final class TimeWindow implements OutcomeWindow {
    private static final class Bucket {
        final long second;
        final LongAdder calls = new LongAdder(), failures = new LongAdder(), slow = new LongAdder();
        Bucket(long second) { this.second = second; }
    }

    private final AtomicReferenceArray<Bucket> buckets;
    private final Clock clock;

    TimeWindow(int seconds, Clock clock) { this.buckets = new AtomicReferenceArray<>(seconds); this.clock = clock; }

    public Snapshot record(boolean isFailure, boolean isSlow) {
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
        return snapshot(now);
    }

    private Snapshot snapshot(long now) {
        long calls = 0, failures = 0, slow = 0;
        for (int i = 0; i < buckets.length(); i++) {
            Bucket b = buckets.get(i);
            if (b != null && now - b.second < buckets.length()) {      // skip buckets older than the window
                calls += b.calls.sum();
                failures += b.failures.sum();
                slow += b.slow.sum();
            }
        }
        return new Snapshot((int) calls, (int) failures, (int) slow);
    }
}` },
        { type: "callout", tone: "insight", title: "What lock-free costs you", html: `<p>Every piece is thread-safe: the slot array is an <code>AtomicReferenceArray</code>, replacing a stale bucket is a CAS so only one fresh bucket wins, and <code>LongAdder</code> spreads increments across cells so it never loses one and rarely contends. What you give up is a perfectly consistent snapshot: a thread that read a bucket just before it was replaced may add one outcome to the retired bucket, and the sum is not taken at a single instant. For "50% of recent calls" an error of one call is irrelevant; for an account balance it would not be.</p>` },
        { type: "keypoints", items: [
          "<code>minimumCalls</code> matters more here: at night a 10-second window may hold three calls. The validation <code>minimumCalls &lt;= windowSize</code> only applies to the count window.",
          "Only a failure or a slow call can push a rate up. A refinement skips the O(buckets) snapshot after a fast success.",
          "The choice can be per dependency: steady, hot traffic suits the count window; bursty or quiet traffic suits the time window."
        ] }
      ]
    },
    {
      id: "failure-rules",
      title: "\"A burst of 404s just opened the payments breaker. How do you stop that?\"",
      kicker: "Follow-up: classifying outcomes",
      blocks: [
        { type: "text", html: `<p>The breaker should open when the <em>dependency</em> is unhealthy, not when callers send it bad requests. If every 404 counts, one client looking up missing records can open the breaker for every user of a healthy service. The fix touches no class at all: only the failure predicate in that dependency's configuration.</p>` },
        { type: "table", title: "A sensible default classification", headers: ["Outcome", "Counts as", "Why"], rows: [
          ["Success within the slow threshold", "Success", "Healthy"],
          ["Success slower than the threshold", "Success, and slow", "Answering, but too slowly to be useful"],
          ["Timeout, connection refused or reset", "Failure", "Unreachable or overloaded"],
          ["HTTP 5xx", "Failure", "The dependency itself is failing"],
          ["HTTP 429 Too Many Requests", "Failure (usually)", "Overloaded; backing off helps it"],
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
          { title: "Timeout", tone: "info", html: `<p>Cuts a call off after a limit and turns it into an exception, which the predicate counts as a failure. It bounds thread usage, and it is the only way a <em>hung</em> call ever reports an outcome.</p>` },
          { title: "Slow-call threshold", tone: "info", html: `<p>Lets the call finish but marks it slow. It catches degradation before calls start timing out: a service whose latency climbs from 200 ms to 1.5 s is sick even if every call succeeds.</p>` }
        ] },
        { type: "callout", tone: "mistake", html: `<p>Relying on the slow-call threshold instead of a timeout. A call that hangs for ten minutes reports nothing for ten minutes, so the breaker learns nothing while threads pile up. Set connect and read timeouts in the client, and the slow threshold well below them. Async code wraps errors in <code>CompletionException</code>; unwrap before the predicate looks at the type.</p>` }
      ]
    },
    {
      id: "stuck-half-open",
      title: "\"What if a trial call never reports back?\"",
      kicker: "Follow-up: liveness",
      blocks: [
        { type: "problem", html: `<p>In HALF_OPEN all N permits are handed out, so new calls are rejected, and the state only changes when a trial reports. If one trial hangs without a timeout, or an async caller drops its permit, the breaker waits in HALF_OPEN for ever and the dependency never gets traffic again, even after it recovers.</p>` },
        { type: "text", html: `<p>Timeouts on every call are the first defence, since they make every trial report eventually. The second is a deadline on HALF_OPEN itself. Only the <code>HalfOpen</code> record and one branch of <code>tryAcquirePermission</code> change; the config gains <code>maxHalfOpenWait</code>.</p>` },
        { type: "code", lang: "java", title: "HalfOpen with a deadline", code: `record HalfOpen(AtomicInteger permitsLeft, AtomicInteger successes, Instant startedAt) implements BreakerState {
    HalfOpen(int permits, Instant startedAt) { this(new AtomicInteger(permits), new AtomicInteger(), startedAt); }
    public State kind() { return State.HALF_OPEN; }

    boolean tryTakePermit() {
        return permitsLeft.getAndUpdate(n -> n > 0 ? n - 1 : 0) > 0;
    }
}

// In tryAcquirePermission. The config gains maxHalfOpenWait, for example twice the call timeout.
case HalfOpen h -> {
    if (h.tryTakePermit()) return Optional.of(new Permit(h));
    if (clock.instant().isAfter(h.startedAt().plus(config.maxHalfOpenWait()))) {
        transition(h, newOpen());                   // the trials went silent: wait again, then probe afresh
    }
    return Optional.empty();
}
case Open o -> {
    if (clock.instant().isBefore(o.until())) return Optional.empty();
    transition(o, new HalfOpen(config.halfOpenPermits(), clock.instant()));
}` },
        { type: "keypoints", items: [
          "The deadline is checked lazily by the next rejected caller, so there is still no background thread.",
          "Many rejected callers may see the deadline pass at once; the CAS from the same <code>HalfOpen</code> object lets exactly one of them reopen it.",
          "A trial that reports after the deadline records against the abandoned <code>HalfOpen</code> and changes nothing, just like any late outcome."
        ] },
        { type: "quiz", q: "halfOpenPermits is 3. Three trial calls are admitted; the first fails while the other two are still running, and both of those later succeed. What happens?", options: ["The breaker closes, because 2 of the 3 trials succeeded", "The breaker reopens on the first failure; the two later successes are recorded against the discarded HalfOpen object and change nothing", "The breaker waits for all three, then decides by majority", "The failure is ignored because other trials are still in flight"], answer: 1, explain: `<p>The failing trial's thread does <code>compareAndSet(halfOpen, newOpen())</code> and wins. The two successes were admitted by that <code>HalfOpen</code> object, so they increment its counter, which nobody reads any more; even if one reached 3, its CAS would fail because the current state is the new <code>Open</code>.</p>` }
      ]
    },
    {
      id: "forced-states",
      title: "\"During an incident, ops want to force a breaker open, or switch it off. Where does that go?\"",
      kicker: "Follow-up: operator control",
      blocks: [
        { type: "text", html: `<p>Forcing a breaker open (to shed load from a dependency being repaired) or disabling it (to let traffic through while a bad threshold is fixed) are new states, so they are new records in the sealed interface. The compiler then flags both switches in <code>CircuitBreaker</code> until they handle them, which is exactly the review checklist you want.</p>` },
        { type: "code", lang: "java", title: "Operator overrides: forced and disabled states", code: `enum State { CLOSED, OPEN, HALF_OPEN, FORCED_OPEN, DISABLED }

sealed interface BreakerState permits Closed, Open, HalfOpen, ForcedOpen, Disabled { State kind(); }

record ForcedOpen() implements BreakerState { public State kind() { return State.FORCED_OPEN; } }
record Disabled() implements BreakerState   { public State kind() { return State.DISABLED; } }

// In CircuitBreaker: an operator command replaces whatever the breaker was doing.
void forceOpen() { override(new ForcedOpen()); }
void disable()   { override(new Disabled()); }
void reset()     { override(newClosed()); }

private void override(BreakerState to) {
    BreakerState from = state.getAndSet(to);
    notifyListeners(from.kind(), to.kind());
}

// The two switches gain cases:
//   tryAcquirePermission:  case ForcedOpen f -> { return Optional.empty(); }
//                          case Disabled d   -> { return Optional.of(new Permit(d)); }   // pass, never trip
//   record:                case ForcedOpen f -> { }
//                          case Disabled d   -> { }` },
        { type: "keypoints", items: [
          "<strong><code>getAndSet</code>, not <code>compareAndSet</code>.</strong> An operator's command must win whatever the current state is, so it doesn't compare.",
          "<strong>Automatic transitions can't undo it.</strong> They are all <code>compareAndSet</code> from a specific <code>Closed</code>, <code>Open</code> or <code>HalfOpen</code> object, and after an override the current state is none of those, so every pending automatic transition fails.",
          "<strong>Live thresholds follow the same idea.</strong> Hold the config in an <code>AtomicReference&lt;CircuitBreakerConfig&gt;</code> and read it whenever a new state object is created; the current <code>Closed</code> keeps its window until the next transition, or <code>reset()</code> applies the change at once."
        ] }
      ]
    },
    {
      id: "retries",
      title: "\"Where do retries and timeouts go relative to the breaker?\"",
      kicker: "Follow-up: composing policies",
      blocks: [
        { type: "text", html: `<p>A breaker is one layer of a resilience policy, and the order changes what each layer sees. The breaker itself doesn't change: retries become a separate <code>Retry</code> class that wraps it, and timeouts live in the client. Read from the outside in: <strong>retry, then circuit breaker, then timeout, then the call</strong>.</p>` },
        { type: "compare", title: "Retry outside or inside the breaker?", items: [
          { title: "Retry outside (usual)", tone: "ok", html: `<p>Every attempt passes through the breaker and is recorded, so it sees the real failure rate and trips quickly. Once it is open, the next attempt gets <code>CallNotPermittedException</code>, which the retry treats as final, so callers fail fast instead of sleeping through backoff.</p>` },
          { title: "Retry inside", tone: "warn", html: `<p>The breaker sees one outcome per logical call, after all attempts. Blips that a retry fixes never count, but a real outage takes several times longer to trip, and in HALF_OPEN one trial permit covers several attempts against a fragile dependency.</p>` }
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
        { type: "text", html: `<p><code>Retry</code> holds only final, immutable settings and keeps each attempt's state in local variables, so one instance serves every thread; <code>ThreadLocalRandom</code> gives each thread its own generator, so jitter needs no shared lock.</p>` },
        { type: "table", title: "What each layer is for", headers: ["Layer", "Protects against", "Note"], rows: [
          ["Timeout (innermost)", "One call hanging", "Turns a hang into a failure the breaker can count"],
          ["Circuit breaker", "Repeatedly calling a dependency that is down", "Fails fast; probes for recovery"],
          ["Retry (outermost)", "Transient, one-off errors", "Never retry CallNotPermittedException; only idempotent calls"],
          ["Fallback (at the edge)", "Having nothing to return", "Cached value, default, degraded response, or a clear error"],
          ["Bulkhead (alongside)", "One dependency using every thread", "A Semaphore per dependency caps calls in flight"]
        ] },
        { type: "callout", tone: "warning", html: `<p>Retry only idempotent operations. Retrying a stock lookup is harmless; retrying a payment charge after a timeout can charge twice unless the request carries an idempotency key the server deduplicates on. A bulkhead complements the breaker: the breaker reacts <em>after</em> failures accumulate, the bulkhead limits exposure <em>before</em>, so a slow dependency can tie up only its share of threads while the breaker gathers evidence.</p>` }
      ]
    },
    {
      id: "testing",
      title: "\"How would you test all this without sleeping?\"",
      kicker: "Follow-up: verification",
      blocks: [
        { type: "text", html: `<p>Every timing rule (the open wait, slow calls, time buckets, the half-open deadline) reads time from the injected <code>Clock</code>. No production class changes: tests pass a clock they can move, so a 30-second wait takes no time and a slow call is simulated by advancing the clock inside the call.</p>` },
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

    @Test void aSlowTrialCallReopens() {
        succeed(); succeed(); fail(); fail();
        clock.advance(Duration.ofSeconds(10));
        cb.execute(() -> { clock.advance(Duration.ofSeconds(2)); return "late"; });
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
        { type: "callout", tone: "tip", html: `<p>A concurrency test that passes once proves little. Run it hundreds of times so many interleavings are exercised, and for the CAS logic itself a stress harness such as jcstress explores reorderings a unit test never hits. A version with a check-then-decrement permit gate should fail this test quickly, which shows the test has teeth.</p>` }
      ]
    }
  ],
  takeaways: [
    "Follow-ups should touch one class: the window for bursty traffic, the config predicate for 404s, HalfOpen for a stuck probe, the sealed interface for operator states.",
    "A time-based window is lock-free with LongAdder buckets and a CAS per stale bucket, at the cost of slightly approximate snapshots; keep minimumCalls.",
    "Only errors that mean the dependency is unhealthy count as failures; slow successes count through a slow-call threshold; timeouts make hung calls report at all.",
    "Guard HALF_OPEN with call timeouts and a deadline, checked lazily by the next caller and applied with the same compareAndSet.",
    "Operator overrides use getAndSet, and pending automatic transitions fail because they compare against an object that is no longer current.",
    "Layer it as retry, then breaker, then timeout; never retry CallNotPermittedException; a bulkhead caps concurrency before the breaker trips.",
    "Inject a Clock and test every transition without sleeping; test the races by releasing many threads at once and asserting exact counts."
  ]
};
