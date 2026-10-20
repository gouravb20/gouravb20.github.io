// Main tab: Chapter 4, OOP concepts. Format: DeepSection[] in public/shared/notes.d.ts.
window.MAIN = window.MAIN || {};
MAIN.ch4 = [
  {
    id: "a-class-is-a-promise",
    title: "A class is a promise to its callers",
    kicker: "Mental model",
    blocks: [
      { type: "text", html: `<p>The simplest way to think about object-oriented design is that every class makes a promise: "call my methods with valid inputs and I will keep these facts true." A wallet promises its balance never goes negative. A seat promises it never has two owners. The four pillars of OOP are four tools for making and keeping such promises, and most LLD mistakes are one of them used for the wrong job.</p>` },
      { type: "keypoints", items: [
        "<strong>Encapsulation</strong> stops anyone outside the class from breaking its facts. State is private and changes only through methods that check the rules.",
        "<strong>Abstraction</strong> lets callers rely on <em>what</em> a class promises, not <em>how</em> it does it, so the how can change freely.",
        "<strong>Polymorphism</strong> lets different classes keep the same promise in their own way, so callers stop asking 'which kind are you?'",
        "<strong>Inheritance</strong> passes a parent's promises to a subclass, which must keep every one of them. That obligation is why it is the riskiest pillar.",
        "<strong>Composition</strong>, building an object from parts it holds, is the everyday alternative to inheritance and usually the better default."
      ] }
    ]
  },
  {
    id: "encapsulation-and-threads",
    title: "Encapsulation is what makes correctness possible",
    kicker: "Worked example",
    blocks: [
      { type: "text", html: `<p>A digital wallet has one rule that matters above all: the balance never goes below zero. If the balance were a public field, or had a public setter, any caller anywhere could break that rule, and no amount of care inside the class could stop them. Make the field private, expose only meaningful operations, and the class can enforce the rule in one place.</p>` },
      { type: "code", lang: "java", title: "A wallet that guards its own balance", code: `final class Wallet {
    private final String ownerId;
    private long balanceCents;                          // guarded by this

    Wallet(String ownerId) { this.ownerId = ownerId; }

    synchronized void deposit(long cents) {
        if (cents <= 0) throw new IllegalArgumentException("deposit must be positive");
        balanceCents = Math.addExact(balanceCents, cents);
    }

    synchronized boolean withdraw(long cents) {
        if (cents <= 0) throw new IllegalArgumentException("withdrawal must be positive");
        if (cents > balanceCents) return false;         // the promise: never negative
        balanceCents -= cents;
        return true;
    }

    synchronized long balanceCents() { return balanceCents; }

    String ownerId() { return ownerId; }
}` },
      { type: "text", html: `<p>Look at what encapsulation buys here. Money is a <code>long</code> count of cents, never a <code>double</code>, so there is no rounding drift. Negative amounts are rejected at the door. There is no <code>setBalance</code>, so the only way to change the balance is through a method that checks the rule.</p><p>The same boundary is what makes the wallet thread-safe. Two withdrawals racing on the same wallet could both pass the balance check and overdraw it, but every read and write of <code>balanceCents</code> happens inside a <code>synchronized</code> method on the same object, so the check and the update are one atomic step. That only works because nobody outside can touch the field. Encapsulation is not just tidiness: it is the precondition for protecting state with a lock.</p>` }
    ]
  },
  {
    id: "polymorphism-and-composition",
    title: "Polymorphism and composition instead of switches and subclasses",
    kicker: "Building behaviour",
    blocks: [
      { type: "text", html: `<p>An alert service must reach users by email, SMS or push, and some users want more than one. The inheritance answer, <code>EmailAlertService</code>, <code>SmsAlertService</code>, <code>EmailAndSmsAlertService</code> and so on, grows a class per combination. The switch answer puts <code>if (channel == EMAIL)</code> in every method. The composition answer gives the service a list of channel objects, and polymorphism picks the right delivery code for each.</p>` },
      { type: "code", lang: "java", title: "Alerts composed from channels", code: `interface Channel { void deliver(String userId, String message); }

record EmailChannel(EmailClient client) implements Channel {
    public void deliver(String userId, String message) { client.send(userId, message); }
}

record SmsChannel(SmsGateway gateway) implements Channel {
    public void deliver(String userId, String message) { gateway.text(userId, message); }
}

final class AlertService {
    private final List<Channel> channels;               // fixed at construction

    AlertService(List<Channel> channels) { this.channels = List.copyOf(channels); }

    void alert(String userId, String message) {
        for (Channel c : channels) c.deliver(userId, message);   // dynamic dispatch
    }
}` },
      { type: "text", html: `<p>Adding push notifications is one new class; <code>AlertService</code> doesn't change. It is also safe to share across threads: the channel list is an unmodifiable copy in a final field, and each channel only holds a final reference to its client, so there is no mutable state in these classes. The clients themselves must be thread-safe, which is worth stating when you inject them.</p>` },
      { type: "steps", title: "Inherit or compose? Ask in this order", items: [
        "Is it a true is-a relationship that will stay true? If not, compose.",
        "Would every public method of the parent make sense on the child? If one doesn't (a stack that exposes list insertion), compose.",
        "Does behaviour vary along more than one dimension, or need to change at run time? Compose.",
        "Otherwise inheritance is fine, ideally from a parent designed for it, with a small number of clearly overridable steps."
      ] }
    ]
  },
  {
    id: "pick-the-right-type",
    title: "Picking the right kind of type",
    kicker: "Decision table",
    blocks: [
      { type: "text", html: `<p>A lot of class design is choosing which kind of type each concept should be. Getting this right early makes the rest of the design shorter and safer.</p>` },
      { type: "table", headers: ["If the concept is...", "Use", "Example", "Equality"], rows: [
        ["A fixed set of values known today", "<code>enum</code>, with fields and methods if useful", "SpotSize, Direction, OrderStatus", "One instance per constant"],
        ["A small value defined by its contents", "<code>record</code> (immutable)", "Money, TimeRange, Coordinate", "All fields"],
        ["Something with identity whose state changes", "A final class with private fields", "Wallet, Seat, Elevator", "By id only"],
        ["A role that unrelated classes can play", "<code>interface</code>", "Channel, PaymentMethod, Notifier", "Not applicable"],
        ["A family sharing real fields and code", "<code>abstract class</code>", "A library item base with loan logic", "Usually by id"]
      ] },
      { type: "callout", tone: "insight", html: `<p>Enums and records are immutable, so they are thread-safe for free and can be shared anywhere. Mutable entities are where locks belong. That gives you one more reason to keep entities few and push as much as you can into values: the fewer mutable objects your design has, the less concurrency you have to reason about.</p>` }
    ]
  },
  {
    id: "mistakes",
    title: "Mistakes interviewers notice",
    kicker: "Interview",
    blocks: [
      { type: "list", items: [
        "<strong>Getters and setters for every field.</strong> That is a public field with extra typing. Expose operations from the domain: <code>withdraw</code>, <code>hold</code>, <code>assign</code>.",
        "<strong>Inheriting to reuse code.</strong> <code>Queen extends Rook</code> because they share straight-line moves creates a false is-a. Share the movement logic through a component both pieces hold.",
        "<strong>Type codes with switches.</strong> The same <code>switch (type)</code> in several methods means a polymorphic interface is missing.",
        "<strong>Primitives for domain values.</strong> A <code>double</code> for money, or a <code>String</code> for an email, spreads validation everywhere. A small record gives the rule one home.",
        "<strong>Mismatched equals and hashCode.</strong> Override both from the same fields, or objects get lost in hash maps and sets.",
        "<strong>Mutable statics.</strong> A static map of sessions is global state shared by every thread. Keep statics for constants and pure helpers."
      ] },
      { type: "callout", tone: "interview", html: `<p>When you introduce a class, say its promise and who protects it: <em>"Wallet owns the balance. It's private, changes only through deposit and withdraw, and both are synchronized, so the never-negative rule holds even with concurrent requests."</em> That single sentence shows encapsulation, domain modelling and concurrency awareness at once.</p>` }
    ]
  }
];
