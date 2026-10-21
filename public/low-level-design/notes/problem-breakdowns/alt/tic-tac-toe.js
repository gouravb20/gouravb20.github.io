// Go versions of the Tic-Tac-Toe code blocks, matched to the Java blocks by title. Imports are omitted.
window.ALT = window.ALT || {};
ALT["tic-tac-toe"] = { go: {
"Symbol, Player and GameState": `type Symbol int

const (
	Empty Symbol = iota // the zero value, so a fresh grid is all empty
	X
	O
)

type GameState int

const (
	InProgress GameState = iota
	Won
	Draw
)

// Player is a comparable value: two players are equal when name and symbol match.
type Player struct {
	Name   string
	Symbol Symbol
}

// Cell is a coordinate, for move sources and bots.
type Cell struct{ Row, Col int }`,

"Final class design": `type Game struct { // the entry point; one mutex per game
	mu            sync.Mutex
	board         *Board      // created here, never handed out
	tracker       *WinTracker
	first, second Player
	current       Player
	state         GameState // InProgress, Won or Draw
	winner        *Player   // set only when state == Won
}

func NewGame(first, second Player, size int) (*Game, error) // size 3 for the classic game
func (g *Game) Play(p Player, row, col int) error              // error on an invalid move
func (g *Game) State() GameState
func (g *Game) Winner() (Player, bool)
func (g *Game) CurrentPlayer() Player
func (g *Game) Cell(row, col int) Symbol // Empty when free, for a renderer
func (g *Game) Size() int

type Board struct {
	n      int
	grid   [][]Symbol // Empty means free
	filled int
}

func (b *Board) Place(row, col int, s Symbol) error // error if off the board or taken
func (b *Board) Inside(row, col int) bool
func (b *Board) Cell(row, col int) Symbol
func (b *Board) IsFull() bool
func (b *Board) Size() int

type WinTracker struct {
	n          int
	rows, cols []int // X adds +1, O adds -1
	diag, anti int   // main diagonal and anti-diagonal
}

func (t *WinTracker) Record(row, col int, s Symbol) bool // true if this move completed a line`,

"Board": `type Board struct {
	n      int
	grid   [][]Symbol // Empty means free
	filled int
}

func NewBoard(n int) (*Board, error) {
	if n < 3 {
		return nil, errors.New("board size must be at least 3")
	}
	grid := make([][]Symbol, n)
	for i := range grid {
		grid[i] = make([]Symbol, n)
	}
	return &Board{n: n, grid: grid}, nil
}

func (b *Board) Size() int                { return b.n }
func (b *Board) Inside(row, col int) bool { return row >= 0 && row < b.n && col >= 0 && col < b.n }
func (b *Board) Cell(row, col int) Symbol { return b.grid[row][col] }
func (b *Board) IsFull() bool             { return b.filled == b.n*b.n }

func (b *Board) Place(row, col int, s Symbol) error {
	if !b.Inside(row, col) {
		return fmt.Errorf("cell (%d, %d) is off the board", row, col)
	}
	if b.grid[row][col] != Empty {
		return fmt.Errorf("cell (%d, %d) is taken", row, col)
	}
	b.grid[row][col] = s
	b.filled++
	return nil
}`,

"Win check: the lines through the last move": `// completesLine is the "better" option: O(n) per move and no extra state.
func (b *Board) completesLine(row, col int) bool {
	s := b.grid[row][col]
	r, c, d, a := true, true, row == col, row+col == b.n-1
	for i := 0; i < b.n; i++ {
		r = r && b.grid[row][i] == s
		c = c && b.grid[i][col] == s
		d = d && b.grid[i][i] == s
		a = a && b.grid[i][b.n-1-i] == s
	}
	return r || c || d || a
}`,

"WinTracker": `// WinTracker checks for a win in O(1): X adds +1 to every line it touches, O adds -1,
// and a line at +n or -n is complete.
type WinTracker struct {
	n          int
	rows, cols []int
	diag, anti int // main diagonal (row == col) and anti-diagonal (row+col == n-1)
}

func NewWinTracker(n int) *WinTracker {
	return &WinTracker{n: n, rows: make([]int, n), cols: make([]int, n)}
}

// Record adds a move that has already been placed and reports whether it completed a line.
func (t *WinTracker) Record(row, col int, s Symbol) bool {
	d := 1
	if s == O {
		d = -1
	}
	t.rows[row] += d
	t.cols[col] += d
	if row == col {
		t.diag += d
	}
	if row+col == t.n-1 {
		t.anti += d
	}
	// A diagonal can only reach n on the move that fills it, because the game stops at the first win.
	return abs(t.rows[row]) == t.n || abs(t.cols[col]) == t.n || abs(t.diag) == t.n || abs(t.anti) == t.n
}

func abs(v int) int {
	if v < 0 {
		return -v
	}
	return v
}`,

"Game": `// Game is safe for concurrent use: every method that touches mutable state holds mu,
// and board and tracker are created here and never handed out, so mu guards them too.
type Game struct {
	mu            sync.Mutex
	board         *Board
	tracker       *WinTracker
	first, second Player
	current       Player
	state         GameState
	winner        *Player
}

func NewGame(first, second Player, size int) (*Game, error) {
	if first.Symbol == Empty || second.Symbol == Empty || first.Symbol == second.Symbol {
		return nil, errors.New("players need different, non-empty symbols")
	}
	board, err := NewBoard(size)
	if err != nil {
		return nil, err
	}
	return &Game{board: board, tracker: NewWinTracker(size), first: first, second: second, current: first}, nil
}

func (g *Game) Play(p Player, row, col int) error {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.state != InProgress {
		return errors.New("the game is over")
	}
	if p != g.current {
		return fmt.Errorf("it is %s's turn", g.current.Name)
	}
	if err := g.board.Place(row, col, p.Symbol); err != nil { // fails before writing if off the board or taken
		return err
	}
	switch {
	case g.tracker.Record(row, col, p.Symbol): // win is checked before draw
		g.state, g.winner = Won, &p
	case g.board.IsFull():
		g.state = Draw
	case g.current == g.first:
		g.current = g.second
	default:
		g.current = g.first
	}
	return nil
}

func (g *Game) State() GameState {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.state
}

func (g *Game) Winner() (Player, bool) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.winner == nil {
		return Player{}, false
	}
	return *g.winner, true
}

func (g *Game) CurrentPlayer() Player {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.current
}

func (g *Game) Cell(row, col int) Symbol {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.board.Cell(row, col)
}

func (g *Game) Size() int { return g.board.Size() } // n never changes after construction`,

"Turn loop": `// MoveSource is where a move comes from: a console reader, a bot, a network client.
type MoveSource interface {
	Next(g *Game) Cell
}

// RunTurns plays one game to the end on the calling goroutine; a rejected move is asked for again.
func RunTurns(g *Game, sources map[Player]MoveSource) {
	for g.State() == InProgress {
		p := g.CurrentPlayer()
		c := sources[p].Next(g)
		if err := g.Play(p, c.Row, c.Col); err != nil {
			fmt.Println("Rejected:", err, "- try again")
		}
	}
	if w, ok := g.Winner(); ok {
		fmt.Println(w.Name, "wins")
	} else {
		fmt.Println("Draw")
	}
}`,

"Tic-Tac-Toe in one screen": `type Player struct { // Symbol: Empty, X, O; GameState: InProgress, Won, Draw
	Name   string
	Symbol Symbol
}

type Board struct {
	grid   [][]Symbol // Empty means free
	filled int
}

func (b *Board) Place(r, c int, s Symbol) error // error if off the board or taken
func (b *Board) IsFull() bool

type WinTracker struct {
	rows, cols []int // X adds +1, O adds -1
	diag, anti int
}

func (t *WinTracker) Record(r, c int, s Symbol) bool // a line at +n or -n wins: O(1)

type Game struct { // every method holds mu: one lock per game
	mu      sync.Mutex
	state   GameState
	current Player
	winner  *Player
}

func (g *Game) Play(p Player, r, c int) error // over? turn? place, win, draw, switch turn

// Order inside Play: state check, turn check, place (bounds, taken), win, draw, switch.`,

"Run check for K in a row": `type WinRule interface {
	// Wins is called after s has been placed at (row, col); true if this move wins.
	Wins(b *Board, row, col int, s Symbol) bool
}

// WinTracker satisfies WinRule for K == N:
// func (t *WinTracker) Wins(_ *Board, row, col int, s Symbol) bool { return t.Record(row, col, s) }

var directions = [4][2]int{{0, 1}, {1, 0}, {1, 1}, {1, -1}}

type RunChecker struct{ K int }

func (rc RunChecker) Wins(b *Board, row, col int, s Symbol) bool {
	for _, d := range directions {
		if 1+rc.count(b, row, col, d[0], d[1], s)+rc.count(b, row, col, -d[0], -d[1], s) >= rc.K {
			return true
		}
	}
	return false
}

func (rc RunChecker) count(b *Board, row, col, dr, dc int, s Symbol) int {
	n := 0
	for r, c := row+dr, col+dc; n < rc.K-1 && b.Inside(r, c) && b.Cell(r, c) == s; r, c = r+dr, c+dc {
		n++
	}
	return n
}

// In NewGame: var rule WinRule = RunChecker{K: k}; if k == size { rule = NewWinTracker(size) }
// Play calls rule.Wins(g.board, row, col, p.Symbol) where it called g.tracker.Record(row, col, p.Symbol).`,

"Bot interface and grid helpers": `// MoveChooser picks a move from a private copy of the grid; it may scribble on the copy but must restore it.
type MoveChooser interface {
	Choose(grid [][]Symbol, me Symbol) (Cell, error)
}

// Snapshot returns a copy taken under the game's lock.
func (g *Game) Snapshot() [][]Symbol {
	g.mu.Lock()
	defer g.mu.Unlock()
	out := make([][]Symbol, g.board.n)
	for r := range out {
		out[r] = append([]Symbol(nil), g.board.grid[r]...)
	}
	return out
}

func other(s Symbol) Symbol {
	if s == X {
		return O
	}
	return X
}

func empties(g [][]Symbol) []Cell {
	var out []Cell
	for r := range g {
		for c := range g[r] {
			if g[r][c] == Empty {
				out = append(out, Cell{r, c})
			}
		}
	}
	return out
}

func wins(g [][]Symbol, s Symbol) bool {
	n := len(g)
	d, a := true, true
	for i := 0; i < n; i++ {
		row, col := true, true
		for j := 0; j < n; j++ {
			row = row && g[i][j] == s
			col = col && g[j][i] == s
		}
		if row || col {
			return true
		}
		d = d && g[i][i] == s
		a = a && g[i][n-1-i] == s
	}
	return d || a
}

// winsAt reports whether s playing at c would complete a line; g is left unchanged.
func winsAt(g [][]Symbol, c Cell, s Symbol) bool {
	g[c.Row][c.Col] = s
	win := wins(g, s)
	g[c.Row][c.Col] = Empty
	return win
}`,

"Rule-based bot": `type RuleBot struct{}

func (RuleBot) Choose(g [][]Symbol, me Symbol) (Cell, error) {
	free := empties(g)
	if len(free) == 0 {
		return Cell{}, errors.New("no legal move")
	}
	for _, c := range free { // 1. win now
		if winsAt(g, c, me) {
			return c, nil
		}
	}
	for _, c := range free { // 2. block their win
		if winsAt(g, c, other(me)) {
			return c, nil
		}
	}
	mid, last := len(g)/2, len(g)-1
	if g[mid][mid] == Empty { // 3. centre
		return Cell{mid, mid}, nil
	}
	for _, c := range []Cell{{0, 0}, {0, last}, {last, 0}, {last, last}} { // 4. a corner
		if g[c.Row][c.Col] == Empty {
			return c, nil
		}
	}
	return free[0], nil // 5. anything
}`,

"Minimax bot (negamax form)": `// MinimaxBot plays perfectly on 3 x 3. Scores are from the side to move:
// positive is a win, 0 a draw, negative a loss.
type MinimaxBot struct{}

func (MinimaxBot) Choose(g [][]Symbol, me Symbol) (Cell, error) {
	free := empties(g)
	if len(free) == 0 {
		return Cell{}, errors.New("no legal move")
	}
	best, bestScore := free[0], math.MinInt
	for _, c := range free {
		g[c.Row][c.Col] = me
		score := -negamax(g, other(me), 1)
		g[c.Row][c.Col] = Empty
		if score > bestScore {
			best, bestScore = c, score
		}
	}
	return best, nil
}

func negamax(g [][]Symbol, toMove Symbol, depth int) int {
	if wins(g, other(toMove)) {
		return depth - 10 // the last mover won; a later loss scores higher
	}
	free := empties(g)
	if len(free) == 0 {
		return 0 // draw
	}
	best := math.MinInt
	for _, c := range free {
		g[c.Row][c.Col] = toMove
		best = max(best, -negamax(g, other(toMove), depth+1))
		g[c.Row][c.Col] = Empty
	}
	return best
}`,

"Undo with a move stack": `type Move struct {
	Player   Player
	Row, Col int
}

// Game gains a field: history []Move, guarded by the same mu as everything else.

func (g *Game) Play(p Player, row, col int) error {
	g.mu.Lock()
	defer g.mu.Unlock()
	// ... validation and placement as before ...
	g.history = append(g.history, Move{p, row, col})
	// ... win / draw / switch turn as before ...
	return nil
}

func (g *Game) Undo() bool {
	g.mu.Lock()
	defer g.mu.Unlock()
	if len(g.history) == 0 {
		return false
	}
	last := g.history[len(g.history)-1]
	g.history = g.history[:len(g.history)-1]
	g.board.clear(last.Row, last.Col) // empties the cell and decrements filled
	g.tracker.Unrecord(last.Row, last.Col, last.Player.Symbol)
	g.current = last.Player
	g.state, g.winner = InProgress, nil // the position before the last move had no winner
	return true
}

// Unrecord is the exact inverse of Record.
func (t *WinTracker) Unrecord(row, col int, s Symbol) {
	d := -1
	if s == O {
		d = 1
	}
	t.rows[row] += d
	t.cols[col] += d
	if row == col {
		t.diag += d
	}
	if row+col == t.n-1 {
		t.anti += d
	}
}`,

"A registry of games": `// GameManager is safe for concurrent use: mu guards the map, and each Game guards its own state.
// Create one at startup and pass it to the handlers; it is not a global.
type GameManager struct {
	mu    sync.RWMutex
	games map[string]*Game
}

func NewGameManager() *GameManager { return &GameManager{games: map[string]*Game{}} }

func (m *GameManager) Create(x, o Player, size int) (string, error) {
	g, err := NewGame(x, o, size) // validate before publishing
	if err != nil {
		return "", err
	}
	id := newID() // unguessable: e.g. 16 bytes from crypto/rand, hex-encoded
	m.mu.Lock()
	m.games[id] = g
	m.mu.Unlock()
	return id, nil
}

func (m *GameManager) Play(id string, p Player, row, col int) error {
	g, err := m.find(id)
	if err != nil {
		return err
	}
	return g.Play(p, row, col) // the map lock is released; the game's own mutex serializes moves within it
}

// EvictIfOver removes a finished game; a game still in progress is kept.
func (m *GameManager) EvictIfOver(id string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if g, ok := m.games[id]; ok && g.State() != InProgress { // lock order: map, then game
		delete(m.games, id)
	}
}

func (m *GameManager) find(id string) (*Game, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	g, ok := m.games[id]
	if !ok {
		return nil, fmt.Errorf("no game %s", id)
	}
	return g, nil
}`,

"Scoreboard as a game listener": `// GameListener hears about a game once, on the move that ends it.
type GameListener interface {
	OnGameOver(result GameState, winner *Player)
}

// Game gains a field: listeners []GameListener, guarded by mu.
func (g *Game) AddListener(l GameListener) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.listeners = append(g.listeners, l)
}

func (g *Game) Play(p Player, row, col int) error {
	g.mu.Lock()
	err := g.applyMove(p, row, col) // the old body of Play; errors on an invalid move
	result, winner := g.state, g.winner
	listeners := append([]GameListener(nil), g.listeners...) // a copy, so they can be called unlocked
	g.mu.Unlock()
	if err != nil {
		return err // later moves fail here, so listeners hear only the ending move
	}
	if result != InProgress {
		for _, l := range listeners { // outside the lock: a slow listener can't stall the game
			l.OnGameOver(result, winner)
		}
	}
	return nil
}

// Scoreboard is shared by every game and called from many goroutines, so mu guards both fields.
type Scoreboard struct {
	mu    sync.Mutex
	wins  map[string]int
	draws int
}

func NewScoreboard() *Scoreboard { return &Scoreboard{wins: map[string]int{}} }

func (s *Scoreboard) OnGameOver(result GameState, winner *Player) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if result == Draw {
		s.draws++
	} else if winner != nil {
		s.wins[winner.Name]++ // read-modify-write under the lock, so no update is lost
	}
}

func (s *Scoreboard) WinsFor(name string) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.wins[name]
}

func (s *Scoreboard) Draws() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.draws
}`
} };
