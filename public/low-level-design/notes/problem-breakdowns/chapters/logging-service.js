// LLD problem breakdown: Logging Service. Format: Chapter in public/shared/notes.d.ts; shared helpers in data-part2.js.
// Imports are omitted in the code.
(function () {
const { levels } = LLD_PROBLEMS_KIT;

window.DATA.chapters.push({
    id: `logging-service`, part: 2, number: 0, difficulty: `medium`,
    title: `Logging Service: levels, destinations and formats that vary independently`,
    references: [{ title: `awesome-low-level-design: Logging Framework`, url: `https://github.com/ashishps1/awesome-low-level-design/blob/main/problems/logging-framework.md` }],
    overview: `Design the in-process logging library an application calls with <code>logger.info("user signed in")</code>, in the spirit of Log4j or SLF4J: severity levels, several destinations per logger, a minimum level and a format per destination, and thread-safe writes that never interleave. The requirement that shapes everything is that <strong>format and destination type vary independently</strong>, so you <strong>compose</strong> a formatter with a sink instead of writing a class for every combination.`,
    source: { title: `Hello Interview: Logging Service (LLD) problem breakdown`, url: `https://www.hellointerview.com/learn/low-level-design/problem-breakdowns/logging-service` },
    problem: [
      { id: `requirements`, title: `What we are building`, kicker: `Requirements`, blocks: [
        { type: `problem`, html: `<p>"Design a logging service" is deliberately vague. Pin it down to an <strong>in-process library</strong>: no network shipping, no central aggregation, just the object model that formats records and writes them to local destinations.</p>` },
        { type: `code`, lang: `text`, title: `Final requirements`, code: `Functional
  1. Levels DEBUG < INFO < WARN < ERROR < FATAL.
  2. Each record has a timestamp, level, message and the emitting thread's name.
  3. A logger writes each record to one or more destinations configured at startup.
  4. Each destination has its own minimum level and its own format (plain text, JSON);
     format and destination type (console, file) vary independently.
  5. Thread-safe: one record's output never interleaves with another's on a destination.

Out of scope
  - Reloading configuration at runtime, asynchronous or buffered writes,
    network destinations (but the design must allow adding one), hierarchical loggers.` }
      ] },
      { id: `clarifying`, title: `Questions that change the design`, kicker: `Clarifying`, blocks: [
        { type: `table`, headers: [`Ask`, `Assume`, `Decides`], rows: [
          [`Library or service?`, `In-process library`, `No queues or network in the core`],
          [`Which levels, ordered?`, `Five, DEBUG to FATAL`, `An enum compared by order`],
          [`Several destinations per logger?`, `Yes, every record fans out to all`, `A list of destinations`],
          [`One level for the logger, or per destination?`, `Per destination`, `Filtering lives in the destination`],
          [`Is the format tied to the destination?`, `No, any format with any target`, `Composition: formatter + sink`],
          [`Concurrency?`, `Many threads log at once; records must not interleave`, `A lock per sink`]
        ] },
        { type: `callout`, tone: `insight`, html: `<p>Two things that vary independently (format and target) are the signal for composition. Subclassing gives JsonFileDestination, PlainConsoleDestination and so on: N formats times M targets. Composing a <code>Formatter</code> with a <code>Sink</code> needs only N plus M classes.</p>` }
      ] }
    ],
    solution: [
      { id: `design`, title: `Design`, kicker: `Entities and API`, blocks: [
        { type: `table`, headers: [`Type`, `Role`], rows: [
          [`Level`, `Enum in severity order; <code>isAtLeast</code> compares ordinals`],
          [`LogRecord`, `Immutable record: time, level, message, thread`],
          [`Formatter`, `Interface: record to text (PlainFormatter, JsonFormatter)`],
          [`Sink`, `Interface: writes a line somewhere (ConsoleSink, FileSink)`],
          [`Destination`, `Minimum level + formatter + sink: filters, formats, writes`],
          [`Logger`, `Builds a record once and hands it to every destination`]
        ] },
        { type: `code`, lang: `java`, title: `Public API`, code: `Logger logger = new Logger(List.of(
    new Destination(Level.DEBUG, new PlainFormatter(), new ConsoleSink()),
    new Destination(Level.WARN,  new JsonFormatter(),  new FileSink(Path.of("app.log")))));

logger.info("user signed in");
logger.error("payment failed");` }
      ] },
      { id: `code`, title: `Working code`, kicker: `Implementation`, blocks: [
        { type: `code`, lang: `java`, title: `Levels, records and formatters`, code: `enum Level {
    DEBUG, INFO, WARN, ERROR, FATAL;
    boolean isAtLeast(Level min) { return ordinal() >= min.ordinal(); }
}

record LogRecord(Instant time, Level level, String message, String thread) {}

interface Formatter { String format(LogRecord r); }

final class PlainFormatter implements Formatter {
    public String format(LogRecord r) {
        return r.time() + " [" + r.level() + "] (" + r.thread() + ") " + r.message();
    }
}

final class JsonFormatter implements Formatter {
    private static final String TEMPLATE = """
        {"time":"%s","level":"%s","thread":"%s","message":"%s"}""";

    public String format(LogRecord r) {
        return TEMPLATE.formatted(r.time(), r.level(), escape(r.thread()), escape(r.message()));
    }
    private static String escape(String s) { return s.replace("\\\\", "\\\\\\\\").replace("\\"", "\\\\\\""); }
}` },
        { type: `code`, lang: `java`, title: `Sinks, destinations and the logger`, code: `interface Sink { void write(String line); }

final class ConsoleSink implements Sink {
    public synchronized void write(String line) { System.out.println(line); }   // whole line under one lock
}

final class FileSink implements Sink, AutoCloseable {
    private final BufferedWriter out;
    FileSink(Path path) throws IOException {
        out = Files.newBufferedWriter(path, StandardOpenOption.CREATE, StandardOpenOption.APPEND);
    }
    public synchronized void write(String line) {
        try { out.write(line); out.newLine(); out.flush(); }
        catch (IOException e) { System.err.println("log write failed: " + e.getMessage()); }   // never throw into the caller
    }
    public synchronized void close() throws IOException { out.close(); }
}

final class Destination {
    private final Level min;
    private final Formatter formatter;
    private final Sink sink;

    Destination(Level min, Formatter formatter, Sink sink) { this.min = min; this.formatter = formatter; this.sink = sink; }

    boolean accepts(Level level) { return level.isAtLeast(min); }

    void accept(LogRecord r) {
        if (accepts(r.level())) sink.write(formatter.format(r));
    }
}

final class Logger {
    private final List<Destination> destinations;                 // fixed at startup
    private final Clock clock;

    Logger(List<Destination> destinations) { this(destinations, Clock.systemUTC()); }
    Logger(List<Destination> destinations, Clock clock) { this.destinations = List.copyOf(destinations); this.clock = clock; }

    void log(Level level, String message) {
        write(new LogRecord(clock.instant(), level, message, Thread.currentThread().getName()));
    }

    void write(LogRecord r) { for (Destination d : destinations) d.accept(r); }

    void debug(String m) { log(Level.DEBUG, m); }
    void info(String m)  { log(Level.INFO, m); }
    void warn(String m)  { log(Level.WARN, m); }
    void error(String m) { log(Level.ERROR, m); }
    void fatal(String m) { log(Level.FATAL, m); }
}` },
        { type: `callout`, tone: `insight`, html: `<p>Where does thread safety live? <code>Logger</code> and <code>Destination</code> hold only immutable configuration, and <code>LogRecord</code> is immutable, so they need no locks. The only shared mutable things are the outputs, so each <code>Sink</code> serialises its own writes: a whole line goes out under one lock, and two destinations never block each other.</p>` }
      ] },
      { id: `walkthrough`, title: `Walking through it`, kicker: `Check it works`, blocks: [
        { type: `steps`, items: [
          `<code>logger.info("user signed in")</code> builds one immutable record and offers it to both destinations.`,
          `The console destination (min DEBUG) formats it as plain text and writes it; the file destination (min WARN) drops it.`,
          `<code>logger.error("payment failed")</code> passes both filters: plain text to the console, JSON to the file.`,
          `Two threads log at the same moment: each sink's lock lets one whole line out at a time, so lines never mix.`,
          `Adding XML or a syslog target later is one new Formatter or Sink class; nothing else changes.`
        ] }
      ] }
    ],
    levels: levels(
      [`Level enum, a record type and a logger that writes to several outputs.`, `Per-destination filtering.`],
      [`Composition of formatter and sink driven by the independent-variation requirement.`, `Thread safety placed precisely (immutable config, lock per sink).`, `Non-blocking logging with a bounded queue as an extension.`],
      [`Hierarchical named loggers and their inheritance rules, lazy message construction, rotation, and how a remote sink would batch and back off without blocking the application.`]
    ),
    concepts: [
      { term: `Level ordering`, def: `An enum whose declaration order is its severity; compare ordinals.`, why: `Filtering is one comparison; no Level class hierarchy needed.` },
      { term: `Immutable LogRecord`, def: `Created once per call and shared by every destination.`, why: `Safe to pass between threads and destinations without copying.` },
      { term: `Composition over N x M classes`, def: `A Destination combines a Formatter and a Sink.`, why: `Formats and targets vary independently; this is the Bridge pattern in practice.` },
      { term: `Per-destination threshold`, def: `Each destination drops records below its own minimum level.`, why: `Console can show DEBUG while the file keeps only WARN and above.` },
      { term: `Lock per sink`, def: `Each sink's write is synchronized.`, why: `Lines never interleave, and destinations don't contend with each other.` },
      { term: `Never throw from logging`, def: `I/O failures in a sink are reported, not propagated.`, why: `A broken log file must not break business requests.` },
      { term: `Asynchronous logging`, def: `log() enqueues records on a bounded queue; a background thread writes them.`, why: `Callers don't wait for disk; you must choose what happens when the queue is full.` }
    ],
    interview: [
      { q: `Why not create classes like JsonFileDestination and PlainConsoleDestination?`, a: `Because format and target vary independently. Subclassing creates one class per combination, N formats times M targets, and adding a format means writing M new classes. Composing a Formatter with a Sink gives N plus M classes and any combination at configuration time.`, diff: `easy` },
      { q: `Where do you need synchronization?`, a: `Only at the outputs. Configuration is immutable after startup and records are immutable, so the Logger and Destinations are safe to share. Each Sink synchronizes its write so a whole line is written before another thread's line; separate sinks have separate locks and don't block each other.`, diff: `medium` },
      { q: `How would you make log() non-blocking?`, a: `Put records on a bounded BlockingQueue and let a background thread drain it and call the destinations. Decide the full-queue policy: drop DEBUG and count drops, block briefly, or fall back to a synchronous write for ERROR and above. On shutdown, stop accepting, drain the queue and flush. Records still carry their original timestamp and thread.`, diff: `medium` },
      { q: `How would you support hierarchical named loggers like com.app.db?`, a: `Keep a registry (ConcurrentHashMap, created with computeIfAbsent) of loggers by name. Each logger has an optional level and destinations, and inherits from its nearest configured ancestor by walking up the dotted name (com.app.db, com.app, com, root). Optionally destinations are additive up the chain, as in Log4j.`, diff: `hard` },
      { q: `How do you avoid the cost of building messages that will be filtered out?`, a: `Offer overloads taking a Supplier<String>, and check whether any destination would accept the level before calling it. Or use parameterised messages ("user {} signed in", id) that are only formatted when written.`, diff: `medium` }
    ],
    cheatsheet: [
      { title: `Logging library in one screen`, type: `code`, lang: `java`, body: `enum Level { DEBUG, INFO, WARN, ERROR, FATAL }
record LogRecord(Instant time, Level level, String message, String thread) {}
interface Formatter { String format(LogRecord r); }      // PlainFormatter, JsonFormatter
interface Sink { void write(String line); }              // ConsoleSink, FileSink (synchronized)
final class Destination { Level min; Formatter f; Sink s; void accept(LogRecord r); }
final class Logger { List<Destination> ds; void log(Level l, String m); }` },
      { title: `Follow-ups`, type: `table`, headers: [`Follow-up`, `Change`], rows: [
        [`Non-blocking`, `Bounded queue + writer thread; full-queue policy; drain on shutdown`],
        [`Named loggers`, `Registry by dotted name; inherit level and destinations from ancestors`],
        [`Remote destination`, `New Sink that batches and retries with backoff`],
        [`Rotation`, `RollingFileSink by size or date`]
      ] }
    ],
    labs: []
  });
})();
