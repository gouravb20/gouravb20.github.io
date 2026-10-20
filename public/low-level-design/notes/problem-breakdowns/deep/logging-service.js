// Deep dives: Logging Service (LLD). Format: DeepDive in public/shared/notes.d.ts.
window.DEEP = window.DEEP || {};
DEEP["logging-service"] = {
  hook: `<p>The core library composes formatters with sinks and locks only at the outputs. The follow-ups are the features every real logging library has: non-blocking calls, named loggers that inherit configuration, remote destinations, rotation and cheap filtered-out messages.</p>`,
  sections: [
    {
      id: "async",
      title: "Making log() non-blocking",
      kicker: "Follow-up: latency",
      blocks: [
        { type: "problem", html: `<p>A synchronous file write on every <code>log()</code> call puts disk latency on every request thread, and a slow disk makes the whole application slow.</p>` },
        { type: "code", lang: "java", title: "A bounded queue and one writer thread", code: `final class AsyncLogger implements AutoCloseable {
    private final Logger delegate;
    private final BlockingQueue<Runnable> queue = new ArrayBlockingQueue<>(10_000);
    private final AtomicLong dropped = new AtomicLong();
    private final Thread writer;
    private volatile boolean running = true;

    AsyncLogger(Logger delegate) {
        this.delegate = delegate;
        this.writer = Thread.ofPlatform().name("log-writer").daemon(true).unstarted(this::drain);
        writer.start();
    }

    void log(Level level, String message) {
        Instant at = Instant.now();
        String thread = Thread.currentThread().getName();              // captured on the caller's thread
        Runnable write = () -> delegate.write(new LogRecord(at, level, message, thread));
        if (level.isAtLeast(Level.ERROR)) {
            try { queue.put(write); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
        } else if (!queue.offer(write)) {
            dropped.incrementAndGet();                                 // never block for DEBUG/INFO/WARN
        }
    }

    private void drain() {
        try {
            while (running || !queue.isEmpty()) {
                Runnable r = queue.poll(100, TimeUnit.MILLISECONDS);
                if (r != null) r.run();
            }
        } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
    }

    @Override public void close() throws InterruptedException { running = false; writer.join(); }
}
// Logger.write(LogRecord) is the existing fan-out to destinations, exposed for this wrapper.` },
        { type: "keypoints", items: [
          "Capture the timestamp and thread name on the calling thread, or every record would show the writer thread.",
          "Choose the full-queue policy per level: dropping DEBUG is fine, dropping ERROR is not.",
          "Drain and flush on shutdown, or the last records before a crash are lost."
        ] }
      ]
    },
    {
      id: "named-loggers",
      title: "Hierarchical named loggers",
      kicker: "Follow-up: configuration",
      blocks: [
        { type: "text", html: `<p>Real code asks for <code>LoggerFactory.get("com.shop.payments")</code>. Configuration is set on a few names ("com.shop" at INFO, "com.shop.payments" at DEBUG) and every other logger inherits from its nearest configured ancestor.</p>` },
        { type: "code", lang: "java", title: "Registry and inheritance by dotted name", code: `final class LoggerRegistry {
    private final ConcurrentHashMap<String, NamedLogger> loggers = new ConcurrentHashMap<>();
    private final Map<String, Level> configuredLevels;              // e.g. "" (root) -> WARN, "com.shop" -> INFO

    LoggerRegistry(Map<String, Level> configuredLevels) { this.configuredLevels = Map.copyOf(configuredLevels); }

    NamedLogger get(String name) {
        return loggers.computeIfAbsent(name, n -> new NamedLogger(n, effectiveLevel(n)));
    }

    private Level effectiveLevel(String name) {
        for (String n = name; ; n = parent(n)) {
            Level l = configuredLevels.get(n);
            if (l != null) return l;
            if (n.isEmpty()) return Level.INFO;                       // default if root isn't configured
        }
    }

    private static String parent(String name) {
        int dot = name.lastIndexOf('.');
        return dot < 0 ? "" : name.substring(0, dot);
    }
}` },
        { type: "callout", tone: "tip", html: `<p><code>computeIfAbsent</code> guarantees one logger instance per name even when many classes initialise at once. In Log4j-style libraries, destinations are additive up the tree too, unless a logger switches inheritance off.</p>` }
      ]
    },
    {
      id: "remote-and-rotation",
      title: "Remote destinations and file rotation",
      kicker: "Follow-up: new sinks",
      blocks: [
        { type: "text", html: `<p>Both are just new <code>Sink</code> implementations, which is the payoff of composing formatters with sinks.</p>` },
        { type: "code", lang: "java", title: "A size-based rolling file sink", code: `final class RollingFileSink implements Sink {
    private final Path base;
    private final long maxBytes;
    private BufferedWriter out;
    private long written;

    RollingFileSink(Path base, long maxBytes) throws IOException {
        this.base = base; this.maxBytes = maxBytes; open();
    }

    public synchronized void write(String line) {
        try {
            if (written + line.length() + 1 > maxBytes) roll();
            out.write(line); out.newLine(); out.flush();
            written += line.length() + 1;
        } catch (IOException e) { System.err.println("log write failed: " + e.getMessage()); }
    }

    private void roll() throws IOException {
        out.close();
        Files.move(base, base.resolveSibling(base.getFileName() + "." + System.currentTimeMillis()));
        open();
    }

    private void open() throws IOException {
        out = Files.newBufferedWriter(base, StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        written = Files.size(base);
    }
}` },
        { type: "table", title: "A remote sink", headers: ["Concern", "Approach"], rows: [
          ["Latency", "Buffer lines and send in batches from a background thread"],
          ["Failures", "Retry with exponential backoff; spill to a local file when the endpoint is down"],
          ["Memory", "Bounded buffer; drop low levels first when full"],
          ["Ordering", "Per-sink order is preserved by one sender thread"]
        ] }
      ]
    },
    {
      id: "lazy-messages",
      title: "Cheap messages that get filtered out",
      kicker: "Follow-up: performance",
      blocks: [
        { type: "text", html: `<p><code>logger.debug("cart=" + cart.toDetailedString())</code> builds the string even when nothing logs DEBUG. In hot paths that is real CPU and garbage.</p>` },
        { type: "code", lang: "java", title: "Supplier overloads and an enabled check", code: `boolean isEnabled(Level level) {
    for (Destination d : destinations) if (d.accepts(level)) return true;
    return false;
}

void debug(Supplier<String> message) {
    if (isEnabled(Level.DEBUG)) log(Level.DEBUG, message.get());
}

// Usage: logger.debug(() -> "cart=" + cart.toDetailedString());` },
        { type: "quiz", q: "A console destination accepts DEBUG and up with plain text; a file destination accepts WARN and up with JSON. What happens to logger.info(\"started\")?", options: ["Both write it", "Only the console writes it, as plain text", "Only the file writes it, as JSON", "Neither: the logger's level is WARN"], answer: 1, explain: `<p>Each destination filters independently. INFO passes the console's DEBUG threshold and fails the file's WARN threshold, so only the console writes it, in its own format.</p>` }
      ]
    }
  ],
  takeaways: [
    "Non-blocking logging: a bounded queue and a writer thread, a per-level full-queue policy, and a drain on shutdown.",
    "Named loggers: a registry with computeIfAbsent and inheritance from the nearest configured ancestor.",
    "Remote destinations and rotation are new Sinks; batching and backoff keep remote ones from blocking callers.",
    "Supplier-based messages avoid building strings that every destination would drop."
  ]
};
