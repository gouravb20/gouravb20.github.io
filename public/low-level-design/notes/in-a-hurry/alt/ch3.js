// Go versions of chapter 3's code blocks, matched to the Java blocks by title. Imports are omitted.
window.ALT = window.ALT || {};
ALT["ch3"] = { go: {
"Over-built vs enough": `// Over-built: the requirement is "pick the first free spot that fits"
selector := NewSpotSelectorFactory().ForMode(FirstFit)
spot := selector.Select(SelectionContext{Vehicle: vehicle, Spots: floor.Spots()})

// Enough
func (f *Floor) FirstFit(v *Vehicle) (*Spot, bool) {
	for _, s := range f.spots {
		if s.Fits(v) {
			return s, true
		}
	}
	return nil, false
}`,

"A value object as the single home for a rule": `// Before: the rule is copied in SignupService, InviteService, ProfileService...
// After: one place, enforced at construction. The field is unexported, so the only way
// to get an EmailAddress from outside the package is through ParseEmail.
type EmailAddress struct{ value string }

func ParseEmail(raw string) (EmailAddress, error) {
	v := strings.ToLower(strings.TrimSpace(raw))
	if !strings.Contains(v, "@") || len(v) > 254 {
		return EmailAddress{}, fmt.Errorf("invalid email: %q", raw)
	}
	return EmailAddress{v}, nil
}

func (e EmailAddress) String() string { return e.value }

func (s *SignupService) SignUp(email EmailAddress, name string) error { /* ... */ } // can't receive a bad email`,

"Separated concerns in an elevator simulation": `// Rules only: no printing, no parsing
type ElevatorCar struct {
	floor int
	stops []int
}

func (c *ElevatorCar) Request(f int) {
	if !slices.Contains(c.stops, f) {
		c.stops = append(c.stops, f)
	}
}

func (c *ElevatorCar) Step() {
	if len(c.stops) == 0 {
		return
	}
	target := c.stops[0]
	c.floor += cmp.Compare(target, c.floor)
	if c.floor == target {
		c.stops = c.stops[1:]
	}
}

func (c *ElevatorCar) Floor() int { return c.floor }

// Presentation and input are separate and replaceable
type ElevatorView interface{ Render(car *ElevatorCar) }
type CommandSource interface{ NextRequest() (floor int, ok bool) }`,

"Demeter: ask the nearest object": `// Reaches through three objects: depends on Ride, Driver, Vehicle and their structure
plate := ride.Driver().Vehicle().Plate()

// Ride offers what callers need; its internals can change freely
type Ride struct{ driver *Driver }

func (r *Ride) VehiclePlate() string { return r.driver.VehiclePlate() }`,

"OCP: discounts as classes, not branches": `// Before: every new promotion edits this function
func Discount(o Order) Money {
	switch {
	case o.Customer.IsMember:
		return o.Total().Percent(10)
	case o.CouponCode == "SUMMER":
		return MoneyOf(500)
	case len(o.Items) >= 5:
		return o.Total().Percent(5)
	}
	return Zero
}

// After: new promotions are new types (or plain functions)
type DiscountRule interface{ Apply(o Order) Money }

type MemberDiscount struct{}

func (MemberDiscount) Apply(o Order) Money {
	if o.Customer.IsMember {
		return o.Total().Percent(10)
	}
	return Zero
}

type BulkDiscount struct{ MinItems int }

func (d BulkDiscount) Apply(o Order) Money {
	if len(o.Items) >= d.MinItems {
		return o.Total().Percent(5)
	}
	return Zero
}

type DiscountEngine struct{ rules []DiscountRule }

func (e DiscountEngine) Best(o Order) Money {
	best := Zero
	for _, r := range e.rules {
		if d := r.Apply(o); d.GreaterThan(best) {
			best = d
		}
	}
	return best
}`,

"LSP: a subclass that breaks its parent's promise": `// Go has no inheritance, but the same broken promise appears with interfaces:
type Account interface {
	Withdraw(m Money) error
}

type FixedDepositAccount struct{ balance Money }

func (a *FixedDepositAccount) Withdraw(Money) error {
	return errors.New("locked") // satisfies the interface, breaks its promise
}

// Caller written against Account now fails for one implementation
func ChargeMonthlyFee(accounts []Account) error {
	for _, a := range accounts {
		if err := a.Withdraw(Fee); err != nil { // always fails for fixed deposits
			return err
		}
	}
	return nil
}`,

"Fix: model the capability, not the family": `type Account interface{ Balance() Money }

type Withdrawable interface {
	Account // interface embedding
	Withdraw(m Money) error
}

type SavingsAccount struct{ /* ... */ }      // has Balance and Withdraw: is a Withdrawable
type FixedDepositAccount struct{ /* ... */ } // has only Balance: never promises Withdraw

func ChargeMonthlyFee(accounts []Withdrawable) error { /* ... */ } // the compiler prevents the bug`,

"ISP: split a fat interface": `// Fat: a basic printer must "implement" scanning and faxing
type OfficeDevice interface {
	Print(d Doc)
	Scan(d Doc) Image
	Fax(d Doc, number string)
}

// Focused roles: Go interfaces are small by habit (io.Reader has one method)
type Printer interface{ Print(d Doc) }
type Scanner interface{ Scan(d Doc) Image }
type Fax interface{ Fax(d Doc, number string) }

type BasicPrinter struct{ /* ... */ } // implements Printer
type OfficeHub struct{ /* ... */ }    // implements Printer, Scanner and Fax; no "implements" keyword needed`,

"Checkout that doesn't know about Stripe": `// Shaped by checkout's needs, owned by the checkout package
type PaymentGateway interface {
	Charge(amount Money, token PaymentToken) (PaymentResult, error)
}

type CheckoutService struct {
	payments PaymentGateway
	orders   OrderRepository
}

func NewCheckoutService(p PaymentGateway, o OrderRepository) *CheckoutService { // injected
	return &CheckoutService{payments: p, orders: o}
}

func (s *CheckoutService) Checkout(cart Cart, token PaymentToken) (Receipt, error) {
	r, err := s.payments.Charge(cart.Total(), token)
	if err != nil {
		return Receipt{}, err
	}
	if !r.Approved {
		return Receipt{}, fmt.Errorf("payment declined: %s", r.Reason)
	}
	order, err := s.orders.Save(OrderFrom(cart, r))
	if err != nil {
		return Receipt{}, err
	}
	return order.Receipt(), nil
}

// Details adapt to the abstraction; Go interfaces are satisfied implicitly
type StripeGateway struct{ /* ... */ }
type FakeGateway struct{ /* ... */ } // for tests`,

"OCP and DIP together: pluggable pricing": `type PricingPolicy interface {
	Price(t *Ticket, exit time.Time) Money
}

type HourlyPricing struct{ /* ... */ }
type WeekendFlatPricing struct{ /* ... */ }

type ExitGate struct{ pricing PricingPolicy } // abstraction, injected

func (g ExitGate) Checkout(t *Ticket) Money { return g.pricing.Price(t, time.Now()) }

// New rule = new type. ExitGate never changes.`
} };
