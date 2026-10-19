// Deep dive: Chapter 3, Design principles. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch3 = {
  hook: `<p>An LLD interview is a long series of small decisions: should this be its own class? Does this need an interface? Inherit or compose? Design principles are the reasons you give for those decisions. You learned most of them long ago; what interviewers look for is that you <em>apply</em> them, briefly name them when they explain a choice, and recognise when two of them pull in opposite directions. This chapter covers the five general principles and SOLID, each with a Java example of the problem and the fix.</p>`,
  sections: [
    {
      id: "kiss-yagni",
      title: "KISS and YAGNI: the brakes",
      kicker: "General principles",
      blocks: [
        { type: "text", html: `<p><strong>KISS</strong> (keep it simple): choose the most direct design that meets the requirements. <strong>YAGNI</strong> (you aren't gonna need it): don't build features or flexibility for requirements nobody has stated. Together they stop the most common LLD failure: over-engineering.</p>` },
        { type: "code", lang: "java", title: "Over-built vs enough", code: `// Over-built: the requirement is "pick the first free spot that fits"
SpotSelector selector = SpotSelectorFactory.forMode(SelectionMode.FIRST_FIT);
Spot spot = selector.select(new SelectionContext(vehicle, floor.spots()));

// Enough
Optional<Spot> firstFit(Vehicle v) {
    return spots.stream().filter(s -> s.fits(v)).findFirst();
}` },
        { type: "callout", tone: "insight", html: `<p>YAGNI says don't <em>build</em> ahead; it doesn't say don't <em>think</em> ahead. Keep the design open where change is likely (one method you could later extract into a strategy), and when the interviewer asks "how would you support a second selection rule?", that's your cue to describe the refactor.</p>` },
        { type: "callout", tone: "tip", html: `<p>Add complexity when simplicity stops working: a class with several unrelated responsibilities, a rule copied into several places, or a switch statement that grows with every new variant. Those are the triggers; a hunch that "it might be needed" is not.</p>` }
      ]
    },
    {
      id: "dry",
      title: "DRY: one home for each piece of knowledge",
      kicker: "General principles",
      blocks: [
        { type: "text", html: `<p>DRY is about <strong>knowledge</strong>, not text. If a business rule (what counts as a valid email, how late fees are computed) lives in several places, the copies will drift, and a fix in one place won't reach the others. Give the rule one home.</p>` },
        { type: "code", lang: "java", title: "A value object as the single home for a rule", code: `// Before: the rule is copied in SignupService, InviteService, ProfileService...
// After: one place, enforced at construction
record EmailAddress(String value) {
    EmailAddress {
        if (value == null || !value.contains("@") || value.length() > 254) {
            throw new IllegalArgumentException("invalid email: " + value);
        }
        value = value.trim().toLowerCase();
    }
}

class SignupService { void signUp(EmailAddress email, String name) { ... } }   // can't receive a bad email` },
        { type: "callout", tone: "warning", html: `<p>Don't merge code that merely looks the same. A parking fee and a library late fee might share a formula today, but they belong to different domains and will change for different reasons. Forcing them through one function couples them. Ask "is this the same rule?", not "is this the same code?"</p>` },
        { type: "callout", tone: "interview", html: `<p>DRY and KISS conflict regularly. A good answer acknowledges both: "This check appears twice; I'll leave it for now and extract a validator if it shows up a third time." That is the judgment being assessed.</p>` }
      ]
    },
    {
      id: "soc-demeter",
      title: "Separation of concerns and the Law of Demeter",
      kicker: "General principles",
      blocks: [
        { type: "text", html: `<p><strong>Separation of concerns</strong>: domain rules, input/output, formatting and storage live in different classes that don't know each other's internals. <strong>Law of Demeter</strong>: a method talks only to its own fields, its parameters and objects it creates, not to objects reached through them.</p>` },
        { type: "code", lang: "java", title: "Separated concerns in an elevator simulation", code: `// Rules only: no printing, no parsing
final class ElevatorCar {
    private int floor;
    private final Deque<Integer> stops = new ArrayDeque<>();
    void request(int f) { if (!stops.contains(f)) stops.add(f); }
    void step() {
        if (stops.isEmpty()) return;
        int target = stops.peek();
        floor += Integer.compare(target, floor);
        if (floor == target) stops.poll();
    }
    int floor() { return floor; }
}

// Presentation and input are separate and replaceable
interface ElevatorView { void render(ElevatorCar car); }
interface CommandSource { Optional<Integer> nextRequest(); }` },
        { type: "code", lang: "java", title: "Demeter: ask the nearest object", code: `// Reaches through three objects: depends on Ride, Driver, Vehicle and their structure
String plate = ride.getDriver().getVehicle().getPlate();

// Ride offers what callers need; its internals can change freely
final class Ride {
    private final Driver driver;
    String vehiclePlate() { return driver.vehiclePlate(); }
}` },
        { type: "keypoints", items: [
          "Fluent chains that return the same object (builders, streams) are fine; the problem is walking through <em>different</em> objects' internals.",
          "Demeter is closely related to <strong>tell, don't ask</strong>: <code>account.withdraw(amount)</code> instead of reading the balance and setting it yourself.",
          "Separated concerns are what make unit tests possible: test <code>ElevatorCar</code> without a console."
        ] }
      ]
    },
    {
      id: "srp-ocp",
      title: "SRP and OCP: focused classes, extension by addition",
      kicker: "SOLID",
      blocks: [
        { type: "text", html: `<p><strong>Single responsibility</strong>: a class has one reason to change. <strong>Open/closed</strong>: you add new behaviour by adding classes, not by editing working ones. SRP keeps classes small; OCP keeps them stable as variants are added.</p>` },
        { type: "compare", title: "SRP: an invoice that does everything", items: [
          { title: "Before", tone: "bad", html: `<p><code>Invoice</code> computes totals and taxes, renders HTML, writes itself to the database and emails itself. It changes when tax rules, layout, the schema or the mail provider changes.</p>` },
          { title: "After", tone: "ok", html: `<p><code>Invoice</code> keeps the totals and tax rules. <code>InvoiceRenderer</code>, <code>InvoiceRepository</code> and <code>InvoiceMailer</code> each own one concern and change for one reason.</p>` }
        ] },
        { type: "code", lang: "java", title: "OCP: discounts as classes, not branches", code: `// Before: every new promotion edits this method
Money discount(Order o) {
    if (o.customer().isMember()) return o.total().percent(10);
    if (o.couponCode() != null && o.couponCode().equals("SUMMER")) return Money.of(500);
    if (o.items().size() >= 5) return o.total().percent(5);
    return Money.ZERO;
}

// After: new promotions are new classes
interface DiscountRule { Money apply(Order o); }

record MemberDiscount() implements DiscountRule {
    public Money apply(Order o) { return o.customer().isMember() ? o.total().percent(10) : Money.ZERO; }
}
record BulkDiscount(int minItems) implements DiscountRule {
    public Money apply(Order o) { return o.items().size() >= minItems ? o.total().percent(5) : Money.ZERO; }
}

final class DiscountEngine {
    private final List<DiscountRule> rules;
    DiscountEngine(List<DiscountRule> rules) { this.rules = List.copyOf(rules); }
    Money best(Order o) { return rules.stream().map(r -> r.apply(o)).max(Money::compareTo).orElse(Money.ZERO); }
}` },
        { type: "callout", tone: "warning", html: `<p>Apply OCP where variation is expected. One discount rule and no hint of more is not a reason for an interface; that's YAGNI. When the second rule arrives, refactor to the interface.</p>` }
      ]
    },
    {
      id: "lsp-isp",
      title: "LSP and ISP: honest hierarchies, small interfaces",
      kicker: "SOLID",
      blocks: [
        { type: "text", html: `<p><strong>Liskov substitution</strong>: wherever a base type is used, any subtype must work without surprises. A subtype can add behaviour but can't weaken what the parent promised. <strong>Interface segregation</strong>: don't force a class to implement methods it can't support.</p>` },
        { type: "code", lang: "java", title: "LSP: a subclass that breaks its parent's promise", code: `class Account {
    protected Money balance;
    void withdraw(Money m) { balance = balance.minus(m); }
}

class FixedDepositAccount extends Account {
    @Override void withdraw(Money m) { throw new UnsupportedOperationException("locked"); }
}

// Caller written against Account now fails for one subtype
void chargeMonthlyFee(List<Account> accounts) {
    for (Account a : accounts) a.withdraw(FEE);      // throws for fixed deposits
}` },
        { type: "code", lang: "java", title: "Fix: model the capability, not the family", code: `interface Account { Money balance(); }
interface Withdrawable extends Account { void withdraw(Money m); }

final class SavingsAccount implements Withdrawable { ... }
final class FixedDepositAccount implements Account { ... }       // never promises withdraw

void chargeMonthlyFee(List<? extends Withdrawable> accounts) { ... } // type system prevents the bug` },
        { type: "code", lang: "java", title: "ISP: split a fat interface", code: `// Fat: a basic printer must "implement" scanning and faxing
interface OfficeDevice { void print(Doc d); void scan(Doc d); void fax(Doc d); }

// Focused roles
interface Printer { void print(Doc d); }
interface Scanner { Image scan(Doc d); }
interface Fax     { void fax(Doc d, String number); }

final class BasicPrinter implements Printer { ... }
final class OfficeHub implements Printer, Scanner, Fax { ... }` },
        { type: "callout", tone: "tip", html: `<p>LSP warning signs: an override that throws <code>UnsupportedOperationException</code>, an override that does nothing, or callers writing <code>if (x instanceof Special)</code>. ISP warning sign: classes with empty method bodies "to satisfy the interface".</p>` }
      ]
    },
    {
      id: "dip",
      title: "DIP: business logic owns its abstractions",
      kicker: "SOLID",
      blocks: [
        { type: "text", html: `<p><strong>Dependency inversion</strong>: high-level policy (checkout, booking) shouldn't depend on low-level details (a vendor SDK, a specific database). Both depend on an abstraction, and the abstraction is shaped by what the business logic needs. The "inversion" is that the detail conforms to the policy's interface, not the other way round.</p>` },
        { type: "code", lang: "java", title: "Checkout that doesn't know about Stripe", code: `// Shaped by checkout's needs, owned by the checkout module
interface PaymentGateway {
    PaymentResult charge(Money amount, PaymentToken token);
}

final class CheckoutService {
    private final PaymentGateway payments;
    private final OrderRepository orders;

    CheckoutService(PaymentGateway payments, OrderRepository orders) {   // injected
        this.payments = payments;
        this.orders = orders;
    }

    Receipt checkout(Cart cart, PaymentToken token) {
        PaymentResult r = payments.charge(cart.total(), token);
        if (!r.approved()) throw new PaymentDeclinedException(r.reason());
        return orders.save(Order.from(cart, r)).receipt();
    }
}

// Details adapt to the abstraction
final class StripeGateway implements PaymentGateway { ... }
final class FakeGateway implements PaymentGateway { ... }   // for tests` },
        { type: "callout", tone: "insight", html: `<p>Dependency <em>injection</em> (passing collaborators in through the constructor) is the technique; dependency <em>inversion</em> is the principle. You can inject a concrete class without inverting anything; the inversion comes from the interface being defined by the high-level code.</p>` },
        { type: "callout", tone: "modern", html: `<p>SOLID grew up with large Java and C# class hierarchies. In modern code (and outside Java) people lean more on composition and plain functions, and applying SOLID everywhere can itself violate KISS. Use each principle when the problem in front of you calls for it.</p>` }
      ]
    },
    {
      id: "spot-it",
      title: "Practise spotting violations",
      kicker: "Drill",
      blocks: [
        { type: "lab", id: "principleSpotter", caption: "Ten snippets, one main problem each. Pick the principle and compare your reasoning." },
        { type: "quiz", q: "A <code>NotificationService</code> has a <code>send(String channel, String msg)</code> method with a switch on \"email\", \"sms\" and \"push\", and the team adds a new channel every quarter. Which principle is most directly at stake, and what is the fix?", options: [
          "LSP: make the channels subclasses of NotificationService",
          "OCP: define a Notifier interface with one class per channel, and have the service pick a Notifier instead of switching",
          "ISP: split send into three methods",
          "DRY: copy the switch into a helper class"
        ], answer: 1, explain: `<p>A switch that grows with every new channel means editing working code each time. With a <code>Notifier</code> interface and one class per channel (selected by a map or factory), adding a channel is adding a class: open for extension, closed for modification.</p>` }
      ]
    }
  ],
  takeaways: [
    "KISS and YAGNI are the brakes: build the simplest design that meets today's requirements and keep it open for change.",
    "DRY targets duplicated knowledge, not similar-looking code; value objects are a good single home for rules.",
    "Separate domain rules from I/O and presentation, and talk only to your immediate collaborators.",
    "SRP keeps classes focused; OCP lets you add variants as new classes where variation is expected.",
    "LSP and ISP keep hierarchies honest: model capabilities with small interfaces rather than throwing overrides.",
    "DIP puts interfaces under the business logic's control and injects the details.",
    "When principles conflict, say so and choose; that judgment is what's being assessed."
  ],
  furtherReading: [
    { title: "Hello Interview: Design principles", url: "https://www.hellointerview.com/learn/low-level-design/in-a-hurry/design-principles", note: "The page this chapter follows." },
    { title: "The Pragmatic Programmer (Hunt and Thomas)", note: "Origin of DRY, and a good discussion of orthogonality and decoupling." },
    { title: "Clean Architecture (Robert C. Martin)", note: "The SOLID principles explained by the person who named them." }
  ]
};
