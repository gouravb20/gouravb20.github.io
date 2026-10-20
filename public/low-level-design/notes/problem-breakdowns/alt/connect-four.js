// Go versions of the Connect Four code blocks, matched to the Java blocks by title. Imports are omitted.
window.ALT = window.ALT || {};
ALT["connect-four"] = { go: {
"Public API": `func NewGame(first, second Player) (*Game, error)
func (g *Game) Play(p Player, column int) error // error on an invalid move
func (g *Game) State() GameState
func (g *Game) Winner() (Player, bool)
func (g *Game) CurrentPlayer() Player
func (g *Game) Cell(row, col int) Disc // Empty when no disc, for a renderer`,

"Board": `type Disc int

const (
	Empty Disc = iota
	Red
	Yellow
)

const (
	Rows = 6
	Cols = 7
)

var directions = [4][2]int{{0, 1}, {1, 0}, {1, 1}, {1, -1}} // across, down, two diagonals

type Board struct {
	grid   [Rows][Cols]Disc // row 0 is the top
	filled [Cols]int        // discs in each column
	total  int
}

func (b *Board) CanDrop(col int) bool { return col >= 0 && col < Cols && b.filled[col] < Rows }

// Drop places a disc and returns the row it landed in.
func (b *Board) Drop(col int, d Disc) (int, error) {
	if !b.CanDrop(col) {
		return 0, fmt.Errorf("column %d is full or out of range", col)
	}
	row := Rows - 1 - b.filled[col]
	b.filled[col]++
	b.grid[row][col] = d
	b.total++
	return row, nil
}

func (b *Board) IsFull() bool           { return b.total == Rows*Cols }
func (b *Board) Cell(row, col int) Disc { return b.grid[row][col] }

// MakesFour reports whether the disc at (row, col) is part of four or more in a line.
func (b *Board) MakesFour(row, col int) bool {
	d := b.grid[row][col]
	for _, dir := range directions {
		run := 1 + b.count(row, col, dir[0], dir[1], d) + b.count(row, col, -dir[0], -dir[1], d)
		if run >= 4 {
			return true
		}
	}
	return false
}

func (b *Board) count(row, col, dr, dc int, d Disc) int {
	n := 0
	for r, c := row+dr, col+dc; r >= 0 && r < Rows && c >= 0 && c < Cols && b.grid[r][c] == d; r, c = r+dr, c+dc {
		n++
	}
	return n
}`,

"Game": `type GameState int

const (
	InProgress GameState = iota
	Won
	Draw
)

type Player struct {
	Name string
	Disc Disc
}

type Game struct {
	board         Board
	first, second Player
	current       Player
	state         GameState
	winner        *Player
}

func NewGame(first, second Player) (*Game, error) {
	if first.Disc == second.Disc {
		return nil, errors.New("players need different colours")
	}
	return &Game{first: first, second: second, current: first}, nil
}

func (g *Game) Play(p Player, column int) error {
	if g.state != InProgress {
		return errors.New("the game is over")
	}
	if p != g.current {
		return fmt.Errorf("it is %s's turn", g.current.Name)
	}
	row, err := g.board.Drop(column, p.Disc) // validates the column
	if err != nil {
		return err
	}
	switch {
	case g.board.MakesFour(row, column):
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

func (g *Game) State() GameState       { return g.state }
func (g *Game) CurrentPlayer() Player  { return g.current }
func (g *Game) Cell(row, col int) Disc { return g.board.Cell(row, col) }

func (g *Game) Winner() (Player, bool) {
	if g.winner == nil {
		return Player{}, false
	}
	return *g.winner, true
}`,

"A move stack in Game, one helper in Board": `type Move struct {
	Player   Player
	Row, Col int
}

// Game gains a field: history []Move

func (g *Game) Play(p Player, column int) error {
	// ... validation as before ...
	row, err := g.board.Drop(column, p.Disc)
	if err != nil {
		return err
	}
	g.history = append(g.history, Move{p, row, column})
	// ... win / draw / switch turn as before ...
	return nil
}

func (g *Game) Undo() bool {
	if len(g.history) == 0 {
		return false
	}
	last := g.history[len(g.history)-1]
	g.history = g.history[:len(g.history)-1]
	g.board.clear(last.Row, last.Col) // unexported: empties the cell, decrements filled[col]
	g.current = last.Player
	g.state, g.winner = InProgress, nil // the previous position had no winner
	return true
}`,

"Win, block, else prefer the centre": `type MoveChooser interface {
	Choose(g *Game, me, opponent Player) (int, error)
}

type SimpleBot struct{}

var preference = []int{3, 2, 4, 1, 5, 0, 6} // centre columns first

func (SimpleBot) Choose(g *Game, me, opponent Player) (int, error) {
	for _, col := range preference {
		if g.WouldWin(me, col) { // take a win
			return col, nil
		}
	}
	for _, col := range preference {
		if g.WouldWin(opponent, col) { // block a loss
			return col, nil
		}
	}
	for _, col := range preference {
		if g.board.CanDrop(col) {
			return col, nil
		}
	}
	return 0, errors.New("no legal move")
}

// WouldWin drops on a copy of the board: Board is a plain value (arrays, no pointers),
// so b := g.board copies it.`,

"A registry of games, each safe on its own": `type lockedGame struct {
	mu   sync.Mutex
	game *Game
}

type GameService struct {
	mu    sync.RWMutex
	games map[string]*lockedGame
}

func NewGameService() *GameService { return &GameService{games: map[string]*lockedGame{}} }

func (s *GameService) Start(a, b Player) (string, error) {
	g, err := NewGame(a, b)
	if err != nil {
		return "", err
	}
	id := newID() // a random unique id, e.g. 16 bytes from crypto/rand as hex
	s.mu.Lock()
	s.games[id] = &lockedGame{game: g}
	s.mu.Unlock()
	return id, nil
}

func (s *GameService) Play(id string, p Player, column int) error {
	s.mu.RLock()
	lg, ok := s.games[id]
	s.mu.RUnlock()
	if !ok {
		return errors.New("no such game")
	}
	lg.mu.Lock() // moves in one game are serialized
	defer lg.mu.Unlock()
	return lg.game.Play(p, column)
}`,

"Connect Four in one screen": `type Board struct {
	grid   [Rows][Cols]Disc
	filled [Cols]int
}

func (b *Board) Drop(col int, d Disc) (int, error) // lowest empty row; error if full
func (b *Board) MakesFour(row, col int) bool       // 4 directions x both ways from the last disc
func (b *Board) IsFull() bool

type Game struct {
	state           GameState
	current         Player
	winner          *Player
}

func (g *Game) Play(p Player, col int) error // over? turn? drop, win, draw, switch turn`
} };
