// Go versions of chapter 5's code blocks, matched to the Java blocks by title. Imports are omitted.
window.ALT = window.ALT || {};
ALT["ch5"] = { go: {
"Factory: one place decides which class to create": `type Notifier interface{ Send(u User, message string) error }

type EmailNotifier struct{ /* ... */ }
type SMSNotifier struct{ /* ... */ }
type PushNotifier struct{ /* ... */ }

type NotifierFactory struct{ byChannel map[Channel]Notifier } // never written after construction, so safe to read concurrently

func NewNotifierFactory(e *EmailNotifier, s *SMSNotifier, p *PushNotifier) *NotifierFactory {
	return &NotifierFactory{byChannel: map[Channel]Notifier{Email: e, SMS: s, Push: p}}
}

func (f *NotifierFactory) ForUser(u User) (Notifier, error) {
	n, ok := f.byChannel[u.PreferredChannel]
	if !ok {
		return nil, fmt.Errorf("no notifier for channel %v", u.PreferredChannel)
	}
	return n, nil
}`,

"Builder: readable construction with validation at the end": `// Go's usual answer to a builder is functional options.
type FlightSearch struct {
	from, to string
	date     time.Time
	cabin    Cabin
	maxStops int
}

type Option func(*FlightSearch)

func On(d time.Time) Option   { return func(s *FlightSearch) { s.date = d } }
func WithCabin(c Cabin) Option { return func(s *FlightSearch) { s.cabin = c } }
func MaxStops(n int) Option    { return func(s *FlightSearch) { s.maxStops = n } }

func NewFlightSearch(from, to string, opts ...Option) (FlightSearch, error) {
	s := FlightSearch{from: from, to: to, date: time.Now(), cabin: Economy, maxStops: 2} // defaults
	for _, opt := range opts {
		opt(&s)
	}
	if from == to { // validate once everything is set
		return FlightSearch{}, errors.New("origin equals destination")
	}
	return s, nil
}

q, err := NewFlightSearch("BLR", "SFO", On(time.Date(2026, 12, 20, 0, 0, 0, 0, time.UTC)), WithCabin(Business))`,

"Lazy Singleton: check and create under a lock": `type LotController struct {
	mu    sync.Mutex // its state must be thread-safe too
	gates map[string]*Gate
}

var (
	controller   *LotController // guarded by controllerMu
	controllerMu sync.Mutex
)

// One goroutine at a time: check, create, return.
func Instance() *LotController {
	controllerMu.Lock()
	defer controllerMu.Unlock()
	if controller == nil {
		controller = &LotController{gates: map[string]*Gate{}}
	}
	return controller
}

func (c *LotController) Register(g *Gate) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.gates[g.ID] = g
}
// Usually better: create one controller in main() and pass it to whoever needs it.`,

"Double-checked locking: lock only until the instance exists": `type AuditLog struct{ /* ... */ }

var (
	auditLog   atomic.Pointer[AuditLog] // atomic: a reader never sees a half-built value
	auditLogMu sync.Mutex
)

func GetAuditLog() *AuditLog {
	if l := auditLog.Load(); l != nil { // 1. fast path: no lock once created
		return l
	}
	auditLogMu.Lock() // 2. only the first callers get here
	defer auditLogMu.Unlock()
	if l := auditLog.Load(); l != nil { // 3. check again: another goroutine may have won
		return l
	}
	l := &AuditLog{}
	auditLog.Store(l)
	return l
}
// The standard library's sync.Once is this same check-lock-check pattern, packaged.`,

"Adapter: make a vendor fit your interface": `type PaymentGateway interface {
	Charge(amount Money, token string) (PaymentResult, error)
}

type AcmePayAdapter struct{ client *acme.Client } // vendor SDK, different shape

func (a AcmePayAdapter) Charge(amount Money, token string) (PaymentResult, error) {
	r, err := a.client.CreateTransaction(token, amount.Cents(), amount.Currency())
	if err != nil {
		return PaymentResult{}, err
	}
	if r.Status != acme.StatusOK {
		return Declined(r.Message), nil
	}
	return Approved(r.TxnID), nil
}`,

"Decorator: stackable features, same interface": `// Go's standard library is built on this: io.Writer wrapped by gzip.NewWriter, bufio.NewWriter...
type DataSource interface{ Write(data []byte) error }

type FileDataSource struct{ path string }

type Compressed struct{ inner DataSource }

func (c Compressed) Write(data []byte) error { return c.inner.Write(gzipBytes(data)) }

type Encrypted struct {
	inner DataSource
	key   []byte
}

func (e Encrypted) Write(data []byte) error { return e.inner.Write(encrypt(data, e.key)) }

var out DataSource = Encrypted{Compressed{FileDataSource{path}}, key} // any combination`,

"Composite: files and folders through one interface": `type Node interface {
	Name() string
	Size() int64
}

type File struct {
	name string
	size int64
}

func (f File) Name() string { return f.name }
func (f File) Size() int64  { return f.size }

type Folder struct {
	name     string
	children []Node
}

// NewFolder copies the children, so no goroutine can change them while another walks the tree.
func NewFolder(name string, children ...Node) Folder {
	return Folder{name: name, children: slices.Clone(children)}
}

func (f Folder) Name() string { return f.name }

func (f Folder) Size() int64 { // recursion for free
	var total int64
	for _, c := range f.children {
		total += c.Size()
	}
	return total
}`,

"Strategy: the client picks the algorithm": `type DispatchStrategy interface {
	Choose(cars []*Elevator, r Request) *Elevator
}

type NearestCar struct{}

func (NearestCar) Choose(cars []*Elevator, r Request) *Elevator {
	return slices.MinFunc(cars, func(a, b *Elevator) int { return abs(a.Floor-r.Floor) - abs(b.Floor-r.Floor) })
}

type LeastBusy struct{}

func (LeastBusy) Choose(cars []*Elevator, r Request) *Elevator {
	return slices.MinFunc(cars, func(a, b *Elevator) int { return a.PendingStops() - b.PendingStops() })
}

type Dispatcher struct{ strategy DispatchStrategy } // chosen by configuration; strategies are stateless

func (d Dispatcher) Handle(r Request, cars []*Elevator) { d.strategy.Choose(cars, r).AddStop(r.Floor) } // AddStop locks the car

// A strategy can also be a plain function type: type DispatchFunc func([]*Elevator, Request) *Elevator`,

"State: the object's state picks the behaviour": `type VendingState interface {
	InsertCoin(m *Machine, coin Money) VendingState
	Select(m *Machine, slot string) VendingState
	Cancel(m *Machine) VendingState
}

type Idle struct{}

func (Idle) InsertCoin(m *Machine, c Money) VendingState { m.addCredit(c); return HasCredit{} }
func (s Idle) Select(m *Machine, _ string) VendingState  { m.display("Insert coins first"); return s }
func (s Idle) Cancel(*Machine) VendingState              { return s }

type HasCredit struct{}

func (s HasCredit) InsertCoin(m *Machine, c Money) VendingState { m.addCredit(c); return s }

func (s HasCredit) Select(m *Machine, slot string) VendingState {
	if !m.canAfford(slot) {
		m.display("Not enough credit")
		return s
	}
	m.dispense(slot)
	m.returnChange()
	return Idle{}
}

func (HasCredit) Cancel(m *Machine) VendingState { m.refund(); return Idle{} }

type Machine struct {
	mu    sync.Mutex
	state VendingState // Idle{} to start; guarded by mu
}

// One lock per transition: two buttons pressed at once can't both act on the same state.
func (m *Machine) InsertCoin(c Money) { m.mu.Lock(); defer m.mu.Unlock(); m.state = m.state.InsertCoin(m, c) }
func (m *Machine) Select(slot string) { m.mu.Lock(); defer m.mu.Unlock(); m.state = m.state.Select(m, slot) }
func (m *Machine) Cancel()            { m.mu.Lock(); defer m.mu.Unlock(); m.state = m.state.Cancel(m) }
// addCredit, canAfford, dispense, refund, display: only called from inside a transition`,

"Observer: publish events, let listeners react": `type SpotListener func(floorID string, freeSpots int)

type Floor struct {
	id        string
	mu        sync.Mutex
	listeners []SpotListener
	free      int
}

func (f *Floor) Subscribe(l SpotListener) {
	f.mu.Lock()
	f.listeners = append(f.listeners, l)
	f.mu.Unlock()
}

func (f *Floor) Occupy() { f.change(-1) }
func (f *Floor) Vacate() { f.change(+1) }

func (f *Floor) change(delta int) {
	f.mu.Lock()
	f.free += delta
	free, ls := f.free, slices.Clone(f.listeners)
	f.mu.Unlock()
	for _, l := range ls { // notify outside the lock
		l(f.id, free)
	}
}

floor.Subscribe(func(id string, n int) { entranceBoard.Show(id, n) })
floor.Subscribe(func(id string, n int) { metrics.Gauge("free_spots", n, "floor", id) })`,

"Command: requests as objects, so they can be undone": `type EditCommand interface {
	Execute()
	Undo()
}

type InsertText struct {
	doc  *Document
	at   int
	text string
}

func (c InsertText) Execute() { c.doc.Insert(c.at, c.text) }
func (c InsertText) Undo()    { c.doc.Delete(c.at, len(c.text)) }

// Each method changes the document and both stacks together, so each holds the editor's mutex.
type Editor struct {
	mu           sync.Mutex
	done, undone []EditCommand // slices used as stacks
}

func (e *Editor) Run(c EditCommand) {
	e.mu.Lock()
	defer e.mu.Unlock()
	c.Execute()
	e.done = append(e.done, c)
	e.undone = nil
}

func (e *Editor) Undo() {
	e.mu.Lock()
	defer e.mu.Unlock()
	if n := len(e.done); n > 0 {
		c := e.done[n-1]
		e.done = e.done[:n-1]
		c.Undo()
		e.undone = append(e.undone, c)
	}
}

func (e *Editor) Redo() {
	e.mu.Lock()
	defer e.mu.Unlock()
	if n := len(e.undone); n > 0 {
		c := e.undone[n-1]
		e.undone = e.undone[:n-1]
		c.Execute()
		e.done = append(e.done, c)
	}
}`,

"Chain of Responsibility: an ATM paying out notes": `// The links are set once at construction and never changed, so the chain is safe to share.
type NoteDispenser struct {
	note int
	next *NoteDispenser
}

func NewNoteDispenser(note int, next *NoteDispenser) *NoteDispenser {
	return &NoteDispenser{note: note, next: next}
}

// Per-request data travels in parameters, never in fields, so concurrent withdrawals don't mix.
func (d *NoteDispenser) Dispense(amount int, out map[int]int) error {
	if count := amount / d.note; count > 0 {
		out[d.note] = count
	}
	rest := amount % d.note
	if rest == 0 {
		return nil
	}
	if d.next == nil {
		return fmt.Errorf("can't make %d", rest)
	}
	return d.next.Dispense(rest, out)
}

chain := NewNoteDispenser(500, NewNoteDispenser(200, NewNoteDispenser(100, nil)))
err := chain.Dispense(1700, result) // 3 x 500, 1 x 200`,

"Template Method: fixed skeleton, variable steps": `// No abstract classes in Go: the skeleton is a function, the variable steps an interface.
type ReportFormat interface {
	WriteHeader(r Report, w io.Writer) error
	WriteRow(row Row, w io.Writer) error
	WriteFooter(w io.Writer) error
}

func Export(r Report, f ReportFormat, w io.Writer) error { // the fixed skeleton
	if err := f.WriteHeader(r, w); err != nil {
		return err
	}
	for _, row := range r.Rows() {
		if err := f.WriteRow(row, w); err != nil {
			return err
		}
	}
	return f.WriteFooter(w)
}

type CSVFormat struct{ /* ... */ }
type PDFFormat struct{ /* ... */ }
// Which is the Strategy pattern again: in Go, Template Method usually becomes Strategy.
// Keep per-export state in locals, not struct fields, and one format value can serve many goroutines.`,

"Iterator: walk a structure without exposing it": `type Board struct {
	mu    sync.Mutex
	cells [][]Cell // guarded by mu
}

func (b *Board) Place(row, col int, c Cell) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.cells[row][col] = c
}

// All returns a Go 1.23 range-over-func iterator over a snapshot taken under the lock,
// so a concurrent Place can't change cells mid-loop (and the caller's loop body never runs while holding the lock).
func (b *Board) All() iter.Seq[Cell] {
	b.mu.Lock()
	var snapshot []Cell
	for _, row := range b.cells {
		snapshot = append(snapshot, row...)
	}
	b.mu.Unlock()
	return slices.Values(snapshot)
}

for c := range board.All() { /* ... */ } // callers never touch the 2D slice`,

"Strategy in a few lines": `type SpotSelector interface {
	Select(free []*Spot, v *Vehicle) (*Spot, bool)
}

type NearestToEntrance struct{ /* ... */ }
type SpreadAcrossFloors struct{ /* ... */ }

type ParkingLot struct {
	mu       sync.Mutex
	selector SpotSelector
}

// Choosing and claiming a spot happen under one lock, so two cars can't be given the same spot.
func (l *ParkingLot) Park(v *Vehicle) (*Ticket, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	spot, ok := l.selector.Select(l.freeSpotsFor(v), v)
	if !ok {
		return nil, ErrLotFull
	}
	return l.issueTicket(spot, v), nil
}`,

"Decorator vs inheritance": `type Beverage interface {
	Cost() Money
	Describe() string
}

type Espresso struct{}

func (Espresso) Cost() Money      { return MoneyOf(250) }
func (Espresso) Describe() string { return "espresso" }

type WithMilk struct{ inner Beverage }

func (w WithMilk) Cost() Money      { return w.inner.Cost().Plus(MoneyOf(50)) }
func (w WithMilk) Describe() string { return w.inner.Describe() + ", milk" }

var order Beverage = WithMilk{WithMilk{Espresso{}}} // double milk, no new type`
} };
