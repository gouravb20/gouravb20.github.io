// Go versions of chapter 4's code blocks, matched to the Java blocks by title. Imports are omitted.
window.ALT = window.ALT || {};
ALT["ch4"] = { go: {
"A book copy that can't be double-lent": `// Anaemic: any caller can put it in an impossible state
type BookCopy struct {
	Borrower *Member
	DueDate  time.Time
}

// Encapsulated: unexported fields, operations with rules
type BookCopy struct {
	barcode  string
	borrower *Member
	dueDate  time.Time
}

func NewBookCopy(barcode string) *BookCopy { return &BookCopy{barcode: barcode} }

func (b *BookCopy) LendTo(m *Member, today time.Time) error {
	if b.borrower != nil {
		return fmt.Errorf("%s is already on loan", b.barcode)
	}
	b.borrower = m
	b.dueDate = today.AddDate(0, 0, 14)
	return nil
}

func (b *BookCopy) ReturnCopy(today time.Time) (Money, error) {
	if b.borrower == nil {
		return Money{}, fmt.Errorf("%s is not on loan", b.barcode)
	}
	lateDays := max(0, int64(today.Sub(b.dueDate).Hours()/24))
	b.borrower, b.dueDate = nil, time.Time{}
	return Cents(lateDays * 25), nil
}

func (b *BookCopy) IsAvailable() bool { return b.borrower == nil }`,

"Replacing a switch with polymorphism": `// Before: every new member type edits this function
func Fine(m Member, lateDays int64) Money {
	switch m.Type {
	case Student:
		return Cents(lateDays * 10)
	case Staff:
		return Zero
	default:
		return Cents(lateDays * 25)
	}
}

// After: each policy knows its own rule
type FinePolicy interface{ Fine(lateDays int64) Money }

type PerDayFine struct{ CentsPerDay int64 }

func (p PerDayFine) Fine(lateDays int64) Money { return Cents(lateDays * p.CentsPerDay) }

type NoFine struct{}

func (NoFine) Fine(int64) Money { return Zero }

type Member struct {
	ID, Name   string
	FinePolicy FinePolicy
}

fine := member.FinePolicy.Fine(lateDays) // dynamic dispatch through the interface`,

"When variations multiply, compose": `// Go has no inheritance at all: composition is the only option, and it is the right one here
type Engine interface {
	Range() Distance
	Refuel()
}

type Body int

const (
	Sedan Body = iota
	SUV
	Hatchback
)

type Car struct {
	engine Engine // replaceable during a refit
	body   Body
}

func NewCar(e Engine, b Body) *Car       { return &Car{engine: e, body: b} }
func (c *Car) ReplaceEngine(e Engine)    { c.engine = e }`,

"Both, each doing its job": `type Borrowable interface {
	IsAvailable() bool
	LendTo(m *Member, today time.Time) error
}

// No abstract classes: share state and code by embedding a struct...
type libraryItem struct {
	ID, Title string
	borrower  *Member
}

func (i *libraryItem) IsAvailable() bool { return i.borrower == nil }

func (i *libraryItem) LendTo(m *Member, today time.Time) error {
	if !i.IsAvailable() {
		return fmt.Errorf("%s unavailable", i.ID)
	}
	i.borrower = m
	return nil
}

// ...and let each concrete type add the one thing that differs.
type Book struct{ libraryItem }

func (Book) LoanPeriod() time.Duration { return 14 * 24 * time.Hour }

type DVD struct{ libraryItem }

func (DVD) LoanPeriod() time.Duration { return 3 * 24 * time.Hour }

// *Book and *DVD satisfy Borrowable through the embedded methods.`,

"An enum that carries its own rules": `type LoanStatus int

const (
	Active LoanStatus = iota
	Overdue
	Returned
)

// Go constants can't carry per-value methods; a method with a switch is the idiom.
func (s LoanStatus) CanRenew() bool {
	switch s {
	case Active:
		return true
	default:
		return false
	}
}`,

"Records as value objects; entities compare by id": `var isbnPattern = regexp.MustCompile("^[0-9]{13}$")

type ISBN struct{ value string } // a comparable struct: == compares by value

func ParseISBN(s string) (ISBN, error) {
	if !isbnPattern.MatchString(s) {
		return ISBN{}, fmt.Errorf("invalid ISBN %q", s)
	}
	return ISBN{s}, nil
}

type Member struct {
	ID   string
	Name string // can change; identity doesn't
}

// Entities compare by ID: key maps by ID rather than by the whole struct.
func SameMember(a, b *Member) bool { return a.ID == b.ID }`,

"Enum with behaviour and a value object": `type VehicleSize int

const (
	SizeSmall VehicleSize = iota + 1
	SizeMedium
	SizeLarge
)

func (v VehicleSize) FitsIn(spot VehicleSize) bool { return v <= spot }

type Money struct {
	cents    int64
	currency string
}

func NewMoney(cents int64, currency string) (Money, error) {
	if cents < 0 {
		return Money{}, errors.New("negative amount")
	}
	return Money{cents, currency}, nil
}

func (m Money) Plus(other Money) (Money, error) {
	if m.currency != other.currency {
		return Money{}, errors.New("currency mismatch")
	}
	return Money{m.cents + other.cents, m.currency}, nil
}`
} };
