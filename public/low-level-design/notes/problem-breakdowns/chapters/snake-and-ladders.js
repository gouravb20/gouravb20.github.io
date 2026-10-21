// LLD problem breakdown: Snake and Ladders. Format: Chapter in public/shared/notes.d.ts; shared helpers in data-part2.js.
// Imports are omitted in the code.
(function () {
const { levels, PRACTICE_TIP } = LLD_PROBLEMS_KIT;

window.DATA.chapters.push({
    id: `snake-and-ladders`, part: 1, number: 0, difficulty: `easy`,
    title: `Snake and Ladders: a jump map, swappable dice and a turn queue`,
    references: [{ title: `awesome-low-level-design: Snake and Ladder`, url: `https://github.com/ashishps1/awesome-low-level-design/blob/main/problems/snake-and-ladder.md` }],
    overview: `Players take turns rolling a die and moving along a 100-cell board; landing on a ladder's foot carries them up, landing on a snake's head sends them down, and the first to land exactly on 100 wins. It is the classic warm-up problem, and it rewards restraint. This page works the problem in interview order: clarify the house rules, find the entities, design the classes top down, implement the board and a single turn (comparing a simple, a better and a strong option at each decision), verify with a call-by-call trace, then handle follow-ups. The design lands on snakes and ladders as one <strong>jump map</strong> validated once in an <strong>immutable Board</strong>, dice behind an <strong>interface</strong> so tests are deterministic, a <strong>turn queue</strong>, and a step-wise <strong>playTurn()</strong> that a loop, a test or a UI can drive.`,
    problem: [
      { id: `understanding`, title: `What Snake and Ladders does`, kicker: `The problem`, blocks: [
        { type: `problem`, html: `<p>A board has numbered cells from 1 to 100. Every player starts off the board. On their turn a player rolls a die and moves forward that many cells. If they land at the foot of a ladder they climb to its top; if they land on a snake's head they slide down to its tail. The first player to reach the last cell wins. You are building the game logic: no UI, but an API that a UI, a console loop or a test could drive one turn at a time.</p>` },
        { type: `text`, html: `<p>The prompt is usually one line: <em>"Design Snake and Ladders."</em> Everyone thinks they know the rules, but every household plays a slightly different version: what happens when a roll goes past 100, whether a six earns another roll, whether the game stops at the first winner. Each of those choices changes the code, so the first few minutes go into turning the one-liner into a spec.</p>` }
      ] },
      { id: `clarifying`, title: `Clarifying questions`, kicker: `Step 1: requirements`, blocks: [
        { type: `text`, html: `<p>Work through four kinds of question: <strong>what the game must do</strong> (moves, sixes, winning), <strong>what happens with bad input</strong> (an impossible board, a move after the game is over), <strong>what is deliberately left out</strong> (UI, networking), and <strong>what might be added later</strong> (house rules, many games at once). A few minutes here saves designing for rules nobody asked for.</p>` },
        { type: `table`, headers: [`You ask`, `A typical answer`, `What it decides`], rows: [
          [`Is the board always 100 cells, with fixed snakes and ladders?`, `100 by default but configurable; snakes and ladders are fixed when the board is built`, `Size is a constructor argument; the board never changes once built`],
          [`Can a snake or ladder end on another one's start?`, `No: reject such a board when it is built`, `Board validation; resolving a landing cell is one lookup and can never loop`],
          [`What if a roll would go past the last cell?`, `The player stays where they are`, `The overshoot rule inside a turn`],
          [`Does a six give another roll? Is there a limit?`, `Yes; a third six in a row cancels the whole turn`, `Per-turn state in the game: sixes so far and where the turn began`],
          [`Does the game stop at the first winner?`, `No: rank players until only one is left`, `Finishers leave the turn queue and join a ranking list`],
          [`How many dice, and are they fair?`, `One fair six-sided die, but tests must be able to choose the rolls`, `A <code>Dice</code> interface injected into the game`],
          [`Who drives the game: a loop that prints, or an API?`, `The caller, one turn at a time`, `<code>playTurn()</code> returning a <code>TurnResult</code>; printing belongs to the caller`],
          [`Several games at once?`, `Not now, but don't rule it out`, `An immutable board that games can share, and a lock per game`]
        ] },
        { type: `callout`, tone: `insight`, title: `Whose rules are we playing by?`, html: `<p>The single most useful question is "which version of the rules?", asked as concrete cases: overshoot, sixes, first winner or full ranking. The answers decide almost all of the game's state. An exact finish needs an overshoot branch; the three-sixes rule needs two fields of per-turn memory; full ranking turns "game over" into "one player left". Candidates who skip this end up rewriting <code>playTurn()</code> halfway through when the interviewer says "and a six gives you another go".</p>` }
      ] },
      { id: `final-requirements`, title: `Final requirements`, kicker: `Step 1: requirements`, blocks: [
        { type: `code`, lang: `text`, title: `Final requirements`, code: `Requirements
  1. A board of 100 cells (size configurable). Players start off the board, at 0.
  2. A snake moves a player down from its head to its tail; a ladder moves a
     player up from its foot to its top. Both are fixed when the board is built.
  3. An impossible board (a snake going up, a jump off the board or from the
     last cell, two jumps on one cell, a jump ending on another jump's start)
     is rejected when it is built.
  4. Two or more players take turns in a fixed order, rolling one six-sided die.
  5. A player must land exactly on the last cell. A roll that would go past it
     is wasted and the player stays where they are.
  6. A six earns another roll. A third six in a row cancels the whole turn and
     the player goes back to where the turn began.
  7. A player who reaches the last cell is ranked and leaves the turn order;
     the game goes on until only one player is left, who is ranked last.
  8. The caller drives the game one roll at a time and is told what happened.
  9. The dice must be replaceable, so games can be tested and replayed.

Out of scope
  - UI, networking, persistence
  - Several games at once is a follow-up, so the design must not rule it out
  - House rules beyond the ones above (bounce-back, special cells)` },
        { type: `callout`, tone: `tip`, html: PRACTICE_TIP }
      ] }
    ],
    solution: [
      { id: `entities`, title: `Core entities`, kicker: `Step 2: entities`, blocks: [
        { type: `text`, html: `<p>Scan the requirements for nouns that hold state or enforce a rule. The game is full of physical objects (cells, tokens, snakes, ladders, dice), and the trap is turning every one of them into a class. Test each noun before committing.</p>` },
        { type: `table`, headers: [`Candidate`, `Verdict`, `Why`], rows: [
          [`Cell`, `An <code>int</code>, not a class`, `A cell is a position from 1 to 100. A hundred Cell objects, almost all of them empty, would hold nothing a number doesn't`],
          [`Snake, Ladder`, `Small input records, not behaviour classes`, `Each is a start and an end that must point the right way. They are a readable way to describe the board, but once validated both behave identically, so the board stores them together as one map`],
          [`Board`, `A class`, `Owns the size and the jumps, enforces every board rule once, then never changes`],
          [`Dice`, `An interface`, `A fair random die for play, a scripted one for tests: two real implementations, so the seam earns its place`],
          [`Player`, `A record (just a name)`, `The position changes every turn, so it lives in the game, not on the player; the player stays immutable`],
          [`Token / piece`, `Not a class`, `It is the player's position: a number in the game's map`],
          [`Turn`, `Two fields, plus a result record`, `The three-sixes rule needs "sixes so far" and "where the turn began"; what one roll did comes back as a <code>TurnResult</code>`],
          [`Game`, `A class`, `Turn order, every position, the ranking and whether the game is over; applies one roll at a time`],
          [`GameManager (a Singleton)`, `Not needed`, `Nothing global is shared. Create a Game and pass it to whoever drives it`]
        ] },
        { type: `table`, title: `The entities we keep`, headers: [`Entity`, `Responsibility`], rows: [
          [`Game`, `The entry point. Holds the turn queue, positions, per-turn state, ranking and game state; <code>playTurn()</code> applies exactly one roll. Knows nothing about how the board was described.`],
          [`Board`, `The size and one jump map from start cell to destination. Validates the whole board in its constructor and is immutable afterwards.`],
          [`Dice`, `<code>roll()</code>. <code>RandomDice</code> (seedable) for play, <code>ScriptedDice</code> for tests.`],
          [`Snake, Ladder`, `Records that describe the board and check their own direction.`],
          [`Player, TurnResult`, `Records: who plays, and what one roll did (roll, from, to, kind, rolls again).`]
        ] },
        { type: `callout`, tone: `tip`, html: `<p>Saying "no" to a noun out loud is worth as much as the classes you keep: "Cells are just ints, and a snake is just a jump that goes down, so the board holds one map." It shows you model behaviour, not the box the game came in.</p>` }
      ] },
      { id: `game-design`, title: `Class design: Game`, kicker: `Step 3: class design, top down`, blocks: [
        { type: `text`, html: `<p>Start from the class the caller talks to and derive its state and methods from the requirements. For each requirement ask: what must the game remember, and what must it let callers do?</p>` },
        { type: `table`, headers: [`Requirement`, `What Game remembers`], rows: [
          [`"Players take turns in a fixed order"`, `A queue of players; the head moves next`],
          [`"Players start at 0 and move by the roll"`, `A position for every player`],
          [`"A third six in a row cancels the turn"`, `Sixes rolled so far this turn, and the cell where the turn began`],
          [`"Finishers are ranked; play goes on until one is left"`, `A ranking list and a state (in progress or finished)`],
          [`"Dice must be replaceable"`, `A <code>Dice</code> passed in through the constructor`],
          [`"Snakes and ladders are fixed"`, `A reference to an immutable <code>Board</code>`]
        ] },
        { type: `table`, headers: [`Need`, `Method`], rows: [
          [`Play one roll for whoever is next`, `<code>TurnResult playTurn()</code>`],
          [`Know whether the game is over`, `<code>GameState state()</code>`],
          [`Show whose turn it is`, `<code>Player currentPlayer()</code>`],
          [`Draw the board`, `<code>int position(Player p)</code>`],
          [`Show the results so far`, `<code>List&lt;Player&gt; ranking()</code>`]
        ] },
        { type: `text`, html: `<p>The rule that shapes <code>playTurn()</code> most is the extra roll on a six. There are three common ways to build it.</p>` },
        { type: `compare`, items: [
          { title: `Weak: recurse inside the turn`, tone: `bad`, html: `<p><code>takeTurn()</code> calls itself after a six. Short to write, but the caller only sees the end of the chain, so a UI can't show each roll, and nothing stops the chain; adding "three sixes cancel the turn" means threading a counter through the recursion.</p>` },
          { title: `Good: loop until a non-six`, tone: `warn`, html: `<p>One call rolls repeatedly and returns a list of moves. The three-sixes rule fits as a loop counter. But one call now means "several rolls", which makes tests and animations awkward, and the rule's state is hidden in a local variable.</p>` },
          { title: `Strong: one roll per call; the player keeps the head of the queue`, tone: `ok`, html: `<p>Every <code>playTurn()</code> applies exactly one roll. After a six the queue simply doesn't rotate, so the next call is the same player's. Sixes so far and the turn's starting cell are two fields, so the third six can put the player back. Each result is reported separately.</p>` }
        ] },
        { type: `text`, html: `<p>We take the strong option: it turns the extra roll into "don't rotate the queue", and keeps the API to one roll, one result.</p>` },
        { type: `keypoints`, items: [
          `<strong>Positions live in Game, not on Player.</strong> A mutable <code>position</code> field on Player is the common first draft, but then a Player can't be in two games, and any thread holding a Player can change its position outside the game's lock. A map inside Game keeps every mutation behind one lock.`,
          `<strong>A constructor, not a Builder.</strong> Game has three required arguments and no optional ones; a constructor that validates them is shorter and just as safe. A Builder starts to pay off when there are many optional settings, such as house rules.`,
          `<strong>No NOT_STARTED state.</strong> A constructed game is ready to play, so the state is IN_PROGRESS or FINISHED. A start() method would add a state that every other method has to check.`,
          `<strong>Misuse throws; game outcomes don't.</strong> Playing after the end is a caller bug and throws. A snake, an overshoot or a forfeit is a normal outcome and comes back in <code>TurnResult.kind</code>.`
        ] }
      ] },
      { id: `board-design`, title: `Class design: Board, snakes, ladders and dice`, kicker: `Step 3: class design, top down`, blocks: [
        { type: `table`, headers: [`Requirement`, `What Board remembers`], rows: [
          [`"100 cells, size configurable"`, `Its size`],
          [`"Snakes move down, ladders move up, both fixed"`, `Where each jump starts and where it ends`],
          [`"An impossible board is rejected"`, `Nothing extra: validation happens once, in the constructor`]
        ] },
        { type: `text`, html: `<p>The design question is <strong>how to represent snakes and ladders</strong> so that "where does a token on cell <em>n</em> end up?" is cheap and can never go wrong.</p>` },
        { type: `compare`, items: [
          { title: `Weak: an array of Cell objects`, tone: `bad`, html: `<p>A hundred <code>Cell</code> objects, each optionally pointing to a Snake or a Ladder. Lookup is fast, but most cells are empty objects, and polymorphic <code>Snake.apply()</code> and <code>Ladder.apply()</code> do the same thing: move to a cell.</p>` },
          { title: `Good: a list of Snake and Ladder objects`, tone: `warn`, html: `<p>Readable, and each object can check its own direction. But every move scans the list for a matching start, and nothing stops two jumps from starting on the same cell or one ending on another's start.</p>` },
          { title: `Strong: one immutable jump map, built from records`, tone: `ok`, html: `<p>The caller describes the board with <code>Snake</code> and <code>Ladder</code> records. The Board checks the board as a whole, then keeps a single <code>Map&lt;Integer, Integer&gt;</code> from start to destination. Resolving a landing cell is one lookup, and the map is frozen after construction.</p>` }
        ] },
        { type: `text`, html: `<p>We take the jump map. Lists of records rather than two maps as input matter for one subtle reason: building a <code>HashMap</code> of snakes silently overwrites a duplicate head, so the mistake vanishes before the Board can see it. A list keeps every entry, and the Board rejects the duplicate.</p>` },
        { type: `table`, headers: [`Need`, `Method`], rows: [
          [`Where a token on a cell ends up`, `<code>int resolve(int cell)</code> on Board`],
          [`The finish line and the overshoot check`, `<code>int size()</code> on Board`],
          [`A roll`, `<code>int roll()</code> on Dice`]
        ] },
        { type: `code`, lang: `java`, title: `Snake, Ladder and Player`, code: `/** A snake must go down. Checked when the record is created, so a backwards snake can't exist. */
record Snake(int head, int tail) {
    Snake {
        if (tail >= head) throw new IllegalArgumentException("Snake at " + head + " must go down");
    }
}

/** A ladder must go up. */
record Ladder(int foot, int top) {
    Ladder {
        if (top <= foot) throw new IllegalArgumentException("Ladder at " + foot + " must go up");
    }
}

record Player(String name) {}   // immutable; the position lives in Game` },
        { type: `keypoints`, items: [
          `<strong>Each record checks itself; the Board checks the whole.</strong> Direction is a property of one jump. Overlaps, chains and off-board cells only make sense against the whole board, so they belong in the Board constructor.`,
          `<strong>Dice is an interface because tests need it.</strong> That is a real force, not "flexibility": a random roll makes a test of "landing on 25 slides you to 2" flaky.`
        ] }
      ] },
      { id: `class-diagram`, title: `Final class design`, kicker: `Step 3: class design`, blocks: [
        { type: `code`, lang: `java`, title: `Final class design`, code: `record Snake(int head, int tail) {}                   // checks head > tail
record Ladder(int foot, int top) {}                   // checks top > foot
record Player(String name) {}
record TurnResult(Player player, int roll, int from, int to, MoveKind kind, boolean rollsAgain) {}
enum GameState { IN_PROGRESS, FINISHED }
enum MoveKind { NORMAL, SNAKE, LADDER, OVERSHOOT, FORFEIT, FINISHED }

final class Board {                                   // immutable after construction
    private final int size;
    private final Map<Integer, Integer> jumps;        // start cell -> destination, snakes and ladders alike

    Board(int size, List<Snake> snakes, List<Ladder> ladders);   // validates the whole board
    int size();
    int resolve(int cell);
}

interface Dice { int roll(); }                        // RandomDice to play, ScriptedDice to test

final class Game {                                    // every method that touches state is synchronized
    private final Board board;
    private final Dice dice;
    private final Deque<Player> turns;                // head moves next
    private final Map<Player, Integer> positions;
    private final List<Player> ranking;
    private GameState state;
    private int sixes, turnStart;                     // memory for the current turn

    Game(Board board, Dice dice, List<Player> players);
    TurnResult playTurn();
    GameState state();
    Player currentPlayer();
    int position(Player p);
    List<Player> ranking();
}` },
        { type: `text`, html: `<p>All change lives in <code>Game</code>; everything it points to is either immutable (Board, Player, the records) or owned by it (Dice). Dice is the one <strong>Strategy</strong> in the design, and it is there because tests need it. There is no Singleton, no Builder and no Observer: nothing in the requirements needs them.</p>` }
      ] },
      { id: `board-impl`, title: `Implementation: the board and the dice`, kicker: `Step 4: implementation`, blocks: [
        { type: `text`, html: `<p>Check what the interviewer wants: working code, pseudocode or a walkthrough. The Board's normal path is short: put every jump into one map and freeze it. All the care goes into the edge cases, because every check done here is a check no other class ever needs.</p>` },
        { type: `list`, title: `Boards the constructor must reject`, items: [
          `A size below 2: there is no game.`,
          `A jump that starts on cell 0, on the last cell or off the board, or ends off the board. A snake on the last cell would make winning impossible.`,
          `Two jumps starting on the same cell: two destinations for one landing is ambiguous.`,
          `A jump that ends on another jump's start. This rules out chains, and with them cycles such as a ladder from 10 to 20 and a snake from 20 to 10.`,
          `A snake going up or a ladder going down: already rejected by the records themselves.`
        ] },
        { type: `code`, lang: `java`, title: `Board`, code: `/** Immutable after construction: final fields and an unmodifiable map, so games on any thread can share it. */
final class Board {
    private final int size;
    private final Map<Integer, Integer> jumps;   // start cell -> destination, for snakes and ladders alike

    Board(int size, List<Snake> snakes, List<Ladder> ladders) {
        if (size < 2) throw new IllegalArgumentException("A board needs at least 2 cells");
        Map<Integer, Integer> all = new HashMap<>();
        for (Snake s : snakes)   add(all, s.head(), s.tail(), size);
        for (Ladder l : ladders) add(all, l.foot(), l.top(), size);
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

/** For tests: returns the given rolls in order and fails loudly when they run out. Rolled only under the game's lock. */
final class ScriptedDice implements Dice {
    private final Deque<Integer> rolls;

    ScriptedDice(Integer... rolls) { this.rolls = new ArrayDeque<>(List.of(rolls)); }

    public int roll() {
        Integer next = rolls.pollFirst();
        if (next == null) throw new IllegalStateException("No more scripted rolls");
        return next;
    }
}` },
        { type: `callout`, tone: `insight`, title: `Why the board needs no lock`, html: `<p><strong>Board</strong> has only final fields and an unmodifiable map built in the constructor. Nothing ever writes to it afterwards, and the Java memory model guarantees that every thread sees a final field as it was when the constructor finished. So one Board can be read by any number of games on any number of threads with no locking at all. <code>ScriptedDice</code> uses a plain <code>ArrayDeque</code>, which is not thread-safe, but it belongs to one game and is only rolled inside that game's synchronized <code>playTurn()</code>.</p>` }
      ] },
      { id: `game-impl`, title: `Implementation: playing one turn`, kicker: `Step 4: implementation`, blocks: [
        { type: `text`, html: `<p>The normal path of <code>playTurn()</code>: take the player at the head of the queue, roll, add the roll to their position, resolve any snake or ladder, store the new position, and rotate the queue. Everything else is an edge case on top of that.</p>` },
        { type: `text`, html: `<p>One rule deserves a comparison before coding: what happens when the roll goes past the last cell. Take Asha at 97 on a 100-cell board, rolling a 5.</p>` },
        { type: `table`, headers: [`Overshoot rule`, `Where Asha ends up`, `What it does to the game`], rows: [
          [`Stay put`, `97 (the roll is wasted)`, `The ending needs an exact roll, which builds tension; this is the common rule`],
          [`Bounce back`, `98 (three forward to 100, two back)`, `Also needs an exact roll, but the player still moves; a popular house rule`],
          [`Finish anyway`, `100 (wins)`, `Games end sooner; this is what a careless <code>Math.min(from + roll, size)</code> produces by accident`]
        ] },
        { type: `text`, html: `<p>The requirements say "stay put", so that is what we build. The other two are a follow-up (see Deep Dives: house rules); what matters now is that the choice is explicit, not a side effect of a bounds check.</p>` },
        { type: `list`, title: `Edge cases the code must handle`, items: [
          `The game is already finished: throw, since that is a caller bug.`,
          `The first roll of a turn: remember where the turn began, for the three-sixes rule.`,
          `A third six in a row: put the player back where the turn began and pass the turn, before moving at all.`,
          `A roll past the last cell: stay put, and report OVERSHOOT.`,
          `Landing exactly on the last cell, directly or by a ladder: rank the player and remove them from the queue. A six that finishes earns no extra roll.`,
          `One player left after a finish: rank them last and end the game.`,
          `A six that doesn't finish: the player stays at the head of the queue.`
        ] },
        { type: `code`, lang: `java`, title: `Game`, code: `enum GameState { IN_PROGRESS, FINISHED }
enum MoveKind { NORMAL, SNAKE, LADDER, OVERSHOOT, FORFEIT, FINISHED }

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
        if (!again) passTurn();                            // after a six the same player rolls next
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
    synchronized Player currentPlayer() { return turns.peekFirst(); }   // null once finished
    synchronized int position(Player p) { return Objects.requireNonNull(positions.get(p), "Unknown player"); }
    synchronized List<Player> ranking() { return List.copyOf(ranking); }
}` },
        { type: `code`, lang: `java`, title: `Running a game`, code: `Board board = new Board(100,
        List.of(new Snake(99, 54), new Snake(70, 55), new Snake(52, 42), new Snake(25, 2), new Snake(95, 72)),
        List.of(new Ladder(6, 27), new Ladder(11, 40), new Ladder(60, 85), new Ladder(46, 90), new Ladder(17, 69)));
List<Player> players = List.of(new Player("Asha"), new Player("Ben"), new Player("Chen"));
Game game = new Game(board, new RandomDice(1), players);

while (game.state() == GameState.IN_PROGRESS) {
    TurnResult t = game.playTurn();
    System.out.println(t.player().name() + " rolled " + t.roll() + ": " + t.from() + " to " + t.to() + " " + t.kind());
}
System.out.println("Ranking: " + game.ranking());` },
        { type: `keypoints`, items: [
          `<strong>The third-six check comes before the move.</strong> Moving first and then undoing it would briefly put the player on a cell they never reached, and could even finish the game.`,
          `<strong>Finishing is checked on the resolved cell.</strong> A ladder whose top is the last cell is a win, so the check uses <code>to</code>, not <code>target</code>.`,
          `<strong>The extra roll is "don't rotate".</strong> No recursion and no loop: the queue head simply stays put, and the next call is the same player's.`
        ] },
        { type: `callout`, tone: `warning`, title: `Why Game's methods are synchronized`, html: `<p>A console loop uses one thread, but the moment a UI timer plays turns while the UI thread reads positions to draw the board, two threads touch the same queue, map and counters. <code>ArrayDeque</code>, <code>HashMap</code> and <code>ArrayList</code> are not thread-safe, and a reader could see a position updated but the queue not yet rotated. So every method that reads or writes Game's fields is <code>synchronized</code> on the game: a turn is applied as one step, and readers always see a whole turn or none of it. Different games have different locks, so they never wait on each other.</p>` },
        { type: `text`, html: `<p>The jump map built from snake and ladder entities, the exact-finish rule and the player queue follow the <a href="https://github.com/ashishps1/awesome-low-level-design/tree/main/solutions/java/src/snakeandladdergame" target="_blank" rel="noopener">awesome-low-level-design snakeandladdergame solution</a>; the code here is written independently. It moves each player's position off the mutable <code>Player</code> into the locked Game, replaces the recursive extra roll and the print-everything <code>play()</code> loop with a step-wise <code>playTurn()</code>, puts the dice behind a seedable interface instead of <code>Math.random</code>, validates the whole board, and drops the Builder because Game has only three required arguments.</p>` }
      ] },
      { id: `verification`, title: `Verifying with a trace`, kicker: `Step 5: verification`, blocks: [
        { type: `text`, html: `<p>Walk a concrete game call by call before the interviewer does. Use a small board so every rule shows up quickly: 20 cells, snakes 14 to 5 and 19 to 8, ladders 3 to 11 and 9 to 16. Players Asha, Ben and Chen; the dice are <code>new ScriptedDice(3, 6, 3, 5, 3, 5, 6, 6, 6, 4, 4, 6, 2, 4)</code>.</p>` },
        { type: `code`, lang: `text`, title: `Call by call`, code: `call  1  Asha  roll 3   0 -> 11  LADDER     3 is a ladder foot                   next: Ben
call  2  Ben   roll 6   0 ->  6  NORMAL     a six: sixes=1, turn began at 0      next: Ben
call  3  Ben   roll 3   6 -> 16  LADDER     9 is a ladder foot; sixes reset      next: Chen
call  4  Chen  roll 5   0 ->  5  NORMAL                                          next: Asha
call  5  Asha  roll 3  11 ->  5  SNAKE      14 is a snake's head                 next: Ben
call  6  Ben   roll 5  16 -> 16  OVERSHOOT  21 is past 20: stays put             next: Chen
call  7  Chen  roll 6   5 -> 11  NORMAL     sixes=1, turn began at 5             next: Chen
call  8  Chen  roll 6  11 -> 17  NORMAL     sixes=2                              next: Chen
call  9  Chen  roll 6  17 ->  5  FORFEIT    third six: back to 5, turn passes    next: Asha
call 10  Asha  roll 4   5 -> 16  LADDER     9 is a ladder foot                   next: Ben
call 11  Ben   roll 4  16 -> 20  FINISHED   ranking [Ben]; queue is Chen, Asha   next: Chen
call 12  Chen  roll 6   5 -> 11  NORMAL     a six: rolls again                   next: Chen
call 13  Chen  roll 2  11 -> 13  NORMAL                                          next: Asha
call 14  Asha  roll 4  16 -> 20  FINISHED   Chen is the only one left: ranked last
         state FINISHED, ranking [Ben, Asha, Chen]
call 15  playTurn() throws IllegalStateException: the game is over` },
        { type: `keypoints`, items: [
          `Every rule fired once: a ladder, a snake, an overshoot, an extra roll, the three-sixes forfeit (back to where the turn began, not to where the last roll started), two finishes and the last player ranked automatically.`,
          `After Ben finished, the queue skipped him without any special case: he had simply left it.`,
          `Chen's forfeit put him back at 5, the cell where the turn began, even though he had reached 17; the counter reset, so his next six (call 12) started a fresh count.`,
          `The trace doubles as a test: with ScriptedDice, the same fourteen rolls always give exactly these results.`
        ] }
      ] }
    ],
    levels: levels(
      [`Board, Player, Dice and Game with sensible responsibilities, and a working turn with snakes, ladders and an exact finish.`, `Turn order that rotates correctly, an extra roll on a six, and a clear end condition.`, `Snakes and ladders resolved by a lookup rather than by scanning a list on every move; a hint toward one map is fine.`, `A short demo or test that plays a few turns and shows the results.`],
      [`Pins down the house rules in the first minutes and lets the answers drive the per-turn state (sixes so far, where the turn began).`, `One validated jump map in an immutable Board, and Dice behind an interface justified by testing, with a scripted-dice test written or sketched.`, `A step-wise <code>playTurn()</code> returning a <code>TurnResult</code> instead of a loop that prints; the three-sixes forfeit and "a six that finishes earns no extra roll" handled without prompting.`, `Positions kept in Game rather than on Player, and a clear statement of which state is shared and how it is protected.`],
      [`Separates rules that are data (numbers, on/off switches) from rules with behaviour (overshoot policy, special cells) and shows where each lands without an if-chain.`, `Treats construction as the place to make bad states impossible: chains, cycles, jumps from the last cell, and what changes if chains are allowed.`, `Scales to many games: a shared immutable Board, a lock per game or thread confinement, per-game seeded randomness for replays, and a registry with cleanup.`, `Weighs simplicity against flexibility out loud: why there is no Builder, no Singleton and no Snake class hierarchy, and what would make each of them earn its place.`]
    ),
    concepts: [
      { term: `Jump map`, def: `Snakes and ladders stored together as one <code>Map&lt;Integer, Integer&gt;</code> from start cell to destination.`, why: `They behave identically; only the direction differs. One lookup resolves any landing cell.` },
      { term: `Validate at construction`, def: `The Board constructor rejects jumps off the board or from the last cell, two jumps on one cell, and a jump that ends on another jump's start.`, why: `An invalid board can never exist, so the move code needs no checks, and cycles are impossible.` },
      { term: `Records at the boundary`, def: `<code>Snake</code> and <code>Ladder</code> are records that check their own direction; the Board turns them into its map.`, why: `The board description is readable and duplicates can't vanish, yet the inside stays one simple map.` },
      { term: `Dice as a Strategy`, def: `An interface with <code>roll()</code>; RandomDice and ScriptedDice implement it.`, why: `Tests need predictable rolls and bug reports need replays; the Game never knows which dice it has.` },
      { term: `Turn queue`, def: `An <code>ArrayDeque</code> of players: the head moves, then rotates to the tail, stays for an extra roll, or leaves when finished.`, why: `Turn order, extra rolls and removing winners all become one-line queue operations.` },
      { term: `Per-turn memory`, def: `Two fields in Game: sixes rolled so far this turn and the cell where the turn began.`, why: `They are all the three-sixes rule needs, and they reset whenever the turn passes.` },
      { term: `Exact finish`, def: `A roll that would pass the last cell leaves the player where they are.`, why: `The most common rule, and the one most often coded wrong: clamping to 100 makes winning too easy.` },
      { term: `Step-wise playTurn()`, def: `One call applies one roll and returns a TurnResult; a loop is just a caller.`, why: `Tests, a timer-driven UI and a server can all drive the same game.` },
      { term: `Immutable board, locked game`, def: `Board has final fields and an unmodifiable map; Game's methods are synchronized on the game.`, why: `One Board is shared safely by every game, and each game's state is changed by one thread at a time.` }
    ],
    interview: [
      { q: `Why not a Snake class and a Ladder class with a move method?`, a: `Both are a start cell and a destination; the only difference is direction. Polymorphic Snake.apply() and Ladder.apply() would both just return the destination. Here Snake and Ladder are records that describe the board and check their own direction, and the Board stores them together in one map so resolving a landing cell is one lookup. If cells later gain real behaviour (skip a turn, roll again), that is the time to introduce a cell-effect type, with a jump as one kind of effect.`, diff: `easy` },
      { q: `Why does each player's position live in Game rather than on Player?`, a: `Position changes every turn and belongs to a particular game. If Player had a mutable position, the same player couldn't be in two games, and any code holding a Player could change it outside the game's lock. Keeping positions in a map inside Game means every change goes through playTurn(), under one lock, and Player becomes an immutable record that is safe to share.`, diff: `easy` },
      { q: `How do you test a game that depends on random dice?`, a: `Put the dice behind an interface and inject it into Game. Tests pass a ScriptedDice that returns a fixed list of rolls, so each turn's outcome is known in advance: a ladder, an overshoot, three sixes. RandomDice takes a seed, so a game reported in production can be replayed exactly from its seed. No mocking framework is needed.`, diff: `easy` },
      { q: `How do you implement "a six gives another roll, three sixes cancel the turn"?`, a: `Game keeps two fields for the current turn: how many sixes have been rolled and where the player started. On a six that is not the third, the player moves and the queue doesn't rotate, so the next playTurn() is theirs again. On the third six, the player goes back to the turn's starting cell and the queue rotates; this check happens before moving. Any other roll rotates the queue and resets the count. A six that finishes earns no extra roll.`, diff: `medium` },
      { q: `Why expose playTurn() instead of a play() method that runs the whole game?`, a: `A play() loop that rolls and prints until someone wins can only be tested by its final output, can't be animated, and holds a thread for the whole game. playTurn() applies one roll and returns a TurnResult, so a console loop, a test, a UI timer and a request handler are all just callers, and printing belongs to them.`, diff: `medium` },
      { q: `How do you rank everyone instead of stopping at the first winner?`, a: `When a player lands on the last cell, remove them from the turn queue and append them to a ranking list. When only one player is left, append them as last and set the state to FINISHED. Stopping at the first winner is the same code with the state set on the first finish, so it can become a switch in a Rules record.`, diff: `easy` },
      { q: `A timer thread plays turns while the UI thread reads positions. What can go wrong, and how do you prevent it?`, a: `ArrayDeque, HashMap and ArrayList are not thread-safe: the UI could read a map mid-resize, or see a player's new position before the queue rotates, drawing a state that never existed. Synchronizing every Game method that touches its fields makes each turn atomic and each read consistent. The Board needs no lock because it is immutable. Checking state() and then calling playTurn() is two lock acquisitions, which is fine with one playing thread; if several could play, playTurn() still rejects a move after the end.`, diff: `hard` }
    ],
    cheatsheet: [
      { title: `Snake and Ladders in one screen`, type: `code`, lang: `java`, body: `record Snake(int head, int tail) {}    // checks head > tail
record Ladder(int foot, int top) {}    // checks top > foot

final class Board {                    // immutable: share freely
    Board(int size, List<Snake> snakes, List<Ladder> ladders);  // rejects overlaps, chains, off-board
    int resolve(int cell);             // jumps.getOrDefault(cell, cell)
}
interface Dice { int roll(); }         // RandomDice(seed) to play, ScriptedDice to test

final class Game {                     // synchronized: one lock per game
    Deque<Player> turns; Map<Player, Integer> positions; List<Player> ranking;
    int sixes, turnStart;              // memory for the current turn
    TurnResult playTurn();             // over? roll; third six? overshoot? resolve; finish, stay or pass
}` },
      { title: `Follow-ups and where they land`, type: `table`, headers: [`Follow-up`, `Change`], rows: [
        [`A ladder may end on a snake's head`, `Board flattens chains at construction and rejects cycles (Deep Dives)`],
        [`Two dice, a crooked die, replays`, `Another Dice implementation, or a seed; Game untouched (Deep Dives)`],
        [`Bounce back, stop at first winner, no extra roll`, `A Rules record plus an Overshoot policy read by Game (Deep Dives)`],
        [`Skip-a-turn and roll-again cells`, `Board maps cells to effects; Game applies the effect (Deep Dives)`],
        [`A UI or server drives the game`, `Nothing: they call playTurn(); Game's locks already allow it (Deep Dives)`],
        [`Thousands of games`, `A registry of games sharing one Board; seeded dice per game (Deep Dives)`]
      ] }
    ],
    labs: []
  });
})();
