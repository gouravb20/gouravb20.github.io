// Deep dives: Logging Service (LLD practice set). Format: DeepDive in public/shared/notes.d.ts.
window.DEEP = window.DEEP || {};
DEEP["logging-service"] = {
  hook: `<p>Once the core works, interviewers add the features every real logging library grew: non-blocking writes, per-package levels, live reconfiguration, new destinations and cheap disabled calls. You rarely implement them in full; you show which class changes and why the rest doesn't. Because formats, sinks and configuration were kept apart, most of these land in a single new class.</p>`,
  sections: [
    {
      id: "async",
      title: "\"Disk latency is showing up in request times. Can log() stop waiting for the file?\"",
      kicker: "Follow-up: non-blocking writes",
      blocks: [
        { type: "text", html: `<p>The synchronous <code>FileSink</code> flushes on every call, so a slow disk slows every request thread. The tempting fix is to make <code>Logger</code> asynchronous, which drags queues into every logger. Instead, wrap the slow sink: records are still built and formatted on the caller's thread (so time and thread name stay right), and only the finished line crosses a queue. <strong>What changes:</strong> one new <code>Sink</code> and the configuration; <code>Logger</code>, <code>Appender</code> and the formatters are untouched.</p>` },
        { type: "code", lang: "java", title: "AsyncSink: a bounded queue in front of any sink", code: `/** Wraps any sink: callers enqueue the finished line, one writer thread does the slow I/O. */
final class AsyncSink implements Sink {
    private final Sink inner;                                 // touched only by the writer thread until close
    private final BlockingQueue<String> queue;
    private final AtomicLong dropped = new AtomicLong();
    private final Thread writer;
    private volatile boolean closing;

    AsyncSink(Sink inner, int capacity) {
        this.inner = inner;
        this.queue = new ArrayBlockingQueue<>(capacity);      // bounded: a stalled disk can't fill the heap
        this.writer = new Thread(this::drain, "log-writer");
        writer.setDaemon(true);
        writer.start();
    }

    public void write(String line) {
        if (closing || !queue.offer(line)) dropped.incrementAndGet();   // never block the caller
    }

    private void drain() {
        try {
            while (!closing || !queue.isEmpty()) {
                String line = queue.poll(100, TimeUnit.MILLISECONDS);
                if (line != null) inner.write(line);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    @Override public void close() {
        closing = true;                                       // stop accepting, then let the writer finish
        try { writer.join(); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
        for (String line; (line = queue.poll()) != null; ) inner.write(line);   // anything offered during shutdown
        if (dropped.get() > 0) inner.write("dropped " + dropped.get() + " log lines: queue full");
        inner.close();
    }
}

// Configuration only: the busy file goes through the queue; ERROR and above also go synchronously to errors.log.
new Appender(LogLevel.INFO,  new JsonFormatter(), new AsyncSink(new FileSink(Path.of("app.log")), 10_000));
new Appender(LogLevel.ERROR, new JsonFormatter(), new FileSink(Path.of("errors.log")));` },
        { type: "keypoints", items: [
          "Only the writer thread calls the inner sink while running, so its lock is never contended; the caller pays for an <code>offer</code>, not a disk flush.",
          "The full-queue policy is the real decision. Dropping and counting keeps callers fast; blocking keeps every line but brings disk latency back. A second, synchronous appender for ERROR and above means the lines that matter are never dropped, with no change to <code>AsyncSink</code>.",
          "What is still in the queue when the process crashes is lost. <code>close()</code> drains on a clean shutdown; register it in a shutdown hook."
        ] },
        { type: "callout", tone: "interview", html: `<p>Say the trade-off before the code: "Asynchronous logging buys latency with durability. I'd make it opt-in per destination by wrapping a sink, so the console stays synchronous and ERROR lines can't be dropped." Putting the queue in a <code>Sink</code> decorator rather than in <code>Logger</code> is the design point the interviewer is listening for.</p>` }
      ]
    },
    {
      id: "per-name-levels",
      title: "\"Can payments log at DEBUG while everything else stays at INFO?\"",
      kicker: "Follow-up: per-name levels",
      blocks: [
        { type: "text", html: `<p>Real configurations set levels on a few dotted names ("com.shop" at INFO, "com.shop.payments" at DEBUG) and every other logger takes the level of its nearest configured ancestor. <strong>What changes:</strong> <code>LoggerFactory</code> gains a map of configured levels and resolves each logger's level once, when it creates the logger. <code>Logger</code> already has a threshold field; it just gets a stricter value. Appenders keep their own levels, so a record must pass both.</p>` },
        { type: "code", lang: "java", title: "Per-name levels from the nearest configured ancestor", code: `// In LoggerFactory: configured levels, e.g. "" (root) -> WARN, "com.shop" -> INFO, "com.shop.payments" -> DEBUG.
private final Map<String, LogLevel> levels;                  // Map.copyOf in the constructor: immutable

Logger getLogger(String name) {
    String key = (name == null || name.isBlank()) ? "root" : name;
    return loggers.computeIfAbsent(key, k -> new Logger(k, appenders, max(threshold, effectiveLevel(k)), clock));
}

/** Walks com.shop.payments.Refunds, com.shop.payments, com.shop, com, then the root "". */
private LogLevel effectiveLevel(String name) {
    for (String n = name; ; n = parent(n)) {
        LogLevel l = levels.get(n);
        if (l != null) return l;
        if (n.isEmpty()) return LogLevel.INFO;                // the root wasn't configured
    }
}

private static String parent(String name) {
    int dot = name.lastIndexOf('.');
    return dot < 0 ? "" : name.substring(0, dot);
}

private static LogLevel max(LogLevel a, LogLevel b) { return a.compareTo(b) >= 0 ? a : b; }` },
        { type: "table", title: "Resolved levels for root WARN, com.shop INFO, com.shop.payments DEBUG", headers: ["Logger name", "Nearest configured name", "Level"], rows: [
          ["com.shop.payments.Refunds", "com.shop.payments", "DEBUG"],
          ["com.shop.payments", "com.shop.payments", "DEBUG"],
          ["com.shop.cart", "com.shop", "INFO"],
          ["com.shopping", "root", "WARN"],
          ["org.db", "root", "WARN"]
        ] },
        { type: "callout", tone: "warning", html: `<p>The lookup walks names in an immutable map and never touches the logger cache. A popular design instead creates parent <em>loggers</em> by calling <code>getLogger(parent)</code> from inside <code>computeIfAbsent</code>; <code>ConcurrentHashMap</code> forbids modifying the map from the mapping function and can throw <code>IllegalStateException</code>. If you need real parent objects (for Log4j-style additive appenders), create the parent first, outside the call.</p>` },
        { type: "quiz", q: "Configured levels: root WARN, com.shop INFO, com.shop.payments DEBUG. What level does a logger named com.shopping get?", options: [
          "DEBUG, because it starts with com.shop",
          "INFO, inherited from com.shop",
          "WARN, from the root",
          "INFO, the default when nothing matches"
        ], answer: 2, explain: `<p>Ancestors are found by cutting at dots: com.shopping, then com, then the root. "com.shop" is a string prefix but not an ancestor, so the root's WARN applies. Matching with <code>startsWith</code> instead of walking dots is the classic bug here.</p>` }
      ]
    },
    {
      id: "live-config",
      title: "\"Ops need to turn on DEBUG in production without a restart. What changes?\"",
      kicker: "Follow-up: runtime configuration",
      blocks: [
        { type: "text", html: `<p>Everything was immutable so that it could be shared without locks. Keep that, and make the <em>reference</em> mutable: bundle what a log call reads into one immutable <code>LogConfig</code> and swap the whole object atomically. <strong>What changes:</strong> <code>LoggerFactory</code> holds an <code>AtomicReference&lt;LogConfig&gt;</code>; <code>Logger</code> keeps a reference to the factory instead of copying appenders and threshold, and reads the current config once per call. Appenders, formatters and sinks are unchanged.</p>` },
        { type: "code", lang: "java", title: "Swapping the whole configuration at once", code: `/** Everything a log call reads, in one immutable object that is replaced whole, never edited. */
record LogConfig(List<Appender> appenders, LogLevel threshold) {
    LogConfig { appenders = List.copyOf(appenders); }

    static LogConfig of(List<Appender> appenders) {
        return new LogConfig(appenders, appenders.stream().map(Appender::minLevel).min(Comparator.naturalOrder()).orElseThrow());
    }
}

// In LoggerFactory:
private final AtomicReference<LogConfig> config;

LogConfig current() { return config.get(); }

void reconfigure(LogConfig next) {
    config.set(next);      // sinks only the old config used may still be mid-write elsewhere: close them later, not here
}

// In Logger, which now holds the factory: one read per call, so a call sees one consistent config.
void log(LogLevel level, String message) {
    LogConfig c = factory.current();
    if (level == null || !level.isAtLeast(c.threshold())) return;
    LogRecord r = new LogRecord(clock.instant(), level, name, Thread.currentThread().getName(), String.valueOf(message));
    for (Appender a : c.appenders()) {
        try { a.append(r); } catch (RuntimeException e) { System.err.println("appender failed: " + e); }
    }
}` },
        { type: "compare", items: [
          { title: "Setters on each appender", tone: "bad", html: `<p><code>setLevel</code> and <code>setFormatter</code> on shared objects. Without <code>volatile</code>, other threads may never see the change; with it, a call can still see the new level with the old formatter. Changes are piecemeal and racy.</p>` },
          { title: "A lock around every log call", tone: "warn", html: `<p>Correct, but every request thread now contends on one lock just to read configuration that changes once a week.</p>` },
          { title: "One immutable snapshot, swapped", tone: "ok", html: `<p>Readers pay one volatile read and never block; a reconfiguration is all-or-nothing. The cost is retiring old sinks safely, which happens rarely and off the hot path.</p>` }
        ] }
      ]
    },
    {
      id: "new-sinks",
      title: "\"We need logs in a central collector, and app.log keeps growing. Where does that go?\"",
      kicker: "Follow-up: new destinations",
      blocks: [
        { type: "text", html: `<p>Both are new <code>Sink</code> implementations, which is the payoff of composing formatters with sinks: the JSON formatter already produces what a collector wants, and no existing class changes. <strong>What changes:</strong> two new classes and the configuration.</p>` },
        { type: "code", lang: "java", title: "A size-based rolling file sink", code: `final class RollingFileSink implements Sink {
    private final Path base;
    private final long maxBytes;
    private BufferedWriter out;                               // guarded by this
    private long written;                                     // guarded by this; counts chars, close enough to bytes for ASCII logs

    RollingFileSink(Path base, long maxBytes) throws IOException {
        this.base = base;
        this.maxBytes = maxBytes;
        open();
    }

    public synchronized void write(String line) {
        try {
            if (written + line.length() + 1 > maxBytes) roll();
            out.write(line);
            out.newLine();
            out.flush();
            written += line.length() + 1;
        } catch (IOException e) {
            System.err.println("log write failed: " + e.getMessage());
        }
    }

    @Override public synchronized void close() {
        try { out.close(); } catch (IOException e) { System.err.println("log close failed: " + e.getMessage()); }
    }

    private void roll() throws IOException {                  // called with the lock held, so no line is split across files
        out.close();
        Files.move(base, base.resolveSibling(base.getFileName() + "." + System.currentTimeMillis()));
        open();
    }

    private void open() throws IOException {
        out = Files.newBufferedWriter(base, StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        written = Files.size(base);
    }
}` },
        { type: "table", title: "A remote collector sink", headers: ["Concern", "Approach"], rows: [
          ["Latency", "Never send per line from a caller thread: wrap it in the <code>AsyncSink</code> and send batches from the writer thread"],
          ["Failures", "Retry with exponential backoff; spill to a local file while the collector is down"],
          ["Memory", "A bounded buffer; when full, drop low levels first and count what was dropped"],
          ["Ordering", "One sender thread per sink keeps lines in the order they were accepted"],
          ["Security", "TLS to the collector, and redact secrets in the formatter before anything leaves the process"]
        ] }
      ]
    },
    {
      id: "lazy-messages",
      title: "\"Building debug strings is showing up in the profiler, even with DEBUG off\"",
      kicker: "Follow-up: performance",
      blocks: [
        { type: "text", html: `<p><code>log.debug("cart=" + cart.toDetailedString())</code> builds the string before <code>debug</code> is even called, so the level check comes too late. <strong>What changes:</strong> only <code>Logger</code> gains overloads; the precomputed threshold already makes the check one comparison.</p>` },
        { type: "code", lang: "java", title: "Supplier overloads and parameterised messages", code: `// In Logger: the message is built only if some appender would write it.
void debug(Supplier<String> message) {
    if (isEnabled(LogLevel.DEBUG)) log(LogLevel.DEBUG, message.get());
}

// "{}" placeholders are filled only after the level check.
void debug(String pattern, Object... args) {
    if (isEnabled(LogLevel.DEBUG)) log(LogLevel.DEBUG, fill(pattern, args));
}

private static String fill(String pattern, Object[] args) {
    StringBuilder out = new StringBuilder();
    int from = 0;
    for (Object arg : args) {
        int at = pattern.indexOf("{}", from);
        if (at < 0) break;                                    // more arguments than placeholders: ignore the rest
        out.append(pattern, from, at).append(arg);
        from = at + 2;
    }
    return out.append(pattern, from, pattern.length()).toString();
}

// Usage: log.debug(() -> "cart=" + cart.toDetailedString());
//        log.debug("user {} added {} items", userId, count);` },
        { type: "keypoints", items: [
          "The supplier form costs a lambda capture; the pattern form still allocates the varargs array and boxes primitives. Fixed-arity overloads (one and two arguments) avoid that on the hottest paths.",
          "<code>isEnabled</code> is the escape hatch for anything bigger: wrap a whole block of diagnostic work in it.",
          "Parameterised messages also keep the template stable, which lets a collector group lines by pattern."
        ] }
      ]
    }
  ],
  takeaways: [
    "Most follow-ups are one new class: AsyncSink and RollingFileSink are Sinks; nothing in Logger or Appender changes.",
    "Asynchronous logging trades durability for latency; make it opt-in per destination, bound the queue, decide the drop policy, and drain on shutdown.",
    "Per-name levels resolve from the nearest ancestor by cutting at dots, inside an immutable map, never by modifying the logger cache from computeIfAbsent.",
    "Live reconfiguration keeps every object immutable and swaps one LogConfig snapshot atomically; loggers read it once per call.",
    "Disabled logging should cost one comparison: isEnabled, Supplier and pattern overloads build strings only when some appender will write them."
  ]
};
