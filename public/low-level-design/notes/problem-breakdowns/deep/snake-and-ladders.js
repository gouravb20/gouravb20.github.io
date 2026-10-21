// Deep dives: Snake and Ladders (LLD practice set). Format: DeepDive in public/shared/notes.d.ts.
window.DEEP = window.DEEP || {};
DEEP["snake-and-ladders"] = {
  hook: `<p>The core game fits in a few small classes, so the second half of the interview is follow-ups: a board rule changes, a house rule is added, a UI or a server takes over the driving. You rarely implement them in full; you show which class changes and why the rest doesn't. Junior candidates may get one of these, mid-level two or three, senior candidates most of them, in more depth.</p>`,
  sections: [
    {
      id: "chains",
      title: "\"What if a ladder is allowed to end on a snake's head?\"",
      kicker: "Follow-up: board rules",
      blocks: [
        { type: "text", html: `<p>The base design rejects any jump that ends on another jump's start. That one rule removes a whole class of bugs, which is worth saying before changing it:</p>` },
        { type: "table", headers: ["Board rule", "What it prevents"], rows: [
          ["A snake's head is above its tail; a ladder's foot below its top", "A mistyped jump going the wrong way; checked by the Snake and Ladder records"],
          ["No jump starts on the last cell or off the board", "A snake on 100 makes winning impossible; an off-board cell can never be reached"],
          ["At most one jump starts on any cell", "Two destinations for one landing"],
          ["No jump ends on another jump's start", "Chains, and with them cycles such as a ladder from 10 to 20 and a snake from 20 to 10"]
        ] },
        { type: "text", html: `<p>Some versions of the game do allow chains: a ladder that ends on a snake's head sends you straight back down. Only the <strong>Board constructor</strong> changes. It follows each chain once at build time and stores the final destination, so <code>resolve()</code> stays a single lookup and Game never knows chains exist. The cycle check moves there too.</p>` },
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
}

// In the Board constructor, the "lands on another jump" check is replaced by:
//   this.jumps = flatten(all);` },
        { type: "keypoints", items: [
          "Game, Dice and the records are untouched; the board is still validated once and still immutable.",
          "TurnResult reports the start and the final cell. If a UI wants to animate each hop of the chain, keep the unflattened map too and let the UI walk it.",
          "Ask which behaviour they want before coding: \"I'll reject chains, which also makes cycles impossible; if chains are allowed I'd flatten them at construction.\""
        ] }
      ]
    },
    {
      id: "testing",
      title: "\"How do you test a game built on random dice?\"",
      kicker: "Follow-up: testing",
      blocks: [
        { type: "text", html: `<p>This is the question that justifies the <code>Dice</code> interface. A test of "landing on 25 slides you to 2" must not depend on luck. The same seam answers every dice follow-up (two dice, a crooked die, a die that always rolls six for a demo) with one new class and no change to Game.</p>` },
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
    Board board = new Board(10, List.of(new Snake(9, 2)), List.of(new Ladder(3, 8)));
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
    Board board = new Board(30, List.of(), List.of());
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
      id: "house-rules",
      title: "\"How would you add house rules, like bouncing back on an overshoot?\"",
      kicker: "Follow-up: extensibility",
      blocks: [
        { type: "text", html: `<p>House rules are the most common follow-up, and the trap is a growing chain of <code>if (variant == ...)</code> inside <code>playTurn()</code>. Sort each rule by the kind of change it is. A number or an on/off switch is plain data; a rule whose <em>behaviour</em> differs gets a small strategy. Only <strong>Game</strong> changes: it receives a <code>Rules</code> object and reads it. Board and Dice are untouched.</p>` },
        { type: "table", headers: ["Variation", "Kind of change", "Where it lives"], rows: [
          ["Board size, number of dice", "A number", "Board and RandomDice constructors (already there)"],
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

/** Knobs that are only numbers or on/off stay plain data. Immutable, so one instance can serve many games. */
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
          { title: "Weak: an if-chain on a variant name", tone: "bad", html: `<p><code>if (variant == BOUNCE) ... else if (variant == QUICK) ...</code> inside <code>playTurn()</code>. Every new house rule edits the hardest method in the system, and combinations of rules multiply the branches.</p>` },
          { title: "Good: a class per rule and a rule engine", tone: "warn", html: `<p>An <code>ExtraTurnOnSixRule</code>, a <code>MaxSixesRule</code> and an engine that runs them. Open for extension, but three booleans and an int become a framework, and the order the rules run in becomes a new source of bugs.</p>` },
          { title: "Strong: a Rules record and one enum", tone: "ok", html: `<p>The record is immutable and shared. The enum covers the only rule whose behaviour truly varies, and a fourth overshoot policy is one more constant. Game reads each rule in exactly one place.</p>` }
        ] },
        { type: "callout", tone: "mistake", html: `<p>Bounce-back with a bounce that lands on a snake's head still slides: the bounced cell goes through <code>board.resolve()</code> like any other. And clamping an overshoot to the last cell (<code>Math.min(from + roll, size)</code>) silently switches to "finish anyway"; if that is the variant you want, make it the explicit <code>FINISH</code> policy.</p>` }
      ]
    },
    {
      id: "special-cells",
      title: "\"How would you add cells that skip a turn or give an extra roll?\"",
      kicker: "Follow-up: new behaviour",
      blocks: [
        { type: "text", html: `<p>Now cells have behaviour beyond "move somewhere", so the jump map is no longer enough. Generalise its value: a cell maps to a <strong>CellEffect</strong>, and a jump becomes one kind of effect. The <strong>Board</strong> changes its map's value type and still validates and freezes it once; <strong>Game</strong> changes the few lines after a landing. Dice, the records and the turn queue logic stay as they are.</p>` },
        { type: "code", lang: "java", title: "Special cells as effects", code: `/** What landing on a cell does. Sealed, so Game can be sure it handles every kind. */
sealed interface CellEffect permits Jump, SkipNextTurn, RollAgain {}
record Jump(int to) implements CellEffect {}           // snakes and ladders
record SkipNextTurn() implements CellEffect {}
record RollAgain() implements CellEffect {}

// Board: the jump map becomes a map of effects, still built and validated once, then frozen with Map.copyOf.
private final Map<Integer, CellEffect> effects;
CellEffect effectAt(int cell) { return effects.get(cell); }   // null for a plain cell

// Game: one more field, guarded by the game's lock like the others.
private final Set<Player> skipping = new HashSet<>();

// In playTurn(), replacing the resolve step (overshoot already handled):
CellEffect effect = board.effectAt(target);
int to = effect instanceof Jump j ? j.to() : target;
boolean again = roll == SIX || effect instanceof RollAgain;
if (effect instanceof SkipNextTurn) skipping.add(player);

private void passTurn() {
    turns.addLast(turns.pollFirst());
    sixes = 0;
    while (skipping.remove(turns.peekFirst()))         // a skipped player loses one turn, then is cleared
        turns.addLast(turns.pollFirst());
}` },
        { type: "keypoints", items: [
          "The skip loop always ends: each pass removes a player from <code>skipping</code>, so at worst it clears everyone once.",
          "A sealed interface with records keeps effects as data. Adding \"go back to start\" is one more record and one more line where Game applies effects.",
          "<code>MoveKind</code> gains SKIP and ROLL_AGAIN so the UI can describe the turn; the Board's validation now also rejects an effect on the last cell.",
          "Don't do this until the interviewer asks: until special cells exist, the plain jump map is simpler and says exactly what the board does."
        ] }
      ]
    },
    {
      id: "driving",
      title: "\"What if a UI or a server drives the game instead of a loop?\"",
      kicker: "Follow-up: API design",
      blocks: [
        { type: "text", html: `<p>Nothing in the core changes, and that is the point of the step-wise API. Each driver is just a different caller of <code>playTurn()</code>.</p>` },
        { type: "compare", items: [
          { title: "Game.play() runs the whole loop", tone: "bad", html: `<p>It rolls, prints to the console and only returns when someone has won. A test can only check the final ranking, a UI can't animate between turns, and a server thread is held for the whole game.</p>` },
          { title: "playTurn() applies one roll", tone: "ok", html: `<p>It returns a <code>TurnResult</code> describing what happened. A console loop, a test, a UI timer and a request handler are all just different callers. Printing belongs to the caller.</p>` }
        ] },
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
          "Once a timer thread plays turns and the UI thread reads positions, Game is shared between threads. That is why its methods are synchronized rather than relying on \"only one thread will ever use it\".",
          "Checking <code>state()</code> and then calling <code>playTurn()</code> is two lock acquisitions, but only the timer thread plays turns, so nothing can finish the game in between. If several threads could play, <code>playTurn()</code> still rejects a move after the end.",
          "For spectators or a log, return the TurnResult and let the caller publish it. If Game itself must notify listeners, keep them in a <code>CopyOnWriteArrayList</code> so they can be added from other threads while a turn is being played.",
          "A networked game is the same: each request becomes one <code>playTurn()</code> call, and its TurnResult is the response. The server should also check that the request comes from <code>currentPlayer()</code>."
        ] }
      ]
    },
    {
      id: "many-games",
      title: "\"How would you host thousands of games at once?\"",
      kicker: "Follow-up: concurrency",
      blocks: [
        { type: "text", html: `<p>A server needs three things: a thread-safe place to find a game by id, a guarantee that two requests for the same game don't interleave, and no contention between different games. The design already gives most of it: the Board is immutable and shared, and each Game locks only itself. The only new class is a registry.</p>` },
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
        { type: "text", html: `<p>Batch simulation ("how many turns does an average game take on this board?") needs no locking at all: each task creates its own Game and is the only thread that ever touches it. This is <strong>thread confinement</strong>; the only shared objects are the immutable Board and the immutable player list.</p>` },
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
    "Follow-ups should touch one class: chains change the Board constructor, dice variants add a Dice, house rules and special cells change how Game applies a landing.",
    "Validate the board in its constructor; rejecting jumps onto jump starts also rules out cycles, and allowing chains means flattening them there.",
    "Dice behind an interface is justified by testing: scripted rolls for tests, seeded rolls for replays.",
    "Numbers and on/off rules are data in a Rules record; only rules whose behaviour differs get a strategy or an effect type.",
    "Expose playTurn() returning a TurnResult; a loop, a test, a UI timer or a server is just a caller.",
    "Share one immutable Board; lock each Game on itself or confine it to one thread, and give each game its own seeded Random."
  ]
};
