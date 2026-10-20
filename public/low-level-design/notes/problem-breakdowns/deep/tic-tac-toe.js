// Deep dives: Tic-Tac-Toe (LLD). Format: DeepDive in public/shared/notes.d.ts.
window.DEEP = window.DEEP || {};
DEEP["tic-tac-toe"] = {
  hook: `<p>Everyone can code a 3 x 3 game in twenty minutes, so the interview is decided by the follow-ups. Each one probes a different part of the design: the win check (can you make it O(1), and do you know when that trick stops working?), the model (can a bot or undo be added without touching the rules?) and the concurrency story (what happens when two requests hit the same game, or ten thousand games share one server?).</p><p>This page takes those follow-ups in the order interviewers usually push them.</p>`,
  sections: [
    {
      id: "win-check",
      title: "Scanning vs counting: the O(1) win check",
      kicker: "Follow-up: performance",
      blocks: [
        { type: "text", html: `<p>A move can only complete a line that passes through the cell just marked, so scanning the whole board is never needed. Checking just the row, column and (if relevant) the two diagonals through that cell is O(n) and is a perfectly good first answer.</p>` },
        { type: "code", lang: "java", title: "Scanning the lines through the last move", code: `// Board: O(n) per move and no extra state.
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
        { type: "text", html: `<p>The counters in <code>WinTracker</code> remove even that loop. Each move updates at most four integers and the check reads the same four, so the cost no longer depends on n. The price is O(n) extra memory and one more object to keep in sync with the board (which is why only <code>Game</code> ever calls both).</p>` },
        { type: "table", headers: ["Approach", "Time per move", "Extra memory", "Works for K &lt; N?"], rows: [
          ["Scan the whole board", "O(n&sup2;)", "None", "Yes, but wasteful"],
          ["Scan the lines through the last move", "O(n)", "None", "No (checks full lines only)"],
          ["Per-line counters (+1 / -1)", "O(1)", "O(n)", "No: a sum can't see gaps"],
          ["Run check outward from the last move", "O(K)", "None", "Yes"]
        ] },
        { type: "callout", tone: "interview", html: `<p>Lead with the O(n) scan through the last move, then offer the counters as the optimisation. Jumping straight to the trick without the simpler version can look memorised; showing both shows you know what the trick buys.</p>` },
        { type: "quiz", q: "On a 3 x 3 board, row 0 holds X, O, X. What is rows[0] in the WinTracker, and can that row still be won?", options: ["3, and X has won", "1, and X can still win it", "1, and nobody can win it", "-1, and O can still win it"], answer: 2, explain: `<p>The sum is +1 - 1 + 1 = 1. All three cells are filled and mixed, so the row is dead; a counter only reaches plus or minus 3 when every cell holds the same symbol.</p>` }
      ]
    },
    {
      id: "k-in-a-row",
      title: "N x N with K in a row",
      kicker: "Follow-up: generalise",
      blocks: [
        { type: "problem", html: `<p>"Now make it 10 x 10, five in a row wins" (Gomoku-style). The counters silently give wrong answers: X at columns 0, 1, 2, 5 and 9 of one row sums to 5 but is not five in a row. A sum knows how many, not whether they are adjacent.</p>` },
        { type: "text", html: `<p>The fix is the same idea as Connect Four: any new run must include the last move, so walk outward from it in four directions and count matching symbols both ways. Capping each walk at K - 1 keeps the work at O(K) no matter how big the board is.</p>` },
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

// Game constructor: WinRule rule = k == size ? new WinTracker(size) : new RunChecker(k);` },
        { type: "compare", items: [
          { title: "Interface from the start", tone: "warn", html: `<p>With only the full-line rule in the requirements, a <code>WinRule</code> interface has one implementation and no caller that varies. It is speculative structure.</p>` },
          { title: "Interface once two rules exist", tone: "ok", html: `<p>K-in-a-row gives a real second rule with different costs (O(1) counters vs O(K) runs). Now a small interface chosen at construction removes an <code>if</code> from <code>play</code> and lets each rule be tested alone.</p>` }
        ] },
        { type: "callout", tone: "tip", html: `<p>RunChecker is stateless and only reads the board, so it is safe to share across games. WinTracker holds counters for one game, so each game needs its own instance, created inside the game and guarded by the game's lock.</p>` }
      ]
    },
    {
      id: "bot",
      title: "A computer opponent: rules first, then minimax",
      kicker: "Follow-up: AI player",
      blocks: [
        { type: "text", html: `<p>The rules don't change for a bot. It is one more source of moves: given a view of the board and its symbol, it returns a cell, and the turn loop calls <code>play</code> with it exactly as for a human. The bot works on a <strong>snapshot</strong> copied under the game's lock, so its trial placements never touch the live board and never race with another thread's move.</p>` },
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
        { type: "text", html: `<p>The rule bot is good enough to never lose to a careless human, but it can be beaten by a fork (a move that creates two winning threats at once). Perfect play needs search. Minimax assumes both sides play their best; the negamax form uses one function by scoring every position from the point of view of the side to move and negating as it recurses.</p>` },
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
          ["3 x 3", "At most 9! = 362,880 move orders: milliseconds", "Nothing; optionally cache the first move"],
          ["4 x 4", "Up to 16! orders: far too slow", "Alpha-beta pruning plus a transposition table keyed by board"],
          ["Larger N, K in a row", "Hopeless", "Depth limit with a heuristic score (open runs), or Monte Carlo tree search"]
        ] },
        { type: "callout", tone: "insight", html: `<p>Using <code>depth - 10</code> rather than a flat -1 makes the bot prefer a quick win and a slow loss. Without it, a bot that has a win available may wander, because every winning line scores the same.</p>` }
      ]
    },
    {
      id: "undo",
      title: "Undo with reversible counters",
      kicker: "Follow-up: history",
      blocks: [
        { type: "text", html: `<p>Undo is where the counter design pays off a second time: adding a delta is trivially reversible, so the tracker can step back exactly without rescanning the board. A boolean "row 0 is complete" flag could not be undone this cleanly.</p>` },
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
    board.clear(last.row(), last.col());                          // empties the cell, decrements filled
    tracker.unrecord(last.row(), last.col(), last.player().symbol());
    current = last.player();
    state = GameState.IN_PROGRESS;                                 // the position before any move had no winner
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
          "Redo is a second stack that is cleared whenever a new move is played; replays and saved games reuse the same Move records."
        ] },
        { type: "callout", tone: "mistake", html: `<p>Forgetting to reverse the counters is the classic bug here: the grid looks right after undo, but the tracker still thinks the old move is there and can report a phantom win several moves later.</p>` }
      ]
    },
    {
      id: "concurrent-games",
      title: "Many games at once on one server",
      kicker: "Follow-up: concurrency",
      blocks: [
        { type: "text", html: `<p>Online, every move is an HTTP or WebSocket request handled on some pool thread, and two requests for the same game can arrive together. The design already has the right unit: each <code>Game</code> serializes its own moves with its own monitor. What is missing is a registry that many threads can read and write at once.</p>` },
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
          { title: "One lock for every game", tone: "bad", html: `<p>A <code>synchronized</code> GameManager is correct but makes every move on the server wait for every other move, even in unrelated games. Throughput stops at one move at a time.</p>` },
          { title: "Lock per game, concurrent map", tone: "ok", html: `<p>Lookups are lock-free reads on the map; only requests for the same game contend, which is exactly the contention the rules require. Lock order is fixed (map bin, then game, never the reverse), so there is no deadlock.</p>` },
          { title: "One actor per game", tone: "info", html: `<p>Each game owns a single thread or goroutine that drains a mailbox of moves. No locks in the game at all, at the cost of a queue and a reply channel per request. A good answer when the interviewer pushes toward WebSockets and push updates.</p>` }
        ] },
        { type: "keypoints", items: [
          "Passing the Player into <code>play</code> pays off here: a request that arrives out of turn is rejected by the game, not by fragile checks in the handler.",
          "Resolve the Player from the authenticated session, never from a name or symbol in the request body, or anyone can move for their opponent.",
          "Avoid get-then-put in the manager; <code>put</code> of a fresh UUID, <code>computeIfPresent</code> and <code>remove(key, value)</code> are each atomic.",
          "Spectators can subscribe to a game's move events (Observer); publish them after releasing the game's lock so a slow listener can't stall play."
        ] },
        { type: "quiz", q: "Alice's client double-sends her move: two requests for (1,1) arrive on two threads at the same instant. What happens?", options: ["Both succeed and Alice gets two turns", "One succeeds; the other is rejected because it is now Bob's turn", "Both fail because the cell is contested", "The ConcurrentHashMap rejects the duplicate"], answer: 1, explain: `<p>The game's lock lets one request in first: it places X at (1,1) and passes the turn to Bob. The second request then fails the turn check ("It is Bob's turn"), and the game is unchanged. The map plays no part; it only finds the game.</p>` }
      ]
    }
  ],
  takeaways: [
    "Check only the lines through the last move; per-line counters (+1 for X, -1 for O) make that O(1).",
    "Counters work only when the whole line must match; for K in a row, walk outward from the last move in O(K).",
    "Introduce a WinRule interface when a second rule actually exists, not before.",
    "A bot is just another move source working on a snapshot; minimax is perfect on 3 x 3 and needs pruning beyond it.",
    "Undo is a move stack plus the inverse counter update, all under the game's lock.",
    "For many games: a ConcurrentHashMap registry and a lock per game, with player identity from the session."
  ]
};
