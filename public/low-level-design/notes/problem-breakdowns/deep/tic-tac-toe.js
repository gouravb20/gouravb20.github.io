// Deep dives: Tic-Tac-Toe (LLD practice set). Format: DeepDive in public/shared/notes.d.ts.
window.DEEP = window.DEEP || {};
DEEP["tic-tac-toe"] = {
  hook: `<p>Everyone can code a 3 x 3 game in twenty minutes, so the interview is decided by the follow-ups. You rarely implement them in full; you show which class changes and why the rest doesn't. Each one probes a different seam: the win rule (WinTracker), where moves come from (MoveSource), history (Game plus the inverse of each update), and concurrency (one lock per game, a registry, listeners outside the lock). Junior candidates may get none of these, mid-level one or two, senior candidates several.</p>`,
  sections: [
    {
      id: "k-in-a-row",
      title: "\"Now make it 10 x 10, and five in a row wins\"",
      kicker: "Follow-up: a new win rule",
      blocks: [
        { type: "problem", html: `<p>Gomoku-style rules break the counters silently. X at columns 0, 1, 2, 5 and 9 of one row sums to 5, but that is not five in a row. A sum knows how many marks a line holds, not whether they are adjacent.</p>` },
        { type: "text", html: `<p>The fix keeps the key idea from the main design: any new run must include the last move. Walk outward from it in four directions (across, down, and the two diagonals), counting matching symbols both ways, and win if 1 plus both counts reaches K. Capping each walk at K - 1 keeps the work at O(K) whatever the board size. <strong>Only the win check changes</strong>: <code>Board</code> already takes any size, and <code>play</code> still asks one question, "did this move win?".</p>` },
        { type: "code", lang: "java", title: "Run check for K in a row", code: `interface WinRule {
    /** Called after s has been placed at (row, col); true if this move wins. */
    boolean wins(Board board, int row, int col, Symbol s);
}

// WinTracker implements WinRule for K == N: wins(...) just calls record(row, col, s).

final class RunChecker implements WinRule {
    private static final int[][] DIRECTIONS = { {0, 1}, {1, 0}, {1, 1}, {1, -1} };
    private final int k;

    RunChecker(int k) { this.k = k; }

    public boolean wins(Board board, int row, int col, Symbol s) {
        for (int[] d : DIRECTIONS) {
            if (1 + count(board, row, col, d[0], d[1], s) + count(board, row, col, -d[0], -d[1], s) >= k) return true;
        }
        return false;
    }

    private int count(Board b, int row, int col, int dr, int dc, Symbol s) {
        int n = 0;
        for (int r = row + dr, c = col + dc; n < k - 1 && b.inside(r, c) && b.cell(r, c) == s; r += dr, c += dc) n++;
        return n;
    }
}

// Game constructor: WinRule rule = k == size ? new WinTracker(size) : new RunChecker(k);
// play() calls rule.wins(board, row, col, symbol) where it called tracker.record(row, col, symbol).` },
        { type: "compare", items: [
          { title: "Interface from the start", tone: "warn", html: `<p>With only the full-line rule in the requirements, a <code>WinRule</code> interface has one implementation and no caller that varies. It is speculative structure that the interviewer may ask you to justify.</p>` },
          { title: "Interface once two rules exist", tone: "ok", html: `<p>K in a row gives a real second rule with different costs (O(1) counters vs O(K) runs). Now a small interface chosen in the constructor keeps <code>play</code> free of an <code>if</code> and lets each rule be tested alone.</p>` }
        ] },
        { type: "keypoints", items: [
          "Changes: a new <code>RunChecker</code>, a one-method <code>WinRule</code>, and one line in the <code>Game</code> constructor. <code>Board</code>, <code>Player</code>, the turn loop and the order of checks in <code>play</code> are untouched.",
          "<code>RunChecker</code> is stateless and only reads the board it is given, so one instance can be shared by every game. <code>WinTracker</code> holds one game's counters, so each game needs its own, guarded by that game's lock.",
          "The draw rule is unchanged: a full board with no run of K. Spotting an early draw (no line can still reach K) is a further optimisation nobody requires."
        ] }
      ]
    },
    {
      id: "bot",
      title: "\"How would you add a computer opponent?\"",
      kicker: "Follow-up: a new move source",
      blocks: [
        { type: "text", html: `<p>The rules don't change for a bot. It is one more source of moves: given a view of the grid and its symbol, it returns a cell, and the turn loop calls <code>play</code> with it exactly as for a human. <strong>Game gains one method</strong>, a snapshot of the grid copied under its lock, so the bot's trial placements never touch the live board and never race with another thread's move. Nothing else in the core changes.</p>` },
        { type: "code", lang: "java", title: "Bot interface and grid helpers", code: `/** Chooses a move from a private copy of the grid; it may scribble on the copy but must restore it. */
interface MoveChooser { Cell choose(Symbol[][] grid, Symbol me); }

// Game: a copy taken under the game's lock.
synchronized Symbol[][] snapshot() {
    Symbol[][] copy = new Symbol[board.size()][board.size()];
    for (int r = 0; r < copy.length; r++)
        for (int c = 0; c < copy.length; c++) copy[r][c] = board.cell(r, c);
    return copy;
}

final class Grids {
    static Symbol other(Symbol s) { return s == Symbol.X ? Symbol.O : Symbol.X; }

    static List<Cell> empties(Symbol[][] g) {
        List<Cell> out = new ArrayList<>();
        for (int r = 0; r < g.length; r++)
            for (int c = 0; c < g.length; c++)
                if (g[r][c] == null) out.add(new Cell(r, c));
        return out;
    }

    static boolean wins(Symbol[][] g, Symbol s) {
        int n = g.length;
        boolean d = true, a = true;
        for (int i = 0; i < n; i++) {
            boolean row = true, col = true;
            for (int j = 0; j < n; j++) {
                row &= g[i][j] == s;
                col &= g[j][i] == s;
            }
            if (row || col) return true;
            d &= g[i][i] == s;
            a &= g[i][n - 1 - i] == s;
        }
        return d || a;
    }

    /** True if s playing at c would complete a line; leaves g unchanged. */
    static boolean winsAt(Symbol[][] g, Cell c, Symbol s) {
        g[c.row()][c.col()] = s;
        boolean win = wins(g, s);
        g[c.row()][c.col()] = null;
        return win;
    }
}` },
        { type: "code", lang: "java", title: "Rule-based bot", code: `final class RuleBot implements MoveChooser {
    public Cell choose(Symbol[][] g, Symbol me) {
        List<Cell> free = Grids.empties(g);
        if (free.isEmpty()) throw new IllegalStateException("No legal move");
        for (Cell c : free) if (Grids.winsAt(g, c, me)) return c;                 // 1. win now
        for (Cell c : free) if (Grids.winsAt(g, c, Grids.other(me))) return c;    // 2. block their win
        int mid = g.length / 2, last = g.length - 1;
        if (g[mid][mid] == null) return new Cell(mid, mid);                       // 3. centre
        for (Cell c : List.of(new Cell(0, 0), new Cell(0, last), new Cell(last, 0), new Cell(last, last)))
            if (g[c.row()][c.col()] == null) return c;                            // 4. a corner
        return free.get(0);                                                       // 5. anything
    }
}` },
        { type: "text", html: `<p>The rule bot never loses to a careless human, but a fork (one move that creates two winning threats, like Alice's move 7 in the Solution trace) beats it. Perfect play needs search. Minimax assumes both sides play their best; the negamax form uses one function by scoring every position from the side to move and negating as it recurses.</p>` },
        { type: "code", lang: "java", title: "Minimax bot (negamax form)", code: `/** Perfect play on 3 x 3. Scores are from the side to move: positive is a win, 0 a draw, negative a loss. */
final class MinimaxBot implements MoveChooser {
    public Cell choose(Symbol[][] g, Symbol me) {
        Cell best = null;
        int bestScore = Integer.MIN_VALUE;
        for (Cell c : Grids.empties(g)) {
            g[c.row()][c.col()] = me;
            int score = -negamax(g, Grids.other(me), 1);
            g[c.row()][c.col()] = null;
            if (score > bestScore) { bestScore = score; best = c; }
        }
        if (best == null) throw new IllegalStateException("No legal move");
        return best;
    }

    private int negamax(Symbol[][] g, Symbol toMove, int depth) {
        if (Grids.wins(g, Grids.other(toMove))) return depth - 10;   // the last mover won; a later loss scores higher
        List<Cell> free = Grids.empties(g);
        if (free.isEmpty()) return 0;                                 // draw
        int best = Integer.MIN_VALUE;
        for (Cell c : free) {
            g[c.row()][c.col()] = toMove;
            best = Math.max(best, -negamax(g, Grids.other(toMove), depth + 1));
            g[c.row()][c.col()] = null;
        }
        return best;
    }
}` },
        { type: "table", headers: ["Board", "Plain minimax", "What makes it practical"], rows: [
          ["3 x 3", "At most 9! = 362,880 move orders: milliseconds", "Nothing; two minimax bots always draw"],
          ["4 x 4", "Up to 16! orders: far too slow", "Alpha-beta pruning plus a transposition table keyed by the board"],
          ["Larger N, K in a row", "Hopeless", "A depth limit with a heuristic score (open runs), or Monte Carlo tree search"]
        ] },
        { type: "callout", tone: "insight", html: `<p>Scoring a win as <code>depth - 10</code> rather than a flat value makes the bot prefer a quick win and a slow loss. Without it, a bot with a win available may wander, because every winning line scores the same.</p>` }
      ]
    },
    {
      id: "undo",
      title: "\"Can players undo a move?\"",
      kicker: "Follow-up: history",
      blocks: [
        { type: "text", html: `<p>Undo needs a history, so <code>Move</code> finally becomes a record. Three classes change, each in a small, symmetric way: <strong>Game</strong> pushes a move in <code>play</code> and pops it in <code>undo</code>; <strong>Board</strong> gains <code>clear</code>; <strong>WinTracker</strong> gains <code>unrecord</code>, the exact inverse of <code>record</code>. This is where the counters pay off a second time: adding a delta is trivially reversible, so the tracker steps back without rescanning anything.</p>` },
        { type: "code", lang: "java", title: "Undo with a move stack", code: `record Move(Player player, int row, int col) {}

// Game: guarded by the same monitor as everything else.
private final Deque<Move> history = new ArrayDeque<>();

synchronized void play(Player player, int row, int col) {
    // ... validation and placement as before ...
    history.push(new Move(player, row, col));
    // ... win / draw / switch turn as before ...
}

synchronized boolean undo() {
    if (history.isEmpty()) return false;
    Move last = history.pop();
    board.clear(last.row(), last.col());                           // Board.clear empties the cell and decrements filled
    tracker.unrecord(last.row(), last.col(), last.player().symbol());
    current = last.player();
    state = GameState.IN_PROGRESS;                                  // the position before the last move had no winner
    winner = null;
    return true;
}

// WinTracker: the exact inverse of record.
void unrecord(int row, int col, Symbol s) {
    int d = s == Symbol.X ? -1 : 1;
    rows[row] += d;
    cols[col] += d;
    if (row == col) diag += d;
    if (row + col == n - 1) anti += d;
}` },
        { type: "keypoints", items: [
          "Restoring IN_PROGRESS is always right: the game stops at the first win, so the position before the last move had no winner and no full board.",
          "Undo and play share one lock, so an undo can never interleave with a move and leave the counters out of step with the grid.",
          "Against a bot, undo two moves (the bot's and the human's) so the human is to move again.",
          "Redo is a second stack, cleared whenever a new move is played; replays and saved games reuse the same Move records."
        ] },
        { type: "callout", tone: "mistake", html: `<p>Forgetting to reverse the counters is the classic bug: the grid looks right after undo, but the tracker still counts the old move and can report a phantom win several moves later.</p>` }
      ]
    },
    {
      id: "concurrent-games",
      title: "\"How would you host thousands of games on one server?\"",
      kicker: "Follow-up: concurrency",
      blocks: [
        { type: "text", html: `<p>Online, every move is an HTTP or WebSocket request handled on some pool thread, and two requests for the same game can arrive together. The design already has the right unit: each <code>Game</code> serializes its own moves with its own lock. <strong>Game does not change at all.</strong> What is missing is a registry that many threads can read and write at once, created once at startup and injected into the request handlers, not a Singleton.</p>` },
        { type: "code", lang: "java", title: "A registry of games", code: `/** Thread-safe: the map is a ConcurrentHashMap, and each Game guards its own state with its own lock. */
final class GameManager {
    private final ConcurrentHashMap<String, Game> games = new ConcurrentHashMap<>();

    String create(Player x, Player o, int size) {
        Game game = new Game(x, o, size);           // validate before publishing
        String id = UUID.randomUUID().toString();   // unguessable: SecureRandom underneath
        games.put(id, game);
        return id;
    }

    void play(String gameId, Player player, int row, int col) {
        find(gameId).play(player, row, col);         // the game's lock serializes moves within it
    }

    GameState state(String gameId) { return find(gameId).state(); }

    /** Atomically removes a finished game; a game still in progress is kept. */
    void evictIfOver(String gameId) {
        games.computeIfPresent(gameId, (id, g) -> g.state() == GameState.IN_PROGRESS ? g : null);
    }

    private Game find(String gameId) {
        Game g = games.get(gameId);
        if (g == null) throw new NoSuchElementException("No game " + gameId);
        return g;
    }
}` },
        { type: "compare", items: [
          { title: "Weak: one lock for every game", tone: "bad", html: `<p>A fully <code>synchronized</code> GameManager is correct but makes every move on the server wait for every other move, even in unrelated games. Throughput stops at one move at a time.</p>` },
          { title: "Good: one actor per game", tone: "warn", html: `<p>Each game owns a single thread or goroutine that drains a mailbox of moves. No locks inside the game, at the cost of a queue and a reply channel per request and a thread per live game. Worth it when the interviewer pushes toward WebSockets and pushing updates to clients.</p>` },
          { title: "Strong: lock per game, concurrent map", tone: "ok", html: `<p>Lookups are lock-free reads on the map; only requests for the same game contend, which is exactly the contention the rules require. Lock order is fixed (map bin, then game, never the reverse), so there is no deadlock.</p>` }
        ] },
        { type: "keypoints", items: [
          "Passing the Player into <code>play</code> pays off here: a request that arrives out of turn is rejected by the game, not by fragile checks in the handler.",
          "Resolve the Player from the authenticated session, never from a name or symbol in the request body, or anyone can move for their opponent.",
          "Avoid get-then-put in the manager; <code>put</code> of a fresh UUID, <code>computeIfPresent</code> and <code>remove(key, value)</code> are each atomic."
        ] },
        { type: "quiz", q: "Alice's client double-sends her move: two requests for (1,1) arrive on two threads at the same instant. What happens?", options: ["Both succeed and Alice gets two turns", "One succeeds; the other is rejected because it is now Bob's turn", "Both fail because the cell is contested", "The ConcurrentHashMap rejects the duplicate"], answer: 1, explain: `<p>The game's lock lets one request in first: it places X at (1,1) and passes the turn to Bob. The second request then fails the turn check ("It is Bob's turn"), and the game is unchanged. The map plays no part; it only finds the game.</p>` }
      ]
    },
    {
      id: "scoreboard",
      title: "\"Keep a scoreboard across games\"",
      kicker: "Follow-up: reacting to results",
      blocks: [
        { type: "text", html: `<p>Now there is a real reason for the Observer pattern: something outside the game wants to hear when it ends. <strong>Game gains a listener list</strong> and calls it once, on the move that ends the game; a new <strong>Scoreboard</strong> listens to every game. Board, WinTracker and the rules are untouched. The concurrency details are what the interviewer is checking: listeners are called outside the game's lock, and the shared scoreboard updates atomically.</p>` },
        { type: "code", lang: "java", title: "Scoreboard as a game listener", code: `interface GameListener { void onGameOver(GameState result, Optional<Player> winner); }

// Game: listeners may be added from any thread; CopyOnWriteArrayList is safe to iterate without the game's lock.
private final List<GameListener> listeners = new CopyOnWriteArrayList<>();

void addListener(GameListener l) { listeners.add(l); }

void play(Player player, int row, int col) {            // no longer synchronized as a whole
    GameState result;
    Optional<Player> won;
    synchronized (this) {
        applyMove(player, row, col);                    // the old body of play; throws on an invalid move
        result = state;
        won = Optional.ofNullable(winner);
    }
    if (result != GameState.IN_PROGRESS) {              // only the ending move gets here: later moves throw above
        for (GameListener l : listeners) l.onGameOver(result, won);   // outside the lock
    }
}

/** Shared by every game and called from many threads at once. */
final class Scoreboard implements GameListener {
    private final ConcurrentHashMap<String, Integer> wins = new ConcurrentHashMap<>();
    private final AtomicInteger draws = new AtomicInteger();

    public void onGameOver(GameState result, Optional<Player> winner) {
        if (result == GameState.DRAW) draws.incrementAndGet();
        else winner.ifPresent(p -> wins.merge(p.name(), 1, Integer::sum));   // atomic read-modify-write
    }

    int winsFor(String name) { return wins.getOrDefault(name, 0); }
    int draws()              { return draws.get(); }
}` },
        { type: "keypoints", items: [
          "Calling listeners outside the lock means a slow or blocking listener (a database write, a network push) can never stall moves in the game, and a listener that calls back into the game cannot deadlock.",
          "<code>wins.merge(name, 1, Integer::sum)</code> is one atomic step. Reading with <code>getOrDefault</code> and then calling <code>put</code> loses updates when two games end at the same moment, even on a ConcurrentHashMap.",
          "A plain ArrayList of listeners breaks if one thread adds a listener while another notifies; CopyOnWriteArrayList suits a list that is read often and changed rarely.",
          "On a real server, key the scores by a stable player id from the session rather than a display name, which two people can share."
        ] },
        { type: "callout", tone: "interview", html: `<p>This is the place to mention the Observer pattern, not the core design. Bringing it in before anyone asked for a scoreboard or spectators is structure without a requirement; bringing it in here, with the lock and atomicity details right, is a strong senior signal.</p>` }
      ]
    }
  ],
  takeaways: [
    "Follow-ups should touch one or two classes: the win rule for K in a row, a move source for a bot, Game plus inverse updates for undo, a registry for many games, a listener for a scoreboard.",
    "Counters work only when the whole line must match; for K in a row, walk outward from the last move in O(K), and introduce WinRule only now.",
    "A bot is just another move source working on a snapshot copied under the game's lock; minimax is perfect on 3 x 3 and needs pruning beyond it.",
    "Undo is a move stack plus the exact inverse of each update, all under the same lock as play.",
    "For many games: a ConcurrentHashMap registry created at startup and injected, a lock per game, and player identity from the session.",
    "Observers earn their place with a scoreboard: notify outside the lock, and update shared counts with atomic operations such as merge."
  ]
};
