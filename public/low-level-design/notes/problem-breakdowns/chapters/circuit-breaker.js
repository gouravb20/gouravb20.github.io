// LLD problem breakdown: Circuit Breaker. Format: Chapter in public/shared/notes.d.ts; shared helpers in data-part2.js.
// Imports are omitted in the code.
(function () {
const { levels, PRACTICE_TIP } = LLD_PROBLEMS_KIT;

window.DATA.chapters.push({
    id: `circuit-breaker`, part: 2, number: 0, difficulty: `medium`,
    title: `Circuit Breaker: fail fast when a dependency is down, with atomic state changes`,
    overview: `A service calls a payments API, a pricing API and an inventory API. When one of them goes down, every thread that calls it waits for a timeout and the whole service stalls. A circuit breaker wraps those calls: while the dependency is healthy, calls pass and their outcomes are recorded; when too many recent calls fail or run slow it <strong>opens</strong> and rejects calls in microseconds; after a wait it lets a few <strong>trial calls</strong> through and closes only if they succeed. This page works the problem in interview order: clarify the requirements, find the entities, design the classes top down, implement the window and the breaker (comparing a weak, a better and a strong option at each decision), verify with a trace against a fake clock, then handle follow-ups. The state machine is small; the real test is <strong>concurrency</strong>. The design lands on one <strong>immutable state object swapped by compare-and-set</strong>, a sliding window with a minimum-calls guard, exactly N half-open permits, and a <strong>registry</strong> with one breaker per dependency.`,
    problem: [
      { id: `understanding`, title: `What a circuit breaker does`, kicker: `The problem`, blocks: [
        { type: `problem`, html: `<p>A service depends on several remote APIs. When one of them is down or very slow, every request thread that calls it waits for a timeout, the thread pool fills, and the healthy parts of the service stop answering too. Build the component that notices a sick dependency, stops sending it traffic for a while, and finds out cheaply when it has recovered, so callers fail in microseconds instead of seconds.</p>` },
        { type: `text`, html: `<p>The prompt is usually one line: <em>"Design a circuit breaker library that services wrap around calls to their dependencies."</em> Everyone knows the three states; the first few minutes go into pinning down what "too many failures" means, which errors count, and how many threads share one breaker.</p>` },
        { type: `diagram`, title: `Three states, four transitions`, caption: `CLOSED trips to OPEN when the failure or slow-call rate crosses its threshold. OPEN moves to HALF_OPEN on the first call after the wait. HALF_OPEN closes when every trial call succeeds and reopens on the first failed or slow trial.`, svg: `<svg viewBox="0 0 640 290" role="img" aria-label="Circuit breaker states CLOSED, OPEN and HALF_OPEN with the transitions between them">
<defs><marker id="cb-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="30" y="40" width="170" height="60" rx="10" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="115" y="66" text-anchor="middle" font-size="14" font-weight="700" style="fill: var(--dg-ink)">CLOSED</text>
<text x="115" y="86" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">calls pass, recorded</text>
<rect x="440" y="40" width="170" height="60" rx="10" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)" stroke-width="2"/>
<text x="525" y="66" text-anchor="middle" font-size="14" font-weight="700" style="fill: var(--dg-ink)">OPEN</text>
<text x="525" y="86" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">fail fast or fallback</text>
<rect x="235" y="200" width="170" height="60" rx="10" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="2"/>
<text x="320" y="226" text-anchor="middle" font-size="14" font-weight="700" style="fill: var(--dg-ink)">HALF_OPEN</text>
<text x="320" y="246" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">N trial calls only</text>
<line x1="200" y1="62" x2="436" y2="62" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#cb-arrow)"/>
<text x="318" y="52" text-anchor="middle" font-size="12" style="fill: var(--dg-ink)">failure or slow rate at threshold</text>
<text x="318" y="80" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">(after minimum calls)</text>
<line x1="470" y1="100" x2="352" y2="196" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#cb-arrow)"/>
<text x="400" y="150" text-anchor="end" font-size="12" style="fill: var(--dg-ink)">wait elapsed</text>
<line x1="395" y1="200" x2="560" y2="104" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#cb-arrow)"/>
<text x="492" y="160" text-anchor="start" font-size="12" style="fill: var(--dg-ink)">a trial call fails</text>
<line x1="275" y1="200" x2="150" y2="104" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#cb-arrow)"/>
<text x="205" y="160" text-anchor="end" font-size="12" style="fill: var(--dg-ink)">all trials succeed</text>
</svg>` }
      ] },
      { id: `clarifying`, title: `Clarifying questions`, kicker: `Step 1: requirements`, blocks: [
        { type: `text`, html: `<p>Work through four kinds of question: <strong>what the breaker must do</strong>, <strong>what happens with bad input</strong> (bad configuration, errors that are not outages), <strong>what is deliberately left out</strong>, and <strong>what might be added later</strong>. Two or three minutes here decide the trip rule, the API and how much of the design is about concurrency.</p>` },
        { type: `table`, headers: [`You ask`, `A typical answer`, `What it decides`], rows: [
          [`What does "too many failures" mean: N in a row, or a rate?`, `A rate over recent calls`, `A sliding window of outcomes with running totals`],
          [`Should two failures right after startup trip it?`, `No: require a minimum number of calls first`, `A <code>minimumCalls</code> setting checked before any rate`],
          [`Do slow calls matter if they succeed?`, `Yes: above a threshold they count as slow`, `Every call is timed; a slow-call rate sits next to the failure rate`],
          [`Does every exception count? What about a 404?`, `No: each dependency decides which errors mean "unhealthy"`, `A <code>Predicate&lt;Throwable&gt;</code> in the configuration`],
          [`What if someone configures a 150% threshold, or more minimum calls than the window holds?`, `Reject it when the breaker is built`, `Validation once, in the configuration's constructor`],
          [`How many threads call through one breaker at once?`, `Hundreds`, `No breaker-wide lock on the hot path; transitions by compare-and-set`],
          [`Synchronous callers only, or async code too?`, `Both`, `<code>execute</code> plus <code>tryAcquirePermission</code>, <code>onSuccess</code>, <code>onError</code>`],
          [`One breaker for everything, one per dependency, or shared across service instances?`, `One per dependency, local to each process`, `A registry keyed by name; no distributed state`]
        ] },
        { type: `callout`, tone: `insight`, title: `How many threads share one breaker?`, html: `<p>This is the question that changes the problem. With one thread, a circuit breaker is an enum, a counter and an <code>if</code>. With hundreds, the same few lines hide races: fifty threads all deciding to leave OPEN, a trial counter reset fifty times, a reader seeing OPEN with last time's reopen time. Asking it out loud tells the interviewer you know where the difficulty is, and it justifies spending your design time on atomic state changes rather than on more states.</p>` }
      ] },
      { id: `final-requirements`, title: `Final requirements`, kicker: `Step 1: requirements`, blocks: [
        { type: `code`, lang: `text`, title: `Final requirements`, code: `Requirements
  1. execute(call) runs a call through the breaker, or rejects it at once with
     CallNotPermittedException; executeWithFallback(call, fallback) returns a
     fallback value instead of throwing.
  2. Three states. CLOSED: calls pass and outcomes are recorded. OPEN: calls are
     rejected until a wait elapses. HALF_OPEN: a fixed number of trial calls;
     all succeed: CLOSED; any fails or is slow: OPEN again.
  3. CLOSED trips to OPEN when the failure rate or the slow-call rate over the
     last N calls reaches its threshold, once at least M calls are recorded.
  4. A call that takes longer than a threshold counts as slow, even if it succeeded.
  5. A per-breaker predicate decides which exceptions are failures; the rest
     count as successes, because the dependency did answer.
  6. Async callers can take a permit, make the call themselves and report the
     outcome with the elapsed time.
  7. One breaker per dependency, created on first use with its own configuration
     or the defaults; listeners hear every state change.
  8. Invalid configuration (percentages outside 1-100, minimumCalls larger than
     the window, no trial permits) is rejected when the breaker is built.
  9. Safe under hundreds of concurrent callers: no breaker-wide lock on the
     CLOSED path, every transition happens exactly once, and HALF_OPEN admits
     exactly the configured number of trial calls.
 10. Time comes from an injected Clock, so tests are deterministic.

Out of scope
  - Sharing breaker state across service instances
  - Changing configuration at run time, forcing a breaker open by hand
  - Metrics dashboards (listeners are the hook for them)` },
        { type: `callout`, tone: `tip`, html: PRACTICE_TIP }
      ] }
    ],
    solution: [
      { id: `entities`, title: `Core entities`, kicker: `Step 2: entities`, blocks: [
        { type: `text`, html: `<p>Scan the requirements for nouns that hold state or enforce rules. Several candidates appear, and some of them are better as a field, a parameter or an existing JDK type than as a class of your own.</p>` },
        { type: `table`, headers: [`Candidate`, `Verdict`, `Why`], rows: [
          [`Call`, `Not a class: a <code>Supplier&lt;T&gt;</code>`, `The breaker never inspects the call; it only runs it and times it`],
          [`Outcome`, `Not a class: two booleans`, `"Failed?" and "slow?" are all the window needs; the exception itself goes to the predicate and is thrown on`],
          [`Failure rule`, `Not a class: a <code>Predicate&lt;Throwable&gt;</code> in the config`, `One function per dependency; no state, no hierarchy`],
          [`Timer that reopens the breaker`, `Not a class`, `No background thread: the first call after the wait checks the clock and moves to HALF_OPEN itself`],
          [`Clock`, `The JDK's <code>java.time.Clock</code>, injected`, `Already exists; injecting it is what makes tests instant and deterministic`],
          [`Configuration`, `A class (a record)`, `Thresholds, window size, waits and the predicate, validated once and shared read-only`],
          [`Sliding window`, `A class`, `Holds the last N outcomes and running totals; enforces "a rate over recent calls"`],
          [`State`, `A class per state`, `Each state carries different data: the window, the reopen time, the trial counters`],
          [`CircuitBreaker`, `A class`, `Admits calls, records outcomes and performs transitions`],
          [`Registry`, `A class`, `One breaker per dependency name, created on first use`]
        ] },
        { type: `table`, title: `The entities we keep`, headers: [`Entity`, `Responsibility`], rows: [
          [`CircuitBreaker`, `The entry point for one dependency. Decides whether a call may run, records how it went, and switches state. Knows nothing about other dependencies.`],
          [`CircuitBreakerConfig`, `Immutable settings for one breaker, with a builder and defaults. Rejects nonsense at construction.`],
          [`CountWindow`, `The last N outcomes in a ring buffer with running totals; answers "how many calls, failures and slow calls recently?" in O(1).`],
          [`BreakerState`, `<code>Closed</code>, <code>Open</code> and <code>HalfOpen</code>: one immutable object per period spent in a state, carrying only that state's data.`],
          [`Permit`, `Proof that a call was admitted, remembering which state object admitted it.`],
          [`CircuitBreakerRegistry`, `Hands out one breaker per dependency name and attaches the shared listeners.`],
          [`StateListener`, `Hears every transition (metrics, logs, alerts) without the breaker knowing who is listening.`]
        ] },
        { type: `callout`, tone: `tip`, html: `<p><code>Permit</code> looks like ceremony until you ask "a call admitted in CLOSED finishes after the breaker has opened: where does its outcome go?" Say the question out loud when you list entities; the answer (the state that admitted it) is one of the strongest signals in this interview.</p>` }
      ] },
      { id: `breaker-design`, title: `Class design: CircuitBreaker`, kicker: `Step 3: class design, top down`, blocks: [
        { type: `text`, html: `<p>Start from the class callers talk to and derive its state and methods from the requirements. For each requirement ask: what must the breaker remember, and what must it let callers do?</p>` },
        { type: `table`, headers: [`Requirement`, `What the breaker remembers`], rows: [
          [`"Three states"`, `The current state, and that state's data (window, reopen time or trial counters)`],
          [`"Its own configuration"`, `A <code>CircuitBreakerConfig</code>, fixed at construction`],
          [`"Calls slower than a threshold"; "after a wait"`, `A <code>Clock</code>, to time calls and the open wait`],
          [`"Listeners hear every state change"`, `A list of <code>StateListener</code>s`],
          [`"Rejected with an error naming the breaker"`, `Its name`]
        ] },
        { type: `table`, headers: [`Need`, `Method`], rows: [
          [`Run a call, or reject it`, `<code>&lt;T&gt; T execute(Supplier&lt;T&gt; call)</code>`],
          [`Run a call, or return a fallback`, `<code>&lt;T&gt; T executeWithFallback(Supplier&lt;T&gt; call, Function&lt;RuntimeException, T&gt; fallback)</code>`],
          [`Async: ask before calling`, `<code>Optional&lt;Permit&gt; tryAcquirePermission()</code>`],
          [`Async: report afterwards`, `<code>void onSuccess(Permit p, Duration elapsed)</code>, <code>void onError(Permit p, Duration elapsed, Throwable e)</code>`],
          [`Observe it`, `<code>State state()</code>, <code>void addListener(StateListener l)</code>`]
        ] },
        { type: `code`, lang: `java`, title: `Public API`, code: `CircuitBreakerConfig paymentsConfig = CircuitBreakerConfig.builder()
        .failureRatePercent(50).windowSize(20).minimumCalls(10)
        .slowCallThreshold(Duration.ofMillis(800))
        .openWait(Duration.ofSeconds(30)).halfOpenPermits(3)
        .recordAsFailure(e -> !(e instanceof NotFoundException))      // a 404 is an answer, not an outage
        .build();

CircuitBreakerRegistry registry = new CircuitBreakerRegistry(
        Map.of("payments", paymentsConfig), CircuitBreakerConfig.defaults(), Clock.systemUTC(),
        List.of(new TransitionMetrics()));

CircuitBreaker payments = registry.forDependency("payments");
CircuitBreaker pricing  = registry.forDependency("pricing");       // no entry: uses the defaults

Receipt receipt = payments.execute(() -> paymentClient.charge(order));     // CallNotPermittedException when open
Quote quote = pricing.executeWithFallback(() -> pricingClient.quote(sku), e -> Quote.cached(sku));

// For async callers: ask first, then report how the call went.
Optional<Permit> tryAcquirePermission();
void onSuccess(Permit permit, Duration elapsed);
void onError(Permit permit, Duration elapsed, Throwable error);` },
        { type: `keypoints`, items: [
          `<strong><code>execute</code> is built on the async trio.</strong> It takes a permit, runs the call, times it and reports, so there is one code path for admission and recording, and async callers get exactly the same rules.`,
          `<strong>Rejection is an exception, a fallback is opt-in.</strong> <code>CallNotPermittedException</code> is distinct from the dependency's own errors, so a retry layer can recognise it and stop. <code>executeWithFallback</code> substitutes a value only for rejections and real failures; a business error (a 404) still reaches the caller.`,
          `<strong>No background timer.</strong> The breaker moves from OPEN to HALF_OPEN lazily, on the first call after the wait. A breaker nobody calls costs nothing, and there is no thread to start, stop or race with.`
        ] }
      ] },
      { id: `window-design`, title: `Class design: the trip rule and the window`, kicker: `Step 3: class design`, blocks: [
        { type: `text`, html: `<p>The first real decision is <strong>when to trip</strong>. It decides what the window must remember, and it is where most first answers are weakest.</p>` },
        { type: `compare`, items: [
          { title: `Good: N consecutive failures`, tone: `warn`, html: `<p>One <code>AtomicInteger</code>, reset on every success; trip at 5. Easy to explain, but it measures streaks, not health. A dependency failing 80% of the time rarely produces five failures in a row, so it never trips, while five errors in a burst from a healthy service trip it at once.</p>` },
          { title: `Better: failure rate over the last N calls`, tone: `info`, html: `<p>A ring buffer of the last N outcomes with running totals; trip when failures &divide; calls reaches a threshold. Fixed memory, a fixed sample size, O(1) per call and exact. But the time it covers depends on traffic: at two calls a minute, a window of 100 reaches back nearly an hour.</p>` },
          { title: `Great: a rate over a time window, with minimum calls`, tone: `ok`, html: `<p>One bucket per second over the last N seconds; the rate always reflects recent time whatever the traffic, and a <code>minimumCalls</code> guard stops a tiny sample (one failure out of one call) from tripping it. Costs more: a snapshot sums every bucket, and a lock-free version is slightly approximate.</p>` }
        ] },
        { type: `text`, html: `<p>We take <strong>a rate with a minimum-calls guard</strong>, and code it over the <strong>count window</strong> first: exact, fixed memory, about twenty lines, and right for steady traffic. The slow-call rate uses the same window, so each outcome is two booleans. Because a <code>Closed</code> state only asks its window for a <code>Snapshot</code>, the time-based window drops in later without touching the breaker (Deep Dives).</p>` },
        { type: `table`, title: `Why minimumCalls matters (threshold 50%, minimumCalls 20)`, headers: [`Window holds`, `Failures`, `Rate`, `Result`], rows: [
          [`2 calls, just after startup`, `1`, `50%`, `Ignored: too small a sample`],
          [`8 calls on a quiet night`, `4`, `50%`, `Ignored`],
          [`40 calls`, `21`, `52%`, `Trips`],
          [`100 calls`, `12`, `12%`, `Stays closed`]
        ] },
        { type: `table`, headers: [`Requirement`, `What the window remembers`], rows: [
          [`"Over the last N calls"`, `A ring of N slots and a cursor to the oldest`],
          [`"Failure rate or slow-call rate"`, `Per slot: failed? slow? Plus running totals of both`],
          [`"Once at least M calls are recorded"`, `How many slots are filled so far`]
        ] },
        { type: `table`, headers: [`Need`, `Method on CountWindow`], rows: [
          [`Record one outcome and get the totals it produced`, `<code>Snapshot record(boolean isFailure, boolean isSlow)</code>`],
          [`Compare a rate to a threshold`, `<code>Snapshot.failureRateAtLeast(int percent)</code>, <code>slowRateAtLeast(int percent)</code>`]
        ] },
        { type: `keypoints`, items: [
          `<strong>Record and read in one step.</strong> <code>record</code> returns the totals it produced. A separate <code>snapshot()</code> call would let another thread's outcome slip in between, and two threads could act on the same totals.`,
          `<strong>Integer arithmetic at the threshold.</strong> <code>failures * 100 &gt;= percent * calls</code> has no rounding, so "exactly 50%" behaves the same every time.`,
          `<strong>The window never resets.</strong> A transition to CLOSED builds a fresh window inside a fresh <code>Closed</code> object, so there is no reset to race with a record.`
        ] }
      ] },
      { id: `state-design`, title: `Class design: the state object`, kicker: `Step 3: class design`, blocks: [
        { type: `text`, html: `<p>The second decision is <strong>how to hold the state</strong> so that hundreds of threads can read it on every call and a few of them can change it, each change happening exactly once.</p>` },
        { type: `compare`, items: [
          { title: `Good: booleans and loose fields`, tone: `warn`, html: `<p><code>volatile boolean open, halfOpen</code>, plus <code>openedAt</code> and a trial counter. Every write is visible, but a transition must change several fields together and nothing makes the group atomic: a reader can see <code>open</code> with last time's <code>openedAt</code>, forty threads can each flip to half-open and each reset the counter, and <code>open &amp;&amp; halfOpen</code> is a state that should not exist.</p>` },
          { title: `Better: an enum and a lock`, tone: `info`, html: `<p><code>State</code> as an enum, all fields guarded by one lock, every method <code>synchronized</code>. Correct and easy to review. But every call to the dependency, healthy or not, now queues on one monitor just to ask "may I?", and a breaker exists for exactly the moment when many threads are hammering one dependency.</p>` },
          { title: `Great: an immutable state object swapped by CAS`, tone: `ok`, html: `<p>Each state is a small immutable record carrying only its own data: <code>Closed(window)</code>, <code>Open(until)</code>, <code>HalfOpen(permits, successes)</code>. One <code>AtomicReference</code> holds the current one. Admission is a single volatile read; a transition is <code>compareAndSet(from, to)</code> against the object the decision was based on, so among threads racing to make the same change exactly one wins.</p>` }
        ] },
        { type: `text`, html: `<p>We take the immutable state object. A <strong>sealed interface</strong> lists the three records, so every <code>switch</code> over a state is checked by the compiler for missing cases. This keeps what the State pattern is good at (each state owns its data) while the behaviour stays in one class, where "exactly one transition" is easy to audit; spreading CAS logic across three state classes would hide it.</p>` },
        { type: `table`, headers: [`State`, `Carries`, `A call arrives`, `An outcome is reported`], rows: [
          [`Closed`, `Its own <code>CountWindow</code>`, `Always permitted`, `Recorded; may trip to OPEN`],
          [`Open`, `The instant it may try again`, `Rejected until then; the first call after it moves to HALF_OPEN`, `Never: no permits are issued`],
          [`HalfOpen`, `Permits left, successes so far`, `Permitted only while permits remain`, `Failure or slow: OPEN. The last needed success: CLOSED`]
        ] },
        { type: `code`, lang: `java`, title: `States as immutable records`, code: `enum State { CLOSED, OPEN, HALF_OPEN }

/** One object per period spent in a state. The breaker swaps whole objects, so a state and its data change together. */
sealed interface BreakerState permits Closed, Open, HalfOpen {
    State kind();
}

record Closed(CountWindow window) implements BreakerState {
    public State kind() { return State.CLOSED; }
}

record Open(Instant until) implements BreakerState {
    public State kind() { return State.OPEN; }
}

record HalfOpen(AtomicInteger permitsLeft, AtomicInteger successes) implements BreakerState {
    HalfOpen(int permits) { this(new AtomicInteger(permits), new AtomicInteger()); }
    public State kind() { return State.HALF_OPEN; }

    boolean tryTakePermit() {
        return permitsLeft.getAndUpdate(n -> n > 0 ? n - 1 : 0) > 0;     // one atomic step: never over-admits
    }
}

/** Proof that a call was admitted, and in which state; its outcome is recorded against that state. */
record Permit(BreakerState admittedIn) {}

final class CallNotPermittedException extends RuntimeException {
    CallNotPermittedException(String breaker) { super("Circuit breaker '" + breaker + "' is open"); }
}` },
        { type: `keypoints`, items: [
          `<strong>The reference is immutable; the counters inside HalfOpen are atomic.</strong> The record's fields never change, but the <code>AtomicInteger</code>s they point to do, which is safe because each update is a single atomic operation.`,
          `<strong>Record equality does not matter here.</strong> <code>compareAndSet</code> compares references, so two <code>Open</code> objects with the same instant are still different states; a stale decision about the old one always loses.`
        ] }
      ] },
      { id: `class-diagram`, title: `Final class design`, kicker: `Step 3: class design`, blocks: [
        { type: `code`, lang: `java`, title: `Final class design`, code: `record CircuitBreakerConfig(int failureRatePercent, int slowRatePercent, int windowSize, int minimumCalls,
        Duration slowCallThreshold, Duration openWait, int halfOpenPermits,
        Predicate<Throwable> recordAsFailure) {
    static CircuitBreakerConfig defaults();
    static Builder builder();
}

record Snapshot(int calls, int failures, int slowCalls) {
    boolean failureRateAtLeast(int percent);
    boolean slowRateAtLeast(int percent);
}

final class CountWindow {                                       // the last N outcomes, running totals
    synchronized Snapshot record(boolean isFailure, boolean isSlow);
}

sealed interface BreakerState permits Closed, Open, HalfOpen { State kind(); }
record Closed(CountWindow window) implements BreakerState {}
record Open(Instant until) implements BreakerState {}
record HalfOpen(AtomicInteger permitsLeft, AtomicInteger successes) implements BreakerState {}
record Permit(BreakerState admittedIn) {}

final class CircuitBreaker {
    private final String name;
    private final CircuitBreakerConfig config;
    private final Clock clock;
    private final AtomicReference<BreakerState> state;           // swapped only by compareAndSet
    private final List<StateListener> listeners;

    <T> T execute(Supplier<T> call);
    <T> T executeWithFallback(Supplier<T> call, Function<RuntimeException, T> fallback);
    Optional<Permit> tryAcquirePermission();
    void onSuccess(Permit permit, Duration elapsed);
    void onError(Permit permit, Duration elapsed, Throwable error);
    State state();
    void addListener(StateListener l);
}

interface StateListener { void onTransition(String breaker, State from, State to); }

final class CircuitBreakerRegistry {
    private final ConcurrentHashMap<String, CircuitBreaker> breakers;
    CircuitBreaker forDependency(String name);
}` },
        { type: `text`, html: `<p>The breaker decides and switches; the window counts; the state records only carry data; the registry hands out one breaker per name. Listeners are the <strong>Observer</strong> pattern, because metrics, logging and alerting all want transitions without the breaker knowing about any of them. The configuration is a record with a <strong>Builder</strong>, because eight positional arguments are unreadable at the call site.</p>` }
      ] },
      { id: `window-impl`, title: `Implementation: configuration and the window`, kicker: `Step 4: implementation`, blocks: [
        { type: `text`, html: `<p>Check what the interviewer wants: working code, pseudocode or a walkthrough. Start with the pieces the breaker depends on. Configuration is a record, so one instance can be shared by every thread and every breaker that uses the defaults. The compact constructor is where bad input is handled: it rejects nonsense once, at startup, so the hot path never has to.</p>` },
        { type: `code`, lang: `java`, title: `Configuration record and builder`, code: `record CircuitBreakerConfig(
        int failureRatePercent,         // trip when this share of recent calls failed
        int slowRatePercent,            // trip when this share of recent calls were slow
        int windowSize,                 // outcomes kept: the last N calls
        int minimumCalls,               // calls needed before the rates are trusted
        Duration slowCallThreshold,     // a call slower than this counts as slow
        Duration openWait,              // how long OPEN fails fast before trying again
        int halfOpenPermits,            // trial calls allowed in HALF_OPEN
        Predicate<Throwable> recordAsFailure) {

    CircuitBreakerConfig {
        if (failureRatePercent < 1 || failureRatePercent > 100) throw new IllegalArgumentException("failureRatePercent must be 1-100");
        if (slowRatePercent < 1 || slowRatePercent > 100) throw new IllegalArgumentException("slowRatePercent must be 1-100");
        if (minimumCalls < 1 || minimumCalls > windowSize) throw new IllegalArgumentException("need 1 <= minimumCalls <= windowSize");
        if (halfOpenPermits < 1) throw new IllegalArgumentException("halfOpenPermits must be positive");
        Objects.requireNonNull(slowCallThreshold);
        Objects.requireNonNull(openWait);
        Objects.requireNonNull(recordAsFailure);
    }

    static CircuitBreakerConfig defaults() { return builder().build(); }
    static Builder builder() { return new Builder(); }

    static final class Builder {
        private int failureRatePercent = 50, slowRatePercent = 100, windowSize = 100, minimumCalls = 20, halfOpenPermits = 5;
        private Duration slowCallThreshold = Duration.ofSeconds(2), openWait = Duration.ofSeconds(30);
        private Predicate<Throwable> recordAsFailure = e -> true;

        Builder failureRatePercent(int v)               { failureRatePercent = v; return this; }
        Builder slowRatePercent(int v)                  { slowRatePercent = v; return this; }
        Builder windowSize(int v)                       { windowSize = v; return this; }
        Builder minimumCalls(int v)                     { minimumCalls = v; return this; }
        Builder slowCallThreshold(Duration v)           { slowCallThreshold = v; return this; }
        Builder openWait(Duration v)                    { openWait = v; return this; }
        Builder halfOpenPermits(int v)                  { halfOpenPermits = v; return this; }
        Builder recordAsFailure(Predicate<Throwable> v) { recordAsFailure = v; return this; }

        CircuitBreakerConfig build() {
            return new CircuitBreakerConfig(failureRatePercent, slowRatePercent, windowSize, minimumCalls,
                    slowCallThreshold, openWait, halfOpenPermits, recordAsFailure);
        }
    }
}` },
        { type: `text`, html: `<p>The window's normal path is three writes: put the outcome in the slot under the cursor, add it to the totals, advance the cursor. The edge case is a full ring: the slot about to be overwritten holds the oldest outcome, which must leave the totals first.</p>` },
        { type: `code`, lang: `java`, title: `Count-based sliding window`, code: `record Snapshot(int calls, int failures, int slowCalls) {
    boolean failureRateAtLeast(int percent) { return failures * 100 >= percent * calls; }
    boolean slowRateAtLeast(int percent)    { return slowCalls * 100 >= percent * calls; }
}

/** The last N outcomes in a ring buffer, with running totals so every update is O(1). */
final class CountWindow {
    private final boolean[] failed, slow;
    private int next, size, failures, slowCalls;          // all guarded by this

    CountWindow(int capacity) { failed = new boolean[capacity]; slow = new boolean[capacity]; }

    synchronized Snapshot record(boolean isFailure, boolean isSlow) {
        if (size == failed.length) {                      // full: the slot we overwrite leaves the totals
            if (failed[next]) failures--;
            if (slow[next]) slowCalls--;
        } else {
            size++;
        }
        failed[next] = isFailure;
        slow[next] = isSlow;
        if (isFailure) failures++;
        if (isSlow) slowCalls++;
        next = (next + 1) % failed.length;
        return new Snapshot(size, failures, slowCalls);
    }
}` },
        { type: `callout`, tone: `insight`, title: `Why a lock is fine here`, html: `<p>The slot, the two totals and the cursor must change together, so one lock per window makes each update atomic and the returned snapshot consistent. The critical section is a handful of array writes with no I/O, held for nanoseconds even under contention, and each dependency has its own window, so breakers never block each other. What must never happen is holding a lock <em>while the call runs</em>; this lock is taken only after the call has finished.</p>` }
      ] },
      { id: `breaker-impl`, title: `Implementation: admitting calls and recording outcomes`, kicker: `Step 4: implementation`, blocks: [
        { type: `text`, html: `<p>Normal path first. <code>tryAcquirePermission</code> reads the current state: CLOSED admits, HALF_OPEN admits while permits remain, OPEN rejects until the wait has passed. <code>record</code> adds the outcome to the state that admitted the call and, if a threshold is crossed, swaps in the next state with <code>compareAndSet</code>. Then the edge cases, each of which the code below handles in a line or two:</p>` },
        { type: `list`, title: `Edge cases the code must handle`, items: [
          `The wait expires and many threads arrive together: exactly one moves OPEN to HALF_OPEN; the rest loop and see HALF_OPEN.`,
          `HALF_OPEN with permits left and many callers: exactly <code>halfOpenPermits</code> get one.`,
          `A call admitted in CLOSED finishes after the breaker opened: its outcome must not cause a second transition.`,
          `An exception the predicate does not count (a 404): recorded as a success, and still thrown to the caller.`,
          `The call throws an <code>Error</code>: it still reports, or a half-open permit would leak.`,
          `A listener throws: the call that caused the transition must not fail because of it.`
        ] },
        { type: `text`, html: `<p>The late outcome is the subtle one. Compare three ways to handle it on one example: a call admitted while CLOSED hangs for a while and fails after the breaker has already gone OPEN and then HALF_OPEN.</p>` },
        { type: `compare`, items: [
          { title: `Weak: record into the current state`, tone: `bad`, html: `<p>The late failure lands in the <code>HalfOpen</code> object and reopens the breaker, even though every trial call is succeeding. One slow leftover from the outage keeps the breaker flapping.</p>` },
          { title: `Better: a generation number`, tone: `warn`, html: `<p>Stamp each state with a counter and ignore outcomes whose stamp is old. It works, but it is a second piece of state to keep in step with the first, and every recording path has to remember to compare it.</p>` },
          { title: `Strong: record against the admitting state`, tone: `ok`, html: `<p>The <code>Permit</code> carries the state object that admitted the call. The late failure goes into that old <code>Closed</code>'s window, which nobody reads any more, and any CAS it attempts names an object that is no longer current, so it fails. No extra field, no extra check.</p>` }
        ] },
        { type: `code`, lang: `java`, title: `CircuitBreaker`, code: `final class CircuitBreaker {
    private final String name;
    private final CircuitBreakerConfig config;
    private final Clock clock;
    private final AtomicReference<BreakerState> state;
    private final List<StateListener> listeners = new CopyOnWriteArrayList<>();

    CircuitBreaker(String name, CircuitBreakerConfig config, Clock clock) {
        this.name = name;
        this.config = config;
        this.clock = clock;
        this.state = new AtomicReference<>(newClosed());
    }

    State state() { return state.get().kind(); }
    void addListener(StateListener l) { listeners.add(l); }

    <T> T execute(Supplier<T> call) {
        Permit permit = tryAcquirePermission().orElseThrow(() -> new CallNotPermittedException(name));
        Instant start = clock.instant();
        try {
            T result = call.get();
            onSuccess(permit, Duration.between(start, clock.instant()));
            return result;
        } catch (RuntimeException | Error e) {               // every admitted call reports, or a trial permit leaks
            onError(permit, Duration.between(start, clock.instant()), e);
            throw e;
        }
    }

    <T> T executeWithFallback(Supplier<T> call, Function<RuntimeException, T> fallback) {
        try {
            return execute(call);
        } catch (CallNotPermittedException e) {
            return fallback.apply(e);
        } catch (RuntimeException e) {
            if (config.recordAsFailure().test(e)) return fallback.apply(e);
            throw e;                                         // business errors reach the caller unchanged
        }
    }

    Optional<Permit> tryAcquirePermission() {
        while (true) {
            BreakerState s = state.get();
            switch (s) {
                case Closed c -> { return Optional.of(new Permit(c)); }
                case HalfOpen h -> { return h.tryTakePermit() ? Optional.of(new Permit(h)) : Optional.empty(); }
                case Open o -> {
                    if (clock.instant().isBefore(o.until())) return Optional.empty();
                    transition(o, new HalfOpen(config.halfOpenPermits()));   // one thread wins; all loop and see HALF_OPEN
                }
            }
        }
    }

    void onSuccess(Permit permit, Duration elapsed) {
        record(permit.admittedIn(), false, isSlow(elapsed));
    }

    void onError(Permit permit, Duration elapsed, Throwable error) {
        record(permit.admittedIn(), config.recordAsFailure().test(error), isSlow(elapsed));
    }

    private boolean isSlow(Duration elapsed) { return elapsed.compareTo(config.slowCallThreshold()) > 0; }

    private void record(BreakerState admittedIn, boolean failed, boolean slow) {
        switch (admittedIn) {
            case Closed c -> {
                Snapshot s = c.window().record(failed, slow);
                if (s.calls() >= config.minimumCalls()
                        && (s.failureRateAtLeast(config.failureRatePercent()) || s.slowRateAtLeast(config.slowRatePercent()))) {
                    transition(c, newOpen());
                }
            }
            case HalfOpen h -> {
                if (failed || slow) transition(h, newOpen());
                else if (h.successes().incrementAndGet() == config.halfOpenPermits()) transition(h, newClosed());
            }
            case Open o -> { }                               // unreachable: no permit is issued while OPEN
        }
    }

    private Closed newClosed() { return new Closed(new CountWindow(config.windowSize())); }
    private Open newOpen()     { return new Open(clock.instant().plus(config.openWait())); }

    /** Swaps from the exact object the decision was based on; a stale decision simply loses. */
    private void transition(BreakerState from, BreakerState to) {
        if (state.compareAndSet(from, to)) notifyListeners(from.kind(), to.kind());
    }

    private void notifyListeners(State from, State to) {
        for (StateListener l : listeners) {
            try { l.onTransition(name, from, to); }
            catch (RuntimeException e) { /* a broken listener must not break calls */ }
        }
    }
}` },
        { type: `table`, title: `The race at the end of the wait: 50 threads arrive together, halfOpenPermits = 2`, headers: [`State held as`, `OPEN to HALF_OPEN transitions`, `Trial calls admitted`, `Cost on the CLOSED path`], rows: [
          [`Booleans and loose fields, check then act`, `Up to 50`, `Up to 50: each thread resets the counter`, `One volatile read`],
          [`Enum, every method synchronized`, `1`, `2`, `Every call queues on one monitor`],
          [`Immutable state object, CAS, <code>getAndUpdate</code> permits`, `1`, `2`, `One volatile read`]
        ] },
        { type: `callout`, tone: `warning`, title: `Why every piece of shared state is safe`, html: `<ul><li><strong>The current state</strong> is one <code>AtomicReference</code>. Reads are volatile, and every transition is <code>compareAndSet(from, to)</code> against the object the decision was based on, so of all the threads that see the same trip condition exactly one wins and the rest do nothing.</li><li><strong>The window</strong> is guarded by its own lock, and each <code>Closed</code> gets a fresh one, so a reset never races a record.</li><li><strong>Half-open counters</strong> are <code>AtomicInteger</code>s: <code>getAndUpdate</code> takes a permit in one step, and <code>incrementAndGet</code> lets exactly one thread see the final success.</li><li><strong>Listeners</strong> sit in a <code>CopyOnWriteArrayList</code>: adding one never disturbs a thread that is iterating, and they run outside any lock.</li><li><strong>Name, config and clock</strong> are final and immutable. A state's fields are final too, so whoever sees the object through the volatile reference sees its data.</li></ul>` },
        { type: `callout`, tone: `interview`, html: `<p>One way to say it: "The state and everything that belongs to it live in one immutable object. I change state only with <code>compareAndSet</code> from the object I based my decision on, so each trip happens once, and late outcomes can't interfere because they refer to an object that is no longer current." Then offer the time-based window and the stuck-half-open guard as follow-ups rather than coding them unasked.</p>` }
      ] },
      { id: `registry-impl`, title: `Implementation: registry, listeners and async callers`, kicker: `Step 4: implementation`, blocks: [
        { type: `text`, html: `<p>Each dependency gets its own breaker, because a dead pricing API says nothing about payments. The normal path: look the name up, create the breaker on first use with that dependency's config or the defaults, attach the shared listeners. The edge case is two threads asking for a new name at the same moment: they must get the same breaker, or each would see half the failures and trip late.</p>` },
        { type: `code`, lang: `java`, title: `Registry and listeners`, code: `@FunctionalInterface
interface StateListener {
    void onTransition(String breaker, State from, State to);
}

final class CircuitBreakerRegistry {
    private final ConcurrentHashMap<String, CircuitBreaker> breakers = new ConcurrentHashMap<>();
    private final Map<String, CircuitBreakerConfig> configs;     // per dependency, fixed at startup
    private final CircuitBreakerConfig defaults;
    private final Clock clock;
    private final List<StateListener> listeners;                 // attached to every breaker

    CircuitBreakerRegistry(Map<String, CircuitBreakerConfig> configs, CircuitBreakerConfig defaults,
                           Clock clock, List<StateListener> listeners) {
        this.configs = Map.copyOf(configs);
        this.defaults = defaults;
        this.clock = clock;
        this.listeners = List.copyOf(listeners);
    }

    /** One breaker per dependency, even when many threads ask for a new name at once. */
    CircuitBreaker forDependency(String name) {
        return breakers.computeIfAbsent(name, n -> {
            CircuitBreaker cb = new CircuitBreaker(n, configs.getOrDefault(n, defaults), clock);
            listeners.forEach(cb::addListener);
            return cb;
        });
    }
}

/** Counts transitions; LongAdder counters never lose an increment when breakers trip concurrently. */
final class TransitionMetrics implements StateListener {
    private final ConcurrentHashMap<String, LongAdder> counts = new ConcurrentHashMap<>();

    public void onTransition(String breaker, State from, State to) {
        counts.computeIfAbsent(breaker + ":" + from + "->" + to, k -> new LongAdder()).increment();
    }

    long count(String key) {
        LongAdder a = counts.get(key);
        return a == null ? 0 : a.sum();
    }
}` },
        { type: `text`, html: `<p><code>computeIfAbsent</code> on a <code>ConcurrentHashMap</code> runs the factory at most once per key, so concurrent first calls share one breaker. The config map and listener list are copied into immutable collections, so any thread can read them without a lock. Async callers use the permit methods directly:</p>` },
        { type: `code`, lang: `java`, title: `Calling it from async code`, code: `CompletableFuture<Quote> quoteAsync(String sku) {
    Optional<Permit> permit = pricing.tryAcquirePermission();
    if (permit.isEmpty()) return CompletableFuture.failedFuture(new CallNotPermittedException("pricing"));
    Instant start = clock.instant();
    return pricingClient.quoteAsync(sku).whenComplete((quote, error) -> {
        Duration elapsed = Duration.between(start, clock.instant());
        if (error == null) pricing.onSuccess(permit.get(), elapsed);
        else pricing.onError(permit.get(), elapsed, error instanceof CompletionException ce ? ce.getCause() : error);
    });
}` },
        { type: `callout`, tone: `warning`, html: `<p>An async caller that takes a permit must always report back. In HALF_OPEN a permit that is never returned is a trial slot lost for good, and the breaker can sit in HALF_OPEN with no permits left. Report in <code>whenComplete</code>, which runs on success and on failure, and put a timeout on the future so it always completes. Unwrap <code>CompletionException</code> first, or the failure predicate sees the wrapper instead of the real error.</p>` }
      ] },
      { id: `verification`, title: `Verifying with a trace`, kicker: `Step 5: verification`, blocks: [
        { type: `text`, html: `<p>Walk one breaker through a scenario call by call before the interviewer does, with a fake clock so the waits are exact. The configuration is deliberately tiny: a window of 4, <code>minimumCalls</code> 4, a 50% failure threshold, calls over 1 s count as slow, a 10 s open wait and 2 trial permits. Calls take no time unless stated. This trace was produced by running a port of the code above.</p>` },
        { type: `code`, lang: `text`, title: `Call by call`, code: `time  event                         state after  why
t=0   call A takes a permit         CLOSED       still running; it reports later
t=0   call 1 ok                     CLOSED       window calls=1 failed=0: below minimumCalls
t=0   call 2 fails                  CLOSED       window calls=2 failed=1
t=0   call 3 ok                     CLOSED       window calls=3 failed=1
t=0   call 4 fails                  OPEN         window calls=4 failed=2: 50% >= 50%
                                                 CAS CLOSED -> OPEN, open until t=10
t=1   call A reports a failure      OPEN         recorded in the old window (calls=4 failed=3);
                                                 its CAS names the old Closed and loses
t=4   call 5                        OPEN         rejected: CallNotPermittedException
t=10  call 6 ok                     HALF_OPEN    wait over: CAS OPEN -> HALF_OPEN (2 permits);
                                                 trial successes 1/2
t=12  call 7 ok, but took 2 s       OPEN         a slow trial: CAS HALF_OPEN -> OPEN, until t=22
t=15  call 8                        OPEN         rejected
t=22  call 9 takes a permit         HALF_OPEN    CAS OPEN -> HALF_OPEN; permits left 1
t=22  call 10 takes a permit        HALF_OPEN    permits left 0
t=22  call 11                       HALF_OPEN    rejected: no trial permits left
t=22  call 9 reports ok             HALF_OPEN    trial successes 1/2
t=22  call 10 reports ok            CLOSED       trial successes 2/2: CAS HALF_OPEN -> CLOSED
t=22  call 12 ok                    CLOSED       a fresh window: calls=1 failed=0

Race check: 50 callers read the same Open object at t=32
  OPEN -> HALF_OPEN transitions = 1, trial permits granted = 2` },
        { type: `keypoints`, items: [
          `Calls 1 to 3 included a failure rate of 33-50% but never tripped: the rate is ignored until four outcomes are in.`,
          `Call A crossed the threshold again in the old window, and nothing happened. That is the <code>Permit</code> doing its job: the outcome belongs to the state that admitted it.`,
          `Call 7 succeeded, yet reopened the breaker, because a slow trial is a failed probe. The new wait starts from when the outcome was recorded (t=12), not from when the call began.`,
          `Call 11 was rejected while two trials were in flight: HALF_OPEN admits exactly two, however many callers arrive.`
        ] }
      ] }
    ],
    levels: levels(
      [`The three states and the transitions between them, with a wait before trying again.`, `A working <code>execute</code> that fails fast when open, with a trip rule (consecutive failures is acceptable at first; a rate with hints).`, `Bad configuration rejected, and awareness that many threads share a breaker, even if the first version simply locks every method.`],
      [`A failure rate over a sliding window with <code>minimumCalls</code>, slow calls counted, and a predicate for which exceptions count, all from requirements gathered up front.`, `Atomic transitions: one immutable state object in an <code>AtomicReference</code>, <code>compareAndSet</code>, and exactly N half-open permits, with the races explained without prompting.`, `An injected <code>Clock</code> and a trace or tests for every transition; a registry with per-dependency config and listeners.`, `Can say where follow-ups land: a time-based window changes only the window, forced states add records to the sealed interface.`],
      [`Asks how many threads share a breaker and which errors mean "unhealthy" before designing, and scopes out distributed state explicitly.`, `Handles late outcomes by recording against the admitting state, and guards against a breaker stuck in HALF_OPEN.`, `Weighs count vs time windows and lock vs lock-free counters for very hot breakers, and the accuracy each gives up.`, `Places the breaker in a resilience policy (timeout inside, retry outside, bulkhead alongside), and discusses synchronized recovery across many instances and how to tune thresholds from real latency data.`]
    ),
    concepts: [
      { term: `CLOSED, OPEN, HALF_OPEN`, def: `Pass and record; reject until a wait elapses; allow a few trial calls to decide.`, why: `The whole library is this state machine plus the rules for moving between states.` },
      { term: `Fail fast and fallback`, def: `When OPEN, reject in microseconds with <code>CallNotPermittedException</code>, or return a fallback value.`, why: `Frees threads that would otherwise wait on timeouts, and gives the dependency room to recover.` },
      { term: `Rate over a sliding window`, def: `The share of failures (and of slow calls) among the last N calls, kept as a ring buffer with running totals.`, why: `Measures health rather than streaks; O(1) per call; forgets old outages.` },
      { term: `Minimum number of calls`, def: `The rates are ignored until the window holds at least M outcomes.`, why: `One failure out of one call is 100%, but it is not evidence of an outage.` },
      { term: `Slow-call threshold`, def: `A call that succeeds but takes longer than the threshold counts as slow; a slow-call rate can trip the breaker on its own.`, why: `A dependency that answers in nine seconds is as harmful as one that errors.` },
      { term: `Failure predicate`, def: `A per-dependency <code>Predicate&lt;Throwable&gt;</code> deciding which exceptions are failures; the rest count as successes.`, why: `Timeouts and 5xx mean unhealthy; a 404 means the dependency answered correctly.` },
      { term: `Immutable state + CAS`, def: `The state and its data live in one immutable object swapped with <code>compareAndSet(from, to)</code>.`, why: `Exactly one thread performs each transition, and no reader sees a half-updated state.` },
      { term: `Permit`, def: `Proof of admission that remembers which state object admitted the call; outcomes are recorded against it.`, why: `Late outcomes from an earlier state cannot cause a transition.` },
      { term: `Registry per dependency`, def: `A <code>ConcurrentHashMap</code> of breakers by name, built with <code>computeIfAbsent</code>.`, why: `Failures stay isolated per dependency, and there is exactly one breaker per name.` }
    ],
    interview: [
      { q: `Why do you need a circuit breaker if you already have timeouts?`, a: `A timeout bounds how long one call waits, but when a dependency is down every call still waits the full timeout, so threads pile up and the caller goes down too. The breaker notices the failure rate and stops calling for a while, so callers fail in microseconds and the dependency gets a break; half-open probing then finds out cheaply when it is back. The two work together: the timeout is what turns a hung call into a failure the breaker can count.`, diff: `easy` },
      { q: `Why not trip after N consecutive failures?`, a: `It measures streaks, not health. A dependency failing 80% of the time rarely produces five failures in a row, so the breaker never trips, while a burst of five errors from a healthy service trips it immediately. A failure rate over a sliding window measures what you care about, and a minimum number of calls stops a tiny sample from deciding.`, diff: `easy` },
      { q: `Count-based or time-based window?`, a: `A count-based window (last N calls, a ring buffer) has fixed memory and a fixed sample size and is exact, but the time it covers depends on traffic: at low traffic it may hold calls from an hour ago. A time-based window (one bucket per second for the last N seconds) always reflects recent time, but its sample size varies with traffic and a snapshot sums every bucket. I start with the count window and keep the window behind one method, so a time-based one can replace it per dependency.`, diff: `medium` },
      { q: `Fifty threads hit the breaker the instant the open wait expires. How many trial calls reach the dependency?`, a: `Exactly halfOpenPermits. All fifty read the same Open object and try compareAndSet(open, new HalfOpen(n)); one succeeds, the rest fail, loop and read the HalfOpen. Permits are taken with getAndUpdate(n -&gt; n &gt; 0 ? n - 1 : 0), one atomic step, so exactly n callers see a positive value. With an enum and separate fields, several threads could each flip the state and each reset the counter.`, diff: `hard` },
      { q: `A call admitted while CLOSED fails after the breaker has reopened and moved to HALF_OPEN. What should happen?`, a: `Nothing. The permit remembers the Closed object that admitted the call, so the failure is recorded in that old window, which nobody reads, and any transition it attempts is a compareAndSet from an object that is no longer current, so it fails. Recording into the current state instead would let a leftover from the outage reopen a recovering breaker.`, diff: `hard` },
      { q: `Which errors should count as failures?`, a: `Ones that say the dependency is unhealthy: timeouts, refused or reset connections, 5xx and usually 429. Not client errors such as 400 or 404 or business-rule rejections: the dependency answered correctly, and counting them would let one user's bad input open the breaker for everyone. Make it a per-dependency predicate and count everything else as a success. Slow successes count separately through the slow-call threshold.`, diff: `medium` },
      { q: `How do you test it deterministically?`, a: `Inject a java.time.Clock and use a test clock you can advance, so the open wait passes instantly and a slow call is simulated by advancing the clock inside the call. Test each transition: below minimum calls stays closed, the threshold trips it, open rejects, the wait leads to half-open, all trials succeeding closes, one failing or slow trial reopens. For concurrency, release many threads at once with a latch and assert exactly N permits and exactly one OPEN to HALF_OPEN transition, repeated many times.`, diff: `easy` }
    ],
    cheatsheet: [
      { title: `Circuit breaker in one screen`, type: `code`, lang: `java`, body: `record CircuitBreakerConfig(int failureRatePercent, int slowRatePercent, int windowSize, int minimumCalls,
        Duration slowCallThreshold, Duration openWait, int halfOpenPermits, Predicate<Throwable> recordAsFailure) {}
                                                   // compact constructor rejects bad values; builder gives defaults
sealed interface BreakerState permits Closed, Open, HalfOpen {}
record Closed(CountWindow window) implements BreakerState {}       // synchronized ring buffer of the last N outcomes
record Open(Instant until) implements BreakerState {}
record HalfOpen(AtomicInteger permitsLeft, AtomicInteger successes) implements BreakerState {}
record Permit(BreakerState admittedIn) {}           // outcomes go to the state that admitted the call

final class CircuitBreaker {
    AtomicReference<BreakerState> state;            // every transition is compareAndSet(from, to)
    <T> T execute(Supplier<T> call);                // permit? run, time it, record, maybe trip
    <T> T executeWithFallback(Supplier<T> call, Function<RuntimeException, T> fallback);
    Optional<Permit> tryAcquirePermission();        // OPEN past its wait: CAS to HALF_OPEN, loop
    void onSuccess(Permit p, Duration elapsed);
    void onError(Permit p, Duration elapsed, Throwable error);
}
final class CircuitBreakerRegistry { ConcurrentHashMap<String, CircuitBreaker> breakers; CircuitBreaker forDependency(String name); }` },
      { title: `Follow-ups and where they land`, type: `table`, headers: [`Follow-up`, `Change`], rows: [
        [`Low or bursty traffic`, `A time-based window behind the same record method; Closed holds the interface (Deep Dives)`],
        [`A 404 opened the breaker`, `Only the config's failure predicate (Deep Dives)`],
        [`Retries and timeouts`, `A Retry wrapper outside the breaker; timeouts in the client (Deep Dives)`],
        [`Breaker stuck in HALF_OPEN`, `HalfOpen records when it started; tryAcquirePermission reopens after a limit (Deep Dives)`],
        [`Force open or disable during an incident`, `Two more records in the sealed interface, set with getAndSet (Deep Dives)`],
        [`Testing without sleeps`, `A mutable test Clock; latch-released threads for the races (Deep Dives)`]
      ] }
    ],
    labs: []
  });
})();
