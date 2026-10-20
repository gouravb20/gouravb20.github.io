// Deep dives: Connect Four (LLD). Format: DeepDive in public/shared/notes.d.ts.
window.DEEP = window.DEEP || {};
DEEP["connect-four"] = {
  hook: `<p>The core game is small on purpose. Follow-ups check that the Game/Board split was right: undo, a computer opponent, other board sizes, and several games played at once over a network.</p>`,
  sections: [
    {
      id: "pattern-restraint",
      title: "When not to use a pattern",
      kicker: "Judgment",
      blocks: [
        { type: "compare", items: [
          { title: "Four checker classes", tone: "bad", html: `<p>A <code>WinChecker</code> interface with Horizontal, Vertical and two Diagonal implementations. It looks object-oriented, but the four classes run the same loop with different numbers, and the rules of Connect Four will never gain a fifth direction.</p>` },
          { title: "One loop over direction vectors", tone: "ok", html: `<p>Directions are data: (0,1), (1,0), (1,1), (1,-1). One <code>count</code> helper walks each way from the last disc. Shorter, one place to fix bugs, and trivially changed to "connect K".</p>` }
        ] },
        { type: "callout", tone: "interview", html: `<p>Use Strategy when behaviour genuinely varies or will be swapped (pricing rules, payment methods). When only parameters vary, pass parameters. Saying this out loud is a strong signal in an easy problem.</p>` }
      ]
    },
    {
      id: "undo",
      title: "Undo and move history",
      kicker: "Follow-up",
      blocks: [
        { type: "code", lang: "java", title: "A move stack in Game, one helper in Board", code: `record Move(Player player, int row, int col) {}

// Game
private final Deque<Move> history = new ArrayDeque<>();

void play(Player player, int column) {
    // ... validation as before ...
    int row = board.drop(column, player.disc());
    history.push(new Move(player, row, column));
    // ... win / draw / switch turn as before ...
}

boolean undo() {
    if (history.isEmpty()) return false;
    Move last = history.pop();
    board.clear(last.row(), last.col());     // package-private: empties the cell, decrements filled[col]
    current = last.player();
    state = GameState.IN_PROGRESS;           // the previous position had no winner
    winner = null;
    return true;
}` },
        { type: "keypoints", items: [
          "Undo lives in Game because Game controls turns and outcome; Board only learns to clear one cell.",
          "Because the game ends on the first four-in-a-row, the position before any move had no winner, so restoring IN_PROGRESS is correct.",
          "Redo is a second stack; replays and saved games reuse the same Move records."
        ] }
      ]
    },
    {
      id: "bot",
      title: "A computer opponent",
      kicker: "Follow-up",
      blocks: [
        { type: "text", html: `<p>The rules don't change: the bot just chooses a column, and the game loop calls <code>play(current, column)</code>. Keep <code>Player</code> as data and put the decision-making in a separate component.</p>` },
        { type: "code", lang: "java", title: "Win, block, else prefer the centre", code: `interface MoveChooser { int choose(Game game, Player me, Player opponent); }

final class SimpleBot implements MoveChooser {
    private static final int[] PREFERENCE = { 3, 2, 4, 1, 5, 0, 6 };   // centre columns first

    public int choose(Game game, Player me, Player opponent) {
        for (int col : PREFERENCE) if (game.wouldWin(me, col)) return col;        // take a win
        for (int col : PREFERENCE) if (game.wouldWin(opponent, col)) return col;  // block a loss
        for (int col : PREFERENCE) if (game.canDrop(col)) return col;
        throw new IllegalStateException("No legal move");
    }
}
// wouldWin simulates a drop on a copy of the board (or drops, checks and clears).` },
        { type: "callout", tone: "tip", html: `<p>A strong bot searches ahead with minimax and alpha-beta pruning, scoring positions by open threes and centre control. Mention it; you won't be asked to write it.</p>` }
      ]
    },
    {
      id: "many-games",
      title: "Several games at once, over a network",
      kicker: "Follow-up: scale",
      blocks: [
        { type: "code", lang: "java", title: "A registry of games, each safe on its own", code: `final class GameService {
    private final ConcurrentHashMap<String, Game> games = new ConcurrentHashMap<>();

    String start(Player a, Player b) {
        String id = UUID.randomUUID().toString();
        games.put(id, new Game(a, b));
        return id;
    }

    void play(String gameId, Player p, int column) {
        Game g = games.get(gameId);
        if (g == null) throw new IllegalArgumentException("No such game");
        synchronized (g) { g.play(p, column); }      // moves in one game are serialized
    }
}` },
        { type: "keypoints", items: [
          "Taking the player as a parameter of <code>play</code> pays off here: network moves arrive tagged with who sent them, and Game rejects out-of-turn moves.",
          "Lock per game: different games never contend.",
          "Spectators subscribe to a game's move events (Observer)."
        ] },
        { type: "quiz", q: "Red drops a disc that completes a horizontal four and also fills the last empty cell. What should the state be?", options: ["DRAW, because the board is full", "WON, because the win is checked before the draw", "IN_PROGRESS until the next move", "It depends on whose turn is next"], answer: 1, explain: `<p>The win check runs first, so the move that fills the board with four in a row is a win. Checking for a full board first would wrongly call it a draw.</p>` }
      ]
    }
  ],
  takeaways: [
    "Parameterise the four directions; don't create a class per direction.",
    "Undo is a move stack in Game plus one clear-cell helper in Board.",
    "A bot is a separate move chooser; the rules and Player stay unchanged.",
    "Many games: a registry with a lock per game; spectators observe move events."
  ]
};
