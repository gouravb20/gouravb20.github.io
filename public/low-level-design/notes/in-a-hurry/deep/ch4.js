// Deep dive: Chapter 4, OOP concepts. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch4 = {
  hook: `<p>Every LLD answer is made of classes, and every class decision uses a handful of object-oriented ideas: hide state behind behaviour, expose capabilities rather than internals, share code through inheritance or composition, and let polymorphism replace type checks. This chapter goes through them with a library-management example and focuses on the question interviewers care about: <em>when</em> to use each, and what goes wrong when you misuse it.</p>`,
  sections: [
    {
      id: "encapsulation",
      title: "Encapsulation: the object guards its own state",
      kicker: "Pillar 1",
      blocks: [
        { type: "text", html: `<p>Encapsulation means fields are private and the only way to change an object is through methods that keep it valid. It is not "private fields plus a getter and setter for each": that's a public field with extra typing.</p>` },
        { type: "code", lang: "java", title: "A book copy that can't be double-lent", code: `// Anaemic: any caller can put it in an impossible state
class BookCopy {
    private Member borrower;
    private LocalDate dueDate;
    public void setBorrower(Member m) { borrower = m; }
    public void setDueDate(LocalDate d) { dueDate = d; }
}

// Encapsulated: operations with rules
final class BookCopy {
    private final String barcode;
    private Member borrower;
    private LocalDate dueDate;

    BookCopy(String barcode) { this.barcode = barcode; }

    void lendTo(Member m, LocalDate today) {
        if (borrower != null) throw new IllegalStateException(barcode + " is already on loan");
        borrower = m;
        dueDate = today.plusWeeks(2);
    }

    Money returnCopy(LocalDate today) {
        if (borrower == null) throw new IllegalStateException(barcode + " is not on loan");
        long lateDays = Math.max(0, ChronoUnit.DAYS.between(dueDate, today));
        borrower = null;
        dueDate = null;
        return Money.ofCents(lateDays * 25);
    }

    boolean isAvailable() { return borrower == null; }
}` },
        { type: "callout", tone: "interview", html: `<p>Interviewers notice when every field gets a public setter. Expose verbs from the domain (<code>lendTo</code>, <code>returnCopy</code>, <code>reserve</code>) and keep state changes inside the class.</p>` }
      ]
    },
    {
      id: "abstraction-polymorphism",
      title: "Abstraction and polymorphism",
      kicker: "Pillars 2 and 4",
      blocks: [
        { type: "text", html: `<p><strong>Abstraction</strong> exposes <em>what</em> an object does and hides <em>how</em>. <strong>Polymorphism</strong> lets one call run different code depending on the actual object. Together they let callers work with a capability (<code>FinePolicy</code>) without knowing which implementation they have, which replaces type-code switches.</p>` },
        { type: "code", lang: "java", title: "Replacing a switch with polymorphism", code: `// Before: every new member type edits this method
Money fine(Member m, long lateDays) {
    switch (m.type()) {
        case STUDENT: return Money.ofCents(lateDays * 10);
        case STAFF:   return Money.ZERO;
        default:      return Money.ofCents(lateDays * 25);
    }
}

// After: each policy knows its own rule
interface FinePolicy { Money fine(long lateDays); }

record PerDayFine(long centsPerDay) implements FinePolicy {
    public Money fine(long lateDays) { return Money.ofCents(lateDays * centsPerDay); }
}
record NoFine() implements FinePolicy {
    public Money fine(long lateDays) { return Money.ZERO; }
}

record Member(String id, String name, FinePolicy finePolicy) {}

Money fine = member.finePolicy().fine(lateDays);   // dynamic dispatch picks the rule` },
        { type: "keypoints", items: [
          "<strong>Overriding</strong> (runtime polymorphism): a subtype supplies its own version of an inherited or interface method.",
          "<strong>Overloading</strong> (compile-time): several methods with the same name and different parameter lists.",
          "When you see <code>switch (type)</code> repeated across methods, polymorphism is usually the cure."
        ] }
      ]
    },
    {
      id: "inheritance-vs-composition",
      title: "Inheritance vs composition",
      kicker: "Pillar 3, and its alternative",
      blocks: [
        { type: "text", html: `<p><strong>Inheritance</strong> says "a <code>Truck</code> is a <code>Vehicle</code>": the subclass gets the parent's fields and methods and can override them. <strong>Composition</strong> says "a <code>Car</code> has an <code>Engine</code>": behaviour comes from objects held in fields. Inheritance is fixed at compile time and couples the child to the parent's internals; composition can be rearranged freely, even at run time.</p>` },
        { type: "code", lang: "java", title: "When variations multiply, compose", code: `// Inheritance explosion: one class per combination
class PetrolSedan extends Car { }   class ElectricSedan extends Car { }
class PetrolSuv extends Car { }     class ElectricSuv extends Car { }   // ...and so on

// Composition: combine independent parts
interface Engine { Range range(); void refuel(); }
enum Body { SEDAN, SUV, HATCHBACK }

final class Car {
    private Engine engine;           // replaceable during a refit
    private final Body body;
    Car(Engine engine, Body body) { this.engine = engine; this.body = body; }
    void replaceEngine(Engine e) { this.engine = e; }
}` },
        { type: "tradeoffs", prosLabel: "Use inheritance when", consLabel: "Prefer composition when", pros: [
          "There is a true, stable is-a relationship",
          "Subclasses share real state and behaviour",
          "The parent is designed for extension (few, clear overridable points)"
        ], cons: [
          "You only want to reuse some code",
          "Behaviour varies along several independent dimensions",
          "Behaviour should change at run time",
          "Exposing every parent method would let callers break your rules (Stack extends Vector)"
        ] },
        { type: "lab", id: "isAOrHasA", caption: "Eight modelling situations: decide between inheritance, an interface and composition." }
      ]
    },
    {
      id: "interfaces-abstract",
      title: "Interfaces vs abstract classes",
      kicker: "Choosing the abstraction",
      blocks: [
        { type: "compare", items: [
          { title: "Interface", tone: "info", html: `<p>A role or capability: <code>Borrowable</code>, <code>Notifier</code>, <code>PaymentMethod</code>. Unrelated classes can implement it; a class can implement many. No instance state (default methods can share behaviour).</p><p><strong>Default choice</strong> for the types your design depends on.</p>` },
          { title: "Abstract class", tone: "info", html: `<p>A partial implementation for a family of closely related classes: shared fields, constructor logic and helper methods, with some abstract methods left to subclasses. A class extends only one.</p><p>Use when subclasses truly share state and code.</p>` }
        ] },
        { type: "code", lang: "java", title: "Both, each doing its job", code: `interface Borrowable {
    boolean isAvailable();
    void lendTo(Member m, LocalDate today);
}

abstract class LibraryItem implements Borrowable {
    protected final String id;
    protected final String title;
    private Member borrower;

    protected LibraryItem(String id, String title) { this.id = id; this.title = title; }

    public boolean isAvailable() { return borrower == null; }
    public void lendTo(Member m, LocalDate today) {
        if (!isAvailable()) throw new IllegalStateException(id + " unavailable");
        borrower = m;
    }

    abstract Duration loanPeriod();          // the one thing that differs
}

final class Book extends LibraryItem { Duration loanPeriod() { return Duration.ofDays(14); } ... }
final class Dvd  extends LibraryItem { Duration loanPeriod() { return Duration.ofDays(3);  } ... }` }
      ]
    },
    {
      id: "relationships",
      title: "Relationships and multiplicity",
      kicker: "Connecting classes",
      blocks: [
        { type: "diagram", title: "Four relationships in a library", caption: "Inheritance (is-a), realisation (implements), composition (owns, same lifetime) and association (uses, independent lifetimes).", svg: `<svg viewBox="0 0 620 260" role="img" aria-label="Class relationships in a library system">
<defs>
<marker id="lh4-tri" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="11" markerHeight="11" orient="auto"><path d="M1 1L11 6L1 11z" style="fill: var(--dg-panel); stroke: var(--dg-ink)"/></marker>
<marker id="lh4-dia" viewBox="0 0 16 10" refX="1" refY="5" markerWidth="14" markerHeight="9" orient="auto"><path d="M1 5L8 1L15 5L8 9z" style="fill: var(--dg-ink)"/></marker>
<marker id="lh4-open" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10" style="fill: none; stroke: var(--dg-ink)"/></marker>
</defs>
<rect x="240" y="16" width="140" height="40" rx="6" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/><text x="310" y="41" text-anchor="middle" font-size="13" font-style="italic" style="fill: var(--dg-ink)">Borrowable</text>
<rect x="240" y="96" width="140" height="40" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/><text x="310" y="121" text-anchor="middle" font-size="13" style="fill: var(--dg-ink)">LibraryItem</text>
<rect x="170" y="196" width="110" height="40" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/><text x="225" y="221" text-anchor="middle" font-size="13" style="fill: var(--dg-ink)">Book</text>
<rect x="340" y="196" width="110" height="40" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/><text x="395" y="221" text-anchor="middle" font-size="13" style="fill: var(--dg-ink)">Dvd</text>
<rect x="20" y="96" width="130" height="40" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/><text x="85" y="121" text-anchor="middle" font-size="13" style="fill: var(--dg-ink)">Library</text>
<rect x="470" y="96" width="130" height="40" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/><text x="535" y="121" text-anchor="middle" font-size="13" style="fill: var(--dg-ink)">Member</text>
<line x1="310" y1="96" x2="310" y2="58" stroke-dasharray="5 4" style="stroke: var(--dg-ink)" marker-end="url(#lh4-tri)"/>
<line x1="225" y1="196" x2="290" y2="139" style="stroke: var(--dg-ink)" marker-end="url(#lh4-tri)"/>
<line x1="395" y1="196" x2="330" y2="139" style="stroke: var(--dg-ink)" marker-end="url(#lh4-tri)"/>
<line x1="150" y1="116" x2="238" y2="116" style="stroke: var(--dg-ink)" marker-start="url(#lh4-dia)"/>
<line x1="470" y1="116" x2="383" y2="116" style="stroke: var(--dg-ink)" marker-end="url(#lh4-open)"/>
<text x="194" y="108" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">owns 1..*</text>
<text x="426" y="108" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">borrows 0..5</text>
<text x="322" y="80" font-size="12" style="fill: var(--dg-muted)">implements</text>
<text x="232" y="168" font-size="12" style="fill: var(--dg-muted)">extends</text>
</svg>` },
        { type: "table", headers: ["Relationship", "Lifetime", "Library example", "In code"], rows: [
          ["Association", "Independent", "A member borrows items", "A field or a parameter"],
          ["Aggregation", "Parts outlive the whole, may be shared", "A reading list refers to books", "A collection of references passed in"],
          ["Composition", "Parts live and die with the whole", "The library owns its item records", "The whole creates and holds the parts"],
          ["Inheritance / realisation", "-", "A Book is a LibraryItem; LibraryItem is Borrowable", "<code>extends</code> / <code>implements</code>"]
        ] },
        { type: "callout", tone: "tip", html: `<p>Multiplicity drives data structures: "a member may borrow up to 5 items" is a bounded collection plus a rule in <code>Member</code>; "look up an item by barcode" is a <code>Map</code> in <code>Library</code>. Say the multiplicities as you draw the relationships.</p>` }
      ]
    },
    {
      id: "enums-values",
      title: "Enums, value objects and equality",
      kicker: "Everyday tools",
      blocks: [
        { type: "code", lang: "java", title: "An enum that carries its own rules", code: `enum LoanStatus {
    ACTIVE   { boolean canRenew() { return true;  } },
    OVERDUE  { boolean canRenew() { return false; } },
    RETURNED { boolean canRenew() { return false; } };

    abstract boolean canRenew();
}` },
        { type: "code", lang: "java", title: "Records as value objects; entities compare by id", code: `record Isbn(String value) {
    Isbn { if (!value.matches("[0-9]{13}")) throw new IllegalArgumentException(value); }
}   // equals/hashCode by value, generated

final class Member {
    private final String id;
    private String name;                       // can change; identity doesn't
    // ...
    @Override public boolean equals(Object o) { return o instanceof Member m && m.id.equals(id); }
    @Override public int hashCode() { return id.hashCode(); }
}` },
        { type: "keypoints", items: [
          "<strong>Enums</strong> for fixed sets: sizes, directions, statuses, piece types. They can hold fields and per-constant behaviour.",
          "<strong>Value objects</strong> (records) for small immutable values: <code>Money</code>, <code>Isbn</code>, <code>DateRange</code>, <code>Position</code>. Equal by value, safe to share.",
          "<strong>Entities</strong> have identity that persists while their attributes change: compare them by id.",
          "Override <code>equals</code> and <code>hashCode</code> together, from the same fields, or hash-based collections misbehave."
        ] },
        { type: "quiz", q: "In a chess design, a candidate writes <code>class Queen extends Rook</code> \"because a queen moves like a rook and also diagonally\". What's the main problem?", options: [
          "Nothing: it reuses the rook's code",
          "A queen is not a rook; code expecting a Rook (castling, for example) would accept a Queen. Share movement through composition or a common Piece base instead",
          "Java doesn't allow extending classes with the same fields",
          "It should be Rook extends Queen"
        ], answer: 1, explain: `<p>Inheriting just to reuse code creates a false is-a relationship and breaks substitution: castling logic that takes a <code>Rook</code> would happily accept a <code>Queen</code>. Better: an abstract <code>Piece</code> with a movement rule, and reusable <code>StraightLineMoves</code> / <code>DiagonalMoves</code> components that both pieces compose.</p>` }
      ]
    }
  ],
  takeaways: [
    "Encapsulation means meaningful operations that protect invariants, not setters for every field.",
    "Abstraction and polymorphism let callers use a capability and replace type-code switches.",
    "Inherit for true, stable is-a relationships with shared state; compose for everything else.",
    "Interfaces for roles your design depends on; abstract classes for families that share fields and code.",
    "Name relationships and multiplicities as you design; they decide ownership and data structures.",
    "Use enums for fixed sets, records for value objects, and id-based equality for entities."
  ],
  furtherReading: [
    { title: "Hello Interview: OOP concepts", url: "https://www.hellointerview.com/learn/low-level-design/in-a-hurry/oop-concepts", note: "The page this chapter follows." },
    { title: "Effective Java (Joshua Bloch), chapters 4 and 6", note: "Classes and interfaces; enums. \"Favor composition over inheritance\" is item 18 in the third edition." }
  ]
};
