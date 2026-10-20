// Go versions of chapter 1 and 2 code blocks, matched to the Java blocks by title. Imports are omitted.
window.ALT = window.ALT || {};
ALT["ch1"] = { go: {
"The difference in one class": `// Weak: data bag, rules live somewhere else
type Spot struct {
	Size    string   // "small", "medium"...
	Vehicle *Vehicle // anyone can overwrite
}

// Strong: the spot owns its rules (lowercase fields are private to the package)
type Spot struct {
	id       string
	size     SpotSize
	occupant *Vehicle
}

func NewSpot(id string, size SpotSize) *Spot { return &Spot{id: id, size: size} }

func (s *Spot) Fits(v *Vehicle) bool { return s.occupant == nil && v.Size.FitsIn(s.size) }

func (s *Spot) Assign(v *Vehicle) error {
	if !s.Fits(v) {
		return fmt.Errorf("spot %s can't take %v", s.id, v)
	}
	s.occupant = v
	return nil
}

func (s *Spot) Release() *Vehicle {
	v := s.occupant
	s.occupant = nil
	return v
}`
} };

ALT["ch2"] = { go: {
"Signatures before bodies": `type Size int

const (
	Small Size = iota
	Medium
	Large
)

func (s Size) Fits(pkg Size) bool { return pkg <= s }

type Package struct {
	ID   string
	Size Size
}

type Locker struct {
	id      string
	size    Size
	content *Package
}

func (l *Locker) CanHold(p Package) bool
func (l *Locker) Store(p Package)
func (l *Locker) Empty() Package

type Assignment struct {
	Code      string
	Locker    *Locker
	Pkg       Package
	ExpiresAt time.Time
}

type LockerStation struct {
	lockers []*Locker
	byCode  map[string]Assignment
	codes   CodeGenerator
	now     func() time.Time
}

func (s *LockerStation) Deposit(p Package) (string, error) // returns the pickup code
func (s *LockerStation) PickUp(code string) (Package, error)
func (s *LockerStation) Expired() []Assignment`,

"The two core flows": `var (
	ErrNoLocker    = errors.New("no locker available")
	ErrInvalidCode = errors.New("invalid code")
	ErrCodeExpired = errors.New("code expired")
)

type LockerStation struct {
	mu      sync.Mutex
	lockers []*Locker // sorted smallest first
	byCode  map[string]Assignment
	codes   CodeGenerator
	now     func() time.Time
	holdFor time.Duration
}

func NewLockerStation(lockers []*Locker, codes CodeGenerator, now func() time.Time) *LockerStation {
	sorted := slices.Clone(lockers)
	slices.SortFunc(sorted, func(a, b *Locker) int { return int(a.size - b.size) })
	return &LockerStation{lockers: sorted, byCode: map[string]Assignment{}, codes: codes, now: now, holdFor: 72 * time.Hour}
}

func (s *LockerStation) Deposit(p Package) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	i := slices.IndexFunc(s.lockers, func(l *Locker) bool { return l.CanHold(p) })
	if i < 0 {
		return "", fmt.Errorf("%w for size %d", ErrNoLocker, p.Size)
	}
	locker := s.lockers[i]
	locker.Store(p)
	code := s.codes.Next()
	s.byCode[code] = Assignment{code, locker, p, s.now().Add(s.holdFor)}
	return code, nil
}

func (s *LockerStation) PickUp(code string) (Package, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	a, ok := s.byCode[code]
	if !ok {
		return Package{}, ErrInvalidCode
	}
	delete(s.byCode, code)
	if s.now().After(a.ExpiresAt) {
		return Package{}, ErrCodeExpired
	}
	return a.Locker.Empty(), nil
}`,

"A class sketch at the end of step 3": `type SpotSize int // Small, Medium, Large (iota constants)

type ParkingLot struct{ floors []*Floor } // Park(v) (*Ticket, error); Unpark(t) (Money, error)
type Floor struct {                       // FindSpotFor(v) (*Spot, bool)
	number int
	spots  []*Spot
}
type Spot struct { // Fits(v) bool
	id       string
	size     SpotSize
	occupant *Vehicle
}
type Ticket struct {
	ID      string
	Spot    *Spot
	Vehicle *Vehicle
	Entry   time.Time
}
type PricingPolicy interface{ PriceFor(t *Ticket, exit time.Time) Money }`
} };
