// LLD problem breakdowns, part 3: Connect Four, Logging Service, Movie Ticket Booking and Inventory Management, written
// independently with Java solutions; each links the Hello Interview breakdown it follows.
// Imports are omitted in the code: java.util.*, java.util.concurrent.*, java.util.concurrent.locks.*, java.time.*.
(function () {
/** @param {string[]} mid @param {string[]} senior @param {string[]} staff @returns {DeepSection[]} */
const levels = (mid, senior, staff) => [
  { id: `mid`, title: `Junior and mid-level`, kicker: `What is expected`, blocks: [{ type: `keypoints`, title: `You should drive`, items: mid }] },
  { id: `senior`, title: `Senior`, kicker: `What is expected`, blocks: [{ type: `keypoints`, title: `You should drive`, items: senior }] },
  { id: `staff`, title: `Staff and above`, kicker: `What is expected`, blocks: [{ type: `keypoints`, title: `You should drive`, items: staff }] }
];

window.DATA.chapters.push(
  // ====================================================================== Connect Four
  {
    id: `connect-four`, part: 1, number: 0, difficulty: `easy`,
    title: `Connect Four: turns, a falling disc and a four-in-a-row check`,
    overview: `Two players take turns dropping discs into a 7-column, 6-row board; a disc falls to the lowest empty cell, four in a row in any direction wins, and a full board is a draw. It is the gentlest LLD problem, which is exactly why it is a good test of judgment: a clean split between the <strong>game</strong> (turns and outcome) and the <strong>board</strong> (cells and geometry), a single <strong>enum</strong> for the game's state, and one parameterised win check instead of a class per direction.`,
    source: { title: `Hello Interview: Connect Four (LLD) problem breakdown`, url: `https://www.hellointerview.com/learn/low-level-design/problem-breakdowns/connect-four` },
    problem: [
      { id: `requirements`, title: `What we are building`, kicker: `Requirements`, blocks: [
        { type: `problem`, html: `<p>Build the game logic for two-player Connect Four: no UI, one game at a time.</p>` },
        { type: `code`, lang: `text`, title: `Final requirements`, code: `Functional
  1. Two players alternate dropping discs into a 7-column, 6-row board.
  2. A disc falls to the lowest empty row of the chosen column.
  3. Four of a player's discs in a row (horizontal, vertical or diagonal) wins.
  4. A full board with no winner is a draw.
  5. Reject invalid moves clearly: a full or non-existent column, moving out of
     turn, moving after the game has ended.

Out of scope
  - UI and rendering, several games at once, move history and undo,
    configurable board size.` }
      ] },
      { id: `clarifying`, title: `Questions worth asking`, kicker: `Clarifying`, blocks: [
        { type: `table`, headers: [`Ask`, `Assume`, `Decides`], rows: [
          [`How does a player move?`, `By choosing a column 0-6`, `The single mutating method`],
          [`How do games end?`, `Four in a row wins; a full board draws`, `Game state values`],
          [`What happens on an invalid move?`, `Reject it without changing anything`, `Validation before mutation`],
          [`UI support?`, `No: backend rules only`, `A minimal read API (cell, state, winner, current player)`],
          [`Undo, history, other sizes?`, `Out of scope`, `Fixed 7x6, no move log`]
        ] }
      ] }
    ],
    solution: [
      { id: `design`, title: `Design`, kicker: `Entities and API`, blocks: [
        { type: `table`, headers: [`Class`, `Owns`], rows: [
          [`Game`, `The two players, whose turn it is, the outcome; validates and applies moves`],
          [`Board`, `The grid; where a disc lands; whether a placement makes four in a row; whether it's full`],
          [`Player`, `A name and a disc colour (a record: pure data)`],
          [`Disc, GameState`, `Enums: RED/YELLOW; IN_PROGRESS/WON/DRAW`]
        ] },
        { type: `keypoints`, items: [
          `<strong>One enum for the outcome.</strong> Three booleans (over, won, draw) allow impossible combinations; a single <code>GameState</code> can't be "won and drawn".`,
          `<strong>The board knows geometry, the game knows rules.</strong> Board never asks whose turn it is; Game never scans the grid.`,
          `<strong>Check only around the last disc.</strong> A new four-in-a-row must include the disc just placed, so the check is constant work.`
        ] },
        { type: `code`, lang: `java`, title: `Public API`, code: `Game(Player first, Player second);
void play(Player player, int column);   // throws on an invalid move
GameState state();
Optional<Player> winner();
Player currentPlayer();
Disc cell(int row, int column);         // null when empty, for a renderer` }
      ] },
      { id: `code`, title: `Working code`, kicker: `Implementation`, blocks: [
        { type: `code`, lang: `java`, title: `Board`, code: `enum Disc { RED, YELLOW }

final class Board {
    static final int ROWS = 6, COLS = 7;
    private static final int[][] DIRECTIONS = { {0, 1}, {1, 0}, {1, 1}, {1, -1} };  // across, down, two diagonals

    private final Disc[][] grid = new Disc[ROWS][COLS];   // row 0 is the top
    private final int[] filled = new int[COLS];           // discs in each column
    private int total;

    boolean canDrop(int col) { return col >= 0 && col < COLS && filled[col] < ROWS; }

    /** Drops a disc and returns the row it landed in. */
    int drop(int col, Disc disc) {
        if (!canDrop(col)) throw new IllegalArgumentException("Column " + col + " is full or out of range");
        int row = ROWS - 1 - filled[col]++;
        grid[row][col] = disc;
        total++;
        return row;
    }

    boolean isFull() { return total == ROWS * COLS; }
    Disc cell(int row, int col) { return grid[row][col]; }

    /** True if the disc at (row, col) is part of four or more in a line. */
    boolean makesFour(int row, int col) {
        Disc d = grid[row][col];
        for (int[] dir : DIRECTIONS) {
            int run = 1 + count(row, col, dir[0], dir[1], d) + count(row, col, -dir[0], -dir[1], d);
            if (run >= 4) return true;
        }
        return false;
    }

    private int count(int row, int col, int dr, int dc, Disc d) {
        int n = 0;
        for (int r = row + dr, c = col + dc; r >= 0 && r < ROWS && c >= 0 && c < COLS && grid[r][c] == d; r += dr, c += dc) n++;
        return n;
    }
}` },
        { type: `code`, lang: `java`, title: `Game`, code: `enum GameState { IN_PROGRESS, WON, DRAW }

record Player(String name, Disc disc) {}

final class Game {
    private final Board board = new Board();
    private final Player first, second;
    private Player current;
    private GameState state = GameState.IN_PROGRESS;
    private Player winner;

    Game(Player first, Player second) {
        if (first.disc() == second.disc()) throw new IllegalArgumentException("Players need different colours");
        this.first = first;
        this.second = second;
        this.current = first;
    }

    void play(Player player, int column) {
        if (state != GameState.IN_PROGRESS) throw new IllegalStateException("The game is over");
        if (!player.equals(current)) throw new IllegalStateException("It is " + current.name() + "'s turn");
        int row = board.drop(column, player.disc());     // validates the column
        if (board.makesFour(row, column)) {
            state = GameState.WON;
            winner = player;
        } else if (board.isFull()) {
            state = GameState.DRAW;
        } else {
            current = current == first ? second : first;
        }
    }

    GameState state()           { return state; }
    Optional<Player> winner()   { return Optional.ofNullable(winner); }
    Player currentPlayer()      { return current; }
    Disc cell(int row, int col) { return board.cell(row, col); }
}` },
        { type: `callout`, tone: `tip`, html: `<p>Exceptions or a boolean return for invalid moves? Both are fine; exceptions carry the reason ("column full", "not your turn") and are idiomatic Java. Say which you chose and why.</p>` }
      ] },
      { id: `walkthrough`, title: `Walking through it`, kicker: `Check it works`, blocks: [
        { type: `steps`, items: [
          `Red plays column 3: it lands in row 5 (the bottom). <code>makesFour(5, 3)</code> counts 1 in every direction: no win. Turn passes to Yellow.`,
          `Red later has discs at (5,0), (4,0), (3,0) and drops in column 0: it lands at (2,0). Counting downward finds three more, so the run is 4: Red wins and the state becomes WON.`,
          `Yellow tries to move: "The game is over", and nothing changes.`,
          `On the 42nd disc with no four in a row, <code>isFull()</code> is true and the state becomes DRAW.`
        ] }
      ] }
    ],
    levels: levels(
      [`Game, Board and Player with sensible responsibilities; a working drop; win checks at least horizontally and vertically (diagonals with hints is fine).`, `Invalid moves rejected without breaking the game.`],
      [`A single GameState enum, validation before mutation, and the parameterised four-direction check from the last disc.`, `Explaining why four checker classes would be pattern abuse.`, `Undo, a bot or configurable sizes discussed as small changes.`],
      [`A design you'd accept in code review, edge cases caught unprompted, and extensions such as networked play, spectators and several concurrent games.`]
    ),
    concepts: [
      { term: `Game vs Board split`, def: `Game owns turns and outcome; Board owns cells, placement and line detection.`, why: `Each class has one reason to change and can be tested alone.` },
      { term: `State enum`, def: `<code>IN_PROGRESS</code>, <code>WON</code>, <code>DRAW</code> in one field.`, why: `Makes impossible combinations of booleans unrepresentable.` },
      { term: `Lowest empty row`, def: `Track discs per column; the landing row is <code>ROWS - 1 - filled[col]</code>.`, why: `O(1) placement without scanning the column.` },
      { term: `Win check from the last move`, def: `Count matching discs both ways along four direction vectors from the placed disc.`, why: `Any new four must include it, so the check is constant work.` },
      { term: `Parameterise, don't subclass`, def: `The four directions are data (dr, dc), handled by one loop.`, why: `Separate classes per direction add code without adding flexibility.` },
      { term: `Validate before mutate`, def: `Check game over, turn and column before touching the grid.`, why: `Invalid moves leave the state exactly as it was.` }
    ],
    interview: [
      { q: `Why is the win check only done around the last disc?`, a: `Before the move there was no four in a row (otherwise the game would have ended), so any new line of four must include the disc just placed. Checking the four directions through that cell is constant work, instead of scanning the whole board after every move.`, diff: `easy` },
      { q: `Why use an enum for game state instead of booleans like isOver and hasWinner?`, a: `Separate booleans allow combinations that make no sense, such as won and drawn at once, or a winner while still in progress, and every update has to keep them in sync. One enum field has exactly the three legal values. The winner stays a separate nullable field (Optional on the API).`, diff: `easy` },
      { q: `How would you add undo?`, a: `Game is the single place moves happen, so keep a stack of Move records (player, row, column). Undo pops the last move, clears that cell on the Board (a new package-private method), decrements the column count, restores the current player and sets the state back to IN_PROGRESS. Board's rules don't change.`, diff: `medium` },
      { q: `How would you add a computer opponent?`, a: `The rules don't change. Add a component that, given the game, chooses a column, and the game loop calls play(current, chosenColumn) for the bot's turn. A simple bot wins if it can, blocks if it must, otherwise prefers the centre; a stronger one uses minimax with alpha-beta pruning. Player stays plain data.`, diff: `medium` },
      { q: `How would you support configurable board sizes or "connect K"?`, a: `Make rows, columns and K constructor parameters of Board. The placement and line-counting code already works for any size because it only uses the dimensions and bounds checks; the win test becomes run >= K.`, diff: `easy` }
    ],
    cheatsheet: [
      { title: `Connect Four in one screen`, type: `code`, lang: `java`, body: `final class Board {
    Disc[][] grid; int[] filled;
    int drop(int col, Disc d);            // lowest empty row, throws if full
    boolean makesFour(int row, int col);  // 4 directions x both ways from the last disc
    boolean isFull();
}
final class Game {
    GameState state; Player current, winner;
    void play(Player p, int col);         // over? turn? drop, win, draw, switch turn
}` },
      { title: `Edge cases`, type: `list`, items: [`Column out of range or full`, `Wrong player's turn`, `Move after WON or DRAW`, `Two players with the same colour`, `Last cell filled with a winning move: WON, not DRAW`] }
    ],
    labs: []
  },

  // ====================================================================== Logging Service
  {
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
  },

  // ====================================================================== Movie Ticket Booking
  {
    id: `movie-ticket-booking`, part: 2, number: 0, difficulty: `medium`,
    title: `Movie Ticket Booking: shows, seat maps and exactly-one-wins booking`,
    references: [{ title: `awesome-low-level-design: Movie Ticket Booking System`, url: `https://github.com/ashishps1/awesome-low-level-design/blob/main/problems/movie-ticket-booking-system.md` }],
    overview: `A BookMyShow-style system: search movies, browse a theatre's shows, see a showtime's free seats, book several seats in one reservation, and cancel. The data model is a small hierarchy (theatre, screen, showtime, seat), and the interview-defining requirement is that when two people book the same seat at once, <strong>exactly one succeeds</strong>, and a multi-seat booking is <strong>all or nothing</strong>.`,
    source: { title: `Hello Interview: Movie Ticket Booking (LLD) problem breakdown`, url: `https://www.hellointerview.com/learn/low-level-design/problem-breakdowns/bookmyshow` },
    problem: [
      { id: `requirements`, title: `What we are building`, kicker: `Requirements`, blocks: [
        { type: `code`, lang: `text`, title: `Final requirements`, code: `Functional
  1. Search movies by title (simple substring match).
  2. Browse the movies and showtimes at a given theatre.
  3. Theatres have several screens; every screen has the same layout:
     rows A-Z, seats 0-20.
  4. See the available seats for a showtime and pick specific ones.
  5. Book several seats in one reservation; booking returns a confirmation id.
  6. Concurrent bookings of the same seat: exactly one succeeds.
  7. Cancel a reservation by confirmation id, releasing its seats.

Out of scope
  - Payment (assume it succeeds), seat types and prices, rescheduling, UI.` }
      ] },
      { id: `clarifying`, title: `Questions worth asking`, kicker: `Clarifying`, blocks: [
        { type: `table`, headers: [`Ask`, `Assume`, `Decides`], rows: [
          [`What kind of search?`, `Case-insensitive substring on title`, `A scan is fine for hundreds of movies`],
          [`Pick seats or auto-assign? Several at once?`, `Pick specific seats; several per booking`, `Per-seat state and an all-or-nothing booking`],
          [`One theatre or many?`, `Many, each with several screens`, `Indexes by movie and by theatre`],
          [`Different layouts per screen?`, `No: A-Z by 0-20 everywhere`, `One seat-map shape`],
          [`Manage reservations how?`, `Cancel only`, `No reschedule logic`],
          [`Two people, same seat, same moment?`, `Exactly one wins`, `Atomic booking`]
        ] }
      ] }
    ],
    solution: [
      { id: `design`, title: `Design`, kicker: `Entities and API`, blocks: [
        { type: `table`, headers: [`Class`, `Owns`], rows: [
          [`BookingSystem`, `Facade: search, browse, book, cancel; indexes and reservations by id`],
          [`Movie`, `Id, title, duration (record)`],
          [`Theater`, `Id, name, its showtimes`],
          [`Showtime`, `Movie, theatre, screen number, start time, and the seat map for that show`],
          [`Seat`, `Row letter and number (record); the layout is a constant`],
          [`Reservation`, `Confirmation id, showtime, seats (record)`]
        ] },
        { type: `keypoints`, items: [
          `Seat availability belongs to the <strong>showtime</strong>, not the screen: the same seat is free at 6 pm and booked at 9 pm.`,
          `Booking several seats is <strong>all or nothing</strong>, done under the showtime's lock: check every seat, then claim every seat.`,
          `Different showtimes have different locks, so bookings for different shows never wait for each other.`
        ] },
        { type: `code`, lang: `java`, title: `Public API`, code: `List<Movie> searchMovies(String text);
List<Showtime> showtimesAt(String theaterId);
Set<Seat> availableSeats(String showtimeId);
String book(String showtimeId, Set<Seat> seats);     // confirmation id; throws if any seat is taken
void cancel(String confirmationId);` }
      ] },
      { id: `code`, title: `Working code`, kicker: `Implementation`, blocks: [
        { type: `code`, lang: `java`, title: `Value types and the showtime's seat map`, code: `record Movie(String id, String title, Duration length) {}

record Seat(char row, int number) {
    static final char FIRST_ROW = 'A', LAST_ROW = 'Z';
    static final int SEATS_PER_ROW = 21;                 // 0..20
    Seat {
        if (row < FIRST_ROW || row > LAST_ROW || number < 0 || number >= SEATS_PER_ROW)
            throw new IllegalArgumentException("No such seat: " + row + number);
    }
}

record Reservation(String id, String showtimeId, Set<Seat> seats) {}

final class Showtime {
    final String id;
    final Movie movie;
    final String theaterId;
    final int screen;
    final LocalDateTime start;
    private final Map<Seat, String> taken = new HashMap<>();   // seat -> confirmation id, guarded by this

    Showtime(String id, Movie movie, String theaterId, int screen, LocalDateTime start) {
        this.id = id; this.movie = movie; this.theaterId = theaterId; this.screen = screen; this.start = start;
    }

    synchronized Set<Seat> available() {
        Set<Seat> free = new LinkedHashSet<>();
        for (char r = Seat.FIRST_ROW; r <= Seat.LAST_ROW; r++)
            for (int n = 0; n < Seat.SEATS_PER_ROW; n++) {
                Seat s = new Seat(r, n);
                if (!taken.containsKey(s)) free.add(s);
            }
        return free;
    }

    /** All or nothing: either every seat is claimed for this reservation, or none is. */
    synchronized void claim(Set<Seat> seats, String reservationId) {
        for (Seat s : seats) if (taken.containsKey(s)) throw new SeatUnavailableException(s);
        for (Seat s : seats) taken.put(s, reservationId);
    }

    synchronized void release(Set<Seat> seats, String reservationId) {
        for (Seat s : seats) taken.remove(s, reservationId);     // only seats this reservation holds
    }
}` },
        { type: `code`, lang: `java`, title: `BookingSystem`, code: `final class BookingSystem {
    private final List<Movie> movies;
    private final Map<String, Showtime> showtimes;                     // by id
    private final Map<String, List<Showtime>> byTheater;
    private final Map<String, Reservation> reservations = new ConcurrentHashMap<>();

    BookingSystem(List<Movie> movies, List<Showtime> shows) {
        this.movies = List.copyOf(movies);
        Map<String, Showtime> s = new HashMap<>();
        Map<String, List<Showtime>> t = new HashMap<>();
        for (Showtime st : shows) {
            s.put(st.id, st);
            t.computeIfAbsent(st.theaterId, k -> new ArrayList<>()).add(st);
        }
        this.showtimes = Map.copyOf(s);
        this.byTheater = Map.copyOf(t);
    }

    List<Movie> searchMovies(String text) {
        String q = text.toLowerCase(Locale.ROOT);
        return movies.stream().filter(m -> m.title().toLowerCase(Locale.ROOT).contains(q)).toList();
    }

    List<Showtime> showtimesAt(String theaterId) { return byTheater.getOrDefault(theaterId, List.of()); }

    Set<Seat> availableSeats(String showtimeId) { return show(showtimeId).available(); }

    String book(String showtimeId, Set<Seat> seats) {
        if (seats.isEmpty()) throw new IllegalArgumentException("Choose at least one seat");
        String id = UUID.randomUUID().toString();
        show(showtimeId).claim(Set.copyOf(seats), id);                 // throws if any seat is taken
        reservations.put(id, new Reservation(id, showtimeId, Set.copyOf(seats)));
        return id;
    }

    void cancel(String confirmationId) {
        Reservation r = reservations.remove(confirmationId);           // atomic: cancel works once
        if (r == null) throw new IllegalArgumentException("Unknown reservation " + confirmationId);
        show(r.showtimeId()).release(r.seats(), r.id());
    }

    private Showtime show(String id) {
        Showtime s = showtimes.get(id);
        if (s == null) throw new IllegalArgumentException("Unknown showtime " + id);
        return s;
    }
}

class SeatUnavailableException extends RuntimeException {
    SeatUnavailableException(Seat s) { super("Seat " + s.row() + s.number() + " is already booked"); }
}` }
      ] },
      { id: `walkthrough`, title: `Walking through it`, kicker: `Check it works`, blocks: [
        { type: `steps`, items: [
          `Search "dune": a case-insensitive scan finds "Dune: Part Two". The user picks the 7:30 pm showtime at a theatre.`,
          `Two users click Book on {C5, C6} and {C6, C7} at the same moment. Both enter <code>claim</code>; the showtime's lock lets one in first, it claims C5 and C6; the second sees C6 taken and throws, claiming nothing (C7 stays free).`,
          `Bookings for the 9:45 pm show run in parallel: a different Showtime object, a different lock.`,
          `<code>cancel(id)</code> removes the reservation (once) and releases exactly those seats; a second cancel throws "Unknown reservation".`
        ] }
      ] }
    ],
    levels: levels(
      [`The hierarchy (theatre, showtime, seat, reservation), search and browse, and booking that marks seats taken.`, `Seeing that availability belongs to the showtime.`],
      [`All-or-nothing booking with a lock per showtime and an explanation of why that granularity.`, `Cancellation that releases only the reservation's own seats.`, `Temporary seat holds during checkout as a follow-up.`],
      [`Hold expiry, per-seat locking trade-offs, dynamic schedules, and how the in-memory locks map to database constraints when several servers book seats.`]
    ),
    concepts: [
      { term: `Seat state per showtime`, def: `Each showtime owns its own map of taken seats.`, why: `The same physical seat has a different status for each show.` },
      { term: `All-or-nothing booking`, def: `Check every requested seat, then claim every seat, inside one critical section.`, why: `A partial booking would leave a customer with half their group's seats.` },
      { term: `Lock per showtime`, def: `<code>claim</code> and <code>release</code> synchronize on the showtime.`, why: `Correct and simple; different shows don't contend.` },
      { term: `Exactly one wins`, def: `The second booking of a taken seat throws instead of overwriting.`, why: `The core concurrency requirement.` },
      { term: `Idempotent cancel`, def: `<code>reservations.remove(id)</code> returns the reservation only once.`, why: `Double cancels can't release seats someone else has since booked.` },
      { term: `Seat hold`, def: `A temporary claim with an expiry while the user pays.`, why: `Real checkouts take minutes; the seat must not be sold twice meanwhile.` }
    ],
    interview: [
      { q: `How do you guarantee exactly one of two concurrent bookings wins?`, a: `Make the check and the claim one atomic step. Showtime.claim is synchronized: it checks every requested seat and only then marks them all, so the second caller sees the seats taken and gets an exception. With a database, the same guarantee comes from a unique constraint on (showtime, seat) or a conditional update, inside one transaction for all seats.`, diff: `medium` },
      { q: `Why lock the showtime rather than each seat?`, a: `A booking spans several seats and must be all or nothing. With a lock per seat you'd have to acquire several locks, in a consistent order (sorted by seat) to avoid deadlock, and release them correctly on failure. One lock per showtime is simpler and still lets different shows proceed in parallel; contention only happens between people booking the same show at the same instant.`, diff: `medium` },
      { q: `How would you hold seats during checkout?`, a: `Give seats three states: free, held (with a hold id and expiry) and booked. hold(seats) claims them as held atomically and returns a hold id; confirm(holdId) turns them into booked if the hold is still valid; a scheduled task or lazy expiry releases holds past their deadline, conditionally, so it never undoes a confirmed booking.`, diff: `hard` },
      { q: `How would you speed up search with many more movies?`, a: `Build an inverted index from lowercase words (or n-grams for substrings) to movie ids when movies are added, intersect the posting lists for a query, and rank results. For hundreds of movies a linear scan takes microseconds, so I'd say this is only worth it at a much larger scale.`, diff: `medium` },
      { q: `How would you allow adding and removing showtimes at runtime?`, a: `Make the indexes concurrent maps (or swap immutable snapshots). Removing a showtime must also handle its reservations: cancel them and notify customers, or forbid removal once tickets are sold. Locking the showtime while marking it cancelled stops new bookings from racing with the removal.`, diff: `hard` }
    ],
    cheatsheet: [
      { title: `Booking in one screen`, type: `code`, lang: `java`, body: `record Seat(char row, int number) {}              // A-Z x 0-20, validated
final class Showtime {
    Map<Seat, String> taken;                       // seat -> reservation id
    synchronized void claim(Set<Seat> seats, String resId);    // check all, then take all
    synchronized void release(Set<Seat> seats, String resId);  // remove(seat, resId)
}
final class BookingSystem {
    String book(String showtimeId, Set<Seat> seats);
    void cancel(String confirmationId);            // reservations.remove(id): once only
}` },
      { title: `Concurrency choices`, type: `table`, headers: [`Option`, `Pros`, `Cons`], rows: [
        [`Lock per showtime`, `Simple, all-or-nothing is easy`, `Same-show bookings serialize`],
        [`Lock per seat (sorted)`, `More parallelism within a show`, `Deadlock risk, more code`],
        [`CAS per seat + rollback`, `No blocking`, `Rollback on partial failure is fiddly`],
        [`DB unique (showtime, seat)`, `Works across servers`, `Needs a transaction for multi-seat`]
      ] }
    ],
    labs: []
  },

  // ====================================================================== Inventory Management
  {
    id: `inventory-management`, part: 3, number: 0, difficulty: `hard`,
    title: `Inventory Management: stock across warehouses, atomic transfers, low-stock alerts`,
    overview: `Track product stock across a fixed set of warehouses: receive stock, ship it, find which warehouses can fulfil an order, transfer stock between warehouses, and alert when a warehouse runs low on a product. Two requirements make it hard: stock must <strong>never go negative</strong>, and everything must be <strong>thread-safe</strong>, including transfers that touch two warehouses at once. Alerts are an <strong>Observer</strong> with per-warehouse, per-product thresholds.`,
    source: { title: `Hello Interview: Inventory Management (LLD) problem breakdown`, url: `https://www.hellointerview.com/learn/low-level-design/problem-breakdowns/inventory-management` },
    problem: [
      { id: `requirements`, title: `What we are building`, kicker: `Requirements`, blocks: [
        { type: `code`, lang: `text`, title: `Final requirements`, code: `Functional
  1. Track stock of products across a fixed set of warehouses (configured at start).
  2. Add stock to a warehouse (receiving a shipment).
  3. Remove stock from a warehouse (fulfilling an order).
  4. Availability: for a product and quantity, which warehouses can fulfil it.
  5. Transfer stock between warehouses.
  6. Low-stock alerts: a threshold per product per warehouse; when stock drops
     below it, call a pluggable listener.
  7. Reject any operation that would make stock negative (validate before moving).
  8. Thread-safe under concurrent operations.

Out of scope
  - The product catalogue, orders and payments, persistence.` }
      ] },
      { id: `clarifying`, title: `Questions worth asking`, kicker: `Clarifying`, blocks: [
        { type: `table`, headers: [`Ask`, `Assume`, `Decides`], rows: [
          [`Fixed warehouses or dynamic?`, `Fixed, configured at start`, `An immutable warehouse map`],
          [`Thresholds global or per warehouse?`, `Per product per warehouse`, `Threshold map inside each warehouse`],
          [`How are alerts delivered?`, `Call a listener interface; delivery is someone else's job`, `Observer`],
          [`Negative stock?`, `Never: reject the operation`, `Validate before mutating`],
          [`Concurrency?`, `Yes, many operations at once`, `Locks, and lock ordering for transfers`],
          [`Alert every time stock is low, or once?`, `When it crosses below the threshold`, `Crossing detection`]
        ] }
      ] }
    ],
    solution: [
      { id: `design`, title: `Design`, kicker: `Entities and API`, blocks: [
        { type: `table`, headers: [`Class`, `Owns`], rows: [
          [`InventoryManager`, `Facade: warehouses by id, listeners; add, remove, transfer, availability`],
          [`Warehouse`, `Stock per product, thresholds per product, and its own lock`],
          [`AlertListener`, `Interface: onLowStock(warehouseId, productId, quantity, threshold)`],
          [`LowStockAlert`, `Record describing a crossing, collected under the lock and delivered after`]
        ] },
        { type: `keypoints`, items: [
          `<strong>A lock per warehouse.</strong> Operations on different warehouses run in parallel; the invariant (no negative stock) is per warehouse, so that's the natural unit.`,
          `<strong>Transfers lock both warehouses in a fixed order</strong> (by id), so A-to-B and B-to-A transfers can't deadlock, and the move is atomic: nobody sees the stock in neither or both places.`,
          `<strong>Alerts fire on crossing</strong> from at-or-above the threshold to below it, so a warehouse sitting at low stock doesn't spam alerts, and they are delivered <strong>after the lock is released</strong>, so a slow listener can't stall stock operations.`
        ] },
        { type: `code`, lang: `java`, title: `Public API`, code: `void addStock(String warehouseId, String productId, int qty);
void removeStock(String warehouseId, String productId, int qty);     // throws if it would go negative
void transfer(String productId, String fromId, String toId, int qty); // atomic
List<String> warehousesWith(String productId, int qty);
int quantity(String warehouseId, String productId);
void setThreshold(String warehouseId, String productId, int threshold);
void addListener(AlertListener listener);` }
      ] },
      { id: `code`, title: `Working code`, kicker: `Implementation`, blocks: [
        { type: `code`, lang: `java`, title: `Warehouse`, code: `interface AlertListener {
    void onLowStock(String warehouseId, String productId, int quantity, int threshold);
}

record LowStockAlert(String warehouseId, String productId, int quantity, int threshold) {}

final class Warehouse {
    final String id;
    final ReentrantLock lock = new ReentrantLock();
    private final Map<String, Integer> stock = new HashMap<>();       // guarded by lock
    private final Map<String, Integer> thresholds = new HashMap<>();  // guarded by lock

    Warehouse(String id) { this.id = id; }

    int quantity(String product) { return stock.getOrDefault(product, 0); }    // caller holds lock

    void setThreshold(String product, int threshold) { thresholds.put(product, threshold); }

    /** Applies a change and returns an alert if stock crossed below the threshold. Caller holds lock. */
    Optional<LowStockAlert> change(String product, int delta) {
        int before = quantity(product);
        int after = before + delta;
        if (after < 0) throw new InsufficientStockException(id, product, before, -delta);
        stock.put(product, after);
        Integer t = thresholds.get(product);
        return (t != null && before >= t && after < t)
            ? Optional.of(new LowStockAlert(id, product, after, t))
            : Optional.empty();
    }
}

class InsufficientStockException extends RuntimeException {
    InsufficientStockException(String warehouse, String product, int have, int want) {
        super(warehouse + " has " + have + " of " + product + ", cannot remove " + want);
    }
}` },
        { type: `code`, lang: `java`, title: `InventoryManager`, code: `final class InventoryManager {
    private final Map<String, Warehouse> warehouses;                         // fixed at start
    private final List<AlertListener> listeners = new CopyOnWriteArrayList<>();

    InventoryManager(Collection<String> warehouseIds) {
        Map<String, Warehouse> m = new HashMap<>();
        for (String id : warehouseIds) m.put(id, new Warehouse(id));
        this.warehouses = Map.copyOf(m);
    }

    void addListener(AlertListener l) { listeners.add(l); }

    void setThreshold(String warehouseId, String productId, int threshold) {
        Warehouse w = get(warehouseId);
        w.lock.lock();
        try { w.setThreshold(productId, threshold); } finally { w.lock.unlock(); }
    }

    void addStock(String warehouseId, String productId, int qty)    { apply(warehouseId, productId, positive(qty)); }
    void removeStock(String warehouseId, String productId, int qty) { apply(warehouseId, productId, -positive(qty)); }

    void transfer(String productId, String fromId, String toId, int qty) {
        positive(qty);
        if (fromId.equals(toId)) throw new IllegalArgumentException("Source and destination are the same");
        Warehouse from = get(fromId), to = get(toId);
        Warehouse first = fromId.compareTo(toId) < 0 ? from : to;          // global lock order
        Warehouse second = first == from ? to : from;
        List<LowStockAlert> alerts = new ArrayList<>(1);
        first.lock.lock();
        try {
            second.lock.lock();
            try {
                from.change(productId, -qty).ifPresent(alerts::add);         // throws before any change if short
                to.change(productId, qty);
            } finally { second.lock.unlock(); }
        } finally { first.lock.unlock(); }
        notifyAll(alerts);
    }

    int quantity(String warehouseId, String productId) {
        Warehouse w = get(warehouseId);
        w.lock.lock();
        try { return w.quantity(productId); } finally { w.lock.unlock(); }
    }

    List<String> warehousesWith(String productId, int qty) {
        List<String> out = new ArrayList<>();
        for (Warehouse w : warehouses.values()) {
            w.lock.lock();
            try { if (w.quantity(productId) >= qty) out.add(w.id); } finally { w.lock.unlock(); }
        }
        Collections.sort(out);
        return out;                                                         // a snapshot: may change right after
    }

    private void apply(String warehouseId, String productId, int delta) {
        Warehouse w = get(warehouseId);
        Optional<LowStockAlert> alert;
        w.lock.lock();
        try { alert = w.change(productId, delta); } finally { w.lock.unlock(); }
        alert.ifPresent(a -> notifyAll(List.of(a)));                       // outside the lock
    }

    private void notifyAll(List<LowStockAlert> alerts) {
        for (LowStockAlert a : alerts)
            for (AlertListener l : listeners) {
                try { l.onLowStock(a.warehouseId(), a.productId(), a.quantity(), a.threshold()); }
                catch (RuntimeException e) { /* log; one bad listener must not affect others */ }
            }
    }

    private Warehouse get(String id) {
        Warehouse w = warehouses.get(id);
        if (w == null) throw new IllegalArgumentException("Unknown warehouse " + id);
        return w;
    }

    private static int positive(int qty) {
        if (qty <= 0) throw new IllegalArgumentException("Quantity must be positive");
        return qty;
    }
}` },
        { type: `callout`, tone: `warning`, html: `<p>Two details make or break this code. In <code>transfer</code>, the source is debited first: if that throws, nothing has changed, so no rollback is needed. And listeners are called after the locks are released: a listener that sends an email, or calls back into the manager, would otherwise hold up (or deadlock) every operation on that warehouse.</p>` }
      ] },
      { id: `walkthrough`, title: `Walking through it`, kicker: `Check it works`, blocks: [
        { type: `steps`, items: [
          `Threshold for "widget" in WH-A is 10. Stock is 12. <code>removeStock(WH-A, widget, 3)</code>: 12 to 9, crossing below 10, so one alert fires after the lock is released.`,
          `<code>removeStock(WH-A, widget, 1)</code>: 9 to 8, already below, so no new alert.`,
          `<code>removeStock(WH-A, widget, 50)</code>: would go negative, so it throws and stock stays 8.`,
          `Two threads transfer A-to-B and B-to-A at once: both lock WH-A first (by id order), so one waits; no deadlock.`,
          `<code>warehousesWith(widget, 5)</code> locks each warehouse briefly and returns the ids that have at least 5, a snapshot that may change a moment later.`
        ] }
      ] }
    ],
    levels: levels(
      [`Warehouses with stock maps, add and remove with validation, and a simple availability query.`, `A listener interface for alerts.`],
      [`Locks per warehouse, ordered locking for transfers, validation that leaves state untouched on failure.`, `Alerts on threshold crossing, delivered outside the lock.`, `Reservations to prevent overselling while orders are in flight.`],
      [`Lock granularity trade-offs (per product striping), in-transit stock as a two-step transfer, consistency of availability answers, and how the model maps to a database with conditional updates.`]
    ),
    concepts: [
      { term: `Non-negative invariant`, def: `Compute the new quantity first and reject it if negative, before writing.`, why: `Failed operations leave stock unchanged.` },
      { term: `Lock per warehouse`, def: `Each warehouse has a ReentrantLock guarding its stock and thresholds.`, why: `Parallelism across warehouses with a simple, correct unit of locking.` },
      { term: `Ordered locking`, def: `Transfers lock the two warehouses in id order.`, why: `A-to-B and B-to-A can't form a deadlock cycle.` },
      { term: `Atomic transfer`, def: `Debit and credit happen while holding both locks.`, why: `No observer sees the units in neither or both warehouses.` },
      { term: `Threshold crossing`, def: `Alert when stock goes from at-or-above the threshold to below it.`, why: `One alert per drop, not one per operation while low.` },
      { term: `Notify outside the lock`, def: `Collect alerts under the lock, deliver them after unlocking.`, why: `Slow or re-entrant listeners can't stall stock operations.` },
      { term: `Reservations`, def: `Track reserved units separately: available = on hand minus reserved.`, why: `Prevents overselling between "order placed" and "order shipped".` }
    ],
    interview: [
      { q: `How do you prevent deadlock in transfer?`, a: `Deadlock needs a cycle: one transfer holds A and waits for B while another holds B and waits for A. Acquire the two warehouse locks in a global order, by warehouse id, regardless of transfer direction. Both transfers then try A first, so one waits without holding anything and no cycle can form.`, diff: `medium` },
      { q: `Why fire alerts only on crossing the threshold?`, a: `If you alert whenever stock is below the threshold, every removal while low fires again and managers get spammed. Comparing before and after each change and firing only when before >= threshold > after gives one alert per drop. Restocking above the threshold re-arms it naturally.`, diff: `easy` },
      { q: `Why call listeners after releasing the lock?`, a: `A listener might send an email, call a webhook or even call back into the inventory manager. Under the lock, that would block every operation on the warehouse for as long as the listener takes, and a call back into the same warehouse from another thread could deadlock. Collect alerts while locked, then deliver them; optionally hand them to an executor.`, diff: `medium` },
      { q: `How do you prevent overselling while orders are in progress?`, a: `Split stock into on-hand and reserved. When an order is placed, reserve(qty) atomically checks on-hand minus reserved and increases reserved; shipping commits the reservation (decreasing both); cancellation or expiry releases it. Availability queries use on-hand minus reserved, so two orders can't both count the same units.`, diff: `hard` },
      { q: `How would you model stock in transit between warehouses?`, a: `Make transfer two steps. ship() debits the source and creates a Transfer record in IN_TRANSIT state; receive() credits the destination and marks it RECEIVED; a cancelled shipment returns stock to the source. In-transit units count towards neither warehouse's availability, and the Transfer is a small state machine with its own id for tracking.`, diff: `hard` },
      { q: `Could you lock per product instead of per warehouse?`, a: `Yes: stripe locks by (warehouse, product), or use ConcurrentHashMap.compute for single-product updates, so different products in one warehouse don't contend. Transfers still need two locks in a fixed order. It adds complexity, so I'd start per warehouse and move to finer locks only if contention shows up.`, diff: `medium` }
    ],
    cheatsheet: [
      { title: `Inventory in one screen`, type: `code`, lang: `java`, body: `final class Warehouse {
    ReentrantLock lock; Map<String, Integer> stock, thresholds;
    Optional<LowStockAlert> change(String product, int delta);   // reject negative; detect crossing
}
final class InventoryManager {
    void addStock(...); void removeStock(...);                   // lock one warehouse
    void transfer(String product, String from, String to, int q);  // lock both in id order
    List<String> warehousesWith(String product, int q);
    // alerts collected under lock, delivered after unlock
}` },
      { title: `Follow-ups`, type: `table`, headers: [`Follow-up`, `Change`], rows: [
        [`Overselling`, `on-hand vs reserved; reserve, commit, release with expiry`],
        [`In-transit stock`, `Two-step transfer with a Transfer state machine`],
        [`Contention`, `Locks per (warehouse, product)`],
        [`Fulfilment choice`, `A strategy picks warehouses: nearest, cheapest, fewest splits`]
      ] }
    ],
    labs: []
  }
);

})();
