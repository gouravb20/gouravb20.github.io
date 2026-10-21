// Go versions of the Snake and Ladders code blocks, matched to the Java blocks by title. Imports are omitted.
window.ALT = window.ALT || {};
ALT["snake-and-ladders"] = { go: {
"Snake, Ladder and Player": `// Snake must go down and Ladder must go up. Go structs have no constructors, so each type
// can check itself and NewBoard calls the check before accepting it.
type Snake struct{ Head, Tail int }

func (s Snake) validate() error {
	if s.Tail >= s.Head {
		return fmt.Errorf("snake at %d must go down", s.Head)
	}
	return nil
}

type Ladder struct{ Foot, Top int }

func (l Ladder) validate() error {
	if l.Top <= l.Foot {
		return fmt.Errorf("ladder at %d must go up", l.Foot)
	}
	return nil
}

// Player is a plain value; the position lives in Game.
type Player struct{ Name string }`,

"Final class design": `type Snake struct{ Head, Tail int }  // checked: Head > Tail
type Ladder struct{ Foot, Top int }  // checked: Top > Foot
type Player struct{ Name string }

type TurnResult struct {
	Player     Player
	Roll       int
	From, To   int
	Kind       MoveKind // Normal, Snake, Ladder, Overshoot, Forfeit, Finished
	RollsAgain bool
}

// Board is never written after NewBoard returns.
type Board struct {
	size  int
	jumps map[int]int // start cell -> destination, snakes and ladders alike
}

func NewBoard(size int, snakes []Snake, ladders []Ladder) (*Board, error) // validates the whole board
func (b *Board) Size() int
func (b *Board) Resolve(cell int) int

type Dice interface{ Roll() int } // RandomDice to play, ScriptedDice to test

// Game: every exported method holds mu.
type Game struct {
	mu               sync.Mutex
	board            *Board
	dice             Dice
	turns            []Player // turns[0] moves next
	positions        map[Player]int
	ranking          []Player
	state            GameState // InProgress or Finished
	sixes, turnStart int       // memory for the current turn
}

func NewGame(board *Board, dice Dice, players []Player) (*Game, error)
func (g *Game) PlayTurn() (TurnResult, error)
func (g *Game) State() GameState
func (g *Game) CurrentPlayer() (Player, bool)
func (g *Game) Position(p Player) (int, bool)
func (g *Game) Ranking() []Player`,

"Board": `// Board is never written after NewBoard returns, so any number of goroutines may read it
// without locking (concurrent reads of a Go map are safe when nothing writes).
type Board struct {
	size  int
	jumps map[int]int // start cell -> destination, for snakes and ladders alike
}

func NewBoard(size int, snakes []Snake, ladders []Ladder) (*Board, error) {
	if size < 2 {
		return nil, errors.New("a board needs at least 2 cells")
	}
	all := map[int]int{}
	add := func(from, to int) error {
		if from < 1 || from >= size || to < 1 || to > size {
			return fmt.Errorf("jump %d to %d is off the board or starts on the last cell", from, to)
		}
		if _, dup := all[from]; dup {
			return fmt.Errorf("two jumps start at %d", from)
		}
		all[from] = to
		return nil
	}
	for _, s := range snakes {
		if err := s.validate(); err != nil {
			return nil, err
		}
		if err := add(s.Head, s.Tail); err != nil {
			return nil, err
		}
	}
	for _, l := range ladders {
		if err := l.validate(); err != nil {
			return nil, err
		}
		if err := add(l.Foot, l.Top); err != nil {
			return nil, err
		}
	}
	for _, to := range all {
		if _, ok := all[to]; ok {
			return nil, fmt.Errorf("a jump lands on another jump at %d", to)
		}
	}
	return &Board{size: size, jumps: all}, nil
}

func (b *Board) Size() int { return b.size }

// Resolve returns where a token placed on cell ends up after any snake or ladder.
func (b *Board) Resolve(cell int) int {
	if to, ok := b.jumps[cell]; ok {
		return to
	}
	return cell
}`,

"Dice": `type Dice interface{ Roll() int }

// RandomDice is fair; a fixed seed replays a game exactly. Owned by one game, rolled under its lock.
type RandomDice struct {
	rng          *rand.Rand
	count, faces int
}

func NewRandomDice(count, faces int, seed int64) *RandomDice {
	return &RandomDice{rng: rand.New(rand.NewSource(seed)), count: count, faces: faces}
}

func (d *RandomDice) Roll() int {
	total := 0
	for i := 0; i < d.count; i++ {
		total += d.rng.Intn(d.faces) + 1
	}
	return total
}

// ScriptedDice returns the given rolls in order, for tests, and panics when they run out.
// It is not safe for concurrent use on its own; the game only rolls it while holding its mutex.
type ScriptedDice struct{ rolls []int }

func NewScriptedDice(rolls ...int) *ScriptedDice { return &ScriptedDice{rolls: rolls} }

func (d *ScriptedDice) Roll() int {
	if len(d.rolls) == 0 {
		panic("no more scripted rolls")
	}
	r := d.rolls[0]
	d.rolls = d.rolls[1:]
	return r
}`,

"Game": `type GameState int

const (
	InProgress GameState = iota
	Finished
)

type MoveKind int

const (
	KindNormal MoveKind = iota
	KindSnake
	KindLadder
	KindOvershoot
	KindForfeit
	KindFinished
)

func (k MoveKind) String() string {
	return [...]string{"NORMAL", "SNAKE", "LADDER", "OVERSHOOT", "FORFEIT", "FINISHED"}[k]
}

type TurnResult struct {
	Player     Player
	Roll       int
	From, To   int
	Kind       MoveKind
	RollsAgain bool
}

const (
	six      = 6
	maxSixes = 3
)

// Game is safe for concurrent use: every exported method holds mu while it touches the fields below.
type Game struct {
	mu        sync.Mutex
	board     *Board   // immutable, may be shared
	dice      Dice     // owned by this game, rolled under mu
	turns     []Player // turns[0] moves next
	positions map[Player]int
	ranking   []Player
	state     GameState
	sixes     int // sixes rolled so far this turn
	turnStart int // where the current player began this turn
}

func NewGame(board *Board, dice Dice, players []Player) (*Game, error) {
	if len(players) < 2 {
		return nil, errors.New("need at least two players")
	}
	positions := map[Player]int{}
	for _, p := range players {
		if _, dup := positions[p]; dup {
			return nil, fmt.Errorf("duplicate player %s", p.Name)
		}
		positions[p] = 0
	}
	turns := append([]Player(nil), players...)
	return &Game{board: board, dice: dice, turns: turns, positions: positions}, nil
}

func (g *Game) PlayTurn() (TurnResult, error) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.state == Finished {
		return TurnResult{}, errors.New("the game is over")
	}
	p := g.turns[0]
	from := g.positions[p]
	if g.sixes == 0 {
		g.turnStart = from
	}
	roll := g.dice.Roll()

	if roll == six {
		g.sixes++
		if g.sixes == maxSixes { // third six: cancel the whole turn
			back := g.turnStart
			g.positions[p] = back
			g.passTurn()
			return TurnResult{p, roll, from, back, KindForfeit, false}, nil
		}
	}

	target := from + roll
	to := from // overshoot: stay put
	if target <= g.board.Size() {
		to = g.board.Resolve(target)
	}
	g.positions[p] = to

	if to == g.board.Size() {
		g.finish(p)
		return TurnResult{p, roll, from, to, KindFinished, false}, nil
	}
	again := roll == six
	if !again { // after a six the same player rolls next
		g.passTurn()
	}
	return TurnResult{p, roll, from, to, g.kind(target, to), again}, nil
}

func (g *Game) kind(target, to int) MoveKind {
	switch {
	case target > g.board.Size():
		return KindOvershoot
	case to < target:
		return KindSnake
	case to > target:
		return KindLadder
	}
	return KindNormal
}

func (g *Game) passTurn() {
	g.turns = append(g.turns[1:], g.turns[0])
	g.sixes = 0
}

func (g *Game) finish(p Player) {
	g.turns = g.turns[1:]
	g.ranking = append(g.ranking, p)
	g.sixes = 0
	if len(g.turns) == 1 { // the last player left is ranked last
		g.ranking = append(g.ranking, g.turns[0])
		g.turns = nil
		g.state = Finished
	}
}

func (g *Game) State() GameState {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.state
}

func (g *Game) CurrentPlayer() (Player, bool) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if len(g.turns) == 0 {
		return Player{}, false
	}
	return g.turns[0], true
}

func (g *Game) Position(p Player) (int, bool) {
	g.mu.Lock()
	defer g.mu.Unlock()
	pos, ok := g.positions[p]
	return pos, ok
}

func (g *Game) Ranking() []Player {
	g.mu.Lock()
	defer g.mu.Unlock()
	return append([]Player(nil), g.ranking...)
}`,

"Running a game": `board, err := NewBoard(100,
	[]Snake{{99, 54}, {70, 55}, {52, 42}, {25, 2}, {95, 72}},
	[]Ladder{{6, 27}, {11, 40}, {60, 85}, {46, 90}, {17, 69}})
if err != nil {
	log.Fatal(err)
}
players := []Player{{"Asha"}, {"Ben"}, {"Chen"}}
game, err := NewGame(board, NewRandomDice(1, 6, time.Now().UnixNano()), players)
if err != nil {
	log.Fatal(err)
}

for game.State() == InProgress {
	t, err := game.PlayTurn()
	if err != nil {
		break
	}
	fmt.Println(t.Player.Name, "rolled", t.Roll, ":", t.From, "to", t.To, t.Kind)
}
fmt.Println("Ranking:", game.Ranking())`,

"Snake and Ladders in one screen": `type Snake struct{ Head, Tail int } // checked: Head > Tail
type Ladder struct{ Foot, Top int } // checked: Top > Foot

type Board struct { // immutable: share freely
	size  int
	jumps map[int]int
}

func NewBoard(size int, snakes []Snake, ladders []Ladder) (*Board, error) // rejects overlaps, chains, off-board
func (b *Board) Resolve(cell int) int                                      // jumps[cell], or cell

type Dice interface{ Roll() int } // RandomDice(seed) to play, ScriptedDice to test

type Game struct { // a sync.Mutex per game
	mu               sync.Mutex
	turns            []Player
	positions        map[Player]int
	ranking          []Player
	sixes, turnStart int // memory for the current turn
}

func (g *Game) PlayTurn() (TurnResult, error) // over? roll; third six? overshoot? resolve; finish, stay or pass`,

"Allowing chains, rejecting cycles": `// flatten allows a jump to land on another jump's start: it follows each chain once at build
// time and rejects cycles, so Resolve stays a single lookup.
func flatten(jumps map[int]int) (map[int]int, error) {
	flat := make(map[int]int, len(jumps))
	for start := range jumps {
		seen := map[int]bool{}
		cell := start
		for {
			next, ok := jumps[cell]
			if !ok {
				break
			}
			if seen[cell] {
				return nil, fmt.Errorf("jumps form a cycle through %d", cell)
			}
			seen[cell] = true
			cell = next
		}
		flat[start] = cell
	}
	return flat, nil
}

// In NewBoard, the "lands on another jump" check is replaced by:
//	jumps, err := flatten(all)`,

"Crooked dice": `// CrookedDice only rolls even numbers. One new type; Game is untouched.
type CrookedDice struct{ rng *rand.Rand }

func NewCrookedDice(seed int64) *CrookedDice {
	return &CrookedDice{rng: rand.New(rand.NewSource(seed))}
}

func (d *CrookedDice) Roll() int { return 2 * (d.rng.Intn(3) + 1) } // 2, 4 or 6`,

"Deterministic tests with scripted dice": `func TestLadderOvershootAndRanking(t *testing.T) {
	board, _ := NewBoard(10, []Snake{{9, 2}}, []Ladder{{3, 8}})
	a, b := Player{"A"}, Player{"B"}
	game, _ := NewGame(board, NewScriptedDice(3, 1, 4, 2, 2), []Player{a, b})

	// A: ladder 3 to 8; B: 1; A: 8 + 4 is past 10; B: ladder 3 to 8; A: 8 + 2 = 10 exactly
	want := []MoveKind{KindLadder, KindNormal, KindOvershoot, KindLadder, KindFinished}
	for i, w := range want {
		r, err := game.PlayTurn()
		if err != nil || r.Kind != w {
			t.Fatalf("turn %d: got %v, %v; want %v", i, r.Kind, err, w)
		}
	}
	if game.State() != Finished {
		t.Fatal("game should be finished")
	}
	if got := game.Ranking(); len(got) != 2 || got[0] != a || got[1] != b {
		t.Fatalf("ranking = %v", got)
	}
}

func TestThreeSixesCancelTheTurn(t *testing.T) {
	board, _ := NewBoard(30, nil, nil)
	a, b := Player{"A"}, Player{"B"}
	game, _ := NewGame(board, NewScriptedDice(6, 6, 6), []Player{a, b})

	game.PlayTurn() // A: 6, rolls again
	game.PlayTurn() // A: 12, rolls again
	if r, _ := game.PlayTurn(); r.Kind != KindForfeit {
		t.Fatalf("third six: got %v, want FORFEIT", r.Kind)
	}
	if pos, _ := game.Position(a); pos != 0 { // back to where the turn began
		t.Fatalf("A is at %d, want 0", pos)
	}
	if cur, _ := game.CurrentPlayer(); cur != b {
		t.Fatalf("current player = %v, want B", cur)
	}
}`,

"Rules as data plus one strategy": `// Overshoot decides where a roll that passes the last cell lands. The behaviour differs, so it is a strategy.
type Overshoot func(from, roll, size int) int

var (
	Stay         Overshoot = func(from, roll, size int) int { return from }
	BounceBack   Overshoot = func(from, roll, size int) int { return 2*size - (from + roll) }
	FinishAnyway Overshoot = func(from, roll, size int) int { return size }
)

// Rules: knobs that are only numbers or on/off stay plain data. Passed by value, so games can't change each other's.
type Rules struct {
	MaxSixes         int
	ExtraTurnOnSix   bool
	PlayUntilOneLeft bool
	Overshoot        Overshoot
}

func ClassicRules() Rules { return Rules{3, true, true, Stay} }
func QuickRules() Rules   { return Rules{math.MaxInt, false, false, FinishAnyway} }

// Inside PlayTurn: each rule is read once, with no branching on rule names.
target := from + roll
cell := target
if target > g.board.Size() {
	cell = g.rules.Overshoot(from, roll, g.board.Size())
}
to := g.board.Resolve(cell)
again := g.rules.ExtraTurnOnSix && roll == six`,

"Special cells as effects": `// CellEffect is what landing on a cell does. The unexported method closes the set of kinds.
type CellEffect interface{ isCellEffect() }

type Jump struct{ To int } // snakes and ladders
type SkipNextTurn struct{}
type RollAgain struct{}

func (Jump) isCellEffect()         {}
func (SkipNextTurn) isCellEffect() {}
func (RollAgain) isCellEffect()    {}

// Board: the jump map becomes a map of effects, built and validated once and never written again.
//	effects map[int]CellEffect
func (b *Board) EffectAt(cell int) CellEffect { return b.effects[cell] } // nil for a plain cell

// Game: one more field, guarded by mu like the others.
//	skipping map[Player]bool

// In PlayTurn, replacing the resolve step (overshoot already handled):
effect := g.board.EffectAt(target)
to := target
if j, ok := effect.(Jump); ok {
	to = j.To
}
_, rollAgain := effect.(RollAgain)
again := roll == six || rollAgain
if _, ok := effect.(SkipNextTurn); ok {
	g.skipping[p] = true
}

func (g *Game) passTurn() {
	g.turns = append(g.turns[1:], g.turns[0])
	g.sixes = 0
	for g.skipping[g.turns[0]] { // a skipped player loses one turn, then is cleared
		delete(g.skipping, g.turns[0])
		g.turns = append(g.turns[1:], g.turns[0])
	}
}`,

"A timer-driven driver": `// AutoPlay plays one turn per tick on its own goroutine while the UI goroutine reads State;
// Game's mutex makes that safe. It stops when PlayTurn reports the game is over.
func AutoPlay(g *Game, every time.Duration, onTurn func(TurnResult)) {
	ticker := time.NewTicker(every)
	go func() {
		defer ticker.Stop()
		for range ticker.C {
			r, err := g.PlayTurn()
			if err != nil {
				return
			}
			onTurn(r)
		}
	}()
}`,

"A registry of games sharing one board": `type GameRegistry struct {
	board *Board // immutable, shared by every game
	mu    sync.RWMutex
	games map[string]*Game
}

func NewGameRegistry(board *Board) *GameRegistry {
	return &GameRegistry{board: board, games: map[string]*Game{}}
}

func (r *GameRegistry) Start(players []Player) (string, error) {
	g, err := NewGame(r.board, NewRandomDice(1, 6, rand.Int63()), players) // each game gets its own dice
	if err != nil {
		return "", err
	}
	id := newID() // a random unique id, e.g. 16 bytes from crypto/rand as hex
	r.mu.Lock()
	r.games[id] = g
	r.mu.Unlock()
	return id, nil
}

func (r *GameRegistry) PlayTurn(id string) (TurnResult, error) {
	r.mu.RLock()
	g, ok := r.games[id]
	r.mu.RUnlock()
	if !ok {
		return TurnResult{}, fmt.Errorf("no such game %s", id)
	}
	res, err := g.PlayTurn() // Game locks itself; games never contend
	if err == nil && g.State() == Finished {
		r.mu.Lock()
		delete(r.games, id)
		r.mu.Unlock()
	}
	return res, err
}`,

"Simulating many games in parallel": `// AverageTurns plays games on a pool of goroutines. Each goroutine creates and owns its Game
// (confinement); only the immutable Board and the read-only player slice are shared, and
// results come back over a channel.
func AverageTurns(board *Board, players []Player, games, workers int) float64 {
	seeds := make(chan int64)
	turns := make(chan int)
	var wg sync.WaitGroup
	for w := 0; w < workers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for seed := range seeds {
				g, _ := NewGame(board, NewRandomDice(1, 6, seed), players)
				n := 0
				for g.State() == InProgress {
					g.PlayTurn()
					n++
				}
				turns <- n
			}
		}()
	}
	go func() {
		for s := 0; s < games; s++ {
			seeds <- int64(s)
		}
		close(seeds)
	}()
	go func() {
		wg.Wait()
		close(turns)
	}()
	total := 0
	for n := range turns {
		total += n
	}
	return float64(total) / float64(games)
}`
} };
