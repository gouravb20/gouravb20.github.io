// Main tab: Chapter 3, Design principles. Format: DeepSection[] in public/shared/notes.d.ts.
window.MAIN = window.MAIN || {};
MAIN.ch3 = [
  {
    id: "principles-are-reasons",
    title: "Principles are the reasons behind your choices",
    kicker: "Mental model",
    blocks: [
      { type: "text", html: `<p>An LLD interview is a long run of small decisions. Should this be its own class? Does this need an interface? Should this subclass or hold a reference? Design principles are the short, shared reasons you give for those decisions. Interviewers rarely ask you to define them. They listen for them when you justify a choice.</p><p>It helps to sort them into two groups. The <strong>brakes</strong>, KISS and YAGNI, stop you adding structure nobody needs. The <strong>shapers</strong>, DRY, separation of concerns, the Law of Demeter and the five SOLID principles, tell you where code should go once you do need structure. A good answer uses both: build the simplest thing, and when it starts to strain, use a shaper to decide how to split it.</p>` },
      { type: "table", title: "The question each principle asks you", headers: ["Principle", "Ask yourself", "A sentence you might say"], rows: [
        ["KISS", "Is there a simpler design that meets today's list?", `"One class is enough here; I'll split it if it picks up a second job."`],
        ["YAGNI", "Has anyone actually asked for this?", `"Recurring bookings are out of scope, so no recurrence model yet."`],
        ["DRY", "Is this the same rule, or just similar-looking code?", `"The overlap check lives only in TimeRange."`],
        ["Separation of concerns", "Am I mixing business rules with I/O or formatting?", `"The calculator returns a number; another class sends the receipt."`],
        ["Law of Demeter", "Am I reaching through one object into another's parts?", `"I'll ask the ride for its plate instead of walking driver, then vehicle."`],
        ["SRP", "How many different reasons could this class change for?", `"Pricing and delivery change for different reasons, so they're separate."`],
        ["OCP", "Will a new variant force me to edit working code?", `"A new ride type is a new policy object, not another switch case."`],
        ["LSP", "Can every subtype stand in for its parent without surprises?", `"Fixed deposits can't withdraw, so they don't implement Withdrawable."`],
        ["ISP", "Would any implementer have to stub out a method?", `"Printers and scanners get separate interfaces."`],
        ["DIP", "Does business logic depend on a vendor, or on an interface it owns?", `"Checkout depends on PaymentGateway; the vendor client is injected."`]
      ] }
    ]
  },
  {
    id: "worked-refactor",
    title: "One class, refactored with three principles",
    kicker: "Worked example",
    blocks: [
      { type: "text", html: `<p>A ride-hailing design starts with a <code>FareService</code> that computes the fare with a switch on ride type, then builds and emails a receipt through a mail client it creates itself. It works, and for a first draft it is fine. Then the interviewer asks for a new ride type and SMS receipts.</p>` },
      { type: "code", lang: "java", title: "Fare service before the refactor", code: `// Stateless, so thread-safe, but it changes for three unrelated reasons
final class FareService {
    long charge(String riderId, RideType type, long meters, int minutes) {
        long cents = switch (type) {
            case STANDARD -> 250 + (meters * 120) / 1000 + minutes * 20L;
            case PREMIUM  -> 500 + (meters * 210) / 1000 + minutes * 35L;
            case POOL     -> 150 + (meters * 80) / 1000;
        };
        new SmtpMailer(MailConfig.fromEnv()).send(riderId, "Your fare: " + cents + " cents");
        return cents;
    }
}` },
      { type: "text", html: `<p>Three principles point at three problems. The class changes when prices change, when receipt delivery changes, and when the mail vendor changes: that's an <strong>SRP</strong> problem. Every new ride type edits the switch: an <strong>OCP</strong> problem. And the business rule creates a concrete mail client, so it can't be tested without sending email: a <strong>DIP</strong> problem.</p>` },
      { type: "code", lang: "java", title: "Fare service after the refactor", code: `interface FarePolicy { long fareCents(long meters, int minutes); }

record MeteredFare(long baseCents, long centsPerKm, long centsPerMinute) implements FarePolicy {
    public long fareCents(long meters, int minutes) {
        return baseCents + (meters * centsPerKm) / 1000 + minutes * centsPerMinute;
    }
}

interface ReceiptSender { void send(String riderId, long fareCents); }

final class FareService {
    private final Map<RideType, FarePolicy> policies;   // unmodifiable copy
    private final ReceiptSender receipts;               // injected

    FareService(Map<RideType, FarePolicy> policies, ReceiptSender receipts) {
        this.policies = Map.copyOf(policies);
        this.receipts = receipts;
    }

    long charge(String riderId, RideType type, long meters, int minutes) {
        FarePolicy policy = policies.get(type);
        if (policy == null) throw new IllegalArgumentException("no fare for " + type);
        long cents = policy.fareCents(meters, minutes);
        receipts.send(riderId, cents);
        return cents;
    }
}` },
      { type: "keypoints", items: [
        "<strong>SRP:</strong> pricing lives in policies, delivery behind <code>ReceiptSender</code>; <code>FareService</code> only coordinates.",
        "<strong>OCP:</strong> a new ride type is a new map entry, and a genuinely different pricing rule is a new <code>FarePolicy</code> class. <code>FareService</code> is not edited.",
        "<strong>DIP:</strong> the service depends on two interfaces it defines. Email or SMS senders are passed in, and tests pass a fake.",
        "<strong>KISS still applies:</strong> all three ride types share one formula, so they are three <code>MeteredFare</code> values, not three classes. Pool is just a per-minute rate of zero.",
        "<strong>Thread safety:</strong> every field is final, the map is an unmodifiable copy and the policies are immutable records, so one <code>FareService</code> can serve every request thread without locks. The injected sender must be thread-safe too; say so when you introduce it."
      ] }
    ]
  },
  {
    id: "when-they-collide",
    title: "When principles pull in opposite directions",
    kicker: "Judgment",
    blocks: [
      { type: "text", html: `<p>Principles are heuristics, and they disagree. Interviewers are often more interested in how you settle the disagreement than in which way you go, so say the tension out loud and pick a side with a reason.</p>` },
      { type: "compare", items: [
        { title: "KISS vs OCP", tone: "warn", html: `<p>One pricing rule today. An interface makes future rules cheap, but it is a type with one implementation. Add it when a second rule is stated or clearly coming; until then, keep a method that is easy to extract.</p>` },
        { title: "DRY vs low coupling", tone: "warn", html: `<p>A parking fee and a library late fee share a formula. Merging them saves three lines and ties two domains together. If they would change for different reasons, keep them separate.</p>` },
        { title: "SRP vs readability", tone: "warn", html: `<p>Split too far and a simple flow is spread over eight tiny classes. Split by reason to change, not by method count; a class with three closely related methods is fine.</p>` },
        { title: "DIP vs YAGNI", tone: "warn", html: `<p>Not every class needs an interface. Put abstractions at real boundaries: external services, storage, the clock and randomness. Inside the domain, concrete classes are usually enough.</p>` }
      ] },
      { type: "steps", title: "A quick test before adding an abstraction", items: [
        "Name the requirement, or the clearly likely change, that the abstraction serves.",
        "Count the variants that exist today. One variant with no hint of a second is a warning sign.",
        "Count the cost: new types, new indirection, more for the interviewer to follow.",
        "If the test fails, leave a seam instead (one well-named method) and say how you would extract it later."
      ] }
    ]
  },
  {
    id: "in-the-interview",
    title: "Using principles out loud",
    kicker: "Interview",
    blocks: [
      { type: "text", html: `<p>Use a principle's name as the short form of a reason, attached to a decision you have just made: "I'm keeping receipts out of the fare calculator, which is SRP, because delivery changes for different reasons." That is far stronger than listing SOLID at the start, which proves only that you have read about it.</p>` },
      { type: "callout", tone: "mistake", title: "Common mistakes", html: `<ul><li>Reciting definitions instead of applying them to the design on the board.</li><li>Explaining LSP as "a subclass can be used where the parent is". The point is that it must keep the parent's promises: no new exceptions, no weaker guarantees.</li><li>Calling every interface dependency inversion. The inversion is that the business logic owns the interface and the detail conforms to it.</li><li>Applying OCP everywhere, which turns a 40-line design into a framework.</li><li>Merging code that only looks alike in the name of DRY, which couples features that should evolve separately.</li></ul>` },
      { type: "callout", tone: "interview", html: `<p>If asked "which principle matters most in these interviews?", a strong answer is KISS, with a reason: over-engineering is the most common way capable candidates fail, because it burns time and suggests they can't tell when complexity is justified.</p>` }
    ]
  }
];
