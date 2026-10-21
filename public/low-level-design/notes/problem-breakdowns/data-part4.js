// LLD problem breakdowns, part 4: Tic-Tac-Toe, Snake and Ladders, ATM, Meeting Room Scheduler, Ride Sharing and
// Circuit Breaker, a practice set written independently with Java solutions. The end of this file orders every problem
// by difficulty (easy, medium, hard) and numbers them, so it must stay the last data file.
// Imports are omitted in the code: java.util.*, java.util.concurrent.*, java.util.concurrent.atomic.*,
// java.util.concurrent.locks.*, java.util.function.*, java.util.stream.*, java.time.*.
(function () {
/** @param {string[]} mid @param {string[]} senior @param {string[]} staff @returns {DeepSection[]} */
const levels = (mid, senior, staff) => [
  { id: `mid`, title: `Junior and mid-level`, kicker: `What is expected`, blocks: [{ type: `keypoints`, title: `You should drive`, items: mid }] },
  { id: `senior`, title: `Senior`, kicker: `What is expected`, blocks: [{ type: `keypoints`, title: `You should drive`, items: senior }] },
  { id: `staff`, title: `Staff and above`, kicker: `What is expected`, blocks: [{ type: `keypoints`, title: `You should drive`, items: staff }] }
];

window.DATA.chapters.push(
  // ====================================================================== Tic-Tac-Toe
  {
    id: `tic-tac-toe`, part: 1, number: 0, difficulty: `easy`,
    title: `Tic-Tac-Toe: an N x N board, O(1) win counters and a clean turn loop`,
    references: [{ title: `awesome-low-level-design: Tic Tac Toe`, url: `https://github.com/ashishps1/awesome-low-level-design/blob/main/problems/tic-tac-toe.md` }],
    overview: `Two players, X and O, take turns marking cells on an N x N grid (3 x 3 by default); the first to fill a whole row, column or diagonal wins, and a full grid with no line is a draw. It is the classic 45-minute warm-up, so the bar is a tidy model rather than clever features: a <strong>Board</strong> that only knows cells, a <strong>Game</strong> that owns turns and outcome, one <strong>GameState</strong> enum, validation before any mutation, and the trick interviewers wait for: an <strong>O(1) win check</strong> from per-line counters instead of scanning the grid after every move. Unlike Connect Four there is no gravity and the board size is a parameter, which is why the counters work so neatly here.`,
    problem: [
      { id: `requirements`, title: `What we are building`, kicker: `Requirements`, blocks: [
        { type: `problem`, html: `<p>Build the game engine for two-player Tic-Tac-Toe: no UI, just the rules, a way to make moves and a way to read the result. The same engine should handle a 3 x 3 grid and larger N x N grids.</p>` },
        { type: `code`, lang: `text`, title: `Final requirements`, code: `Functional
  1. Two players, X and O, alternate placing their symbol on an N x N board
     (N >= 3, default 3). X moves first.
  2. A move names a row and a column; the cell must exist and be empty.
  3. Filling an entire row, column or either main diagonal wins.
  4. A full board with no winner is a draw.
  5. Reject invalid moves without changing anything: off the board, cell taken,
     out of turn, or after the game has ended.
  6. A game may receive moves from more than one thread (two players' requests),
     so it must stay consistent under concurrent calls.

Out of scope (follow-ups)
  - K-in-a-row on a larger board, a computer opponent, undo,
    a server hosting many games, UI and persistence.` }
      ] },
      { id: `clarifying`, title: `Questions worth asking`, kicker: `Clarifying`, blocks: [
        { type: `table`, headers: [`Ask`, `Assume`, `Decides`], rows: [
          [`Always 3 x 3?`, `N x N, default 3`, `Board and the win check take N as a parameter`],
          [`How many in a row to win?`, `A full line of N`, `Per-line counters work; K &lt; N is a follow-up`],
          [`Who moves first?`, `X`, `Constructor order fixes the first player`],
          [`What happens on an invalid move?`, `Throw with a reason, change nothing`, `Validate before mutate`],
          [`One thread or many?`, `Moves for one game may arrive concurrently`, `Each Game guards its state with its own lock`],
          [`Do we render the board?`, `No: expose a read API`, `<code>cell(row, col)</code>, <code>state()</code>, <code>winner()</code>`]
        ] },
        { type: `callout`, tone: `interview`, html: `<p>Ask about N early. If the interviewer says "just 3 x 3", still write <code>n</code> instead of the literal 3: it costs nothing and the inevitable "now make it N x N" follow-up becomes a one-line answer.</p>` }
      ] }
    ],
    solution: [
      { id: `design`, title: `Design`, kicker: `Entities and API`, blocks: [
        { type: `table`, headers: [`Type`, `Owns`], rows: [
          [`Game`, `The two players, whose turn it is, the state and winner; validates and applies moves under its own lock`],
          [`Board`, `The N x N grid of symbols and how many cells are filled; rejects off-board and taken cells`],
          [`WinTracker`, `One counter per row and column plus two diagonal counters; reports in O(1) whether a move completed a line`],
          [`Player`, `A record: name and symbol`],
          [`Cell`, `A record: a (row, col) coordinate, used by move sources and bots`],
          [`Symbol, GameState`, `Enums: X/O; IN_PROGRESS/WON/DRAW`]
        ] },
        { type: `keypoints`, items: [
          `<strong>The grid stores symbols, not Cell objects.</strong> A <code>Cell</code> class that wraps one symbol adds allocation and indirection for no behaviour; a <code>Symbol[][]</code> with <code>null</code> for empty is enough, and <code>Cell</code> becomes a plain coordinate record.`,
          `<strong>Win detection is its own class.</strong> Board answers "where are the symbols"; WinTracker answers "did that move finish a line". Swapping the win rule (for K-in-a-row) then touches one class.`,
          `<strong>One enum for the outcome.</strong> <code>IN_PROGRESS</code>, <code>WON</code>, <code>DRAW</code> in a single field cannot contradict itself the way <code>isOver</code> plus <code>isDraw</code> booleans can.`,
          `<strong>The game is the unit of locking.</strong> All mutable state of a game sits behind that game's monitor, so two requests for the same game are serialized and different games never contend.`
        ] },
        { type: `code`, lang: `java`, title: `Public API`, code: `Game(Player first, Player second);            // 3 x 3
Game(Player first, Player second, int size);  // N x N
void play(Player player, int row, int col);   // throws on an invalid move
GameState state();
Optional<Player> winner();
Player currentPlayer();
Symbol cell(int row, int col);                // null when empty, for a renderer
int size();` }
      ] },
      { id: `code`, title: `Working code`, kicker: `Implementation`, blocks: [
        { type: `code`, lang: `java`, title: `Board`, code: `enum Symbol { X, O }

record Cell(int row, int col) {}

final class Board {
    private final int n;
    private final Symbol[][] grid;   // null means empty
    private int filled;

    Board(int n) {
        if (n < 3) throw new IllegalArgumentException("Board size must be at least 3");
        this.n = n;
        this.grid = new Symbol[n][n];
    }

    int size()                       { return n; }
    boolean inside(int row, int col) { return row >= 0 && row < n && col >= 0 && col < n; }
    Symbol cell(int row, int col)    { return grid[row][col]; }
    boolean isFull()                 { return filled == n * n; }

    void place(int row, int col, Symbol s) {
        if (!inside(row, col)) throw new IllegalArgumentException("Cell (" + row + ", " + col + ") is off the board");
        if (grid[row][col] != null) throw new IllegalArgumentException("Cell (" + row + ", " + col + ") is taken");
        grid[row][col] = s;
        filled++;
    }
}` },
        { type: `code`, lang: `java`, title: `WinTracker`, code: `/** O(1) win check: X adds +1 to every line it touches, O adds -1; a line at +n or -n is complete. */
final class WinTracker {
    private final int n;
    private final int[] rows, cols;
    private int diag, anti;          // main diagonal (row == col) and anti-diagonal (row + col == n - 1)

    WinTracker(int n) {
        this.n = n;
        this.rows = new int[n];
        this.cols = new int[n];
    }

    /** Records a move that has already been placed and returns true if it completed a line. */
    boolean record(int row, int col, Symbol s) {
        int d = s == Symbol.X ? 1 : -1;
        rows[row] += d;
        cols[col] += d;
        if (row == col) diag += d;
        if (row + col == n - 1) anti += d;
        // A diagonal can only reach n on the move that fills it, because the game stops at the first win.
        return Math.abs(rows[row]) == n || Math.abs(cols[col]) == n
            || Math.abs(diag) == n || Math.abs(anti) == n;
    }
}` },
        { type: `code`, lang: `java`, title: `Game`, code: `enum GameState { IN_PROGRESS, WON, DRAW }

record Player(String name, Symbol symbol) {}

/**
 * Thread-safe: every method that reads or writes mutable state is synchronized on this game,
 * and board and tracker are created here and never handed out, so the same lock guards them.
 */
final class Game {
    private final Board board;
    private final WinTracker tracker;
    private final Player first, second;
    private Player current;
    private GameState state = GameState.IN_PROGRESS;
    private Player winner;

    Game(Player first, Player second) { this(first, second, 3); }

    Game(Player first, Player second, int size) {
        if (first.symbol() == second.symbol()) throw new IllegalArgumentException("Players need different symbols");
        this.board = new Board(size);
        this.tracker = new WinTracker(size);
        this.first = first;
        this.second = second;
        this.current = first;
    }

    synchronized void play(Player player, int row, int col) {
        if (state != GameState.IN_PROGRESS) throw new IllegalStateException("The game is over");
        if (!player.equals(current)) throw new IllegalStateException("It is " + current.name() + "'s turn");
        board.place(row, col, player.symbol());           // throws before writing if off the board or taken
        if (tracker.record(row, col, player.symbol())) {  // win is checked before draw
            state = GameState.WON;
            winner = player;
        } else if (board.isFull()) {
            state = GameState.DRAW;
        } else {
            current = current == first ? second : first;
        }
    }

    synchronized GameState state()             { return state; }
    synchronized Optional<Player> winner()     { return Optional.ofNullable(winner); }
    synchronized Player currentPlayer()        { return current; }
    synchronized Symbol cell(int row, int col) { return board.cell(row, col); }
    int size()                                 { return board.size(); }   // final and never changes
}` },
        { type: `callout`, tone: `tip`, html: `<p>Why do the read methods need <code>synchronized</code> too? Without it a reader thread has no happens-before edge with the writer, so it may see a stale state or a half-applied move (the cell set but the turn not yet switched). Locking the getters is cheap and removes the question. A private <code>final Object lock</code> instead of <code>this</code> stops outside code from grabbing the game's monitor; either is fine in an interview if you say why.</p>` }
      ] },
      { id: `walkthrough`, title: `Walking through it`, kicker: `Check it works`, blocks: [
        { type: `steps`, items: [
          `New 3 x 3 game, Alice is X. She plays (0,0): <code>rows[0] = 1</code>, <code>cols[0] = 1</code>, <code>diag = 1</code>. Nothing is at 3, so the turn passes to Bob (O).`,
          `Bob plays (1,0): <code>rows[1] = -1</code>, <code>cols[0] = 0</code>. Alice plays (0,1): <code>rows[0] = 2</code>. Bob plays (1,1): <code>rows[1] = -2</code>, <code>diag = 0</code>.`,
          `Alice plays (0,2): <code>rows[0] = 3</code>, which equals n, so the state becomes WON with Alice as the winner. No loop over the board ran.`,
          `Bob now tries (2,2): "The game is over", and the grid is unchanged because the state check comes first.`,
          `Two requests for Alice's move arrive on two threads at once. The first takes the game's lock, places and passes the turn to Bob; the second then sees "It is Bob's turn" and is rejected. Without the lock both could pass the turn check and Alice would move twice.`
        ] },
        { type: `code`, lang: `java`, title: `Turn loop`, code: `/** Where a move comes from: a console reader, a bot, a network client. */
interface MoveSource { Cell next(Game game); }

final class TurnLoop {
    /** Runs one game to the end on the calling thread; a rejected move is simply asked for again. */
    static void run(Game game, Map<Player, MoveSource> sources) {
        while (game.state() == GameState.IN_PROGRESS) {
            Player p = game.currentPlayer();
            Cell c = sources.get(p).next(game);
            try {
                game.play(p, c.row(), c.col());
            } catch (IllegalArgumentException | IllegalStateException e) {
                System.out.println("Rejected: " + e.getMessage() + ". Try again.");
            }
        }
        System.out.println(game.winner().map(w -> w.name() + " wins").orElse("Draw"));
    }
}` },
        { type: `callout`, tone: `insight`, html: `<p>The loop knows nothing about the rules: it asks the current player's source for a cell and lets <code>Game</code> accept or reject it. That is why adding a bot later is just another <code>MoveSource</code>.</p>` }
      ] }
    ],
    levels: levels(
      [`Board, Game and Player with sensible responsibilities, and a working turn loop.`, `A correct win check, even if it scans the row, column and diagonals of the last move.`, `Invalid moves (off board, taken, wrong turn, game over) rejected without corrupting the game.`],
      [`The O(1) per-line counters, with an explanation of why a mixed line can never reach plus or minus N.`, `A GameState enum, validation before mutation, and the win check ordered before the draw check.`, `Thread safety stated precisely: which lock guards which fields, and why the getters are locked too.`, `Undo, a bot and N x N discussed as small, local changes.`],
      [`Spotting that counters break for K-in-a-row and switching to a run check from the last move, behind a WinRule only because two rules now exist.`, `A GameManager for many concurrent games with a lock per game, eviction of finished games, and player identity taken from the session, not the request.`, `Minimax for a perfect bot on 3 x 3 and why it doesn't scale to larger boards without pruning and depth limits.`]
    ),
    concepts: [
      { term: `Game, Board, WinTracker split`, def: `Game owns turns and outcome; Board owns the grid; WinTracker owns line detection.`, why: `Each has one reason to change: a new win rule touches only WinTracker.` },
      { term: `Per-line counters`, def: `One integer per row and column plus two for the diagonals; X adds +1, O adds -1, and a line at +n or -n is complete.`, why: `The win check becomes O(1) per move with O(n) memory instead of a scan.`, ex: `On 3 x 3, X at (0,0), (0,1), (0,2) drives <code>rows[0]</code> to 3.` },
      { term: `Why mixed lines can't win`, def: `A line has n cells, each counted once; one O in it caps the sum at n - 2.`, why: `This is the correctness argument the interviewer wants to hear for the counter trick.` },
      { term: `GameState enum`, def: `<code>IN_PROGRESS</code>, <code>WON</code>, <code>DRAW</code> in one field, with the winner stored separately.`, why: `Impossible combinations such as "won and drawn" can't be represented.` },
      { term: `Validate before mutate`, def: `Check game over, turn, bounds and emptiness before writing anything.`, why: `A rejected move leaves the game exactly as it was, so callers can simply retry.` },
      { term: `Win before draw`, def: `After placing, test for a completed line first and only then for a full board.`, why: `A winning move that fills the last cell is a win, not a draw.` },
      { term: `Lock per game`, def: `Every method touching a game's mutable state is synchronized on that game.`, why: `Concurrent moves on one game are serialized; different games never block each other.` },
      { term: `Cell as a coordinate`, def: `<code>Cell</code> is a <code>(row, col)</code> record, not an object stored in the grid.`, why: `The grid stays a plain <code>Symbol[][]</code>; there is no per-cell behaviour to justify a class.` }
    ],
    interview: [
      { q: `How do you detect a win in O(1), and why is it correct?`, a: `Keep an int per row and per column plus one for each diagonal. When X moves, add 1 to the row, the column, and any diagonal the cell is on; when O moves, subtract 1. A line is won when its counter reaches n or -n. That can only happen if all n cells hold the same symbol, because each cell is counted once and any opposing symbol pulls the sum at least two away from the extreme. The check reads four integers regardless of board size.`, diff: `easy` },
      { q: `Why check for a win before checking for a full board?`, a: `The last empty cell can complete a line. If you test for a full board first, that move is reported as a draw even though the player has won. Testing the win first, then the draw, then switching turns gets every case right.`, diff: `easy` },
      { q: `The interviewer changes the rule to K in a row on an N x N board. What breaks?`, a: `The counters. A row sum of K no longer means K adjacent cells: X at columns 0, 1 and 4 of a row also sums to 3. Replace the tracker with a run check from the last move: for each of the four directions, count matching symbols outward both ways and win if 1 + left + right reaches K. That is O(K) per move. Now that two win rules exist, a small WinRule interface chosen at construction is justified.`, diff: `medium` },
      { q: `How would you add a computer opponent?`, a: `As another MoveSource or MoveChooser that returns a cell; Game and its rules don't change. A rule bot takes a winning cell if it has one, blocks the opponent's winning cell, then prefers the centre and the corners. For perfect play on 3 x 3, minimax (in negamax form) searches the at most 9! move orders in milliseconds. The bot works on a snapshot copied under the game's lock so it never races with live moves.`, diff: `medium` },
      { q: `How would you add undo?`, a: `Push a Move record (player, row, col) onto a history stack in play. Undo pops it, clears the cell on the Board, applies the inverse delta to the WinTracker counters, restores that player as current, and sets the state back to IN_PROGRESS with no winner (the earlier position had none, since the game ends at the first win). All of it runs under the same game lock as play.`, diff: `medium` },
      { q: `How do you host thousands of games on one server safely?`, a: `A GameManager holds a ConcurrentHashMap from game id to Game, so creating and looking up games needs no global lock. Each Game already serializes its own moves with its own monitor, so two requests for one game can't interleave while unrelated games run in parallel. Ids come from UUID.randomUUID (a secure random source), finished games are evicted with an atomic computeIfPresent, and the Player for a request is resolved from the authenticated session rather than trusted from the request body.`, diff: `hard` }
    ],
    cheatsheet: [
      { title: `Tic-Tac-Toe in one screen`, type: `code`, lang: `java`, body: `final class Board {
    Symbol[][] grid; int filled;
    void place(int r, int c, Symbol s);      // throws if off the board or taken
    boolean isFull();
}
final class WinTracker {
    int[] rows, cols; int diag, anti;        // X adds +1, O adds -1
    boolean record(int r, int c, Symbol s);  // a line at +n or -n wins: O(1)
}
final class Game {                           // every method synchronized: one lock per game
    GameState state; Player current, winner;
    void play(Player p, int r, int c);       // over? turn? place, win, draw, switch turn
}
final class GameManager {
    ConcurrentHashMap<String, Game> games;   // many games, no global lock
}` },
      { title: `Edge cases`, type: `list`, items: [`Row or column negative or at least N`, `Cell already taken`, `Wrong player's turn`, `Move after WON or DRAW`, `Both players given the same symbol`, `Board size below 3`, `Winning move that fills the last cell: WON, not DRAW`, `Two simultaneous requests for the same move: one gets the lock, the other is rejected as out of turn`] }
    ],
    labs: []
  },

  // ====================================================================== Snake and Ladders
  {
    id: `snake-and-ladders`, part: 1, number: 0, difficulty: `easy`,
    title: `Snake and Ladders: a jump map, swappable dice and a turn queue`,
    references: [{ title: `awesome-low-level-design: Snake and Ladder`, url: `https://github.com/ashishps1/awesome-low-level-design/blob/main/problems/snake-and-ladder.md` }],
    overview: `Players take turns rolling a die and moving along a 100-cell board; landing on a ladder's foot carries them up, landing on a snake's head sends them down, and the first to land exactly on 100 wins. It is the classic 60-minute machine-coding warm-up, and it rewards restraint: snakes and ladders are one <strong>jump map</strong> validated once, the board is <strong>immutable</strong>, the dice sit behind an <strong>interface</strong> so tests are deterministic, and the game exposes a step-wise <strong>playTurn()</strong> that a loop, a test or a UI can drive.`,
    problem: [
      { id: `requirements`, title: `What we are building`, kicker: `Requirements`, blocks: [
        { type: `problem`, html: `<p>Build the game logic for Snake and Ladders: no UI, but an API a UI or a test could drive one turn at a time.</p>` },
        { type: `code`, lang: `text`, title: `Final requirements`, code: `Functional
  1. A board of 100 cells (size configurable). Players start off the board, at 0.
  2. A snake moves a player down from its head to its tail; a ladder moves a
     player up from its foot to its top. Both are fixed when the board is built.
  3. Two or more players take turns in a fixed order, rolling one six-sided die.
  4. A player must land exactly on the last cell. A roll that would go past it
     is wasted and the player stays where they are.
  5. A six earns another roll. A third six in a row cancels the whole turn and
     the player goes back to where the turn began.
  6. A player who reaches the last cell is ranked and leaves the turn order;
     the game goes on until only one player is left.
  7. The dice must be replaceable, so games can be tested and replayed.

Out of scope
  - UI, networking, persistence. Several games at once is a follow-up, so the
    design must not rule it out.` }
      ] },
      { id: `clarifying`, title: `Questions worth asking`, kicker: `Clarifying`, blocks: [
        { type: `table`, headers: [`Ask`, `Assume`, `Decides`], rows: [
          [`Can a snake or ladder end on another one's start?`, `No: rejected when the board is built`, `Board validation; a move is one lookup`],
          [`What if a roll goes past the last cell?`, `The player stays put`, `The overshoot rule in playTurn()`],
          [`Does a six give another roll?`, `Yes; a third six in a row cancels the turn`, `Per-turn state in Game: sixes so far, where the turn began`],
          [`Does the game stop at the first winner?`, `No: rank players until one is left`, `Removing finishers from the turn queue; a ranking list`],
          [`How many dice, and are they fair?`, `One fair six-sided die, swappable`, `A Dice interface`],
          [`Who drives the game?`, `The caller, one turn at a time`, `playTurn() returning a TurnResult`]
        ] }
      ] }
    ],
    solution: [
      { id: `design`, title: `Design`, kicker: `Entities and API`, blocks: [
        { type: `table`, headers: [`Class`, `Owns`], rows: [
          [`Board`, `The size and the jump map (start cell to destination); validates both once; immutable`],
          [`Dice`, `An interface with roll(). RandomDice (seedable) for play, ScriptedDice for tests`],
          [`Game`, `The turn queue, every position, sixes this turn, the ranking and the state; applies one roll per playTurn()`],
          [`Player`, `A name (a record: pure data)`],
          [`TurnResult`, `What one roll did (who, roll, from, to, kind, rolls again), for a UI log or a test`],
          [`GameState, MoveKind`, `Enums: IN_PROGRESS/FINISHED; NORMAL, SNAKE, LADDER, OVERSHOOT, FORFEIT, FINISHED`]
        ] },
        { type: `keypoints`, items: [
          `<strong>Snakes and ladders are both jumps.</strong> Each is a start cell and a destination; only the direction differs, and that is checked once in the constructor. A <code>Snake</code> class and a <code>Ladder</code> class would hold two numbers each and have no behaviour of their own.`,
          `<strong>The board never changes; the game owns all change.</strong> An immutable Board can be shared by any number of games on any number of threads.`,
          `<strong>Dice is an interface because tests need it.</strong> A random roll makes a test flaky; a scripted one makes every turn predictable. That is a real force, so a Strategy earns its place here.`,
          `<strong>A queue for turn order.</strong> The head moves; afterwards they rotate to the tail, or leave the queue if they finished.`,
          `<strong>One step at a time.</strong> <code>playTurn()</code> applies exactly one roll and reports it; a game loop is just a caller that keeps calling it.`
        ] },
        { type: `code`, lang: `java`, title: `Public API`, code: `Board(int size, Map<Integer, Integer> snakes, Map<Integer, Integer> ladders); // validates
Game(Board board, Dice dice, List<Player> players);
TurnResult playTurn();      // one roll for the current player; throws once finished
GameState state();
Player currentPlayer();     // null once finished
int position(Player p);     // 0 = not on the board yet
List<Player> ranking();     // finishing order so far` }
      ] },
      { id: `code`, title: `Working code`, kicker: `Implementation`, blocks: [
        { type: `code`, lang: `java`, title: `Board`, code: `/** Immutable after construction: final fields and an unmodifiable map, so games on any thread can share it. */
final class Board {
    private final int size;
    private final Map<Integer, Integer> jumps;   // start cell -> destination, for snakes and ladders alike

    Board(int size, Map<Integer, Integer> snakes, Map<Integer, Integer> ladders) {
        if (size < 2) throw new IllegalArgumentException("A board needs at least 2 cells");
        Map<Integer, Integer> all = new HashMap<>();
        snakes.forEach((head, tail) -> {
            if (tail >= head) throw new IllegalArgumentException("Snake at " + head + " must go down");
            add(all, head, tail, size);
        });
        ladders.forEach((foot, top) -> {
            if (top <= foot) throw new IllegalArgumentException("Ladder at " + foot + " must go up");
            add(all, foot, top, size);
        });
        for (int to : all.values())
            if (all.containsKey(to)) throw new IllegalArgumentException("A jump lands on another jump at " + to);
        this.size = size;
        this.jumps = Map.copyOf(all);
    }

    private static void add(Map<Integer, Integer> all, int from, int to, int size) {
        if (from < 1 || from >= size || to < 1 || to > size)
            throw new IllegalArgumentException("Jump " + from + " to " + to + " is off the board or starts on the last cell");
        if (all.putIfAbsent(from, to) != null)
            throw new IllegalArgumentException("Two jumps start at " + from);
    }

    int size() { return size; }

    /** Where a token placed on this cell ends up after any snake or ladder. */
    int resolve(int cell) { return jumps.getOrDefault(cell, cell); }
}` },
        { type: `code`, lang: `java`, title: `Dice`, code: `interface Dice { int roll(); }

/** Fair dice; a fixed seed replays a game exactly. Owned by one game and only rolled under its lock. */
final class RandomDice implements Dice {
    private final Random random;
    private final int count, faces;

    RandomDice(int count, int faces, long seed) {
        if (count < 1 || faces < 2) throw new IllegalArgumentException("Need at least one die with two faces");
        this.count = count;
        this.faces = faces;
        this.random = new Random(seed);
    }

    RandomDice(int count) { this(count, 6, ThreadLocalRandom.current().nextLong()); }

    public int roll() {
        int total = 0;
        for (int i = 0; i < count; i++) total += random.nextInt(faces) + 1;
        return total;
    }
}

/** For tests: returns the given rolls in order and fails loudly when they run out. */
final class ScriptedDice implements Dice {
    private final Deque<Integer> rolls;

    ScriptedDice(Integer... rolls) { this.rolls = new ArrayDeque<>(List.of(rolls)); }

    public int roll() {
        Integer next = rolls.pollFirst();
        if (next == null) throw new IllegalStateException("No more scripted rolls");
        return next;
    }
}` },
        { type: `code`, lang: `java`, title: `Game`, code: `enum GameState { IN_PROGRESS, FINISHED }
enum MoveKind { NORMAL, SNAKE, LADDER, OVERSHOOT, FORFEIT, FINISHED }

record Player(String name) {}
record TurnResult(Player player, int roll, int from, int to, MoveKind kind, boolean rollsAgain) {}

/** Thread-safe: every method that touches the mutable fields is synchronized on this Game. */
final class Game {
    private static final int SIX = 6, MAX_SIXES = 3;

    private final Board board;                     // immutable, may be shared
    private final Dice dice;                       // owned by this game, rolled under its lock
    private final Deque<Player> turns;             // head = player to move
    private final Map<Player, Integer> positions = new HashMap<>();
    private final List<Player> ranking = new ArrayList<>();
    private GameState state = GameState.IN_PROGRESS;
    private int sixes;                             // sixes rolled so far this turn
    private int turnStart;                         // where the current player began this turn

    Game(Board board, Dice dice, List<Player> players) {
        if (players.size() < 2) throw new IllegalArgumentException("Need at least two players");
        if (Set.copyOf(players).size() != players.size()) throw new IllegalArgumentException("Duplicate player");
        this.board = board;
        this.dice = dice;
        this.turns = new ArrayDeque<>(players);
        for (Player p : players) positions.put(p, 0);
    }

    synchronized TurnResult playTurn() {
        if (state == GameState.FINISHED) throw new IllegalStateException("The game is over");
        Player player = turns.peekFirst();
        int from = positions.get(player);
        if (sixes == 0) turnStart = from;
        int roll = dice.roll();

        if (roll == SIX && ++sixes == MAX_SIXES) {           // third six: cancel the whole turn
            int back = turnStart;
            positions.put(player, back);
            passTurn();
            return new TurnResult(player, roll, from, back, MoveKind.FORFEIT, false);
        }

        int target = from + roll;
        int to = target > board.size() ? from : board.resolve(target);   // overshoot: stay put
        positions.put(player, to);

        if (to == board.size()) {
            finish(player);
            return new TurnResult(player, roll, from, to, MoveKind.FINISHED, false);
        }
        boolean again = roll == SIX;
        if (!again) passTurn();
        return new TurnResult(player, roll, from, to, kind(target, to), again);
    }

    private MoveKind kind(int target, int to) {
        if (target > board.size()) return MoveKind.OVERSHOOT;
        if (to < target) return MoveKind.SNAKE;
        if (to > target) return MoveKind.LADDER;
        return MoveKind.NORMAL;
    }

    private void passTurn() {
        turns.addLast(turns.pollFirst());
        sixes = 0;
    }

    private void finish(Player player) {
        turns.pollFirst();
        ranking.add(player);
        sixes = 0;
        if (turns.size() == 1) {                           // the last player left is ranked last
            ranking.add(turns.pollFirst());
            state = GameState.FINISHED;
        }
    }

    synchronized GameState state()      { return state; }
    synchronized Player currentPlayer() { return turns.peekFirst(); }
    synchronized int position(Player p) { return Objects.requireNonNull(positions.get(p), "Unknown player"); }
    synchronized List<Player> ranking() { return List.copyOf(ranking); }
}` },
        { type: `code`, lang: `java`, title: `Running a game`, code: `Board board = new Board(100,
        Map.of(99, 54, 70, 55, 52, 42, 25, 2, 95, 72),      // snakes: head -> tail
        Map.of(6, 27, 11, 40, 60, 85, 46, 90, 17, 69));     // ladders: foot -> top
List<Player> players = List.of(new Player("Asha"), new Player("Ben"), new Player("Chen"));
Game game = new Game(board, new RandomDice(1), players);

while (game.state() == GameState.IN_PROGRESS) {
    TurnResult t = game.playTurn();
    System.out.println(t.player().name() + " rolled " + t.roll() + ": " + t.from() + " to " + t.to() + " " + t.kind());
}
System.out.println("Ranking: " + game.ranking());` },
        { type: `callout`, tone: `insight`, title: `Why this is safe to use from several threads`, html: `<p><strong>Board</strong> has only final fields and an unmodifiable map built in the constructor, so once constructed it can be read from any thread with no locking: the Java memory model guarantees other threads see a final field's value as it was at the end of the constructor. <strong>Game</strong> keeps all its mutable state (the queue, positions, sixes, ranking, state) behind its own monitor: every method that reads or writes it is <code>synchronized</code>, so a timer thread playing turns and a UI thread reading positions can never see half a turn. The Dice belongs to one game and is only rolled inside <code>playTurn()</code>, under that game's lock. Different games have different locks, so they never wait on each other.</p>` },
        { type: `callout`, tone: `tip`, html: `<p>Exceptions or result codes for misuse (playing after the end, a bad board)? Exceptions are idiomatic Java and carry the reason. The normal outcomes of a roll (snake, overshoot, forfeit) are not errors, so they come back in <code>TurnResult.kind</code>.</p>` }
      ] },
      { id: `walkthrough`, title: `Walking through it`, kicker: `Check it works`, blocks: [
        { type: `steps`, items: [
          `Asha is at 0 and rolls a 6: she lands on 6, the foot of a ladder, and climbs to 27 (LADDER). It was a six, so <code>rollsAgain</code> is true, <code>sixes</code> is 1 and the turn began at 0. She rolls a 4 and moves to 31 (NORMAL); the turn passes to Ben and <code>sixes</code> resets.`,
          `Ben is at 21 and rolls a 4: cell 25 is a snake's head, so he slides to 2 (SNAKE).`,
          `Chen is at 97 and rolls a 5: 102 is past the last cell, so he stays at 97 (OVERSHOOT) and the turn passes.`,
          `Later Asha is at 40 and rolls 6, 6, 6. The first six takes her to 46 and up the ladder to 90; the second to 96; the third cancels the turn and puts her back at 40 (FORFEIT).`,
          `Chen rolls a 3 from 97 and lands exactly on 100 (FINISHED): he is ranked first and leaves the queue. Play continues between Asha and Ben until one of them reaches 100; the other is ranked last and the state becomes FINISHED.`
        ] }
      ] }
    ],
    levels: levels(
      [`Board, Player, Dice and Game with sensible responsibilities, and a working loop with snakes, ladders and an exact finish.`, `Turn order that rotates correctly, and a clear end condition.`],
      [`Snakes and ladders as one validated jump map; Dice behind an interface so tests are deterministic; a turn queue and a state enum.`, `A step-wise <code>playTurn()</code> instead of a loop buried in Game, with the six and three-sixes rules handled cleanly.`, `Saying which state is shared and how it is kept safe: an immutable Board, a locked Game.`],
      [`Rule variations as data plus one small strategy rather than a chain of ifs, many concurrent games with a shared board and per-game locking or confinement, seeded replays for bug reports, and special cells as a generalisation of jumps.`]
    ),
    concepts: [
      { term: `Jump map`, def: `Snakes and ladders stored together as one <code>Map&lt;Integer, Integer&gt;</code> from start cell to destination.`, why: `They behave identically; only the direction differs. One lookup resolves any landing cell.` },
      { term: `Validate at construction`, def: `The Board constructor rejects a snake that goes up, a ladder that goes down, a jump off the board or from the last cell, two jumps on one cell, and a jump that ends on another jump's start.`, why: `An invalid board can never exist, so the move code needs no checks, and cycles are impossible.` },
      { term: `Dice as a Strategy`, def: `An interface with <code>roll()</code>; RandomDice, ScriptedDice and CrookedDice implement it.`, why: `Tests need predictable rolls and bug reports need replays; the Game never knows which dice it has.` },
      { term: `Turn queue`, def: `An <code>ArrayDeque</code> of players: the head moves, then rotates to the tail or leaves when finished.`, why: `Turn order, extra turns and removing winners all become one-line queue operations.` },
      { term: `Exact finish`, def: `A roll that would pass the last cell leaves the player where they are.`, why: `It is the most common rule, and the one most often coded wrong (clamping to 100 makes a win too easy).` },
      { term: `State and move enums`, def: `<code>GameState</code> (IN_PROGRESS, FINISHED) for the game; <code>MoveKind</code> for what one roll did.`, why: `No flags to keep in sync, and a UI can describe each turn without re-deriving it.` },
      { term: `Step-wise playTurn()`, def: `One call applies one roll and returns a TurnResult; a loop is just a caller.`, why: `Tests, a timer-driven UI and a server can all drive the same game.` },
      { term: `Immutable board, locked game`, def: `Board has final fields and an unmodifiable map; Game's methods are synchronized on the game.`, why: `One Board is shared safely by every game, and each game's state is changed by one thread at a time.` }
    ],
    interview: [
      { q: `Why not a Snake class and a Ladder class?`, a: `Both are a start cell and a destination; the only difference is direction, which the Board checks once when it is built. Separate classes with a polymorphic move would hold two numbers each and add no behaviour. A single map from start to destination makes resolving a landing cell one lookup. If cells later gain real behaviour (skip a turn, roll again), that is the time to introduce a cell-effect type, with a jump as one kind of effect.`, diff: `easy` },
      { q: `How do you test a game that depends on random dice?`, a: `Put the dice behind an interface and inject it into Game. Tests pass a ScriptedDice that returns a fixed list of rolls, so each turn's outcome is known in advance: a ladder, an overshoot, three sixes. RandomDice takes a seed, so a game seen in production can be replayed exactly from its seed. No mocking framework is needed.`, diff: `easy` },
      { q: `How do you implement "a six gives another roll, three sixes cancel the turn"?`, a: `Game keeps two fields for the current turn: how many sixes have been rolled and where the player started. On a six that is not the third, the player moves and stays at the head of the queue, so the next playTurn() is theirs again. On the third six, the player is put back at the turn's starting cell and the queue rotates. Any other roll rotates the queue and resets the count. A six that finishes the game gives no extra roll.`, diff: `medium` },
      { q: `How do you rank everyone instead of stopping at the first winner?`, a: `When a player lands on the last cell, remove them from the turn queue and append them to a ranking list. When one player is left, append them as last and set the state to FINISHED. Stopping at the first winner is the same code with the state set on the first finish, so it can be a boolean in a Rules record.`, diff: `easy` },
      { q: `How would you add special cells, such as "skip a turn" or "roll again"?`, a: `Generalise the jump map into a map from cell to a small CellEffect interface. A jump is one effect (move to a destination); skip-a-turn marks the player to be passed over next time; roll-again keeps them at the head of the queue. The Board still validates effects at construction and stays immutable; the Game applies the effect after moving. Until such cells exist, the plain jump map is simpler.`, diff: `medium` },
      { q: `How would you run thousands of games at once?`, a: `Build one immutable Board and share it: final fields and an unmodifiable map make it safe to read from any thread. Keep games in a ConcurrentHashMap keyed by game id. Each Game locks itself in playTurn(), so moves in one game are serialized while different games never contend. Give each game its own seeded Random (or use ThreadLocalRandom when replay doesn't matter) rather than one shared Random that every thread fights over. For batch simulation, confine each game to the task that created it.`, diff: `medium` }
    ],
    cheatsheet: [
      { title: `Snake and Ladders in one screen`, type: `code`, lang: `java`, body: `final class Board {                    // immutable: share freely
    Board(int size, Map<Integer, Integer> snakes, Map<Integer, Integer> ladders);  // validates
    int resolve(int cell);             // jumps.getOrDefault(cell, cell)
}
interface Dice { int roll(); }         // RandomDice(seed) to play, ScriptedDice to test
final class Game {                     // synchronized: one lock per game
    Deque<Player> turns; Map<Player, Integer> positions; List<Player> ranking;
    TurnResult playTurn();             // over? roll; third six? overshoot? resolve; finish or pass
}` },
      { title: `Edge cases`, type: `list`, items: [`A roll past the last cell: stay put`, `A ladder whose top is the last cell: that is a finish`, `A third six in a row: back to where the turn began, turn passes`, `A six that finishes: no extra roll`, `Snake going up, ladder going down, two jumps on one cell, a jump onto another jump's start: rejected at construction`, `The last remaining player: ranked last, game FINISHED`, `playTurn() after FINISHED: throws`, `Fewer than two players, or the same player twice`] }
    ],
    labs: []
  },

  // ====================================================================== ATM
  {
    id: `atm`, part: 2, number: 0, difficulty: `medium`,
    title: `ATM: session states, an inventory-aware cash chain and all-or-nothing withdrawals`,
    references: [{ title: `awesome-low-level-design: ATM`, url: `https://github.com/ashishps1/awesome-low-level-design/blob/main/problems/atm.md` }],
    overview: `An ATM lets a cardholder authenticate with a PIN, check a balance and withdraw cash, while the bank, not the machine, owns the money. Two patterns earn their place: the <strong>State</strong> pattern for the session (idle, card inserted, authenticated, out of service), and a <strong>Chain of Responsibility</strong> of note cassettes that plans each withdrawal against the notes actually loaded. The requirement that defines the interview is that a withdrawal is <strong>all or nothing</strong> across two systems that share no transaction: plan the notes, debit the bank with an idempotency key, dispense, and reverse the debit if the dispenser jams.`,
    problem: [
      { id: `requirements`, title: `What we are building`, kicker: `Requirements`, blocks: [
        { type: `problem`, html: `<p>Design the software inside one ATM: the card session, the cash cassettes and the conversation with the bank. The bank is another system reached through an interface; the machine never stores balances or PINs.</p>` },
        { type: `code`, lang: `text`, title: `Final requirements`, code: `Functional
  1. A customer inserts a card and enters a PIN; three wrong PINs in a row
     retain the card.
  2. Once authenticated: check the balance, withdraw cash, eject the card.
  3. Withdrawals are multiples of Rs 100, at most Rs 10,000 per transaction;
     the bank enforces the balance and a daily limit.
  4. The ATM holds cassettes of Rs 2000, 500, 200 and 100 notes, and pays any
     amount its loaded notes can make, not only what a greedy pick finds.
  5. A withdrawal is all or nothing: the customer gets the cash and is debited,
     or neither. A dispenser fault after the debit reverses it.
  6. Every attempt (completed, declined, reversed) is recorded.
  7. An operator can refill cassettes and take the ATM out of service.
  8. Thread-safe: a refill can overlap a session, and one account can be used
     from many ATMs at the same moment.

Out of scope
  - Deposits, transfers, PIN change, statements, other currencies,
    the network protocol to the bank, the screen and keypad UI.` }
      ] },
      { id: `clarifying`, title: `Questions that change the design`, kicker: `Clarifying`, blocks: [
        { type: `table`, headers: [`Ask`, `Assume`, `Decides`], rows: [
          [`Who owns the balance?`, `The bank; the ATM asks through an interface`, `A <code>BankService</code>; no balances in the ATM`],
          [`Which notes, and can a cassette run out?`, `Rs 2000, 500, 200, 100; each cassette has a finite count`, `Planning against counts, not plain greedy`],
          [`Amount rules?`, `Multiples of Rs 100, at most Rs 10,000 per transaction; daily limit at the bank`, `What the ATM checks vs what the bank checks`],
          [`Wrong PIN?`, `Three tries per session, then retain the card; the bank also counts across ATMs`, `An attempt count inside the session state`],
          [`What if the dispenser jams after the debit?`, `Reverse the debit and go out of service`, `A compensating reversal and an OutOfService state`],
          [`Concurrency?`, `One customer per ATM, but operator refills overlap; many ATMs per account`, `One lock per ATM; atomic per-account debits at the bank`],
          [`Which mix of notes?`, `Largest notes first (a customer-chosen mix is a follow-up)`, `Chain ordered from the largest note down`]
        ] },
        { type: `callout`, tone: `insight`, html: `<p>Two different things are shared here, so there are two different locks. The machine's own state (session, cassette counts, journal) is shared between the customer and the operator and lives behind the ATM's lock. The account balance is shared between every ATM, app and branch, so only the bank can protect it.</p>` }
      ] }
    ],
    solution: [
      { id: `design`, title: `Design`, kicker: `Entities, states and API`, blocks: [
        { type: `table`, headers: [`Type`, `Owns`], rows: [
          [`Atm`, `Facade: the current state, the cash dispenser, the journal and the lock; runs a withdrawal`],
          [`AtmState`, `Sealed interface; Idle, CardInserted, Authenticated, OutOfService are immutable records`],
          [`CashDispenser, Cassette`, `A chain of cassettes from the largest note down; plans and removes notes`],
          [`BankService`, `Interface: verify PIN, balance, debit with an idempotency key, reverse`],
          [`CashHardware`, `Interface to the physical dispenser and card slot; dispensing can fail`],
          [`Transaction`, `Immutable journal entry with a masked card number`]
        ] },
        { type: `diagram`, title: `Session states`, caption: `A third wrong PIN (or a card the bank has blocked) retains the card and returns to Idle. A session that ends with too little cash goes to OutOfService instead of Idle.`, svg: `<svg viewBox="0 0 640 270" role="img" aria-label="ATM session states: Idle, CardInserted, Authenticated and OutOfService with their transitions">
<defs><marker id="atm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="20" y="95" width="120" height="46" rx="23" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="80" y="123" text-anchor="middle" font-size="14" font-weight="700" style="fill: var(--dg-ink)">Idle</text>
<rect x="240" y="95" width="150" height="46" rx="23" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="315" y="123" text-anchor="middle" font-size="14" font-weight="700" style="fill: var(--dg-ink)">CardInserted</text>
<rect x="490" y="95" width="140" height="46" rx="23" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="560" y="123" text-anchor="middle" font-size="14" font-weight="700" style="fill: var(--dg-ink)">Authenticated</text>
<rect x="240" y="200" width="150" height="46" rx="23" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="2"/>
<text x="315" y="228" text-anchor="middle" font-size="14" font-weight="700" style="fill: var(--dg-ink)">OutOfService</text>
<path d="M140 108 L238 108" fill="none" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#atm-arrow)"/>
<text x="189" y="100" text-anchor="middle" font-size="12" style="fill: var(--dg-ink)">insertCard</text>
<path d="M240 130 L142 130" fill="none" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#atm-arrow)"/>
<text x="190" y="156" text-anchor="middle" font-size="11" style="fill: var(--dg-ink)">eject, or retain</text>
<path d="M390 118 L488 118" fill="none" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#atm-arrow)"/>
<text x="439" y="110" text-anchor="middle" font-size="12" style="fill: var(--dg-ink)">PIN ok</text>
<path d="M290 95 C 280 58, 350 58, 340 93" fill="none" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#atm-arrow)"/>
<text x="315" y="54" text-anchor="middle" font-size="12" style="fill: var(--dg-ink)">wrong PIN</text>
<path d="M540 95 C 530 58, 600 58, 590 93" fill="none" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#atm-arrow)"/>
<text x="565" y="54" text-anchor="middle" font-size="12" style="fill: var(--dg-ink)">balance, withdraw</text>
<path d="M520 95 C 450 10, 150 10, 92 93" fill="none" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#atm-arrow)"/>
<text x="200" y="26" text-anchor="middle" font-size="12" style="fill: var(--dg-ink)">eject</text>
<path d="M560 141 C 560 200, 470 223, 392 223" fill="none" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#atm-arrow)"/>
<text x="500" y="256" text-anchor="middle" font-size="12" style="fill: var(--dg-bad)">dispenser fault</text>
<path d="M240 223 C 160 223, 80 200, 80 143" fill="none" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#atm-arrow)"/>
<text x="150" y="256" text-anchor="middle" font-size="12" style="fill: var(--dg-ink)">refill or restore</text>
</svg>` },
        { type: `keypoints`, items: [
          `<strong>State pattern, because behaviour and data depend on the session.</strong> Five actions times four states is twenty decisions, and two states carry data (the card, the wrong-PIN count). Each state is an immutable record holding only its own data; a transition swaps the reference under the ATM's lock.`,
          `<strong>Chain of Responsibility, because denominations are a list that changes.</strong> Each cassette handles its own note and passes the remainder on. Unlike the simple greedy chain, a link backs off to fewer notes when the rest of the chain cannot finish, so Rs 600 from 500s and 200s works.`,
          `<strong>Plan, debit, dispense, in that order.</strong> The plan reads counts only, so a decline changes nothing; the debit comes before cash leaves because a debit can be reversed and handed-out cash cannot.`,
          `<strong>The bank owns money and PIN checks.</strong> The ATM checks only local rules (multiple of Rs 100, per-transaction cap); the balance and the daily limit need every channel's view, so the bank checks them atomically with the debit.`
        ] },
        { type: `code`, lang: `java`, title: `Public API`, code: `// Customer actions, interpreted by the current state
void insertCard(Card card);
PinResult enterPin(String pin);          // OK, WRONG_PIN or CARD_RETAINED
long balance();                          // paise
Transaction withdraw(long amount);       // paise; COMPLETED, DECLINED or REVERSED
void ejectCard();

// Operator actions
void refill(long note, int count);
void takeOutOfService();
void restore();
List<Transaction> journal();` }
      ] },
      { id: `code`, title: `Working code`, kicker: `Implementation`, blocks: [
        { type: `text`, html: `<p>All money is a <code>long</code> in paise; <code>Atm.RS</code> (100) converts rupees, so a Rs 500 note is <code>500 * RS</code>.</p>` },
        { type: `code`, lang: `java`, title: `Values and the bank interface`, code: `record Card(String number) {
    String masked() { return "XXXX" + number.substring(number.length() - 4); }
    @Override public String toString() { return "Card[" + masked() + "]"; }   // never print the full number
}

enum PinResult { OK, WRONG_PIN, CARD_RETAINED }
enum AuthResult { OK, WRONG_PIN, BLOCKED }
enum DebitResult { OK, INSUFFICIENT_FUNDS, DAILY_LIMIT_EXCEEDED, CANCELLED }   // CANCELLED: reversed before it arrived
enum TxnStatus { COMPLETED, DECLINED, REVERSED }

record Transaction(String id, String atmId, String maskedCard, long amount,
                   TxnStatus status, String reason, Instant at) {}

/** The bank owns balances, PIN checks and the daily limit; the ATM only asks. */
interface BankService {
    AuthResult verifyPin(String cardNumber, String pin);     // the bank counts failures across all ATMs
    long balance(String cardNumber);
    DebitResult debit(String cardNumber, long amount, String idempotencyKey);   // atomic; a repeated key returns the first result
    void reverse(String cardNumber, String idempotencyKey);  // undoes that debit once
}

interface CashHardware {
    void dispense(Map<Long, Integer> notes) throws DispenseException;   // note value -> count
    void returnCard();
    void retainCard();
}

class DispenseException extends Exception {
    DispenseException(String message) { super(message); }
}` },
        { type: `code`, lang: `java`, title: `Inventory-aware dispense chain`, code: `/** One link in the chain: a cassette of one note value. Not thread-safe alone: the Atm's lock guards it. */
final class Cassette {
    final long note;                 // paise
    final Cassette next;             // the next smaller note, or null
    private int count;

    Cassette(long note, int count, Cassette next) { this.note = note; this.count = count; this.next = next; }

    /**
     * Adds to plan the notes that make amount from this cassette and the ones after it.
     * Tries the most notes first, then fewer, so it finds a mix whenever one exists. Changes no counts.
     */
    boolean plan(long amount, Map<Long, Integer> plan) {
        if (amount == 0) return true;
        int most = (int) Math.min(count, amount / note);
        for (int use = most; use >= 0; use--) {
            long rest = amount - use * note;
            if (rest == 0 || (next != null && next.plan(rest, plan))) {
                if (use > 0) plan.put(note, use);
                return true;
            }
        }
        return false;
    }

    int count() { return count; }
    void add(int n) { count += n; }
    void remove(int n) { count -= n; }
}

final class CashDispenser {
    private final Cassette head;                       // largest note first

    CashDispenser(long... notesLargestFirst) {
        Cassette c = null;
        for (int i = notesLargestFirst.length - 1; i >= 0; i--) c = new Cassette(notesLargestFirst[i], 0, c);
        head = c;
    }

    Optional<Map<Long, Integer>> plan(long amount) {
        Map<Long, Integer> plan = new TreeMap<>(Comparator.reverseOrder());
        return head.plan(amount, plan) ? Optional.of(plan) : Optional.empty();
    }

    /** Checks every cassette, then removes: never a partial removal. */
    void take(Map<Long, Integer> plan) {
        for (Cassette c = head; c != null; c = c.next)
            if (c.count() < plan.getOrDefault(c.note, 0)) throw new IllegalStateException("Stale plan");
        for (Cassette c = head; c != null; c = c.next) c.remove(plan.getOrDefault(c.note, 0));
    }

    void load(long note, int count) {
        for (Cassette c = head; c != null; c = c.next)
            if (c.note == note) { c.add(count); return; }
        throw new IllegalArgumentException("No cassette for note " + note);
    }

    long total() {
        long sum = 0;
        for (Cassette c = head; c != null; c = c.next) sum += c.note * c.count();
        return sum;
    }
}` },
        { type: `code`, lang: `java`, title: `Session states`, code: `/** What each customer action means right now. Records are immutable; the Atm swaps them under its lock. */
sealed interface AtmState permits Idle, CardInserted, Authenticated, OutOfService {
    default void insertCard(Atm atm, Card card)        { throw reject("insert a card"); }
    default PinResult enterPin(Atm atm, String pin)    { throw reject("enter a PIN"); }
    default long balance(Atm atm)                      { throw reject("check the balance"); }
    default Transaction withdraw(Atm atm, long amount) { throw reject("withdraw"); }
    default void ejectCard(Atm atm)                    { throw reject("eject a card"); }

    private IllegalStateException reject(String action) {
        return new IllegalStateException("Cannot " + action + " while " + getClass().getSimpleName());
    }
}

record Idle() implements AtmState {
    public void insertCard(Atm atm, Card card) { atm.setState(new CardInserted(card, 0)); }
}

record CardInserted(Card card, int wrongPins) implements AtmState {
    public PinResult enterPin(Atm atm, String pin) {
        AuthResult r = atm.bank().verifyPin(card.number(), pin);
        if (r == AuthResult.OK) {
            atm.setState(new Authenticated(card));
            return PinResult.OK;
        }
        if (r == AuthResult.BLOCKED || wrongPins + 1 >= Atm.MAX_PIN_ATTEMPTS) {
            atm.retainCard();                                  // ends the session
            return PinResult.CARD_RETAINED;
        }
        atm.setState(new CardInserted(card, wrongPins + 1));
        return PinResult.WRONG_PIN;
    }
    public void ejectCard(Atm atm) { atm.endSession(); }
}

record Authenticated(Card card) implements AtmState {
    public long balance(Atm atm) { return atm.bank().balance(card.number()); }
    public Transaction withdraw(Atm atm, long amount) { return atm.runWithdrawal(card, amount); }
    public void ejectCard(Atm atm) { atm.endSession(); }
}

record OutOfService(Reason reason) implements AtmState {   // rejects every customer action
    enum Reason { OUT_OF_CASH, FAULT, MAINTENANCE }
}` },
        { type: `code`, lang: `java`, title: `Atm`, code: `final class Atm {
    static final long RS = 100;                                // paise per rupee
    static final long STEP = 100 * RS;                         // withdrawals in multiples of Rs 100
    static final long PER_TXN_LIMIT = 10_000 * RS;
    static final int MAX_PIN_ATTEMPTS = 3;

    private final String id;
    private final BankService bank;
    private final CashHardware hardware;
    // Guarded by this object's monitor: every public method is synchronized.
    private final CashDispenser cash = new CashDispenser(2000 * RS, 500 * RS, 200 * RS, 100 * RS);
    private final List<Transaction> journal = new ArrayList<>();
    private AtmState state = new OutOfService(OutOfService.Reason.OUT_OF_CASH);   // empty until refilled

    Atm(String id, BankService bank, CashHardware hardware) { this.id = id; this.bank = bank; this.hardware = hardware; }

    // Customer actions: delegate to the current state.
    synchronized void insertCard(Card card)        { state.insertCard(this, card); }
    synchronized PinResult enterPin(String pin)    { return state.enterPin(this, pin); }
    synchronized long balance()                    { return state.balance(this); }
    synchronized Transaction withdraw(long amount) { return state.withdraw(this, amount); }
    synchronized void ejectCard()                  { state.ejectCard(this); }

    // Operator actions: may arrive mid-session; the monitor runs each one whole.
    synchronized void refill(long note, int count) {
        if (count <= 0) throw new IllegalArgumentException("Count must be positive");
        cash.load(note, count);
        if (state instanceof OutOfService o && o.reason() == OutOfService.Reason.OUT_OF_CASH) state = new Idle();
    }

    synchronized void takeOutOfService() {
        if (!(state instanceof Idle || state instanceof OutOfService)) throw new IllegalStateException("A customer is mid-session");
        state = new OutOfService(OutOfService.Reason.MAINTENANCE);
    }

    synchronized void restore() {
        if (!(state instanceof OutOfService)) throw new IllegalStateException("Not out of service");
        idleOrOutOfCash();
    }

    synchronized List<Transaction> journal() { return List.copyOf(journal); }

    // Called by the states, always from a synchronized method above, so the monitor is held.
    BankService bank() { return bank; }
    void setState(AtmState next) { state = next; }
    void retainCard() { hardware.retainCard(); idleOrOutOfCash(); }
    void endSession() { hardware.returnCard(); idleOrOutOfCash(); }

    private void idleOrOutOfCash() {
        state = cash.total() >= STEP ? new Idle() : new OutOfService(OutOfService.Reason.OUT_OF_CASH);
    }

    /** Plan the notes, debit the bank, then dispense; a dispenser fault reverses the debit. */
    Transaction runWithdrawal(Card card, long amount) {
        String txnId = UUID.randomUUID().toString();           // also the bank's idempotency key
        if (amount <= 0 || amount % STEP != 0) return recordTxn(txnId, card, amount, TxnStatus.DECLINED, "Amount must be a multiple of Rs 100");
        if (amount > PER_TXN_LIMIT) return recordTxn(txnId, card, amount, TxnStatus.DECLINED, "Above the per-transaction limit");
        Optional<Map<Long, Integer>> plan = cash.plan(amount);   // reads counts only
        if (plan.isEmpty()) return recordTxn(txnId, card, amount, TxnStatus.DECLINED, "Notes for this amount are not available");
        DebitResult debit = bank.debit(card.number(), amount, txnId);
        if (debit != DebitResult.OK) return recordTxn(txnId, card, amount, TxnStatus.DECLINED, debit.name());
        cash.take(plan.get());                                 // the notes leave the cassettes now
        try {
            hardware.dispense(plan.get());
        } catch (DispenseException e) {
            bank.reverse(card.number(), txnId);                // compensate; jammed notes go to the reject bin
            hardware.returnCard();
            state = new OutOfService(OutOfService.Reason.FAULT);
            return recordTxn(txnId, card, amount, TxnStatus.REVERSED, "Dispenser fault, debit reversed");
        }
        return recordTxn(txnId, card, amount, TxnStatus.COMPLETED, "Dispensed");
    }

    private Transaction recordTxn(String txnId, Card card, long amount, TxnStatus status, String reason) {
        Transaction t = new Transaction(txnId, id, card.masked(), amount, status, reason, Instant.now());
        journal.add(t);
        return t;
    }
}` },
        { type: `callout`, tone: `insight`, title: `Where thread safety lives`, html: `<p>Every public <code>Atm</code> method is <code>synchronized</code>, so one monitor guards the state, the cassette counts and the journal together: an operator's refill that arrives mid-withdrawal waits, then runs whole, and can never land between the plan and the take. The states are immutable records, and <code>CashDispenser</code> is deliberately unsynchronized because it is only ever touched under that monitor. Balances never live here; the bank makes each debit atomic per account.</p>` },
        { type: `callout`, tone: `tip`, title: `Holding the lock across the bank call`, html: `<p>It is a single-customer machine, so the only thing that waits is an operator action, for a bank call with a timeout of a few seconds. The lock order is always ATM then account, and the bank never calls back into an ATM, so no deadlock cycle can form. The Deep Dives show the variant that releases the lock during the call.</p>` }
      ] },
      { id: `walkthrough`, title: `Walking through it`, kicker: `Check it works`, blocks: [
        { type: `steps`, items: [
          `The operator loads 10 x Rs 500 and 10 x Rs 200 (no Rs 2000 or Rs 100 notes). The ATM moves from OutOfService(OUT_OF_CASH) to Idle.`,
          `A customer inserts a card and types a wrong PIN: <code>WRONG_PIN</code>, and the state becomes <code>CardInserted(card, 1)</code>. The right PIN moves it to <code>Authenticated</code>.`,
          `Withdraw Rs 600. The Rs 500 link tries one note, leaving Rs 100 that nobody can make, so it backs off to zero; the Rs 200 link takes three. The bank debits with the transaction id as the key, the notes are removed and dispensed: <code>COMPLETED</code>.`,
          `Withdraw Rs 250: declined, not a multiple of Rs 100. Withdraw Rs 100: no loaded note can make it, so it is declined before the bank is called. Neither changes anything.`,
          `Withdraw Rs 1000: the plan is 2 x Rs 500, the bank debits, and the dispenser jams. The ATM reverses the debit with the same key, returns the card, records <code>REVERSED</code> and goes to OutOfService(FAULT).`,
          `An operator's <code>refill</code> sent during any of these steps waits for the monitor and runs between two customer actions, never inside one.`
        ] }
      ] }
    ],
    levels: levels(
      [`The card, PIN and withdrawal flow with clear states (an enum is acceptable at first), the bank behind an interface, and amount validation.`, `A dispense chain over the denominations that respects how many notes each cassette holds.`],
      [`The State pattern with immutable state records and every transition under one lock, with a reason it beats an enum here.`, `Inventory-aware planning that backtracks, with the greedy counter-example (Rs 600 from 500s and 200s).`, `The plan, debit, dispense order with a reversal on a jam, an idempotency key on the debit, and a clear account of what the ATM lock protects.`],
      [`Bank-side atomicity (per-account lock, compare-and-set or a conditional database update) and why the ATM lock cannot provide it.`, `Unknown outcomes after timeouts: retries with the same key, queued reversals, tombstones and reconciliation against the reject bin.`, `Security: encrypted PIN blocks, bank-wide attempt counters, inactivity timeouts, and keeping PINs and full card numbers out of logs.`]
    ),
    concepts: [
      { term: `State pattern for the session`, def: `The ATM hands each customer action to its current state object, which decides what the action means and which state comes next.`, why: `Twenty action and state combinations stay organised, and every invalid action gets one clear rejection.` },
      { term: `Immutable state records`, def: `Each state is a record holding only its own data (the card, the wrong-PIN count); a transition replaces the reference under the ATM's lock.`, why: `Nothing to reset by hand when a session ends, and nothing to synchronise inside a state.` },
      { term: `Chain of Responsibility over cassettes`, def: `Cassettes are linked from the largest note down; each handles its own denomination and passes the remainder on.`, why: `Adding or retiring a denomination is one link, and no method hard-codes the list.` },
      { term: `Inventory-aware backtracking`, def: `A link tries the most notes it can use, then one fewer each time the rest of the chain cannot finish.`, why: `Greedy declines Rs 600 when only 500s and 200s are loaded; backtracking finds 3 x Rs 200.`, ex: `Rs 2600 from 1 x 2000, 1 x 500, 5 x 200: greedy is stuck at Rs 100 left; the chain finds 2000 + 200 + 200 + 200.` },
      { term: `Plan, then commit`, def: `Compute the whole note plan without touching counts; remove notes only after the bank approves.`, why: `A decline at any step leaves the cassettes exactly as they were.` },
      { term: `Debit before dispense, reverse on fault`, def: `The bank is debited first; if the dispenser jams, a compensating reversal with the same key undoes the debit.`, why: `A debit can be undone; cash already handed out cannot.` },
      { term: `Idempotency key`, def: `Every debit carries the transaction id; the bank stores the outcome per key and returns it on a repeat.`, why: `Retrying after a timeout can never debit twice.` },
      { term: `Atomic debit at the bank`, def: `The balance check, the daily-limit check and the debit happen under one per-account lock, or as one conditional database update.`, why: `One account used from two ATMs at once can't be overdrawn.` },
      { term: `Card retention and attempt limits`, def: `Three wrong PINs in a session retain the card; the bank also counts failures across all ATMs and blocks the card.`, why: `A thief can't spread guesses across many machines.` }
    ],
    interview: [
      { q: `Why the State pattern here rather than an enum and switch statements?`, a: `Five customer actions times four states is twenty decisions, and two states carry data: the card and the wrong-PIN count. With an enum, every method switches on the status, and the card and counter sit in loose fields that each exit path must reset; miss one reset and the next customer inherits someone else's strikes. With state records, each state's rules sit together, its data travels inside it and disappears on transition, and a new state such as Dispensing is a new class. For two states with no data I'd use an enum.`, diff: `medium` },
      { q: `Why can a greedy dispense chain fail, and how do you fix it?`, a: `A large note taken early can leave a remainder that the smaller cassettes can't make. With only 500s and 200s loaded, greedy takes a 500 for Rs 600 and is stuck with Rs 100, although three 200s work. Each link tries the most notes first and, if the rest of the chain fails, retries with one fewer. It still finds the greedy answer in one pass when that works and backtracks only when it must. For many denominations, bounded change by dynamic programming does the same in a small table. Either way the plan reads counts only.`, diff: `medium` },
      { q: `In what order do you debit the account and dispense the cash?`, a: `Validate, plan the notes, debit the bank, remove the notes, dispense. Planning before the debit means a customer is never charged for an amount the machine can't pay. Debiting before dispensing matters because a debit can be reversed but cash handed out can't be recalled. If the dispenser faults, reverse the debit with the same key, record REVERSED, return the card and go out of service. Dispensing first and debiting after would turn a failed debit into free money.`, diff: `hard` },
      { q: `The same account withdraws at two ATMs at the same moment. What stops an overdraft?`, a: `Not the ATM locks: each one only protects its own machine. The bank makes check-and-debit one atomic step per account, under a per-account lock or as a conditional UPDATE ... WHERE balance >= amount. Both requests reach the bank; one passes the balance and daily-limit checks and debits, and the other sees the reduced balance and gets INSUFFICIENT_FUNDS. Different accounts never contend.`, diff: `medium` },
      { q: `The bank call times out during a debit. What do you do?`, a: `The outcome is unknown: the bank may have debited. Retry with the same idempotency key (the transaction id), so the bank returns the stored result instead of debiting again. If retries run out, dispense nothing, tell the customer, and queue a reversal with that key. The bank applies the reversal once, or, if the debit never arrived, stores a tombstone so a late debit with that key is refused. Reconciliation against the bank's ledger catches anything left over.`, diff: `hard` },
      { q: `Which limits does the ATM enforce and which does the bank enforce?`, a: `The multiple-of-Rs-100 rule and the per-transaction cap are local facts, so the ATM checks them before calling anyone. The balance and the daily limit depend on every ATM, app and branch the customer used today, so only the bank can check them, atomically with the debit. PINs split the same way: the ATM counts tries in this session to decide when to retain the card, and the bank counts failures across all ATMs and blocks the card, which the ATM obeys by retaining it.`, diff: `easy` }
    ],
    cheatsheet: [
      { title: `ATM in one screen`, type: `code`, lang: `java`, body: `sealed interface AtmState permits Idle, CardInserted, Authenticated, OutOfService {
    // insertCard, enterPin, balance, withdraw, ejectCard: reject by default
}
record CardInserted(Card card, int wrongPins) implements AtmState {}   // 3rd wrong PIN: retain the card
final class Cassette {                       // chain link, largest note first
    boolean plan(long amount, Map<Long, Integer> plan);   // most notes first, back off on failure
}
final class Atm {                            // every public method synchronized
    Transaction runWithdrawal(Card card, long amount) {
        // validate, plan (reads only), bank.debit(key), take notes, dispense
        // dispense fails: bank.reverse(key), OutOfService(FAULT)
    }
}
interface BankService {
    AuthResult verifyPin(String card, String pin);
    DebitResult debit(String card, long amount, String key);   // atomic per account, idempotent
    void reverse(String card, String key);
}` },
      { title: `Session state table`, type: `table`, headers: [`State`, `insertCard`, `enterPin`, `balance / withdraw`, `ejectCard`], rows: [
        [`Idle`, `Go to CardInserted`, `Reject`, `Reject`, `Reject`],
        [`CardInserted`, `Reject`, `OK: Authenticated. Wrong: count. 3rd wrong or BLOCKED: retain card, Idle`, `Reject`, `Return card, Idle`],
        [`Authenticated`, `Reject`, `Reject`, `Run it, stay (jam: OutOfService)`, `Return card, Idle`],
        [`OutOfService`, `Reject`, `Reject`, `Reject`, `Reject (refill or restore leaves it)`]
      ] },
      { title: `Edge cases`, type: `list`, items: [
        `Amount zero, negative, not a multiple of Rs 100, or above Rs 10,000: decline before planning`,
        `Reachable only by skipping a large note (Rs 600 from 500s and 200s): the chain backtracks`,
        `Unreachable with the loaded notes: decline before the debit`,
        `Insufficient funds or daily limit: the bank declines; no notes removed`,
        `Bank timeout: retry with the same key, then queue a reversal and dispense nothing`,
        `Dispenser jam after the debit: reverse, return the card, OutOfService(FAULT)`,
        `Third wrong PIN, or the bank says BLOCKED: retain the card`,
        `Refill during a session: waits for the monitor, never sees a half-done withdrawal`,
        `Cash runs low: the session ends in OutOfService(OUT_OF_CASH); a refill restores Idle`
      ] }
    ],
    labs: []
  },

  // ====================================================================== Meeting Room Scheduler
  {
    id: `meeting-scheduler`, part: 2, number: 0, difficulty: `medium`,
    title: `Meeting Room Scheduler: interval overlap, a lock per room and no double booking`,
    references: [{ title: `awesome-low-level-design: Hotel Management System (the hotel booking variant)`, url: `https://github.com/ashishps1/awesome-low-level-design/blob/main/problems/hotel-management-system.md` }],
    overview: `Book conference rooms for time slots: a specific room, or any free room big enough and equipped for the meeting; cancel and reschedule; notify attendees; show a person's calendar. Asked at ClearTrip, Flipkart, Google and Atlassian, often dressed as hotel booking. Two ideas carry the design: <strong>interval overlap</strong> on half-open slots <code>[start, end)</code>, checked against only the two sorted neighbours in a per-room <code>TreeMap</code>, and <strong>no double booking</strong>, because check-then-insert runs under a <strong>lock per room</strong>. Room choice is a <strong>Strategy</strong>, notifications are an <strong>Observer</strong>, and a reschedule into another room locks both rooms in a fixed order.`,
    problem: [
      { id: `requirements`, title: `What we are building`, kicker: `Requirements`, blocks: [
        { type: `problem`, html: `<p>Build the booking core for an office's meeting rooms: an in-memory library, no UI. The interviewer will push hardest on two things: how you tell whether a room is free, and what happens when two people grab the same room at the same moment.</p>` },
        { type: `code`, lang: `text`, title: `Final requirements`, code: `Functional
  1. A fixed set of rooms, each with an id, floor, capacity and equipment
     (projector, video conferencing, whiteboard).
  2. Book a specific room for [start, end) if it is free. Back-to-back
     meetings (one ends at 10:00, the next starts at 10:00) are allowed.
  3. Book any free room with capacity >= N and the required equipment;
     the rule for choosing among candidates is pluggable
     (smallest room that fits, preferred floor first).
  4. Cancel a booking.
  5. Reschedule a booking to a new time and/or room. If the new slot is
     not free, the original booking stays exactly as it was.
  6. Notify the organizer and attendees when a meeting is booked, moved
     or cancelled.
  7. Show a person's meetings in a time window (which also reveals clashes).
  8. Concurrent requests for the same room and overlapping times:
     exactly one succeeds.

Out of scope (deep dives)
  - Recurring meetings, the hotel booking variant, the minimum number
    of rooms a set of meetings needs, persistence across servers.` }
      ] },
      { id: `clarifying`, title: `Questions worth asking`, kicker: `Clarifying`, blocks: [
        { type: `table`, headers: [`Ask`, `Assume`, `Decides`], rows: [
          [`Can a meeting start exactly when another ends?`, `Yes`, `Half-open intervals <code>[start, end)</code>`],
          [`Book a named room, or "find me a room"?`, `Both`, `A selection strategy over candidate rooms`],
          [`How do we choose among free rooms?`, `Smallest that fits, preferred floor first; may change`, `<code>RoomSelectionStrategy</code> interface`],
          [`Must attendees be free too?`, `No: report clashes, don't block the booking`, `A per-person calendar query, not a constraint`],
          [`What if a reschedule's new slot is taken?`, `Fail and keep the old booking`, `Atomic remove-check-insert-or-restore`],
          [`Many users booking at once?`, `Yes, across all rooms`, `A lock per room, never one global lock`],
          [`Time zones?`, `Store instants; display is the client's job`, `<code>java.time.Instant</code> in the core`]
        ] },
        { type: `callout`, tone: `insight`, html: `<p>Say "half-open" early. With closed intervals <code>[9:00, 10:00]</code> and <code>[10:00, 11:00]</code> share the instant 10:00 and clash, which no real calendar wants. With <code>[start, end)</code> the end instant is not part of the meeting, so back-to-back slots fit and the overlap test becomes one symmetric line.</p>` }
      ] }
    ],
    solution: [
      { id: `design`, title: `Design`, kicker: `Entities and API`, blocks: [
        { type: `table`, headers: [`Type`, `Owns`], rows: [
          [`Interval`, `Immutable <code>[start, end)</code> with the overlap test`],
          [`Room`, `Id, name, floor, capacity, equipment (record)`],
          [`MeetingRequest`, `Title, organizer, attendees and the interval (record)`],
          [`Booking`, `Id, room id and the meeting; immutable, so a reschedule makes a new version with the same id`],
          [`RoomSchedule`, `One room's bookings in a <code>TreeMap</code> keyed by start, plus that room's lock`],
          [`RoomSelectionStrategy`, `Ranks the rooms that fit a query (Strategy)`],
          [`MeetingListener`, `Receives booked, moved and cancelled events (Observer)`],
          [`MeetingScheduler`, `Facade: book, bookAny, cancel, reschedule, calendarOf`]
        ] },
        { type: `keypoints`, items: [
          `<strong>Bookings in a room never overlap</strong>, so sorted by start they are also sorted by end. That is why checking the booking just before and just after the new start is enough: O(log n) instead of scanning the room's list.`,
          `<strong>Booking is check-then-insert</strong>, and it is only correct if both happen under the same lock. The lock is <strong>per room</strong>: two rooms never wait for each other, and a global lock would serialise the whole office.`,
          `<strong>The selection rule is a Strategy</strong> because the requirement says it is pluggable and it really does vary (smallest fit, same floor, nearest the organizer). <strong>Notifications are an Observer</strong> because the scheduler shouldn't know about e-mail, chat or calendar sync.`,
          `<strong>Listeners run after the lock is released</strong>, so a slow e-mail server can't hold up bookings for that room.`
        ] },
        { type: `code`, lang: `java`, title: `Public API`, code: `MeetingScheduler(Collection<Room> rooms, RoomSelectionStrategy selection);
Booking book(String roomId, MeetingRequest request);         // throws RoomUnavailableException
Booking bookAny(RoomQuery query, MeetingRequest request);    // best free room per the strategy
void cancel(String bookingId);
Booking reschedule(String bookingId, String roomId, Interval when);  // all or nothing
List<Booking> calendarOf(String person, Interval window);    // a person's meetings; shows clashes too
void addListener(MeetingListener listener);` }
      ] },
      { id: `code`, title: `Working code`, kicker: `Implementation`, blocks: [
        { type: `code`, lang: `java`, title: `Intervals, rooms and bookings`, code: `record Interval(Instant start, Instant end) {
    Interval {
        if (!start.isBefore(end)) throw new IllegalArgumentException("start must be before end");
    }
    /** Half-open [start, end): a meeting ending at 10:00 doesn't clash with one starting at 10:00. */
    boolean overlaps(Interval o) { return start.isBefore(o.end()) && o.start().isBefore(end); }
}

enum Equipment { PROJECTOR, VIDEO_CONF, WHITEBOARD }

record Room(String id, String name, int floor, int capacity, Set<Equipment> equipment) {
    Room { equipment = Set.copyOf(equipment); }
    boolean fits(RoomQuery q) { return capacity >= q.minCapacity() && equipment.containsAll(q.equipment()); }
}

record RoomQuery(int minCapacity, Set<Equipment> equipment, OptionalInt preferredFloor) {
    boolean onPreferredFloor(Room r) { return preferredFloor.isPresent() && preferredFloor.getAsInt() == r.floor(); }
}

record MeetingRequest(String title, String organizer, Set<String> attendees, Interval when) {
    MeetingRequest { attendees = Set.copyOf(attendees); }
    MeetingRequest at(Interval newWhen) { return new MeetingRequest(title, organizer, attendees, newWhen); }
}

/** Immutable: a reschedule creates a new Booking with the same id. */
record Booking(String id, String roomId, MeetingRequest meeting) {
    Interval when() { return meeting.when(); }
    Set<String> people() {
        Set<String> all = new HashSet<>(meeting.attendees());
        all.add(meeting.organizer());
        return all;
    }
    Booking movedTo(String newRoomId, Interval newWhen) { return new Booking(id, newRoomId, meeting.at(newWhen)); }
}` },
        { type: `code`, lang: `java`, title: `Room schedule`, code: `final class RoomSchedule {
    final Room room;
    final ReentrantLock lock = new ReentrantLock();
    private final TreeMap<Instant, Booking> byStart = new TreeMap<>();   // never overlapping; guarded by lock

    RoomSchedule(Room room) { this.room = room; }

    /** Caller holds lock. Stored bookings never overlap, so only the two neighbours of our start can clash. */
    boolean isFree(Interval when) {
        Map.Entry<Instant, Booking> before = byStart.floorEntry(when.start());     // starts at or before us
        if (before != null && before.getValue().when().end().isAfter(when.start())) return false;
        Map.Entry<Instant, Booking> after = byStart.ceilingEntry(when.start());    // starts at or after us
        return after == null || !after.getValue().when().start().isBefore(when.end());
    }

    void add(Booking b)    { byStart.put(b.when().start(), b); }      // caller holds lock and checked isFree
    void remove(Booking b) { byStart.remove(b.when().start(), b); }   // caller holds lock
}` },
        { type: `code`, lang: `java`, title: `Selection strategy and listeners`, code: `interface RoomSelectionStrategy {
    /** The rooms that fit the query, best first. */
    List<Room> rank(Collection<Room> rooms, RoomQuery query);
}

/** Preferred floor first, then the smallest room that fits, so big rooms stay free for big meetings. */
final class SmallestFitFirst implements RoomSelectionStrategy {
    public List<Room> rank(Collection<Room> rooms, RoomQuery q) {
        return rooms.stream()
            .filter(r -> r.fits(q))
            .sorted(Comparator.comparing((Room r) -> !q.onPreferredFloor(r))   // false sorts first
                .thenComparingInt(Room::capacity)
                .thenComparing(Room::id))
            .toList();
    }
}

enum ChangeType { BOOKED, MOVED, CANCELLED }

record MeetingEvent(ChangeType type, Booking booking, Booking previous) {}   // previous: only for MOVED

interface MeetingListener { void onChange(MeetingEvent event); }            // e-mail, chat, calendar sync` },
        { type: `code`, lang: `java`, title: `MeetingScheduler`, code: `final class MeetingScheduler {
    private final Map<String, RoomSchedule> rooms;                                // fixed at start
    private final RoomSelectionStrategy selection;
    private final Map<String, Booking> bookings = new ConcurrentHashMap<>();      // id -> current version
    private final Map<String, Set<String>> byPerson = new ConcurrentHashMap<>();  // person -> booking ids
    private final List<MeetingListener> listeners = new CopyOnWriteArrayList<>();

    MeetingScheduler(Collection<Room> rooms, RoomSelectionStrategy selection) {
        Map<String, RoomSchedule> m = new HashMap<>();
        for (Room r : rooms) m.put(r.id(), new RoomSchedule(r));
        this.rooms = Map.copyOf(m);
        this.selection = selection;
    }

    void addListener(MeetingListener l) { listeners.add(l); }

    Booking book(String roomId, MeetingRequest req) {
        return tryBook(schedule(roomId), req).orElseThrow(() -> new RoomUnavailableException(roomId, req.when()));
    }

    Booking bookAny(RoomQuery query, MeetingRequest req) {
        List<Room> all = rooms.values().stream().map(s -> s.room).toList();
        for (Room r : selection.rank(all, query)) {
            Optional<Booking> b = tryBook(rooms.get(r.id()), req);        // lost a race? try the next room
            if (b.isPresent()) return b.get();
        }
        throw new NoRoomAvailableException(req.when());
    }

    void cancel(String bookingId) {
        while (true) {
            Booking b = find(bookingId);
            RoomSchedule s = schedule(b.roomId());
            s.lock.lock();
            try {
                if (bookings.get(bookingId) != b) continue;               // moved or cancelled meanwhile: look again
                s.remove(b);
                bookings.remove(bookingId);
                for (String p : b.people()) {
                    Set<String> ids = byPerson.get(p);
                    if (ids != null) ids.remove(bookingId);
                }
            } finally { s.lock.unlock(); }
            publish(new MeetingEvent(ChangeType.CANCELLED, b, null));
            return;
        }
    }

    Booking reschedule(String bookingId, String roomId, Interval when) {
        RoomSchedule to = schedule(roomId);
        while (true) {
            Booking old = find(bookingId);
            RoomSchedule from = schedule(old.roomId());
            List<RoomSchedule> locked = lockInOrder(from, to);               // fixed order: no deadlock
            Booking moved;
            try {
                if (bookings.get(bookingId) != old) continue;               // identity: a move makes a new object
                from.remove(old);                                           // a same-room move may overlap its old slot
                if (!to.isFree(when)) {
                    from.add(old);                                          // put it back: the old slot is never lost
                    throw new RoomUnavailableException(roomId, when);
                }
                moved = old.movedTo(roomId, when);
                to.add(moved);
                bookings.put(bookingId, moved);                             // same id and people: calendars unchanged
            } finally { unlockAll(locked); }
            publish(new MeetingEvent(ChangeType.MOVED, moved, old));
            return moved;
        }
    }

    List<Booking> calendarOf(String person, Interval window) {
        return byPerson.getOrDefault(person, Set.of()).stream()
            .map(bookings::get)
            .filter(b -> b != null && b.when().overlaps(window))           // null: cancelled since we read the ids
            .sorted(Comparator.comparing((Booking b) -> b.when().start()))
            .toList();
    }

    private Optional<Booking> tryBook(RoomSchedule s, MeetingRequest req) {
        Booking b;
        s.lock.lock();
        try {
            if (!s.isFree(req.when())) return Optional.empty();
            b = new Booking(UUID.randomUUID().toString(), s.room.id(), req);
            insert(s, b);                                                   // check and insert under one lock
        } finally { s.lock.unlock(); }
        publish(new MeetingEvent(ChangeType.BOOKED, b, null));             // outside the lock
        return Optional.of(b);
    }

    /** Caller holds s.lock: the room's tree, the id map and every calendar change together. */
    private void insert(RoomSchedule s, Booking b) {
        s.add(b);
        bookings.put(b.id(), b);
        for (String p : b.people()) byPerson.computeIfAbsent(p, k -> ConcurrentHashMap.newKeySet()).add(b.id());
    }

    private void publish(MeetingEvent e) {
        for (MeetingListener l : listeners) {
            try { l.onChange(e); }
            catch (RuntimeException ex) { /* log; one bad listener must not affect the others */ }
        }
    }

    private static List<RoomSchedule> lockInOrder(RoomSchedule a, RoomSchedule b) {
        List<RoomSchedule> order = a == b ? List.of(a)
            : a.room.id().compareTo(b.room.id()) < 0 ? List.of(a, b) : List.of(b, a);
        order.forEach(s -> s.lock.lock());
        return order;
    }

    private static void unlockAll(List<RoomSchedule> locked) {
        for (int i = locked.size() - 1; i >= 0; i--) locked.get(i).lock.unlock();
    }

    private Booking find(String id) {
        Booking b = bookings.get(id);
        if (b == null) throw new IllegalArgumentException("Unknown booking " + id);
        return b;
    }

    private RoomSchedule schedule(String roomId) {
        RoomSchedule s = rooms.get(roomId);
        if (s == null) throw new IllegalArgumentException("Unknown room " + roomId);
        return s;
    }
}

class RoomUnavailableException extends RuntimeException {
    RoomUnavailableException(String roomId, Interval when) { super(roomId + " is not free for " + when); }
}

class NoRoomAvailableException extends RuntimeException {
    NoRoomAvailableException(Interval when) { super("No matching room is free for " + when); }
}` },
        { type: `callout`, tone: `insight`, title: `Why this is thread-safe`, html: `<p>The room map, rooms, requests and bookings are immutable, so they are shared freely. Each room's <code>TreeMap</code> is touched only while holding that room's lock, so check-then-insert is one atomic step per room. The <code>bookings</code> and <code>byPerson</code> maps are concurrent, and a booking's entry is only changed while its room's lock is held, so cancel and reschedule can re-check "is this still the current version?" under the lock and retry if a concurrent move won. Listeners sit in a <code>CopyOnWriteArrayList</code> and are called after unlocking.</p>` }
      ] },
      { id: `walkthrough`, title: `Walking through it`, kicker: `Check it works`, blocks: [
        { type: `steps`, items: [
          `Room R1 has 9:00-10:00 and 11:00-12:00. A request for 10:00-11:00: <code>floorEntry(10:00)</code> is the 9:00 meeting, which ends at 10:00, not after it; <code>ceilingEntry(10:00)</code> is the 11:00 meeting, which starts at 11:00, not before our end. Free: booked back to back.`,
          `A request for 10:30-11:30 finds the 11:00 meeting as the ceiling neighbour, starting before 11:30: not free, without looking at any other booking.`,
          `Two people call <code>book(R1, 14:00-15:00)</code> at once. R1's lock lets one in; it checks, inserts and unlocks. The second then sees the new booking as its floor neighbour and gets <code>RoomUnavailableException</code>. Meanwhile bookings for R2 run in parallel.`,
          `<code>bookAny(capacity 6, projector, floor 3)</code>: the strategy ranks floor-3 rooms first, smallest first. If the first room was taken a moment ago, <code>tryBook</code> returns empty and the loop tries the next room.`,
          `Rescheduling a meeting from R1 to R2 while someone else moves another meeting from R2 to R1: both lock R1 first (id order), so one waits; no deadlock. If R2 turns out to be busy, the meeting goes back into R1's slot before the lock is released.`
        ] }
      ] }
    ],
    levels: levels(
      [`Rooms, bookings and a scheduler with book and cancel that work; a correct overlap test, ideally half-open.`, `Seeing that two people can race for the same room and that some locking is needed.`],
      [`The O(log n) neighbour check on a sorted map and why it is correct (stored bookings never overlap).`, `A lock per room with check-then-insert inside it, and why not one global lock.`, `A selection strategy driven by the pluggable requirement, notifications outside the lock, and an atomic reschedule.`],
      [`Cross-room reschedule with ordered locking, recurring meetings booked all or nothing, the hotel variant with inventory counts and expiring holds.`, `Moving the guarantee into a database across servers (an exclusion constraint, or locking the room row) and the minimum-rooms sweep as an analysis tool.`]
    ),
    concepts: [
      { term: `Half-open interval`, def: `A slot <code>[start, end)</code> includes its start but not its end.`, why: `Back-to-back meetings don't clash, and durations are simply end minus start.` },
      { term: `Overlap test`, def: `Two slots overlap exactly when <code>a.start &lt; b.end &amp;&amp; b.start &lt; a.end</code>.`, why: `One symmetric condition covers containment, partial overlap and equality; anything else is a gap.`, ex: `[9, 10) and [10, 11): 10 &lt; 10 is false, so no overlap.` },
      { term: `Neighbour check`, def: `In a <code>TreeMap</code> keyed by start, test only <code>floorEntry(start)</code> and <code>ceilingEntry(start)</code>.`, why: `A room's bookings never overlap, so no other booking can clash if those two don't: O(log n), not a scan.` },
      { term: `Atomic check-then-insert`, def: `Check that the slot is free and insert the booking inside one critical section.`, why: `Checked separately, two requests can both see "free" and both insert: a double booking.` },
      { term: `Lock per room`, def: `Each <code>RoomSchedule</code> has its own <code>ReentrantLock</code>.`, why: `The no-overlap invariant is per room, so that is the natural unit; different rooms never contend.` },
      { term: `Room selection strategy`, def: `An interface that ranks the rooms fitting capacity and equipment; <code>SmallestFitFirst</code> is one rule.`, why: `The requirement says the rule is pluggable, and it changes (same floor, nearest, least used).` },
      { term: `Atomic reschedule`, def: `Under the room lock(s): remove the old slot, check the new one, then insert the new booking or put the old one back.`, why: `The meeting is never in zero or two places, and a failed move keeps the original.` },
      { term: `Ordered locking`, def: `When a move touches two rooms, lock them in room-id order and unlock in reverse.`, why: `Opposite moves (R1 to R2, R2 to R1) can't each hold one lock and wait for the other.` },
      { term: `Observer outside the lock`, def: `Listeners get booked, moved and cancelled events after the room lock is released.`, why: `Slow or failing notification code can't block bookings or break the scheduler.` }
    ],
    interview: [
      { q: `Why use half-open intervals?`, a: `Because a meeting that ends at 10:00 and one that starts at 10:00 should both fit. With [start, end) the end instant isn't part of the meeting, so the overlap test a.start &lt; b.end and b.start &lt; a.end says they don't clash. It also makes lengths simple (end minus start) and splits a day into slots with no gaps or double counting.`, diff: `easy` },
      { q: `How do you check whether a room is free quickly?`, a: `Keep each room's bookings in a TreeMap keyed by start time. Because a room's bookings never overlap each other, they are sorted by end time as well, so only two bookings can possibly clash with a new slot: the one starting at or before its start (floorEntry), which clashes if it ends after our start, and the one starting at or after its start (ceilingEntry), which clashes if it starts before our end. That is O(log n) instead of scanning every booking.`, diff: `medium` },
      { q: `Two users book the same room for overlapping times at the same instant. What happens?`, a: `Exactly one wins. Booking is check-then-insert, done while holding that room's lock, so the second request only checks after the first has inserted, finds it as a neighbour and fails. A ConcurrentSkipListMap on its own is not enough: each put is atomic, but two threads can both check, both see free and both put under different start keys. One global lock would also be correct but serialises every room in the building.`, diff: `medium` },
      { q: `How do you reschedule a meeting into a different room without losing it or deadlocking?`, a: `Lock both rooms, always in the same order (by room id), so two opposite moves can't each hold one lock and wait for the other. Under both locks, re-check that the booking hasn't changed, remove it from the old room, check the new slot, then insert the new version, or put the old one back and fail. Nobody ever sees the meeting in both rooms or in neither, and notifications go out after unlocking.`, diff: `hard` },
      { q: `How would you book a weekly meeting when one of the weeks is already taken?`, a: `Default to all or nothing: compute every occurrence first, then under the room's lock check all of them and only insert if every one is free; otherwise report the clashing dates and change nothing. Some products instead book the free weeks and list the exceptions, which is a product decision worth asking about. Generate occurrences on the wall clock in the meeting's time zone so 10:00 stays 10:00 across daylight-saving changes.`, diff: `medium` },
      { q: `Given a day's meetings, how many rooms are needed at minimum?`, a: `Sort all start times and all end times separately and sweep: for each start in order, first release every meeting that ended at or before it (half-open, so an end at the same instant frees the room), then take a room; the peak count is the answer. O(n log n) for the sorts. To also say which room each meeting gets, sort by start and keep a min-heap of the end times of rooms in use.`, diff: `medium` },
      { q: `How does this work with several servers and a database?`, a: `In-memory locks protect one process only, so the database must enforce no overlap. PostgreSQL can do it declaratively with an exclusion constraint on (room_id with =, time range with &amp;&amp;). Otherwise lock the room's row with SELECT ... FOR UPDATE inside the transaction, check for an overlapping booking and insert. With fixed slots (say 30 minutes), a unique key on (room, slot) works in any database.`, diff: `hard` }
    ],
    cheatsheet: [
      { title: `Scheduler in one screen`, type: `code`, lang: `java`, body: `record Interval(Instant start, Instant end) {
    boolean overlaps(Interval o) { return start.isBefore(o.end()) && o.start().isBefore(end); }   // [start, end)
}
final class RoomSchedule {
    ReentrantLock lock; TreeMap<Instant, Booking> byStart;     // never overlapping
    boolean isFree(Interval w);                                // floorEntry + ceilingEntry only
}
final class MeetingScheduler {
    Booking book(String roomId, MeetingRequest r);             // lock room, isFree, insert, unlock, notify
    Booking bookAny(RoomQuery q, MeetingRequest r);            // strategy ranks rooms; first tryBook wins
    void cancel(String id);                                    // re-check current version under the lock
    Booking reschedule(String id, String roomId, Interval w);  // lock rooms by id; remove, check, add or restore
}` },
      { title: `Follow-ups`, type: `table`, headers: [`Follow-up`, `Change`], rows: [
        [`Recurring meetings`, `Expand occurrences, check all under the room lock, insert all or none`],
        [`Hotel booking`, `Dates <code>[checkIn, checkOut)</code>, counts per room type per night, hold then confirm with expiry`],
        [`Minimum rooms`, `Sort starts and ends, sweep, track the peak`],
        [`Several servers`, `Exclusion constraint or <code>SELECT ... FOR UPDATE</code> on the room row`],
        [`Busy rooms, many readers`, `<code>ConcurrentSkipListMap</code> for lock-free reads; writes still take the room lock`]
      ] },
      { title: `Edge cases`, type: `list`, items: [`End not after start`, `Back-to-back slots (must be allowed)`, `A slot exactly equal to an existing one`, `Rescheduling into its own old slot, or overlapping it in the same room`, `Cancel or reschedule racing with another move of the same booking`, `No room fits the capacity or equipment at all`] }
    ],
    labs: []
  },

  // ====================================================================== Ride Sharing
  {
    id: `ride-sharing`, part: 3, number: 0, difficulty: `hard`,
    title: `Ride Sharing: pricing and matching strategies, a ride state machine, one driver per ride`,
    references: [{ title: `awesome-low-level-design: Ride-Sharing Service`, url: `https://github.com/ashishps1/awesome-low-level-design/blob/main/problems/ride-sharing-service.md` }],
    overview: `An Uber or Ola style cab booking core: a rider gets a fare estimate and requests a ride, the system offers it to nearby drivers one at a time until someone accepts, and the ride moves from request to drop-off. It is a flagship machine-coding round because it tests three things at once: <strong>Strategy</strong> for the rules that keep changing (pricing with surge, driver matching), an <strong>explicit state machine</strong> for a lifecycle where an illegal step costs money, and <strong>concurrency</strong> on a scarce shared resource: two riders must never get the same driver, and one ride must never get two.`,
    problem: [
      { id: `requirements`, title: `What we are building`, kicker: `Requirements`, blocks: [
        { type: `problem`, html: `<p>"Design Uber" is a system design question. In an LLD round, scope it to the <strong>in-process core</strong>: the object model and the dispatch logic that a single service would run, with maps, payments and notifications behind interfaces.</p>` },
        { type: `code`, lang: `text`, title: `Final requirements`, code: `Functional
  1. A rider gets a fare estimate, then requests a ride: pickup, drop, ride type.
  2. The system finds nearby available drivers of that ride type and offers the
     ride to one driver at a time; each offer expires after a timeout (15 s).
  3. A driver accepts or declines; on decline or timeout the next driver is tried.
     If nobody is left, the ride is cancelled with reason NO_DRIVER.
  4. The ride moves REQUESTED -> OFFERED -> ACCEPTED -> DRIVER_ARRIVED ->
     IN_PROGRESS -> COMPLETED, and can be CANCELLED before the trip starts.
     Any other transition is rejected.
  5. Pricing is pluggable: base + per km + per minute by ride type, a surge
     multiplier from demand and supply, or a flat rate.
  6. Matching is pluggable: nearest, highest rated, or least recently assigned.
  7. The final fare is computed from the actual trip; the rider is charged once
     through a payment gateway, and each ride records a Payment whose status is
     PENDING, SUCCEEDED or FAILED.
  8. Riders rate the driver after a completed ride; riders and drivers are
     notified of every status change.
  9. Riders see the assigned driver's live location and ETA until drop-off.
 10. A city can instead broadcast requests: nearby drivers see open requests and
     choose one; the first to accept gets the ride.
 11. Concurrency: a driver never holds two rides, a ride never has two drivers,
     and a retried request never creates a second ride or a second charge.

Out of scope
  - Maps and routing (an estimator interface), card processing itself (a gateway
    interface), driver onboarding, pooled rides, scheduled rides, regulations.` }
      ] },
      { id: `clarifying`, title: `Questions that change the design`, kicker: `Clarifying`, blocks: [
        { type: `table`, headers: [`Ask`, `Assume`, `Decides`], rows: [
          [`Broadcast a request to many drivers, or offer one at a time?`, `One at a time by default; broadcast as a per-city option`, `An atomic claim on the driver per offer; in broadcast mode, the first claim on the ride wins (Deep Dives)`],
          [`Does the rider track the car live?`, `Yes: the assigned driver's location and ETA until drop-off`, `Forward assigned drivers' pings to the rider, throttled (Deep Dives)`],
          [`What if the card is declined?`, `The ride still completes; the payment is FAILED and retried`, `A Payment with its own status (Deep Dives)`],
          [`How is a driver found?`, `Available drivers of the ride type within a few km, ranked by a policy`, `A spatial index plus a MatchingStrategy`],
          [`How is the price decided?`, `A rate card per ride type, times surge; some routes are flat`, `PricingStrategy; money in paise as long`],
          [`Is the estimate the final price?`, `No: recomputed from the actual trip, with the surge locked at request time`, `The same strategy called twice`],
          [`Can a ride be cancelled at any point?`, `Only before the trip starts; a fee may apply`, `The transition table, and a fee policy`],
          [`What if nobody accepts?`, `Cancel with reason NO_DRIVER and tell the rider`, `A terminal path out of the search`],
          [`Do clients retry on a flaky network?`, `Yes, with a client-generated request id`, `An idempotent requestRide`]
        ] },
        { type: `callout`, tone: `insight`, html: `<p>Three forces shape the design. Rules that change per city and per experiment (pricing, matching) call for <strong>Strategy</strong>. A lifecycle where a wrong step means a wrong charge calls for an <strong>explicit transition table</strong>. And drivers are a scarce resource shared by every rider nearby, so taking one must be a single <strong>atomic</strong> step.</p>` }
      ] }
    ],
    solution: [
      { id: `design`, title: `Design`, kicker: `Entities and API`, blocks: [
        { type: `table`, headers: [`Class`, `Owns`], rows: [
          [`RideService`, `The dispatcher: estimates, requests, offers and their timeouts, driver responses; rides and drivers by id`],
          [`Rider`, `Id and name (a record)`],
          [`Driver`, `Vehicle, status (atomic), location (volatile), rating`],
          [`Vehicle, RideType`, `Plate, model and ride type; the type picks the rate card and which drivers are eligible`],
          [`Location`, `Latitude and longitude with a distance function (a record)`],
          [`DriverIndex`, `Grid cells to drivers, so "who is near this point" scans a few cells, not every driver`],
          [`Ride`, `The lifecycle: status, assigned driver, candidates left to try, estimate and final fare, under its own lock`],
          [`PricingStrategy`, `MeteredPricing, FlatRatePricing; returns a FareBreakdown`],
          [`MatchingStrategy`, `NearestDriver, HighestRated, LeastRecentlyAssigned`],
          [`RideListener, PaymentGateway`, `Observer for notifications; charging is an external port`],
          [`Payment, PaymentService`, `One payment per ride with status PENDING, SUCCEEDED or FAILED; retries (Deep Dives)`],
          [`RideTracker`, `Forwards an assigned driver's pings and ETA to the rider (Deep Dives)`]
        ] },
        { type: `keypoints`, items: [
          `<strong>Two strategy interfaces</strong>, because pricing and matching vary independently, differ by city and are A/B-tested. Shipping a new rule is a new class; <code>RideService</code> does not change.`,
          `<strong>Ride status is an enum plus a transition table.</strong> Every change goes through one <code>moveTo</code> method under the ride's lock, so an illegal step is rejected in exactly one place.`,
          `<strong>Driver state is shared, ride state is not.</strong> Many rides compete for the same nearby driver, so the driver's status changes only by compare-and-set (AVAILABLE &rarr; OFFERED). A ride is touched by its own rider, its driver and its timer, so a plain lock per ride is enough.`,
          `<strong>Dispatch is event driven.</strong> An offer schedules a timeout; accept, decline and timeout are events that each take the ride's lock. No thread sits blocked waiting for a driver to tap.`,
          `<strong>RideService is not a Singleton.</strong> Many write-ups make it one. Create one instance at startup and pass it to the controllers that need it: tests can build their own with fake strategies and a fake clock, and nothing hides a global. If a global accessor is truly required, use a lock-based lazy singleton.`
        ] },
        { type: `code`, lang: `java`, title: `Public API`, code: `// Riders
FareBreakdown estimate(Location pickup, Location drop, RideType type);
Ride requestRide(String riderId, String requestId, Location pickup, Location drop, RideType type); // idempotent
void cancel(String rideId, String riderId);
void rateDriver(String rideId, String riderId, int stars);

// Drivers
void registerDriver(Driver driver);
void goOnline(String driverId, Location at);
void goOffline(String driverId);
void updateLocation(String driverId, Location at);    // every few seconds per driver
void accept(String rideId, String driverId);
void decline(String rideId, String driverId);
void arrived(String rideId, String driverId);
void start(String rideId, String driverId);
void complete(String rideId, String driverId, TripMetrics actual);

// Broadcast mode, live tracking and payments (Deep Dives)
List<Ride> openRequestsNear(String driverId);
void claim(String rideId, String driverId);           // first driver to claim wins
void addTrackingListener(TrackingListener listener);  // live location and ETA for riders
Payment payment(String rideId);

void addListener(RideListener listener);` }
      ] },
      { id: `code`, title: `Working code`, kicker: `Implementation`, blocks: [
        { type: `code`, lang: `java`, title: `Value types and the transition table`, code: `record Location(double lat, double lng) {
    private static final double EARTH_RADIUS_KM = 6371.0;

    /** Great-circle (haversine) distance; good enough to rank nearby drivers. */
    double distanceKm(Location o) {
        double dLat = Math.toRadians(o.lat - lat), dLng = Math.toRadians(o.lng - lng);
        double h = Math.pow(Math.sin(dLat / 2), 2)
                 + Math.cos(Math.toRadians(lat)) * Math.cos(Math.toRadians(o.lat)) * Math.pow(Math.sin(dLng / 2), 2);
        return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
    }
}

enum RideType { BIKE, AUTO, MINI, SEDAN, XL }

record Vehicle(String plate, String model, RideType type) {}
record Rider(String id, String name) {}

/** Distance and duration of a trip: estimated from a route before it, measured after it. */
record TripMetrics(double km, double minutes) {}

/** Amounts in minor units (paise); surge is the multiplier applied to the subtotal. */
record FareBreakdown(long base, long distance, long time, double surge, long total) {}

enum RideStatus {
    REQUESTED, OFFERED, ACCEPTED, DRIVER_ARRIVED, IN_PROGRESS, COMPLETED, CANCELLED;

    // Built once during class initialisation and never modified, so any thread can read it without a lock.
    private static final Map<RideStatus, Set<RideStatus>> NEXT = Map.of(
        REQUESTED,      EnumSet.of(OFFERED, CANCELLED),
        OFFERED,        EnumSet.of(ACCEPTED, REQUESTED, CANCELLED),   // back to REQUESTED on decline or timeout
        ACCEPTED,       EnumSet.of(DRIVER_ARRIVED, CANCELLED),
        DRIVER_ARRIVED, EnumSet.of(IN_PROGRESS, CANCELLED),
        IN_PROGRESS,    EnumSet.of(COMPLETED),
        COMPLETED,      EnumSet.noneOf(RideStatus.class),
        CANCELLED,      EnumSet.noneOf(RideStatus.class));

    boolean canMoveTo(RideStatus next) { return NEXT.get(this).contains(next); }
}` },
        { type: `code`, lang: `java`, title: `Pricing strategies`, code: `interface PricingStrategy {
    FareBreakdown price(RideType type, TripMetrics trip, double surge);
}

record RateCard(long base, long perKm, long perMinute, long minimum) {}   // paise

/** Base + per km + per minute from a rate card per ride type, times surge. */
final class MeteredPricing implements PricingStrategy {
    private final Map<RideType, RateCard> cards;      // immutable copy: safe to share between threads

    MeteredPricing(Map<RideType, RateCard> cards) { this.cards = Map.copyOf(cards); }

    public FareBreakdown price(RideType type, TripMetrics trip, double surge) {
        RateCard c = cards.get(type);
        if (c == null) throw new IllegalArgumentException("No rate card for " + type);
        long distance = Math.round(trip.km() * c.perKm());           // each line item rounded once
        long time = Math.round(trip.minutes() * c.perMinute());
        long total = Math.max(c.minimum(), Math.round((c.base() + distance + time) * surge));
        return new FareBreakdown(c.base(), distance, time, surge, total);
    }
}

/** A fixed price per ride type, e.g. airport transfers; ignores distance, time and surge. */
final class FlatRatePricing implements PricingStrategy {
    private final Map<RideType, Long> fares;

    FlatRatePricing(Map<RideType, Long> fares) { this.fares = Map.copyOf(fares); }

    public FareBreakdown price(RideType type, TripMetrics trip, double surge) {
        Long fare = fares.get(type);
        if (fare == null) throw new IllegalArgumentException("No flat fare for " + type);
        return new FareBreakdown(fare, 0, 0, 1.0, fare);
    }
}

interface SurgeProvider  { double multiplierAt(Location pickup); }          // 1.0 means no surge
interface RouteEstimator { TripMetrics estimate(Location from, Location to); }

/** Straight-line distance padded for real roads, at an average city speed of 25 km/h. */
final class StraightLineEstimator implements RouteEstimator {
    public TripMetrics estimate(Location from, Location to) {
        double km = from.distanceKm(to) * 1.3;
        return new TripMetrics(km, km / 25.0 * 60);
    }
}` },
        { type: `code`, lang: `java`, title: `Drivers and the grid index`, code: `enum DriverStatus { OFFLINE, AVAILABLE, OFFERED, ON_TRIP }

final class Driver {
    final String id;
    final Vehicle vehicle;
    private final AtomicReference<DriverStatus> status = new AtomicReference<>(DriverStatus.OFFLINE);
    private volatile Location location;        // written by GPS pings, read by matching: no lock needed
    private volatile long lastAssignedAt;      // epoch millis, for fair matching
    private long ratingSum, ratingCount;       // guarded by this

    Driver(String id, Vehicle vehicle, Location start) { this.id = id; this.vehicle = vehicle; this.location = start; }

    DriverStatus status()  { return status.get(); }
    Location location()    { return location; }
    long lastAssignedAt()  { return lastAssignedAt; }
    void moveTo(Location l) { location = l; }

    boolean goOnline()  { return status.compareAndSet(DriverStatus.OFFLINE, DriverStatus.AVAILABLE); }
    boolean goOffline() { return status.compareAndSet(DriverStatus.AVAILABLE, DriverStatus.OFFLINE); }

    /** The claim: of all the rides racing for this driver, exactly one call returns true. */
    boolean tryClaim()  { return status.compareAndSet(DriverStatus.AVAILABLE, DriverStatus.OFFERED); }
    boolean release()   { return status.compareAndSet(DriverStatus.OFFERED, DriverStatus.AVAILABLE); }
    boolean endTrip()   { return status.compareAndSet(DriverStatus.ON_TRIP, DriverStatus.AVAILABLE); }

    boolean startTrip(long nowMillis) {
        if (!status.compareAndSet(DriverStatus.OFFERED, DriverStatus.ON_TRIP)) return false;
        lastAssignedAt = nowMillis;
        return true;
    }

    synchronized void rate(int stars) {
        if (stars < 1 || stars > 5) throw new IllegalArgumentException("Stars must be 1 to 5");
        ratingSum += stars;
        ratingCount++;
    }

    synchronized double rating() { return ratingCount == 0 ? 5.0 : (double) ratingSum / ratingCount; }
}

record Cell(long x, long y) {
    static final double DEGREES = 0.01;          // about 1.1 km north to south
    static final double KM = 1.1;
    static Cell of(Location l) { return new Cell((long) Math.floor(l.lat() / DEGREES), (long) Math.floor(l.lng() / DEGREES)); }
}

/** What matching needs about a driver, read once so that sorting sees stable values. */
record Candidate(Driver driver, double km, double rating, long lastAssignedAt) {}

final class DriverIndex {
    private final Map<Cell, Set<Driver>> cells = new ConcurrentHashMap<>();
    private final Map<String, Cell> cellOf = new ConcurrentHashMap<>();      // driver id -> current cell

    /** Called on every GPS ping. Only a change of cell touches the cell sets. */
    void update(Driver d, Location loc) {
        cellOf.compute(d.id, (id, before) -> {        // atomic per driver: one driver's pings never interleave
            d.moveTo(loc);
            Cell now = Cell.of(loc);
            if (!now.equals(before)) {
                cells.computeIfAbsent(now, c -> ConcurrentHashMap.newKeySet()).add(d);
                if (before != null) cells.get(before).remove(d);
            }
            return now;
        });
    }

    void remove(Driver d) {
        cellOf.computeIfPresent(d.id, (id, before) -> {
            cells.get(before).remove(d);
            return null;                              // drops the mapping atomically
        });
    }

    /** Available drivers of a ride type within radiusKm of p: scans the cells around p, not every driver. */
    List<Candidate> near(Location p, RideType type, double radiusKm) {
        Cell c = Cell.of(p);
        long r = (long) Math.ceil(radiusKm / Cell.KM);
        List<Candidate> out = new ArrayList<>();
        for (long dx = -r; dx <= r; dx++)
            for (long dy = -r; dy <= r; dy++)
                for (Driver d : cells.getOrDefault(new Cell(c.x() + dx, c.y() + dy), Set.of())) {
                    double km = d.location().distanceKm(p);
                    if (d.status() == DriverStatus.AVAILABLE && d.vehicle.type() == type && km <= radiusKm)
                        out.add(new Candidate(d, km, d.rating(), d.lastAssignedAt()));
                }
        return out;
    }
}` },
        { type: `code`, lang: `java`, title: `Matching strategies`, code: `interface MatchingStrategy {
    List<Candidate> rank(List<Candidate> candidates);        // best first
}

final class NearestDriver implements MatchingStrategy {
    public List<Candidate> rank(List<Candidate> c) {
        return c.stream().sorted(Comparator.comparingDouble(Candidate::km)).toList();
    }
}

final class HighestRated implements MatchingStrategy {
    public List<Candidate> rank(List<Candidate> c) {
        return c.stream()
                .sorted(Comparator.comparingDouble(Candidate::rating).reversed().thenComparingDouble(Candidate::km))
                .toList();
    }
}

/** Spreads work: the driver who has waited longest since their last ride goes first. */
final class LeastRecentlyAssigned implements MatchingStrategy {
    public List<Candidate> rank(List<Candidate> c) {
        return c.stream()
                .sorted(Comparator.comparingLong(Candidate::lastAssignedAt).thenComparingDouble(Candidate::km))
                .toList();
    }
}` },
        { type: `code`, lang: `java`, title: `Ride: one lock per ride`, code: `enum CancelReason { RIDER, DRIVER, NO_DRIVER }

record RideEvent(String rideId, RideStatus status, String riderId, String driverId) {}

final class Ride {
    final String id, riderId;
    final Location pickup, drop;
    final RideType type;
    final FareBreakdown estimate;                    // quoted at request time; its surge is locked in

    // guarded by this
    private RideStatus status = RideStatus.REQUESTED;
    private Driver driver;
    private final Deque<Candidate> candidates = new ArrayDeque<>();
    private FareBreakdown finalFare;
    private CancelReason cancelReason;
    private boolean rated;

    Ride(String id, String riderId, Location pickup, Location drop, RideType type, FareBreakdown estimate) {
        this.id = id; this.riderId = riderId; this.pickup = pickup; this.drop = drop; this.type = type; this.estimate = estimate;
    }

    synchronized RideStatus status()         { return status; }
    synchronized FareBreakdown finalFare()   { return finalFare; }
    synchronized CancelReason cancelReason() { return cancelReason; }
    synchronized void setCandidates(List<Candidate> ranked) { candidates.clear(); candidates.addAll(ranked); }

    /** Claims the next free candidate and offers them the ride; null if the ride stopped searching meanwhile. */
    synchronized RideEvent offerNext() {
        if (status != RideStatus.REQUESTED) return null;
        while (!candidates.isEmpty()) {
            Driver d = candidates.poll().driver();
            if (d.tryClaim()) {                      // CAS; if another ride got d first, try the next one
                driver = d;
                return moveTo(RideStatus.OFFERED);
            }
        }
        cancelReason = CancelReason.NO_DRIVER;
        return moveTo(RideStatus.CANCELLED);
    }

    synchronized RideEvent accept(String driverId, long nowMillis) {
        requireDriver(driverId, RideStatus.OFFERED);
        driver.startTrip(nowMillis);                 // OFFERED -> ON_TRIP; this ride holds the claim
        return moveTo(RideStatus.ACCEPTED);
    }

    /** Decline or timeout. False if the offer is no longer live: accepted, cancelled or already withdrawn. */
    synchronized boolean withdrawOffer(String driverId) {
        if (status != RideStatus.OFFERED || !driver.id.equals(driverId)) return false;
        driver.release();                            // OFFERED -> AVAILABLE
        driver = null;
        moveTo(RideStatus.REQUESTED);
        return true;
    }

    synchronized RideEvent arrived(String driverId) {
        requireDriver(driverId, RideStatus.ACCEPTED);
        return moveTo(RideStatus.DRIVER_ARRIVED);
    }

    synchronized RideEvent start(String driverId) {
        requireDriver(driverId, RideStatus.DRIVER_ARRIVED);
        return moveTo(RideStatus.IN_PROGRESS);
    }

    synchronized RideEvent complete(String driverId, FareBreakdown fare) {
        requireDriver(driverId, RideStatus.IN_PROGRESS);
        finalFare = fare;
        driver.endTrip();                            // ON_TRIP -> AVAILABLE
        return moveTo(RideStatus.COMPLETED);
    }

    synchronized RideEvent cancel(CancelReason reason) {
        RideStatus was = status;
        RideEvent event = moveTo(RideStatus.CANCELLED);   // throws once the trip has started
        cancelReason = reason;
        if (was == RideStatus.OFFERED) driver.release();
        else if (driver != null) driver.endTrip();
        return event;
    }

    /** One rating per completed ride. */
    synchronized Driver driverToRate() {
        if (status != RideStatus.COMPLETED || rated) throw new IllegalStateException("Ride " + id + " cannot be rated now");
        rated = true;
        return driver;
    }

    private RideEvent moveTo(RideStatus next) {      // the only place status changes; caller holds this
        if (!status.canMoveTo(next))
            throw new IllegalStateException("Ride " + id + ": " + status + " -> " + next + " is not allowed");
        status = next;
        return new RideEvent(id, next, riderId, driver == null ? null : driver.id);
    }

    private void requireDriver(String driverId, RideStatus expected) {
        if (status != expected || driver == null || !driver.id.equals(driverId))
            throw new IllegalStateException("Ride " + id + " is " + status + "; driver " + driverId + " cannot do that now");
    }
}` },
        { type: `code`, lang: `java`, title: `RideService: requests, offers and timeouts`, code: `interface RideListener   { void onEvent(RideEvent e); }                        // notifications, receipts
interface PaymentGateway { void charge(String idempotencyKey, String riderId, long amount); }

final class RideService {
    private static final double SEARCH_RADIUS_KM = 3.0;
    private static final long OFFER_TIMEOUT_SECONDS = 15;

    private final Map<String, Driver> drivers = new ConcurrentHashMap<>();
    private final Map<String, Ride> rides = new ConcurrentHashMap<>();
    private final Map<String, Ride> byRequest = new ConcurrentHashMap<>();     // "riderId:requestId" -> ride
    private final List<RideListener> listeners = new CopyOnWriteArrayList<>();
    private final DriverIndex index = new DriverIndex();
    private final PricingStrategy pricing;
    private final MatchingStrategy matching;
    private final SurgeProvider surge;
    private final RouteEstimator routes;
    private final PaymentGateway payments;
    private final ScheduledExecutorService timer;
    private final Clock clock;

    RideService(PricingStrategy pricing, MatchingStrategy matching, SurgeProvider surge, RouteEstimator routes,
                PaymentGateway payments, ScheduledExecutorService timer, Clock clock) {
        this.pricing = pricing; this.matching = matching; this.surge = surge; this.routes = routes;
        this.payments = payments; this.timer = timer; this.clock = clock;
    }

    void addListener(RideListener l) { listeners.add(l); }

    // ---- drivers
    void registerDriver(Driver d)                     { drivers.put(d.id, d); }
    void goOnline(String driverId, Location at)       { Driver d = driver(driverId); if (d.goOnline()) index.update(d, at); }
    void goOffline(String driverId)                   { Driver d = driver(driverId); if (d.goOffline()) index.remove(d); }
    void updateLocation(String driverId, Location at) { index.update(driver(driverId), at); }

    // ---- riders
    FareBreakdown estimate(Location pickup, Location drop, RideType type) {
        return pricing.price(type, routes.estimate(pickup, drop), surge.multiplierAt(pickup));
    }

    /** Idempotent: a retry with the same request id returns the same ride and never dispatches twice. */
    Ride requestRide(String riderId, String requestId, Location pickup, Location drop, RideType type) {
        String key = riderId + ":" + requestId;
        Ride existing = byRequest.get(key);
        if (existing != null) return existing;
        Ride fresh = new Ride(UUID.randomUUID().toString(), riderId, pickup, drop, type, estimate(pickup, drop, type));
        existing = byRequest.putIfAbsent(key, fresh);          // atomic: one of two racing retries wins
        if (existing != null) return existing;
        rides.put(fresh.id, fresh);
        fresh.setCandidates(matching.rank(index.near(pickup, type, SEARCH_RADIUS_KM)));
        dispatch(fresh);
        return fresh;
    }

    void cancel(String rideId, String riderId) { publish(ownedRide(rideId, riderId).cancel(CancelReason.RIDER)); }

    void rateDriver(String rideId, String riderId, int stars) {
        if (stars < 1 || stars > 5) throw new IllegalArgumentException("Stars must be 1 to 5");
        ownedRide(rideId, riderId).driverToRate().rate(stars);
    }

    // ---- driver responses
    void accept(String rideId, String driverId)  { publish(ride(rideId).accept(driverId, clock.millis())); }
    void decline(String rideId, String driverId) { retryIfWithdrawn(ride(rideId), driverId); }
    void arrived(String rideId, String driverId) { publish(ride(rideId).arrived(driverId)); }
    void start(String rideId, String driverId)   { publish(ride(rideId).start(driverId)); }

    void complete(String rideId, String driverId, TripMetrics actual) {
        Ride r = ride(rideId);
        FareBreakdown fare = pricing.price(r.type, actual, r.estimate.surge());    // surge locked at request time
        publish(r.complete(driverId, fare));                                        // throws if already completed
        payments.charge(r.id, r.riderId, fare.total());                             // ride id as the idempotency key
    }

    // ---- dispatch
    private void dispatch(Ride r) {
        RideEvent e = r.offerNext();
        if (e == null) return;                                   // cancelled meanwhile
        publish(e);                                              // OFFERED (to the driver) or CANCELLED (no driver)
        if (e.status() == RideStatus.OFFERED)
            timer.schedule(() -> retryIfWithdrawn(r, e.driverId()), OFFER_TIMEOUT_SECONDS, TimeUnit.SECONDS);
    }

    private void retryIfWithdrawn(Ride r, String driverId) {
        if (r.withdrawOffer(driverId)) dispatch(r);              // false if accepted or cancelled first
    }

    private void publish(RideEvent e) {                          // called outside every lock
        for (RideListener l : listeners) {
            try { l.onEvent(e); } catch (RuntimeException ex) { /* log; one listener must not break the others */ }
        }
    }

    private Ride ownedRide(String rideId, String riderId) {
        Ride r = ride(rideId);
        if (!r.riderId.equals(riderId)) throw new IllegalArgumentException("Ride " + rideId + " is not yours");
        return r;
    }

    private Ride ride(String id) {
        Ride r = rides.get(id);
        if (r == null) throw new IllegalArgumentException("Unknown ride " + id);
        return r;
    }

    private Driver driver(String id) {
        Driver d = drivers.get(id);
        if (d == null) throw new IllegalArgumentException("Unknown driver " + id);
        return d;
    }
}` },
        { type: `callout`, tone: `warning`, html: `<p>Two details make or break this code. The driver claim is a <strong>compare-and-set</strong>, never "if available, then mark offered": two dispatch threads can both pass that check. And the timeout handler does not assume the offer is still live; <code>withdrawOffer</code> re-checks, under the ride's lock, that the ride is still OFFERED to that same driver, so a timer that fires just after an accept does nothing.</p>` }
      ] },
      { id: `concurrency`, title: `Where the threads meet`, kicker: `Thread safety`, blocks: [
        { type: `text`, html: `<p>Rider requests, driver taps, GPS pings and offer timers all arrive on different threads. Each piece of shared state has exactly one protection, chosen for how it is used.</p>` },
        { type: `table`, headers: [`Shared state`, `Protection`, `Why it is safe`], rows: [
          [`Driver status`, `<code>AtomicReference</code>, changed only by compare-and-set`, `Checking AVAILABLE and setting OFFERED is one atomic step, so exactly one ride can take a driver`],
          [`Driver location`, `<code>volatile</code> reference to an immutable <code>Location</code>`, `A reader sees the old point or the new one, never half of each; pings never take a lock`],
          [`Driver rating`, `<code>synchronized</code> on the driver`, `Sum and count always change together`],
          [`Grid cells`, `<code>ConcurrentHashMap</code> of concurrent sets; <code>compute</code> per driver`, `Matching iterates cells without locking; one driver's cell moves never interleave`],
          [`Ride status, driver, candidates`, `The ride's monitor (<code>synchronized</code>)`, `Every transition reads and writes several fields together; rides never share a lock`],
          [`Request id to ride`, `<code>putIfAbsent</code>`, `Two racing retries: exactly one insert wins and only that one dispatches`],
          [`Strategies, rate cards, transition table`, `Immutable after construction`, `Shared freely with no locking`],
          [`Listeners`, `<code>CopyOnWriteArrayList</code>, called after locks are released`, `A slow notification can't stall dispatch`]
        ] },
        { type: `callout`, tone: `insight`, html: `<p>No code path holds two locks. The ride's lock is held while claiming a driver, but the claim is a non-blocking CAS, so there is no lock ordering to get wrong and no deadlock to explain. Location pings touch only the driver's volatile field and the concurrent index, so a flood of pings never slows matching down.</p>` }
      ] },
      { id: `walkthrough`, title: `Walking through it`, kicker: `Check it works`, blocks: [
        { type: `steps`, items: [
          `Rider R1 asks for a MINI estimate: about 6 km and 18 minutes, surge 1.2 in that cell. The quote is shown and the 1.2 will be locked into the ride.`,
          `<code>requestRide(R1, "req-7", ...)</code> creates ride A. Nearby MINI drivers D1 (0.8 km), D2 (1.5 km) and D3 (2.4 km) are ranked nearest first. <code>offerNext</code> claims D1 by CAS, ride A becomes OFFERED and a 15-second timer is scheduled.`,
          `At the same moment rider R2 nearby requests ride B with the same candidates. Its CAS on D1 fails (D1 is OFFERED), so ride B claims D2 instead. Two riders never get one driver.`,
          `R1's app times out on a flaky network and resends "req-7". <code>byRequest</code> already holds it, so the same ride A comes back and nothing is dispatched twice.`,
          `D1 ignores the offer. The timer calls <code>withdrawOffer(D1)</code>: ride A is still OFFERED to D1, so D1 goes back to AVAILABLE and ride A to REQUESTED. The next candidate, D2, fails the CAS (taken by B), so D3 is claimed and offered.`,
          `D3 accepts; ride A becomes ACCEPTED and D3 ON_TRIP. Had D3's accept and the timer fired together, the ride's lock would let one in first and the other would find the state changed and do nothing.`,
          `Arrived, start, then <code>complete</code> with the actual 7 km and 24 minutes: the fare is recomputed with the locked 1.2 surge and charged with the ride id as the idempotency key. A second complete throws, since COMPLETED &rarr; COMPLETED is not in the table.`
        ] }
      ] }
    ],
    levels: levels(
      [`Rider, Driver, Ride, Location and a RideService with sensible responsibilities, and a working happy path from request to completion.`, `A status enum with illegal transitions rejected, one pricing rule and nearest-driver matching.`, `Recognising that two riders can race for one driver, even if the fix needs hints.`],
      [`Strategy for pricing and matching, justified by rules that vary per city and experiment.`, `An atomic driver claim (CAS or a per-driver lock), offers with a timeout, and the accept-versus-timeout race resolved under the ride's lock.`, `Idempotent ride requests, estimate versus final fare with the surge locked in, and notifications through an Observer called outside locks.`],
      [`Spatial indexing trade-offs (grid, geohash, hexagons), surge computed per cell on a schedule with smoothing and caps, cancellation fees as a policy, and fairness in matching.`, `What moves to system design, briefly: geo-sharded dispatch, location pings over Kafka, driver claims as conditional writes in a shared store, durable offer timers and idempotent payments.`]
    ),
    concepts: [
      { term: `Pricing strategy`, def: `An interface that turns a ride type, trip metrics and a surge multiplier into a fare breakdown; metered and flat-rate implementations.`, why: `Pricing rules change per city and per experiment without touching dispatch.` },
      { term: `Surge multiplier`, def: `A factor of at least 1.0 derived from open requests versus available drivers in the pickup's cell, capped and rounded.`, why: `Raises prices where demand outstrips supply, which draws drivers in and dampens demand.` },
      { term: `Matching strategy`, def: `An interface that ranks candidate drivers: nearest, highest rated, least recently assigned, or a weighted blend.`, why: `"Who gets the ride" is a business policy that changes independently of how candidates are found.` },
      { term: `Explicit transition table`, def: `A map from each ride status to the statuses it may move to; one <code>moveTo</code> method checks it.`, why: `Illegal steps (completing a cancelled ride, cancelling mid-trip) are rejected in one place.` },
      { term: `Atomic driver claim`, def: `<code>compareAndSet(AVAILABLE, OFFERED)</code> on the driver's status.`, why: `Of many rides racing for one driver, exactly one wins; the others move on to their next candidate.` },
      { term: `Offer with timeout`, def: `Offer to one driver, schedule a timeout, and on decline or timeout release the driver and try the next candidate.`, why: `A driver who never answers can't stall a rider, and no thread blocks waiting.` },
      { term: `Grid cell index`, def: `Drivers bucketed by a cell computed from latitude and longitude; a search scans only nearby cells.`, why: `Finding candidates costs a few cells, not every driver in the city.` },
      { term: `Idempotent request`, def: `A client-generated request id, stored with <code>putIfAbsent</code>, maps retries to the same ride.`, why: `A network retry never books two cabs.` },
      { term: `Estimate vs final fare`, def: `The estimate prices the routed trip; the final fare prices the actual trip with the surge locked at request time.`, why: `Riders keep the surge they agreed to; detours and jams are still paid for.` },
      { term: `Observer for notifications`, def: `Listeners receive a <code>RideEvent</code> for every status change, after the ride's lock is released.`, why: `Push, SMS and receipts plug in without coupling to dispatch, and can't slow it down.` },
      { term: `Broadcast dispatch`, def: `Nearby drivers see open requests and choose; <code>Ride.claim</code> under the ride's lock lets the first valid claim win.`, why: `The race flips from rides competing for a driver to drivers competing for a ride, and both sides stay atomic.` },
      { term: `Live tracking`, def: `A <code>RideTracker</code> forwards an assigned driver's pings and ETA to the rider, throttled per ride with a compare-and-set.`, why: `Riders see the car approach without any lock on the hot ping path.` },
      { term: `Payment lifecycle`, def: `One <code>Payment</code> per ride, PENDING then SUCCEEDED or FAILED, retried with the ride id as the idempotency key.`, why: `A declined card is tracked and retried without un-completing the ride or charging twice.` }
    ],
    interview: [
      { q: `How do you guarantee two riders never get the same driver?`, a: `Taking a driver is a compare-and-set on the driver's status from AVAILABLE to OFFERED. Two dispatch threads can both see the driver available, but only one CAS succeeds; the loser moves on to its next candidate. A per-driver lock works too. What does not work is checking the status and then setting it in two steps, because both threads can pass the check. The ride side is protected separately: a ride holds at most one driver because offerNext, accept and withdrawOffer all run under the ride's lock and check its status first.`, diff: `medium` },
      { q: `What if the driver accepts at the same moment the offer times out?`, a: `Both the accept and the timeout handler take the ride's lock, so one runs first. If the accept wins, the ride is ACCEPTED and withdrawOffer sees it is no longer OFFERED and returns false, doing nothing. If the timeout wins, the driver is released and the ride goes back to REQUESTED, so the late accept fails the "offered to this driver" check and the driver app is told the offer expired. Either way the ride ends up with exactly one driver.`, diff: `hard` },
      { q: `Why use Strategy for pricing and matching rather than if/else?`, a: `Both are business rules that change often and independently: per city, per ride type, per experiment. With strategies each rule is a small class that can be tested alone and swapped by configuration, and RideService never changes when a rule ships. An if/else chain inside the dispatcher would grow with every launch and mix policy with the concurrency-sensitive dispatch code.`, diff: `easy` },
      { q: `How do you find nearby drivers without scanning every driver?`, a: `Bucket drivers into grid cells computed from latitude and longitude (about 1 km cells), kept in a concurrent map from cell to a concurrent set of drivers. A search computes the pickup's cell and scans the rings of cells that cover the radius, then filters by exact distance, status and ride type. A ping that stays in the same cell only updates the driver's volatile location; a cell change moves the driver between two sets. Geohash or hexagonal grids are refinements of the same idea.`, diff: `medium` },
      { q: `How do you make a ride request safe to retry?`, a: `The client generates a request id and resends it on retry. The service keys rides by riderId plus requestId and inserts with putIfAbsent, so two racing copies resolve to one ride and only the winner dispatches. Entries expire after a while so the map doesn't grow forever. Payments follow the same idea: the gateway is called with the ride id as the idempotency key.`, diff: `medium` },
      { q: `How does the final fare differ from the estimate?`, a: `The estimate prices the routed distance and time with the current surge. The final fare prices the actual distance and time from the trip, but with the surge multiplier locked at request time, because the rider agreed to it. A common variant is an upfront price: charge the estimate unless the metered fare differs by more than a tolerance, say 15 percent, which signals a detour or a changed drop. Money stays in long paise throughout and is rounded once per line item.`, diff: `medium` },
      { q: `What changes when this runs across many servers?`, a: `The design stays, the mechanisms move. Location pings flow through a stream such as Kafka into a geo-sharded location service, so each shard indexes its own cells. The driver claim becomes a conditional write in a shared store, such as an update guarded by status = AVAILABLE or a key set only if absent, with a TTL. Offer timeouts need durable timers so a crash doesn't strand an offer. Events go to a topic that notification services consume. In an LLD round, name these in a minute rather than designing them.`, diff: `hard` },
      { q: `Drivers can see open requests and pick one. Five drivers tap Accept on the same ride at once: what happens?`, a: `Each tap calls Ride.claim, which is synchronized on the ride. The first thread in finds the ride REQUESTED, claims the driver by compare-and-set and moves the ride to ACCEPTED; the other four find it no longer REQUESTED and get "no longer available", which the app shows as "taken". The driver CAS covers the other side: a driver who taps two rides at the same moment can win only one. Only one lock is ever held, so there is no deadlock.`, diff: `medium` },
      { q: `How do you show the rider the driver's live location?`, a: `Drivers already ping every few seconds for matching. A RideTracker keeps a concurrent map from driver id to the ride they are driving, filled on accept and cleared on complete or cancel. Each ping does one lookup; if the driver is on a ride, it computes an ETA to the pickup (or to the drop once the trip has started) and pushes an update to the rider. Updates are throttled per ride with a compare-and-set on the last-sent time, so the hot path takes no lock and only one of two simultaneous pings is forwarded.`, diff: `medium` },
      { q: `Should RideService be a Singleton?`, a: `Many solutions make it one, but I wouldn't. A Singleton hides a global dependency, makes tests share state, and stops a test from building a service with fake strategies and a fake clock. One instance created at startup and passed to the controllers gives the same "only one" guarantee. If a global accessor is really required, a lock-based lazy singleton keeps creation thread-safe, and the service's own state is already thread-safe.`, diff: `easy` }
    ],
    cheatsheet: [
      { title: `Ride sharing in one screen`, type: `code`, lang: `java`, body: `interface PricingStrategy  { FareBreakdown price(RideType t, TripMetrics trip, double surge); }
interface MatchingStrategy { List<Candidate> rank(List<Candidate> candidates); }

final class Driver {
    AtomicReference<DriverStatus> status;   // AVAILABLE -> OFFERED only by compareAndSet
    volatile Location location;             // pings never lock
}
final class Ride {                          // every method synchronized
    RideStatus status; Driver driver; Deque<Candidate> candidates;
    RideEvent offerNext();                  // claim next free candidate, OFFERED
    RideEvent accept(String driverId, long now);
    boolean withdrawOffer(String driverId); // decline or timeout; false if stale
}
enum RideStatus { ...; boolean canMoveTo(RideStatus next); }   // explicit table` },
      { title: `Claiming a driver: options`, type: `table`, headers: [`Option`, `Pros`, `Cons`], rows: [
        [`CAS on driver status (chosen)`, `Non-blocking, one line, no deadlock`, `Only guards one field`],
        [`Lock per driver`, `Can guard several driver fields together`, `Must never be nested with the ride's lock in the opposite order`],
        [`One global dispatch lock`, `Trivially correct`, `Every request in the city serialises`],
        [`Broadcast, first accept wins`, `Fast acceptance`, `Still needs an atomic claim; drivers see offers vanish`]
      ] },
      { title: `Edge cases`, type: `list`, items: [`Retried request with the same request id`, `Driver accepts as the offer times out`, `Rider cancels while an offer is pending (release the driver)`, `No candidates, or all candidates taken: cancel with NO_DRIVER`, `Complete or rate called twice`, `Cancel after the trip has started: rejected`, `Driver goes offline while offered: the CAS fails, so they must finish or decline first`] }
    ],
    labs: []
  },

  // ====================================================================== Circuit Breaker
  {
    id: `circuit-breaker`, part: 2, number: 0, difficulty: `medium`,
    title: `Circuit Breaker: fail fast when a dependency is down, with atomic state changes`,
    overview: `Design the in-process library that wraps every call to a remote dependency, in the spirit of Resilience4j or Hystrix. While the dependency is healthy, calls pass through and their outcomes are recorded; when too many recent calls fail or run slow, the breaker <strong>opens</strong> and rejects calls immediately; after a wait it lets a few <strong>trial calls</strong> through and closes again only if they succeed. The state machine is small. What the interviewer is really testing is <strong>concurrency</strong>: hundreds of threads share one breaker, so every state change must happen exactly once, half-open must admit exactly the configured number of trials, and the hot path must not queue behind a global lock.`,
    problem: [
      { id: `requirements`, title: `What we are building`, kicker: `Requirements`, blocks: [
        { type: `problem`, html: `<p>A service calls a payments API, a pricing API and an inventory API. When one of them is down or very slow, every request thread that calls it waits for a timeout, the thread pool fills up, and the healthy parts of the service stop responding too. Build the component that notices a sick dependency and stops sending it traffic for a while, so callers fail in microseconds instead of seconds and the dependency gets room to recover.</p>` },
        { type: `code`, lang: `text`, title: `Final requirements`, code: `Functional
  1. Wrap a call: execute(call) runs it, or rejects it immediately with
     CallNotPermittedException; executeWithFallback(call, fallback) returns
     a fallback value instead.
  2. Three states: CLOSED (calls pass, outcomes recorded), OPEN (calls are
     rejected until a wait elapses), HALF_OPEN (a fixed number of trial calls;
     all succeed: CLOSED, any fails: OPEN again).
  3. Trip from CLOSED to OPEN when the failure rate or the slow-call rate over
     the last N calls reaches a threshold, once at least M calls are recorded.
  4. A per-breaker predicate decides which exceptions count as failures
     (a 404 or a validation error must not trip it).
  5. Async callers can ask for a permit, make the call themselves and report
     success or error with the elapsed time.
  6. One breaker per dependency, created on first use, each with its own
     configuration (or the defaults); listeners hear every state change.

Non-functional
  - Thread-safe under heavy concurrency; no global lock on the CLOSED path.
  - Every state change happens exactly once; HALF_OPEN admits exactly the
    configured number of trial calls.
  - Deterministic tests: time comes from an injected Clock.

Out of scope
  - Sharing breaker state across processes, dynamic reconfiguration,
    a metrics dashboard.` }
      ] },
      { id: `clarifying`, title: `Questions that change the design`, kicker: `Clarifying`, blocks: [
        { type: `table`, headers: [`Ask`, `Assume`, `Decides`], rows: [
          [`Library or a proxy service?`, `In-process library`, `Plain classes; no network in the design`],
          [`Trip on consecutive failures or on a rate?`, `Rate over a sliding window of the last N calls`, `A ring buffer of outcomes plus running totals`],
          [`Should a few failures at startup trip it?`, `No: require a minimum number of calls first`, `A <code>minimumCalls</code> setting`],
          [`Do slow successes matter?`, `Yes: above a threshold they count as slow`, `A slow-call rate alongside the failure rate`],
          [`Does every exception count?`, `No: a predicate chooses`, `<code>Predicate&lt;Throwable&gt;</code> in the config`],
          [`Sync or async callers?`, `Both`, `<code>execute</code> plus <code>tryAcquirePermission / onSuccess / onError</code>`],
          [`How many threads per breaker?`, `Hundreds`, `Lock-free state reads; CAS for transitions`],
          [`One breaker or many?`, `One per dependency, configured separately`, `A registry keyed by name`]
        ] },
        { type: `callout`, tone: `insight`, html: `<p>The breaker does not make calls faster or more likely to succeed. Its job is to stop wasting threads, sockets and the dependency's capacity on calls that are almost certainly going to fail, and to find out cheaply when the dependency is back.</p>` }
      ] },
      { id: `states`, title: `The state machine`, kicker: `Background`, blocks: [
        { type: `diagram`, title: `Three states, four transitions`, caption: `CLOSED trips to OPEN when the failure or slow-call rate crosses its threshold. OPEN moves to HALF_OPEN on the first call after the wait. HALF_OPEN closes when every trial call succeeds and reopens on the first failure.`, svg: `<svg viewBox="0 0 640 290" role="img" aria-label="Circuit breaker states CLOSED, OPEN and HALF_OPEN with the transitions between them">
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
</svg>` },
        { type: `table`, headers: [`State`, `A call arrives`, `An outcome is reported`], rows: [
          [`CLOSED`, `Always permitted`, `Recorded in the window; may trip to OPEN`],
          [`OPEN`, `Rejected until the wait elapses; the first call after it moves the breaker to HALF_OPEN`, `Never happens: no permits are issued`],
          [`HALF_OPEN`, `Permitted only while trial permits remain`, `Failure or slow: OPEN. The last needed success: CLOSED`]
        ] }
      ] }
    ],
    solution: [
      { id: `design`, title: `Design`, kicker: `Entities and API`, blocks: [
        { type: `table`, headers: [`Type`, `Role`], rows: [
          [`CircuitBreakerConfig`, `Immutable record of thresholds, window size, waits and the failure predicate; a builder with defaults`],
          [`CountWindow`, `The last N outcomes in a ring buffer with running totals; returns a <code>Snapshot</code>`],
          [`BreakerState`, `Sealed interface; <code>Closed</code>, <code>Open</code>, <code>HalfOpen</code> records each carry that state's data`],
          [`CircuitBreaker`, `Holds the current state in an <code>AtomicReference</code>; admits calls, records outcomes, performs transitions`],
          [`Permit`, `Proof a call was admitted, remembering the state that admitted it`],
          [`StateListener`, `Observer interface for transitions (metrics, logs, alerts)`],
          [`CircuitBreakerRegistry`, `One breaker per dependency name, built from per-dependency config or the defaults`]
        ] },
        { type: `keypoints`, items: [
          `<strong>One reference holds the whole state.</strong> The current state and its data (the window, the reopen time, the trial counters) live in one immutable object, so a single <code>compareAndSet</code> changes them together.`,
          `<strong>Outcomes belong to the state that admitted the call.</strong> A call that started in CLOSED and finishes after the breaker opened records into the old window, which is already discarded, so it can't trigger a second transition.`,
          `<strong>The CLOSED path takes no breaker-wide lock.</strong> Admitting a call is one volatile read; recording takes the window's short lock for a few array writes.`
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
void onError(Permit permit, Duration elapsed, Throwable error);` }
      ] },
      { id: `config-and-window`, title: `Configuration and the sliding window`, kicker: `Implementation`, blocks: [
        { type: `text`, html: `<p>Configuration is a record: immutable, so one instance can be shared by every thread and every breaker that uses the defaults. A record with eight positional parameters is unreadable at the call site, so a small builder supplies defaults and names. The compact constructor rejects nonsense once, at startup.</p>` },
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
        { type: `callout`, tone: `insight`, html: `<p>Why <code>synchronized</code> is safe and cheap here: the arrays and totals must change together (the slot, the running counts and the cursor), so one lock per window makes each update atomic and the returned snapshot consistent. The critical section is a handful of array writes with no I/O, so even contended it is held for nanoseconds, and each dependency has its own window, so breakers never block each other. Rates use integer arithmetic, so there is no floating-point rounding at the threshold.</p>` }
      ] },
      { id: `breaker`, title: `States and the breaker`, kicker: `Implementation`, blocks: [
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
        } catch (RuntimeException e) {
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
        if (!state.compareAndSet(from, to)) return;
        for (StateListener l : listeners) {
            try { l.onTransition(name, from.kind(), to.kind()); }
            catch (RuntimeException e) { /* a broken listener must not break calls */ }
        }
    }
}` },
        { type: `callout`, tone: `insight`, title: `Why every piece of shared state is safe`, html: `<ul><li><strong>The current state</strong> is one <code>AtomicReference</code>. Reads are volatile, and every transition is <code>compareAndSet(from, to)</code> against the object the decision was based on, so of all the threads that see the same trip condition exactly one wins and the rest do nothing.</li><li><strong>The window</strong> is guarded by its own lock (see above), and each <code>Closed</code> object gets a fresh one, so there is never a reset racing with a record.</li><li><strong>Half-open counters</strong> are <code>AtomicInteger</code>s: <code>getAndUpdate</code> takes a permit in one step and <code>incrementAndGet</code> makes exactly one thread see the final success.</li><li><strong>Listeners</strong> sit in a <code>CopyOnWriteArrayList</code>: adding one never disturbs a thread that is iterating, and they are called outside any lock.</li><li><strong>Config and name</strong> are final and immutable.</li></ul>` },
        { type: `compare`, title: `State pattern, enum + switch, or sealed records?`, items: [
          { title: `Classic State pattern`, tone: `warn`, html: `<p>One class per state with <code>onSuccess</code>, <code>onError</code>, <code>tryAcquire</code>, each calling <code>context.transitionTo(...)</code>. It shines when states have lots of distinct behaviour. Here each state's behaviour is two or three lines, and spreading the CAS logic across three classes makes "exactly one transition" harder to see and review.</p>` },
          { title: `Enum + switch with separate fields`, tone: `bad`, html: `<p>A <code>volatile State</code> plus <code>openedAt</code>, a window and a trial counter as separate fields. Short, but a transition must update several fields, and no single volatile write or CAS covers them all: readers can see OPEN with a stale reopen time, and two threads can both reset the trial counter.</p>` },
          { title: `Sealed records + switch (chosen)`, tone: `ok`, html: `<p>Each state is an immutable record carrying only its own data, which is what the State pattern is good at, while the behaviour stays in one class where the transitions are easy to audit. One <code>AtomicReference</code> swaps state and data together, and the compiler checks that every switch handles all three states.</p>` }
        ] }
      ] },
      { id: `registry`, title: `Registry, listeners and async callers`, kicker: `Implementation`, blocks: [
        { type: `text`, html: `<p>Each dependency gets its own breaker, because a dead pricing API says nothing about payments. The registry creates breakers lazily by name; listeners are the Observer pattern, used because metrics, logging and alerting all want to react to transitions without the breaker knowing about any of them.</p>` },
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
        { type: `text`, html: `<p><code>computeIfAbsent</code> on a <code>ConcurrentHashMap</code> runs the factory at most once per key, so two threads asking for "payments" at the same moment get the same breaker (two breakers would each see half the failures and trip late). The config map and listener list are copied into immutable collections, so reading them from any thread is safe.</p>` },
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
        { type: `callout`, tone: `warning`, html: `<p>An async caller that takes a permit must always report back. In HALF_OPEN a permit that is never returned is a trial slot lost forever, and the breaker can sit in HALF_OPEN with no permits left. Report in <code>whenComplete</code> (which runs on success and failure), and put a timeout on the future so it always completes.</p>` }
      ] },
      { id: `walkthrough`, title: `Walking through it`, kicker: `Check it works`, blocks: [
        { type: `steps`, items: [
          `Payments is configured with a window of 20, minimum 10 calls, 50% failure rate, 30 s wait and 3 trial calls. The first 9 calls include 6 timeouts: 67% failed, but fewer than 10 calls, so it stays CLOSED.`,
          `The 10th call fails too: 7 of 10 failed. The recording thread sees the threshold crossed and does <code>compareAndSet(closed, open)</code>. Another thread finishing a failed call at the same moment computes the same answer, but its CAS finds the state is no longer that <code>Closed</code> object and does nothing. Listeners hear CLOSED &rarr; OPEN once.`,
          `For the next 30 seconds every <code>execute</code> reads OPEN, sees the wait hasn't elapsed and throws <code>CallNotPermittedException</code> in microseconds; <code>executeWithFallback</code> returns the cached value instead.`,
          `At 30 s, 50 threads arrive together. All read the same <code>Open</code> object; one CAS installs a <code>HalfOpen</code> with 3 permits. All 50 loop, read HALF_OPEN and race for permits: exactly 3 get one, 47 are rejected.`,
          `The 3 trial calls succeed; the thread whose <code>incrementAndGet</code> returns 3 swaps in a fresh <code>Closed</code> with an empty window. Had any trial failed, its thread would have swapped in a new <code>Open</code> with a new 30 s wait.`,
          `A slow call admitted back in the first CLOSED period finishes now and reports a failure. It records into the old, discarded window and its CAS (if any) fails: stale outcomes can't flip the breaker.`
        ] }
      ] }
    ],
    levels: levels(
      [`The three states and their transitions, with a wait before trying again.`, `A consecutive-failure or failure-rate trip condition and a working <code>execute</code> that fails fast when open.`, `Awareness that many threads call the breaker, even if the first version uses a lock.`],
      [`A sliding window with a minimum number of calls, slow calls counted, and a predicate for which exceptions count.`, `Atomic transitions (one immutable state object in an <code>AtomicReference</code>, CAS) and exactly N half-open trial permits, with the races explained.`, `An injected Clock and tests for each transition; a registry with per-dependency config and transition listeners.`, `Where retries and timeouts sit relative to the breaker.`],
      [`Time-based windows with striped or lock-free counters for very hot breakers, and the accuracy trade-off.`, `Interaction with retries, timeouts, bulkheads and load shedding as one resilience policy, and the risk of synchronized recovery across many instances.`, `Operability: metrics, manual force-open, dynamic config, and how to tune thresholds from real latency and error data.`]
    ),
    concepts: [
      { term: `CLOSED, OPEN, HALF_OPEN`, def: `Pass and record; reject until a wait elapses; allow a few trial calls to decide.`, why: `The whole library is this state machine plus the rules for moving between states.` },
      { term: `Fail fast and fallback`, def: `When OPEN, reject in microseconds with <code>CallNotPermittedException</code> or return a fallback value.`, why: `Frees threads that would otherwise wait on timeouts, and gives the dependency room to recover.` },
      { term: `Sliding window`, def: `The last N outcomes (a count-based ring buffer) or the last N seconds (time-based buckets), with running totals.`, why: `Rates over recent calls react to real outages and forget old ones; O(1) per update.` },
      { term: `Minimum number of calls`, def: `The rates are ignored until the window holds at least M outcomes.`, why: `Two failures out of two calls at startup is 100%, but it isn't evidence of an outage.` },
      { term: `Slow-call threshold`, def: `A call that succeeds but takes longer than the threshold counts as slow; a slow-call rate can trip the breaker too.`, why: `A dependency that answers in 9 seconds is as harmful as one that errors.` },
      { term: `Failure predicate`, def: `A <code>Predicate&lt;Throwable&gt;</code> deciding which exceptions are failures.`, why: `Timeouts and 5xx mean the dependency is unhealthy; a 404 or validation error means it answered correctly.` },
      { term: `Immutable state + CAS`, def: `The state and its data live in one immutable object swapped with <code>compareAndSet(from, to)</code>.`, why: `Exactly one thread performs each transition, and no reader sees a half-updated state.` },
      { term: `Half-open trial permits`, def: `An <code>AtomicInteger</code> handed out with <code>getAndUpdate</code>, never below zero.`, why: `Exactly N probes reach a recovering dependency instead of a thundering herd.` },
      { term: `Registry per dependency`, def: `A <code>ConcurrentHashMap</code> of breakers by name, created with <code>computeIfAbsent</code> from per-dependency config or defaults.`, why: `Failures are isolated per dependency, and there is exactly one breaker per name.` }
    ],
    interview: [
      { q: `Why do you need a circuit breaker if you already have timeouts and retries?`, a: `A timeout bounds how long one call waits, but when a dependency is down every call still waits the full timeout, so threads pile up and the caller goes down too. Retries make it worse by multiplying traffic to a struggling service. The breaker notices the failure rate and stops calling for a while, so callers fail in microseconds and the dependency gets a break; half-open probing then finds out cheaply when it is back.`, diff: `easy` },
      { q: `Count-based or time-based window, and why a minimum number of calls?`, a: `A count-based window (last N calls, a ring buffer) has fixed memory and a predictable sample size but covers a variable amount of time: at low traffic it may hold calls from an hour ago. A time-based window (last N seconds, one bucket per second) always reflects recent time but its sample size varies with traffic. Either way, a minimum number of calls stops a tiny sample, such as one failure out of one call, from tripping the breaker.`, diff: `medium` },
      { q: `Fifty threads hit the breaker the instant the open wait expires. How do you make sure only one moves it to HALF_OPEN, and only N trial calls get through?`, a: `The state is an immutable object in an AtomicReference. Every thread reads the same Open object and tries compareAndSet(open, new HalfOpen(n)); exactly one succeeds, the others fail and loop, now reading the HalfOpen object. Permits are an AtomicInteger taken with <code>getAndUpdate(n -&gt; n &gt; 0 ? n - 1 : 0)</code>, a single atomic step, so exactly N callers see a positive value. A check-then-decrement would let many through, and an enum plus separate fields would let several threads each reset the counter.`, diff: `hard` },
      { q: `Which errors should count as failures?`, a: `Ones that say the dependency is unhealthy: timeouts, connection refused or reset, 5xx and usually 429. Not client errors such as 404, 400 or business-rule rejections: the dependency answered correctly, and counting them would let one user's bad input open the breaker for everyone. Make it a per-dependency predicate, and treat non-failures as successes, because the call did get an answer. Successful but slow calls count separately through the slow-call threshold.`, diff: `medium` },
      { q: `Should retries happen inside or outside the breaker?`, a: `Usually outside: retry wraps breaker wraps timeout wraps the call. Every attempt is then recorded, so the breaker sees the real failure rate and trips quickly, and once it is open the retry must treat CallNotPermittedException as non-retryable so it fails fast instead of looping. Retry inside means the breaker sees one outcome per logical call, which hides transient blips but trips later and lets one caller hold a half-open permit through several attempts. Timeouts always go innermost: without them a hung call never reports and never counts.`, diff: `medium` },
      { q: `State pattern or enum and switch?`, a: `The behaviour per state is tiny, and correctness hinges on atomic transitions, so I keep the logic in one class and model each state as an immutable record (sealed interface) that carries only its own data: the window for Closed, the reopen time for Open, the permit counters for HalfOpen. That gives the per-state data the State pattern offers, a single AtomicReference to swap, and an exhaustive switch the compiler checks. A plain enum with separate mutable fields can't be updated atomically.`, diff: `medium` },
      { q: `How do you test it deterministically?`, a: `Inject a java.time.Clock and use a test clock you can advance, so the open wait elapses instantly and slow calls are simulated by advancing the clock inside the call. Test each transition: below minimum calls stays closed, the threshold trips it, open rejects, the wait leads to half-open, all trials succeeding closes, one failing reopens. For concurrency, release many threads at once with a latch and assert exactly N permits and exactly one OPEN to HALF_OPEN transition, repeated many times.`, diff: `easy` }
    ],
    cheatsheet: [
      { title: `Circuit breaker in one screen`, type: `code`, lang: `java`, body: `record CircuitBreakerConfig(int failureRatePercent, int slowRatePercent, int windowSize, int minimumCalls,
        Duration slowCallThreshold, Duration openWait, int halfOpenPermits, Predicate<Throwable> recordAsFailure) {}
sealed interface BreakerState permits Closed, Open, HalfOpen {}
record Closed(CountWindow window) implements BreakerState {}       // synchronized ring buffer of the last N outcomes
record Open(Instant until) implements BreakerState {}
record HalfOpen(AtomicInteger permitsLeft, AtomicInteger successes) implements BreakerState {}

final class CircuitBreaker {
    AtomicReference<BreakerState> state;            // every transition is compareAndSet(from, to)
    <T> T execute(Supplier<T> call);                // permit? run, time it, record, maybe trip
    <T> T executeWithFallback(Supplier<T> call, Function<RuntimeException, T> fallback);
    Optional<Permit> tryAcquirePermission();
    void onSuccess(Permit p, Duration elapsed);
    void onError(Permit p, Duration elapsed, Throwable error);
}
final class CircuitBreakerRegistry { ConcurrentHashMap<String, CircuitBreaker> breakers; CircuitBreaker forDependency(String name); }` },
      { title: `State transitions`, type: `table`, headers: [`From`, `Event`, `To`, `Performed by`], rows: [
        [`CLOSED`, `Failure or slow rate at threshold, with at least minimumCalls recorded`, `OPEN`, `The thread whose outcome crossed it (CAS)`],
        [`OPEN`, `A call before openWait has elapsed`, `OPEN`, `Rejected: CallNotPermittedException or fallback`],
        [`OPEN`, `The first call after openWait`, `HALF_OPEN`, `The one caller whose CAS wins`],
        [`HALF_OPEN`, `A trial call fails or is slow`, `OPEN`, `That call's thread (CAS); a new wait starts`],
        [`HALF_OPEN`, `The last of the N trial calls succeeds`, `CLOSED`, `The thread that counts the Nth success; fresh window`]
      ] },
      { title: `Config and edge cases`, type: `list`, items: [
        `minimumCalls between 1 and windowSize; percentages 1-100; at least one half-open permit`,
        `Business errors (404, validation) count as successes; only the predicate's errors are failures`,
        `Slow successes count toward the slow-call rate; without timeouts a hung call never reports`,
        `Outcomes are recorded against the state that admitted the call; stale ones can't cause transitions`,
        `Async callers must always report a permit's outcome, or HALF_OPEN can run out of permits`,
        `Retries must not retry CallNotPermittedException`,
        `Listener exceptions are swallowed; listeners run outside any lock`
      ] }
    ],
    labs: []
  }
);

// Order every problem by difficulty (easy, medium, hard) and number them in that order.
const ORDER = [
  `connect-four`, `tic-tac-toe`, `snake-and-ladders`, `vending-machine`, `parking-lot`,
  `lru-cache`, `file-system`, `atm`, `splitwise`, `circuit-breaker`, `logging-service`,
  `meeting-scheduler`, `movie-ticket-booking`, `pub-sub`,
  `rate-limiter`, `elevator`, `ride-sharing`, `inventory-management`
];
const rank = (/** @type {string} */ id) => { const i = ORDER.indexOf(id); return i < 0 ? ORDER.length : i; };
window.DATA.chapters.sort((a, b) => rank(a.id) - rank(b.id));
window.DATA.chapters.forEach((ch, i) => { ch.number = i + 1; });
})();
