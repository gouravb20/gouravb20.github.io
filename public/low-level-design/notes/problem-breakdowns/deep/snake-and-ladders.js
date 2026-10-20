// Deep dives: Snake and Ladders (LLD). Format: DeepDive in public/shared/notes.d.ts.
window.DEEP = window.DEEP || {};
DEEP["snake-and-ladders"] = {
  hook: `<p>The basic game fits in three small classes, so the interviewer spends the second half pushing on the edges: what makes a board invalid, how you test something built on random rolls, how a house rule gets added without an if-chain, who runs the game loop, and what changes when a server hosts thousands of games at once.</p>`,
  sections: [
    {
      id: "board-validation",
      title: "Validating the board once",
      kicker: "Follow-up: correctness",
      blocks: [
        { type: "text", html: `<p>Every check that could fail at runtime is moved into the Board constructor. After that, <code>resolve(cell)</code> is a single map lookup that can never loop, and no other class needs to defend against a strange board.</p>` },
        { type: "table", headers: ["Rule", "Why"], rows: [
          ["A snake's head is above its tail", "Otherwise it is a ladder by another name, and the input was probably mistyped"],
          ["A ladder's foot is below its top", "Same reason, in the other direction"],
          ["No jump starts on the last cell or off the board", "A snake on 100 would make winning impossible; an off-board cell can never be reached"],
          ["At most one jump starts on any cell", "Two destinations for one cell is ambiguous"],
          ["No jump ends on another jump's start", "Rules out chains, and with them cycles such as 10 up to 20 and 20 down to 10"]
        ] },
        { type: "text", html: `<p>Some versions of the game do allow chains: a ladder that ends on a snake's head sends you straight down. If the interviewer wants that, keep resolution constant-time by following each chain once at build time, and reject cycles there instead.</p>` },
        { type: "code", lang: "java", title: "Allowing chains, rejecting cycles", code: `/** Variant: a jump may land on another jump's start. Follow each chain once at build time and reject cycles. */
static Map<Integer, Integer> flatten(Map<Integer, Integer> jumps) {
    Map<Integer, Integer> flat = new HashMap<>();
    for (int start : jumps.keySet()) {
        Set<Integer> seen = new HashSet<>();
        int cell = start;
        while (jumps.containsKey(cell)) {
            if (!seen.add(cell)) throw new IllegalArgumentException("Jumps form a cycle through " + cell);
            cell = jumps.get(cell);
        }
        flat.put(start, cell);
    }
    return Map.copyOf(flat);    // resolve() stays a single lookup
}` },
        { type: "callout", tone: "tip", html: `<p>Ask which behaviour they want before coding. "I'll reject chains, which also makes cycles impossible; if chains are allowed I'd flatten them at construction" shows you saw the cycle risk without over-building.</p>` }
      ]
    },
    {
      id: "deterministic-dice",
      title: "Deterministic dice and testing",
      kicker: "Follow-up: testing",
      blocks: [
        { type: "text", html: `<p>The Dice interface exists because of a real force: a test of "landing on 25 slides you to 2" must not depend on luck. The same seam handles every dice follow-up (two dice, a crooked die, a die that only rolls sixes for a demo) without touching Game. That is what justifies a Strategy here; a pattern added "for flexibility" with no such force would be noise.</p>` },
        { type: "table", headers: ["Approach", "Deterministic?", "Verdict"], rows: [
          ["Call new Random() inside Game", "No", "Untestable without luck or reflection"],
          ["Mock Random with a mocking library", "Yes", "Works, but couples tests to how Game uses Random"],
          ["Inject ScriptedDice with a list of rolls", "Yes", "Clear and framework-free; the rolls read like the test's story"],
          ["Inject RandomDice with a fixed seed", "Yes", "Good for replaying a reported game; the rolls are not obvious from the test"]
        ] },
        { type: "code", lang: "java", title: "Crooked dice", code: `/** A classic follow-up: a crooked die that only rolls even numbers. One new class; Game is untouched. */
final class CrookedDice implements Dice {
    private final Random random;

    CrookedDice(long seed) { this.random = new Random(seed); }

    public int roll() { return 2 * (random.nextInt(3) + 1); }   // 2, 4 or 6
}` },
        { type: "code", lang: "java", title: "Deterministic tests with scripted dice", code: `@Test
void ladderOvershootAndRanking() {
    Board board = new Board(10, Map.of(9, 2), Map.of(3, 8));
    Player a = new Player("A"), b = new Player("B");
    Game game = new Game(board, new ScriptedDice(3, 1, 4, 2, 2), List.of(a, b));

    assertEquals(MoveKind.LADDER, game.playTurn().kind());     // A: 3, ladder to 8
    assertEquals(MoveKind.NORMAL, game.playTurn().kind());     // B: 1
    TurnResult over = game.playTurn();                         // A: 8 + 4 = 12, past 10
    assertEquals(MoveKind.OVERSHOOT, over.kind());
    assertEquals(8, over.to());
    assertEquals(MoveKind.LADDER, game.playTurn().kind());     // B: 1 + 2 = 3, ladder to 8
    assertEquals(MoveKind.FINISHED, game.playTurn().kind());   // A: 8 + 2 = 10 exactly
    assertEquals(GameState.FINISHED, game.state());
    assertEquals(List.of(a, b), game.ranking());
}

@Test
void threeSixesCancelTheTurn() {
    Board board = new Board(30, Map.of(), Map.of());
    Player a = new Player("A"), b = new Player("B");
    Game game = new Game(board, new ScriptedDice(6, 6, 6), List.of(a, b));

    game.playTurn();                                           // A: 6, rolls again
    game.playTurn();                                           // A: 12, rolls again
    assertEquals(MoveKind.FORFEIT, game.playTurn().kind());
    assertEquals(0, game.position(a));                         // back to where the turn began
    assertEquals(b, game.currentPlayer());
}` },
        { type: "callout", tone: "interview", html: `<p>Mention seeded replays: log each game's seed, and a player's "the dice cheated me" report can be reproduced turn by turn. It shows you think about operating the system, not just writing it.</p>` }
      ]
    },
    {
      id: "rule-variations",
      title: "Rule variations without an if-chain",
      kicker: "Follow-up: extensibility",
      blocks: [
        { type: "text", html: `<p>House rules are the most common follow-up. The trap is a growing ladder of <code>if (variant == ...)</code> inside <code>playTurn()</code>. Sort each rule by what kind of change it is: a number or an on/off switch is plain data; a rule whose <em>behaviour</em> differs gets a small strategy.</p>` },
        { type: "table", headers: ["Variation", "Kind of change", "Where it lives"], rows: [
          ["Board size, number of dice", "A number", "Board and RandomDice constructors"],
          ["Sixes before a turn is cancelled", "A number", "Rules.maxSixes"],
          ["Extra roll on a six", "On/off", "Rules.extraTurnOnSix"],
          ["Stop at the first winner", "On/off", "Rules.playUntilOneLeft"],
          ["Overshoot: stay, bounce back or finish anyway", "Different behaviour", "An Overshoot enum with one method"],
          ["Crooked or loaded dice", "Different behaviour", "Another Dice implementation"]
        ] },
        { type: "code", lang: "java", title: "Rules as data plus one strategy", code: `/** Where a roll that passes the last cell lands. The behaviour differs, so each constant carries its own. */
enum Overshoot {
    STAY        { int land(int from, int roll, int size) { return from; } },
    BOUNCE_BACK { int land(int from, int roll, int size) { return 2 * size - (from + roll); } },
    FINISH      { int land(int from, int roll, int size) { return size; } };

    abstract int land(int from, int roll, int size);
}

/** Knobs that are only numbers or on/off stay plain data. */
record Rules(int maxSixes, boolean extraTurnOnSix, boolean playUntilOneLeft, Overshoot overshoot) {
    static Rules classic() { return new Rules(3, true, true, Overshoot.STAY); }
    static Rules quick()   { return new Rules(Integer.MAX_VALUE, false, false, Overshoot.FINISH); }
}

// Inside playTurn(): each rule is read once, with no branching on rule names.
int target = from + roll;
int cell = target > board.size() ? rules.overshoot().land(from, roll, board.size()) : target;
int to = board.resolve(cell);
boolean again = rules.extraTurnOnSix() && roll == SIX;` },
        { type: "compare", items: [
          { title: "A class per rule", tone: "bad", html: `<p>An <code>ExtraTurnOnSixRule</code>, a <code>MaxSixesRule</code> and a rule engine to run them. Three booleans and an int become a framework, and the order the rules run in becomes a new source of bugs.</p>` },
          { title: "A Rules record and one enum", tone: "ok", html: `<p>The record is immutable, so one instance can be shared by many games. The enum covers the only rule whose behaviour truly varies, and adding a fourth overshoot policy is one more constant.</p>` }
        ] },
        { type: "callout", tone: "mistake", html: `<p>Clamping an overshoot to the last cell (<code>Math.min(from + roll, size)</code>) silently changes the rules to "finish anyway". If that is the variant you want, make it an explicit policy, not a side effect of a bounds check.</p>` }
      ]
    },
    {
      id: "step-api",
      title: "A step-wise API, not a game loop",
      kicker: "Follow-up: API design",
      blocks: [
        { type: "compare", items: [
          { title: "Game.play() runs the whole loop", tone: "bad", html: `<p>It rolls, prints to the console and only returns when someone has won. A test can only check the final ranking, a UI can't animate between turns, and a server thread is held for the whole game.</p>` },
          { title: "playTurn() applies one roll", tone: "ok", html: `<p>It returns a <code>TurnResult</code> describing what happened. A console loop, a test, a UI timer and a request handler are all just different callers. Printing belongs to the caller.</p>` }
        ] },
        { type: "text", html: `<p>Once something other than one loop drives the game, several threads may touch it: a timer thread plays turns while the UI thread reads positions to draw the board. That is why Game's methods are synchronized rather than relying on "only one thread will ever use it".</p>` },
        { type: "code", lang: "java", title: "A timer-driven driver", code: `/** Plays one turn a second on its own thread while the UI thread reads state(); Game's locking makes that safe. */
final class AutoPlayer {
    private final ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor();

    void start(Game game, Consumer<TurnResult> onTurn) {
        timer.scheduleAtFixedRate(() -> {
            if (game.state() == GameState.FINISHED) { timer.shutdown(); return; }
            onTurn.accept(game.playTurn());
        }, 0, 1, TimeUnit.SECONDS);
    }
}` },
        { type: "keypoints", items: [
          "Checking <code>state()</code> and then calling <code>playTurn()</code> is two lock acquisitions, but only the timer thread plays turns, so nothing can finish the game in between. If several threads could play, <code>playTurn()</code> still rejects a move after the end.",
          "For spectators or a log, return the TurnResult and let the caller publish it. If Game itself notifies listeners, keep them in a <code>CopyOnWriteArrayList</code> so they can be added from other threads while a turn is being played.",
          "The same API supports a networked game: each request becomes one <code>playTurn()</code> call, and its TurnResult is the response."
        ] }
      ]
    },
    {
      id: "many-games",
      title: "Many games at once",
      kicker: "Follow-up: concurrency",
      blocks: [
        { type: "text", html: `<p>A server hosting thousands of games needs three things: a thread-safe place to find a game by id, a guarantee that two requests for the same game don't interleave, and no needless contention between different games. The design already gives most of this: the Board is immutable and shared, and each Game locks only itself.</p>` },
        { type: "code", lang: "java", title: "A registry of games sharing one board", code: `final class GameRegistry {
    private final Board board;                                          // immutable, shared by every game
    private final ConcurrentHashMap<String, Game> games = new ConcurrentHashMap<>();

    GameRegistry(Board board) { this.board = board; }

    String start(List<Player> players) {
        String id = UUID.randomUUID().toString();
        games.put(id, new Game(board, new RandomDice(1), players));      // each game gets its own dice
        return id;
    }

    TurnResult playTurn(String id) {
        Game game = games.get(id);
        if (game == null) throw new IllegalArgumentException("No such game " + id);
        TurnResult result = game.playTurn();                            // Game locks itself; games never contend
        if (game.state() == GameState.FINISHED) games.remove(id, game);
        return result;
    }
}` },
        { type: "text", html: `<p>Batch simulation ("how many turns does an average game take on this board?") needs no locking at all: each task creates its own Game and is the only thread that ever touches it. This is <strong>thread confinement</strong>; the only shared object is the immutable Board.</p>` },
        { type: "code", lang: "java", title: "Simulating many games in parallel", code: `// Each task creates and owns its Game (confinement); only the immutable Board and player list are shared.
static double averageTurns(Board board, List<Player> players, int games) {
    return LongStream.range(0, games).parallel()
            .mapToInt(seed -> turnsToFinish(new Game(board, new RandomDice(1, 6, seed), players)))
            .average().orElse(0);
}

static int turnsToFinish(Game game) {
    int turns = 0;
    while (game.state() == GameState.IN_PROGRESS) { game.playTurn(); turns++; }
    return turns;
}` },
        { type: "table", title: "Where the random numbers come from", headers: ["Source", "Thread-safe?", "Replayable?", "Use when"], rows: [
          ["One Random shared by all games", "Yes, but every thread contends on its seed", "No: games interleave", "Never at scale"],
          ["ThreadLocalRandom.current()", "Yes, no contention", "No: it can't be seeded", "Replays don't matter"],
          ["One seeded Random per game", "Yes: used only under that game's lock", "Yes: log the seed", "The default here"]
        ] },
        { type: "quiz", q: "A thousand games on many threads share one Board. What synchronization does Board need?", options: ["None: its fields are final and its map is unmodifiable, built entirely in the constructor", "resolve() must be synchronized", "The jump map must be a ConcurrentHashMap", "A ReadWriteLock around every read"], answer: 0, explain: `<p>Nothing ever writes to the Board after construction, and final fields are guaranteed to be visible to every thread once the constructor finishes. Locks would only add contention between games that have no reason to wait for each other.</p>` }
      ]
    }
  ],
  takeaways: [
    "Validate the board in its constructor; rejecting jumps onto jump starts also rules out cycles.",
    "Dice behind an interface is justified by testing: scripted rolls for tests, seeded rolls for replays.",
    "Numbers and on/off rules are data in a Rules record; only rules whose behaviour differs get a strategy.",
    "Expose playTurn() returning a TurnResult; a loop, a test or a UI timer is just a caller.",
    "Share one immutable Board; lock each Game on itself, or confine it to one thread.",
    "Give each game its own seeded Random rather than one shared Random."
  ]
};
