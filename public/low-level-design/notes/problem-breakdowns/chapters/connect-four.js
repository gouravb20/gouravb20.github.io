// LLD problem breakdown: Connect Four. Format: Chapter in public/shared/notes.d.ts; shared helpers in data-part2.js.
// Imports are omitted in the code.
(function () {
const { levels, PRACTICE_TIP } = LLD_PROBLEMS_KIT;

window.DATA.chapters.push({
    id: `connect-four`, part: 1, number: 0, difficulty: `easy`,
    title: `Connect Four: turns, a falling disc and a four-in-a-row check`,
    overview: `Two players take turns dropping discs into a 7-column, 6-row board; a disc falls to the lowest empty cell, four in a row in any direction wins, and a full board is a draw. It is the gentlest LLD problem, which makes it a good test of judgment. This page works it in interview order: clarify the requirements, find the entities, design the classes top down, implement the board and the game (comparing a weak, a good and a strong option at each decision), verify with a move-by-move trace, then handle follow-ups. The design lands on a clean split between the <strong>Game</strong> (turns and outcome) and the <strong>Board</strong> (cells and geometry), a <strong>height per column</strong> so a drop is constant work, a single <strong>GameState enum</strong>, one <strong>win check from the last disc</strong> driven by direction vectors rather than a class per direction, and a game that <strong>locks itself</strong> so moves from two devices are applied one at a time.`,
    source: { title: `Hello Interview: Connect Four (LLD) problem breakdown`, url: `https://www.hellointerview.com/learn/low-level-design/problem-breakdowns/connect-four` },
    problem: [
      { id: `understanding`, title: `What a Connect Four game does`, kicker: `The problem`, blocks: [
        { type: `problem`, html: `<p>Two players share an upright board of seven columns and six rows. On each turn a player picks a column and drops a disc of their colour into it; the disc falls to the lowest empty cell in that column. The first player to line up four of their discs horizontally, vertically or diagonally wins. If all 42 cells fill up with no line of four, the game is a draw.</p>` },
        { type: `text`, html: `<p>The prompt is usually a single sentence: <em>"Design the game logic for Connect Four."</em> Everyone knows the game, which is the trap: it feels too obvious to clarify, so candidates start coding and only later discover they never agreed on how a move is made, what happens when it is illegal, or whether two people on different devices play the same game. Spend the first few minutes turning the sentence into a spec.</p>` }
      ] },
      { id: `clarifying`, title: `Clarifying questions`, kicker: `Step 1: requirements`, blocks: [
        { type: `text`, html: `<p>Work through four kinds of question: <strong>what actions the system supports</strong>, <strong>what happens with bad input</strong>, <strong>what is deliberately out of scope</strong>, and <strong>what might be added later</strong>. In an easy problem this takes a minute or two, and every answer removes a branch you would otherwise design for.</p>` },
        { type: `table`, headers: [`You ask`, `A typical answer`, `What it decides`], rows: [
          [`Is the board always 7 columns by 6 rows?`, `Yes, fixed`, `Constants on the board; configurable sizes become a follow-up`],
          [`How does a player move?`, `By choosing a column, 0 to 6; the disc falls by itself`, `One mutating method that takes a column, not a row and column`],
          [`How does a game end?`, `Four in a row in any direction wins; a full board with no four is a draw`, `Three outcomes: in progress, won, drawn`],
          [`What should happen on an illegal move: a full column, column 9, the wrong player, a move after the game ended?`, `Reject it with a clear reason and leave the game unchanged`, `Validate everything before touching the board`],
          [`Are both players on one machine, or could moves come from two devices?`, `Assume they could come from two devices`, `The caller says who is moving, and the game must be safe to call from two threads`],
          [`Is there a UI?`, `No, but a renderer will need to read the board`, `A small read-only API: cell, state, winner, whose turn`],
          [`Undo, move history, saved games, a computer opponent?`, `Not now; maybe as follow-ups`, `No move log in the core; keep room for one`],
          [`One game at a time, or many?`, `Design one game well; many games is a follow-up`, `Game is an ordinary object, one instance per match, never a singleton`]
        ] },
        { type: `callout`, tone: `insight`, title: `Does the caller say who is moving?`, html: `<p>The most useful question here is how a move identifies the player. If the method is <code>play(column)</code>, the game simply assumes the current player moved. That is fine for a single shared screen, but the moment moves arrive from two devices, either player could send a move on the other's turn and the game could not tell. Taking the player as an argument, <code>play(player, column)</code>, lets the game enforce turns itself. It costs nothing now and is what makes the networked follow-up a small change instead of a redesign.</p>` }
      ] },
      { id: `final-requirements`, title: `Final requirements`, kicker: `Step 1: requirements`, blocks: [
        { type: `code`, lang: `text`, title: `Final requirements`, code: `Requirements
  1. Two players, each with a different disc colour, alternate turns.
     The first player given to the game moves first.
  2. The board has 7 columns and 6 rows.
  3. A move names the player and a column; the disc falls to the lowest
     empty cell of that column.
  4. Four of one player's discs in a line (horizontal, vertical or either
     diagonal) wins the game immediately.
  5. If the board fills with no line of four, the game is a draw.
     A winning move that also fills the board is a win, not a draw.
  6. Illegal moves are rejected with a reason and change nothing:
     a column outside 0-6, a full column, the wrong player's turn,
     or any move after the game has ended.
  7. A renderer can read every cell, the game state, the winner and whose
     turn it is.
  8. Moves may arrive concurrently (two devices); they must be applied one
     at a time.

Out of scope
  - UI and rendering
  - Configurable board sizes, connect-K
  - Undo, move history, saved games
  - Computer opponents
  - Several games at once` },
        { type: `callout`, tone: `tip`, html: PRACTICE_TIP }
      ] }
    ],
    solution: [
      { id: `entities`, title: `Core entities`, kicker: `Step 2: entities`, blocks: [
        { type: `text`, html: `<p>Scan the requirements for nouns that hold state or enforce a rule, and test each one before committing to a class. In a small problem the most useful skill is saying "no" to nouns that don't earn a class.</p>` },
        { type: `table`, headers: [`Candidate`, `Verdict`, `Why`], rows: [
          [`Game`, `A class`, `Owns whose turn it is and the outcome, and enforces the turn and game-over rules. It is the entry point.`],
          [`Board`, `A class`, `Owns the grid; knows where a disc lands, whether a placement makes four, and whether it is full`],
          [`Player`, `A record`, `A name and a disc colour. Pure data with no behaviour of its own`],
          [`Disc (colour)`, `An enum`, `Exactly two values, RED and YELLOW; an empty cell is the absence of a disc`],
          [`Cell`, `Not a class`, `A slot in the grid holding a disc or nothing. A wrapper object per cell would add 42 objects and no behaviour`],
          [`Row, Column`, `Not classes`, `Plain <code>int</code> positions; the board does the bounds checks`],
          [`Turn`, `Not a class`, `A single field on Game: the current player`],
          [`Move`, `Not yet`, `Nothing in the requirements remembers past moves. It returns as a record when undo or history is asked for`],
          [`WinChecker`, `Not a class`, `Four-in-a-row is one method on Board. The four directions are data, not four implementations`],
          [`GameState`, `An enum`, `In progress, won or drawn: one field instead of several flags`]
        ] },
        { type: `table`, title: `The entities we keep`, headers: [`Entity`, `Responsibility`], rows: [
          [`Game`, `The entry point. Validates a move (game over, turn, column), asks the board to drop the disc, then decides the outcome and passes the turn. Never scans the grid itself.`],
          [`Board`, `The grid and its geometry: where a disc lands, whether the disc just placed completes four, whether every cell is filled. Never asks whose turn it is.`],
          [`Player`, `An immutable name and disc colour.`],
          [`Disc, GameState`, `Enums for a colour and for the game's outcome.`]
        ] },
        { type: `callout`, tone: `tip`, html: `<p>Saying why something is <em>not</em> a class is as valuable as the classes you keep. "A Cell class would wrap a nullable enum and add nothing" and "the win check is a method, not a hierarchy" show judgment that a list of nouns does not.</p>` }
      ] },
      { id: `game-design`, title: `Class design: Game`, kicker: `Step 3: class design, top down`, blocks: [
        { type: `text`, html: `<p>Start from the class outside code talks to. For each requirement ask what Game must remember and what it must let callers do; derive both from the spec rather than from habit.</p>` },
        { type: `table`, headers: [`Requirement`, `What Game remembers`], rows: [
          [`"Two players alternate turns"`, `Both players, fixed at construction, and the current player`],
          [`"Four in a row wins; a full board draws"`, `The outcome, and the winner when there is one`],
          [`"Discs fall into a 7 by 6 board"`, `Its own Board, created in the constructor and never shared`]
        ] },
        { type: `table`, headers: [`Need`, `Method`], rows: [
          [`Make a move`, `<code>void play(Player player, int column)</code>, throwing on an illegal move`],
          [`Is the game over, and how?`, `<code>GameState state()</code>`],
          [`Who won?`, `<code>Optional&lt;Player&gt; winner()</code>`],
          [`Whose turn is it?`, `<code>Player currentPlayer()</code>`],
          [`Draw the board`, `<code>Disc cell(int row, int col)</code>, null for an empty cell`]
        ] },
        { type: `text`, html: `<p>The one real decision in Game is <strong>how to represent the outcome</strong>. The game can be in progress, won by one player, or drawn, and every caller needs to ask about it.</p>` },
        { type: `compare`, items: [
          { title: `Weak: three booleans`, tone: `bad`, html: `<p><code>isOver</code>, <code>hasWinner</code>, <code>isDraw</code>. Easy to write, but they allow combinations that mean nothing (a draw with a winner, a winner while not over), and every move must update all three in step. One missed assignment and the game is in an impossible state.</p>` },
          { title: `Good: derive it`, tone: `warn`, html: `<p>Keep only a nullable <code>winner</code>; the game is won when it is set, drawn when the board is full and there is no winner. Nothing can contradict anything else, but "is it over?" now means asking the board on every call, and the rule "a win beats a full board" is repeated in every place that derives it.</p>` },
          { title: `Strong: one GameState enum`, tone: `ok`, html: `<p>A single <code>state</code> field with exactly three values, set once inside <code>play</code>, plus the winner, which is only set together with <code>WON</code>. Impossible combinations cannot be expressed, the win-before-draw rule lives in one place, and reading the state is a field read.</p>` }
        ] },
        { type: `text`, html: `<p>We take the enum. The players, the colours and the outcome are small immutable types:</p>` },
        { type: `code`, lang: `java`, title: `Player, Disc and GameState`, code: `enum Disc { RED, YELLOW }                       // an empty cell is null, not a third colour

enum GameState { IN_PROGRESS, WON, DRAW }

record Player(String name, Disc disc) {}        // immutable; equality covers name and disc` },
        { type: `keypoints`, items: [
          `<strong>The caller names the player.</strong> <code>play(player, column)</code> lets Game reject a move made out of turn, which a <code>play(column)</code> method could never detect once moves come from two devices.`,
          `<strong>Exceptions for illegal moves.</strong> They carry the reason ("column full", "not your turn") and are idiomatic Java. Returning <code>false</code> is also acceptable; pick one, say why, and be consistent.`,
          `<strong>One instance per match.</strong> Game is not a singleton: a second game is just <code>new Game(...)</code>, which is what makes "many games at once" a registry rather than a rewrite.`,
          `<strong>Game owns its Board.</strong> It creates the board in its constructor and never hands it out, so the only way to change the grid is through <code>play</code>. That is also what lets one lock on Game protect the board.`
        ] }
      ] },
      { id: `board-design`, title: `Class design: Board`, kicker: `Step 3: class design, top down`, blocks: [
        { type: `table`, headers: [`Requirement`, `What Board remembers`], rows: [
          [`"7 columns, 6 rows"`, `A grid of discs, <code>Disc[6][7]</code>, row 0 at the top`],
          [`"A disc falls to the lowest empty cell"`, `Something that answers "where does the next disc in this column land?"`],
          [`"A full board is a draw"`, `How many discs have been placed in total`]
        ] },
        { type: `table`, headers: [`Need`, `Method on Board`], rows: [
          [`Is this column legal and not full?`, `<code>boolean canDrop(int col)</code>`],
          [`Place a disc and report where it landed`, `<code>int drop(int col, Disc disc)</code>, returning the row`],
          [`Did that disc complete four?`, `<code>boolean makesFour(int row, int col)</code>`],
          [`Is every cell filled?`, `<code>boolean isFull()</code>`],
          [`Read one cell for a renderer`, `<code>Disc cell(int row, int col)</code>`]
        ] },
        { type: `text`, html: `<p>The question here is <strong>how to find the landing row</strong>. It runs on every move, and the choice also decides how the win check reads neighbouring cells.</p>` },
        { type: `compare`, items: [
          { title: `Good: scan the column`, tone: `warn`, html: `<p>Keep only the grid and walk up from the bottom row until an empty cell turns up. Six reads at most, nothing to keep in sync, and perfectly acceptable in an interview. It just repeats work the board could remember, and "is the column full?" becomes another scan.</p>` },
          { title: `Better: a stack per column`, tone: `info`, html: `<p>Seven lists, one per column; dropping appends, and the landing row is the list's size. Dropping is natural and constant time, but the win check walks across columns and diagonals, and every one of those reads now needs a "does this column reach that high?" check and a flip from bottom-up to top-down rows.</p>` },
          { title: `Great: a grid plus a height per column`, tone: `ok`, html: `<p>The grid for geometry, and <code>heights[col]</code> counting the discs in each column. The landing row is <code>ROWS - 1 - heights[col]</code>, "full" is <code>heights[col] == ROWS</code>, and the win check reads the grid directly. The two must stay in step, which is easy because only <code>drop</code> changes either.</p>` }
        ] },
        { type: `text`, html: `<p>We take the grid with heights, plus a running total so that <code>isFull()</code> is a comparison rather than a scan of 42 cells.</p>` }
      ] },
      { id: `class-diagram`, title: `Final class design`, kicker: `Step 3: class design`, blocks: [
        { type: `code`, lang: `java`, title: `Final class design`, code: `enum Disc { RED, YELLOW }
enum GameState { IN_PROGRESS, WON, DRAW }
record Player(String name, Disc disc) {}

final class Game {
    private final Board board;                        // created here, never shared
    private final Player first, second;
    private Player current;
    private GameState state;
    private Player winner;                            // set only together with WON

    Game(Player first, Player second);                // first moves first; colours must differ
    synchronized void play(Player player, int column);   // throws on an illegal move
    synchronized GameState state();
    synchronized Optional<Player> winner();
    synchronized Player currentPlayer();
    synchronized Disc cell(int row, int col);         // null when empty, for a renderer
}

final class Board {
    static final int ROWS = 6, COLS = 7;
    private final Disc[][] grid;                      // row 0 is the top
    private final int[] heights;                      // discs in each column
    private int total;                                // discs on the board

    boolean canDrop(int col);
    int drop(int col, Disc disc);                     // returns the landing row
    boolean makesFour(int row, int col);              // lines through the disc just placed
    boolean isFull();
    Disc cell(int row, int col);
}` },
        { type: `text`, html: `<p>Game knows the rules of play and never looks at the grid; Board knows geometry and never asks whose turn it is. Each can be tested on its own, and each has exactly one reason to change. There are no interfaces: nothing here has two implementations that must be swapped, so an interface would only add a file.</p>` }
      ] },
      { id: `board-impl`, title: `Implementation: the board and the win check`, kicker: `Step 4: implementation`, blocks: [
        { type: `text`, html: `<p>Check what the interviewer wants: working code, pseudocode or a walkthrough. Write the normal path first. <code>drop</code> computes the landing row from the column's height, stores the disc, and bumps the height and the total. Its only edge case, a bad or full column, is reported by <code>canDrop</code>, which Game calls first.</p>` },
        { type: `text`, html: `<p>The interesting method is <code>makesFour</code>. Compare the options on one position before writing it. Red has discs at (5,0), (4,1) and (3,2) and now drops into column 3, landing at (2,3) and completing a rising diagonal. (Row 0 is the top, so row 5 is the bottom.)</p>` },
        { type: `table`, headers: [`Approach`, `Cells read for this move`, `Code`, `Changing to "connect K"`], rows: [
          [`Weak: scan every possible line of four after each move`, `276: all 69 windows of four cells (the winning window turns up after 204)`, `One method, but the work grows with the board`, `Change the window length`],
          [`Good: a WinChecker interface with Horizontal, Vertical and two Diagonal classes, each checking around the last disc`, `11`, `An interface and four classes running the same loop with different numbers`, `Change K in four places`],
          [`Strong: one loop over four direction vectors, counting both ways from the last disc`, `11`, `One method, one helper and a four-row array`, `Change one constant`]
        ] },
        { type: `text`, html: `<p>The key observation is that the position before this move had no line of four, otherwise the game would already be over. So any new line must pass through the disc just placed, and only the four lines through that one cell need checking: across, down, and the two diagonals. For each direction, count matching discs stepping forwards and stepping backwards, add one for the disc itself, and stop as soon as a run reaches four. The work is a small constant (a few cells along each of four lines), whatever the board size. The checker classes do the same work, but as four copies of one loop; the directions differ only in two numbers, so they belong in data, not in types.</p>` },
        { type: `list`, title: `Edge cases the board must handle`, items: [
          `A column below 0 or above 6: <code>canDrop</code> is false; nothing is read out of range.`,
          `A full column: <code>canDrop</code> is false because its height is already 6.`,
          `Walking off the edge during the win check: the counting loop checks bounds before reading each cell.`,
          `A run longer than four (a disc that joins two runs of two and one): <code>run &gt;= 4</code>, not <code>== 4</code>.`,
          `The 42nd disc: <code>isFull()</code> becomes true, but Game asks <code>makesFour</code> first.`
        ] },
        { type: `code`, lang: `java`, title: `Board`, code: `/** Not thread-safe by itself: only Game touches a Board, and always while holding Game's lock. */
final class Board {
    static final int ROWS = 6, COLS = 7;
    private static final int CONNECT = 4;
    private static final int[][] DIRECTIONS = { {0, 1}, {1, 0}, {1, 1}, {1, -1} };  // across, down, two diagonals

    private final Disc[][] grid = new Disc[ROWS][COLS];   // row 0 is the top; null means empty
    private final int[] heights = new int[COLS];          // discs in each column
    private int total;                                    // discs on the board

    boolean canDrop(int col) { return col >= 0 && col < COLS && heights[col] < ROWS; }

    /** Places a disc in the lowest empty cell of col and returns its row. */
    int drop(int col, Disc disc) {
        if (!canDrop(col)) throw new IllegalArgumentException("Column " + col + " is full or out of range");
        int row = ROWS - 1 - heights[col];
        grid[row][col] = disc;
        heights[col]++;
        total++;
        return row;
    }

    boolean isFull() { return total == ROWS * COLS; }

    Disc cell(int row, int col) { return grid[row][col]; }

    /** True if the disc at (row, col) is part of a line of four or more. Only lines through it can be new. */
    boolean makesFour(int row, int col) {
        Disc disc = grid[row][col];
        for (int[] d : DIRECTIONS) {
            int run = 1 + count(row, col, d[0], d[1], disc) + count(row, col, -d[0], -d[1], disc);
            if (run >= CONNECT) return true;
        }
        return false;
    }

    /** Matching discs next to (row, col), stepping by (dr, dc) until a different cell or the edge. */
    private int count(int row, int col, int dr, int dc, Disc disc) {
        int n = 0;
        for (int r = row + dr, c = col + dc; r >= 0 && r < ROWS && c >= 0 && c < COLS && grid[r][c] == disc; r += dr, c += dc) n++;
        return n;
    }
}` },
        { type: `callout`, tone: `interview`, html: `<p>In an easy problem, the strongest signal is restraint. If you feel the pull toward a <code>WinChecker</code> hierarchy, say it out loud and reject it: "Strategy is for behaviour that varies or gets swapped. Here only two numbers vary, so they are parameters." Then show that "connect five" is a one-constant change.</p>` }
      ] },
      { id: `game-impl`, title: `Implementation: the game and its turns`, kicker: `Step 4: implementation`, blocks: [
        { type: `text`, html: `<p><code>play</code> follows one rule: <strong>validate everything, then mutate</strong>. Check that the game is still running, that it is this player's turn, and that the column can take a disc; only then drop it. After the drop, the order of the outcome checks matters: win first, then draw, and only if neither happened does the turn pass.</p>` },
        { type: `list`, title: `Edge cases play must handle`, items: [
          `A move after the game ended: rejected first, so the message is "the game is over" rather than a confusing turn error.`,
          `The wrong player, or a stranger who is neither player: rejected, because neither equals the current player.`,
          `A bad or full column: rejected before the board changes.`,
          `A winning move that fills the last cell: <code>WON</code>, because the win is checked before the draw.`,
          `The last cell filled with no line of four: <code>DRAW</code>.`,
          `Two players with the same colour: rejected in the constructor, since the board could not tell their discs apart.`
        ] },
        { type: `code`, lang: `java`, title: `Game`, code: `/** One match. Every method is synchronized on the game, so moves from two devices are applied one at a time. */
final class Game {
    private final Board board = new Board();             // guarded by this; never leaves this class
    private final Player first, second;                   // immutable
    private Player current;                               // guarded by this
    private GameState state = GameState.IN_PROGRESS;      // guarded by this
    private Player winner;                                // guarded by this; set only together with WON

    Game(Player first, Player second) {
        if (first.disc() == second.disc()) throw new IllegalArgumentException("Players need different colours");
        this.first = first;
        this.second = second;
        this.current = first;
    }

    synchronized void play(Player player, int column) {
        if (state != GameState.IN_PROGRESS) throw new IllegalStateException("The game is over");
        if (!player.equals(current)) throw new IllegalStateException("It is " + current.name() + "'s turn");
        if (!board.canDrop(column)) throw new IllegalArgumentException("Column " + column + " is full or out of range");

        int row = board.drop(column, player.disc());
        if (board.makesFour(row, column)) {               // win before draw: the 42nd disc can win
            state = GameState.WON;
            winner = player;
        } else if (board.isFull()) {
            state = GameState.DRAW;
        } else {
            current = current == first ? second : first;
        }
    }

    synchronized GameState state()           { return state; }
    synchronized Optional<Player> winner()   { return Optional.ofNullable(winner); }
    synchronized Player currentPlayer()      { return current; }
    synchronized Disc cell(int row, int col) { return board.cell(row, col); }
}` },
        { type: `keypoints`, items: [
          `<strong>Nothing changes on a rejected move.</strong> All three checks come before <code>drop</code>, so an exception leaves the board, the turn and the state exactly as they were.`,
          `<strong>Win, then draw, then switch.</strong> Checking for a full board first would call a winning 42nd disc a draw.`,
          `<strong>The turn only passes on a normal move.</strong> After a win, <code>current</code> stays on the winner; nobody can move anyway.`
        ] },
        { type: `callout`, tone: `warning`, html: `<p>Thread safety: if two devices call <code>play</code> at the same moment without a lock, both can pass the turn check before either switches the turn, and both discs land; or one thread reads a height while the other is incrementing it, and two discs land in the same cell. Making <code>play</code> and every getter <code>synchronized</code> on the game turns each move into one indivisible step and guarantees readers see the latest board. <code>Board</code> has no lock of its own because it is confined: Game creates it, never returns it, and only touches it while holding its own lock. <code>Player</code> and the enums are immutable, so they can be shared freely. One lock per game also means separate games never contend.</p>` }
      ] },
      { id: `verification`, title: `Verifying with a trace`, kicker: `Step 5: verification`, blocks: [
        { type: `text`, html: `<p>Walk a short game through the code, call by call, including a few illegal moves. Red moves first. For each accepted move the trace shows where the disc landed and the longest run through it in each of the four directions, in the order <code>makesFour</code> checks them: across, down (vertical), the falling diagonal, and the rising diagonal.</p>` },
        { type: `code`, lang: `text`, title: `Call by call`, code: `call                  lands   runs (across, vertical, falling, rising)   result
 1  play(Red, 3)      (5,3)   1 1 1 1                                    Yellow to move
 2  play(Yellow, 2)   (5,2)   1 1 1 1                                    Red to move
 3  play(Red, 0)      (5,0)   1 1 1 1                                    Yellow to move
 4  play(Yellow, 1)   (5,1)   2 1 1 1                                    Red to move
 5  play(Yellow, 2)   -       rejected: "It is Red's turn"; nothing changes
 6  play(Red, 7)      -       rejected: "Column 7 is full or out of range"; still Red
 7  play(Red, 1)      (4,1)   1 1 1 2                                    Yellow to move
 8  play(Yellow, 2)   (4,2)   1 2 1 2                                    Red to move
 9  play(Red, 2)      (3,2)   1 1 1 3                                    Yellow to move
10  play(Yellow, 3)   (4,3)   2 1 1 2                                    Red to move
11  play(Red, 3)      (3,3)   2 1 1 1                                    Yellow to move
         column 3 can now take a disc at (2,3), which would finish Red's diagonal
12  play(Yellow, 4)   (5,4)   1 1 2 1                                    Red to move (Yellow missed it)
13  play(Red, 3)      (2,3)   1 2 1 4                                    WON, winner Red
14  play(Yellow, 4)   -       rejected: "The game is over"; state stays WON

Final board (row 0 at the top)
     0 1 2 3 4 5 6
  0  . . . . . . .
  1  . . . . . . .
  2  . . . R . . .
  3  . . R R . . .
  4  . R Y Y . . .
  5  R Y Y R Y . .` },
        { type: `keypoints`, items: [
          `Calls 5, 6 and 14 were rejected before the board changed: the turn stayed with Red after 5 and 6, and the state stayed <code>WON</code> after 14.`,
          `Each landing row came straight from the column's height: column 3 filled rows 5, 4, 3 and then 2 with no scanning.`,
          `The winning check at call 13 read 11 cells around (2,3); the rising diagonal reached (5,0) and then stopped at the board's edge without a special case.`,
          `The run values match the board: call 4 joined Yellow's (5,2) for an across run of 2, and call 9 extended Red's rising diagonal to 3.`,
          `A board-filling winning move is covered by the order of the checks; a test that fills 41 cells and wins on the 42nd confirms it reports <code>WON</code>.`
        ] }
      ] }
    ],
    levels: levels(
      [`Game, Board and Player with sensible responsibilities, and a drop that lands in the lowest empty row.`, `A working win check horizontally and vertically; diagonals with a hint are fine, as is checking the whole board at first.`, `Illegal moves (full column, out of range, game over) rejected without breaking the game, and a short manual walkthrough that shows it works.`],
      [`Asks how a move identifies the player and whether moves can be concurrent, and designs <code>play(player, column)</code> as a result.`, `A single <code>GameState</code> enum, validation before mutation, and win-before-draw ordering, all without prompting.`, `The incremental win check from the last disc with direction vectors, explained in terms of why only lines through that disc can be new.`, `Can say where undo, a bot or other board sizes would land: one or two classes, the rest unchanged.`],
      [`Scopes tightly in a minute and names what is out of scope, then spends the saved time on judgment calls.`, `Explains why a <code>WinChecker</code> hierarchy or a <code>Cell</code> class would be over-engineering, and when a Strategy would earn its place.`, `Thread safety argued precisely: one lock per game, the board confined to it, immutable players, and no singleton.`, `Sketches many games over a network (a registry, the player taken from the authenticated session), a bot that works on a copy of the board, and undo, all without restructuring the core.`]
    ),
    concepts: [
      { term: `Game vs Board split`, def: `Game owns turns and the outcome; Board owns cells, landing rows and line detection.`, why: `Each class has one reason to change and can be tested alone.` },
      { term: `GameState enum`, def: `<code>IN_PROGRESS</code>, <code>WON</code> or <code>DRAW</code> in one field, with the winner set only alongside <code>WON</code>.`, why: `Impossible combinations of flags cannot be expressed.` },
      { term: `Height per column`, def: `<code>heights[col]</code> counts discs in each column; the landing row is <code>ROWS - 1 - heights[col]</code>.`, why: `Constant-time drop and "is the column full?" without scanning.` },
      { term: `Win check from the last disc`, def: `Count matching discs both ways along four lines through the cell just filled.`, why: `Any new line of four must include that disc, so the work is a small constant whatever the board size.` },
      { term: `Directions as data`, def: `The four lines are vectors (0,1), (1,0), (1,1), (1,-1) handled by one loop.`, why: `One place to fix bugs; "connect K" is a one-constant change. A class per direction adds code, not flexibility.` },
      { term: `Validate before mutate`, def: `Check game over, turn and column before touching the board.`, why: `A rejected move leaves the game exactly as it was.` },
      { term: `The caller names the player`, def: `<code>play(player, column)</code> rather than <code>play(column)</code>.`, why: `The game can enforce turns itself when moves come from two devices.` },
      { term: `Lock per game, confined board`, def: `Every Game method is synchronized; Board has no lock because only Game touches it, under Game's lock.`, why: `Concurrent moves are applied one at a time, and separate games never contend.` }
    ],
    interview: [
      { q: `Why is the win check only done around the last disc?`, a: `Before the move there was no line of four, otherwise the game would already have ended. So any new line must pass through the disc just placed. Checking the four lines through that cell, counting both ways along each, is a few cells along four lines regardless of board size, instead of re-scanning all 69 possible windows after every move.`, diff: `easy` },
      { q: `Why an enum for the game state instead of booleans like isOver and hasWinner?`, a: `Separate booleans allow combinations that make no sense, such as a draw with a winner or a winner while still in progress, and every update has to keep them in step. One enum field has exactly the three legal values and is set in one place. The winner stays a separate field, set only together with WON and exposed as an Optional.`, diff: `easy` },
      { q: `A disc completes four in a row and also fills the last empty cell. What is the result?`, a: `A win. play checks makesFour before isFull, so the winning move is recorded as WON. If the checks were the other way round, a player who won on the 42nd disc would be told it was a draw.`, diff: `easy` },
      { q: `Why does play take the player as an argument when the game already knows whose turn it is?`, a: `Because the game should enforce turns, not trust its caller. With play(column), any move is assumed to come from the current player, which is fine on one shared screen but breaks as soon as two devices send moves: either could move on the other's turn and the game could not tell. play(player, column) lets Game reject an out-of-turn move with a clear reason.`, diff: `medium` },
      { q: `Shouldn't the win check be a Strategy, with a class per direction?`, a: `No. Strategy earns its place when behaviour genuinely differs or is swapped at run time. The four directions run identical logic and differ only in two numbers, and Connect Four will never gain a fifth direction. A four-row array of vectors and one loop is shorter, has one place to fix bugs, and makes connect-K a one-constant change. Saying this out loud is a strong signal in an easy problem.`, diff: `medium` },
      { q: `How would you add a computer opponent without changing the rules?`, a: `Keep Player as data and put the decision in a separate MoveChooser. Game hands out a copy of the board (a synchronized snapshot), the bot tries columns on that copy (win if possible, block the opponent's win, else prefer the centre), and the bot's turn is just play(botPlayer, chosenColumn). The rules, Board and Game's validation are unchanged; a stronger bot uses minimax with alpha-beta pruning behind the same interface.`, diff: `medium` },
      { q: `Two devices send a move at the same instant. What can go wrong, and how does your design prevent it?`, a: `Without a lock, both calls can pass the turn check before either switches the turn, so both discs land; or both read the same column height and write the same cell. Every Game method is synchronized, so each move is one indivisible step and getters see the latest state. Board needs no lock of its own because it is confined to Game and only touched under Game's lock; Player and the enums are immutable. Each game has its own lock, so different games never block each other.`, diff: `hard` }
    ],
    cheatsheet: [
      { title: `Connect Four in one screen`, type: `code`, lang: `java`, body: `enum Disc { RED, YELLOW }   enum GameState { IN_PROGRESS, WON, DRAW }
record Player(String name, Disc disc) {}

final class Board {                          // confined to its Game; no lock of its own
    Disc[][] grid;  int[] heights;  int total;
    boolean canDrop(int col);                // in range and heights[col] < ROWS
    int drop(int col, Disc d);               // row = ROWS - 1 - heights[col]++
    boolean makesFour(int row, int col);     // 4 direction vectors, count both ways from the last disc
    boolean isFull();                        // total == ROWS * COLS
}

final class Game {                           // every method synchronized: one move at a time
    GameState state;  Player current, winner;
    synchronized void play(Player p, int col);
    // over? your turn? column ok?  then drop; four -> WON, else full -> DRAW, else switch turn
}` },
      { title: `Follow-ups and where they land`, type: `table`, headers: [`Follow-up`, `Change`], rows: [
        [`Undo and move history`, `A move stack in Game and one removeTop method on Board (Deep Dives)`],
        [`Computer opponent`, `A MoveChooser working on a board snapshot; rules unchanged (Deep Dives)`],
        [`Other sizes, connect five`, `Board takes rows, columns and K in its constructor (Deep Dives)`],
        [`Many games over a network`, `A GameService with a concurrent map of games; the player comes from the session (Deep Dives)`],
        [`Spectators`, `Game notifies listeners after each move, outside its lock`],
        [`"Shouldn't this be a Strategy?"`, `No for directions; yes only for genuinely different rule sets (Deep Dives)`]
      ] }
    ],
    labs: []
  });
})();
