// LLD problem breakdown: Tic-Tac-Toe. Format: Chapter in public/shared/notes.d.ts; shared helpers in data-part2.js.
// Imports are omitted in the code.
(function () {
const { levels, PRACTICE_TIP } = LLD_PROBLEMS_KIT;

window.DATA.chapters.push({
    id: `tic-tac-toe`, part: 1, number: 0, difficulty: `easy`,
    title: `Tic-Tac-Toe: an N x N board, O(1) win counters and a lock per game`,
    references: [{ title: `awesome-low-level-design: Tic Tac Toe`, url: `https://github.com/ashishps1/awesome-low-level-design/blob/main/problems/tic-tac-toe.md` }],
    overview: `Two players, X and O, take turns marking cells on an N x N grid (3 x 3 by default); the first to fill a whole row, column or diagonal wins, and a full grid with no line is a draw. It is the classic warm-up, so the bar is a tidy model rather than clever features. This page works the problem in interview order: clarify the requirements, find the entities, design the classes top down, implement the board, the win check and the move, verify with a move-by-move trace, then handle follow-ups. The design lands on a <strong>Board</strong> that only knows cells, a <strong>Game</strong> that owns turns and the outcome behind its own lock, one <strong>GameState</strong> enum instead of state classes, validation before any mutation, and the idea interviewers wait for: an <strong>O(1) win check</strong> from per-line counters instead of scanning the grid after every move.`,
    problem: [
      { id: `understanding`, title: `What a Tic-Tac-Toe engine does`, kicker: `The problem`, blocks: [
        { type: `problem`, html: `<p>Two players share a square grid. They take turns writing their symbol, X or O, in an empty cell. Whoever first fills a complete row, column or diagonal with their own symbol wins; if the grid fills up with no complete line, the game is a draw. The engine has to accept moves, refuse illegal ones, and say at any moment whose turn it is and how the game stands.</p>` },
        { type: `text`, html: `<p>The prompt is usually one line: <em>"Design Tic-Tac-Toe."</em> Everyone knows the game, which is exactly the trap: the size of the board, what counts as a win, what happens with a bad move and whether more than one thread is involved are all unstated. Spend the first few minutes turning the one-liner into a spec, because two of those answers decide the central algorithm.</p>` }
      ] },
      { id: `clarifying`, title: `Clarifying questions`, kicker: `Step 1: requirements`, blocks: [
        { type: `text`, html: `<p>Work through four kinds of question: <strong>what actions the system supports</strong>, <strong>what happens with bad input</strong>, <strong>what is deliberately out of scope</strong>, and <strong>what might be added later</strong>. For a problem this small, two minutes is plenty; the goal is to know which branches you are not designing for.</p>` },
        { type: `table`, headers: [`You ask`, `A typical answer`, `What it decides`], rows: [
          [`Always 3 x 3, or any N x N?`, `N x N, 3 by default`, `The board and the win check take <code>n</code> as a parameter; no literal 3 anywhere`],
          [`Does a win need the whole line, or K in a row?`, `The whole row, column or diagonal`, `Per-line counters give an O(1) check; K in a row is a follow-up`],
          [`Who moves first? Can both players pick the same symbol?`, `X moves first; the two symbols must differ`, `Constructor order fixes the first player; the constructor rejects equal symbols`],
          [`What happens on an invalid move: off the board, cell taken, out of turn, after the end?`, `Reject it with a reason and change nothing`, `Validate before mutating; <code>play</code> throws with a message`],
          [`Two humans, or a computer opponent?`, `Two humans for now`, `Moves come from outside the engine; a bot becomes another move source later`],
          [`Do we draw the board, keep score across games or save games?`, `No; just expose what a UI would need`, `A read API (<code>cell</code>, <code>state</code>, <code>winner</code>); a scoreboard is a follow-up`],
          [`Can moves for one game arrive on different threads?`, `Yes: each player's request may be handled on its own thread`, `Each game guards its state with its own lock; no global object and no Singleton`]
        ] },
        { type: `callout`, tone: `insight`, title: `Full line or K in a row?`, html: `<p>The one answer that changes the algorithm is what counts as a win. If a win means a whole line of N, every row, column and diagonal can be tracked by a single counter and a move is checked in constant time. If it means K adjacent marks on a bigger board, a sum cannot see gaps and you need a run check outward from the last move. Ask it out loud, and even when the answer is "3 x 3, full line", write <code>n</code> rather than 3: the "now make it N x N" follow-up then costs nothing.</p>` }
      ] },
      { id: `final-requirements`, title: `Final requirements`, kicker: `Step 1: requirements`, blocks: [
        { type: `code`, lang: `text`, title: `Final requirements`, code: `Requirements
  1. Two players, X and O, alternate placing their symbol on an N x N board
     (N >= 3, default 3). X moves first.
  2. A move names a player, a row and a column; the cell must exist and be empty.
  3. Filling an entire row, column or either main diagonal with one symbol wins.
  4. A full board with no winning line is a draw. A move that fills the last
     cell and completes a line is a win, not a draw.
  5. Invalid moves are rejected with a reason and change nothing: off the
     board, cell taken, out of turn, or after the game has ended.
  6. Callers can read whose turn it is, the state (in progress, won, draw),
     the winner, and the symbol in any cell.
  7. Moves for one game may arrive on more than one thread; the game must stay
     consistent under concurrent calls.

Out of scope
  - K in a row on a larger board, a computer opponent, undo
  - A server hosting many games, a scoreboard across games
  - Rendering, input parsing and persistence` },
        { type: `callout`, tone: `tip`, html: PRACTICE_TIP }
      ] }
    ],
    solution: [
      { id: `entities`, title: `Core entities`, kicker: `Step 2: entities`, blocks: [
        { type: `text`, html: `<p>Scan the requirements for nouns that hold state or enforce a rule: board, cell, player, symbol, move, game, and the act of winning. Test each one before it becomes a class; in a small problem the risk is too many classes, not too few.</p>` },
        { type: `table`, headers: [`Candidate`, `Verdict`, `Why`], rows: [
          [`Board`, `A class`, `Holds the grid and how many cells are filled; enforces "inside the grid" and "cell is empty"`],
          [`Cell`, `A coordinate record, not an object in the grid`, `A cell object that wraps one symbol has no behaviour; a <code>Symbol[][]</code> with <code>null</code> for empty is enough. A <code>(row, col)</code> record is still handy for move sources and bots`],
          [`Player`, `A record`, `A name and a symbol, never changed after creation; no rules of its own`],
          [`Symbol`, `An enum`, `Exactly two values, X and O`],
          [`Move`, `Not yet`, `Nothing needs a history in the core requirements; it becomes a record when undo arrives`],
          [`Game`, `A class`, `Owns whose turn it is and the outcome; validates every move; the natural unit of locking`],
          [`Win checking`, `Its own small class`, `Keeps per-line counters; separating it means a new win rule touches one class`],
          [`A system or manager of games`, `Not now, and never a Singleton`, `The requirements describe one game. A registry of many games is a follow-up, created once at startup and passed to whoever needs it`]
        ] },
        { type: `table`, title: `The entities we keep`, headers: [`Entity`, `Responsibility`], rows: [
          [`Game`, `The entry point. Knows the two players, whose turn it is, the state and the winner. Validates and applies each move under its own lock. Knows nothing about how a line is detected.`],
          [`Board`, `The N x N grid of symbols and the count of filled cells. Rejects off-board and taken cells. Knows nothing about turns or winning.`],
          [`WinTracker`, `One counter per row and per column plus two diagonal counters. Says in O(1) whether the move just placed completed a line.`],
          [`Player`, `A record: name and symbol.`],
          [`Symbol, GameState`, `Enums: X or O; IN_PROGRESS, WON or DRAW.`],
          [`Cell`, `A record: a (row, col) coordinate, used by whatever produces moves.`]
        ] },
        { type: `callout`, tone: `tip`, html: `<p>Say out loud why a noun is not a class: "Cell would just wrap a symbol, so the grid stores symbols directly." Interviewers score the reasoning, and it stops you building a five-class hierarchy for a nine-square game.</p>` }
      ] },
      { id: `game-design`, title: `Class design: Game`, kicker: `Step 3: class design, top down`, blocks: [
        { type: `text`, html: `<p>Start from the class callers talk to, and derive its state and methods from the requirements. For each requirement ask: what must <code>Game</code> remember, and what must it let callers do?</p>` },
        { type: `table`, headers: [`Requirement`, `What Game remembers`], rows: [
          [`"Two players alternate; X moves first"`, `Both players, and the current one`],
          [`"A row, column or diagonal wins; a full board draws"`, `The state, and the winner once there is one`],
          [`"An N x N board"`, `Its own <code>Board</code> and <code>WinTracker</code>, created in the constructor and never handed out`],
          [`"Concurrent calls stay consistent"`, `Nothing extra: its own monitor is the lock`]
        ] },
        { type: `table`, headers: [`Need`, `Method`], rows: [
          [`Make a move`, `<code>void play(Player player, int row, int col)</code>, throwing on an invalid move`],
          [`Know how the game stands`, `<code>GameState state()</code>, <code>Optional&lt;Player&gt; winner()</code>`],
          [`Know whose turn it is`, `<code>Player currentPlayer()</code>`],
          [`Draw the board`, `<code>Symbol cell(int row, int col)</code>, <code>int size()</code>`]
        ] },
        { type: `keypoints`, items: [
          `<strong>The caller names the player.</strong> <code>play(player, row, col)</code> rather than <code>play(row, col)</code> lets the game reject a move made out of turn. Without it, a double-sent request from one player would silently play for the other.`,
          `<strong>Throw, or return a result?</strong> Throwing with a reason keeps the happy path short and makes it impossible to ignore a rejected move. Returning a small result type is equally good if the interviewer prefers no exceptions for expected input; say which you chose and why.`,
          `<strong>No system Singleton around the game.</strong> A global holder with one <code>game</code> field allows only one game at a time and makes tests share state. Create a <code>Game</code> per match; if many games are needed later, a registry is created once at startup and injected.`
        ] },
        { type: `text`, html: `<p>The one real decision inside <code>Game</code> is how to represent "in progress, won or drawn", because every method consults it.</p>` },
        { type: `compare`, items: [
          { title: `Weak: two booleans`, tone: `bad`, html: `<p><code>isOver</code> and <code>isDraw</code>. Easy to write, but four combinations exist and only three are legal: "not over but drawn" can be represented, and one missed assignment produces it.</p>` },
          { title: `Good: a State object per status`, tone: `warn`, html: `<p><code>InProgressState</code>, <code>WinnerState</code> and <code>DrawState</code> behind a <code>handleMove</code> interface, as some reference solutions do. Illegal combinations disappear. But the two finished states do the same thing (reject the move), so three classes and a setter on <code>Game</code> buy one <code>if</code>.</p>` },
          { title: `Strong: one enum and a guard`, tone: `ok`, html: `<p><code>GameState { IN_PROGRESS, WON, DRAW }</code> in a single field, plus the winner stored separately. The first line of <code>play</code> rejects anything but IN_PROGRESS. Same safety as the State objects, a fraction of the code.</p>` }
        ] },
        { type: `text`, html: `<p>We take the enum. The State pattern earns its place when states really behave differently (the elevator's directions each move the car their own way); here only one state accepts moves at all. If the game later gains states with real behaviour, such as "waiting for an opponent" or "paused" in an online lobby, that is the moment to switch.</p>` },
        { type: `code`, lang: `java`, title: `Symbol, Player and GameState`, code: `enum Symbol { X, O }

enum GameState { IN_PROGRESS, WON, DRAW }

record Player(String name, Symbol symbol) {}   // immutable; equality covers name and symbol

record Cell(int row, int col) {}               // a coordinate, for move sources and bots` }
      ] },
      { id: `board-design`, title: `Class design: Board and the win check`, kicker: `Step 3: class design`, blocks: [
        { type: `table`, headers: [`Requirement`, `What Board remembers`], rows: [
          [`"An N x N board, N >= 3"`, `<code>n</code>, and a <code>Symbol[n][n]</code> grid where <code>null</code> means empty`],
          [`"A full board with no line is a draw"`, `How many cells are filled, so "full?" is one comparison`],
          [`"The cell must exist and be empty"`, `Nothing extra; <code>place</code> checks both before writing`]
        ] },
        { type: `table`, headers: [`Need`, `Method on Board`], rows: [
          [`Put a symbol in a cell`, `<code>void place(int row, int col, Symbol s)</code>, throwing if off the board or taken`],
          [`Check a coordinate`, `<code>boolean inside(int row, int col)</code>`],
          [`Read a cell, the size, fullness`, `<code>Symbol cell(int row, int col)</code>, <code>int size()</code>, <code>boolean isFull()</code>`]
        ] },
        { type: `text`, html: `<p>Then the question that carries most of the interview: <strong>after a move, how do we know whether it won?</strong></p>` },
        { type: `compare`, items: [
          { title: `Good: scan every line on the board`, tone: `warn`, html: `<p>After each move, check all N rows, all N columns and both diagonals for a full line of the mover's symbol, often as three small strategy classes (rows, columns, diagonals). Correct and obvious, but it does O(N&sup2;) work per move and ignores the fact that only one cell changed.</p>` },
          { title: `Better: scan only the lines through the last move`, tone: `info`, html: `<p>A move can only complete a line that passes through the cell just marked: its row, its column, and a diagonal if the cell is on one. Checking those is O(N) with no extra state. A perfectly good first answer.</p>` },
          { title: `Great: per-line counters`, tone: `ok`, html: `<p>Keep one integer per row and per column plus two for the diagonals. X adds +1 to every line it touches, O adds -1. A line is complete exactly when its counter reaches +N or -N. Each move updates and reads at most four integers: O(1), whatever the board size.</p>` }
        ] },
        { type: `text`, html: `<p>We take the counters and give them their own class, <code>WinTracker</code>, with one method: <code>boolean record(int row, int col, Symbol s)</code>, called right after a successful <code>place</code>. Board answers "where are the symbols"; WinTracker answers "did that move finish a line". Keeping them apart means the K-in-a-row follow-up replaces one class, and nothing else.</p>` },
        { type: `keypoints`, items: [
          `<strong>Why a mixed line can never win.</strong> A line has N cells and each is counted once. One O in an otherwise-X line caps its sum at N - 2, so reaching +N or -N proves every cell holds the same symbol.`,
          `<strong>The price.</strong> 2N + 2 extra integers, and a second structure that must stay in step with the grid. Only <code>Game</code> calls both, inside one lock, so they can never drift apart.`,
          `<strong>No WinRule interface yet.</strong> With one win rule in the requirements, an interface would have one implementation and no caller that varies. It arrives with the second rule (Deep Dives).`
        ] }
      ] },
      { id: `class-diagram`, title: `Final class design`, kicker: `Step 3: class design`, blocks: [
        { type: `code`, lang: `java`, title: `Final class design`, code: `final class Game {                                     // the entry point; one lock per game
    private final Board board;                         // created here, never handed out
    private final WinTracker tracker;
    private final Player first, second;
    private Player current;
    private GameState state;                           // IN_PROGRESS, WON or DRAW
    private Player winner;                             // set only when state == WON

    Game(Player first, Player second);                 // 3 x 3
    Game(Player first, Player second, int size);       // N x N
    synchronized void play(Player player, int row, int col);   // throws on an invalid move
    synchronized GameState state();
    synchronized Optional<Player> winner();
    synchronized Player currentPlayer();
    synchronized Symbol cell(int row, int col);        // null when empty, for a renderer
    int size();
}

final class Board {
    private final int n;
    private final Symbol[][] grid;                     // null means empty
    private int filled;

    void place(int row, int col, Symbol s);            // throws if off the board or taken
    boolean inside(int row, int col);
    Symbol cell(int row, int col);
    boolean isFull();
    int size();
}

final class WinTracker {
    private final int n;
    private final int[] rows, cols;                    // X adds +1, O adds -1
    private int diag, anti;                            // main diagonal and anti-diagonal

    boolean record(int row, int col, Symbol s);        // true if this move completed a line
}` },
        { type: `text`, html: `<p><code>Game</code> coordinates and never inspects lines; <code>Board</code> stores and never decides; <code>WinTracker</code> counts and never touches the grid. <code>Board</code> and <code>WinTracker</code> are not thread-safe on their own, and do not need to be: they are confined to their game, so the game's lock guards them too.</p>` }
      ] },
      { id: `board-impl`, title: `Implementation: the board and the win check`, kicker: `Step 4: implementation`, blocks: [
        { type: `text`, html: `<p>Check what the interviewer wants: working code, pseudocode or a walkthrough. For each method write the normal path first, then the edge cases. <code>place</code> writes a symbol and bumps the filled count; <code>record</code> adds the mover's delta to the lines through the cell and reads four counters.</p>` },
        { type: `list`, title: `Edge cases the code must handle`, items: [
          `A row or column that is negative or at least N: reject before touching the grid.`,
          `A cell that is already taken: reject, and leave the filled count alone.`,
          `A board size below 3: reject in the constructor.`,
          `The centre of an odd board lies on both diagonals: update both counters.`,
          `A diagonal counter can be checked on any move: it only reaches plus or minus N on the move that fills it, because the game stops at the first win.`
        ] },
        { type: `text`, html: `<p>Before coding the check, compare the three options on a concrete move: the last move of the trace in Step 5, X at the corner (2,2) of a 3 x 3 board, and the same check on a 15 x 15 board with full-line wins.</p>` },
        { type: `table`, headers: [`Check`, `Work for X at (2,2) on 3 x 3`, `Worst case on 15 x 15`, `Extra memory`, `Right for K in a row?`], rows: [
          [`Scan every line on the board`, `Up to 24 cell reads (8 lines of 3)`, `480 cell reads (32 lines of 15)`, `None`, `No: it checks full lines only`],
          [`Scan the lines through the last move`, `9 cell reads (row 2, column 2, main diagonal)`, `60 cell reads (a cell on both diagonals)`, `None`, `No: it checks full lines only`],
          [`Per-line counters`, `3 counter updates, 4 reads`, `At most 4 updates, 4 reads`, `2N + 2 integers`, `No: a sum cannot see gaps`]
        ] },
        { type: `text`, html: `<p>On a 3 x 3 board none of this matters for speed; what matters is showing you know that only the last move can create a win, and that counting removes even the short scan. In the interview, write the line scan first (it takes a minute), then offer the counters: "this is O(N); I can make it O(1) with one counter per line."</p>` },
        { type: `code`, lang: `java`, title: `Board`, code: `final class Board {
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
        { type: `code`, lang: `java`, title: `Win check: the lines through the last move`, code: `// On Board: the "better" option. O(n) per move and no extra state.
boolean completesLine(int row, int col) {
    Symbol s = grid[row][col];
    boolean r = true, c = true, d = row == col, a = row + col == n - 1;
    for (int i = 0; i < n; i++) {
        r &= grid[row][i] == s;
        c &= grid[i][col] == s;
        d &= grid[i][i] == s;
        a &= grid[i][n - 1 - i] == s;
    }
    return r || c || d || a;
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
}` }
      ] },
      { id: `game-impl`, title: `Implementation: playing a move`, kicker: `Step 4: implementation`, blocks: [
        { type: `text`, html: `<p><code>play</code> is the whole engine. The normal path: place the symbol, record it, and pass the turn. The order of the checks around it is where the marks are: every rejection must happen before anything is written, and the win must be tested before the draw.</p>` },
        { type: `list`, title: `Edge cases the code must handle`, items: [
          `A move after WON or DRAW: rejected first, before any other check.`,
          `A move by the player whose turn it is not: rejected, even if the cell is free.`,
          `Off the board or a taken cell: <code>Board.place</code> throws before writing, so the turn and counters are untouched.`,
          `A winning move that fills the last cell: reported as WON, because the win is checked before the board is tested for fullness.`,
          `Both players given the same symbol: rejected in the constructor.`,
          `Two requests for the same move arriving together: the lock lets one in; the other sees it is no longer that player's turn.`
        ] },
        { type: `code`, lang: `java`, title: `Game`, code: `/**
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
        { type: `callout`, tone: `warning`, html: `<p>Thread safety: <code>play</code> reads the state and the turn, then writes the grid, the counters and the turn. Without a lock, two threads could both pass the turn check and the same player would move twice, or a reader could see the cell written but the turn not yet passed. So <code>play</code> and every getter are synchronized on the game. The getters need it too: without a lock a reader thread has no happens-before edge with the writer and may see stale values. Each game has its own lock, so different games never contend. A private <code>final Object lock</code> instead of <code>this</code> stops outside code from grabbing the game's monitor; either is fine if you say why.</p>` },
        { type: `text`, html: `<p>The <a href="https://github.com/ashishps1/awesome-low-level-design/tree/main/solutions/java/src/tictactoe" target="_blank" rel="noopener">awesome-low-level-design tictactoe solution</a> shaped the split between <code>Board</code>, <code>Game</code> and <code>Player</code>, the "validate, place, check win, check draw, switch player" order, and the scan strategies and state classes weighed above. The code here is written independently and changes four things: the grid stores symbols instead of cell objects, counters replace the full-board scans, one enum replaces the state classes, and every move is serialized by a per-game lock (the original mutates the game with no synchronization). Its system Singleton and its Observer scoreboard are left out because no requirement needs them; the scoreboard returns as a thread-safe follow-up in the Deep Dives.</p>` },
        { type: `text`, html: `<p>Something has to drive the game. A small loop asks the current player's move source for a cell and lets <code>Game</code> accept or reject it.</p>` },
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
        { type: `callout`, tone: `insight`, html: `<p>The loop knows nothing about the rules. That is why a computer opponent later is just another <code>MoveSource</code>, and why a server can call <code>play</code> directly from request threads without the loop at all.</p>` }
      ] },
      { id: `verification`, title: `Verifying with a trace`, kicker: `Step 5: verification`, blocks: [
        { type: `text`, html: `<p>Walk one game through call by call before the interviewer does, including a few bad moves. Alice plays X and Bob plays O on a 3 x 3 board. The counters are shown after every accepted move; a rejected move leaves everything unchanged.</p>` },
        { type: `code`, lang: `text`, title: `Call by call`, code: ` #  call                 result                           rows       cols       diag anti
 1  Alice (X) at (0,1)   ok, Bob to move                  [1,0,0]    [0,1,0]     0    0
 2  Bob   (O) at (0,2)   ok, Alice to move                [0,0,0]    [0,1,-1]    0   -1
 3  Alice (X) at (1,2)   ok, Bob to move                  [0,1,0]    [0,1,0]     0   -1
 4  Bob   (O) at (1,0)   ok, Alice to move                [0,0,0]    [-1,1,0]    0   -1
 -  Bob   (O) at (2,2)   rejected: It is Alice's turn     unchanged
 -  Alice (X) at (1,0)   rejected: Cell (1, 0) is taken   unchanged
 5  Alice (X) at (0,0)   ok, Bob to move                  [1,0,0]    [0,1,0]     1   -1
 -  Bob   (O) at (3,1)   rejected: off the board          unchanged
 6  Bob   (O) at (2,0)   ok, Alice to move                [1,0,-1]   [-1,1,0]    1   -2   O threatens the anti-diagonal at (1,1)
 7  Alice (X) at (1,1)   ok, Bob to move                  [1,1,-1]   [-1,2,0]    2   -1   blocks; X threatens column 1 and the diagonal
 8  Bob   (O) at (2,1)   ok, Alice to move                [1,1,-2]   [-1,1,0]    2   -1   blocks column 1
 9  Alice (X) at (2,2)   WON: diag = 3, board now full    [1,1,-1]   [-1,1,1]    3   -1   win checked before draw
 -  Bob   (O) at (0,0)   rejected: The game is over       unchanged

Final board
  X X O
  O X X
  O O X` },
        { type: `keypoints`, items: [
          `Move 9 filled the last cell and completed the diagonal. Because <code>record</code> runs before <code>isFull</code>, the result is WON with Alice as winner, not DRAW.`,
          `Every rejection left the counters, the grid and the turn untouched: after Bob's out-of-turn try and Alice's taken-cell try it was still Alice's move. Bob's last call was rejected by the state check even though (0,0) is also taken, because the state is checked first.`,
          `Rows and columns that hold both symbols sit between the extremes (row 0 ends at +1 with X, X, O), which is the "a mixed line can never win" argument made visible.`,
          `If Alice's client had sent move 9 twice on two threads, the first request would take the lock and win; the second would then see "The game is over" and change nothing.`
        ] }
      ] }
    ],
    levels: levels(
      [`Clear <code>Board</code>, <code>Game</code> and <code>Player</code> responsibilities, and a turn loop that plays a whole game.`, `A correct win check, even a scan of the lines through the last move or of the whole board.`, `Bad moves (off the board, taken, wrong turn, game over) rejected without corrupting the game, with some prompting on the order of checks.`],
      [`The O(1) per-line counters unprompted or after a light hint, with the argument for why a mixed line can never reach plus or minus N.`, `One <code>GameState</code> enum, validation before mutation, and the win tested before the draw, all without being asked.`, `A precise thread-safety story: which lock guards which fields, why the getters are locked, and why <code>Board</code> and <code>WinTracker</code> need no lock of their own.`, `Can say where undo, a bot and N x N land, each as a small local change.`],
      [`Asks "full line or K in a row?" early and explains that the answer picks the algorithm; switches to a run check for K and introduces a <code>WinRule</code> only once two rules exist.`, `Weighs State classes against an enum, and a Singleton system against injected instances, and justifies dropping both from this design.`, `Designs many concurrent games: a concurrent registry, a lock per game, identities from the session, listeners notified outside the lock; sketches minimax and why it needs pruning beyond 3 x 3.`]
    ),
    concepts: [
      { term: `Game, Board, WinTracker split`, def: `Game owns turns and the outcome; Board owns the grid; WinTracker owns line detection.`, why: `Each class has one reason to change: a new win rule replaces only WinTracker.` },
      { term: `Per-line counters`, def: `One integer per row and column plus two for the diagonals; X adds +1, O adds -1, and a line at +N or -N is complete.`, why: `The win check is O(1) per move with O(N) memory, instead of a scan.`, ex: `On 3 x 3, X at (0,0), (1,1) and (2,2) drives <code>diag</code> to 3.` },
      { term: `Why mixed lines can't win`, def: `A line has N cells, each counted once; a single opposing symbol caps the sum at N - 2.`, why: `This is the correctness argument interviewers want with the counter trick.` },
      { term: `Only the last move can win`, def: `Before a move there was no winner, so any new line must pass through the cell just marked.`, why: `It is why the line scan is O(N) and why counters only need the lines through that cell.` },
      { term: `GameState enum`, def: `<code>IN_PROGRESS</code>, <code>WON</code> or <code>DRAW</code> in one field, with the winner stored separately.`, why: `Impossible combinations cannot be represented, without the weight of State classes.` },
      { term: `Validate before mutate`, def: `Check game over, turn, bounds and emptiness before writing anything.`, why: `A rejected move leaves the game exactly as it was, so callers can simply retry.` },
      { term: `Win before draw`, def: `After placing, test for a completed line first and only then for a full board.`, why: `A winning move that fills the last cell is a win.` },
      { term: `Lock per game, confinement`, def: `Every method touching a game's mutable state is synchronized on that game; Board and WinTracker never escape it.`, why: `Concurrent moves on one game are serialized, different games never block each other, and the helpers need no locks of their own.` }
    ],
    interview: [
      { q: `Why not store a Cell object in each square of the grid?`, a: `A cell object would only wrap one symbol and expose a getter and a setter; it has no rules of its own. A Symbol[][] with null for empty holds the same information with no extra allocation or indirection. Cell survives as a small (row, col) record, because move sources and bots need to hand back a coordinate.`, diff: `easy` },
      { q: `How do you detect a win in O(1), and why is it correct?`, a: `Keep an int per row and per column plus one for each diagonal. When X moves, add 1 to the row, the column and any diagonal the cell is on; when O moves, subtract 1. A line is won when its counter reaches N or -N. That can only happen if all N cells hold the same symbol, because each cell is counted once and a single opposing symbol pulls the sum to at most N - 2. The check reads four integers whatever the board size.`, diff: `easy` },
      { q: `Why check for a win before checking for a full board?`, a: `The move that fills the last cell can also complete a line. Testing fullness first would report that as a draw even though the player won. Testing the win first, then the draw, then switching turns handles every case.`, diff: `easy` },
      { q: `Some designs use InProgress, Winner and Draw state classes. Why use an enum here?`, a: `The State pattern pays off when each state handles events differently. Here the two finished states do the same thing, reject the move, so three classes and a state setter on Game replace a single if at the top of play. An enum in one field gives the same protection against impossible combinations. If states with real behaviour appear, such as waiting for an opponent or paused, that is the time to switch.`, diff: `medium` },
      { q: `The interviewer changes the rule to K in a row on an N x N board. What breaks?`, a: `The counters. A row sum of K no longer means K adjacent cells: X at columns 0, 1, 2, 5 and 9 of a row sums to 5 without five in a row. Replace the tracker with a run check from the last move: for each of the four directions, count matching symbols outward both ways and win if 1 plus both counts reaches K. That is O(K) per move. With two rules, a small WinRule interface chosen in the constructor is now justified; Board and Game are unchanged.`, diff: `medium` },
      { q: `How would you add a computer opponent?`, a: `As another move source that returns a cell; Game and its rules do not change. A rule-based bot takes a winning cell, then blocks the opponent's winning cell, then prefers the centre and the corners. For perfect play on 3 x 3, minimax in negamax form searches every continuation in milliseconds. The bot works on a copy of the grid taken under the game's lock, so its trial moves never touch the live board.`, diff: `medium` },
      { q: `Two requests for the same game arrive on two threads, and the server hosts thousands of games. How do you keep it safe?`, a: `Each Game serializes its own moves with its own lock, so two requests for one game cannot interleave: the second sees the updated turn or state and is rejected. Different games have different locks and run in parallel. A registry maps game ids to games in a ConcurrentHashMap so lookups need no global lock, ids are random UUIDs, finished games are evicted atomically with computeIfPresent, and the Player for a request comes from the authenticated session rather than the request body.`, diff: `hard` }
    ],
    cheatsheet: [
      { title: `Tic-Tac-Toe in one screen`, type: `code`, lang: `java`, body: `record Player(String name, Symbol symbol) {}      // Symbol: X, O; GameState: IN_PROGRESS, WON, DRAW

final class Board {
    Symbol[][] grid; int filled;                  // null means empty
    void place(int r, int c, Symbol s);           // throws if off the board or taken
    boolean isFull();
}
final class WinTracker {
    int[] rows, cols; int diag, anti;             // X adds +1, O adds -1
    boolean record(int r, int c, Symbol s);       // a line at +n or -n wins: O(1)
}
final class Game {                                // every method synchronized: one lock per game
    GameState state; Player current, winner;
    synchronized void play(Player p, int r, int c);   // over? turn? place, win, draw, switch turn
}
// Order inside play: state check, turn check, place (bounds, taken), win, draw, switch.` },
      { title: `Follow-ups and where they land`, type: `table`, headers: [`Follow-up`, `Change`], rows: [
        [`N x N board`, `Nothing: n is already a parameter`],
        [`K in a row`, `WinTracker replaced by a run check behind a WinRule (Deep Dives)`],
        [`Computer opponent`, `A new MoveSource working on a grid snapshot (Deep Dives)`],
        [`Undo`, `A Move stack in Game, Board.clear and WinTracker.unrecord (Deep Dives)`],
        [`Many games on a server`, `A GameManager with a ConcurrentHashMap; Game unchanged (Deep Dives)`],
        [`Scoreboard across games`, `A listener notified outside the game's lock (Deep Dives)`]
      ] }
    ],
    labs: []
  });
})();
