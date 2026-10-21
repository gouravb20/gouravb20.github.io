// Deep dives: Connect Four (LLD practice set). Format: DeepDive in public/shared/notes.d.ts.
window.DEEP = window.DEEP || {};
DEEP["connect-four"] = {
  hook: `<p>The core game is small on purpose, so follow-ups are where the design is really tested. Each one below should touch one or two classes; if a twist forces you to rewrite both Game and Board, the split was wrong. You rarely implement these in full: show which class changes, why the rest doesn't, and how thread safety carries over. Junior candidates may get none, mid-level one or two, senior candidates several.</p>`,
  sections: [
    {
      id: "undo",
      title: "\"How would you add undo?\"",
      kicker: "Follow-up: move history",
      blocks: [
        { type: "text", html: `<p>Undo needs memory of past moves, which the core deliberately left out. The question is where that memory lives. Game is the only place moves happen and the only owner of turns and outcome, so the history belongs there. Board only needs to learn one new operation, and because the last move is always the top disc of its column, that operation is simple: remove the top disc of a column.</p>` },
        { type: "code", lang: "java", title: "Undo: a move stack in Game, one method on Board", code: `record Move(Player player, int row, int col) {}

// Game: the history is guarded by the same lock as everything else in Game.
private final Deque<Move> history = new ArrayDeque<>();

synchronized void play(Player player, int column) {
    // ... the same three checks as before ...
    int row = board.drop(column, player.disc());
    history.push(new Move(player, row, column));
    // ... win, draw or switch turn, as before ...
}

synchronized boolean undo() {
    if (history.isEmpty()) return false;
    Move last = history.pop();
    board.removeTop(last.col());              // the last move is always the top disc of its column
    current = last.player();                  // it is that player's turn again
    state = GameState.IN_PROGRESS;            // the position before any move had no winner
    winner = null;
    return true;
}

// Board: the only new method.
void removeTop(int col) {
    if (col < 0 || col >= COLS || heights[col] == 0) throw new IllegalArgumentException("Column " + col + " is empty");
    heights[col]--;
    grid[ROWS - 1 - heights[col]][col] = null;
    total--;
}` },
        { type: "keypoints", items: [
          "Changes: Game gains a history and <code>undo</code>; Board gains <code>removeTop</code>. The win check, <code>drop</code>, <code>Player</code> and the enums are untouched.",
          "Restoring <code>IN_PROGRESS</code> is always correct: the game ends on the first line of four, so the position before any move had no winner, and it was not full either.",
          "<code>history</code> is a plain <code>ArrayDeque</code> because only synchronized Game methods touch it; it needs no lock of its own, exactly like the board.",
          "Redo is a second stack that <code>undo</code> pushes onto and <code>play</code> clears. Replays and saved games reuse the same <code>Move</code> records."
        ] },
        { type: "callout", tone: "interview", html: `<p>Ask one question before coding: "Can either player undo, or only the one who just moved, and can you undo after the game ends?" In a two-device game, letting the opponent undo your move is a bug, so a real <code>undo</code> would also take the requesting player and check it matches <code>last.player()</code>.</p>` }
      ]
    },
    {
      id: "bot",
      title: "\"Can you add a computer opponent?\"",
      kicker: "Follow-up: a new kind of player",
      blocks: [
        { type: "text", html: `<p>The rules don't change: a bot is just something that picks a column, after which the game loop calls <code>play(botPlayer, column)</code> like any other move. Resist making <code>Player</code> abstract with a <code>HumanPlayer</code> and a <code>BotPlayer</code>: humans don't choose moves inside the game, they send them in. Keep <code>Player</code> as data and put the decision in a separate component.</p>` },
        { type: "text", html: `<p>The bot needs to try moves without changing the real game, and it must not hold the game's lock while it thinks. So Game hands out a copy of the board, and the bot experiments on that.</p>` },
        { type: "code", lang: "java", title: "A bot that works on a copy of the board", code: `interface MoveChooser { int choose(Board board, Disc me, Disc opponent); }

/** Take a win, else block the opponent's win, else prefer the centre columns. */
final class SimpleBot implements MoveChooser {
    private static final int[] PREFERENCE = { 3, 2, 4, 1, 5, 0, 6 };

    public int choose(Board board, Disc me, Disc opponent) {
        for (int col : PREFERENCE) if (wins(board, col, me)) return col;
        for (int col : PREFERENCE) if (wins(board, col, opponent)) return col;
        for (int col : PREFERENCE) if (board.canDrop(col)) return col;
        throw new IllegalStateException("No legal move");
    }

    private static boolean wins(Board board, int col, Disc disc) {
        if (!board.canDrop(col)) return false;
        Board trial = board.copy();                   // never touch the board it was given
        return trial.makesFour(trial.drop(col, disc), col);
    }
}

// Board gains a copy:   Board copy()  (copies every grid row, heights and total)
// Game gains a snapshot: synchronized Board snapshot() { return board.copy(); }
// The bot's turn:       game.play(bot, chooser.choose(game.snapshot(), bot.disc(), human.disc()));` },
        { type: "keypoints", items: [
          "Changes: a new <code>MoveChooser</code>, plus <code>copy</code> on Board and <code>snapshot</code> on Game. Rules, validation and the win check are unchanged, and the bot's move is still checked by <code>play</code>.",
          "The snapshot is taken under Game's lock and then belongs only to the bot, so the bot can think for as long as it likes without blocking readers or the other player's device.",
          "The snapshot cannot go stale in a way that matters: while it is the bot's turn, nobody else can move.",
          "In the main trace, this bot playing Yellow at call 12 would have tried column 3 for Red, found it wins, and blocked it. A stronger bot puts minimax with alpha-beta pruning behind the same interface."
        ] }
      ]
    },
    {
      id: "board-size",
      title: "\"What if the board size changes, or the goal is five in a row?\"",
      kicker: "Follow-up: parameters",
      blocks: [
        { type: "text", html: `<p>This is the follow-up that rewards the direction-vector win check. Every method on Board already works from the dimensions and bounds checks; only the constants have to become fields. Game passes the numbers through and otherwise doesn't change, because it never knew the board's size.</p>` },
        { type: "code", lang: "java", title: "Board sized at construction", code: `final class Board {
    private static final int[][] DIRECTIONS = { {0, 1}, {1, 0}, {1, 1}, {1, -1} };
    private final int rows, cols, connect;            // immutable after construction
    private final Disc[][] grid;
    private final int[] heights;
    private int total;

    Board(int rows, int cols, int connect) {
        if (rows < 1 || cols < 1) throw new IllegalArgumentException("The board needs at least one cell");
        if (connect < 2 || connect > Math.max(rows, cols)) throw new IllegalArgumentException("A line of " + connect + " cannot fit");
        this.rows = rows;
        this.cols = cols;
        this.connect = connect;
        this.grid = new Disc[rows][cols];
        this.heights = new int[cols];
    }

    boolean canDrop(int col) { return col >= 0 && col < cols && heights[col] < rows; }
    boolean isFull()         { return total == rows * cols; }
    // drop and count are unchanged except that ROWS and COLS become rows and cols.

    boolean makesLine(int row, int col) {             // was makesFour
        Disc disc = grid[row][col];
        for (int[] d : DIRECTIONS) {
            if (1 + count(row, col, d[0], d[1], disc) + count(row, col, -d[0], -d[1], disc) >= connect) return true;
        }
        return false;
    }
}

// Game: Game(Player first, Player second, int rows, int cols, int connect)
//           creates new Board(rows, cols, connect) itself, so the board stays confined.` },
        { type: "keypoints", items: [
          "Changes: Board's constants become constructor parameters and <code>makesFour</code> becomes <code>makesLine</code>. Game's rules and validation are untouched.",
          "Game still creates its own Board from the numbers rather than accepting a Board object, so no outside code can hold a reference to the grid and change it without the lock.",
          "With a <code>WinChecker</code> class per direction, the same change would touch four classes. That is the concrete cost of the over-engineered version."
        ] },
        { type: "quiz", q: "Red's disc completes a horizontal four and also fills the last empty cell. What should the game report?", options: [
          "DRAW, because the board is full",
          "WON, because play checks for a line before checking for a full board",
          "IN_PROGRESS until the next move is attempted",
          "It depends on whose turn would be next"
        ], answer: 1, explain: `<p><code>play</code> calls <code>makesFour</code> first and only checks <code>isFull</code> if there was no line, so the board-filling winning move is a win. Swapping those two checks is a classic bug.</p>` }
      ]
    },
    {
      id: "many-games",
      title: "\"How would you run many games at once, over a network?\"",
      kicker: "Follow-up: scale and concurrency",
      blocks: [
        { type: "text", html: `<p>Because Game is an ordinary object that already locks itself, many games need only a registry that maps a game id to its Game. Moves for different games run in parallel; moves for the same game queue on that game's lock. The new concern is identity: on a network, the server must know who is really sending a move.</p>` },
        { type: "code", lang: "java", title: "A registry of games, each locking itself", code: `final class GameService {
    private final ConcurrentHashMap<String, Game> games = new ConcurrentHashMap<>();   // safe for concurrent start, play and end

    String start(Player a, Player b) {
        String id = UUID.randomUUID().toString();     // random and unguessable, unlike a counter
        games.put(id, new Game(a, b));
        return id;
    }

    /** caller comes from the authenticated session, never from a name or colour in the request body. */
    void play(String gameId, Player caller, int column) {
        Game game = games.get(gameId);
        if (game == null) throw new NoSuchElementException("No such game");
        game.play(caller, column);                    // Game serializes moves on its own lock
    }

    void end(String gameId) { games.remove(gameId); }  // finished or abandoned games must not pile up
}` },
        { type: "keypoints", items: [
          "Changes: a new <code>GameService</code>. Game and Board are untouched, because Game was never a singleton and already synchronizes itself.",
          "No extra lock in the service: <code>ConcurrentHashMap</code> makes lookups and inserts safe, and each Game guards its own state. A global lock would make every game wait for every other.",
          "<code>play(player, column)</code> pays off here: the service passes the authenticated player, and Game rejects anything out of turn. Taking the player from the request body would let anyone move for anyone.",
          "Spectators: Game keeps a list of listeners and notifies them after each move. Copy the event under the lock and notify outside it, so a slow spectator can't stall the players."
        ] },
        { type: "callout", tone: "warning", html: `<p>Remember to remove games. A registry that only grows is a memory leak: call <code>end</code> when a game finishes, and sweep games with no move for some time.</p>` }
      ]
    },
    {
      id: "pattern-restraint",
      title: "\"Shouldn't the win check be a Strategy?\"",
      kicker: "Follow-up: judgment",
      blocks: [
        { type: "text", html: `<p>Some interviewers ask this on purpose to see whether you reach for patterns by reflex. The honest answer is no, and the reasoning matters more than the verdict.</p>` },
        { type: "compare", items: [
          { title: "Four checker classes", tone: "bad", html: `<p>A <code>WinChecker</code> interface with Horizontal, Vertical and two Diagonal implementations. It looks object-oriented, but all four run the same loop with different step sizes, nothing ever swaps one for another, and Connect Four will never gain a fifth direction. Four files, four places to fix the same bug.</p>` },
          { title: "One loop over direction vectors", tone: "ok", html: `<p>Directions are data: (0,1), (1,0), (1,1), (1,-1). One <code>count</code> helper walks each way from the last disc. Shorter, one place to fix bugs, and connect-K is a one-constant change.</p>` }
        ] },
        { type: "text", html: `<p>A Strategy would earn its place if the <em>rules themselves</em> varied. For example, a variant where the board wraps around left to right, or where a player may pop their own disc out of the bottom row, changes what counts as a line or a move. Then a <code>Rules</code> interface with one implementation per variant, chosen when the game is created, is a fair design. The test is always the same: does behaviour genuinely differ, or do only numbers differ?</p>` },
        { type: "callout", tone: "interview", html: `<p>A good line: "I use Strategy when behaviour varies or is swapped, like pricing rules or payment methods. When only parameters vary, I pass parameters." In an easy problem, that kind of restraint is one of the clearest seniority signals you can give.</p>` }
      ]
    }
  ],
  takeaways: [
    "Each follow-up touches one or two classes: undo adds a history to Game and removeTop to Board; a bot is a separate MoveChooser on a board copy; sizes are Board constructor parameters; many games are a registry.",
    "Undo lives in Game because Game owns turns and outcome; restoring IN_PROGRESS is always correct because the game stops at the first line of four.",
    "Bots experiment on a snapshot taken under Game's lock, so thinking never blocks the game and never touches the real board.",
    "Many games need no global lock: a concurrent map plus one lock per game, with the moving player taken from the authenticated session.",
    "Parameterise the four directions; save Strategy for rule sets that genuinely behave differently."
  ]
};
