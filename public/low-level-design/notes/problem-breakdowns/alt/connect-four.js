// Go versions of the Connect Four code blocks, matched to the Java blocks by title. Imports are omitted.
window.ALT = window.ALT || {};
ALT["connect-four"] = { go: {
"Player, Disc and GameState": `type Disc int

const (
	Empty Disc = iota // the zero value: no disc in the cell
	Red
	Yellow
)

type GameState int

const (
	InProgress GameState = iota
	Won
	Draw
)

// Player is a comparable value: two players are equal when name and disc match.
type Player struct {
	Name string
	Disc Disc
}`,

"Final class design": `type Game struct {
	mu            sync.Mutex // guards every field below
	board         Board      // created with the game, never shared
	first, second Player
	current       Player
	state         GameState
	winner        *Player // set only together with Won
}

func NewGame(first, second Player) (*Game, error) // first moves first; colours must differ
func (g *Game) Play(p Player, column int) error    // error on an illegal move
func (g *Game) State() GameState
func (g *Game) Winner() (Player, bool)
func (g *Game) CurrentPlayer() Player
func (g *Game) Cell(row, col int) Disc // Empty when no disc, for a renderer

const Rows, Cols = 6, 7

type Board struct {
	grid    [Rows][Cols]Disc // row 0 is the top
	heights [Cols]int        // discs in each column
	total   int              // discs on the board
}

func (b *Board) CanDrop(col int) bool
func (b *Board) Drop(col int, d Disc) (int, error) // returns the landing row
func (b *Board) MakesFour(row, col int) bool       // lines through the disc just placed
func (b *Board) IsFull() bool
func (b *Board) Cell(row, col int) Disc`,

"Board": `const (
	Rows    = 6
	Cols    = 7
	connect = 4
)

var directions = [4][2]int{{0, 1}, {1, 0}, {1, 1}, {1, -1}} // across, down, two diagonals

// Board is not safe for concurrent use on its own: only a Game touches it, while holding the game's mutex.
type Board struct {
	grid    [Rows][Cols]Disc // row 0 is the top; Empty means no disc
	heights [Cols]int        // discs in each column
	total   int              // discs on the board
}

func (b *Board) CanDrop(col int) bool { return col >= 0 && col < Cols && b.heights[col] < Rows }

// Drop places a disc in the lowest empty cell of col and returns its row.
func (b *Board) Drop(col int, d Disc) (int, error) {
	if !b.CanDrop(col) {
		return 0, fmt.Errorf("column %d is full or out of range", col)
	}
	row := Rows - 1 - b.heights[col]
	b.grid[row][col] = d
	b.heights[col]++
	b.total++
	return row, nil
}

func (b *Board) IsFull() bool           { return b.total == Rows*Cols }
func (b *Board) Cell(row, col int) Disc { return b.grid[row][col] }

// MakesFour reports whether the disc at (row, col) is part of a line of four or more.
// Only lines through the disc just placed can be new.
func (b *Board) MakesFour(row, col int) bool {
	d := b.grid[row][col]
	for _, dir := range directions {
		run := 1 + b.count(row, col, dir[0], dir[1], d) + b.count(row, col, -dir[0], -dir[1], d)
		if run >= connect {
			return true
		}
	}
	return false
}

// count returns the matching discs next to (row, col), stepping by (dr, dc) until a different cell or the edge.
func (b *Board) count(row, col, dr, dc int, d Disc) int {
	n := 0
	for r, c := row+dr, col+dc; r >= 0 && r < Rows && c >= 0 && c < Cols && b.grid[r][c] == d; r, c = r+dr, c+dc {
		n++
	}
	return n
}`,

"Game": `// Game is one match. Every method locks mu, so moves from two devices are applied one at a time.
type Game struct {
	mu            sync.Mutex
	board         Board     // guarded by mu; never leaves this type
	first, second Player    // never change after NewGame
	current       Player    // guarded by mu
	state         GameState // guarded by mu
	winner        *Player   // guarded by mu; set only together with Won
}

func NewGame(first, second Player) (*Game, error) {
	if first.Disc == second.Disc {
		return nil, errors.New("players need different colours")
	}
	return &Game{first: first, second: second, current: first}, nil
}

func (g *Game) Play(p Player, column int) error {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.state != InProgress {
		return errors.New("the game is over")
	}
	if p != g.current {
		return fmt.Errorf("it is %s's turn", g.current.Name)
	}
	if !g.board.CanDrop(column) {
		return fmt.Errorf("column %d is full or out of range", column)
	}

	row, _ := g.board.Drop(column, p.Disc) // cannot fail: CanDrop was just checked under the lock
	switch {
	case g.board.MakesFour(row, column): // win before draw: the 42nd disc can win
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

func (g *Game) Cell(row, col int) Disc {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.board.Cell(row, col)
}`,

"Connect Four in one screen": `type Disc int      // Empty, Red, Yellow
type GameState int // InProgress, Won, Draw
type Player struct {
	Name string
	Disc Disc
}

type Board struct { // confined to its Game; no lock of its own
	grid    [Rows][Cols]Disc
	heights [Cols]int
	total   int
}

func (b *Board) CanDrop(col int) bool              // in range and heights[col] < Rows
func (b *Board) Drop(col int, d Disc) (int, error) // row = Rows - 1 - heights[col], then heights[col]++
func (b *Board) MakesFour(row, col int) bool       // 4 direction vectors, count both ways from the last disc
func (b *Board) IsFull() bool                      // total == Rows * Cols

type Game struct { // every method locks mu: one move at a time
	mu      sync.Mutex
	board   Board
	state   GameState
	current Player
	winner  *Player
}

func (g *Game) Play(p Player, col int) error
// over? your turn? column ok?  then drop; four -> Won, else full -> Draw, else switch turn`,

"Undo: a move stack in Game, one method on Board": `type Move struct {
	Player   Player
	Row, Col int
}

// Game gains a field, guarded by mu like everything else: history []Move

func (g *Game) Play(p Player, column int) error {
	g.mu.Lock()
	defer g.mu.Unlock()
	// ... the same three checks as before ...
	row, _ := g.board.Drop(column, p.Disc)
	g.history = append(g.history, Move{p, row, column})
	// ... win, draw or switch turn, as before ...
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
	g.board.removeTop(last.Col)         // the last move is always the top disc of its column
	g.current = last.Player             // it is that player's turn again
	g.state, g.winner = InProgress, nil // the position before any move had no winner
	return true
}

// Board: the only new method.
func (b *Board) removeTop(col int) error {
	if col < 0 || col >= Cols || b.heights[col] == 0 {
		return fmt.Errorf("column %d is empty", col)
	}
	b.heights[col]--
	b.grid[Rows-1-b.heights[col]][col] = Empty
	b.total--
	return nil
}`,

"A bot that works on a copy of the board": `type MoveChooser interface {
	Choose(b Board, me, opponent Disc) (int, error)
}

// SimpleBot takes a win, else blocks the opponent's win, else prefers the centre columns.
type SimpleBot struct{}

var preference = []int{3, 2, 4, 1, 5, 0, 6}

func (SimpleBot) Choose(b Board, me, opponent Disc) (int, error) {
	for _, col := range preference {
		if wins(b, col, me) {
			return col, nil
		}
	}
	for _, col := range preference {
		if wins(b, col, opponent) {
			return col, nil
		}
	}
	for _, col := range preference {
		if b.CanDrop(col) {
			return col, nil
		}
	}
	return 0, errors.New("no legal move")
}

// wins takes the board by value: Board holds only arrays, so the trial drop changes a private copy.
func wins(trial Board, col int, d Disc) bool {
	row, err := trial.Drop(col, d)
	return err == nil && trial.MakesFour(row, col)
}

// Game gains a snapshot, copied under the lock:
func (g *Game) Snapshot() Board {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.board // a value copy
}

// The bot's turn: col, err := chooser.Choose(game.Snapshot(), bot.Disc, human.Disc); then game.Play(bot, col)`,

"Board sized at construction": `type Board struct {
	rows, cols, connect int // never change after NewBoard
	grid                [][]Disc
	heights             []int
	total               int
}

func NewBoard(rows, cols, connect int) (*Board, error) {
	if rows < 1 || cols < 1 {
		return nil, errors.New("the board needs at least one cell")
	}
	if connect < 2 || connect > max(rows, cols) {
		return nil, fmt.Errorf("a line of %d cannot fit", connect)
	}
	grid := make([][]Disc, rows)
	for r := range grid {
		grid[r] = make([]Disc, cols)
	}
	return &Board{rows: rows, cols: cols, connect: connect, grid: grid, heights: make([]int, cols)}, nil
}

func (b *Board) CanDrop(col int) bool { return col >= 0 && col < b.cols && b.heights[col] < b.rows }
func (b *Board) IsFull() bool         { return b.total == b.rows*b.cols }

// Drop and count are unchanged except that Rows and Cols become b.rows and b.cols.

// MakesLine was MakesFour.
func (b *Board) MakesLine(row, col int) bool {
	d := b.grid[row][col]
	for _, dir := range directions {
		if 1+b.count(row, col, dir[0], dir[1], d)+b.count(row, col, -dir[0], -dir[1], d) >= b.connect {
			return true
		}
	}
	return false
}

// NewGame(first, second Player, rows, cols, connect int) calls NewBoard itself, so the board stays confined.
// Slices share memory, so a bot's Copy must now copy every row instead of relying on a value copy.`,

"A registry of games, each locking itself": `type GameService struct {
	mu    sync.RWMutex // guards the map only; each Game guards its own state
	games map[string]*Game
}

func NewGameService() *GameService { return &GameService{games: map[string]*Game{}} }

func (s *GameService) Start(a, b Player) (string, error) {
	g, err := NewGame(a, b)
	if err != nil {
		return "", err
	}
	id := newID() // 16 bytes from crypto/rand, hex-encoded: random and unguessable
	s.mu.Lock()
	s.games[id] = g
	s.mu.Unlock()
	return id, nil
}

// Play takes caller from the authenticated session, never from a name or colour in the request body.
func (s *GameService) Play(id string, caller Player, column int) error {
	s.mu.RLock()
	g, ok := s.games[id]
	s.mu.RUnlock()
	if !ok {
		return errors.New("no such game")
	}
	return g.Play(caller, column) // the game serializes moves on its own mutex
}

// End removes finished or abandoned games so the map does not grow forever.
func (s *GameService) End(id string) {
	s.mu.Lock()
	delete(s.games, id)
	s.mu.Unlock()
}`
} };
