// LLD problem breakdown: Logging Service. Format: Chapter in public/shared/notes.d.ts; shared helpers in data-part2.js.
// Imports are omitted in the code.
(function () {
const { levels, PRACTICE_TIP } = LLD_PROBLEMS_KIT;

window.DATA.chapters.push({
    id: `logging-service`, part: 2, number: 0, difficulty: `medium`,
    title: `Logging Service: levels, appenders and formats that vary independently`,
    references: [{ title: `awesome-low-level-design: Logging Framework`, url: `https://github.com/ashishps1/awesome-low-level-design/blob/main/problems/logging-framework.md` }],
    overview: `Design the in-process logging library an application calls with <code>log.info("user signed in")</code>, in the spirit of Log4j or SLF4J: ordered severity levels, named loggers, several destinations per application, a minimum level and a format per destination, and writes from many threads that never interleave. This page works the problem in interview order: clarify the requirements, find the entities, design the classes top down, decide how formats meet destinations and where the locks go (comparing three options each time), implement, verify with a call-by-call trace, then handle follow-ups. The design lands on an <strong>Appender</strong> that composes a <strong>Formatter</strong> with a <strong>Sink</strong> (N plus M classes instead of N times M), immutable configuration shared without locks, one lock per sink, and a <strong>LoggerFactory</strong> instance instead of a Singleton.`,
    source: { title: `Hello Interview: Logging Service (LLD) problem breakdown`, url: `https://www.hellointerview.com/learn/low-level-design/problem-breakdowns/logging-service` },
    problem: [
      { id: `understanding`, title: `What a logging library does`, kicker: `The problem`, blocks: [
        { type: `problem`, html: `<p>Application code all over a service wants to record what happened: a user signed in, a payment was retried, the database stopped answering. Each call carries a severity and a message. The library stamps it with the time and the thread, decides which destinations want it, formats it for each one and writes it, while dozens of request threads do the same thing at once.</p>` },
        { type: `text`, html: `<p>The prompt is usually one sentence: <em>"Design a logging framework (or logging service) that applications can use to log messages at different levels to different outputs."</em> That could mean a library inside one process or a distributed pipeline like ELK. The first few minutes go into deciding which, and turning it into a spec.</p>` }
      ] },
      { id: `clarifying`, title: `Clarifying questions`, kicker: `Step 1: requirements`, blocks: [
        { type: `text`, html: `<p>Work through four kinds of question: <strong>what the library must do</strong>, <strong>what happens with bad input or failures</strong>, <strong>what is deliberately left out</strong>, and <strong>what might be added later</strong>. Spend one to three minutes here; every answer removes a branch you would otherwise design for.</p>` },
        { type: `table`, headers: [`You ask`, `A typical answer`, `What it decides`], rows: [
          [`A library inside the application, or a central log service?`, `An in-process library; shipping logs elsewhere is a follow-up`, `No network, queues or storage in the core`],
          [`Which levels, and are they ordered?`, `DEBUG, INFO, WARN, ERROR, FATAL, in that order`, `An enum; filtering is one comparison`],
          [`One output or several? Does every record go to all of them?`, `Several (console and file at least); each record goes to every output that wants it`, `A list of destinations; one record fans out`],
          [`One minimum level for the app, or one per output?`, `Per output: console shows DEBUG, the file keeps WARN and up`, `The filter lives with the destination, not the logger`],
          [`Is the format tied to the output?`, `No: plain text or JSON on any output`, `Format and destination vary independently, so compose them`],
          [`Do callers ask for loggers by name?`, `Yes, one per component; the name appears in every line`, `A factory that hands out named loggers sharing one configuration`],
          [`Many threads at once? What if a write fails?`, `Yes; lines must never mix. A full disk must not break a request`, `A lock per output; failures reported, never thrown`],
          [`Can configuration change while running?`, `No, fixed at startup`, `Immutable configuration, read without locks; runtime changes are a follow-up`]
        ] },
        { type: `callout`, tone: `insight`, title: `Do format and destination vary independently?`, html: `<p>This is the question that shapes the whole design. If any format can go to any destination, a class per combination grows as formats times destinations, and every new format means one new class per destination. Asking it out loud shows you see the axis of change before writing code; the answer is almost always "yes, independently", which leads straight to composing a <code>Formatter</code> with a <code>Sink</code>.</p>` }
      ] },
      { id: `final-requirements`, title: `Final requirements`, kicker: `Step 1: requirements`, blocks: [
        { type: `code`, lang: `text`, title: `Final requirements`, code: `Requirements
  1. Levels DEBUG < INFO < WARN < ERROR < FATAL.
  2. Application code gets a logger by name; the same name returns the same logger.
  3. Each record carries a timestamp, level, logger name, thread name and message.
  4. Destinations (appenders) are configured once at startup; each record is
     offered to every appender.
  5. Each appender has its own minimum level and its own format (plain text, JSON);
     format and destination (console, file) vary independently.
  6. Many threads log at once; one record's line never interleaves with another's
     on the same destination.
  7. Logging never throws into the caller: a failed write is reported on stderr.
  8. Bad input: a null level is ignored, a null message is written as "null",
     a blank logger name means "root". A configuration with no appenders is
     rejected at startup.
  9. Shutdown flushes and closes every destination exactly once.

Out of scope
  - Changing levels or appenders at run time
  - Asynchronous or buffered writes, network destinations, file rotation
    (the design must allow adding them)
  - Per-name levels and logger hierarchies, structured key-value fields` },
        { type: `callout`, tone: `tip`, html: PRACTICE_TIP }
      ] }
    ],
    solution: [
      { id: `entities`, title: `Core entities`, kicker: `Step 2: entities`, blocks: [
        { type: `text`, html: `<p>Scan the requirements for nouns that hold state or enforce rules. Plenty of nouns appear (level, record, logger, destination, format, configuration, file), and several of them should not become classes. Test each one before committing.</p>` },
        { type: `table`, headers: [`Candidate`, `Verdict`, `Why`], rows: [
          [`Level`, `An enum`, `A fixed, ordered set; the only rule is "is this at least that", which is one comparison`],
          [`Log record`, `A record (immutable value)`, `Built once per call and read by every destination, possibly on other threads`],
          [`Timestamp, thread name`, `Fields of the record, not classes`, `They hold no rules; they are captured once and copied into the record`],
          [`Logger`, `A class`, `What application code calls: stamps a record and offers it to every appender`],
          [`Destination (console, file)`, `An interface, <code>Sink</code>, with a class per target`, `Owns the I/O and the lock that keeps lines whole`],
          [`Format (plain, JSON)`, `An interface, <code>Formatter</code>, with a class per format`, `Turns a record into one line of text; stateless`],
          [`"Console at DEBUG in plain text"`, `A class, <code>Appender</code>`, `The unit you configure: a minimum level, a formatter and a sink together`],
          [`Global LogManager`, `Not a Singleton: a <code>LoggerFactory</code> instance`, `Hands out named loggers that share one configuration; tests build their own`],
          [`Configuration`, `Constructor arguments for now`, `Fixed at startup, so a list of appenders is enough; it becomes a type only when it can change (Deep Dives)`],
          [`Log file`, `Not a class`, `A <code>Path</code> passed to <code>FileSink</code>`]
        ] },
        { type: `table`, title: `The entities we keep`, headers: [`Entity`, `Responsibility`], rows: [
          [`LoggerFactory`, `Built once at startup from the appenders. Hands out one <code>Logger</code> per name and closes every sink at shutdown. Knows nothing about formats or files.`],
          [`Logger`, `The entry point for application code. Drops records no appender wants, stamps the rest with time and thread, and offers each record to every appender. Holds no mutable state.`],
          [`LogLevel, LogRecord`, `The ordered severities, and one immutable log call.`],
          [`Appender`, `One destination: a minimum level, a <code>Formatter</code> and a <code>Sink</code>. Filters, formats, then writes.`],
          [`Formatter`, `Record to text: <code>PlainFormatter</code>, <code>JsonFormatter</code>.`],
          [`Sink`, `Text to somewhere: <code>ConsoleSink</code>, <code>FileSink</code>. The only mutable, shared objects, so the only ones with locks.`]
        ] },
        { type: `callout`, tone: `tip`, html: `<p>Say out loud which nouns you are <em>not</em> making classes and why. "Configuration is just the list of appenders for now; if it has to change at run time it becomes an immutable snapshot" shows you are designing for today's requirements while knowing where tomorrow's would land.</p>` }
      ] },
      { id: `logger-design`, title: `Class design: LoggerFactory and Logger`, kicker: `Step 3: class design, top down`, blocks: [
        { type: `text`, html: `<p>Start from what application code touches, and derive state and methods from the requirements rather than from intuition. For each requirement ask: what must this class remember, and what must it let callers do?</p>` },
        { type: `table`, headers: [`Requirement`, `What a Logger remembers`], rows: [
          [`"Each record carries the logger name"`, `Its name`],
          [`"Each record is offered to every appender"`, `The appenders: one immutable list shared with the factory and every other logger`],
          [`"Don't pay for records nobody wants"`, `A threshold: the lowest level any appender accepts`],
          [`"Each record carries a timestamp"`, `A <code>Clock</code>, injected so tests are deterministic`]
        ] },
        { type: `table`, headers: [`Need`, `Method`], rows: [
          [`Get a logger for a component`, `<code>Logger LoggerFactory.getLogger(String name)</code>`],
          [`Log at a level`, `<code>void log(LogLevel level, String message)</code>, plus <code>debug</code>, <code>info</code>, <code>warn</code>, <code>error</code>, <code>fatal</code>`],
          [`Check before building an expensive message`, `<code>boolean isEnabled(LogLevel level)</code>`],
          [`Flush and release files at shutdown`, `<code>void LoggerFactory.close()</code>`]
        ] },
        { type: `keypoints`, items: [
          `<strong>The logger is immutable.</strong> Name, appenders, threshold and clock are final and never change, so one logger can be shared by every thread without a lock; keep it in a <code>static final</code> field or inject it.`,
          `<strong>Build the record once, in the logger, on the caller's thread.</strong> That is the only place the thread name is right, and every appender then sees the same timestamp and message.`,
          `<strong>A factory instance, not a Singleton.</strong> Tests build a factory with in-memory sinks and a fixed clock; an audit log can have its own factory beside the main one. If the codebase insists on a static accessor, make it a lock-guarded lazy holder that installs the factory once at startup; none of the classes change.`,
          `<strong>The threshold is an optimisation, not a rule.</strong> Appenders still filter on their own level; the logger's threshold only lets a DEBUG call return before reading the clock when no appender wants DEBUG.`
        ] }
      ] },
      { id: `appender-design`, title: `Class design: Appender, Formatter and Sink`, kicker: `Step 3: class design`, blocks: [
        { type: `table`, headers: [`Requirement`, `What an Appender remembers`], rows: [
          [`"Each appender has its own minimum level"`, `A <code>LogLevel</code>`],
          [`"Each appender has its own format"`, `A <code>Formatter</code>`],
          [`"Console, file, and later a network collector"`, `A <code>Sink</code>`]
        ] },
        { type: `table`, headers: [`Need`, `Method`], rows: [
          [`Should this record go here?`, `<code>boolean Appender.accepts(LogLevel level)</code>`],
          [`Filter, format and write one record`, `<code>void Appender.append(LogRecord r)</code>`],
          [`Turn a record into one line`, `<code>String Formatter.format(LogRecord r)</code>`],
          [`Write one whole line, safely`, `<code>void Sink.write(String line)</code>`],
          [`Release the file at shutdown`, `<code>void Sink.close()</code>`]
        ] },
        { type: `text`, html: `<p>The decision that matters here: <strong>how do formats meet destinations?</strong> Two formats and two targets today, with a syslog target and a logfmt format likely next.</p>` },
        { type: `compare`, items: [
          { title: `Good: a class per combination`, tone: `warn`, html: `<p><code>PlainConsoleAppender</code>, <code>JsonConsoleAppender</code>, <code>PlainFileAppender</code>, <code>JsonFileAppender</code>. Easy to read, and each class is tiny. But it grows as formats times destinations: adding logfmt means a new class per destination, and the JSON escaping code is copied into every JSON class.</p>` },
          { title: `Better: inheritance with a format switch`, tone: `info`, html: `<p>An abstract <code>Appender</code> owns the level check and a <code>format()</code> that switches on a format enum; <code>ConsoleAppender</code> and <code>FileAppender</code> subclass it and implement the write. One class per destination, no copying. But every new format edits the base class, and a format cannot be tested without a destination.</p>` },
          { title: `Great: compose a Formatter with a Sink`, tone: `ok`, html: `<p><code>Appender</code> holds a <code>Formatter</code> and a <code>Sink</code>, both interfaces. N formats plus M sinks, any combination chosen in configuration, each piece testable alone. A new format or target is one new class and no edits. This is the Strategy pattern twice, or the Bridge pattern if you prefer the name.</p>` }
        ] },
        { type: `text`, html: `<p>We compose. The minimum level stays on the <code>Appender</code> rather than the <code>Sink</code>, because "the console shows DEBUG" is a configuration choice, not a property of consoles, and two appenders may write different levels to the same sink. Formatters are stateless, so one <code>JsonFormatter</code> can serve every appender.</p>` }
      ] },
      { id: `write-safety`, title: `Key decision: thread-safe writes`, kicker: `Step 3: class design`, blocks: [
        { type: `text`, html: `<p>Before choosing a lock, list what is shared between threads. The factory, every logger, every appender and every record are immutable after construction, so they are safe to share with no locking at all. The only mutable shared objects are the outputs: a <code>BufferedWriter</code> is not thread-safe, and two threads writing to it can mix characters from two lines.</p>` },
        { type: `compare`, items: [
          { title: `Write directly, no lock`, tone: `warn`, html: `<p>Each appender calls the writer straight away. Fast, and fine with one thread. With many threads, a line and its newline can be split by another thread's line, and an unsynchronised <code>BufferedWriter</code> can corrupt its buffer. Unacceptable for requirement 6.</p>` },
          { title: `Asynchronous: a queue and one writer thread`, tone: `info`, html: `<p><code>log()</code> enqueues and returns; one thread does all the I/O, so no lock on the writer and no disk latency on request threads. But it needs a full-queue policy, a drain on shutdown, and it loses the last records on a crash. More than this spec needs; it becomes a follow-up (Deep Dives).</p>` },
          { title: `A lock per sink`, tone: `ok`, html: `<p>Each sink's <code>write</code> is <code>synchronized</code> and writes the whole line inside it. Lines never mix, formatting happens before the lock so threads format in parallel, and the console and the file have separate locks so a slow disk never blocks console output.</p>` }
        ] },
        { type: `table`, title: `What is shared, and why it is safe`, headers: [`Object`, `Shared by`, `Why it is safe`], rows: [
          [`LoggerFactory, Logger, Appender`, `Every thread`, `All fields final, set in the constructor; nothing changes afterwards`],
          [`LogRecord`, `Every appender for one call`, `An immutable record`],
          [`Formatter`, `Every appender that uses it`, `Stateless`],
          [`The logger cache`, `Threads calling <code>getLogger</code>`, `<code>ConcurrentHashMap.computeIfAbsent</code> creates one logger per name`],
          [`Sink`, `Every thread writing to that destination`, `Mutable, so <code>write</code> and <code>close</code> are synchronized on the sink`]
        ] }
      ] },
      { id: `class-diagram`, title: `Final class design`, kicker: `Step 3: class design`, blocks: [
        { type: `code`, lang: `java`, title: `Final class design`, code: `enum LogLevel { DEBUG, INFO, WARN, ERROR, FATAL; boolean isAtLeast(LogLevel min); }

record LogRecord(Instant time, LogLevel level, String logger, String thread, String message) {}

final class LoggerFactory implements AutoCloseable {
    private final List<Appender> appenders;                      // fixed at startup, shared by every logger
    private final LogLevel threshold;                            // the lowest level any appender accepts
    private final Clock clock;
    private final ConcurrentMap<String, Logger> loggers;         // one logger per name

    LoggerFactory(List<Appender> appenders, Clock clock);        // rejects an empty list
    Logger getLogger(String name);
    void close();                                                // closes every sink once
}

final class Logger {
    private final String name;
    private final List<Appender> appenders;
    private final LogLevel threshold;
    private final Clock clock;

    boolean isEnabled(LogLevel level);
    void log(LogLevel level, String message);                    // never throws
    void debug(String m);  void info(String m);  void warn(String m);  void error(String m);  void fatal(String m);
}

final class Appender {                                           // one destination
    private final LogLevel minLevel;
    private final Formatter formatter;
    private final Sink sink;

    boolean accepts(LogLevel level);
    void append(LogRecord r);                                    // filter, format, write
}

interface Formatter { String format(LogRecord r); }             // PlainFormatter, JsonFormatter
interface Sink { void write(String line); default void close() {} }   // ConsoleSink, FileSink: one lock each` },
        { type: `text`, html: `<p>The factory owns configuration and nothing else; loggers stamp and fan out; appenders filter, format and delegate; sinks own the I/O and the only locks. Each class has one reason to change: a new format touches <code>Formatter</code> implementations, a new target touches <code>Sink</code> implementations, and neither touches <code>Logger</code>.</p>` }
      ] },
      { id: `core-impl`, title: `Implementation: levels, records, loggers and the factory`, kicker: `Step 4: implementation`, blocks: [
        { type: `text`, html: `<p>Check what the interviewer wants: working code, pseudocode or a walkthrough. Start from how the library is used, then write each method's normal path first and its edge cases second.</p>` },
        { type: `code`, lang: `java`, title: `Wiring it up at startup`, code: `try (LoggerFactory logs = new LoggerFactory(List.of(
        new Appender(LogLevel.DEBUG, new PlainFormatter(), new ConsoleSink()),
        new Appender(LogLevel.WARN,  new JsonFormatter(),  new FileSink(Path.of("app.log")))),
        Clock.systemUTC())) {

    Logger log = logs.getLogger("payments");     // usually one per class, kept in a field
    log.info("user 42 signed in");                // console only
    log.error("charge failed");                   // console and app.log
}` },
        { type: `code`, lang: `java`, title: `LogLevel and LogRecord`, code: `/** Declaration order is severity order, so filtering is one comparison. */
enum LogLevel {
    DEBUG, INFO, WARN, ERROR, FATAL;

    boolean isAtLeast(LogLevel min) { return compareTo(min) >= 0; }
}

/** One log call, built once and shared by every appender. Immutable, so any thread may read it. */
record LogRecord(Instant time, LogLevel level, String logger, String thread, String message) {}` },
        { type: `text`, html: `<p><code>log</code> on the normal path: check the level, build one record, offer it to each appender. The edge cases are a null level (ignore it before reading the clock), a null message (write the text "null", as SLF4J does), and an appender that throws: catch it per appender so one broken formatter neither stops the others nor reaches the caller.</p>` },
        { type: `code`, lang: `java`, title: `Logger`, code: `final class Logger {
    private final String name;
    private final List<Appender> appenders;      // immutable list, shared with the factory
    private final LogLevel threshold;            // nothing below this can reach any appender
    private final Clock clock;

    Logger(String name, List<Appender> appenders, LogLevel threshold, Clock clock) {
        this.name = name;
        this.appenders = appenders;
        this.threshold = threshold;
        this.clock = clock;
    }

    boolean isEnabled(LogLevel level) { return level != null && level.isAtLeast(threshold); }

    void log(LogLevel level, String message) {
        if (!isEnabled(level)) return;                                  // null, or below every appender: no record built
        LogRecord r = new LogRecord(clock.instant(), level, name,
                Thread.currentThread().getName(), String.valueOf(message));   // captured on the caller's thread
        for (Appender a : appenders) {
            try {
                a.append(r);
            } catch (RuntimeException e) {                              // a broken appender must not stop the others
                System.err.println("appender failed: " + e);
            }
        }
    }

    void debug(String m) { log(LogLevel.DEBUG, m); }
    void info(String m)  { log(LogLevel.INFO, m); }
    void warn(String m)  { log(LogLevel.WARN, m); }
    void error(String m) { log(LogLevel.ERROR, m); }
    void fatal(String m) { log(LogLevel.FATAL, m); }
}` },
        { type: `code`, lang: `java`, title: `LoggerFactory`, code: `final class LoggerFactory implements AutoCloseable {
    private final List<Appender> appenders;
    private final LogLevel threshold;
    private final Clock clock;
    private final ConcurrentMap<String, Logger> loggers = new ConcurrentHashMap<>();

    LoggerFactory(List<Appender> appenders, Clock clock) {
        if (appenders.isEmpty()) throw new IllegalArgumentException("configure at least one appender");   // fail at startup
        this.appenders = List.copyOf(appenders);
        this.threshold = this.appenders.stream().map(Appender::minLevel).min(Comparator.naturalOrder()).orElseThrow();
        this.clock = clock;
    }

    /** The same name always returns the same logger, even when many threads ask at once. */
    Logger getLogger(String name) {
        String key = (name == null || name.isBlank()) ? "root" : name;
        return loggers.computeIfAbsent(key, k -> new Logger(k, appenders, threshold, clock));
    }

    /** Flushes and closes each sink once, even if two appenders share it. */
    @Override public void close() {
        appenders.stream().map(Appender::sink).distinct().forEach(Sink::close);
    }
}` },
        { type: `list`, title: `Edge cases the code handles`, items: [
          `A null level: <code>isEnabled</code> is false, so nothing is built and the clock is not read.`,
          `A null message: written as <code>null</code> through <code>String.valueOf</code>, not a crash.`,
          `A null or blank logger name: the logger called <code>root</code>.`,
          `No appenders: the factory refuses to start. A configuration mistake should fail loudly at startup, not silently log nothing; only log calls promise never to throw.`,
          `A formatter or sink that throws: caught per appender and reported on stderr; the other appenders still write.`,
          `Two threads asking for the same name: <code>computeIfAbsent</code> creates exactly one logger.`
        ] }
      ] },
      { id: `appender-impl`, title: `Implementation: appenders, formatters and sinks`, kicker: `Step 4: implementation`, blocks: [
        { type: `text`, html: `<p>The appender is three lines of logic; the care goes into the formatter (a message with a quote or a newline must not break a JSON line) and the sinks (a whole line under one lock, and I/O failures that never escape).</p>` },
        { type: `code`, lang: `java`, title: `Appender`, code: `/** One destination: a minimum level, a format and a place to write. Immutable after construction. */
final class Appender {
    private final LogLevel minLevel;
    private final Formatter formatter;
    private final Sink sink;

    Appender(LogLevel minLevel, Formatter formatter, Sink sink) {
        this.minLevel = Objects.requireNonNull(minLevel);
        this.formatter = Objects.requireNonNull(formatter);
        this.sink = Objects.requireNonNull(sink);
    }

    LogLevel minLevel() { return minLevel; }
    Sink sink()         { return sink; }

    boolean accepts(LogLevel level) { return level.isAtLeast(minLevel); }

    void append(LogRecord r) {
        if (accepts(r.level())) sink.write(formatter.format(r));   // format outside the sink's lock
    }
}` },
        { type: `code`, lang: `java`, title: `Formatters: plain text and JSON`, code: `interface Formatter { String format(LogRecord r); }

/** 2026-10-21T08:00:01Z INFO [main] payments - user 42 signed in */
final class PlainFormatter implements Formatter {
    public String format(LogRecord r) {
        return r.time() + " " + r.level() + " [" + r.thread() + "] " + r.logger() + " - " + r.message();
    }
}

/** One JSON object per line, so log collectors can parse it. */
final class JsonFormatter implements Formatter {
    private static final char BACKSLASH = (char) 92;
    private static final String TEMPLATE = """
        {"time":"%s","level":"%s","logger":"%s","thread":"%s","message":"%s"}""";

    public String format(LogRecord r) {
        return TEMPLATE.formatted(r.time(), r.level(), escape(r.logger()), escape(r.thread()), escape(r.message()));
    }

    /** A quote ends the JSON string early and a raw newline splits the record across two lines. */
    private static String escape(String s) {
        StringBuilder out = new StringBuilder(s.length() + 8);
        for (char c : s.toCharArray()) {
            if (c == '"' || c == BACKSLASH) out.append(BACKSLASH).append(c);
            else if (c < 0x20) out.append(String.format("%cu%04x", BACKSLASH, (int) c));
            else out.append(c);
        }
        return out.toString();
    }
}` },
        { type: `code`, lang: `java`, title: `Sinks: console and file`, code: `/** Writes one whole line. Implementations must never interleave two lines, and never throw on I/O failure. */
interface Sink {
    void write(String line);
    default void close() {}
}

final class ConsoleSink implements Sink {
    private final PrintStream out;

    ConsoleSink() { this(System.out); }
    ConsoleSink(PrintStream out) { this.out = out; }

    public synchronized void write(String line) { out.println(line); }
}

final class FileSink implements Sink {
    private final BufferedWriter out;        // guarded by this: BufferedWriter is not thread-safe
    private boolean closed;                  // guarded by this

    FileSink(Path path) throws IOException {
        out = Files.newBufferedWriter(path, StandardOpenOption.CREATE, StandardOpenOption.APPEND);
    }

    public synchronized void write(String line) {
        if (closed) return;                                          // late records after shutdown are dropped
        try {
            out.write(line);
            out.newLine();
            out.flush();                                             // in the file before the call returns
        } catch (IOException e) {
            System.err.println("log write failed: " + e.getMessage());   // never throw into the caller
        }
    }

    @Override public synchronized void close() {
        if (closed) return;
        closed = true;
        try { out.close(); } catch (IOException e) { System.err.println("log close failed: " + e.getMessage()); }
    }
}` },
        { type: `keypoints`, items: [
          `<strong>The lock covers the line and its newline.</strong> Writing them as two separately locked calls would let another thread's line land between them.`,
          `<strong>Format before locking.</strong> String building is the expensive part; doing it in <code>Appender.append</code> keeps each sink's lock held only for the I/O.`,
          `<strong>Flush per line</strong> trades throughput for durability: after a crash, every returned call is in the file. Batching flushes is the first knob to turn if the disk becomes the bottleneck.`,
          `<strong>The plain format is for people.</strong> A newline inside a message breaks it across lines; anything a machine parses should use the JSON format, which escapes it.`
        ] },
        { type: `callout`, tone: `warning`, html: `<p>Thread safety: <code>ConsoleSink</code> locks even though <code>PrintStream.println</code> already synchronizes internally, so the "whole line, never interleaved" contract comes from <code>Sink</code> and not from a JDK detail. A common version of this design lets callers change an appender's formatter at run time through a plain setter; another thread can then keep using the old formatter indefinitely, because nothing makes the write visible. Here every configuration field is final, and the only mutable state lives behind each sink's own lock. Sinks never call each other or take another lock, so there is no lock ordering to get wrong.</p>` },
        { type: `text`, html: `<p>The level enum, an immutable message that captures time and thread on the caller, a formatter strategy injected into each appender, console and file appenders, and closing appenders at shutdown follow the <a href="https://github.com/ashishps1/awesome-low-level-design/tree/main/solutions/java/src/loggingframework" target="_blank" rel="noopener">awesome-low-level-design logging framework</a>; the code here is written independently. Changed: its eagerly created <code>LogManager</code> Singleton became a <code>LoggerFactory</code> instance; its mutable <code>setFormatter</code> and <code>setLevel</code> fields became final configuration; its always-asynchronous processor on an unbounded executor queue became a synchronous core with an optional bounded queue (Deep Dives); its formatter's trailing newline, which <code>println</code> doubled, is gone. Its parent-logger hierarchy, built by calling <code>getLogger</code> inside <code>computeIfAbsent</code> (which <code>ConcurrentHashMap</code> forbids), moves to the Deep Dives with a lookup that never modifies the map from inside the mapping function.</p>` }
      ] },
      { id: `verification`, title: `Verifying with a trace`, kicker: `Step 5: verification`, blocks: [
        { type: `text`, html: `<p>Walk a concrete sequence of calls through the design before the interviewer does. Swap the real sinks for in-memory ones and the clock for one that advances a second per record, so every line is predictable.</p>` },
        { type: `code`, lang: `java`, title: `Trace setup: in-memory sinks and a test clock`, code: `/** Keeps lines in memory so a test can assert exactly what each destination received. */
final class MemorySink implements Sink {
    private final List<String> lines = new ArrayList<>();      // guarded by this
    public synchronized void write(String line) { lines.add(line); }
    synchronized List<String> lines() { return List.copyOf(lines); }
}

/** Starts at 08:00:00Z and advances one second each time a record is stamped. */
final class TestClock extends Clock {
    private final Instant start = Instant.parse("2026-10-21T08:00:00Z");
    private final AtomicLong seconds = new AtomicLong();
    public Instant instant() { return start.plusSeconds(seconds.incrementAndGet()); }
    public ZoneId getZone() { return ZoneOffset.UTC; }
    public Clock withZone(ZoneId zone) { return this; }
}

MemorySink console = new MemorySink(), file = new MemorySink();
LoggerFactory logs = new LoggerFactory(List.of(
        new Appender(LogLevel.DEBUG, new PlainFormatter(), console),
        new Appender(LogLevel.WARN,  new JsonFormatter(),  file)),
        new TestClock());` },
        { type: `code`, lang: `text`, title: `Call by call`, code: `Setup: console appender = DEBUG, plain   file appender = WARN, JSON
       logger threshold = DEBUG (the lowest appender level)

1  [main]      payments = logs.getLogger("payments")
               creates and caches the logger; nothing written
2  [main]      payments.debug("cart has 3 items")
     console   2026-10-21T08:00:01Z DEBUG [main] payments - cart has 3 items
     file      dropped: DEBUG is below WARN
3  [main]      payments.info("user 42 signed in")
     console   2026-10-21T08:00:02Z INFO [main] payments - user 42 signed in
     file      dropped: INFO is below WARN
4  [main]      payments.warn("card charge retry 1 of 3")
     console   2026-10-21T08:00:03Z WARN [main] payments - card charge retry 1 of 3
     file      {"time":"2026-10-21T08:00:03Z","level":"WARN","logger":"payments","thread":"main","message":"card charge retry 1 of 3"}
5  [worker-2]  orders = logs.getLogger("orders"); orders.error("order 7 not saved")
     console   2026-10-21T08:00:04Z ERROR [worker-2] orders - order 7 not saved
     file      {"time":"2026-10-21T08:00:04Z","level":"ERROR","logger":"orders","thread":"worker-2","message":"order 7 not saved"}
6  [worker-2]  logs.getLogger("payments") == payments
               true: the cached instance; nothing written
7  [main]      payments.log(null, "ignored")
               isEnabled(null) is false: no record, no clock tick, nothing written
8  [main]      payments.info(null)
     console   2026-10-21T08:00:05Z INFO [main] payments - null
     file      dropped: INFO is below WARN
9  [main]      orders.fatal("database unreachable"), with the file's write failing (disk full)
     console   2026-10-21T08:00:06Z FATAL [main] orders - database unreachable
     file      nothing; stderr gets "log write failed: disk full"; the call returns normally

Totals: console 6 lines, file 2 lines, 2 loggers cached` },
        { type: `keypoints`, items: [
          `Each appender filtered on its own level: INFO reached the console and not the file, WARN and above reached both, each in its own format.`,
          `The record was built once per call, so the console and file lines for calls 4 and 5 share one timestamp; call 5 carries the worker's thread name because it was captured on the caller's thread.`,
          `The ignored call 7 did not consume a clock tick, which shows nothing was built; call 9 shows a failing destination costs only its own line.`
        ] }
      ] }
    ],
    levels: levels(
      [`A level enum compared by order, an immutable record, and a logger that writes each record to several outputs.`, `A minimum level per output and a <code>Formatter</code> interface; a hint toward separating format from destination is fine.`, `Some answer to concurrency (synchronized writes) and to failures (logging doesn't crash the caller).`],
      [`Asks whether format and destination vary independently, and composes a <code>Formatter</code> with a <code>Sink</code> (N plus M classes) without prompting.`, `Places locks precisely: immutable configuration and records, one lock per sink, formatting outside the lock.`, `Replaces the Singleton with a factory instance built from configuration and explains why: tests inject a clock and in-memory sinks.`, `Handles the edges unprompted: null level and message, failed writes, a sink shared by two appenders closed once.`],
      [`Scopes library versus service out loud and says what changes if it becomes a pipeline: an agent, batching, back-pressure, delivery guarantees.`, `Weighs asynchronous logging honestly: a bounded queue, a drop policy per level, the tail lost on a crash, a drain on shutdown.`, `Sketches per-name levels and runtime reconfiguration as an immutable snapshot swapped atomically, and keeps disabled logging nearly free with <code>isEnabled</code> and suppliers.`, `Spots the flaws in common designs: mutable formatters on shared appenders, recursive <code>computeIfAbsent</code>, unbounded executor queues.`]
    ),
    concepts: [
      { term: `Level ordering`, def: `An enum whose declaration order is its severity; <code>isAtLeast</code> compares positions.`, why: `Filtering is one comparison; no level hierarchy or lookup table needed.` },
      { term: `Immutable LogRecord`, def: `Built once per call, on the caller's thread, and shared by every appender.`, why: `Correct thread name and one timestamp for every destination; safe to read from any thread.` },
      { term: `Composition over N x M classes`, def: `An <code>Appender</code> combines a <code>Formatter</code> and a <code>Sink</code>.`, why: `Formats and targets vary independently; a new one is one class, chosen in configuration (Strategy, or Bridge).` },
      { term: `Per-appender threshold`, def: `Each appender drops records below its own minimum level.`, why: `The console can show DEBUG while the file keeps WARN and above.` },
      { term: `Logger threshold`, def: `The lowest level any appender accepts, computed once by the factory.`, why: `Calls nobody wants return before reading the clock or building a record.` },
      { term: `Lock per sink`, def: `Each sink's <code>write</code> is synchronized and writes a whole line.`, why: `Lines never interleave, and a slow file never blocks the console.` },
      { term: `Never throw from logging`, def: `I/O failures and broken appenders are reported on stderr; configuration errors fail at startup instead.`, why: `A full disk must not fail a payment, but a missing appender should stop a deploy.` },
      { term: `Factory instead of Singleton`, def: `A <code>LoggerFactory</code> instance hands out one cached logger per name.`, why: `Tests and second configurations (an audit log) get their own factory; no hidden global state.` }
    ],
    interview: [
      { q: `Why not write classes like JsonFileAppender and PlainConsoleAppender?`, a: `Because format and destination vary independently. A class per combination grows as formats times destinations, and adding one format means one new class per destination, with the escaping logic copied into each. Composing a Formatter with a Sink gives formats plus destinations classes and any combination at configuration time.`, diff: `easy` },
      { q: `Where do you need synchronization, and why not lock the whole log() call?`, a: `Only at the outputs. The factory, loggers, appenders and records are immutable after construction, and formatters are stateless, so they are safe to share. Each sink synchronizes its write so a whole line goes out before another thread's. One global lock around log() would also be correct, but it serializes formatting for every thread and makes console output wait for a slow disk.`, diff: `medium` },
      { q: `Why a LoggerFactory instance instead of a Singleton LogManager?`, a: `A Singleton hides global mutable state: tests can't swap in in-memory sinks or a fixed clock without resetting it, and you can't run a second configuration such as an audit log beside the main one. A factory built at startup and passed to the code that needs it gives the same sharing without the hidden coupling. If a static accessor is unavoidable, make it a lock-guarded holder that installs the factory once.`, diff: `medium` },
      { q: `Why does the logger capture the timestamp and thread name, rather than the formatter?`, a: `The thread name is only correct on the caller's thread; if formatting ever moves to a background writer, it would report the writer thread. Capturing both once in the record also means every destination shows the same time for the same call, which matters when you correlate the console with the file.`, diff: `medium` },
      { q: `What happens if the disk fills up?`, a: `FileSink catches the IOException, reports it on stderr and returns, so the request that logged carries on and the other appenders still write. The alternative, throwing, would turn a logging problem into an outage. In production you would also count failures and alert on them, since silent log loss hides incidents.`, diff: `easy` },
      { q: `How would you make log() non-blocking?`, a: `Wrap the slow sink in an AsyncSink: callers format the line and offer it to a bounded queue; one writer thread drains it into the real sink. Decide the full-queue policy (drop and count, or block briefly) and drain on shutdown. Records are still built on the caller's thread, so time and thread name stay correct. Nothing else in the design changes, because it is just another Sink.`, diff: `medium` },
      { q: `How do you avoid building messages that will be filtered out?`, a: `Check isEnabled before expensive work, or offer overloads that take a Supplier<String> or a "{}" pattern with arguments, and only build the string after the level check. The logger's precomputed threshold makes that check a single comparison.`, diff: `medium` }
    ],
    cheatsheet: [
      { title: `Logging library in one screen`, type: `code`, lang: `java`, body: `enum LogLevel { DEBUG, INFO, WARN, ERROR, FATAL }               // isAtLeast: compareTo(min) >= 0
record LogRecord(Instant time, LogLevel level, String logger, String thread, String message) {}

interface Formatter { String format(LogRecord r); }             // PlainFormatter, JsonFormatter (escapes)
interface Sink { void write(String line); default void close() {} }   // ConsoleSink, FileSink: synchronized write

final class Appender {                                           // minLevel + Formatter + Sink: N + M classes
    void append(LogRecord r) { if (accepts(r.level())) sink.write(formatter.format(r)); }
}

final class Logger {                                             // immutable, shared by every thread
    void log(LogLevel level, String msg);    // null or below threshold: return; build the record once;
                                             // each appender inside try/catch; never throws
}

final class LoggerFactory implements AutoCloseable {             // an instance, not a Singleton
    Logger getLogger(String name);           // computeIfAbsent: one logger per name
    void close();                            // each distinct sink once
}` },
      { title: `Follow-ups and where they land`, type: `table`, headers: [`Follow-up`, `Change`], rows: [
        [`Non-blocking writes`, `A new AsyncSink wrapping any sink; configuration only (Deep Dives)`],
        [`DEBUG for one package only`, `Per-name levels in LoggerFactory, resolved when a logger is created (Deep Dives)`],
        [`Change levels without a restart`, `An immutable LogConfig swapped atomically; Logger reads it per call (Deep Dives)`],
        [`Log collector, file rotation`, `New Sinks: batching remote sink, RollingFileSink (Deep Dives)`],
        [`Expensive messages`, `Supplier and pattern overloads on Logger (Deep Dives)`],
        [`A new format (logfmt, XML)`, `A new Formatter; nothing else changes`]
      ] }
    ],
    labs: []
  });
})();
